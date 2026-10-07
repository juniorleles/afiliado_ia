/**
 * Host record domain: real market report snapshot.
 *
 * A frozen copy of one aggregation. Counts restate which artifacts were
 * supplied. This module does not reach an outside system.
 */
import type { RealMarketReportMetadata } from "./market-report-context";

export const REAL_MARKET_REPORT_STATUSES = ["OK", "REJECTED"] as const;
export type RealMarketReportStatus = (typeof REAL_MARKET_REPORT_STATUSES)[number];

export const REAL_MARKET_REPORT_ORIGINS = ["OBSERVED"] as const;
export type RealMarketReportOrigin = (typeof REAL_MARKET_REPORT_ORIGINS)[number];

export const REAL_MARKET_REPORT_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RealMarketReportProvenance = (typeof REAL_MARKET_REPORT_PROVENANCE)[number];

export const REAL_MARKET_REPORT_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type RealMarketReportPresence = (typeof REAL_MARKET_REPORT_PRESENCE)[number];

export interface RealMarketReportIssue {
  field: string;
  message: string;
}

export const REAL_MARKET_SEARCH_SUMMARY_KEYS = [
  "snapshotId",
  "query",
  "language",
  "country",
  "device",
  "market",
  "searchUrl",
  "htmlLength",
  "collectedAt",
] as const;

export interface RealMarketSearchSummary {
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

export const REAL_MARKET_LIST_SUMMARY_KEYS = ["count", "titles", "urls", "descriptions", "positions"] as const;

export interface RealMarketListSummary {
  count: number;
  titles: readonly (string | null)[];
  urls: readonly (string | null)[];
  descriptions: readonly (string | null)[];
  positions: readonly (number | null)[];
}

export const REAL_MARKET_LANDING_SUMMARY_KEYS = ["count", "landingPageIds", "originalUrls", "finalUrls", "htmlLength"] as const;

export interface RealMarketLandingSummary {
  count: number;
  landingPageIds: readonly string[];
  originalUrls: readonly string[];
  finalUrls: readonly string[];
  htmlLength: number;
}

export const REAL_MARKET_PRODUCT_SUMMARY_KEYS = [
  "count",
  "productNames",
  "brands",
  "vendors",
  "prices",
  "currencies",
  "languages",
  "categories",
  "domains",
  "landingPageIds",
  "offerUrls",
] as const;

export interface RealMarketProductSummary {
  count: number;
  productNames: readonly string[];
  brands: readonly (string | null)[];
  vendors: readonly (string | null)[];
  prices: readonly (string | null)[];
  currencies: readonly (string | null)[];
  languages: readonly (string | null)[];
  categories: readonly (string | null)[];
  domains: readonly (string | null)[];
  landingPageIds: readonly string[];
  offerUrls: readonly (string | null)[];
}

export const REAL_MARKET_COVERAGE_KEYS = [
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

export interface RealMarketEvidenceCoverage {
  search: RealMarketReportPresence;
  serp: RealMarketReportPresence;
  sponsored: RealMarketReportPresence;
  landingPages: RealMarketReportPresence;
  observedProducts: RealMarketReportPresence;
  brands: RealMarketReportPresence;
  domains: RealMarketReportPresence;
  categories: RealMarketReportPresence;
  prices: RealMarketReportPresence;
  languages: RealMarketReportPresence;
}

export const REAL_MARKET_REPORT_RECORD_KEYS = [
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

export interface RealMarketReportRecord {
  searchSummary: RealMarketSearchSummary;
  serpSummary: RealMarketListSummary;
  sponsoredSummary: RealMarketListSummary;
  landingPageSummary: RealMarketLandingSummary;
  observedProductSummary: RealMarketProductSummary;
  observedBrands: readonly string[];
  observedDomains: readonly string[];
  observedCategories: readonly string[];
  observedPrices: readonly string[];
  observedLanguages: readonly string[];
  evidenceCoverage: RealMarketEvidenceCoverage;
  missingEvidence: readonly string[];
  warnings: readonly string[];
  origin: RealMarketReportOrigin;
  provenance: RealMarketReportProvenance;
}

export const REAL_MARKET_GRAPH_NODE_KEYS = ["id", "kind", "label", "present"] as const;

export interface RealMarketGraphNode {
  id: string;
  kind: string;
  label: string;
  present: RealMarketReportPresence;
}

export const REAL_MARKET_GRAPH_EDGE_KEYS = ["from", "to"] as const;

export interface RealMarketGraphEdge {
  from: string;
  to: string;
}

export const REAL_MARKET_GRAPH_KEYS = ["nodes", "edges"] as const;

export interface RealMarketEvidenceGraph {
  nodes: readonly RealMarketGraphNode[];
  edges: readonly RealMarketGraphEdge[];
}

export const REAL_MARKET_STATISTICS_KEYS = [
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

export interface RealMarketStatistics {
  searchCount: number;
  serpCount: number;
  sponsoredCount: number;
  landingPageCount: number;
  observedProductCount: number;
  brandCount: number;
  domainCount: number;
  categoryCount: number;
  priceCount: number;
  languageCount: number;
  warningCount: number;
  missingCount: number;
  executionTime: number;
}

export const REAL_MARKET_CONTEXT_RECORD_KEYS = ["query", "sponsoredUrls", "landingPageIds", "productNames"] as const;

export interface RealMarketContextRecord {
  query: string;
  sponsoredUrls: readonly string[];
  landingPageIds: readonly string[];
  productNames: readonly string[];
}

export const REAL_MARKET_SNAPSHOT_KEYS = [
  "reportId",
  "report",
  "graph",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RealMarketReportSnapshot {
  reportId: string;
  report: RealMarketReportRecord;
  graph: RealMarketEvidenceGraph;
  statistics: RealMarketStatistics;
  context: RealMarketContextRecord;
  createdAt: string;
  origin: RealMarketReportOrigin;
  provenance: RealMarketReportProvenance;
  metadata: RealMarketReportMetadata;
}

export const REAL_MARKET_RESULT_KEYS = [
  "status",
  "issues",
  "report",
  "graph",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RealMarketReportResult {
  status: RealMarketReportStatus;
  issues: RealMarketReportIssue[];
  report: RealMarketReportRecord | null;
  graph: RealMarketEvidenceGraph | null;
  statistics: RealMarketStatistics;
  snapshot: RealMarketReportSnapshot | null;
  metadata: RealMarketReportMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepRealMarketReport<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepRealMarketReport(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainRealMarketReport<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainRealMarketReport(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainRealMarketReport(inner)])) as T;
  }
  return value;
}

export function createRealMarketStatistics(init: RealMarketStatistics): RealMarketStatistics {
  return freezeDeepRealMarketReport({
    searchCount: init.searchCount,
    serpCount: init.serpCount,
    sponsoredCount: init.sponsoredCount,
    landingPageCount: init.landingPageCount,
    observedProductCount: init.observedProductCount,
    brandCount: init.brandCount,
    domainCount: init.domainCount,
    categoryCount: init.categoryCount,
    priceCount: init.priceCount,
    languageCount: init.languageCount,
    warningCount: init.warningCount,
    missingCount: init.missingCount,
    executionTime: init.executionTime,
  });
}

export function createRealMarketReportSnapshot(init: {
  reportId: string;
  report: RealMarketReportRecord;
  graph: RealMarketEvidenceGraph;
  statistics: RealMarketStatistics;
  context: RealMarketContextRecord;
  createdAt: string;
  metadata?: RealMarketReportMetadata;
}): RealMarketReportSnapshot {
  return freezeDeepRealMarketReport({
    reportId: init.reportId,
    report: init.report,
    graph: init.graph,
    statistics: init.statistics,
    context: {
      query: init.context.query,
      sponsoredUrls: [...init.context.sponsoredUrls],
      landingPageIds: [...init.context.landingPageIds],
      productNames: [...init.context.productNames],
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
