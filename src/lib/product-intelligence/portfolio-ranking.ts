/**
 * Host record domain: product portfolio ranking.
 *
 * Orders comparison drafts from evidence that was already recorded.
 * Position 1 is the first product in that order. Best and weak groups restate
 * that order. This module does not change another engine and does not approve
 * a product.
 */
import {
  PORTFOLIO_LEVELS,
  type PortfolioConfidenceSummary,
  type PortfolioEntry,
  type PortfolioEvidenceRef,
  type PortfolioIssue,
  type PortfolioLevel,
  type PortfolioOpportunityRef,
  type PortfolioRiskSummary,
  type ProductPortfolio,
} from "./portfolio-snapshot";

export interface PortfolioDraft {
  productName: string;
  candidateId: string;
  confidence: number;
  level: PortfolioLevel | null;
  missingEvidence: readonly string[];
  negativeEvidence: readonly string[];
  observedSignals: number;
  landingPage: string | null;
  competition: string | null;
  commercial: string | null;
  search: string | null;
  discoveryStatus: string | null;
  opportunityStatus: string | null;
  trafficStatus: string | null;
  decisionStatus: string | null;
}

const LEVEL_ORDER: Record<PortfolioLevel, number> = {
  EXECUTION_CANDIDATE: 0,
  HOLD: 1,
  INSUFFICIENT: 2,
};

export function confidenceOf(present: number, negative: number, missing: number): number {
  const total = present + negative + missing;
  if (total <= 0) return 0;
  return Math.round((present * 1000) / total) / 1000;
}

export function comparePortfolio(left: PortfolioDraft, right: PortfolioDraft): number {
  if (left.missingEvidence.length !== right.missingEvidence.length) return left.missingEvidence.length - right.missingEvidence.length;
  if (left.confidence !== right.confidence) return right.confidence - left.confidence;
  const leftLevel = left.level === null ? 3 : LEVEL_ORDER[left.level];
  const rightLevel = right.level === null ? 3 : LEVEL_ORDER[right.level];
  if (leftLevel !== rightLevel) return leftLevel - rightLevel;
  if (left.observedSignals !== right.observedSignals) return right.observedSignals - left.observedSignals;
  const name = left.productName.localeCompare(right.productName);
  if (name !== 0) return name;
  return left.candidateId.localeCompare(right.candidateId);
}

function opportunityRef(entry: PortfolioEntry): PortfolioOpportunityRef {
  return { candidateId: entry.candidateId, productName: entry.productName, rankingPosition: entry.rankingPosition };
}

export interface PortfolioRanking {
  rank(drafts: readonly PortfolioDraft[]): { portfolio: ProductPortfolio | null; issues: PortfolioIssue[] };
}

export function createPortfolioRanking(): PortfolioRanking {
  function rank(drafts: readonly PortfolioDraft[]): { portfolio: ProductPortfolio | null; issues: PortfolioIssue[] } {
    const seen = new Set<string>();
    for (const draft of drafts) {
      if (seen.has(draft.candidateId)) {
        return { portfolio: null, issues: [{ field: "products", message: `Duplicate Products: "${draft.candidateId}" is repeated.` }] };
      }
      seen.add(draft.candidateId);
      if (draft.level !== null && !(PORTFOLIO_LEVELS as readonly string[]).includes(draft.level)) {
        return { portfolio: null, issues: [{ field: "portfolio", message: "Corrupted Portfolio: a comparison level is not supported." }] };
      }
      if (typeof draft.confidence !== "number" || !Number.isFinite(draft.confidence) || draft.confidence < 0 || draft.confidence > 1) {
        return { portfolio: null, issues: [{ field: "confidence", message: "Corrupted Portfolio: confidence must be a finite number from 0 through 1." }] };
      }
    }
    if (drafts.length === 0) {
      return { portfolio: null, issues: [{ field: "products", message: "Missing Reports: at least one Product Intelligence Report is required." }] };
    }
    const ordered = [...drafts].sort(comparePortfolio);
    const ranking: PortfolioEntry[] = ordered.map((draft, index) => ({
      productName: draft.productName,
      candidateId: draft.candidateId,
      rankingPosition: index + 1,
      confidence: draft.confidence,
      level: draft.level,
      missingEvidence: [...draft.missingEvidence],
      landingPage: draft.landingPage,
      competition: draft.competition,
      commercial: draft.commercial,
      search: draft.search,
      discoveryStatus: draft.discoveryStatus,
      opportunityStatus: draft.opportunityStatus,
      trafficStatus: draft.trafficStatus,
      decisionStatus: draft.decisionStatus,
      observedSignals: draft.observedSignals,
      origin: "OBSERVED",
      provenance: "DIRECT_SOURCE",
    }));
    const minMissing = Math.min(...ranking.map((entry) => entry.missingEvidence.length));
    const tightest = ranking.filter((entry) => entry.missingEvidence.length === minMissing);
    const maxConfidence = Math.max(...tightest.map((entry) => entry.confidence));
    const best = tightest.filter((entry) => entry.confidence === maxConfidence);
    const bestIds = new Set(best.map((entry) => entry.candidateId));
    const weak = ranking.filter((entry) => !bestIds.has(entry.candidateId) && (entry.missingEvidence.length > minMissing || entry.level === "INSUFFICIENT"));
    const missingEvidence: PortfolioEvidenceRef[] = ranking
      .filter((entry) => entry.missingEvidence.length > 0)
      .map((entry) => ({ candidateId: entry.candidateId, productName: entry.productName, items: [...entry.missingEvidence] }));
    const riskItems = ordered.flatMap((draft) => draft.negativeEvidence.map((text) => `${draft.productName}: ${text}`));
    const riskSummary: PortfolioRiskSummary = {
      items: riskItems,
      text: riskItems.length === 0 ? "No negative evidence was observed." : riskItems.join("; "),
    };
    const confidenceSummary: PortfolioConfidenceSummary = {
      minimum: Math.min(...ranking.map((entry) => entry.confidence)),
      maximum: Math.max(...ranking.map((entry) => entry.confidence)),
      entries: ranking.map((entry) => ({ candidateId: entry.candidateId, productName: entry.productName, confidence: entry.confidence })),
    };
    return {
      portfolio: {
        ranking,
        rankedProducts: ranking.map((entry) => ({
          candidateId: entry.candidateId,
          productName: entry.productName,
          rankingPosition: entry.rankingPosition,
          confidence: entry.confidence,
        })),
        bestOpportunities: best.map(opportunityRef),
        weakOpportunities: weak.map(opportunityRef),
        missingEvidence,
        riskSummary,
        confidenceSummary,
        origin: "OBSERVED",
        provenance: "DIRECT_SOURCE",
      },
      issues: [],
    };
  }

  return { rank };
}
