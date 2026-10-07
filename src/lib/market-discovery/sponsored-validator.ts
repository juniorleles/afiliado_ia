/**
 * Host record domain: sponsored results validator.
 *
 * Pure local rules for a SERP record list. It rejects a missing list, a
 * malformed record, and invalid metadata. It does not change what it is given.
 */
import { SERP_RECORD_KEYS } from "./serp-types";
import { SPONSORED_CONTEXT_MEMBERS } from "./sponsored-context";
import { SPONSORED_SNAPSHOT_KEYS } from "./sponsored-snapshot";
import { type SponsoredIssue, type SponsoredMetadata } from "./sponsored-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const TEXT_FIELDS = ["title", "url", "description", "resultType", "organicMarker", "resultMetadata"] as const;

export interface SponsoredValidator {
  validateInput(input: unknown): SponsoredIssue[];
  validateRecords(input: unknown): SponsoredIssue[];
  validateMetadata(input: unknown): SponsoredIssue[];
  validateSnapshot(input: unknown): SponsoredIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatSponsoredMetadata(value: unknown): value is SponsoredMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function recordsOf(input: Record<string, unknown>): unknown {
  return "serpRecords" in input ? input.serpRecords : input;
}

export function createSponsoredValidator(): SponsoredValidator {
  function validateMetadata(input: unknown): SponsoredIssue[] {
    if (input === undefined) return [];
    if (!isFlatSponsoredMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateRecords(input: unknown): SponsoredIssue[] {
    if (input === undefined || input === null) {
      return [{ field: "serpRecords", message: "Missing SERPRecords: a list of SERP records is required." }];
    }
    if (!Array.isArray(input)) {
      return [{ field: "serpRecords", message: "Malformed Records: SERP records must be a list." }];
    }
    const issues: SponsoredIssue[] = [];
    input.forEach((item, index) => {
      if (!isPlainRecord(item)) {
        issues.push({ field: `serpRecords.${index}`, message: "Malformed Records: a SERP record must be a plain record." });
        return;
      }
      for (const field of SERP_RECORD_KEYS) {
        if (item[field] === undefined) issues.push({ field: `serpRecords.${index}.${field}`, message: `Malformed Records: record member "${field}" is missing.` });
      }
      for (const field of TEXT_FIELDS) {
        if (item[field] !== undefined && item[field] !== null && typeof item[field] !== "string") {
          issues.push({ field: `serpRecords.${index}.${field}`, message: `Malformed Records: "${field}" must be text or null.` });
        }
      }
      if (item.sponsoredMarker !== undefined && item.sponsoredMarker !== null && typeof item.sponsoredMarker !== "string") {
        issues.push({ field: `serpRecords.${index}.sponsoredMarker`, message: "Malformed Records: sponsoredMarker must be text or null." });
      }
      if (item.position !== undefined && item.position !== null && (typeof item.position !== "number" || !Number.isInteger(item.position) || item.position < 1)) {
        issues.push({ field: `serpRecords.${index}.position`, message: "Malformed Records: position must be an integer of 1 or more, or null." });
      }
      if (item.origin !== undefined && item.origin !== "OBSERVED") {
        issues.push({ field: `serpRecords.${index}.origin`, message: "Malformed Records: origin must be OBSERVED." });
      }
      if (item.provenance !== undefined && item.provenance !== "DIRECT_SOURCE") {
        issues.push({ field: `serpRecords.${index}.provenance`, message: "Malformed Records: provenance must be DIRECT_SOURCE." });
      }
    });
    return issues;
  }

  function validateInput(input: unknown): SponsoredIssue[] {
    if (Array.isArray(input)) return validateRecords(input);
    if (!isPlainRecord(input)) {
      return [{ field: "serpRecords", message: "Missing SERPRecords: a list of SERP records is required." }];
    }
    const issues: SponsoredIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(SPONSORED_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if (!("serpRecords" in input) || input.serpRecords === undefined || input.serpRecords === null) {
      issues.push({ field: "serpRecords", message: "Missing SERPRecords: a list of SERP records is required." });
    } else {
      issues.push(...validateRecords(recordsOf(input)));
    }
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): SponsoredIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: SponsoredIssue[] = [];
    for (const field of SPONSORED_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.sponsoredId !== "string" || !SNAPSHOT_ID.test(input.sponsoredId)) {
      issues.push({ field: "sponsoredId", message: "Invalid Metadata: a well-formed sponsored id is required." });
    }
    if (typeof input.sourceCount !== "number" || !Number.isInteger(input.sourceCount) || input.sourceCount < 0) {
      issues.push({ field: "sourceCount", message: "Invalid Metadata: sourceCount must be an integer of 0 or more." });
    }
    if (!Array.isArray(input.results)) {
      issues.push({ field: "results", message: "Malformed Records: results must be a list." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    if (input.origin !== "OBSERVED") issues.push({ field: "origin", message: "Invalid Metadata: origin must be OBSERVED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Invalid Metadata: provenance must be DIRECT_SOURCE." });
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return { validateInput, validateRecords, validateMetadata, validateSnapshot };
}
