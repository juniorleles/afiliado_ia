/**
 * Host record domain: product portfolio snapshot.
 *
 * Frozen portfolio records. A portfolio compares analysis results that
 * already exist. It does not approve a product and it does not change a
 * Product Intelligence, Discovery, Opportunity, or Decision record.
 * This module does not reach an outside system and does not run another engine.
 */
export type PortfolioMetadata = Record<string, string | number | boolean | null>;

export const PORTFOLIO_STATUSES = ["OK", "REJECTED"] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

export const PORTFOLIO_ORIGINS = ["OBSERVED"] as const;
export type PortfolioOrigin = (typeof PORTFOLIO_ORIGINS)[number];

export const PORTFOLIO_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type PortfolioProvenance = (typeof PORTFOLIO_PROVENANCE)[number];

export const PORTFOLIO_LEVELS = ["EXECUTION_CANDIDATE", "HOLD", "INSUFFICIENT"] as const;
export type PortfolioLevel = (typeof PORTFOLIO_LEVELS)[number];

export interface PortfolioIssue {
  field: string;
  message: string;
}

export const PORTFOLIO_CONTEXT_MEMBERS = [
  "products",
  "reports",
  "recommendationReports",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

export const PORTFOLIO_PRODUCT_MEMBERS = [
  "productIntelligenceReport",
  "recommendationReport",
  "evidenceGraph",
  "discoveryAnalysis",
  "opportunityAnalysis",
  "trafficAnalysis",
  "decisionAnalysis",
] as const;

export const PORTFOLIO_COMPARE_FIELDS = [
  "landingPage",
  "competition",
  "commercial",
  "search",
  "discoveryStatus",
  "opportunityStatus",
  "trafficStatus",
  "decisionStatus",
] as const;

export interface PortfolioEvidenceRef {
  candidateId: string;
  productName: string;
  items: readonly string[];
}

export interface PortfolioOpportunityRef {
  candidateId: string;
  productName: string;
  rankingPosition: number;
}

export interface PortfolioRiskSummary {
  items: readonly string[];
  text: string;
}

export interface PortfolioConfidenceSummary {
  minimum: number;
  maximum: number;
  entries: readonly { candidateId: string; productName: string; confidence: number }[];
}

export const PORTFOLIO_ENTRY_KEYS = [
  "productName",
  "candidateId",
  "rankingPosition",
  "confidence",
  "level",
  "missingEvidence",
  "landingPage",
  "competition",
  "commercial",
  "search",
  "discoveryStatus",
  "opportunityStatus",
  "trafficStatus",
  "decisionStatus",
  "observedSignals",
  "origin",
  "provenance",
] as const;

export interface PortfolioEntry {
  productName: string;
  candidateId: string;
  rankingPosition: number;
  confidence: number;
  level: PortfolioLevel | null;
  missingEvidence: readonly string[];
  landingPage: string | null;
  competition: string | null;
  commercial: string | null;
  search: string | null;
  discoveryStatus: string | null;
  opportunityStatus: string | null;
  trafficStatus: string | null;
  decisionStatus: string | null;
  observedSignals: number;
  origin: PortfolioOrigin;
  provenance: PortfolioProvenance;
}

export interface ProductPortfolio {
  ranking: readonly PortfolioEntry[];
  rankedProducts: readonly { candidateId: string; productName: string; rankingPosition: number; confidence: number }[];
  bestOpportunities: readonly PortfolioOpportunityRef[];
  weakOpportunities: readonly PortfolioOpportunityRef[];
  missingEvidence: readonly PortfolioEvidenceRef[];
  riskSummary: PortfolioRiskSummary;
  confidenceSummary: PortfolioConfidenceSummary;
  origin: PortfolioOrigin;
  provenance: PortfolioProvenance;
}

export const PORTFOLIO_STATISTICS_KEYS = ["productCount", "bestCount", "weakCount", "missingProductCount", "executionTime"] as const;

export interface PortfolioStatistics {
  productCount: number;
  bestCount: number;
  weakCount: number;
  missingProductCount: number;
  executionTime: number;
}

export const PORTFOLIO_SNAPSHOT_KEYS = ["portfolioId", "productName", "productCount", "createdAt", "metadata"] as const;

export interface PortfolioSnapshot {
  portfolioId: string;
  productName: string;
  productCount: number;
  createdAt: string;
  metadata: PortfolioMetadata;
}

export interface PortfolioSnapshotInit {
  portfolioId: string;
  productName: string;
  productCount: number;
  createdAt: string;
  metadata?: PortfolioMetadata;
}

export interface PortfolioResult {
  status: PortfolioStatus;
  issues: PortfolioIssue[];
  portfolio: ProductPortfolio | null;
  statistics: PortfolioStatistics | null;
  snapshot: PortfolioSnapshot | null;
  metadata: PortfolioMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepPortfolio<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepPortfolio(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainPortfolio<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainPortfolio(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainPortfolio(inner)])) as T;
  }
  return value;
}

export function createPortfolioSnapshot(init: PortfolioSnapshotInit): PortfolioSnapshot {
  return freezeDeepPortfolio({
    portfolioId: init.portfolioId,
    productName: init.productName,
    productCount: init.productCount,
    createdAt: init.createdAt,
    metadata: copyPlainPortfolio(init.metadata ?? {}),
  });
}

export function createPortfolioStatistics(init: PortfolioStatistics): PortfolioStatistics {
  return freezeDeepPortfolio({
    productCount: init.productCount,
    bestCount: init.bestCount,
    weakCount: init.weakCount,
    missingProductCount: init.missingProductCount,
    executionTime: init.executionTime,
  });
}
