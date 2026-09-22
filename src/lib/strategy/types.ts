import type { VariantApproach } from "@/lib/ai/generate-variants";
import type {
  MarketIntentKind,
  MarketResearchQuality,
  MarketResearchReport,
  MarketResearchStatus,
  QueryFamilyId,
} from "@/lib/market-research/types";

export const STRATEGY_FAMILIES = ["REVIEW", "EDUCATIONAL", "BUYER_GUIDE"] as const;
export type StrategyFamily = (typeof STRATEGY_FAMILIES)[number];

export const STRATEGY_CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type StrategyConfidence = (typeof STRATEGY_CONFIDENCE_LEVELS)[number];

export type StrategyEvidenceSourceType = "MARKET_OBSERVATION";

export type StrategyEvidenceTraceItem = {
  signal: MarketIntentKind;
  sourceType: StrategyEvidenceSourceType;
  sourceUrl?: string;
  queryFamily?: QueryFamilyId;
  evidence: string;
  strength?: "WEAK" | "MODERATE";
};

export type StrategyAlternative = {
  strategy: StrategyFamily;
  whyNotPrimary: string;
};

export type StrategyRecommendation = {
  recommendedStrategy: StrategyFamily;
  rationale: string;
  marketSignals: string[];
  risks: string[];
  confidence: StrategyConfidence;
  alternatives: StrategyAlternative[];
  policyNotes: string[];
  evaluatedAt: string;
  fallbackIfBlocked: StrategyFamily;
  conversionClaim: false;
  evidenceTrace: StrategyEvidenceTraceItem[];
  researchQuality: MarketResearchQuality;
  researchStatus: MarketResearchStatus;
  researchedAt: string;
};

export type SelectStrategyInput = {
  factsName: string;
  healthSensitive: boolean;
  factsSufficient: boolean;
  research: MarketResearchReport;
  now?: Date;
};

export function isStrategyFamily(value: string): value is StrategyFamily {
  return (STRATEGY_FAMILIES as readonly string[]).includes(value);
}

export function asVariantApproach(strategy: StrategyFamily): VariantApproach {
  return strategy;
}
