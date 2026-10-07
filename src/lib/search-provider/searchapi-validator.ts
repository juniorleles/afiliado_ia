/**
 * Host record domain: SearchApi provider validator.
 *
 * Pure local rules for a retrieval request. It rejects an empty keyword, a
 * locale that is not two letters, a device outside the supported set, and
 * metadata that is not flat. It does not change what it is given.
 */
import { SEARCHAPI_CONTEXT_MEMBERS } from "./searchapi-context";
import { SEARCHAPI_DEVICES, type SearchApiIssue, type SearchApiMetadata } from "./searchapi-types";

const LANGUAGE = /^[a-z]{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const RESERVED_OPTIONS = new Set(["api_key", "engine", "q", "gl", "hl", "device"]);

export interface SearchApiValidator {
  validateInput(input: unknown): SearchApiIssue[];
  validateSnapshotId(input: string): SearchApiIssue[];
  searchOptionsOf(input: unknown): Record<string, string>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

function isFlatMetadata(value: unknown): value is SearchApiMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): SearchApiIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

export function createSearchApiValidator(): SearchApiValidator {
  function validateSnapshotId(input: string): SearchApiIssue[] {
    if (!SNAPSHOT_ID.test(input)) return [invalid("snapshotId", "a well-formed snapshot id is required.")];
    return [];
  }

  function searchOptionsOf(input: unknown): Record<string, string> {
    if (!isPlainRecord(input) || !isPlainRecord(input.searchOptions)) return {};
    const options: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.searchOptions)) {
      if (RESERVED_OPTIONS.has(key) || typeof value !== "string") continue;
      options[key] = value;
    }
    return options;
  }

  function validateInput(input: unknown): SearchApiIssue[] {
    if (!isPlainRecord(input)) {
      return [
        { field: "keyword", message: "Empty Keyword: a keyword is required." },
        { field: "country", message: "Invalid Locale: country must be a two-letter code." },
        { field: "language", message: "Invalid Locale: language must be a two-letter code." },
        { field: "device", message: "Invalid Device: device must be desktop, mobile, or tablet." },
      ];
    }
    const issues: SearchApiIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(SEARCHAPI_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (typeof input.keyword !== "string" || input.keyword.trim() === "") issues.push({ field: "keyword", message: "Empty Keyword: a keyword is required." });
    if (typeof input.country !== "string" || !COUNTRY.test(input.country)) issues.push({ field: "country", message: "Invalid Locale: country must be a two-letter code." });
    if (typeof input.language !== "string" || !LANGUAGE.test(input.language)) issues.push({ field: "language", message: "Invalid Locale: language must be a two-letter code." });
    if (typeof input.device !== "string" || !(SEARCHAPI_DEVICES as readonly string[]).includes(input.device)) {
      issues.push({ field: "device", message: "Invalid Device: device must be desktop, mobile, or tablet." });
    }
    if (input.searchOptions !== undefined) {
      if (!isPlainRecord(input.searchOptions) || Object.entries(input.searchOptions).some(([key, value]) => key.trim() === "" || RESERVED_OPTIONS.has(key) || typeof value !== "string")) {
        issues.push(invalid("searchOptions", "search options must be a flat record of text."));
      }
    }
    for (const key of METADATA_FIELDS) {
      if (input[key] !== undefined && !isFlatMetadata(input[key])) issues.push(invalid(key, "a flat record of text, numbers, booleans, or null is required."));
    }
    return issues;
  }

  return { validateInput, validateSnapshotId, searchOptionsOf };
}
