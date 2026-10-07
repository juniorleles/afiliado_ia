/**
 * Host record domain: recommendation vocabulary.
 *
 * Kinds, rule ids, and the read-only view a rule may see. Nothing here is
 * written back to a campaign.
 */
import type { AdGroupMetrics, CampaignMetrics, RsaMetrics } from "../optimization-metrics/metrics-snapshot";
import type { HistoricalMetrics } from "../performance-analysis/performance-context";
import type { PerformanceIndicator, PerformanceReport } from "../performance-analysis/performance-snapshot";

export const RECOMMENDATION_KINDS = [
  "Increase Budget",
  "Reduce Budget",
  "Review RSA Headlines",
  "Review RSA Descriptions",
  "Review Landing Page",
  "Review Keywords",
  "Review Search Terms",
  "Review Audience",
  "Review Device Targeting",
  "Monitor Performance",
  "No Action",
] as const;

export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export const CONFIDENCE_LEVELS = ["FULL", "PARTIAL"] as const;
export type RecommendationConfidence = (typeof CONFIDENCE_LEVELS)[number];

export const RULE_IDS = [
  "INCREASE_BUDGET",
  "REDUCE_BUDGET",
  "REVIEW_RSA_HEADLINES",
  "REVIEW_RSA_DESCRIPTIONS",
  "REVIEW_LANDING_PAGE",
  "REVIEW_KEYWORDS",
  "REVIEW_SEARCH_TERMS",
  "REVIEW_AUDIENCE",
  "REVIEW_DEVICE_TARGETING",
  "MONITOR_PERFORMANCE",
  "NO_ACTION",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface RecommendationIssue {
  field: string;
  message: string;
}

export interface RecommendationView {
  report: PerformanceReport;
  campaign: CampaignMetrics;
  historicalCampaign: CampaignMetrics;
  adGroups: AdGroupMetrics[];
  ads: RsaMetrics[];
  historicalAdGroups: AdGroupMetrics[];
  historicalAds: RsaMetrics[];
  budgetAmountMicros: number | null;
  historicalBudgetAmountMicros: number | null;
  historicalMetrics: HistoricalMetrics;
}

export interface OptimizationRule {
  id: RuleId;
  kind: RecommendationKind;
  independent: boolean;
  boundNote: string;
  applies(view: RecommendationView): boolean;
  select(view: RecommendationView): PerformanceIndicator[];
}
