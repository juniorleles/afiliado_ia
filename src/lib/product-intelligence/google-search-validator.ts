/**
 * Host record domain: google search intelligence validator.
 *
 * Pure local rules for an analysis input, ProductFacts, a search context,
 * and snapshots. It rejects missing ProductFacts, a missing product name,
 * an invalid search context, and invalid metadata. It only reports problems:
 * it never fetches a page and never changes what it is given.
 */
import { GOOGLE_SEARCH_CONTEXT_MEMBERS } from "./google-search-context";
import { GOOGLE_SEARCH_SNAPSHOT_KEYS, type GoogleSearchIssue, type GoogleSearchMetadata } from "./google-search-evidence";

const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface GoogleSearchValidator {
  validateInput(input: unknown): GoogleSearchIssue[];
  validateProductFacts(input: unknown): GoogleSearchIssue[];
  validateProductName(input: unknown): GoogleSearchIssue[];
  validateSearchContext(input: unknown): GoogleSearchIssue[];
  validateMetadata(input: unknown): GoogleSearchIssue[];
  validateSnapshot(input: unknown): GoogleSearchIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatGoogleSearchMetadata(value: unknown): value is GoogleSearchMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function markupOf(context: unknown): string | null {
  if (typeof context === "string") return textOf(context);
  if (!isPlainRecord(context)) return null;
  return textOf(context.html) ?? textOf(context.innerHTML) ?? textOf(context.markup);
}

function productNameOf(input: Record<string, unknown>): string | null {
  const facts = isPlainRecord(input.productFacts) ? input.productFacts : null;
  return textOf(input.productName) ?? (facts ? textOf(facts.productName) ?? textOf(facts.name) : null);
}

export function createGoogleSearchValidator(): GoogleSearchValidator {
  function validateMetadata(input: unknown): GoogleSearchIssue[] {
    if (input === undefined) return [];
    if (!isFlatGoogleSearchMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateProductFacts(input: unknown): GoogleSearchIssue[] {
    if (!isPlainRecord(input) || input.productFacts === undefined || input.productFacts === null) {
      return [{ field: "productFacts", message: "Missing ProductFacts: a ProductFacts record is required." }];
    }
    if (!isPlainRecord(input.productFacts)) {
      return [{ field: "productFacts", message: "Missing ProductFacts: ProductFacts must be a plain record." }];
    }
    return [];
  }

  function validateProductName(input: unknown): GoogleSearchIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "productName", message: "Missing Product Name: a product name is required." }];
    }
    if (productNameOf(input) === null) {
      return [{ field: "productName", message: "Missing Product Name: a product name is required." }];
    }
    return [];
  }

  function validateSearchContext(input: unknown): GoogleSearchIssue[] {
    const context = isPlainRecord(input) ? input.searchContext : input;
    if (context === undefined || context === null || context === "") {
      return [{ field: "searchContext", message: "Invalid Search Context: a search context with markup is required." }];
    }
    if (typeof context === "string") {
      return textOf(context) ? [] : [{ field: "searchContext", message: "Invalid Search Context: a search context with markup is required." }];
    }
    if (!isPlainRecord(context)) {
      return [{ field: "searchContext", message: "Invalid Search Context: a search context must be text or a plain record." }];
    }
    if (context.html !== undefined && context.html !== null && typeof context.html !== "string") {
      return [{ field: "searchContext.html", message: "Invalid Search Context: search context html must be text." }];
    }
    if (context.innerHTML !== undefined && context.innerHTML !== null && typeof context.innerHTML !== "string") {
      return [{ field: "searchContext.innerHTML", message: "Invalid Search Context: search context innerHTML must be text." }];
    }
    if (context.markup !== undefined && context.markup !== null && typeof context.markup !== "string") {
      return [{ field: "searchContext.markup", message: "Invalid Search Context: search context markup must be text." }];
    }
    if (context.children !== undefined && context.children !== null && !Array.isArray(context.children)) {
      return [{ field: "searchContext.children", message: "Invalid Search Context: search context children must be a list." }];
    }
    if (markupOf(context) === null) {
      return [{ field: "searchContext", message: "Invalid Search Context: a search context with markup is required." }];
    }
    return [];
  }

  function validateInput(input: unknown): GoogleSearchIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Invalid Metadata: an object of ProductFacts and a search context is required." }];
    }
    const issues: GoogleSearchIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(GOOGLE_SEARCH_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateProductFacts(input));
    issues.push(...validateProductName(input));
    if (input.landingPage !== undefined && input.landingPage !== null && input.landingPage !== "") {
      if (typeof input.landingPage !== "string" || !HTTPS.test(input.landingPage.trim())) {
        issues.push({ field: "landingPage", message: "Invalid Search Context: landingPage must be a well-formed https address." });
      }
    }
    if (issues.length === 0 || !issues.some((item) => /Invalid Search Context/.test(item.message))) {
      issues.push(...validateSearchContext(input));
    }
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): GoogleSearchIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: GoogleSearchIssue[] = [];
    for (const field of GOOGLE_SEARCH_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.evidenceId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.evidenceId)) {
      issues.push({ field: "evidenceId", message: "Invalid Metadata: a well-formed evidence id is required." });
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Missing Product Name: a product name is required." });
    }
    if (input.landingPage !== null && (typeof input.landingPage !== "string" || !HTTPS.test(input.landingPage))) {
      issues.push({ field: "landingPage", message: "Invalid Search Context: landingPage must be a well-formed https address." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateProductFacts,
    validateProductName,
    validateSearchContext,
    validateMetadata,
    validateSnapshot,
  };
}
