/**
 * Host record domain: product portfolio optimizer.
 *
 * Compares existing Product Intelligence reports, recommendation reports,
 * evidence graphs, and analysis results into one frozen portfolio. It never
 * changes those records, never approves a product, never publishes a
 * campaign, and never reaches an outside system. A refused input returns
 * REJECTED with issues and no portfolio. This method never throws.
 */
import { createPortfolioBuilder, type PortfolioBuilder } from "./portfolio-builder";
import { createPortfolioRanking, type PortfolioRanking } from "./portfolio-ranking";
import {
  copyPlainPortfolio,
  createPortfolioSnapshot,
  createPortfolioStatistics,
  freezeDeepPortfolio,
  type PortfolioMetadata,
  type PortfolioResult,
  type PortfolioSnapshot,
} from "./portfolio-snapshot";
import { bundlesOf, createPortfolioValidator, type PortfolioValidator } from "./portfolio-validator";

export type PortfolioClock = () => number;
export type PortfolioTimestamp = () => string;
export type PortfolioIdFactory = () => string;

export interface ProductPortfolioOptimizer {
  readonly builder: PortfolioBuilder;
  readonly validator: PortfolioValidator;
  readonly ranking: PortfolioRanking;
  optimize(input: unknown): PortfolioResult;
  getSnapshot(portfolioId: string): PortfolioSnapshot | null;
}

export interface ProductPortfolioOptimizerOptions {
  builder?: PortfolioBuilder;
  validator?: PortfolioValidator;
  ranking?: PortfolioRanking;
  now?: PortfolioClock;
  timestamp?: PortfolioTimestamp;
  idFactory?: PortfolioIdFactory;
}

const defaultClock: PortfolioClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function withRecommendation(bundle: Record<string, unknown>, reports: unknown): Record<string, unknown> {
  if (bundle.recommendationReport !== undefined || !Array.isArray(reports)) return bundle;
  const report = isRecord(bundle.productIntelligenceReport) ? bundle.productIntelligenceReport : null;
  const imported = report && isRecord(report.importedProduct) ? report.importedProduct : null;
  const name = imported ? textOf(imported.productName) : null;
  const discovery = isRecord(bundle.discoveryAnalysis) ? bundle.discoveryAnalysis : null;
  const candidateId = textOf(discovery?.id) ?? textOf(discovery?.candidateId) ?? (name ? slugOf(name) : null);
  const match = reports.find((item) => {
    if (!isRecord(item)) return false;
    if (Array.isArray(item.recommendations)) {
      return item.recommendations.some((entry) => isRecord(entry) && (textOf(entry.candidateId) === candidateId || (name !== null && textOf(entry.productName) === name)));
    }
    return textOf(item.candidateId) === candidateId || (name !== null && textOf(item.productName) === name);
  });
  if (!isRecord(match)) return bundle;
  return { ...bundle, recommendationReport: match };
}

export function createProductPortfolioOptimizer(options: ProductPortfolioOptimizerOptions = {}): ProductPortfolioOptimizer {
  const builder = options.builder ?? createPortfolioBuilder();
  const validator = options.validator ?? createPortfolioValidator();
  const ranking = options.ranking ?? createPortfolioRanking();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `portfolio-${++serial}`);
  const snapshots = new Map<string, PortfolioSnapshot>();

  function refused(issues: PortfolioResult["issues"], metadata: PortfolioMetadata, executionTime = 0): PortfolioResult {
    return {
      status: "REJECTED",
      issues,
      portfolio: null,
      statistics: createPortfolioStatistics({ productCount: 0, bestCount: 0, weakCount: 0, missingProductCount: 0, executionTime }),
      snapshot: null,
      metadata,
      executionTime,
    };
  }

  return {
    builder,
    validator,
    ranking,
    getSnapshot: (portfolioId) => snapshots.get(portfolioId) ?? null,
    optimize(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainPortfolio(input.executionMetadata as PortfolioMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0 || !isRecord(input)) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const bundles = bundlesOf(input).map((bundle) => withRecommendation(bundle, input.recommendationReports));
        const drafts = [];
        for (const bundle of bundles) {
          const built = builder.build(bundle);
          if (built.issues.length > 0 || built.draft === null) return refused(built.issues, metadata, Math.max(0, now() - start));
          drafts.push(built.draft);
        }
        const names = new Set<string>();
        const candidates = new Set<string>();
        for (const draft of drafts) {
          if (names.has(draft.productName) || candidates.has(draft.candidateId)) {
            return refused([{ field: "products", message: `Duplicate Products: "${names.has(draft.productName) ? draft.productName : draft.candidateId}" is repeated.` }], metadata, Math.max(0, now() - start));
          }
          names.add(draft.productName);
          candidates.add(draft.candidateId);
        }
        const ranked = ranking.rank(drafts);
        if (ranked.issues.length > 0 || ranked.portfolio === null) return refused(ranked.issues, metadata, Math.max(0, now() - start));
        const portfolioIssues = validator.validatePortfolio(ranked.portfolio);
        if (portfolioIssues.length > 0) return refused(portfolioIssues, metadata, Math.max(0, now() - start));
        const portfolio = freezeDeepPortfolio(ranked.portfolio);
        const executionTime = Math.max(0, now() - start);
        const statistics = createPortfolioStatistics({
          productCount: portfolio.ranking.length,
          bestCount: portfolio.bestOpportunities.length,
          weakCount: portfolio.weakOpportunities.length,
          missingProductCount: portfolio.missingEvidence.length,
          executionTime,
        });
        const snapshot = createPortfolioSnapshot({
          portfolioId: idFactory(),
          productName: portfolio.ranking[0]?.productName ?? "",
          productCount: portfolio.ranking.length,
          createdAt,
          metadata: { ...metadata, productCount: portfolio.ranking.length, bestCount: portfolio.bestOpportunities.length },
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(snapshot.portfolioId, snapshot);
        return freezeDeepPortfolio({
          status: "OK",
          issues: [],
          portfolio,
          statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "portfolio", message: error instanceof Error ? error.message : "The portfolio stopped." }], {});
      }
    },
  };
}
