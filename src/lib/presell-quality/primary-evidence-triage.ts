import { publicLandingUrl } from "@/lib/campaign-sources/primary-page";
import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";
import { isHealthEfficacyStatement } from "@/lib/ingredient-context";
import type { LedgerCandidate } from "@/lib/presell-quality/candidate-ledger";
import { excerptSupportsCandidate } from "@/lib/presell-quality/fact-triage";
import { classifyOperationalThemes, primaryOperationalTheme } from "@/lib/presell-quality/operational-theme";
import type { CommercialRelation } from "@/lib/presell-quality/commercial-graph";

export const FAQ_CATEGORIES = ["OPERATIONAL", "PROMOTIONAL", "HEALTH_OR_EFFICACY"] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export const SEMANTIC_RELATIONS = [
  "NEW",
  "EXACT_DUPLICATE",
  "SEMANTIC_EQUIVALENT",
  "COMPLEMENTARY",
  "CONTRADICTION",
  "DIFFERENT_CONDITIONS",
] as const;
export type SemanticRelation = (typeof SEMANTIC_RELATIONS)[number];

export type PrimaryFaqClassification = {
  question: string;
  answer: string | null;
  category: FaqCategory;
  risk: "HIGH_RISK" | "OPERATIONAL" | "PROMOTIONAL";
  evidence: "ORIGINAL_FAQ" | "MISSING_ANSWER";
  eligible: boolean;
  reason: string;
  reasonPt: string;
};

export type PrimaryCandidateDiagnosis = {
  candidateId: string;
  field: string;
  reviewField: string;
  originalValue: string;
  originSection: string | null;
  originQuestion: string | null;
  originalAnswer: string | null;
  sourceUrl: string;
  informationType: FaqCategory | "SECTION";
  riskClass: "HIGH_RISK" | "OPERATIONAL" | "PROMOTIONAL";
  persistedUsable: boolean;
  persistedBlockReason: string | null;
  ineligibilityReason: string;
  ineligibilityReasonPt: string;
  evidenceAvailable: string[];
  validationsNeeded: string[];
  humanReviewPossible: boolean;
  semanticRelation: SemanticRelation;
  semanticOf: string | null;
};

const HEALTH_QUESTION =
  /\b(what kind of results|how long will it take to see results|energy crashes?|brain[- ]fog|is .+ right for me|life[- ]changing results)\b/i;
const HEALTH_BODY =
  /\b(blood sugar|drop pounds|fat[- ]burn|clinically proven|cures?|treats?|prevents?|diabetes|type 2|controls? blood glucose|supports? healthy (blood|heart)|start feeling a difference|best results come|experience the results)\b/i;
const PROMOTIONAL_OFFER =
  /\b(you save \$?\d+|free e-books?|buy now|order now|\d+% of customers|discount package|free bonus|instant download|no bonuses)\b/i;
const USAGE_OPERATIONAL =
  /\b(how (should|do) i take|best way to take|two full droppers|under (your|the) tongue|dissolve .+ in a glass of water|directions? for use)\b/i;
const SHIPPING_OPERATIONAL =
  /\b(ship(?:ping)?|24 working hours|5 to 10 days|domestic orders?|fedex|ups|tracking number|how quickly can i get)\b/i;
const BILLING_OPERATIONAL =
  /\b(one[- ]time payment|how many times will you charge|ssl|purchase secure)\b/i;
const GUARANTEE_OPERATIONAL =
  /\b(what if .+ doesn'?t work|money[- ]back guarantee|full refund|empty bottles|minus shipping|return the product|60 (full )?days)\b/i;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function numbersOf(text: string): string {
  return [...new Set([...text.matchAll(/\d+/g)].map((item) => item[0]))].sort().join(",");
}

function tokenSet(text: string): Set<string> {
  return new Set(collapse(text).toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 3));
}

function overlap(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const token of a) if (b.has(token)) hit += 1;
  return hit / Math.min(a.size, b.size);
}

export function classifyPrimaryFaq(input: {
  question: string;
  answer: string | null;
}): PrimaryFaqClassification {
  const question = collapse(input.question);
  const answer = input.answer ? collapse(input.answer) : null;
  const blob = `${question} ${answer ?? ""}`;
  if (!answer) {
    return {
      question,
      answer,
      category: "OPERATIONAL",
      risk: "OPERATIONAL",
      evidence: "MISSING_ANSWER",
      eligible: false,
      reason: "The question was captured without an accessible original answer.",
      reasonPt: "A pergunta foi encontrada, mas a resposta original não estava acessível.",
    };
  }
  const usageOrShippingOrBilling = USAGE_OPERATIONAL.test(question) || SHIPPING_OPERATIONAL.test(question) || BILLING_OPERATIONAL.test(question);
  const operationalQuestion = usageOrShippingOrBilling || GUARANTEE_OPERATIONAL.test(question);
  const health =
    HEALTH_QUESTION.test(question) ||
    (GUARANTEE_OPERATIONAL.test(question) && HEALTH_BODY.test(answer) && !usageOrShippingOrBilling) ||
    (!operationalQuestion && (
      HEALTH_BODY.test(blob) ||
      isHealthEfficacyStatement(blob) ||
      classifyEditorialText({ text: blob, role: "OTHER" }).classification === "MEDICAL_OR_HEALTH_CLAIM"
    ));
  if (health) {
    return {
      question,
      answer,
      category: "HEALTH_OR_EFFICACY",
      risk: "HIGH_RISK",
      evidence: "ORIGINAL_FAQ",
      eligible: false,
      reason: "Health, efficacy, or expected-result language cannot be approved without independent evidence.",
      reasonPt: "Esta informação promete um resultado de saúde, mas ainda não temos comprovação suficiente.",
    };
  }
  if (PROMOTIONAL_OFFER.test(blob) && /\b(you save|buy now|order now|free bonus|total:)\b/i.test(blob)) {
    return {
      question,
      answer,
      category: "PROMOTIONAL",
      risk: "PROMOTIONAL",
      evidence: "ORIGINAL_FAQ",
      eligible: false,
      reason: "Promotional offer language is stored for audit and is not restated as a proven fact.",
      reasonPt: "Esta informação é promocional. Não a transformamos em fato comprovado.",
    };
  }
  if (USAGE_OPERATIONAL.test(blob) || SHIPPING_OPERATIONAL.test(blob) || BILLING_OPERATIONAL.test(blob) || GUARANTEE_OPERATIONAL.test(blob)) {
    return {
      question,
      answer,
      category: "OPERATIONAL",
      risk: "OPERATIONAL",
      evidence: "ORIGINAL_FAQ",
      eligible: true,
      reason: "Seller-stated operational FAQ with original question and answer. Not independent scientific proof.",
      reasonPt: "Informação operacional declarada pelo vendedor, com texto original preservado.",
    };
  }
  if (PROMOTIONAL_OFFER.test(blob)) {
    return {
      question,
      answer,
      category: "PROMOTIONAL",
      risk: "PROMOTIONAL",
      evidence: "ORIGINAL_FAQ",
      eligible: false,
      reason: "Promotional offer language is stored for audit and is not restated as a proven fact.",
      reasonPt: "Esta informação é promocional. Não a transformamos em fato comprovado.",
    };
  }
  return {
    question,
    answer,
    category: "OPERATIONAL",
    risk: "OPERATIONAL",
    evidence: "ORIGINAL_FAQ",
    eligible: false,
    reason: "The statement is not documented clearly enough for a seller-stated operational review.",
    reasonPt: "A evidência armazenada não é suficiente para uma decisão segura.",
  };
}

export function classifyPrimaryStatement(text: string, section = ""): {
  category: FaqCategory;
  risk: "HIGH_RISK" | "OPERATIONAL" | "PROMOTIONAL";
  reason: string;
  reasonPt: string;
} {
  const faq = classifyPrimaryFaq({ question: section || text.slice(0, 140), answer: text });
  return { category: faq.category, risk: faq.risk, reason: faq.reason, reasonPt: faq.reasonPt };
}

export function reviewFieldForPrimary(input: {
  field: string;
  text: string;
  category: FaqCategory;
}): string {
  if (input.category === "OPERATIONAL") return "faq";
  return input.field;
}

export function semanticRelationOf(input: {
  text: string;
  field: string;
  others: Array<{ id: string; field: string; text: string }>;
}): { relation: SemanticRelation; of: string | null } {
  const key = collapse(input.text).toLowerCase();
  const theme = primaryOperationalTheme(input.text, input.field);
  const nums = numbersOf(input.text);
  for (const other of input.others) {
    const otherKey = collapse(other.text).toLowerCase();
    if (!otherKey) continue;
    if (key === otherKey) return { relation: "EXACT_DUPLICATE", of: other.id };
    const otherTheme = primaryOperationalTheme(other.text, other.field);
    const otherNums = numbersOf(other.text);
    const similar = overlap(input.text, other.text) >= 0.72;
    if (theme === otherTheme && similar && nums && nums === otherNums) {
      return { relation: "SEMANTIC_EQUIVALENT", of: other.id };
    }
    if (theme === otherTheme && similar && nums && otherNums && nums !== otherNums) {
      const contradiction = /\b(not|no|never|cannot|don't|do not)\b/i.test(input.text) !== /\b(not|no|never|cannot|don't|do not)\b/i.test(other.text);
      return { relation: contradiction ? "CONTRADICTION" : "DIFFERENT_CONDITIONS", of: other.id };
    }
    if (theme === otherTheme && similar) {
      const extra = key.length > otherKey.length + 40 || (nums && otherNums && nums !== otherNums);
      return { relation: extra ? "COMPLEMENTARY" : "SEMANTIC_EQUIVALENT", of: other.id };
    }
  }
  return { relation: "NEW", of: null };
}

export function diagnosePrimaryCandidate(input: {
  candidate: Pick<LedgerCandidate, "candidateId" | "field" | "extractedValue" | "originalExcerpt" | "sourceUrl" | "sourceHost" | "blockReason" | "usable"> & { section?: string | null };
  faqs?: Array<{ question: string; answer: string | null }>;
  accepted?: Array<{ id?: string; field: string; text: string }>;
  rejected?: Array<{ id: string; field: string; text: string }>;
  prior?: Array<{ id: string; field: string; text: string }>;
}): PrimaryCandidateDiagnosis {
  const text = collapse(input.candidate.extractedValue);
  const excerpt = collapse(input.candidate.originalExcerpt || "");
  const faqMatch = (input.faqs ?? []).find((item) => {
    const question = collapse(item.question);
    return question && (text.toLowerCase().startsWith(question.toLowerCase()) || text.toLowerCase().includes(question.toLowerCase()));
  });
  const classified = faqMatch
    ? classifyPrimaryFaq(faqMatch)
    : classifyPrimaryStatement(text, input.candidate.section || "");
  const reviewField = reviewFieldForPrimary({ field: input.candidate.field, text, category: classified.category });
  const others = [
    ...(input.accepted ?? []).map((item) => ({ id: item.id ?? `accepted:${item.field}`, field: item.field, text: item.text })),
    ...(input.rejected ?? []),
    ...(input.prior ?? []),
  ];
  const semantic = semanticRelationOf({ text, field: reviewField, others });
  const excerptOk = excerptSupportsCandidate(text, excerpt);
  const evidence = [
    excerpt ? "Original excerpt is stored." : "Original excerpt is missing.",
    faqMatch ? "Matched to an extracted FAQ question and answer." : "Matched to a captured page section.",
    `Source URL ${publicLandingUrl(input.candidate.sourceUrl || "") || input.candidate.sourceHost}.`,
  ];
  const validations = [
    "Seller attribution must be preserved.",
    "Portuguese preview must stay semantically faithful.",
    "Health or efficacy language stays blocked without independent evidence.",
  ];
  let ineligibilityReason = classified.reason;
  let ineligibilityReasonPt = classified.reasonPt;
  let humanReviewPossible = classified.category === "OPERATIONAL" && excerptOk && semantic.relation !== "EXACT_DUPLICATE" && semantic.relation !== "SEMANTIC_EQUIVALENT";
  if (classified.category === "HEALTH_OR_EFFICACY") {
    humanReviewPossible = false;
  } else if (classified.category === "PROMOTIONAL") {
    humanReviewPossible = false;
  } else if (!excerptOk) {
    humanReviewPossible = false;
    ineligibilityReason = "The stored excerpt does not clearly contain the candidate text.";
    ineligibilityReasonPt = "A evidência armazenada não é suficiente para uma decisão segura.";
  } else if (semantic.relation === "EXACT_DUPLICATE" || semantic.relation === "SEMANTIC_EQUIVALENT") {
    humanReviewPossible = false;
    ineligibilityReason = "This text is already accepted, rejected, or duplicated.";
    ineligibilityReasonPt = "Esta informação já foi analisada ou é equivalente a um fato já registrado.";
  } else if (semantic.relation === "CONTRADICTION") {
    humanReviewPossible = true;
    ineligibilityReason = "New evidence contradicts an existing fact and needs a human conflict review.";
    ineligibilityReasonPt = "Esta informação entra em conflito com um fato já aceito e precisa de análise humana, sem alterar o fato automaticamente.";
  }
  return {
    candidateId: input.candidate.candidateId,
    field: input.candidate.field,
    reviewField,
    originalValue: text,
    originSection: input.candidate.section ?? faqMatch?.question ?? null,
    originQuestion: faqMatch?.question ?? null,
    originalAnswer: faqMatch?.answer ?? (excerpt || null),
    sourceUrl: publicLandingUrl(input.candidate.sourceUrl || ""),
    informationType: faqMatch ? classified.category : classified.category === "OPERATIONAL" ? "OPERATIONAL" : classified.category,
    riskClass: classified.risk,
    persistedUsable: input.candidate.usable,
    persistedBlockReason: input.candidate.blockReason,
    ineligibilityReason,
    ineligibilityReasonPt,
    evidenceAvailable: evidence,
    validationsNeeded: validations,
    humanReviewPossible,
    semanticRelation: semantic.relation,
    semanticOf: semantic.of,
  };
}

export function isPrimaryAffiliateHost(host: string, primaryAffiliateHosts?: string[]): boolean {
  const value = host.toLowerCase();
  return (primaryAffiliateHosts ?? []).some((item) => value === item.toLowerCase() || value.endsWith(`.${item.toLowerCase()}`));
}

export function primarySellerReviewAllowed(input: {
  field: string;
  host: string;
  relations: CommercialRelation[];
  identityRole?: string | null;
  primaryAffiliateHosts?: string[];
}): { allowed: boolean; reason: string } | null {
  if (!isPrimaryAffiliateHost(input.host, input.primaryAffiliateHosts)) return null;
  if (input.identityRole === "CLONE") {
    return { allowed: false, reason: "Lookalike or hosted-clone hosts are not seller identity." };
  }
  if (input.field === "manufacturer" || input.field === "pricing") {
    return { allowed: false, reason: "Manufacturer fields require a verified manufacturer relationship." };
  }
  const hostRelations = input.relations.filter((item) => item.to === `website:${input.host.toLowerCase()}` || item.from === `website:${input.host.toLowerCase()}`);
  if (hostRelations.some((item) => (item.scope === "SELLER" || item.scope === "AFFILIATE") && item.state === "CONTRADICTED")) {
    return { allowed: false, reason: "The commercial relationship is contradicted." };
  }
  return {
    allowed: true,
    reason: "User-provided primary affiliate page. Seller-stated only. Not manufacturer identity.",
  };
}

export function domainConfirmationNeeded(input: {
  primaryHost?: string | null;
  relations: CommercialRelation[];
}): { needed: boolean; primaryHost: string | null; otherHost: string | null; relationId: string | null; reason: string; reasonPt: string } {
  const primaryHost = input.primaryHost?.toLowerCase() || null;
  const contradicted = input.relations.find((item) => item.type === "SELLS" && item.state === "CONTRADICTED");
  const otherHost = contradicted?.to.replace(/^website:/, "") || contradicted?.from.replace(/^website:/, "") || null;
  const needed = Boolean(primaryHost && otherHost && otherHost !== primaryHost);
  return {
    needed,
    primaryHost,
    otherHost: needed ? otherHost : null,
    relationId: needed ? contradicted?.id ?? null : null,
    reason: needed
      ? "A previously confirmed human rejection contradicted the seller relationship of a different host. Domain resemblance is not common ownership."
      : "No cross-host seller contradiction requires confirmation.",
    reasonPt: needed
      ? "Precisamos confirmar se estes dois sites pertencem ao mesmo vendedor."
      : "Não há contradição de identidade entre dois sites comerciais pendente.",
  };
}

export function themesOf(text: string, field = ""): string[] {
  return classifyOperationalThemes(text, field);
}
