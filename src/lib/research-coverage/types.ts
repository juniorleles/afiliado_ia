export const RESEARCH_COVERAGE_VERSION = 1 as const;

export const SOURCE_CLASSES = [
  "MANUFACTURER_OR_BRAND",
  "SELLER",
  "AFFILIATE_RESOURCE",
  "INDEPENDENT_REFERENCE",
  "REVIEW_OR_TESTIMONIAL",
  "MARKETPLACE",
  "UNKNOWN",
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const ACCESS_STATUSES = [
  "FETCHED",
  "ACCESS_UNAVAILABLE",
  "SKIPPED_UNSAFE",
  "SKIPPED_LIMIT",
  "NOT_FETCHED",
] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const INFO_CLASSES = [
  "FACTUAL_DESCRIPTIVE",
  "SELLER_STATEMENT",
  "COMMERCIAL_UPDATING",
  "HEALTH_CLAIM",
  "TESTIMONIAL",
  "PROMOTIONAL",
  "UNKNOWN",
] as const;
export type InfoClass = (typeof INFO_CLASSES)[number];

export const GROUNDING_STATUSES = [
  "SOURCE_STATED",
  "INDEPENDENTLY_SUPPORTED",
  "CONFLICTING",
  "UNVERIFIED",
  "PROHIBITED",
] as const;
export type GroundingStatus = (typeof GROUNDING_STATUSES)[number];

export const PRICE_STATUSES = ["PRICE_ABSENT", "PRICE_UNVERIFIED", "PRICE_RECORDED"] as const;
export type PriceStatus = (typeof PRICE_STATUSES)[number];

export const COVERAGE_SLOTS = [
  "identity",
  "category",
  "composition",
  "features",
  "usage",
  "faq",
  "guarantee",
  "price",
  "commercial",
  "cautions",
  "provenance",
] as const;
export type CoverageSlot = (typeof COVERAGE_SLOTS)[number];

/** Informative coverage weights. They are not a conversion or quality score. */
export const COVERAGE_WEIGHTS: Record<CoverageSlot, number> = {
  identity: 12,
  category: 8,
  composition: 14,
  features: 10,
  usage: 10,
  faq: 8,
  guarantee: 8,
  price: 8,
  commercial: 8,
  cautions: 8,
  provenance: 6,
};

export const PAGE_INTENTS = [
  "PRODUCT_DETAILS",
  "INGREDIENTS_OR_SPECIFICATIONS",
  "USAGE_INSTRUCTIONS",
  "FAQ",
  "PRICING",
  "SHIPPING",
  "REFUNDS",
  "GUARANTEE_TERMS",
  "CAUTIONS",
  "CONTACT",
  "LEGAL",
  "OTHER",
] as const;
export type PageIntent = (typeof PAGE_INTENTS)[number];

export const RESEARCH_LIMITS = {
  maxSeedUrls: 4,
  maxDiscoveredUrls: 5,
  maxFetchUrls: 8,
  maxDepth: 1,
  maxElapsedMs: 45_000,
  maxInspectedCandidates: 40,
} as const;

/** 54X gap-fill increment. Small, explicit, and only used by product research. */
export const GAP_FILL_RESEARCH_LIMITS = {
  maxDiscoveredUrls: 6,
  maxFetchUrls: 10,
  maxInspectedCandidates: 48,
} as const;

export type ResearchLimits = typeof RESEARCH_LIMITS;

export type PublisherIdentity = {
  siteName: string | null;
  organization: string | null;
  title: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type SourceRelation =
  | "PRIMARY_PRODUCT_PAGE"
  | "SUPPORTING_POLICY"
  | "AFFILIATE_SALES"
  | "INDEPENDENT_MENTION"
  | "UNKNOWN";

export type FieldDisposition = {
  field: string;
  text: string;
  infoClass: InfoClass;
  used: boolean;
  rejected: boolean;
  reason: string;
};

export type SourceCoverageRow = {
  url: string;
  requestedUrl: string;
  domain: string | null;
  sourceClass: SourceClass;
  publisher: PublisherIdentity;
  relation: SourceRelation;
  retrievedAt: string | null;
  httpStatus: number | null;
  contentAvailable: boolean;
  bytes: number;
  fieldsFound: string[];
  fieldsUsed: string[];
  fieldsRejected: FieldDisposition[];
  identityConfidence: PublisherIdentity["confidence"];
  accessStatus: AccessStatus;
  notes: string[];
};

export type CoverageEvidenceRecord = {
  evidenceId: string;
  productId: string;
  sourceUrl: string;
  sourceClass: SourceClass;
  excerpt: string;
  collectedAt: string | null;
  informationType: string;
  confidence: string;
  useRestriction: string;
  groundingStatus: GroundingStatus;
  notes: string[];
};

export type SlotScore = {
  slot: CoverageSlot;
  weight: number;
  present: boolean;
  points: number;
  note: string;
};

export type CoverageScore = {
  version: typeof RESEARCH_COVERAGE_VERSION;
  total: number;
  max: 100;
  slots: SlotScore[];
  unresolvedGaps: CoverageSlot[];
};

export type PriceRecord = {
  amount: string;
  currency: string | null;
  packageLabel: string | null;
  sourceUrl: string;
  retrievedAt: string | null;
  sourceClass: SourceClass;
  status: PriceStatus;
  restrictions: string[];
};

export type PriceVerification = {
  status: PriceStatus;
  records: PriceRecord[];
  note: string;
};
