/**
 * Host record domain: ad group resolver.
 *
 * Attaches default bid, optional target CPA, optional target ROAS, keywords,
 * negative keywords, audiences, devices, and bid strategy records to each ad
 * group spec. It also names duplicate ad groups and duplicate keywords. It
 * attaches and nothing else: invalid graphs are reported, never repaired.
 *
 * It does not reach an outside system, authenticate, or send a record. It
 * does not change the campaign model it reads.
 */
import type { GoogleAdsAudience, GoogleAdsBidStrategy, GoogleAdsKeyword, GoogleAdsMetadata, GoogleAdsNegativeKeyword } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import type {
  GoogleAdsAdGroupCampaignRef,
  GoogleAdsAdGroupNamedRecordSpec,
  GoogleAdsAdGroupSpec,
  GoogleAdsDefaultBid,
  GoogleAdsDevice,
  GoogleAdsKeywordSpec,
  GoogleAdsNegativeKeywordSpec,
  GoogleAdsTargetCpa,
  GoogleAdsTargetRoas,
} from "./google-ads-ad-group-snapshot";
import { copyPlainGoogleAdsAdGroup } from "./google-ads-ad-group-snapshot";
import { createGoogleAdsAdGroupValidator } from "./google-ads-ad-group-validator";

export interface GoogleAdsAdGroupResolveInput {
  campaignModel?: GoogleAdsAdGroupCampaignRef | null;
  adGroups: readonly GoogleAdsAdGroupSpec[];
  defaultBids?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  bidStrategies?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  targetCpas?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  targetRoas?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  keywords?: readonly GoogleAdsKeywordSpec[];
  negativeKeywords?: readonly GoogleAdsNegativeKeywordSpec[];
  audiences?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  devices?: readonly GoogleAdsAdGroupNamedRecordSpec[];
}

export interface GoogleAdsResolvedAdGroup {
  spec: GoogleAdsAdGroupSpec;
  defaultBid: GoogleAdsDefaultBid | null;
  targetCpa: GoogleAdsTargetCpa | null;
  targetRoas: GoogleAdsTargetRoas | null;
  keywords: GoogleAdsKeyword[];
  negativeKeywords: GoogleAdsNegativeKeyword[];
  audiences: GoogleAdsAudience[];
  devices: GoogleAdsDevice[];
  bidStrategy: GoogleAdsBidStrategy | null;
  warnings: string[];
}

export interface GoogleAdsAdGroupResolution {
  adGroups: GoogleAdsResolvedAdGroup[];
  issues: GoogleAdsIssue[];
  warnings: string[];
}

export interface GoogleAdsAdGroupResolver {
  resolve(input: GoogleAdsAdGroupResolveInput): GoogleAdsAdGroupResolution;
  detectDuplicates(adGroups: readonly GoogleAdsAdGroupSpec[], keywords?: readonly GoogleAdsKeywordSpec[]): GoogleAdsIssue[];
}

function catalogMap(records: readonly GoogleAdsAdGroupNamedRecordSpec[] | undefined): Map<string, GoogleAdsAdGroupNamedRecordSpec> {
  return new Map((records ?? []).map((item) => [item.id, item]));
}

function namedRecord(item: GoogleAdsAdGroupNamedRecordSpec): { id: string; name: string; metadata: GoogleAdsMetadata } {
  return copyPlainGoogleAdsAdGroup({ id: item.id, name: item.name, metadata: item.metadata ?? {} });
}

function campaignIdsOf(model: GoogleAdsAdGroupCampaignRef | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!model) return ids;
  for (const id of model.campaignIds ?? []) ids.add(id);
  for (const item of model.campaigns ?? []) ids.add(item.id);
  return ids;
}

function campaignBidOf(model: GoogleAdsAdGroupCampaignRef | null | undefined, campaignId: string): GoogleAdsBidStrategy | null {
  const item = model?.campaigns?.find((campaign) => campaign.id === campaignId);
  const bid = item?.bidStrategy;
  if (!bid || typeof bid.id !== "string") return null;
  return copyPlainGoogleAdsAdGroup({ id: bid.id, name: bid.name ?? bid.id, metadata: bid.metadata ?? {} });
}

function detectDuplicates(adGroups: readonly GoogleAdsAdGroupSpec[], keywords: readonly GoogleAdsKeywordSpec[] = []): GoogleAdsIssue[] {
  const validator = createGoogleAdsAdGroupValidator();
  return [...validator.validateGraph(adGroups.map((item) => item.id)), ...validator.validateKeywordGraph(keywords.map((item) => item.id))];
}

function resolve(input: GoogleAdsAdGroupResolveInput): GoogleAdsAdGroupResolution {
  const issues: GoogleAdsIssue[] = [...detectDuplicates(input.adGroups, input.keywords ?? [])];
  const listedCampaigns = campaignIdsOf(input.campaignModel);
  const defaultBids = catalogMap(input.defaultBids);
  const bidStrategies = catalogMap(input.bidStrategies);
  const targetCpas = catalogMap(input.targetCpas);
  const targetRoasRecords = catalogMap(input.targetRoas);
  const audiences = catalogMap(input.audiences);
  const devices = catalogMap(input.devices);
  const keywords = new Map((input.keywords ?? []).map((item) => [item.id, item]));
  const negatives = new Map((input.negativeKeywords ?? []).map((item) => [item.id, item]));
  const ordered = [...input.adGroups].sort((a, b) => a.id.localeCompare(b.id));
  const adGroups: GoogleAdsResolvedAdGroup[] = [];
  const warnings: string[] = [];

  for (const spec of ordered) {
    if (listedCampaigns.size > 0 && !listedCampaigns.has(spec.campaignId)) {
      issues.push({ field: "campaignId", message: `Duplicate Ad Group: ad group "${spec.id}" names campaign "${spec.campaignId}", which is not listed.` });
    }
    const defaultBidItem = defaultBids.get(spec.defaultBidId);
    if (!defaultBidItem) issues.push({ field: "defaultBidId", message: `Invalid Bid Strategy: ad group "${spec.id}" names default bid "${spec.defaultBidId}", which is not listed.` });
    const requestedBidId = spec.bidStrategyId;
    const catalogBid = requestedBidId ? bidStrategies.get(requestedBidId) : undefined;
    const campaignBid = campaignBidOf(input.campaignModel, spec.campaignId);
    let bidStrategy: GoogleAdsBidStrategy | null = null;
    if (requestedBidId) {
      if (catalogBid) bidStrategy = namedRecord(catalogBid);
      else if (campaignBid && campaignBid.id === requestedBidId) bidStrategy = campaignBid;
      else issues.push({ field: "bidStrategyId", message: `Invalid Bid Strategy: ad group "${spec.id}" names "${requestedBidId}", which is not listed.` });
    } else if (campaignBid) {
      bidStrategy = campaignBid;
    } else {
      issues.push({ field: "bidStrategyId", message: `Invalid Bid Strategy: ad group "${spec.id}" does not name a bid strategy.` });
    }

    let targetCpa: GoogleAdsTargetCpa | null = null;
    if (spec.targetCpaId) {
      const item = targetCpas.get(spec.targetCpaId);
      if (!item) issues.push({ field: "targetCpaId", message: `Invalid Bid Strategy: ad group "${spec.id}" names target CPA "${spec.targetCpaId}", which is not listed.` });
      else targetCpa = namedRecord(item);
    }
    let targetRoas: GoogleAdsTargetRoas | null = null;
    if (spec.targetRoasId) {
      const item = targetRoasRecords.get(spec.targetRoasId);
      if (!item) issues.push({ field: "targetRoasId", message: `Invalid Bid Strategy: ad group "${spec.id}" names target ROAS "${spec.targetRoasId}", which is not listed.` });
      else targetRoas = namedRecord(item);
    }

    const resolvedKeywords: GoogleAdsKeyword[] = [];
    for (const id of [...(spec.keywordIds ?? [])].sort()) {
      const item = keywords.get(id);
      if (!item) issues.push({ field: "keywordIds", message: `Duplicate Keyword: ad group "${spec.id}" names "${id}", which is not listed.` });
      else if (item.adGroupId !== spec.id) issues.push({ field: "keywords.adGroupId", message: `Duplicate Keyword: keyword "${id}" names ad group "${item.adGroupId}".` });
      else resolvedKeywords.push(copyPlainGoogleAdsAdGroup({ id: item.id, adGroupId: item.adGroupId, text: item.text, metadata: item.metadata ?? {} }));
    }
    const resolvedNegatives: GoogleAdsNegativeKeyword[] = [];
    for (const id of [...(spec.negativeKeywordIds ?? [])].sort()) {
      const item = negatives.get(id);
      if (!item) issues.push({ field: "negativeKeywordIds", message: `Duplicate Keyword: ad group "${spec.id}" names "${id}", which is not listed.` });
      else resolvedNegatives.push(copyPlainGoogleAdsAdGroup({ id: item.id, text: item.text, metadata: item.metadata ?? {} }));
    }
    const resolvedAudiences: GoogleAdsAudience[] = [];
    for (const id of [...(spec.audienceIds ?? [])].sort()) {
      const item = audiences.get(id);
      if (!item) issues.push({ field: "audienceIds", message: `Duplicate Ad Group: ad group "${spec.id}" names audience "${id}", which is not listed.` });
      else resolvedAudiences.push(namedRecord(item));
    }
    const resolvedDevices: GoogleAdsDevice[] = [];
    for (const id of [...(spec.deviceIds ?? [])].sort()) {
      const item = devices.get(id);
      if (!item) issues.push({ field: "deviceIds", message: `Duplicate Ad Group: ad group "${spec.id}" names device "${id}", which is not listed.` });
      else resolvedDevices.push(namedRecord(item));
    }

    const specWarnings = [...(spec.warnings ?? [])];
    warnings.push(...specWarnings);
    adGroups.push({
      spec: copyPlainGoogleAdsAdGroup(spec),
      defaultBid: defaultBidItem ? namedRecord(defaultBidItem) : null,
      targetCpa,
      targetRoas,
      keywords: resolvedKeywords,
      negativeKeywords: resolvedNegatives,
      audiences: resolvedAudiences,
      devices: resolvedDevices,
      bidStrategy,
      warnings: specWarnings,
    });
  }

  if (issues.length > 0) return { adGroups: [], issues, warnings: [] };
  return { adGroups, issues: [], warnings };
}

export function createGoogleAdsAdGroupResolver(): GoogleAdsAdGroupResolver {
  return {
    resolve,
    detectDuplicates,
  };
}
