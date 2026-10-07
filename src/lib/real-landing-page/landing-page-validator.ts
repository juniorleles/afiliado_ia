/**
 * Host record domain: real landing page validator.
 *
 * Pure local rules for one collection. It rejects an invalid address, a
 * timeout, a redirect loop, an unsupported content type, a response that is
 * too large, and invalid metadata. It does not change what it is given.
 */
import { REAL_LANDING_PAGE_CONTEXT_MEMBERS, type RealLandingPageMetadata } from "./landing-page-context";
import {
  REAL_LANDING_PAGE_KEYS,
  REAL_LANDING_PAGE_SESSION_KEYS,
  REAL_LANDING_PAGE_STATISTICS_KEYS,
  type RealLandingPageIssue,
} from "./landing-page-response";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

export interface RealLandingPageValidator {
  validateInput(input: unknown): RealLandingPageIssue[];
  validateMetadata(input: unknown): RealLandingPageIssue[];
  validateUrl(input: unknown): RealLandingPageIssue[];
  validateContentType(input: unknown): RealLandingPageIssue[];
  validateSize(bytes: number, maxBytes: number): RealLandingPageIssue[];
  validateSnapshot(input: unknown): RealLandingPageIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatRealLandingPageMetadata(value: unknown): value is RealLandingPageMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): RealLandingPageIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

export function mediaTypeOf(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function createRealLandingPageValidator(): RealLandingPageValidator {
  function validateMetadata(input: unknown): RealLandingPageIssue[] {
    if (input === undefined) return [];
    if (!isFlatRealLandingPageMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateUrl(input: unknown): RealLandingPageIssue[] {
    if (typeof input !== "string" || !HTTPS_URL.test(input.trim())) {
      return [{ field: "url", message: "Invalid URL: a sponsored destination must be an https address." }];
    }
    return [];
  }

  function validateContentType(input: unknown): RealLandingPageIssue[] {
    if (typeof input !== "string" || !HTML_TYPES.has(mediaTypeOf(input))) {
      return [{ field: "contentType", message: "Unsupported Content-Type: the destination page must be HTML." }];
    }
    return [];
  }

  function validateSize(bytes: number, maxBytes: number): RealLandingPageIssue[] {
    if (!Number.isFinite(bytes) || bytes > maxBytes) {
      return [{ field: "responseBytes", message: "Response Too Large: the destination page exceeds the size limit." }];
    }
    return [];
  }

  function validateInput(input: unknown): RealLandingPageIssue[] {
    if (!isPlainRecord(input)) return [invalid("sponsoredResults", "a list of sponsored results is required.")];
    const issues: RealLandingPageIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(REAL_LANDING_PAGE_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (!("sponsoredResults" in input) || !Array.isArray(input.sponsoredResults)) {
      issues.push(invalid("sponsoredResults", "a list of sponsored results is required."));
    }
    if ("maxPages" in input && input.maxPages !== undefined && (!Number.isInteger(input.maxPages) || (input.maxPages as number) < 1)) {
      issues.push(invalid("maxPages", "maxPages must be an integer of 1 or more."));
    }
    if ("maxRequests" in input && input.maxRequests !== undefined && (!Number.isInteger(input.maxRequests) || (input.maxRequests as number) < 0)) {
      issues.push(invalid("maxRequests", "maxRequests must be an integer of 0 or more."));
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): RealLandingPageIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: RealLandingPageIssue[] = [];
    for (const field of REAL_LANDING_PAGE_SESSION_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.sessionId !== "string" || !SNAPSHOT_ID.test(input.sessionId)) issues.push(invalid("sessionId", "a well-formed session id is required."));
    if (!Array.isArray(input.pages)) issues.push(invalid("pages", "landing page snapshots are required."));
    else {
      input.pages.forEach((page, index) => {
        if (!isPlainRecord(page)) {
          issues.push(invalid(`pages.${index}`, "a landing page snapshot is required."));
          return;
        }
        for (const field of REAL_LANDING_PAGE_KEYS) {
          if (page[field] === undefined) issues.push(invalid(`pages.${index}.${field}`, `snapshot member "${field}" is missing.`));
        }
        if (typeof page.landingPageId !== "string" || !SNAPSHOT_ID.test(page.landingPageId)) issues.push(invalid(`pages.${index}.landingPageId`, "a well-formed landing page id is required."));
        issues.push(...validateUrl(page.originalUrl).map((item) => ({ ...item, field: `pages.${index}.originalUrl` })));
        issues.push(...validateUrl(page.finalUrl).map((item) => ({ ...item, field: `pages.${index}.finalUrl` })));
        if (!Array.isArray(page.redirectChain) || page.redirectChain.some((hop) => typeof hop !== "string" || !HTTPS_URL.test(hop))) {
          issues.push(invalid(`pages.${index}.redirectChain`, "the redirect chain must be a list of https addresses."));
        }
        if (typeof page.httpStatus !== "number" || !Number.isInteger(page.httpStatus) || page.httpStatus < 100 || page.httpStatus > 599) {
          issues.push(invalid(`pages.${index}.httpStatus`, "httpStatus must be an integer from 100 through 599."));
        }
        if (typeof page.html !== "string") issues.push(invalid(`pages.${index}.html`, "html must be text."));
        if (typeof page.responseBytes !== "number" || !Number.isFinite(page.responseBytes) || page.responseBytes < 0) {
          issues.push(invalid(`pages.${index}.responseBytes`, "responseBytes must be a finite number."));
        }
        if (typeof page.responseTime !== "number" || !Number.isFinite(page.responseTime) || page.responseTime < 0) {
          issues.push(invalid(`pages.${index}.responseTime`, "responseTime must be a finite number."));
        }
        if (typeof page.retrievedAt !== "string" || !ISO.test(page.retrievedAt)) issues.push(invalid(`pages.${index}.retrievedAt`, "retrievedAt must be an ISO-8601 instant in UTC."));
        if (page.origin !== "COLLECTED") issues.push(invalid(`pages.${index}.origin`, "origin must be COLLECTED."));
        if (page.provenance !== "DIRECT_SOURCE") issues.push(invalid(`pages.${index}.provenance`, "provenance must be DIRECT_SOURCE."));
      });
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "statistics are required."));
    else {
      for (const field of REAL_LANDING_PAGE_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
      if (Array.isArray(input.pages) && input.statistics.pageCount !== input.pages.length) {
        issues.push(invalid("statistics.pageCount", "pageCount must match the stored pages."));
      }
    }
    if (!isPlainRecord(input.context) || !Array.isArray(input.context.urls)) issues.push(invalid("context", "a pipeline context is required."));
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "COLLECTED") issues.push(invalid("origin", "origin must be COLLECTED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateUrl, validateContentType, validateSize, validateSnapshot };
}
