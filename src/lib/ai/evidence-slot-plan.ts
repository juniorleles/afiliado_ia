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
import { propositionsForSlot } from "@/lib/ai/authorized-propositions";
import { atomicOperationalSentences } from "@/lib/ai/operational-relations";
import { deterministicFaqQuestion, validateFaqQuestion } from "@/lib/ai/faq-question-semantics";

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
  "RETURNS",
  "SHIPPING",
  "FAQ",
  "FINAL_THOUGHTS",
] as const;

export type EvidenceSlotType = (typeof SLOT_TYPES)[number];

/**
 * Narrative slots that already present authorized propositions.
 * FAQ is excluded: a question may reuse a proposition.
 * FINAL_THOUGHTS is excluded: it only receives what these slots do not already own.
 */
export const PRIMARY_FACTUAL_BODY_SLOT_TYPES = [
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
  "RETURNS",
  "SHIPPING",
] as const satisfies readonly EvidenceSlotType[];

export type SemanticAuthority =
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

export const SLOT_OMISSION_REASONS = ["NO_AUTHORIZED_EVIDENCE", "NO_AUTHORIZED_DETERMINISTIC_REALIZATION"] as const;

export type SlotOmissionReason = (typeof SLOT_OMISSION_REASONS)[number];

/** A planned slot that has no authorized realization. Required omissions block; optional ones are dropped. */
export type OmittedEvidenceSlot = {
  slotId: string;
  type: EvidenceSlotType;
  topic: GenerationTopic;
  required: boolean;
  status: "OMITTED";
  reasonCode: SlotOmissionReason;
};

export type EvidenceSlotPlan = {
  slots: EvidenceSlot[];
  requiredSlotIds: string[];
  optionalSlotIds: string[];
  omitted: OmittedEvidenceSlot[];
};

/** Omissions a caller must treat as fatal. An optional slot never appears here. */
export function blockingSlotOmissions(plan: EvidenceSlotPlan): OmittedEvidenceSlot[] {
  return plan.omitted.filter((slot) => slot.required);
}

function padSlot(index: number): string {
  return `S${String(index).padStart(3, "0")}`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** MODEL slots may paraphrase the projected evidence. They are not asked to fill a long budget. */
function conservativeMaxWords(sourceWords: number, ceiling: number): number {
  if (sourceWords <= 0) return Math.min(ceiling, 8);
  const allowance = Math.max(2, Math.ceil(sourceWords * 0.35));
  return Math.min(ceiling, sourceWords + allowance);
}

/**
 * Operational facts (windows, fees, procedures) must each survive compression,
 * so the budget grows with the number of authorized facts rather than a fixed
 * section size. A fact is one atomic proposition (the same unit the model
 * cites), so a statement holding three independent sentences counts three
 * times. Each fact contributes its own length up to a compact cap; the slot
 * never exceeds its source, so sparse evidence stays short and no filler room
 * is created.
 */
export const OPERATIONAL_WORDS_PER_FACT = 18;

export function operationalEvidenceBudget(statements: string[]): number {
  return statements
    .flatMap((text) => atomicOperationalSentences(text))
    .reduce((total, sentence) => total + Math.min(countWords(sentence), OPERATIONAL_WORDS_PER_FACT), 0);
}

const OPERATIONAL_BUDGET_FIELDS = new Set(["returnsInformation", "shippingInformation"]);

/**
 * Operational slots restate every authorized fact, one wording per
 * proposition, and verbatim is the one realization every validator is
 * guaranteed to accept. The slot budget can therefore never be smaller than
 * the verbatim length of its operational propositions; a budget below that
 * would force dropping a proposition (and its conditions, fees or durations).
 */
export function minimumFaithfulWords(evidence: ReadonlyArray<{ field: string; value: string }>): number {
  return evidence
    .filter((item) => OPERATIONAL_BUDGET_FIELDS.has(item.field))
    .flatMap((item) => atomicOperationalSentences(item.value))
    .reduce((total, sentence) => total + countWords(sentence), 0);
}

export type SlotBudgetInfeasibility = { slotId: string; type: EvidenceSlotType; maxWords: number; minimumFaithfulWords: number };

/** Slots whose required faithful realization cannot fit their budget. A plan with any must not reach the model. */
export function slotBudgetInfeasibilities(plan: Pick<EvidenceSlotPlan, "slots">): SlotBudgetInfeasibility[] {
  return plan.slots
    .map((slot) => ({ slotId: slot.slotId, type: slot.type, maxWords: slot.maxWords, minimumFaithfulWords: minimumFaithfulWords(slot.evidence) }))
    .filter((item) => item.minimumFaithfulWords > item.maxWords);
}

export function assertSlotBudgetFeasibility(plan: Pick<EvidenceSlotPlan, "slots">): void {
  const infeasible = slotBudgetInfeasibilities(plan);
  if (infeasible.length === 0) return;
  const detail = infeasible.map((item) => `${item.slotId} maxWords=${item.maxWords} minimumFaithfulWords=${item.minimumFaithfulWords}`).join("; ");
  throw new Error(`SLOT_BUDGET_INFEASIBLE: ${detail}`);
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
  if (topic === "product_format") return "PRODUCT_FORMAT";
  if (topic === "returns") return "RETURNS";
  if (topic === "shipping") return "SHIPPING";
  return "DESCRIPTION";
}

function normalizedStatement(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function createEvidenceSlotPlan(
  facts: ProductFacts,
  plan = createGenerationPlan(facts),
  manifest = buildGenerationFactManifest(facts),
  projection = projectEvidenceClaims(facts, plan, manifest),
): EvidenceSlotPlan {
  const slots: EvidenceSlot[] = [];
  const omitted: OmittedEvidenceSlot[] = [];
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
      /** Returns a reason code when the slot has no authorized realization. */
      realization?: (candidate: EvidenceSlot) => SlotOmissionReason | null;
    },
  ) => {
    const slotId = slot.slotId || padSlot(seq);
    if (!slot.slotId) seq += 1;
    const drop = (reasonCode: SlotOmissionReason) => {
      omitted.push({ slotId, type: slot.type, topic: slot.topic, required: slot.required, status: "OMITTED", reasonCode });
    };
    const evidence = toProjectedEvidence(slot.items, projection, slot.semanticAuthority, modelRoute);
    if (evidence.length === 0) {
      drop("NO_AUTHORIZED_EVIDENCE");
      return;
    }
    const sourceWords = evidence.reduce((total, item) => total + countWords(item.value), 0);
    const maxWords = Math.max(
      modelRoute ? conservativeMaxWords(sourceWords, slot.maxWords) : slot.maxWords,
      minimumFaithfulWords(evidence),
    );
    const candidate: EvidenceSlot = {
      slotId,
      type: slot.type,
      topic: slot.topic,
      allowedEvidenceIds: evidence.map((item) => item.id),
      allowedClaimIds: slot.allowedClaimIds || claimIdsFor(slot.items, projection, slot.semanticAuthority, modelRoute),
      evidence,
      maxWords,
      required: slot.required,
      semanticAuthority: slot.semanticAuthority,
      preserveSemanticRelationships: true,
    };
    const unrealizable = slot.realization?.(candidate) ?? null;
    if (unrealizable) {
      drop(unrealizable);
      return;
    }
    slots.push(candidate);
  };

  /** A question the code cannot authorize from the assigned evidence is never sent to the model. */
  const faqRealization = (candidate: EvidenceSlot): SlotOmissionReason | null => {
    const question = deterministicFaqQuestion(candidate, facts.productName);
    if (!question) return "NO_AUTHORIZED_DETERMINISTIC_REALIZATION";
    const validation = validateFaqQuestion({
      question,
      topic: candidate.topic,
      field: candidate.evidence[0]?.field,
      semanticAuthority: candidate.semanticAuthority,
      authorizedTopics: [candidate.topic],
      slotId: candidate.slotId,
      closedTopics: plan.closedTopics,
      supportText: candidate.evidence.map((item) => item.value).join("\n"),
      productName: facts.productName,
    });
    return validation.semanticResult === "PASS" ? null : "NO_AUTHORIZED_DETERMINISTIC_REALIZATION";
  };

  const propositionIdsForItems = (item: GenerationFactManifestItem, topic: GenerationTopic, authority: SemanticAuthority) => {
    const evidence = toProjectedEvidence([item], projection, authority, modelRoute);
    if (evidence.length === 0) return [];
    return propositionsForSlot({
      slotId: "DRAFT",
      type: "FINAL_THOUGHTS",
      topic,
      allowedEvidenceIds: evidence.map((row) => row.id),
      allowedClaimIds: claimIdsFor([item], projection, authority, modelRoute),
      evidence,
      maxWords: 1,
      required: false,
      semanticAuthority: authority,
      preserveSemanticRelationships: true,
    }).map((proposition) => proposition.propositionId);
  };

  const consumedBodyPropositionIds = (body: EvidenceSlot[]) => {
    const consumed = new Set<string>();
    for (const slot of body) {
      if (!(PRIMARY_FACTUAL_BODY_SLOT_TYPES as readonly string[]).includes(slot.type)) continue;
      for (const proposition of propositionsForSlot(slot)) consumed.add(proposition.propositionId);
    }
    return consumed;
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

  const operationalBlocks: Array<{ type: EvidenceSlotType; field: string; topic: GenerationTopic; budget: number }> = [
    { type: "RETURNS", field: "returnsInformation", topic: "returns", budget: plan.wordBudget.returns },
    { type: "SHIPPING", field: "shippingInformation", topic: "shipping", budget: plan.wordBudget.shipping },
  ];
  for (const block of operationalBlocks) {
    if (!plan.optionalBlocks.includes(block.type as never)) continue;
    const items = itemsForField(manifest, block.field).filter((item) => authorizedTextForEvidence(projection, item.id));
    if (items.length === 0) continue;
    push({
      type: block.type,
      topic: block.topic,
      items,
      maxWords: modelRoute ? operationalEvidenceBudget(items.map((item) => authorizedTextForEvidence(projection, item.id))) : block.budget,
      required: false,
      semanticAuthority: authorityForTopic(block.topic),
    });
  }

  if (plan.authorizedBlocks.includes("FINAL_THOUGHTS")) {
    if (!(modelRoute && featureItems.length === 0 && descriptionItems.length === 0)) {
      const closing = featureItems.length ? featureItems : descriptionItems.length ? descriptionItems : nameItems;
      const topic: GenerationTopic = featureItems.length ? "features" : descriptionItems.length ? "description" : "identity";
      const semanticAuthority: SemanticAuthority = featureItems.length
        ? "FEATURE_DESCRIPTION"
        : descriptionItems.length
          ? "DESCRIPTION"
          : "IDENTITY";
      const distinct = modelRoute
        ? closing.filter((item) => {
            const consumed = consumedBodyPropositionIds(slots);
            const ids = propositionIdsForItems(item, topic, semanticAuthority);
            return ids.length > 0 && ids.every((id) => !consumed.has(id));
          })
        : closing;
      if (distinct.length > 0) {
        push({
          type: "FINAL_THOUGHTS",
          topic,
          items: distinct,
          maxWords: plan.wordBudget.finalThoughts,
          required: !plan.thinMode,
          semanticAuthority,
        });
      }
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
    if (plan.allowedTopics.includes("product_format")) {
      const usageText = new Set(
        slots.filter((slot) => slot.type === "USAGE").flatMap((slot) => slot.evidence.map((row) => normalizedStatement(row.value))),
      );
      const items = itemsForField(manifest, "productFormat")
        .filter((item) => authorizedTextForEvidence(projection, item.id))
        .filter((item) => !usageText.has(normalizedStatement(item.value)))
        .slice(0, 1);
      if (items[0]) candidates.push({ topic: "product_format", items });
    }
    for (const candidate of candidates) {
      if (slots.filter((slot) => slot.type === "FAQ").length >= faqBudget) break;
      push({
        slotId: `FAQ${String(faqSeq).padStart(3, "0")}`,
        type: "FAQ",
        topic: candidate.topic,
        items: candidate.items,
        maxWords: plan.wordBudget.faqAnswer,
        required: false,
        semanticAuthority: authorityForTopic(candidate.topic),
        realization: faqRealization,
      });
      faqSeq += 1;
    }
  }

  return {
    slots,
    requiredSlotIds: slots.filter((slot) => slot.required).map((slot) => slot.slotId),
    optionalSlotIds: slots.filter((slot) => !slot.required).map((slot) => slot.slotId),
    omitted,
  };
}

export function formatEvidenceSlotPlanForPrompt(slotPlan: EvidenceSlotPlan): string {
  const lines = [
    "EVIDENCE SLOT PLAN — CODE owns block, topic, and projected claims. Fill only these slots.",
    "Return slotId plus wording. Do not return evidenceIds. Do not invent slots. Restate projected claims only.",
    "Optional slots may be omitted. Sparse copy is valid. THIN FINAL_THOUGHTS is summary-only: do not synthesize a new conclusion.",
    "claims= lists the authority scope of the slot. Claim IDs are NOT citable. Only the proposition IDs in citable= may be cited.",
    "answerShape=ENTITY_ONLY: the whole fill may be the entity text, with no predicate added to make a sentence.",
  ];
  for (const slot of slotPlan.slots) {
    const text = slot.evidence.map((item) => item.value).join(" / ");
    const propositions = propositionsForSlot(slot);
    const citable = propositions.map((item) => item.propositionId);
    const shapes = new Set(propositions.map((item) => item.shape));
    const answerShape = shapes.size === 1 ? [...shapes][0] : shapes.size === 0 ? "STATEMENT" : "MIXED";
    const shapeNote = answerShape === "STATEMENT" ? "" : ` answerShape=${answerShape}`;
    lines.push(
      `SLOT ${slot.slotId} type=${slot.type} topic=${slot.topic} required=${slot.required ? "YES" : "NO"} maxWords=${slot.maxWords} semanticAuthority=${slot.semanticAuthority} claims=${slot.allowedClaimIds.join(",") || "none"} citable=${citable.join(",") || "none"}${shapeNote} :: ${text}`,
    );
  }
  return lines.join("\n");
}
