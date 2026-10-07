/**
 * Host record domain: portfolio grouping.
 *
 * Places each ranked opportunity into the groups named by its supplied
 * attributes. Membership follows the supplied order. A value is copied,
 * not interpreted.
 */
import {
  GROUP_DIMENSIONS,
  NAMED_PORTFOLIO_TYPES,
  type OpportunityGrouping,
  type PortfolioGroup,
  type PortfolioStatistics,
  type PortfolioTypeName,
  type RankedOpportunityRef,
} from "./portfolio-types";

export interface PortfolioDraft {
  policyId: string;
  ordered: RankedOpportunityRef[];
  portfolios: PortfolioGroup[];
  statistics: PortfolioStatistics;
}

interface OpenGroup {
  portfolioId: string;
  portfolioType: PortfolioTypeName;
  dimension: PortfolioGroup["dimension"];
  value: string;
  opportunityIds: string[];
  seen: Set<string>;
}

function typeOf(token: string): PortfolioTypeName {
  return (NAMED_PORTFOLIO_TYPES as readonly string[]).includes(token) || token === "custom" ? (token as PortfolioTypeName) : "custom";
}

export function groupRankedOpportunities(policyId: string, ordered: readonly RankedOpportunityRef[], records: readonly OpportunityGrouping[]): PortfolioDraft {
  const byId = new Map(records.map((record) => [record.opportunityId, record]));
  const groups = new Map<string, OpenGroup>();
  let serial = 0;

  function place(dimension: OpenGroup["dimension"], value: string, opportunityId: string, portfolioType: PortfolioTypeName): void {
    const key = `${dimension}\n${value}`;
    let group = groups.get(key);
    if (group === undefined) {
      serial += 1;
      group = {
        portfolioId: `portfolio-${serial}`,
        portfolioType,
        dimension,
        value,
        opportunityIds: [],
        seen: new Set<string>(),
      };
      groups.set(key, group);
    }
    if (group.seen.has(opportunityId)) return;
    group.seen.add(opportunityId);
    group.opportunityIds.push(opportunityId);
  }

  for (const item of ordered) {
    const record = byId.get(item.opportunityId);
    if (record === undefined) continue;
    for (const dimension of GROUP_DIMENSIONS) {
      const raw = record[dimension];
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (value === "") continue;
      place(dimension, value, item.opportunityId, typeOf(value));
    }
    for (const assignment of record.portfolioAssignments ?? []) {
      place("portfolioType", assignment.value, item.opportunityId, assignment.portfolioType);
    }
  }

  const portfolios = [...groups.values()].map((group) => ({
    portfolioId: group.portfolioId,
    portfolioType: group.portfolioType,
    dimension: group.dimension,
    value: group.value,
    opportunityIds: group.opportunityIds,
  }));
  const copied = ordered.map((item) => ({ position: item.position, opportunityId: item.opportunityId }));
  return {
    policyId,
    ordered: copied,
    portfolios,
    statistics: {
      opportunityCount: copied.length,
      portfolioCount: portfolios.length,
      membershipCount: portfolios.reduce((sum, group) => sum + group.opportunityIds.length, 0),
    },
  };
}
