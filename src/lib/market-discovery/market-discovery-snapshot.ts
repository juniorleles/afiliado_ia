/**
 * Host record domain: market discovery pipeline snapshot.
 *
 * A frozen copy of one walk across the market discovery hosts. Counts restate
 * which hosts ran. This module does not reach an outside system.
 */
import type { MarketDiscoveryMetadata } from "./market-discovery-context";
import type { LandingPageResponse } from "./landing-page-context";
import type { MarketEvidenceGraph, MarketIntelligenceReport } from "./market-report-types";

export type { MarketDiscoveryMetadata };

export const MARKET_DISCOVERY_STATUSES = ["OK", "REJECTED"] as const;
export type MarketDiscoveryStatus = (typeof MARKET_DISCOVERY_STATUSES)[number];

export const MARKET_DISCOVERY_ORIGINS = ["OBSERVED"] as const;
export type MarketDiscoveryOrigin = (typeof MARKET_DISCOVERY_ORIGINS)[number];

export const MARKET_DISCOVERY_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type MarketDiscoveryProvenance = (typeof MARKET_DISCOVERY_PROVENANCE)[number];

export const MARKET_DISCOVERY_STAGES = [
  "GoogleSearchConnector",
  "GoogleSerpParser",
  "SponsoredResultsDetector",
  "LandingPageCollector",
  "ProductIdentifier",
  "MarketIntelligenceReport",
] as const;

export type MarketDiscoveryStage = (typeof MARKET_DISCOVERY_STAGES)[number];

export interface MarketDiscoveryIssue {
  field: string;
  message: string;
}

export const MARKET_DISCOVERY_ANALYSIS_KEYS = [
  "keyword",
  "searchSnapshotId",
  "serpId",
  "sponsoredId",
  "collectionId",
  "identificationId",
  "reportId",
  "origin",
  "provenance",
] as const;

export interface MarketDiscoveryAnalysis {
  keyword: string;
  searchSnapshotId: string;
  serpId: string;
  sponsoredId: string;
  collectionId: string;
  identificationId: string;
  reportId: string;
  origin: MarketDiscoveryOrigin;
  provenance: MarketDiscoveryProvenance;
}

export const MARKET_DISCOVERY_EXECUTION_KEYS = ["stage", "count"] as const;

export interface MarketDiscoveryExecution {
  stage: MarketDiscoveryStage;
  count: number;
}

export const MARKET_DISCOVERY_STATISTICS_KEYS = ["stageCount", "completedCount", "issueCount", "executionTime"] as const;

export interface MarketDiscoveryStatistics {
  stageCount: number;
  completedCount: number;
  issueCount: number;
  executionTime: number;
}

export const MARKET_DISCOVERY_CONTEXT_RECORD_KEYS = ["keyword", "language", "country", "device", "market", "searchHtml", "pages"] as const;

export interface MarketDiscoveryContextRecord {
  keyword: string;
  language: string;
  country: string;
  device: string;
  market: string;
  searchHtml: string;
  pages: readonly LandingPageResponse[];
}

export const MARKET_DISCOVERY_SNAPSHOT_KEYS = [
  "analysisId",
  "analysis",
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

export interface MarketDiscoverySnapshot {
  analysisId: string;
  analysis: MarketDiscoveryAnalysis;
  report: MarketIntelligenceReport;
  graph: MarketEvidenceGraph;
  statistics: MarketDiscoveryStatistics;
  executions: readonly MarketDiscoveryExecution[];
  context: MarketDiscoveryContextRecord;
  createdAt: string;
  origin: MarketDiscoveryOrigin;
  provenance: MarketDiscoveryProvenance;
  metadata: MarketDiscoveryMetadata;
}

export interface MarketDiscoveryResult {
  status: MarketDiscoveryStatus;
  issues: MarketDiscoveryIssue[];
  analysis: MarketDiscoveryAnalysis | null;
  report: MarketIntelligenceReport | null;
  graph: MarketEvidenceGraph | null;
  statistics: MarketDiscoveryStatistics;
  snapshot: MarketDiscoverySnapshot | null;
  metadata: MarketDiscoveryMetadata;
  executionTime: number;
  executions: readonly MarketDiscoveryExecution[];
}

export interface MarketDiscoverySnapshotInit {
  analysisId: string;
  analysis: MarketDiscoveryAnalysis;
  report: MarketIntelligenceReport;
  graph: MarketEvidenceGraph;
  statistics: MarketDiscoveryStatistics;
  executions: readonly MarketDiscoveryExecution[];
  context: MarketDiscoveryContextRecord;
  createdAt: string;
  metadata?: MarketDiscoveryMetadata;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepMarketDiscovery<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepMarketDiscovery(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainMarketDiscovery<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainMarketDiscovery(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainMarketDiscovery(inner)])) as T;
  }
  return value;
}

export function createMarketDiscoveryStatistics(init: MarketDiscoveryStatistics): MarketDiscoveryStatistics {
  return freezeDeepMarketDiscovery({
    stageCount: init.stageCount,
    completedCount: init.completedCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createMarketDiscoveryAnalysis(init: MarketDiscoveryAnalysis): MarketDiscoveryAnalysis {
  return freezeDeepMarketDiscovery({
    keyword: init.keyword,
    searchSnapshotId: init.searchSnapshotId,
    serpId: init.serpId,
    sponsoredId: init.sponsoredId,
    collectionId: init.collectionId,
    identificationId: init.identificationId,
    reportId: init.reportId,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  });
}

export function createMarketDiscoverySnapshot(init: MarketDiscoverySnapshotInit): MarketDiscoverySnapshot {
  return freezeDeepMarketDiscovery({
    analysisId: init.analysisId,
    analysis: createMarketDiscoveryAnalysis(init.analysis),
    report: init.report,
    graph: init.graph,
    statistics: createMarketDiscoveryStatistics(init.statistics),
    executions: init.executions.map((entry) => ({ stage: entry.stage, count: entry.count })),
    context: {
      keyword: init.context.keyword,
      language: init.context.language,
      country: init.context.country,
      device: init.context.device,
      market: init.context.market,
      searchHtml: init.context.searchHtml,
      pages: copyPlainMarketDiscovery(init.context.pages),
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
