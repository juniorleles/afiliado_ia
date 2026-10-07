/**
 * Host record domain: market intelligence report records.
 *
 * Names the summaries, coverage, and graph one report may restate. Presence
 * means an artifact was supplied. This module does not reach an outside
 * system.
 */
export type MarketReportMetadata = Record<string, string | number | boolean | null>;

export const MARKET_REPORT_STATUSES = ["OK", "REJECTED"] as const;
export type MarketReportStatus = (typeof MARKET_REPORT_STATUSES)[number];

export const MARKET_REPORT_ORIGINS = ["OBSERVED"] as const;
export type MarketReportOrigin = (typeof MARKET_REPORT_ORIGINS)[number];

export const MARKET_REPORT_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type MarketReportProvenance = (typeof MARKET_REPORT_PROVENANCE)[number];

export const MARKET_REPORT_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type MarketReportPresence = (typeof MARKET_REPORT_PRESENCE)[number];

export interface MarketReportIssue {
  field: string;
  message: string;
}

export const SEARCH_SUMMARY_KEYS = ["snapshotId", "query", "language", "country", "device", "market", "searchUrl", "htmlLength", "collectedAt"] as const;

export interface SearchSummary {
  snapshotId: string;
  query: string;
  language: string;
  country: string;
  device: string;
  market: string;
  searchUrl: string;
  htmlLength: number;
  collectedAt: string;
}

export const SERP_SUMMARY_KEYS = ["count", "titles", "urls", "descriptions", "positions"] as const;

export interface SerpSummary {
  count: number;
  titles: readonly (string | null)[];
  urls: readonly (string | null)[];
  descriptions: readonly (string | null)[];
  positions: readonly (number | null)[];
}

export const SPONSORED_SUMMARY_KEYS = ["count", "titles", "urls", "descriptions", "positions"] as const;

export interface SponsoredSummary {
  count: number;
  titles: readonly (string | null)[];
  urls: readonly (string | null)[];
  descriptions: readonly (string | null)[];
  positions: readonly (number | null)[];
}

export const LANDING_PAGE_SUMMARY_KEYS = ["count", "landingPageIds", "destinationUrls", "finalUrls", "htmlLength"] as const;

export interface LandingPageSummary {
  count: number;
  landingPageIds: readonly string[];
  destinationUrls: readonly string[];
  finalUrls: readonly string[];
  htmlLength: number;
}

export const OBSERVED_PRODUCT_SUMMARY_KEYS = ["count", "productNames", "brands", "vendors", "offerUrls", "categories", "languages", "landingPageIds"] as const;

export interface ObservedProductSummary {
  count: number;
  productNames: readonly string[];
  brands: readonly (string | null)[];
  vendors: readonly (string | null)[];
  offerUrls: readonly (string | null)[];
  categories: readonly (string | null)[];
  languages: readonly (string | null)[];
  landingPageIds: readonly string[];
}

export const MARKET_COVERAGE_KEYS = [
  "keywords",
  "observedDomains",
  "observedLandingPages",
  "observedOffers",
  "observedBrands",
  "observedCategories",
  "observedPrices",
  "observedLanguages",
] as const;

export interface MarketCoverage {
  keywords: readonly string[];
  observedDomains: readonly (string | null)[];
  observedLandingPages: readonly string[];
  observedOffers: readonly (string | null)[];
  observedBrands: readonly (string | null)[];
  observedCategories: readonly (string | null)[];
  observedPrices: readonly (string | null)[];
  observedLanguages: readonly (string | null)[];
}

export const MARKET_METADATA_KEYS = ["query", "language", "country", "device", "market"] as const;

export interface MarketMetadata {
  query: string;
  language: string;
  country: string;
  device: string;
  market: string;
}

export const EVIDENCE_COVERAGE_KEYS = ["search", "serp", "sponsored", "landingPages", "observedProducts"] as const;

export interface EvidenceCoverage {
  search: MarketReportPresence;
  serp: MarketReportPresence;
  sponsored: MarketReportPresence;
  landingPages: MarketReportPresence;
  observedProducts: MarketReportPresence;
}

export const MARKET_REPORT_KEYS = [
  "searchSummary",
  "serpSummary",
  "sponsoredSummary",
  "landingPageSummary",
  "observedProductSummary",
  "marketCoverage",
  "marketMetadata",
  "evidenceCoverage",
  "warnings",
  "missingEvidence",
  "origin",
  "provenance",
] as const;

export interface MarketIntelligenceReport {
  searchSummary: SearchSummary;
  serpSummary: SerpSummary;
  sponsoredSummary: SponsoredSummary;
  landingPageSummary: LandingPageSummary;
  observedProductSummary: ObservedProductSummary;
  marketCoverage: MarketCoverage;
  marketMetadata: MarketMetadata;
  evidenceCoverage: EvidenceCoverage;
  warnings: readonly string[];
  missingEvidence: readonly string[];
  origin: MarketReportOrigin;
  provenance: MarketReportProvenance;
}

export const MARKET_GRAPH_NODE_KEYS = ["id", "kind", "present"] as const;

export interface MarketGraphNode {
  id: string;
  kind: string;
  present: MarketReportPresence;
}

export const MARKET_GRAPH_EDGE_KEYS = ["from", "to"] as const;

export interface MarketGraphEdge {
  from: string;
  to: string;
}

export const MARKET_GRAPH_KEYS = ["nodes", "edges"] as const;

export interface MarketEvidenceGraph {
  nodes: readonly MarketGraphNode[];
  edges: readonly MarketGraphEdge[];
}

export const MARKET_GRAPH_NODE_KINDS = ["SearchSnapshot", "SERPRecords", "SponsoredResults", "LandingPageSnapshots", "ObservedProducts"] as const;

export const MARKET_REPORT_SNAPSHOT_KEYS = ["reportId", "report", "graph", "statistics", "createdAt", "origin", "provenance", "metadata"] as const;

export const MARKET_REPORT_STATISTICS_KEYS = ["searchCount", "serpCount", "sponsoredCount", "landingPageCount", "observedProductCount", "warningCount", "missingCount", "executionTime"] as const;

export interface MarketReportStatisticsShape {
  searchCount: number;
  serpCount: number;
  sponsoredCount: number;
  landingPageCount: number;
  observedProductCount: number;
  warningCount: number;
  missingCount: number;
  executionTime: number;
}

export interface MarketReportSnapshot {
  reportId: string;
  report: MarketIntelligenceReport;
  graph: MarketEvidenceGraph;
  statistics: MarketReportStatisticsShape;
  createdAt: string;
  origin: MarketReportOrigin;
  provenance: MarketReportProvenance;
  metadata: MarketReportMetadata;
}
