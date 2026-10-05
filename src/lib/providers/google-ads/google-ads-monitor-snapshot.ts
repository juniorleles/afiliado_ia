/**
 * Host record domain: synchronization snapshot.
 *
 * A frozen record of one observe-only sync run: the sync id, the campaign id,
 * restated status tokens, campaign health, a synchronization timestamp, and
 * flat metadata. It never creates a campaign, never changes a decision, and
 * never reaches an outside system. This layer stays offline.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";

export const GOOGLE_ADS_MONITOR_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsMonitorStatus = (typeof GOOGLE_ADS_MONITOR_STATUSES)[number];

export const GOOGLE_ADS_CAMPAIGN_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "UNKNOWN"] as const;
export type GoogleAdsObservedCampaignStatus = (typeof GOOGLE_ADS_CAMPAIGN_STATUSES)[number];

export const GOOGLE_ADS_BUDGET_STATUSES = ["PRESENT", "MISSING", "UNKNOWN"] as const;
export type GoogleAdsObservedBudgetStatus = (typeof GOOGLE_ADS_BUDGET_STATUSES)[number];

export const GOOGLE_ADS_APPROVAL_STATUSES = ["APPROVED", "PENDING", "DISAPPROVED", "UNKNOWN"] as const;
export type GoogleAdsObservedApprovalStatus = (typeof GOOGLE_ADS_APPROVAL_STATUSES)[number];

export const GOOGLE_ADS_POLICY_STATUSES = ["CLEAR", "FLAGGED", "UNKNOWN"] as const;
export type GoogleAdsObservedPolicyStatus = (typeof GOOGLE_ADS_POLICY_STATUSES)[number];

export const GOOGLE_ADS_AD_GROUP_STATUSES = ["ACTIVE", "PAUSED", "UNKNOWN"] as const;
export type GoogleAdsObservedAdGroupStatus = (typeof GOOGLE_ADS_AD_GROUP_STATUSES)[number];

export const GOOGLE_ADS_AD_STATUSES = ["ACTIVE", "PAUSED", "UNKNOWN"] as const;
export type GoogleAdsObservedAdStatus = (typeof GOOGLE_ADS_AD_STATUSES)[number];

export const GOOGLE_ADS_CAMPAIGN_HEALTH = ["ALIGNED", "DRIFT", "MISSING", "UNAVAILABLE"] as const;
export type GoogleAdsObservedCampaignHealth = (typeof GOOGLE_ADS_CAMPAIGN_HEALTH)[number];

export const GOOGLE_ADS_PROVIDER_HEALTH = ["OFFLINE", "UNAVAILABLE"] as const;
export type GoogleAdsProviderHealthStatus = (typeof GOOGLE_ADS_PROVIDER_HEALTH)[number];

export const GOOGLE_ADS_PROVIDER_STATUS_KEYS = [
  "campaignId",
  "campaignStatus",
  "budgetStatus",
  "approvalStatus",
  "policyStatus",
  "adGroupStatus",
  "adStatus",
] as const;

export interface GoogleAdsProviderStatus {
  campaignId: string | null;
  campaignStatus: GoogleAdsObservedCampaignStatus;
  budgetStatus: GoogleAdsObservedBudgetStatus;
  approvalStatus: GoogleAdsObservedApprovalStatus;
  policyStatus: GoogleAdsObservedPolicyStatus;
  adGroupStatus: GoogleAdsObservedAdGroupStatus;
  adStatus: GoogleAdsObservedAdStatus;
}

export const GOOGLE_ADS_SYNC_RESULT_KEYS = [
  "id",
  "campaignId",
  "campaignStatus",
  "budgetStatus",
  "approvalStatus",
  "policyStatus",
  "adGroupStatus",
  "adStatus",
  "synchronizedAt",
  "metadata",
] as const;

export interface GoogleAdsSynchronizationResult {
  id: string;
  campaignId: string | null;
  campaignStatus: GoogleAdsObservedCampaignStatus;
  budgetStatus: GoogleAdsObservedBudgetStatus;
  approvalStatus: GoogleAdsObservedApprovalStatus;
  policyStatus: GoogleAdsObservedPolicyStatus;
  adGroupStatus: GoogleAdsObservedAdGroupStatus;
  adStatus: GoogleAdsObservedAdStatus;
  synchronizedAt: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_SYNC_REPORT_KEYS = [
  "id",
  "status",
  "consistent",
  "campaignHealth",
  "issues",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsSynchronizationReport {
  id: string;
  status: GoogleAdsMonitorStatus;
  consistent: boolean;
  campaignHealth: GoogleAdsObservedCampaignHealth;
  issues: readonly { field: string; message: string }[];
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_SYNC_SNAPSHOT_KEYS = [
  "syncId",
  "campaignId",
  "campaignHealth",
  "consistent",
  "synchronizedAt",
  "metadata",
] as const;

export interface GoogleAdsSynchronizationSnapshot {
  syncId: string;
  campaignId: string | null;
  campaignHealth: GoogleAdsObservedCampaignHealth;
  consistent: boolean;
  synchronizedAt: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsSynchronizationSnapshotInit {
  syncId: string;
  campaignId: string | null;
  campaignHealth: GoogleAdsObservedCampaignHealth;
  consistent: boolean;
  synchronizedAt: string;
  metadata?: GoogleAdsMetadata;
}

export const GOOGLE_ADS_SYNC_METRICS_KEYS = ["campaignCount", "conflictCount", "issueCount", "executionTime"] as const;

export interface GoogleAdsSynchronizationMetrics {
  campaignCount: number;
  conflictCount: number;
  issueCount: number;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsMonitor<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsMonitor(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsMonitor<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsMonitor(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsMonitor(inner)])) as T;
  }
  return value;
}

export function createGoogleAdsSynchronizationSnapshot(init: GoogleAdsSynchronizationSnapshotInit): GoogleAdsSynchronizationSnapshot {
  return freezeDeepGoogleAdsMonitor({
    syncId: init.syncId,
    campaignId: init.campaignId,
    campaignHealth: init.campaignHealth,
    consistent: init.consistent,
    synchronizedAt: init.synchronizedAt,
    metadata: copyPlainGoogleAdsMonitor(init.metadata ?? {}),
  });
}

export function computeGoogleAdsSynchronizationMetrics(init: GoogleAdsSynchronizationMetrics): GoogleAdsSynchronizationMetrics {
  return freezeDeepGoogleAdsMonitor({
    campaignCount: init.campaignCount,
    conflictCount: init.conflictCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}
