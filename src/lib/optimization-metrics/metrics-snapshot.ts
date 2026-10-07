/**
 * Host record domain: metrics snapshot.
 *
 * A frozen copy of one read. Credential values are not members. Metric
 * numbers are the figures returned by the account service.
 */
import type { MetricsMetadata } from "./metrics-context";

export const METRICS_STATUSES = ["OK", "REJECTED"] as const;
export type MetricsStatus = (typeof METRICS_STATUSES)[number];

export const METRICS_ORIGINS = ["OBSERVED"] as const;
export type MetricsOrigin = (typeof METRICS_ORIGINS)[number];

export const METRICS_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type MetricsProvenance = (typeof METRICS_PROVENANCE)[number];

export const METRICS_DATE_RANGE = "LAST_30_DAYS";

export interface MetricsIssue {
  field: string;
  message: string;
}

export const METRIC_VALUE_KEYS = [
  "impressions",
  "clicks",
  "ctr",
  "averageCpc",
  "costMicros",
  "conversions",
  "conversionValue",
  "averageCpm",
  "searchImpressionShare",
  "searchTopImpressionShare",
  "searchAbsoluteTopImpressionShare",
] as const;

export interface MetricValues {
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  averageCpc: number | null;
  costMicros: number | null;
  conversions: number | null;
  conversionValue: number | null;
  averageCpm: number | null;
  searchImpressionShare: number | null;
  searchTopImpressionShare: number | null;
  searchAbsoluteTopImpressionShare: number | null;
}

export const CAMPAIGN_METRIC_KEYS = ["resourceName", "campaignId", "status", ...METRIC_VALUE_KEYS] as const;

export interface CampaignMetrics extends MetricValues {
  resourceName: string;
  campaignId: string;
  status: string;
}

export const AD_GROUP_METRIC_KEYS = ["resourceName", "adGroupId", "campaignResourceName", ...METRIC_VALUE_KEYS] as const;

export interface AdGroupMetrics extends MetricValues {
  resourceName: string;
  adGroupId: string;
  campaignResourceName: string;
}

export const RSA_METRIC_KEYS = [
  "resourceName",
  "adId",
  "adGroupResourceName",
  "campaignResourceName",
  "status",
  "approvalStatus",
  "policyReviewStatus",
  ...METRIC_VALUE_KEYS,
] as const;

export interface RsaMetrics extends MetricValues {
  resourceName: string;
  adId: string;
  adGroupResourceName: string;
  campaignResourceName: string;
  status: string;
  approvalStatus: string | null;
  policyReviewStatus: string | null;
}

export const METRICS_STATISTICS_KEYS = ["requestCount", "campaignCount", "adGroupCount", "adCount", "issueCount", "executionTime"] as const;

export interface MetricsStatistics {
  requestCount: number;
  campaignCount: number;
  adGroupCount: number;
  adCount: number;
  issueCount: number;
  executionTime: number;
}

export const METRICS_CONTEXT_RECORD_KEYS = ["customerId", "campaignResourceNames", "dateRange"] as const;

export interface MetricsContextRecord {
  customerId: string;
  campaignResourceNames: string[];
  dateRange: typeof METRICS_DATE_RANGE;
}

export const METRICS_SNAPSHOT_KEYS = [
  "collectionId",
  "campaignMetrics",
  "adGroupMetrics",
  "rsaMetrics",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface MetricsSnapshot {
  collectionId: string;
  campaignMetrics: CampaignMetrics[];
  adGroupMetrics: AdGroupMetrics[];
  rsaMetrics: RsaMetrics[];
  statistics: MetricsStatistics;
  context: MetricsContextRecord;
  createdAt: string;
  origin: MetricsOrigin;
  provenance: MetricsProvenance;
  metadata: MetricsMetadata;
}

export const METRICS_RESULT_KEYS = [
  "status",
  "issues",
  "campaignMetrics",
  "adGroupMetrics",
  "rsaMetrics",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface MetricsResult {
  status: MetricsStatus;
  issues: MetricsIssue[];
  campaignMetrics: CampaignMetrics[] | null;
  adGroupMetrics: AdGroupMetrics[] | null;
  rsaMetrics: RsaMetrics[] | null;
  statistics: MetricsStatistics;
  snapshot: MetricsSnapshot | null;
  metadata: MetricsMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepMetrics<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepMetrics(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createMetricsStatistics(init: MetricsStatistics): MetricsStatistics {
  return freezeDeepMetrics({
    requestCount: init.requestCount,
    campaignCount: init.campaignCount,
    adGroupCount: init.adGroupCount,
    adCount: init.adCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function copyValues(values: MetricValues): MetricValues {
  return {
    impressions: values.impressions,
    clicks: values.clicks,
    ctr: values.ctr,
    averageCpc: values.averageCpc,
    costMicros: values.costMicros,
    conversions: values.conversions,
    conversionValue: values.conversionValue,
    averageCpm: values.averageCpm,
    searchImpressionShare: values.searchImpressionShare,
    searchTopImpressionShare: values.searchTopImpressionShare,
    searchAbsoluteTopImpressionShare: values.searchAbsoluteTopImpressionShare,
  };
}

function copyCampaign(metric: CampaignMetrics): CampaignMetrics {
  return { resourceName: metric.resourceName, campaignId: metric.campaignId, status: metric.status, ...copyValues(metric) };
}

function copyAdGroup(metric: AdGroupMetrics): AdGroupMetrics {
  return { resourceName: metric.resourceName, adGroupId: metric.adGroupId, campaignResourceName: metric.campaignResourceName, ...copyValues(metric) };
}

function copyRsa(metric: RsaMetrics): RsaMetrics {
  return {
    resourceName: metric.resourceName,
    adId: metric.adId,
    adGroupResourceName: metric.adGroupResourceName,
    campaignResourceName: metric.campaignResourceName,
    status: metric.status,
    approvalStatus: metric.approvalStatus,
    policyReviewStatus: metric.policyReviewStatus,
    ...copyValues(metric),
  };
}

export function createMetricsSnapshot(init: {
  collectionId: string;
  campaignMetrics: CampaignMetrics[];
  adGroupMetrics: AdGroupMetrics[];
  rsaMetrics: RsaMetrics[];
  statistics: MetricsStatistics;
  context: MetricsContextRecord;
  createdAt: string;
  metadata?: MetricsMetadata;
}): MetricsSnapshot {
  return freezeDeepMetrics({
    collectionId: init.collectionId,
    campaignMetrics: init.campaignMetrics.map(copyCampaign),
    adGroupMetrics: init.adGroupMetrics.map(copyAdGroup),
    rsaMetrics: init.rsaMetrics.map(copyRsa),
    statistics: init.statistics,
    context: {
      customerId: init.context.customerId,
      campaignResourceNames: [...init.context.campaignResourceNames],
      dateRange: METRICS_DATE_RANGE,
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
