export const MARKET_SOURCE_CLASSES = [
  "BRAND",
  "SELLER",
  "RETAILER",
  "EDITORIAL",
  "FORUM/COMMUNITY",
  "OTHER",
  "UNKNOWN",
] as const;
export type MarketSourceClass = (typeof MARKET_SOURCE_CLASSES)[number];

export const MARKET_RESEARCH_STATUSES = ["FRESH", "STALE", "UNAVAILABLE"] as const;
export type MarketResearchStatus = (typeof MARKET_RESEARCH_STATUSES)[number];

export const MARKET_RESEARCH_QUALITIES = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"] as const;
export type MarketResearchQuality = (typeof MARKET_RESEARCH_QUALITIES)[number];

export const QUERY_FAMILY_IDS = [
  "PRODUCT",
  "PURCHASE_INTENT",
  "CATEGORY_INTENT",
  "QUESTIONS_OBJECTIONS",
] as const;
export type QueryFamilyId = (typeof QUERY_FAMILY_IDS)[number];

export type MarketQuery = {
  family: QueryFamilyId;
  query: string;
};

export const MARKET_QUERY_OUTCOME_STATUSES = [
  "SUCCESS",
  "SUCCESS_EMPTY",
  "SEARCH_TIMEOUT",
  "HTTP_ERROR",
  "PARSE_ERROR",
  "ABORTED",
] as const;
export type MarketQueryOutcomeStatus = (typeof MARKET_QUERY_OUTCOME_STATUSES)[number];

export const MARKET_SEARCH_PROVIDERS = ["DUCKDUCKGO_HTML", "BRAVE"] as const;
export type MarketSearchProvider = (typeof MARKET_SEARCH_PROVIDERS)[number];

export const MARKET_PROVIDER_ATTEMPT_STATUSES = [
  "SUCCESS",
  "SUCCESS_EMPTY",
  "SEARCH_TIMEOUT",
  "HTTP_ERROR",
  "PARSE_ERROR",
  "ABORTED",
  "BRAVE_NOT_CONFIGURED",
] as const;
export type MarketProviderAttemptStatus = (typeof MARKET_PROVIDER_ATTEMPT_STATUSES)[number];

export type MarketProviderAttempt = {
  provider: MarketSearchProvider;
  status: MarketProviderAttemptStatus;
  durationMs: number;
};

export type MarketQueryOutcome = {
  query: string;
  family: QueryFamilyId;
  status: MarketQueryOutcomeStatus;
  durationMs: number;
  rawHits: number;
  usableHits: number;
  providerUsed: MarketSearchProvider;
  providerAttempts: MarketProviderAttempt[];
};

export type MarketProviderMix = {
  DDG_QUERY_SUCCESS: number;
  BRAVE_FALLBACK_ATTEMPTS: number;
  BRAVE_FALLBACK_SUCCESS: number;
  BRAVE_FALLBACK_FAILED: number;
};

export const FAMILY_COVERAGE_STATUSES = [
  "COVERED",
  "EXECUTED_NO_USABLE",
  "FAILED",
  "NOT_EXECUTED",
] as const;
export type FamilyCoverageStatus = (typeof FAMILY_COVERAGE_STATUSES)[number];

export const MARKET_INTENT_KINDS = [
  "REVIEW_INTENT",
  "BUYER_GUIDE_INTENT",
  "EDUCATIONAL_INTENT",
  "COMPARISON_INTENT",
  "QUESTION_INTENT",
  "SAFETY_CONCERN",
  "INGREDIENT_RESEARCH",
  "PRICE_CONCERN",
  "TRUST_CONCERN",
] as const;
export type MarketIntentKind = (typeof MARKET_INTENT_KINDS)[number];

export type MarketIntentSignal = {
  kind: MarketIntentKind;
  strength: "WEAK" | "MODERATE";
  evidence: string;
  sourceUrl?: string;
  fromQueryFamily?: QueryFamilyId;
};

export type MarketEvidence = {
  url: string;
  title: string;
  retrievedAt: string;
  relevantEvidence: string;
  classification: MarketSourceClass;
  classificationReason: string;
  query: string;
  queryFamily: QueryFamilyId;
  domain: string;
  path: string;
  promotional: boolean;
  usable: boolean;
  discoveredByProvider: MarketSearchProvider;
};

export type MarketSignalBundle = {
  currentPositioning: string[];
  categoryPositioning: string[];
  commonQuestions: string[];
  purchaseConsiderations: string[];
  commonObjections: string[];
  recurringTerminology: string[];
  competitorMessaging: string[];
  reviewOrientedResults: number;
  educationalResults: number;
  buyerGuideResults: number;
  observedIntents: MarketIntentSignal[];
};

export type MarketDiversity = {
  UNIQUE_DOMAINS: number;
  SOURCE_CLASS_DIVERSITY: number;
  SOURCE_CLASSES: MarketSourceClass[];
  PROMOTIONAL_SOURCES: number;
  PROMOTIONAL_SOURCE_RATIO: number;
  PROMOTIONAL_PATTERN_DETECTED: boolean;
  SEARCH_RESULTS_TOTAL: number;
  USABLE_SOURCES: number;
};

export type MarketResearchReport = {
  productName: string;
  researchedAt: string;
  status: MarketResearchStatus;
  quality: MarketResearchQuality;
  queriesUsed: string[];
  queryFamilies: Array<{ family: QueryFamilyId; queries: string[] }>;
  queryOutcomes: MarketQueryOutcome[];
  providerMix: MarketProviderMix;
  sources: MarketEvidence[];
  signals: MarketSignalBundle;
  diversity: MarketDiversity;
  searchProvider: {
    name: string;
    configured: boolean;
    realWebSearchAvailable: boolean;
    fallbackConfigured?: boolean;
  };
  maxAgeHours: number;
  discardedFabrications: string[];
};

/** Reserved for later real campaign outcomes. Never populate with simulated values. */
export type FutureCampaignOutcome = {
  impressions?: number;
  clicks?: number;
  ctr?: number;
  sales?: number;
  conversionRate?: number;
  cpa?: number;
  roas?: number;
};
