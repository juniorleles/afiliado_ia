/**
 * Host record domain: token validator.
 *
 * Pure local rules for an offline authentication input, a loaded
 * configuration, token records, a session, and snapshots. It rejects a missing
 * client id, a missing client secret, a missing developer token, a missing
 * customer id, and invalid metadata. It only reports problems: it never opens
 * a token flow, never sends a record, and never changes what it is given.
 * This layer stays offline.
 */
import type { GoogleAdsIssue } from "./google-ads-validator";
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  GOOGLE_ADS_AUTHENTICATION_CONTEXT_KEYS,
  GOOGLE_ADS_AUTHENTICATION_MODES,
  GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS,
  GOOGLE_ADS_SESSION_METADATA_KEYS,
  type GoogleAdsOAuthConfiguration,
  type GoogleAdsTokenRecord,
} from "./google-ads-authentication-snapshot";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = ["configuration", "runtimeMetadata", "executionMetadata"] as const;
const CONTEXT_METADATA = ["runtimeMetadata", "executionMetadata"] as const;
const BLOCKED_CONFIGURATION_KEYS = ["send", "live", "online"] as const;

export interface GoogleAdsTokenValidator {
  validateInput(input: unknown): GoogleAdsIssue[];
  validateConfiguration(input: unknown): GoogleAdsIssue[];
  validateTokens(input: unknown): GoogleAdsIssue[];
  validateSession(input: unknown): GoogleAdsIssue[];
  validateContext(input: unknown): GoogleAdsIssue[];
  validateMetadata(input: unknown): GoogleAdsIssue[];
  validateSnapshot(input: unknown): GoogleAdsIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleAdsAuthenticationMetadata(value: unknown): value is GoogleAdsMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

export function createGoogleAdsTokenValidator(): GoogleAdsTokenValidator {
  function validateMetadata(input: unknown): GoogleAdsIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAdsAuthenticationMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateConfiguration(input: unknown): GoogleAdsIssue[] {
    if (input === undefined || input === null) {
      return [
        { field: "configuration.clientId", message: "Missing Client ID: a client id is required." },
        { field: "configuration.clientSecret", message: "Missing Client Secret: a client secret is required." },
        { field: "configuration.customerId", message: "Missing Customer ID: a customer id is required." },
      ];
    }
    if (!isPlainRecord(input)) {
      return [{ field: "configuration", message: "Invalid Metadata: configuration must be a flat record." }];
    }
    const issues: GoogleAdsIssue[] = [];
    issues.push(...validateMetadata(input).map((item) => ({ field: "configuration", message: item.message })));
    if (textOf(input.clientId) === null) {
      issues.push({ field: "configuration.clientId", message: "Missing Client ID: a client id is required." });
    }
    if (textOf(input.clientSecret) === null) {
      issues.push({ field: "configuration.clientSecret", message: "Missing Client Secret: a client secret is required." });
    }
    if (textOf(input.customerId) === null) {
      issues.push({ field: "configuration.customerId", message: "Missing Customer ID: a customer id is required." });
    }
    if (typeof input.mode === "string" && !(GOOGLE_ADS_AUTHENTICATION_MODES as readonly string[]).includes(input.mode)) {
      issues.push({ field: "configuration.mode", message: "Invalid Metadata: configuration must stay offline." });
    } else if (input.mode !== undefined && typeof input.mode !== "string") {
      issues.push({ field: "configuration.mode", message: "Invalid Metadata: mode must be a text token." });
    }
    for (const key of BLOCKED_CONFIGURATION_KEYS) {
      if (input[key] === true || input[key] === key) {
        issues.push({ field: `configuration.${key}`, message: "Invalid Metadata: configuration must stay offline." });
      }
    }
    if (input.refreshToken !== undefined && input.refreshToken !== null && textOf(input.refreshToken) === null) {
      issues.push({ field: "configuration.refreshToken", message: "Invalid Metadata: a refresh token must be text when listed." });
    }
    if (input.accessToken !== undefined && input.accessToken !== null && textOf(input.accessToken) === null) {
      issues.push({ field: "configuration.accessToken", message: "Invalid Metadata: an access token must be text when listed." });
    }
    if (input.loginCustomerId !== undefined && input.loginCustomerId !== null && textOf(input.loginCustomerId) === null) {
      issues.push({ field: "configuration.loginCustomerId", message: "Invalid Metadata: a login customer id must be text when listed." });
    }
    if (input.environment !== undefined && input.environment !== null && textOf(input.environment) === null) {
      issues.push({ field: "configuration.environment", message: "Invalid Metadata: an environment must be text when listed." });
    }
    return issues;
  }

  function validateTokens(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "tokens", message: "Invalid Metadata: a token record is required." }];
    const issues: GoogleAdsIssue[] = [];
    if (typeof input.sessionId !== "string" || !RECORD_ID.test(input.sessionId)) {
      issues.push({ field: "tokens.sessionId", message: "Invalid Metadata: a well-formed session id is required." });
    }
    if (input.accessToken !== undefined && input.accessToken !== null && textOf(input.accessToken) === null) {
      issues.push({ field: "tokens.accessToken", message: "Invalid Metadata: an access token must be text when listed." });
    }
    if (input.refreshToken !== undefined && input.refreshToken !== null && textOf(input.refreshToken) === null) {
      issues.push({ field: "tokens.refreshToken", message: "Invalid Metadata: a refresh token must be text when listed." });
    }
    return issues;
  }

  function validateInput(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "authentication", message: "Invalid Metadata: an object of configuration and context is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if (!("configuration" in input)) {
      issues.push(...validateConfiguration(undefined));
    } else {
      issues.push(...validateConfiguration(input.configuration));
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      issues.push(...validateMetadata(value).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSession(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "session", message: "Invalid Metadata: a session record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_SESSION_METADATA_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: session member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Metadata: a well-formed session id is required." });
    }
    if (input.mode !== "OFFLINE") {
      issues.push({ field: "mode", message: "Invalid Metadata: a session must stay offline." });
    }
    issues.push(...validateMetadata(input.metadata));
    if (typeof input.createdAt === "string" && !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    return issues;
  }

  function validateContext(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "context", message: "Invalid Metadata: an authentication context is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_AUTHENTICATION_CONTEXT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: context member "${field}" is missing.` });
    }
    if (typeof input.id !== "string" || !RECORD_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Metadata: a well-formed authentication id is required." });
    }
    if (input.mode !== "OFFLINE") {
      issues.push({ field: "mode", message: "Invalid Metadata: a context must stay offline." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAdsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: GoogleAdsIssue[] = [];
    for (const field of GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.authenticationId !== "string" || !RECORD_ID.test(input.authenticationId)) {
      issues.push({ field: "authenticationId", message: "Invalid Metadata: a well-formed authentication id is required." });
    }
    if (input.mode !== "OFFLINE") {
      issues.push({ field: "mode", message: "Invalid Metadata: a snapshot must stay offline." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateConfiguration,
    validateTokens,
    validateSession,
    validateContext,
    validateMetadata,
    validateSnapshot,
  };
}

export function tokenRecordOf(sessionId: string, configuration: GoogleAdsOAuthConfiguration): GoogleAdsTokenRecord {
  return {
    sessionId,
    accessToken: configuration.accessToken,
    refreshToken: configuration.refreshToken,
    developerToken: configuration.developerToken,
  };
}
