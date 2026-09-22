import {
  emptyProductFacts,
  withImportQuality,
  type FactConfidence,
  type ProductFacts,
  type SourceFact,
} from "@/lib/product-facts";
import {
  NO_VERIFIED_SOURCES_MESSAGE,
  SEARCH_NOT_CONFIGURED_MESSAGE,
  SEARCH_PROVIDER_TIMED_OUT_MESSAGE,
  SOURCE_DISCOVERY_TIMED_OUT_MESSAGE,
} from "@/lib/source-resolution/block";
import type { DiscoveredSource, WebDiscoveryReport } from "@/lib/source-resolution/types";
import { namesSimilar, normalizeName } from "@/lib/import-heuristics";

const CONFIDENCE_RANK: Record<FactConfidence, number> = {
  NOT_FOUND: 0,
  HEURISTIC_EXTRACTION: 1,
  AI_SOURCE_CLASSIFICATION: 2,
  MANUAL: 3,
  DIRECT_SOURCE: 4,
};

function unique(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.trim();
    if (!key) continue;
    const norm = key.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(key);
  }
  return out;
}

export function weakerConfidence(a: FactConfidence, b: FactConfidence): FactConfidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

function mergeList(
  pages: ProductFacts[],
  values: (page: ProductFacts) => string[],
  confidenceOf: (page: ProductFacts) => FactConfidence,
): { items: string[]; confidence: FactConfidence } {
  const items: string[] = [];
  let confidence: FactConfidence = "NOT_FOUND";
  for (const page of pages) {
    const list = values(page);
    if (list.length === 0) continue;
    const pageConf = confidenceOf(page);
    confidence = confidence === "NOT_FOUND" ? pageConf : weakerConfidence(confidence, pageConf);
    items.push(...list);
  }
  const uniqueItems = unique(items).slice(0, 12);
  return { items: uniqueItems, confidence: uniqueItems.length ? confidence : "NOT_FOUND" };
}

function guaranteeDays(text: string): number | null {
  const match = text.match(/(\d+)\s*-?\s*days?/i);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isFinite(days) ? days : null;
}

function pricingSignature(text: string): string | null {
  const match = text.match(/\$\s*[\d,.]+|\b\d+[\d,.]*\s*(usd|eur|gbp)\b/i);
  return match ? match[0].replace(/\s+/g, "").toLowerCase() : null;
}

function usageSignature(text: string): string | null {
  const match = text.match(/\b(\d+|one|two|three|four|five|six)\s+(capsules?|tablets?|drops?|scoops?|servings?)\b/i);
  if (!match) return null;
  const qty = match[1]!.toLowerCase();
  const unit = match[2]!.toLowerCase().replace(/s$/, "");
  return `${qty}:${unit}`;
}

function conflictWarnings(pages: ProductFacts[]): string[] {
  const warnings: string[] = [];
  const guaranteeDaysFound = unique(
    pages
      .map((page) => page.guaranteeInformation)
      .filter((value): value is string => Boolean(value))
      .map((value) => guaranteeDays(value))
      .filter((value): value is number => value != null)
      .map((value) => String(value)),
  );
  if (guaranteeDaysFound.length > 1) {
    warnings.push(
      `CONFLICT guaranteeInformation: accepted sources disagree (${guaranteeDaysFound.map((d) => `${d}-day`).join(" vs ")}). First source kept; values were not reconciled.`,
    );
  }

  const prices = unique(
    pages
      .map((page) => page.pricingInformation)
      .filter((value): value is string => Boolean(value))
      .map((value) => pricingSignature(value))
      .filter((value): value is string => Boolean(value)),
  );
  if (prices.length > 1) {
    warnings.push(
      `CONFLICT pricingInformation: accepted sources disagree (${prices.join(" vs ")}). First source kept; values were not reconciled.`,
    );
  }

  const manufacturers = pages
    .map((page) => page.manufacturer?.trim())
    .filter((value): value is string => Boolean(value));
  const distinctMakers: string[] = [];
  for (const maker of manufacturers) {
    if (distinctMakers.some((existing) => namesSimilar(existing, maker) || normalizeName(existing) === normalizeName(maker))) {
      continue;
    }
    distinctMakers.push(maker);
  }
  if (distinctMakers.length > 1) {
    warnings.push(
      `CONFLICT manufacturer: accepted sources disagree (${distinctMakers.join(" vs ")}). First source kept; values were not reconciled.`,
    );
  }

  const usages = unique(
    pages.flatMap((page) => page.usageInformation).map((value) => usageSignature(value)).filter((value): value is string => Boolean(value)),
  );
  if (usages.length > 1) {
    warnings.push(
      `CONFLICT usageInformation: accepted sources disagree (${usages.join(" vs ")}). Values were concatenated, not reconciled.`,
    );
  }
  return warnings;
}

export function mergeAcceptedFacts(input: {
  productName: string;
  originalUrl: string;
  pages: ProductFacts[];
  report: WebDiscoveryReport;
}): ProductFacts {
  const base = emptyProductFacts(input.productName, input.pages[0]?.sourceUrl || input.originalUrl, "IMPORTED");
  if (input.pages.length === 0) {
    const gap =
      input.report.outcome === "SEARCH_NOT_CONFIGURED"
        ? SEARCH_NOT_CONFIGURED_MESSAGE
        : input.report.outcome === "SEARCH_TIMEOUT"
          ? SEARCH_PROVIDER_TIMED_OUT_MESSAGE
          : input.report.outcome === "TIMED_OUT" || input.report.outcome === "CANCELLED"
            ? SOURCE_DISCOVERY_TIMED_OUT_MESSAGE
            : NO_VERIFIED_SOURCES_MESSAGE;
    return withImportQuality({
      ...base,
      webDiscovery: input.report,
      importWarnings: [
        ...base.importWarnings.filter((w) => !/MANUAL PRODUCT FACTS/i.test(w)),
        ...input.report.operatorMessages,
        input.report.message,
        gap,
        "Missing fields stay NOT_FOUND. Manual ProductFacts is last resort.",
      ],
    });
  }

  const snippets: SourceFact[] = [];
  let description: string | undefined;
  let descriptionConf: FactConfidence = "NOT_FOUND";
  let pricing: string | undefined;
  let pricingConf: FactConfidence = "NOT_FOUND";
  let guarantee: string | undefined;
  let guaranteeConf: FactConfidence = "NOT_FOUND";
  let manufacturer: string | undefined;
  let manufacturerConf: FactConfidence = "NOT_FOUND";
  let imageUrl: string | undefined;
  let imageProv: ProductFacts["productImageProvenance"] = "NOT_FOUND";
  const warnings: string[] = [input.report.message];

  for (const page of input.pages) {
    if (!description && page.description) {
      description = page.description;
      descriptionConf = page.confidence.description;
    }
    if (!pricing && page.pricingInformation) {
      pricing = page.pricingInformation;
      pricingConf = page.confidence.pricingInformation;
    }
    if (!guarantee && page.guaranteeInformation) {
      guarantee = page.guaranteeInformation;
      guaranteeConf = page.confidence.guaranteeInformation;
    }
    if (!manufacturer && page.manufacturer) {
      manufacturer = page.manufacturer;
      manufacturerConf = page.confidence.manufacturer;
    }
    if (!imageUrl && page.productImageUrl && page.productImageProvenance === "DIRECT_SOURCE") {
      imageUrl = page.productImageUrl;
      imageProv = page.productImageProvenance;
    }
    snippets.push(...page.sourceSnippets);
    warnings.push(...page.importWarnings.filter((w) => !/MANUAL PRODUCT FACTS/i.test(w)));
    warnings.push(`Accepted source: ${page.sourceUrl}`);
  }

  const features = mergeList(
    input.pages,
    (page) => page.features,
    (page) => page.confidence.features,
  );
  const ingredients = mergeList(
    input.pages,
    (page) => page.ingredientsOrComponents,
    (page) => page.confidence.ingredientsOrComponents,
  );
  const usage = mergeList(
    input.pages,
    (page) => page.usageInformation,
    (page) => page.confidence.usageInformation,
  );
  const cautions = mergeList(
    input.pages,
    (page) => page.cautions,
    (page) => page.confidence.cautions,
  );

  warnings.push(...conflictWarnings(input.pages));

  const merged: ProductFacts = {
    ...base,
    origin: "IMPORTED",
    description,
    features: features.items,
    ingredientsOrComponents: ingredients.items,
    usageInformation: usage.items,
    cautions: cautions.items,
    pricingInformation: pricing,
    guaranteeInformation: guarantee,
    manufacturer,
    sourceSnippets: snippets,
    importWarnings: unique(warnings),
    productImageUrl: imageUrl,
    productImageProvenance: imageProv,
    webDiscovery: input.report,
    confidence: {
      ...base.confidence,
      productName: "DIRECT_SOURCE",
      description: description ? descriptionConf : "NOT_FOUND",
      features: features.confidence,
      ingredientsOrComponents: ingredients.confidence,
      usageInformation: usage.confidence,
      cautions: cautions.confidence,
      pricingInformation: pricing ? pricingConf : "NOT_FOUND",
      guaranteeInformation: guarantee ? guaranteeConf : "NOT_FOUND",
      manufacturer: manufacturer ? manufacturerConf : "NOT_FOUND",
    },
  };
  return withImportQuality(merged);
}

export function summarizeSources(sources: DiscoveredSource[]): Pick<WebDiscoveryReport, "acceptedCount" | "uncertainCount"> {
  return {
    acceptedCount: sources.filter((s) => s.status === "ACCEPTED").length,
    uncertainCount: sources.filter((s) => s.status === "IDENTITY_UNCERTAIN").length,
  };
}
