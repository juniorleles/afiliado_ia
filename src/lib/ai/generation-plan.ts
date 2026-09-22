/**
 * GENERATION_TOPIC_BUDGET — product-specific topics the model may discuss.
 *
 * Distinct from the fact contract (what values the model may see).
 * ABSENT FACT FIELD = ABSENT PRODUCT-SPECIFIC TOPIC.
 * Missing facts are omission, not content.
 */

import {
  getConsumerCopyEligibleFacts,
  type ConsumerCopyEligibleFacts,
  type ProductFacts,
} from "@/lib/product-facts";
import {
  isIngredientsFieldAssertion,
  namedIngredientMentions,
} from "@/lib/ai/ingredient-claims";

export const GENERATION_TOPICS = [
  "identity",
  "description",
  "features",
  "ingredients",
  "usage",
  "cautions",
  "pricing",
  "guarantee",
  "manufacturer",
  "results_timeline",
  "category_classification",
  "background_science",
] as const;

export type GenerationTopic = (typeof GENERATION_TOPICS)[number];

export function isCanonicalGenerationTopic(value: string): value is GenerationTopic {
  return (GENERATION_TOPICS as readonly string[]).includes(value);
}

export const GENERATION_BLOCK_TYPES = [
  "HERO",
  "OVERVIEW",
  "FEATURES",
  "INGREDIENTS",
  "USAGE",
  "CAUTIONS",
  "PRICING",
  "GUARANTEE",
  "MANUFACTURER",
  "FAQ",
  "FINAL_THOUGHTS",
] as const;

export type GenerationBlockType = (typeof GENERATION_BLOCK_TYPES)[number];

export type FactCoverage = "RICH" | "ADEQUATE" | "THIN" | "INSUFFICIENT";

export const GENERATION_ROUTES = ["DETERMINISTIC_THIN", "MODEL"] as const;
export type GenerationRoute = (typeof GENERATION_ROUTES)[number];

export type GenerationWordBudget = {
  headline: number;
  summary: number;
  overview: number;
  features: number;
  ingredients: number;
  usage: number;
  cautions: number;
  pricing: number;
  guarantee: number;
  manufacturer: number;
  faqItems: number;
  faqAnswer: number;
  finalThoughts: number;
};

export type GenerationPlan = {
  coverage: FactCoverage;
  thinMode: boolean;
  generationRoute: GenerationRoute;
  allowedTopics: GenerationTopic[];
  closedTopics: GenerationTopic[];
  allowedSections: string[];
  disallowedSections: string[];
  factualFieldsAvailable: string[];
  factualFieldsMissing: string[];
  featurePhrases: string[];
  descriptionText: string;
  authorizedBlocks: GenerationBlockType[];
  optionalBlocks: GenerationBlockType[];
  disallowedBlocks: GenerationBlockType[];
  wordBudget: GenerationWordBudget;
  faqAllowed: boolean;
};

export type GenerationPlanViolation = {
  topic: GenerationTopic;
  text: string;
  reason: string;
  requiredField: string;
};

const SUBSTANTIAL_FIELDS = [
  "ingredientsOrComponents",
  "usageInformation",
  "cautions",
  "pricingInformation",
  "guaranteeInformation",
  "manufacturer",
] as const;

const TIMELINE_EVIDENCE =
  /\bresults?\b.{0,40}\b(?:day|days|week|weeks|month|months|timeline|how long)\b|\bhow long\b.{0,40}\bresults?\b|\bsee results\b|\bexpected results\b/i;

const CATEGORY_EVIDENCE =
  /\bdietary supplement\b|\bmedical device\b|\b(?:is|as) a (?:daily )?supplement\b|\btreatment\b|\btherapy\b/i;

function hasContent(value: string | string[]): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim());
  return Boolean(value.trim());
}

export function classifyFactCoverage(facts: ProductFacts): FactCoverage {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const available: string[] = [];
  if (eligible.description) available.push("description");
  if (eligible.features.length) available.push("features");
  if (eligible.ingredientsOrComponents.length) available.push("ingredientsOrComponents");
  if (eligible.usageInformation.length) available.push("usageInformation");
  if (eligible.cautions.length) available.push("cautions");
  if (eligible.pricingInformation) available.push("pricingInformation");
  if (eligible.guaranteeInformation) available.push("guaranteeInformation");
  if (eligible.manufacturer) available.push("manufacturer");
  const extra = SUBSTANTIAL_FIELDS.filter((field) => available.includes(field)).length;
  if (facts.importQuality === "INSUFFICIENT" && available.length === 0) return "INSUFFICIENT";
  if (available.length >= 4 && extra >= 2) return "RICH";
  if ((available.includes("description") || available.includes("features")) && extra >= 1) return "ADEQUATE";
  if (available.length >= 1 || eligible.productName) return available.length >= 1 ? "THIN" : "INSUFFICIENT";
  return "INSUFFICIENT";
}

export function createGenerationPlan(facts: ProductFacts): GenerationPlan {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const available: string[] = [];
  const missing: string[] = [];
  const mark = (field: string, open: boolean) => {
    if (open) available.push(field);
    else missing.push(field);
  };
  mark("productName", Boolean(eligible.productName));
  mark("description", Boolean(eligible.description));
  mark("features", eligible.features.length > 0);
  mark("ingredientsOrComponents", eligible.ingredientsOrComponents.length > 0);
  mark("usageInformation", eligible.usageInformation.length > 0);
  mark("cautions", eligible.cautions.length > 0);
  mark("pricingInformation", Boolean(eligible.pricingInformation));
  mark("guaranteeInformation", Boolean(eligible.guaranteeInformation));
  mark("manufacturer", Boolean(eligible.manufacturer));

  const eligibleBag = eligibleTextBag(eligible);
  const allowed: GenerationTopic[] = [];
  const closed: GenerationTopic[] = [];
  const setTopic = (topic: GenerationTopic, open: boolean) => {
    if (open) allowed.push(topic);
    else closed.push(topic);
  };

  setTopic("identity", Boolean(eligible.productName));
  setTopic("description", Boolean(eligible.description));
  setTopic("features", eligible.features.length > 0);
  setTopic("ingredients", eligible.ingredientsOrComponents.length > 0);
  setTopic("usage", eligible.usageInformation.length > 0);
  setTopic("cautions", eligible.cautions.length > 0);
  setTopic("pricing", Boolean(eligible.pricingInformation));
  setTopic("guarantee", Boolean(eligible.guaranteeInformation));
  setTopic("manufacturer", Boolean(eligible.manufacturer));
  setTopic("results_timeline", TIMELINE_EVIDENCE.test(eligibleBag));
  setTopic("category_classification", CATEGORY_EVIDENCE.test(eligibleBag));
  setTopic("background_science", false);

  const allowedSections: string[] = [];
  const disallowedSections: string[] = [];
  const section = (name: string, open: boolean) => {
    if (open) allowedSections.push(name);
    else disallowedSections.push(name);
  };
  section("What Is / Overview", allowed.includes("identity") || allowed.includes("description"));
  section("Key Features", allowed.includes("features"));
  section("Ingredients / Components", allowed.includes("ingredients"));
  section("How It Works / How to Use", allowed.includes("usage"));
  section("Cautions", allowed.includes("cautions"));
  section("Pricing", allowed.includes("pricing"));
  section("Guarantee", allowed.includes("guarantee"));
  section("Manufacturer", allowed.includes("manufacturer"));
  const faqAllowed = allowed.some((topic) => topic !== "background_science");
  section("FAQ", faqAllowed);
  allowedSections.push("Final Thoughts");

  const coverage = classifyFactCoverage(facts);
  const thinMode = coverage === "THIN" || coverage === "INSUFFICIENT";
  const authorizedBlocks: GenerationBlockType[] = ["HERO"];
  if (allowed.includes("identity") || allowed.includes("description")) authorizedBlocks.push("OVERVIEW");
  if (allowed.includes("features")) authorizedBlocks.push("FEATURES");
  if (allowed.includes("ingredients")) authorizedBlocks.push("INGREDIENTS");
  if (allowed.includes("usage")) authorizedBlocks.push("USAGE");
  if (allowed.includes("cautions")) authorizedBlocks.push("CAUTIONS");
  if (allowed.includes("pricing")) authorizedBlocks.push("PRICING");
  if (allowed.includes("guarantee")) authorizedBlocks.push("GUARANTEE");
  if (allowed.includes("manufacturer")) authorizedBlocks.push("MANUFACTURER");
  authorizedBlocks.push("FINAL_THOUGHTS");
  const optionalBlocks: GenerationBlockType[] = faqAllowed ? ["FAQ"] : [];
  const disallowedBlocks = GENERATION_BLOCK_TYPES.filter(
    (type) => type !== "FAQ" && !authorizedBlocks.includes(type),
  );
  if (!faqAllowed) disallowedBlocks.push("FAQ");

  return {
    coverage,
    thinMode,
    generationRoute: thinMode ? "DETERMINISTIC_THIN" : "MODEL",
    allowedTopics: allowed,
    closedTopics: closed,
    allowedSections,
    disallowedSections,
    factualFieldsAvailable: available,
    factualFieldsMissing: missing,
    featurePhrases: [...eligible.features],
    descriptionText: eligible.description,
    authorizedBlocks,
    optionalBlocks,
    disallowedBlocks,
    wordBudget: wordBudgetForCoverage(coverage),
    faqAllowed,
  };
}

export function wordBudgetForCoverage(coverage: FactCoverage): GenerationWordBudget {
  if (coverage === "RICH") {
    return {
      headline: 20,
      summary: 80,
      overview: 220,
      features: 220,
      ingredients: 180,
      usage: 160,
      cautions: 140,
      pricing: 80,
      guarantee: 80,
      manufacturer: 80,
      faqItems: 6,
      faqAnswer: 50,
      finalThoughts: 140,
    };
  }
  if (coverage === "ADEQUATE") {
    return {
      headline: 18,
      summary: 60,
      overview: 180,
      features: 180,
      ingredients: 140,
      usage: 120,
      cautions: 100,
      pricing: 60,
      guarantee: 70,
      manufacturer: 70,
      faqItems: 4,
      faqAnswer: 40,
      finalThoughts: 120,
    };
  }
  return {
    headline: 16,
    summary: 45,
    overview: 120,
    features: 120,
    ingredients: 80,
    usage: 80,
    cautions: 60,
    pricing: 40,
    guarantee: 50,
    manufacturer: 50,
    faqItems: 2,
    // THIN FAQ answer budget stays 35. Run 04 answers were 38 and 36 words
    // with attribution/editorial filler that can be compressed; do not enlarge.
    faqAnswer: 35,
    finalThoughts: 80,
  };
}

function eligibleTextBag(eligible: ConsumerCopyEligibleFacts): string {
  return [
    eligible.productName,
    eligible.description,
    ...eligible.features,
    ...eligible.ingredientsOrComponents,
    ...eligible.usageInformation,
    ...eligible.cautions,
    eligible.pricingInformation,
    eligible.guaranteeInformation,
    eligible.manufacturer,
  ]
    .join("\n")
    .toLowerCase();
}

export function formatGenerationPlanForPrompt(plan: GenerationPlan): string {
  const lines = [
    "GENERATION PLAN — product-specific topic budget. Follow this exactly.",
    `COVERAGE: ${plan.coverage}${plan.thinMode ? " (THIN_FACT_MODE)" : ""}`,
    `GENERATION_ROUTE: ${plan.generationRoute}.`,
    `ALLOWED_TOPICS: ${plan.allowedTopics.join(", ") || "none"}.`,
    `CLOSED_TOPICS: ${plan.closedTopics.join(", ") || "none"}.`,
    `ALLOWED_SECTIONS: ${plan.allowedSections.join(", ")}.`,
    `DISALLOWED_SECTIONS: ${plan.disallowedSections.join(", ") || "none"}.`,
    `FACTUAL_FIELDS_AVAILABLE: ${plan.factualFieldsAvailable.join(", ") || "none"}.`,
    `FACTUAL_FIELDS_MISSING: ${plan.factualFieldsMissing.join(", ") || "none"}.`,
    `AUTHORIZED_BLOCKS: ${plan.authorizedBlocks.join(", ")}.`,
    `OPTIONAL_BLOCKS: ${plan.optionalBlocks.join(", ") || "none"}.`,
    `DISALLOWED_BLOCKS: ${plan.disallowedBlocks.join(", ") || "none"}.`,
    `WORD_BUDGET: headline<=${plan.wordBudget.headline}; summary<=${plan.wordBudget.summary}; overview<=${plan.wordBudget.overview}; features<=${plan.wordBudget.features}; faqItems<=${plan.wordBudget.faqItems}; finalThoughts<=${plan.wordBudget.finalThoughts}.`,
    "CODE_OWNS_EVIDENCE_ASSIGNMENT. Fill Evidence Slot Plan slots only. Do not choose evidence IDs or FAQ topics.",
    "Restate only projected slot claims. Do not add editorial characterization or results-expectation framing.",
    "CODE owns which factual blocks exist. Fill only authorized/optional blocks. Do not add block types.",
    "ABSENT FACT FIELD = ABSENT PRODUCT-SPECIFIC TOPIC. Omit closed topics entirely.",
    "MISSING_FACT_IS_OMISSION_NOT_CONTENT. Do not write that a field is unavailable, not disclosed, or missing.",
    "FEATURE_FACT_DOES_NOT_GRANT_FIELD_AUTHORITY. A feature phrase is not usage, guarantee, or ingredient authority.",
    "MODEL_WORLD_KNOWLEDGE_IS_NOT_PRODUCT_EVIDENCE. Do not add background science, category knowledge, or causal chains.",
    "FAQ topic must be an ALLOWED_TOPICS machine id. Consumer questions stay natural English and must restate the slot's projected claims.",
    "Shorter literal restatement is preferred. Sparse copy is valid.",
    "Zero product-specific FAQs is acceptable. Fewer sections are required when facts are thin.",
    "Neutral CTA only: Learn More, View Product Details, or Check Current Details. Do not use Check Current Price unless pricing is ALLOWED.",
  ];
  if (plan.closedTopics.includes("ingredients")) {
    lines.push(
      "INGREDIENTS CLOSED: do not name specific ingredients, ask what is in the formula, or write that ingredient names are not disclosed. Generic restatement of eligible description/feature wording that mentions ingredients is description/feature restatement, not ingredients-field authority.",
    );
  }
  if (plan.closedTopics.includes("usage")) {
    lines.push(
      "USAGE CLOSED: usage-instruction spans are excluded from projected evidence. Do not write take, taken daily, dosage, regimen, or directions.",
    );
  }
  if (plan.closedTopics.includes("manufacturer")) {
    lines.push(
      "MANUFACTURER CLOSED: do not discuss manufacturer identity, transparency, facility, location, GMP/FDA, contact, or that manufacturer information is unavailable.",
    );
  }
  if (plan.closedTopics.includes("pricing")) {
    lines.push(
      "PRICING CLOSED: do not discuss price, cost, discount, sale, deal, pricing transparency, or that pricing is unavailable.",
    );
  }
  if (plan.closedTopics.includes("guarantee")) {
    lines.push(
      "GUARANTEE CLOSED: do not discuss guarantee, refund, return window, risk-free trial, money-back, or that guarantee details are unavailable. Do not elevate a description mention into a Guarantee section.",
    );
  }
  if (plan.closedTopics.includes("results_timeline")) {
    lines.push(
      "RESULTS TIMELINE CLOSED: do not ask or answer how long it takes to notice results, time-to-effect, or expected-results timelines.",
    );
  }
  if (plan.closedTopics.includes("category_classification")) {
    lines.push(
      "CATEGORY CLOSED: do not call the product a supplement, dietary supplement, medical device, treatment, or therapy unless that classification is in eligible facts.",
    );
  }
  if (plan.closedTopics.includes("background_science")) {
    lines.push(
      "BACKGROUND SCIENCE CLOSED: restatement of eligible wording is allowed. Do not add encyclopedia physiology, friction/cartilage explanations, or unstated causal chains.",
    );
  }
  if (plan.thinMode) {
    lines.push(
      "THIN_FACT_MODE: you are a conservative rewriter, not a copywriter. Use only the meaning explicitly present in each slot's authorized evidence.",
      "Do not infer benefits, audience, purpose, convenience, quality, strategy, category, mechanism, comparison, or conclusions. Prefer shorter copy or omission over adding meaning.",
      "Do not fill whitespace with generic knowledge, invented trust content, invented objections, or missing-information commentary.",
    );
  }
  return lines.join("\n");
}

function requiredFieldForTopic(topic: GenerationTopic): string {
  if (topic === "ingredients") return "ingredientsOrComponents";
  if (topic === "usage") return "usageInformation";
  if (topic === "pricing") return "pricingInformation";
  if (topic === "guarantee") return "guaranteeInformation";
  if (topic === "manufacturer") return "manufacturer";
  if (topic === "cautions") return "cautions";
  if (topic === "results_timeline") return "usageInformation";
  return "description";
}

function closedTopicForAbsenceSentence(text: string, closed: Set<GenerationTopic>): GenerationTopic | null {
  const lower = text.toLowerCase();
  const candidates: Array<[GenerationTopic, RegExp]> = [
    ["ingredients", /\bingredient/],
    ["manufacturer", /\bmanufacturer|\bfacility|\bgmp|\bcgmp/],
    ["pricing", /\bpric|\bcost|\bdiscount/],
    ["usage", /\bdosage|\bserving|\busage direction|\bhow to (?:take|use)/],
    ["cautions", /\bcaution|\bwarning|\ballergen|\bcontraindication/],
    ["guarantee", /\bguarantee|\brefund|\bmoney[\s-]?back/],
  ];
  for (const [topic, pattern] of candidates) {
    if (closed.has(topic) && pattern.test(lower)) return topic;
  }
  return null;
}

export const USAGE_INSTRUCTION_SOURCE =
  String.raw`(?:that is still\s+)?(?:simple enough|enough)\s+to\s+take(?:n)?(?:\s+once)?(?:\s+each\s+morning)?|\btake once each morning\b|\btaken?\s+once each morning\b|\btake\s+(?:one|a|once|daily)\b|\btaken\s+(?:once|daily)\b|\btake daily\b|\btaken daily\b|\btake as directed\b|\buse as directed\b|\buse once daily\b|\buse one capsule daily\b|\brecommended dosage\b|\brecommended once daily\b|\brecommended every morning\b|\brecommended daily\b|\brecommended use\b|\bone dose(?:\s+each|\s+every|\s+daily|\s+per day)?\b|\bdose each morning\b|\bhow to (?:take|use)\b|\b\d+\s+servings?\b|\bcapsules?\s+(?:daily|a day|per day)\b|\bonce[- ]daily (?:use|dose|regimen)\b|\bdaily (?:regimen|dosage)\b|\bregimen\b|\bdirections\b|\b(?:usage )?instructions\b`;

const TEMPORAL_DESCRIPTION_SOURCE =
  String.raw`\bdaily use\b|\bonce[- ]each[- ]morning\b|\bonce each morning\b`;

export const GUARANTEE_REFERENCE_SOURCE =
  String.raw`\b\d+\s*[- ]?days?[\s-]+(?:money[\s-]?back|refund|return|guarantee|warranty)(?:\s+(?:policy|period|window))?\b|\b\d+\s*[- ]?days?[\s-]+vendor(?:\s+(?:guarantee|refund|policy))?\b|\b(?:refund|money[\s-]?back)\s+(?:period|policy|guarantee)\b|\bmoney[\s-]?back(?:\s+guarantee)?\b|\breturn window\b|\breturn policy\b|\bvendor guarantee\b|\bvendor refund\b`;

export function hasUsageAuthorityLanguage(text: string): boolean {
  return usageInstructionSpans(text).length > 0;
}

export function collectSpans(text: string, pattern: RegExp): Array<{ text: string; start: number; end: number }> {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: Array<{ text: string; start: number; end: number }> = [];
  let match = re.exec(text);
  while (match) {
    out.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    if (match.index === re.lastIndex) re.lastIndex += 1;
    match = re.exec(text);
  }
  return out;
}

const NON_USAGE_DIRECTIONS_CONTEXT =
  /\b(?:several|multiple|complementary|different|various|opposing|many)\b[^.]{0,40}$/i;

/** Usage-instruction sense of "directions". Aspect/angle uses are not dosage directions. */
export function directionsSpanIsUsage(text: string, start: number): boolean {
  const token = text.slice(start, start + "directions".length);
  if (!/^directions$/i.test(token)) return true;
  const before = text.slice(Math.max(0, start - 48), start);
  const after = text.slice(start + token.length, start + token.length + 48);
  if (/\b(?:usage|follow|label|taking|take|dose|capsule)\b/i.test(`${before} ${after}`)) return true;
  if (/^\s+for\s+(?:taking|use|using)\b/i.test(after)) return true;
  if (NON_USAGE_DIRECTIONS_CONTEXT.test(before)) return false;
  if (/^\s+of\s+analysis\b/i.test(after)) return false;
  return true;
}

export function usageInstructionSpans(text: string): Array<{ text: string; start: number; end: number }> {
  return collectSpans(text, new RegExp(USAGE_INSTRUCTION_SOURCE, "gi")).filter((span) =>
    directionsSpanIsUsage(text, span.start),
  );
}

export function temporalDescriptionSpans(text: string): Array<{ text: string; start: number; end: number }> {
  const usage = usageInstructionSpans(text);
  return collectSpans(text, new RegExp(TEMPORAL_DESCRIPTION_SOURCE, "gi")).filter(
    (span) => !usage.some((item) => span.start >= item.start && span.end <= item.end),
  );
}

export function guaranteeReferenceSpans(text: string): Array<{ text: string; start: number; end: number }> {
  return collectSpans(text, new RegExp(GUARANTEE_REFERENCE_SOURCE, "gi"));
}

export function hasGuaranteeReferenceLanguage(text: string): boolean {
  return guaranteeReferenceSpans(text).length > 0;
}

function collect(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: string[] = [];
  let match = re.exec(text);
  while (match) {
    out.push(match[0].trim());
    if (match.index === re.lastIndex) re.lastIndex += 1;
    match = re.exec(text);
  }
  return out;
}

function isConservativeFeatureRestatement(text: string, plan: GenerationPlan): boolean {
  const lower = text.toLowerCase();
  const instructional = hasUsageAuthorityLanguage(text);
  if (instructional) return false;
  return plan.featurePhrases.some((phrase) => {
    const p = phrase.toLowerCase();
    if (p.includes("once each morning") && /once[- ]each[- ]morning/.test(lower)) return true;
    const slice = p.slice(0, 48);
    return slice.length >= 12 && lower.includes(slice.slice(0, 24));
  });
}

function isDescriptionRestatement(text: string, plan: GenerationPlan): boolean {
  if (!plan.descriptionText) return false;
  const lower = text.toLowerCase();
  const slice = plan.descriptionText.toLowerCase().slice(0, 48);
  return slice.length >= 12 && lower.includes(slice.slice(0, 20));
}

export function isKnowledgeExpansion(text: string, eligibleSupport: string): boolean {
  const lower = text.toLowerCase();
  const support = eligibleSupport.toLowerCase();
  const restatesEligible =
    /synovial[- ]fluid quality/.test(lower) && /synovial[- ]fluid quality/.test(support);
  if (
    restatesEligible &&
    !/\bnatural lubricant\b|\bcushion\b|\bfriction\b|\bcartilage\b|\blubricating substance\b/.test(lower)
  ) {
    return false;
  }
  return (
    /\bsynovial fluid is\b/.test(lower) ||
    /\blubricating substance found in joints\b/.test(lower) ||
    /\bsynovial fluid cushions\b/.test(lower) ||
    /\bcushions the joints\b/.test(lower) ||
    /\bnatural lubricant and cushion\b/.test(lower) ||
    /\bfriction between (?:the )?cartilage\b/.test(lower) ||
    /\breduces friction\b/.test(lower) ||
    /\bbody's natural lubricant\b/.test(lower) ||
    /\bthis mechanism improves mobility by\b/.test(lower) ||
    /\bimproves mobility by reducing joint friction\b/.test(lower)
  );
}

export function validateGenerationPlan(
  candidate: string,
  plan: GenerationPlan,
  productName?: string,
): { violations: GenerationPlanViolation[] } {
  const violations: GenerationPlanViolation[] = [];
  const push = (topic: GenerationTopic, text: string, reason: string, requiredField: string) => {
    if (violations.some((item) => item.topic === topic && item.text === text)) return;
    violations.push({ topic, text, reason, requiredField });
  };
  const closed = new Set(plan.closedTopics);

  if (closed.has("ingredients")) {
    for (const hit of namedIngredientMentions(candidate, { productName })) {
      push("ingredients", hit, "ingredients topic is CLOSED", "ingredientsOrComponents");
    }
    if (isIngredientsFieldAssertion(candidate) && namedIngredientMentions(candidate, { productName }).length === 0) {
      push("ingredients", candidate.trim(), "ingredients topic is CLOSED", "ingredientsOrComponents");
    }
  }

  if (closed.has("usage")) {
    for (const hit of usageInstructionSpans(candidate)) {
      push("usage", hit.text, "usage topic is CLOSED; feature phrases are not usage authority", "usageInformation");
    }
  }

  if (closed.has("manufacturer")) {
    for (const hit of collect(
      candidate,
      /\bmanufacturer(?:'s)?\s+(?:identity|transparency|information|is|does not)\b|\bmanufacturing (?:location|facility)\b|\b(?:c?gmp|fda[\s-]?inspected)\b|\bfacility\b|\bmanufacturer information is unavailable\b|\bthe manufacturer does not disclose\b/gi,
    )) {
      push("manufacturer", hit, "manufacturer topic is CLOSED", "manufacturer");
    }
  }

  if (closed.has("pricing")) {
    for (const hit of collect(
      candidate,
      /\b(?:price|pricing|cost|discount|on sale|deal)\b|\bcheck current price\b|\bpricing (?:is |was )?(?:unavailable|not provided|not detailed)\b|\bpricing transparency\b/gi,
    )) {
      push("pricing", hit, "pricing topic is CLOSED", "pricingInformation");
    }
  }

  if (closed.has("guarantee")) {
    for (const hit of collect(
      candidate,
      /\b(?:guarantee|refund|money[\s-]?back|risk[\s-]?free|return window|return policy|trial period)\b|\bguarantee details are unavailable\b/gi,
    )) {
      if (isDescriptionRestatement(hit, plan) && !/refund|guarantee|money[\s-]?back|risk[\s-]?free/i.test(hit)) {
        continue;
      }
      push("guarantee", hit, "guarantee topic is CLOSED; description mentions are not guarantee authority", "guaranteeInformation");
    }
  }

  if (closed.has("results_timeline")) {
    for (const hit of collect(
      candidate,
      /\bhow long does it take to notice results\b|\btime[- ]to[- ]effect\b|\bexpected results\b|\bbefore\/after\b|\bresults in \d+\s+(?:days?|weeks?|months?)\b/gi,
    )) {
      push("results_timeline", hit, "results timeline requires eligible factual support", "usageInformation");
    }
  }

  if (closed.has("category_classification")) {
    for (const hit of collect(
      candidate,
      /\bdietary supplement\b|\bdaily supplement\b|\bjoint supplement\b|\bmedical device\b|\b(?:this|the) (?:product )?is a (?:daily )?supplement\b/gi,
    )) {
      push("category_classification", hit, "product category requires eligible factual support", "description");
    }
  }

  if (closed.has("background_science")) {
    const support = `${plan.descriptionText}\n${plan.featurePhrases.join("\n")}`;
    for (const sentence of candidate.split(/(?<=[.!?])\s+/)) {
      if (!sentence.trim()) continue;
      if (isKnowledgeExpansion(sentence, support)) {
        push(
          "background_science",
          sentence.trim(),
          "background science / knowledge expansion is CLOSED",
          "description",
        );
      }
    }
  }

  if (closed.has("cautions")) {
    for (const hit of collect(
      candidate,
      /\bconsult(?:\s+with)?(?:\s+your)?\s+(?:doctor|physician|healthcare)\b|\ballergen information\b/gi,
    )) {
      push("cautions", hit, "cautions topic is CLOSED", "cautions");
    }
  }

  const absenceCue =
    /\b(?:not (?:disclosed|provided|available|listed|included|specified|confirmed)|unavailable|unknown|unclear|no information about|details are absent|is missing|are missing|are absent|not included in the available)\b/i;
  for (const sentence of candidate.split(/(?<=[.!?])\s+/)) {
    const text = sentence.trim();
    if (!text || !absenceCue.test(text)) continue;
    const topic = closedTopicForAbsenceSentence(text, closed);
    if (!topic) continue;
    push(topic, text, "MISSING_FACT_IS_OMISSION_NOT_CONTENT", requiredFieldForTopic(topic));
  }

  const unusedFeatureGate = candidate.match(/once[- ]each[- ]morning|once each morning/gi) || [];
  if (closed.has("usage")) {
    for (const hit of unusedFeatureGate) {
      const idx = candidate.toLowerCase().indexOf(hit.toLowerCase());
      const window = candidate.slice(Math.max(0, idx - 80), Math.min(candidate.length, idx + hit.length + 80));
      if (!isConservativeFeatureRestatement(window, plan)) {
        push("usage", window.trim(), "feature phrase promoted into usage authority", "usageInformation");
      }
    }
  }

  return { violations };
}

export function generationPlanBlocksReady(violations: GenerationPlanViolation[]): boolean {
  return violations.length > 0;
}
