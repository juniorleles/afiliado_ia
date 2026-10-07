/**
 * Host record domain: adapter request builder.
 *
 * Assembles mapped request records into one immutable payload. It does not
 * reach an outside system, authenticate, or send a request.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsMappedRequests, GoogleAdsRequestPayload } from "./google-ads-adapter-snapshot";
import { copyPlainGoogleAdsAdapter, freezeDeepGoogleAdsAdapter } from "./google-ads-adapter-snapshot";

export interface GoogleAdsRequestBuilderInit {
  id: string;
  campaignModelId: string | null;
  adGroupModelId: string | null;
  rsaModelId: string | null;
  executionPlanId: string | null;
  executionContractIds: readonly string[];
  mapping: GoogleAdsMappedRequests;
  metadata?: GoogleAdsMetadata;
  executionTime: number;
  createdAt: string;
}

export interface GoogleAdsRequestBuilder {
  build(init: GoogleAdsRequestBuilderInit): GoogleAdsRequestPayload;
}

export function createGoogleAdsRequestBuilder(): GoogleAdsRequestBuilder {
  return {
    build(init) {
      return freezeDeepGoogleAdsAdapter({
        id: init.id,
        campaignModelId: init.campaignModelId,
        adGroupModelId: init.adGroupModelId,
        rsaModelId: init.rsaModelId,
        executionPlanId: init.executionPlanId,
        executionContractIds: [...init.executionContractIds],
        campaignRequests: copyPlainGoogleAdsAdapter(init.mapping.campaignRequests),
        campaignBudgetRequests: copyPlainGoogleAdsAdapter(init.mapping.campaignBudgetRequests),
        campaignSettingsRequests: copyPlainGoogleAdsAdapter(init.mapping.campaignSettingsRequests),
        adGroupRequests: copyPlainGoogleAdsAdapter(init.mapping.adGroupRequests),
        keywordRequests: copyPlainGoogleAdsAdapter(init.mapping.keywordRequests),
        responsiveSearchAdRequests: copyPlainGoogleAdsAdapter(init.mapping.responsiveSearchAdRequests),
        trackingRequests: copyPlainGoogleAdsAdapter(init.mapping.trackingRequests),
        metadata: copyPlainGoogleAdsAdapter(init.metadata ?? {}),
        executionTime: init.executionTime,
        createdAt: init.createdAt,
      });
    },
  };
}
