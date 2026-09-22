/**
 * CODE owns block, topic, and evidence assignment.
 * The model writes conservative wording into preassigned slots.
 */

import {
  buildGenerationFactManifest,
  type GenerationFactManifest,
  type GenerationFactManifestItem,
  type ProductFacts,
} from "@/lib/product-facts";
import {
  createGenerationPlan,
  type GenerationPlan,
  type GenerationTopic,
} from "@/lib/ai/generation-plan";
import {
  authorizedTextForEvidence,
  projectEvidenceClaims,
  type ClaimProjection,
} from "@/lib/ai/claim-projection";
import {
  authorizedClaimsForSlot,
  projectedEvidenceForSlot,
  type SemanticSlotAuthority,
} from "@/lib/ai/slot-projection-isolation";

export const SLOT_TYPES = [
  "HEADLINE",
  "SUMMARY",
  "OVERVIEW",
  "FEATURE",
  "INGREDIENTS",
  "USAGE",
  "CAUTIONS",
  "PRICING",
  "GUARANTEE",
  "MANUFACTURER",
  "FAQ",
  "FINAL_THOUGHTS",
] as const;

export type EvidenceSlotType = (typeof SLOT_TYPES)[number];

export type SemanticAuthority =
  | "IDENTITY"
  | "DESCRIPTION"
  | "FEATURE_DESCRIPTION"
  | "INGREDIENTS"
  | "USAGE"
  | "CAUTIONS"
  | "PRICING"
  | "GUARANTEE"
  | "MANUFACTURER";

export type EvidenceSlot = {
  slotId: string;
  type: EvidenceSlotType;
  topic: GenerationTopic;
  allowedEvidenceIds: string[];
  allowedClaimIds: string[];
  evidence: Array<{ id: string; field: string; value: string }>;
  maxWords: number;
  required: boolean;
  semanticAuthority: SemanticAuthority;
  preserveSemanticRelationships: true;
};

export type EvidenceSlotPlan = {
  slots: EvidenceSlot[];
  requiredSlotIds: string[];
  optionalSlotIds: string[];
};

function padSlot(index: number): string {
  return `S${String(index).padStart(3, "0")}`;
}

function itemsForField(manifest: GenerationFactManifest, field: string): GenerationFactManifestItem[] {
  return manifest.items.filter((item) => item.copyEligible && item.field === field);
}

function toProjectedEvidence(
  items: GenerationFactManifestItem[],
  projection: ClaimProjection,
  authority: SemanticAuthority,
  isolate: boolean,
) {
  if (!isolate) {
    return items
      .map((item) => {
        const text = authorizedTextForEvidence(projection, item.id);
        if (!text) return null;
        return { id: item.id, field: item.field, value: text };
      })
      .filter((row): row is { id: string; field: string; value: string } => Boolean(row));
  }
  return projectedEvidenceForSlot(
    items.map((item) => ({ id: item.id, field: item.field, value: item.value })),
    projection,
    authority as SemanticSlotAuthority,
  );
}

function claimIdsFor(
  items: GenerationFactManifestItem[],
  projection: ClaimProjection,
  authority: SemanticAuthority,
  isolate: boolean,
): string[] {
  if (!isolate) {
    return projection.authorized
      .filter((claim) => items.some((item) => item.id === claim.evidenceId))
      .map((claim) => claim.claimId);
  }
  return authorizedClaimsForSlot(
    projection,
    items.map((item) => item.id),
    authority as SemanticSlotAuthority,
  ).map((claim) => claim.claimId);
}

function authorityForTopic(topic: GenerationTopic): SemanticAuthority {
  if (topic === "identity") return "IDENTITY";
  if (topic === "features") return "FEATURE_DESCRIPTION";
  if (topic === "ingredients") return "INGREDIENTS";
  if (topic === "usage") return "USAGE";
  if (topic === "cautions") return "CAUTIONS";
  if (topic === "pricing") return "PRICING";
  if (topic === "guarantee") return "GUARANTEE";
  if (topic === "manufacturer") return "MANUFACTURER";
  return "DESCRIPTION";
}

export function createEvidenceSlotPlan(
  facts: ProductFacts,
  plan = createGenerationPlan(facts),
  manifest = buildGenerationFactManifest(facts),
  projection = projectEvidenceClaims(facts, plan, manifest),
): EvidenceSlotPlan {
  const slots: EvidenceSlot[] = [];
  let seq = 1;
  const modelRoute = plan.generationRoute === "MODEL";
  const nameItems = itemsForField(manifest, "productName").filter((item) => authorizedTextForEvidence(projection, item.id));
  const descriptionItems = itemsForField(manifest, "description").filter((item) =>
    authorizedTextForEvidence(projection, item.id),
  );
  const featureItems = itemsForField(manifest, "features").filter((item) => authorizedTextForEvidence(projection, item.id));

  const push = (
    slot: {
      slotId?: string;
      type: EvidenceSlotType;
      topic: GenerationTopic;
      items: GenerationFactManifestItem[];
      maxWords: number;
      required: boolean;
      semanticAuthority: SemanticAuthority;
      allowedClaimIds?: string[];
    },
  ) => {
    const evidence = toProjectedEvidence(slot.items, projection, slot.semanticAuthority, modelRoute);
    if (evidence.length === 0) return;
    const slotId = slot.slotId || padSlot(seq);
    if (!slot.slotId) seq += 1;
    slots.push({
      slotId,
      type: slot.type,
      topic: slot.topic,
      allowedEvidenceIds: evidence.map((item) => item.id),
      allowedClaimIds: slot.allowedClaimIds || claimIdsFor(slot.items, projection, slot.semanticAuthority, modelRoute),
      evidence,
      maxWords: slot.maxWords,
      required: slot.required,
      semanticAuthority: slot.semanticAuthority,
      preserveSemanticRelationships: true,
    });
  };

  if (plan.authorizedBlocks.includes("HERO")) {
    const headlineItems = modelRoute
      ? nameItems.length
        ? nameItems
        : descriptionItems.slice(0, 1)
      : [...nameItems, ...descriptionItems.slice(0, 1)];
    push({
      type: "HEADLINE",
      topic: nameItems.length ? "identity" : "description",
      items: headlineItems,
      maxWords:
        modelRoute && nameItems.length && headlineItems === nameItems
          ? Math.min(12, plan.wordBudget.headline)
          : plan.wordBudget.headline,
      required: true,
      semanticAuthority: nameItems.length ? "IDENTITY" : "DESCRIPTION",
    });
    const summaryItems = descriptionItems.length ? descriptionItems.slice(0, 1) : nameItems;
    push({
      type: "SUMMARY",
      topic: descriptionItems.length ? "description" : "identity",
      items: summaryItems,
      maxWords:
        modelRoute && !descriptionItems.length
          ? Math.min(10, plan.wordBudget.summary)
          : plan.wordBudget.summary,
      required: true,
      semanticAuthority: descriptionItems.length ? "DESCRIPTION" : "IDENTITY",
    });
  }

  if (plan.authorizedBlocks.includes("OVERVIEW")) {
    if (!(modelRoute && descriptionItems.length === 0)) {
      const overviewItems = descriptionItems.length ? descriptionItems.slice(0, 1) : nameItems;
      push({
        type: "OVERVIEW",
        topic: descriptionItems.length ? "description" : "identity",
        items: overviewItems,
        maxWords: plan.wordBudget.overview,
        required: !plan.thinMode,
        semanticAuthority: descriptionItems.length ? "DESCRIPTION" : "IDENTITY",
      });
    }
  }

  if (plan.authorizedBlocks.includes("FEATURES") && featureItems.length > 0) {
    const per = Math.max(24, Math.floor(plan.wordBudget.features / featureItems.length));
    for (const item of featureItems) {
      push({
        type: "FEATURE",
        topic: "features",
        items: [item],
        maxWords: per,
        required: true,
        semanticAuthority: "FEATURE_DESCRIPTION",
      });
    }
  }

  const extraBlocks: Array<{
    type: EvidenceSlotType;
    field: string;
    topic: GenerationTopic;
    budget: number;
  }> = [
    { type: "INGREDIENTS", field: "ingredientsOrComponents", topic: "ingredients", budget: plan.wordBudget.ingredients },
    { type: "USAGE", field: "usageInformation", topic: "usage", budget: plan.wordBudget.usage },
    { type: "CAUTIONS", field: "cautions", topic: "cautions", budget: plan.wordBudget.cautions },
    { type: "PRICING", field: "pricingInformation", topic: "pricing", budget: plan.wordBudget.pricing },
    { type: "GUARANTEE", field: "guaranteeInformation", topic: "guarantee", budget: plan.wordBudget.guarantee },
    { type: "MANUFACTURER", field: "manufacturer", topic: "manufacturer", budget: plan.wordBudget.manufacturer },
  ];
  for (const block of extraBlocks) {
    if (!plan.authorizedBlocks.includes(block.type as never)) continue;
    const items = itemsForField(manifest, block.field).filter((item) => authorizedTextForEvidence(projection, item.id));
    if (items.length === 0) continue;
    if (modelRoute && block.type === "INGREDIENTS") {
      const per = Math.max(8, Math.floor(block.budget / items.length));
      for (const item of items) {
        push({
          type: block.type,
          topic: block.topic,
          items: [item],
          maxWords: per,
          required: true,
          semanticAuthority: authorityForTopic(block.topic),
        });
      }
      continue;
    }
    push({
      type: block.type,
      topic: block.topic,
      items,
      maxWords: block.budget,
      required: true,
      semanticAuthority: authorityForTopic(block.topic),
    });
  }

  if (plan.authorizedBlocks.includes("FINAL_THOUGHTS")) {
    if (!(modelRoute && featureItems.length === 0 && descriptionItems.length === 0)) {
      const closing = featureItems.length ? featureItems : descriptionItems.length ? descriptionItems : nameItems;
      push({
        type: "FINAL_THOUGHTS",
        topic: featureItems.length ? "features" : descriptionItems.length ? "description" : "identity",
        items: closing,
        maxWords: plan.wordBudget.finalThoughts,
        required: !plan.thinMode,
        semanticAuthority: featureItems.length ? "FEATURE_DESCRIPTION" : descriptionItems.length ? "DESCRIPTION" : "IDENTITY",
      });
    }
  }

  if (plan.faqAllowed && plan.optionalBlocks.includes("FAQ")) {
    let faqSeq = 1;
    const faqBudget = plan.wordBudget.faqItems;
    const candidates: Array<{ topic: GenerationTopic; items: GenerationFactManifestItem[] }> = [];
    if (plan.allowedTopics.includes("description") && descriptionItems[0]) {
      candidates.push({ topic: "description", items: [descriptionItems[0]] });
    }
    if (plan.allowedTopics.includes("features") && featureItems[0]) {
      candidates.push({ topic: "features", items: [featureItems[0]] });
    }
    if (plan.allowedTopics.includes("usage")) {
      const items = itemsForField(manifest, "usageInformation")
        .filter((item) => authorizedTextForEvidence(projection, item.id))
        .slice(0, 1);
      if (items[0]) candidates.push({ topic: "usage", items });
    }
    if (plan.allowedTopics.includes("guarantee")) {
      const items = itemsForField(manifest, "guaranteeInformation")
        .filter((item) => authorizedTextForEvidence(projection, item.id))
        .slice(0, 1);
      if (items[0]) candidates.push({ topic: "guarantee", items });
    }
    if (plan.allowedTopics.includes("ingredients")) {
      const items = itemsForField(manifest, "ingredientsOrComponents")
        .filter((item) => authorizedTextForEvidence(projection, item.id))
        .slice(0, 1);
      if (items[0]) candidates.push({ topic: "ingredients", items });
    }
    for (const candidate of candidates.slice(0, faqBudget)) {
      push({
        slotId: `FAQ${String(faqSeq).padStart(3, "0")}`,
        type: "FAQ",
        topic: candidate.topic,
        items: candidate.items,
        maxWords: plan.wordBudget.faqAnswer,
        required: false,
        semanticAuthority: authorityForTopic(candidate.topic),
      });
      faqSeq += 1;
    }
  }

  return {
    slots,
    requiredSlotIds: slots.filter((slot) => slot.required).map((slot) => slot.slotId),
    optionalSlotIds: slots.filter((slot) => !slot.required).map((slot) => slot.slotId),
  };
}

export function formatEvidenceSlotPlanForPrompt(slotPlan: EvidenceSlotPlan): string {
  const lines = [
    "EVIDENCE SLOT PLAN — CODE owns block, topic, and projected claims. Fill only these slots.",
    "Return slotId plus wording. Do not return evidenceIds. Do not invent slots. Restate projected claims only.",
    "Optional slots may be omitted. Sparse copy is valid. THIN FINAL_THOUGHTS is summary-only: do not synthesize a new conclusion.",
  ];
  for (const slot of slotPlan.slots) {
    const text = slot.evidence.map((item) => item.value).join(" / ");
    lines.push(
      `SLOT ${slot.slotId} type=${slot.type} topic=${slot.topic} required=${slot.required ? "YES" : "NO"} maxWords=${slot.maxWords} semanticAuthority=${slot.semanticAuthority} claims=${slot.allowedClaimIds.join(",") || "none"} :: ${text}`,
    );
  }
  return lines.join("\n");
}
