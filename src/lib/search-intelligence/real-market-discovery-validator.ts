/**
 * Host record domain: real market discovery pipeline validator.
 *
 * Pure local rules for one pipeline request. It rejects a missing keyword
 * and invalid pipeline metadata. It does not change what it is given.
 */
import { REAL_MARKET_DISCOVERY_CONTEXT_MEMBERS, type RealMarketDiscoveryMetadata } from "./real-market-discovery-context";
import {
  REAL_MARKET_DISCOVERY_SNAPSHOT_KEYS,
  REAL_MARKET_DISCOVERY_STAGES,
  REAL_MARKET_DISCOVERY_STATISTICS_KEYS,
  type RealMarketDiscoveryIssue,
} from "./real-market-discovery-snapshot";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface RealMarketDiscoveryValidator {
  validateInput(input: unknown): RealMarketDiscoveryIssue[];
  validateMetadata(input: unknown): RealMarketDiscoveryIssue[];
  validateSnapshot(input: unknown): RealMarketDiscoveryIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatRealMarketDiscoveryMetadata(value: unknown): value is RealMarketDiscoveryMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): RealMarketDiscoveryIssue {
  return { field, message: `Invalid Pipeline Metadata: ${message}` };
}

export function createRealMarketDiscoveryValidator(): RealMarketDiscoveryValidator {
  function validateMetadata(input: unknown): RealMarketDiscoveryIssue[] {
    if (input === undefined) return [];
    if (!isFlatRealMarketDiscoveryMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateInput(input: unknown): RealMarketDiscoveryIssue[] {
    if (!isPlainRecord(input)) return [{ field: "keyword", message: "Missing Keyword: a keyword is required." }];
    const issues: RealMarketDiscoveryIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(REAL_MARKET_DISCOVERY_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (typeof input.keyword !== "string" || input.keyword.trim() === "") {
      issues.push({ field: "keyword", message: "Missing Keyword: a keyword is required." });
    }
    if ("pages" in input && input.pages !== undefined && !Array.isArray(input.pages)) {
      issues.push(invalid("pages", "pages must be a list."));
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Pipeline Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): RealMarketDiscoveryIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: RealMarketDiscoveryIssue[] = [];
    for (const field of REAL_MARKET_DISCOVERY_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.analysisId !== "string" || !SNAPSHOT_ID.test(input.analysisId)) issues.push(invalid("analysisId", "a well-formed analysis id is required."));
    if (!isPlainRecord(input.searchSnapshot)) issues.push(invalid("searchSnapshot", "a search snapshot is required."));
    if (!Array.isArray(input.serpRecords)) issues.push(invalid("serpRecords", "SERP records are required."));
    if (!Array.isArray(input.sponsoredResults)) issues.push(invalid("sponsoredResults", "sponsored results are required."));
    if (!Array.isArray(input.landingPageSnapshots)) issues.push(invalid("landingPageSnapshots", "landing page snapshots are required."));
    if (!Array.isArray(input.observedProducts)) issues.push(invalid("observedProducts", "observed products are required."));
    if (!isPlainRecord(input.report)) issues.push(invalid("report", "a market report is required."));
    if (!isPlainRecord(input.graph)) issues.push(invalid("graph", "an evidence graph is required."));
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a pipeline context is required."));
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "statistics are required."));
    else {
      for (const field of REAL_MARKET_DISCOVERY_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
      if (input.statistics.stageCount !== REAL_MARKET_DISCOVERY_STAGES.length || input.statistics.completedCount !== REAL_MARKET_DISCOVERY_STAGES.length) {
        issues.push(invalid("statistics", "every host must have completed once."));
      }
    }
    if (!Array.isArray(input.executions) || input.executions.length !== REAL_MARKET_DISCOVERY_STAGES.length) {
      issues.push(invalid("executions", "every host must have run once."));
    } else {
      input.executions.forEach((entry, index) => {
        if (!isPlainRecord(entry) || entry.stage !== REAL_MARKET_DISCOVERY_STAGES[index] || entry.count !== 1) {
          issues.push(invalid(`executions.${index}`, "every host must have run once."));
        }
      });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Pipeline Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot };
}
