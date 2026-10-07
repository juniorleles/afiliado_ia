/**
 * Host record domain: portfolio builder.
 *
 * One entry point from a ranking and grouping attributes to frozen
 * portfolios. It stores snapshots in memory. A refused build returns
 * REJECTED and stores nothing. This method never throws.
 */
import type { PortfolioMetadata } from "./portfolio-context";
import { groupRankedOpportunities } from "./portfolio";
import {
  createPortfolioExecutionStatistics,
  createPortfolioSnapshot,
  freezeDeepPortfolio,
  type PortfolioResult,
  type PortfolioSnapshot,
} from "./portfolio-snapshot";
import type { OpportunityGrouping, PortfolioAssignment, RankedOpportunityRef } from "./portfolio-types";
import { createPortfolioValidator, type PortfolioValidator } from "./portfolio-validator";

export type PortfolioClock = () => number;
export type PortfolioTimestamp = () => string;
export type PortfolioIdFactory = () => string;

export interface OpportunityPortfolioBuilderOptions {
  now?: PortfolioClock;
  timestamp?: PortfolioTimestamp;
  idFactory?: PortfolioIdFactory;
  validator?: PortfolioValidator;
}

export interface OpportunityPortfolioBuilder {
  readonly validator: PortfolioValidator;
  build(input: unknown): PortfolioResult;
  getSnapshot(buildId: string): PortfolioSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function groupingsOf(opportunities: readonly unknown[]): OpportunityGrouping[] {
  return opportunities.map((item) => {
    const record = item as Record<string, unknown>;
    const grouping: OpportunityGrouping = { opportunityId: textOf(record.opportunityId) ?? "" };
    for (const dimension of ["category", "market", "language", "country", "priceRange", "brand", "merchant", "affiliateNetwork", "searchIntent"] as const) {
      const value = textOf(record[dimension]);
      if (value !== null) grouping[dimension] = value;
    }
    if (Array.isArray(record.portfolioTypes)) {
      const assignments: PortfolioAssignment[] = [];
      for (const token of record.portfolioTypes) {
        if (typeof token === "string") {
          const name = token.trim();
          if (name !== "") assignments.push({ portfolioType: name as PortfolioAssignment["portfolioType"], value: name });
          continue;
        }
        if (!isRecord(token)) continue;
        const customId = textOf(token.portfolioId);
        if (customId !== null) assignments.push({ portfolioType: "custom", value: customId });
      }
      grouping.portfolioAssignments = assignments;
    }
    return grouping;
  });
}

export function createOpportunityPortfolioBuilder(options: OpportunityPortfolioBuilderOptions = {}): OpportunityPortfolioBuilder {
  const validator = options.validator ?? createPortfolioValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `opportunity-portfolio-${++serial}`);
  const snapshots = new Map<string, PortfolioSnapshot>();

  return {
    validator,
    build(input) {
      const started = now();
      const refused = (issues: PortfolioResult["issues"], metadata: PortfolioMetadata = {}): PortfolioResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepPortfolio({
          status: "REJECTED",
          issues,
          portfolio: null,
          statistics: createPortfolioExecutionStatistics({
            opportunityCount: 0,
            portfolioCount: 0,
            membershipCount: 0,
            issueCount: issues.length,
            executionTime,
          }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input) || !isRecord(input.ranking) || !Array.isArray(input.opportunities)) return refused(issues);
        const createdAt = timestamp();
        const buildId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? { ...input.executionMetadata } as PortfolioMetadata : {};
        const ordered = (input.ranking.ordered as readonly Record<string, unknown>[]).map((item) => ({
          position: item.position as number,
          opportunityId: textOf(item.opportunityId) ?? "",
        })) satisfies RankedOpportunityRef[];
        const draft = groupRankedOpportunities(textOf(input.ranking.policyId) ?? "", ordered, groupingsOf(input.opportunities));
        const executionTime = Math.max(0, now() - started);
        const statistics = createPortfolioExecutionStatistics({
          opportunityCount: draft.statistics.opportunityCount,
          portfolioCount: draft.statistics.portfolioCount,
          membershipCount: draft.statistics.membershipCount,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createPortfolioSnapshot({
          buildId,
          portfolio: {
            policyId: draft.policyId,
            ordered: draft.ordered,
            portfolios: draft.portfolios,
            statistics: draft.statistics,
            origin: "OBSERVED",
            provenance: "DIRECT_SOURCE",
          },
          statistics,
          context: {
            policyId: draft.policyId,
            opportunityIds: draft.ordered.map((item) => item.opportunityId),
            portfolioIds: draft.portfolios.map((group) => group.portfolioId),
          },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.buildId, snapshot);
        return freezeDeepPortfolio({
          status: "OK",
          issues: [],
          portfolio: snapshot.portfolio,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "portfolio", message: "Invalid Metadata: the portfolio could not restate the groups." }]);
      }
    },
    getSnapshot: (buildId) => snapshots.get(buildId) ?? null,
  };
}
