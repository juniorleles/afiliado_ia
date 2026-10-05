/**
 * Host record domain: competition evidence.
 *
 * Frozen records of measurable advertiser, market, and advertisement
 * constructs restated from ProductFacts, landing page evidence, and search
 * evidence. Presence means a construct was observed. It is not a judgment
 * and not a decision to advertise. This module does not fetch a page and
 * does not run another engine.
 */
export type CompetitionMetadata = Record<string, string | number | boolean | null>;

export const COMPETITION_STATUSES = ["OK", "REJECTED"] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export const COMPETITION_ORIGINS = ["OBSERVED"] as const;
export type CompetitionOrigin = (typeof COMPETITION_ORIGINS)[number];

export const COMPETITION_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type CompetitionProvenance = (typeof COMPETITION_PROVENANCE)[number];

export const COMPETITION_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type CompetitionPresence = (typeof COMPETITION_PRESENCE)[number];

export interface CompetitionIssue {
  field: string;
  message: string;
}

export const COMPETITION_SOURCE_FACT_KEYS = ["field", "text", "sourceUrl", "confidence"] as const;

export interface CompetitionSourceFact {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: CompetitionProvenance;
}

export const COMPETITION_EVIDENCE_KEYS = [
  "numberOfAdvertisers",
  "officialAdvertisers",
  "affiliateAdvertisers",
  "marketplaceAdvertisers",
  "reviewSites",
  "comparisonSites",
  "brandPresence",
  "organicCompetition",
  "sponsoredCompetition",
  "brandStrength",
  "affiliateDensity",
  "authorityDomains",
  "largePublishers",
  "independentPublishers",
  "marketplacePresence",
  "searchAdsPresent",
  "officialAds",
  "affiliateAds",
  "shoppingAds",
  "videoAdsPresence",
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

export interface CompetitionEvidence {
  numberOfAdvertisers: number;
  officialAdvertisers: readonly string[];
  affiliateAdvertisers: readonly string[];
  marketplaceAdvertisers: readonly string[];
  reviewSites: readonly string[];
  comparisonSites: readonly string[];
  brandPresence: CompetitionPresence;
  organicCompetition: CompetitionPresence;
  sponsoredCompetition: CompetitionPresence;
  brandStrength: CompetitionPresence;
  affiliateDensity: number;
  authorityDomains: readonly string[];
  largePublishers: readonly string[];
  independentPublishers: readonly string[];
  marketplacePresence: CompetitionPresence;
  searchAdsPresent: CompetitionPresence;
  officialAds: CompetitionPresence;
  affiliateAds: CompetitionPresence;
  shoppingAds: CompetitionPresence;
  videoAdsPresence: CompetitionPresence;
  productName: string;
  vendor: string | null;
  category: string | null;
  landingPage: string | null;
  origin: CompetitionOrigin;
  provenance: CompetitionProvenance;
  sourceUrl: string;
  sourceFacts: readonly CompetitionSourceFact[];
  metadata: CompetitionMetadata;
}

export interface CompetitionExtractedRecord {
  numberOfAdvertisers: number;
  officialAdvertisers: readonly string[];
  affiliateAdvertisers: readonly string[];
  marketplaceAdvertisers: readonly string[];
  reviewSites: readonly string[];
  comparisonSites: readonly string[];
  brandPresence: CompetitionPresence;
  organicCompetition: CompetitionPresence;
  sponsoredCompetition: CompetitionPresence;
  brandStrength: CompetitionPresence;
  affiliateDensity: number;
  authorityDomains: readonly string[];
  largePublishers: readonly string[];
  independentPublishers: readonly string[];
  marketplacePresence: CompetitionPresence;
  searchAdsPresent: CompetitionPresence;
  officialAds: CompetitionPresence;
  affiliateAds: CompetitionPresence;
  shoppingAds: CompetitionPresence;
  videoAdsPresence: CompetitionPresence;
}

export interface CompetitionIdentity {
  productName: string;
  vendor: string | null;
  category: string | null;
  landingPage: string | null;
}

export const COMPETITION_SNAPSHOT_KEYS = [
  "evidenceId",
  "productName",
  "landingPage",
  "createdAt",
  "metadata",
] as const;

export interface CompetitionSnapshot {
  evidenceId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata: CompetitionMetadata;
}

export interface CompetitionSnapshotInit {
  evidenceId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata?: CompetitionMetadata;
}

export const COMPETITION_STATISTICS_KEYS = ["signalCount", "advertiserCount", "issueCount", "executionTime"] as const;

export interface CompetitionStatistics {
  signalCount: number;
  advertiserCount: number;
  issueCount: number;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepCompetition<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepCompetition(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainCompetition<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainCompetition(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainCompetition(inner)])) as T;
  }
  return value;
}

export function createCompetitionSnapshot(init: CompetitionSnapshotInit): CompetitionSnapshot {
  return freezeDeepCompetition({
    evidenceId: init.evidenceId,
    productName: init.productName,
    landingPage: init.landingPage,
    createdAt: init.createdAt,
    metadata: copyPlainCompetition(init.metadata ?? {}),
  });
}

export function computeCompetitionStatistics(init: CompetitionStatistics): CompetitionStatistics {
  return freezeDeepCompetition({
    signalCount: init.signalCount,
    advertiserCount: init.advertiserCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function sourceFact(field: string, text: string | null, sourceUrl: string): CompetitionSourceFact | null {
  if (!text) return null;
  return { field, text, sourceUrl, confidence: "DIRECT_SOURCE" };
}

export function signalCountOf(evidence: CompetitionEvidence | null): number {
  if (!evidence) return 0;
  let count = 0;
  if (evidence.numberOfAdvertisers > 0) count += 1;
  if (evidence.officialAdvertisers.length > 0) count += 1;
  if (evidence.affiliateAdvertisers.length > 0) count += 1;
  if (evidence.marketplaceAdvertisers.length > 0) count += 1;
  if (evidence.reviewSites.length > 0) count += 1;
  if (evidence.comparisonSites.length > 0) count += 1;
  if (evidence.brandPresence === "PRESENT") count += 1;
  if (evidence.organicCompetition === "PRESENT") count += 1;
  if (evidence.sponsoredCompetition === "PRESENT") count += 1;
  if (evidence.brandStrength === "PRESENT") count += 1;
  if (evidence.affiliateDensity > 0) count += 1;
  if (evidence.authorityDomains.length > 0) count += 1;
  if (evidence.largePublishers.length > 0) count += 1;
  if (evidence.independentPublishers.length > 0) count += 1;
  if (evidence.marketplacePresence === "PRESENT") count += 1;
  if (evidence.searchAdsPresent === "PRESENT") count += 1;
  if (evidence.officialAds === "PRESENT") count += 1;
  if (evidence.affiliateAds === "PRESENT") count += 1;
  if (evidence.shoppingAds === "PRESENT") count += 1;
  if (evidence.videoAdsPresence === "PRESENT") count += 1;
  return count;
}

export function createCompetitionEvidence(
  extracted: CompetitionExtractedRecord,
  identity: CompetitionIdentity,
  sourceUrl: string,
  metadata: CompetitionMetadata = {},
): CompetitionEvidence {
  const facts: CompetitionSourceFact[] = [];
  const push = (field: string, text: string | null) => {
    const item = sourceFact(field, text, sourceUrl);
    if (item) facts.push(item);
  };
  push("numberOfAdvertisers", String(extracted.numberOfAdvertisers));
  for (const item of extracted.officialAdvertisers) push("officialAdvertisers", item);
  for (const item of extracted.affiliateAdvertisers) push("affiliateAdvertisers", item);
  for (const item of extracted.marketplaceAdvertisers) push("marketplaceAdvertisers", item);
  for (const item of extracted.reviewSites) push("reviewSites", item);
  for (const item of extracted.comparisonSites) push("comparisonSites", item);
  push("brandPresence", extracted.brandPresence);
  push("organicCompetition", extracted.organicCompetition);
  push("sponsoredCompetition", extracted.sponsoredCompetition);
  push("brandStrength", extracted.brandStrength);
  push("affiliateDensity", String(extracted.affiliateDensity));
  for (const item of extracted.authorityDomains) push("authorityDomains", item);
  for (const item of extracted.largePublishers) push("largePublishers", item);
  for (const item of extracted.independentPublishers) push("independentPublishers", item);
  push("marketplacePresence", extracted.marketplacePresence);
  push("searchAdsPresent", extracted.searchAdsPresent);
  push("officialAds", extracted.officialAds);
  push("affiliateAds", extracted.affiliateAds);
  push("shoppingAds", extracted.shoppingAds);
  push("videoAdsPresence", extracted.videoAdsPresence);
  push("productName", identity.productName);
  push("vendor", identity.vendor);
  push("category", identity.category);
  push("landingPage", identity.landingPage);
  return freezeDeepCompetition({
    ...extracted,
    productName: identity.productName,
    vendor: identity.vendor,
    category: identity.category,
    landingPage: identity.landingPage,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    sourceUrl,
    sourceFacts: facts,
    metadata: copyPlainCompetition(metadata),
  });
}
