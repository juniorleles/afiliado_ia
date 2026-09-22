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
  temporalDescriptionSpans,
  usageInstructionSpans,
  type GenerationTopic,
  GENERATION_TOPICS,
} from "@/lib/ai/generation-plan";
import { hasCompositionPromotionLanguage } from "@/lib/ai/ingredient-claims";

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
  | "MANUFACTURER";

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
};

const NATIVE_FIELD_AUTHORITY = new Set([
  "productName",
  "usageInformation",
  "guaranteeInformation",
  "cautions",
  "pricingInformation",
  "manufacturer",
  "ingredientsOrComponents",
]);

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
        return { id: item.id, field: item.field, value: item.value };
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
  return topics;
}

export function collectSlotProjectionViolations(slots: SlotIsolationView[]): SlotProjectionViolation[] {
  const violations: SlotProjectionViolation[] = [];
  for (const slot of slots) {
    const authorized = authorizedTopicsForSlot(slot);
    const allowed = new Set(authorized);
    const projectedSource = slot.evidence.map((item) => item.value).join(" ");
    const visible = visibleSemanticTopics(projectedSource).filter((topic) => !allowed.has(topic));
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
