import type { IntelligenceReportView } from "@/lib/intelligence-report";
import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";
import type { StrategyRecommendation } from "@/lib/strategy/types";
import { confidenceLabel, strategyLabel } from "@/lib/campaign-market";

export type CampaignStrategyView = {
  recommendedStrategy: string;
  confidence: string;
  reasons: string[];
  buyerIntent: string;
  competitionLevel: string;
  policyRisk: string;
  recommendedStructure: string;
  recommendedCta: string;
};

const UNAVAILABLE = "Não disponível";

function cardValue(report: IntelligenceReportView, id: string): string {
  return report.cards.find((card) => card.id === id)?.value ?? UNAVAILABLE;
}

function stated(value: string): boolean {
  return value !== UNAVAILABLE && value !== "Não encontrado" && value !== "Não avaliado";
}

function competitionLevel(competitors: string): string {
  if (!stated(competitors)) return competitors;
  const count = Number(competitors);
  if (!Number.isInteger(count) || count < 0) return UNAVAILABLE;
  return count === 1 ? "1 concorrente encontrado" : `${count} concorrentes encontrados`;
}

export function buildCampaignStrategy(report: IntelligenceReportView, recommendation?: StrategyRecommendation | null): CampaignStrategyView {
  const benefits = cardValue(report, "benefits");
  const ingredients = cardValue(report, "ingredients");
  const claims = cardValue(report, "claims");
  const guarantee = cardValue(report, "guarantee");
  const intent = cardValue(report, "intent");
  const reasons: string[] = [];

  if (recommendation) {
    reasons.push(`A pesquisa de mercado recomenda ${strategyLabel(recommendation.recommendedStrategy)}.`);
    reasons.push(`Qualidade da pesquisa: ${recommendation.researchQuality}. Confiança: ${confidenceLabel(recommendation.confidence)}.`);
  }
  if (stated(benefits)) reasons.push(`A inteligência registrou ${benefits} benefícios nos fatos do produto.`);
  if (stated(ingredients)) reasons.push(`A inteligência registrou ${ingredients} ingredientes nos fatos do produto.`);
  if (stated(claims)) reasons.push(`${claims} afirmações já estavam informadas pela fonte.`);
  if (stated(guarantee)) reasons.push("A garantia informada nos fatos do produto foi considerada.");
  if (stated(intent)) reasons.push(`Intenção de compra observada: ${intent}.`);
  if (!recommendation && !stated(cardValue(report, "quality"))) {
    reasons.push("Não há um relatório de pesquisa de mercado salvo, então nenhuma estratégia foi escolhida.");
  }
  if (reasons.length === 0) reasons.push("A inteligência ainda não tem dados suficientes para uma estratégia.");

  return {
    recommendedStrategy: recommendation ? strategyLabel(recommendation.recommendedStrategy) : UNAVAILABLE,
    confidence: recommendation ? confidenceLabel(recommendation.confidence) : cardValue(report, "confidence"),
    reasons,
    buyerIntent: intent,
    competitionLevel: competitionLevel(cardValue(report, "competitors")),
    policyRisk: cardValue(report, "policy"),
    recommendedStructure: recommendation ? strategyLabel(recommendation.recommendedStrategy) : UNAVAILABLE,
    recommendedCta: UNAVAILABLE,
  };
}

export function strategyFromAnalysis(analysis: MarketIntelligenceAnalysis | null): CampaignStrategyView {
  if (!analysis) {
    return {
      recommendedStrategy: UNAVAILABLE,
      confidence: UNAVAILABLE,
      reasons: ["Não há uma análise de padrões de mercado salva, então nenhuma estratégia foi escolhida."],
      buyerIntent: UNAVAILABLE,
      competitionLevel: UNAVAILABLE,
      policyRisk: UNAVAILABLE,
      recommendedStructure: UNAVAILABLE,
      recommendedCta: UNAVAILABLE,
    };
  }
  const competitors = analysis.competitorsRank.length;
  const highest = analysis.dominantPolicyRisks.find((item) => item.level === "Alto")
    ?? analysis.dominantPolicyRisks.find((item) => item.level === "Médio")
    ?? analysis.dominantPolicyRisks[0];
  return {
    recommendedStrategy: analysis.marketSummary.strategyLabel,
    confidence: analysis.marketSummary.strategyConfidence,
    reasons: analysis.marketSummary.reasons,
    buyerIntent: analysis.marketSummary.buyerIntent,
    competitionLevel: competitors === 1 ? "1 concorrente encontrado" : competitors > 0 ? `${competitors} concorrentes encontrados` : UNAVAILABLE,
    policyRisk: highest?.level ?? "Não encontrado durante a pesquisa.",
    recommendedStructure: analysis.dominantStructure.summary,
    recommendedCta: analysis.dominantCTA.text ?? "Não encontrado durante a pesquisa.",
  };
}

export function strategyFromDecision(decision: StrategyDecision | null): CampaignStrategyView {
  if (!decision) {
    return {
      recommendedStrategy: UNAVAILABLE,
      confidence: UNAVAILABLE,
      reasons: ["Não há uma decisão de estratégia salva."],
      buyerIntent: UNAVAILABLE,
      competitionLevel: UNAVAILABLE,
      policyRisk: UNAVAILABLE,
      recommendedStructure: UNAVAILABLE,
      recommendedCta: UNAVAILABLE,
    };
  }
  return {
    recommendedStrategy: decision.recommendedApproach,
    confidence: `${Math.round(decision.confidence * 100)}%`,
    reasons: decision.reasoning,
    buyerIntent: decision.awarenessStage,
    competitionLevel: decision.marketSophistication,
    policyRisk: decision.claimsToAvoid.length > 0 ? decision.claimsToAvoid.join(", ") : "Nenhum claim proibido medido.",
    recommendedStructure: decision.landingStructure,
    recommendedCta: decision.copyAngle,
  };
}
