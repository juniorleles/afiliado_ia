/**
 * Host record domain: adapter snapshot.
 *
 * A frozen record of one mapped request payload: the payload id, the campaign
 * model id, the ad group model id, the RSA model id, the execution plan id,
 * the resource ids, a creation timestamp, and flat metadata. It never reaches
 * an outside system, never authenticates, and never sends a request.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";

export const GOOGLE_ADS_ADAPTER_CAPABILITIES = ["MAP", "VALIDATE", "BUILD", "FREEZE", "SNAPSHOT"] as const;
export type GoogleAdsAdapterCapability = (typeof GOOGLE_ADS_ADAPTER_CAPABILITIES)[number];

export const GOOGLE_ADS_ADAPTER_RESOURCES = [
  "campaign",
  "campaignBudget",
  "campaignSettings",
  "adGroup",
  "keyword",
  "responsiveSearchAd",
  "tracking",
] as const;
export type GoogleAdsAdapterResource = (typeof GOOGLE_ADS_ADAPTER_RESOURCES)[number];

export interface GoogleAdsCampaignRequest {
  resource: "campaign";
  id: string;
  name: string;
  budgetId: string;
  settingsId: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsCampaignBudgetRequest {
  resource: "campaignBudget";
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsCampaignSettingsRequest {
  resource: "campaignSettings";
  id: string;
  campaignId: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsAdGroupRequest {
  resource: "adGroup";
  id: string;
  campaignId: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsKeywordRequest {
  resource: "keyword";
  id: string;
  adGroupId: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsResponsiveSearchAdRequest {
  resource: "responsiveSearchAd";
  id: string;
  adGroupId: string;
  headlines: readonly string[];
  descriptions: readonly string[];
  finalUrl: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsTrackingRequest {
  resource: "tracking";
  id: string;
  rsaId: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

export const GOOGLE_ADS_REQUEST_PAYLOAD_KEYS = [
  "id",
  "campaignModelId",
  "adGroupModelId",
  "rsaModelId",
  "executionPlanId",
  "executionContractIds",
  "campaignRequests",
  "campaignBudgetRequests",
  "campaignSettingsRequests",
  "adGroupRequests",
  "keywordRequests",
  "responsiveSearchAdRequests",
  "trackingRequests",
  "metadata",
  "executionTime",
  "createdAt",
] as const;

/** One immutable request payload. The adapter does not send it. */
export interface GoogleAdsRequestPayload {
  id: string;
  campaignModelId: string | null;
  adGroupModelId: string | null;
  rsaModelId: string | null;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  campaignRequests: readonly GoogleAdsCampaignRequest[];
  campaignBudgetRequests: readonly GoogleAdsCampaignBudgetRequest[];
  campaignSettingsRequests: readonly GoogleAdsCampaignSettingsRequest[];
  adGroupRequests: readonly GoogleAdsAdGroupRequest[];
  keywordRequests: readonly GoogleAdsKeywordRequest[];
  responsiveSearchAdRequests: readonly GoogleAdsResponsiveSearchAdRequest[];
  trackingRequests: readonly GoogleAdsTrackingRequest[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
  createdAt: string;
}

export const GOOGLE_ADS_ADAPTER_SNAPSHOT_KEYS = [
  "payloadId",
  "campaignModelId",
  "adGroupModelId",
  "rsaModelId",
  "executionPlanId",
  "resourceIds",
  "createdAt",
  "metadata",
] as const;

export interface GoogleAdsAdapterSnapshot {
  payloadId: string;
  campaignModelId: string | null;
  adGroupModelId: string | null;
  rsaModelId: string | null;
  executionPlanId: string | null;
  resourceIds: readonly string[];
  createdAt: string;
  metadata: GoogleAdsMetadata;
}

export interface GoogleAdsMappedRequests {
  campaignRequests: GoogleAdsCampaignRequest[];
  campaignBudgetRequests: GoogleAdsCampaignBudgetRequest[];
  campaignSettingsRequests: GoogleAdsCampaignSettingsRequest[];
  adGroupRequests: GoogleAdsAdGroupRequest[];
  keywordRequests: GoogleAdsKeywordRequest[];
  responsiveSearchAdRequests: GoogleAdsResponsiveSearchAdRequest[];
  trackingRequests: GoogleAdsTrackingRequest[];
}

export interface GoogleAdsAdapterSnapshotInit {
  payloadId: string;
  campaignModelId: string | null;
  adGroupModelId: string | null;
  rsaModelId: string | null;
  executionPlanId: string | null;
  resourceIds: readonly string[];
  createdAt: string;
  metadata?: GoogleAdsMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleAdsAdapter<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleAdsAdapter(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleAdsAdapter<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleAdsAdapter(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleAdsAdapter(inner)])) as T;
  }
  return value;
}

export function copyIdHolder(value: { id: string } | null | undefined): { id: string } | null {
  return value && typeof value.id === "string" ? { id: value.id } : null;
}

/** Builds a frozen snapshot from copies of the inputs. */
export function createGoogleAdsAdapterSnapshot(init: GoogleAdsAdapterSnapshotInit): GoogleAdsAdapterSnapshot {
  return freezeDeepGoogleAdsAdapter({
    payloadId: init.payloadId,
    campaignModelId: init.campaignModelId,
    adGroupModelId: init.adGroupModelId,
    rsaModelId: init.rsaModelId,
    executionPlanId: init.executionPlanId,
    resourceIds: [...init.resourceIds],
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsAdapter(init.metadata ?? {}),
  });
}
