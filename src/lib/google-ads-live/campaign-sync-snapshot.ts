/**
 * Host record domain: campaign synchronization snapshot.
 *
 * A frozen copy of one read. Credential values are not members of the
 * campaign state, the report, or the snapshot.
 */
import type { CampaignSyncMetadata } from "./campaign-sync-context";

export const CAMPAIGN_SYNC_STATUSES = ["OK", "REJECTED"] as const;
export type CampaignSyncStatus = (typeof CAMPAIGN_SYNC_STATUSES)[number];

export const CAMPAIGN_SYNC_ORIGINS = ["OBSERVED"] as const;
export type CampaignSyncOrigin = (typeof CAMPAIGN_SYNC_ORIGINS)[number];

export const CAMPAIGN_SYNC_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type CampaignSyncProvenance = (typeof CAMPAIGN_SYNC_PROVENANCE)[number];

export interface CampaignSyncIssue {
  field: string;
  message: string;
}

export const LABEL_STATE_KEYS = ["resourceName", "labelId", "name"] as const;

export interface LabelState {
  resourceName: string;
  labelId: string;
  name: string;
}

export const AD_STATE_KEYS = ["resourceName", "adGroupResourceName", "adId", "status", "approvalStatus", "policyReviewStatus"] as const;

export interface AdState {
  resourceName: string;
  adGroupResourceName: string;
  adId: string;
  status: string;
  approvalStatus: string | null;
  policyReviewStatus: string | null;
}

export const AD_GROUP_STATE_KEYS = ["resourceName", "adGroupId", "name", "status", "ads"] as const;

export interface AdGroupState {
  resourceName: string;
  adGroupId: string;
  name: string;
  status: string;
  ads: AdState[];
}

export const CAMPAIGN_STATE_KEYS = [
  "resourceName",
  "campaignId",
  "name",
  "status",
  "servingStatus",
  "budgetResourceName",
  "budgetName",
  "budgetAmountMicros",
  "budgetStatus",
  "lastModifiedTime",
  "labels",
  "adGroups",
] as const;

export interface CampaignState {
  resourceName: string;
  campaignId: string;
  name: string;
  status: string;
  servingStatus: string;
  budgetResourceName: string | null;
  budgetName: string | null;
  budgetAmountMicros: string | null;
  budgetStatus: string | null;
  lastModifiedTime: string | null;
  labels: LabelState[];
  adGroups: AdGroupState[];
}

export const CAMPAIGN_SNAPSHOT_KEYS = ["customerId", "campaigns", "readAt"] as const;

export interface CampaignSnapshot {
  customerId: string;
  campaigns: CampaignState[];
  readAt: string;
}

export const SYNC_DIFFERENCE_KEYS = ["kind", "resourceName", "field", "localValue", "observedValue"] as const;

export interface SyncDifference {
  kind: "STATE_CHANGE" | "MISSING";
  resourceName: string;
  field: string;
  localValue: string | null;
  observedValue: string | null;
}

export const MISSING_RESOURCE_KEYS = ["resourceName", "missingFrom"] as const;

export interface MissingResource {
  resourceName: string;
  missingFrom: "LOCAL" | "GOOGLE";
}

export const STATE_CHANGE_KEYS = ["resourceName", "field", "localValue", "observedValue"] as const;

export interface StateChange {
  resourceName: string;
  field: string;
  localValue: string | null;
  observedValue: string | null;
}

export const SYNC_REPORT_KEYS = ["customerId", "priorSnapshotPresent", "differences", "missingResources", "stateChanges"] as const;

export interface SynchronizationReport {
  customerId: string;
  priorSnapshotPresent: boolean;
  differences: SyncDifference[];
  missingResources: MissingResource[];
  stateChanges: StateChange[];
}

export const CAMPAIGN_SYNC_STATISTICS_KEYS = [
  "requestCount",
  "campaignCount",
  "adGroupCount",
  "adCount",
  "labelCount",
  "differenceCount",
  "issueCount",
  "executionTime",
] as const;

export interface CampaignSyncStatistics {
  requestCount: number;
  campaignCount: number;
  adGroupCount: number;
  adCount: number;
  labelCount: number;
  differenceCount: number;
  issueCount: number;
  executionTime: number;
}

export const CAMPAIGN_SYNC_CONTEXT_RECORD_KEYS = ["customerId", "campaignResourceNames"] as const;

export interface CampaignSyncContextRecord {
  customerId: string;
  campaignResourceNames: string[];
}

export const CAMPAIGN_SYNC_SNAPSHOT_KEYS = [
  "syncId",
  "campaignSnapshot",
  "report",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface CampaignSyncSnapshot {
  syncId: string;
  campaignSnapshot: CampaignSnapshot;
  report: SynchronizationReport;
  statistics: CampaignSyncStatistics;
  context: CampaignSyncContextRecord;
  createdAt: string;
  origin: CampaignSyncOrigin;
  provenance: CampaignSyncProvenance;
  metadata: CampaignSyncMetadata;
}

export const CAMPAIGN_SYNC_RESULT_KEYS = [
  "status",
  "issues",
  "campaignSnapshot",
  "report",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface CampaignSyncResult {
  status: CampaignSyncStatus;
  issues: CampaignSyncIssue[];
  campaignSnapshot: CampaignSnapshot | null;
  report: SynchronizationReport | null;
  statistics: CampaignSyncStatistics;
  snapshot: CampaignSyncSnapshot | null;
  metadata: CampaignSyncMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepCampaignSync<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepCampaignSync(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createCampaignSyncStatistics(init: CampaignSyncStatistics): CampaignSyncStatistics {
  return freezeDeepCampaignSync({
    requestCount: init.requestCount,
    campaignCount: init.campaignCount,
    adGroupCount: init.adGroupCount,
    adCount: init.adCount,
    labelCount: init.labelCount,
    differenceCount: init.differenceCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function copyLabel(label: LabelState): LabelState {
  return { resourceName: label.resourceName, labelId: label.labelId, name: label.name };
}

function copyAd(ad: AdState): AdState {
  return {
    resourceName: ad.resourceName,
    adGroupResourceName: ad.adGroupResourceName,
    adId: ad.adId,
    status: ad.status,
    approvalStatus: ad.approvalStatus,
    policyReviewStatus: ad.policyReviewStatus,
  };
}

function copyAdGroup(adGroup: AdGroupState): AdGroupState {
  return {
    resourceName: adGroup.resourceName,
    adGroupId: adGroup.adGroupId,
    name: adGroup.name,
    status: adGroup.status,
    ads: adGroup.ads.map(copyAd),
  };
}

function copyCampaign(campaign: CampaignState): CampaignState {
  return {
    resourceName: campaign.resourceName,
    campaignId: campaign.campaignId,
    name: campaign.name,
    status: campaign.status,
    servingStatus: campaign.servingStatus,
    budgetResourceName: campaign.budgetResourceName,
    budgetName: campaign.budgetName,
    budgetAmountMicros: campaign.budgetAmountMicros,
    budgetStatus: campaign.budgetStatus,
    lastModifiedTime: campaign.lastModifiedTime,
    labels: campaign.labels.map(copyLabel),
    adGroups: campaign.adGroups.map(copyAdGroup),
  };
}

function copyReport(report: SynchronizationReport): SynchronizationReport {
  return {
    customerId: report.customerId,
    priorSnapshotPresent: report.priorSnapshotPresent,
    differences: report.differences.map((item) => ({
      kind: item.kind,
      resourceName: item.resourceName,
      field: item.field,
      localValue: item.localValue,
      observedValue: item.observedValue,
    })),
    missingResources: report.missingResources.map((item) => ({ resourceName: item.resourceName, missingFrom: item.missingFrom })),
    stateChanges: report.stateChanges.map((item) => ({
      resourceName: item.resourceName,
      field: item.field,
      localValue: item.localValue,
      observedValue: item.observedValue,
    })),
  };
}

export function createCampaignSyncSnapshot(init: {
  syncId: string;
  campaignSnapshot: CampaignSnapshot;
  report: SynchronizationReport;
  statistics: CampaignSyncStatistics;
  context: CampaignSyncContextRecord;
  createdAt: string;
  metadata?: CampaignSyncMetadata;
}): CampaignSyncSnapshot {
  return freezeDeepCampaignSync({
    syncId: init.syncId,
    campaignSnapshot: {
      customerId: init.campaignSnapshot.customerId,
      campaigns: init.campaignSnapshot.campaigns.map(copyCampaign),
      readAt: init.campaignSnapshot.readAt,
    },
    report: copyReport(init.report),
    statistics: init.statistics,
    context: {
      customerId: init.context.customerId,
      campaignResourceNames: [...init.context.campaignResourceNames],
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
