/**
 * GENERIC_EVIDENCE_RECOVERY_V1 — FAQ Q/A pair promotion.
 *
 * Promotes only USAGE, GUARANTEE/return-policy, and manufacturer identity
 * when a Q/A pair (or an unambiguous FAQ answer) supports that field.
 * Ingredients, authority language, and absence claims stay closed.
 */

import {
  firstSentences,
  isAbsenceClaimLanguage,
  isAuthorityLanguage,
  isFactualGuarantee,
  isGuaranteeQuestion,
  isIngredientQuestion,
  isManufacturerQuestion,
  isManufacturerStatement,
  isPolicyNavigationCta,
  isSupportProviderQuestion,
  isSupportProviderStatement,
  isUsageInstruction,
  isUsageQuestion,
  normalizeUsageInstruction,
  peelNonPolicyColonLabel,
  selectFactualGuarantee,
} from "@/lib/import-heuristics";
import { withImportQuality, type ProductFacts, type SourceFact } from "@/lib/product-facts";

export type FaqQaPair = {
  question: string;
  answer: string;
};

export type FaqPromotionRow = {
  value: string;
  evidence: string;
  question: string;
};

export type FaqPromotion = {
  usage: FaqPromotionRow[];
  guarantee: FaqPromotionRow[];
  manufacturer: FaqPromotionRow[];
  schemaRelationshipLimitations: string[];
};

const SCHEMA_SUPPORT_PROVIDER =
  "SCHEMA_RELATIONSHIP_LIMITATION: support-provider identity is not stored as manufacturer.";

export function splitEmbeddedQa(text: string): FaqQaPair {
  const t = text.replace(/\s+/g, " ").trim();
  const qIndex = t.indexOf("?");
  if (qIndex > 0 && qIndex < t.length - 1) {
    const question = t.slice(0, qIndex + 1).trim();
    const answer = t.slice(qIndex + 1).replace(/^[\s\-–:]+/, "").trim();
    if (answer.length >= 8) return { question, answer };
  }
  return { question: "", answer: t };
}

function directedUsage(answer: string): string | null {
  const trimmed = answer.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const first = firstSentences(trimmed, 1);
  for (const candidate of [first, trimmed]) {
    const normalized = normalizeUsageInstruction(candidate);
    if (isUsageInstruction(candidate) || isUsageInstruction(normalized)) return normalized;
  }
  return null;
}

function policyText(answer: string): string | null {
  const trimmed = peelNonPolicyColonLabel(answer.replace(/\s+/g, " ").trim());
  if (!trimmed || isPolicyNavigationCta(trimmed) || !isFactualGuarantee(trimmed)) return null;
  const first = firstSentences(trimmed, 1);
  return isFactualGuarantee(first) ? first : firstSentences(trimmed, 2);
}

export function classifyFaqQaPair(pair: FaqQaPair):
  | { kind: "usage"; row: FaqPromotionRow }
  | { kind: "guarantee"; row: FaqPromotionRow }
  | { kind: "manufacturer"; row: FaqPromotionRow }
  | { kind: "schema_limitation"; message: string }
  | { kind: "skip" } {
  const question = (pair.question ?? "").replace(/\s+/g, " ").trim();
  const answer = (pair.answer ?? "").replace(/\s+/g, " ").trim();
  if (!answer) return { kind: "skip" };

  if (isIngredientQuestion(question)) return { kind: "skip" };
  if (isAuthorityLanguage(question) || isAuthorityLanguage(answer)) return { kind: "skip" };
  if (isAbsenceClaimLanguage(answer) && !directedUsage(answer) && !policyText(answer)) {
    return { kind: "skip" };
  }

  if (isSupportProviderQuestion(question) || (isSupportProviderStatement(answer) && !isManufacturerQuestion(question))) {
    return { kind: "schema_limitation", message: SCHEMA_SUPPORT_PROVIDER };
  }

  const usageValue = directedUsage(answer);
  if (usageValue && (!question || isUsageQuestion(question))) {
    return {
      kind: "usage",
      row: { value: usageValue, evidence: answer, question },
    };
  }

  const guaranteeValue = policyText(answer);
  if (guaranteeValue) {
    const questionBlocks =
      Boolean(question) &&
      (isUsageQuestion(question) || isIngredientQuestion(question) || isManufacturerQuestion(question));
    if (!questionBlocks && (!question || isGuaranteeQuestion(question) || isFactualGuarantee(answer))) {
      return {
        kind: "guarantee",
        row: { value: guaranteeValue, evidence: answer, question },
      };
    }
  }

  if (
    isManufacturerStatement(answer) &&
    !isSupportProviderStatement(answer) &&
    (!question || isManufacturerQuestion(question))
  ) {
    return {
      kind: "manufacturer",
      row: { value: firstSentences(answer, 1), evidence: answer, question },
    };
  }

  return { kind: "skip" };
}

export function promotionsFromFaqPairs(pairs: FaqQaPair[]): FaqPromotion {
  const promo: FaqPromotion = {
    usage: [],
    guarantee: [],
    manufacturer: [],
    schemaRelationshipLimitations: [],
  };
  const seen = new Set<string>();
  for (const pair of pairs) {
    const classified = classifyFaqQaPair(pair);
    if (classified.kind === "schema_limitation") {
      if (!promo.schemaRelationshipLimitations.includes(classified.message)) {
        promo.schemaRelationshipLimitations.push(classified.message);
      }
      continue;
    }
    if (classified.kind === "skip") continue;
    const key = `${classified.kind}:${classified.row.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    promo[classified.kind].push(classified.row);
  }
  return promo;
}

function snippet(
  field: string,
  text: string,
  sourceUrl: string,
  confidence: SourceFact["confidence"],
  extra?: { question?: string; context?: string },
): SourceFact {
  return {
    field,
    text,
    sourceUrl,
    confidence,
    ...(extra?.question ? { question: extra.question } : {}),
    ...(extra?.context ? { context: extra.context } : {}),
  };
}

function alreadyHas(values: string[], candidate: string): boolean {
  const key = candidate.replace(/\s+/g, " ").trim().toLowerCase();
  return values.some((item) => item.replace(/\s+/g, " ").trim().toLowerCase() === key);
}

/**
 * Second pass over stored FAQ snippets. Safe to run on already-extracted
 * ProductFacts (replay) and after HTML extraction (idempotent).
 */
export function applyGenericFaqRecovery(facts: ProductFacts): ProductFacts {
  const next: ProductFacts = {
    ...facts,
    features: [...facts.features],
    ingredientsOrComponents: [...facts.ingredientsOrComponents],
    usageInformation: [...facts.usageInformation],
    cautions: [...facts.cautions],
    sourceSnippets: [...facts.sourceSnippets],
    importWarnings: [...facts.importWarnings],
    confidence: { ...facts.confidence },
  };

  const faqPairs = next.sourceSnippets
    .filter((item) => item.field === "faq" && item.text.trim())
    .map((item) => splitEmbeddedQa(item.text));
  const promo = promotionsFromFaqPairs(faqPairs);
  const sourceUrl = next.sourceUrl ?? "";

  for (const row of promo.usage) {
    if (alreadyHas(next.usageInformation, row.value)) continue;
    next.usageInformation.push(row.value);
    next.sourceSnippets.push(
      snippet("usageInformation", row.evidence, sourceUrl, "DIRECT_SOURCE", {
        question: row.question,
        context: "faq",
      }),
    );
  }
  if (next.usageInformation.length > 0) {
    next.confidence.usageInformation = "DIRECT_SOURCE";
  }

  const guaranteeCandidates = [next.guaranteeInformation, ...promo.guarantee.map((row) => row.value)];
  const pickedGuarantee = selectFactualGuarantee(guaranteeCandidates);
  if (pickedGuarantee) {
    const fromFaq = promo.guarantee.find(
      (row) =>
        row.value.replace(/\s+/g, " ").trim().toLowerCase() === pickedGuarantee.replace(/\s+/g, " ").trim().toLowerCase(),
    );
    next.guaranteeInformation = pickedGuarantee.slice(0, 240);
    next.confidence.guaranteeInformation = "DIRECT_SOURCE";
    next.sourceSnippets = next.sourceSnippets.filter((item) => item.field !== "guaranteeInformation");
    next.sourceSnippets.push(
      snippet("guaranteeInformation", fromFaq?.evidence ?? pickedGuarantee, sourceUrl, "DIRECT_SOURCE", {
        question: fromFaq?.question,
        context: fromFaq ? "faq" : undefined,
      }),
    );
  } else if (next.guaranteeInformation && isPolicyNavigationCta(next.guaranteeInformation)) {
    next.guaranteeInformation = undefined;
    next.confidence.guaranteeInformation = "NOT_FOUND";
    next.sourceSnippets = next.sourceSnippets.filter((item) => item.field !== "guaranteeInformation");
  }

  if (!next.manufacturer && promo.manufacturer[0]) {
    const row = promo.manufacturer[0];
    next.manufacturer = row.value.slice(0, 120);
    next.confidence.manufacturer = "DIRECT_SOURCE";
    next.sourceSnippets.push(
      snippet("manufacturer", row.evidence, sourceUrl, "DIRECT_SOURCE", {
        question: row.question,
        context: "faq",
      }),
    );
  }

  for (const message of promo.schemaRelationshipLimitations) {
    if (!next.importWarnings.includes(message)) next.importWarnings.push(message);
  }

  return withImportQuality(next);
}
