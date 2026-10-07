/**
 * Host record domain: performance analysis context.
 *
 * Interface only. One run is given collected metric records and a prior
 * window of the same records. Nothing here is written back.
 */
import type { AdGroupMetrics, CampaignMetrics, RsaMetrics } from "../optimization-metrics/metrics-snapshot";

export type PerformanceMetadata = Record<string, string | number | boolean | null>;

export const PERFORMANCE_CONTEXT_MEMBERS = [
  "campaignMetrics",
  "adGroupMetrics",
  "rsaMetrics",
  "historicalMetrics",
  "budgetAmountMicros",
  "timeWindow",
  "executionMetadata",
  "runtimeMetadata",
] as const;

export interface HistoricalMetrics {
  campaignMetrics?: CampaignMetrics;
  adGroupMetrics?: AdGroupMetrics[];
  rsaMetrics?: RsaMetrics[];
  budgetAmountMicros?: number | null;
}

export interface PerformanceTimeWindow {
  current?: string;
  historical?: string;
}

/**
 * Read-only bundle one analysis run may be given.
 * Nothing here is written back.
 */
export interface PerformanceContext {
  campaignMetrics?: CampaignMetrics;
  adGroupMetrics?: AdGroupMetrics[];
  rsaMetrics?: RsaMetrics[];
  historicalMetrics?: HistoricalMetrics;
  budgetAmountMicros?: number | null;
  timeWindow?: PerformanceTimeWindow;
  executionMetadata?: PerformanceMetadata;
  runtimeMetadata?: PerformanceMetadata;
}
