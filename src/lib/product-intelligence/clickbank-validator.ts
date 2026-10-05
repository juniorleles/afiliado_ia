/**
 * Host record domain: ClickBank import validator.
 *
 * Pure local rules for an import input, extracted records, URLs, and
 * snapshots. It rejects a malformed URL, a missing product, a missing vendor,
 * a duplicate import, and invalid metadata. It only reports problems: it
 * never fetches a page and never changes what it is given.
 */
import { CLICKBANK_CONTEXT_MEMBERS } from "./clickbank-context";
import { CLICKBANK_SNAPSHOT_KEYS, type ClickBankIssue, type ClickBankMetadata } from "./clickbank-types";

const RECORD_ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface ClickBankValidator {
  validateInput(input: unknown): ClickBankIssue[];
  validateUrl(input: unknown, field?: string): ClickBankIssue[];
  validateProduct(input: unknown): ClickBankIssue[];
  validateVendor(input: unknown): ClickBankIssue[];
  validateMetadata(input: unknown): ClickBankIssue[];
  validateSnapshot(input: unknown): ClickBankIssue[];
  detectDuplicate(productId: string, seen: ReadonlySet<string>): ClickBankIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatClickBankMetadata(value: unknown): value is ClickBankMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function createClickBankValidator(): ClickBankValidator {
  function validateMetadata(input: unknown): ClickBankIssue[] {
    if (input === undefined) return [];
    if (!isFlatClickBankMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateUrl(input: unknown, field = "url"): ClickBankIssue[] {
    if (input === undefined || input === null || input === "") {
      return [{ field, message: `Malformed URL: ${field} is required.` }];
    }
    if (typeof input !== "string" || !HTTPS.test(input.trim())) {
      return [{ field, message: `Malformed URL: ${field} must be a well-formed https address.` }];
    }
    return [];
  }

  function validateProduct(input: unknown): ClickBankIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "product", message: "Missing Product: a product record is required." }];
    }
    const name = textOf(input.productName);
    const id = textOf(input.marketplaceProductId) ?? textOf(input.productId) ?? textOf(input.id);
    if (name === null) {
      return [{ field: "productName", message: "Missing Product: a product name is required." }];
    }
    if (id === null) {
      return [{ field: "marketplaceProductId", message: "Missing Product: a marketplace product id is required." }];
    }
    return [];
  }

  function validateVendor(input: unknown): ClickBankIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "vendor", message: "Missing Vendor: a vendor record is required." }];
    }
    if (textOf(input.vendor) === null) {
      return [{ field: "vendor", message: "Missing Vendor: a vendor name is required." }];
    }
    return [];
  }

  function detectDuplicate(productId: string, seen: ReadonlySet<string>): ClickBankIssue[] {
    if (seen.has(productId)) {
      return [{ field: "marketplaceProductId", message: `Duplicate Import: "${productId}" was already imported.` }];
    }
    return [];
  }

  function validateInput(input: unknown): ClickBankIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "importer", message: "Invalid Metadata: an object of a marketplace URL, product id, and HTML is required." }];
    }
    const issues: ClickBankIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(CLICKBANK_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateUrl(input.marketplaceUrl, "marketplaceUrl"));
    const productId = textOf(input.marketplaceProductId);
    if (productId === null || !RECORD_ID.test(productId)) {
      issues.push({ field: "marketplaceProductId", message: "Missing Product: a well-formed marketplace product id is required." });
    }
    if (input.rawHtml !== undefined && typeof input.rawHtml !== "string") {
      issues.push({ field: "rawHtml", message: "Invalid Metadata: rawHtml must be text." });
    }
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ClickBankIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: ClickBankIssue[] = [];
    for (const field of CLICKBANK_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.importId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.importId)) {
      issues.push({ field: "importId", message: "Invalid Metadata: a well-formed import id is required." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateUrl,
    validateProduct,
    validateVendor,
    validateMetadata,
    validateSnapshot,
    detectDuplicate,
  };
}
