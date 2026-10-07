/**
 * Host record domain: product ranking.
 *
 * Orders recommendation drafts from the evidence already collected.
 * Position 1 is the first product in that order. The order is deterministic.
 * This module does not change a Discovery, Opportunity, or Decision record,
 * and it does not approve a product.
 */
import {
  RECOMMENDATION_LEVELS,
  type RecommendationEntry,
  type RecommendationIssue,
  type RecommendationLevel,
} from "./recommendation-snapshot";

export interface RecommendationDraft {
  productName: string;
  candidateId: string;
  level: RecommendationLevel;
  confidence: number;
  positiveEvidence: RecommendationEntry["positiveEvidence"];
  negativeEvidence: RecommendationEntry["negativeEvidence"];
  missingEvidence: RecommendationEntry["missingEvidence"];
  riskSummary: RecommendationEntry["riskSummary"];
  readinessSummary: RecommendationEntry["readinessSummary"];
  origin: RecommendationEntry["origin"];
  provenance: RecommendationEntry["provenance"];
}

const LEVEL_ORDER: Record<RecommendationLevel, number> = {
  EXECUTION_CANDIDATE: 0,
  HOLD: 1,
  INSUFFICIENT: 2,
};

export function confidenceOf(positive: number, negative: number, missing: number): number {
  const total = positive + negative + missing;
  if (total <= 0) return 0;
  return Math.round((positive * 1000) / total) / 1000;
}

export function compareRecommendations(left: RecommendationDraft, right: RecommendationDraft): number {
  const level = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
  if (level !== 0) return level;
  if (left.confidence !== right.confidence) return right.confidence - left.confidence;
  if (left.missingEvidence.length !== right.missingEvidence.length) return left.missingEvidence.length - right.missingEvidence.length;
  if (left.positiveEvidence.length !== right.positiveEvidence.length) return right.positiveEvidence.length - left.positiveEvidence.length;
  const name = left.productName.localeCompare(right.productName);
  if (name !== 0) return name;
  return left.candidateId.localeCompare(right.candidateId);
}

export interface RankingEngine {
  rank(drafts: readonly RecommendationDraft[]): { entries: RecommendationEntry[] | null; issues: RecommendationIssue[] };
}

export function createRankingEngine(): RankingEngine {
  function rank(drafts: readonly RecommendationDraft[]): { entries: RecommendationEntry[] | null; issues: RecommendationIssue[] } {
    const seen = new Set<string>();
    for (const draft of drafts) {
      if (seen.has(draft.candidateId)) {
        return {
          entries: null,
          issues: [{ field: "ranking", message: `Corrupted Ranking: candidate "${draft.candidateId}" is repeated.` }],
        };
      }
      seen.add(draft.candidateId);
      if (!(RECOMMENDATION_LEVELS as readonly string[]).includes(draft.level)) {
        return { entries: null, issues: [{ field: "ranking", message: "Corrupted Ranking: a recommendation level is not supported." }] };
      }
    }
    const ordered = [...drafts].sort(compareRecommendations);
    const entries: RecommendationEntry[] = ordered.map((draft, index) => ({
      productName: draft.productName,
      candidateId: draft.candidateId,
      level: draft.level,
      confidence: draft.confidence,
      positiveEvidence: draft.positiveEvidence,
      negativeEvidence: draft.negativeEvidence,
      missingEvidence: draft.missingEvidence,
      riskSummary: draft.riskSummary,
      readinessSummary: draft.readinessSummary,
      rankingPosition: index + 1,
      origin: draft.origin,
      provenance: draft.provenance,
    }));
    return { entries, issues: [] };
  }

  return { rank };
}
