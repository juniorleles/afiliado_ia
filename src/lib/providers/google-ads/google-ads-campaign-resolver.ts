/**
 * Host record domain: campaign resolver.
 *
 * Attaches budget, settings, network, locations, languages, schedule, and bid
 * strategy records to each campaign spec. It also names duplicate campaigns
 * and missing required records. It attaches and nothing else: invalid graphs
 * are reported, never repaired.
 *
 * It does not reach an outside system, authenticate, or send a record.
 */
import type { GoogleAdsBidStrategy, GoogleAdsCampaignBudget, GoogleAdsCampaignSettings, GoogleAdsLanguage, GoogleAdsLocation, GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import type {
  GoogleAdsCampaignNetwork,
  GoogleAdsCampaignSchedule,
  GoogleAdsCampaignSpec,
  GoogleAdsNamedRecordSpec,
  GoogleAdsSettingsSpec,
} from "./google-ads-campaign-snapshot";
import { copyPlainGoogleAdsCampaign } from "./google-ads-campaign-snapshot";
import { createGoogleAdsCampaignValidator } from "./google-ads-campaign-validator";

export interface GoogleAdsCampaignResolveInput {
  campaigns: readonly GoogleAdsCampaignSpec[];
  budgets?: readonly GoogleAdsNamedRecordSpec[];
  settings?: readonly GoogleAdsSettingsSpec[];
  networks?: readonly GoogleAdsNamedRecordSpec[];
  locations?: readonly GoogleAdsNamedRecordSpec[];
  languages?: readonly GoogleAdsNamedRecordSpec[];
  schedules?: readonly GoogleAdsNamedRecordSpec[];
  bidStrategies?: readonly GoogleAdsNamedRecordSpec[];
}

export interface GoogleAdsResolvedCampaign {
  spec: GoogleAdsCampaignSpec;
  budget: GoogleAdsCampaignBudget | null;
  settings: GoogleAdsCampaignSettings | null;
  network: GoogleAdsCampaignNetwork | null;
  locations: GoogleAdsLocation[];
  languages: GoogleAdsLanguage[];
  schedule: GoogleAdsCampaignSchedule | null;
  bidStrategy: GoogleAdsBidStrategy | null;
  warnings: string[];
}

export interface GoogleAdsCampaignResolution {
  campaigns: GoogleAdsResolvedCampaign[];
  issues: GoogleAdsIssue[];
  warnings: string[];
}

export interface GoogleAdsCampaignResolver {
  resolve(input: GoogleAdsCampaignResolveInput): GoogleAdsCampaignResolution;
  detectDuplicates(campaigns: readonly GoogleAdsCampaignSpec[]): GoogleAdsIssue[];
}

function catalogMap(records: readonly GoogleAdsNamedRecordSpec[] | undefined): Map<string, GoogleAdsNamedRecordSpec> {
  return new Map((records ?? []).map((item) => [item.id, item]));
}

function namedRecord(item: GoogleAdsNamedRecordSpec): { id: string; name: string; metadata: GoogleAdsMetadata } {
  return copyPlainGoogleAdsCampaign({ id: item.id, name: item.name, metadata: item.metadata ?? {} });
}

function detectDuplicates(campaigns: readonly GoogleAdsCampaignSpec[]): GoogleAdsIssue[] {
  return createGoogleAdsCampaignValidator().validateGraph(campaigns.map((item) => item.id));
}

function resolve(input: GoogleAdsCampaignResolveInput): GoogleAdsCampaignResolution {
  const issues: GoogleAdsIssue[] = [...detectDuplicates(input.campaigns)];
  const budgets = catalogMap(input.budgets);
  const networks = catalogMap(input.networks);
  const locations = catalogMap(input.locations);
  const languages = catalogMap(input.languages);
  const schedules = catalogMap(input.schedules);
  const bidStrategies = catalogMap(input.bidStrategies);
  const settings = new Map((input.settings ?? []).map((item) => [item.id, item]));
  const ordered = [...input.campaigns].sort((a, b) => a.id.localeCompare(b.id));
  const campaigns: GoogleAdsResolvedCampaign[] = [];
  const warnings: string[] = [];

  for (const spec of ordered) {
    const budgetItem = budgets.get(spec.budgetId);
    if (!budgetItem) issues.push({ field: "budgetId", message: `Missing Budget: campaign "${spec.id}" names "${spec.budgetId}", which is not listed.` });
    const bidItem = bidStrategies.get(spec.bidStrategyId);
    if (!bidItem) issues.push({ field: "bidStrategyId", message: `Missing Bid Strategy: campaign "${spec.id}" names "${spec.bidStrategyId}", which is not listed.` });
    const settingsItem = settings.get(spec.settingsId);
    if (!settingsItem) {
      issues.push({ field: "settingsId", message: `Invalid Settings: campaign "${spec.id}" names "${spec.settingsId}", which is not listed.` });
    } else if (settingsItem.campaignId !== spec.id) {
      issues.push({ field: "settings.campaignId", message: `Invalid Settings: settings "${settingsItem.id}" names campaign "${settingsItem.campaignId}".` });
    }
    const networkItem = networks.get(spec.networkId);
    if (!networkItem) issues.push({ field: "networkId", message: `Invalid Campaign: campaign "${spec.id}" names network "${spec.networkId}", which is not listed.` });
    const scheduleItem = schedules.get(spec.scheduleId);
    if (!scheduleItem) issues.push({ field: "scheduleId", message: `Invalid Campaign: campaign "${spec.id}" names schedule "${spec.scheduleId}", which is not listed.` });

    const resolvedLocations: GoogleAdsLocation[] = [];
    for (const id of [...(spec.locationIds ?? [])].sort()) {
      const item = locations.get(id);
      if (!item) issues.push({ field: "locationIds", message: `Invalid Campaign: campaign "${spec.id}" names location "${id}", which is not listed.` });
      else resolvedLocations.push(namedRecord(item));
    }
    const resolvedLanguages: GoogleAdsLanguage[] = [];
    for (const id of [...(spec.languageIds ?? [])].sort()) {
      const item = languages.get(id);
      if (!item) issues.push({ field: "languageIds", message: `Invalid Campaign: campaign "${spec.id}" names language "${id}", which is not listed.` });
      else resolvedLanguages.push(namedRecord(item));
    }

    const specWarnings = [...(spec.warnings ?? [])];
    warnings.push(...specWarnings);
    campaigns.push({
      spec: copyPlainGoogleAdsCampaign(spec),
      budget: budgetItem ? namedRecord(budgetItem) : null,
      settings: settingsItem
        ? copyPlainGoogleAdsCampaign({ id: settingsItem.id, campaignId: settingsItem.campaignId, metadata: settingsItem.metadata ?? {} })
        : null,
      network: networkItem ? namedRecord(networkItem) : null,
      locations: resolvedLocations,
      languages: resolvedLanguages,
      schedule: scheduleItem ? namedRecord(scheduleItem) : null,
      bidStrategy: bidItem ? namedRecord(bidItem) : null,
      warnings: specWarnings,
    });
  }

  if (issues.length > 0) return { campaigns: [], issues, warnings: [] };
  return { campaigns, issues: [], warnings };
}

export function createGoogleAdsCampaignResolver(): GoogleAdsCampaignResolver {
  return {
    resolve,
    detectDuplicates,
  };
}
