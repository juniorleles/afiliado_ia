import type { MarketIntentKind, MarketIntentSignal, MarketResearchQuality, MarketResearchReport } from "@/lib/market-research/types";
import { uniqueIntentKinds } from "@/lib/market-research/signals";
import {
  STRATEGY_FAMILIES,
  type SelectStrategyInput,
  type StrategyAlternative,
  type StrategyConfidence,
  type StrategyEvidenceTraceItem,
  type StrategyFamily,
  type StrategyRecommendation,
} from "@/lib/strategy/types";

const CONVERSION_CLAIM = /best converting|highest converting|guaranteed (?:best|winner)|will convert/i;

const REVIEW_KINDS: MarketIntentKind[] = ["REVIEW_INTENT"];
const EDUCATIONAL_KINDS: MarketIntentKind[] = ["EDUCATIONAL_INTENT", "QUESTION_INTENT", "INGREDIENT_RESEARCH"];
const BUYER_KINDS: MarketIntentKind[] = [
  "BUYER_GUIDE_INTENT",
  "COMPARISON_INTENT",
  "PRICE_CONCERN",
  "SAFETY_CONCERN",
  "TRUST_CONCERN",
];

export function scoresFromResearch(research: MarketResearchReport): Record<StrategyFamily, number> {
  const intents = research.signals.observedIntents || [];
  return {
    REVIEW: intentScore(intents, REVIEW_KINDS),
    EDUCATIONAL: intentScore(intents, EDUCATIONAL_KINDS) + Math.min(2, research.signals.commonQuestions.length),
    BUYER_GUIDE: intentScore(intents, BUYER_KINDS) + Math.min(2, research.signals.purchaseConsiderations.length),
  };
}

function intentScore(
  intents: MarketResearchReport["signals"]["observedIntents"],
  kinds: MarketIntentKind[],
): number {
  let score = 0;
  const seen = new Set<string>();
  for (const item of intents) {
    if (!kinds.includes(item.kind)) continue;
    const key = `${item.kind}:${item.sourceUrl || item.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    score += item.strength === "MODERATE" ? 2 : 1;
  }
  return score;
}

export function selectStrategy(input: SelectStrategyInput): StrategyRecommendation {
  const evaluatedAt = (input.now || new Date()).toISOString();
  const quality: MarketResearchQuality = input.research.quality || "INSUFFICIENT";
  const scores = scoresFromResearch(input.research);
  const ranked = STRATEGY_FAMILIES.slice().sort(
    (a, b) => scores[b] - scores[a] || STRATEGY_FAMILIES.indexOf(a) - STRATEGY_FAMILIES.indexOf(b),
  );
  let recommended = ranked[0] || "REVIEW";
  if (input.research.status === "UNAVAILABLE" || input.research.sources.length === 0 || quality === "INSUFFICIENT") {
    recommended = "REVIEW";
  }
  const top = scores[recommended];
  const second = scores[ranked[1] || "EDUCATIONAL"];
  const diversity = input.research.diversity;
  const sourceCount = diversity?.USABLE_SOURCES ?? input.research.sources.length;
  const uniqueDomains = diversity?.UNIQUE_DOMAINS ?? new Set(input.research.sources.map((item) => item.domain).filter(Boolean)).size;
  const classDiversity = diversity?.SOURCE_CLASS_DIVERSITY ?? new Set(input.research.sources.map((item) => item.classification)).size;
  const promoDominated =
    Boolean(diversity?.PROMOTIONAL_PATTERN_DETECTED) && (diversity?.PROMOTIONAL_SOURCE_RATIO || 0) >= 0.5;

  let confidence: StrategyConfidence = "LOW";
  if (
    input.research.status !== "UNAVAILABLE" &&
    quality === "HIGH" &&
    uniqueDomains >= 5 &&
    classDiversity >= 3 &&
    top >= 4 &&
    top - second >= 2
  ) {
    confidence = "HIGH";
  } else if (
    input.research.status !== "UNAVAILABLE" &&
    (quality === "HIGH" || quality === "MEDIUM") &&
    sourceCount >= 3 &&
    classDiversity >= 2 &&
    top > second
  ) {
    confidence = "MEDIUM";
  }
  confidence = capConfidence(confidence, quality);
  if (promoDominated) confidence = "LOW";
  if (input.research.status === "STALE") confidence = "LOW";
  if (!input.factsSufficient) confidence = "LOW";

  const kinds = uniqueIntentKinds(input.research.signals.observedIntents || []);
  const classes = diversity?.SOURCE_CLASSES || [...new Set(input.research.sources.map((item) => item.classification))];
  const evidenceTrace = buildEvidenceTrace(input.research.signals.observedIntents || [], recommended);
  const marketSignals: string[] = [];
  if (kinds.length) {
    marketSignals.push(`Observed intent signals: ${kinds.join(", ")}.`);
  }
  if (input.research.signals.commonQuestions.length) {
    marketSignals.push("Question-family coverage was observed (titles remain Market Research observations, not product facts).");
  }
  if (input.research.signals.purchaseConsiderations.length) {
    marketSignals.push("Purchase-consideration coverage was observed (titles remain Market Research observations, not product facts).");
  }
  if (classes.length) {
    marketSignals.push(`Source mix: ${classes.join(", ")} across ${uniqueDomains} unique domain(s).`);
  }
  if (quality) {
    marketSignals.push(`Market research quality: ${quality} (separate from strategy confidence).`);
  }
  if (promoDominated) {
    marketSignals.push(
      "Promotional/affiliate pages dominate current results. Repeated Official-title patterns are not independent market signals.",
    );
  }
  if (!marketSignals.length) {
    marketSignals.push("Live market evidence was thin. This recommendation is not a conversion forecast.");
  }

  const risks: string[] = ["This recommendation is not a conversion forecast."];
  if (input.healthSensitive) {
    risks.push(
      "Health/supplement category: popular medical claims in search results are not permitted unless already grounded in ProductFacts.",
    );
  }
  if (recommended === "BUYER_GUIDE") {
    risks.push("Buyer-guide framing must not invent rankings, competitor specs, or unsourced comparisons.");
  }
  if (quality === "LOW" || quality === "INSUFFICIENT") {
    risks.push("Research quality is not high enough to treat this recommendation as strong market evidence.");
  }
  if (input.research.status === "STALE") {
    risks.push("Market research is stale. Refresh before treating this as current.");
  }
  if (input.research.status === "UNAVAILABLE") {
    risks.push("Web search was unavailable. Defaulted to editorial REVIEW.");
  }

  const policyNotes = [
    "ProductFacts remain the factual boundary.",
    "Policy Linter and grounding still gate publication.",
    "Market research must not overwrite or invent product facts.",
  ];
  if (input.healthSensitive) {
    policyNotes.push("Do not copy aggressive medical or unsupported claims from market pages.");
  }

  const alternatives: StrategyAlternative[] = STRATEGY_FAMILIES.filter((family) => family !== recommended).map(
    (strategy) => ({
      strategy,
      whyNotPrimary:
        scores[strategy] >= top
          ? "Similar observable intent; kept as a human-override / experiment option."
          : `Weaker ${label(strategy)} evidence from search intent, questions, and source mix — not merely title keywords.`,
    }),
  );

  const fallbackIfBlocked: StrategyFamily =
    recommended === "REVIEW" ? (ranked[1] === "REVIEW" ? "EDUCATIONAL" : ranked[1] || "EDUCATIONAL") : "REVIEW";

  const rationale = buildRationale({
    recommended,
    confidence,
    quality,
    sourceCount,
    uniqueDomains,
    classes,
    kinds,
    questionCoverage: input.research.signals.commonQuestions.length > 0,
    considerationCoverage: input.research.signals.purchaseConsiderations.length > 0,
    promoDominated,
    healthSensitive: input.healthSensitive,
    unavailable: input.research.status === "UNAVAILABLE",
  });

  return sanitizeRecommendation({
    recommendedStrategy: recommended,
    rationale,
    marketSignals,
    risks,
    confidence,
    alternatives,
    policyNotes,
    evaluatedAt,
    fallbackIfBlocked,
    conversionClaim: false,
    evidenceTrace,
    researchQuality: quality,
    researchStatus: input.research.status,
    researchedAt: input.research.researchedAt,
  });
}

function capConfidence(confidence: StrategyConfidence, quality: MarketResearchQuality): StrategyConfidence {
  if (quality === "HIGH") return confidence;
  if (quality === "MEDIUM") return confidence === "HIGH" ? "MEDIUM" : confidence;
  return "LOW";
}

function label(strategy: StrategyFamily): string {
  return strategy.toLowerCase().replace("_", "-");
}

function kindsForFamily(family: StrategyFamily): MarketIntentKind[] {
  if (family === "REVIEW") return REVIEW_KINDS;
  if (family === "EDUCATIONAL") return EDUCATIONAL_KINDS;
  return BUYER_KINDS;
}

function buildEvidenceTrace(
  intents: MarketIntentSignal[],
  recommended: StrategyFamily,
): StrategyEvidenceTraceItem[] {
  const allowed = new Set(kindsForFamily(recommended));
  const seen = new Set<string>();
  const trace: StrategyEvidenceTraceItem[] = [];
  for (const item of intents) {
    if (!allowed.has(item.kind)) continue;
    const key = `${item.kind}:${item.sourceUrl || item.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    trace.push({
      signal: item.kind,
      sourceType: "MARKET_OBSERVATION",
      sourceUrl: item.sourceUrl,
      queryFamily: item.fromQueryFamily,
      evidence: item.evidence,
      strength: item.strength,
    });
  }
  return trace;
}

function presentSignalPhrase(kinds: MarketIntentKind[]): string {
  const labels: string[] = [];
  if (kinds.includes("BUYER_GUIDE_INTENT")) labels.push("buyer-guide signals");
  if (kinds.includes("COMPARISON_INTENT")) labels.push("comparison signals");
  if (kinds.includes("PRICE_CONCERN")) labels.push("price-concern signals");
  if (kinds.includes("SAFETY_CONCERN")) labels.push("safety-concern signals");
  if (kinds.includes("TRUST_CONCERN")) labels.push("trust-concern signals");
  if (kinds.includes("QUESTION_INTENT")) labels.push("question signals");
  if (kinds.includes("EDUCATIONAL_INTENT")) labels.push("educational signals");
  if (kinds.includes("INGREDIENT_RESEARCH")) labels.push("ingredient-research signals");
  if (kinds.includes("REVIEW_INTENT")) labels.push("review signals");
  return labels.join(", ");
}

function buildRationale(input: {
  recommended: StrategyFamily;
  confidence: StrategyConfidence;
  quality: MarketResearchQuality;
  sourceCount: number;
  uniqueDomains: number;
  classes: string[];
  kinds: MarketIntentKind[];
  questionCoverage: boolean;
  considerationCoverage: boolean;
  promoDominated: boolean;
  healthSensitive: boolean;
  unavailable: boolean;
}): string {
  if (input.unavailable) {
    return "Current web search evidence was unavailable. REVIEW is the conservative first test because it stays closest to documented product facts. This recommendation is not a conversion forecast.";
  }
  const mix = input.classes.length ? ` across ${input.classes.join(", ")} sources` : "";
  const coverageBits: string[] = [];
  if (input.questionCoverage) coverageBits.push("question-family coverage");
  if (input.considerationCoverage) coverageBits.push("purchase-consideration coverage");
  const coverageBit = coverageBits.length ? ` Observed ${coverageBits.join(" and ")}.` : "";
  const qualityBit = ` Research quality is ${input.quality}; strategy confidence is ${input.confidence}. This recommendation is not a conversion forecast.`;
  const promoBit = input.promoDominated
    ? " Repeated promotional Official-title pages were not treated as independent brand or review evidence."
    : "";
  const present = presentSignalPhrase(input.kinds);

  if (input.recommended === "BUYER_GUIDE") {
    const drivers = presentSignalPhrase(input.kinds.filter((kind) => BUYER_KINDS.includes(kind)));
    const why = drivers || "purchase-consideration signals were observed";
    return `Buyer-guide intent is prominent because ${why}${mix}.${coverageBit}${promoBit}${qualityBit}`;
  }
  if (input.recommended === "EDUCATIONAL") {
    const drivers = presentSignalPhrase(
      input.kinds.filter((kind) => EDUCATIONAL_KINDS.includes(kind)),
    );
    const why = drivers || "explanatory signals were observed";
    return `Educational intent is prominent because ${why}${mix}.${coverageBit}${promoBit}${qualityBit}`;
  }
  if (input.kinds.includes("REVIEW_INTENT") && input.classes.length >= 2) {
    return `Review intent is prominent because independent sources discuss evaluations, complaints, or buyer experience${mix}.${coverageBit}${promoBit}${qualityBit}`;
  }
  return `Observable market evidence is limited or mixed${mix || ""}${present ? ` (${present})` : ""}. REVIEW is the conservative first test grounded only in ProductFacts.${coverageBit}${promoBit}${qualityBit}`;
}

function sanitizeText(text: string): string {
  if (/not a conversion forecast/i.test(text)) return text;
  if (/\bnot a guaranteed\b/i.test(text)) return text;
  return text.replace(CONVERSION_CLAIM, "most appropriate based on current market evidence");
}

export function sanitizeRecommendation(rec: StrategyRecommendation): StrategyRecommendation {
  return {
    ...rec,
    conversionClaim: false,
    rationale: sanitizeText(rec.rationale),
    marketSignals: rec.marketSignals.map(sanitizeText),
    risks: rec.risks.map(sanitizeText),
  };
}

export function nextStrategyIfBlocked(
  current: StrategyFamily,
  recommendation: StrategyRecommendation,
): StrategyFamily | null {
  if (recommendation.fallbackIfBlocked && recommendation.fallbackIfBlocked !== current) {
    return recommendation.fallbackIfBlocked;
  }
  return STRATEGY_FAMILIES.find((family) => family !== current) || null;
}
