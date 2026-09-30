/**
 * Deterministic classifiers for Product Importer V2.
 * Generic marketing/VSL patterns only — no product-specific exceptions.
 */

const CTA_PATTERNS: RegExp[] = [
  /\border\s+\d+\s+bottles?\b/i,
  /\bbuy\s+now\b/i,
  /\badd\s+to\s+cart\b/i,
  /\bget\s+started\b/i,
  /\bclaim\s+(your\s+)?(discount|offer|bottle)/i,
  /\bspecial\s+offer\b/i,
  /\blimited\s+(time|offer)\b/i,
  /\bget\s+\d+\s+free\b/i,
  /\bfree\s+bonuses?\b/i,
  /\bwhile\s+stocks?\s+last\b/i,
  /\bclaim\s+your\s+discounted\b/i,
  /\border\s+now\b/i,
  /\border\s+today\b/i,
  /\bsave\s+up\s+to\s+\d+\s*%/i,
  /\b\d+\s*%\s+off\b/i,
  /\bspecial\s+deal\b/i,
  /\bgrab\s+.{0,24}\bdeal\b/i,
  /\bdiscount(?:ed)?\s+(?:price|offer|cta)\b/i,
  /\bfree\s+shipping\b/i,
  /\bbottles?\s+order\b/i,
  /\btoday:\s*free\b/i,
  /\brrp\b/i,
];

const GENERIC_TITLE = [
  /text presentation/i,
  /\blanding page\b/i,
  /\bofficial\s+site\b/i,
  /^(home|welcome|untitled)$/i,
];

export function isPromotionalOrCta(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return CTA_PATTERNS.some((re) => re.test(t));
}

export function isGenericTitleDescription(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (GENERIC_TITLE.some((re) => re.test(t))) return true;
  if (/^[\w][\w\s]{0,40}\s[-–|:]\s[\w][\w\s]{0,40}$/.test(t) && t.length < 80 && !/\bis\b/i.test(t)) {
    const right = t.split(/\s[-–|:]\s/).pop() ?? "";
    if (/presentation|official|home|welcome|landing/i.test(right)) return true;
  }
  return false;
}

export function isSectionLabel(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  const words = t.split(/\s+/);
  if (/^(about|overview|introduction|ingredients?|features?|benefits?|faq|faqs|guarantee|warnings?|contact|home|menu)\b/i.test(t) && words.length <= 5) {
    return true;
  }
  if (/^about\s+\S+/i.test(t) && words.length <= 5 && !/\b(is|are|was|contains|includes)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function isQuestionHeading(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (/\?/.test(t)) return true;
  return /^(how (do|does|can|should|and)|when (and|do|should)|what (is|are|does)|why (do|does|is)|where (do|does)|who (is|are)|can you|does this|do i|is it|are there|should i|tell me)\b/i.test(
    t,
  );
}

export function stripGenericTitleSuffix(title: string): string {
  return title
    .replace(/\s*[-|–:]\s*(text presentation|official(?: site)?|home|welcome|landing page)\b.*$/i, "")
    .trim();
}

export function namesSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (!longer.includes(shorter)) return false;
  // Allow a short brand suffix/prefix, not a slogan that merely contains the name.
  return longer.length - shorter.length <= 8;
}

export function normalizeName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function countMentions(haystack: string, needle: string): number {
  const n = needle.trim();
  if (n.length < 2) return 0;
  const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return haystack.match(re)?.length ?? 0;
}

export function isPromotionalHeading(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isPromotionalOrCta(t)) return true;
  return [
    /\breal users\b/i,
    /\breal results\b/i,
    /\breal[- ]life[- ]changing\b/i,
    /\blife[- ]changing results\b/i,
    /\btestimonials?\b/i,
    /\bsuccess stories\b/i,
    /\bwhy (?:thousands|people|customers|users)\b/i,
    /\bwhy\b.{0,40}\bchoose\b/i,
    /\bdiscover\b/i,
    /\bthousands choose\b/i,
  ].some((re) => re.test(t));
}

export function isProductLikeName(text: string, operatorHint?: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 80) return false;
  if (operatorHint && normalizeName(t) === normalizeName(operatorHint)) return true;
  if (isPromotionalOrCta(t) || isPromotionalHeading(t)) return false;
  if (isGenericTitleDescription(t)) return false;
  if (isSectionLabel(t) && !operatorHint) return false;
  if (t.split(/\s+/).length > 8) return false;
  return true;
}

export function isOriginOrQualityClaim(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return (
    /\bproudly\s+made\b/i.test(t) ||
    /\bmade in (the )?(usa|u\.s\.a?\.?|united states|america|china|india|europe)\b/i.test(t) ||
    /\bmanufactured in\b/i.test(t) ||
    /\b(premium quality|best quality|highest quality|top quality)\b/i.test(t) ||
    /\b(100%\s*natural|all[- ]natural)\b/i.test(t) ||
    /\b(free shipping|ships (within|in)|worldwide shipping)\b/i.test(t)
  );
}

export function isProductDefiningDescription(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\bis proudly made\b/i.test(t) && !/\b(is an?|is the)\b.{0,50}\b(designed|formulated|contains|includes)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(is an?|is the|are an?)\b.{0,80}\b(supplement|formula|blend|capsule|tablet|device|jacket|coat|probiotic|vitamin|product)\b/i.test(
      t,
    ) ||
    /^(a|an|the)\s+.{8,120}\b(supplement|formula|blend|capsule|tablet|device|jacket|probiotic)\b/i.test(t) ||
    /\b(designed to|formulated to|unique blend|contains|includes)\b/i.test(t)
  );
}

export function isUsefulDescription(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 40) return false;
  if (isGenericTitleDescription(t)) return false;
  if (isPromotionalOrCta(t)) return false;
  if (isSectionLabel(t)) return false;
  if (isOriginOrQualityClaim(t) && !isProductDefiningDescription(t)) return false;
  if (isFactualGuarantee(t) && !isProductDefiningDescription(t)) return false;
  return isProductDefiningDescription(t) || t.length >= 90;
}

/** Navigation/CTA pointing at a policy page is not itself a seller policy. */
export function isPolicyNavigationCta(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  const navVerb = /^(read|see|view|click(?:\s+here)?|check|learn more(?:\s+about)?)\b/i.test(t);
  const policyNoun =
    /\b(refund|return|guarantee|money[\s-]?back)\s+policy\b/i.test(t) || /\bfull\s+refund\s+policy\b/i.test(t);
  if (navVerb && policyNoun) return true;
  if (
    navVerb &&
    /\b(refund|return|guarantee)\b/i.test(t) &&
    t.length < 64 &&
    !/\d+\s*-?\s*days?/i.test(t) &&
    !/\bmoney[\s-]?back\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export function isFactualGuarantee(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return false;
  if (isPolicyNavigationCta(text)) return false;
  if (/transform lives/.test(t) && !/\d+\s*-?\s*day/.test(t) && !/refund/.test(t)) return false;
  const hasDuration = /\d+\s*-?\s*days?/.test(t);
  const hasMoneyTerm = /money[\s-]?back|refund|satisfaction guarantee/.test(t);
  const hasReturnPolicy =
    /\breturn policy\b/.test(t) ||
    /\breturns? (?:are |is )?(?:accepted|allowed|permitted|available)\b/.test(t) ||
    /\b(?:refunds?|returns?) (?:available|accepted) within\b/.test(t);
  if (hasDuration && (hasMoneyTerm || hasReturnPolicy)) return true;
  return /money[\s-]?back guarantee/.test(t);
}

/**
 * FAQ answers are often stored as "Short label: factual sentence".
 * Keep the factual remainder when the label is not itself a policy term.
 * Does not invent wording and does not peel policy-shaped labels.
 */
export function peelNonPolicyColonLabel(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const match = t.match(/^([^:]{2,48}):\s+(\S[\s\S]*)$/);
  if (!match) return t;
  const label = match[1].trim();
  const rest = match[2].trim();
  if (label.split(/\s+/).length > 6) return t;
  if (/\b(?:return|refund|guarantee|warranty|money[\s-]?back|\d+\s*-?\s*days?)\b/i.test(label)) return t;
  if (!isFactualGuarantee(rest)) return t;
  return rest;
}

/** Prefer a duration-bearing seller policy; never rank a CTA above it. */
export function selectFactualGuarantee(candidates: Array<string | undefined | null>): string | undefined {
  const factual: string[] = [];
  for (const raw of candidates) {
    const t = peelNonPolicyColonLabel((raw ?? "").replace(/\s+/g, " ").trim());
    if (!t || isPolicyNavigationCta(t) || !isFactualGuarantee(t)) continue;
    const first = firstSentences(t, 1);
    factual.push(isFactualGuarantee(first) ? first : firstSentences(t, 2));
  }
  if (factual.length === 0) return undefined;
  const withDuration = factual.filter((item) => /\d+\s*-?\s*days?/i.test(item));
  return withDuration[0] ?? factual[0];
}

/**
 * Outcome copy that mentions a dose only to sell a result.
 * "Every capsule you take gets you one step closer" is not a direction.
 */
export function isPromotionalUsageOutcome(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\b(step closer|closer to (?:this|that|your|the)|will get you|gets you)\b/i.test(t)) return true;
  if (/\bevery\b[^.]{0,80}\byou\s+(?:take|chew|swallow|use)\b/i.test(t)) return true;
  return false;
}

export function isUsageInstruction(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (isPromotionalOrCta(t) || isPromotionalUsageOutcome(t)) return false;
  if (t.length < 12 || t.length > 400) return false;
  const ingest = /\b(take|chew|swallow|dissolve)\b/i.test(t);
  const topical = /\b(apply|massage)\b/i.test(t);
  if (!ingest && !topical) return false;
  const hasQty = /\b(\d+|one|two|three|four|five|six)\b/i.test(t);
  const hasUnit =
    /\b(capsules?|tablets?|drops?|scoops?|softgels?|gummies|gummy|servings?|chews?)\b/i.test(t);
  const hasFreq =
    /\b(daily|once\s+(a|per)\s+day|per\s+day|each\s+day|every\s+(day|morning)|twice|times?\s+(a|per)\s+day|morning|evening|night)\b/i.test(
      t,
    );
  const withVehicle =
    /\b(?:take|chew|swallow|dissolve|apply|massage)\b(?:\s+\S+){0,6}\s+with\s+(?:a\s+|an\s+|the\s+)?(?:water|food|meals?|milk|juice|breakfast|lunch|dinner)\b/i.test(
      t,
    );
  const directive =
    /(?:^|[.!;]\s+)(?:(?:simply|just|please|only|always|adults|users)\s+)?(?:(?:we|it is|it's)\s+)?(?:recommend(?:ed)?\s+(?:that\s+)?(?:you\s+)?)?(?:should\s+)?(?:slowly|gently|carefully\s+)?(?:to\s+)?(?:take|chew|swallow|dissolve|apply|massage)\b/i.test(
      t,
    );
  const relativeHabit = /\byou(?:'ll|’ll)?\s+(?:take|chew|swallow|dissolve|apply|massage)\b/i.test(t);
  const labelOnly =
    /\b(follow (the )?(product )?label|see (the )?label|as directed on (the )?label|dosage is (clearly )?(mentioned|listed|printed|found) on|take (it )?consistently)\b/i.test(
      t,
    );
  if (labelOnly && !(hasQty && hasUnit) && !withVehicle) return false;
  if (relativeHabit && !directive) return false;
  if (directive && withVehicle) return true;
  if (ingest) {
    if (directive && (hasUnit || hasFreq)) return true;
    return Boolean((hasQty && hasUnit) || (hasUnit && hasFreq));
  }
  return Boolean(hasFreq || (directive && withVehicle));
}

/** Prefer the actionable instruction; drop a trailing health-benefit clause when separable. */
export function normalizeUsageInstruction(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const core = t
    .split(
      /\s+(?:to support|to help|to promote|to boost|for the health of|so that you|in order to)\b/i,
    )[0]
    ?.replace(/[.,;:\s]+$/g, "")
    .trim();
  if (!core || core === t.replace(/[.,;:\s]+$/g, "").trim()) {
    return t;
  }
  const candidate = `${core}.`;
  if (isUsageInstruction(candidate) || isUsageInstruction(core)) return candidate;
  return t;
}

export function isUsageQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\bhow many servings?\b/i.test(t) && !/\b(capsule|tablet|take|use)\b/i.test(t)) return false;
  if (/\beasy to use\b/i.test(t)) return false;
  return /\b(how (do i|should i|to) (use|take)|when (and how|should i|do i|to) (take|use)|how should i take|directions|recommended (use|dosage|serving)|serving directions|how (do|can) i (take|use)|how many (capsules?|tablets?|pills|drops) (should|do) i|when should i take|(?:best|right|correct|proper)\s+way\s+to\s+(?:take|use)|how\s+to\s+(?:take|use)|way\s+to\s+take)\b/i.test(
    t,
  );
}

export function isCautionQuestion(text: string): boolean {
  return /\b(side effects?|warnings?|precautions?|safe to take|any risks?)\b/i.test(text);
}

export function isGuaranteeQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (!isQuestionHeading(t) && !/\?/.test(t)) return false;
  if (/\b(homepage|home page|back to (the )?home)\b/i.test(t)) return false;
  return /\b(guarantee|refund|money[\s-]?back|return policy)\b/i.test(t);
}

export function isFaqContainerHeading(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return /^(faqs?|frequently asked questions|questions?\s*(and|&)\s*answers?)$/i.test(t);
}

export function isIngredientQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return /\b(ingredients?|what(?:'s| is) (?:in(?:side)? it|it made of)|what does (?:it|this) contain)\b/i.test(t);
}

export function isAuthorityLanguage(text: string): boolean {
  return /\b(?:fda[\s-]*(?:inspected|registered|approved|clearance)|not fda approved|c[\s-]?gmp|gmp certified|doctor[\s-]*formulated|clinically proven|clinical stud(?:y|ies)|clinical trials?|scientifically proven|scientific proof)\b/i.test(
    text,
  );
}

export function isAbsenceClaimLanguage(text: string): boolean {
  return /\b(?:allergen[\s-]*free|gmo[\s-]*free|non[\s-]*gmo|bpa[\s-]*free|sugar[\s-]*free|gluten[\s-]*free|dairy[\s-]*free|free from (?:gluten|dairy|allergens?|gmos?|bpa))\b/i.test(
    text,
  );
}

export function isManufacturerQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return /\b(who (makes|manufactures|produced?|is the manufacturer)|which company (makes|manufactures)|who is (the )?(manufacturer|maker)|manufactured by whom)\b/i.test(
    t,
  );
}

export function isSupportProviderQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return /\b(who (provides|handles) (customer |product )?support|who (do i|should i) contact|customer support|product support|who (is|provides) (the )?support)\b/i.test(
    t,
  );
}

export function isManufacturerStatement(text: string): boolean {
  return /\b(?:(?:the )?(?:product|formula|item) (?:is|was) )?(?:manufactured|made|produced) by\b/i.test(text);
}

export function isSupportProviderStatement(text: string): boolean {
  return /\b(?:support is provided by|provides (?:product |customer )?support|customer service is (?:provided )?by)\b/i.test(
    text,
  );
}

const INGREDIENT_CLAIM_TOKENS = new Set([
  "natural",
  "organic",
  "premium",
  "quality",
  "flexibility",
  "mobility",
  "performance",
  "safe",
  "effective",
  "clean",
  "pure",
  "potent",
  "advanced",
  "unique",
  "proprietary",
  "clinically",
  "proven",
  "fillers",
  "additives",
  "gluten",
  "dairy",
  "vegan",
  "vegetarian",
  "formula",
  "ingredients",
  "ingredient",
]);

function hasComponentMorphology(text: string): boolean {
  return (
    /\b(extract|acid|oil|root|bark|leaf|seed|powder|complex|concentrate|isolate|peptide|enzyme|vitamin|mineral|probiotic|hyaluronan|hyaluronic|collagen|sulfate|oxide|cellulose|fiber)\b/i.test(
      text,
    ) || /[®™]/.test(text)
  );
}

export function looksLikeHeadlineOrSlogan(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (hasComponentMorphology(t)) return false;
  if (
    /^(reclaim|discover|unlock|enjoy|experience|restore|transform|feel|live|embrace|achieve|boost|improve|enhance|grab|welcome|never|try)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\byour\b/i.test(t)) return true;
  if (/\b(freedom|lifestyle|journey|vitality|limitless|possibility)\b/i.test(t)) return true;
  const words = t.split(/\s+/);
  const titleCase = words.filter((word) => /^[A-Z]/.test(word)).length;
  if (words.length >= 4 && titleCase >= 3 && !/[0-9]/.test(t)) return true;
  return false;
}

/** A contents description ("blend of 4 plants"), not one component name. */
export function isMixtureCaption(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return /\b(?:blend|formula|complex|mixture|mix)\s+of\b/i.test(t);
}

export function looksLikeIngredientName(text: string): boolean {
  const t = text.replace(/\s+/g, " ").replace(/[:]+$/g, "").trim();
  if (t.length < 2 || t.length > 80) return false;
  if (isMixtureCaption(t)) return false;
  if (isPromotionalOrCta(t)) return false;
  if (isSectionLabel(t)) return false;
  if (looksLikeHeadlineOrSlogan(t) && !/[&,]|\(/.test(t)) return false;
  if (/[.]/.test(t) && t.split(".").length > 2) return false;
  if (
    /\b(unique ingredients?|clinically proven|scientifically proven|support the health|designed to|is made|are made|developed by|choice for|daily (joint )?support|long-term)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /\b(non[- ]?gmo|gmo[- ]?free|gluten[- ]?free|dairy[- ]?free|filler-free|no harmful|unwanted fillers|all natural|100%\s*natural|free from gluten)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  const words = t.split(/\s+/);
  if (words.length > 8) return false;
  if (!/[a-z]/i.test(t)) return false;
  if (/^\d/.test(t) && !/\b(bl|atcc|cfu)\b/i.test(t)) return false;
  if (/\b(is|are|was|were|making)\b/i.test(t) && words.length >= 4) return false;
  const compact = t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (INGREDIENT_CLAIM_TOKENS.has(t.toLowerCase()) || INGREDIENT_CLAIM_TOKENS.has(compact)) return false;
  const distinctive = words.filter((word) => {
    const token = word.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return token.length >= 3 && !INGREDIENT_CLAIM_TOKENS.has(token);
  });
  return distinctive.length > 0;
}

/** A component name, not a sentence, a slogan, or a blend caption. */
export function isIngredientIdentityName(text: string): boolean {
  const t = text.replace(/\s+/g, " ").replace(/[:]+$/g, "").trim();
  if (!looksLikeIngredientName(t)) return false;
  if (/\b(supports?|helps?|maintains?|promotes?|targets?|contains?)\b/i.test(t)) return false;
  if (/\b(is an?|is the)\b/i.test(t)) return false;
  const core = t.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const words = core.split(/\s+/).filter(Boolean);
  if (/\b[a-z]{4,}\b/.test(core) && words.length >= 4) return false;
  return true;
}

export function isDiseaseTreatmentClaim(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return (
    /\b(treats?|treating|treatment|cures?|curing|cure)\b/i.test(t) ||
    /\bprevents?\s+(?:the\s+)?(?:disease|cancer|diabetes|arthritis)\b/i.test(t)
  );
}

/**
 * Purchase-context labels a page prints in the same short-chip shape as product
 * attributes: offer boxes, social proof, logistics. They describe the sale, not
 * the product, so they never become product characteristics.
 */
const PURCHASE_CONTEXT_CHIP =
  /\b(verified purchase|most popular|best value|best[- ]?seller|top seller|in stock|sold out|limited|basic|standard|starter|bundle|day supply|total|subtotal|shipping|delivery|refund|guarantee|money[- ]back|warranty|price|pricing|discount|sale|save|offer|bonus|free (?:shipping|bottle|bonus)|reviews?|ratings?|customers?|orders?|checkout|cart|buy|add to)\b/i;

/**
 * A short attribute label printed as one of a row of chips: "Non-GMO",
 * "Gluten Free", "No Stimulants". Explicit seller-stated product characteristics
 * that are too short to read as feature sentences.
 */
export function isProductAttributeChip(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 3 || t.length > 32) return false;
  if (/[0-9$€£%]/.test(t)) return false;
  if (/[.!?:;·•|]/.test(t)) return false;
  if (!/^[A-Za-z][A-Za-z\s'’\-/&]*$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 4) return false;
  if (isPromotionalOrCta(t)) return false;
  if (isPromotionalHeading(t)) return false;
  if (isSectionLabel(t)) return false;
  if (isQuestionHeading(t)) return false;
  if (PURCHASE_CONTEXT_CHIP.test(t)) return false;
  return true;
}

export function isFeatureStatement(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 12 || t.length > 300) return false;
  if (isPromotionalOrCta(t)) return false;
  if (isSectionLabel(t)) return false;
  if (isGenericTitleDescription(t)) return false;
  if (isDiseaseTreatmentClaim(t)) return false;
  return true;
}

export function isSafetyMarketing(text: string): boolean {
  return /\b(generally\s+well[- ]tolerated|well[- ]tolerated|minimal risk|risk of side effects is (low|minimal)|few side effects|no known side effects|completely safe)\b/i.test(
    text,
  );
}

export function isActualCaution(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 12) return false;
  if (isPromotionalOrCta(t)) return false;
  if (isSafetyMarketing(t) && !/\b(if|do not|pregnan|allerg|medication|consult|keep out)\b/i.test(t)) {
    return false;
  }
  return /\b(do not (use|take|exceed)|not for use|keep out of reach|contraindicat|allerg(?:y|ies|ic)|pregnan|nurs(?:e|ing)|medication|prescription|drug interaction|consult (your )?(doctor|physician|healthcare|health[- ]care) (provider|professional)|talk to (a |your )?(doctor|clinician|physician)|if you (are|have|take)|under \d+|not intended to (diagnose|treat|cure)|warning\b|discontinue)\b/i.test(
    t,
  );
}

export function cautionStatementsFrom(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pool = parts.length > 1 ? parts : [t];
  return pool.filter((part) => isActualCaution(part) && (!isSafetyMarketing(part) || /\b(if|do not|pregnan|medication|consult|keep out)\b/i.test(part)));
}

export function firstSentences(text: string, max = 2): string {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return parts.slice(0, max).join(" ");
}

export function evidenceInSource(value: string, sourceText: string): boolean {
  const v = value.replace(/\s+/g, " ").trim().toLowerCase();
  const s = sourceText.replace(/\s+/g, " ").trim().toLowerCase();
  if (v.length < 4) return s.includes(v);
  if (s.includes(v)) return true;
  const window = v.slice(0, Math.min(80, v.length));
  return s.includes(window);
}
