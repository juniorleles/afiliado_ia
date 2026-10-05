/**
 * Host record domain: landing page intelligence validator.
 *
 * Pure local rules for an analysis input, a DOM snapshot, URLs, and
 * snapshots. It rejects missing HTML, a malformed DOM, an invalid URL, and
 * invalid metadata. It only reports problems: it never fetches a page and
 * never changes what it is given.
 */
import { LANDING_PAGE_CONTEXT_MEMBERS } from "./landing-page-context";
import { LANDING_PAGE_SNAPSHOT_KEYS, type LandingPageIssue, type LandingPageMetadata } from "./landing-page-evidence";

const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface LandingPageValidator {
  validateInput(input: unknown): LandingPageIssue[];
  validateUrl(input: unknown, field?: string): LandingPageIssue[];
  validateHtml(input: unknown): LandingPageIssue[];
  validateDom(input: unknown): LandingPageIssue[];
  validateMetadata(input: unknown): LandingPageIssue[];
  validateSnapshot(input: unknown): LandingPageIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatLandingPageMetadata(value: unknown): value is LandingPageMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function markupOf(snapshot: unknown): string | null {
  if (typeof snapshot === "string") return textOf(snapshot);
  if (!isPlainRecord(snapshot)) return null;
  return textOf(snapshot.html) ?? textOf(snapshot.innerHTML) ?? textOf(snapshot.markup);
}

export function createLandingPageValidator(): LandingPageValidator {
  function validateMetadata(input: unknown): LandingPageIssue[] {
    if (input === undefined) return [];
    if (!isFlatLandingPageMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateUrl(input: unknown, field = "landingPageUrl"): LandingPageIssue[] {
    if (input === undefined || input === null || input === "") {
      return [{ field, message: `Invalid URL: ${field} is required.` }];
    }
    if (typeof input !== "string" || !HTTPS.test(input.trim())) {
      return [{ field, message: `Invalid URL: ${field} must be a well-formed https address.` }];
    }
    return [];
  }

  function validateDom(input: unknown): LandingPageIssue[] {
    if (input === undefined) return [];
    if (typeof input === "string") return [];
    if (isPlainRecord(input)) {
      if (input.html !== undefined && input.html !== null && typeof input.html !== "string") {
        return [{ field: "domSnapshot.html", message: "Malformed DOM: snapshot html must be text." }];
      }
      if (input.innerHTML !== undefined && input.innerHTML !== null && typeof input.innerHTML !== "string") {
        return [{ field: "domSnapshot.innerHTML", message: "Malformed DOM: snapshot innerHTML must be text." }];
      }
      if (input.markup !== undefined && input.markup !== null && typeof input.markup !== "string") {
        return [{ field: "domSnapshot.markup", message: "Malformed DOM: snapshot markup must be text." }];
      }
      if (input.children !== undefined && input.children !== null && !Array.isArray(input.children)) {
        return [{ field: "domSnapshot.children", message: "Malformed DOM: snapshot children must be a list." }];
      }
      return [];
    }
    return [{ field: "domSnapshot", message: "Malformed DOM: a DOM snapshot must be text or a plain record." }];
  }

  function validateHtml(input: unknown): LandingPageIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "rawHtml", message: "Missing HTML: raw HTML or a DOM snapshot with markup is required." }];
    }
    const html = textOf(input.rawHtml) ?? markupOf(input.domSnapshot);
    if (html === null) {
      return [{ field: "rawHtml", message: "Missing HTML: raw HTML or a DOM snapshot with markup is required." }];
    }
    return [];
  }

  function validateInput(input: unknown): LandingPageIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Invalid Metadata: an object of a landing page URL and HTML is required." }];
    }
    const issues: LandingPageIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(LANDING_PAGE_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateUrl(input.landingPageUrl, "landingPageUrl"));
    if (input.rawHtml !== undefined && input.rawHtml !== null && typeof input.rawHtml !== "string") {
      issues.push({ field: "rawHtml", message: "Missing HTML: rawHtml must be text." });
    }
    issues.push(...validateDom(input.domSnapshot));
    if (issues.length === 0) issues.push(...validateHtml(input));
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): LandingPageIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: LandingPageIssue[] = [];
    for (const field of LANDING_PAGE_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.evidenceId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.evidenceId)) {
      issues.push({ field: "evidenceId", message: "Invalid Metadata: a well-formed evidence id is required." });
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
    validateHtml,
    validateDom,
    validateMetadata,
    validateSnapshot,
  };
}
