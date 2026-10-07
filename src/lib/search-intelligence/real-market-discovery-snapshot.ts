/**
 * Host record domain: real market discovery pipeline snapshot.
 *
 * A frozen copy of one walk from a keyword to a market report. Counts restate
 * which hosts ran. This module does not reach an outside system.
 */
import type { SearchSnapshot } from "../market-discovery/google-search-snapshot";
import type { LandingPageResponse } from "../market-discovery/landing-page-context";
import type { LandingPageSnapshot } from "../market-discovery/landing-page-snapshot";
import type { MarketEvidenceGraph, MarketIntelligenceReport } from "../market-discovery/market-report-types";
import type { ObservedProduct } from "../market-discovery/product-types";
import type { SerpRecord } from "../market-discovery/serp-types";
import type { SponsoredResult } from "../market-discovery/sponsored-types";
import type { RealMarketDiscoveryMetadata } from "./real-market-discovery-context";

export type { RealMarketDiscoveryMetadata };

export const REAL_MARKET_DISCOVERY_STATUSES = ["OK", "REJECTED"] as const;
export type RealMarketDiscoveryStatus = (typeof REAL_MARKET_DISCOVERY_STATUSES)[number];

export const REAL_MARKET_DISCOVERY_ORIGINS = ["OBSERVED"] as const;
export type RealMarketDiscoveryOrigin = (typeof REAL_MARKET_DISCOVERY_ORIGINS)[number];

export const REAL_MARKET_DISCOVERY_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RealMarketDiscoveryProvenance = (typeof REAL_MARKET_DISCOVERY_PROVENANCE)[number];

export const REAL_MARKET_DISCOVERY_STAGES = [
  "SearchApiProvider",
  "SearchApiNormalizer",
  "LandingPageCollector",
  "ProductIdentifier",
  "MarketIntelligenceReport",
] as const;

export type RealMarketDiscoveryStage = (typeof REAL_MARKET_DISCOVERY_STAGES)[number];

export interface RealMarketDiscoveryIssue {
  field: string;
  message: string;
}

export const REAL_MARKET_DISCOVERY_EXECUTION_KEYS = ["stage", "count"] as const;

export interface RealMarketDiscoveryExecution {
  stage: RealMarketDiscoveryStage;
  count: number;
}

export const REAL_MARKET_DISCOVERY_STATISTICS_KEYS = ["stageCount", "completedCount", "issueCount", "executionTime"] as const;

export interface RealMarketDiscoveryStatistics {
  stageCount: number;
  completedCount: number;
  issueCount: number;
  executionTime: number;
}

export const REAL_MARKET_DISCOVERY_CONTEXT_RECORD_KEYS = ["keyword", "country", "language", "device", "market", "pages"] as const;

export interface RealMarketDiscoveryContextRecord {
  keyword: string;
  country: string;
  language: string;
  device: string;
  market: string;
  pages: readonly LandingPageResponse[];
}

export const REAL_MARKET_DISCOVERY_SNAPSHOT_KEYS = [
  "analysisId",
  "searchSnapshot",
  "serpRecords",
  "sponsoredResults",
  "landingPageSnapshots",
  "observedProducts",
  "report",
  "graph",
  "statistics",
  "executions",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RealMarketDiscoverySnapshot {
  analysisId: string;
  searchSnapshot: SearchSnapshot;
  serpRecords: readonly SerpRecord[];
  sponsoredResults: readonly SponsoredResult[];
  landingPageSnapshots: readonly LandingPageSnapshot[];
  observedProducts: readonly ObservedProduct[];
  report: MarketIntelligenceReport;
  graph: MarketEvidenceGraph;
  statistics: RealMarketDiscoveryStatistics;
  executions: readonly RealMarketDiscoveryExecution[];
  context: RealMarketDiscoveryContextRecord;
  createdAt: string;
  origin: RealMarketDiscoveryOrigin;
  provenance: RealMarketDiscoveryProvenance;
  metadata: RealMarketDiscoveryMetadata;
}

export const REAL_MARKET_DISCOVERY_RESULT_KEYS = [
  "status",
  "issues",
  "searchSnapshot",
  "serpRecords",
  "sponsoredResults",
  "landingPageSnapshots",
  "observedProducts",
  "report",
  "graph",
  "statistics",
  "executions",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RealMarketDiscoveryResult {
  status: RealMarketDiscoveryStatus;
  issues: RealMarketDiscoveryIssue[];
  searchSnapshot: SearchSnapshot | null;
  serpRecords: readonly SerpRecord[] | null;
  sponsoredResults: readonly SponsoredResult[] | null;
  landingPageSnapshots: readonly LandingPageSnapshot[] | null;
  observedProducts: readonly ObservedProduct[] | null;
  report: MarketIntelligenceReport | null;
  graph: MarketEvidenceGraph | null;
  statistics: RealMarketDiscoveryStatistics;
  executions: readonly RealMarketDiscoveryExecution[];
  snapshot: RealMarketDiscoverySnapshot | null;
  metadata: RealMarketDiscoveryMetadata;
  executionTime: number;
}

export interface RealMarketDiscoverySnapshotInit {
  analysisId: string;
  searchSnapshot: SearchSnapshot;
  serpRecords: readonly SerpRecord[];
  sponsoredResults: readonly SponsoredResult[];
  landingPageSnapshots: readonly LandingPageSnapshot[];
  observedProducts: readonly ObservedProduct[];
  report: MarketIntelligenceReport;
  graph: MarketEvidenceGraph;
  statistics: RealMarketDiscoveryStatistics;
  executions: readonly RealMarketDiscoveryExecution[];
  context: RealMarketDiscoveryContextRecord;
  createdAt: string;
  metadata?: RealMarketDiscoveryMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepRealMarketDiscovery<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepRealMarketDiscovery(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainRealMarketDiscovery<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainRealMarketDiscovery(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainRealMarketDiscovery(inner)])) as T;
  }
  return value;
}

export function createRealMarketDiscoveryStatistics(init: RealMarketDiscoveryStatistics): RealMarketDiscoveryStatistics {
  return freezeDeepRealMarketDiscovery({
    stageCount: init.stageCount,
    completedCount: init.completedCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createRealMarketDiscoverySnapshot(init: RealMarketDiscoverySnapshotInit): RealMarketDiscoverySnapshot {
  return freezeDeepRealMarketDiscovery({
    analysisId: init.analysisId,
    searchSnapshot: init.searchSnapshot,
    serpRecords: init.serpRecords,
    sponsoredResults: init.sponsoredResults,
    landingPageSnapshots: init.landingPageSnapshots,
    observedProducts: init.observedProducts,
    report: init.report,
    graph: init.graph,
    statistics: init.statistics,
    executions: init.executions,
    context: init.context,
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: init.metadata ?? {},
  });
}
