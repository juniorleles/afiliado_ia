/**
 * Host record domain: ad group snapshot.
 *
 * A frozen record of one built ad group model: the model id, the campaign
 * model id, the execution plan id, the execution contract ids, the Decision
 * Analysis id, the workflow snapshot id, the ad group ids, a creation
 * timestamp, and flat metadata. It never reaches an outside system, never
 * authenticates, and never sends a record.
 */
import type { GoogleAdsAudience, GoogleAdsBidStrategy, GoogleAdsKeyword, GoogleAdsMetadata, GoogleAdsNegativeKeyword } from "./google-ads-types";

export const GOOGLE_ADS_AD_GROUP_SNAPSHOT_KEYS = [
  "adGroupModelId",
  "campaignModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "adGroupIds",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsAdGroupSnapshot {
  adGroupModelId: string;
  /** The campaign model this record reads. A reference only. */
  campaignModelId: string | null;
  /** The execution plan this model reads. A reference only. */
  executionPlanId: string | null;
  /** The execution contracts this model reads. References only. */
  executionContractIds: readonly string[];
  /** The Decision Analysis this model reads. A reference only. */
  decisionAnalysisId: string | null;
  /** The workflow snapshot this model reads. A reference only. */
  workflowSnapshotId: string | null;
  adGroupIds: readonly string[];
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

/** One named default bid. Restated, never judged. */
export interface GoogleAdsDefaultBid {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named target CPA record. Restated, never judged. Optional on an ad group. */
export interface GoogleAdsTargetCpa {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named target ROAS record. Restated, never judged. Optional on an ad group. */
export interface GoogleAdsTargetRoas {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named device record. Restated, never judged. */
export interface GoogleAdsDevice {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_BUILT_AD_GROUP_KEYS = [
  "id",
  "name",
  "campaignId",
  "defaultBid",
  "targetCpa",
  "targetRoas",
  "keywords",
  "negativeKeywords",
  "audiences",
  "devices",
  "bidStrategy",
  "metadata",
] as const;

/** One complete ad group assembled from named records. Does not send work. */
export interface GoogleAdsBuiltAdGroup {
  id: string;
  name: string;
  campaignId: string;
  defaultBid: GoogleAdsDefaultBid;
  targetCpa: GoogleAdsTargetCpa | null;
  targetRoas: GoogleAdsTargetRoas | null;
  keywords: readonly GoogleAdsKeyword[];
  negativeKeywords: readonly GoogleAdsNegativeKeyword[];
  audiences: readonly GoogleAdsAudience[];
  devices: readonly GoogleAdsDevice[];
  bidStrategy: GoogleAdsBidStrategy;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_AD_GROUP_MODEL_KEYS = [
  "id",
  "campaignModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "adGroups",
  "warnings",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

/** One immutable ad group model assembled inside a campaign model. Does not send work. */
export interface GoogleAdsAdGroupModel {
  id: string;
  campaignModelId: string | null;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  adGroups: readonly GoogleAdsBuiltAdGroup[];
  warnings: readonly string[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
  createdAt: string;
}

export interface GoogleAdsAdGroupNamedRecordSpec {
  id: string;
  name: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsKeywordSpec {
  id: string;
  adGroupId: string;
  text: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsNegativeKeywordSpec {
  id: string;
  text: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsAdGroupSpec {
  id: string;
  name: string;
  campaignId: string;
  defaultBidId: string;
  bidStrategyId?: string;
  targetCpaId?: string;
  targetRoasId?: string;
  keywordIds?: readonly string[];
  negativeKeywordIds?: readonly string[];
  audienceIds?: readonly string[];
  deviceIds?: readonly string[];
  metadata?: GoogleAdsMetadata;
  warnings?: readonly string[];
}

/** Read-only campaign model holder. The ad group builder does not change it. */
export interface GoogleAdsAdGroupCampaignRef {
  id: string;
  campaignIds?: readonly string[];
  campaigns?: readonly { id: string; bidStrategy?: { id: string; name?: string; metadata?: GoogleAdsMetadata } | null }[];
}

export interface GoogleAdsAdGroupSnapshotInit {
  adGroupModelId: string;
  campaignModelId: string | null;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  adGroupIds: readonly string[];
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsAdGroup<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsAdGroup(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsAdGroup<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsAdGroup(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsAdGroup(inner)])) as T;
  }
  return value;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createGoogleAdsAdGroupSnapshot(init: GoogleAdsAdGroupSnapshotInit): GoogleAdsAdGroupSnapshot {
  return freezeDeepGoogleAdsAdGroup({
    adGroupModelId: init.adGroupModelId,
    campaignModelId: init.campaignModelId,
    executionPlanId: init.executionPlanId,
    executionContractIds: [...init.executionContractIds],
    decisionAnalysisId: init.decisionAnalysisId,
    workflowSnapshotId: init.workflowSnapshotId,
    adGroupIds: [...init.adGroupIds],
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsAdGroup(init.metadata ?? {}),
  });
}
