/**
 * Host record domain: recommendation context.
 *
 * Interface only. One run is given a performance report, the campaign
 * metrics, and the prior metrics those indicators came from.
 */
import type { AdGroupMetrics, CampaignMetrics, RsaMetrics } from "../optimization-metrics/metrics-snapshot";
import type { HistoricalMetrics } from "../performance-analysis/performance-context";
import type { PerformanceReport } from "../performance-analysis/performance-snapshot";

export type OptimizationMetadata = Record<string, string | number | boolean | null>;

export const OPTIMIZATION_CONTEXT_MEMBERS = [
  "performanceReport",
  "historicalMetrics",
  "campaignMetrics",
  "adGroupMetrics",
  "rsaMetrics",
  "budgetAmountMicros",
  "executionMetadata",
  "runtimeMetadata",
] as const;

/**
 * Read-only bundle one recommendation run may be given.
 * Nothing here is written back.
 */
export interface OptimizationContext {
  performanceReport?: PerformanceReport;
  historicalMetrics?: HistoricalMetrics;
  campaignMetrics?: CampaignMetrics;
  adGroupMetrics?: AdGroupMetrics[];
  rsaMetrics?: RsaMetrics[];
  budgetAmountMicros?: number | null;
  executionMetadata?: OptimizationMetadata;
  runtimeMetadata?: OptimizationMetadata;
}
