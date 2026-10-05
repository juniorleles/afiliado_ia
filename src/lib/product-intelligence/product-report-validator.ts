/**
 * Host record domain: product intelligence report validator.
 *
 * Pure local rules for a report input, evidence records, the built report,
 * the evidence graph, and snapshots. It rejects missing ProductFacts,
 * missing evidence, a corrupted report, and invalid metadata. It only
 * reports problems: it never fetches a page and never changes what it is
 * given.
 */
import {
  PRODUCT_REPORT_CONTEXT_MEMBERS,
  PRODUCT_REPORT_GRAPH_KEYS,
  PRODUCT_REPORT_KEYS,
  PRODUCT_REPORT_SNAPSHOT_KEYS,
  type ProductReportIssue,
  type ProductReportMetadata,
} from "./product-report-snapshot";

const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const EVIDENCE_MEMBERS = ["landingPageEvidence", "searchEvidence", "competitionEvidence", "commercialEvidence"] as const;

export interface ProductReportValidator {
  validateInput(input: unknown): ProductReportIssue[];
  validateProductFacts(input: unknown): ProductReportIssue[];
  validateEvidence(input: unknown): ProductReportIssue[];
  validateReport(input: unknown): ProductReportIssue[];
  validateMetadata(input: unknown): ProductReportIssue[];
  validateSnapshot(input: unknown): ProductReportIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatProductReportMetadata(value: unknown): value is ProductReportMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function productNameOf(input: Record<string, unknown>): string | null {
  const facts = isPlainRecord(input.productFacts) ? input.productFacts : null;
  return facts ? textOf(facts.productName) ?? textOf(facts.name) : null;
}

export function createProductReportValidator(): ProductReportValidator {
  function validateMetadata(input: unknown): ProductReportIssue[] {
    if (input === undefined) return [];
    if (!isFlatProductReportMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateProductFacts(input: unknown): ProductReportIssue[] {
    if (!isPlainRecord(input) || input.productFacts === undefined || input.productFacts === null) {
      return [{ field: "productFacts", message: "Missing ProductFacts: a ProductFacts record is required." }];
    }
    if (!isPlainRecord(input.productFacts)) {
      return [{ field: "productFacts", message: "Missing ProductFacts: ProductFacts must be a plain record." }];
    }
    return [];
  }

  function validateEvidence(input: unknown): ProductReportIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Missing Evidence: at least one evidence record is required." }];
    }
    const issues: ProductReportIssue[] = [];
    let present = 0;
    for (const key of EVIDENCE_MEMBERS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) {
        issues.push({ field: key, message: `Corrupted Report: ${key} must be a plain record.` });
        continue;
      }
      present += 1;
    }
    if (issues.length === 0 && present === 0) {
      return [{ field: "evidence", message: "Missing Evidence: at least one evidence record is required." }];
    }
    return issues;
  }

  function validateReport(input: unknown): ProductReportIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "report", message: "Corrupted Report: a report record is required." }];
    }
    const issues: ProductReportIssue[] = [];
    for (const field of PRODUCT_REPORT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Corrupted Report: report member "${field}" is missing.` });
    }
    if (!isPlainRecord(input.importedProduct) || textOf(input.importedProduct.productName) === null) {
      issues.push({ field: "importedProduct", message: "Corrupted Report: imported product name is required." });
    }
    if (!isPlainRecord(input.evidenceSummary)) {
      issues.push({ field: "evidenceSummary", message: "Corrupted Report: evidence summary must be a plain record." });
    }
    if (!isPlainRecord(input.dataQuality)) {
      issues.push({ field: "dataQuality", message: "Corrupted Report: data quality must be a plain record." });
    }
    if (!Array.isArray(input.missingEvidence)) {
      issues.push({ field: "missingEvidence", message: "Corrupted Report: missing evidence must be a list." });
    }
    if (!Array.isArray(input.warnings)) {
      issues.push({ field: "warnings", message: "Corrupted Report: warnings must be a list." });
    }
    if (!isPlainRecord(input.evidenceGraph)) {
      issues.push({ field: "evidenceGraph", message: "Corrupted Report: evidence graph must be a plain record." });
    } else {
      for (const field of PRODUCT_REPORT_GRAPH_KEYS) {
        if (!Array.isArray(input.evidenceGraph[field])) {
          issues.push({ field: `evidenceGraph.${field}`, message: `Corrupted Report: evidence graph ${field} must be a list.` });
        }
      }
    }
    if (input.origin !== "OBSERVED") issues.push({ field: "origin", message: "Corrupted Report: origin must be OBSERVED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Corrupted Report: provenance must be DIRECT_SOURCE." });
    return issues;
  }

  function validateInput(input: unknown): ProductReportIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Invalid Metadata: an object of ProductFacts and evidence records is required." }];
    }
    const issues: ProductReportIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(PRODUCT_REPORT_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateProductFacts(input));
    if (productNameOf(input) === null && issues.every((item) => !/Missing ProductFacts/.test(item.message))) {
      issues.push({ field: "productName", message: "Corrupted Report: a product name is required." });
    }
    issues.push(...validateEvidence(input));
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ProductReportIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: ProductReportIssue[] = [];
    for (const field of PRODUCT_REPORT_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.reportId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.reportId)) {
      issues.push({ field: "reportId", message: "Invalid Metadata: a well-formed report id is required." });
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Corrupted Report: a product name is required." });
    }
    if (input.landingPage !== null && (typeof input.landingPage !== "string" || !HTTPS.test(input.landingPage))) {
      issues.push({ field: "landingPage", message: "Corrupted Report: landingPage must be a well-formed https address." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateProductFacts,
    validateEvidence,
    validateReport,
    validateMetadata,
    validateSnapshot,
  };
}
