/**
 * Host record domain: read-only recommendation context.
 *
 * Interface only. One run is given a ranking, a portfolio, metrics, and a
 * policy. It does not request a page.
 */
export type RecommendationMetadata = Record<string, string | number | boolean | null>;

export const RECOMMENDATION_CONTEXT_MEMBERS = [
  "ranking",
  "portfolio",
  "metrics",
  "policy",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one recommendation run may be given.
 * Nothing here is written back.
 */
export interface RecommendationContext {
  ranking?: unknown;
  portfolio?: unknown;
  metrics?: readonly unknown[];
  policy?: unknown;
  executionMetadata?: RecommendationMetadata;
  runtimeMetadata?: RecommendationMetadata;
  configuration?: RecommendationMetadata;
}
