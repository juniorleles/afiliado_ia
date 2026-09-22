/**
 * FAQ question semantic validation. A question is not automatically a factual
 * assertion. Neutral information requests may pass. Presuppositions, comparisons,
 * timelines, usage, guarantee, composition, and medical/mechanism claims fail
 * unless the assigned slot evidence authorizes them.
 *
 * Does not classify with a model. Does not replace FAQ answer Grounding.
 */

import type { GenerationTopic } from "@/lib/ai/generation-plan";
import { hasGuaranteeReferenceLanguage, hasUsageAuthorityLanguage } from "@/lib/ai/generation-plan";
import { hasCompositionPromotionLanguage } from "@/lib/ai/ingredient-claims";

export const FAQ_QUESTION_CLASSES = [
  "NEUTRAL_INFORMATION_REQUEST",
  "FACTUAL_PRESUPPOSITION",
  "COMPARATIVE_PRESUPPOSITION",
  "RESULTS_TIMELINE_PRESUPPOSITION",
  "USAGE_PRESUPPOSITION",
  "GUARANTEE_PRESUPPOSITION",
  "COMPOSITION_PRESUPPOSITION",
  "MEDICAL_PRESUPPOSITION",
  "OTHER_FACTUAL_PRESUPPOSITION",
] as const;

export type FaqQuestionClass = (typeof FAQ_QUESTION_CLASSES)[number];

export type FaqQuestionValidation = {
  question: string;
  questionClass: FaqQuestionClass;
  topic: GenerationTopic | "unknown";
  closedTopicReferences: string[];
  factualPresuppositions: string[];
  comparativePresuppositions: string[];
  semanticResult: "PASS" | "FAIL";
  failCodes: string[];
};

export type FaqQuestionContext = {
  question: string;
  topic?: GenerationTopic | string;
  /** Pre-assigned FAQ item field. Not inferred from the question. */
  field?: string;
  /** Pre-assigned semantic authority for this FAQ item only. */
  semanticAuthority?: string;
  /** Pre-assigned topics for this FAQ item only. Not the global open-topic set. */
  authorizedTopics?: readonly string[];
  slotId?: string;
  closedTopics?: readonly string[];
  supportText?: string;
  productName?: string;
};

const COMPARATIVE =
  /\b(?:better than|worse than|superior to|different from|compared to|versus|\bvs\.?\b|competitors?|other (?:products?|supplements?|formulas?)|quick[- ]fix|unique among|unlike other|stands out from)\b/i;

const RESULTS_TIMELINE =
  /\b(?:how quickly|how soon|how long (?:until|before|does|until)|when (?:will|do|does) (?:results|it work)|results expectations?|expected results|effect onset|time[- ]to[- ](?:effect|results)|long[- ]term results|overnight results|when results appear)\b/i;

const USAGE_QUESTION =
  /\b(?:how|when) (?:should|do|does|can|to) (?:you |i |one )?(?:take|use|dose)\b|\bwhat (?:is the )?(?:dosage|dose|regimen|directions?|serving)\b|\bhow (?:often|many times)\b/i;

const PLAIN_USAGE_ASK =
  /^(?:how|when) (?:should|do|does|can|to) (?:you |i |one )?(?:take|use|dose)\b[^?]{0,80}\?$/i;

const GUARANTEE_QUESTION =
  /\b(?:how long (?:is|does) (?:the )?(?:guarantee|refund|warranty)|guarantee last|refund (?:period|policy|window)|money[- ]back|return policy|refund policy)\b/i;

const PLAIN_POLICY_ASK =
  /^(?:what is(?: the)?|what's(?: the)?|does .+\bpublish(?: a)?)\s+(?:a |the )?(?:\d+\s*[- ]?days?\s+)?(?:return policy|refund policy)\b[^?]{0,40}\?$/i;

const POLICY_STRENGTHENING =
  /\bmoney[\s-]?back\b|\bfull refund\b|\brisk[\s-]?free\b|\bsatisfaction guarantee\b|\bguaranteed\b|\bgenerous\b|\bclaim\b/gi;

const QUESTION_EDITORIAL =
  /\b(?:simple|straightforward|easy|convenient|generous|appealing|comprehensive)\b/gi;

const MANUFACTURER_QUESTION = /\bwho (?:manufactures|makes|produces)\b|\bmanufactured by\b/i;

const FIELD_TOPIC: Record<string, GenerationTopic> = {
  productName: "identity",
  description: "description",
  features: "features",
  ingredientsOrComponents: "ingredients",
  usageInformation: "usage",
  cautions: "cautions",
  pricingInformation: "pricing",
  guaranteeInformation: "guarantee",
  manufacturer: "manufacturer",
};

const AUTHORITY_TOPIC: Record<string, GenerationTopic> = {
  IDENTITY: "identity",
  DESCRIPTION: "description",
  FEATURE_DESCRIPTION: "features",
  INGREDIENTS: "ingredients",
  USAGE: "usage",
  CAUTIONS: "cautions",
  PRICING: "pricing",
  GUARANTEE: "guarantee",
  MANUFACTURER: "manufacturer",
};

const COMPOSITION_QUESTION =
  /\bwhat (?:antioxidants?|ingredients?|components?|compounds?) (?:does|do|are|is)\b|\bwhich (?:antioxidants?|ingredients?)\b|\b(?:antioxidants?|ingredients?) (?:does it )?contain\b|\bingredient list\b/i;

const MEDICAL_QUESTION =
  /\b(?:reduce[s]? inflammation|relieves? pain|treats?|cures?|heals?|diagnos(?:e|is)|how does (?:it|this) (?:work to |reduce|treat|cure|heal))\b/i;

const EFFICACY_QUESTION =
  /\bwhy is \w[\w\s-]{0,40}\beffective\b|\bwhy are (?:these |the )?(?:ingredients|components|strains)\s+effective\b|\bhow (?:well|effective) (?:is|does)\b|\bdoes it work\b|\bwhy does it work\b|\bis \w[\w\s-]{0,40}\beffective\b|\bdoes \w[\w\s-]{0,40} work\??$/i;

const NEUTRAL_FOCUS = /^what does .+ focus on\??$/i;
const NEUTRAL_DESCRIBED_SUPPORTING = /^what is .+ described as supporting\??$/i;
const NEUTRAL_DESCRIPTION_SAY = /^what does the (?:product )?description say(?: about .+)?\??$/i;
const NEUTRAL_FEATURES_DESCRIBED = /^what features are described(?: for .+)?\??$/i;
const NEUTRAL_WHAT_SUPPORT = /^what does .+ support\??$/i;
const YESNO_SUPPORT = /^does .+ support .+\??$/i;
const YESNO_DESIGNED = /^is .+ designed for .+\??$/i;

function closedHits(question: string, closedTopics: readonly string[]): string[] {
  const hits: string[] = [];
  if (closedTopics.includes("usage") && (USAGE_QUESTION.test(question) || hasUsageAuthorityLanguage(question))) {
    hits.push("usage");
  }
  if (closedTopics.includes("guarantee") && (GUARANTEE_QUESTION.test(question) || hasGuaranteeReferenceLanguage(question))) {
    hits.push("guarantee");
  }
  if (closedTopics.includes("ingredients") && (COMPOSITION_QUESTION.test(question) || hasCompositionPromotionLanguage(question))) {
    hits.push("ingredients");
  }
  if (closedTopics.includes("results_timeline") && RESULTS_TIMELINE.test(question)) {
    hits.push("results_timeline");
  }
  return hits;
}

function requestedTopic(question: string): GenerationTopic | "unknown" {
  if (NEUTRAL_FEATURES_DESCRIBED.test(question.trim()) || /\bfeatures are described\b/i.test(question)) return "features";
  if (NEUTRAL_DESCRIPTION_SAY.test(question.trim()) || NEUTRAL_FOCUS.test(question.trim()) || NEUTRAL_DESCRIBED_SUPPORTING.test(question.trim())) {
    return "description";
  }
  if (YESNO_DESIGNED.test(question.trim())) return "features";
  if (YESNO_SUPPORT.test(question.trim()) || NEUTRAL_WHAT_SUPPORT.test(question.trim())) return "description";
  return "unknown";
}

function topicAllowed(slotTopic: string | undefined, asked: GenerationTopic | "unknown"): boolean {
  if (!slotTopic || asked === "unknown") return true;
  if (slotTopic === asked) return true;
  if (asked === "description" && (slotTopic === "identity" || slotTopic === "description")) return true;
  if (asked === "features" && slotTopic === "features") return true;
  return false;
}

function localAuthority(input: FaqQuestionContext): Set<string> {
  const topics = new Set<string>();
  for (const topic of input.authorizedTopics || []) {
    if (topic) topics.add(topic);
  }
  if (input.topic) topics.add(String(input.topic));
  const fromField = input.field ? FIELD_TOPIC[input.field] : undefined;
  if (fromField) topics.add(fromField);
  const fromAuthority = input.semanticAuthority ? AUTHORITY_TOPIC[input.semanticAuthority] : undefined;
  if (fromAuthority) topics.add(fromAuthority);
  return topics;
}

function supportHasPattern(support: string, pattern: RegExp): boolean {
  return new RegExp(pattern.source, pattern.flags.includes("i") ? "i" : "").test(support);
}

function collectMissing(question: string, support: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const missing: string[] = [];
  let match = re.exec(question);
  while (match) {
    if (!supportHasPattern(support, new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))) missing.push(match[0]);
    if (match.index === re.lastIndex) re.lastIndex += 1;
    match = re.exec(question);
  }
  return missing;
}

function supportContains(support: string, snippet: string): boolean {
  const hay = support.toLowerCase();
  const tokens = snippet
    .toLowerCase()
    .replace(/[?.,!;:]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !/^(does|what|this|that|with|from|your|about|joint|genesis)$/i.test(token));
  if (tokens.length === 0) return hay.includes(snippet.toLowerCase().slice(0, 24));
  const hits = tokens.filter((token) => hay.includes(token)).length;
  return hits >= Math.min(2, tokens.length) || (tokens.length === 1 && hits === 1);
}

function classifyCore(question: string): { questionClass: FaqQuestionClass; factual: string[]; comparative: string[] } {
  const q = question.trim();
  const factual: string[] = [];
  const comparative: string[] = [];
  if (COMPARATIVE.test(q)) {
    const hit = q.match(COMPARATIVE)?.[0] || q;
    comparative.push(hit);
    return { questionClass: "COMPARATIVE_PRESUPPOSITION", factual, comparative };
  }
  if (RESULTS_TIMELINE.test(q)) {
    factual.push(q.match(RESULTS_TIMELINE)?.[0] || q);
    return { questionClass: "RESULTS_TIMELINE_PRESUPPOSITION", factual, comparative };
  }
  if (USAGE_QUESTION.test(q) || hasUsageAuthorityLanguage(q)) {
    factual.push(q.match(USAGE_QUESTION)?.[0] || "usage");
    return { questionClass: "USAGE_PRESUPPOSITION", factual, comparative };
  }
  if (GUARANTEE_QUESTION.test(q) || hasGuaranteeReferenceLanguage(q)) {
    factual.push(q.match(GUARANTEE_QUESTION)?.[0] || "guarantee");
    return { questionClass: "GUARANTEE_PRESUPPOSITION", factual, comparative };
  }
  if (COMPOSITION_QUESTION.test(q)) {
    factual.push(q.match(COMPOSITION_QUESTION)?.[0] || "composition");
    return { questionClass: "COMPOSITION_PRESUPPOSITION", factual, comparative };
  }
  if (MEDICAL_QUESTION.test(q)) {
    factual.push(q.match(MEDICAL_QUESTION)?.[0] || q);
    return { questionClass: "MEDICAL_PRESUPPOSITION", factual, comparative };
  }
  if (EFFICACY_QUESTION.test(q)) {
    factual.push(q.match(EFFICACY_QUESTION)?.[0] || "effective");
    return { questionClass: "FACTUAL_PRESUPPOSITION", factual, comparative };
  }
  if (
    NEUTRAL_FOCUS.test(q) ||
    NEUTRAL_DESCRIBED_SUPPORTING.test(q) ||
    NEUTRAL_DESCRIPTION_SAY.test(q) ||
    NEUTRAL_FEATURES_DESCRIBED.test(q) ||
    NEUTRAL_WHAT_SUPPORT.test(q) ||
    /^what \w[\w\s-]{0,48} (?:is|are) described\??$/i.test(q)
  ) {
    return { questionClass: "NEUTRAL_INFORMATION_REQUEST", factual, comparative };
  }
  if (YESNO_SUPPORT.test(q) || YESNO_DESIGNED.test(q)) {
    factual.push(q);
    return { questionClass: "FACTUAL_PRESUPPOSITION", factual, comparative };
  }
  if (/^(?:what|which|who)\b/i.test(q) && /\?/.test(q)) {
    return { questionClass: "NEUTRAL_INFORMATION_REQUEST", factual, comparative };
  }
  if (/^(?:is|are|does|do|can)\b/i.test(q) && /\?/.test(q)) {
    return { questionClass: "NEUTRAL_INFORMATION_REQUEST", factual, comparative };
  }
  if (/^(?:why|how)\b/i.test(q)) {
    factual.push(q);
    return { questionClass: "OTHER_FACTUAL_PRESUPPOSITION", factual, comparative };
  }
  if (/\?/.test(q)) {
    return { questionClass: "NEUTRAL_INFORMATION_REQUEST", factual, comparative };
  }
  return { questionClass: "OTHER_FACTUAL_PRESUPPOSITION", factual: [q], comparative };
}

export function isInterrogativeSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /\?/.test(trimmed);
}

export function validateFaqQuestion(input: FaqQuestionContext): FaqQuestionValidation {
  const question = (input.question || "").trim();
  const closedTopics = input.closedTopics || [];
  const supportText = input.supportText || "";
  const slotTopic = input.topic;
  const core = classifyCore(question);
  const asked = requestedTopic(question);
  const closedTopicReferences = closedHits(question, closedTopics);
  const authorized = localAuthority(input);
  const failCodes: string[] = [];
  const usageAuthorized = authorized.has("usage");
  const guaranteeAuthorized = authorized.has("guarantee");
  const ingredientsAuthorized = authorized.has("ingredients");
  const manufacturerAuthorized = authorized.has("manufacturer");
  const resultsAuthorized = authorized.has("results_timeline");

  const policyStrengthening = collectMissing(question, supportText, POLICY_STRENGTHENING);
  const editorial = collectMissing(question, supportText, QUESTION_EDITORIAL);
  const whyEvaluation = /^why\b/i.test(question);

  if (core.questionClass === "COMPARATIVE_PRESUPPOSITION") {
    failCodes.push("UNSUPPORTED_COMPARATIVE_PRESUPPOSITION");
  } else if (core.questionClass === "RESULTS_TIMELINE_PRESUPPOSITION") {
    if (!resultsAuthorized) failCodes.push("UNSUPPORTED_RESULTS_TIMELINE_PRESUPPOSITION");
  } else if (core.questionClass === "USAGE_PRESUPPOSITION") {
    const plain = PLAIN_USAGE_ASK.test(question) && editorial.length === 0 && !whyEvaluation && policyStrengthening.length === 0;
    if (!usageAuthorized || !plain) failCodes.push("UNSUPPORTED_USAGE_PRESUPPOSITION");
  } else if (core.questionClass === "GUARANTEE_PRESUPPOSITION") {
    const plain = PLAIN_POLICY_ASK.test(question) && policyStrengthening.length === 0 && editorial.length === 0 && !whyEvaluation;
    const asksReturn = /\breturn policy\b/i.test(question);
    const asksRefundPolicy = /\brefund policy\b/i.test(question);
    const evidenceHasAskedTerm =
      (asksReturn && /\breturn policy\b/i.test(supportText)) ||
      (asksRefundPolicy && /\brefund policy\b/i.test(supportText)) ||
      (!asksReturn && !asksRefundPolicy && guaranteeAuthorized && supportText.trim().length > 0 && policyStrengthening.length === 0);
    if (!guaranteeAuthorized || !plain || !evidenceHasAskedTerm) failCodes.push("UNSUPPORTED_GUARANTEE_PRESUPPOSITION");
  } else if (core.questionClass === "COMPOSITION_PRESUPPOSITION") {
    if (!ingredientsAuthorized) failCodes.push("UNSUPPORTED_COMPOSITION_PRESUPPOSITION");
  } else if (core.questionClass === "MEDICAL_PRESUPPOSITION") {
    failCodes.push("UNSUPPORTED_MEDICAL_PRESUPPOSITION");
  } else if (core.questionClass === "FACTUAL_PRESUPPOSITION") {
    const rest = question.replace(/^does\s+.+\s+support\s+/i, "").replace(/^is\s+.+\s+designed for\s+/i, "").replace(/\?$/, "");
    if (!supportContains(supportText, rest)) {
      failCodes.push("UNSUPPORTED_FACTUAL_PRESUPPOSITION");
    }
  } else if (core.questionClass === "OTHER_FACTUAL_PRESUPPOSITION") {
    failCodes.push("UNSUPPORTED_FACTUAL_PRESUPPOSITION");
  } else if (core.questionClass === "NEUTRAL_INFORMATION_REQUEST") {
    const supportQuestion =
      NEUTRAL_WHAT_SUPPORT.test(question) &&
      (authorized.has("description") || authorized.has("identity") || (authorized.has("features") && /\bsupports?\b/i.test(supportText)));
    if (!supportQuestion && asked !== "unknown" && !topicAllowed(slotTopic, asked)) {
      failCodes.push("QUESTION_TOPIC_MISMATCH");
    }
  }

  if (policyStrengthening.length > 0) failCodes.push("GUARANTEE_STRENGTHENING");
  if (editorial.length > 0 || (whyEvaluation && (editorial.length > 0 || /\bsimple to use\b|\beasy to take\b|\bgenerous\b/i.test(question)))) {
    if (!failCodes.includes("NEW_EVALUATION")) failCodes.push("NEW_EVALUATION");
  }
  if (MANUFACTURER_QUESTION.test(question) && !manufacturerAuthorized) {
    failCodes.push("UNSUPPORTED_FACTUAL_PRESUPPOSITION");
  }

  for (const topic of closedTopicReferences) {
    if (topic === "usage" && usageAuthorized) continue;
    if (topic === "guarantee" && guaranteeAuthorized) continue;
    if (topic === "ingredients" && ingredientsAuthorized) continue;
    if (topic === "results_timeline" && resultsAuthorized) continue;
    const code =
      topic === "usage"
        ? "UNSUPPORTED_USAGE_PRESUPPOSITION"
        : topic === "guarantee"
          ? "UNSUPPORTED_GUARANTEE_PRESUPPOSITION"
          : topic === "ingredients"
            ? "UNSUPPORTED_COMPOSITION_PRESUPPOSITION"
            : "UNSUPPORTED_RESULTS_TIMELINE_PRESUPPOSITION";
    if (!failCodes.includes(code)) failCodes.push(code);
  }

  return {
    question,
    questionClass: core.questionClass,
    topic: (slotTopic as GenerationTopic) || asked,
    closedTopicReferences,
    factualPresuppositions: core.factual,
    comparativePresuppositions: core.comparative,
    semanticResult: failCodes.length ? "FAIL" : "PASS",
    failCodes,
  };
}
