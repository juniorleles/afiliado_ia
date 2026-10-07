/**
 * Host record domain: campaign synchronization validator.
 *
 * Pure local rules. It rejects a missing session, a missing customer, an
 * unknown campaign resource, a corrupted snapshot, and invalid metadata.
 * It does not send a request and does not change what it is given.
 */
import { CAMPAIGN_SYNC_CONTEXT_MEMBERS, CAMPAIGN_SYNC_SESSION_KEYS, type CampaignSyncMetadata } from "./campaign-sync-context";
import {
  AD_GROUP_STATE_KEYS,
  AD_STATE_KEYS,
  CAMPAIGN_SNAPSHOT_KEYS,
  CAMPAIGN_STATE_KEYS,
  CAMPAIGN_SYNC_CONTEXT_RECORD_KEYS,
  CAMPAIGN_SYNC_SNAPSHOT_KEYS,
  CAMPAIGN_SYNC_STATISTICS_KEYS,
  LABEL_STATE_KEYS,
  MISSING_RESOURCE_KEYS,
  STATE_CHANGE_KEYS,
  SYNC_DIFFERENCE_KEYS,
  SYNC_REPORT_KEYS,
  type CampaignState,
  type CampaignSyncIssue,
} from "./campaign-sync-snapshot";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CUSTOMER_ID = /^\d+$/;
const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const BUDGET_RESOURCE = /^customers\/(\d+)\/campaignBudgets\/(\d+)$/;
const LABEL_RESOURCE = /^customers\/(\d+)\/labels\/(\d+)$/;
const AD_GROUP_RESOURCE = /^customers\/(\d+)\/adGroups\/(\d+)$/;
const AD_RESOURCE = /^customers\/(\d+)\/adGroupAds\/(\d+)~(\d+)$/;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;

export interface CampaignSyncValidator {
  validateInput(input: unknown): CampaignSyncIssue[];
  validateMetadata(input: unknown): CampaignSyncIssue[];
  validateLocalSnapshot(input: unknown, customerId: string): CampaignSyncIssue[];
  validateSnapshot(input: unknown): CampaignSyncIssue[];
  campaignNames(input: unknown, customerId: string): string[] | null;
  localCampaigns(input: unknown): CampaignState[] | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatCampaignSyncMetadata(value: unknown): value is CampaignSyncMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): CampaignSyncIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function corrupted(field: string, message: string): CampaignSyncIssue {
  return { field, message: `Corrupted Snapshot: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
}

function nullableText(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function validateCampaignState(campaign: unknown, customerId: string, field: string): CampaignSyncIssue[] {
  if (!isPlainRecord(campaign) || !exactKeys(campaign, CAMPAIGN_STATE_KEYS)) return [corrupted(field, "a campaign state is required.")];
  const issues: CampaignSyncIssue[] = [];
  const resource = CAMPAIGN_RESOURCE.exec(textOf(campaign.resourceName));
  if (resource === null || resource[1] !== customerId) issues.push(corrupted(`${field}.resourceName`, "the campaign resource does not match the customer."));
  if (resource !== null && textOf(campaign.campaignId) !== resource[2]) issues.push(corrupted(`${field}.campaignId`, "the campaign id does not match the resource."));
  for (const key of ["name", "status", "servingStatus"] as const) {
    if (textOf(campaign[key]) === "") issues.push(corrupted(`${field}.${key}`, `a campaign ${key} is required.`));
  }
  if (campaign.budgetResourceName !== null && (typeof campaign.budgetResourceName !== "string" || BUDGET_RESOURCE.exec(campaign.budgetResourceName.trim())?.[1] !== customerId)) {
    issues.push(corrupted(`${field}.budgetResourceName`, "the budget resource does not match the customer."));
  }
  for (const key of ["budgetName", "budgetAmountMicros", "budgetStatus", "lastModifiedTime"] as const) {
    if (!nullableText(campaign[key])) issues.push(corrupted(`${field}.${key}`, `${key} must be text or null.`));
  }
  if (!Array.isArray(campaign.labels)) issues.push(corrupted(`${field}.labels`, "labels are required."));
  else {
    campaign.labels.forEach((label, index) => {
      if (!isPlainRecord(label) || !exactKeys(label, LABEL_STATE_KEYS)) {
        issues.push(corrupted(`${field}.labels.${index}`, "a label state is required."));
        return;
      }
      const match = LABEL_RESOURCE.exec(textOf(label.resourceName));
      if (match === null || match[1] !== customerId || textOf(label.labelId) !== match[2] || textOf(label.name) === "") {
        issues.push(corrupted(`${field}.labels.${index}`, "the label resource does not match the customer."));
      }
    });
  }
  if (!Array.isArray(campaign.adGroups)) issues.push(corrupted(`${field}.adGroups`, "ad groups are required."));
  else {
    campaign.adGroups.forEach((adGroup, index) => {
      const groupField = `${field}.adGroups.${index}`;
      if (!isPlainRecord(adGroup) || !exactKeys(adGroup, AD_GROUP_STATE_KEYS)) {
        issues.push(corrupted(groupField, "an ad group state is required."));
        return;
      }
      const match = AD_GROUP_RESOURCE.exec(textOf(adGroup.resourceName));
      if (match === null || match[1] !== customerId || textOf(adGroup.adGroupId) !== match[2] || textOf(adGroup.name) === "" || textOf(adGroup.status) === "") {
        issues.push(corrupted(groupField, "the ad group resource does not match the customer."));
      }
      if (!Array.isArray(adGroup.ads)) {
        issues.push(corrupted(`${groupField}.ads`, "ads are required."));
        return;
      }
      adGroup.ads.forEach((ad, adIndex) => {
        if (!isPlainRecord(ad) || !exactKeys(ad, AD_STATE_KEYS)) {
          issues.push(corrupted(`${groupField}.ads.${adIndex}`, "an ad state is required."));
          return;
        }
        const adMatch = AD_RESOURCE.exec(textOf(ad.resourceName));
        if (adMatch === null || adMatch[1] !== customerId || textOf(ad.adId) !== adMatch[3] || textOf(ad.adGroupResourceName) !== textOf(adGroup.resourceName) || textOf(ad.status) === "") {
          issues.push(corrupted(`${groupField}.ads.${adIndex}`, "the ad resource does not match the ad group."));
        }
        if (!nullableText(ad.approvalStatus) || !nullableText(ad.policyReviewStatus)) {
          issues.push(corrupted(`${groupField}.ads.${adIndex}`, "a policy status must be text or null."));
        }
      });
    });
  }
  return issues;
}

function campaignsFrom(input: unknown): unknown[] | null {
  if (!isPlainRecord(input)) return null;
  if (isPlainRecord(input.campaignSnapshot) && Array.isArray(input.campaignSnapshot.campaigns)) return input.campaignSnapshot.campaigns;
  if (Array.isArray(input.campaigns)) return input.campaigns;
  return null;
}

function rejectSecrets(record: Record<string, unknown>, prefix: string): CampaignSyncIssue[] {
  const issues: CampaignSyncIssue[] = [];
  for (const key of SECRET_KEYS) {
    if (key in record) issues.push(corrupted(prefix === "" ? key : `${prefix}.${key}`, "a credential must not be stored."));
  }
  return issues;
}

export function createCampaignSyncValidator(): CampaignSyncValidator {
  function validateMetadata(input: unknown): CampaignSyncIssue[] {
    if (input === undefined) return [];
    if (!isFlatCampaignSyncMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateSession(session: unknown): CampaignSyncIssue[] {
    if (!isPlainRecord(session)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: CampaignSyncIssue[] = [];
    for (const key of Object.keys(session)) {
      if (!(CAMPAIGN_SYNC_SESSION_KEYS as readonly string[]).includes(key)) issues.push({ field: `session.${key}`, message: "Missing Authentication: the session has an unknown member." });
    }
    if (session.authenticated !== true) issues.push({ field: "session.authenticated", message: "Missing Authentication: an authenticated session is required." });
    if (!SNAPSHOT_ID.test(textOf(session.sessionId))) issues.push({ field: "session.sessionId", message: "Missing Authentication: a session id is required." });
    if (textOf(session.tokenType) === "") issues.push({ field: "session.tokenType", message: "Missing Authentication: a token type is required." });
    if (typeof session.expiresIn !== "number" || !Number.isFinite(session.expiresIn) || session.expiresIn <= 0) {
      issues.push({ field: "session.expiresIn", message: "Missing Authentication: a grant lifetime is required." });
    }
    if (textOf(session.accessToken) === "") issues.push({ field: "session.accessToken", message: "Missing Authentication: a grant is required." });
    return issues;
  }

  function campaignNames(input: unknown, customerId: string): string[] | null {
    if (!isPlainRecord(input) || !Array.isArray(input.campaignResourceNames)) return null;
    const names: string[] = [];
    for (const name of input.campaignResourceNames) {
      const text = textOf(name);
      const match = CAMPAIGN_RESOURCE.exec(text);
      if (match === null || match[1] !== customerId) return null;
      names.push(text);
    }
    return names;
  }

  function validateNames(names: unknown, customerId: string): CampaignSyncIssue[] {
    if (!Array.isArray(names) || names.length === 0) return [{ field: "campaignResourceNames", message: "Unknown Campaign: a campaign resource is required." }];
    const issues: CampaignSyncIssue[] = [];
    const seen = new Set<string>();
    names.forEach((name, index) => {
      const text = textOf(name);
      const match = CAMPAIGN_RESOURCE.exec(text);
      if (match === null || match[1] !== customerId) {
        issues.push({ field: `campaignResourceNames.${index}`, message: "Unknown Campaign: the campaign resource does not match the customer." });
        return;
      }
      if (seen.has(text)) issues.push({ field: `campaignResourceNames.${index}`, message: "Unknown Campaign: the campaign resource is repeated." });
      seen.add(text);
    });
    return issues;
  }

  function validateLocalSnapshot(input: unknown, customerId: string): CampaignSyncIssue[] {
    if (!isPlainRecord(input)) return [corrupted("localSnapshot", "a local snapshot is required.")];
    const issues = rejectSecrets(input, "localSnapshot");
    const campaigns = campaignsFrom(input);
    if (campaigns === null) return [...issues, corrupted("localSnapshot.campaigns", "local campaigns are required.")];
    campaigns.forEach((campaign, index) => issues.push(...validateCampaignState(campaign, customerId, `localSnapshot.campaigns.${index}`)));
    return issues;
  }

  function localCampaigns(input: unknown): CampaignState[] | null {
    const campaigns = campaignsFrom(input);
    if (campaigns === null) return null;
    return campaigns as CampaignState[];
  }

  function validateInput(input: unknown): CampaignSyncIssue[] {
    if (!isPlainRecord(input)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: CampaignSyncIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(CAMPAIGN_SYNC_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("session" in input) || input.session === undefined) issues.push({ field: "session", message: "Missing Authentication: an authenticated session is required." });
    else issues.push(...validateSession(input.session));
    const customerId = textOf(input.customerId);
    if (!("customerId" in input) || customerId === "") issues.push({ field: "customerId", message: "Missing Customer: a customer id is required." });
    else if (!CUSTOMER_ID.test(customerId)) issues.push({ field: "customerId", message: "Missing Customer: a customer id is required." });
    if (!("developerToken" in input) || textOf(input.developerToken) === "") issues.push({ field: "developerToken", message: "Missing Authentication: a developer token is required." });
    if (!("campaignResourceNames" in input)) issues.push({ field: "campaignResourceNames", message: "Unknown Campaign: a campaign resource is required." });
    else if (CUSTOMER_ID.test(customerId)) issues.push(...validateNames(input.campaignResourceNames, customerId));
    if ("localSnapshot" in input && input.localSnapshot !== undefined) issues.push(...validateLocalSnapshot(input.localSnapshot, customerId));
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): CampaignSyncIssue[] {
    if (!isPlainRecord(input)) return [corrupted("snapshot", "a snapshot record is required.")];
    const issues: CampaignSyncIssue[] = [];
    for (const field of CAMPAIGN_SYNC_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(corrupted(field, `snapshot member "${field}" is missing.`));
    }
    issues.push(...rejectSecrets(input, ""));
    if (typeof input.syncId !== "string" || !SNAPSHOT_ID.test(input.syncId)) issues.push(corrupted("syncId", "a well-formed sync id is required."));
    if (!isPlainRecord(input.campaignSnapshot) || !exactKeys(input.campaignSnapshot, CAMPAIGN_SNAPSHOT_KEYS)) issues.push(corrupted("campaignSnapshot", "a campaign snapshot is required."));
    else if (!Array.isArray(input.campaignSnapshot.campaigns)) issues.push(corrupted("campaignSnapshot.campaigns", "campaigns are required."));
    else {
      const customerId = textOf(input.campaignSnapshot.customerId);
      if (!CUSTOMER_ID.test(customerId)) issues.push(corrupted("campaignSnapshot.customerId", "a customer id is required."));
      input.campaignSnapshot.campaigns.forEach((campaign, index) => issues.push(...validateCampaignState(campaign, customerId, `campaignSnapshot.campaigns.${index}`)));
      if (typeof input.campaignSnapshot.readAt !== "string" || !ISO.test(input.campaignSnapshot.readAt)) issues.push(corrupted("campaignSnapshot.readAt", "readAt must be an ISO-8601 instant in UTC."));
    }
    if (!isPlainRecord(input.report) || !exactKeys(input.report, SYNC_REPORT_KEYS)) issues.push(corrupted("report", "a synchronization report is required."));
    else {
      if (typeof input.report.priorSnapshotPresent !== "boolean") issues.push(corrupted("report.priorSnapshotPresent", "priorSnapshotPresent must be a boolean."));
      if (!Array.isArray(input.report.differences)) issues.push(corrupted("report.differences", "differences are required."));
      else {
        input.report.differences.forEach((item, index) => {
          if (!isPlainRecord(item) || !exactKeys(item, SYNC_DIFFERENCE_KEYS) || (item.kind !== "STATE_CHANGE" && item.kind !== "MISSING")) {
            issues.push(corrupted(`report.differences.${index}`, "a difference record is required."));
          }
        });
      }
      if (!Array.isArray(input.report.missingResources)) issues.push(corrupted("report.missingResources", "missing resources are required."));
      else {
        input.report.missingResources.forEach((item, index) => {
          if (!isPlainRecord(item) || !exactKeys(item, MISSING_RESOURCE_KEYS) || (item.missingFrom !== "LOCAL" && item.missingFrom !== "GOOGLE")) {
            issues.push(corrupted(`report.missingResources.${index}`, "a missing resource record is required."));
          }
        });
      }
      if (!Array.isArray(input.report.stateChanges)) issues.push(corrupted("report.stateChanges", "state changes are required."));
      else {
        input.report.stateChanges.forEach((item, index) => {
          if (!isPlainRecord(item) || !exactKeys(item, STATE_CHANGE_KEYS)) issues.push(corrupted(`report.stateChanges.${index}`, "a state change record is required."));
        });
      }
    }
    if (!isPlainRecord(input.statistics)) issues.push(corrupted("statistics", "sync statistics are required."));
    else {
      for (const field of CAMPAIGN_SYNC_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(corrupted(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(corrupted("context", "a sync context is required."));
    else {
      for (const field of CAMPAIGN_SYNC_CONTEXT_RECORD_KEYS) {
        if (input.context[field] === undefined) issues.push(corrupted(`context.${field}`, `${field} is required.`));
      }
      if (!Array.isArray(input.context.campaignResourceNames)) issues.push(corrupted("context.campaignResourceNames", "campaign resource names are required."));
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(corrupted("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(corrupted("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupted("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateLocalSnapshot, validateSnapshot, campaignNames, localCampaigns };
}
