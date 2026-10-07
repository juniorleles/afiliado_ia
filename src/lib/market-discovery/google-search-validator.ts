/**
 * Host record domain: google search connector validator.
 *
 * Pure local rules for a collection input and a snapshot. It rejects an empty
 * keyword, an invalid locale, an invalid device, and invalid metadata. It
 * does not read page markup and it does not change what it is given.
 */
import { SEARCH_CONTEXT_MEMBERS } from "./google-search-context";
import { SEARCH_SNAPSHOT_KEYS } from "./google-search-snapshot";
import { SEARCH_DEVICES, type SearchIssue, type SearchMetadata } from "./google-search-types";

const LANGUAGE = /^[a-z]{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const MARKET = /^[a-z][a-z0-9-]*$/;
const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface GoogleSearchValidator {
  validateInput(input: unknown): SearchIssue[];
  validateKeyword(input: unknown): SearchIssue[];
  validateLocale(input: unknown): SearchIssue[];
  validateDevice(input: unknown): SearchIssue[];
  validateMetadata(input: unknown): SearchIssue[];
  validateSnapshot(input: unknown): SearchIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatSearchMetadata(value: unknown): value is SearchMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

export function createGoogleSearchValidator(): GoogleSearchValidator {
  function validateMetadata(input: unknown): SearchIssue[] {
    if (input === undefined) return [];
    if (!isFlatSearchMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateKeyword(input: unknown): SearchIssue[] {
    if (!isPlainRecord(input) || typeof input.keyword !== "string" || input.keyword.trim() === "") {
      return [{ field: "keyword", message: "Empty Keyword: a keyword is required." }];
    }
    return [];
  }

  function validateLocale(input: unknown): SearchIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "language", message: "Invalid Locale: language, country, and market are required." }];
    }
    const issues: SearchIssue[] = [];
    if (typeof input.language !== "string" || !LANGUAGE.test(input.language)) {
      issues.push({ field: "language", message: "Invalid Locale: language must be a two-letter code." });
    }
    if (typeof input.country !== "string" || !COUNTRY.test(input.country)) {
      issues.push({ field: "country", message: "Invalid Locale: country must be a two-letter code." });
    }
    if (typeof input.market !== "string" || !MARKET.test(input.market)) {
      issues.push({ field: "market", message: "Invalid Locale: market must be a lowercase token." });
    }
    return issues;
  }

  function validateDevice(input: unknown): SearchIssue[] {
    if (!isPlainRecord(input) || typeof input.device !== "string" || !(SEARCH_DEVICES as readonly string[]).includes(input.device)) {
      return [{ field: "device", message: "Invalid Device: device must be desktop, mobile, or tablet." }];
    }
    return [];
  }

  function validateInput(input: unknown): SearchIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "connector", message: "Invalid Metadata: a keyword, locale, device, market, and page text are required." }];
    }
    const issues: SearchIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(SEARCH_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateKeyword(input), ...validateLocale(input), ...validateDevice(input));
    if (typeof input.searchHtml !== "string") {
      issues.push({ field: "searchHtml", message: "Invalid Metadata: searchHtml must be text." });
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): SearchIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: SearchIssue[] = [];
    for (const field of SEARCH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.snapshotId !== "string" || !SNAPSHOT_ID.test(input.snapshotId)) {
      issues.push({ field: "snapshotId", message: "Invalid Metadata: a well-formed snapshot id is required." });
    }
    if (typeof input.query !== "string" || input.query.trim() === "") {
      issues.push({ field: "query", message: "Empty Keyword: a keyword is required." });
    }
    if (typeof input.language !== "string" || !LANGUAGE.test(input.language) || typeof input.country !== "string" || !COUNTRY.test(input.country) || typeof input.market !== "string" || !MARKET.test(input.market)) {
      issues.push({ field: "language", message: "Invalid Locale: language, country, and market must stay well formed." });
    }
    if (typeof input.device !== "string" || !(SEARCH_DEVICES as readonly string[]).includes(input.device)) {
      issues.push({ field: "device", message: "Invalid Device: device must be desktop, mobile, or tablet." });
    }
    if (typeof input.searchUrl !== "string" || !HTTPS.test(input.searchUrl)) {
      issues.push({ field: "searchUrl", message: "Invalid Metadata: searchUrl must be a well-formed https address." });
    }
    if (typeof input.html !== "string") {
      issues.push({ field: "html", message: "Invalid Metadata: html must be text." });
    }
    if (typeof input.collectedAt !== "string" || !ISO.test(input.collectedAt)) {
      issues.push({ field: "collectedAt", message: "Invalid Metadata: collectedAt must be an ISO-8601 instant in UTC." });
    }
    if (input.origin !== "COLLECTED") issues.push({ field: "origin", message: "Invalid Metadata: origin must be COLLECTED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Invalid Metadata: provenance must be DIRECT_SOURCE." });
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return { validateInput, validateKeyword, validateLocale, validateDevice, validateMetadata, validateSnapshot };
}
