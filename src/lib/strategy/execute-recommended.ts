import { generateVariants, lintVariant, type LintedVariant } from "@/lib/ai/generate-variants";
import type { ProductFacts } from "@/lib/product-facts";
import { runMarketResearch } from "@/lib/market-research/research";
import { withFreshness } from "@/lib/market-research/freshness";
import type { MarketResearchReport } from "@/lib/market-research/types";
import { nextStrategyIfBlocked, selectStrategy } from "@/lib/strategy/select";
import { recommendedLpPreviewPath, recommendedLpPreviewUrl } from "@/lib/strategy/preview";
import type { StrategyFamily, StrategyRecommendation } from "@/lib/strategy/types";
import { slugify } from "@/lib/slug";
import { composeCandidateFromVariant } from "@/lib/validation/pipeline";
import { createValidationRun, insertValidationCandidate, updateValidationRun } from "@/lib/validation/store";
import type { ValidationCandidate } from "@/lib/validation/types";

export function factsAreHealthSensitive(facts: ProductFacts): boolean {
  if (facts.ingredientsOrComponents.length > 0) return true;
  return /\b(supplement|probiotic|vitamin|immune|joint|weight|diet|collagen|cbd|health|capsule|tablet|gummies)\b/i.test(
    `${facts.description || ""} ${facts.features.join(" ")} ${facts.cautions.join(" ")}`,
  );
}

export async function researchAndRecommend(
  facts: ProductFacts,
  searchWeb?: (query: string) => Promise<Array<{ url: string; title: string; snippet: string }>>,
): Promise<{ research: MarketResearchReport; recommendation: StrategyRecommendation }> {
  const research = withFreshness(await runMarketResearch({ facts, searchWeb }));
  const recommendation = selectStrategy({
    factsName: facts.productName,
    healthSensitive: factsAreHealthSensitive(facts),
    factsSufficient: facts.importQuality !== "INSUFFICIENT",
    research,
  });
  return { research, recommendation };
}

export type RecommendedLpResult = {
  candidate: ValidationCandidate;
  variant: LintedVariant;
  previewUrl: string;
  previewPath: string;
  usedFallback: boolean;
  blocked: boolean;
  research: MarketResearchReport;
  recommendation: StrategyRecommendation;
};

export async function generateRecommendedLp(input: {
  facts: ProductFacts;
  affiliateUrl: string;
  research: MarketResearchReport;
  recommendation: StrategyRecommendation;
  overrideStrategy?: StrategyFamily;
}): Promise<RecommendedLpResult> {
  const strategy = input.overrideStrategy || input.recommendation.recommendedStrategy;
  const first = await generateAndLint(input.facts, input.affiliateUrl, strategy, input.research);
  let used = strategy;
  let variant = first;
  let usedFallback = false;
  if (first.finalGate === "BLOCKED") {
    const fallback = nextStrategyIfBlocked(strategy, input.recommendation);
    if (fallback) {
      const second = await generateAndLint(input.facts, input.affiliateUrl, fallback, input.research);
      used = fallback;
      variant = second;
      usedFallback = true;
    }
  }

  const run = createValidationRun(`content-engine:${input.facts.productName}`);
  const productKey = `engine_${slugify(input.facts.productName) || "product"}`;
  updateValidationRun(run.id, {
    products: [
      {
        key: productKey,
        name: input.facts.productName,
        sourceUrl: input.facts.sourceUrl,
        origin: input.facts.origin === "IMPORTED" ? "IMPORT" : "EXISTING_DRAFT",
        affiliateUrlStored: false,
        MARKET_RESEARCH_STATUS: input.research.status,
        MARKET_RESEARCH_QUALITY: input.research.quality,
        MARKET_RESEARCH_DATE: input.research.researchedAt,
        MARKET_SOURCES: input.research.sources.length,
        RECOMMENDED_STRATEGY: input.recommendation.recommendedStrategy,
        STRATEGY_CONFIDENCE: input.recommendation.confidence,
        STRATEGY_RATIONALE: input.recommendation.rationale,
        ALTERNATIVES: input.recommendation.alternatives.map((item) => item.strategy),
      },
    ],
    marketResearch: input.research,
    strategy: input.recommendation,
  });
  const candidate = insertValidationCandidate(
    composeCandidateFromVariant({
      runId: run.id,
      productKey,
      facts: input.facts,
      approach: used,
      headline: variant.headline,
      body: variant.body,
      ctaLabel: variant.ctaLabel,
      strategyMeta: {
        recommended: used === input.recommendation.recommendedStrategy,
        confidence: input.recommendation.confidence,
        rationale: input.recommendation.rationale,
        fallbackUsed: usedFallback,
        researchedAt: input.research.researchedAt,
      },
    }),
  );
  const previewPath = recommendedLpPreviewPath(input.facts.productName, candidate.id);
  const previewUrl = recommendedLpPreviewUrl(input.facts.productName, candidate.id);
  return {
    candidate,
    variant,
    previewUrl,
    previewPath,
    usedFallback,
    blocked: variant.finalGate === "BLOCKED",
    research: input.research,
    recommendation: input.recommendation,
  };
}

async function generateAndLint(
  facts: ProductFacts,
  affiliateUrl: string,
  approach: StrategyFamily,
  research: MarketResearchReport,
): Promise<LintedVariant> {
  const variants = await generateVariants({
    productName: facts.productName,
    sourceUrl: facts.sourceUrl,
    facts,
    targetApproach: approach,
    marketResearch: research,
    recommendedStrategy: approach,
  });
  const variant = variants[0];
  if (!variant) throw new Error("No variant returned.");
  return lintVariant(variant, facts.productName, affiliateUrl, facts);
}
