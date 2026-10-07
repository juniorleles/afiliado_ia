/**
 * Host record domain: landing page evidence.
 *
 * Frozen records of measurable signals restated from one page: copy blocks,
 * presence tokens, technical fields, provenance, statistics, and a snapshot.
 * Presence means a token was observed on the page. It is not a judgment.
 * This module does not fetch a page and does not run another engine.
 */
export type LandingPageMetadata = Record<string, string | number | boolean | null>;

export const LANDING_PAGE_STATUSES = ["OK", "REJECTED"] as const;
export type LandingPageStatus = (typeof LANDING_PAGE_STATUSES)[number];

export const LANDING_PAGE_ORIGINS = ["OBSERVED"] as const;
export type LandingPageOrigin = (typeof LANDING_PAGE_ORIGINS)[number];

export const LANDING_PAGE_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type LandingPageProvenance = (typeof LANDING_PAGE_PROVENANCE)[number];

export const LANDING_PAGE_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type LandingPagePresence = (typeof LANDING_PAGE_PRESENCE)[number];

export interface LandingPageIssue {
  field: string;
  message: string;
}

export const LANDING_PAGE_SOURCE_FACT_KEYS = ["field", "text", "sourceUrl", "confidence"] as const;

export interface LandingPageSourceFact {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: LandingPageProvenance;
}

export const LANDING_PAGE_EVIDENCE_KEYS = [
  "headline",
  "subheadline",
  "primaryCta",
  "secondaryCta",
  "offerStructure",
  "priceVisibility",
  "guarantee",
  "testimonials",
  "reviews",
  "authoritySignals",
  "trustBadges",
  "faq",
  "videoPresence",
  "images",
  "contactInformation",
  "footerLinks",
  "privacyPolicy",
  "termsOfService",
  "refundPolicy",
  "title",
  "metaDescription",
  "canonical",
  "language",
  "mobileFriendly",
  "viewport",
  "schemaOrg",
  "pageSize",
  "assetCount",
  "origin",
  "provenance",
  "sourceUrl",
  "sourceFacts",
  "metadata",
] as const;

export interface LandingPageEvidence {
  headline: string | null;
  subheadline: string | null;
  primaryCta: string | null;
  secondaryCta: string | null;
  offerStructure: string | null;
  priceVisibility: LandingPagePresence;
  guarantee: string | null;
  testimonials: readonly string[];
  reviews: readonly string[];
  authoritySignals: readonly string[];
  trustBadges: readonly string[];
  faq: readonly string[];
  videoPresence: LandingPagePresence;
  images: readonly string[];
  contactInformation: string | null;
  footerLinks: readonly string[];
  privacyPolicy: string | null;
  termsOfService: string | null;
  refundPolicy: string | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  language: string | null;
  mobileFriendly: LandingPagePresence;
  viewport: string | null;
  schemaOrg: readonly string[];
  pageSize: number;
  assetCount: number;
  origin: LandingPageOrigin;
  provenance: LandingPageProvenance;
  sourceUrl: string;
  sourceFacts: readonly LandingPageSourceFact[];
  metadata: LandingPageMetadata;
}

export interface LandingPageExtractedRecord {
  headline: string | null;
  subheadline: string | null;
  primaryCta: string | null;
  secondaryCta: string | null;
  offerStructure: string | null;
  priceVisibility: LandingPagePresence;
  guarantee: string | null;
  testimonials: readonly string[];
  reviews: readonly string[];
  authoritySignals: readonly string[];
  trustBadges: readonly string[];
  faq: readonly string[];
  videoPresence: LandingPagePresence;
  images: readonly string[];
  contactInformation: string | null;
  footerLinks: readonly string[];
  privacyPolicy: string | null;
  termsOfService: string | null;
  refundPolicy: string | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  language: string | null;
  mobileFriendly: LandingPagePresence;
  viewport: string | null;
  schemaOrg: readonly string[];
  pageSize: number;
  assetCount: number;
}

export const LANDING_PAGE_SNAPSHOT_KEYS = [
  "evidenceId",
  "sourceUrl",
  "headline",
  "createdAt",
  "metadata",
] as const;

export interface LandingPageSnapshot {
  evidenceId: string;
  sourceUrl: string;
  headline: string | null;
  createdAt: string;
  metadata: LandingPageMetadata;
}

export interface LandingPageSnapshotInit {
  evidenceId: string;
  sourceUrl: string;
  headline: string | null;
  createdAt: string;
  metadata?: LandingPageMetadata;
}

export const LANDING_PAGE_STATISTICS_KEYS = ["signalCount", "assetCount", "issueCount", "executionTime"] as const;

export interface LandingPageStatistics {
  signalCount: number;
  assetCount: number;
  issueCount: number;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepLandingPage<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepLandingPage(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainLandingPage<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainLandingPage(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainLandingPage(inner)])) as T;
  }
  return value;
}

export function createLandingPageSnapshot(init: LandingPageSnapshotInit): LandingPageSnapshot {
  return freezeDeepLandingPage({
    evidenceId: init.evidenceId,
    sourceUrl: init.sourceUrl,
    headline: init.headline,
    createdAt: init.createdAt,
    metadata: copyPlainLandingPage(init.metadata ?? {}),
  });
}

export function computeLandingPageStatistics(init: LandingPageStatistics): LandingPageStatistics {
  return freezeDeepLandingPage({
    signalCount: init.signalCount,
    assetCount: init.assetCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function sourceFact(field: string, text: string | null, sourceUrl: string): LandingPageSourceFact | null {
  if (!text) return null;
  return { field, text, sourceUrl, confidence: "DIRECT_SOURCE" };
}

export function signalCountOf(evidence: LandingPageEvidence | null): number {
  if (!evidence) return 0;
  let count = 0;
  if (evidence.headline) count += 1;
  if (evidence.subheadline) count += 1;
  if (evidence.primaryCta) count += 1;
  if (evidence.secondaryCta) count += 1;
  if (evidence.offerStructure) count += 1;
  if (evidence.priceVisibility === "PRESENT") count += 1;
  if (evidence.guarantee) count += 1;
  if (evidence.testimonials.length > 0) count += 1;
  if (evidence.reviews.length > 0) count += 1;
  if (evidence.authoritySignals.length > 0) count += 1;
  if (evidence.trustBadges.length > 0) count += 1;
  if (evidence.faq.length > 0) count += 1;
  if (evidence.videoPresence === "PRESENT") count += 1;
  if (evidence.images.length > 0) count += 1;
  if (evidence.contactInformation) count += 1;
  if (evidence.footerLinks.length > 0) count += 1;
  if (evidence.privacyPolicy) count += 1;
  if (evidence.termsOfService) count += 1;
  if (evidence.refundPolicy) count += 1;
  if (evidence.title) count += 1;
  if (evidence.metaDescription) count += 1;
  if (evidence.canonical) count += 1;
  if (evidence.language) count += 1;
  if (evidence.mobileFriendly === "PRESENT") count += 1;
  if (evidence.viewport) count += 1;
  if (evidence.schemaOrg.length > 0) count += 1;
  return count;
}

export function createLandingPageEvidence(
  extracted: LandingPageExtractedRecord,
  sourceUrl: string,
  metadata: LandingPageMetadata = {},
): LandingPageEvidence {
  const facts: LandingPageSourceFact[] = [];
  const push = (field: string, text: string | null) => {
    const item = sourceFact(field, text, sourceUrl);
    if (item) facts.push(item);
  };
  push("headline", extracted.headline);
  push("subheadline", extracted.subheadline);
  push("primaryCta", extracted.primaryCta);
  push("secondaryCta", extracted.secondaryCta);
  push("offerStructure", extracted.offerStructure);
  push("priceVisibility", extracted.priceVisibility);
  push("guarantee", extracted.guarantee);
  for (const item of extracted.testimonials) push("testimonials", item);
  for (const item of extracted.reviews) push("reviews", item);
  for (const item of extracted.authoritySignals) push("authoritySignals", item);
  for (const item of extracted.trustBadges) push("trustBadges", item);
  for (const item of extracted.faq) push("faq", item);
  push("videoPresence", extracted.videoPresence);
  for (const item of extracted.images) push("images", item);
  push("contactInformation", extracted.contactInformation);
  for (const item of extracted.footerLinks) push("footerLinks", item);
  push("privacyPolicy", extracted.privacyPolicy);
  push("termsOfService", extracted.termsOfService);
  push("refundPolicy", extracted.refundPolicy);
  push("title", extracted.title);
  push("metaDescription", extracted.metaDescription);
  push("canonical", extracted.canonical);
  push("language", extracted.language);
  push("mobileFriendly", extracted.mobileFriendly);
  push("viewport", extracted.viewport);
  for (const item of extracted.schemaOrg) push("schemaOrg", item);
  return freezeDeepLandingPage({
    ...extracted,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    sourceUrl,
    sourceFacts: facts,
    metadata: copyPlainLandingPage(metadata),
  });
}
