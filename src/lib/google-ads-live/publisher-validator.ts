/**
 * Host record domain: ad group and responsive search ad publish validator.
 *
 * Pure local rules. It rejects a missing session, a missing paused campaign,
 * an invalid draft, a policy limit, a repeated asset, and invalid metadata.
 * It does not send a request and does not change what it is given.
 */
import { validateDescriptions } from "./description-validator";
import { validateHeadlines } from "./headline-validator";
import {
  AD_GROUP_API_RESPONSE_KEYS,
  AD_GROUP_DRAFT_KEYS,
  AD_GROUP_PUBLISH_CONTEXT_MEMBERS,
  AD_GROUP_PUBLISH_CONTEXT_RECORD_KEYS,
  AD_GROUP_PUBLISH_SNAPSHOT_KEYS,
  POLICY_APPROVAL_STATUSES,
  POLICY_REVIEW_STATUSES,
  PUBLISH_SESSION_KEYS,
  PUBLISH_STATISTICS_KEYS,
  PUBLISHED_AD_GROUP_KEYS,
  PUBLISHED_CAMPAIGN_REF_KEYS,
  PUBLISHED_RSA_KEYS,
  RSA_API_RESPONSE_KEYS,
  RSA_DRAFT_KEYS,
  RSA_PUBLISH_CONTEXT_MEMBERS,
  RSA_PUBLISH_CONTEXT_RECORD_KEYS,
  RSA_PUBLISH_SNAPSHOT_KEYS,
  type AdGroupApiResponse,
  type AdGroupDraft,
  type AdGroupPublishContextRecord,
  type AdGroupPublishSnapshot,
  type PolicyApprovalStatus,
  type PolicyReviewStatus,
  type PublishIssue,
  type PublishMetadata,
  type PublishStatistics,
  type PublishedAdGroup,
  type PublishedCampaignRef,
  type PublishedRsa,
  type RsaApiResponse,
  type RsaDescription,
  type RsaDraft,
  type RsaHeadline,
  type RsaPublishContextRecord,
  type RsaPublishSnapshot,
} from "./publisher-context";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const AD_GROUP_RESOURCE = /^customers\/(\d+)\/adGroups\/(\d+)$/;
const DISPLAY_PATH = /^[A-Za-z0-9-]{0,15}$/;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;

export interface PublisherValidator {
  validateAdGroupInput(input: unknown): PublishIssue[];
  validateRsaInput(input: unknown): PublishIssue[];
  validateMetadata(input: unknown): PublishIssue[];
  validateAdGroupSnapshot(input: unknown): PublishIssue[];
  validateRsaSnapshot(input: unknown): PublishIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatPublishMetadata(value: unknown): value is PublishMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): PublishIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpsUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function validateMetadata(input: unknown): PublishIssue[] {
  if (input === undefined) return [];
  if (!isFlatPublishMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
  return [];
}

function validateSession(session: unknown): PublishIssue[] {
  if (!isPlainRecord(session)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
  const issues: PublishIssue[] = [];
  for (const key of Object.keys(session)) {
    if (!(PUBLISH_SESSION_KEYS as readonly string[]).includes(key)) issues.push({ field: `session.${key}`, message: "Missing Authentication: the session has an unknown member." });
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

function validatePublishedCampaign(campaign: unknown): PublishIssue[] {
  if (!isPlainRecord(campaign)) return [{ field: "publishedCampaign", message: "Missing Campaign: a published paused campaign is required." }];
  const issues: PublishIssue[] = [];
  for (const key of Object.keys(campaign)) {
    if (!(PUBLISHED_CAMPAIGN_REF_KEYS as readonly string[]).includes(key)) {
      issues.push({ field: `publishedCampaign.${key}`, message: "Missing Campaign: the published campaign has an unknown member." });
    }
  }
  const resourceName = textOf(campaign.resourceName);
  const match = CAMPAIGN_RESOURCE.exec(resourceName);
  if (match === null) issues.push({ field: "publishedCampaign.resourceName", message: "Missing Campaign: a paused campaign resource is required." });
  if (!SNAPSHOT_ID.test(textOf(campaign.draftId))) issues.push({ field: "publishedCampaign.draftId", message: "Missing Campaign: a campaign draft id is required." });
  if (match !== null && textOf(campaign.customerId) !== match[1]) issues.push({ field: "publishedCampaign.customerId", message: "Missing Campaign: the customer id does not match the campaign resource." });
  if (match !== null && textOf(campaign.campaignId) !== match[2]) issues.push({ field: "publishedCampaign.campaignId", message: "Missing Campaign: the campaign id does not match the campaign resource." });
  if (campaign.status !== "PAUSED") issues.push({ field: "publishedCampaign.status", message: "Missing Campaign: the campaign is not paused." });
  if (typeof campaign.publishedAt !== "string" || !ISO.test(campaign.publishedAt)) issues.push({ field: "publishedCampaign.publishedAt", message: "Missing Campaign: a publish timestamp is required." });
  return issues;
}

function validateAdGroupDraft(draft: unknown): PublishIssue[] {
  if (!isPlainRecord(draft)) return [{ field: "adGroupDraft", message: "Invalid Ad Group Draft: an ad group draft is required." }];
  const issues: PublishIssue[] = [];
  for (const key of Object.keys(draft)) {
    if (!(AD_GROUP_DRAFT_KEYS as readonly string[]).includes(key)) issues.push({ field: `adGroupDraft.${key}`, message: "Invalid Ad Group Draft: the draft has an unknown member." });
  }
  if (!SNAPSHOT_ID.test(textOf(draft.draftId))) issues.push({ field: "adGroupDraft.draftId", message: "Invalid Ad Group Draft: a draft id is required." });
  if (textOf(draft.name) === "" || textOf(draft.name).length > 255) issues.push({ field: "adGroupDraft.name", message: "Invalid Ad Group Draft: an ad group name is required." });
  if (draft.status !== "PAUSED") issues.push({ field: "adGroupDraft.status", message: "Invalid Ad Group Draft: the only accepted status is PAUSED." });
  if (draft.type !== "SEARCH_STANDARD") issues.push({ field: "adGroupDraft.type", message: "Invalid Ad Group Draft: the type must be SEARCH_STANDARD." });
  if (typeof draft.cpcBidMicros !== "number" || !Number.isSafeInteger(draft.cpcBidMicros) || draft.cpcBidMicros <= 0) {
    issues.push({ field: "adGroupDraft.cpcBidMicros", message: "Invalid Ad Group Draft: the supplied bid must be a positive integer." });
  }
  return issues;
}

function validateFinalUrls(urls: unknown): PublishIssue[] {
  if (!Array.isArray(urls) || urls.length === 0) return [{ field: "rsaDraft.finalUrls", message: "Policy Violations: a final URL is required." }];
  const issues: PublishIssue[] = [];
  const seen = new Set<string>();
  urls.forEach((url, index) => {
    if (typeof url !== "string" || !isHttpsUrl(url.trim())) {
      issues.push({ field: `rsaDraft.finalUrls.${index}`, message: "Policy Violations: a final URL must be an https address." });
      return;
    }
    const text = url.trim();
    if (seen.has(text)) issues.push({ field: `rsaDraft.finalUrls.${index}`, message: "Duplicate Assets: a final URL is repeated." });
    else seen.add(text);
  });
  return issues;
}

function validateDisplayPaths(path1: unknown, path2: unknown): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (typeof path1 !== "string" || !DISPLAY_PATH.test(path1)) issues.push({ field: "rsaDraft.path1", message: "Policy Violations: a display path must be 15 characters or fewer." });
  if (typeof path2 !== "string" || !DISPLAY_PATH.test(path2)) issues.push({ field: "rsaDraft.path2", message: "Policy Violations: a display path must be 15 characters or fewer." });
  if (typeof path1 === "string" && typeof path2 === "string" && path1.trim() === "" && path2.trim() !== "") {
    issues.push({ field: "rsaDraft.path2", message: "Policy Violations: the second display path requires the first." });
  }
  return issues;
}

function validateRsaDraft(draft: unknown): PublishIssue[] {
  if (!isPlainRecord(draft)) return [{ field: "rsaDraft", message: "Invalid RSA Draft: a responsive search ad draft is required." }];
  const issues: PublishIssue[] = [];
  for (const key of Object.keys(draft)) {
    if (!(RSA_DRAFT_KEYS as readonly string[]).includes(key)) issues.push({ field: `rsaDraft.${key}`, message: "Invalid RSA Draft: the draft has an unknown member." });
  }
  if (!SNAPSHOT_ID.test(textOf(draft.draftId))) issues.push({ field: "rsaDraft.draftId", message: "Invalid RSA Draft: a draft id is required." });
  if (draft.status !== "PAUSED") issues.push({ field: "rsaDraft.status", message: "Invalid RSA Draft: the only accepted status is PAUSED." });
  issues.push(...validateHeadlines(draft.headlines));
  issues.push(...validateDescriptions(draft.descriptions));
  issues.push(...validateFinalUrls(draft.finalUrls));
  issues.push(...validateDisplayPaths(draft.path1, draft.path2));
  return issues;
}

function validatePublishedAdGroup(adGroup: unknown, campaign: unknown): PublishIssue[] {
  if (!isPlainRecord(adGroup)) return [{ field: "publishedAdGroup", message: "Missing Campaign: a paused ad group in the published campaign is required." }];
  const issues: PublishIssue[] = [];
  for (const key of Object.keys(adGroup)) {
    if (!(PUBLISHED_AD_GROUP_KEYS as readonly string[]).includes(key)) {
      issues.push({ field: `publishedAdGroup.${key}`, message: "Missing Campaign: the published ad group has an unknown member." });
    }
  }
  const resourceName = textOf(adGroup.resourceName);
  const match = AD_GROUP_RESOURCE.exec(resourceName);
  if (match === null) issues.push({ field: "publishedAdGroup.resourceName", message: "Missing Campaign: a paused ad group resource is required." });
  if (!SNAPSHOT_ID.test(textOf(adGroup.draftId))) issues.push({ field: "publishedAdGroup.draftId", message: "Missing Campaign: an ad group draft id is required." });
  if (match !== null && textOf(adGroup.adGroupId) !== match[2]) issues.push({ field: "publishedAdGroup.adGroupId", message: "Missing Campaign: the ad group id does not match the ad group resource." });
  if (adGroup.status !== "PAUSED") issues.push({ field: "publishedAdGroup.status", message: "Missing Campaign: the ad group is not paused." });
  if (typeof adGroup.publishedAt !== "string" || !ISO.test(adGroup.publishedAt)) issues.push({ field: "publishedAdGroup.publishedAt", message: "Missing Campaign: an ad group publish timestamp is required." });
  if (isPlainRecord(campaign)) {
    if (textOf(adGroup.customerId) !== textOf(campaign.customerId)) issues.push({ field: "publishedAdGroup.customerId", message: "Missing Campaign: the ad group customer does not match the campaign." });
    if (textOf(adGroup.campaignResourceName) !== textOf(campaign.resourceName)) {
      issues.push({ field: "publishedAdGroup.campaignResourceName", message: "Missing Campaign: the ad group is not inside the published campaign." });
    }
    if (match !== null && textOf(campaign.customerId) !== match[1]) issues.push({ field: "publishedAdGroup.resourceName", message: "Missing Campaign: the ad group customer does not match the campaign." });
  }
  return issues;
}

function validateStatistics(statistics: unknown): PublishIssue[] {
  if (!isPlainRecord(statistics)) return [invalid("statistics", "publish statistics are required.")];
  const issues: PublishIssue[] = [];
  for (const field of PUBLISH_STATISTICS_KEYS) {
    const value = statistics[field];
    if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
  }
  return issues;
}

function rejectSecrets(record: Record<string, unknown>, prefix: string): PublishIssue[] {
  const issues: PublishIssue[] = [];
  for (const key of SECRET_KEYS) {
    if (key in record) issues.push(invalid(prefix === "" ? key : `${prefix}.${key}`, "a credential must not be stored."));
  }
  return issues;
}

export function createPublisherValidator(): PublisherValidator {
  function validateAdGroupInput(input: unknown): PublishIssue[] {
    if (!isPlainRecord(input)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: PublishIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(AD_GROUP_PUBLISH_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("session" in input) || input.session === undefined) issues.push({ field: "session", message: "Missing Authentication: an authenticated session is required." });
    else issues.push(...validateSession(input.session));
    if (!("publishedCampaign" in input) || input.publishedCampaign === undefined) issues.push({ field: "publishedCampaign", message: "Missing Campaign: a published paused campaign is required." });
    else issues.push(...validatePublishedCampaign(input.publishedCampaign));
    if (!("adGroupDraft" in input) || input.adGroupDraft === undefined) issues.push({ field: "adGroupDraft", message: "Invalid Ad Group Draft: an ad group draft is required." });
    else issues.push(...validateAdGroupDraft(input.adGroupDraft));
    if (!("developerToken" in input) || textOf(input.developerToken) === "") issues.push({ field: "developerToken", message: "Missing Authentication: a developer token is required." });
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateRsaInput(input: unknown): PublishIssue[] {
    if (!isPlainRecord(input)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: PublishIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(RSA_PUBLISH_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("session" in input) || input.session === undefined) issues.push({ field: "session", message: "Missing Authentication: an authenticated session is required." });
    else issues.push(...validateSession(input.session));
    if (!("publishedCampaign" in input) || input.publishedCampaign === undefined) issues.push({ field: "publishedCampaign", message: "Missing Campaign: a published paused campaign is required." });
    else issues.push(...validatePublishedCampaign(input.publishedCampaign));
    if (!("publishedAdGroup" in input) || input.publishedAdGroup === undefined) issues.push({ field: "publishedAdGroup", message: "Missing Campaign: a paused ad group in the published campaign is required." });
    else issues.push(...validatePublishedAdGroup(input.publishedAdGroup, input.publishedCampaign));
    if (!("rsaDraft" in input) || input.rsaDraft === undefined) issues.push({ field: "rsaDraft", message: "Invalid RSA Draft: a responsive search ad draft is required." });
    else issues.push(...validateRsaDraft(input.rsaDraft));
    if (!("developerToken" in input) || textOf(input.developerToken) === "") issues.push({ field: "developerToken", message: "Missing Authentication: a developer token is required." });
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateAdGroupSnapshot(input: unknown): PublishIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: PublishIssue[] = [];
    for (const field of AD_GROUP_PUBLISH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    issues.push(...rejectSecrets(input, ""));
    if (typeof input.publishId !== "string" || !SNAPSHOT_ID.test(input.publishId)) issues.push(invalid("publishId", "a well-formed publish id is required."));
    if (!isPlainRecord(input.publishedAdGroup)) issues.push(invalid("publishedAdGroup", "a published ad group is required."));
    else {
      for (const field of PUBLISHED_AD_GROUP_KEYS) {
        if (input.publishedAdGroup[field] === undefined) issues.push(invalid(`publishedAdGroup.${field}`, `published ad group member "${field}" is missing.`));
      }
      if (input.publishedAdGroup.status !== "PAUSED") issues.push(invalid("publishedAdGroup.status", "the published status must be PAUSED."));
      issues.push(...rejectSecrets(input.publishedAdGroup, "publishedAdGroup"));
    }
    if (!isPlainRecord(input.apiResponse)) issues.push(invalid("apiResponse", "an API response is required."));
    else {
      for (const field of AD_GROUP_API_RESPONSE_KEYS) {
        if (input.apiResponse[field] === undefined) issues.push(invalid(`apiResponse.${field}`, `response member "${field}" is missing.`));
      }
      if (input.apiResponse.observedStatus !== "PAUSED") issues.push(invalid("apiResponse.observedStatus", "the observed status must be PAUSED."));
    }
    issues.push(...validateStatistics(input.statistics));
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a publish context is required."));
    else {
      for (const field of AD_GROUP_PUBLISH_CONTEXT_RECORD_KEYS) {
        if (typeof input.context[field] !== "string") issues.push(invalid(`context.${field}`, `${field} must be text.`));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  function validateRsaSnapshot(input: unknown): PublishIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: PublishIssue[] = [];
    for (const field of RSA_PUBLISH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    issues.push(...rejectSecrets(input, ""));
    if (typeof input.publishId !== "string" || !SNAPSHOT_ID.test(input.publishId)) issues.push(invalid("publishId", "a well-formed publish id is required."));
    if (!isPlainRecord(input.publishedRsa)) issues.push(invalid("publishedRsa", "a published responsive search ad is required."));
    else {
      for (const field of PUBLISHED_RSA_KEYS) {
        if (input.publishedRsa[field] === undefined) issues.push(invalid(`publishedRsa.${field}`, `published ad member "${field}" is missing.`));
      }
      if (input.publishedRsa.status !== "PAUSED") issues.push(invalid("publishedRsa.status", "the published status must be PAUSED."));
      if (!(POLICY_REVIEW_STATUSES as readonly string[]).includes(String(input.publishedRsa.policyReviewStatus))) {
        issues.push(invalid("publishedRsa.policyReviewStatus", "a policy review status is required."));
      }
      if (!(POLICY_APPROVAL_STATUSES as readonly string[]).includes(String(input.publishedRsa.approvalStatus))) {
        issues.push(invalid("publishedRsa.approvalStatus", "a policy approval status is required."));
      }
      issues.push(...rejectSecrets(input.publishedRsa, "publishedRsa"));
    }
    if (!isPlainRecord(input.apiResponse)) issues.push(invalid("apiResponse", "an API response is required."));
    else {
      for (const field of RSA_API_RESPONSE_KEYS) {
        if (input.apiResponse[field] === undefined) issues.push(invalid(`apiResponse.${field}`, `response member "${field}" is missing.`));
      }
      if (input.apiResponse.observedStatus !== "PAUSED") issues.push(invalid("apiResponse.observedStatus", "the observed status must be PAUSED."));
    }
    issues.push(...validateStatistics(input.statistics));
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a publish context is required."));
    else {
      for (const field of RSA_PUBLISH_CONTEXT_RECORD_KEYS) {
        if (typeof input.context[field] !== "string") issues.push(invalid(`context.${field}`, `${field} must be text.`));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateAdGroupInput, validateRsaInput, validateMetadata, validateAdGroupSnapshot, validateRsaSnapshot };
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepPublish<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepPublish(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createPublishStatistics(init: PublishStatistics): PublishStatistics {
  return freezeDeepPublish({
    requestCount: init.requestCount,
    operationCount: init.operationCount,
    publishedCount: init.publishedCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createAdGroupPublishSnapshot(init: {
  publishId: string;
  publishedAdGroup: PublishedAdGroup;
  apiResponse: AdGroupApiResponse;
  statistics: PublishStatistics;
  context: AdGroupPublishContextRecord;
  createdAt: string;
  metadata?: PublishMetadata;
}): AdGroupPublishSnapshot {
  return freezeDeepPublish({
    publishId: init.publishId,
    publishedAdGroup: { ...init.publishedAdGroup },
    apiResponse: { ...init.apiResponse },
    statistics: init.statistics,
    context: {
      draftId: init.context.draftId,
      customerId: init.context.customerId,
      campaignResourceName: init.context.campaignResourceName,
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}

export function createRsaPublishSnapshot(init: {
  publishId: string;
  publishedRsa: PublishedRsa;
  apiResponse: RsaApiResponse;
  statistics: PublishStatistics;
  context: RsaPublishContextRecord;
  createdAt: string;
  metadata?: PublishMetadata;
}): RsaPublishSnapshot {
  return freezeDeepPublish({
    publishId: init.publishId,
    publishedRsa: { ...init.publishedRsa },
    apiResponse: { ...init.apiResponse },
    statistics: init.statistics,
    context: {
      draftId: init.context.draftId,
      customerId: init.context.customerId,
      campaignResourceName: init.context.campaignResourceName,
      adGroupResourceName: init.context.adGroupResourceName,
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}

export function copyAdGroupDraft(draft: AdGroupDraft): AdGroupDraft {
  return {
    draftId: draft.draftId.trim(),
    name: draft.name.trim(),
    status: "PAUSED",
    type: "SEARCH_STANDARD",
    cpcBidMicros: draft.cpcBidMicros,
  };
}

export function copyRsaDraft(draft: RsaDraft): RsaDraft {
  return {
    draftId: draft.draftId.trim(),
    status: "PAUSED",
    headlines: draft.headlines.map((item): RsaHeadline => ({ text: item.text.trim(), pinnedField: item.pinnedField })),
    descriptions: draft.descriptions.map((item): RsaDescription => ({ text: item.text.trim(), pinnedField: item.pinnedField })),
    finalUrls: draft.finalUrls.map((url) => url.trim()),
    path1: draft.path1.trim(),
    path2: draft.path2.trim(),
  };
}

export function copyPublishedCampaign(campaign: PublishedCampaignRef): PublishedCampaignRef {
  return {
    draftId: campaign.draftId.trim(),
    customerId: campaign.customerId.trim(),
    resourceName: campaign.resourceName.trim(),
    campaignId: campaign.campaignId.trim(),
    status: "PAUSED",
    publishedAt: campaign.publishedAt,
  };
}

export function isPolicyReviewStatus(value: unknown): value is PolicyReviewStatus {
  return typeof value === "string" && (POLICY_REVIEW_STATUSES as readonly string[]).includes(value);
}

export function isPolicyApprovalStatus(value: unknown): value is PolicyApprovalStatus {
  return typeof value === "string" && (POLICY_APPROVAL_STATUSES as readonly string[]).includes(value);
}
