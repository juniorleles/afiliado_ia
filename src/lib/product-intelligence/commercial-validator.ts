/**
 * Host record domain: commercial intelligence validator.
 *
 * Pure local rules for an analysis input, ProductFacts, CompetitionEvidence,
 * optional landing page and search records, and snapshots. It rejects missing
 * ProductFacts, missing CompetitionEvidence, an invalid context, and invalid
 * metadata. It only reports problems: it never fetches a page and never
 * changes what it is given.
 */
import { COMMERCIAL_CONTEXT_MEMBERS } from "./commercial-context";
import { COMMERCIAL_SNAPSHOT_KEYS, type CommercialIssue, type CommercialMetadata } from "./commercial-evidence";

const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface CommercialValidator {
  validateInput(input: unknown): CommercialIssue[];
  validateProductFacts(input: unknown): CommercialIssue[];
  validateCompetitionEvidence(input: unknown): CommercialIssue[];
  validateContext(input: unknown): CommercialIssue[];
  validateMetadata(input: unknown): CommercialIssue[];
  validateSnapshot(input: unknown): CommercialIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatCommercialMetadata(value: unknown): value is CommercialMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function productNameOf(input: Record<string, unknown>): string | null {
  const facts = isPlainRecord(input.productFacts) ? input.productFacts : null;
  const competition = isPlainRecord(input.competitionEvidence) ? input.competitionEvidence : null;
  const search = isPlainRecord(input.searchEvidence) ? input.searchEvidence : null;
  return (
    (facts ? textOf(facts.productName) ?? textOf(facts.name) : null) ??
    (competition ? textOf(competition.productName) ?? textOf(competition.name) : null) ??
    (search ? textOf(search.productName) ?? textOf(search.name) : null)
  );
}

function listIssue(record: Record<string, unknown>, field: string, label: string): CommercialIssue | null {
  if (record[field] !== undefined && record[field] !== null && !Array.isArray(record[field])) {
    return { field, message: `Invalid Context: ${label} must be a list.` };
  }
  return null;
}

export function createCommercialValidator(): CommercialValidator {
  function validateMetadata(input: unknown): CommercialIssue[] {
    if (input === undefined) return [];
    if (!isFlatCommercialMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateProductFacts(input: unknown): CommercialIssue[] {
    if (!isPlainRecord(input) || input.productFacts === undefined || input.productFacts === null) {
      return [{ field: "productFacts", message: "Missing ProductFacts: a ProductFacts record is required." }];
    }
    if (!isPlainRecord(input.productFacts)) {
      return [{ field: "productFacts", message: "Missing ProductFacts: ProductFacts must be a plain record." }];
    }
    return [];
  }

  function validateCompetitionEvidence(input: unknown): CommercialIssue[] {
    if (!isPlainRecord(input) || input.competitionEvidence === undefined || input.competitionEvidence === null) {
      return [{ field: "competitionEvidence", message: "Missing CompetitionEvidence: a CompetitionEvidence record is required." }];
    }
    if (!isPlainRecord(input.competitionEvidence)) {
      return [{ field: "competitionEvidence", message: "Invalid Context: CompetitionEvidence must be a plain record." }];
    }
    return [];
  }

  function validateContext(input: unknown): CommercialIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Invalid Context: an object of ProductFacts and CompetitionEvidence is required." }];
    }
    const issues: CommercialIssue[] = [];
    if (input.landingPageEvidence !== undefined && input.landingPageEvidence !== null && !isPlainRecord(input.landingPageEvidence)) {
      issues.push({ field: "landingPageEvidence", message: "Invalid Context: landing page evidence must be a plain record." });
    }
    if (input.searchEvidence !== undefined && input.searchEvidence !== null && !isPlainRecord(input.searchEvidence)) {
      issues.push({ field: "searchEvidence", message: "Invalid Context: SearchEvidence must be a plain record." });
    }
    if (isPlainRecord(input.productFacts)) {
      const item = listIssue(input.productFacts, "affiliateResources", "affiliate resources");
      if (item) issues.push({ ...item, field: "productFacts.affiliateResources" });
    }
    if (isPlainRecord(input.landingPageEvidence)) {
      const page = input.landingPageEvidence;
      for (const [field, label] of [
        ["authoritySignals", "authority signals"],
        ["trustBadges", "trust badges"],
        ["reviews", "reviews"],
      ] as const) {
        const item = listIssue(page, field, label);
        if (item) issues.push({ ...item, field: `landingPageEvidence.${field}` });
      }
    }
    if (isPlainRecord(input.searchEvidence)) {
      const search = input.searchEvidence;
      for (const [field, label] of [
        ["reviewWebsites", "review websites"],
        ["comparisonWebsites", "comparison websites"],
        ["affiliateAdvertisers", "affiliate advertisers"],
      ] as const) {
        const item = listIssue(search, field, label);
        if (item) issues.push({ ...item, field: `searchEvidence.${field}` });
      }
    }
    if (isPlainRecord(input.competitionEvidence)) {
      const competition = input.competitionEvidence;
      for (const [field, label] of [
        ["affiliateAdvertisers", "affiliate advertisers"],
        ["reviewSites", "review sites"],
        ["comparisonSites", "comparison sites"],
      ] as const) {
        const item = listIssue(competition, field, label);
        if (item) issues.push({ ...item, field: `competitionEvidence.${field}` });
      }
    }
    if (productNameOf(input) === null) {
      issues.push({ field: "productName", message: "Invalid Context: a product name is required." });
    }
    return issues;
  }

  function validateInput(input: unknown): CommercialIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "analyzer", message: "Invalid Metadata: an object of ProductFacts and CompetitionEvidence is required." }];
    }
    const issues: CommercialIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(COMMERCIAL_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateProductFacts(input));
    issues.push(...validateCompetitionEvidence(input));
    if (issues.length === 0 || !issues.some((item) => /Invalid Context/.test(item.message))) {
      issues.push(...validateContext(input));
    }
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): CommercialIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: CommercialIssue[] = [];
    for (const field of COMMERCIAL_SNAPSHOT_KEYS) {
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
    validateCompetitionEvidence,
    validateContext,
    validateMetadata,
    validateSnapshot,
  };
}
