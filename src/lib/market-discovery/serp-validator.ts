/**
 * Host record domain: SERP validator.
 *
 * Pure local rules for a search snapshot and the parser envelope. It rejects
 * a missing search snapshot, a malformed snapshot, and invalid metadata. It
 * does not read page markup and it does not change what it is given.
 */
import { SEARCH_SNAPSHOT_KEYS } from "./google-search-snapshot";
import { SEARCH_DEVICES } from "./google-search-types";
import { SERP_CONTEXT_MEMBERS } from "./serp-context";
import { SERP_SNAPSHOT_KEYS } from "./serp-snapshot";
import { type SerpIssue, type SerpMetadata } from "./serp-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LANGUAGE = /^[a-z]{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const MARKET = /^[a-z][a-z0-9-]*$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface SerpValidator {
  validateInput(input: unknown): SerpIssue[];
  validateSearchSnapshot(input: unknown): SerpIssue[];
  validateMetadata(input: unknown): SerpIssue[];
  validateSnapshot(input: unknown): SerpIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatSerpMetadata(value: unknown): value is SerpMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function snapshotOf(input: Record<string, unknown>): unknown {
  return "searchSnapshot" in input ? input.searchSnapshot : input;
}

export function createSerpValidator(): SerpValidator {
  function validateMetadata(input: unknown): SerpIssue[] {
    if (input === undefined) return [];
    if (!isFlatSerpMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateSearchSnapshot(input: unknown): SerpIssue[] {
    if (input === undefined || input === null) {
      return [{ field: "searchSnapshot", message: "Missing SearchSnapshot: a search snapshot is required." }];
    }
    if (!isPlainRecord(input)) {
      return [{ field: "searchSnapshot", message: "Malformed Snapshot: a search snapshot must be a plain record." }];
    }
    const issues: SerpIssue[] = [];
    for (const field of SEARCH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Malformed Snapshot: snapshot member "${field}" is missing.` });
    }
    if (typeof input.snapshotId !== "string" || !SNAPSHOT_ID.test(input.snapshotId)) {
      issues.push({ field: "snapshotId", message: "Malformed Snapshot: a well-formed snapshot id is required." });
    }
    if (typeof input.query !== "string" || input.query.trim() === "") {
      issues.push({ field: "query", message: "Malformed Snapshot: a query is required." });
    }
    if (typeof input.html !== "string") {
      issues.push({ field: "html", message: "Malformed Snapshot: html must be text." });
    }
    if (typeof input.searchUrl !== "string" || !HTTPS.test(input.searchUrl)) {
      issues.push({ field: "searchUrl", message: "Malformed Snapshot: searchUrl must be a well-formed https address." });
    }
    if (typeof input.language !== "string" || !LANGUAGE.test(input.language) || typeof input.country !== "string" || !COUNTRY.test(input.country) || typeof input.market !== "string" || !MARKET.test(input.market)) {
      issues.push({ field: "language", message: "Malformed Snapshot: language, country, and market must stay well formed." });
    }
    if (typeof input.device !== "string" || !(SEARCH_DEVICES as readonly string[]).includes(input.device)) {
      issues.push({ field: "device", message: "Malformed Snapshot: device must stay desktop, mobile, or tablet." });
    }
    if (typeof input.collectedAt !== "string" || !ISO.test(input.collectedAt)) {
      issues.push({ field: "collectedAt", message: "Malformed Snapshot: collectedAt must be an ISO-8601 instant in UTC." });
    }
    if (input.origin !== "COLLECTED") issues.push({ field: "origin", message: "Malformed Snapshot: origin must be COLLECTED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Malformed Snapshot: provenance must be DIRECT_SOURCE." });
    if (input.metadata !== undefined && !isFlatSerpMetadata(input.metadata)) {
      issues.push({ field: "metadata", message: "Malformed Snapshot: snapshot metadata must be a flat record." });
    }
    return issues;
  }

  function validateInput(input: unknown): SerpIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "searchSnapshot", message: "Missing SearchSnapshot: a search snapshot is required." }];
    }
    const wrapped = "searchSnapshot" in input || METADATA_FIELDS.some((field) => input[field] !== undefined);
    if (wrapped) {
      const issues: SerpIssue[] = [];
      for (const key of Object.keys(input)) {
        if (!(SERP_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
          issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
        }
      }
      if (!("searchSnapshot" in input) || input.searchSnapshot === undefined || input.searchSnapshot === null) {
        issues.push({ field: "searchSnapshot", message: "Missing SearchSnapshot: a search snapshot is required." });
      } else {
        issues.push(...validateSearchSnapshot(input.searchSnapshot));
      }
      for (const key of METADATA_FIELDS) {
        issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
      }
      return issues;
    }
    return validateSearchSnapshot(snapshotOf(input));
  }

  function validateSnapshot(input: unknown): SerpIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: SerpIssue[] = [];
    for (const field of SERP_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.serpId !== "string" || !SNAPSHOT_ID.test(input.serpId)) {
      issues.push({ field: "serpId", message: "Invalid Metadata: a well-formed serp id is required." });
    }
    if (typeof input.searchSnapshotId !== "string" || input.searchSnapshotId.trim() === "") {
      issues.push({ field: "searchSnapshotId", message: "Malformed Snapshot: a search snapshot id is required." });
    }
    if (typeof input.query !== "string") {
      issues.push({ field: "query", message: "Malformed Snapshot: a query is required." });
    }
    if (!Array.isArray(input.records)) {
      issues.push({ field: "records", message: "Malformed Snapshot: records must be a list." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    if (input.origin !== "OBSERVED") issues.push({ field: "origin", message: "Invalid Metadata: origin must be OBSERVED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Invalid Metadata: provenance must be DIRECT_SOURCE." });
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return { validateInput, validateSearchSnapshot, validateMetadata, validateSnapshot };
}
