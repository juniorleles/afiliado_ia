/**
 * Host record domain: commercial evidence.
 *
 * Frozen records of measurable purchase, market, and business constructs
 * restated from ProductFacts, landing page evidence, SearchEvidence, and
 * CompetitionEvidence. Presence means a construct was observed. It is not
 * a judgment, not an approval, and not a refusal of a product. This module
 * does not fetch a page and does not run another engine.
 */
export type CommercialMetadata = Record<string, string | number | boolean | null>;

export const COMMERCIAL_STATUSES = ["OK", "REJECTED"] as const;
export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number];

export const COMMERCIAL_ORIGINS = ["OBSERVED"] as const;
export type CommercialOrigin = (typeof COMMERCIAL_ORIGINS)[number];

export const COMMERCIAL_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type CommercialProvenance = (typeof COMMERCIAL_PROVENANCE)[number];

export const COMMERCIAL_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type CommercialPresence = (typeof COMMERCIAL_PRESENCE)[number];

export interface CommercialIssue {
  field: string;
  message: string;
}

export const COMMERCIAL_SOURCE_FACT_KEYS = ["field", "text", "sourceUrl", "confidence"] as const;

export interface CommercialSourceFact {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: CommercialProvenance;
}

export const COMMERCIAL_EVIDENCE_KEYS = [
  "directPurchaseIntent",
  "priceVisibility",
  "strongCallToAction",
  "salesFunnelPresence",
  "checkoutPresence",
  "guarantee",
  "refundPolicy",
  "recurringBilling",
  "upsellPresence",
  "downsellPresence",
  "leadCapture",
  "emailCapture",
  "affiliateResources",
  "commercialSearchPresence",
  "brandSearchPresence",
  "reviewSearchPresence",
  "comparisonSearchPresence",
  "affiliateSearchPresence",
  "sponsoredSearchPresence",
  "vendorReputation",
  "productMaturity",
  "offerStability",
  "supportAvailability",
  "localization",
  "languageCoverage",
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

export interface CommercialEvidence {
  directPurchaseIntent: CommercialPresence;
  priceVisibility: CommercialPresence;
  strongCallToAction: CommercialPresence;
  salesFunnelPresence: CommercialPresence;
  checkoutPresence: CommercialPresence;
  guarantee: string | null;
  refundPolicy: string | null;
  recurringBilling: CommercialPresence;
  upsellPresence: CommercialPresence;
  downsellPresence: CommercialPresence;
  leadCapture: CommercialPresence;
  emailCapture: CommercialPresence;
  affiliateResources: readonly string[];
  commercialSearchPresence: CommercialPresence;
  brandSearchPresence: CommercialPresence;
  reviewSearchPresence: CommercialPresence;
  comparisonSearchPresence: CommercialPresence;
  affiliateSearchPresence: CommercialPresence;
  sponsoredSearchPresence: CommercialPresence;
  vendorReputation: CommercialPresence;
  productMaturity: CommercialPresence;
  offerStability: CommercialPresence;
  supportAvailability: CommercialPresence;
  localization: CommercialPresence;
  languageCoverage: string | null;
  productName: string;
  vendor: string | null;
  category: string | null;
  landingPage: string | null;
  origin: CommercialOrigin;
  provenance: CommercialProvenance;
  sourceUrl: string;
  sourceFacts: readonly CommercialSourceFact[];
  metadata: CommercialMetadata;
}

export interface CommercialExtractedRecord {
  directPurchaseIntent: CommercialPresence;
  priceVisibility: CommercialPresence;
  strongCallToAction: CommercialPresence;
  salesFunnelPresence: CommercialPresence;
  checkoutPresence: CommercialPresence;
  guarantee: string | null;
  refundPolicy: string | null;
  recurringBilling: CommercialPresence;
  upsellPresence: CommercialPresence;
  downsellPresence: CommercialPresence;
  leadCapture: CommercialPresence;
  emailCapture: CommercialPresence;
  affiliateResources: readonly string[];
  commercialSearchPresence: CommercialPresence;
  brandSearchPresence: CommercialPresence;
  reviewSearchPresence: CommercialPresence;
  comparisonSearchPresence: CommercialPresence;
  affiliateSearchPresence: CommercialPresence;
  sponsoredSearchPresence: CommercialPresence;
  vendorReputation: CommercialPresence;
  productMaturity: CommercialPresence;
  offerStability: CommercialPresence;
  supportAvailability: CommercialPresence;
  localization: CommercialPresence;
  languageCoverage: string | null;
}

export interface CommercialIdentity {
  productName: string;
  vendor: string | null;
  category: string | null;
  landingPage: string | null;
}

export const COMMERCIAL_SNAPSHOT_KEYS = [
  "evidenceId",
  "productName",
  "landingPage",
  "createdAt",
  "metadata",
] as const;

export interface CommercialSnapshot {
  evidenceId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata: CommercialMetadata;
}

export interface CommercialSnapshotInit {
  evidenceId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata?: CommercialMetadata;
}

export const COMMERCIAL_STATISTICS_KEYS = ["signalCount", "marketSignalCount", "issueCount", "executionTime"] as const;

export interface CommercialStatistics {
  signalCount: number;
  marketSignalCount: number;
  issueCount: number;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepCommercial<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepCommercial(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainCommercial<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainCommercial(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainCommercial(inner)])) as T;
  }
  return value;
}

export function createCommercialSnapshot(init: CommercialSnapshotInit): CommercialSnapshot {
  return freezeDeepCommercial({
    evidenceId: init.evidenceId,
    productName: init.productName,
    landingPage: init.landingPage,
    createdAt: init.createdAt,
    metadata: copyPlainCommercial(init.metadata ?? {}),
  });
}

export function computeCommercialStatistics(init: CommercialStatistics): CommercialStatistics {
  return freezeDeepCommercial({
    signalCount: init.signalCount,
    marketSignalCount: init.marketSignalCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function sourceFact(field: string, text: string | null, sourceUrl: string): CommercialSourceFact | null {
  if (!text) return null;
  return { field, text, sourceUrl, confidence: "DIRECT_SOURCE" };
}

export function marketSignalCountOf(evidence: CommercialEvidence | null): number {
  if (!evidence) return 0;
  let count = 0;
  if (evidence.commercialSearchPresence === "PRESENT") count += 1;
  if (evidence.brandSearchPresence === "PRESENT") count += 1;
  if (evidence.reviewSearchPresence === "PRESENT") count += 1;
  if (evidence.comparisonSearchPresence === "PRESENT") count += 1;
  if (evidence.affiliateSearchPresence === "PRESENT") count += 1;
  if (evidence.sponsoredSearchPresence === "PRESENT") count += 1;
  return count;
}

export function signalCountOf(evidence: CommercialEvidence | null): number {
  if (!evidence) return 0;
  let count = 0;
  if (evidence.directPurchaseIntent === "PRESENT") count += 1;
  if (evidence.priceVisibility === "PRESENT") count += 1;
  if (evidence.strongCallToAction === "PRESENT") count += 1;
  if (evidence.salesFunnelPresence === "PRESENT") count += 1;
  if (evidence.checkoutPresence === "PRESENT") count += 1;
  if (evidence.guarantee) count += 1;
  if (evidence.refundPolicy) count += 1;
  if (evidence.recurringBilling === "PRESENT") count += 1;
  if (evidence.upsellPresence === "PRESENT") count += 1;
  if (evidence.downsellPresence === "PRESENT") count += 1;
  if (evidence.leadCapture === "PRESENT") count += 1;
  if (evidence.emailCapture === "PRESENT") count += 1;
  if (evidence.affiliateResources.length > 0) count += 1;
  count += marketSignalCountOf(evidence);
  if (evidence.vendorReputation === "PRESENT") count += 1;
  if (evidence.productMaturity === "PRESENT") count += 1;
  if (evidence.offerStability === "PRESENT") count += 1;
  if (evidence.supportAvailability === "PRESENT") count += 1;
  if (evidence.localization === "PRESENT") count += 1;
  if (evidence.languageCoverage) count += 1;
  return count;
}

export function createCommercialEvidence(
  extracted: CommercialExtractedRecord,
  identity: CommercialIdentity,
  sourceUrl: string,
  metadata: CommercialMetadata = {},
): CommercialEvidence {
  const facts: CommercialSourceFact[] = [];
  const push = (field: string, text: string | null) => {
    const item = sourceFact(field, text, sourceUrl);
    if (item) facts.push(item);
  };
  push("directPurchaseIntent", extracted.directPurchaseIntent);
  push("priceVisibility", extracted.priceVisibility);
  push("strongCallToAction", extracted.strongCallToAction);
  push("salesFunnelPresence", extracted.salesFunnelPresence);
  push("checkoutPresence", extracted.checkoutPresence);
  push("guarantee", extracted.guarantee);
  push("refundPolicy", extracted.refundPolicy);
  push("recurringBilling", extracted.recurringBilling);
  push("upsellPresence", extracted.upsellPresence);
  push("downsellPresence", extracted.downsellPresence);
  push("leadCapture", extracted.leadCapture);
  push("emailCapture", extracted.emailCapture);
  for (const item of extracted.affiliateResources) push("affiliateResources", item);
  push("commercialSearchPresence", extracted.commercialSearchPresence);
  push("brandSearchPresence", extracted.brandSearchPresence);
  push("reviewSearchPresence", extracted.reviewSearchPresence);
  push("comparisonSearchPresence", extracted.comparisonSearchPresence);
  push("affiliateSearchPresence", extracted.affiliateSearchPresence);
  push("sponsoredSearchPresence", extracted.sponsoredSearchPresence);
  push("vendorReputation", extracted.vendorReputation);
  push("productMaturity", extracted.productMaturity);
  push("offerStability", extracted.offerStability);
  push("supportAvailability", extracted.supportAvailability);
  push("localization", extracted.localization);
  push("languageCoverage", extracted.languageCoverage);
  push("productName", identity.productName);
  push("vendor", identity.vendor);
  push("category", identity.category);
  push("landingPage", identity.landingPage);
  return freezeDeepCommercial({
    ...extracted,
    productName: identity.productName,
    vendor: identity.vendor,
    category: identity.category,
    landingPage: identity.landingPage,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    sourceUrl,
    sourceFacts: facts,
    metadata: copyPlainCommercial(metadata),
  });
}
