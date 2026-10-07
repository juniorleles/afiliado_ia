/**
 * Host record domain: named shapes a later host may describe.
 *
 * Architecture only. This module names the records a later host will hold. It
 * does not reach an outside system, authenticate, send a record, or change an
 * execution plan. Other engines are referred to by id only. A model never
 * copies or changes an execution contract or an execution plan.
 */

/** Flat metadata: strings, numbers, booleans, or null. */
export type GoogleAdsMetadata = Record<string, string | number | boolean | null>;

/** Fields one campaign record carries. */
export const GOOGLE_ADS_CAMPAIGN_KEYS = ["id", "name", "budgetId", "settingsId", "metadata"] as const;

/** One named campaign record. The architecture does not send it. */
export interface GoogleAdsCampaign {
  id: string;
  name: string;
  budgetId: string;
  settingsId: string;
  metadata: GoogleAdsMetadata;
}

/** One named budget record. Restated, never judged. */
export interface GoogleAdsCampaignBudget {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named settings record. Restated, never judged. */
export interface GoogleAdsCampaignSettings {
  id: string;
  campaignId: string;
  metadata: GoogleAdsMetadata;
}

/** One named group of creatives and terms. */
export interface GoogleAdsAdGroup {
  id: string;
  campaignId: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named search term. The architecture does not send it. */
export interface GoogleAdsKeyword {
  id: string;
  adGroupId: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

/** One named excluded term. The architecture does not send it. */
export interface GoogleAdsNegativeKeyword {
  id: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

/** One named responsive search record. The architecture does not send it. */
export interface GoogleAdsResponsiveSearchAd {
  id: string;
  adGroupId: string;
  headlineIds: string[];
  descriptionIds: string[];
  finalUrlId: string;
  trackingTemplateId: string;
  metadata: GoogleAdsMetadata;
}

/** One named headline line. */
export interface GoogleAdsHeadline {
  id: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

/** One named description line. */
export interface GoogleAdsDescription {
  id: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

/** One named destination. Restated, never opened. */
export interface GoogleAdsFinalUrl {
  id: string;
  url: string;
  metadata: GoogleAdsMetadata;
}

/** One named tracking template. Restated, never opened. */
export interface GoogleAdsTrackingTemplate {
  id: string;
  text: string;
  metadata: GoogleAdsMetadata;
}

/** One named audience record. */
export interface GoogleAdsAudience {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named location record. */
export interface GoogleAdsLocation {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named language record. */
export interface GoogleAdsLanguage {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named bid strategy record. Restated, never judged. */
export interface GoogleAdsBidStrategy {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named asset record. */
export interface GoogleAdsAsset {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named extension record. */
export interface GoogleAdsExtension {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** One named conversion goal. Restated, never judged. */
export interface GoogleAdsConversionGoal {
  id: string;
  name: string;
  metadata: GoogleAdsMetadata;
}

/** Fields one host model carries. */
export const GOOGLE_ADS_MODEL_KEYS = [
  "id",
  "executionContractId",
  "executionPlanId",
  "campaigns",
  "budgets",
  "settings",
  "adGroups",
  "keywords",
  "negativeKeywords",
  "responsiveSearchAds",
  "headlines",
  "descriptions",
  "finalUrls",
  "trackingTemplates",
  "audiences",
  "locations",
  "languages",
  "bidStrategies",
  "assets",
  "extensions",
  "conversionGoals",
  "metadata",
] as const;

/** One immutable host model. The architecture does not send it. */
export interface GoogleAdsModel {
  id: string;
  /** The execution contract this model reads. A reference only. */
  executionContractId: string | null;
  /** The execution plan this model reads. A reference only. */
  executionPlanId: string | null;
  campaigns: GoogleAdsCampaign[];
  budgets: GoogleAdsCampaignBudget[];
  settings: GoogleAdsCampaignSettings[];
  adGroups: GoogleAdsAdGroup[];
  keywords: GoogleAdsKeyword[];
  negativeKeywords: GoogleAdsNegativeKeyword[];
  responsiveSearchAds: GoogleAdsResponsiveSearchAd[];
  headlines: GoogleAdsHeadline[];
  descriptions: GoogleAdsDescription[];
  finalUrls: GoogleAdsFinalUrl[];
  trackingTemplates: GoogleAdsTrackingTemplate[];
  audiences: GoogleAdsAudience[];
  locations: GoogleAdsLocation[];
  languages: GoogleAdsLanguage[];
  bidStrategies: GoogleAdsBidStrategy[];
  assets: GoogleAdsAsset[];
  extensions: GoogleAdsExtension[];
  conversionGoals: GoogleAdsConversionGoal[];
  metadata: GoogleAdsMetadata;
}
