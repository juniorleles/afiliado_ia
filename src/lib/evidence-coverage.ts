/**
 * Evidence coverage — diagnostic layer over extraction.
 *
 * Answers one question: of the meaningful factual statements the source page
 * actually publishes, how many reached copy-eligible ProductFacts, and how many
 * were lost on the way? A short landing page is correct when the source is
 * exhausted and a defect when extraction dropped usable evidence.
 *
 * Read-only: never mutates ProductFacts, campaigns, or provenance.
 */
import { lintSourceStatement } from "@/lib/policy-linter";
import {
  getConsumerCopyEligibleFacts,
  isCopyEligibleConfidence,
  type FactField,
  type ProductFacts,
} from "@/lib/product-facts";
import { createGenerationPlan, type GenerationTopic } from "@/lib/ai/generation-plan";
import {
  isFactualGuarantee,
  isFeatureStatement,
  isProductAttributeChip,
  isPromotionalHeading,
  isPromotionalOrCta,
  isQuestionHeading,
  isSectionLabel,
  isUsageInstruction,
  looksLikeIngredientName,
} from "@/lib/import-heuristics";
import { isHealthEfficacyStatement } from "@/lib/ingredient-context";
import { operationalExclusionReason } from "@/lib/operational-evidence";

export const SOURCE_UNIT_TYPES = ["HEADING", "PARAGRAPH", "LIST_ITEM", "TABLE_CELL", "CHIP", "FAQ_ANSWER"] as const;
export type SourceUnitType = (typeof SOURCE_UNIT_TYPES)[number];

export const SOURCE_UNIT_STATUSES = [
  "CAPTURED_COPY_ELIGIBLE",
  "CAPTURED_NOT_COPY_ELIGIBLE",
  "MISCLASSIFIED",
  "UNMAPPED",
  "DUPLICATE",
  "PROMOTIONAL_ONLY",
  "UNSAFE_OR_UNSUPPORTED",
] as const;
export type SourceUnitStatus = (typeof SOURCE_UNIT_STATUSES)[number];

/** Audit categories. A category is only "supported" when the source states it. */
export const INFORMATION_TOPICS = [
  "identity",
  "description",
  "features",
  "ingredients",
  "ingredient_context",
  "usage",
  "cautions",
  "guarantee",
  "returns_mechanics",
  "shipping",
  "pricing",
  "manufacturer",
  "product_format",
  "seller_mechanism",
  "seller_purpose",
  "support_contact",
  "legal_disclaimer",
  "social_proof",
  "third_party_research",
] as const;
export type InformationTopic = (typeof INFORMATION_TOPICS)[number];

/**
 * Role of the page a unit came from. Legal and support pages exist on every
 * storefront and describe the site, not the product.
 */
export const SOURCE_PAGE_ROLES = [
  "PRIMARY",
  "RETURNS_POLICY",
  "SHIPPING_POLICY",
  "LEGAL",
  "SUPPORT",
  "RESEARCH_REFERENCES",
  "OTHER",
] as const;
export type SourcePageRole = (typeof SOURCE_PAGE_ROLES)[number];

export type SourceUnitInput = {
  id: string;
  text: string;
  location: string;
  type: SourceUnitType;
  pageRole?: SourcePageRole;
  /** False for material the importer never requests, which separates reach from mapping. */
  fetchedByImporter?: boolean;
};

export type EvidenceMappingField =
  | FactField
  | "ingredientContext"
  | "returnsInformation"
  | "shippingInformation"
  | "productFormat";

export type SourceUnit = SourceUnitInput & {
  topic: InformationTopic | "unclassified";
  mapping: EvidenceMappingField | null;
  status: SourceUnitStatus;
  copyEligible: boolean;
  /** Could this statement carry a product fact at all? Drives the coverage denominator. */
  productFactCandidate: boolean;
  safetyFindings: string[];
  reason: string;
};

export type EvidenceCoverage = {
  sourceUnitsCollected: number;
  sourceMeaningfulUnits: number;
  capturedUnits: number;
  copyEligibleUnits: number;
  lostEligibleUnits: number;
  evidenceCoverage: number;
  informationTopicsSupported: InformationTopic[];
  informationTopicsCopyEligible: InformationTopic[];
  informationTopicsClosed: GenerationTopic[];
  evidenceExhausted: boolean;
  units: SourceUnit[];
};

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
const fold = (value: string) =>
  collapse(value)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9'%$.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Boilerplate that is on every page of a site and describes no product fact. */
const LEGAL_BOILERPLATE =
  /\b(privacy policy|terms of use|all rights reserved|cookie|registered trademark|clickbank|not intended to (diagnose|treat)|have not been evaluated by the food and drug administration|as is.{0,12}and.{0,12}as available|consult (your|a qualified) (physician|medical))\b/i;

const SUPPORT_CONTACT =
  /(\b(email support|order support|product support|toll free|customer support|contact us|contact (?:the )?vendor|contact form|self service|support team|[\w.+-]+@[\w-]+\.\w+|\+?\d[\d\s()-]{7,})\b|\[email[^\]]{0,8}protected\])/i;

const SOCIAL_PROOF =
  /\b(verified purchase|real users|life[- ]changing|reviews?!?|rating|customers say|testimonial|\d{2,3},\d{3}\s+reviews)\b/i;

/** A quoted first-person statement, or a "Name - City" byline under one, is a testimonial. */
const TESTIMONIAL = /^["“”']|^[A-Z][a-z]+ [A-Z][a-z]+\s*[-–—]\s*[A-Z]/;

/** Ingredient names are short noun phrases; anything with narration is a sentence fragment. */
const NARRATION = /\b(we|our|you|your|why|how|that|this|it|there)\b/i;

const RESEARCH_CITATION =
  /\b(doi|journal|healthline|nature|frontiers in|medium\.com|livestrong|selfdecode|nutraingredients|et al\.|\b19\d\d\b|\b20[0-2]\d\b.{0,12}(january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

const PRICING_OR_OFFER =
  /(\$\s*\d|\brrp\b|\btoday:\s*free\b|\bbottles?\b.{0,16}\b(order|free|get)\b|\bday supply\b|\bbest value\b|\bmost popular\b|\bbonus\b|\bwhile stocks? last\b|\bfree shipping\b|\bshipping fee\b)/i;

const SHIPPING_FACT =
  /\b(shipping|delivery|deliver|tracking|working days|carrier|dispatch|ships?\b)/i;

const RETURNS_MECHANICS =
  /\b(refund|return(?:ed|ing|s)?\b|packing slip|money[\s-]?back|restocking)\b/i;

const MANUFACTURER_FACT =
  /\b(manufactured (in|by)|manufacturer|made in|facility|gmp|fda[- ]approved facility|laborator)\b/i;

const PRODUCT_FORMAT =
  /\b(tablet|capsule|candy|chewable|softgel|powder|drops?|gummy|gummies|bottle of \d+|\d+\s*(?:mg|g|ml|count))\b/i;

const SELLER_MECHANISM =
  /\b(how (it|this) works|repopulate|colonis|coloniz|works by|targets your|balance of|microbiome)\b/i;

const SELLER_PURPOSE =
  /\b(specially designed|designed (for|to)|is a\b|is an\b|is the\b|formulated|blend of)\b/i;

const INGREDIENT_CONTEXT_RELATION =
  /\b(supports?|helps?|maintains?|promotes?|is a natural|targets?|provides?)\b/i;

/** Statement-level safety read, reusing the campaign claim patterns. */
function safetyFindings(text: string): string[] {
  return lintSourceStatement(text).map(
    (finding) => `${finding.ruleId}:${finding.blocking ? "BLOCKING" : "WARN"}`,
  );
}

const wordCount = (value: string) => collapse(value).split(/\s+/).filter(Boolean).length;
const hasMeasuredValue = (value: string) =>
  /(\$\s*\d|\d+\s*(?:-\s*\d+\s*)?(?:hours?|days?|weeks?|months?|working days|mg|g|ml|count|billion))/i.test(value);

/** A statement that became a fact is described by the field that accepted it. */
const TOPIC_BY_FIELD: Record<EvidenceMappingField, InformationTopic> = {
  productName: "identity",
  description: "description",
  features: "features",
  ingredientsOrComponents: "ingredients",
  usageInformation: "usage",
  cautions: "cautions",
  pricingInformation: "pricing",
  guaranteeInformation: "guarantee",
  manufacturer: "manufacturer",
  ingredientContext: "ingredient_context",
  returnsInformation: "returns_mechanics",
  shippingInformation: "shipping",
  productFormat: "product_format",
};

function topicOf(
  text: string,
  productName: string,
  components: string[],
  role: SourcePageRole,
): InformationTopic | "unclassified" {
  const t = collapse(text);
  if (!t) return "unclassified";
  if (RESEARCH_CITATION.test(t) || role === "RESEARCH_REFERENCES") return "third_party_research";
  if (LEGAL_BOILERPLATE.test(t) || role === "LEGAL") return "legal_disclaimer";
  if (SOCIAL_PROOF.test(t) || TESTIMONIAL.test(t)) return "social_proof";
  if (SUPPORT_CONTACT.test(t)) return "support_contact";
  if (isFactualGuarantee(t)) return "guarantee";
  if (RETURNS_MECHANICS.test(t)) return "returns_mechanics";
  if (SHIPPING_FACT.test(t) || role === "SHIPPING_POLICY") return "shipping";
  if (PRICING_OR_OFFER.test(t)) return "pricing";
  if (MANUFACTURER_FACT.test(t)) return "manufacturer";
  if (isUsageInstruction(t)) return "usage";
  if (/\b(do not|consult|prescription|pregnan|medical condition|side effects?)\b/i.test(t)) return "cautions";
  const words = wordCount(t);
  // A component name is a short noun phrase; once a statement says what the
  // component does, it is context about the component and not the name.
  if (words >= 2 && words <= 3 && looksLikeIngredientName(t) && !NARRATION.test(t)) return "ingredients";
  // Context names a component and says what it does. A sentence that defines
  // the product itself ("... is a ...") is positioning, not component context.
  const namesComponent = components.some((item) => item.trim().length > 2 && fold(t).includes(fold(item)));
  const opensWithRelation = /^[A-Za-z]+(?:s|es)\s/.test(t) && !/^(is|are|was|were|has|have)\b/i.test(t);
  if (words >= 3 && words <= 14 && (namesComponent || opensWithRelation) && !/\b(is|are|was|were)\b/i.test(t)) {
    return "ingredient_context";
  }
  if (PRODUCT_FORMAT.test(t)) return "product_format";
  if (SELLER_MECHANISM.test(t)) return "seller_mechanism";
  if (productName && fold(t).includes(fold(productName)) && SELLER_PURPOSE.test(t)) return "seller_purpose";
  if (role === "RETURNS_POLICY") return "returns_mechanics";
  if (words >= 8 && isFeatureStatement(t)) return "description";
  return "unclassified";
}

/**
 * Could this statement carry a product fact at all?
 *
 * Section labels, questions, table headers, offer boxes, testimonials, legal
 * boilerplate and support details are all real page content, but no product
 * fact field can ever accept them, so they belong in the inventory and not in
 * the coverage denominator. Counting them would report extraction loss where
 * the engine is behaving correctly.
 */
function isProductFactCandidate(unit: SourceUnit): boolean {
  const t = unit.text;
  if (t.length < 3) return false;
  if (/@font-face|function\s+\w*\s*\(|var\s+\w+\s*=|<\/?\w+>|\{[^}]*:[^}]*\}/i.test(t)) return false;
  if (unit.status === "DUPLICATE") return false;
  // A statement a fact field already accepted is a candidate by construction,
  // however short it is: attribute labels carry the characteristic in the label.
  if (unit.mapping) return true;
  // Emphasis spans are mid-sentence fragments unless extraction used them as a value.
  if (unit.type === "CHIP") return false;
  if (isQuestionHeading(t)) return false;
  // A bare label names a region of the page; the statement under it carries the fact.
  if (wordCount(t) <= 3 && !hasMeasuredValue(t)) return false;
  if (unit.type === "TABLE_CELL" && !hasMeasuredValue(t)) return false;
  if (unit.type === "HEADING" && wordCount(t) <= 6 && !hasMeasuredValue(t)) return false;
  // Page navigation ("see below", "here is the list") points at facts; it states none.
  if (operationalExclusionReason(t) === "NAVIGATIONAL") return false;
  switch (unit.topic) {
    case "legal_disclaimer":
    case "social_proof":
    case "third_party_research":
    case "support_contact":
    case "unclassified":
      return false;
    case "pricing":
      // Prices are offer terms, not product characteristics.
      return false;
    default:
      return true;
  }
}

type FieldValue = { field: EvidenceMappingField; value: string; copyEligible: boolean };

function factValues(facts: ProductFacts): FieldValue[] {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const rows: FieldValue[] = [];
  const push = (field: EvidenceMappingField, values: Array<string | undefined>, copyEligible: boolean) => {
    for (const value of values) {
      const trimmed = (value ?? "").trim();
      if (trimmed) rows.push({ field, value: trimmed, copyEligible });
    }
  };
  push("productName", [facts.productName], isCopyEligibleConfidence(facts.confidence.productName));
  push("description", [facts.description], isCopyEligibleConfidence(facts.confidence.description));
  push("features", facts.features, isCopyEligibleConfidence(facts.confidence.features));
  push("ingredientsOrComponents", facts.ingredientsOrComponents, isCopyEligibleConfidence(facts.confidence.ingredientsOrComponents));
  push("usageInformation", facts.usageInformation, isCopyEligibleConfidence(facts.confidence.usageInformation));
  push("cautions", facts.cautions, isCopyEligibleConfidence(facts.confidence.cautions));
  push("pricingInformation", [facts.pricingInformation], isCopyEligibleConfidence(facts.confidence.pricingInformation));
  push("guaranteeInformation", [facts.guaranteeInformation], isCopyEligibleConfidence(facts.confidence.guaranteeInformation));
  push("manufacturer", [facts.manufacturer], isCopyEligibleConfidence(facts.confidence.manufacturer));
  for (const entry of facts.ingredientContext ?? []) {
    push("ingredientContext", [entry.statement], entry.copyEligibility === "YES");
  }
  for (const entry of facts.returnsInformation ?? []) {
    push("returnsInformation", [entry.statement], entry.copyEligibility === "YES");
  }
  for (const entry of facts.shippingInformation ?? []) {
    push("shippingInformation", [entry.statement], entry.copyEligibility === "YES");
  }
  if (facts.productFormat) {
    push(
      "productFormat",
      [facts.productFormat.statement, facts.productFormat.value],
      facts.productFormat.copyEligibility === "YES",
    );
  }
  void eligible;
  return rows;
}

function mappedField(text: string, values: FieldValue[]): FieldValue | null {
  const needle = fold(text);
  if (!needle) return null;
  for (const row of values) {
    const hay = fold(row.value);
    if (!hay) continue;
    if (hay === needle) return row;
    if (needle.length >= 12 && hay.includes(needle)) return row;
    // A long statement that merely mentions a stored value is a different
    // statement, not the same evidence: citations name ingredients too. A whole
    // sentence quoted from inside the statement is the same evidence.
    if (hay.length >= 12 && needle.includes(hay)) {
      if (needle.length <= hay.length * 1.6) return row;
      if (/[.!?]$/.test(collapse(row.value))) return row;
    }
    // A table cell carrying a value is part of the row statement built from it.
    if (
      (row.field === "shippingInformation" || row.field === "returnsInformation") &&
      needle.length >= 3 &&
      hasMeasuredValue(text) &&
      new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(hay)
    ) {
      return row;
    }
    if (
      row.field === "productFormat" &&
      hay.length >= 4 &&
      hay.length <= 12 &&
      new RegExp(`\\b${hay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(needle) &&
      PRODUCT_FORMAT.test(text)
    ) {
      return row;
    }
  }
  return null;
}

/** Fields whose semantics do not accept the shape of this text. */
function misclassified(text: string, field: EvidenceMappingField): boolean {
  const t = collapse(text);
  if (field === "ingredientsOrComponents") return !looksLikeIngredientName(t);
  if (field === "usageInformation") return !isUsageInstruction(t);
  if (field === "guaranteeInformation") return !isFactualGuarantee(t);
  return false;
}

export function classifySourceUnits(
  inputs: SourceUnitInput[],
  facts: ProductFacts,
  snippetTexts: string[] = facts.sourceSnippets.map((snippet) => snippet.text),
): SourceUnit[] {
  const values = factValues(facts);
  const snippets = snippetTexts.map(fold).filter(Boolean);
  const seen = new Map<string, string>();
  const out: SourceUnit[] = [];

  for (const input of inputs) {
    const text = collapse(input.text);
    const key = fold(text);
    const findings = safetyFindings(text);
    const mapped = mappedField(text, values);
    const topic = mapped
      ? TOPIC_BY_FIELD[mapped.field]
      : topicOf(text, facts.productName, facts.ingredientsOrComponents, input.pageRole ?? "PRIMARY");
    const duplicateOf = seen.get(key);
    if (!duplicateOf) seen.set(key, input.id);

    let status: SourceUnitStatus;
    let reason: string;
    if (duplicateOf) {
      status = "DUPLICATE";
      reason = `same statement as ${duplicateOf}`;
    } else if (mapped && misclassified(text, mapped.field)) {
      status = "MISCLASSIFIED";
      reason = `stored in ${mapped.field}, which does not accept this statement shape`;
    } else if (mapped) {
      status = mapped.copyEligible ? "CAPTURED_COPY_ELIGIBLE" : "CAPTURED_NOT_COPY_ELIGIBLE";
      reason = `matches ProductFacts.${mapped.field}`;
    } else if (snippets.some((snippet) => snippet === key || (key.length >= 12 && snippet.includes(key)))) {
      status = "CAPTURED_NOT_COPY_ELIGIBLE";
      reason = "stored as a source snippet only";
    } else if (isPromotionalOrCta(text) || isPromotionalHeading(text) || topic === "pricing") {
      status = "PROMOTIONAL_ONLY";
      reason = "offer, scarcity or call-to-action content";
    } else if (findings.length > 0 || topic === "social_proof" || topic === "third_party_research") {
      status = "UNSAFE_OR_UNSUPPORTED";
      reason = findings.length > 0 ? `policy findings ${findings.join(", ")}` : `${topic} content`;
    } else if (isHealthEfficacyStatement(text)) {
      status = "UNSAFE_OR_UNSUPPORTED";
      reason = "seller health-efficacy statement; withheld by health policy";
    } else if (operationalExclusionReason(text)) {
      status = "UNSAFE_OR_UNSUPPORTED";
      reason = `withheld: ${operationalExclusionReason(text)} would state more than the source commits to`;
    } else {
      status = "UNMAPPED";
      reason = "no ProductFacts field received this statement";
    }

    const unit: SourceUnit = {
      ...input,
      text,
      topic,
      mapping: mapped?.field ?? null,
      status,
      copyEligible: status === "CAPTURED_COPY_ELIGIBLE",
      productFactCandidate: false,
      safetyFindings: findings,
      reason,
    };
    unit.productFactCandidate = isProductFactCandidate(unit);
    out.push(unit);
  }
  return out;
}

/**
 * A lost unit is evidence the source states, that no field received, that is not
 * promotional, duplicated, legally boilerplate or policy-flagged. Only those are
 * engine defects; everything else is a correct exclusion.
 */
export function isLostEligibleUnit(unit: SourceUnit): boolean {
  if (!unit.productFactCandidate) return false;
  if (unit.status !== "UNMAPPED" && unit.status !== "MISCLASSIFIED") return false;
  // Statements the policy layer flags are correctly withheld, not lost.
  return unit.safetyFindings.length === 0;
}

export const TOPIC_GAP_CAUSES = [
  "NONE",
  "NO_SOURCE_EVIDENCE",
  "GENERIC_EXTRACTION_DEFECT",
  "GENERIC_MAPPING_DEFECT",
  "GENERIC_CLASSIFICATION_DEFECT",
  "INTENTIONAL_SAFETY_EXCLUSION",
  "INTENTIONAL_PROMOTIONAL_EXCLUSION",
  "AMBIGUOUS_AUTHORITY",
  "DUPLICATE_INFORMATION",
] as const;
export type TopicGapCause = (typeof TOPIC_GAP_CAUSES)[number];

/** Topics the ProductFacts schema has a field for. The rest have nowhere to land. */
const TOPIC_HAS_FIELD = new Set<InformationTopic>([
  "identity",
  "description",
  "features",
  "ingredients",
  "ingredient_context",
  "usage",
  "cautions",
  "pricing",
  "guarantee",
  "manufacturer",
  "returns_mechanics",
  "shipping",
  "product_format",
]);

export type TopicGap = {
  topic: InformationTopic;
  sourceUnits: number;
  capturedCopyEligible: number;
  capturedNotCopyEligible: number;
  lostEligible: number;
  schemaField: boolean;
  cause: TopicGapCause;
};

/**
 * Why a topic is not copy-eligible. Order matters: a correct exclusion always
 * outranks a defect, so a topic is never called broken because more copy would
 * look good on the page.
 */
export function classifyTopicGap(topic: InformationTopic, units: SourceUnit[]): TopicGap {
  const schemaField = TOPIC_HAS_FIELD.has(topic);
  const eligible = units.filter((unit) => unit.status === "CAPTURED_COPY_ELIGIBLE");
  const lower = units.filter((unit) => unit.status === "CAPTURED_NOT_COPY_ELIGIBLE");
  const lost = units.filter(isLostEligibleUnit);
  const candidates = units.filter((unit) => unit.productFactCandidate);
  const base = {
    topic,
    sourceUnits: candidates.length,
    capturedCopyEligible: eligible.length,
    capturedNotCopyEligible: lower.length,
    lostEligible: lost.length,
    schemaField,
  };
  const cause = ((): TopicGapCause => {
    if (candidates.length === 0) {
      if (units.length === 0) return "NO_SOURCE_EVIDENCE";
      if (units.every((unit) => unit.status === "DUPLICATE")) return "DUPLICATE_INFORMATION";
      if (units.some((unit) => unit.status === "PROMOTIONAL_ONLY")) return "INTENTIONAL_PROMOTIONAL_EXCLUSION";
      if (units.some((unit) => unit.status === "UNSAFE_OR_UNSUPPORTED")) return "INTENTIONAL_SAFETY_EXCLUSION";
      return "NO_SOURCE_EVIDENCE";
    }
    if (eligible.length > 0) return "NONE";
    if (lost.length === 0) {
      if (candidates.some((unit) => unit.status === "UNSAFE_OR_UNSUPPORTED")) return "INTENTIONAL_SAFETY_EXCLUSION";
      if (candidates.some((unit) => unit.status === "PROMOTIONAL_ONLY")) return "INTENTIONAL_PROMOTIONAL_EXCLUSION";
    }
    // Evidence the importer never requested was never given a chance to map.
    if (lost.length > 0 && lost.every((unit) => unit.fetchedByImporter === false)) return "GENERIC_EXTRACTION_DEFECT";
    // Captured at a confidence the copy layer refuses: an authority decision.
    if (lower.length > 0) return "AMBIGUOUS_AUTHORITY";
    if (!schemaField) return "GENERIC_MAPPING_DEFECT";
    return "GENERIC_CLASSIFICATION_DEFECT";
  })();
  return { ...base, cause };
}

export function topicGaps(coverage: EvidenceCoverage): TopicGap[] {
  const byTopic = new Map<InformationTopic, SourceUnit[]>();
  for (const unit of coverage.units) {
    if (unit.topic === "unclassified") continue;
    const list = byTopic.get(unit.topic) ?? [];
    list.push(unit);
    byTopic.set(unit.topic, list);
  }
  return INFORMATION_TOPICS.map((topic) => classifyTopicGap(topic, byTopic.get(topic) ?? []));
}

export function evaluateEvidenceCoverage(inputs: SourceUnitInput[], facts: ProductFacts): EvidenceCoverage {
  const all = classifySourceUnits(inputs, facts);
  const candidates = all.filter((unit) => unit.productFactCandidate);
  const captured = candidates.filter(
    (unit) => unit.status === "CAPTURED_COPY_ELIGIBLE" || unit.status === "CAPTURED_NOT_COPY_ELIGIBLE",
  );
  const copyEligible = candidates.filter((unit) => unit.status === "CAPTURED_COPY_ELIGIBLE");
  const lost = candidates.filter(isLostEligibleUnit);
  const supported = new Set<InformationTopic>();
  const eligibleTopics = new Set<InformationTopic>();
  for (const unit of candidates) {
    if (unit.topic === "unclassified") continue;
    supported.add(unit.topic);
    if (unit.status === "CAPTURED_COPY_ELIGIBLE") eligibleTopics.add(unit.topic);
  }
  const denominator = candidates.length || 1;
  return {
    sourceUnitsCollected: all.length,
    sourceMeaningfulUnits: candidates.length,
    capturedUnits: captured.length,
    copyEligibleUnits: copyEligible.length,
    lostEligibleUnits: lost.length,
    evidenceCoverage: Number((captured.length / denominator).toFixed(4)),
    informationTopicsSupported: [...supported].sort(),
    informationTopicsCopyEligible: [...eligibleTopics].sort(),
    informationTopicsClosed: createGenerationPlan(facts).closedTopics,
    evidenceExhausted: lost.length === 0,
    units: all,
  };
}
