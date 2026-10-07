/**
 * Host record domain: real market report validator.
 *
 * Pure local rules for one report. It rejects a missing search snapshot,
 * missing sponsored results, missing landing pages, missing observed
 * products, corrupted evidence, and invalid metadata. It does not change
 * what it is given.
 */
import { REAL_MARKET_REPORT_CONTEXT_MEMBERS, type RealMarketReportMetadata } from "./market-report-context";
import {
  REAL_MARKET_COVERAGE_KEYS,
  REAL_MARKET_REPORT_RECORD_KEYS,
  REAL_MARKET_SNAPSHOT_KEYS,
  REAL_MARKET_STATISTICS_KEYS,
  type RealMarketReportIssue,
} from "./market-report-snapshot";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface RealMarketReportValidator {
  validateInput(input: unknown): RealMarketReportIssue[];
  validateMetadata(input: unknown): RealMarketReportIssue[];
  validateSnapshot(input: unknown): RealMarketReportIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatRealMarketReportMetadata(value: unknown): value is RealMarketReportMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): RealMarketReportIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identityOf(value: Record<string, unknown>): Record<string, unknown> | null {
  if (isPlainRecord(value.identity)) return value.identity;
  if (typeof value.productName === "string") return value;
  return null;
}

export function createRealMarketReportValidator(): RealMarketReportValidator {
  function validateMetadata(input: unknown): RealMarketReportIssue[] {
    if (input === undefined) return [];
    if (!isFlatRealMarketReportMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateInput(input: unknown): RealMarketReportIssue[] {
    if (!isPlainRecord(input)) return [{ field: "searchSnapshot", message: "Missing Search Snapshot: a search snapshot is required." }];
    const issues: RealMarketReportIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(REAL_MARKET_REPORT_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    const search = input.searchSnapshot;
    if (!isPlainRecord(search) || textOf(search.snapshotId) === "" || textOf(search.query) === "" || typeof search.html !== "string") {
      issues.push({ field: "searchSnapshot", message: "Missing Search Snapshot: a search snapshot is required." });
    }
    if (!Array.isArray(input.serpRecords)) issues.push({ field: "serpRecords", message: "Corrupted Evidence: SERP records must be a list." });
    if (!Array.isArray(input.sponsoredResults) || input.sponsoredResults.length === 0) {
      issues.push({ field: "sponsoredResults", message: "Missing Sponsored Results: sponsored results are required." });
    } else {
      input.sponsoredResults.forEach((item, index) => {
        if (!isPlainRecord(item) || textOf(item.url) === "") issues.push({ field: `sponsoredResults.${index}`, message: "Corrupted Evidence: a sponsored result needs an address." });
      });
    }
    if (!Array.isArray(input.landingPageSnapshots) || input.landingPageSnapshots.length === 0) {
      issues.push({ field: "landingPageSnapshots", message: "Missing Landing Pages: landing page snapshots are required." });
    } else {
      input.landingPageSnapshots.forEach((item, index) => {
        if (!isPlainRecord(item) || typeof item.html !== "string" || textOf(item.landingPageId) === "") {
          issues.push({ field: `landingPageSnapshots.${index}`, message: "Corrupted Evidence: a landing page snapshot needs an id and page text." });
        }
      });
    }
    if (!Array.isArray(input.observedProducts) || input.observedProducts.length === 0) {
      issues.push({ field: "observedProducts", message: "Missing Observed Products: observed products are required." });
    } else {
      input.observedProducts.forEach((item, index) => {
        const identity = isPlainRecord(item) ? identityOf(item) : null;
        if (identity === null || textOf(identity.productName) === "") {
          issues.push({ field: `observedProducts.${index}`, message: "Corrupted Evidence: an observed product needs a product name." });
        }
      });
    }
    if (Array.isArray(input.serpRecords)) {
      input.serpRecords.forEach((item, index) => {
        if (!isPlainRecord(item)) issues.push({ field: `serpRecords.${index}`, message: "Corrupted Evidence: a SERP record must be a record." });
      });
    }
    return issues;
  }

  function validateSnapshot(input: unknown): RealMarketReportIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: RealMarketReportIssue[] = [];
    for (const field of REAL_MARKET_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.reportId !== "string" || !SNAPSHOT_ID.test(input.reportId)) issues.push(invalid("reportId", "a well-formed report id is required."));
    if (!isPlainRecord(input.report)) issues.push(invalid("report", "a market report is required."));
    else {
      for (const field of REAL_MARKET_REPORT_RECORD_KEYS) {
        if (input.report[field] === undefined) issues.push(invalid(`report.${field}`, `report member "${field}" is missing.`));
      }
      if ("html" in input.report) issues.push(invalid("report.html", "page text is not copied into the report."));
      if (isPlainRecord(input.report.evidenceCoverage)) {
        for (const field of REAL_MARKET_COVERAGE_KEYS) {
          const value = input.report.evidenceCoverage[field];
          if (value !== "PRESENT" && value !== "ABSENT") issues.push(invalid(`report.evidenceCoverage.${field}`, "coverage must be PRESENT or ABSENT."));
        }
      }
    }
    if (!isPlainRecord(input.graph) || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) {
      issues.push(invalid("graph", "an evidence graph is required."));
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "statistics are required."));
    else {
      for (const field of REAL_MARKET_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a report context is required."));
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot };
}
