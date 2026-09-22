/**
 * MODEL_ROUTE_EVIDENCE_SLOT_AUTHORITY_V1
 *
 * CODE owns field/topic/claim assignment. The MODEL owns wording only.
 * Do not route RICH through deterministic THIN. Do not weaken validators.
 */

import type { GenerationPlan, GenerationTopic } from "@/lib/ai/generation-plan";
import {
  hasGuaranteeReferenceLanguage,
  hasUsageAuthorityLanguage,
} from "@/lib/ai/generation-plan";
import type { EvidenceSlot, EvidenceSlotType, SemanticAuthority } from "@/lib/ai/evidence-slot-plan";
import { editorialExpansionClaims } from "@/lib/ai/claim-projection";
import { hasCompositionPromotionLanguage, namedIngredientMentions, unsupportedRelationalExpansions } from "@/lib/ai/ingredient-claims";
import { semanticClosureViolations } from "@/lib/ai/semantic-closure";
import { forbiddenTopicsForSlot } from "@/lib/ai/slot-projection-isolation";
import type { StructuralViolation } from "@/lib/ai/structured-generation";

export const MODEL_AUTHORITY_OPERATIONS = [
  "PARAPHRASE",
  "COMPRESS",
  "SAME_SLOT_COMBINE",
  "IDENTITY_AS_SUBJECT",
] as const;

export type ModelAuthorityOperation = (typeof MODEL_AUTHORITY_OPERATIONS)[number];

export type ModelSlotAuthority = {
  slotId: string;
  slotType: EvidenceSlotType;
  allowedField: string;
  allowedClaimIds: string[];
  allowedEvidenceIds: string[];
  projectedSourceText: string[];
  allowedOperations: ModelAuthorityOperation[];
  forbiddenTopics: GenerationTopic[];
  semanticAuthority: SemanticAuthority;
};

const TOPIC_FIELD: Record<string, string> = {
  identity: "productName",
  description: "description",
  features: "features",
  ingredients: "ingredientsOrComponents",
  usage: "usageInformation",
  cautions: "cautions",
  pricing: "pricingInformation",
  guarantee: "guaranteeInformation",
  manufacturer: "manufacturer",
};

const ATTRIBUTION_AUTHORITY =
  /\b(?:the\s+)?(?:manufacturer|manufacturers|doctor|doctors|experts?|company|brand)\s+(?:recommends?|recommended|states?|stated|says|advises?|advised)\b|\b(?:officially|clinically)\s+recommended\b/gi;

export function fieldForTopic(topic: string): string {
  return TOPIC_FIELD[topic] || "description";
}

export function createModelSlotAuthority(slot: EvidenceSlot, _plan: GenerationPlan): ModelSlotAuthority {
  return {
    slotId: slot.slotId,
    slotType: slot.type,
    allowedField: fieldForTopic(slot.topic),
    allowedClaimIds: [...slot.allowedClaimIds],
    allowedEvidenceIds: [...slot.allowedEvidenceIds],
    projectedSourceText: slot.evidence.map((item) => item.value),
    allowedOperations: [...MODEL_AUTHORITY_OPERATIONS],
    forbiddenTopics: forbiddenTopicsForSlot(slot),
    semanticAuthority: slot.semanticAuthority,
  };
}

export function formatModelSlotAuthorityForPrompt(authorities: ModelSlotAuthority[]): string {
  const lines = [
    "MODEL SLOT AUTHORITY — CODE owns meaning. MODEL owns wording only.",
    "Allowed operations: conservative paraphrase, compression, combining grammar-compatible claims assigned to the SAME slot, using the product name as grammatical subject.",
    "Forbidden: new predicates, invented relationships, attribution not in the slot text, editorial characterization, cross-field promotion, closed-topic facts, treating identity as ingredient evidence.",
    "Return only slotId plus consumer wording (FAQ: question + answer). Do not choose evidence IDs, claim IDs, fields, or topics.",
    "IDENTITY slots may use the product name as a grammatical subject or title only. They do not authorize ingredients, usage, guarantee, manufacturer, or other field facts.",
  ];
  for (const slot of authorities) {
    lines.push(
      `AUTHORITY ${slot.slotId} type=${slot.slotType} field=${slot.allowedField} semanticAuthority=${slot.semanticAuthority} claims=${slot.allowedClaimIds.join(",") || "none"} evidence=${slot.allowedEvidenceIds.join(",") || "none"} :: ${slot.projectedSourceText.join(" / ")}`,
    );
  }
  return lines.join("\n");
}

export function identityUsedAsComposition(text: string, productName: string): boolean {
  const name = productName.trim();
  if (name.length < 2) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const object = new RegExp(
    `\\b(?:ingredients?(?:\\s+include[sd]?)?|contains|formula contains|made with|formulated with)\\s+${escaped}\\b`,
    "i",
  );
  const copula = new RegExp(`\\b${escaped}\\s+is an ingredient\\b`, "i");
  return object.test(text) || copula.test(text);
}

export function unauthorizedAttributionClaims(text: string, support: string): string[] {
  const supportLower = support.toLowerCase();
  const hits: string[] = [];
  const re = new RegExp(ATTRIBUTION_AUTHORITY.source, "gi");
  let match = re.exec(text);
  while (match) {
    if (!supportLower.includes(match[0].toLowerCase())) hits.push(match[0]);
    match = re.exec(text);
  }
  return hits;
}

function normalizeAuthorityText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const CAUSAL_STEMS: Array<{ pattern: RegExp; stem: string }> = [
  { pattern: /\bsupports?\b|\bsupporting\b/gi, stem: "support" },
  { pattern: /\bhelps?\b|\bhelping\b/gi, stem: "help" },
  { pattern: /\bimproves?\b|\bimproving\b/gi, stem: "improve" },
  { pattern: /\bboosts?\b|\bboosting\b/gi, stem: "boost" },
  { pattern: /\benhances?\b|\benhancing\b/gi, stem: "enhance" },
  { pattern: /\bpromotes?\b|\bpromoting\b/gi, stem: "promote" },
  { pattern: /\bworks with\b/gi, stem: "works with" },
];

const STRONGER_HELP_OUTCOME =
  /\bhelps?\s+(?:to\s+)?(?:cause|repair|heal|cure|treat|fix|reverse|regrow|restore)\b/i;

function authoritySentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

function supportObjectCovered(objectText: string, support: string): boolean {
  const tokens = objectText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !/^(the|and|for|with|that|this|joint|its|their)$/.test(token));
  if (tokens.length === 0) return false;
  const hay = support.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

/**
 * `help` is not a global synonym of `support`.
 * It is the same authorized support relation only inside the sentence that states it:
 * same object, no new actor, no stronger outcome.
 * `help maintain` is not a new support→maintain equivalence; the stem is dropped only
 * when that same sentence already restates an authorized support clause. The maintain
 * predicate stays visible to semantic closure and the wording constraint.
 */
function helpExpressesAuthorizedSupport(sentence: string, support: string): boolean {
  if (!/\bsupports?\b|\bsupporting\b/i.test(support)) return false;
  if (STRONGER_HELP_OUTCOME.test(sentence)) return false;
  const actor = sentence.match(/\b([A-Z][A-Za-z0-9®\-]*)\s+helps?\b/);
  if (actor && !/^(Designed|This|The|It)$/.test(actor[1])) {
    const subject = actor[1];
    const subjectSupports = new RegExp(
      `\\b${subject}\\b[^.]{0,100}\\bsupports?\\b|\\bsupports?\\b[^.]{0,60}\\b${subject}\\b`,
      "i",
    ).test(support);
    if (!subjectSupports) return false;
  }
  const hedge = sentence.match(
    /\b(?:designed to help(?:\s+to)?\s+support|helps?(?:\s+to)?\s+support)\s+([^.,;]{0,80})/i,
  );
  if (hedge && supportObjectCovered(hedge[1] || "", support)) return true;
  const restated = sentence.match(/\bsupports?\s+([^.,;]{0,80})/i);
  if (!restated || !supportObjectCovered(restated[1] || "", support)) return false;
  return /\bhelps?\b|\bhelping\b/i.test(sentence);
}

function helpStemIsContextualSupport(text: string, support: string): boolean {
  const sentences = authoritySentences(text).filter((sentence) => /\bhelps?\b|\bhelping\b/i.test(sentence));
  return sentences.length > 0 && sentences.every((sentence) => helpExpressesAuthorizedSupport(sentence, support));
}

export function unauthorizedCausalPredicates(text: string, support: string): string[] {
  const supportParts = support.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const supportNormParts = supportParts.map(normalizeAuthorityText);
  const hits: string[] = [];
  for (const item of CAUSAL_STEMS) {
    item.pattern.lastIndex = 0;
    if (!item.pattern.test(text)) continue;
    item.pattern.lastIndex = 0;
    if (item.stem === "help" && helpStemIsContextualSupport(text, support)) continue;
    const inSupport = supportNormParts.some((part) => part.includes(item.stem)) || new RegExp(item.pattern.source, "i").test(support);
    if (!inSupport) hits.push(item.stem);
  }
  const binding = /\b(?:[Ii]ngredient\s+)?([A-Z][A-Za-z0-9®\-]*)\s+(supports?|helps?)\s+([A-Za-z][A-Za-z\-]*(?:\s+[A-Za-z][A-Za-z\-]*){0,3})/g;
  let match = binding.exec(text);
  while (match) {
    const verb = match[2].toLowerCase();
    const objectText = match[3];
    if (verb.startsWith("help") && /^supports?\b/i.test(objectText)) {
      match = binding.exec(text);
      continue;
    }
    const pair = normalizeAuthorityText(`${match[1]} supports ${objectText}`);
    const alt = normalizeAuthorityText(`${match[1]} support ${objectText}`);
    const helpPair = normalizeAuthorityText(`${match[1]} helps ${objectText}`);
    const entailed = supportNormParts.some(
      (part) => part.includes(pair) || part.includes(alt) || part.includes(helpPair),
    );
    if (!entailed) hits.push(match[0]);
    match = binding.exec(text);
  }
  return [...new Set(hits)];
}

export function countModelSlotAuthorityViolations(violations: StructuralViolation[]): number {
  const codes = new Set([
    "EDITORIAL_EXPANSION",
    "UNSUPPORTED_RELATIONAL_EXPANSION",
    "ATTRIBUTION_AUTHORITY",
    "IDENTITY_AS_COMPOSITION",
    "USAGE_PROMOTION",
    "GUARANTEE_PROMOTION",
    "COMPOSITION_PROMOTION",
    "SEMANTIC_CLOSURE",
    "CLOSED_TOPIC",
    "QUESTION_SEMANTICS",
    "RESULTS_FRAMING",
  ]);
  return violations.filter((item) => codes.has(item.code)).length;
}

export function validateModelSlotAuthority(input: {
  copy: string;
  slot: EvidenceSlot;
  plan: GenerationPlan;
  productName: string;
}): StructuralViolation[] {
  const authority = createModelSlotAuthority(input.slot, input.plan);
  const support = authority.projectedSourceText.join("\n");
  const copy = input.copy;
  const violations: StructuralViolation[] = [];
  const push = (code: string, text: string, reason: string, requiredField?: string) => {
    violations.push({ code, text, reason, requiredField });
  };

  if (authority.semanticAuthority !== "USAGE" && hasUsageAuthorityLanguage(copy)) {
    push("USAGE_PROMOTION", copy, "slot authority does not include USAGE", "usageInformation");
  }
  if (authority.semanticAuthority !== "INGREDIENTS" && hasCompositionPromotionLanguage(copy)) {
    push(
      "COMPOSITION_PROMOTION",
      copy,
      "slot authority does not include ingredient composition",
      "ingredientsOrComponents",
    );
  }
  if (authority.semanticAuthority !== "INGREDIENTS") {
    for (const hit of namedIngredientMentions(copy, { productName: input.productName })) {
      push(
        "COMPOSITION_PROMOTION",
        hit,
        "named ingredient language is not assigned to this slot",
        "ingredientsOrComponents",
      );
    }
  }
  if (authority.semanticAuthority !== "GUARANTEE" && hasGuaranteeReferenceLanguage(copy)) {
    push("GUARANTEE_PROMOTION", copy, "slot authority does not include guarantee", "guaranteeInformation");
  }
  if (
    authority.semanticAuthority !== "MANUFACTURER" &&
    /\bmanufactur(?:er|ed by|ing)\b/i.test(copy) &&
    !/\bmanufactur(?:er|ed by|ing)\b/i.test(support)
  ) {
    push("CLOSED_TOPIC", copy, "manufacturer attribution is not assigned to this slot", "manufacturer");
  }

  for (const hit of editorialExpansionClaims(copy, support)) {
    push("EDITORIAL_EXPANSION", hit, "NEW_EDITORIAL_PREDICATE: characterization is not entailed by assigned claims");
  }
  for (const hit of unsupportedRelationalExpansions(copy, support)) {
    push("UNSUPPORTED_RELATIONAL_EXPANSION", hit, "relationship is not entailed by assigned projected evidence");
  }
  for (const hit of unauthorizedAttributionClaims(copy, support)) {
    push("ATTRIBUTION_AUTHORITY", hit, "attribution predicate is not in assigned projected evidence");
  }
  for (const hit of unauthorizedCausalPredicates(copy, support)) {
    push("UNSUPPORTED_RELATIONAL_EXPANSION", hit, "relationship is not entailed by assigned projected evidence");
  }
  if (identityUsedAsComposition(copy, input.productName)) {
    push(
      "IDENTITY_AS_COMPOSITION",
      copy,
      "product identity is not ingredient/composition evidence",
      "ingredientsOrComponents",
    );
  }
  const closureText = copy;
  for (const hit of semanticClosureViolations(closureText, support, input.slot.type, true)) {
    push("SEMANTIC_CLOSURE", hit.text, hit.code);
  }
  return violations;
}
