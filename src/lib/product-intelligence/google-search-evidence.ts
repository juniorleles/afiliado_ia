/**
 * Host record domain: google search evidence.
 *
 * Frozen records of measurable search and advertisement signals restated
 * from one search context. Presence means a construct was observed on the
 * page. It is not a judgment. This module does not fetch a page and does
 * not run another engine.
 */
export type GoogleSearchMetadata = Record<string, string | number | boolean | null>;

export const GOOGLE_SEARCH_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleSearchStatus = (typeof GOOGLE_SEARCH_STATUSES)[number];

export const GOOGLE_SEARCH_ORIGINS = ["OBSERVED"] as const;
export type GoogleSearchOrigin = (typeof GOOGLE_SEARCH_ORIGINS)[number];

export const GOOGLE_SEARCH_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type GoogleSearchProvenance = (typeof GOOGLE_SEARCH_PROVENANCE)[number];

export const GOOGLE_SEARCH_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type GoogleSearchPresence = (typeof GOOGLE_SEARCH_PRESENCE)[number];

export interface GoogleSearchIssue {
  field: string;
  message: string;
}

export const GOOGLE_SEARCH_SOURCE_FACT_KEYS = ["field", "text", "sourceUrl", "confidence"] as const;

export interface GoogleSearchSourceFact {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: GoogleSearchProvenance;
}

export const GOOGLE_SEARCH_EVIDENCE_KEYS = [
  "searchResultPresence",
  "officialWebsite",
  "marketplacePresence",
  "reviewWebsites",
  "comparisonWebsites",
  "faqResults",
  "relatedSearches",
  "searchSuggestions",
  "peopleAlsoAskPresence",
  "knowledgePanelPresence",
  "sponsoredResultPresence",
  "sponsoredResultCount",
  "officialAdvertiser",
  "affiliateAdvertisers",
  "marketplaceAdvertisers",
  "productName",
  "vendor",
  "category",
  "landingPage",
  "origin",
  "provenance",
  "sourceUrl",
  "sourceFacts",
  "metadata",
] as const;

export interface SearchEvidence {
  searchResultPresence: GoogleSearchPresence;
  officialWebsite: string | null;
  marketplacePresence: GoogleSearchPresence;
  reviewWebsites: readonly string[];
  comparisonWebsites: readonly string[];
  faqResults: readonly string[];
  relatedSearches: readonly string[];
  searchSuggestions: readonly string[];
  peopleAlsoAskPresence: GoogleSearchPresence;
  knowledgePanelPresence: GoogleSearchPresence;
  sponsoredResultPresence: GoogleSearchPresence;
  sponsoredResultCount: number;
  officialAdvertiser: string | null;
  affiliateAdvertisers: readonly string[];
  marketplaceAdvertisers: readonly string[];
  productName: string;
  vendor: string | null;
  category: string | null;
  landingPage: string | null;
  origin: GoogleSearchOrigin;
  provenance: GoogleSearchProvenance;
  sourceUrl: string;
  sourceFacts: readonly GoogleSearchSourceFact[];
  metadata: GoogleSearchMetadata;
}

export type GoogleSearchEvidence = SearchEvidence;

export interface GoogleSearchExtractedRecord {
  searchResultPresence: GoogleSearchPresence;
  officialWebsite: string | null;
  marketplacePresence: GoogleSearchPresence;
  reviewWebsites: readonly string[];
  comparisonWebsites: readonly string[];
  faqResults: readonly string[];
  relatedSearches: readonly string[];
  searchSuggestions: readonly string[];
  peopleAlsoAskPresence: GoogleSearchPresence;
  knowledgePanelPresence: GoogleSearchPresence;
  sponsoredResultPresence: GoogleSearchPresence;
  sponsoredResultCount: number;
  officialAdvertiser: string | null;
  affiliateAdvertisers: readonly string[];
  marketplaceAdvertisers: readonly string[];
}

export interface GoogleSearchIdentity {
  productName: string;
  vendor: string | null;
  category: string | null;
  landingPage: string | null;
}

export const GOOGLE_SEARCH_SNAPSHOT_KEYS = [
  "evidenceId",
  "productName",
  "landingPage",
  "createdAt",
  "metadata",
] as const;

export interface GoogleSearchSnapshot {
  evidenceId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata: GoogleSearchMetadata;
}

export interface GoogleSearchSnapshotInit {
  evidenceId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata?: GoogleSearchMetadata;
}

export const GOOGLE_SEARCH_STATISTICS_KEYS = ["signalCount", "sponsoredResultCount", "issueCount", "executionTime"] as const;

export interface GoogleSearchStatistics {
  signalCount: number;
  sponsoredResultCount: number;
  issueCount: number;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepGoogleSearch<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepGoogleSearch(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainGoogleSearch<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainGoogleSearch(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainGoogleSearch(inner)])) as T;
  }
  return value;
}

export function createGoogleSearchSnapshot(init: GoogleSearchSnapshotInit): GoogleSearchSnapshot {
  return freezeDeepGoogleSearch({
    evidenceId: init.evidenceId,
    productName: init.productName,
    landingPage: init.landingPage,
    createdAt: init.createdAt,
    metadata: copyPlainGoogleSearch(init.metadata ?? {}),
  });
}

export function computeGoogleSearchStatistics(init: GoogleSearchStatistics): GoogleSearchStatistics {
  return freezeDeepGoogleSearch({
    signalCount: init.signalCount,
    sponsoredResultCount: init.sponsoredResultCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function sourceFact(field: string, text: string | null, sourceUrl: string): GoogleSearchSourceFact | null {
  if (!text) return null;
  return { field, text, sourceUrl, confidence: "DIRECT_SOURCE" };
}

export function signalCountOf(evidence: SearchEvidence | null): number {
  if (!evidence) return 0;
  let count = 0;
  if (evidence.searchResultPresence === "PRESENT") count += 1;
  if (evidence.officialWebsite) count += 1;
  if (evidence.marketplacePresence === "PRESENT") count += 1;
  if (evidence.reviewWebsites.length > 0) count += 1;
  if (evidence.comparisonWebsites.length > 0) count += 1;
  if (evidence.faqResults.length > 0) count += 1;
  if (evidence.relatedSearches.length > 0) count += 1;
  if (evidence.searchSuggestions.length > 0) count += 1;
  if (evidence.peopleAlsoAskPresence === "PRESENT") count += 1;
  if (evidence.knowledgePanelPresence === "PRESENT") count += 1;
  if (evidence.sponsoredResultPresence === "PRESENT") count += 1;
  if (evidence.officialAdvertiser) count += 1;
  if (evidence.affiliateAdvertisers.length > 0) count += 1;
  if (evidence.marketplaceAdvertisers.length > 0) count += 1;
  return count;
}

export function createGoogleSearchEvidence(
  extracted: GoogleSearchExtractedRecord,
  identity: GoogleSearchIdentity,
  sourceUrl: string,
  metadata: GoogleSearchMetadata = {},
): SearchEvidence {
  const facts: GoogleSearchSourceFact[] = [];
  const push = (field: string, text: string | null) => {
    const item = sourceFact(field, text, sourceUrl);
    if (item) facts.push(item);
  };
  push("searchResultPresence", extracted.searchResultPresence);
  push("officialWebsite", extracted.officialWebsite);
  push("marketplacePresence", extracted.marketplacePresence);
  for (const item of extracted.reviewWebsites) push("reviewWebsites", item);
  for (const item of extracted.comparisonWebsites) push("comparisonWebsites", item);
  for (const item of extracted.faqResults) push("faqResults", item);
  for (const item of extracted.relatedSearches) push("relatedSearches", item);
  for (const item of extracted.searchSuggestions) push("searchSuggestions", item);
  push("peopleAlsoAskPresence", extracted.peopleAlsoAskPresence);
  push("knowledgePanelPresence", extracted.knowledgePanelPresence);
  push("sponsoredResultPresence", extracted.sponsoredResultPresence);
  push("sponsoredResultCount", String(extracted.sponsoredResultCount));
  push("officialAdvertiser", extracted.officialAdvertiser);
  for (const item of extracted.affiliateAdvertisers) push("affiliateAdvertisers", item);
  for (const item of extracted.marketplaceAdvertisers) push("marketplaceAdvertisers", item);
  push("productName", identity.productName);
  push("vendor", identity.vendor);
  push("category", identity.category);
  push("landingPage", identity.landingPage);
  return freezeDeepGoogleSearch({
    ...extracted,
    productName: identity.productName,
    vendor: identity.vendor,
    category: identity.category,
    landingPage: identity.landingPage,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    sourceUrl,
    sourceFacts: facts,
    metadata: copyPlainGoogleSearch(metadata),
  });
}
