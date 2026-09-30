import type { FactConfidence, ProductFacts, SourceFact } from "@/lib/product-facts";
import { isCopyEligibleConfidence } from "@/lib/product-facts";

/**
 * Informational completeness of Resolved ProductFacts.
 * Does not generate copy, does not call research, grounding, policy, or publication,
 * and does not block generation.
 */

export type CompletenessStatus = "COMPLETE" | "PARTIAL" | "EMPTY" | "BLOCKED" | "UNKNOWN";
export type ProductHealth = "READY" | "NEEDS_REVIEW" | "INCOMPLETE" | "BLOCKED";
export type FactOriginLabel = "AUTO" | "MANUAL" | "MIXED";

export type CompletenessCategory = {
  id: string;
  label: string;
  status: CompletenessStatus;
  origin: FactOriginLabel | null;
  completion: number;
  importedCount: number;
  manualCount: number;
  details: string[];
  editorHash: string;
  group: "fact" | "readiness";
};

export type CompletenessReport = {
  totalScore: number;
  importerScore: number;
  manualScore: number;
  health: ProductHealth;
  categories: CompletenessCategory[];
  importedAt: string | null;
  manualEditedAt: string | null;
};

export type CompletenessInput = {
  facts: ProductFacts | null;
  affiliateUrl: string;
  ctaLabel: string;
  imageUrl: string | null;
  imageProvenance: string | null;
  /** Set when the resolved tracking URL came from a manual override. */
  trackingOrigin: FactOriginLabel | null;
  manualEditedAt: string | null;
};

const DASHBOARD_IDS = [
  "identity",
  "ingredients",
  "pricing",
  "features",
  "faq",
  "usage",
  "guarantee",
  "warnings",
  "images",
  "tracking",
  "research",
  "presentation",
  "publication",
] as const;

export function dashboardCategories(report: CompletenessReport): CompletenessCategory[] {
  const byId = new Map(report.categories.map((category) => [category.id, category]));
  return DASHBOARD_IDS.map((id) => byId.get(id)).filter((category): category is CompletenessCategory => Boolean(category));
}

export function analyzeProductCompleteness(input: CompletenessInput): CompletenessReport {
  const facts = input.facts;
  const categories = facts ? factCategories(facts, input) : blockedFactCategories();
  categories.push(...readinessCategories(facts, categories, input));
  const scores = scoreFacts(categories.filter((category) => category.group === "fact"));
  return {
    ...scores,
    health: healthOf(facts, categories),
    categories,
    importedAt: latestRetrievedAt(facts),
    manualEditedAt: input.manualEditedAt,
  };
}

function factCategories(facts: ProductFacts, input: CompletenessInput): CompletenessCategory[] {
  const name = facts.productName?.trim() ?? "";
  const description = facts.description?.trim() ?? "";
  const manufacturer = facts.manufacturer?.trim() ?? "";
  const features = presentList(facts.features);
  const ingredients = presentList(facts.ingredientsOrComponents);
  const usage = presentList(facts.usageInformation);
  const warnings = presentList(facts.cautions);
  const faq = faqEntries(facts.sourceSnippets);
  const offers = facts.offerFacts ?? [];
  const pricingText = facts.pricingInformation?.trim() ?? "";
  const confidence = facts.confidence;

  return [
    scalarCategory("identity", "Identity", name, confidence?.productName, "identity", name ? ["Complete"] : ["Missing"]),
    scalarCategory(
      "description",
      "Description",
      description,
      confidence?.description,
      "identity",
      description ? ["Complete"] : ["Missing"],
    ),
    scalarCategory(
      "manufacturer",
      "Manufacturer",
      manufacturer,
      confidence?.manufacturer,
      "identity",
      manufacturer ? ["Complete"] : ["Missing"],
    ),
    listCategory("ingredients", "Ingredients", ingredients, confidence?.ingredientsOrComponents, "ingredients"),
    listCategory("features", "Features", features, confidence?.features, "features"),
    listCategory("usage", "Usage", usage, confidence?.usageInformation, "usage"),
    scalarCategory(
      "guarantee",
      "Guarantee",
      facts.guaranteeInformation?.trim() ?? "",
      confidence?.guaranteeInformation,
      "guarantee",
      facts.guaranteeInformation?.trim() ? ["Complete"] : ["Missing"],
    ),
    warningCategory(warnings, confidence?.cautions),
    pricingCategory(pricingText, offers, confidence?.pricingInformation),
    offerCategory(offers),
    faqCategory(faq),
    imageCategory(input.imageUrl, input.imageProvenance, facts),
    trackingCategory(input.affiliateUrl, input.trackingOrigin),
  ];
}

function blockedFactCategories(): CompletenessCategory[] {
  const ids: Array<[string, string, string]> = [
    ["identity", "Identity", "identity"],
    ["description", "Description", "identity"],
    ["manufacturer", "Manufacturer", "identity"],
    ["ingredients", "Ingredients", "ingredients"],
    ["features", "Features", "features"],
    ["usage", "Usage", "usage"],
    ["guarantee", "Guarantee", "guarantee"],
    ["warnings", "Warnings", "warnings"],
    ["pricing", "Pricing", "pricing"],
    ["offers", "Offers", "pricing"],
    ["faq", "FAQ", "faq"],
    ["images", "Images", "identity"],
    ["tracking", "Tracking", "offer"],
  ];
  return ids.map(([id, label, editorHash]) =>
    category({
      id,
      label,
      status: "BLOCKED",
      origin: null,
      completion: 0,
      importedCount: 0,
      manualCount: 0,
      details: ["Resolved ProductFacts are missing"],
      editorHash,
      group: "fact",
    }),
  );
}

function readinessCategories(
  facts: ProductFacts | null,
  categories: CompletenessCategory[],
  input: CompletenessInput,
): CompletenessCategory[] {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const contentIds = ["description", "features", "ingredients", "usage", "guarantee", "pricing"];
  const content = contentIds.map((id) => byId.get(id)).filter((item): item is CompletenessCategory => Boolean(item));
  const identity = byId.get("identity");
  const tracking = byId.get("tracking");
  const eligible = content.filter((item) => item.status === "COMPLETE");
  const partial = content.filter((item) => item.status === "PARTIAL");

  return [
    importerReadiness(facts, categories.filter((item) => item.group === "fact")),
    researchReadiness(identity, content),
    groundingReadiness(facts, eligible, partial),
    policyReadiness(input),
    presentationReadiness(eligible, partial),
    publicationReadiness(facts, identity, tracking, eligible),
  ];
}

function importerReadiness(facts: ProductFacts | null, factCategories: CompletenessCategory[]): CompletenessCategory {
  if (!facts) {
    return readiness("importer", "Importer Readiness", "BLOCKED", null, 0, ["Resolved ProductFacts are missing"]);
  }
  const filled = factCategories.filter((item) => item.completion > 0).length;
  const completion = factCategories.length === 0 ? 0 : Math.round((filled / factCategories.length) * 100);
  const quality = facts.importQuality;
  if (quality === "SUFFICIENT") return readiness("importer", "Importer Readiness", "COMPLETE", "AUTO", completion, ["Sufficient"]);
  if (quality === "PARTIAL") return readiness("importer", "Importer Readiness", "PARTIAL", "AUTO", completion, ["Partial"]);
  if (quality === "INSUFFICIENT") return readiness("importer", "Importer Readiness", "EMPTY", "AUTO", completion, ["Insufficient"]);
  return readiness("importer", "Importer Readiness", "UNKNOWN", "AUTO", completion, ["Import quality was not recorded"]);
}

function researchReadiness(
  identity: CompletenessCategory | undefined,
  content: CompletenessCategory[],
): CompletenessCategory {
  const named = identity?.status === "COMPLETE" || identity?.status === "PARTIAL";
  const described = content.some((item) => item.status === "COMPLETE" || item.status === "PARTIAL");
  const completion = Math.round((((named ? 1 : 0) + (described ? 1 : 0)) / 2) * 100);
  if (named && described) return readiness("research", "Research Readiness", "COMPLETE", identity?.origin ?? null, completion, ["Name and description material are present"]);
  if (named || described) return readiness("research", "Research Readiness", "PARTIAL", identity?.origin ?? null, completion, ["Name or description material is still missing"]);
  return readiness("research", "Research Readiness", "EMPTY", null, completion, ["Name and description material are missing"]);
}

function groundingReadiness(
  facts: ProductFacts | null,
  eligible: CompletenessCategory[],
  partial: CompletenessCategory[],
): CompletenessCategory {
  if (!facts) return readiness("grounding", "Grounding Readiness", "BLOCKED", null, 0, ["Resolved ProductFacts are missing"]);
  if (eligible.length > 0) return readiness("grounding", "Grounding Readiness", "COMPLETE", originMix(eligible), 100, ["Copy-eligible facts are present"]);
  if (partial.length > 0) return readiness("grounding", "Grounding Readiness", "PARTIAL", originMix(partial), 100, ["Stored facts are not copy-eligible"]);
  return readiness("grounding", "Grounding Readiness", "EMPTY", null, 0, ["No copy-eligible facts"]);
}

function policyReadiness(input: CompletenessInput): CompletenessCategory {
  const url = input.affiliateUrl.trim();
  const cta = input.ctaLabel.trim();
  const scheme = urlScheme(url);
  const present = (scheme === "http" ? 1 : 0) + (cta ? 1 : 0);
  const completion = Math.round((present / 2) * 100);
  if (scheme === "blocked") return readiness("policy", "Policy Readiness", "BLOCKED", null, 0, ["Tracking URL uses a blocked scheme"]);
  if (scheme === "http" && cta) return readiness("policy", "Policy Readiness", "COMPLETE", null, completion, ["Tracking URL and CTA are present"]);
  if (present > 0) return readiness("policy", "Policy Readiness", "PARTIAL", null, completion, ["Tracking URL or CTA is missing"]);
  return readiness("policy", "Policy Readiness", "EMPTY", null, 0, ["Tracking URL and CTA are missing"]);
}

function presentationReadiness(eligible: CompletenessCategory[], partial: CompletenessCategory[]): CompletenessCategory {
  if (eligible.length > 0) return readiness("presentation", "Presentation Readiness", "COMPLETE", originMix(eligible), 100, ["Resolved facts include presentable material"]);
  if (partial.length > 0) return readiness("presentation", "Presentation Readiness", "PARTIAL", originMix(partial), 100, ["Presentable material is not copy-eligible"]);
  return readiness("presentation", "Presentation Readiness", "EMPTY", null, 0, ["Presentable material is missing"]);
}

function publicationReadiness(
  facts: ProductFacts | null,
  identity: CompletenessCategory | undefined,
  tracking: CompletenessCategory | undefined,
  eligible: CompletenessCategory[],
): CompletenessCategory {
  if (!facts) return readiness("publication", "Publication Readiness", "BLOCKED", null, 0, ["Resolved ProductFacts are missing"]);
  if (tracking?.status === "BLOCKED") return readiness("publication", "Publication Readiness", "BLOCKED", null, 0, ["Tracking URL is blocked"]);
  const named = identity?.status === "COMPLETE";
  const tracked = tracking?.status === "COMPLETE";
  const presented = eligible.length > 0;
  const completion = Math.round((((named ? 1 : 0) + (tracked ? 1 : 0) + (presented ? 1 : 0)) / 3) * 100);
  if (named && tracked && presented) return readiness("publication", "Publication Readiness", "COMPLETE", null, completion, ["Name, tracking URL, and presentable facts are present"]);
  if (named || tracked || presented) return readiness("publication", "Publication Readiness", "PARTIAL", null, completion, ["Name, tracking URL, or presentable facts are still missing"]);
  return readiness("publication", "Publication Readiness", "EMPTY", null, completion, ["Name, tracking URL, and presentable facts are missing"]);
}

function scalarCategory(
  id: string,
  label: string,
  value: string,
  confidence: FactConfidence | undefined,
  editorHash: string,
  details: string[],
): CompletenessCategory {
  const filled = value.length > 0;
  const origin = originFromConfidence(confidence, filled);
  const eligible = filled && isCopyEligibleConfidence(confidence ?? "NOT_FOUND");
  const status: CompletenessStatus = !filled ? "EMPTY" : eligible ? "COMPLETE" : confidence ? "PARTIAL" : "UNKNOWN";
  return category({
    id,
    label,
    status,
    origin,
    completion: filled ? 100 : 0,
    importedCount: filled && origin === "AUTO" ? 1 : 0,
    manualCount: filled && origin === "MANUAL" ? 1 : 0,
    details: status === "PARTIAL" ? ["Present, not copy-eligible"] : details,
    editorHash,
    group: "fact",
  });
}

function listCategory(
  id: string,
  label: string,
  items: string[],
  confidence: FactConfidence | undefined,
  editorHash: string,
): CompletenessCategory {
  const origin = originFromConfidence(confidence, items.length > 0);
  const eligible = items.length > 0 && isCopyEligibleConfidence(confidence ?? "NOT_FOUND");
  const status: CompletenessStatus = items.length === 0 ? "EMPTY" : eligible ? "COMPLETE" : confidence ? "PARTIAL" : "UNKNOWN";
  const importedCount = items.length > 0 && origin === "AUTO" ? items.length : 0;
  const manualCount = items.length > 0 && origin === "MANUAL" ? items.length : 0;
  return category({
    id,
    label,
    status,
    origin,
    completion: items.length > 0 ? 100 : 0,
    importedCount,
    manualCount,
    details: [`${importedCount} imported`, `${manualCount} manual`, "0 missing"],
    editorHash,
    group: "fact",
  });
}

function warningCategory(items: string[], confidence: FactConfidence | undefined): CompletenessCategory {
  if (items.length === 0) {
    return category({
      id: "warnings",
      label: "Warnings",
      status: "EMPTY",
      origin: confidence === "MANUAL" ? "MANUAL" : confidence ? "AUTO" : null,
      completion: 0,
      importedCount: 0,
      manualCount: 0,
      details: ["None"],
      editorHash: "warnings",
      group: "fact",
    });
  }
  return listCategory("warnings", "Warnings", items, confidence, "warnings");
}

function pricingCategory(
  pricingText: string,
  offers: NonNullable<ProductFacts["offerFacts"]>,
  confidence: FactConfidence | undefined,
): CompletenessCategory {
  const priced = offers.filter((offer) => offer.packageName?.trim() && offer.unitPrice?.trim());
  const filled = pricingText.length > 0 || priced.length > 0;
  const origin = originFromConfidence(confidence, filled);
  const eligible = filled && (isCopyEligibleConfidence(confidence ?? "NOT_FOUND") || priced.some((offer) => offer.confidence === "DIRECT_SOURCE"));
  const status: CompletenessStatus = !filled ? "EMPTY" : eligible ? "COMPLETE" : "PARTIAL";
  const details = pricingText ? ["Pricing text present"] : ["Pricing text missing"];
  for (const offer of offers) {
    const name = offer.packageName?.trim() || "Package";
    details.push(offer.unitPrice?.trim() ? `${name} — price present` : `${name} — price missing`);
  }
  if (offers.length === 0 && !pricingText) details.splice(0, details.length, "Missing");
  return category({
    id: "pricing",
    label: "Pricing",
    status,
    origin,
    completion: filled ? 100 : 0,
    importedCount: filled && origin !== "MANUAL" ? 1 : 0,
    manualCount: filled && origin === "MANUAL" ? 1 : 0,
    details,
    editorHash: "pricing",
    group: "fact",
  });
}

function offerCategory(offers: NonNullable<ProductFacts["offerFacts"]>): CompletenessCategory {
  if (offers.length === 0) {
    return category({
      id: "offers",
      label: "Offers",
      status: "EMPTY",
      origin: null,
      completion: 0,
      importedCount: 0,
      manualCount: 0,
      details: ["None"],
      editorHash: "pricing",
      group: "fact",
    });
  }
  const details: string[] = [];
  for (const offer of offers) {
    const name = offer.packageName?.trim() || "Package";
    const gaps = offerGaps(offer);
    if (offer.packageName?.trim() && offer.unitPrice?.trim() && gaps.length === 0) {
      details.push(`${name} — Complete`);
    } else if (offer.packageName?.trim() && offer.unitPrice?.trim()) {
      details.push(`${name} — ${gaps.join(", ")}`);
    } else {
      details.push(`${name} — price missing`);
    }
  }
  const priced = offers.filter((offer) => offer.packageName?.trim() && offer.unitPrice?.trim()).length;
  const status: CompletenessStatus = priced === 0 ? "EMPTY" : priced === offers.length ? "COMPLETE" : "PARTIAL";
  return category({
    id: "offers",
    label: "Offers",
    status,
    origin: "AUTO",
    completion: Math.round((priced / offers.length) * 100),
    importedCount: offers.length,
    manualCount: 0,
    details,
    editorHash: "pricing",
    group: "fact",
  });
}

function offerGaps(offer: NonNullable<ProductFacts["offerFacts"]>[number]): string[] {
  const gaps: string[] = [];
  if (!offer.quantity?.trim()) gaps.push("quantity empty");
  if (!offer.totalPrice?.trim()) gaps.push("total empty");
  if (!offer.savings?.trim()) gaps.push("savings empty");
  if (!offer.shipping?.trim()) gaps.push("shipping empty");
  if (!offer.bonuses?.trim()) gaps.push("bonus empty");
  return gaps;
}

function faqCategory(entries: SourceFact[]): CompletenessCategory {
  const importedCount = entries.filter((entry) => entry.confidence !== "MANUAL").length;
  const manualCount = entries.filter((entry) => entry.confidence === "MANUAL").length;
  const origin: FactOriginLabel | null = entries.length === 0 ? null : importedCount > 0 && manualCount > 0 ? "MIXED" : manualCount > 0 ? "MANUAL" : "AUTO";
  const eligible = entries.filter((entry) => isCopyEligibleConfidence(entry.confidence)).length;
  const status: CompletenessStatus = entries.length === 0 ? "EMPTY" : eligible === entries.length ? "COMPLETE" : eligible > 0 ? "PARTIAL" : "PARTIAL";
  return category({
    id: "faq",
    label: "FAQ",
    status: entries.length === 0 ? "EMPTY" : status,
    origin,
    completion: entries.length > 0 ? 100 : 0,
    importedCount,
    manualCount,
    details: [`${entries.length} found`],
    editorHash: "faq",
    group: "fact",
  });
}

function imageCategory(imageUrl: string | null, provenance: string | null, facts: ProductFacts): CompletenessCategory {
  const url = (imageUrl || facts.productImageUrl || "").trim();
  const source = (provenance || facts.productImageProvenance || "").trim();
  if (!url || source === "NOT_FOUND") {
    return category({
      id: "images",
      label: "Images",
      status: "EMPTY",
      origin: source === "MANUAL" ? "MANUAL" : source ? "AUTO" : null,
      completion: 0,
      importedCount: 0,
      manualCount: 0,
      details: ["Missing"],
      editorHash: "identity",
      group: "fact",
    });
  }
  if (source === "PLACEHOLDER") {
    return category({
      id: "images",
      label: "Images",
      status: "PARTIAL",
      origin: "AUTO",
      completion: 0,
      importedCount: 1,
      manualCount: 0,
      details: ["Placeholder"],
      editorHash: "identity",
      group: "fact",
    });
  }
  const manual = source === "MANUAL";
  return category({
    id: "images",
    label: "Images",
    status: "COMPLETE",
    origin: manual ? "MANUAL" : "AUTO",
    completion: 100,
    importedCount: manual ? 0 : 1,
    manualCount: manual ? 1 : 0,
    details: ["Present"],
    editorHash: "identity",
    group: "fact",
  });
}

function trackingCategory(affiliateUrl: string, trackingOrigin: FactOriginLabel | null): CompletenessCategory {
  const url = affiliateUrl.trim();
  const scheme = urlScheme(url);
  if (!url) {
    return category({
      id: "tracking",
      label: "Tracking",
      status: "EMPTY",
      origin: null,
      completion: 0,
      importedCount: 0,
      manualCount: 0,
      details: ["Missing"],
      editorHash: "offer",
      group: "fact",
    });
  }
  if (scheme === "blocked") {
    return category({
      id: "tracking",
      label: "Tracking",
      status: "BLOCKED",
      origin: null,
      completion: 0,
      importedCount: 0,
      manualCount: 0,
      details: ["Blocked scheme"],
      editorHash: "offer",
      group: "fact",
    });
  }
  if (scheme !== "http") {
    return category({
      id: "tracking",
      label: "Tracking",
      status: "UNKNOWN",
      origin: null,
      completion: 0,
      importedCount: 0,
      manualCount: 0,
      details: ["Unrecognized URL"],
      editorHash: "offer",
      group: "fact",
    });
  }
  return category({
    id: "tracking",
    label: "Tracking",
    status: "COMPLETE",
    origin: trackingOrigin === "MANUAL" ? "MANUAL" : "AUTO",
    completion: 100,
    importedCount: trackingOrigin === "MANUAL" ? 0 : 1,
    manualCount: trackingOrigin === "MANUAL" ? 1 : 0,
    details: ["Present"],
    editorHash: "offer",
    group: "fact",
  });
}

function readiness(
  id: string,
  label: string,
  status: CompletenessStatus,
  origin: FactOriginLabel | null,
  completion: number,
  details: string[],
): CompletenessCategory {
  return category({
    id,
    label,
    status,
    origin,
    completion,
    importedCount: 0,
    manualCount: 0,
    details,
    editorHash: "identity",
    group: "readiness",
  });
}

function category(value: CompletenessCategory): CompletenessCategory {
  return value;
}

function healthOf(facts: ProductFacts | null, categories: CompletenessCategory[]): ProductHealth {
  if (!facts) return "BLOCKED";
  if (categories.some((item) => item.status === "BLOCKED")) return "BLOCKED";
  const identity = categories.find((item) => item.id === "identity");
  const content = categories.filter((item) => item.group === "fact" && item.id !== "identity" && item.id !== "tracking" && item.id !== "images");
  const usable = content.some((item) => item.status === "COMPLETE" || item.status === "PARTIAL");
  if (!identity || identity.status === "EMPTY" || identity.status === "UNKNOWN" || !usable) return "INCOMPLETE";
  const gaps = categories.filter((item) => item.group === "fact" && (item.status === "EMPTY" || item.status === "PARTIAL" || item.status === "UNKNOWN"));
  if (gaps.length === 0) return "READY";
  return "NEEDS_REVIEW";
}

function scoreFacts(categories: CompletenessCategory[]): { totalScore: number; importerScore: number; manualScore: number } {
  if (categories.length === 0) return { totalScore: 0, importerScore: 0, manualScore: 0 };
  let importer = 0;
  let manual = 0;
  for (const item of categories) {
    const weight = item.completion / 100;
    if (weight <= 0) continue;
    if (item.origin === "MANUAL") manual += weight;
    else if (item.origin === "MIXED") {
      const parts = item.importedCount + item.manualCount;
      if (parts > 0) {
        importer += weight * (item.importedCount / parts);
        manual += weight * (item.manualCount / parts);
      }
    } else if (item.origin === "AUTO") importer += weight;
  }
  const importerScore = Math.round((importer / categories.length) * 100);
  const manualScore = Math.round((manual / categories.length) * 100);
  let totalScore = importerScore + manualScore;
  if (totalScore > 100) {
    const overflow = totalScore - 100;
    if (importerScore >= manualScore) return { totalScore: 100, importerScore: importerScore - overflow, manualScore };
    return { totalScore: 100, importerScore, manualScore: manualScore - overflow };
  }
  return { totalScore, importerScore, manualScore };
}

function originFromConfidence(confidence: FactConfidence | undefined, filled: boolean): FactOriginLabel | null {
  if (!filled) return confidence === "MANUAL" ? "MANUAL" : confidence ? "AUTO" : null;
  if (confidence === "MANUAL") return "MANUAL";
  if (!confidence) return null;
  return "AUTO";
}

function originMix(items: CompletenessCategory[]): FactOriginLabel | null {
  const origins = new Set(items.map((item) => item.origin).filter((origin): origin is FactOriginLabel => Boolean(origin)));
  if (origins.size === 0) return null;
  if (origins.size > 1 || origins.has("MIXED")) return "MIXED";
  return [...origins][0] ?? null;
}

function presentList(items: string[] | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function faqEntries(snippets: SourceFact[] | undefined): SourceFact[] {
  return (snippets ?? []).filter((snippet) => snippet.field === "faq" && (snippet.text?.trim() || snippet.question?.trim()));
}

function latestRetrievedAt(facts: ProductFacts | null): string | null {
  const stamps = (facts?.sourceSnippets ?? []).map((snippet) => snippet.retrievedAt?.trim() ?? "").filter(Boolean);
  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

function urlScheme(value: string): "http" | "blocked" | "other" | "empty" {
  if (!value) return "empty";
  if (/^javascript:/i.test(value) || /^data:/i.test(value)) return "blocked";
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return "http";
  } catch {
    return "other";
  }
  return "other";
}
