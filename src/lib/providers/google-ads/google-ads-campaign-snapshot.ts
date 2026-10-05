/**
 * Host record domain: campaign snapshot.
 *
 * A frozen record of one built campaign model: the model id, the execution
 * plan id, the execution contract ids, the Decision Analysis id, the workflow
 * snapshot id, the campaign ids, a creation timestamp, and flat metadata. It
 * never reaches an outside system, never authenticates, and never sends a
 * record.
 */
import type { GoogleAdsCampaignBudget, GoogleAdsCampaignSettings, GoogleAdsLanguage, GoogleAdsLocation, GoogleAdsMetadata, GoogleAdsBidStrategy } from "./google-ads-types";

export const GOOGLE_ADS_CAMPAIGN_SNAPSHOT_KEYS = [
  "campaignModelId",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "campaignIds",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsCampaignSnapshot {
  campaignModelId: string;
  /** The execution plan this model reads. A reference only. */
  executionPlanId: string | null;
  /** The execution contracts this model reads. References only. */
  executionContractIds: readonly string[];
  /** The Decision Analysis this model reads. A reference only. */
  decisionAnalysisId: string | null;
  /** The workflow snapshot this model reads. A reference only. */
  workflowSnapshotId: string | null;
  campaignIds: readonly string[];
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

/** One named network record. Restated, never judged. */
export interface GoogleAdsCampaignNetwork {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named schedule record. Restated, never judged. */
export interface GoogleAdsCampaignSchedule {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_BUILT_CAMPAIGN_KEYS = [
  "id",
  "name",
  "budget",
  "settings",
  "network",
  "locations",
  "languages",
  "schedule",
  "bidStrategy",
  "metadata",
] as const;

/** One complete campaign assembled from named records. Does not send work. */
export interface GoogleAdsBuiltCampaign {
  id: string;
  name: string;
  budget: GoogleAdsCampaignBudget;
  settings: GoogleAdsCampaignSettings;
  network: GoogleAdsCampaignNetwork;
  locations: readonly GoogleAdsLocation[];
  languages: readonly GoogleAdsLanguage[];
  schedule: GoogleAdsCampaignSchedule;
  bidStrategy: GoogleAdsBidStrategy;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_CAMPAIGN_MODEL_KEYS = [
  "id",
  "executionPlanId",
  "executionContractIds",
  "decisionAnalysisId",
  "workflowSnapshotId",
  "campaigns",
  "warnings",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

/** One immutable campaign model assembled from an execution plan. Does not send work. */
export interface GoogleAdsCampaignModel {
  id: string;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  campaigns: readonly GoogleAdsBuiltCampaign[];
  warnings: readonly string[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
  createdAt: string;
}

export interface GoogleAdsCampaignSpec {
  id: string;
  name: string;
  budgetId: string;
  settingsId: string;
  networkId: string;
  locationIds?: readonly string[];
  languageIds?: readonly string[];
  scheduleId: string;
  bidStrategyId: string;
  metadata?: GoogleAdsMetadata;
  warnings?: readonly string[];
}

export interface GoogleAdsNamedRecordSpec {
  id: string;
  name: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsSettingsSpec {
  id: string;
  campaignId: string;
  metadata?: GoogleAdsMetadata;
}

export interface GoogleAdsCampaignSnapshotInit {
  campaignModelId: string;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  decisionAnalysisId: string | null;
  workflowSnapshotId: string | null;
  campaignIds: readonly string[];
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsCampaign<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsCampaign(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsCampaign<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsCampaign(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsCampaign(inner)])) as T;
  }
  return value;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createGoogleAdsCampaignSnapshot(init: GoogleAdsCampaignSnapshotInit): GoogleAdsCampaignSnapshot {
  return freezeDeepGoogleAdsCampaign({
    campaignModelId: init.campaignModelId,
    executionPlanId: init.executionPlanId,
    executionContractIds: [...init.executionContractIds],
    decisionAnalysisId: init.decisionAnalysisId,
    workflowSnapshotId: init.workflowSnapshotId,
    campaignIds: [...init.campaignIds],
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsCampaign(init.metadata ?? {}),
  });
}
