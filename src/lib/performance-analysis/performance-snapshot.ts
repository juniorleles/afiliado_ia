/**
 * Host record domain: performance snapshot.
 *
 * A frozen copy of one analysis. Metric trends restate supplied figures.
 * CPA, ROAS, and budget consumption restate one named division. Credential
 * values are not members.
 */
import type { PerformanceMetadata } from "./performance-context";

export const PERFORMANCE_STATUSES = ["OK", "REJECTED"] as const;
export type PerformanceStatus = (typeof PERFORMANCE_STATUSES)[number];

export const PERFORMANCE_ORIGINS = ["OBSERVED"] as const;
export type PerformanceOrigin = (typeof PERFORMANCE_ORIGINS)[number];

export const PERFORMANCE_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type PerformanceProvenance = (typeof PERFORMANCE_PROVENANCE)[number];

export const PERFORMANCE_LEVELS = ["CAMPAIGN", "AD_GROUP", "RSA"] as const;
export type PerformanceLevel = (typeof PERFORMANCE_LEVELS)[number];

export const PERFORMANCE_DIRECTIONS = [
  "Performance Increase",
  "Performance Decrease",
  "Stable Performance",
  "Missing Metrics",
  "Incomplete Data",
] as const;
export type PerformanceDirection = (typeof PERFORMANCE_DIRECTIONS)[number];

export const PERFORMANCE_CLASSIFICATIONS = [...PERFORMANCE_DIRECTIONS, "Anomalies"] as const;
export type PerformanceClassification = (typeof PERFORMANCE_CLASSIFICATIONS)[number];

export const PERFORMANCE_METHODS = [
  "DIFFERENCE",
  "COST_DIVIDED_BY_CONVERSIONS",
  "CONVERSION_VALUE_DIVIDED_BY_COST",
  "COST_DIVIDED_BY_BUDGET",
] as const;
export type PerformanceMethod = (typeof PERFORMANCE_METHODS)[number];

export const CAMPAIGN_INDICATOR_NAMES = [
  "CTR Trend",
  "CPC Trend",
  "Cost Trend",
  "Conversion Trend",
  "CPA",
  "ROAS",
  "Impression Trend",
  "Click Trend",
  "Budget Consumption",
  "Search Impression Share Trend",
  "Top Impression Share Trend",
  "Absolute Top Impression Share Trend",
] as const;

export const ENTITY_INDICATOR_NAMES = CAMPAIGN_INDICATOR_NAMES.filter((name) => name !== "Budget Consumption");

export interface PerformanceIssue {
  field: string;
  message: string;
}

export const PERFORMANCE_INDICATOR_KEYS = ["name", "resourceName", "level", "current", "historical", "change", "direction", "method"] as const;

export interface PerformanceIndicator {
  name: string;
  resourceName: string;
  level: PerformanceLevel;
  current: number | null;
  historical: number | null;
  change: number | null;
  direction: PerformanceDirection;
  method: PerformanceMethod;
}

export const PERFORMANCE_FINDING_KEYS = ["resourceName", "level", "indicator", "classification"] as const;

export interface PerformanceFinding {
  resourceName: string;
  level: PerformanceLevel;
  indicator: string;
  classification: PerformanceClassification;
}

export const PERFORMANCE_COMPARISON_KEYS = ["currentWindow", "historicalWindow", "campaignResourceName", "rows"] as const;

export interface HistoricalComparison {
  currentWindow: string;
  historicalWindow: string;
  campaignResourceName: string;
  rows: PerformanceIndicator[];
}

export const PERFORMANCE_REPORT_KEYS = ["campaignResourceName", "campaignId", "status", "indicators", "comparison", "findings"] as const;

export interface PerformanceReport {
  campaignResourceName: string;
  campaignId: string;
  status: string;
  indicators: PerformanceIndicator[];
  comparison: HistoricalComparison;
  findings: PerformanceFinding[];
}

export const PERFORMANCE_STATISTICS_KEYS = [
  "campaignCount",
  "adGroupCount",
  "adCount",
  "indicatorCount",
  "findingCount",
  "issueCount",
  "executionTime",
] as const;

export interface PerformanceStatistics {
  campaignCount: number;
  adGroupCount: number;
  adCount: number;
  indicatorCount: number;
  findingCount: number;
  issueCount: number;
  executionTime: number;
}

export const PERFORMANCE_CONTEXT_RECORD_KEYS = ["campaignResourceName", "currentWindow", "historicalWindow"] as const;

export interface PerformanceContextRecord {
  campaignResourceName: string;
  currentWindow: string;
  historicalWindow: string;
}

export const PERFORMANCE_SNAPSHOT_KEYS = [
  "analysisId",
  "report",
  "indicators",
  "comparison",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface PerformanceSnapshot {
  analysisId: string;
  report: PerformanceReport;
  indicators: PerformanceIndicator[];
  comparison: HistoricalComparison;
  statistics: PerformanceStatistics;
  context: PerformanceContextRecord;
  createdAt: string;
  origin: PerformanceOrigin;
  provenance: PerformanceProvenance;
  metadata: PerformanceMetadata;
}

export const PERFORMANCE_RESULT_KEYS = [
  "status",
  "issues",
  "report",
  "indicators",
  "comparison",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface PerformanceResult {
  status: PerformanceStatus;
  issues: PerformanceIssue[];
  report: PerformanceReport | null;
  indicators: PerformanceIndicator[] | null;
  comparison: HistoricalComparison | null;
  statistics: PerformanceStatistics;
  snapshot: PerformanceSnapshot | null;
  metadata: PerformanceMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepPerformance<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepPerformance(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function createPerformanceStatistics(init: PerformanceStatistics): PerformanceStatistics {
  return freezeDeepPerformance({
    campaignCount: init.campaignCount,
    adGroupCount: init.adGroupCount,
    adCount: init.adCount,
    indicatorCount: init.indicatorCount,
    findingCount: init.findingCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

function copyIndicator(indicator: PerformanceIndicator): PerformanceIndicator {
  return {
    name: indicator.name,
    resourceName: indicator.resourceName,
    level: indicator.level,
    current: indicator.current,
    historical: indicator.historical,
    change: indicator.change,
    direction: indicator.direction,
    method: indicator.method,
  };
}

function copyFinding(finding: PerformanceFinding): PerformanceFinding {
  return {
    resourceName: finding.resourceName,
    level: finding.level,
    indicator: finding.indicator,
    classification: finding.classification,
  };
}

export function createPerformanceSnapshot(init: {
  analysisId: string;
  campaignResourceName: string;
  campaignId: string;
  status: string;
  indicators: PerformanceIndicator[];
  findings: PerformanceFinding[];
  currentWindow: string;
  historicalWindow: string;
  statistics: PerformanceStatistics;
  createdAt: string;
  metadata?: PerformanceMetadata;
}): PerformanceSnapshot {
  const indicators = init.indicators.map(copyIndicator);
  const rows = init.indicators.map(copyIndicator);
  const comparison: HistoricalComparison = {
    currentWindow: init.currentWindow,
    historicalWindow: init.historicalWindow,
    campaignResourceName: init.campaignResourceName,
    rows,
  };
  const report: PerformanceReport = {
    campaignResourceName: init.campaignResourceName,
    campaignId: init.campaignId,
    status: init.status,
    indicators,
    comparison,
    findings: init.findings.map(copyFinding),
  };
  return freezeDeepPerformance({
    analysisId: init.analysisId,
    report,
    indicators,
    comparison,
    statistics: init.statistics,
    context: {
      campaignResourceName: init.campaignResourceName,
      currentWindow: init.currentWindow,
      historicalWindow: init.historicalWindow,
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
