/**
 * Host record domain: recommendation engine.
 *
 * One entry point from a performance report to a frozen recommendation set.
 * A refused run stores nothing. This method never throws and never changes
 * the supplied records.
 */
import type { MetricValues } from "../optimization-metrics/metrics-snapshot";
import type { PerformanceIndicator } from "../performance-analysis/performance-snapshot";
import type { OptimizationMetadata } from "./optimization-context";
import { OPTIMIZATION_RULES } from "./optimization-rules";
import {
  createOptimizationSnapshot,
  createOptimizationStatistics,
  freezeDeepOptimization,
  type OptimizationEvidence,
  type OptimizationEvidenceRow,
  type OptimizationRecommendation,
  type OptimizationResult,
  type OptimizationSnapshot,
  type SupportingMetric,
} from "./optimization-snapshot";
import type { OptimizationRule, RecommendationView } from "./optimization-types";
import { createOptimizationValidator, type OptimizationValidator } from "./optimization-validator";

export type OptimizationClock = () => number;
export type OptimizationTimestamp = () => string;
export type OptimizationIdFactory = () => string;

export interface OptimizationEngineOptions {
  now?: OptimizationClock;
  timestamp?: OptimizationTimestamp;
  idFactory?: OptimizationIdFactory;
  validator?: OptimizationValidator;
  rules?: readonly OptimizationRule[];
}

export interface OptimizationRecommendationEngine {
  readonly validator: OptimizationValidator;
  generate(input: unknown): OptimizationResult;
  getSnapshot(recommendationSetId: string): OptimizationSnapshot | null;
}

const SUPPORTING_FIELDS: Record<string, readonly (keyof MetricValues)[]> = {
  "CTR Trend": ["ctr"],
  "CPC Trend": ["averageCpc"],
  "Cost Trend": ["costMicros"],
  "Conversion Trend": ["conversions"],
  CPA: ["costMicros", "conversions"],
  ROAS: ["conversionValue", "costMicros"],
  "Impression Trend": ["impressions"],
  "Click Trend": ["clicks"],
  "Budget Consumption": ["costMicros"],
  "Search Impression Share Trend": ["searchImpressionShare"],
  "Top Impression Share Trend": ["searchTopImpressionShare"],
  "Absolute Top Impression Share Trend": ["searchAbsoluteTopImpressionShare"],
};

function show(value: number | null): string {
  return value === null ? "null" : String(value);
}

function findRecord<T extends { resourceName: string }>(rows: readonly T[], resourceName: string): T | null {
  for (const row of rows) if (row.resourceName === resourceName) return row;
  return null;
}

function metricPair(view: RecommendationView, indicator: PerformanceIndicator): { current: MetricValues | null; historical: MetricValues | null } {
  if (indicator.level === "CAMPAIGN") return { current: view.campaign, historical: view.historicalCampaign };
  if (indicator.level === "AD_GROUP") return { current: findRecord(view.adGroups, indicator.resourceName), historical: findRecord(view.historicalAdGroups, indicator.resourceName) };
  return { current: findRecord(view.ads, indicator.resourceName), historical: findRecord(view.historicalAds, indicator.resourceName) };
}

function evidenceRow(indicator: PerformanceIndicator): OptimizationEvidenceRow {
  return {
    name: indicator.name,
    resourceName: indicator.resourceName,
    level: indicator.level,
    current: indicator.current,
    historical: indicator.historical,
    change: indicator.change,
    direction: indicator.direction,
  };
}

function supportingRows(view: RecommendationView, indicators: readonly PerformanceIndicator[]): SupportingMetric[] {
  const rows: SupportingMetric[] = [];
  const seen = new Set<string>();
  for (const indicator of indicators) {
    const pair = metricPair(view, indicator);
    const fields = SUPPORTING_FIELDS[indicator.name] ?? [];
    for (const field of fields) {
      const key = `${indicator.resourceName}\n${field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        name: field,
        resourceName: indicator.resourceName,
        current: pair.current ? pair.current[field] : null,
        historical: pair.historical ? pair.historical[field] : null,
      });
    }
    if (indicator.name === "Budget Consumption" && indicator.level === "CAMPAIGN") {
      rows.push({
        name: "budgetAmountMicros",
        resourceName: indicator.resourceName,
        current: view.budgetAmountMicros,
        historical: view.historicalBudgetAmountMicros,
      });
    }
  }
  return rows;
}

function confidenceOf(rows: readonly OptimizationEvidenceRow[]): "FULL" | "PARTIAL" {
  for (const row of rows) {
    if (row.current === null || row.historical === null || row.change === null) return "PARTIAL";
  }
  return "FULL";
}

function materialize(rule: OptimizationRule, view: RecommendationView, indicators: readonly PerformanceIndicator[]): OptimizationRecommendation {
  const rows = indicators.map(evidenceRow);
  const currentWindow = view.report.comparison.currentWindow;
  const historicalWindow = view.report.comparison.historicalWindow;
  const detail = rows.map((row) => `${row.name} at ${row.resourceName} is ${row.direction}; current ${show(row.current)}; historical ${show(row.historical)}; change ${show(row.change)}.`).join(" ");
  return {
    recommendationId: rule.id,
    kind: rule.kind,
    reason: `${rule.kind}. Rule ${rule.id}. ${rule.boundNote} ${detail}`,
    evidence: { rows },
    supportingMetrics: { rows: supportingRows(view, indicators) },
    historicalComparison: { currentWindow, historicalWindow, rows: indicators.map(evidenceRow) },
    confidence: confidenceOf(rows),
    triggeredRules: [rule.id],
  };
}

export function createOptimizationRecommendationEngine(options: OptimizationEngineOptions = {}): OptimizationRecommendationEngine {
  const validator = options.validator ?? createOptimizationValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `recommendation-set-${++serial}`);
  const rules = options.rules ?? OPTIMIZATION_RULES;
  const snapshots = new Map<string, OptimizationSnapshot>();

  return {
    validator,
    generate(input) {
      const started = now();
      const refused = (issues: OptimizationResult["issues"], metadata: OptimizationMetadata = {}): OptimizationResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepOptimization({
          status: "REJECTED",
          issues,
          recommendationSet: null,
          evidence: null,
          statistics: createOptimizationStatistics({ ruleCount: 0, triggeredRuleCount: 0, recommendationCount: 0, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const ruleIssues = validator.validateRules(rules);
        const inputIssues = validator.validateInput(input);
        if (ruleIssues.length > 0 || inputIssues.length > 0) return refused([...ruleIssues, ...inputIssues]);
        const view = validator.parseInput(input);
        if (view === null) return refused([{ field: "performanceReport", message: "Corrupted Metrics: the report could not be read." }]);
        const recommendations: OptimizationRecommendation[] = [];
        for (const rule of rules) {
          if (!rule.independent || !rule.applies(view)) continue;
          const selected = rule.select(view);
          if (selected.length === 0) return refused([{ field: "rules", message: "Invalid Recommendation Rules: a matched rule did not cite evidence." }]);
          recommendations.push(materialize(rule, view, selected));
        }
        if (recommendations.length === 0) {
          for (const rule of rules) {
            if (rule.independent || !rule.applies(view)) continue;
            const selected = rule.select(view);
            if (selected.length === 0) return refused([{ field: "rules", message: "Invalid Recommendation Rules: a matched rule did not cite evidence." }]);
            recommendations.push(materialize(rule, view, selected));
            break;
          }
        }
        if (recommendations.length === 0) return refused([{ field: "rules", message: "Invalid Recommendation Rules: no recommendation was produced." }]);
        const evidenceRows: OptimizationEvidenceRow[] = [];
        for (const recommendation of recommendations) {
          for (const row of recommendation.evidence.rows) evidenceRows.push(row);
        }
        const evidence: OptimizationEvidence = {
          campaignResourceName: view.report.campaignResourceName,
          currentWindow: view.report.comparison.currentWindow,
          historicalWindow: view.report.comparison.historicalWindow,
          rows: evidenceRows,
        };
        const executionTime = Math.max(0, now() - started);
        const statistics = createOptimizationStatistics({
          ruleCount: rules.length,
          triggeredRuleCount: recommendations.length,
          recommendationCount: recommendations.length,
          issueCount: 0,
          executionTime,
        });
        const recommendationSetId = idFactory();
        const snapshot = createOptimizationSnapshot({
          recommendationSetId,
          recommendations,
          evidence,
          statistics,
          context: {
            campaignResourceName: view.report.campaignResourceName,
            currentWindow: view.report.comparison.currentWindow,
            historicalWindow: view.report.comparison.historicalWindow,
          },
          createdAt: timestamp(),
          metadata: isRecord(input) && isRecord((input as { executionMetadata?: unknown }).executionMetadata) ? ({ ...(input as { executionMetadata: OptimizationMetadata }).executionMetadata }) : {},
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, snapshot.metadata);
        snapshots.set(snapshot.recommendationSetId, snapshot);
        return freezeDeepOptimization({
          status: "OK",
          issues: [],
          recommendationSet: snapshot.recommendationSet,
          evidence: snapshot.evidence,
          statistics: snapshot.statistics,
          snapshot,
          metadata: snapshot.metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "performanceReport", message: "Corrupted Metrics: the recommendation could not be restated." }]);
      }
    },
    getSnapshot: (recommendationSetId) => snapshots.get(recommendationSetId) ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
