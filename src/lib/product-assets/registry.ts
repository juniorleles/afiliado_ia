import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { AUTHORIZATION_KINDS, type AuthorizationEvidence, type ListingSection } from "@/lib/product-assets/types";

/**
 * Append-only record of how each asset was authorized (Execution 47B).
 * One JSON object per line. A later line for the same URL replaces the earlier one when read, and the
 * earlier line stays on disk, so a withdrawal is a new line with revokedAt and the history is kept.
 * This module records evidence. It never decides whether the evidence is enough: evaluate.ts does.
 */

export type AuthorizationRecord = {
  /** Original URL of the file, as the source lists it. */
  originalUrl: string;
  recordedAt: string;
  /** Where the source placed the file. Decides whether it was offered or only displayed. */
  listingSection: ListingSection;
  /** Product the source names for this file, when it names one. */
  declaredProduct: string | null;
  authorization: AuthorizationEvidence;
};

const LISTING_SECTIONS: readonly ListingSection[] = [
  "PRODUCT_IMAGES",
  "CAMPAIGN_IMAGES",
  "DISPLAYED_ONLY",
  "DOWNLOAD_PACK",
  "OFFICIAL_API",
  "META_TAG",
];

export function authorizationRegistryFile(directory: string): string {
  return path.join(directory, "authorization-records.jsonl");
}

export function validateAuthorizationRecord(record: AuthorizationRecord): string | null {
  if (!record || typeof record !== "object") return "The record is empty.";
  if (!/^https:\/\//.test(record.originalUrl ?? "")) return "The file URL must be HTTPS.";
  if (!record.recordedAt || !Number.isFinite(Date.parse(record.recordedAt))) return "The record has no readable date.";
  if (!LISTING_SECTIONS.includes(record.listingSection)) return "Unknown listing section.";
  const evidence = record.authorization;
  if (!evidence || !AUTHORIZATION_KINDS.includes(evidence.kind)) return "Unknown authorization kind.";
  if (!evidence.statement || evidence.statement.trim().length < 8) return "The evidence needs a recorded statement.";
  if (!evidence.verifiedAt || !Number.isFinite(Date.parse(evidence.verifiedAt))) return "The evidence has no readable verification date.";
  if (evidence.sourceUrl && !/^https:\/\//.test(evidence.sourceUrl)) return "The evidence source must be an HTTPS page.";
  return null;
}

/** Latest record per URL. Lines that cannot be read or validated are ignored, never trusted. */
export function parseAuthorizationRegistry(text: string): Map<string, AuthorizationRecord> {
  const latest = new Map<string, AuthorizationRecord>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as AuthorizationRecord;
      if (validateAuthorizationRecord(record)) continue;
      const prior = latest.get(record.originalUrl);
      if (!prior || Date.parse(record.recordedAt) >= Date.parse(prior.recordedAt)) latest.set(record.originalUrl, record);
    } catch {
      continue;
    }
  }
  return latest;
}

export function readAuthorizationRegistry(directory: string): Map<string, AuthorizationRecord> {
  const file = authorizationRegistryFile(directory);
  if (!existsSync(file)) return new Map();
  return parseAuthorizationRegistry(readFileSync(file, "utf8"));
}

export function recordAssetAuthorization(directory: string, record: AuthorizationRecord): void {
  const problem = validateAuthorizationRecord(record);
  if (problem) throw new Error(problem);
  mkdirSync(directory, { recursive: true });
  appendFileSync(authorizationRegistryFile(directory), `${JSON.stringify(record)}\n`, "utf8");
}
