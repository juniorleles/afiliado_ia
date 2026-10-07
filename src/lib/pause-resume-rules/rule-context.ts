/**
 * Host record domain: pause and resume rule context.
 *
 * Interface only. One run is given a recommendation set, a performance
 * report, campaign metrics, and the caller's operational rules.
 */
import type { CampaignMetrics } from "../optimization-metrics/metrics-snapshot";
import type { OptimizationRecommendationSet } from "../optimization-recommendation/optimization-snapshot";
import type { PerformanceReport } from "../performance-analysis/performance-snapshot";
import type { OperationalRules } from "./rule-types";

export type RuleMetadata = Record<string, string | number | boolean | null>;

export const RULE_CONTEXT_MEMBERS = [
  "recommendationSet",
  "performanceReport",
  "campaignMetrics",
  "operationalRules",
  "executionMetadata",
  "runtimeMetadata",
] as const;

/**
 * Read-only bundle one evaluation may be given.
 * Nothing here is written back.
 */
export interface RuleContext {
  recommendationSet?: OptimizationRecommendationSet;
  performanceReport?: PerformanceReport;
  campaignMetrics?: CampaignMetrics;
  operationalRules?: OperationalRules;
  executionMetadata?: RuleMetadata;
  runtimeMetadata?: RuleMetadata;
}
