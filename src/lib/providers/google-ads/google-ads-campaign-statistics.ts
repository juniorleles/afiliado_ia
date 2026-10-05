/**
 * Host record domain: campaign statistics.
 *
 * Pure counters derived from a built campaign model. It never changes a
 * record, never reaches an outside system, and never names a scale.
 */
import type { GoogleAdsBuiltCampaign } from "./google-ads-campaign-snapshot";

export interface GoogleAdsCampaignStatistics {
  campaignCount: number;
  budgetCount: number;
  settingsCount: number;
  networkCount: number;
  locationCount: number;
  languageCount: number;
  scheduleCount: number;
  bidStrategyCount: number;
  warningCount: number;
  contractCount: number;
}

export interface GoogleAdsCampaignStatisticsExtras {
  warningCount?: number;
  contractCount?: number;
}

function uniqueCount(ids: readonly string[]): number {
  return new Set(ids).size;
}

export function computeGoogleAdsCampaignStatistics(
  campaigns: readonly GoogleAdsBuiltCampaign[],
  extras: GoogleAdsCampaignStatisticsExtras = {},
): GoogleAdsCampaignStatistics {
  return {
    campaignCount: campaigns.length,
    budgetCount: uniqueCount(campaigns.map((item) => item.budget.id)),
    settingsCount: uniqueCount(campaigns.map((item) => item.settings.id)),
    networkCount: uniqueCount(campaigns.map((item) => item.network.id)),
    locationCount: uniqueCount(campaigns.flatMap((item) => item.locations.map((location) => location.id))),
    languageCount: uniqueCount(campaigns.flatMap((item) => item.languages.map((language) => language.id))),
    scheduleCount: uniqueCount(campaigns.map((item) => item.schedule.id)),
    bidStrategyCount: uniqueCount(campaigns.map((item) => item.bidStrategy.id)),
    warningCount: extras.warningCount ?? 0,
    contractCount: extras.contractCount ?? 0,
  };
}
