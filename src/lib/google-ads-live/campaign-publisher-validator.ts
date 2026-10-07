/**
 * Host record domain: campaign publish validator.
 *
 * Pure local rules for one publish run. It rejects a missing session, a
 * missing customer, an invalid draft, and invalid metadata. It does not send
 * a request and does not change what it is given.
 */
import { CAMPAIGN_DRAFT_KEYS, CAMPAIGN_PUBLISH_CONTEXT_MEMBERS, type CampaignPublishMetadata } from "./campaign-publisher-context";
import {
  CAMPAIGN_API_RESPONSE_KEYS,
  CAMPAIGN_PUBLISH_CONTEXT_RECORD_KEYS,
  CAMPAIGN_PUBLISH_SNAPSHOT_KEYS,
  CAMPAIGN_PUBLISH_STATISTICS_KEYS,
  PUBLISHED_CAMPAIGN_KEYS,
  type CampaignPublishIssue,
} from "./campaign-publisher-session";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CUSTOMER_ID = /^\d+$/;
const SESSION_KEYS = ["sessionId", "authenticated", "tokenType", "expiresIn", "accessToken"] as const;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;

export interface CampaignPublishValidator {
  validateInput(input: unknown): CampaignPublishIssue[];
  validateMetadata(input: unknown): CampaignPublishIssue[];
  validateSnapshot(input: unknown): CampaignPublishIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatCampaignPublishMetadata(value: unknown): value is CampaignPublishMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): CampaignPublishIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createCampaignPublishValidator(): CampaignPublishValidator {
  function validateMetadata(input: unknown): CampaignPublishIssue[] {
    if (input === undefined) return [];
    if (!isFlatCampaignPublishMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateDraft(draft: unknown): CampaignPublishIssue[] {
    if (!isPlainRecord(draft)) return [{ field: "draft", message: "Invalid Campaign Draft: a campaign draft is required." }];
    const issues: CampaignPublishIssue[] = [];
    for (const key of Object.keys(draft)) {
      if (!(CAMPAIGN_DRAFT_KEYS as readonly string[]).includes(key)) {
        issues.push({ field: `draft.${key}`, message: "Invalid Campaign Draft: the draft has an unknown member." });
      }
    }
    if (!SNAPSHOT_ID.test(textOf(draft.draftId))) issues.push({ field: "draft.draftId", message: "Invalid Campaign Draft: a draft id is required." });
    if (textOf(draft.name) === "" || textOf(draft.name).length > 255) issues.push({ field: "draft.name", message: "Invalid Campaign Draft: a campaign name is required." });
    if (textOf(draft.budgetName) === "" || textOf(draft.budgetName).length > 255) issues.push({ field: "draft.budgetName", message: "Invalid Campaign Draft: a budget name is required." });
    if (draft.status !== "PAUSED") issues.push({ field: "draft.status", message: "Invalid Campaign Draft: the only accepted status is PAUSED." });
    if (draft.channelType !== "SEARCH") issues.push({ field: "draft.channelType", message: "Invalid Campaign Draft: the channel type must be SEARCH." });
    if (typeof draft.amountMicros !== "number" || !Number.isSafeInteger(draft.amountMicros) || draft.amountMicros <= 0) {
      issues.push({ field: "draft.amountMicros", message: "Invalid Campaign Draft: the supplied amount must be a positive integer." });
    }
    if (draft.deliveryMethod !== "STANDARD") issues.push({ field: "draft.deliveryMethod", message: "Invalid Campaign Draft: the delivery method must be STANDARD." });
    if (draft.bidding !== "MANUAL_CPC") issues.push({ field: "draft.bidding", message: "Invalid Campaign Draft: the bidding value must be MANUAL_CPC." });
    for (const key of ["targetGoogleSearch", "targetSearchNetwork", "targetContentNetwork"] as const) {
      if (typeof draft[key] !== "boolean") issues.push({ field: `draft.${key}`, message: "Invalid Campaign Draft: a network flag must be a boolean." });
    }
    return issues;
  }

  function validateSession(session: unknown): CampaignPublishIssue[] {
    if (!isPlainRecord(session)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: CampaignPublishIssue[] = [];
    for (const key of Object.keys(session)) {
      if (!(SESSION_KEYS as readonly string[]).includes(key)) issues.push({ field: `session.${key}`, message: "Missing Authentication: the session has an unknown member." });
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

  function validateInput(input: unknown): CampaignPublishIssue[] {
    if (!isPlainRecord(input)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: CampaignPublishIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(CAMPAIGN_PUBLISH_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("session" in input) || input.session === undefined) issues.push({ field: "session", message: "Missing Authentication: an authenticated session is required." });
    else issues.push(...validateSession(input.session));
    if (!("customerId" in input) || textOf(input.customerId) === "") issues.push({ field: "customerId", message: "Missing Customer: a customer id is required." });
    else if (!CUSTOMER_ID.test(textOf(input.customerId))) issues.push({ field: "customerId", message: "Missing Customer: a customer id is required." });
    if (!("developerToken" in input) || textOf(input.developerToken) === "") issues.push({ field: "developerToken", message: "Missing Authentication: a developer token is required." });
    if (!("draft" in input) || input.draft === undefined) issues.push({ field: "draft", message: "Invalid Campaign Draft: a campaign draft is required." });
    else issues.push(...validateDraft(input.draft));
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): CampaignPublishIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: CampaignPublishIssue[] = [];
    for (const field of CAMPAIGN_PUBLISH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    for (const key of SECRET_KEYS) {
      if (key in input) issues.push(invalid(key, "a credential must not be stored on a snapshot."));
    }
    if (typeof input.publishId !== "string" || !SNAPSHOT_ID.test(input.publishId)) issues.push(invalid("publishId", "a well-formed publish id is required."));
    if (!isPlainRecord(input.publishedCampaign)) issues.push(invalid("publishedCampaign", "a published campaign is required."));
    else {
      for (const field of PUBLISHED_CAMPAIGN_KEYS) {
        if (input.publishedCampaign[field] === undefined) issues.push(invalid(`publishedCampaign.${field}`, `published campaign member "${field}" is missing.`));
      }
      if (input.publishedCampaign.status !== "PAUSED") issues.push(invalid("publishedCampaign.status", "the published status must be PAUSED."));
      for (const key of SECRET_KEYS) {
        if (key in input.publishedCampaign) issues.push(invalid(`publishedCampaign.${key}`, "a credential must not be stored on a published campaign."));
      }
    }
    if (!isPlainRecord(input.apiResponse)) issues.push(invalid("apiResponse", "an API response is required."));
    else {
      for (const field of CAMPAIGN_API_RESPONSE_KEYS) {
        if (input.apiResponse[field] === undefined) issues.push(invalid(`apiResponse.${field}`, `response member "${field}" is missing.`));
      }
      if (input.apiResponse.observedStatus !== "PAUSED") issues.push(invalid("apiResponse.observedStatus", "the observed status must be PAUSED."));
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "publish statistics are required."));
    else {
      for (const field of CAMPAIGN_PUBLISH_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a publish context is required."));
    else {
      for (const field of CAMPAIGN_PUBLISH_CONTEXT_RECORD_KEYS) {
        if (typeof input.context[field] !== "string") issues.push(invalid(`context.${field}`, `${field} must be text.`));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot };
}
