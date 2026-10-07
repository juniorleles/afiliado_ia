/**
 * Host record domain: authentication validator.
 *
 * Pure local rules for one authentication run. It rejects missing credentials,
 * an invalid OAuth configuration, and invalid metadata. It does not send a
 * request and does not change what it is given.
 */
import { GOOGLE_AUTH_CONTEXT_MEMBERS, type GoogleAuthMetadata } from "./authentication-context";
import {
  GOOGLE_AUTH_ACCOUNT_KEYS,
  GOOGLE_AUTH_CONTEXT_RECORD_KEYS,
  GOOGLE_AUTH_EVIDENCE_KEYS,
  GOOGLE_AUTH_REGISTRY_KEYS,
  GOOGLE_AUTH_SESSION_KEYS,
  GOOGLE_AUTH_SNAPSHOT_KEYS,
  GOOGLE_AUTH_STATISTICS_KEYS,
  type GoogleAuthIssue,
} from "./authentication-session";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const API_VERSION = /^v[0-9]+$/;
const CONFIGURATION_KEYS = ["clientId", "clientSecret", "developerToken", "refreshToken", "apiVersion"] as const;
const REQUIRED_CREDENTIALS = ["clientId", "clientSecret", "developerToken", "refreshToken"] as const;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;

export interface GoogleAuthValidator {
  validateInput(input: unknown): GoogleAuthIssue[];
  validateMetadata(input: unknown): GoogleAuthIssue[];
  validateSnapshot(input: unknown): GoogleAuthIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatGoogleAuthMetadata(value: unknown): value is GoogleAuthMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): GoogleAuthIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createGoogleAuthValidator(): GoogleAuthValidator {
  function validateMetadata(input: unknown): GoogleAuthIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleAuthMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateConfiguration(configuration: unknown): GoogleAuthIssue[] {
    if (!isPlainRecord(configuration)) {
      return [{ field: "configuration", message: "Missing Credentials: OAuth configuration is required." }];
    }
    const issues: GoogleAuthIssue[] = [];
    for (const key of Object.keys(configuration)) {
      if (!(CONFIGURATION_KEYS as readonly string[]).includes(key)) {
        issues.push({ field: `configuration.${key}`, message: "Invalid OAuth: the OAuth configuration has an unknown member." });
      }
    }
    for (const key of REQUIRED_CREDENTIALS) {
      const value = configuration[key];
      if (typeof value !== "string") {
        issues.push({ field: `configuration.${key}`, message: value === undefined || value === null || value === "" ? "Missing Credentials: a credential is required." : "Invalid OAuth: a credential must be text." });
      } else if (value.trim() === "") {
        issues.push({ field: `configuration.${key}`, message: "Missing Credentials: a credential is required." });
      }
    }
    if ("apiVersion" in configuration && !API_VERSION.test(textOf(configuration.apiVersion))) {
      issues.push({ field: "configuration.apiVersion", message: "Invalid OAuth: the API version must be a version token." });
    }
    return issues;
  }

  function validateInput(input: unknown): GoogleAuthIssue[] {
    if (!isPlainRecord(input)) return [{ field: "configuration", message: "Missing Credentials: OAuth configuration is required." }];
    const issues: GoogleAuthIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(GOOGLE_AUTH_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("configuration" in input) || input.configuration === undefined) {
      issues.push({ field: "configuration", message: "Missing Credentials: OAuth configuration is required." });
    } else {
      issues.push(...validateConfiguration(input.configuration));
    }
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateAccount(account: unknown, field: string): GoogleAuthIssue[] {
    if (!isPlainRecord(account)) return [invalid(field, "an account record is required.")];
    const issues: GoogleAuthIssue[] = [];
    for (const key of GOOGLE_AUTH_ACCOUNT_KEYS) {
      if (account[key] === undefined) issues.push(invalid(`${field}.${key}`, `account member "${key}" is missing.`));
    }
    for (const key of SECRET_KEYS) {
      if (key in account) issues.push(invalid(`${field}.${key}`, "a credential must not be stored on an account."));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleAuthIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: GoogleAuthIssue[] = [];
    for (const field of GOOGLE_AUTH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    for (const key of SECRET_KEYS) {
      if (key in input) issues.push(invalid(key, "a credential must not be stored on a snapshot."));
    }
    if (typeof input.authenticationId !== "string" || !SNAPSHOT_ID.test(input.authenticationId)) issues.push(invalid("authenticationId", "a well-formed authentication id is required."));
    if (!isPlainRecord(input.session)) issues.push(invalid("session", "an authenticated session is required."));
    else {
      for (const field of GOOGLE_AUTH_SESSION_KEYS) {
        if (input.session[field] === undefined) issues.push(invalid(`session.${field}`, `session member "${field}" is missing.`));
      }
      for (const key of SECRET_KEYS) {
        if (key in input.session) issues.push(invalid(`session.${key}`, "a credential must not be stored on a session."));
      }
      if (input.session.authenticated !== true) issues.push(invalid("session.authenticated", "the session must be authenticated."));
    }
    if (!Array.isArray(input.accounts)) issues.push(invalid("accounts", "an account list is required."));
    else input.accounts.forEach((account, index) => issues.push(...validateAccount(account, `accounts.${index}`)));
    if (!isPlainRecord(input.registry)) issues.push(invalid("registry", "a customer registry is required."));
    else {
      for (const field of GOOGLE_AUTH_REGISTRY_KEYS) {
        if (input.registry[field] === undefined) issues.push(invalid(`registry.${field}`, `registry member "${field}" is missing.`));
      }
      for (const key of SECRET_KEYS) {
        if (key in input.registry) issues.push(invalid(`registry.${key}`, "a credential must not be stored on a registry."));
      }
    }
    if (!isPlainRecord(input.evidence)) issues.push(invalid("evidence", "authentication evidence is required."));
    else {
      for (const field of GOOGLE_AUTH_EVIDENCE_KEYS) {
        if (input.evidence[field] === undefined) issues.push(invalid(`evidence.${field}`, `evidence member "${field}" is missing.`));
      }
      if (input.evidence.grantType !== "refresh_token") issues.push(invalid("evidence.grantType", "the grant type must be refresh_token."));
      for (const key of SECRET_KEYS) {
        if (key in input.evidence) issues.push(invalid(`evidence.${key}`, "a credential must not be stored on evidence."));
      }
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "authentication statistics are required."));
    else {
      for (const field of GOOGLE_AUTH_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "an authentication context is required."));
    else {
      for (const field of GOOGLE_AUTH_CONTEXT_RECORD_KEYS) {
        if (!Array.isArray(input.context[field])) issues.push(invalid(`context.${field}`, `${field} must be a list.`));
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
