/**
 * Host record domain: performance analyzer.
 *
 * One entry point from collected metric records to a frozen performance
 * report. A refused run stores nothing. This method never throws and never
 * changes the supplied records.
 */
import type { AdGroupMetrics, RsaMetrics } from "../optimization-metrics/metrics-snapshot";
import { comparePerformance } from "./performance-comparator";
import type { PerformanceMetadata } from "./performance-context";
import { createPerformanceSnapshot, createPerformanceStatistics, freezeDeepPerformance, type PerformanceFinding, type PerformanceIndicator, type PerformanceResult, type PerformanceSnapshot } from "./performance-snapshot";
import { createPerformanceValidator, type PerformanceValidator } from "./performance-validator";

export type PerformanceClock = () => number;
export type PerformanceTimestamp = () => string;
export type PerformanceIdFactory = () => string;

export interface PerformanceAnalyzerOptions {
  now?: PerformanceClock;
  timestamp?: PerformanceTimestamp;
  idFactory?: PerformanceIdFactory;
  validator?: PerformanceValidator;
}

export interface PerformanceAnalyzer {
  readonly validator: PerformanceValidator;
  analyze(input: unknown): PerformanceResult;
  getSnapshot(analysisId: string): PerformanceSnapshot | null;
}

export function createPerformanceAnalyzer(options: PerformanceAnalyzerOptions = {}): PerformanceAnalyzer {
  const validator = options.validator ?? createPerformanceValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `performance-analyze-${++serial}`);
  const snapshots = new Map<string, PerformanceSnapshot>();

  return {
    validator,
    analyze(input) {
      const started = now();
      const refused = (issues: PerformanceResult["issues"], metadata: PerformanceMetadata = {}): PerformanceResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepPerformance({
          status: "REJECTED",
          issues,
          report: null,
          indicators: null,
          comparison: null,
          statistics: createPerformanceStatistics({ campaignCount: 0, adGroupCount: 0, adCount: 0, indicatorCount: 0, findingCount: 0, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues);
        const parsed = validator.parseInput(input);
        if (parsed === null) return refused([{ field: "campaignMetrics", message: "Corrupted Snapshot: the metrics could not be read." }]);
        const historicalGroups = new Map<string, AdGroupMetrics>();
        for (const group of parsed.historicalAdGroups) historicalGroups.set(group.resourceName, group);
        const historicalAds = new Map<string, RsaMetrics>();
        for (const ad of parsed.historicalAds) historicalAds.set(ad.resourceName, ad);
        const indicators: PerformanceIndicator[] = [];
        const findings: PerformanceFinding[] = [];
        const campaign = comparePerformance({
          level: "CAMPAIGN",
          resourceName: parsed.campaign.resourceName,
          current: parsed.campaign,
          historical: parsed.historicalCampaign,
          budgetAmountMicros: parsed.budgetAmountMicros,
          historicalBudgetAmountMicros: parsed.historicalBudgetAmountMicros,
        });
        indicators.push(...campaign.indicators);
        findings.push(...campaign.findings);
        for (const group of parsed.adGroups) {
          const compared = comparePerformance({
            level: "AD_GROUP",
            resourceName: group.resourceName,
            current: group,
            historical: historicalGroups.get(group.resourceName) ?? null,
            budgetAmountMicros: null,
            historicalBudgetAmountMicros: null,
          });
          indicators.push(...compared.indicators);
          findings.push(...compared.findings);
        }
        for (const ad of parsed.ads) {
          const compared = comparePerformance({
            level: "RSA",
            resourceName: ad.resourceName,
            current: ad,
            historical: historicalAds.get(ad.resourceName) ?? null,
            budgetAmountMicros: null,
            historicalBudgetAmountMicros: null,
          });
          indicators.push(...compared.indicators);
          findings.push(...compared.findings);
        }
        const executionTime = Math.max(0, now() - started);
        const statistics = createPerformanceStatistics({
          campaignCount: 1,
          adGroupCount: parsed.adGroups.length,
          adCount: parsed.ads.length,
          indicatorCount: indicators.length,
          findingCount: findings.length,
          issueCount: 0,
          executionTime,
        });
        const analysisId = idFactory();
        const snapshot = createPerformanceSnapshot({
          analysisId,
          campaignResourceName: parsed.campaign.resourceName,
          campaignId: parsed.campaign.campaignId,
          status: parsed.campaign.status,
          indicators,
          findings,
          currentWindow: parsed.currentWindow,
          historicalWindow: parsed.historicalWindow,
          statistics,
          createdAt: timestamp(),
          metadata: parsed.metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, parsed.metadata);
        snapshots.set(snapshot.analysisId, snapshot);
        return freezeDeepPerformance({
          status: "OK",
          issues: [],
          report: snapshot.report,
          indicators: snapshot.indicators,
          comparison: snapshot.comparison,
          statistics: snapshot.statistics,
          snapshot,
          metadata: parsed.metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "campaignMetrics", message: "Corrupted Snapshot: the analysis could not be restated." }]);
      }
    },
    getSnapshot: (analysisId) => snapshots.get(analysisId) ?? null,
  };
}
