/**
 * Host record domain: product intelligence report.
 *
 * Turns read-only ProductFacts and duck-typed evidence records into a frozen
 * Product Intelligence Report, evidence graph, statistics, metadata, and a
 * snapshot. It restates observed bundles. It never judges a product, never
 * approves or refuses a product, never fetches a page, and never runs
 * another engine. A refused input returns REJECTED with issues and no
 * report. This layer stays offline.
 */
import { createProductReportBuilder, type ProductReportBuilder } from "./product-report-builder";
import { createProductReportValidator, type ProductReportValidator } from "./product-report-validator";
import { computeProductReportStatistics, statisticsOf, type ProductReportStatistics } from "./product-report-statistics";
import {
  copyPlainProductReport,
  createProductReportSnapshot,
  type EvidenceGraph,
  type ProductIntelligenceReport,
  type ProductReportContext,
  type ProductReportIssue,
  type ProductReportMetadata,
  type ProductReportSnapshot,
} from "./product-report-snapshot";

export type ProductReportClock = () => number;
export type ProductReportTimestamp = () => string;
export type ProductReportIdFactory = () => string;

export interface ProductIntelligenceReportResult {
  status: "OK" | "REJECTED";
  issues: ProductReportIssue[];
  report: ProductIntelligenceReport | null;
  graph: EvidenceGraph | null;
  statistics: ProductReportStatistics | null;
  snapshot: ProductReportSnapshot | null;
  metadata: ProductReportMetadata;
  executionTime: number;
}

export interface ProductIntelligenceReportHost {
  readonly builder: ProductReportBuilder;
  readonly validator: ProductReportValidator;
  build(input: unknown): ProductIntelligenceReportResult;
  getSnapshot(reportId: string): ProductReportSnapshot | null;
}

export interface ProductIntelligenceReportOptions {
  builder?: ProductReportBuilder;
  validator?: ProductReportValidator;
  now?: ProductReportClock;
  timestamp?: ProductReportTimestamp;
  idFactory?: ProductReportIdFactory;
}

const defaultClock: ProductReportClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(issues: ProductReportIssue[], metadata: ProductReportMetadata, executionTime = 0): ProductIntelligenceReportResult {
  return {
    status: "REJECTED",
    issues,
    report: null,
    graph: null,
    statistics: computeProductReportStatistics({ bundleCount: 0, missingCount: 0, warningCount: 0, executionTime }),
    snapshot: null,
    metadata,
    executionTime,
  };
}

export function createProductIntelligenceReport(options: ProductIntelligenceReportOptions = {}): ProductIntelligenceReportHost {
  const builder = options.builder ?? createProductReportBuilder();
  const validator = options.validator ?? createProductReportValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `report-${++serial}`);
  const snapshots = new Map<string, ProductReportSnapshot>();

  return {
    builder,
    validator,
    getSnapshot: (reportId) => snapshots.get(reportId) ?? null,
    build(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainProductReport(input.executionMetadata as ProductReportMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const draft = input as ProductReportContext;
        const built = builder.build(draft, metadata);
        if (built.issues.length > 0 || !built.report) {
          return refused(
            built.issues.length > 0 ? built.issues : [{ field: "report", message: "Corrupted Report: a report record is required." }],
            metadata,
            Math.max(0, now() - start),
          );
        }
        const reportIssues = validator.validateReport(built.report);
        if (reportIssues.length > 0) return refused(reportIssues, metadata, Math.max(0, now() - start));
        const executionTime = Math.max(0, now() - start);
        const snapshot = createProductReportSnapshot({
          reportId: id,
          productName: built.report.importedProduct.productName,
          landingPage: built.report.importedProduct.landingPage,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          report: built.report,
          graph: built.report.evidenceGraph,
          statistics: statisticsOf(built.report, executionTime),
          snapshot,
          metadata: built.report.metadata,
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "analyzer", message: error instanceof Error ? error.message : "Invalid Metadata: the builder could not restate the records." }],
          {},
        );
      }
    },
  };
}
