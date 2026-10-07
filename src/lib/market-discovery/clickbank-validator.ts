/**
 * Host record domain: marketplace resolution validator.
 *
 * Pure local rules for an observed product and supplied listing records.
 * It rejects a missing product, listing metadata that is not flat, an
 * ambiguous match, and a resolution that cannot be stored. It does not
 * change what it is given.
 */
import { CLICKBANK_CONTEXT_MEMBERS } from "./clickbank-context";
import { RESOLUTION_SNAPSHOT_KEYS } from "./clickbank-snapshot";
import {
  MARKETPLACE_MONEY_KEYS,
  MARKETPLACE_RECORD_KEYS,
  MATCH_CONFIDENCE,
  MATCH_METHODS,
  OBSERVED_PRODUCT_KEYS,
  RESOLVED_PRODUCT_KEYS,
  RESOLUTION_EVIDENCE_KEYS,
  type ClickBankIssue,
  type ResolutionMetadata,
} from "./clickbank-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const TEXT_FIELDS = ["vendor", "brand", "offerUrl", "primaryDomain", "primaryOffer", "category", "language", "visiblePrice", "currency", "landingPageId", "origin", "provenance"] as const;
const RECORD_TEXT_FIELDS = ["vendor", "commissionType", "category", "language"] as const;
const MONEY_FIELDS = ["initialSale", "averageSale", "averageRebill"] as const;

export interface ClickBankValidator {
  validateInput(input: unknown): ClickBankIssue[];
  validateRecord(input: unknown): ClickBankIssue[];
  validateMetadata(input: unknown): ClickBankIssue[];
  validateResolution(input: unknown): ClickBankIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatResolutionMetadata(value: unknown): value is ResolutionMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): ClickBankIssue {
  return { field, message: `Invalid Marketplace Metadata: ${message}` };
}

export function createClickBankValidator(): ClickBankValidator {
  function validateMetadata(input: unknown): ClickBankIssue[] {
    if (input === undefined) return [];
    if (!isFlatResolutionMetadata(input)) {
      return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    }
    return [];
  }

  function validateMoney(input: unknown, field: string): ClickBankIssue[] {
    if (input === undefined || input === null) return [];
    if (!isPlainRecord(input)) return [invalid(field, "a sale record must contain an amount, a currency, and text.")];
    const issues: ClickBankIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(MARKETPLACE_MONEY_KEYS as readonly string[]).includes(key)) issues.push(invalid(`${field}.${key}`, `unexpected sale member "${key}".`));
    }
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount)) issues.push(invalid(`${field}.amount`, "a sale amount must be a finite number."));
    if (typeof input.currency !== "string" || input.currency.trim() === "") issues.push(invalid(`${field}.currency`, "a sale currency must be text."));
    if (typeof input.text !== "string") issues.push(invalid(`${field}.text`, "sale text must be text."));
    return issues;
  }

  function validateRecord(input: unknown): ClickBankIssue[] {
    if (!isPlainRecord(input)) return [invalid("marketplaceRecords", "a listing record is required.")];
    const issues: ClickBankIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(MARKETPLACE_RECORD_KEYS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected listing member "${key}".`));
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push(invalid("productName", "a listing product name is required."));
    }
    for (const field of RECORD_TEXT_FIELDS) {
      const value = input[field];
      if (value !== undefined && value !== null && typeof value !== "string") issues.push(invalid(field, `${field} must be text or null.`));
    }
    if (input.marketplaceUrl !== undefined && input.marketplaceUrl !== null && (typeof input.marketplaceUrl !== "string" || !HTTPS.test(input.marketplaceUrl))) {
      issues.push(invalid("marketplaceUrl", "a marketplace address must be an https address or null."));
    }
    if (input.gravity !== undefined && input.gravity !== null && (typeof input.gravity !== "number" || !Number.isFinite(input.gravity))) {
      issues.push(invalid("gravity", "gravity must be a finite number or null."));
    }
    for (const field of MONEY_FIELDS) issues.push(...validateMoney(input[field], field));
    if (input.affiliateResources !== undefined) {
      if (!Array.isArray(input.affiliateResources) || input.affiliateResources.some((item) => typeof item !== "string")) {
        issues.push(invalid("affiliateResources", "affiliate resources must be a list of text."));
      }
    }
    issues.push(...validateMetadata(input.marketplaceMetadata).map((item) => invalid("marketplaceMetadata", item.message.replace(/^Invalid Marketplace Metadata:\s*/, ""))));
    return issues;
  }

  function validateObserved(input: unknown): ClickBankIssue[] {
    if (input === undefined || input === null || !isPlainRecord(input)) {
      return [{ field: "observedProduct", message: "Missing ObservedProduct: an observed product is required." }];
    }
    const issues: ClickBankIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(OBSERVED_PRODUCT_KEYS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected observed member "${key}".`));
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Missing ObservedProduct: a product name is required." });
    }
    for (const field of TEXT_FIELDS) {
      const value = input[field];
      if (value !== undefined && value !== null && typeof value !== "string") issues.push(invalid(field, `${field} must be text or null.`));
    }
    return issues;
  }

  function validateInput(input: unknown): ClickBankIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "observedProduct", message: "Missing ObservedProduct: an observed product is required." }];
    }
    const wrapped = "observedProduct" in input || "marketplaceRecords" in input || "marketplaceSource" in input || METADATA_FIELDS.some((field) => input[field] !== undefined);
    if (!wrapped) return validateObserved(input);
    const issues: ClickBankIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(CLICKBANK_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("observedProduct" in input)) issues.push({ field: "observedProduct", message: "Missing ObservedProduct: an observed product is required." });
    else issues.push(...validateObserved(input.observedProduct));
    if ("marketplaceRecords" in input) {
      if (!Array.isArray(input.marketplaceRecords)) issues.push(invalid("marketplaceRecords", "a list of listing records is required."));
      else input.marketplaceRecords.forEach((record, index) => issues.push(...validateRecord(record).map((item) => ({ ...item, field: `marketplaceRecords.${index}.${item.field}` }))));
    }
    if ("marketplaceSource" in input && (typeof input.marketplaceSource !== "string" || input.marketplaceSource.trim() === "")) {
      issues.push(invalid("marketplaceSource", "a marketplace source must be text."));
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace("metadata", `"${key}"`).replace(/^Invalid Marketplace Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateResolution(input: unknown): ClickBankIssue[] {
    const corrupt = (field: string, message: string): ClickBankIssue => ({ field, message: `Corrupted Resolution: ${message}` });
    if (!isPlainRecord(input)) return [corrupt("snapshot", "a snapshot record is required.")];
    const issues: ClickBankIssue[] = [];
    for (const field of RESOLUTION_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(corrupt(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.resolutionId !== "string" || !SNAPSHOT_ID.test(input.resolutionId)) issues.push(corrupt("resolutionId", "a well-formed resolution id is required."));
    if (!isPlainRecord(input.product)) issues.push(corrupt("product", "a resolved product is required."));
    else {
      for (const field of RESOLVED_PRODUCT_KEYS) {
        if (input.product[field] === undefined) issues.push(corrupt(`product.${field}`, `resolved member "${field}" is missing.`));
      }
    }
    if (!isPlainRecord(input.evidence)) issues.push(corrupt("evidence", "match evidence is required."));
    else {
      for (const field of RESOLUTION_EVIDENCE_KEYS) {
        if (input.evidence[field] === undefined) issues.push(corrupt(`evidence.${field}`, `evidence member "${field}" is missing.`));
      }
      if (typeof input.evidence.matchMethod !== "string" || !(MATCH_METHODS as readonly string[]).includes(input.evidence.matchMethod)) {
        issues.push(corrupt("matchMethod", "a known match method is required."));
      }
      if (typeof input.evidence.matchConfidence !== "string" || !(MATCH_CONFIDENCE as readonly string[]).includes(input.evidence.matchConfidence)) {
        issues.push(corrupt("matchConfidence", "a known match confidence is required."));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(corrupt("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "RESOLVED") issues.push(corrupt("origin", "origin must be RESOLVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(corrupt("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => corrupt("metadata", item.message.replace(/^Invalid Marketplace Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateRecord, validateMetadata, validateResolution };
}
