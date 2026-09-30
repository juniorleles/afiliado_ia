/**
 * Slot-bound generation: model fills preassigned slots; code owns evidence.
 */

import { extractJsonText } from "@/lib/ai/parse-ai-json";
import {
  createGenerationPlan,
  hasGuaranteeReferenceLanguage,
  hasUsageAuthorityLanguage,
  isKnowledgeExpansion,
  validateGenerationPlan,
} from "@/lib/ai/generation-plan";
import { isOperationalContextSlot } from "@/lib/ai/operational-context";
import {
  CLAIM_CLASS_COMPOSITION_PROMOTION,
  hasCompositionPromotionLanguage,
  relationalIngredientClaims,
  unsupportedRelationalExpansions,
} from "@/lib/ai/ingredient-claims";
import {
  adaptStructuredToVariantCopy,
  factsFromEvidenceIds,
  pageFaqAuthorityBindings,
  STRUCTURED_CTA_LABELS,
  type EvidenceTrace,
  type StructuralViolation,
  type StructuredBlock,
  type StructuredEvaluation,
  type StructuredFaqItem,
  type StructuredGenerationPage,
} from "@/lib/ai/structured-generation";
import {
  editorialExpansionClaims,
  resultsExpectationClaims,
} from "@/lib/ai/claim-projection";
import { validateFaqQuestion, type FaqQuestionValidation } from "@/lib/ai/faq-question-semantics";
import { semanticClosureViolations } from "@/lib/ai/semantic-closure";
import { identityUsedAsComposition, validateModelSlotAuthority } from "@/lib/ai/model-slot-authority";
import {
  validateModelWordingConstraint,
  wordingConstraintToStructural,
} from "@/lib/ai/model-wording-constraint";
import {
  propositionsForSlot,
  validatePropositionBindings,
  type BoundWording,
} from "@/lib/ai/authorized-propositions";
import {
  createEvidenceSlotPlan,
  type EvidenceSlot,
  type EvidenceSlotPlan,
} from "@/lib/ai/evidence-slot-plan";
import {
  composeContentReadiness,
  composePublicationGate,
  validateGrounding,
  type ContentReadiness,
  type GroundingResult,
} from "@/lib/ai/grounding-validator";
import { lintCampaign } from "@/lib/policy-linter";
import { buildGenerationFactManifest, type ProductFacts } from "@/lib/product-facts";

export type SlotFill = {
  slotId: string;
  content?: string;
  question?: string;
  answer?: string;
  propositions?: BoundWording[];
  answerPropositions?: BoundWording[];
  generationMethod?: "DETERMINISTIC_THIN" | "MODEL";
};

export type SlotTrace = EvidenceTrace & {
  slotId: string;
  topic?: string;
  codeAssignedEvidence: string[];
  claimClasses: string[];
  allowedClaimIds?: string[];
  questionGrounding?: GroundingResult["status"];
  answerGrounding?: GroundingResult["status"];
  questionSemantic?: FaqQuestionValidation;
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function pushViolation(
  violations: StructuralViolation[],
  code: string,
  text: string,
  reason: string,
  requiredField?: string,
) {
  if (violations.some((item) => item.code === code && item.text === text && item.reason === reason)) return;
  violations.push({ code, text, reason, requiredField });
}

function boundWordingSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["propositionIds", "wording"],
    properties: {
      propositionIds: { type: "array", items: { type: "string" } },
      wording: { type: "string" },
    },
  };
}

export function slotFillSchema(slotPlan: EvidenceSlotPlan) {
  const ids = slotPlan.slots.map((slot) => slot.slotId);
  return {
    type: "object",
    additionalProperties: false,
    required: ["variants"],
    properties: {
      variants: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["cta", "slots"],
          properties: {
            cta: {
              type: "object",
              additionalProperties: false,
              required: ["label"],
              properties: {
                label: { type: "string", enum: [...STRUCTURED_CTA_LABELS] },
              },
            },
            slots: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["slotId"],
                properties: {
                  slotId: { type: "string", enum: ids },
                  propositions: { type: "array", items: boundWordingSchema() },
                  answerPropositions: { type: "array", items: boundWordingSchema() },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function parseSlotFills(raw: unknown): { fills: SlotFill[]; ctaLabel: string } | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(extractJsonText(raw).jsonText);
    } catch {
      try {
        value = JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const variant =
    Array.isArray(obj.variants) && obj.variants[0] && typeof obj.variants[0] === "object"
      ? (obj.variants[0] as Record<string, unknown>)
      : obj;
  const ctaObj = variant.cta && typeof variant.cta === "object" ? (variant.cta as Record<string, unknown>) : {};
  const ctaLabel = typeof ctaObj.label === "string" ? ctaObj.label : "Learn More";
  const rows = Array.isArray(variant.slots) ? variant.slots : [];
  const fills: SlotFill[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (typeof item.slotId !== "string" || !item.slotId.trim()) continue;
    fills.push({
      slotId: item.slotId.trim(),
      content: typeof item.content === "string" ? item.content : undefined,
      question: typeof item.question === "string" ? item.question : undefined,
      answer: typeof item.answer === "string" ? item.answer : undefined,
      propositions: parseBoundWordings(item.propositions),
      answerPropositions: parseBoundWordings(item.answerPropositions),
      generationMethod:
        item.generationMethod === "DETERMINISTIC_THIN" || item.generationMethod === "MODEL"
          ? item.generationMethod
          : undefined,
    });
  }
  return { fills, ctaLabel };
}

function parseBoundWordings(value: unknown): BoundWording[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: BoundWording[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const wording = typeof item.wording === "string" ? item.wording : "";
    const propositionIds = Array.isArray(item.propositionIds)
      ? item.propositionIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const propositionId = typeof item.propositionId === "string" ? item.propositionId : undefined;
    if (!wording && !propositionId && !propositionIds?.length) continue;
    rows.push({ propositionId, propositionIds, wording });
  }
  return rows;
}

function boundText(rows: BoundWording[] | undefined): string {
  return (rows || [])
    .map((item) => item.wording.trim())
    .filter(Boolean)
    .join(" ");
}

function realizedProse(fill: SlotFill | undefined): string {
  if (!fill) return "";
  return boundText(fill.propositions) || (fill.content || "").trim();
}

function fillAnswer(fill: SlotFill): string {
  return (fill.answer || "").trim() || boundText(fill.answerPropositions);
}

function slotCopy(slot: EvidenceSlot, fill: SlotFill | undefined): string {
  if (!fill) return "";
  if (slot.type === "FAQ") return `${fill.question || ""} ${fillAnswer(fill)}`.trim();
  return boundText(fill.propositions) || (fill.content || "").trim();
}

function claimClassesFor(text: string, support = ""): string[] {
  const classes: string[] = [];
  if (hasUsageAuthorityLanguage(text)) classes.push("USAGE_PROMOTION");
  if (hasGuaranteeReferenceLanguage(text)) classes.push("GUARANTEE_PROMOTION");
  if (hasCompositionPromotionLanguage(text)) classes.push(CLAIM_CLASS_COMPOSITION_PROMOTION);
  if (unsupportedRelationalExpansions(text, support).length) classes.push("UNSUPPORTED_RELATIONAL_EXPANSION");
  else if (relationalIngredientClaims(text).length && support) classes.push("RELATIONAL_RESTATEMENT");
  return classes;
}

export function validateSlotFills(
  fills: SlotFill[],
  slotPlan: EvidenceSlotPlan,
  facts: ProductFacts,
): StructuralViolation[] {
  const plan = createGenerationPlan(facts);
  const violations: StructuralViolation[] = [];
  const byId = new Map(slotPlan.slots.map((slot) => [slot.slotId, slot]));
  const seen = new Set<string>();
  for (const fill of fills) {
    if (!byId.has(fill.slotId)) {
      pushViolation(violations, "UNKNOWN_SLOT", fill.slotId, "model returned a slot ID that is not in EvidenceSlotPlan");
      continue;
    }
    if (seen.has(fill.slotId)) {
      pushViolation(violations, "DUPLICATE_SLOT", fill.slotId, "duplicate slot fill");
      continue;
    }
    seen.add(fill.slotId);
    const slot = byId.get(fill.slotId)!;
    const copy = slotCopy(slot, fill);
    if (plan.generationRoute === "MODEL") {
      for (const hit of validatePropositionBindings({
        fill,
        slot,
        slots: slotPlan.slots,
        plan,
        productName: facts.productName,
      })) {
        pushViolation(violations, hit.code, hit.text, hit.reason);
      }
    }
    if (slot.type === "FAQ") {
      if (!fill.question?.trim() || !fillAnswer(fill)) {
        if (fill.question?.trim() || fillAnswer(fill) || slot.required) {
          pushViolation(violations, "MALFORMED", fill.slotId, "FAQ slot requires question and answer");
        }
        continue;
      }
    } else if (!copy) {
      if (slot.required) pushViolation(violations, "MALFORMED", fill.slotId, "required slot content is empty");
      continue;
    }
    const words = slot.type === "FAQ" ? countWords(fillAnswer(fill)) : countWords(copy);
    if (words > slot.maxWords) {
      pushViolation(violations, "WORD_BUDGET", copy, `${slot.slotId} exceeds ${slot.maxWords} words`);
    }
    if (identityUsedAsComposition(copy, facts.productName)) {
      pushViolation(
        violations,
        "IDENTITY_AS_COMPOSITION",
        copy,
        "product identity is not ingredient/composition evidence",
        "ingredientsOrComponents",
      );
    }
    if (slot.semanticAuthority !== "USAGE" && plan.closedTopics.includes("usage") && hasUsageAuthorityLanguage(copy)) {
      pushViolation(violations, "USAGE_PROMOTION", copy, "slot evidence cannot authorize USAGE semantics", "usageInformation");
    }
    if (slot.semanticAuthority !== "INGREDIENTS" && plan.closedTopics.includes("ingredients") && hasCompositionPromotionLanguage(copy)) {
      pushViolation(
        violations,
        "COMPOSITION_PROMOTION",
        copy,
        "feature mention cannot be promoted into an ingredient-composition claim",
        "ingredientsOrComponents",
      );
    }
    if (slot.semanticAuthority !== "GUARANTEE" && plan.closedTopics.includes("guarantee") && hasGuaranteeReferenceLanguage(copy)) {
      pushViolation(
        violations,
        "GUARANTEE_PROMOTION",
        copy,
        "guarantee-like wording cannot appear when guarantee topic is CLOSED",
        "guaranteeInformation",
      );
    }
    const support = slot.evidence.map((item) => item.value).join("\n");
    for (const hit of editorialExpansionClaims(copy, support)) {
      pushViolation(violations, "EDITORIAL_EXPANSION", hit, "projected evidence authorizes factual restatement, not editorial characterization");
    }
    for (const hit of unsupportedRelationalExpansions(copy, support)) {
      pushViolation(
        violations,
        "UNSUPPORTED_RELATIONAL_EXPANSION",
        hit,
        "relationship language is not entailed by assigned projected evidence",
      );
    }
    if (slot.type === "FAQ") {
      const qSem = validateFaqQuestion({
        question: fill.question || "",
        topic: slot.topic,
        field: slot.evidence[0]?.field,
        semanticAuthority: slot.semanticAuthority,
        authorizedTopics: [slot.topic],
        slotId: slot.slotId,
        closedTopics: plan.closedTopics,
        supportText: support,
        productName: facts.productName,
      });
      if (qSem.semanticResult === "FAIL") {
        pushViolation(
          violations,
          "QUESTION_SEMANTICS",
          fill.question || "",
          qSem.failCodes.join(",") || "FAQ question failed semantic validation",
        );
      }
    }
    if (plan.thinMode) {
      const closureText = slot.type === "FAQ" ? fillAnswer(fill) : copy;
      for (const hit of semanticClosureViolations(closureText, support, slot.type, true)) {
        pushViolation(violations, "SEMANTIC_CLOSURE", hit.text, hit.code);
      }
    }
    if (plan.generationRoute === "MODEL") {
      const authorityText = slot.type === "FAQ" ? `${fill.question || ""} ${fillAnswer(fill)}`.trim() : copy;
      for (const hit of wordingConstraintToStructural(validateModelWordingConstraint({ generated: authorityText, slot }))) {
        pushViolation(violations, hit.code, hit.text, hit.reason, hit.requiredField);
      }
      for (const hit of validateModelSlotAuthority({
        copy: authorityText,
        slot,
        plan,
        productName: facts.productName,
        authorizedPropositions: propositionsForSlot(slot).map((item) => item.sourceText),
      })) {
        pushViolation(violations, hit.code, hit.text, hit.reason, hit.requiredField);
      }
    }
    if (slot.type === "FAQ" && plan.closedTopics.includes("results_timeline")) {
      for (const hit of resultsExpectationClaims(`${fill.question || ""} ${fillAnswer(fill)}`)) {
        pushViolation(violations, "RESULTS_FRAMING", hit, "FAQ cannot introduce results-expectation framing when results_timeline is CLOSED", "usageInformation");
      }
    }
    if (isKnowledgeExpansion(copy, support)) {
      pushViolation(violations, "CLOSED_TOPIC", copy, "background science / knowledge expansion is CLOSED", "description");
    }
    for (const hit of validateGenerationPlan(copy, plan, facts.productName, { operationalSlot: isOperationalContextSlot(slot) }).violations) {
      pushViolation(violations, "CLOSED_TOPIC", hit.text, hit.reason, hit.requiredField);
    }
  }
  for (const id of slotPlan.requiredSlotIds) {
    if (!seen.has(id)) {
      pushViolation(violations, "MISSING_REQUIRED_SLOT", id, "required slot was not filled");
    }
  }
  return violations;
}

export function hydrateSlotFillsToPage(
  fills: SlotFill[],
  slotPlan: EvidenceSlotPlan,
  ctaLabel: string,
  approach?: string,
): StructuredGenerationPage {
  const byFill = new Map(fills.map((fill) => [fill.slotId, fill]));
  const headline = slotPlan.slots.find((slot) => slot.type === "HEADLINE");
  const summary = slotPlan.slots.find((slot) => slot.type === "SUMMARY");
  const blocks: StructuredBlock[] = [];
  let blockSeq = 1;

  const overview = slotPlan.slots.find((slot) => slot.type === "OVERVIEW");
  const overviewText = realizedProse(byFill.get(overview?.slotId || ""));
  if (overview && overviewText) {
    blocks.push({
      id: `B${String(blockSeq++).padStart(3, "0")}`,
      type: "OVERVIEW",
      evidenceIds: overview.allowedEvidenceIds,
      content: overviewText,
    });
  }

  const featureSlots = slotPlan.slots.filter((slot) => slot.type === "FEATURE");
  const featureParts = featureSlots
    .map((slot) => realizedProse(byFill.get(slot.slotId)))
    .filter((text): text is string => Boolean(text));
  if (featureParts.length) {
    blocks.push({
      id: `B${String(blockSeq++).padStart(3, "0")}`,
      type: "FEATURES",
      evidenceIds: featureSlots.flatMap((slot) => slot.allowedEvidenceIds),
      content: featureParts.join(" "),
    });
  }

  for (const type of ["INGREDIENTS", "USAGE", "CAUTIONS", "PRICING", "GUARANTEE", "MANUFACTURER", "RETURNS", "SHIPPING"] as const) {
    const typedSlots = slotPlan.slots.filter((item) => item.type === type);
    const parts = typedSlots
      .map((slot) => realizedProse(byFill.get(slot.slotId)))
      .filter((text): text is string => Boolean(text));
    if (parts.length) {
      blocks.push({
        id: `B${String(blockSeq++).padStart(3, "0")}`,
        type,
        evidenceIds: typedSlots.flatMap((slot) => slot.allowedEvidenceIds),
        content: parts.join("\n"),
        lines: type === "INGREDIENTS" ? parts : undefined,
      });
    }
  }

  const faqSlots = slotPlan.slots.filter((slot) => slot.type === "FAQ");
  const items: StructuredFaqItem[] = [];
  for (const slot of faqSlots) {
    const fill = byFill.get(slot.slotId);
    if (!fill?.question?.trim() || !fillAnswer(fill)) continue;
    items.push({
      question: fill.question.trim(),
      answer: fillAnswer(fill),
      topic: slot.topic,
      evidenceIds: slot.allowedEvidenceIds,
      field: slot.evidence[0]?.field,
      semanticAuthority: slot.semanticAuthority,
      slotId: slot.slotId,
      supportText: slot.evidence.map((item) => item.value).join("\n"),
    });
  }
  if (items.length) {
    blocks.push({
      id: `B${String(blockSeq++).padStart(3, "0")}`,
      type: "FAQ",
      evidenceIds: [],
      content: "",
      items,
    });
  }

  const closing = slotPlan.slots.find((slot) => slot.type === "FINAL_THOUGHTS");
  const closingText = realizedProse(byFill.get(closing?.slotId || ""));
  if (closing && closingText) {
    blocks.push({
      id: `B${String(blockSeq++).padStart(3, "0")}`,
      type: "FINAL_THOUGHTS",
      evidenceIds: closing.allowedEvidenceIds,
      content: closingText,
    });
  }

  return {
    approach,
    headline: {
      text: headline ? realizedProse(byFill.get(headline.slotId)) : "",
      evidenceIds: headline?.allowedEvidenceIds || [],
    },
    summary: {
      text: summary ? realizedProse(byFill.get(summary.slotId)) : "",
      evidenceIds: summary?.allowedEvidenceIds || [],
    },
    blocks,
    cta: { label: ctaLabel },
  };
}

export function adaptSlotFillsToVariantCopy(
  fills: SlotFill[],
  slotPlan: EvidenceSlotPlan,
  ctaLabel: string,
  facts: ProductFacts,
): { headline: string; body: string; ctaLabel: string } {
  const page = hydrateSlotFillsToPage(fills, slotPlan, ctaLabel);
  return adaptStructuredToVariantCopy(page, createGenerationPlan(facts));
}

export function evaluateSlotGeneration(
  raw: unknown,
  facts: ProductFacts,
  productName: string,
  affiliateUrl: string,
  slotPlan = createEvidenceSlotPlan(facts),
): StructuredEvaluation & { slotTraces: SlotTrace[]; slotPlan: EvidenceSlotPlan; contentReadiness: ContentReadiness } {
  const emptyGrounding: GroundingResult = { status: "UNGROUNDED", unsupportedClaims: [] };
  const parsed = parseSlotFills(raw);
  if (!parsed) {
    return {
      page: null,
      structuralViolations: [{ code: "MALFORMED", text: "", reason: "malformed slot JSON", requiredField: "schema" }],
      traces: [],
      slotTraces: [],
      slotPlan,
      adapted: null,
      inspectionCopy: { headline: productName, body: "", ctaLabel: "Learn More" },
      grounding: emptyGrounding,
      policyGate: "BLOCKED",
      finalGate: "BLOCKED",
      contentReadiness: "CONTENT_BLOCKED",
    };
  }

  const violations = validateSlotFills(parsed.fills, slotPlan, facts);
  const page = hydrateSlotFillsToPage(parsed.fills, slotPlan, parsed.ctaLabel);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const inspectionCopy = adaptStructuredToVariantCopy(page, plan);
  const traces: EvidenceTrace[] = [];
  const slotTraces: SlotTrace[] = [];
  const scopedResults: GroundingResult[] = [];
  const byFill = new Map(parsed.fills.map((fill) => [fill.slotId, fill]));

  for (const slot of slotPlan.slots) {
    const fill = byFill.get(slot.slotId);
    if (!fill && !slot.required) continue;
    const text = slotCopy(slot, fill);
    if (!text && !slot.required) continue;
    const scoped = factsFromEvidenceIds(facts, slot.allowedEvidenceIds, manifest);
    const support = slot.evidence.map((item) => item.value).join("\n");
    let ground: GroundingResult = { status: "GROUNDED", unsupportedClaims: [] };
    let questionGrounding: GroundingResult["status"] | undefined;
    let answerGrounding: GroundingResult["status"] | undefined;
    let questionSemantic: FaqQuestionValidation | undefined;
    if (slot.type === "FAQ" && fill) {
      questionSemantic = validateFaqQuestion({
        question: fill.question || "",
        topic: slot.topic,
        field: slot.evidence[0]?.field,
        semanticAuthority: slot.semanticAuthority,
        authorizedTopics: [slot.topic],
        slotId: slot.slotId,
        closedTopics: plan.closedTopics,
        supportText: support,
        productName: facts.productName,
      });
      const aGround = fillAnswer(fill)
        ? validateGrounding(fillAnswer(fill), scoped, { productIdentity: facts.productName })
        : { status: "GROUNDED" as const, unsupportedClaims: [] };
      questionGrounding = questionSemantic.semanticResult === "PASS" ? "GROUNDED" : "UNGROUNDED";
      answerGrounding = aGround.status;
      ground = aGround;
    } else {
      ground = text
        ? validateGrounding(text, scoped, { productIdentity: facts.productName })
        : { status: "GROUNDED", unsupportedClaims: [] };
    }
    if (text) scopedResults.push(ground);
    const structuralFail = violations.some((item) => item.text === slot.slotId || item.text === text || item.text === (fill?.question || ""));
    const trace: SlotTrace = {
      slotId: slot.slotId,
      blockId: slot.slotId,
      blockType: slot.type,
      text,
      declaredEvidence: slot.allowedEvidenceIds,
      codeAssignedEvidence: slot.allowedEvidenceIds,
      topic: slot.topic,
      groundingResult: ground.status,
      supportedBy: slot.allowedEvidenceIds,
      structuralResult: structuralFail ? "FAIL" : "PASS",
      claimClasses: claimClassesFor(text, support),
      question: fill?.question,
      answer: fill ? fillAnswer(fill) : undefined,
      declaredFields: slot.evidence.map((item) => item.field),
      unsupportedClaims: ground.unsupportedClaims,
      allowedClaimIds: slot.allowedClaimIds,
      questionGrounding,
      answerGrounding,
      questionSemantic,
    };
    slotTraces.push(trace);
    traces.push(trace);
  }

  const faqAuthorities = pageFaqAuthorityBindings(page, { closedTopics: plan.closedTopics });
  const fullGrounding = validateGrounding(
    `${inspectionCopy.headline}\n${inspectionCopy.body}\n${inspectionCopy.ctaLabel}`,
    facts,
    { faqAuthorities },
  );
  const grounding = (() => {
    const unsupported = [...scopedResults.flatMap((item) => item.unsupportedClaims), ...fullGrounding.unsupportedClaims];
    const hard = unsupported.some((item) => item.severity === "hard");
    return {
      status: (hard ? "UNGROUNDED" : unsupported.length > 0 ? "REVIEW_REQUIRED" : "GROUNDED") as GroundingResult["status"],
      unsupportedClaims: unsupported,
    };
  })();
  const policy = lintCampaign({
    id: 0,
    name: productName,
    slug: "slot-eval",
    headline: inspectionCopy.headline,
    body: inspectionCopy.body,
    ctaLabel: inspectionCopy.ctaLabel,
    affiliateUrl,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  });
  const structuralFail = violations.length > 0;
  let finalGate = composePublicationGate(policy.gate, grounding.status);
  if (structuralFail) finalGate = "BLOCKED";
  const contentReadiness = composeContentReadiness({
    grounding: grounding.status,
    policyFindings: policy.findings,
    structuralViolations: violations.length,
  });
  return {
    page,
    structuralViolations: violations,
    traces,
    slotTraces,
    slotPlan,
    adapted: structuralFail ? null : inspectionCopy,
    inspectionCopy,
    grounding,
    policyGate: policy.gate,
    finalGate,
    /** Whether the copy is valid. finalGate stays the publication decision. */
    contentReadiness,
  };
}
