import type { AffiliatePolicyContract, DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";

export const PRODUCT_RESEARCH_VERSION = 1 as const;

export const RESEARCH_JOB_STATUSES = [
  "NOT_RESEARCHED",
  "QUEUED",
  "RESEARCHING",
  "NEED_URL",
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
] as const;
export type ResearchJobStatus = (typeof RESEARCH_JOB_STATUSES)[number];

export const FIELD_REVIEW_STATUSES = [
  "NOT_RESEARCHED",
  "RESEARCHING",
  "FOUND_REVIEW_REQUIRED",
  "SELLER_STATED",
  "CONFLICTING",
  "UNVERIFIED",
  "NOT_FOUND",
  "ACCEPTED",
  "REJECTED",
] as const;
export type FieldReviewStatus = (typeof FIELD_REVIEW_STATUSES)[number];

export const PRODUCT_RESEARCH_FIELDS = [
  "description",
  "ingredients",
  "benefits",
  "howItWorks",
  "warnings",
  "pricing",
  "guarantee",
  "manufacturer",
  "faq",
  "images",
  "videos",
] as const;
export type ProductResearchField = (typeof PRODUCT_RESEARCH_FIELDS)[number];

export type FieldProposal = {
  field: ProductResearchField;
  currentValue: string;
  suggestedValue: string;
  status: FieldReviewStatus;
  evidenceIds: string[];
  sourceUrl: string | null;
  sourceClass: string | null;
  verification: string | null;
  restriction: string | null;
  collectedAt: string | null;
  eligibleForBatch: boolean;
  notes: string[];
  evidenceIncomplete?: boolean;
  evidenceExcerpt?: string | null;
  sourceType?: string | null;
  originalText?: string | null;
  recoveredText?: string | null;
  proposalKind?: "EXTRACTED" | "DERIVED_NEUTRAL" | "RECOVERED_OPERATIONAL";
  descriptionKind?: "EXTRACTED_DESCRIPTION" | "DERIVED_NEUTRAL_DESCRIPTION" | "EDITORIAL_REJECTED_DESCRIPTION";
  faqKind?: "OPERATIONAL" | "COMPOSITION" | "USAGE" | "DELIVERY" | "REFUND" | "HEALTH" | "PROMOTIONAL" | null;
  supersedesNote?: string | null;
};

export type FieldDecision = {
  field: ProductResearchField;
  action: "ACCEPT" | "REJECT";
  confirmedOverwrite: boolean;
  decidedAt: string;
  previousStatus: FieldReviewStatus;
  resultingStatus: FieldReviewStatus;
};

export type ProductResearchRun = {
  version: typeof PRODUCT_RESEARCH_VERSION;
  runId: string;
  campaignId: number;
  productName: string;
  status: ResearchJobStatus;
  stage: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  seeds: string[];
  seedRejection: string | null;
  limitations: string[];
  sources: Array<{
    url: string;
    ok: boolean;
    sourceClass: string | null;
    sourceType?: string | null;
    extractionMode?: string;
  }>;
  campaignSources?: Array<{
    sourceId: string;
    sourceType: string;
    sourceStatus: string;
    originalUrl: string;
    notes: string[];
  }>;
  affiliatePolicy?: AffiliatePolicyContract | null;
  discoveredAssets?: DiscoveredAffiliateAsset[];
  coverageTotal: number;
  coverageMax: number;
  reviewAccepted: number;
  reviewTotal: number;
  publicationReadiness: "BLOCKED" | "READY";
  publicationReason: string;
  grounding: "PASS" | "BLOCKED" | "NOT_EVALUATED";
  neutrality: "PASS" | "BLOCKED" | "NOT_EVALUATED";
  contentQuality: "PASS" | "BLOCKED" | "NOT_EVALUATED";
  commercialAuthorization: "BLOCKED";
  proposals: FieldProposal[];
  decisions: FieldDecision[];
  error: string | null;
  evidenceRegistry?: {
    entries: Array<{
      id: string;
      field: string;
      originalText: string;
      url: string;
      collectedAt: string | null;
      verification: string;
      sourceType?: string | null;
      sourceClassification?: string | null;
    }>;
  };
};
