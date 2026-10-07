/**
 * Host record domain: metrics validator.
 *
 * Pure local rules. It rejects a missing session, a missing customer, an
 * unknown campaign resource, a malformed metric, and invalid metadata.
 * It does not send a request and does not change what it is given.
 */
import { METRICS_CONTEXT_MEMBERS, METRICS_SESSION_KEYS, type MetricsMetadata } from "./metrics-context";
import {
  AD_GROUP_METRIC_KEYS,
  CAMPAIGN_METRIC_KEYS,
  METRIC_VALUE_KEYS,
  METRICS_CONTEXT_RECORD_KEYS,
  METRICS_DATE_RANGE,
  METRICS_SNAPSHOT_KEYS,
  METRICS_STATISTICS_KEYS,
  RSA_METRIC_KEYS,
  type MetricsIssue,
} from "./metrics-snapshot";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CUSTOMER_ID = /^\d+$/;
const CAMPAIGN_RESOURCE = /^customers\/(\d+)\/campaigns\/(\d+)$/;
const SECRET_KEYS = ["accessToken", "access_token", "refreshToken", "clientSecret", "developerToken", "client_secret", "refresh_token"] as const;
const NON_NEGATIVE = new Set(["impressions", "clicks", "ctr", "averageCpc", "costMicros", "conversions", "conversionValue", "averageCpm", "searchImpressionShare", "searchTopImpressionShare", "searchAbsoluteTopImpressionShare"]);

export interface MetricsValidator {
  validateInput(input: unknown): MetricsIssue[];
  validateMetadata(input: unknown): MetricsIssue[];
  validateSnapshot(input: unknown): MetricsIssue[];
  campaignNames(input: unknown, customerId: string): string[] | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatMetricsMetadata(value: unknown): value is MetricsMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): MetricsIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function malformed(field: string, message: string): MetricsIssue {
  return { field, message: `Malformed Metrics: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
}

function validateValues(record: Record<string, unknown>, field: string): MetricsIssue[] {
  const issues: MetricsIssue[] = [];
  for (const key of METRIC_VALUE_KEYS) {
    const value = record[key];
    if (value === null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(malformed(`${field}.${key}`, `${key} must be a finite number or null.`));
      continue;
    }
    if (NON_NEGATIVE.has(key) && value < 0) issues.push(malformed(`${field}.${key}`, `${key} must not be negative.`));
  }
  return issues;
}

export function createMetricsValidator(): MetricsValidator {
  function validateMetadata(input: unknown): MetricsIssue[] {
    if (input === undefined) return [];
    if (!isFlatMetricsMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateSession(session: unknown): MetricsIssue[] {
    if (!isPlainRecord(session)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: MetricsIssue[] = [];
    for (const key of Object.keys(session)) {
      if (!(METRICS_SESSION_KEYS as readonly string[]).includes(key)) issues.push({ field: `session.${key}`, message: "Missing Authentication: the session has an unknown member." });
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

  function validateNames(names: unknown, customerId: string): MetricsIssue[] {
    if (!Array.isArray(names) || names.length === 0) return [{ field: "campaignResourceNames", message: "Unknown Campaign: a campaign resource is required." }];
    const issues: MetricsIssue[] = [];
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

  function validateInput(input: unknown): MetricsIssue[] {
    if (!isPlainRecord(input)) return [{ field: "session", message: "Missing Authentication: an authenticated session is required." }];
    const issues: MetricsIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(METRICS_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("session" in input) || input.session === undefined) issues.push({ field: "session", message: "Missing Authentication: an authenticated session is required." });
    else issues.push(...validateSession(input.session));
    const customerId = textOf(input.customerId);
    if (!("customerId" in input) || customerId === "") issues.push({ field: "customerId", message: "Missing Customer: a customer id is required." });
    else if (!CUSTOMER_ID.test(customerId)) issues.push({ field: "customerId", message: "Missing Customer: a customer id is required." });
    if (!("developerToken" in input) || textOf(input.developerToken) === "") issues.push({ field: "developerToken", message: "Missing Authentication: a developer token is required." });
    if (!("campaignResourceNames" in input)) issues.push({ field: "campaignResourceNames", message: "Unknown Campaign: a campaign resource is required." });
    else if (CUSTOMER_ID.test(customerId)) issues.push(...validateNames(input.campaignResourceNames, customerId));
    for (const key of ["executionMetadata", "runtimeMetadata"] as const) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): MetricsIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: MetricsIssue[] = [];
    for (const field of METRICS_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    for (const key of SECRET_KEYS) {
      if (key in input) issues.push(invalid(key, "a credential must not be stored."));
    }
    if (typeof input.collectionId !== "string" || !SNAPSHOT_ID.test(input.collectionId)) issues.push(invalid("collectionId", "a well-formed collection id is required."));
    if (!Array.isArray(input.campaignMetrics)) issues.push(malformed("campaignMetrics", "campaign metrics are required."));
    else {
      input.campaignMetrics.forEach((metric, index) => {
        if (!isPlainRecord(metric) || !exactKeys(metric, CAMPAIGN_METRIC_KEYS)) issues.push(malformed(`campaignMetrics.${index}`, "a campaign metric record is required."));
        else issues.push(...validateValues(metric, `campaignMetrics.${index}`));
      });
    }
    if (!Array.isArray(input.adGroupMetrics)) issues.push(malformed("adGroupMetrics", "ad group metrics are required."));
    else {
      input.adGroupMetrics.forEach((metric, index) => {
        if (!isPlainRecord(metric) || !exactKeys(metric, AD_GROUP_METRIC_KEYS)) issues.push(malformed(`adGroupMetrics.${index}`, "an ad group metric record is required."));
        else issues.push(...validateValues(metric, `adGroupMetrics.${index}`));
      });
    }
    if (!Array.isArray(input.rsaMetrics)) issues.push(malformed("rsaMetrics", "responsive search ad metrics are required."));
    else {
      input.rsaMetrics.forEach((metric, index) => {
        if (!isPlainRecord(metric) || !exactKeys(metric, RSA_METRIC_KEYS)) issues.push(malformed(`rsaMetrics.${index}`, "a responsive search ad metric record is required."));
        else issues.push(...validateValues(metric, `rsaMetrics.${index}`));
      });
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "collection statistics are required."));
    else {
      for (const field of METRICS_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a collection context is required."));
    else {
      for (const field of METRICS_CONTEXT_RECORD_KEYS) {
        if (input.context[field] === undefined) issues.push(invalid(`context.${field}`, `${field} is required.`));
      }
      if (input.context.dateRange !== METRICS_DATE_RANGE) issues.push(invalid("context.dateRange", "the date range must be the collected window."));
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot, campaignNames };
}
