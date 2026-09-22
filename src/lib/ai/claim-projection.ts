/**
 * Claim-level evidence projection: generation-time authorization only.
 * Does not mutate ProductFacts or stored provenance.
 */

import {
  buildGenerationFactManifest,
  getConsumerCopyEligibleFacts,
  type FactConfidence,
  type GenerationFactManifest,
  type GenerationFactManifestItem,
  type ProductFacts,
} from "@/lib/product-facts";
import {
  createGenerationPlan,
  guaranteeReferenceSpans,
  temporalDescriptionSpans,
  usageInstructionSpans,
  type GenerationPlan,
  type GenerationTopic,
} from "@/lib/ai/generation-plan";
import {
  closedIngredientSynergyClaims,
  compositionPromotionClaims,
} from "@/lib/ai/ingredient-claims";
type ClaimSemanticAuthority =
  | "IDENTITY"
  | "DESCRIPTION"
  | "FEATURE_DESCRIPTION"
  | "INGREDIENTS"
  | "USAGE"
  | "CAUTIONS"
  | "PRICING"
  | "GUARANTEE"
  | "MANUFACTURER";

export const CLAIM_CLASSES = [
  "IDENTITY",
  "DESCRIPTION",
  "FEATURE_DESCRIPTION",
  "TEMPORAL_DESCRIPTION",
  "USAGE_INSTRUCTION",
  "INGREDIENT_COMPOSITION",
  "GENERIC_INGREDIENT_REFERENCE",
  "ANTIOXIDANT_REFERENCE",
  "GUARANTEE",
  "GUARANTEE_REFERENCE",
  "PRICING",
  "CAUTION",
  "MANUFACTURER",
  "RESULTS_TIMELINE",
  "CATEGORY_CLASSIFICATION",
  "BACKGROUND_SCIENCE",
  "RELATIONAL_EXPANSION",
  "OTHER",
] as const;

export type ClaimClass = (typeof CLAIM_CLASSES)[number];

export type ClaimUnit = {
  claimId: string;
  evidenceId: string;
  field: string;
  claimClass: ClaimClass;
  sourceText: string;
  generationText: string;
  generationAuthorized: boolean;
  provenance: FactConfidence | "OPERATOR_IDENTITY";
  semanticAuthority: ClaimSemanticAuthority;
  compositionAuthority: boolean;
};

export type ClaimProjection = {
  claims: ClaimUnit[];
  authorized: ClaimUnit[];
  excluded: ClaimUnit[];
};

const CLOSED_CLASS_TOPIC: Partial<Record<ClaimClass, GenerationTopic>> = {
  USAGE_INSTRUCTION: "usage",
  TEMPORAL_DESCRIPTION: "usage",
  INGREDIENT_COMPOSITION: "ingredients",
  GUARANTEE: "guarantee",
  GUARANTEE_REFERENCE: "guarantee",
  PRICING: "pricing",
  CAUTION: "cautions",
  MANUFACTURER: "manufacturer",
  RESULTS_TIMELINE: "results_timeline",
  CATEGORY_CLASSIFICATION: "category_classification",
  BACKGROUND_SCIENCE: "background_science",
  RELATIONAL_EXPANSION: "ingredients",
};

const EDITORIAL_FRAMING =
  /\b(?:straightforward|convenient|comprehensive|well-rounded|thoughtful|balanced|simple|practical|multi-angle|premium|powerful|impressive|ideal|excellent|robust|advanced|unique|smart)\b/gi;

const RESULTS_EXPECTATION =
  /\bresults expectations?\b|\bexpected results\b|\beffect onset\b|\bhow quickly\b|\bhow long (?:until|before|does)\b|\btime[- ]to[- ](?:effect|results)\b|\bspeed of (?:results|effect)\b/gi;

function fieldAuthority(field: string): ClaimSemanticAuthority {
  if (field === "productName") return "IDENTITY";
  if (field === "features") return "FEATURE_DESCRIPTION";
  if (field === "ingredientsOrComponents") return "INGREDIENTS";
  if (field === "usageInformation") return "USAGE";
  if (field === "cautions") return "CAUTIONS";
  if (field === "pricingInformation") return "PRICING";
  if (field === "guaranteeInformation") return "GUARANTEE";
  if (field === "manufacturer") return "MANUFACTURER";
  return "DESCRIPTION";
}

function defaultClass(field: string): ClaimClass {
  if (field === "productName") return "IDENTITY";
  if (field === "features") return "FEATURE_DESCRIPTION";
  if (field === "ingredientsOrComponents") return "INGREDIENT_COMPOSITION";
  if (field === "usageInformation") return "USAGE_INSTRUCTION";
  if (field === "cautions") return "CAUTION";
  if (field === "pricingInformation") return "PRICING";
  if (field === "guaranteeInformation") return "GUARANTEE";
  if (field === "manufacturer") return "MANUFACTURER";
  return "DESCRIPTION";
}

function topicOpen(plan: GenerationPlan, topic: GenerationTopic | undefined): boolean {
  if (!topic) return true;
  return !plan.closedTopics.includes(topic);
}

const CLASS_OWNER_FIELD: Partial<Record<ClaimClass, string>> = {
  USAGE_INSTRUCTION: "usageInformation",
  TEMPORAL_DESCRIPTION: "usageInformation",
  GUARANTEE: "guaranteeInformation",
  GUARANTEE_REFERENCE: "guaranteeInformation",
  INGREDIENT_COMPOSITION: "ingredientsOrComponents",
  PRICING: "pricingInformation",
  CAUTION: "cautions",
  MANUFACTURER: "manufacturer",
};

function dedicatedOwnerHasEvidence(facts: ProductFacts, field: string): boolean {
  const eligible = getConsumerCopyEligibleFacts(facts);
  if (field === "usageInformation") return eligible.usageInformation.length > 0;
  if (field === "guaranteeInformation") return Boolean(eligible.guaranteeInformation);
  if (field === "ingredientsOrComponents") return eligible.ingredientsOrComponents.length > 0;
  if (field === "pricingInformation") return Boolean(eligible.pricingInformation);
  if (field === "cautions") return eligible.cautions.length > 0;
  if (field === "manufacturer") return Boolean(eligible.manufacturer);
  return false;
}

function authorizedFor(
  claimClass: ClaimClass,
  plan: GenerationPlan,
  itemField: string,
  facts: ProductFacts,
): boolean {
  const owner = CLASS_OWNER_FIELD[claimClass];
  if (owner && itemField !== owner && dedicatedOwnerHasEvidence(facts, owner)) {
    return false;
  }
  const topic = CLOSED_CLASS_TOPIC[claimClass];
  if (!topic) return true;
  return topicOpen(plan, topic);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeSpans(spans: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const ordered = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Array<{ start: number; end: number }> = [];
  for (const span of ordered) {
    const last = out[out.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else out.push({ start: span.start, end: span.end });
  }
  return out;
}

function subtractSpans(text: string, spans: Array<{ start: number; end: number }>): string {
  if (spans.length === 0) return text.trim();
  const ordered = mergeSpans(spans);
  let cursor = 0;
  let out = "";
  for (const span of ordered) {
    out += text.slice(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  out += text.slice(cursor);
  return out
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s+and\s+and\b/gi, " and ")
    .replace(/\b(?:to|and|or|with|that|still|a|an|the)\s*$/i, "")
    .replace(/\b(?:and|or|with)\s+(?:a|an|the)?\s*$/i, "")
    .replace(/[,:;]\s*$/g, "")
    .trim();
}

function padClaim(seq: number): string {
  return `C${String(seq).padStart(3, "0")}`;
}

function makeClaim(input: {
  evidence: GenerationFactManifestItem;
  seq: number;
  claimClass: ClaimClass;
  sourceText: string;
  generationText: string;
  plan: GenerationPlan;
  facts: ProductFacts;
  compositionAuthority?: boolean;
}): ClaimUnit {
  const generationAuthorized =
    Boolean(input.generationText.trim()) &&
    authorizedFor(input.claimClass, input.plan, input.evidence.field, input.facts);
  return {
    claimId: `${input.evidence.id}:${padClaim(input.seq)}`,
    evidenceId: input.evidence.id,
    field: input.evidence.field,
    claimClass: input.claimClass,
    sourceText: input.sourceText,
    generationText: generationAuthorized ? input.generationText.trim() : "",
    generationAuthorized,
    provenance: input.evidence.provenance,
    semanticAuthority: fieldAuthority(input.evidence.field),
    compositionAuthority: Boolean(input.compositionAuthority),
  };
}

function projectItem(item: GenerationFactManifestItem, plan: GenerationPlan, facts: ProductFacts): ClaimUnit[] {
  const claims: ClaimUnit[] = [];
  let seq = 1;
  const push = (partial: Omit<Parameters<typeof makeClaim>[0], "evidence" | "seq" | "plan" | "facts">) => {
    claims.push(makeClaim({ ...partial, evidence: item, seq, plan, facts }));
    seq += 1;
  };

  if (item.field === "productName") {
    push({
      claimClass: "IDENTITY",
      sourceText: item.value,
      generationText: item.value,
    });
    return claims;
  }

  for (const sentence of splitSentences(item.value)) {
    const usage = usageInstructionSpans(sentence);
    const temporal = temporalDescriptionSpans(sentence);
    const guarantee = guaranteeReferenceSpans(sentence);
    const composition = compositionPromotionClaims(sentence).map((text) => {
      const start = sentence.toLowerCase().indexOf(text.toLowerCase());
      return { text, start: Math.max(0, start), end: Math.max(text.length, start + text.length) };
    });
    const relational = closedIngredientSynergyClaims(sentence).map((text) => {
      const start = sentence.toLowerCase().indexOf(text.toLowerCase());
      return { text, start: Math.max(0, start), end: Math.max(text.length, start + text.length) };
    });

    for (const span of usage) {
      push({
        claimClass: "USAGE_INSTRUCTION",
        sourceText: span.text,
        generationText: span.text,
      });
    }
    for (const span of temporal) {
      push({
        claimClass: "TEMPORAL_DESCRIPTION",
        sourceText: span.text,
        generationText: span.text,
      });
    }
    for (const span of guarantee) {
      push({
        claimClass: "GUARANTEE_REFERENCE",
        sourceText: span.text,
        generationText: span.text,
      });
    }
    for (const span of composition) {
      push({
        claimClass: "INGREDIENT_COMPOSITION",
        sourceText: span.text,
        generationText: span.text,
        compositionAuthority: true,
      });
    }
    for (const span of relational) {
      push({
        claimClass: "RELATIONAL_EXPANSION",
        sourceText: span.text,
        generationText: span.text,
      });
    }

    const closedSpans = [...usage, ...temporal, ...guarantee, ...composition, ...relational];
    const remainder = subtractSpans(sentence, closedSpans);
    if (remainder.split(/\s+/).filter(Boolean).length >= 3) {
      const antioxidant = /\bantioxidants?\b/i.test(remainder);
      const genericIngredient = /\bingredients?\b/i.test(remainder);
      const claimClass: ClaimClass = antioxidant
        ? "ANTIOXIDANT_REFERENCE"
        : genericIngredient
          ? "GENERIC_INGREDIENT_REFERENCE"
          : defaultClass(item.field);
      push({
        claimClass,
        sourceText: sentence,
        generationText: remainder,
        compositionAuthority: false,
      });
    }
  }

  if (claims.length === 0) {
    push({
      claimClass: defaultClass(item.field),
      sourceText: item.value,
      generationText: item.value,
    });
  }
  return claims;
}

export function projectEvidenceClaims(
  facts: ProductFacts,
  plan = createGenerationPlan(facts),
  manifest = buildGenerationFactManifest(facts),
): ClaimProjection {
  const claims: ClaimUnit[] = [];
  for (const item of manifest.items.filter((row) => row.copyEligible)) {
    claims.push(...projectItem(item, plan, facts));
  }
  return {
    claims,
    authorized: claims.filter((claim) => claim.generationAuthorized),
    excluded: claims.filter((claim) => !claim.generationAuthorized),
  };
}

export function authorizedClaimsForEvidence(projection: ClaimProjection, evidenceId: string): ClaimUnit[] {
  return projection.authorized.filter((claim) => claim.evidenceId === evidenceId);
}

export function authorizedTextForEvidence(projection: ClaimProjection, evidenceId: string): string {
  return authorizedClaimsForEvidence(projection, evidenceId)
    .map((claim) => claim.generationText)
    .filter(Boolean)
    .join(" ");
}

export function modelVisibleText(projection: ClaimProjection): string {
  return projection.authorized.map((claim) => claim.generationText).join("\n");
}

export function closedClaimFirewall(projection: ClaimProjection, plan: GenerationPlan) {
  const visibleText = modelVisibleText(projection);
  const usageInText = usageInstructionSpans(visibleText).length + temporalDescriptionSpans(visibleText).length;
  const guaranteeInText = guaranteeReferenceSpans(visibleText).length;
  const compositionInText = compositionPromotionClaims(visibleText).length;
  const pricingInText = collectVisible(visibleText, /\b(?:price|pricing|cost|discount|on sale|deal)\b/gi);
  const cautionInText = collectVisible(visibleText, /\bcaution|\bwarning|\ballergen|\bconsult(?:\s+with)?(?:\s+your)?\s+(?:doctor|physician|healthcare)\b/gi);
  const manufacturerInText = collectVisible(visibleText, /\bmanufacturer|\bmade in|\bgmp\b|\bfacility\b/gi);
  const resultsInText = collectVisible(visibleText, /\bhow long does it take to notice results\b|\bexpected results\b|\bresults in \d+\s+(?:days?|weeks?|months?)\b/gi);
  const categoryInText = collectVisible(visibleText, /\bdietary supplement\b|\bdaily supplement\b|\bjoint supplement\b/gi);
  const scienceInText = collectVisible(visibleText, /\bsynovial fluid is\b|\bnatural lubricant\b|\bcartilage\b|\bfriction\b/gi);
  const closedCount = (closed: boolean, n: number) => (closed ? n : 0);
  return {
    USAGE_INSTRUCTION_VISIBLE: usageInText,
    GUARANTEE_VISIBLE: guaranteeInText,
    PRICING_VISIBLE: pricingInText,
    CAUTION_VISIBLE: cautionInText,
    MANUFACTURER_VISIBLE: manufacturerInText,
    RESULTS_TIMELINE_VISIBLE: resultsInText,
    CATEGORY_CLASSIFICATION_VISIBLE: categoryInText,
    BACKGROUND_SCIENCE_VISIBLE: scienceInText,
    INGREDIENT_COMPOSITION_VISIBLE: compositionInText,
    TEMPORAL_DESCRIPTION_VISIBLE: temporalDescriptionSpans(visibleText).length,
    ACTUAL_MODEL_TEXT_AUDITED: true as const,
    TOTAL_VISIBLE_CLOSED_CLAIMS:
      closedCount(plan.closedTopics.includes("usage"), usageInText) +
      closedCount(plan.closedTopics.includes("guarantee"), guaranteeInText) +
      closedCount(plan.closedTopics.includes("pricing"), pricingInText) +
      closedCount(plan.closedTopics.includes("cautions"), cautionInText) +
      closedCount(plan.closedTopics.includes("manufacturer"), manufacturerInText) +
      closedCount(plan.closedTopics.includes("results_timeline"), resultsInText) +
      closedCount(plan.closedTopics.includes("category_classification"), categoryInText) +
      closedCount(plan.closedTopics.includes("background_science"), scienceInText) +
      closedCount(plan.closedTopics.includes("ingredients"), compositionInText),
  };
}

function collectVisible(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) || []).length;
}

export function editorialExpansionClaims(text: string, support: string): string[] {
  const supportLower = support.toLowerCase();
  const hits: string[] = [];
  const re = new RegExp(EDITORIAL_FRAMING.source, "gi");
  let match = re.exec(text);
  while (match) {
    if (!supportLower.includes(match[0].toLowerCase())) hits.push(match[0]);
    match = re.exec(text);
  }
  return hits;
}

export function resultsExpectationClaims(text: string): string[] {
  const re = new RegExp(RESULTS_EXPECTATION.source, "gi");
  const out: string[] = [];
  let match = re.exec(text);
  while (match) {
    out.push(match[0]);
    match = re.exec(text);
  }
  return out;
}

export function formatProjectedClaimsForPrompt(projection: ClaimProjection): string {
  const lines = [
    "PROJECTED CLAIMS — generation-authorized spans only. Restate these facts; do not restore excluded claims.",
  ];
  if (projection.authorized.length === 0) {
    lines.push("No authorized claims.");
    return lines.join("\n");
  }
  for (const claim of projection.authorized) {
    lines.push(
      `${claim.claimId} field=${claim.field} class=${claim.claimClass} compositionAuthority=${claim.compositionAuthority ? "YES" : "NO"} :: ${claim.generationText}`,
    );
  }
  return lines.join("\n");
}
