/**
 * Host record domain: product recommendation engine.
 *
 * Turns read-only Product Intelligence reports, evidence graphs, and the
 * existing Discovery, Opportunity, Traffic, and Decision analyses into a
 * frozen recommendation, statistics, metadata, and a snapshot. It orders
 * products from the evidence already recorded. It never changes those
 * analyses, never approves a product, never publishes a campaign, and never
 * reaches an outside system. A refused input returns REJECTED with issues
 * and no recommendation. This method never throws.
 */
import { createRankingEngine, type RankingEngine } from "./ranking-engine";
import { createRecommendationBuilder, type RecommendationBuilder } from "./recommendation-builder";
import {
  copyPlainRecommendation,
  createRecommendationSnapshot,
  createRecommendationStatistics,
  freezeDeepRecommendation,
  type RecommendationMetadata,
  type RecommendationResult,
  type RecommendationSnapshot,
} from "./recommendation-snapshot";
import { bundlesOf, createRecommendationValidator, type RecommendationValidator } from "./recommendation-validator";

export type RecommendationClock = () => number;
export type RecommendationTimestamp = () => string;
export type RecommendationIdFactory = () => string;

export interface ProductRecommendationEngine {
  readonly builder: RecommendationBuilder;
  readonly validator: RecommendationValidator;
  readonly ranking: RankingEngine;
  recommend(input: unknown): RecommendationResult;
  getSnapshot(recommendationId: string): RecommendationSnapshot | null;
}

export interface ProductRecommendationEngineOptions {
  builder?: RecommendationBuilder;
  validator?: RecommendationValidator;
  ranking?: RankingEngine;
  now?: RecommendationClock;
  timestamp?: RecommendationTimestamp;
  idFactory?: RecommendationIdFactory;
}

const defaultClock: RecommendationClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createProductRecommendationEngine(options: ProductRecommendationEngineOptions = {}): ProductRecommendationEngine {
  const builder = options.builder ?? createRecommendationBuilder();
  const validator = options.validator ?? createRecommendationValidator();
  const ranking = options.ranking ?? createRankingEngine();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `recommendation-${++serial}`);
  const snapshots = new Map<string, RecommendationSnapshot>();

  function refused(issues: RecommendationResult["issues"], metadata: RecommendationMetadata, executionTime = 0): RecommendationResult {
    return {
      status: "REJECTED",
      issues,
      recommendation: null,
      statistics: createRecommendationStatistics({ productCount: 0, executionCandidateCount: 0, holdCount: 0, insufficientCount: 0, executionTime }),
      snapshot: null,
      metadata,
      executionTime,
    };
  }

  return {
    builder,
    validator,
    ranking,
    getSnapshot: (recommendationId) => snapshots.get(recommendationId) ?? null,
    recommend(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainRecommendation(input.executionMetadata as RecommendationMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, metadata, Math.max(0, now() - start));
        const source = input as Record<string, unknown>;
        const bundles = bundlesOf(source);
        const drafts = bundles.map((bundle) => builder.build(bundle));
        const ranked = ranking.rank(drafts);
        if (ranked.issues.length > 0 || ranked.entries === null) {
          return refused(ranked.issues, metadata, Math.max(0, now() - start));
        }
        const rankingIssues = validator.validateRanking(ranked.entries);
        if (rankingIssues.length > 0) return refused(rankingIssues, metadata, Math.max(0, now() - start));
        const recommendation = freezeDeepRecommendation({
          recommendations: ranked.entries,
          ranking: ranked.entries.map((entry) => ({ candidateId: entry.candidateId, rankingPosition: entry.rankingPosition })),
        });
        const executionTime = Math.max(0, now() - start);
        const statistics = createRecommendationStatistics({
          productCount: recommendation.recommendations.length,
          executionCandidateCount: recommendation.recommendations.filter((entry) => entry.level === "EXECUTION_CANDIDATE").length,
          holdCount: recommendation.recommendations.filter((entry) => entry.level === "HOLD").length,
          insufficientCount: recommendation.recommendations.filter((entry) => entry.level === "INSUFFICIENT").length,
          executionTime,
        });
        const first = recommendation.recommendations[0];
        const snapshot = createRecommendationSnapshot({
          recommendationId: idFactory(),
          productName: first?.productName ?? "",
          rankingPosition: first?.rankingPosition ?? 1,
          createdAt,
          metadata: { ...metadata, productCount: recommendation.recommendations.length },
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata, executionTime);
        snapshots.set(snapshot.recommendationId, snapshot);
        return freezeDeepRecommendation({
          status: "OK",
          issues: [],
          recommendation,
          statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch (error) {
        return refused([{ field: "recommendation", message: error instanceof Error ? error.message : "The recommendation stopped." }], {});
      }
    },
  };
}
