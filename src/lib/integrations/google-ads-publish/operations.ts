/**
 * Mutate operations for one paused Search campaign.
 *
 * Search only. Every create status is PAUSED. Content network stays off.
 */
import { buildAdGroupMutateBody, buildRsaMutateBody } from "@/lib/google-ads-live/asset-builder";
import { buildCampaignMutateBody } from "@/lib/google-ads-live/campaign-operation-builder";
import type { SafePlan } from "./plan";

export type PausedMutateBody = {
  partialFailure: false;
  validateOnly: false;
  mutateOperations: Record<string, unknown>[];
};

function pausedSearchCampaign(plan: SafePlan): PausedMutateBody {
  const built = buildCampaignMutateBody(plan.customerId, {
    draftId: plan.draftId,
    name: plan.name,
    budgetName: plan.budgetName,
    status: "PAUSED",
    channelType: "SEARCH",
    amountMicros: plan.amountMicros,
    deliveryMethod: "STANDARD",
    bidding: "MANUAL_CPC",
    targetGoogleSearch: true,
    targetSearchNetwork: plan.searchPartners,
    targetContentNetwork: false,
  });
  const budget = built.mutateOperations[0];
  const created = built.mutateOperations[1].campaignOperation.create;
  const campaign = {
    resourceName: `customers/${plan.customerId}/campaigns/-2`,
    name: created.name,
    status: "PAUSED" as const,
    advertisingChannelType: "SEARCH" as const,
    campaignBudget: created.campaignBudget,
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: plan.searchPartners,
      targetContentNetwork: false,
    },
    containsEuPoliticalAdvertising: created.containsEuPoliticalAdvertising,
    ...(plan.bidding === "MAXIMIZE_CLICKS" ? { maximizeClicks: {} } : { manualCpc: {} }),
  };
  return {
    partialFailure: false,
    validateOnly: false,
    mutateOperations: [budget, { campaignOperation: { create: campaign } }],
  };
}

export function buildPausedSearchMutate(plan: SafePlan): PausedMutateBody | null {
  const customer = plan.customerId;
  const campaignName = `customers/${customer}/campaigns/-2`;
  const adGroupName = `customers/${customer}/adGroups/-3`;
  const campaign = pausedSearchCampaign(plan);
  const adGroup = buildAdGroupMutateBody(campaignName, {
    draftId: `${plan.draftId}-group`,
    name: plan.name,
    status: "PAUSED",
    type: "SEARCH_STANDARD",
    cpcBidMicros: plan.amountMicros,
  });
  const adGroupCreate: Record<string, unknown> = {
    ...adGroup.mutateOperations[0].adGroupOperation.create,
    resourceName: adGroupName,
  };
  if (plan.bidding === "MAXIMIZE_CLICKS") delete adGroupCreate.cpcBidMicros;
  const rsa = buildRsaMutateBody(adGroupName, {
    draftId: `${plan.draftId}-rsa`,
    status: "PAUSED",
    headlines: plan.headlines.map((text) => ({ text, pinnedField: null })),
    descriptions: plan.descriptions.map((text) => ({ text, pinnedField: null })),
    finalUrls: [plan.finalUrl],
    path1: "",
    path2: "",
  });
  const operations: Record<string, unknown>[] = [
    ...campaign.mutateOperations,
    { adGroupOperation: { create: adGroupCreate } },
    rsa.mutateOperations[0],
  ];
  for (const keyword of plan.keywords) {
    operations.push({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupName,
          status: "PAUSED",
          negative: keyword.negative,
          keyword: { text: keyword.text, matchType: keyword.matchType },
        },
      },
    });
  }
  operations.push({
    campaignCriterionOperation: {
      create: {
        campaign: campaignName,
        status: "PAUSED",
        location: { geoTargetConstant: `geoTargetConstants/${plan.countryConstant}` },
      },
    },
  });
  operations.push({
    campaignCriterionOperation: {
      create: {
        campaign: campaignName,
        status: "PAUSED",
        language: { languageConstant: `languageConstants/${plan.languageConstant}` },
      },
    },
  });
  let assetSerial = 10;
  const linkAsset = (fieldType: string) => {
    const resource = `customers/${customer}/assets/-${assetSerial}`;
    assetSerial += 1;
    operations.push({
      campaignAssetOperation: {
        create: { campaign: campaignName, asset: resource, fieldType, status: "PAUSED" },
      },
    });
    return resource;
  };
  for (const sitelink of plan.sitelinks) {
    const resource = `customers/${customer}/assets/-${assetSerial}`;
    operations.push({
      assetOperation: {
        create: {
          resourceName: resource,
          finalUrls: [plan.finalUrl],
          sitelinkAsset: { linkText: sitelink.text },
        },
      },
    });
    linkAsset("SITELINK");
  }
  for (const callout of plan.callouts) {
    const resource = `customers/${customer}/assets/-${assetSerial}`;
    operations.push({
      assetOperation: { create: { resourceName: resource, calloutAsset: { calloutText: callout.text } } },
    });
    linkAsset("CALLOUT");
  }
  for (const snippet of plan.snippets) {
    const resource = `customers/${customer}/assets/-${assetSerial}`;
    operations.push({
      assetOperation: {
        create: {
          resourceName: resource,
          structuredSnippetAsset: { header: snippet.header, values: snippet.values },
        },
      },
    });
    linkAsset("STRUCTURED_SNIPPET");
  }
  const body: PausedMutateBody = { partialFailure: false, validateOnly: false, mutateOperations: operations };
  if (!pausedPayload(body)) return null;
  return body;
}

export function pausedPayload(body: unknown): boolean {
  const text = JSON.stringify(body);
  if (/"status":"ENABLED"/.test(text)) return false;
  if (/"advertisingChannelType":"(?:PERFORMANCE_MAX|SHOPPING|DISPLAY)"/.test(text)) return false;
  if (!text.includes('"advertisingChannelType":"SEARCH"')) return false;
  if (!text.includes('"status":"PAUSED"')) return false;
  if (text.includes('"targetContentNetwork":true')) return false;
  return true;
}
