import { sanitizeEvidenceList } from "@/lib/market-research/forbidden";
import type {
  MarketEvidence,
  MarketIntentKind,
  MarketIntentSignal,
  MarketSignalBundle,
} from "@/lib/market-research/types";

const TITLE_REVIEW = /\breview|\bhonest|\btestimonial/i;
const TITLE_COMPARE = /\bvs\.?\b|\bcompar(?:e|ison)|\balternative|\bbest\b|\bwhich\b/i;
const TITLE_EDU = /\bwhat is\b|\bhow (?:does|do|to)\b|\bexplained\b/i;
const TITLE_INGREDIENT = /\bingredients?\b|\bformula\b|\bwhat's inside\b/i;
const TITLE_SAFETY = /\bside effects?\b|\bsafe(?:ty)?\b|\bwarning/i;
const TITLE_PRICE = /\bworth it\b|\bprice\b|\bexpensive\b|\bcost\b/i;
const TITLE_TRUST = /\bcomplaint|\bscam\b|\bfake\b|\btrust/i;
const TITLE_QUESTION = /\?/;

export function emptyMarketSignals(): MarketSignalBundle {
  return {
    currentPositioning: [],
    categoryPositioning: [],
    commonQuestions: [],
    purchaseConsiderations: [],
    commonObjections: [],
    recurringTerminology: [],
    competitorMessaging: [],
    reviewOrientedResults: 0,
    educationalResults: 0,
    buyerGuideResults: 0,
    observedIntents: [],
  };
}

export function extractMarketSignals(sources: MarketEvidence[]): MarketSignalBundle {
  const usable = sources.filter((source) => source.usable);
  const questions: string[] = [];
  const objections: string[] = [];
  const terminology = new Map<string, number>();
  const positioning: string[] = [];
  const category: string[] = [];
  const competitor: string[] = [];
  const considerations: string[] = [];
  const observedIntents: MarketIntentSignal[] = [];

  for (const source of usable) {
    if (source.promotional) continue;
    const snippet = source.relevantEvidence;
    const title = source.title;
    const blob = `${title} ${snippet}`;
    pushFamilyIntents(observedIntents, source);
    pushTitleIntents(observedIntents, source, title, snippet);
    if (TITLE_SAFETY.test(blob) || TITLE_TRUST.test(blob) || TITLE_PRICE.test(blob)) {
      objections.push(snippet || title);
    }
    if (TITLE_QUESTION.test(blob) || source.queryFamily === "QUESTIONS_OBJECTIONS") {
      questions.push(title.includes("?") ? title : source.query);
    }
    if (source.classification === "EDITORIAL") {
      positioning.push(snippet || title);
      category.push(snippet || title);
    }
    if (TITLE_COMPARE.test(blob) || source.queryFamily === "PURCHASE_INTENT" || source.queryFamily === "CATEGORY_INTENT") {
      considerations.push(title);
    }
    if (TITLE_COMPARE.test(blob)) competitor.push(title);
    for (const token of blob.match(/\b[A-Z][A-Za-z0-9][A-Za-z0-9+ -]{2,30}\b/g) || []) {
      const key = token.trim();
      if (key.length < 4 || /official/i.test(key)) continue;
      terminology.set(key, (terminology.get(key) || 0) + 1);
    }
  }

  const reviewOrientedResults = countIntent(observedIntents, "REVIEW_INTENT");
  const educationalResults =
    countIntent(observedIntents, "EDUCATIONAL_INTENT") +
    countIntent(observedIntents, "QUESTION_INTENT") +
    countIntent(observedIntents, "INGREDIENT_RESEARCH");
  const buyerGuideResults =
    countIntent(observedIntents, "BUYER_GUIDE_INTENT") +
    countIntent(observedIntents, "COMPARISON_INTENT") +
    countIntent(observedIntents, "PRICE_CONCERN") +
    countIntent(observedIntents, "SAFETY_CONCERN");

  const recurringTerminology = [...terminology.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term]) => term);

  return {
    currentPositioning: sanitizeEvidenceList(positioning).kept.slice(0, 6),
    categoryPositioning: sanitizeEvidenceList(category).kept.slice(0, 6),
    commonQuestions: sanitizeEvidenceList(questions).kept.slice(0, 8),
    purchaseConsiderations: sanitizeEvidenceList(considerations).kept.slice(0, 6),
    commonObjections: sanitizeEvidenceList(objections).kept.slice(0, 6),
    recurringTerminology,
    competitorMessaging: sanitizeEvidenceList(competitor).kept.slice(0, 6),
    reviewOrientedResults,
    educationalResults,
    buyerGuideResults,
    observedIntents,
  };
}

function countIntent(intents: MarketIntentSignal[], kind: MarketIntentKind): number {
  return intents.filter((item) => item.kind === kind).length;
}

function pushFamilyIntents(out: MarketIntentSignal[], source: MarketEvidence): void {
  const family = source.queryFamily;
  const add = (kind: MarketIntentKind, evidence: string) => {
    out.push({
      kind,
      strength: "WEAK",
      evidence,
      sourceUrl: source.url,
      fromQueryFamily: family,
    });
  };
  if (family === "PRODUCT" && /\breview/i.test(source.query)) add("REVIEW_INTENT", `query: ${source.query}`);
  if (family === "PRODUCT" && /\bingredient/i.test(source.query)) add("INGREDIENT_RESEARCH", `query: ${source.query}`);
  if (family === "PURCHASE_INTENT") {
    add("BUYER_GUIDE_INTENT", `query: ${source.query}`);
    if (/worth it|price/i.test(source.query)) add("PRICE_CONCERN", `query: ${source.query}`);
    if (/complaint/i.test(source.query)) add("TRUST_CONCERN", `query: ${source.query}`);
    if (/alternative/i.test(source.query)) add("COMPARISON_INTENT", `query: ${source.query}`);
    if (/reviews?/i.test(source.query)) add("REVIEW_INTENT", `query: ${source.query}`);
  }
  if (family === "CATEGORY_INTENT") {
    add("BUYER_GUIDE_INTENT", `query: ${source.query}`);
    if (/ingredient/i.test(source.query)) add("INGREDIENT_RESEARCH", `query: ${source.query}`);
    if (/buying guide/i.test(source.query)) add("BUYER_GUIDE_INTENT", `query: ${source.query}`);
  }
  if (family === "QUESTIONS_OBJECTIONS") {
    add("QUESTION_INTENT", `query: ${source.query}`);
    if (/side effect/i.test(source.query)) add("SAFETY_CONCERN", `query: ${source.query}`);
    if (/effectiveness|what to look for/i.test(source.query)) add("BUYER_GUIDE_INTENT", `query: ${source.query}`);
    if (/what is|how /i.test(source.query)) add("EDUCATIONAL_INTENT", `query: ${source.query}`);
  }
}

function pushTitleIntents(
  out: MarketIntentSignal[],
  source: MarketEvidence,
  title: string,
  snippet: string,
): void {
  const blob = `${title} ${snippet}`;
  const add = (kind: MarketIntentKind, evidence: string, strength: "WEAK" | "MODERATE") => {
    out.push({ kind, strength, evidence, sourceUrl: source.url, fromQueryFamily: source.queryFamily });
  };
  const snippetHit = (re: RegExp) => re.test(snippet);
  if (TITLE_REVIEW.test(blob)) add("REVIEW_INTENT", title, snippetHit(TITLE_REVIEW) ? "MODERATE" : "WEAK");
  if (TITLE_COMPARE.test(blob)) {
    add("COMPARISON_INTENT", title, snippetHit(TITLE_COMPARE) ? "MODERATE" : "WEAK");
    add("BUYER_GUIDE_INTENT", title, "WEAK");
  }
  if (TITLE_EDU.test(blob)) add("EDUCATIONAL_INTENT", title, snippetHit(TITLE_EDU) ? "MODERATE" : "WEAK");
  if (TITLE_INGREDIENT.test(blob)) add("INGREDIENT_RESEARCH", title, snippetHit(TITLE_INGREDIENT) ? "MODERATE" : "WEAK");
  if (TITLE_SAFETY.test(blob)) add("SAFETY_CONCERN", title, snippetHit(TITLE_SAFETY) ? "MODERATE" : "WEAK");
  if (TITLE_PRICE.test(blob)) add("PRICE_CONCERN", title, snippetHit(TITLE_PRICE) ? "MODERATE" : "WEAK");
  if (TITLE_TRUST.test(blob)) add("TRUST_CONCERN", title, snippetHit(TITLE_TRUST) ? "MODERATE" : "WEAK");
  if (TITLE_QUESTION.test(blob)) add("QUESTION_INTENT", title, "WEAK");
}

export function uniqueIntentKinds(intents: MarketIntentSignal[]): MarketIntentKind[] {
  return [...new Set(intents.map((item) => item.kind))];
}

export function formatSafeMarketContext(signals: MarketSignalBundle): string {
  const kinds = uniqueIntentKinds(signals.observedIntents);
  return [
    "MARKET CONTEXT (observable discussion only — NOT product facts):",
    "Do not copy claims from this block into the page unless they already exist in SOURCE FACTS.",
    "A popular claim is not a permitted or grounded claim.",
    `Observed intent signals: ${kinds.join(", ") || "none"}.`,
    "Use these intent labels only to choose emphasis. They are not product facts.",
    "Do not import manufacturer, pricing, guarantee, ingredient, or medical claims from market observations.",
    "Never invent search volume, conversion rate, ad spend, sales, CPA, or ROAS.",
    "Do not treat 'Official' titles as brand or product-fact evidence.",
  ].join("\n");
}
