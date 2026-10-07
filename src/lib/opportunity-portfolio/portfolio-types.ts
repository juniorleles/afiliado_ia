/**
 * Host record domain: portfolio types.
 *
 * A portfolio groups ranked opportunities by supplied attributes.
 * It does not measure a new value and it does not reorder the ranking.
 */
export const PORTFOLIO_STATUSES = ["OK", "REJECTED"] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

export const PORTFOLIO_ORIGINS = ["OBSERVED"] as const;
export type PortfolioOrigin = (typeof PORTFOLIO_ORIGINS)[number];

export const PORTFOLIO_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type PortfolioProvenance = (typeof PORTFOLIO_PROVENANCE)[number];

export const PORTFOLIO_TYPE_NAMES = ["health", "beauty", "finance", "software", "pets", "education", "custom"] as const;
export type PortfolioTypeName = (typeof PORTFOLIO_TYPE_NAMES)[number];

export const NAMED_PORTFOLIO_TYPES = ["health", "beauty", "finance", "software", "pets", "education"] as const;

export const GROUP_DIMENSIONS = [
  "category",
  "market",
  "language",
  "country",
  "priceRange",
  "brand",
  "merchant",
  "affiliateNetwork",
  "searchIntent",
] as const;
export type GroupDimension = (typeof GROUP_DIMENSIONS)[number];

export const PORTFOLIO_DIMENSIONS = [...GROUP_DIMENSIONS, "portfolioType"] as const;
export type PortfolioDimension = (typeof PORTFOLIO_DIMENSIONS)[number];

export interface PortfolioIssue {
  field: string;
  message: string;
}

export interface RankedOpportunityRef {
  position: number;
  opportunityId: string;
}

export interface PortfolioAssignment {
  portfolioType: PortfolioTypeName;
  value: string;
}

export interface OpportunityGrouping {
  opportunityId: string;
  category?: string | null;
  market?: string | null;
  language?: string | null;
  country?: string | null;
  priceRange?: string | null;
  brand?: string | null;
  merchant?: string | null;
  affiliateNetwork?: string | null;
  searchIntent?: string | null;
  portfolioAssignments?: readonly PortfolioAssignment[];
}

export interface PortfolioGroup {
  portfolioId: string;
  portfolioType: PortfolioTypeName;
  dimension: PortfolioDimension;
  value: string;
  opportunityIds: readonly string[];
}

export const PORTFOLIO_STATISTICS_KEYS = ["opportunityCount", "portfolioCount", "membershipCount"] as const;

export interface PortfolioStatistics {
  opportunityCount: number;
  portfolioCount: number;
  membershipCount: number;
}
