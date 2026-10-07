/**
 * Host record domain: campaign state mapper.
 *
 * Copies search rows into one campaign state. Missing optional fields stay
 * null. It does not invent a name, a status, an amount, or a timestamp.
 */
import type { AdGroupState, AdState, CampaignState, CampaignSyncIssue, LabelState } from "./campaign-sync-snapshot";
import { isGoogleAuthRecord } from "./google-auth-client";

export interface CampaignReadRows {
  resourceName: string;
  campaignRows: Record<string, unknown>[];
  labelRows: Record<string, unknown>[];
  adGroupRows: Record<string, unknown>[];
  adRows: Record<string, unknown>[];
  changeRows: Record<string, unknown>[];
}

export type CampaignMapResult =
  | { ok: true; campaign: CampaignState }
  | { ok: false; issues: CampaignSyncIssue[] };

const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const BUDGET_RESOURCE = /^customers\/(\d+)\/campaignBudgets\/\d+$/;
const LABEL_RESOURCE = /^customers\/(\d+)\/labels\/(\d+)$/;
const AD_GROUP_RESOURCE = /^customers\/(\d+)\/adGroups\/(\d+)$/;
const AD_RESOURCE = /^customers\/(\d+)\/adGroupAds\/\d+~(\d+)$/;

function api(message: string): CampaignSyncIssue {
  return { field: "campaignResourceNames", message: `API Errors: ${message}` };
}

function unknown(resourceName: string): CampaignSyncIssue {
  return { field: "campaignResourceNames", message: `Unknown Campaign: the account service has no campaign ${resourceName}.` };
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

function nullableCopy(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function later(current: string | null, candidate: string): string {
  if (current === null || candidate > current) return candidate;
  return current;
}

export function mapCampaignState(input: CampaignReadRows): CampaignMapResult {
  if (input.campaignRows.length === 0) return { ok: false, issues: [unknown(input.resourceName)] };
  if (input.campaignRows.length !== 1) return { ok: false, issues: [api("the account service returned more than one campaign row.")] };
  const row = input.campaignRows[0];
  if (!row || !isGoogleAuthRecord(row.campaign)) return { ok: false, issues: [api("the account service did not return the campaign.")] };
  const campaign = row.campaign;
  const resourceName = text(campaign.resourceName);
  const match = resourceName === null ? null : CAMPAIGN_RESOURCE.exec(resourceName);
  const campaignId = idText(campaign.id);
  const name = text(campaign.name);
  const status = text(campaign.status);
  const servingStatus = text(campaign.servingStatus);
  if (resourceName !== input.resourceName || match === null || campaignId === null || campaignId !== match[2] || name === null || status === null || servingStatus === null) {
    return { ok: false, issues: [api("the account service did not return the campaign.")] };
  }
  let budgetResourceName: string | null = null;
  let budgetName: string | null = null;
  let budgetAmountMicros: string | null = null;
  let budgetStatus: string | null = null;
  if (row.campaignBudget !== undefined && row.campaignBudget !== null) {
    if (!isGoogleAuthRecord(row.campaignBudget)) return { ok: false, issues: [api("the account service did not return the budget.")] };
    const budgetResource = text(row.campaignBudget.resourceName);
    const budgetMatch = budgetResource === null ? null : BUDGET_RESOURCE.exec(budgetResource);
    if (budgetResource !== null && (budgetMatch === null || budgetMatch[1] !== match[1])) return { ok: false, issues: [api("the account service did not return the budget.")] };
    const amount = row.campaignBudget.amountMicros;
    if (amount !== undefined && amount !== null && idText(amount) === null) return { ok: false, issues: [api("the account service did not return the budget amount.")] };
    budgetResourceName = budgetResource;
    budgetName = nullableCopy(row.campaignBudget.name) ?? null;
    if (nullableCopy(row.campaignBudget.name) === undefined || nullableCopy(row.campaignBudget.status) === undefined) {
      return { ok: false, issues: [api("the account service did not return the budget.")] };
    }
    budgetName = nullableCopy(row.campaignBudget.name) ?? null;
    budgetStatus = nullableCopy(row.campaignBudget.status) ?? null;
    budgetAmountMicros = amount === undefined || amount === null ? null : idText(amount);
  }

  const labels: LabelState[] = [];
  const seenLabels = new Set<string>();
  for (const labelRow of input.labelRows) {
    if (!isGoogleAuthRecord(labelRow.label)) return { ok: false, issues: [api("the account service did not return the labels.")] };
    if (isGoogleAuthRecord(labelRow.campaign) && text(labelRow.campaign.resourceName) !== resourceName) {
      return { ok: false, issues: [api("the account service returned a label for another campaign.")] };
    }
    const labelResource = text(labelRow.label.resourceName);
    const labelMatch = labelResource === null ? null : LABEL_RESOURCE.exec(labelResource);
    const labelId = idText(labelRow.label.id);
    const labelName = text(labelRow.label.name);
    if (labelResource === null || labelMatch === null || labelMatch[1] !== match[1] || labelId === null || labelId !== labelMatch[2] || labelName === null) {
      return { ok: false, issues: [api("the account service did not return the labels.")] };
    }
    if (seenLabels.has(labelResource)) return { ok: false, issues: [api("the account service returned a repeated label.")] };
    seenLabels.add(labelResource);
    labels.push({ resourceName: labelResource, labelId, name: labelName });
  }

  const adGroups: AdGroupState[] = [];
  const seenGroups = new Set<string>();
  for (const groupRow of input.adGroupRows) {
    if (!isGoogleAuthRecord(groupRow.adGroup)) return { ok: false, issues: [api("the account service did not return the ad groups.")] };
    if (isGoogleAuthRecord(groupRow.campaign) && text(groupRow.campaign.resourceName) !== resourceName) {
      return { ok: false, issues: [api("the account service returned an ad group for another campaign.")] };
    }
    const groupResource = text(groupRow.adGroup.resourceName);
    const groupMatch = groupResource === null ? null : AD_GROUP_RESOURCE.exec(groupResource);
    const adGroupId = idText(groupRow.adGroup.id);
    const groupName = text(groupRow.adGroup.name);
    const groupStatus = text(groupRow.adGroup.status);
    if (groupResource === null || groupMatch === null || groupMatch[1] !== match[1] || adGroupId === null || adGroupId !== groupMatch[2] || groupName === null || groupStatus === null) {
      return { ok: false, issues: [api("the account service did not return the ad groups.")] };
    }
    if (seenGroups.has(groupResource)) return { ok: false, issues: [api("the account service returned a repeated ad group.")] };
    seenGroups.add(groupResource);
    adGroups.push({ resourceName: groupResource, adGroupId, name: groupName, status: groupStatus, ads: [] });
  }

  const seenAds = new Set<string>();
  for (const adRow of input.adRows) {
    if (!isGoogleAuthRecord(adRow.adGroupAd) || !isGoogleAuthRecord(adRow.adGroup)) return { ok: false, issues: [api("the account service did not return the ads.")] };
    if (isGoogleAuthRecord(adRow.campaign) && text(adRow.campaign.resourceName) !== resourceName) {
      return { ok: false, issues: [api("the account service returned an ad for another campaign.")] };
    }
    const ad = adRow.adGroupAd;
    const adResource = text(ad.resourceName);
    const adMatch = adResource === null ? null : AD_RESOURCE.exec(adResource);
    const adStatus = text(ad.status);
    const adRecord = isGoogleAuthRecord(ad.ad) ? ad.ad : null;
    const adId = adRecord === null ? null : idText(adRecord.id);
    const groupResource = text(adRow.adGroup.resourceName);
    if (adResource === null || adMatch === null || adMatch[1] !== match[1] || adStatus === null || adId === null || adId !== adMatch[2] || groupResource === null) {
      return { ok: false, issues: [api("the account service did not return the ads.")] };
    }
    const group = adGroups.find((item) => item.resourceName === groupResource);
    if (group === undefined) return { ok: false, issues: [api("the account service returned an ad without an ad group.")] };
    if (seenAds.has(adResource)) return { ok: false, issues: [api("the account service returned a repeated ad.")] };
    seenAds.add(adResource);
    const policy = isGoogleAuthRecord(ad.policySummary) ? ad.policySummary : null;
    const approvalStatus = policy === null ? null : nullableCopy(policy.approvalStatus);
    const policyReviewStatus = policy === null ? null : nullableCopy(policy.reviewStatus);
    if (approvalStatus === undefined || policyReviewStatus === undefined) return { ok: false, issues: [api("the account service did not return the policy summary.")] };
    const mapped: AdState = {
      resourceName: adResource,
      adGroupResourceName: groupResource,
      adId,
      status: adStatus,
      approvalStatus,
      policyReviewStatus,
    };
    group.ads.push(mapped);
  }

  let lastModifiedTime: string | null = null;
  for (const changeRow of input.changeRows) {
    if (!isGoogleAuthRecord(changeRow.changeStatus)) return { ok: false, issues: [api("the account service did not return the last change time.")] };
    const change = changeRow.changeStatus;
    if (text(change.campaign) !== null && text(change.campaign) !== resourceName) continue;
    const stamp = nullableCopy(change.lastChangeDateTime);
    if (stamp === undefined) return { ok: false, issues: [api("the account service did not return the last change time.")] };
    if (stamp !== null) lastModifiedTime = later(lastModifiedTime, stamp);
  }

  return {
    ok: true,
    campaign: {
      resourceName,
      campaignId,
      name,
      status,
      servingStatus,
      budgetResourceName,
      budgetName,
      budgetAmountMicros,
      budgetStatus,
      lastModifiedTime,
      labels,
      adGroups,
    },
  };
}
