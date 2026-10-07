/**
 * Host record domain: portfolio snapshot.
 *
 * A frozen copy of one grouping. Counts restate which portfolios were
 * opened. This module does not reach an outside system.
 */
import type { PortfolioMetadata } from "./portfolio-context";
import type {
  PortfolioGroup,
  PortfolioIssue,
  PortfolioOrigin,
  PortfolioProvenance,
  PortfolioStatistics,
  PortfolioStatus,
  RankedOpportunityRef,
} from "./portfolio-types";

export const PORTFOLIO_EXECUTION_STATISTICS_KEYS = [
  "opportunityCount",
  "portfolioCount",
  "membershipCount",
  "issueCount",
  "executionTime",
] as const;

export interface PortfolioExecutionStatistics extends PortfolioStatistics {
  issueCount: number;
  executionTime: number;
}

export const PORTFOLIO_CONTEXT_RECORD_KEYS = ["policyId", "opportunityIds", "portfolioIds"] as const;

export interface PortfolioContextRecord {
  policyId: string;
  opportunityIds: readonly string[];
  portfolioIds: readonly string[];
}

export const OPPORTUNITY_PORTFOLIO_KEYS = ["policyId", "ordered", "portfolios", "statistics", "origin", "provenance"] as const;

export interface OpportunityPortfolio {
  policyId: string;
  ordered: readonly RankedOpportunityRef[];
  portfolios: readonly PortfolioGroup[];
  statistics: PortfolioStatistics;
  origin: PortfolioOrigin;
  provenance: PortfolioProvenance;
}

export const PORTFOLIO_GROUP_KEYS = ["portfolioId", "portfolioType", "dimension", "value", "opportunityIds"] as const;

export const PORTFOLIO_SNAPSHOT_KEYS = [
  "buildId",
  "portfolio",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface PortfolioSnapshot {
  buildId: string;
  portfolio: OpportunityPortfolio;
  statistics: PortfolioExecutionStatistics;
  context: PortfolioContextRecord;
  createdAt: string;
  origin: PortfolioOrigin;
  provenance: PortfolioProvenance;
  metadata: PortfolioMetadata;
}

export const PORTFOLIO_RESULT_KEYS = [
  "status",
  "issues",
  "portfolio",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface PortfolioResult {
  status: PortfolioStatus;
  issues: PortfolioIssue[];
  portfolio: OpportunityPortfolio | null;
  statistics: PortfolioExecutionStatistics;
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

export function createPortfolioExecutionStatistics(init: PortfolioExecutionStatistics): PortfolioExecutionStatistics {
  return freezeDeepPortfolio({
    opportunityCount: init.opportunityCount,
    portfolioCount: init.portfolioCount,
    membershipCount: init.membershipCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createPortfolioSnapshot(init: {
  buildId: string;
  portfolio: OpportunityPortfolio;
  statistics: PortfolioExecutionStatistics;
  context: PortfolioContextRecord;
  createdAt: string;
  metadata?: PortfolioMetadata;
}): PortfolioSnapshot {
  return freezeDeepPortfolio({
    buildId: init.buildId,
    portfolio: init.portfolio,
    statistics: init.statistics,
    context: {
      policyId: init.context.policyId,
      opportunityIds: [...init.context.opportunityIds],
      portfolioIds: [...init.context.portfolioIds],
    },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
