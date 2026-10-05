/**
 * Host record domain: adapter mapper.
 *
 * Maps a read-only campaign model, ad group model, and RSA model into request
 * records. It names invalid mappings and missing required fields. It maps and
 * nothing else: invalid graphs are reported, never repaired.
 *
 * It does not reach an outside system, authenticate, or send a request. It
 * does not change the models it reads.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsMetadata } from "./google-ads-types";
import type {
  GoogleAdsAdGroupRequest,
  GoogleAdsCampaignBudgetRequest,
  GoogleAdsCampaignRequest,
  GoogleAdsCampaignSettingsRequest,
  GoogleAdsKeywordRequest,
  GoogleAdsMappedRequests,
  GoogleAdsResponsiveSearchAdRequest,
  GoogleAdsTrackingRequest,
} from "./google-ads-adapter-snapshot";
import { copyPlainGoogleAdsAdapter } from "./google-ads-adapter-snapshot";
import { createGoogleAdsValidationAdapter, isFlatGoogleAdsAdapterMetadata } from "./google-ads-adapter-validator";

export interface GoogleAdsMapperInput {
  campaignModel?: { id?: string; campaigns?: readonly unknown[]; metadata?: GoogleAdsMetadata } | null;
  adGroupModel?: { id?: string; adGroups?: readonly unknown[]; metadata?: GoogleAdsMetadata } | null;
  responsiveSearchAds?: { id?: string; responsiveSearchAds?: readonly unknown[] } | readonly unknown[] | null;
}

export interface GoogleAdsMappedResult {
  mapping: GoogleAdsMappedRequests;
  issues: GoogleAdsIssue[];
}

export interface GoogleAdsMapper {
  map(input: GoogleAdsMapperInput): GoogleAdsMappedResult;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

function metadataOf(value: unknown): GoogleAdsMetadata {
  if (isPlainRecord(value) && isFlatGoogleAdsAdapterMetadata(value.metadata)) return copyPlainGoogleAdsAdapter(value.metadata);
  return {};
}

function listOf(model: unknown, key: string): unknown[] {
  if (Array.isArray(model)) return model;
  if (isPlainRecord(model) && Array.isArray(model[key])) return model[key] as unknown[];
  return [];
}

function namedId(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  return idOf(value);
}

function textOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (isPlainRecord(value) && typeof value.text === "string" && value.text.trim() !== "") return value.text;
  if (isPlainRecord(value) && typeof value.url === "string" && value.url.trim() !== "") return value.url;
  if (isPlainRecord(value) && typeof value.name === "string" && value.name.trim() !== "") return value.name;
  return null;
}

export function createGoogleAdsMapper(): GoogleAdsMapper {
  return {
    map(input) {
      const issues: GoogleAdsIssue[] = [];
      const campaignIds = new Set<string>();
      const adGroupIds = new Set<string>();
      const campaignRequests: GoogleAdsCampaignRequest[] = [];
      const campaignBudgetRequests: GoogleAdsCampaignBudgetRequest[] = [];
      const campaignSettingsRequests: GoogleAdsCampaignSettingsRequest[] = [];
      const adGroupRequests: GoogleAdsAdGroupRequest[] = [];
      const keywordRequests: GoogleAdsKeywordRequest[] = [];
      const responsiveSearchAdRequests: GoogleAdsResponsiveSearchAdRequest[] = [];
      const trackingRequests: GoogleAdsTrackingRequest[] = [];

      const campaigns = [...listOf(input.campaignModel, "campaigns")].sort((a, b) => (idOf(a) ?? "").localeCompare(idOf(b) ?? ""));
      for (const item of campaigns) {
        const id = idOf(item);
        if (!id) {
          issues.push({ field: "campaigns", message: "Invalid Mapping: a campaign id is required." });
          continue;
        }
        if (!isPlainRecord(item)) {
          issues.push({ field: "campaigns", message: "Invalid Mapping: a campaign record must be an object." });
          continue;
        }
        const name = typeof item.name === "string" ? item.name : "";
        if (name.trim() === "") issues.push({ field: "campaigns.name", message: `Missing Required Fields: campaign "${id}" has no name.` });
        const budgetId = namedId(item.budget) ?? (typeof item.budgetId === "string" ? item.budgetId : null);
        const settingsId = namedId(item.settings) ?? (typeof item.settingsId === "string" ? item.settingsId : null);
        if (!budgetId) issues.push({ field: "campaigns.budget", message: `Missing Required Fields: campaign "${id}" has no budget.` });
        if (!settingsId) issues.push({ field: "campaigns.settings", message: `Missing Required Fields: campaign "${id}" has no settings.` });
        if (item.metadata !== undefined && !isFlatGoogleAdsAdapterMetadata(item.metadata)) {
          issues.push({ field: "campaigns.metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." });
        }
        campaignIds.add(id);
        campaignRequests.push({
          resource: "campaign",
          id,
          name,
          budgetId: budgetId ?? "",
          settingsId: settingsId ?? "",
          metadata: metadataOf(item),
        });
        if (isPlainRecord(item.budget) && budgetId) {
          campaignBudgetRequests.push({
            resource: "campaignBudget",
            id: budgetId,
            name: textOf(item.budget) ?? budgetId,
            metadata: metadataOf(item.budget),
          });
        }
        if (isPlainRecord(item.settings) && settingsId) {
          campaignSettingsRequests.push({
            resource: "campaignSettings",
            id: settingsId,
            campaignId: typeof item.settings.campaignId === "string" ? item.settings.campaignId : id,
            metadata: metadataOf(item.settings),
          });
        }
      }

      const adGroups = [...listOf(input.adGroupModel, "adGroups")].sort((a, b) => (idOf(a) ?? "").localeCompare(idOf(b) ?? ""));
      for (const item of adGroups) {
        const id = idOf(item);
        if (!id) {
          issues.push({ field: "adGroups", message: "Invalid Mapping: an ad group id is required." });
          continue;
        }
        if (!isPlainRecord(item)) continue;
        const campaignId = typeof item.campaignId === "string" ? item.campaignId : "";
        if (!campaignId) issues.push({ field: "adGroups.campaignId", message: `Missing Required Fields: ad group "${id}" has no campaign id.` });
        else if (campaignIds.size > 0 && !campaignIds.has(campaignId)) {
          issues.push({ field: "adGroups.campaignId", message: `Invalid Mapping: ad group "${id}" names campaign "${campaignId}", which is not listed.` });
        }
        const name = typeof item.name === "string" ? item.name : "";
        if (name.trim() === "") issues.push({ field: "adGroups.name", message: `Missing Required Fields: ad group "${id}" has no name.` });
        adGroupIds.add(id);
        adGroupRequests.push({ resource: "adGroup", id, campaignId, name, metadata: metadataOf(item) });
        const keywords = Array.isArray(item.keywords) ? item.keywords : [];
        for (const keyword of [...keywords].sort((a, b) => (idOf(a) ?? "").localeCompare(idOf(b) ?? ""))) {
          const keywordId = idOf(keyword);
          if (!keywordId) {
            issues.push({ field: "keywords", message: "Invalid Mapping: a keyword id is required." });
            continue;
          }
          const text = textOf(keyword) ?? "";
          if (text.trim() === "") issues.push({ field: "keywords.text", message: `Missing Required Fields: keyword "${keywordId}" has no text.` });
          keywordRequests.push({ resource: "keyword", id: keywordId, adGroupId: id, text, metadata: metadataOf(keyword) });
        }
      }

      const ads = [...listOf(input.responsiveSearchAds, "responsiveSearchAds")].sort((a, b) => (idOf(a) ?? "").localeCompare(idOf(b) ?? ""));
      for (const item of ads) {
        const id = idOf(item);
        if (!id) {
          issues.push({ field: "responsiveSearchAds", message: "Invalid Mapping: an RSA id is required." });
          continue;
        }
        if (!isPlainRecord(item)) continue;
        const adGroupId = typeof item.adGroupId === "string" ? item.adGroupId : "";
        if (!adGroupId) issues.push({ field: "responsiveSearchAds.adGroupId", message: `Missing Required Fields: RSA "${id}" has no ad group id.` });
        else if (adGroupIds.size > 0 && !adGroupIds.has(adGroupId)) {
          issues.push({ field: "responsiveSearchAds.adGroupId", message: `Invalid Mapping: RSA "${id}" names ad group "${adGroupId}", which is not listed.` });
        }
        const headlines = Array.isArray(item.headlines) ? item.headlines.map((headline) => textOf(headline) ?? "").filter(Boolean) : [];
        const descriptions = Array.isArray(item.descriptions) ? item.descriptions.map((description) => textOf(description) ?? "").filter(Boolean) : [];
        if (headlines.length === 0) issues.push({ field: "responsiveSearchAds.headlines", message: `Missing Required Fields: RSA "${id}" has no headlines.` });
        if (descriptions.length === 0) issues.push({ field: "responsiveSearchAds.descriptions", message: `Missing Required Fields: RSA "${id}" has no descriptions.` });
        const finalUrl = isPlainRecord(item.finalUrl) && typeof item.finalUrl.url === "string" ? item.finalUrl.url : typeof item.finalUrl === "string" ? item.finalUrl : "";
        if (finalUrl.trim() === "") issues.push({ field: "responsiveSearchAds.finalUrl", message: `Missing Required Fields: RSA "${id}" has no final URL.` });
        responsiveSearchAdRequests.push({
          resource: "responsiveSearchAd",
          id,
          adGroupId,
          headlines,
          descriptions,
          finalUrl,
          metadata: metadataOf(item),
        });
        const trackingText = textOf(item.trackingTemplate);
        if (trackingText) {
          trackingRequests.push({
            resource: "tracking",
            id: idOf(item.trackingTemplate) ?? `tracking-${id}`,
            rsaId: id,
            text: trackingText,
            metadata: metadataOf(item.trackingTemplate),
          });
        }
      }

      const mapping: GoogleAdsMappedRequests = {
        campaignRequests,
        campaignBudgetRequests,
        campaignSettingsRequests,
        adGroupRequests,
        keywordRequests,
        responsiveSearchAdRequests,
        trackingRequests,
      };
      const mappingIssues = createGoogleAdsValidationAdapter().validateMapping(mapping);
      issues.push(...mappingIssues);
      if (issues.length > 0) {
        return {
          mapping: {
            campaignRequests: [],
            campaignBudgetRequests: [],
            campaignSettingsRequests: [],
            adGroupRequests: [],
            keywordRequests: [],
            responsiveSearchAdRequests: [],
            trackingRequests: [],
          },
          issues,
        };
      }
      return { mapping, issues: [] };
    },
  };
}
