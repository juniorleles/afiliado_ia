/**
 * Host record domain: publish validator.
 *
 * Pure local rules for an explicit publish input, a named operation, and a
 * publish result. It rejects an invalid execution plan, missing
 * authentication, an unsupported operation, a malformed provider response,
 * and invalid metadata. It only reports problems: it never retries and never
 * changes what it is given. This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  GOOGLE_ADS_PUBLISH_OPERATIONS,
  GOOGLE_ADS_PUBLISH_RESULT_KEYS,
  GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS,
} from "./google-ads-publish-snapshot";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const INPUT_MEMBERS = [
  "executionPlan",
  "provider",
  "authenticationContext",
  "operation",
  "campaignId",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface GoogleAdsPublishValidator {
  validateInput(input: unknown): GoogleAdsIssue[];
  validatePlan(input: unknown): GoogleAdsIssue[];
  validateAuthentication(input: unknown): GoogleAdsIssue[];
  validateOperation(input: unknown): GoogleAdsIssue[];
  validateResult(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsPublishMetadata(value: unknown): value is GoogleAdsMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function createGoogleAdsPublishValidator(): GoogleAdsPublishValidator {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsPublishMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validatePlan(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input) || textOf(input.id) === null) {
      return [{ field: "executionPlan", message: "Invalid Execution Plan: a resolved execution plan id is required." }];
    }
    return [];
  }

  function validateAuthentication(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "authenticationContext", message: "Missing Authentication: an authentication context is required." }];
    }
    const issues: GoogleAdsIssue[] = [];
    if (textOf(input.sessionId) === null || textOf(input.clientId) === null) {
      issues.push({ field: "authenticationContext", message: "Missing Authentication: a session id and a client id are required." });
    }
    if (typeof input.mode === "string" && input.mode !== "OFFLINE") {
      issues.push({ field: "authenticationContext.mode", message: "Authentication Failure: the session must stay offline." });
    }
    return issues;
  }

  function validateOperation(input: unknown): GoogleAdsIssue[] {
    if (typeof input !== "string" || !(GOOGLE_ADS_PUBLISH_OPERATIONS as readonly string[]).includes(input)) {
      return [{ field: "operation", message: `Unsupported Operation: "${String(input)}" is not supported.` }];
    }
    return [];
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "publish", message: "Invalid Metadata: an object of a plan, provider, session, and operation is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if (!("executionPlan" in input)) issues.push({ field: "executionPlan", message: "Invalid Execution Plan: a resolved execution plan is required." });
    else issues.push(...validatePlan(input.executionPlan));
    if (!isPlainRecord(input.provider) || textOf(input.provider.id) === null) {
      issues.push({ field: "provider", message: "Invalid Execution Plan: a resolved provider id is required." });
    }
    if (!("authenticationContext" in input)) {
      issues.push({ field: "authenticationContext", message: "Missing Authentication: an authentication context is required." });
    } else {
      issues.push(...validateAuthentication(input.authenticationContext));
    }
    if (!("operation" in input)) issues.push({ field: "operation", message: "Unsupported Operation: an explicit operation is required." });
    else issues.push(...validateOperation(input.operation));
    const operation = textOf(input.operation);
    if (operation && operation !== "CREATE" && textOf(input.campaignId) === null) {
      issues.push({ field: "campaignId", message: "Invalid Execution Plan: a campaign id is required for this operation." });
    }
    for (const key of CONTEXT_METADATA) issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    return issues;
  }

  function validateResult(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "result", message: "Malformed Provider Response: a publish result is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_PUBLISH_RESULT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Malformed Provider Response: result member "${field}" is missing.` });
    }
    if (!isPlainRecord(input.response)) {
      issues.push({ field: "response", message: "Malformed Provider Response: a provider response object is required." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.publishId !== "string" || !RECORD_ID.test(input.publishId)) {
      issues.push({ field: "publishId", message: "Invalid Metadata: a well-formed publish id is required." });
    }
    return issues;
  }

  return {
    validateInput,
    validatePlan,
    validateAuthentication,
    validateOperation,
    validateResult,
    validateMetadata,
    validateSnapshot,
  };
}
