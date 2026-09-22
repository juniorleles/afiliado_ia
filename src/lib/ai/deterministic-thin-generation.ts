/**
 * THIN_DETERMINISTIC_GENERATION_V1
 *
 * Source-preserving consumer copy from authorized projected claims.
 * Claude does not generate THIN factual copy. Downstream gates still apply.
 */

import { STRUCTURED_CTA_LABELS } from "@/lib/ai/structured-generation";
import { isDeterministicThinRoute } from "@/lib/ai/generation-router";
import type { GenerationPlan } from "@/lib/ai/generation-plan";
import type { ClaimProjection } from "@/lib/ai/claim-projection";
import type { EvidenceSlot, EvidenceSlotPlan, SemanticAuthority } from "@/lib/ai/evidence-slot-plan";
import type { SlotFill } from "@/lib/ai/slot-generation";

export const DETERMINISTIC_THIN_METHOD = "DETERMINISTIC_THIN" as const;
export const DETERMINISTIC_THIN_CTA = STRUCTURED_CTA_LABELS[0];

const FORBIDDEN_HEADLINE_CLASSIFIERS =
  /\b(?:approach(?:es)?|solution|system|strategy|strategies)\b/i;

export type DeterministicSlotProvenance = {
  slotId: string;
  claimIds: string[];
  evidenceIds: string[];
  sourceField: string;
  semanticAuthority: SemanticAuthority;
  generationMethod: typeof DETERMINISTIC_THIN_METHOD;
};

export type DeterministicThinResult = {
  fills: SlotFill[];
  ctaLabel: string;
  provenance: DeterministicSlotProvenance[];
  omittedSlotIds: string[];
  generationMethod: typeof DETERMINISTIC_THIN_METHOD;
  anthropicCalls: 0;
};

export type DeterministicThinInput = {
  plan: GenerationPlan;
  slotPlan: EvidenceSlotPlan;
  projection: ClaimProjection;
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function authorizedProductName(projection: ClaimProjection, slotPlan: EvidenceSlotPlan): string {
  const identity = projection.authorized.find((claim) => claim.claimClass === "IDENTITY");
  if (identity?.generationText.trim()) return identity.generationText.trim();
  for (const slot of slotPlan.slots) {
    const named = slot.evidence.find((item) => item.field === "productName")?.value.trim();
    if (named) return named;
  }
  return "";
}

function authorizedText(slot: EvidenceSlot): string {
  return slot.evidence.map((item) => item.value.trim()).filter(Boolean).join(" ");
}

function supportHas(support: string, snippet: string): boolean {
  return normalizeKey(support).includes(normalizeKey(snippet));
}

function stripSeeHow(text: string, productName: string): string {
  const name = productName.trim();
  let out = text.trim();
  if (name) {
    out = out.replace(new RegExp(`^see how\\s+${escapeRegExp(name)}\\s+`, "i"), "");
  }
  out = out.replace(/^see how\s+/i, "");
  return out.trim();
}

function ensureSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function fitWords(text: string, maxWords: number, asHeadline = false): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (countWords(trimmed) <= maxWords) return trimmed;
  const sentences = splitSentences(trimmed);
  let kept = "";
  for (const sentence of sentences) {
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (countWords(next) <= maxWords) kept = next;
    else break;
  }
  if (kept) return kept;
  const words = trimmed.split(/\s+/).slice(0, maxWords);
  const cut = words.join(" ").replace(/[,:;]+$/, "");
  if (asHeadline) return cut;
  return /[.!?]$/.test(cut) ? cut : `${cut}.`;
}

function benefitPhrase(description: string, productName: string): string | null {
  const stripped = stripSeeHow(description, productName);
  const match = stripped.match(/^supports?\s+(.+)$/i);
  if (!match) return null;
  const object = match[1].trim().replace(/[.]+$/, "");
  if (!object) return null;
  if (FORBIDDEN_HEADLINE_CLASSIFIERS.test(object) && !supportHas(description, object.match(FORBIDDEN_HEADLINE_CLASSIFIERS)?.[0] || "")) {
    return null;
  }
  return `Support for ${object}`;
}

function headlineFromSlot(slot: EvidenceSlot, productName: string): string {
  const description = slot.evidence.find((item) => item.field === "description")?.value || "";
  if (productName && description) {
    const phrase = benefitPhrase(description, productName);
    if (phrase && !FORBIDDEN_HEADLINE_CLASSIFIERS.test(phrase)) {
      return fitWords(`${productName}: ${phrase}`, slot.maxWords, true);
    }
  }
  if (productName) return fitWords(productName, slot.maxWords, true);
  return fitWords(authorizedText(slot), slot.maxWords, true);
}

function summaryFromSlot(slot: EvidenceSlot, productName: string): string {
  const description = slot.evidence.find((item) => item.field === "description")?.value || authorizedText(slot);
  if (!description) return productName ? ensureSentence(productName) : "";
  const stripped = stripSeeHow(description, productName);
  if (/^supports?\b/i.test(stripped) && productName) {
    const restatement = stripped.replace(/^supports\b/i, "supporting").replace(/^support\b/i, "supporting");
    return fitWords(ensureSentence(`${productName} is described as ${restatement.replace(/[.]+$/, "")}`), slot.maxWords);
  }
  if (productName && normalizeKey(description) === normalizeKey(productName)) {
    return fitWords(productName, slot.maxWords);
  }
  return fitWords(ensureSentence(`The listing describes ${description.replace(/[.]+$/, "")}`), slot.maxWords);
}

function sourcePreserve(slot: EvidenceSlot): string {
  return fitWords(splitSentences(authorizedText(slot)).join(" "), slot.maxWords);
}

function faqQuestion(slot: EvidenceSlot, productName: string): string | null {
  const name = productName || "this product";
  if (slot.topic === "description") return `What does ${name} focus on?`;
  if (slot.topic === "features") return `What features are described for ${name}?`;
  if (slot.topic === "identity") return `What is ${name}?`;
  return null;
}

function faqAnswer(slot: EvidenceSlot, productName: string, used: Set<string>): string {
  const source = authorizedText(slot);
  if (slot.topic === "description") {
    const stripped = stripSeeHow(source, productName).replace(/^supports?\s+/i, "");
    const answer = fitWords(
      ensureSentence(`The listing describes ${stripped.replace(/^[A-Z]/, (ch) => ch.toLowerCase()).replace(/[.]+$/, "")}`),
      slot.maxWords,
    );
    return isDuplicate(answer, used) ? "" : answer;
  }
  const unused = splitSentences(source).find((sentence) => !isDuplicate(sentence, used));
  if (!unused) return "";
  return fitWords(ensureSentence(unused), slot.maxWords);
}

function provenanceFor(slot: EvidenceSlot): DeterministicSlotProvenance {
  return {
    slotId: slot.slotId,
    claimIds: [...slot.allowedClaimIds],
    evidenceIds: [...slot.allowedEvidenceIds],
    sourceField: [...new Set(slot.evidence.map((item) => item.field))].join(",") || "",
    semanticAuthority: slot.semanticAuthority,
    generationMethod: DETERMINISTIC_THIN_METHOD,
  };
}

function fillOf(slot: EvidenceSlot, content?: string, question?: string, answer?: string): SlotFill {
  return {
    slotId: slot.slotId,
    content,
    question,
    answer,
    generationMethod: DETERMINISTIC_THIN_METHOD,
  };
}

function isDuplicate(candidate: string, used: Set<string>): boolean {
  const key = normalizeKey(candidate);
  if (!key) return true;
  return used.has(key);
}

function remember(text: string, used: Set<string>) {
  for (const sentence of splitSentences(text)) {
    const key = normalizeKey(sentence);
    if (key) used.add(key);
  }
  const whole = normalizeKey(text);
  if (whole) used.add(whole);
}

export function generateDeterministicThinCopy(input: DeterministicThinInput): DeterministicThinResult {
  if (!isDeterministicThinRoute(input.plan)) {
    throw new Error("deterministicThinGenerator requires GenerationPlan.generationRoute=DETERMINISTIC_THIN");
  }

  const productName = authorizedProductName(input.projection, input.slotPlan);
  const used = new Set<string>();
  const fills: SlotFill[] = [];
  const provenance: DeterministicSlotProvenance[] = [];
  const omittedSlotIds: string[] = [];

  const emit = (slot: EvidenceSlot, fill: SlotFill) => {
    fills.push(fill);
    provenance.push(provenanceFor(slot));
    remember(fill.content || `${fill.question || ""} ${fill.answer || ""}`, used);
  };

  for (const slot of input.slotPlan.slots) {
    if (slot.type === "HEADLINE") {
      emit(slot, fillOf(slot, headlineFromSlot(slot, productName)));
      continue;
    }
    if (slot.type === "SUMMARY") {
      emit(slot, fillOf(slot, summaryFromSlot(slot, productName)));
      continue;
    }
    if (slot.type === "OVERVIEW") {
      omittedSlotIds.push(slot.slotId);
      continue;
    }
    if (slot.type === "FINAL_THOUGHTS") {
      omittedSlotIds.push(slot.slotId);
      continue;
    }
    if (slot.type === "FAQ") {
      const question = faqQuestion(slot, productName);
      if (!question) {
        omittedSlotIds.push(slot.slotId);
        continue;
      }
      const answer = faqAnswer(slot, productName, used);
      if (!answer || isDuplicate(answer, used)) {
        omittedSlotIds.push(slot.slotId);
        continue;
      }
      emit(slot, fillOf(slot, undefined, question, answer));
      continue;
    }
    const copy = sourcePreserve(slot);
    if (!copy) {
      if (slot.required) emit(slot, fillOf(slot, productName || authorizedText(slot)));
      else omittedSlotIds.push(slot.slotId);
      continue;
    }
    emit(slot, fillOf(slot, copy));
  }

  return {
    fills,
    ctaLabel: DETERMINISTIC_THIN_CTA,
    provenance,
    omittedSlotIds,
    generationMethod: DETERMINISTIC_THIN_METHOD,
    anthropicCalls: 0,
  };
}
