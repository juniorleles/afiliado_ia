/**
 * Host record domain: real product identifier validator.
 *
 * Pure local rules for one identification. It rejects missing HTML, malformed
 * HTML, missing product evidence, and missing metadata. It does not change
 * what it is given.
 */
import { REAL_PRODUCT_CONTEXT_MEMBERS, type RealProductMetadata } from "./product-context";
import {
  REAL_PRODUCT_CONFIDENCE_KEYS,
  REAL_PRODUCT_EVIDENCE_KEYS,
  REAL_PRODUCT_EVIDENCE_METADATA_KEYS,
  REAL_PRODUCT_IDENTITY_KEYS,
  REAL_PRODUCT_SESSION_KEYS,
  REAL_PRODUCT_STATISTICS_KEYS,
  type RealProductIssue,
} from "./product-evidence-builder";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface RealProductValidator {
  validateInput(input: unknown): RealProductIssue[];
  validateMetadata(input: unknown): RealProductIssue[];
  validatePage(input: unknown, field: string): RealProductIssue[];
  validateSnapshot(input: unknown): RealProductIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatRealProductMetadata(value: unknown): value is RealProductMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function missingMeta(field: string, message: string): RealProductIssue {
  return { field, message: `Missing Metadata: ${message}` };
}

export function createRealProductValidator(): RealProductValidator {
  function validateMetadata(input: unknown): RealProductIssue[] {
    if (input === undefined) return [];
    if (!isFlatRealProductMetadata(input)) return [missingMeta("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validatePage(input: unknown, field: string): RealProductIssue[] {
    if (!isPlainRecord(input)) return [{ field, message: "Missing HTML: a landing page snapshot is required." }];
    if (!("html" in input) || input.html === undefined || input.html === null) {
      return [{ field: `${field}.html`, message: "Missing HTML: html is required." }];
    }
    if (typeof input.html !== "string") return [{ field: `${field}.html`, message: "Malformed HTML: html must be text." }];
    if (input.html.trim() === "") return [{ field: `${field}.html`, message: "Missing HTML: html is required." }];
    if (typeof input.landingPageId !== "string" || !SNAPSHOT_ID.test(input.landingPageId)) {
      return [missingMeta(`${field}.landingPageId`, "a well-formed landing page id is required.")];
    }
    return [];
  }

  function validateInput(input: unknown): RealProductIssue[] {
    if (!isPlainRecord(input)) return [{ field: "landingPageSnapshots", message: "Missing HTML: a landing page snapshot is required." }];
    const issues: RealProductIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(REAL_PRODUCT_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(missingMeta(key, `unexpected member "${key}".`));
    }
    if (!Array.isArray(input.landingPageSnapshots) || input.landingPageSnapshots.length === 0) {
      issues.push({ field: "landingPageSnapshots", message: "Missing HTML: a landing page snapshot is required." });
    } else {
      input.landingPageSnapshots.forEach((page, index) => issues.push(...validatePage(page, `landingPageSnapshots.${index}`)));
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => missingMeta(key, item.message.replace(/^Missing Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): RealProductIssue[] {
    if (!isPlainRecord(input)) return [missingMeta("snapshot", "a snapshot record is required.")];
    const issues: RealProductIssue[] = [];
    for (const field of REAL_PRODUCT_SESSION_KEYS) {
      if (input[field] === undefined) issues.push(missingMeta(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.sessionId !== "string" || !SNAPSHOT_ID.test(input.sessionId)) issues.push(missingMeta("sessionId", "a well-formed session id is required."));
    if (!Array.isArray(input.products) || input.products.length === 0) {
      issues.push({ field: "products", message: "Missing Product Evidence: an observed product is required." });
    } else {
      input.products.forEach((product, index) => {
        if (!isPlainRecord(product)) {
          issues.push({ field: `products.${index}`, message: "Missing Product Evidence: an observed product is required." });
          return;
        }
        for (const field of ["identity", "evidence", "evidenceMetadata", "confidenceInputs"] as const) {
          if (!isPlainRecord(product[field])) issues.push(missingMeta(`products.${index}.${field}`, `a ${field} record is required.`));
        }
        if (isPlainRecord(product.identity)) {
          for (const field of REAL_PRODUCT_IDENTITY_KEYS) {
            if (product.identity[field] === undefined) issues.push(missingMeta(`products.${index}.identity.${field}`, `identity member "${field}" is missing.`));
          }
          if (typeof product.identity.productName !== "string" || product.identity.productName.trim() === "") {
            issues.push({ field: `products.${index}.identity.productName`, message: "Missing Product Evidence: a product name shown on the page is required." });
          }
        }
        if (isPlainRecord(product.evidence)) {
          for (const field of REAL_PRODUCT_EVIDENCE_KEYS) {
            if (product.evidence[field] === undefined) issues.push(missingMeta(`products.${index}.evidence.${field}`, `evidence member "${field}" is missing.`));
          }
        }
        if (isPlainRecord(product.evidenceMetadata)) {
          for (const field of REAL_PRODUCT_EVIDENCE_METADATA_KEYS) {
            if (product.evidenceMetadata[field] === undefined) issues.push(missingMeta(`products.${index}.evidenceMetadata.${field}`, `evidence metadata member "${field}" is missing.`));
          }
        }
        if (isPlainRecord(product.confidenceInputs)) {
          for (const field of REAL_PRODUCT_CONFIDENCE_KEYS) {
            if (typeof product.confidenceInputs[field] !== "boolean") issues.push(missingMeta(`products.${index}.confidenceInputs.${field}`, `${field} must be a boolean.`));
          }
        }
      });
    }
    if (!isPlainRecord(input.graph) || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) {
      issues.push(missingMeta("graph", "an evidence graph is required."));
    }
    if (!isPlainRecord(input.statistics)) issues.push(missingMeta("statistics", "statistics are required."));
    else {
      for (const field of REAL_PRODUCT_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(missingMeta(`statistics.${field}`, `${field} must be a finite number.`));
      }
      if (Array.isArray(input.products) && input.statistics.observedProductCount !== input.products.length) {
        issues.push(missingMeta("statistics.observedProductCount", "observedProductCount must match the stored products."));
      }
    }
    if (!isPlainRecord(input.context) || !Array.isArray(input.context.landingPageIds)) issues.push(missingMeta("context", "an identification context is required."));
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(missingMeta("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(missingMeta("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(missingMeta("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => missingMeta("metadata", item.message.replace(/^Missing Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validatePage, validateSnapshot };
}
