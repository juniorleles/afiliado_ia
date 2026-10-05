/**
 * Host record domain: synchronization validator.
 *
 * Pure local rules for an observe-only sync input, a published campaign, a
 * provider state, and a snapshot. It rejects an invalid synchronization, a
 * missing campaign, a state conflict, and invalid metadata. It only reports
 * problems: it never creates a campaign and never changes what it is given.
 * This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  GOOGLE_ADS_AD_GROUP_STATUSES,
  GOOGLE_ADS_AD_STATUSES,
  GOOGLE_ADS_APPROVAL_STATUSES,
  GOOGLE_ADS_BUDGET_STATUSES,
  GOOGLE_ADS_CAMPAIGN_STATUSES,
  GOOGLE_ADS_POLICY_STATUSES,
  GOOGLE_ADS_SYNC_SNAPSHOT_KEYS,
} from "./google-ads-monitor-snapshot";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const INPUT_MEMBERS = ["publishedCampaign", "providerState", "executionMetadata", "runtimeMetadata", "configuration"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface GoogleAdsSynchronizationValidator {
  validateInput(input: unknown): GoogleAdsIssue[];
  validateCampaign(input: unknown): GoogleAdsIssue[];
  validateState(input: unknown): GoogleAdsIssue[];
  validateConsistency(published: unknown, provider: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsMonitorMetadata(value: unknown): value is GoogleAdsMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function campaignIdOf(value: unknown): string | null {
  if (!isPlainRecord(value)) return null;
  return textOf(value.campaignId) ?? textOf(value.id);
}

function tokenIn(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

export function createGoogleAdsSynchronizationValidator(): GoogleAdsSynchronizationValidator {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsMonitorMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateCampaign(input: unknown): GoogleAdsIssue[] {
    if (input === undefined || input === null) {
      return [{ field: "publishedCampaign", message: "Missing Campaign: a published campaign is required." }];
    }
    if (!isPlainRecord(input)) {
      return [{ field: "publishedCampaign", message: "Invalid Synchronization: a published campaign must be an object." }];
    }
    if (campaignIdOf(input) === null) {
      return [{ field: "publishedCampaign.campaignId", message: "Missing Campaign: a published campaign id is required." }];
    }
    return [];
  }

  function validateState(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isPlainRecord(input)) {
      return [{ field: "providerState", message: "Invalid Synchronization: provider state must be an object." }];
    }
    const issues: GoogleAdsIssue[] = [];
    const checks: Array<[unknown, readonly string[], string]> = [
      [input.campaignStatus, GOOGLE_ADS_CAMPAIGN_STATUSES, "campaignStatus"],
      [input.budgetStatus, GOOGLE_ADS_BUDGET_STATUSES, "budgetStatus"],
      [input.approvalStatus, GOOGLE_ADS_APPROVAL_STATUSES, "approvalStatus"],
      [input.policyStatus, GOOGLE_ADS_POLICY_STATUSES, "policyStatus"],
      [input.adGroupStatus, GOOGLE_ADS_AD_GROUP_STATUSES, "adGroupStatus"],
      [input.adStatus, GOOGLE_ADS_AD_STATUSES, "adStatus"],
    ];
    for (const [value, allowed, field] of checks) {
      if (value !== undefined && value !== null && !tokenIn(value, allowed)) {
        issues.push({ field: `providerState.${field}`, message: `Invalid Synchronization: "${String(value)}" is not a restated ${field}.` });
      }
    }
    issues.push(...validateMetadata(input.metadata).map((item) => ({ field: "providerState.metadata", message: item.message })));
    return issues;
  }

  function validateConsistency(published: unknown, provider: unknown): GoogleAdsIssue[] {
    const issues: GoogleAdsIssue[] = [];
    const publishedId = campaignIdOf(published);
    const providerId = campaignIdOf(provider);
    if (publishedId && providerId && publishedId !== providerId) {
      issues.push({ field: "providerState.campaignId", message: `State Conflict: published campaign "${publishedId}" does not match provider campaign "${providerId}".` });
    }
    if (isPlainRecord(published) && isPlainRecord(provider)) {
      const pairs: Array<[string, unknown, unknown]> = [
        ["campaignStatus", published.campaignStatus, provider.campaignStatus],
        ["budgetStatus", published.budgetStatus, provider.budgetStatus],
        ["approvalStatus", published.approvalStatus, provider.approvalStatus],
        ["policyStatus", published.policyStatus, provider.policyStatus],
        ["adGroupStatus", published.adGroupStatus, provider.adGroupStatus],
        ["adStatus", published.adStatus, provider.adStatus],
      ];
      for (const [field, left, right] of pairs) {
        if (typeof left === "string" && typeof right === "string" && left !== right) {
          issues.push({ field: `providerState.${field}`, message: `State Conflict: published ${field} "${left}" does not match provider "${right}".` });
        }
      }
    }
    return issues;
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "monitor", message: "Invalid Synchronization: an object of a published campaign and provider state is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if (!("publishedCampaign" in input)) issues.push({ field: "publishedCampaign", message: "Missing Campaign: a published campaign is required." });
    else issues.push(...validateCampaign(input.publishedCampaign));
    if (!("providerState" in input)) issues.push({ field: "providerState", message: "Invalid Synchronization: provider state is required." });
    else issues.push(...validateState(input.providerState));
    if (issues.length === 0) issues.push(...validateConsistency(input.publishedCampaign, input.providerState));
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Synchronization: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_SYNC_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Synchronization: snapshot member "${field}" is missing.` });
    }
    if (typeof input.syncId !== "string" || !RECORD_ID.test(input.syncId)) {
      issues.push({ field: "syncId", message: "Invalid Synchronization: a well-formed sync id is required." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateCampaign,
    validateState,
    validateConsistency,
    validateMetadata,
    validateSnapshot,
  };
}
