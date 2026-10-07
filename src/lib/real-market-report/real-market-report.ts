/**
 * Host record domain: real market intelligence report.
 *
 * One entry point from collected market artifacts to a frozen report.
 * It stores snapshots in memory. A refused report returns REJECTED and
 * stores nothing. This method never throws.
 */
import { createRealMarketReportBuilder, type RealMarketReportBuilder } from "./market-report-builder";
import type { RealMarketReportMetadata } from "./market-report-context";
import {
  createRealMarketReportSnapshot,
  createRealMarketStatistics,
  freezeDeepRealMarketReport,
  type RealMarketReportResult,
  type RealMarketReportSnapshot,
} from "./market-report-snapshot";
import { createRealMarketReportValidator, type RealMarketReportValidator } from "./market-report-validator";

export type RealMarketReportClock = () => number;
export type RealMarketReportTimestamp = () => string;
export type RealMarketReportIdFactory = () => string;

export interface RealMarketReportOptions {
  now?: RealMarketReportClock;
  timestamp?: RealMarketReportTimestamp;
  idFactory?: RealMarketReportIdFactory;
  builder?: RealMarketReportBuilder;
  validator?: RealMarketReportValidator;
}

export interface RealMarketReport {
  readonly validator: RealMarketReportValidator;
  build(input: unknown): RealMarketReportResult;
  getSnapshot(reportId: string): RealMarketReportSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createRealMarketReport(options: RealMarketReportOptions = {}): RealMarketReport {
  const validator = options.validator ?? createRealMarketReportValidator();
  const builder = options.builder ?? createRealMarketReportBuilder();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `real-market-report-${++serial}`);
  const snapshots = new Map<string, RealMarketReportSnapshot>();

  return {
    validator,
    build(input) {
      const started = now();
      const refused = (issues: RealMarketReportResult["issues"], metadata: RealMarketReportMetadata = {}): RealMarketReportResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepRealMarketReport({
          status: "REJECTED",
          issues,
          report: null,
          graph: null,
          statistics: createRealMarketStatistics({
            searchCount: 0,
            serpCount: 0,
            sponsoredCount: 0,
            landingPageCount: 0,
            observedProductCount: 0,
            brandCount: 0,
            domainCount: 0,
            categoryCount: 0,
            priceCount: 0,
            languageCount: 0,
            warningCount: 0,
            missingCount: 0,
            executionTime,
          }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const createdAt = timestamp();
        const reportId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? { ...input.executionMetadata } as RealMarketReportMetadata : {};
        const draft = builder.build(input);
        const executionTime = Math.max(0, now() - started);
        const statistics = createRealMarketStatistics({
          searchCount: 1,
          serpCount: draft.report.serpSummary.count,
          sponsoredCount: draft.report.sponsoredSummary.count,
          landingPageCount: draft.report.landingPageSummary.count,
          observedProductCount: draft.report.observedProductSummary.count,
          brandCount: draft.report.observedBrands.length,
          domainCount: draft.report.observedDomains.length,
          categoryCount: draft.report.observedCategories.length,
          priceCount: draft.report.observedPrices.length,
          languageCount: draft.report.observedLanguages.length,
          warningCount: draft.report.warnings.length,
          missingCount: draft.report.missingEvidence.length,
          executionTime,
        });
        const snapshot = createRealMarketReportSnapshot({
          reportId,
          report: draft.report,
          graph: draft.graph,
          statistics,
          context: draft.context,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.reportId, snapshot);
        return freezeDeepRealMarketReport({
          status: "OK",
          issues: [],
          report: snapshot.report,
          graph: snapshot.graph,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "report", message: "Invalid Metadata: the report could not restate the evidence." }]);
      }
    },
    getSnapshot: (reportId) => snapshots.get(reportId) ?? null,
  };
}
