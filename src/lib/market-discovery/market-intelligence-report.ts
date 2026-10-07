/**
 * Host record domain: market intelligence report.
 *
 * Turns read-only market artifacts into a frozen report, evidence graph,
 * statistics, and snapshot. It restates the artifacts it is given. A refused
 * input returns REJECTED with issues and no snapshot. This method never throws.
 */
import { createMarketReportBuilder, type MarketReportBuilder, type MarketReportEnvelope } from "./market-report-builder";
import { createMarketReportSnapshot, copyPlainMarketReport, freezeDeepMarketReport, type MarketEvidenceGraph, type MarketIntelligenceReport, type MarketReportIssue, type MarketReportMetadata, type MarketReportSnapshot } from "./market-report-snapshot";
import { createMarketReportStatistics, type MarketReportStatistics } from "./market-report-statistics";
import { createMarketReportValidator, type MarketReportValidator } from "./market-report-validator";

export type MarketReportClock = () => number;
export type MarketReportTimestamp = () => string;
export type MarketReportIdFactory = () => string;

export interface MarketIntelligenceReportResult {
  status: "OK" | "REJECTED";
  issues: MarketReportIssue[];
  report: MarketIntelligenceReport | null;
  graph: MarketEvidenceGraph | null;
  statistics: MarketReportStatistics;
  snapshot: MarketReportSnapshot | null;
  metadata: MarketReportMetadata;
  executionTime: number;
}

export interface MarketIntelligenceReportHost {
  readonly builder: MarketReportBuilder;
  readonly validator: MarketReportValidator;
  build(input: unknown): MarketIntelligenceReportResult;
  getSnapshot(reportId: string): MarketReportSnapshot | null;
}

export interface MarketIntelligenceReportOptions {
  builder?: MarketReportBuilder;
  validator?: MarketReportValidator;
  now?: MarketReportClock;
  timestamp?: MarketReportTimestamp;
  idFactory?: MarketReportIdFactory;
}

const defaultClock: MarketReportClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyStatistics(executionTime: number): MarketReportStatistics {
  return createMarketReportStatistics({
    searchCount: 0,
    serpCount: 0,
    sponsoredCount: 0,
    landingPageCount: 0,
    observedProductCount: 0,
    warningCount: 0,
    missingCount: 0,
    executionTime,
  });
}

function refused(issues: MarketReportIssue[], metadata: MarketReportMetadata, executionTime = 0): MarketIntelligenceReportResult {
  return {
    status: "REJECTED",
    issues,
    report: null,
    graph: null,
    statistics: emptyStatistics(executionTime),
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createMarketIntelligenceReport(options: MarketIntelligenceReportOptions = {}): MarketIntelligenceReportHost {
  const builder = options.builder ?? createMarketReportBuilder();
  const validator = options.validator ?? createMarketReportValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `market-report-${++serial}`);
  const snapshots = new Map<string, MarketReportSnapshot>();

  return {
    builder,
    validator,
    getSnapshot: (reportId) => snapshots.get(reportId) ?? null,
    build(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainMarketReport(input.executionMetadata as MarketReportMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0 || !isRecord(input)) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const built = builder.build(input as unknown as MarketReportEnvelope);
        const executionTime = Math.max(0, now() - start);
        const statistics = createMarketReportStatistics({ ...built.counts, executionTime });
        const snapshot = createMarketReportSnapshot({
          reportId: id,
          report: built.report,
          graph: built.graph,
          statistics,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return freezeDeepMarketReport({
          status: "OK",
          issues: [],
          report: snapshot.report,
          graph: snapshot.graph,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "report", message: error instanceof Error ? error.message : "Corrupted Evidence: the report could not restate the artifacts." }], {});
      }
    },
  };
}
