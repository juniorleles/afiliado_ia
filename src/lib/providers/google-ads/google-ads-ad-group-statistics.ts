/**
 * Host record domain: ad group statistics.
 *
 * Pure counters derived from a built ad group model. It never changes a
 * record, never reaches an outside system, and never names a scale.
 */
import type { GoogleAdsBuiltAdGroup } from "./google-ads-ad-group-snapshot";

export interface GoogleAdsAdGroupStatistics {
  adGroupCount: number;
  keywordCount: number;
  negativeKeywordCount: number;
  audienceCount: number;
  deviceCount: number;
  defaultBidCount: number;
  targetCpaCount: number;
  targetRoasCount: number;
  warningCount: number;
  contractCount: number;
}

export interface GoogleAdsAdGroupStatisticsExtras {
  warningCount?: number;
  contractCount?: number;
}

function uniqueCount(ids: readonly string[]): number {
  return new Set(ids).size;
}

export function computeGoogleAdsAdGroupStatistics(
  adGroups: readonly GoogleAdsBuiltAdGroup[],
  extras: GoogleAdsAdGroupStatisticsExtras = {},
): GoogleAdsAdGroupStatistics {
  return {
    adGroupCount: adGroups.length,
    keywordCount: uniqueCount(adGroups.flatMap((item) => item.keywords.map((keyword) => keyword.id))),
    negativeKeywordCount: uniqueCount(adGroups.flatMap((item) => item.negativeKeywords.map((keyword) => keyword.id))),
    audienceCount: uniqueCount(adGroups.flatMap((item) => item.audiences.map((audience) => audience.id))),
    deviceCount: uniqueCount(adGroups.flatMap((item) => item.devices.map((device) => device.id))),
    defaultBidCount: uniqueCount(adGroups.map((item) => item.defaultBid.id)),
    targetCpaCount: uniqueCount(adGroups.flatMap((item) => (item.targetCpa ? [item.targetCpa.id] : []))),
    targetRoasCount: uniqueCount(adGroups.flatMap((item) => (item.targetRoas ? [item.targetRoas.id] : []))),
    warningCount: extras.warningCount ?? 0,
    contractCount: extras.contractCount ?? 0,
  };
}
