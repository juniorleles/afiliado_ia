/**
 * Host record domain: resource reader.
 *
 * Reads campaign, budget, label, ad group, ad, and change rows. Every
 * request is a search. The grant is placed on the request and is not returned.
 */
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, googleAdsRequestHeaders, googleAdsRoot, isGoogleAuthRecord, parseGoogleAuthJson, type GoogleAuthTransport } from "./google-auth-client";
import type { CampaignSyncIssue } from "./campaign-sync-snapshot";

export const MAX_READ_PAGES = 10;

const CAMPAIGN_QUERY = "SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.resource_name, campaign_budget.resource_name, campaign_budget.name, campaign_budget.amount_micros, campaign_budget.status FROM campaign WHERE campaign.resource_name = ";
const LABEL_QUERY = "SELECT label.resource_name, label.id, label.name, campaign.resource_name FROM campaign_label WHERE campaign.resource_name = ";
const AD_GROUP_QUERY = "SELECT ad_group.resource_name, ad_group.id, ad_group.name, ad_group.status, campaign.resource_name FROM ad_group WHERE campaign.resource_name = ";
const AD_QUERY = "SELECT ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group.resource_name, campaign.resource_name FROM ad_group_ad WHERE campaign.resource_name = ";
const CHANGE_QUERY = "SELECT change_status.last_change_date_time, change_status.campaign, change_status.resource_type FROM change_status WHERE change_status.resource_type = 'CAMPAIGN' AND change_status.last_change_date_time DURING LAST_14_DAYS AND change_status.campaign = ";

export interface ResourceRows {
  rows: Record<string, unknown>[];
  requestCount: number;
}

export type ResourceReadResult =
  | { ok: true; read: ResourceRows }
  | { ok: false; issues: CampaignSyncIssue[] };

function quoted(resourceName: string): string {
  return `'${resourceName}'`;
}

export function campaignReadQuery(resourceName: string): string {
  return `${CAMPAIGN_QUERY}${quoted(resourceName)}`;
}

export function labelReadQuery(resourceName: string): string {
  return `${LABEL_QUERY}${quoted(resourceName)}`;
}

export function adGroupReadQuery(resourceName: string): string {
  return `${AD_GROUP_QUERY}${quoted(resourceName)}`;
}

export function adReadQuery(resourceName: string): string {
  return `${AD_QUERY}${quoted(resourceName)}`;
}

export function changeReadQuery(resourceName: string): string {
  return `${CHANGE_QUERY}${quoted(resourceName)} LIMIT 1000`;
}

function requestHeaders(accessToken: string): Record<string, string> {
  return googleAdsRequestHeaders(accessToken, true);
}

export function createResourceReader(transport?: GoogleAuthTransport) {
  const client = createGoogleAuthHttpClient(transport);

  async function read(apiVersion: string, customerId: string, developerToken: string, accessToken: string, query: string, optional: boolean): Promise<ResourceReadResult> {
    const rows: Record<string, unknown>[] = [];
    let pageToken = "";
    let requestCount = 0;
    for (let page = 0; page < MAX_READ_PAGES; page++) {
      const body = pageToken === "" ? { query } : { query, pageToken };
      requestCount += 1;
      const response = await client.send({
        url: `${googleAdsRoot(apiVersion || GOOGLE_ADS_API_VERSION)}/customers/${customerId}/googleAds:search`,
        method: "POST",
        headers: requestHeaders(accessToken),
        body: JSON.stringify(body),
      });
      if (optional && response.httpStatus === 400) return { ok: true, read: { rows: [], requestCount } };
      if (response.httpStatus !== 200) return { ok: false, issues: [{ field: "campaignResourceNames", message: "API Errors: the account service refused the read." }] };
      const parsed = parseGoogleAuthJson(response.bodyText);
      if (!isGoogleAuthRecord(parsed)) return { ok: false, issues: [{ field: "campaignResourceNames", message: "API Errors: the account service did not return a campaign read." }] };
      const chunk = parsed.results === undefined ? [] : parsed.results;
      if (!Array.isArray(chunk)) return { ok: false, issues: [{ field: "campaignResourceNames", message: "API Errors: the account service did not return a campaign read." }] };
      for (const row of chunk) {
        if (!isGoogleAuthRecord(row)) return { ok: false, issues: [{ field: "campaignResourceNames", message: "API Errors: the account service did not return a campaign read." }] };
        rows.push(row);
      }
      if (typeof parsed.nextPageToken !== "string" || parsed.nextPageToken.trim() === "") return { ok: true, read: { rows, requestCount } };
      pageToken = parsed.nextPageToken.trim();
    }
    return { ok: false, issues: [{ field: "campaignResourceNames", message: "API Errors: the account service did not finish the read." }] };
  }

  return {
    readCampaign: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, campaignReadQuery(resourceName), false),
    readLabels: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, labelReadQuery(resourceName), false),
    readAdGroups: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, adGroupReadQuery(resourceName), false),
    readAds: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, adReadQuery(resourceName), false),
    readChanges: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, changeReadQuery(resourceName), true),
  };
}
