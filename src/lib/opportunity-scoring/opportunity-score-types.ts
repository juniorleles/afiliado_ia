/**
 * Host record domain: opportunity scoring types.
 *
 * Each metric is a separate measurement. Nothing here adds the metrics
 * together, orders them, or chooses an action.
 */
export const OPPORTUNITY_SCORE_STATUSES = ["OK", "REJECTED"] as const;
export type OpportunityScoreStatus = (typeof OPPORTUNITY_SCORE_STATUSES)[number];

export const OPPORTUNITY_SCORE_ORIGINS = ["OBSERVED"] as const;
export type OpportunityScoreOrigin = (typeof OPPORTUNITY_SCORE_ORIGINS)[number];

export const OPPORTUNITY_SCORE_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type OpportunityScoreProvenance = (typeof OPPORTUNITY_SCORE_PROVENANCE)[number];

export const OPPORTUNITY_SCORE_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type OpportunityScorePresence = (typeof OPPORTUNITY_SCORE_PRESENCE)[number];

export interface OpportunityScoreIssue {
  field: string;
  message: string;
}

export const OPPORTUNITY_METRIC_KEYS = [
  "sponsoredAdvertiserCount",
  "uniqueDomainCount",
  "uniqueLandingPageCount",
  "observedProductCount",
  "observedBrandCount",
  "observedCategoryCount",
  "priceVariance",
  "languageConsistency",
  "serpCoverage",
  "evidenceCompleteness",
] as const;

export interface OpportunityMetrics {
  sponsoredAdvertiserCount: number;
  uniqueDomainCount: number;
  uniqueLandingPageCount: number;
  observedProductCount: number;
  observedBrandCount: number;
  observedCategoryCount: number;
  priceVariance: number | null;
  languageConsistency: number | null;
  serpCoverage: number | null;
  evidenceCompleteness: number;
}

export const OPPORTUNITY_EVIDENCE_KEYS = OPPORTUNITY_METRIC_KEYS;

export interface OpportunityEvidence {
  sponsoredAdvertiserCount: { hosts: readonly string[] };
  uniqueDomainCount: { domains: readonly string[] };
  uniqueLandingPageCount: { landingPageIds: readonly string[] };
  observedProductCount: { productNames: readonly string[] };
  observedBrandCount: { brands: readonly string[] };
  observedCategoryCount: { categories: readonly string[] };
  priceVariance: { amounts: readonly number[] };
  languageConsistency: { languages: readonly string[]; modalLanguage: string | null };
  serpCoverage: { coveredCount: number; rowCount: number };
  evidenceCompleteness: { presentFields: readonly string[]; absentFields: readonly string[] };
}

export const OPPORTUNITY_COVERAGE_FIELDS = [
  "search",
  "serp",
  "sponsored",
  "landingPages",
  "observedProducts",
  "brands",
  "domains",
  "categories",
  "prices",
  "languages",
] as const;

export const OPPORTUNITY_REPORT_RECORD_KEYS = [
  "searchSummary",
  "serpSummary",
  "sponsoredSummary",
  "landingPageSummary",
  "observedProductSummary",
  "observedBrands",
  "observedDomains",
  "observedCategories",
  "observedPrices",
  "observedLanguages",
  "evidenceCoverage",
  "missingEvidence",
  "warnings",
  "origin",
  "provenance",
] as const;

export const OPPORTUNITY_STATISTICS_INPUT_KEYS = [
  "searchCount",
  "serpCount",
  "sponsoredCount",
  "landingPageCount",
  "observedProductCount",
  "brandCount",
  "domainCount",
  "categoryCount",
  "priceCount",
  "languageCount",
  "warningCount",
  "missingCount",
  "executionTime",
] as const;

export const OPPORTUNITY_GRAPH_NODE_IDS = ["search", "serp", "sponsored", "landing-pages", "observed-products"] as const;
