/**
 * Host record domain: landing page collector validator.
 *
 * Pure local rules for sponsored results and supplied page responses. It
 * rejects a missing result list, an invalid address, a repeated redirect, a
 * timeout, a page with no text, and invalid metadata. It does not read page
 * markup and it does not change what it is given.
 */
import { LANDING_PAGE_CONTEXT_MEMBERS, LANDING_PAGE_RESPONSE_KEYS } from "./landing-page-context";
import { LANDING_PAGE_COLLECTION_KEYS, LANDING_PAGE_SNAPSHOT_KEYS } from "./landing-page-snapshot";
import { type LandingPageIssue, type LandingPageMetadata } from "./landing-page-types";

const HTTPS = /^https:\/\/[^\s]+$/;
const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface LandingPageValidator {
  validateInput(input: unknown): LandingPageIssue[];
  validateUrl(input: unknown, field?: string): LandingPageIssue[];
  validateMetadata(input: unknown): LandingPageIssue[];
  validateSnapshot(input: unknown): LandingPageIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatLandingPageMetadata(value: unknown): value is LandingPageMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function createLandingPageValidator(): LandingPageValidator {
  function validateMetadata(input: unknown): LandingPageIssue[] {
    if (input === undefined) return [];
    if (!isFlatLandingPageMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateUrl(input: unknown, field = "url"): LandingPageIssue[] {
    if (typeof input !== "string" || !HTTPS.test(input.trim())) {
      return [{ field, message: `Invalid URL: ${field} must be a well-formed https address.` }];
    }
    return [];
  }

  function validatePage(page: unknown, index: number): LandingPageIssue[] {
    if (!isPlainRecord(page)) {
      return [{ field: `pages.${index}`, message: "Invalid Metadata: a supplied page must be a plain record." }];
    }
    const issues: LandingPageIssue[] = [];
    for (const key of Object.keys(page)) {
      if (!(LANDING_PAGE_RESPONSE_KEYS as readonly string[]).includes(key)) {
        issues.push({ field: `pages.${index}.${key}`, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if (page.timedOut === true) {
      issues.push({ field: `pages.${index}`, message: "Timeout: the destination page was not retrieved before the time limit." });
    } else if (page.timedOut !== undefined && typeof page.timedOut !== "boolean") {
      issues.push({ field: `pages.${index}.timedOut`, message: "Invalid Metadata: timedOut must be a boolean." });
    }
    issues.push(...validateUrl(page.destinationUrl, `pages.${index}.destinationUrl`));
    issues.push(...validateUrl(page.finalUrl, `pages.${index}.finalUrl`));
    if (typeof page.httpStatus !== "number" || !Number.isInteger(page.httpStatus) || page.httpStatus < 100 || page.httpStatus > 599) {
      issues.push({ field: `pages.${index}.httpStatus`, message: "Invalid Metadata: httpStatus must be an integer from 100 through 599." });
    }
    if (!isFlatLandingPageMetadata(page.headers)) {
      issues.push({ field: `pages.${index}.headers`, message: "Invalid Metadata: headers must be a flat record." });
    }
    if (typeof page.html !== "string") {
      issues.push({ field: `pages.${index}.html`, message: "Invalid Metadata: html must be text." });
    } else if (page.html.trim() === "") {
      issues.push({ field: `pages.${index}.html`, message: "Empty Response: the destination page has no page text." });
    }
    issues.push(...validateRedirects(page, index));
    return issues;
  }

  function validateRedirects(page: Record<string, unknown>, index: number): LandingPageIssue[] {
    if (page.redirects === undefined) return [];
    if (!Array.isArray(page.redirects)) {
      return [{ field: `pages.${index}.redirects`, message: "Invalid Metadata: redirects must be a list of https addresses." }];
    }
    const issues: LandingPageIssue[] = [];
    const chain: string[] = [];
    if (typeof page.destinationUrl === "string") chain.push(page.destinationUrl.trim());
    page.redirects.forEach((hop, hopIndex) => {
      issues.push(...validateUrl(hop, `pages.${index}.redirects.${hopIndex}`));
      if (typeof hop === "string") chain.push(hop.trim());
    });
    const seen = new Set<string>();
    for (const url of chain) {
      if (url === "") continue;
      if (seen.has(url)) {
        issues.push({ field: `pages.${index}.redirects`, message: "Redirect Loop: the destination address repeats in the redirect chain." });
        return issues;
      }
      seen.add(url);
    }
    if (issues.length > 0) return issues;
    const resolved = chain[chain.length - 1] ?? "";
    const finalUrl = typeof page.finalUrl === "string" ? page.finalUrl.trim() : "";
    if (resolved !== "" && finalUrl !== "" && resolved !== finalUrl) {
      issues.push({ field: `pages.${index}.finalUrl`, message: "Invalid URL: the final address does not match the redirect chain." });
    }
    return issues;
  }

  function validateInput(input: unknown): LandingPageIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "sponsoredResults", message: "Missing Sponsored Results: a list of sponsored results is required." }];
    }
    const issues: LandingPageIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(LANDING_PAGE_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if (!("sponsoredResults" in input) || input.sponsoredResults === undefined || input.sponsoredResults === null) {
      issues.push({ field: "sponsoredResults", message: "Missing Sponsored Results: a list of sponsored results is required." });
      return issues;
    }
    if (!Array.isArray(input.sponsoredResults)) {
      issues.push({ field: "sponsoredResults", message: "Missing Sponsored Results: a list of sponsored results is required." });
      return issues;
    }
    const destinations: string[] = [];
    input.sponsoredResults.forEach((item, index) => {
      if (!isPlainRecord(item)) {
        issues.push({ field: `sponsoredResults.${index}`, message: "Invalid Metadata: a sponsored result must be a plain record." });
        return;
      }
      const url = textOf(item.url);
      issues.push(...validateUrl(item.url, `sponsoredResults.${index}.url`));
      if (url) destinations.push(url);
    });
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    if (destinations.length === 0) return issues;
    if (!Array.isArray(input.pages)) {
      issues.push({ field: "pages", message: "Invalid Metadata: a supplied page is required for each destination." });
      return issues;
    }
    input.pages.forEach((page, index) => issues.push(...validatePage(page, index)));
    const supplied = new Set<string>();
    for (const page of input.pages) {
      if (isPlainRecord(page) && typeof page.destinationUrl === "string") supplied.add(page.destinationUrl.trim());
    }
    destinations.forEach((url, index) => {
      if (!supplied.has(url)) {
        issues.push({ field: `sponsoredResults.${index}.url`, message: "Invalid Metadata: a supplied page is required for each destination." });
      }
    });
    return issues;
  }

  function validateSnapshot(input: unknown): LandingPageIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: LandingPageIssue[] = [];
    for (const field of LANDING_PAGE_COLLECTION_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.collectionId !== "string" || !SNAPSHOT_ID.test(input.collectionId)) {
      issues.push({ field: "collectionId", message: "Invalid Metadata: a well-formed collection id is required." });
    }
    if (typeof input.pageCount !== "number" || !Number.isInteger(input.pageCount) || input.pageCount < 0) {
      issues.push({ field: "pageCount", message: "Invalid Metadata: pageCount must be an integer of 0 or more." });
    }
    if (!Array.isArray(input.pages)) {
      issues.push({ field: "pages", message: "Invalid Metadata: pages must be a list." });
    } else if (input.pages.length !== input.pageCount) {
      issues.push({ field: "pageCount", message: "Invalid Metadata: pageCount must match the stored pages." });
    } else {
      input.pages.forEach((page, index) => {
        if (!isPlainRecord(page)) {
          issues.push({ field: `pages.${index}`, message: "Invalid Metadata: a stored page must be a plain record." });
          return;
        }
        for (const field of LANDING_PAGE_SNAPSHOT_KEYS) {
          if (page[field] === undefined) issues.push({ field: `pages.${index}.${field}`, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
        }
        if (typeof page.landingPageId !== "string" || !SNAPSHOT_ID.test(page.landingPageId)) {
          issues.push({ field: `pages.${index}.landingPageId`, message: "Invalid Metadata: a well-formed landing page id is required." });
        }
        issues.push(...validateUrl(page.destinationUrl, `pages.${index}.destinationUrl`));
        issues.push(...validateUrl(page.finalUrl, `pages.${index}.finalUrl`));
        if (typeof page.html !== "string") issues.push({ field: `pages.${index}.html`, message: "Invalid Metadata: html must be text." });
        if (typeof page.retrievedAt !== "string" || !ISO.test(page.retrievedAt)) {
          issues.push({ field: `pages.${index}.retrievedAt`, message: "Invalid Metadata: retrievedAt must be an ISO-8601 instant in UTC." });
        }
        if (page.origin !== "COLLECTED") issues.push({ field: `pages.${index}.origin`, message: "Invalid Metadata: origin must be COLLECTED." });
        if (page.provenance !== "DIRECT_SOURCE") issues.push({ field: `pages.${index}.provenance`, message: "Invalid Metadata: provenance must be DIRECT_SOURCE." });
      });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    if (input.origin !== "COLLECTED") issues.push({ field: "origin", message: "Invalid Metadata: origin must be COLLECTED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Invalid Metadata: provenance must be DIRECT_SOURCE." });
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return { validateInput, validateUrl, validateMetadata, validateSnapshot };
}
