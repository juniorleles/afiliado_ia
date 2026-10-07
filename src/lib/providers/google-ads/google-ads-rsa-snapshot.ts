/**
 * Host record domain: responsive search ad snapshot.
 *
 * A frozen record of one built RSA model: the model id, the campaign model
 * id, the ad group model id, the execution plan id, the execution contract
 * ids, the Decision Analysis id, the workflow snapshot id, the RSA ids, a
 * creation timestamp, and flat metadata. It never reaches an outside system,
 * never authenticates, and never sends a record.
 */
import type { GoogleAdsDescription, GoogleAdsFinalUrl, GoogleAdsHeadline, GoogleAdsMetadata, GoogleAdsTrackingTemplate } from "./google-ads-types";

export const GOOGLE_ADS_RSA_SNAPSHOT_KEYS = [
  "rsaModelId",
  "campaignModelId",
  "adGroupModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "rsaIds",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsRsaSnapshot {
  rsaModelId: string;
  /** The campaign model this record reads. A reference only. */
  campaignModelId: string | null;
  /** The ad group model this record reads. A reference only. */
  adGroupModelId: string | null;
  /** The execution plan this model reads. A reference only. */
  executionPlanId: string | null;
  /** The execution contracts this model reads. References only. */
  executionContractIds: readonly string[];
  /** The Decision Analysis this model reads. A reference only. */
  decisionAnalysisId: string | null;
  /** The workflow snapshot this model reads. A reference only. */
  workflowSnapshotId: string | null;
  rsaIds: readonly string[];
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

/** One named display path. Restated, never opened. */
export interface GoogleAdsDisplayPath {
  id: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

/** One named URL suffix. Restated, never opened. */
export interface GoogleAdsUrlSuffix {
  id: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

/** One named pinned asset. Restated, never uploaded. */
export interface GoogleAdsPinnedAsset {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_BUILT_RSA_KEYS = [
  "id",
  "adGroupId",
  "headlines",
  "descriptions",
  "finalUrl",
  "displayPath",
  "trackingTemplate",
  "urlSuffix",
  "pinnedAssets",
  "metadata",
] as const;

/** One complete RSA assembled from named records. Does not send work. */
export interface GoogleAdsBuiltRsa {
  id: string;
  adGroupId: string;
  headlines: readonly GoogleAdsHeadline[];
  descriptions: readonly GoogleAdsDescription[];
  finalUrl: GoogleAdsFinalUrl;
  displayPath: GoogleAdsDisplayPath | null;
  trackingTemplate: GoogleAdsTrackingTemplate | null;
  urlSuffix: GoogleAdsUrlSuffix | null;
  pinnedAssets: readonly GoogleAdsPinnedAsset[];
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_RSA_MODEL_KEYS = [
  "id",
  "campaignModelId",
  "adGroupModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "responsiveSearchAds",
  "warnings",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

/** One immutable RSA model assembled inside ad groups. Does not send work. */
export interface GoogleAdsRsaModel {
  id: string;
  campaignModelId: string | null;
  adGroupModelId: string | null;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  responsiveSearchAds: readonly GoogleAdsBuiltRsa[];
  warnings: readonly string[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
  createdAt: string;
}

export interface GoogleAdsRsaTextSpec {
  id: string;
  text: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsRsaUrlSpec {
  id: string;
  url: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsRsaNamedRecordSpec {
  id: string;
  name: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsRsaSpec {
  id: string;
  adGroupId: string;
  headlineIds: readonly string[];
  descriptionIds: readonly string[];
  finalUrlId: string;
  displayPathId?: string;
  trackingTemplateId?: string;
  urlSuffixId?: string;
  pinnedAssetIds?: readonly string[];
  metadata?: GoogleAdsMetadata;
  warnings?: readonly string[];
}

/** Read-only campaign model holder. The RSA builder does not change it. */
export interface GoogleAdsRsaCampaignRef {
  id: string;
  campaignIds?: readonly string[];
  campaigns?: readonly { id: string }[];
}

/** Read-only ad group model holder. The RSA builder does not change it. */
export interface GoogleAdsRsaAdGroupRef {
  id: string;
  adGroupIds?: readonly string[];
  adGroups?: readonly { id: string; campaignId?: string }[];
}

export interface GoogleAdsRsaSnapshotInit {
  rsaModelId: string;
  campaignModelId: string | null;
  adGroupModelId: string | null;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  rsaIds: readonly string[];
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsRsa<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsRsa(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsRsa<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsRsa(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsRsa(inner)])) as T;
  }
  return value;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createGoogleAdsRsaSnapshot(init: GoogleAdsRsaSnapshotInit): GoogleAdsRsaSnapshot {
  return freezeDeepGoogleAdsRsa({
    rsaModelId: init.rsaModelId,
    campaignModelId: init.campaignModelId,
    adGroupModelId: init.adGroupModelId,
    executionPlanId: init.executionPlanId,
    executionContractIds: [...init.executionContractIds],
    decisionAnalysisId: init.decisionAnalysisId,
    workflowSnapshotId: init.workflowSnapshotId,
    rsaIds: [...init.rsaIds],
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsRsa(init.metadata ?? {}),
  });
}
