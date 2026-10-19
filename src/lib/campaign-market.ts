import type { CampaignBrief } from "@/lib/campaign-brief";
import type { Campaign } from "@/lib/campaigns";
import { factsAreHealthSensitive } from "@/lib/strategy/execute-recommended";
import { buildExecutiveReport, type ExecutiveReport } from "@/lib/market-research/executive-report";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import type { ProductFacts } from "@/lib/product-facts";
import { readStoredMarketResearch } from "@/lib/market-research/store";
import type { MarketResearchReport } from "@/lib/market-research/types";
import { selectStrategy } from "@/lib/strategy/select";
import type { StrategyConfidence, StrategyFamily, StrategyRecommendation } from "@/lib/strategy/types";
import type { IntelligenceResearchSlice } from "@/lib/intelligence-report";

const STRATEGY_LABEL: Record<StrategyFamily, string> = {
  REVIEW: "Revisão",
  EDUCATIONAL: "Educativo",
  BUYER_GUIDE: "Guia de compra",
};

const CONFIDENCE_LABEL: Record<StrategyConfidence, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

export type MarketResearchScreen = ExecutiveReport;

function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "Não informado";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  const digits = seconds < 10 ? 1 : 0;
  return `${seconds.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`;
}

export function factsForMarketResearch(campaign: Campaign, brief: CampaignBrief | null): ProductFacts {
  const facts = resolveProductFacts(
    parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl),
    listManualOverrides(campaign.id),
  );
  const copy: ProductFacts = {
    ...facts,
    features: [...facts.features],
    ingredientsOrComponents: [...facts.ingredientsOrComponents],
    usageInformation: [...facts.usageInformation],
    cautions: [...facts.cautions],
    importWarnings: [...facts.importWarnings],
  };
  if (!copy.productName.trim()) copy.productName = brief?.productName?.trim() || campaign.name;
  if (!copy.manufacturer?.trim() && brief?.brand?.trim()) copy.manufacturer = brief.brand.trim();
  const category = brief?.category?.trim() || "";
  const blob = [copy.productName, copy.description || "", copy.features.join(" "), copy.ingredientsOrComponents.join(" ")]
    .join(" ")
    .toLowerCase();
  if (category && !blob.includes(category.toLowerCase())) {
    copy.description = [copy.description?.trim(), category].filter(Boolean).join("\n");
  }
  return copy;
}

export function recommendFromResearch(facts: ProductFacts, report: MarketResearchReport): StrategyRecommendation {
  return selectStrategy({
    factsName: facts.productName,
    healthSensitive: factsAreHealthSensitive(facts),
    factsSufficient: facts.importQuality !== "INSUFFICIENT",
    research: report,
  });
}

export function readCampaignRecommendation(campaign: Campaign, brief: CampaignBrief | null): StrategyRecommendation | null {
  const stored = readStoredMarketResearch(campaign.id);
  if (!stored) return null;
  return recommendFromResearch(factsForMarketResearch(campaign, brief), stored.report);
}

export function researchSlice(facts: ProductFacts, report: MarketResearchReport, recommendation: StrategyRecommendation): IntelligenceResearchSlice {
  const competitors = new Set(
    report.sources
      .filter((source) => source.usable && source.classification !== "BRAND" && source.classification !== "UNKNOWN")
      .map((source) => source.domain),
  ).size;
  const families = new Set(report.sources.filter((source) => source.usable).map((source) => source.queryFamily));
  return {
    quality: report.quality,
    confidence: recommendation.confidence,
    competitors,
    reviews: report.signals.reviewOrientedResults,
    objections: report.signals.commonObjections.length,
    buyerIntent: report.signals.buyerGuideResults > 0 ? "MODERATE" : report.signals.purchaseConsiderations.length > 0 ? "WEAK" : null,
    seoOpportunities: families.size,
    policyRisk: factsAreHealthSensitive(facts) ? "Revisão necessária" : null,
  };
}

export function presentMarketResearch(
  campaign: Campaign,
  brief: CampaignBrief | null,
  report: MarketResearchReport,
  durationMs: number | null,
): MarketResearchScreen {
  const recommendation = recommendFromResearch(factsForMarketResearch(campaign, brief), report);
  const elapsed = durationMs ?? report.queryOutcomes.reduce((sum, item) => sum + item.durationMs, 0);
  const validity = report.status === "FRESH" ? "Válida" : report.status === "STALE" ? "Vencida" : "Sem fontes utilizáveis";
  return buildExecutiveReport(report, {
    confidence: CONFIDENCE_LABEL[recommendation.confidence],
    duration: durationLabel(elapsed),
    validity,
  });
}

export function strategyLabel(family: StrategyFamily): string {
  return STRATEGY_LABEL[family];
}

export function confidenceLabel(confidence: StrategyConfidence): string {
  return CONFIDENCE_LABEL[confidence];
}
