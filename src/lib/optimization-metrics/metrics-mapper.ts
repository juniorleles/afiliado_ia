/**
 * Host record domain: metrics mapper.
 *
 * Copies metric figures from search rows. A missing figure stays null.
 * A figure is not derived from another figure.
 */
import { isGoogleAuthRecord } from "../google-ads-live/google-auth-client.ts";
import type { AdGroupMetrics, CampaignMetrics, MetricValues, MetricsIssue, RsaMetrics } from "./metrics-snapshot";

const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const AD_GROUP_RESOURCE = /^customers\/(\d+)\/adGroups\/(\d+)$/;
const AD_RESOURCE = /^customers\/(\d+)\/adGroupAds\/\d+~(\d+)$/;

const VALUE_FIELDS = [
  ["impressions", "impressions"],
  ["clicks", "clicks"],
  ["ctr", "ctr"],
  ["averageCpc", "averageCpc"],
  ["costMicros", "costMicros"],
  ["conversions", "conversions"],
  ["conversionValue", "conversionsValue"],
  ["averageCpm", "averageCpm"],
  ["searchImpressionShare", "searchImpressionShare"],
  ["searchTopImpressionShare", "searchTopImpressionShare"],
  ["searchAbsoluteTopImpressionShare", "searchAbsoluteTopImpressionShare"],
] as const;

function malformed(message: string): MetricsIssue {
  return { field: "campaignResourceNames", message: `Malformed Metrics: ${message}` };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function idText(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function metricNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function copyValues(metrics: Record<string, unknown> | null): { ok: true; values: MetricValues } | { ok: false; issues: MetricsIssue[] } {
  const values = {} as MetricValues;
  for (const [target, source] of VALUE_FIELDS) {
    const parsed = metrics === null ? null : metricNumber(metrics[source]);
    if (parsed === undefined) return { ok: false, issues: [malformed(`the account service returned a malformed ${target}.`)] };
    if (parsed !== null && parsed < 0) return { ok: false, issues: [malformed(`the account service returned a negative ${target}.`)] };
    values[target] = parsed;
  }
  return { ok: true, values };
}

export function mapCampaignMetrics(resourceName: string, rows: Record<string, unknown>[]): { ok: true; metric: CampaignMetrics } | { ok: false; issues: MetricsIssue[] } {
  if (rows.length === 0) return { ok: false, issues: [{ field: "campaignResourceNames", message: `Unknown Campaign: the account service has no campaign ${resourceName}.` }] };
  if (rows.length !== 1) return { ok: false, issues: [malformed("the account service returned more than one campaign metrics row.")] };
  const row = rows[0];
  if (!row || !isGoogleAuthRecord(row.campaign)) return { ok: false, issues: [malformed("the account service did not return the campaign.")] };
  const match = CAMPAIGN_RESOURCE.exec(text(row.campaign.resourceName) ?? "");
  const campaignId = idText(row.campaign.id);
  const status = text(row.campaign.status);
  if (match === null || text(row.campaign.resourceName) !== resourceName || campaignId === null || campaignId !== match[2] || status === null) {
    return { ok: false, issues: [malformed("the account service did not return the campaign.")] };
  }
  if (row.metrics !== undefined && row.metrics !== null && !isGoogleAuthRecord(row.metrics)) return { ok: false, issues: [malformed("the account service did not return the campaign metrics.")] };
  const copied = copyValues(isGoogleAuthRecord(row.metrics) ? row.metrics : null);
  if (!copied.ok) return copied;
  return { ok: true, metric: { resourceName, campaignId, status, ...copied.values } };
}

export function mapAdGroupMetrics(campaignResourceName: string, customerId: string, rows: Record<string, unknown>[]): { ok: true; metrics: AdGroupMetrics[] } | { ok: false; issues: MetricsIssue[] } {
  const metrics: AdGroupMetrics[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isGoogleAuthRecord(row.adGroup)) return { ok: false, issues: [malformed("the account service did not return the ad group metrics.")] };
    if (isGoogleAuthRecord(row.campaign) && text(row.campaign.resourceName) !== campaignResourceName) {
      return { ok: false, issues: [malformed("the account service returned ad group metrics for another campaign.")] };
    }
    const resourceName = text(row.adGroup.resourceName);
    const match = resourceName === null ? null : AD_GROUP_RESOURCE.exec(resourceName);
    const adGroupId = idText(row.adGroup.id);
    if (resourceName === null || match === null || match[1] !== customerId || adGroupId === null || adGroupId !== match[2]) {
      return { ok: false, issues: [malformed("the account service did not return the ad group metrics.")] };
    }
    if (seen.has(resourceName)) return { ok: false, issues: [malformed("the account service returned a repeated ad group.")] };
    seen.add(resourceName);
    if (row.metrics !== undefined && row.metrics !== null && !isGoogleAuthRecord(row.metrics)) return { ok: false, issues: [malformed("the account service did not return the ad group metrics.")] };
    const copied = copyValues(isGoogleAuthRecord(row.metrics) ? row.metrics : null);
    if (!copied.ok) return copied;
    metrics.push({ resourceName, adGroupId, campaignResourceName, ...copied.values });
  }
  return { ok: true, metrics };
}

export function mapRsaMetrics(campaignResourceName: string, customerId: string, rows: Record<string, unknown>[]): { ok: true; metrics: RsaMetrics[] } | { ok: false; issues: MetricsIssue[] } {
  const metrics: RsaMetrics[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isGoogleAuthRecord(row.adGroupAd)) return { ok: false, issues: [malformed("the account service did not return the ad metrics.")] };
    if (isGoogleAuthRecord(row.campaign) && text(row.campaign.resourceName) !== campaignResourceName) {
      return { ok: false, issues: [malformed("the account service returned ad metrics for another campaign.")] };
    }
    const ad = row.adGroupAd;
    const resourceName = text(ad.resourceName);
    const match = resourceName === null ? null : AD_RESOURCE.exec(resourceName);
    const adRecord = isGoogleAuthRecord(ad.ad) ? ad.ad : null;
    const adId = adRecord === null ? null : idText(adRecord.id);
    const status = text(ad.status);
    const groupResource = isGoogleAuthRecord(row.adGroup) ? text(row.adGroup.resourceName) : null;
    if (resourceName === null || match === null || match[1] !== customerId || adId === null || adId !== match[2] || status === null || groupResource === null) {
      return { ok: false, issues: [malformed("the account service did not return the ad metrics.")] };
    }
    if (seen.has(resourceName)) return { ok: false, issues: [malformed("the account service returned a repeated ad.")] };
    seen.add(resourceName);
    const policy = isGoogleAuthRecord(ad.policySummary) ? ad.policySummary : null;
    const approvalStatus = policy === null || policy.approvalStatus === undefined || policy.approvalStatus === null ? null : text(policy.approvalStatus);
    const policyReviewStatus = policy === null || policy.reviewStatus === undefined || policy.reviewStatus === null ? null : text(policy.reviewStatus);
    if ((policy !== null && policy.approvalStatus !== undefined && policy.approvalStatus !== null && approvalStatus === null) || (policy !== null && policy.reviewStatus !== undefined && policy.reviewStatus !== null && policyReviewStatus === null)) {
      return { ok: false, issues: [malformed("the account service did not return the policy status.")] };
    }
    if (row.metrics !== undefined && row.metrics !== null && !isGoogleAuthRecord(row.metrics)) return { ok: false, issues: [malformed("the account service did not return the ad metrics.")] };
    const copied = copyValues(isGoogleAuthRecord(row.metrics) ? row.metrics : null);
    if (!copied.ok) return copied;
    metrics.push({
      resourceName,
      adId,
      adGroupResourceName: groupResource,
      campaignResourceName,
      status,
      approvalStatus,
      policyReviewStatus,
      ...copied.values,
    });
  }
  return { ok: true, metrics };
}
