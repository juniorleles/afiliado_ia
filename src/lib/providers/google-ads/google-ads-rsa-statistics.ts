/**
 * Host record domain: responsive search ad statistics.
 *
 * Pure counters derived from a built RSA model. It never changes a record,
 * never reaches an outside system, and never names a scale.
 */
import type { GoogleAdsBuiltRsa } from "./google-ads-rsa-snapshot";

export interface GoogleAdsRsaStatistics {
  rsaCount: number;
  headlineCount: number;
  descriptionCount: number;
  finalUrlCount: number;
  displayPathCount: number;
  trackingTemplateCount: number;
  urlSuffixCount: number;
  pinnedAssetCount: number;
  warningCount: number;
  contractCount: number;
}

export interface GoogleAdsRsaStatisticsExtras {
  warningCount?: number;
  contractCount?: number;
}

function uniqueCount(ids: readonly string[]): number {
  return new Set(ids).size;
}

export function computeGoogleAdsRsaStatistics(ads: readonly GoogleAdsBuiltRsa[], extras: GoogleAdsRsaStatisticsExtras = {}): GoogleAdsRsaStatistics {
  return {
    rsaCount: ads.length,
    headlineCount: uniqueCount(ads.flatMap((item) => item.headlines.map((headline) => headline.id))),
    descriptionCount: uniqueCount(ads.flatMap((item) => item.descriptions.map((description) => description.id))),
    finalUrlCount: uniqueCount(ads.map((item) => item.finalUrl.id)),
    displayPathCount: uniqueCount(ads.flatMap((item) => (item.displayPath ? [item.displayPath.id] : []))),
    trackingTemplateCount: uniqueCount(ads.flatMap((item) => (item.trackingTemplate ? [item.trackingTemplate.id] : []))),
    urlSuffixCount: uniqueCount(ads.flatMap((item) => (item.urlSuffix ? [item.urlSuffix.id] : []))),
    pinnedAssetCount: uniqueCount(ads.flatMap((item) => item.pinnedAssets.map((asset) => asset.id))),
    warningCount: extras.warningCount ?? 0,
    contractCount: extras.contractCount ?? 0,
  };
}
