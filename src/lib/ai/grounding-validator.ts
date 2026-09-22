/**
 * Post-generation fact grounding. Compares copy to copy-eligible ProductFacts
 * only. Description is not a token bag. Cross-field recombination is unsupported.
 *
 * GROUNDED — no likely unsupported factual additions
 * REVIEW_REQUIRED — possible unsourced additions; human should inspect
 * UNGROUNDED — clear encyclopedia / safety / research additions not in facts
 *
 * UNGROUNDED is not publishable: composePublicationGate maps it to BLOCKED.
 */

import {
  getConsumerCopyEligibleFacts,
  isCopyEligibleConfidence,
  type ProductFacts,
} from "@/lib/product-facts";
import type { PublicationGate } from "@/lib/policy-linter";
import { directionsSpanIsUsage, isKnowledgeExpansion } from "@/lib/ai/generation-plan";
import {
  CLAIM_CLASS_NAMED_INGREDIENT,
  CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION,
  CLAIM_CLASS_COMPOSITION_PROMOTION,
  compositionPromotionClaims,
  isGenericIngredientRestatement,
  namedIngredientMentions,
  relationalLanguageClaims,
  relationshipEntailed,
} from "@/lib/ai/ingredient-claims";
import { isInterrogativeSentence, validateFaqQuestion } from "@/lib/ai/faq-question-semantics";

export type GroundingStatus = "GROUNDED" | "REVIEW_REQUIRED" | "UNGROUNDED";

export type UnsupportedClaim = {
  claim: string;
  reason: string;
  severity: "hard" | "soft";
  claimClass?: string;
};

export type GroundingResult = {
  status: GroundingStatus;
  unsupportedClaims: UnsupportedClaim[];
};

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "does", "do", "did", "this", "that", "these", "those", "it", "its",
  "to", "of", "in", "on", "for", "with", "and", "or", "but", "if", "as",
  "you", "your", "from", "into", "about", "than", "then", "them", "they",
  "their", "not", "no", "yes", "can", "may", "might", "could", "would",
  "should", "will", "just", "also", "more", "most", "some", "any", "such",
  "have", "has", "had", "having", "page", "product", "website", "merchant",
]);

const KNOWLEDGE_PATTERNS: Array<{ pattern: RegExp; reason: string; severity: "hard" | "soft" }> = [
  {
    pattern: /generally (?:considered )?safe(?: for healthy (?:individuals|adults|people))?/i,
    reason: "unsourced general supplement-safety claim",
    severity: "hard",
  },
  {
    pattern: /research (?:shows|suggests|indicates|demonstrates)|studies (?:show|suggest|demonstrate)/i,
    reason: "unsourced research-substantiation language",
    severity: "hard",
  },
  {
    pattern: /intended to colonize|colonize (?:the )?(?:mouth|gut|oral)|oral tissue health/i,
    reason: "unsourced biological-mechanism claim",
    severity: "hard",
  },
  {
    pattern: /typical(?:ly)? .{0,60}(?:CFU|colony)|quantities typically range|(?:millions to billions) of CFU/i,
    reason: "inferred category statistic",
    severity: "hard",
  },
  {
    pattern: /(?:one|two|\d+)\s+to\s+(?:two|\d+)\s+months? may be needed|before someone can evaluate whether the product is a fit|evaluation timeline/i,
    reason: "unsourced evaluation timeline",
    severity: "hard",
  },
  {
    pattern: /clinically proven|scientifically proven/i,
    reason: "unsourced clinical-proof language",
    severity: "hard",
  },
  {
    pattern: /\b(?:treats?|treatment for|cures?|diagnos(?:e|is|ing))\s+(?:arthritis|cancer|diabetes|disease)\b/i,
    reason: "disease-treatment claim not present in ProductFacts",
    severity: "hard",
  },
  {
    pattern: /synovial fluid is (?:the )?(?:body's )?(?:natural )?lubricant|lubricating substance found in joints|synovial fluid cushions|cushions the joints|reduces friction between (?:the )?cartilage/i,
    reason: "unsourced background physiology / knowledge expansion",
    severity: "hard",
  },
  {
    pattern: /buyers considering (?:this|the) product should evaluate whether/i,
    reason: "unsupported editorial evaluation criteria not present in evidence",
    severity: "hard",
  },
];

const HEDGE_PREFIXES =
  /^(the (?:product )?(?:listing|page|merchant|seller|site|vendor) (?:describes|states?|says|lists?|notes?|mentions)|according to the (?:listing|merchant|seller|page|site)|on the (?:product )?page)\b/i;

type EligibleFields = {
  productName: string;
  description: string;
  features: string;
  ingredients: string;
  ingredientCount: number;
  usage: string;
  cautions: string;
  pricing: string;
  guarantee: string;
  manufacturer: string;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const INGREDIENT_COUNT_QUALIFIERS =
  /\b(?:only|active|clinically|proven|main|primary|key|proprietary|patented|essential|targeted|powerful|natural)\b/i;

const GUARANTEE_EXPANSION =
  /\bguaranteed results\b|\bresults within\b|\bwhether (?:it|the product) works\b|\bsee whether\b|\bdetermine whether\b|\bevaluate whether\b|\btrial\b|\btry (?:it )?(?:risk[- ]free )?for\b/i;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
}

function compactLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function contentTokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function eligibleFieldsFromFacts(facts: ProductFacts): EligibleFields {
  const eligible = getConsumerCopyEligibleFacts(facts);
  return {
    productName: eligible.productName,
    description: eligible.description,
    features: eligible.features.join(". "),
    ingredients: eligible.ingredientsOrComponents.join(". "),
    ingredientCount: eligible.ingredientsOrComponents.length,
    usage: eligible.usageInformation.join(". "),
    cautions: eligible.cautions.join(". "),
    pricing: eligible.pricingInformation,
    guarantee: eligible.guaranteeInformation,
    manufacturer: eligible.manufacturer,
  };
}

export function factsHaveOfficialIdentity(facts: ProductFacts): boolean {
  if (isCopyEligibleConfidence(facts.confidence.manufacturer) && (facts.manufacturer ?? "").trim()) {
    return true;
  }
  const host = hostnameOf(facts.sourceUrl || "");
  const hostCompact = compactLabel(host.split(".")[0] || host);
  const productCompact = compactLabel(facts.productName);
  if (hostCompact.length >= 6 && productCompact.length >= 6 && hostCompact === productCompact) {
    return true;
  }
  return false;
}

export function ctaImpliesOfficialAuthority(text: string): boolean {
  return /\bvisit official website\b|\bofficial website\b|\bofficial site\b/i.test(text);
}

function fieldContainsPhrase(field: string, phrase: string): boolean {
  if (!field || !phrase) return false;
  return normalize(field).includes(normalize(phrase));
}

function sameEvidenceBinds(evidence: string, parts: string[]): boolean {
  const e = normalize(evidence);
  if (!e) return false;
  return parts.every((part) => e.includes(normalize(part)));
}

function durationTokens(text: string): string[] {
  return [...text.matchAll(/\b(\d+)\s*[- ]?(?:day|days|week|weeks|month|months)\b/gi)].map((m) =>
    normalize(m[0]),
  );
}

function moneyAmounts(text: string): string[] {
  return [...text.matchAll(/\$\s*\d+(?:\.\d{2})?|\b\d+(?:\.\d{2})?\s*(?:usd|dollars?)\b/gi)].map((m) =>
    normalize(m[0]).replace(/\s+/g, ""),
  );
}

function longestSharedPhrase(claim: string, evidence: string, minWords: number): string | null {
  const claimWords = normalize(claim).split(/\s+/).filter(Boolean);
  const evidenceNorm = ` ${normalize(evidence)} `;
  let best = "";
  for (let i = 0; i < claimWords.length; i += 1) {
    for (let length = claimWords.length - i; length >= minWords; length -= 1) {
      const slice = claimWords.slice(i, i + length).join(" ");
      if (slice.length > best.length && evidenceNorm.includes(` ${slice} `)) {
        best = slice;
      }
    }
  }
  return best || null;
}

/**
 * Semantic restatement against a single field. Lexical token overlap across a
 * concatenated corpus is not used — that allowed "180-day" + "refund policy"
 * to look grounded.
 */
function fieldSupportsClaim(claim: string, evidence: string, productName: string): boolean {
  if (!evidence.trim()) return false;
  const claimNorm = normalize(claim);
  const evidenceNorm = normalize(evidence);
  if (evidenceNorm.includes(claimNorm)) return true;

  let remainder = claimNorm;
  const nameNorm = normalize(productName);
  if (nameNorm && remainder.includes(nameNorm)) {
    remainder = remainder.replace(nameNorm, " ").replace(/\s+/g, " ").trim();
  }
  remainder = remainder
    .replace(/^(the listing describes|the product is|this (?:product|page) is|it is|comes with|includes|offers)\s+(a\s+)?/g, "")
    .trim();
  if (remainder && evidenceNorm.includes(remainder)) return true;
  if (remainder && remainder.includes(evidenceNorm) && contentTokens(evidence).length >= 3) {
    const extra = remainder.replace(evidenceNorm, " ").replace(/\s+/g, " ").trim();
    const extraTokens = contentTokens(extra);
    if (extraTokens.length === 0) return true;
  }

  const shared = longestSharedPhrase(remainder || claimNorm, evidence, 3);
  const claimTokens = contentTokens(remainder || claimNorm);
  if (shared && claimTokens.length > 0) {
    const sharedTokens = contentTokens(shared);
    if (sharedTokens.length / claimTokens.length >= 0.72) return true;
  }

  const evidenceTokenSet = new Set(contentTokens(evidence));
  if (claimTokens.length > 0) {
    const hits = claimTokens.filter((token) => evidenceTokenSet.has(token));
    if (hits.length / claimTokens.length >= 0.72 && claimNumbersPresent(claim, evidence)) {
      return true;
    }
  }
  return false;
}

function claimNumbersPresent(claim: string, evidence: string): boolean {
  const numbers = [...claim.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => m[0]);
  if (numbers.length === 0) return true;
  const e = normalize(evidence);
  return numbers.every((n) => e.includes(n));
}

function anyFieldSupportsClaim(claim: string, fields: EligibleFields): boolean {
  const values = [
    fields.description,
    fields.features,
    fields.ingredients,
    fields.usage,
    fields.cautions,
    fields.pricing,
    fields.guarantee,
    fields.manufacturer,
    fields.productName,
  ];
  return values.some((field) => fieldSupportsClaim(claim, field, fields.productName));
}

function isNonFactualFrame(sentence: string): boolean {
  return (
    /^#{1,6}\s/.test(sentence) ||
    /affiliate disclosure|we may earn a commission/i.test(sentence) ||
    /this page (?:describes|does not)|not a medical (?:device|outcome|claim|treatment)|does not promise|clothing product, not a treatment|not intended to diagnose(?:[,\s]+(?:treat|cure|or prevent|any disease))+/i.test(
      sentence,
    )
  );
}

function splitSentences(text: string): string[] {
  return text
    .replace(/^#{1,6}\s+[^\n]+$/gm, ".")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ".");
}

function isHedged(sentence: string): boolean {
  return HEDGE_PREFIXES.test(sentence.trim());
}

function pushUnique(
  list: UnsupportedClaim[],
  claim: string,
  reason: string,
  severity: "hard" | "soft",
  claimClass?: string,
): void {
  const key = normalize(claim);
  if (list.some((item) => normalize(item.claim) === key && item.reason === reason)) return;
  list.push({ claim: claim.trim(), reason, severity, ...(claimClass ? { claimClass } : {}) });
}

function collectMatches(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: string[] = [];
  let match: RegExpExecArray | null = re.exec(text);
  while (match) {
    out.push(match[0].trim());
    if (match.index === re.lastIndex) re.lastIndex += 1;
    match = re.exec(text);
  }
  return out;
}

function cautionSupports(fields: EligibleFields, needle: RegExp | string): boolean {
  if (!fields.cautions) return false;
  if (typeof needle === "string") return fieldContainsPhrase(fields.cautions, needle);
  return needle.test(fields.cautions);
}

function parseCountToken(raw: string): number | null {
  const key = raw.toLowerCase();
  if (NUMBER_WORDS[key] != null) return NUMBER_WORDS[key];
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

const INGREDIENT_COUNT_CLAIM =
  /\b(?:contains|has|includes)\s+(?:only\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:(?:clinically\s+proven|active|main|primary|key|proprietary|patented|essential|targeted|powerful|natural|listed)\s+)*(?:ingredients?|components?|compounds?)\b/gi;

function isGenericIngredientAbsence(claim: string): boolean {
  return (
    /\bingredients?\b.{0,80}\b(?:not (?:disclosed|provided|listed|included|available|confirmed)|unavailable|missing)\b/i.test(
      claim,
    ) ||
    /\b(?:specific |full )?ingredient(?:s)?\s+(?:names?|information|details|lists?|amounts?|dosages?)\s+(?:are|is|was|were)\s+not\b/i.test(
      claim,
    ) ||
    /\bingredient names are not disclosed\b/i.test(claim)
  );
}

function isGenericIngredientNounPhrase(claim: string): boolean {
  return isGenericIngredientRestatement(claim);
}

function isIngredientCountClaim(claim: string): boolean {
  return new RegExp(INGREDIENT_COUNT_CLAIM.source, "i").test(claim);
}

function ingredientCountClaimSupported(claim: string, count: number, ingredientEvidence: string): boolean {
  if (count < 1) return false;
  const match = claim.match(
    /\b(?:contains|has|includes)\s+(?:only\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+/i,
  );
  const listed = parseCountToken(match?.[1] ?? "");
  if (listed !== count) return false;
  const qualifiers = claim.match(INGREDIENT_COUNT_QUALIFIERS) ?? [];
  if (qualifiers.length === 0) return true;
  const evidenceNorm = normalize(ingredientEvidence);
  return qualifiers.every((qualifier) => evidenceNorm.includes(normalize(qualifier)));
}

function manufacturerClaimSupported(claim: string, evidence: string, productName: string): boolean {
  if (!evidence.trim()) return false;
  if (fieldSupportsClaim(claim, evidence, productName)) return true;
  const evidenceNorm = normalize(evidence);
  if (/\bgmp\b|\bcgmp\b/i.test(claim) && !/\bgmp\b|\bcgmp\b/i.test(evidenceNorm)) return false;
  if (/\bfda\b/i.test(claim) && !/\bfda\b/i.test(evidenceNorm)) return false;
  if (/\b(?:usa|u s a|united states)\b/i.test(claim) && !/\b(?:usa|u s a|united states)\b/i.test(evidenceNorm)) {
    return false;
  }
  if (/\bfacility\b/i.test(claim) && !/\b(?:facility|gmp|fda)\b/i.test(evidenceNorm)) return false;
  const location = claim.match(
    /\b(?:manufactured|made|produced|formulated|assembled)\s+in\s+(?:a\s+|an\s+|the\s+)?([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+){0,3})/i,
  );
  if (location) {
    const loc = normalize(location[1] ?? "").replace(/\b(?:gmp|certified|facility|fda|inspected)\b/g, "").trim();
    if (loc && !evidenceNorm.includes(loc.split(/\s+/)[0] ?? "")) return false;
  }
  const company = claim.match(/\b(?:manufactured|made|produced|formulated)\s+by\s+([A-Za-z][\w&.\- ]{1,40})/i);
  if (company && !fieldContainsPhrase(evidence, company[1] ?? "")) return false;
  if (/\bgmp\b|\bcgmp\b/i.test(claim)) return /\bgmp\b|\bcgmp\b/i.test(evidenceNorm);
  if (/\bfda\b/i.test(claim)) return /\bfda\b/i.test(evidenceNorm);
  return Boolean(location || company);
}

function guaranteeIntroducesUnsupportedExpansion(claim: string, evidence: string): boolean {
  if (!GUARANTEE_EXPANSION.test(claim)) return false;
  return !GUARANTEE_EXPANSION.test(evidence);
}

function scanFieldAwareClaims(generated: string, fields: EligibleFields, facts: ProductFacts): {
  claims: UnsupportedClaim[];
  matched: boolean;
} {
  const found: UnsupportedClaim[] = [];
  let matched = false;
  const note = () => {
    matched = true;
  };

  const guaranteeClaims = collectMatches(
    generated,
    /\b\d+\s*[- ]?(?:day|days|week|weeks|month|months)\b[\w\s,'-]{0,48}\b(?:refund|money[\s-]?back|guarantee|warranty)\b|\b(?:refund|money[\s-]?back|guarantee|warranty)\b[\w\s,'-]{0,48}\b\d+\s*[- ]?(?:day|days|week|weeks|month|months)\b/gi,
  );
  for (const claim of guaranteeClaims) {
    note();
    const durations = durationTokens(claim);
    const bound =
      Boolean(fields.guarantee) &&
      durations.some((duration) =>
        sameEvidenceBinds(fields.guarantee, [duration, "refund"]) ||
        sameEvidenceBinds(fields.guarantee, [duration, "guarantee"]) ||
        sameEvidenceBinds(fields.guarantee, [duration, "money back"]) ||
        sameEvidenceBinds(fields.guarantee, [duration, "warranty"]) ||
        sameEvidenceBinds(fields.guarantee, [duration, "return"]),
      );
    const expanded = bound && guaranteeIntroducesUnsupportedExpansion(claim, fields.guarantee);
    if (!bound || expanded) {
      pushUnique(
        found,
        claim,
        expanded
          ? "guarantee restatement cannot add trial, results-window, or efficacy implications unless copy-eligible guarantee evidence states them"
          : "guarantee duration/refund claim requires copy-eligible guarantee evidence binding the duration to the refund in the same field",
        "hard",
      );
    }
  }

  const guaranteeImplicationClaims = collectMatches(
    generated,
    /\b\d+\s*[- ]?(?:day|days|week|weeks|month|months)\b[\w\s,'-]{0,56}\b(?:whether (?:it|the product) works|see whether|determine whether|guaranteed results|results within|risk[- ]free|trial)\b|\b(?:try (?:it )?(?:risk[- ]free )?for|guaranteed results within)\b[\w\s,'-]{0,24}\b\d+\s*[- ]?(?:day|days)\b/gi,
  );
  for (const claim of guaranteeImplicationClaims) {
    note();
    if (guaranteeClaims.some((existing) => existing.includes(claim) || claim.includes(existing))) continue;
    if (!fields.guarantee || guaranteeIntroducesUnsupportedExpansion(claim, fields.guarantee)) {
      pushUnique(
        found,
        claim,
        "guarantee restatement cannot add trial, results-window, or efficacy implications unless copy-eligible guarantee evidence states them",
        "hard",
      );
    }
  }

  const priceClaims = collectMatches(
    generated,
    /\$\s*\d+(?:\.\d{2})?|\b(?:available for|priced at|costs?|price(?:d|s)? of)\s+\$?\s*\d+(?:\.\d{2})?|\b(?:discounts?|%\s*off|\d+\s*%\s+off|on sale|reduced price|special price)\b/gi,
  );
  for (const claim of priceClaims) {
    note();
    const amounts = moneyAmounts(claim);
    const numbers = [...claim.matchAll(/\d+(?:\.\d{2})?/g)].map((m) => m[0]);
    const isDiscount = /discount|%\s*off|on sale|reduced price|special price/i.test(claim);
    const supported =
      Boolean(fields.pricing) &&
      (amounts.some((amount) => normalize(fields.pricing).includes(amount.replace(/\s+/g, ""))) ||
        numbers.some((n) => sameEvidenceBinds(fields.pricing, [n])) ||
        (isDiscount && /discount|%\s*off|on sale|reduced price|special price/i.test(fields.pricing)));
    if (!supported) {
      pushUnique(found, claim, "price claim requires copy-eligible pricing evidence", "hard");
    }
  }

  const manufacturerClaims = collectMatches(
    generated,
    /\b(?:manufactured|made|produced|formulated|assembled)\s+(?:in|by)\s+(?:a\s+|an\s+|the\s+)?[A-Za-z][\w&.\-,' ]{1,48}|\bgmp[\s-]?certified(?:\s+facility)?\b|\bcgmp\b|\bgmp\s+standards?\b|\bfda[\s-]?inspected(?:\s+facility)?\b|\bfda[\s-]?registered\b|\b(?:manufacturing|production)\s+facility\b|\bmanufacturer(?:'s)?\s+(?:is|are)\s+[A-Z][\w&.\- ]{1,40}|\bmanufacturer(?:'s)? claims\b|\bManufacturer\s+[A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3}\b/gi,
  );
  for (const claim of manufacturerClaims) {
    note();
    if (!manufacturerClaimSupported(claim, fields.manufacturer, fields.productName)) {
      pushUnique(
        found,
        claim,
        "manufacturer/facility claim requires copy-eligible manufacturer evidence for the stated location, company, or certification",
        "hard",
      );
    }
  }

  const supportIdentityClaims = collectMatches(
    generated,
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\b[A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+)?\s+provides\s+(?:product\s+)?support\b/g,
  );
  for (const claim of supportIdentityClaims) {
    note();
    if (!fields.manufacturer || !fieldContainsPhrase(fields.manufacturer, claim.replace(/\s+provides\s+(?:product\s+)?support/i, "").trim())) {
      pushUnique(
        found,
        claim,
        "support/contact identity requires copy-eligible manufacturer evidence naming that contact or company",
        "hard",
      );
    }
  }

  const ingredientCountClaims = collectMatches(generated, INGREDIENT_COUNT_CLAIM);
  for (const claim of ingredientCountClaims) {
    note();
    if (!ingredientCountClaimSupported(claim, fields.ingredientCount, fields.ingredients)) {
      pushUnique(
        found,
        claim,
        "ingredient-count claim requires a copy-eligible ingredient list of that length; extra qualifiers need matching evidence",
        "hard",
      );
    }
  }

  const compositionClaims = compositionPromotionClaims(generated);
  for (const claim of compositionClaims) {
    note();
    if (!fields.ingredients) {
      pushUnique(
        found,
        claim,
        "feature mention cannot be promoted into an ingredient-composition claim",
        "hard",
        CLAIM_CLASS_COMPOSITION_PROMOTION,
      );
    }
  }

  const ingredientClaims = namedIngredientMentions(generated, { productName: facts.productName });
  for (const claim of ingredientClaims) {
    if (isIngredientCountClaim(claim)) continue;
    if (isGenericIngredientAbsence(claim)) continue;
    if (isGenericIngredientNounPhrase(claim)) continue;
    note();
    const named = claim
      .replace(/^(?:formula\s+)?(?:contains|includes|made with|formulated with|combines|containing)\s+/i, "")
      .replace(/^ingredient(?:s)?(?:\s+include[sd]?)?\s+/i, "")
      .replace(/\s+is included\b/i, "")
      .replace(/^(?:clinically|scientifically)\s+proven\s+/i, "")
      .replace(/^patented\s+/i, "")
      .trim();
    const inIngredients = named && fieldContainsPhrase(fields.ingredients, named);
    const inDescriptionList =
      named &&
      fieldContainsPhrase(fields.description, named) &&
      /ingredient|contains|made with|includes/i.test(fields.description);
    const evidence = inIngredients ? fields.ingredients : inDescriptionList ? fields.description : "";
    const strengthened =
      /\b(?:clinically|scientifically)\s+proven\b|\bproven to\b|\bpatented\b/i.test(claim) &&
      !/\b(?:clinically|scientifically)\s+proven\b|\bproven to\b|\bpatented\b/i.test(evidence);
    if (!inIngredients && !inDescriptionList) {
      pushUnique(
        found,
        claim,
        "named ingredient requires copy-eligible ingredients evidence or a DIRECT_SOURCE description that names the item",
        "hard",
        CLAIM_CLASS_NAMED_INGREDIENT,
      );
    } else if (strengthened) {
      pushUnique(
        found,
        claim,
        "ingredient restatement cannot add clinical-proof or patent qualifiers unless copy-eligible evidence states them",
        "hard",
        CLAIM_CLASS_NAMED_INGREDIENT,
      );
    }
  }

  const synergySupport = [fields.description, fields.features, fields.ingredients].join(" ");
  for (const claim of relationalLanguageClaims(generated)) {
    note();
    if (!relationshipEntailed(claim, synergySupport)) {
      pushUnique(
        found,
        claim.text,
        "generic ingredient restatement cannot add an unsupported relationship such as work together or synergy",
        "hard",
        CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION,
      );
    }
  }

  const strategyClaims = collectMatches(
    generated,
    /\bmulti[- ]angle\s+ingredient\s+strategy\b|\bingredient strategy\b/gi,
  );
  for (const claim of strategyClaims) {
    note();
    if (
      !fieldContainsPhrase(synergySupport, claim) &&
      !/\bmulti[- ]angle\s+ingredient\s+strategy\b|\bingredient strategy\b/i.test(synergySupport)
    ) {
      pushUnique(
        found,
        claim,
        "editorial/semantic expansion of generic ingredient language",
        "hard",
      );
    }
  }

  const usageClaims = collectMatches(
    generated,
    /\btake\s+(?:one|a|once|daily|two|three|\d+)\b(?:\s+\w+){0,6}|\buse once daily\b|\buse one capsule daily\b|\brecommended (?:dosage|once daily|every morning|use)\b|\bone dose(?:\s+each|\s+every|\s+daily|\s+per day)?\b|\bonce[- ]daily (?:use|dose|regimen)\b|\bdaily (?:regimen|dosage)\b|\bregimen\b|\bdirections\b|\b(?:usage )?instructions\b|\b\d+\s+(?:capsule|tablet)s?\s+(?:a|per|every)\s+day\b|\b(?:one|two|three|\d+)\s+(?:capsule|tablet|drop|gummy|softgel|pill)s?\s+(?:daily|a day|per day|each day)\b/gi,
  );
  const directionsTokenHasUsageSense = (value: string) => {
    const re = /\bdirections\b/gi;
    let saw = false;
    let found = re.exec(value);
    while (found) {
      if (directionsSpanIsUsage(value, found.index)) saw = true;
      found = re.exec(value);
    }
    return saw;
  };
  for (const claim of usageClaims) {
    note();
    if (/^directions$/i.test(claim.trim()) && !directionsTokenHasUsageSense(generated)) continue;
    if (!fields.usage || !fieldSupportsClaim(claim, fields.usage, fields.productName)) {
      pushUnique(found, claim, "dosage/usage claim requires copy-eligible usage evidence", "hard");
    }
  }

  const servingClaims = collectMatches(generated, /\b\d+\s+(?:daily\s+)?servings?\b/gi);
  for (const claim of servingClaims) {
    note();
    const numbers = [...claim.matchAll(/\d+/g)].map((m) => m[0]);
    const supported =
      Boolean(fields.usage) && numbers.some((n) => sameEvidenceBinds(fields.usage, [n, "serving"]) || fieldContainsPhrase(fields.usage, claim));
    if (!supported) {
      pushUnique(found, claim, "serving-count claim requires copy-eligible usage evidence binding the count", "hard");
    }
  }

  const consultClaims = collectMatches(
    generated,
    /\bconsult(?:\s+with)?(?:\s+your)?\s+(?:doctor|physician|healthcare professional|healthcare provider|health care professional|health care provider)\b/gi,
  );
  for (const claim of consultClaims) {
    note();
    if (!cautionSupports(fields, /consult|doctor|physician|healthcare|health care provider/i)) {
      pushUnique(found, claim, "medical-consultation claim requires copy-eligible cautions evidence", "hard");
    }
  }

  const pregnancyClaims = collectMatches(
    generated,
    /\b(?:pregnant|pregnancy|nursing|breastfeeding|breast feeding)\b/gi,
  );
  for (const claim of pregnancyClaims) {
    note();
    if (!cautionSupports(fields, /pregnant|pregnancy|nursing|breastfeeding|breast feeding/i)) {
      pushUnique(found, claim, "pregnancy/nursing caution requires copy-eligible cautions evidence", "hard");
    }
  }

  const medicationClaims = collectMatches(
    generated,
    /\b(?:medications?|prescriptions?|medical treatment|drug interactions?)\b/gi,
  );
  for (const claim of medicationClaims) {
    note();
    if (!cautionSupports(fields, /medication|prescription|medical treatment|drug interaction/i)) {
      pushUnique(found, claim, "medication/safety claim requires copy-eligible cautions evidence", "hard");
    }
  }

  const timelineClaims = collectMatches(
    generated,
    /\bhow long(?:\s+\w+){0,8}\bresults\b|\bwhen (?:will |do )?(?:i |you )?(?:see|notice|feel|expect) results\b|\bresults in \d+\s+(?:days?|weeks?|months?)\b|\bsee results (?:in|within)\b|\bexpected results\b|\bresults timeline\b/gi,
  );
  for (const claim of timelineClaims) {
    note();
    const evidence = [fields.usage, fields.description].join(". ");
    const hasTimeline =
      /\bresults?\b/i.test(evidence) &&
      (/\b\d+\s*[- ]?(?:day|days|week|weeks|month|months)\b/i.test(evidence) ||
        /\bhow long\b/i.test(evidence) ||
        /\bwhen\b.+\bresults\b/i.test(evidence));
    if (!hasTimeline) {
      pushUnique(found, claim, "results timeline requires copy-eligible usage/description evidence stating a timeline", "hard");
    }
  }

  const dietaryClaims = collectMatches(generated, /\bdietary supplement\b/gi);
  for (const claim of dietaryClaims) {
    note();
    const evidence = `${fields.description} ${fields.features} ${fields.productName}`;
    if (!/\bdietary supplement\b/i.test(evidence)) {
      pushUnique(
        found,
        claim,
        "dietary-supplement category requires explicit copy-eligible description/features wording",
        "hard",
      );
    }
  }

  const purityClaims = collectMatches(
    generated,
    /\b(?:allergen[\s-]?free|free from (?:several\s+)?(?:common\s+)?allergens?|non[\s-]?gmo|gmo[\s-]?free|without gmos?|bpa[\s-]?free|without bpa|no bpa)\b/gi,
  );
  for (const claim of purityClaims) {
    note();
    const evidence = `${fields.cautions} ${fields.description} ${fields.features} ${fields.ingredients}`;
    const allergenOk = /allergen/i.test(claim) ? /allergen/i.test(evidence) : true;
    const gmoOk = /gmo/i.test(claim) ? /gmo/i.test(evidence) : true;
    const bpaOk = /bpa/i.test(claim) ? /bpa/i.test(evidence) : true;
    if (!allergenOk || !gmoOk || !bpaOk) {
      pushUnique(
        found,
        claim,
        "allergen/GMO/BPA claim requires copy-eligible evidence for that specific purity statement",
        "hard",
      );
    }
  }

  if (ctaImpliesOfficialAuthority(generated)) {
    note();
    if (!factsHaveOfficialIdentity(facts)) {
      pushUnique(
        found,
        "Visit Official Website",
        "official-website CTA requires copy-eligible manufacturer or matching official brand identity",
        "hard",
      );
    }
  }

  return { claims: found, matched };
}

export function validateGrounding(generated: string, facts: ProductFacts): GroundingResult {
  const fields = eligibleFieldsFromFacts(facts);
  const fieldAware = scanFieldAwareClaims(generated, fields, facts);
  const unsupported: UnsupportedClaim[] = [...fieldAware.claims];

  const supportBag = `${fields.description}\n${fields.features}`;
  for (const knowledge of KNOWLEDGE_PATTERNS) {
    if (!knowledge.pattern.test(generated)) continue;
    const matches = collectMatches(generated, knowledge.pattern);
    for (const match of matches) {
      const sentence = unitsContaining(generated, match);
      const expansion = /knowledge expansion/i.test(knowledge.reason);
      if (!expansion && anyFieldSupportsClaim(sentence || match, fields)) continue;
      if (expansion && fieldContainsPhrase(supportBag, match)) continue;
      pushUnique(unsupported, sentence || match, knowledge.reason, knowledge.severity);
    }
  }

  const units = splitSentences(generated);
  for (const raw of units) {
    const sentence = raw.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").trim();
    if (!sentence || isNonFactualFrame(sentence)) continue;
    if (isInterrogativeSentence(sentence)) {
      const q = validateFaqQuestion({
        question: sentence,
        supportText: supportBag,
        productName: fields.productName,
      });
      if (q.semanticResult === "PASS") continue;
      pushUnique(unsupported, sentence, q.failCodes[0] || "unsupported question presupposition", "hard");
      continue;
    }
    if (isKnowledgeExpansion(sentence, supportBag)) {
      pushUnique(unsupported, sentence, "unsourced background physiology / knowledge expansion", "hard");
      continue;
    }
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount < 8) continue;

    if (isHedged(sentence)) {
      const rest = sentence.replace(HEDGE_PREFIXES, "").replace(/^[:,\s-]+/, "");
      if (rest && !anyFieldSupportsClaim(rest, fields) && !anyFieldSupportsClaim(sentence, fields)) {
        pushUnique(unsupported, sentence, "attributed claim is not present in copy-eligible ProductFacts", "soft");
      }
      continue;
    }

    if (anyFieldSupportsClaim(sentence, fields)) continue;
    if (unsupported.some((item) => sentence.includes(item.claim) || item.claim.includes(sentence))) continue;

    const claimTokens = contentTokens(sentence);
    const bestHits = bestFieldTokenHits(sentence, fields);
    const ratio = claimTokens.length ? bestHits / claimTokens.length : 0;
    if (ratio < 0.4) {
      pushUnique(unsupported, sentence, "claim is not a semantic restatement of a single copy-eligible field", "hard");
    }
  }

  const generatedWords = generated.split(/\s+/).filter(Boolean).length;
  const generatedIsNeutralQuestion =
    isInterrogativeSentence(generated) &&
    validateFaqQuestion({ question: generated, supportText: supportBag, productName: fields.productName }).semanticResult ===
      "PASS";
  if (
    generatedWords > 0 &&
    generatedWords < 12 &&
    unsupported.length === 0 &&
    !fieldAware.matched &&
    !isNonFactualFrame(generated) &&
    !generatedIsNeutralQuestion
  ) {
    if (!anyFieldSupportsClaim(generated, fields) && contentTokens(generated).length >= 2) {
      pushUnique(unsupported, generated, "claim is not a semantic restatement of a single copy-eligible field", "hard");
    }
  }

  const hard = unsupported.filter((c) => c.severity === "hard");
  const status: GroundingStatus =
    hard.length > 0 ? "UNGROUNDED" : unsupported.length > 0 ? "REVIEW_REQUIRED" : "GROUNDED";
  return { status, unsupportedClaims: unsupported };
}

function unitsContaining(text: string, match: string): string {
  const idx = text.toLowerCase().indexOf(match.toLowerCase());
  if (idx < 0) return match;
  const start = Math.max(0, text.lastIndexOf(".", idx) + 1);
  const after = text.indexOf(".", idx + match.length);
  const end = after >= 0 ? after + 1 : Math.min(text.length, idx + 220);
  return text.slice(start, end).replace(/\s+/g, " ").trim() || match;
}

function bestFieldTokenHits(claim: string, fields: EligibleFields): number {
  const claimTokens = contentTokens(claim);
  if (claimTokens.length === 0) return 0;
  const values = [
    fields.description,
    fields.features,
    fields.ingredients,
    fields.usage,
    fields.cautions,
    fields.pricing,
    fields.guarantee,
    fields.manufacturer,
    fields.productName,
  ];
  let best = 0;
  for (const field of values) {
    const set = new Set(contentTokens(field));
    const hits = claimTokens.filter((token) => set.has(token)).length;
    if (hits > best) best = hits;
  }
  return best;
}

/**
 * Publication composition. UNGROUNDED factual copy is BLOCKED — never READY
 * and never auto-publishable. REVIEW_REQUIRED is not converted to READY.
 */
export function composePublicationGate(policyGate: PublicationGate, grounding: GroundingStatus): PublicationGate {
  if (policyGate === "BLOCKED" || grounding === "UNGROUNDED") return "BLOCKED";
  if (policyGate === "REVIEW_REQUIRED" || grounding === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  return "READY";
}
