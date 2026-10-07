/**
 * Host record domain: product identifier validator.
 *
 * Pure local rules for landing page snapshots. It rejects a missing snapshot,
 * missing page text, page text that is not text, and invalid metadata. It
 * does not change what it is given.
 */
import { PRODUCT_CONTEXT_MEMBERS } from "./product-context";
import { PRODUCT_SNAPSHOT_KEYS } from "./product-snapshot";
import { type ProductIssue, type ProductMetadata } from "./product-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface ProductValidator {
  validateInput(input: unknown): ProductIssue[];
  validateSnapshot(input: unknown): ProductIssue[];
  validateMetadata(input: unknown): ProductIssue[];
  validateIdentification(input: unknown): ProductIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatProductMetadata(value: unknown): value is ProductMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

export function snapshotsOf(input: Record<string, unknown>): unknown[] {
  if (Array.isArray(input.landingPageSnapshots)) return input.landingPageSnapshots;
  if (input.landingPageSnapshot !== undefined) return [input.landingPageSnapshot];
  return [input];
}

export function createProductValidator(): ProductValidator {
  function validateMetadata(input: unknown): ProductIssue[] {
    if (input === undefined) return [];
    if (!isFlatProductMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validatePage(input: unknown, field: string): ProductIssue[] {
    if (input === undefined || input === null) {
      return [{ field, message: "Missing LandingPageSnapshot: a landing page snapshot is required." }];
    }
    if (!isPlainRecord(input)) {
      return [{ field, message: "Missing LandingPageSnapshot: a landing page snapshot is required." }];
    }
    if (typeof input.landingPageId !== "string" || input.landingPageId.trim() === "") {
      return [{ field: `${field}.landingPageId`, message: "Missing LandingPageSnapshot: a landing page id is required." }];
    }
    if (!("html" in input) || input.html === undefined || input.html === null) {
      return [{ field: `${field}.html`, message: "Missing HTML: html is required." }];
    }
    if (typeof input.html !== "string") {
      return [{ field: `${field}.html`, message: "Malformed HTML: html must be text." }];
    }
    return [];
  }

  function validateInput(input: unknown): ProductIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "landingPageSnapshot", message: "Missing LandingPageSnapshot: a landing page snapshot is required." }];
    }
    const wrapped = "landingPageSnapshots" in input || "landingPageSnapshot" in input || METADATA_FIELDS.some((field) => input[field] !== undefined);
    if (!wrapped) return validatePage(input, "landingPageSnapshot");
    const issues: ProductIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(PRODUCT_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if ("landingPageSnapshots" in input) {
      if (!Array.isArray(input.landingPageSnapshots)) {
        issues.push({ field: "landingPageSnapshots", message: "Missing LandingPageSnapshot: a list of landing page snapshots is required." });
      } else if (input.landingPageSnapshots.length === 0) {
        issues.push({ field: "landingPageSnapshots", message: "Missing LandingPageSnapshot: a landing page snapshot is required." });
      } else {
        input.landingPageSnapshots.forEach((page, index) => issues.push(...validatePage(page, `landingPageSnapshots.${index}`)));
      }
    } else if (!("landingPageSnapshot" in input) || input.landingPageSnapshot === undefined || input.landingPageSnapshot === null) {
      issues.push({ field: "landingPageSnapshot", message: "Missing LandingPageSnapshot: a landing page snapshot is required." });
    } else {
      issues.push(...validatePage(input.landingPageSnapshot, "landingPageSnapshot"));
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateIdentification(input: unknown): ProductIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: ProductIssue[] = [];
    for (const field of PRODUCT_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.identificationId !== "string" || !SNAPSHOT_ID.test(input.identificationId)) {
      issues.push({ field: "identificationId", message: "Invalid Metadata: a well-formed identification id is required." });
    }
    if (!Array.isArray(input.products) || input.products.length === 0) {
      issues.push({ field: "products", message: "Missing Product Evidence: an observed product is required." });
    }
    if (!Array.isArray(input.identities) || input.identities.length === 0) {
      issues.push({ field: "identities", message: "Missing Product Evidence: an identity is required." });
    }
    if (!Array.isArray(input.evidence)) {
      issues.push({ field: "evidence", message: "Missing Product Evidence: page evidence is required." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    if (input.origin !== "OBSERVED") issues.push({ field: "origin", message: "Invalid Metadata: origin must be OBSERVED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Invalid Metadata: provenance must be DIRECT_SOURCE." });
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  function validateSnapshot(input: unknown): ProductIssue[] {
    return validatePage(input, "landingPageSnapshot");
  }

  return { validateInput, validateSnapshot, validateMetadata, validateIdentification };
}
