/**
 * Host record domain: Google metrics client.
 *
 * Reads campaign, ad group, and responsive search ad metric rows. Every
 * request is a search. The grant is placed on the request and is not returned.
 */
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, googleAdsRoot, isGoogleAuthRecord, parseGoogleAuthJson, type GoogleAuthTransport } from "../google-ads-live/google-auth-client.ts";
import { METRICS_DATE_RANGE, type MetricsIssue } from "./metrics-snapshot";

export const MAX_METRIC_PAGES = 10;

const CAMPAIGN_METRICS = "campaign.resource_name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.average_cpm, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share";
const GROUP_METRICS = "ad_group.resource_name, ad_group.id, campaign.resource_name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.average_cpm, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share";
const AD_METRICS = "ad_group_ad.resource_name, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group.resource_name, campaign.resource_name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.average_cpm";

export interface MetricRows {
  rows: Record<string, unknown>[];
  requestCount: number;
}

export type MetricReadResult =
  | { ok: true; read: MetricRows }
  | { ok: false; issues: MetricsIssue[] };

function quoted(resourceName: string): string {
  return `'${resourceName}'`;
}

function windowClause(): string {
  return `segments.date DURING ${METRICS_DATE_RANGE}`;
}

export function campaignMetricsQuery(resourceName: string): string {
  return `SELECT ${CAMPAIGN_METRICS} FROM campaign WHERE campaign.resource_name = ${quoted(resourceName)} AND ${windowClause()}`;
}

export function adGroupMetricsQuery(resourceName: string): string {
  return `SELECT ${GROUP_METRICS} FROM ad_group WHERE campaign.resource_name = ${quoted(resourceName)} AND ${windowClause()}`;
}

export function rsaMetricsQuery(resourceName: string): string {
  return `SELECT ${AD_METRICS} FROM ad_group_ad WHERE campaign.resource_name = ${quoted(resourceName)} AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ${windowClause()}`;
}

function requestHeaders(developerToken: string, accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function createGoogleMetricsClient(transport?: GoogleAuthTransport) {
  const client = createGoogleAuthHttpClient(transport);

  async function read(apiVersion: string, customerId: string, developerToken: string, accessToken: string, query: string): Promise<MetricReadResult> {
    const rows: Record<string, unknown>[] = [];
    let pageToken = "";
    let requestCount = 0;
    for (let page = 0; page < MAX_METRIC_PAGES; page++) {
      const body = pageToken === "" ? { query } : { query, pageToken };
      requestCount += 1;
      const response = await client.send({
        url: `${googleAdsRoot(apiVersion || GOOGLE_ADS_API_VERSION)}/customers/${customerId}/googleAds:search`,
        method: "POST",
        headers: requestHeaders(developerToken, accessToken),
        body: JSON.stringify(body),
      });
      if (response.httpStatus !== 200) return { ok: false, issues: [{ field: "campaignResourceNames", message: "Google API Errors: the account service refused the read." }] };
      const parsed = parseGoogleAuthJson(response.bodyText);
      if (!isGoogleAuthRecord(parsed)) return { ok: false, issues: [{ field: "campaignResourceNames", message: "Google API Errors: the account service did not return a metrics read." }] };
      const chunk = parsed.results === undefined ? [] : parsed.results;
      if (!Array.isArray(chunk)) return { ok: false, issues: [{ field: "campaignResourceNames", message: "Google API Errors: the account service did not return a metrics read." }] };
      for (const row of chunk) {
        if (!isGoogleAuthRecord(row)) return { ok: false, issues: [{ field: "campaignResourceNames", message: "Google API Errors: the account service did not return a metrics read." }] };
        rows.push(row);
      }
      if (typeof parsed.nextPageToken !== "string" || parsed.nextPageToken.trim() === "") return { ok: true, read: { rows, requestCount } };
      pageToken = parsed.nextPageToken.trim();
    }
    return { ok: false, issues: [{ field: "campaignResourceNames", message: "Google API Errors: the account service did not finish the read." }] };
  }

  return {
    readCampaign: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, campaignMetricsQuery(resourceName)),
    readAdGroups: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, adGroupMetricsQuery(resourceName)),
    readAds: (apiVersion: string, customerId: string, developerToken: string, accessToken: string, resourceName: string) =>
      read(apiVersion, customerId, developerToken, accessToken, rsaMetricsQuery(resourceName)),
  };
}
