/**
 * Host record domain: market intelligence report validator.
 *
 * Pure local rules for supplied market artifacts. It rejects a missing
 * search snapshot, a missing SERP list, a missing sponsored list, missing
 * landing pages, missing observed products, evidence that is not in the
 * artifact shape, and invalid metadata. It does not change what it is given.
 */
import { SEARCH_SNAPSHOT_KEYS } from "./google-search-snapshot";
import { LANDING_PAGE_SNAPSHOT_KEYS } from "./landing-page-snapshot";
import { MARKET_REPORT_CONTEXT_MEMBERS } from "./market-report-context";
import { MARKET_GRAPH_KEYS, MARKET_GRAPH_NODE_KINDS, MARKET_REPORT_KEYS, MARKET_REPORT_SNAPSHOT_KEYS, type MarketReportIssue, type MarketReportMetadata } from "./market-report-snapshot";
import { MARKET_REPORT_STATISTICS_KEYS } from "./market-report-statistics";
import { CONFIDENCE_INPUT_KEYS, OBSERVED_PRODUCT_RECORD_KEYS, PRODUCT_EVIDENCE_KEYS, PRODUCT_IDENTITY_KEYS } from "./product-types";
import { SERP_RECORD_KEYS } from "./serp-types";
import { SPONSORED_RESULT_KEYS } from "./sponsored-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const DEVICES = ["desktop", "mobile", "tablet"] as const;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const SEARCH_TEXT = ["snapshotId", "query", "language", "country", "market", "searchUrl", "collectedAt"] as const;

export interface MarketReportValidator {
  validateInput(input: unknown): MarketReportIssue[];
  validateMetadata(input: unknown): MarketReportIssue[];
  validateSnapshot(input: unknown): MarketReportIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatMarketMetadata(value: unknown): value is MarketReportMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): MarketReportIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function corrupt(field: string, message: string): MarketReportIssue {
  return { field, message: `Corrupted Evidence: ${message}` };
}

function missing(field: string, label: string): MarketReportIssue {
  return { field, message: `${label}: a ${field} value is required.` };
}

export function createMarketReportValidator(): MarketReportValidator {
  function validateMetadata(input: unknown): MarketReportIssue[] {
    if (input === undefined) return [];
    if (!isFlatMarketMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function expectKeys(input: Record<string, unknown>, keys: readonly string[], field: string): MarketReportIssue[] {
    const issues: MarketReportIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!keys.includes(key)) issues.push(corrupt(`${field}.${key}`, `unexpected member "${key}".`));
    }
    for (const key of keys) {
      if (input[key] === undefined) issues.push(corrupt(`${field}.${key}`, `member "${key}" is missing.`));
    }
    return issues;
  }

  function validateSearch(input: unknown): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [{ field: "searchSnapshot", message: "Missing SearchSnapshot: a search snapshot is required." }];
    const issues = expectKeys(input, SEARCH_SNAPSHOT_KEYS, "searchSnapshot");
    for (const field of SEARCH_TEXT) {
      const value = input[field];
      if (typeof value !== "string" || value.trim() === "") issues.push(corrupt(`searchSnapshot.${field}`, `${field} must be text.`));
    }
    if (typeof input.html !== "string") issues.push(corrupt("searchSnapshot.html", "html must be text."));
    if (typeof input.device !== "string" || !(DEVICES as readonly string[]).includes(input.device)) issues.push(corrupt("searchSnapshot.device", "device must be desktop, mobile, or tablet."));
    if (input.origin !== "COLLECTED") issues.push(corrupt("searchSnapshot.origin", "origin must be COLLECTED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt("searchSnapshot.provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => corrupt("searchSnapshot.metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  function validateTextOrNull(input: Record<string, unknown>, field: string, key: string, issues: MarketReportIssue[]): void {
    const value = input[key];
    if (value !== null && typeof value !== "string") issues.push(corrupt(`${field}.${key}`, `${key} must be text or null.`));
  }

  function validateSerp(input: unknown, field: string): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt(field, "a SERP record is required.")];
    const issues = expectKeys(input, SERP_RECORD_KEYS, field);
    for (const key of ["title", "url", "description", "resultType", "sponsoredMarker", "organicMarker", "resultMetadata"] as const) validateTextOrNull(input, field, key, issues);
    if (input.position !== null && (typeof input.position !== "number" || !Number.isFinite(input.position))) issues.push(corrupt(`${field}.position`, "position must be a finite number or null."));
    if (input.origin !== "OBSERVED") issues.push(corrupt(`${field}.origin`, "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt(`${field}.provenance`, "provenance must be DIRECT_SOURCE."));
    return issues;
  }

  function validateSponsored(input: unknown, field: string): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt(field, "a sponsored result record is required.")];
    const issues = expectKeys(input, SPONSORED_RESULT_KEYS, field);
    for (const key of ["title", "url", "description", "resultMetadata"] as const) validateTextOrNull(input, field, key, issues);
    if (input.position !== null && (typeof input.position !== "number" || !Number.isFinite(input.position))) issues.push(corrupt(`${field}.position`, "position must be a finite number or null."));
    if (typeof input.sponsoredMarker !== "string") issues.push(corrupt(`${field}.sponsoredMarker`, "a sponsored marker must be text."));
    if (input.origin !== "OBSERVED") issues.push(corrupt(`${field}.origin`, "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt(`${field}.provenance`, "provenance must be DIRECT_SOURCE."));
    return issues;
  }

  function validatePage(input: unknown, field: string): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt(field, "a landing page snapshot is required.")];
    const issues = expectKeys(input, LANDING_PAGE_SNAPSHOT_KEYS, field);
    for (const key of ["landingPageId", "destinationUrl", "finalUrl", "retrievedAt"] as const) {
      const value = input[key];
      if (typeof value !== "string" || value.trim() === "") issues.push(corrupt(`${field}.${key}`, `${key} must be text.`));
    }
    if (typeof input.destinationUrl === "string" && !HTTPS.test(input.destinationUrl)) issues.push(corrupt(`${field}.destinationUrl`, "destinationUrl must be an https address."));
    if (typeof input.finalUrl === "string" && !HTTPS.test(input.finalUrl)) issues.push(corrupt(`${field}.finalUrl`, "finalUrl must be an https address."));
    if (typeof input.httpStatus !== "number" || !Number.isInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) {
      issues.push(corrupt(`${field}.httpStatus`, "httpStatus must be an integer from 100 through 599."));
    }
    if (typeof input.html !== "string") issues.push(corrupt(`${field}.html`, "html must be text."));
    if (input.origin !== "COLLECTED") issues.push(corrupt(`${field}.origin`, "origin must be COLLECTED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt(`${field}.provenance`, "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.headers).map((item) => corrupt(`${field}.headers`, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    issues.push(...validateMetadata(input.metadata).map((item) => corrupt(`${field}.metadata`, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  function validateIdentity(input: unknown, field: string): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt(field, "an observed product is required.")];
    const issues = expectKeys(input, PRODUCT_IDENTITY_KEYS, field);
    const productName = input.productName;
    const landingPageId = input.landingPageId;
    if (typeof productName !== "string" || productName.trim() === "") issues.push(corrupt(`${field}.productName`, "a product name is required."));
    if (typeof landingPageId !== "string" || landingPageId.trim() === "") issues.push(corrupt(`${field}.landingPageId`, "a landing page id is required."));
    for (const key of ["brand", "vendor", "primaryOffer", "primaryDomain", "offerUrl", "category", "language", "visiblePrice", "currency"] as const) validateTextOrNull(input, field, key, issues);
    if (input.origin !== "OBSERVED") issues.push(corrupt(`${field}.origin`, "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt(`${field}.provenance`, "provenance must be DIRECT_SOURCE."));
    return issues;
  }

  function validateEvidence(input: unknown, field: string): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt(field, "page evidence is required.")];
    const issues = expectKeys(input, PRODUCT_EVIDENCE_KEYS, field);
    if (typeof input.landingPageId !== "string" || input.landingPageId.trim() === "") issues.push(corrupt(`${field}.landingPageId`, "a landing page id is required."));
    for (const key of ["htmlTitle", "metaTitle", "openGraphTitle", "h1", "canonicalUrl", "structuredData", "visibleProductName", "visibleBrand", "visiblePrice"] as const) validateTextOrNull(input, field, key, issues);
    for (const key of ["visibleCtas", "brandMentions"] as const) {
      const value = input[key];
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) issues.push(corrupt(`${field}.${key}`, `${key} must be a list of text.`));
    }
    if (input.origin !== "OBSERVED") issues.push(corrupt(`${field}.origin`, "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt(`${field}.provenance`, "provenance must be DIRECT_SOURCE."));
    return issues;
  }

  function validateConfidence(input: unknown, field: string): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt(field, "confidence inputs are required.")];
    const issues = expectKeys(input, CONFIDENCE_INPUT_KEYS, field);
    for (const key of CONFIDENCE_INPUT_KEYS) {
      if (typeof input[key] !== "boolean") issues.push(corrupt(`${field}.${key}`, `${key} must be a boolean.`));
    }
    return issues;
  }

  function validateProduct(input: unknown, field: string): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt(field, "an observed product is required.")];
    if (!("identity" in input)) return validateIdentity(input, field);
    const issues = expectKeys(input, OBSERVED_PRODUCT_RECORD_KEYS, field);
    issues.push(...validateIdentity(input.identity, `${field}.identity`));
    issues.push(...validateEvidence(input.evidence, `${field}.evidence`));
    issues.push(...validateMetadata(input.metadata).map((item) => corrupt(`${field}.metadata`, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    issues.push(...validateConfidence(input.confidenceInputs, `${field}.confidenceInputs`));
    return issues;
  }

  function validateList(input: unknown, field: string, label: string, visit: (item: unknown, field: string) => MarketReportIssue[]): MarketReportIssue[] {
    if (!Array.isArray(input)) return [missing(field, label)];
    const issues: MarketReportIssue[] = [];
    input.forEach((item, index) => issues.push(...visit(item, `${field}.${index}`)));
    return issues;
  }

  function validateInput(input: unknown): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [{ field: "searchSnapshot", message: "Missing SearchSnapshot: a search snapshot is required." }];
    const issues: MarketReportIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(MARKET_REPORT_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("searchSnapshot" in input) || input.searchSnapshot === null || input.searchSnapshot === undefined) {
      issues.push({ field: "searchSnapshot", message: "Missing SearchSnapshot: a search snapshot is required." });
    } else issues.push(...validateSearch(input.searchSnapshot));
    if (!("serpRecords" in input) || input.serpRecords === null || input.serpRecords === undefined) {
      issues.push({ field: "serpRecords", message: "Missing SERP Records: SERP records are required." });
    } else issues.push(...validateList(input.serpRecords, "serpRecords", "Missing SERP Records", validateSerp));
    if (!("sponsoredResults" in input) || input.sponsoredResults === null || input.sponsoredResults === undefined) {
      issues.push({ field: "sponsoredResults", message: "Missing Sponsored Results: sponsored results are required." });
    } else issues.push(...validateList(input.sponsoredResults, "sponsoredResults", "Missing Sponsored Results", validateSponsored));
    if (!("landingPageSnapshots" in input) || input.landingPageSnapshots === null || input.landingPageSnapshots === undefined) {
      issues.push({ field: "landingPageSnapshots", message: "Missing Landing Pages: landing page snapshots are required." });
    } else issues.push(...validateList(input.landingPageSnapshots, "landingPageSnapshots", "Missing Landing Pages", validatePage));
    if (!("observedProducts" in input) || input.observedProducts === null || input.observedProducts === undefined) {
      issues.push({ field: "observedProducts", message: "Missing Observed Products: observed products are required." });
    } else issues.push(...validateList(input.observedProducts, "observedProducts", "Missing Observed Products", validateProduct));
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): MarketReportIssue[] {
    if (!isPlainRecord(input)) return [corrupt("snapshot", "a snapshot record is required.")];
    const issues: MarketReportIssue[] = [];
    for (const field of MARKET_REPORT_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(corrupt(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.reportId !== "string" || !SNAPSHOT_ID.test(input.reportId)) issues.push(corrupt("reportId", "a well-formed report id is required."));
    if (!isPlainRecord(input.report)) issues.push(corrupt("report", "a report record is required."));
    else {
      for (const field of MARKET_REPORT_KEYS) {
        if (input.report[field] === undefined) issues.push(corrupt(`report.${field}`, `report member "${field}" is missing.`));
      }
    }
    if (!isPlainRecord(input.graph)) issues.push(corrupt("graph", "an evidence graph is required."));
    else {
      for (const field of MARKET_GRAPH_KEYS) {
        if (input.graph[field] === undefined) issues.push(corrupt(`graph.${field}`, `graph member "${field}" is missing.`));
      }
      if (!Array.isArray(input.graph.nodes) || input.graph.nodes.length !== MARKET_GRAPH_NODE_KINDS.length) issues.push(corrupt("graph.nodes", "the evidence graph must name each market artifact."));
    }
    if (!isPlainRecord(input.statistics)) issues.push(corrupt("statistics", "statistics are required."));
    else {
      for (const field of MARKET_REPORT_STATISTICS_KEYS) {
        if (typeof input.statistics[field] !== "number" || !Number.isFinite(input.statistics[field])) issues.push(corrupt(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(corrupt("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(corrupt("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => corrupt("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot };
}
