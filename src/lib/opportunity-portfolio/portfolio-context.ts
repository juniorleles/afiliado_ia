/**
 * Host record domain: read-only portfolio context.
 *
 * Interface only. One build is given a ranking and grouping attributes.
 * It does not request a page.
 */
export type PortfolioMetadata = Record<string, string | number | boolean | null>;

export const PORTFOLIO_CONTEXT_MEMBERS = [
  "ranking",
  "opportunities",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one portfolio build may be given.
 * Nothing here is written back.
 */
export interface PortfolioContext {
  ranking?: unknown;
  opportunities?: readonly unknown[];
  executionMetadata?: PortfolioMetadata;
  runtimeMetadata?: PortfolioMetadata;
  configuration?: PortfolioMetadata;
}
