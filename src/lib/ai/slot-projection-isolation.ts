/**
 * SLOT_PROJECTION_ISOLATION_V1
 *
 * MODEL slots receive only claims in their semantic domain.
 * Dedicated open fields own their topic. Raw ProductFacts are unchanged.
 * THIN generation does not use the pre-model assertion.
 */

import type { ClaimClass, ClaimProjection, ClaimUnit } from "@/lib/ai/claim-projection";
import {
  guaranteeReferenceSpans,
  RETURNS_PROCEDURE_SOURCE,
  SHIPPING_TOPIC_SOURCE,
  temporalDescriptionSpans,
  usageInstructionSpans,
  type GenerationTopic,
  GENERATION_TOPICS,
} from "@/lib/ai/generation-plan";
import { hasCompositionPromotionLanguage } from "@/lib/ai/ingredient-claims";
import {
  OPERATIONAL_EVIDENCE_FIELDS,
  OPERATIONAL_TOPIC_FAMILY,
  operationalManufacturerAssertions,
  operationalPricingAssertions,
} from "@/lib/ai/operational-context";

export type SlotIsolationView = {
  slotId: string;
  topic: GenerationTopic;
  semanticAuthority: string;
  evidence: Array<{ id: string; field: string; value: string }>;
};

export type SemanticSlotAuthority =
  | "IDENTITY"
  | "DESCRIPTION"
  | "FEATURE_DESCRIPTION"
  | "INGREDIENTS"
  | "USAGE"
  | "CAUTIONS"
  | "PRICING"
  | "GUARANTEE"
  | "MANUFACTURER"
  | "PRODUCT_FORMAT"
  | "RETURNS"
  | "SHIPPING";

export type SlotProjectionViolation = {
  slotId: string;
  code: "SLOT_PROJECTION_AUTHORITY_VIOLATION";
  authorizedTopics: GenerationTopic[];
  visibleTopics: GenerationTopic[];
  projectedSource: string;
};

const CLASSES_FOR_AUTHORITY: Record<SemanticSlotAuthority, ClaimClass[]> = {
  IDENTITY: ["IDENTITY"],
  DESCRIPTION: ["DESCRIPTION", "GENERIC_INGREDIENT_REFERENCE", "ANTIOXIDANT_REFERENCE"],
  FEATURE_DESCRIPTION: ["FEATURE_DESCRIPTION", "GENERIC_INGREDIENT_REFERENCE", "ANTIOXIDANT_REFERENCE"],
  INGREDIENTS: ["INGREDIENT_COMPOSITION", "GENERIC_INGREDIENT_REFERENCE"],
  USAGE: ["USAGE_INSTRUCTION", "TEMPORAL_DESCRIPTION"],
  CAUTIONS: ["CAUTION"],
  PRICING: ["PRICING"],
  GUARANTEE: ["GUARANTEE", "GUARANTEE_REFERENCE"],
  MANUFACTURER: ["MANUFACTURER"],
  PRODUCT_FORMAT: ["PRODUCT_FORMAT"],
  RETURNS: ["RETURNS"],
  SHIPPING: ["SHIPPING"],
};

export function classesForSlotAuthority(authority: SemanticSlotAuthority): ClaimClass[] {
  return CLASSES_FOR_AUTHORITY[authority];
}

export function authorizedTopicsForSlot(slot: SlotIsolationView): GenerationTopic[] {
  return [slot.topic];
}

export function forbiddenTopicsForSlot(slot: SlotIsolationView): GenerationTopic[] {
  const allowed = new Set(authorizedTopicsForSlot(slot));
  return GENERATION_TOPICS.filter((topic) => !allowed.has(topic));
}

export function authorizedClaimsForSlot(
  projection: ClaimProjection,
  evidenceIds: string[],
  authority: SemanticSlotAuthority,
): ClaimUnit[] {
  const allowed = new Set(classesForSlotAuthority(authority));
  const idSet = new Set(evidenceIds);
  return projection.authorized.filter((claim) => idSet.has(claim.evidenceId) && allowed.has(claim.claimClass));
}

export function authorizedTextForSlot(
  projection: ClaimProjection,
  evidenceIds: string[],
  authority: SemanticSlotAuthority,
): string {
  return authorizedClaimsForSlot(projection, evidenceIds, authority)
    .map((claim) => claim.generationText)
    .filter(Boolean)
    .join(" ");
}

const FIELD_FOR_AUTHORITY: Record<SemanticSlotAuthority, string> = {
  IDENTITY: "productName",
  DESCRIPTION: "description",
  FEATURE_DESCRIPTION: "features",
  INGREDIENTS: "ingredientsOrComponents",
  USAGE: "usageInformation",
  CAUTIONS: "cautions",
  PRICING: "pricingInformation",
  GUARANTEE: "guaranteeInformation",
  MANUFACTURER: "manufacturer",
  PRODUCT_FORMAT: "productFormat",
  RETURNS: "returnsInformation",
  SHIPPING: "shippingInformation",
};

const NATIVE_FIELD_AUTHORITY = new Set([
  "productFormat",
  "returnsInformation",
  "shippingInformation",
  "productName",
  "usageInformation",
  "guaranteeInformation",
  "cautions",
  "pricingInformation",
  "manufacturer",
  "ingredientsOrComponents",
]);

/**
 * A native owner field used to project its raw value once any in-authority
 * claim existed. Spans already classified under another topic stayed visible.
 * When those spans exist, the slot receives only the in-authority claim text.
 * A field with no foreign span keeps its original value.
 */
function valueForSlotAuthority(
  item: { id: string; value: string },
  projection: ClaimProjection,
  authority: SemanticSlotAuthority,
): string {
  const allowed = new Set(classesForSlotAuthority(authority));
  const foreign = projection.claims.some(
    (claim) => claim.evidenceId === item.id && claim.sourceText.trim() && !allowed.has(claim.claimClass),
  );
  if (!foreign) return item.value;
  return authorizedTextForSlot(projection, [item.id], authority);
}

export function projectedEvidenceForSlot(
  items: Array<{ id: string; field: string; value: string }>,
  projection: ClaimProjection,
  authority: SemanticSlotAuthority,
): Array<{ id: string; field: string; value: string }> {
  const ownerField = FIELD_FOR_AUTHORITY[authority];
  return items
    .map((item) => {
      if (ownerField && item.field === ownerField && NATIVE_FIELD_AUTHORITY.has(item.field)) {
        const native = authorizedClaimsForSlot(projection, [item.id], authority);
        if (native.length === 0) return null;
        const value = valueForSlotAuthority(item, projection, authority).trim();
        if (!value) return null;
        return { id: item.id, field: item.field, value };
      }
      const text = authorizedTextForSlot(projection, [item.id], authority);
      if (!text) return null;
      return { id: item.id, field: item.field, value: text };
    })
    .filter((row): row is { id: string; field: string; value: string } => Boolean(row));
}

export function visibleSemanticTopics(text: string): GenerationTopic[] {
  const topics: GenerationTopic[] = [];
  if (usageInstructionSpans(text).length > 0 || temporalDescriptionSpans(text).length > 0) topics.push("usage");
  if (guaranteeReferenceSpans(text).length > 0) topics.push("guarantee");
  if (hasCompositionPromotionLanguage(text) || /\bcontains\s+[A-Z][A-Za-z0-9®\-]{2,}\b/.test(text)) {
    topics.push("ingredients");
  }
  if (/\b(?:price|pricing|cost|msrp|discount)\b/i.test(text)) topics.push("pricing");
  if (/\b(?:caution|warning|allergen|consult(?:\s+with)?(?:\s+your)?\s+(?:doctor|physician))\b/i.test(text)) {
    topics.push("cautions");
  }
  if (/\bmanufactur(?:er|ed by|ing)\b/i.test(text)) topics.push("manufacturer");
  if (/\bexpected results\b|\bresults in \d+\s+(?:days?|weeks?)\b/i.test(text)) topics.push("results_timeline");
  if (/\bdietary supplement\b|\bmedical device\b/i.test(text)) topics.push("category_classification");
  if (/\bsynovial fluid is\b|\bnatural lubricant\b|\bcartilage\b/i.test(text)) topics.push("background_science");
  if (new RegExp(RETURNS_PROCEDURE_SOURCE, "i").test(text)) topics.push("returns");
  if (new RegExp(SHIPPING_TOPIC_SOURCE, "i").test(text)) topics.push("shipping");
  return topics;
}

/**
 * Topics visible in operational evidence: pricing and manufacturer count only
 * as assertions (see operational-context); every other topic keeps the lexical
 * detector.
 */
function operationalEvidenceTopics(text: string): GenerationTopic[] {
  const topics: GenerationTopic[] = visibleSemanticTopics(text).filter((topic) => topic !== "pricing" && topic !== "manufacturer");
  if (operationalPricingAssertions(text).length > 0) topics.push("pricing");
  if (operationalManufacturerAssertions(text).length > 0) topics.push("manufacturer");
  return topics;
}

/**
 * Operational interpretation applies only to returns/shipping evidence inside a
 * returns/shipping slot; any other evidence is read by the lexical detector.
 */
function slotTopicSources(slot: SlotIsolationView): { operational: Set<GenerationTopic>; other: Set<GenerationTopic> } {
  const inFamily = OPERATIONAL_TOPIC_FAMILY.has(slot.topic);
  const isOperational = (item: SlotIsolationView["evidence"][number]) => inFamily && OPERATIONAL_EVIDENCE_FIELDS.has(item.field);
  const otherText = slot.evidence
    .filter((item) => !isOperational(item))
    .map((item) => item.value)
    .join(" ");
  const operational = new Set<GenerationTopic>();
  for (const item of slot.evidence.filter(isOperational)) for (const topic of operationalEvidenceTopics(item.value)) operational.add(topic);
  return { operational, other: new Set(otherText ? visibleSemanticTopics(otherText) : []) };
}

export function slotVisibleTopics(slot: SlotIsolationView): GenerationTopic[] {
  const { operational, other } = slotTopicSources(slot);
  return [...new Set([...other, ...operational])];
}

/**
 * Returns and shipping are one operational family only for topics shown by
 * evidence already authorized as returns/shipping; the family opens no other topic.
 */
function unauthorizedVisibleTopics(slot: SlotIsolationView): GenerationTopic[] {
  const allowed = new Set(authorizedTopicsForSlot(slot));
  const { operational, other } = slotTopicSources(slot);
  const out = new Set<GenerationTopic>([...other].filter((topic) => !allowed.has(topic)));
  for (const topic of operational) if (!allowed.has(topic) && !OPERATIONAL_TOPIC_FAMILY.has(topic)) out.add(topic);
  return [...out];
}

export function collectSlotProjectionViolations(slots: SlotIsolationView[]): SlotProjectionViolation[] {
  const violations: SlotProjectionViolation[] = [];
  for (const slot of slots) {
    const authorized = authorizedTopicsForSlot(slot);
    const projectedSource = slot.evidence.map((item) => item.value).join(" ");
    const visible = unauthorizedVisibleTopics(slot);
    if (visible.length === 0) continue;
    violations.push({
      slotId: slot.slotId,
      code: "SLOT_PROJECTION_AUTHORITY_VIOLATION",
      authorizedTopics: authorized,
      visibleTopics: visible,
      projectedSource,
    });
  }
  return violations;
}

export function assertModelSlotProjectionIsolation(slots: SlotIsolationView[]): void {
  const violations = collectSlotProjectionViolations(slots);
  if (violations.length === 0) return;
  const detail = violations
    .map((item) => `${item.slotId} visible=[${item.visibleTopics.join(",")}] authorized=[${item.authorizedTopics.join(",")}]`)
    .join("; ");
  throw new Error(`SLOT_PROJECTION_AUTHORITY_VIOLATION: ${detail}`);
}
