/**
 * Host record domain: market intelligence report snapshot.
 *
 * A frozen copy of the report, evidence graph, and collection statistics.
 * Presence means an artifact was supplied. This module does not reach an
 * outside system.
 */
import type { MarketEvidenceGraph, MarketGraphEdge, MarketGraphNode, MarketIntelligenceReport, MarketReportMetadata, MarketReportOrigin, MarketReportProvenance, MarketReportSnapshot, MarketReportStatisticsShape } from "./market-report-types";

export type {
  EvidenceCoverage,
  LandingPageSummary,
  MarketCoverage,
  MarketEvidenceGraph,
  MarketGraphEdge,
  MarketGraphNode,
  MarketIntelligenceReport,
  MarketMetadata,
  MarketReportIssue,
  MarketReportMetadata,
  MarketReportOrigin,
  MarketReportPresence,
  MarketReportProvenance,
  MarketReportSnapshot,
  MarketReportStatisticsShape,
  MarketReportStatus,
  ObservedProductSummary,
  SearchSummary,
  SerpSummary,
  SponsoredSummary,
} from "./market-report-types";

export {
  EVIDENCE_COVERAGE_KEYS,
  LANDING_PAGE_SUMMARY_KEYS,
  MARKET_COVERAGE_KEYS,
  MARKET_GRAPH_EDGE_KEYS,
  MARKET_GRAPH_KEYS,
  MARKET_GRAPH_NODE_KEYS,
  MARKET_GRAPH_NODE_KINDS,
  MARKET_METADATA_KEYS,
  MARKET_REPORT_KEYS,
  MARKET_REPORT_ORIGINS,
  MARKET_REPORT_PRESENCE,
  MARKET_REPORT_PROVENANCE,
  MARKET_REPORT_SNAPSHOT_KEYS,
  MARKET_REPORT_STATISTICS_KEYS,
  MARKET_REPORT_STATUSES,
  OBSERVED_PRODUCT_SUMMARY_KEYS,
  SEARCH_SUMMARY_KEYS,
  SERP_SUMMARY_KEYS,
  SPONSORED_SUMMARY_KEYS,
} from "./market-report-types";

export interface MarketReportSnapshotInit {
  reportId: string;
  report: MarketIntelligenceReport;
  graph: MarketEvidenceGraph;
  statistics: MarketReportStatisticsShape;
  createdAt: string;
  metadata?: MarketReportMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepMarketReport<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepMarketReport(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainMarketReport<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainMarketReport(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainMarketReport(inner)])) as T;
  }
  return value;
}

export function createEvidenceGraph(nodes: readonly MarketGraphNode[], edges: readonly MarketGraphEdge[]): MarketEvidenceGraph {
  return freezeDeepMarketReport({
    nodes: nodes.map((node) => ({ id: node.id, kind: node.kind, present: node.present })),
    edges: edges.map((edge) => ({ from: edge.from, to: edge.to })),
  });
}

export function createMarketIntelligenceReportRecord(init: MarketIntelligenceReport): MarketIntelligenceReport {
  const search = init.searchSummary;
  const serp = init.serpSummary;
  const sponsored = init.sponsoredSummary;
  const pages = init.landingPageSummary;
  const products = init.observedProductSummary;
  const coverage = init.marketCoverage;
  return freezeDeepMarketReport({
    searchSummary: {
      snapshotId: search.snapshotId,
      query: search.query,
      language: search.language,
      country: search.country,
      device: search.device,
      market: search.market,
      searchUrl: search.searchUrl,
      htmlLength: search.htmlLength,
      collectedAt: search.collectedAt,
    },
    serpSummary: {
      count: serp.count,
      titles: [...serp.titles],
      urls: [...serp.urls],
      descriptions: [...serp.descriptions],
      positions: [...serp.positions],
    },
    sponsoredSummary: {
      count: sponsored.count,
      titles: [...sponsored.titles],
      urls: [...sponsored.urls],
      descriptions: [...sponsored.descriptions],
      positions: [...sponsored.positions],
    },
    landingPageSummary: {
      count: pages.count,
      landingPageIds: [...pages.landingPageIds],
      destinationUrls: [...pages.destinationUrls],
      finalUrls: [...pages.finalUrls],
      htmlLength: pages.htmlLength,
    },
    observedProductSummary: {
      count: products.count,
      productNames: [...products.productNames],
      brands: [...products.brands],
      vendors: [...products.vendors],
      offerUrls: [...products.offerUrls],
      categories: [...products.categories],
      languages: [...products.languages],
      landingPageIds: [...products.landingPageIds],
    },
    marketCoverage: {
      keywords: [...coverage.keywords],
      observedDomains: [...coverage.observedDomains],
      observedLandingPages: [...coverage.observedLandingPages],
      observedOffers: [...coverage.observedOffers],
      observedBrands: [...coverage.observedBrands],
      observedCategories: [...coverage.observedCategories],
      observedPrices: [...coverage.observedPrices],
      observedLanguages: [...coverage.observedLanguages],
    },
    marketMetadata: { ...init.marketMetadata },
    evidenceCoverage: { ...init.evidenceCoverage },
    warnings: [...init.warnings],
    missingEvidence: [...init.missingEvidence],
    origin: "OBSERVED" as MarketReportOrigin,
    provenance: "DIRECT_SOURCE" as MarketReportProvenance,
  });
}

export function createMarketReportSnapshot(init: MarketReportSnapshotInit): MarketReportSnapshot {
  return freezeDeepMarketReport({
    reportId: init.reportId,
    report: init.report,
    graph: init.graph,
    statistics: { ...init.statistics },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
