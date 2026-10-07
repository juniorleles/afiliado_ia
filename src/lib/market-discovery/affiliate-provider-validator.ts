/**
 * Host record domain: affiliate resolution validator.
 *
 * Pure local rules for an observed product, provider names, and supplied
 * catalogs. It rejects a missing product, a missing provider list, an
 * ambiguous agreement, and invalid metadata. It does not change what it is
 * given.
 */
import { AFFILIATE_CONTEXT_MEMBERS } from "./affiliate-provider-context";
import { AFFILIATE_SNAPSHOT_KEYS } from "./affiliate-provider-snapshot";
import {
  AFFILIATE_RECORD_KEYS,
  MATCH_METHODS,
  OBSERVED_PRODUCT_KEYS,
  RESOLUTION_EVIDENCE_KEYS,
  RESOLVED_AFFILIATE_PRODUCT_KEYS,
  type AffiliateIssue,
  type ResolutionMetadata,
} from "./affiliate-provider-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const TEXT_FIELDS = ["vendor", "brand", "offerUrl", "primaryDomain", "primaryOffer", "category", "language", "visiblePrice", "currency", "landingPageId", "origin", "provenance"] as const;
const RECORD_TEXT = ["vendor", "category", "commission"] as const;

export interface AffiliateValidator {
  validateInput(input: unknown): AffiliateIssue[];
  validateRecord(input: unknown): AffiliateIssue[];
  validateMetadata(input: unknown): AffiliateIssue[];
  validateSnapshot(input: unknown): AffiliateIssue[];
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

function invalid(field: string, message: string): AffiliateIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

export function createAffiliateProviderValidator(): AffiliateValidator {
  function validateMetadata(input: unknown): AffiliateIssue[] {
    if (input === undefined) return [];
    if (!isFlatResolutionMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateRecord(input: unknown): AffiliateIssue[] {
    if (!isPlainRecord(input)) return [invalid("catalogs", "a listing record is required.")];
    const issues: AffiliateIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(AFFILIATE_RECORD_KEYS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected listing member "${key}".`));
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") issues.push(invalid("productName", "a listing product name is required."));
    for (const field of RECORD_TEXT) {
      const value = input[field];
      if (value !== undefined && value !== null && typeof value !== "string") issues.push(invalid(field, `${field} must be text or null.`));
    }
    if (input.affiliateUrl !== undefined && input.affiliateUrl !== null && (typeof input.affiliateUrl !== "string" || !HTTPS.test(input.affiliateUrl))) {
      issues.push(invalid("affiliateUrl", "an affiliate address must be an https address or null."));
    }
    if (input.gravity !== undefined && input.gravity !== null && (typeof input.gravity !== "number" || !Number.isFinite(input.gravity))) {
      issues.push(invalid("gravity", "gravity must be a finite number or null."));
    }
    if (input.affiliateResources !== undefined && (!Array.isArray(input.affiliateResources) || input.affiliateResources.some((item) => typeof item !== "string"))) {
      issues.push(invalid("affiliateResources", "affiliate resources must be a list of text."));
    }
    issues.push(...validateMetadata(input.marketplaceMetadata).map((item) => invalid("marketplaceMetadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  function validateObserved(input: unknown): AffiliateIssue[] {
    if (input === undefined || input === null || !isPlainRecord(input)) {
      return [{ field: "observedProduct", message: "Missing Observed Product: an observed product is required." }];
    }
    const issues: AffiliateIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(OBSERVED_PRODUCT_KEYS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected observed member "${key}".`));
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Missing Observed Product: a product name is required." });
    }
    for (const field of TEXT_FIELDS) {
      const value = input[field];
      if (value !== undefined && value !== null && typeof value !== "string") issues.push(invalid(field, `${field} must be text or null.`));
    }
    return issues;
  }

  function validateInput(input: unknown): AffiliateIssue[] {
    if (!isPlainRecord(input)) return [{ field: "observedProduct", message: "Missing Observed Product: an observed product is required." }];
    const issues: AffiliateIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(AFFILIATE_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("observedProduct" in input)) issues.push({ field: "observedProduct", message: "Missing Observed Product: an observed product is required." });
    else issues.push(...validateObserved(input.observedProduct));
    const names: string[] = [];
    if (!("providers" in input) || !Array.isArray(input.providers) || input.providers.length === 0) {
      issues.push({ field: "providers", message: "Missing Provider: a provider is required." });
    } else {
      const seen = new Set<string>();
      for (const name of input.providers) {
        if (typeof name !== "string" || name.trim() === "") issues.push(invalid("providers", "a provider name must be text."));
        else if (seen.has(name)) issues.push(invalid("providers", `provider "${name}" is repeated.`));
        else {
          seen.add(name);
          names.push(name);
        }
      }
    }
    if ("marketReport" in input && input.marketReport !== undefined && input.marketReport !== null && !isPlainRecord(input.marketReport)) {
      issues.push(invalid("marketReport", "a market report must be a record."));
    }
    if ("catalogs" in input && input.catalogs !== undefined) {
      if (!isPlainRecord(input.catalogs)) issues.push(invalid("catalogs", "catalogs must be a record."));
      else {
        for (const key of Object.keys(input.catalogs)) {
          if (!names.includes(key)) issues.push(invalid(`catalogs.${key}`, `unexpected catalog "${key}".`));
        }
        for (const name of names) {
          const catalog = input.catalogs[name];
          if (catalog === undefined) continue;
          if (!Array.isArray(catalog)) issues.push(invalid(`catalogs.${name}`, "a catalog must be a list."));
          else catalog.forEach((record, index) => issues.push(...validateRecord(record).map((item) => ({ ...item, field: `catalogs.${name}.${index}.${item.field}` }))));
        }
      }
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): AffiliateIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: AffiliateIssue[] = [];
    for (const field of AFFILIATE_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.resolutionId !== "string" || !SNAPSHOT_ID.test(input.resolutionId)) issues.push(invalid("resolutionId", "a well-formed resolution id is required."));
    if (!Array.isArray(input.products) || input.products.length === 0) issues.push(invalid("products", "a resolved product is required."));
    else {
      input.products.forEach((product, index) => {
        if (!isPlainRecord(product)) issues.push(invalid(`products.${index}`, "a resolved product is required."));
        else {
          for (const field of RESOLVED_AFFILIATE_PRODUCT_KEYS) {
            if (product[field] === undefined) issues.push(invalid(`products.${index}.${field}`, `resolved member "${field}" is missing.`));
          }
        }
      });
    }
    if (!Array.isArray(input.evidence) || !Array.isArray(input.products) || input.evidence.length !== input.products.length) {
      issues.push(invalid("evidence", "match evidence is required for each product."));
    } else {
      input.evidence.forEach((item, index) => {
        if (!isPlainRecord(item)) issues.push(invalid(`evidence.${index}`, "match evidence is required."));
        else {
          for (const field of RESOLUTION_EVIDENCE_KEYS) {
            if (item[field] === undefined) issues.push(invalid(`evidence.${index}.${field}`, `evidence member "${field}" is missing.`));
          }
          if (typeof item.matchMethod !== "string" || !(MATCH_METHODS as readonly string[]).includes(item.matchMethod)) {
            issues.push(invalid(`evidence.${index}.matchMethod`, "a known match method is required."));
          }
        }
      });
    }
    if (input.marketReportId !== null && typeof input.marketReportId !== "string") issues.push(invalid("marketReportId", "a market report id must be text or null."));
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "RESOLVED") issues.push(invalid("origin", "origin must be RESOLVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateRecord, validateMetadata, validateSnapshot };
}
