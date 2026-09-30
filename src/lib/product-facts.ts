import { withNormalizedNumerals } from "@/lib/ai/operational-relations";
import { isIngredientIdentityName, isUsageInstruction } from "@/lib/import-heuristics";

/**
 * ProductFacts — Phase 3 content engine.
 *
 * SOURCE FACTS (imported or operator-entered) are distinct from
 * AI-generated copy. AI-generated content must not be treated as evidence.
 * Product facts must come from imported or operator-provided information.
 *
 * Session-only during generation. Phase 6 snapshots `sourceFactsJson` on
 * the campaign so publish can re-run grounding against the same facts.
 */

export type FactConfidence =
  | "DIRECT_SOURCE"
  | "HEURISTIC_EXTRACTION"
  | "AI_SOURCE_CLASSIFICATION"
  | "MANUAL"
  | "NOT_FOUND";

export type FactOrigin = "IMPORTED" | "MANUAL";

export type ImportQuality = "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";

export type FactField =
  | "productName"
  | "description"
  | "features"
  | "ingredientsOrComponents"
  | "usageInformation"
  | "cautions"
  | "pricingInformation"
  | "guaranteeInformation"
  | "manufacturer";

export type CopyEligibilityFlag = "YES" | "NO";

export type IngredientContextRelation = "SUPPORTS" | "CONTAINS" | "DESCRIBED_AS" | "OTHER";

export type IngredientContextKind = "HEALTH_EFFICACY" | "NEUTRAL_CONTEXT" | "SELLER_ATTRIBUTED";

export type SourcePageCategory =
  | "PRIMARY"
  | "RETURNS"
  | "REFUNDS"
  | "SHIPPING"
  | "USAGE"
  | "PRODUCT_DETAILS"
  | "FAQ"
  | "PRIVACY"
  | "TERMS"
  | "GENERAL_LEGAL"
  | "BLOG"
  | "TESTIMONIALS"
  | "REVIEWS"
  | "UNRELATED_SUPPORT"
  | "AMBIGUOUS_SOURCE_CATEGORY";

export type SourceFact = {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: FactConfidence;
  question?: string;
  context?: string;
  sourcePageCategory?: SourcePageCategory;
  sourceUnit?: string;
  sourceLocation?: string;
  retrievedAt?: string;
};

/**
 * Seller- or source-attributed statement about a named ingredient.
 * Distinct from ingredientsOrComponents (identity only). DIRECT_SOURCE here
 * means the seller/source stated the text — it is not independent verification.
 */
export type IngredientContextEntry = {
  ingredient: string;
  statement: string;
  relation: IngredientContextRelation;
  attribution: "SELLER";
  provenance: FactConfidence;
  kind: IngredientContextKind;
  copyEligibility: CopyEligibilityFlag;
  policyFindings: string[];
  sourceUrl: string;
  sourcePageCategory: SourcePageCategory;
  sourceUnit?: string;
  sourceLocation?: string;
  retrievedAt?: string;
};

export type ReturnsFactKind = "RETURN_WINDOW" | "REFUND_MECHANISM" | "RETURN_CONDITION" | "RETURN_PROCESS" | "OTHER";

export type ShippingFactKind = "DESTINATION" | "PROCESSING" | "DELIVERY_ESTIMATE" | "METHOD" | "OTHER";

export type OperationalFact<K extends string> = {
  statement: string;
  kind: K;
  provenance: FactConfidence;
  copyEligibility: CopyEligibilityFlag;
  policyFindings: string[];
  sourceUrl: string;
  sourcePageCategory: SourcePageCategory;
  sourceUnit?: string;
  sourceLocation?: string;
  /** The source question this statement answers, when it is an FAQ answer. */
  question?: string;
  retrievedAt?: string;
};

export type ReturnsInformationFact = OperationalFact<ReturnsFactKind>;
export type ShippingInformationFact = OperationalFact<ShippingFactKind>;

export type ProductFormatFact = {
  value: string;
  statement: string;
  provenance: FactConfidence;
  copyEligibility: CopyEligibilityFlag;
  policyFindings: string[];
  sourceUrl: string;
  sourcePageCategory: SourcePageCategory;
  sourceUnit?: string;
  sourceLocation?: string;
  retrievedAt?: string;
};

export type FieldConfidence = Record<FactField, FactConfidence>;

/** Verbatim commercial fields from one source offer card. Absent fields were not stated. */
export type OfferFact = {
  packageName: string;
  unitPrice: string;
  quantity?: string;
  totalPrice?: string;
  originalPrice?: string;
  savings?: string;
  shipping?: string;
  bonuses?: string;
  popularityLabel?: string;
  imageUrl?: string;
  sourceUrl: string;
  confidence: "DIRECT_SOURCE";
};

export type ProductFacts = {
  productName: string;
  sourceUrl: string;
  origin: FactOrigin;
  description?: string;
  features: string[];
  ingredientsOrComponents: string[];
  usageInformation: string[];
  cautions: string[];
  pricingInformation?: string;
  offerFacts?: OfferFact[];
  guaranteeInformation?: string;
  manufacturer?: string;
  /**
   * Seller-attributed statements about named ingredients. Not identity.
   * Presence does not imply copy eligibility.
   */
  ingredientContext?: IngredientContextEntry[];
  returnsInformation?: ReturnsInformationFact[];
  shippingInformation?: ShippingInformationFact[];
  productFormat?: ProductFormatFact;
  sourceSnippets: SourceFact[];
  importWarnings: string[];
  confidence: FieldConfidence;
  importQuality: ImportQuality;
  productImageUrl?: string;
  productImageProvenance: "DIRECT_SOURCE" | "MANUAL" | "PLACEHOLDER" | "NOT_FOUND";
  webDiscovery?: {
    triggered: boolean;
    originalUrl: string;
    primaryBlock: string | null;
    productName: string;
    message: string;
    queriesUsed: string[];
    sources: Array<{
      url: string;
      title: string;
      snippet: string;
      query: string;
      status: string;
      identityReasons: string[];
    }>;
    acceptedCount: number;
    uncertainCount: number;
    phases?: Array<{ phase: string; detail?: string }>;
    outcome?: string;
    operatorMessages?: string[];
    searchProvider?: {
      implemented: boolean;
      configured: boolean;
      name: string;
      apiKeyPresent: boolean;
      realWebSearchAvailable: boolean;
      missingConfig: string[];
      message?: string;
    };
    counts?: {
      SEARCH_RESULTS?: number;
      SOURCES_ATTEMPTED?: number;
      SOURCES_TIMEOUT?: number;
      SOURCES_ACCEPTED?: number;
      SOURCES_REJECTED?: number;
    };
    timings?: {
      PRIMARY_FETCH_MS?: number;
      SEARCH_MS?: number;
      ALTERNATIVE_FETCH_MS?: number;
      IDENTITY_MS?: number;
      EXTRACTION_MS?: number;
      ROBOTS_CHECK_MS?: number;
      TOTAL_IMPORT_MS?: number;
    };
  };
};

export type ManualFactInput = {
  productName: string;
  sourceUrl?: string;
  description?: string;
  featuresText?: string;
  ingredientsText?: string;
  usageText?: string;
  cautionsText?: string;
  pricingInformation?: string;
  guaranteeInformation?: string;
  manufacturer?: string;
};

const EMPTY_CONFIDENCE: FieldConfidence = {
  productName: "NOT_FOUND",
  description: "NOT_FOUND",
  features: "NOT_FOUND",
  ingredientsOrComponents: "NOT_FOUND",
  usageInformation: "NOT_FOUND",
  cautions: "NOT_FOUND",
  pricingInformation: "NOT_FOUND",
  guaranteeInformation: "NOT_FOUND",
  manufacturer: "NOT_FOUND",
};

function lines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-\*]\s*/, "").trim())
    .filter(Boolean);
}

export function provenanceLabel(confidence: FactConfidence): string {
  switch (confidence) {
    case "DIRECT_SOURCE":
      return "DIRECT SOURCE";
    case "HEURISTIC_EXTRACTION":
      return "HEURISTIC";
    case "AI_SOURCE_CLASSIFICATION":
      return "AI SOURCE CLASSIFICATION";
    case "MANUAL":
      return "MANUAL";
    default:
      return "NOT FOUND";
  }
}

function fieldCounts(facts: ProductFacts, field: FactField, hasValue: boolean): boolean {
  if (!hasValue) return false;
  return (facts.confidence?.[field] ?? "NOT_FOUND") !== "NOT_FOUND";
}

/**
 * Set only when the fetched source visibly contained that structure and
 * extraction still returned nothing. Absent sections must not set these.
 * A hit blocks SUFFICIENT so description plus two other fields cannot hide
 * a material extraction miss. Ingredients and usage count only when the
 * stored values still classify as those fields.
 */
export const IMPORT_QUALITY_GAPS = {
  ingredients: "Ingredient or component cards were visible in the source but were not extracted.",
  features: "Feature or benefit cards were visible in the source but were not extracted.",
  pricing: "Offer prices were visible in the source but were not extracted.",
} as const;

function hidesVisibleExtractionLoss(facts: ProductFacts): boolean {
  const warnings = facts.importWarnings ?? [];
  return (
    warnings.includes(IMPORT_QUALITY_GAPS.ingredients) ||
    warnings.includes(IMPORT_QUALITY_GAPS.features) ||
    warnings.includes(IMPORT_QUALITY_GAPS.pricing)
  );
}

export function assessImportQuality(facts: ProductFacts): ImportQuality {
  const hasName = Boolean(facts.productName.trim());
  const hasDescription = fieldCounts(facts, "description", Boolean(facts.description?.trim()));
  const hasFeatures = fieldCounts(facts, "features", facts.features.length > 0);
  const hasIngredients = fieldCounts(
    facts,
    "ingredientsOrComponents",
    facts.ingredientsOrComponents.some((item) => isIngredientIdentityName(item)),
  );
  const hasUsage = fieldCounts(
    facts,
    "usageInformation",
    facts.usageInformation.some((item) => isUsageInstruction(item)),
  );
  const hasGuarantee = fieldCounts(facts, "guaranteeInformation", Boolean(facts.guaranteeInformation?.trim()));
  const hasCautions = fieldCounts(facts, "cautions", facts.cautions.length > 0);
  const hasPricing = fieldCounts(facts, "pricingInformation", Boolean(facts.pricingInformation?.trim()));
  const hasManufacturer = fieldCounts(facts, "manufacturer", Boolean(facts.manufacturer?.trim()));

  const major = [hasDescription, hasFeatures, hasIngredients, hasUsage, hasGuarantee, hasCautions].filter(
    Boolean,
  ).length;
  const extra = [hasPricing, hasManufacturer].filter(Boolean).length;

  if (!hasName) return "INSUFFICIENT";
  if (major === 0 && extra === 0) return "INSUFFICIENT";
  if (!hasDescription && major <= 1 && extra === 0) return "INSUFFICIENT";

  const sufficient = (hasDescription && major >= 3) || major >= 4;
  if (sufficient) return hidesVisibleExtractionLoss(facts) ? "PARTIAL" : "SUFFICIENT";
  return "PARTIAL";
}

export function withImportQuality(facts: ProductFacts): ProductFacts {
  return { ...facts, importQuality: assessImportQuality(facts) };
}

export function emptyProductFacts(
  productName = "",
  sourceUrl = "",
  origin: FactOrigin = "MANUAL",
): ProductFacts {
  const warnings =
    origin === "MANUAL"
      ? ["MANUAL PRODUCT FACTS — the operator is responsible for these facts. Nothing was imported."]
      : [];
  const facts: ProductFacts = {
    productName,
    sourceUrl,
    origin,
    features: [],
    ingredientsOrComponents: [],
    usageInformation: [],
    cautions: [],
    ingredientContext: [],
    returnsInformation: [],
    shippingInformation: [],
    sourceSnippets: [],
    importWarnings: warnings,
    productImageProvenance: "NOT_FOUND",
    confidence: {
      ...EMPTY_CONFIDENCE,
      productName: productName.trim() ? "MANUAL" : "NOT_FOUND",
    },
    importQuality: "INSUFFICIENT",
  };
  return withImportQuality(facts);
}

export function applyManualFacts(base: ProductFacts, manual: ManualFactInput): ProductFacts {
  const next: ProductFacts = {
    ...base,
    productName: manual.productName.trim() || base.productName,
    sourceUrl: (manual.sourceUrl ?? base.sourceUrl).trim(),
    origin: base.origin === "IMPORTED" && hasImportedContent(base) ? "IMPORTED" : "MANUAL",
    confidence: { ...base.confidence },
    productImageProvenance: base.productImageProvenance ?? "NOT_FOUND",
    productImageUrl: base.productImageUrl,
  };

  const description = manual.description?.trim();
  if (description) {
    next.description = description;
    next.confidence.description =
      description === (base.description ?? "") ? base.confidence.description : "MANUAL";
    if (description !== base.description) {
      next.origin = overlayOrigin(base, "description");
    }
  }

  const features = lines(manual.featuresText);
  if (manual.featuresText !== undefined) {
    next.features = features;
    next.confidence.features = listConfidence(features, base.features, base.confidence.features);
  }

  const ingredients = lines(manual.ingredientsText);
  if (manual.ingredientsText !== undefined) {
    next.ingredientsOrComponents = ingredients;
    next.confidence.ingredientsOrComponents = listConfidence(
      ingredients,
      base.ingredientsOrComponents,
      base.confidence.ingredientsOrComponents,
    );
  }

  const usage = lines(manual.usageText);
  if (manual.usageText !== undefined) {
    next.usageInformation = usage;
    next.confidence.usageInformation = listConfidence(
      usage,
      base.usageInformation,
      base.confidence.usageInformation,
    );
  }

  const cautions = lines(manual.cautionsText);
  if (manual.cautionsText !== undefined) {
    next.cautions = cautions;
    next.confidence.cautions = listConfidence(cautions, base.cautions, base.confidence.cautions);
  }

  if (manual.pricingInformation !== undefined) {
    const pricing = manual.pricingInformation.trim();
    next.pricingInformation = pricing || undefined;
    next.confidence.pricingInformation = scalarConfidence(
      pricing,
      base.pricingInformation,
      base.confidence.pricingInformation,
    );
  }

  if (manual.guaranteeInformation !== undefined) {
    const guarantee = manual.guaranteeInformation.trim();
    next.guaranteeInformation = guarantee || undefined;
    next.confidence.guaranteeInformation = scalarConfidence(
      guarantee,
      base.guaranteeInformation,
      base.confidence.guaranteeInformation,
    );
  }

  if (manual.manufacturer !== undefined) {
    const manufacturer = manual.manufacturer.trim();
    next.manufacturer = manufacturer || undefined;
    next.confidence.manufacturer = scalarConfidence(
      manufacturer,
      base.manufacturer,
      base.confidence.manufacturer,
    );
  }

  next.confidence.productName = next.productName.trim()
    ? next.productName.trim() === base.productName.trim()
      ? base.confidence.productName === "NOT_FOUND"
        ? "MANUAL"
        : base.confidence.productName
      : "MANUAL"
    : "NOT_FOUND";

  if (base.origin === "IMPORTED" && next.origin === "IMPORTED") {
    const edited = factsDiffer(base, next);
    if (edited) {
      next.importWarnings = uniqueWarnings([
        ...next.importWarnings,
        "Some fields were edited by the operator (MANUAL overlay on IMPORTED facts).",
      ]);
    }
  }

  if (next.origin === "MANUAL" && !next.importWarnings.some((w) => w.includes("MANUAL PRODUCT FACTS"))) {
    next.importWarnings = uniqueWarnings([
      ...next.importWarnings,
      "MANUAL PRODUCT FACTS — the operator is responsible for these facts.",
    ]);
  }

  return withImportQuality(next);
}

function listConfidence(
  nextValues: string[],
  previousValues: string[],
  previous: FactConfidence,
): FactConfidence {
  if (nextValues.length === 0) return "NOT_FOUND";
  if (nextValues.join("\n") === previousValues.join("\n")) return previous;
  return "MANUAL";
}

function scalarConfidence(
  nextValue: string,
  previousValue: string | undefined,
  previous: FactConfidence,
): FactConfidence {
  if (!nextValue) return "NOT_FOUND";
  if (nextValue === (previousValue ?? "")) return previous;
  return "MANUAL";
}

function overlayOrigin(base: ProductFacts, _field: string): FactOrigin {
  return base.origin === "IMPORTED" ? "IMPORTED" : "MANUAL";
}

function hasImportedContent(facts: ProductFacts): boolean {
  return (
    facts.origin === "IMPORTED" ||
    facts.features.length > 0 ||
    facts.ingredientsOrComponents.length > 0 ||
    Boolean(facts.description)
  );
}

function factsDiffer(a: ProductFacts, b: ProductFacts): boolean {
  return (
    a.productName !== b.productName ||
    a.description !== b.description ||
    a.features.join("\n") !== b.features.join("\n") ||
    a.ingredientsOrComponents.join("\n") !== b.ingredientsOrComponents.join("\n") ||
    a.usageInformation.join("\n") !== b.usageInformation.join("\n") ||
    a.cautions.join("\n") !== b.cautions.join("\n") ||
    a.pricingInformation !== b.pricingInformation ||
    a.guaranteeInformation !== b.guaranteeInformation ||
    a.manufacturer !== b.manufacturer
  );
}

function uniqueWarnings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

export function hasUsableFacts(facts: ProductFacts): boolean {
  return Boolean(
    facts.productName.trim() ||
      facts.description ||
      facts.features.length ||
      facts.ingredientsOrComponents.length ||
      facts.usageInformation.length,
  );
}

/**
 * Copy-eligible facts may be used as SOURCE FACTS in generation and as
 * grounding evidence. Stored ProductFacts that fail this check are kept for
 * operator review and must not be treated as publishable evidence.
 *
 * DIRECT_SOURCE: seller/source text — copy-eligible when semantically used.
 * MANUAL: operator-entered — copy-eligible; the operator attested the text.
 * HEURISTIC_EXTRACTION: stored, never automatically copy-eligible.
 * AI_SOURCE_CLASSIFICATION: stored, never automatically copy-eligible.
 * NOT_FOUND: never copy-eligible.
 *
 * FAQ / raw source snippets are research evidence, not copy evidence, unless
 * the same text was promoted into a copy-eligible ProductFacts field.
 */
export const CONSUMER_COPY_ALLOWED_PROVENANCE: FactConfidence[] = ["DIRECT_SOURCE", "MANUAL"];
export const CONSUMER_COPY_DISALLOWED_PROVENANCE: FactConfidence[] = [
  "HEURISTIC_EXTRACTION",
  "NOT_FOUND",
  "AI_SOURCE_CLASSIFICATION",
];

export function isCopyEligibleConfidence(confidence: FactConfidence): boolean {
  return confidence === "DIRECT_SOURCE" || confidence === "MANUAL";
}

/**
 * Identity label for generation/composition. DIRECT_SOURCE and MANUAL names
 * are ordinary copy-eligible facts. A stored non-empty name with another
 * provenance is still required so the model can name the product — it is
 * not evidence for any other field and is not promoted to DIRECT_SOURCE.
 */
export type ProductNameAuthority = "DIRECT_SOURCE" | "MANUAL" | "OPERATOR_IDENTITY" | "NONE";

export type ConsumerCopyEligibleFacts = {
  productName: string;
  productNameAuthority: ProductNameAuthority;
  productNameStoredProvenance: FactConfidence;
  description: string;
  features: string[];
  ingredientsOrComponents: string[];
  usageInformation: string[];
  cautions: string[];
  pricingInformation: string;
  guaranteeInformation: string;
  manufacturer: string;
  /** Source statement that carries the product format; "" when absent. */
  productFormat: string;
  /** Short format value (for example "tablet"); "" when absent. */
  productFormatValue: string;
  returnsInformation: string[];
  shippingInformation: string[];
  sourceUrl: string;
};

export type OperationalCopyField = "productFormat" | "returnsInformation" | "shippingInformation";

export type OperationalCopyItem = {
  field: OperationalCopyField;
  statement: string;
  kind: string;
  provenance: FactConfidence;
  sourceUrl: string;
};

/** Mis-decoded text (replacement characters or UTF-8 read as Latin-1). */
export function hasEncodingCorruption(text: string): boolean {
  return /\uFFFD|â€|Ã[\u0080-\u00BF]|Â[\u00A0-\u00BF]/.test(text);
}

const CONTACT_DETAIL =
  /[\w.+-]+@[\w-]+\.[\w.]+|\[email[^\]]{0,8}protected\]|\+?\d[\d\s().-]{8,}\d|\b(?:p\.?\s?o\.?\s+box|suite|ste\.?)\s*\d+|\b\d{1,6}\s+[A-Za-z0-9 .'-]{2,40}\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|highway|hwy)\b\.?,?|\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i;

/** Contact or postal details are evidence, not consumer copy. */
export function hasContactDetail(text: string): boolean {
  return CONTACT_DETAIL.test(text);
}

function cleanOperationalStatement(text: string): string {
  return text
    .replace(/^\s*[*•\-–]\s*/, "")
    .replace(/\s*\b(?:read more|learn more|click here)(?:\s+here)?\s*\.?\s*$/i, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const MEASURE = /\b\d+(?:\.\d+)?\s*(?:-|to|–)?\s*\d*\s*(?:hours?|days?|working days|business days|weeks?|months?)\b|\$\s?\d+(?:\.\d{2})?/gi;

function measuresOf(text: string): string[] {
  return [...withNormalizedNumerals(text).matchAll(MEASURE)].map((match) => match[0].toLowerCase().replace(/\s+/g, " ")).sort();
}

function contentWordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

/**
 * Same fact stated twice: identical text, or a policy sentence and its FAQ
 * answer with the same measures. Short rows (for example one destination per
 * table row) are never merged, so geographic distinctions survive.
 */
function isEquivalentOperationalStatement(
  a: { statement: string; kind: string },
  b: { statement: string; kind: string },
): boolean {
  const na = a.statement.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
  const nb = b.statement.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
  if (na === nb) return true;
  if (a.kind === "DESTINATION" || b.kind === "DESTINATION") return false;
  const sourceWords = (text: string) => text.trim().split(/\s+/).length;
  if (Math.min(sourceWords(a.statement), sourceWords(b.statement)) < 8) return false;
  return equivalentMeasuredStatements(a.statement, b.statement);
}

/**
 * Material relationships a statement can carry beyond its measures. Two
 * statements that differ in any of them state different facts, however many
 * words they share.
 */
const MATERIAL_RELATIONS: Array<[string, RegExp]> = [
  ["requirement", /\b(?:must|required?|requires|requirement|need(?:s|ed)? to|mandatory|only)\b/i],
  ["authorization", /\b(?:authori[sz]\w*|approv\w*|rma|permission)\b/i],
  ["condition", /\b(?:if|unless|provided that|as long as|subject to|in the event)\b/i],
  ["exception", /\b(?:not|no|never|cannot|can't|won't|except|excluding|exclusions?)\b/i],
  ["fee", /\b(?:fees?|costs?|charges?|charged|pay|paid|deduct\w*|restocking)\b|\$/i],
  ["optionality", /\b(?:optional|may|if available|where available)\b/i],
  ["return_action", /\b(?:return(?:s|ed|ing)?|send(?:s|ing)?\s+(?:\w+\s+){0,2}back|sent\s+back|ship(?:s|ped|ping)?\s+(?:\w+\s+){0,2}back)\b/i],
  ["refund_action", /\b(?:refund\w*|reimburs\w*|money back|credit(?:ed)? (?:back|to))\b/i],
  ["exchange_action", /\b(?:exchang\w*|replac\w*)\b/i],
  ["cancel_action", /\bcancel\w*\b/i],
  ["first_party_actor", /\b(?:we|us|our)\b/i],
  ["customer_actor", /\b(?:you|your|customers?)\b/i],
];

function materialRelations(text: string): string {
  return MATERIAL_RELATIONS.filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)
    .join("|");
}

function equivalentMeasuredStatements(a: string, b: string): boolean {
  const ma = measuresOf(a);
  const mb = measuresOf(b);
  if (ma.length === 0 || ma.join("|") !== mb.join("|")) return false;
  if (materialRelations(a) !== materialRelations(b)) return false;
  const wa = contentWordSet(a);
  const wb = contentWordSet(b);
  const shared = [...wa].filter((word) => wb.has(word)).length;
  return shared / Math.max(1, Math.min(wa.size, wb.size)) >= 0.5;
}

function operationalCopyEligible(fact: {
  statement: string;
  provenance: FactConfidence;
  copyEligibility: CopyEligibilityFlag;
}): boolean {
  return (
    fact.copyEligibility === "YES" &&
    isCopyEligibleConfidence(fact.provenance) &&
    !hasEncodingCorruption(fact.statement) &&
    !hasContactDetail(fact.statement)
  );
}

function operationalItems(
  field: OperationalCopyField,
  facts: Array<OperationalFact<string>>,
): OperationalCopyItem[] {
  const out: OperationalCopyItem[] = [];
  for (const fact of facts) {
    if (!operationalCopyEligible(fact)) continue;
    let statement = cleanOperationalStatement(fact.statement);
    if (fact.question && /^(?:yes|no)\b/i.test(statement)) {
      const question = cleanOperationalStatement(fact.question);
      if (hasEncodingCorruption(question) || hasContactDetail(question)) continue;
      statement = `${question} ${statement}`;
    }
    if (statement.split(/\s+/).length < 3) continue;
    if (out.some((item) => isEquivalentOperationalStatement(item, { statement, kind: fact.kind }))) continue;
    out.push({ field, statement, kind: fact.kind, provenance: fact.provenance, sourceUrl: fact.sourceUrl });
  }
  return out;
}

/**
 * Copy-eligible operational evidence (format, returns, shipping). Each item is
 * a verbatim source statement; contact and postal details stay evidence only.
 */
export function copyEligibleOperationalItems(facts: ProductFacts): OperationalCopyItem[] {
  const items: OperationalCopyItem[] = [];
  const format = facts.productFormat;
  if (format && format.value.trim() && operationalCopyEligible(format)) {
    items.push({
      field: "productFormat",
      statement: cleanOperationalStatement(format.statement),
      kind: format.value.trim().toLowerCase(),
      provenance: format.provenance,
      sourceUrl: format.sourceUrl,
    });
  }
  items.push(...operationalItems("returnsInformation", facts.returnsInformation ?? []));
  items.push(...operationalItems("shippingInformation", facts.shippingInformation ?? []));
  return items;
}

export type GenerationFactManifestItem = {
  id: string;
  field: string;
  value: string;
  provenance: FactConfidence | "OPERATOR_IDENTITY";
  sourceUrl: string;
  copyEligible: boolean;
};

export type GenerationFactManifest = {
  items: GenerationFactManifestItem[];
  promptFactNotCopyEligible: number;
};

export function productNameAuthority(facts: ProductFacts): {
  name: string;
  authority: ProductNameAuthority;
  storedProvenance: FactConfidence;
} {
  const name = facts.productName.trim();
  const stored = facts.confidence.productName;
  if (!name || stored === "NOT_FOUND") {
    return { name: "", authority: "NONE", storedProvenance: stored };
  }
  if (stored === "DIRECT_SOURCE") {
    return { name, authority: "DIRECT_SOURCE", storedProvenance: stored };
  }
  if (stored === "MANUAL") {
    return { name, authority: "MANUAL", storedProvenance: stored };
  }
  if (stored === "HEURISTIC_EXTRACTION") {
    return { name, authority: "OPERATOR_IDENTITY", storedProvenance: stored };
  }
  return { name: "", authority: "NONE", storedProvenance: stored };
}

/** Single factual authority for Generation, Grounding, and Page Composition. */
export function getConsumerCopyEligibleFacts(facts: ProductFacts): ConsumerCopyEligibleFacts {
  const identity = productNameAuthority(facts);
  return {
    productName: identity.name,
    productNameAuthority: identity.authority,
    productNameStoredProvenance: identity.storedProvenance,
    description: copyEligibleScalar(facts.description, facts.confidence.description),
    features: copyEligibleList(facts.features, facts.confidence.features),
    ingredientsOrComponents: copyEligibleList(
      facts.ingredientsOrComponents,
      facts.confidence.ingredientsOrComponents,
    ),
    usageInformation: copyEligibleList(facts.usageInformation, facts.confidence.usageInformation),
    cautions: copyEligibleList(facts.cautions, facts.confidence.cautions),
    pricingInformation: copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation),
    guaranteeInformation: copyEligibleScalar(
      facts.guaranteeInformation,
      facts.confidence.guaranteeInformation,
    ),
    manufacturer: copyEligibleScalar(facts.manufacturer, facts.confidence.manufacturer),
    ...operationalEligible(facts),
    sourceUrl: (facts.sourceUrl ?? "").trim(),
  };
}

function operationalEligible(
  facts: ProductFacts,
): Pick<ConsumerCopyEligibleFacts, "productFormat" | "productFormatValue" | "returnsInformation" | "shippingInformation"> {
  const items = copyEligibleOperationalItems(facts);
  const format = items.find((item) => item.field === "productFormat");
  return {
    productFormat: format?.statement ?? "",
    productFormatValue: format?.kind ?? "",
    returnsInformation: items.filter((item) => item.field === "returnsInformation").map((item) => item.statement),
    shippingInformation: items.filter((item) => item.field === "shippingInformation").map((item) => item.statement),
  };
}

function pushManifestValue(
  items: GenerationFactManifestItem[],
  field: string,
  value: string,
  provenance: GenerationFactManifestItem["provenance"],
  sourceUrl: string,
  copyEligible: boolean,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const id = `F${String(items.length + 1).padStart(3, "0")}`;
  items.push({ id, field, value: trimmed, provenance, sourceUrl, copyEligible });
}

/**
 * Diagnostic manifest of every factual value supplied to the generation model.
 * Provenance metadata is internal — never render it as public page copy.
 */
export function buildGenerationFactManifest(facts: ProductFacts): GenerationFactManifest {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const sourceUrl = eligible.sourceUrl;
  const items: GenerationFactManifestItem[] = [];

  if (eligible.productName) {
    const copyEligible =
      eligible.productNameAuthority === "DIRECT_SOURCE" ||
      eligible.productNameAuthority === "MANUAL" ||
      eligible.productNameAuthority === "OPERATOR_IDENTITY";
    pushManifestValue(
      items,
      "productName",
      eligible.productName,
      eligible.productNameAuthority === "OPERATOR_IDENTITY"
        ? "OPERATOR_IDENTITY"
        : eligible.productNameStoredProvenance,
      sourceUrl,
      copyEligible,
    );
  }
  pushManifestValue(
    items,
    "description",
    eligible.description,
    facts.confidence.description,
    sourceUrl,
    isCopyEligibleConfidence(facts.confidence.description),
  );
  for (const feature of eligible.features) {
    pushManifestValue(items, "features", feature, facts.confidence.features, sourceUrl, true);
  }
  for (const ingredient of eligible.ingredientsOrComponents) {
    pushManifestValue(
      items,
      "ingredientsOrComponents",
      ingredient,
      facts.confidence.ingredientsOrComponents,
      sourceUrl,
      true,
    );
  }
  for (const usage of eligible.usageInformation) {
    pushManifestValue(items, "usageInformation", usage, facts.confidence.usageInformation, sourceUrl, true);
  }
  for (const caution of eligible.cautions) {
    pushManifestValue(items, "cautions", caution, facts.confidence.cautions, sourceUrl, true);
  }
  pushManifestValue(
    items,
    "pricingInformation",
    eligible.pricingInformation,
    facts.confidence.pricingInformation,
    sourceUrl,
    true,
  );
  pushManifestValue(
    items,
    "guaranteeInformation",
    eligible.guaranteeInformation,
    facts.confidence.guaranteeInformation,
    sourceUrl,
    true,
  );
  pushManifestValue(
    items,
    "manufacturer",
    eligible.manufacturer,
    facts.confidence.manufacturer,
    sourceUrl,
    true,
  );
  for (const item of copyEligibleOperationalItems(facts)) {
    pushManifestValue(items, item.field, item.statement, item.provenance, item.sourceUrl || sourceUrl, true);
  }

  return {
    items,
    promptFactNotCopyEligible: items.filter((item) => !item.copyEligible).length,
  };
}

/** Prompt-visible evidence catalog. IDs are internal; never render them as page copy. */
export function formatEvidenceManifestForPrompt(manifest: GenerationFactManifest): string {
  const eligible = manifest.items.filter((item) => item.copyEligible);
  const lines = [
    "EVIDENCE MANIFEST — copy-eligible values. CODE assigns IDs to slots. Do not return evidenceIds.",
    "Do not expose evidence IDs, provenance, or source metadata in consumer copy.",
  ];
  if (eligible.length === 0) {
    lines.push("No copy-eligible evidence IDs.");
    return lines.join("\n");
  }
  for (const item of eligible) {
    lines.push(`${item.id} FIELD=${item.field} VALUE=${item.value}`);
  }
  return lines.join("\n");
}

/** Shared authority for Generation, Grounding, Page Composition, and Publication. */
export function copyEligibleScalar(value: string | undefined, confidence: FactConfidence): string {
  if (!isCopyEligibleConfidence(confidence)) return "";
  return (value ?? "").trim();
}

export function copyEligibleList(value: string[] | undefined, confidence: FactConfidence): string[] {
  if (!isCopyEligibleConfidence(confidence)) return [];
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

export function copyEligibleJoined(value: string | string[] | undefined, confidence: FactConfidence): string {
  if (Array.isArray(value)) return copyEligibleList(value, confidence).join(". ");
  return copyEligibleScalar(value, confidence);
}

export function isCopyEligibleImageProvenance(provenance: string | undefined): boolean {
  return provenance === "DIRECT_SOURCE" || provenance === "MANUAL";
}

/**
 * Factual context for the model. Missing fields are labeled NOT_FOUND so
 * they are omitted, never invented from training memory.
 * HEURISTIC / AI-classified values stay in ProductFacts storage but are not
 * emitted as copy-eligible SOURCE FACTS.
 * FAQ / raw source / SERP / research snippets are not prompt-visible facts.
 */
export function formatFactsForPrompt(
  facts: ProductFacts,
  overrides?: {
    description?: string;
    features?: string[];
    evidenceManifest?: string;
  },
): string {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const identityLine = eligible.productName
    ? eligible.productNameAuthority === "OPERATOR_IDENTITY"
      ? `Product identity (name the product only; not evidence for other fields): ${eligible.productName}`
      : `Product name [${eligible.productNameStoredProvenance}]: ${eligible.productName}`
    : "Product name: NOT_FOUND — omit a specific product name.";

  const absentSubjects: string[] = [];
  if (!eligible.manufacturer) {
    absentSubjects.push("manufacturer/company identity, facility, location, GMP/FDA/certification");
  }
  if (!eligible.pricingInformation) absentSubjects.push("pricing, discounts, cost");
  if (!eligible.guaranteeInformation) absentSubjects.push("guarantee, refund duration");
  if (eligible.cautions.length === 0) absentSubjects.push("cautions, medical advice, consult-a-doctor language");
  if (eligible.usageInformation.length === 0) absentSubjects.push("dosage, servings, directions");
  if (eligible.ingredientsOrComponents.length === 0) {
    absentSubjects.push("ingredient names, allergen/GMO/BPA claims");
  }

  const linesOut: string[] = [
    "PRODUCT FACTS — use ONLY copy-eligible fields in this block as factual context.",
    "COPY-ELIGIBLE: DIRECT_SOURCE and MANUAL only.",
    "NOT COPY-ELIGIBLE: HEURISTIC_EXTRACTION, AI_SOURCE_CLASSIFICATION, NOT_FOUND — omit those topics; do not invent replacements.",
    "FAQ snippets, raw source snippets, SERP titles, and research observations are not copy evidence. Do not paraphrase them.",
    "You may only make product-specific factual statements supported by the supplied eligible facts.",
    "If a field is absent, do not infer it.",
    "Absence of manufacturer, price, dosage, ingredients, guarantee, cautions, certification, medical category, facility or location means you must omit that subject.",
    "Do not fill gaps from memory. Do not treat generated copy as evidence.",
    "Do not use world knowledge, category encyclopedias, typical industry ranges, safety advice, or research language that is not in this block.",
    "Do not recombine numbers, durations, or nouns from different fields into a new claim.",
    "DIRECT_SOURCE means the source/seller stated this text. It is NOT independent scientific verification.",
    "Health, efficacy, clinical, or scientific seller claims must be omitted or clearly attributed — do not restate them as editorial facts.",
    `Origin: ${facts.origin}`,
    `Import quality: ${facts.importQuality}`,
    identityLine,
    "",
    overrides?.evidenceManifest ?? formatEvidenceManifestForPrompt(buildGenerationFactManifest(facts)),
  ];

  if (facts.sourceUrl) {
    linesOut.push(`Source URL (context only, not a citation to invent from): ${facts.sourceUrl}`);
  }

  const descriptionValue = overrides?.description ?? eligible.description;
  const featureValues = overrides?.features ?? eligible.features;
  linesOut.push(fieldLine("Description", descriptionValue, facts.confidence.description, facts.description));
  linesOut.push(listLine("Features", featureValues, facts.confidence.features, facts.features));
  linesOut.push(
    listLine(
      "Ingredients / components",
      eligible.ingredientsOrComponents,
      facts.confidence.ingredientsOrComponents,
      facts.ingredientsOrComponents,
    ),
  );
  linesOut.push(
    listLine(
      "Usage / how it works / directions",
      eligible.usageInformation,
      facts.confidence.usageInformation,
      facts.usageInformation,
    ),
  );
  linesOut.push(listLine("Warnings / cautions", eligible.cautions, facts.confidence.cautions, facts.cautions));
  linesOut.push(
    fieldLine("Pricing", eligible.pricingInformation, facts.confidence.pricingInformation, facts.pricingInformation),
  );
  linesOut.push(
    fieldLine(
      "Guarantee",
      eligible.guaranteeInformation,
      facts.confidence.guaranteeInformation,
      facts.guaranteeInformation,
    ),
  );
  linesOut.push(fieldLine("Manufacturer", eligible.manufacturer, facts.confidence.manufacturer, facts.manufacturer));

  const missing = (Object.entries(facts.confidence) as Array<[FactField, FactConfidence]>)
    .filter(([, c]) => c === "NOT_FOUND")
    .map(([field]) => field);
  if (missing.length > 0) {
    linesOut.push(`NOT_FOUND (omit these topics; do not invent): ${missing.join(", ")}`);
  }
  if (absentSubjects.length > 0) {
    linesOut.push(`ABSENT SUBJECTS (do not hint, infer, or invent): ${absentSubjects.join("; ")}.`);
  }

  return linesOut.join("\n");
}

function fieldLine(
  label: string,
  eligibleValue: string,
  confidence: FactConfidence,
  storedValue?: string,
): string {
  if (confidence === "NOT_FOUND" || (!eligibleValue && !(storedValue ?? "").trim())) {
    return `${label}: NOT_FOUND — omit this topic.`;
  }
  if (!isCopyEligibleConfidence(confidence) || !eligibleValue) {
    return `${label}: NOT COPY-ELIGIBLE (${confidence}) — stored for operator review; omit this topic from generated copy.`;
  }
  return `${label} [${confidence}]: ${eligibleValue}`;
}

function listLine(
  label: string,
  eligibleValues: string[],
  confidence: FactConfidence,
  storedValues?: string[],
): string {
  const storedCount = (storedValues ?? []).map((item) => item.trim()).filter(Boolean).length;
  if (confidence === "NOT_FOUND" || (eligibleValues.length === 0 && storedCount === 0)) {
    return `${label}: NOT_FOUND — omit this section.`;
  }
  if (!isCopyEligibleConfidence(confidence) || eligibleValues.length === 0) {
    return `${label}: NOT COPY-ELIGIBLE (${confidence}) — stored for operator review; omit this section from generated copy.`;
  }
  return `${label} [${confidence}]:\n${eligibleValues.map((v) => `- ${v}`).join("\n")}`;
}

export function listAsTextarea(values: string[]): string {
  return values.join("\n");
}

export function snippetsForField(facts: ProductFacts, field: string): SourceFact[] {
  return facts.sourceSnippets.filter((s) => s.field === field);
}
