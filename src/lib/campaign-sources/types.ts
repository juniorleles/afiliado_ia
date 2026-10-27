export const SOURCE_TYPES = [
  "SALES_PAGE",
  "AFFILIATE_RESOURCE",
  "AUTHORIZED_DESTINATION",
  "TRACKING_HOPLINK",
  "MANUFACTURER_RESOURCE",
  "OTHER",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = [
  "NOT_CHECKED",
  "VALID",
  "REDIRECTED",
  "RESTRICTED",
  "CHECKOUT_SUSPECTED",
  "UNAVAILABLE",
  "BLOCKED",
  "REVIEW_REQUIRED",
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_VERIFICATIONS = ["UNVERIFIED", "SELLER_STATED", "CONFLICTING", "USER_APPROVED"] as const;
export type SourceVerification = (typeof SOURCE_VERIFICATIONS)[number];

export type CampaignSource = {
  sourceId: string;
  campaignId: number;
  sourceType: SourceType;
  originalUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  sourceStatus: SourceStatus;
  sourceClassification: string | null;
  discoveryMethod: "OPERATOR" | "DISCOVERED";
  submittedBy: "OPERATOR";
  fetchedAt: string | null;
  verificationStatus: SourceVerification;
  evidenceIds: string[];
  notes: string[];
  redirectChain?: Array<{ status: number | null; host: string; path: string; via: string }>;
  destinationClassification?: string | null;
  blockReason?: string | null;
};

export type CampaignSourceInput = {
  salesUrl?: string | null;
  affiliateResourceUrl?: string | null;
  authorizedDestinationUrl?: string | null;
  trackingHopUrl?: string | null;
};
