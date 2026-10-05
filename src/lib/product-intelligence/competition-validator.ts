/**
 * Host record domain: competition intelligence validator.
 *
 * Pure local rules for an analysis input, ProductFacts, SearchEvidence, an
 * optional landing page record, and snapshots. It rejects missing
 * ProductFacts, missing SearchEvidence, an invalid context, and invalid
 * metadata. It only reports problems: it never fetches a page and never
 * changes what it is given.
 */
import { COMPETITION_CONTEXT_MEMBERS } from "./competition-context";
import { COMPETITION_SNAPSHOT_KEYS, type CompetitionIssue, type CompetitionMetadata } from "./competition-evidence";

const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface CompetitionValidator {
  validateInput(input: unknown): CompetitionIssue[];
  validateProductFacts(input: unknown): CompetitionIssue[];
  validateSearchEvidence(input: unknown): CompetitionIssue[];
  validateContext(input: unknown): CompetitionIssue[];
  validateMetadata(input: unknown): CompetitionIssue[];
  validateSnapshot(input: unknown): CompetitionIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatCompetitionMetadata(value: unknown): value is CompetitionMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function productNameOf(input: Record<string, unknown>): string | null {
  const facts = isPlainRecord(input.productFacts) ? input.productFacts : null;
  const search = isPlainRecord(input.searchEvidence) ? input.searchEvidence : null;
  return (
    (facts ? textOf(facts.productName) ?? textOf(facts.name) : null) ??
    (search ? textOf(search.productName) ?? textOf(search.name) : null)
  );
}

export function createCompetitionValidator(): CompetitionValidator {
  function validateMetadata(input: unknown): CompetitionIssue[] {
    if (input === undefined) return [];
    if (!isFlatCompetitionMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateProductFacts(input: unknown): CompetitionIssue[] {
    if (!isPlainRecord(input) || input.productFacts === undefined || input.productFacts === null) {
      return [{ field: "productFacts", message: "Missing ProductFacts: a ProductFacts record is required." }];
    }
    if (!isPlainRecord(input.productFacts)) {
      return [{ field: "productFacts", message: "Missing ProductFacts: ProductFacts must be a plain record." }];
    }
    return [];
  }

  function validateSearchEvidence(input: unknown): CompetitionIssue[] {
    if (!isPlainRecord(input) || input.searchEvidence === undefined || input.searchEvidence === null) {
      return [{ field: "searchEvidence", message: "Missing SearchEvidence: a SearchEvidence record is required." }];
    }
    if (!isPlainRecord(input.searchEvidence)) {
      return [{ field: "searchEvidence", message: "Invalid Context: SearchEvidence must be a plain record." }];
    }
    return [];
  }

  function validateContext(input: unknown): CompetitionIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Invalid Context: an object of ProductFacts and SearchEvidence is required." }];
    }
    const issues: CompetitionIssue[] = [];
    if (input.landingPageEvidence !== undefined && input.landingPageEvidence !== null && !isPlainRecord(input.landingPageEvidence)) {
      issues.push({ field: "landingPageEvidence", message: "Invalid Context: landing page evidence must be a plain record." });
    }
    if (isPlainRecord(input.searchEvidence)) {
      const search = input.searchEvidence;
      if (search.affiliateAdvertisers !== undefined && search.affiliateAdvertisers !== null && !Array.isArray(search.affiliateAdvertisers)) {
        issues.push({ field: "searchEvidence.affiliateAdvertisers", message: "Invalid Context: affiliate advertisers must be a list." });
      }
      if (search.marketplaceAdvertisers !== undefined && search.marketplaceAdvertisers !== null && !Array.isArray(search.marketplaceAdvertisers)) {
        issues.push({ field: "searchEvidence.marketplaceAdvertisers", message: "Invalid Context: marketplace advertisers must be a list." });
      }
      if (search.reviewWebsites !== undefined && search.reviewWebsites !== null && !Array.isArray(search.reviewWebsites)) {
        issues.push({ field: "searchEvidence.reviewWebsites", message: "Invalid Context: review websites must be a list." });
      }
      if (search.comparisonWebsites !== undefined && search.comparisonWebsites !== null && !Array.isArray(search.comparisonWebsites)) {
        issues.push({ field: "searchEvidence.comparisonWebsites", message: "Invalid Context: comparison websites must be a list." });
      }
    }
    if (isPlainRecord(input.landingPageEvidence)) {
      const page = input.landingPageEvidence;
      if (page.authoritySignals !== undefined && page.authoritySignals !== null && !Array.isArray(page.authoritySignals)) {
        issues.push({ field: "landingPageEvidence.authoritySignals", message: "Invalid Context: authority signals must be a list." });
      }
    }
    if (productNameOf(input) === null) {
      issues.push({ field: "productName", message: "Invalid Context: a product name is required." });
    }
    return issues;
  }

  function validateInput(input: unknown): CompetitionIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Invalid Metadata: an object of ProductFacts and SearchEvidence is required." }];
    }
    const issues: CompetitionIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(COMPETITION_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateProductFacts(input));
    issues.push(...validateSearchEvidence(input));
    if (issues.length === 0 || !issues.some((item) => /Invalid Context/.test(item.message))) {
      issues.push(...validateContext(input));
    }
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): CompetitionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: CompetitionIssue[] = [];
    for (const field of COMPETITION_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.evidenceId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.evidenceId)) {
      issues.push({ field: "evidenceId", message: "Invalid Metadata: a well-formed evidence id is required." });
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Invalid Context: a product name is required." });
    }
    if (input.landingPage !== null && (typeof input.landingPage !== "string" || !HTTPS.test(input.landingPage))) {
      issues.push({ field: "landingPage", message: "Invalid Context: landingPage must be a well-formed https address." });
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
    validateSearchEvidence,
    validateContext,
    validateMetadata,
    validateSnapshot,
  };
}
