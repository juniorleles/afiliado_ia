/**
 * Host record domain: search provider validator.
 *
 * Pure local rules for a search request and a provider adapter. It rejects a
 * missing provider, a duplicate registration, a provider that does not match
 * the contract, and invalid metadata. It does not change what it is given.
 */
import { SEARCH_PROVIDER_CONTEXT_MEMBERS } from "./search-provider-context";
import { SEARCH_PROVIDER_DEVICES, type SearchIssue, type SearchMetadata } from "./search-provider-types";

const PROVIDER_NAME = /^[A-Z][A-Z0-9_]*$/;
const LANGUAGE = /^[a-z]{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const MARKET = /^[a-z][a-z0-9-]*$/;
const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface SearchProviderValidator {
  validateInput(input: unknown): SearchIssue[];
  validateMetadata(input: unknown): SearchIssue[];
  validateContract(input: unknown): SearchIssue[];
  validateSnapshotId(input: string): SearchIssue[];
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

function invalid(field: string, message: string): SearchIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

export function createSearchProviderValidator(): SearchProviderValidator {
  function validateMetadata(input: unknown): SearchIssue[] {
    if (input === undefined) return [];
    if (!isFlatSearchMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateContract(input: unknown): SearchIssue[] {
    if (!isPlainRecord(input) || typeof input.provider !== "string" || !PROVIDER_NAME.test(input.provider) || typeof input.search !== "function") {
      return [{ field: "provider", message: "Invalid Provider Contract: a provider name and a search method are required." }];
    }
    return [];
  }

  function validateSnapshotId(input: string): SearchIssue[] {
    if (!SNAPSHOT_ID.test(input)) return [invalid("snapshotId", "a well-formed snapshot id is required.")];
    return [];
  }

  function validateInput(input: unknown): SearchIssue[] {
    if (!isPlainRecord(input)) return [{ field: "provider", message: "Missing Provider: a registered provider is required." }];
    const issues: SearchIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(SEARCH_PROVIDER_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    if (typeof input.provider !== "string" || !PROVIDER_NAME.test(input.provider)) {
      issues.push({ field: "provider", message: "Missing Provider: a registered provider is required." });
    }
    if (typeof input.keyword !== "string" || input.keyword.trim() === "") issues.push(invalid("keyword", "a keyword is required."));
    if (typeof input.language !== "string" || !LANGUAGE.test(input.language)) issues.push(invalid("language", "language must be a two-letter code."));
    if (typeof input.country !== "string" || !COUNTRY.test(input.country)) issues.push(invalid("country", "country must be a two-letter code."));
    if (typeof input.device !== "string" || !(SEARCH_PROVIDER_DEVICES as readonly string[]).includes(input.device)) {
      issues.push(invalid("device", "device must be desktop, mobile, or tablet."));
    }
    if (typeof input.market !== "string" || !MARKET.test(input.market)) issues.push(invalid("market", "market must be a lowercase token."));
    if (typeof input.searchHtml !== "string") issues.push(invalid("searchHtml", "searchHtml must be text."));
    for (const key of METADATA_FIELDS) {
      issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    return issues;
  }

  return { validateInput, validateMetadata, validateContract, validateSnapshotId };
}
