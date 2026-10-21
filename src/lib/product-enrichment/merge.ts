import { statementAllowed } from "@/lib/product-contract/claims";
import type { OfferFact, ProductFacts, SpecificationFact, SourceFact } from "@/lib/product-facts";
import { withImportQuality } from "@/lib/product-facts";
import type { ExtractedBatch } from "@/lib/product-enrichment/extract";
import type { ConflictRecord, ProvenanceRecord } from "@/lib/product-enrichment/types";

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export type MergeOutput = {
  facts: ProductFacts;
  provenance: ProvenanceRecord[];
  conflicts: ConflictRecord[];
  withheld: Array<{ field: string; text: string; reason: string }>;
  addedFields: string[];
  visualCandidates: Array<{ url: string; sourceUrl: string; authorized: false }>;
};

function keepList(existing: string[], incoming: string[], field: string, sourceUrl: string, out: MergeOutput): string[] {
  const next = [...existing];
  const have = new Set(existing.map(keyOf));
  for (const item of incoming) {
    if (!item.trim()) continue;
    if (!statementAllowed(item, "PROMOTIONAL")) {
      out.withheld.push({ field, text: item, reason: "promotional statement failed the existing claim gate" });
      out.provenance.push({
        field,
        text: item,
        sourceUrl,
        retrievedAt: null,
        excerpt: item,
        verification: "SELLER_DECLARED",
        restriction: "WITHHELD",
        class: "FACT",
      });
      continue;
    }
    if (have.has(keyOf(item))) continue;
    have.add(keyOf(item));
    next.push(item);
    out.addedFields.push(field);
    out.provenance.push({
      field,
      text: item,
      sourceUrl,
      retrievedAt: null,
      excerpt: item,
      verification: "SELLER_DECLARED",
      restriction: "PUBLISHABLE",
      class: "FACT",
    });
  }
  return next;
}

export function mergeExtracted(base: ProductFacts, batch: ExtractedBatch): MergeOutput {
  const out: MergeOutput = {
    facts: {
      ...base,
      features: [...base.features],
      ingredientsOrComponents: [...base.ingredientsOrComponents],
      usageInformation: [...base.usageInformation],
      cautions: [...base.cautions],
      specifications: [...(base.specifications ?? [])],
      offerFacts: [...(base.offerFacts ?? [])],
      sourceSnippets: [...base.sourceSnippets],
      returnsInformation: [...(base.returnsInformation ?? [])],
      shippingInformation: [...(base.shippingInformation ?? [])],
      ingredientContext: [...(base.ingredientContext ?? [])],
      confidence: { ...base.confidence },
      imageUrls: [...(base.imageUrls ?? [])],
    },
    provenance: [],
    conflicts: [],
    withheld: [],
    addedFields: [],
    visualCandidates: batch.visualCandidates.map((item) => ({ ...item, authorized: false as const })),
  };

  const sourceUrl = batch.facts.sourceUrl || base.sourceUrl;
  out.facts.features = keepList(out.facts.features, batch.facts.features, "features", sourceUrl, out);
  out.facts.ingredientsOrComponents = keepList(
    out.facts.ingredientsOrComponents,
    batch.facts.ingredientsOrComponents,
    "ingredientsOrComponents",
    sourceUrl,
    out,
  );
  out.facts.usageInformation = unique([...out.facts.usageInformation, ...batch.facts.usageInformation]);
  if (batch.facts.usageInformation.some((item) => !base.usageInformation.map(keyOf).includes(keyOf(item)))) {
    out.addedFields.push("usageInformation");
  }
  out.facts.cautions = unique([...out.facts.cautions, ...batch.facts.cautions]);

  if (!out.facts.description && batch.facts.description) {
    if (statementAllowed(batch.facts.description, "PROMOTIONAL")) {
      out.facts.description = batch.facts.description;
      out.addedFields.push("description");
    } else {
      out.withheld.push({ field: "description", text: batch.facts.description, reason: "description failed the claim gate" });
    }
  }
  if (!out.facts.pricingInformation && batch.facts.pricingInformation) {
    out.facts.pricingInformation = batch.facts.pricingInformation;
    out.addedFields.push("pricingInformation");
  }
  if (!out.facts.guaranteeInformation && batch.facts.guaranteeInformation) {
    if (statementAllowed(batch.facts.guaranteeInformation, "OPERATIONAL")) {
      out.facts.guaranteeInformation = batch.facts.guaranteeInformation;
      out.addedFields.push("guaranteeInformation");
    } else {
      out.withheld.push({ field: "guaranteeInformation", text: batch.facts.guaranteeInformation, reason: "guarantee failed the operational gate" });
    }
  } else if (
    out.facts.guaranteeInformation &&
    batch.facts.guaranteeInformation &&
    keyOf(out.facts.guaranteeInformation) !== keyOf(batch.facts.guaranteeInformation)
  ) {
    out.conflicts.push({
      field: "guaranteeInformation",
      values: [
        { text: out.facts.guaranteeInformation, sourceUrl: base.sourceUrl },
        { text: batch.facts.guaranteeInformation, sourceUrl },
      ],
      kept: out.facts.guaranteeInformation,
      reason: "existing source statement is kept; the later source is recorded as a conflict",
    });
  }
  if (!out.facts.manufacturer && batch.facts.manufacturer) {
    out.facts.manufacturer = batch.facts.manufacturer;
    out.addedFields.push("manufacturer");
  }

  mergeSpecs(out, base.specifications ?? [], batch.specs);
  mergeOffers(out, base.offerFacts ?? [], batch.offers);
  mergeSnippets(out, batch.snippets);
  mergeOperational(out, batch);

  for (const image of batch.visualCandidates) {
    if (!out.facts.imageUrls?.includes(image.url)) out.facts.imageUrls = [...(out.facts.imageUrls ?? []), image.url];
    out.provenance.push({
      field: "images.candidate",
      text: image.url,
      sourceUrl: image.sourceUrl,
      retrievedAt: null,
      excerpt: image.url,
      verification: "SELLER_DECLARED",
      restriction: "WITHHELD",
      class: "FACT",
    });
  }

  out.facts.sourceSnippets = uniqueSnippets([...(out.facts.sourceSnippets ?? []), ...batch.snippets]);
  liftConfidence(out);
  out.addedFields = unique(out.addedFields);
  return { ...out, facts: withImportQuality(out.facts) };
}

function liftConfidence(out: MergeOutput): void {
  const facts = out.facts;
  if (facts.description) facts.confidence.description = facts.confidence.description === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.description;
  if (facts.features.length) facts.confidence.features = facts.confidence.features === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.features;
  if (facts.ingredientsOrComponents.length) {
    facts.confidence.ingredientsOrComponents =
      facts.confidence.ingredientsOrComponents === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.ingredientsOrComponents;
  }
  if (facts.usageInformation.length) {
    facts.confidence.usageInformation = facts.confidence.usageInformation === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.usageInformation;
  }
  if (facts.cautions.length) facts.confidence.cautions = facts.confidence.cautions === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.cautions;
  if (facts.pricingInformation || (facts.offerFacts ?? []).length) {
    facts.confidence.pricingInformation = facts.confidence.pricingInformation === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.pricingInformation;
  }
  if (facts.guaranteeInformation) {
    facts.confidence.guaranteeInformation =
      facts.confidence.guaranteeInformation === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.guaranteeInformation;
  }
  if (facts.manufacturer) {
    facts.confidence.manufacturer = facts.confidence.manufacturer === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.manufacturer;
  }
}

function mergeSpecs(out: MergeOutput, existing: SpecificationFact[], incoming: SpecificationFact[]): void {
  const next = [...existing];
  for (const spec of incoming) {
    const prior = next.find((item) => keyOf(item.name) === keyOf(spec.name));
    if (!prior) {
      next.push(spec);
      out.addedFields.push("specifications");
      out.provenance.push({
        field: `specifications.${spec.name}`,
        text: `${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`,
        sourceUrl: spec.sourceUrl,
        retrievedAt: spec.retrievedAt ?? null,
        excerpt: `${spec.name}: ${spec.value}`,
        verification: "SELLER_DECLARED",
        restriction: "PUBLISHABLE",
        class: "FACT",
      });
      continue;
    }
    if (keyOf(prior.value) !== keyOf(spec.value) || keyOf(prior.unit ?? "") !== keyOf(spec.unit ?? "")) {
      out.conflicts.push({
        field: `specifications.${spec.name}`,
        values: [
          { text: `${prior.value}${prior.unit ? ` ${prior.unit}` : ""}`, sourceUrl: prior.sourceUrl },
          { text: `${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`, sourceUrl: spec.sourceUrl },
        ],
        kept: `${prior.value}${prior.unit ? ` ${prior.unit}` : ""}`,
        reason: "conflicting measurements are not resolved by inventing a third value",
      });
    }
  }
  out.facts.specifications = next;
}

function mergeOffers(out: MergeOutput, existing: OfferFact[], incoming: OfferFact[]): void {
  const next = [...existing];
  const have = new Set(existing.map((item) => keyOf(item.packageName)));
  for (const offer of incoming) {
    if (have.has(keyOf(offer.packageName))) continue;
    have.add(keyOf(offer.packageName));
    next.push(offer);
    out.addedFields.push("offerFacts");
    out.provenance.push({
      field: "offerFacts",
      text: `${offer.packageName} ${offer.totalPrice ?? offer.unitPrice}`,
      sourceUrl: offer.sourceUrl,
      retrievedAt: null,
      excerpt: offer.packageName,
      verification: "SELLER_DECLARED",
      restriction: "PUBLISHABLE",
      class: "FACT",
    });
  }
  out.facts.offerFacts = next;
}

function mergeSnippets(out: MergeOutput, snippets: SourceFact[]): void {
  for (const snippet of snippets) {
    if (snippet.field !== "faq" || !snippet.question) continue;
    const exists = out.facts.sourceSnippets.some(
      (item) => item.question && keyOf(item.question) === keyOf(snippet.question ?? ""),
    );
    if (exists) continue;
    if (!statementAllowed(snippet.text, "PROMOTIONAL") || !statementAllowed(snippet.question, "PROMOTIONAL")) {
      out.withheld.push({ field: "faq", text: `${snippet.question} ${snippet.text}`, reason: "FAQ failed the claim gate" });
      continue;
    }
    out.addedFields.push("faq");
    out.provenance.push({
      field: "faq",
      text: snippet.text,
      sourceUrl: snippet.sourceUrl,
      retrievedAt: snippet.retrievedAt ?? null,
      excerpt: snippet.question,
      verification: "SELLER_DECLARED",
      restriction: "PUBLISHABLE",
      class: "FACT",
    });
  }
}

function mergeOperational(out: MergeOutput, batch: ExtractedBatch): void {
  const returns = [...(out.facts.returnsInformation ?? [])];
  const haveReturn = new Set(returns.map((item) => keyOf(item.statement)));
  for (const item of batch.facts.returnsInformation ?? []) {
    if (haveReturn.has(keyOf(item.statement))) continue;
    haveReturn.add(keyOf(item.statement));
    returns.push(item);
    out.addedFields.push("returnsInformation");
    out.provenance.push({
      field: "returnsInformation",
      text: item.statement,
      sourceUrl: item.sourceUrl,
      retrievedAt: item.retrievedAt ?? null,
      excerpt: item.statement,
      verification: "SELLER_DECLARED",
      restriction: "PUBLISHABLE",
      class: "FACT",
    });
  }
  out.facts.returnsInformation = returns;

  const shipping = [...(out.facts.shippingInformation ?? [])];
  const haveShip = new Set(shipping.map((item) => keyOf(item.statement)));
  for (const item of batch.facts.shippingInformation ?? []) {
    if (haveShip.has(keyOf(item.statement))) continue;
    haveShip.add(keyOf(item.statement));
    shipping.push(item);
    out.addedFields.push("shippingInformation");
    out.provenance.push({
      field: "shippingInformation",
      text: item.statement,
      sourceUrl: item.sourceUrl,
      retrievedAt: item.retrievedAt ?? null,
      excerpt: item.statement,
      verification: "SELLER_DECLARED",
      restriction: "PUBLISHABLE",
      class: "FACT",
    });
  }
  out.facts.shippingInformation = shipping;
}

function uniqueSnippets(items: SourceFact[]): SourceFact[] {
  const seen = new Set<string>();
  const out: SourceFact[] = [];
  for (const item of items) {
    const key = `${item.field}|${keyOf(item.question ?? "")}|${keyOf(item.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
