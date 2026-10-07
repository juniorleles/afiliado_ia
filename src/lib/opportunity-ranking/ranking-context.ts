/**
 * Host record domain: read-only opportunity ranking context.
 *
 * Interface only. One ranking is given opportunity metrics and a policy.
 * It does not request a page.
 */
export type RankingMetadata = Record<string, string | number | boolean | null>;

export const RANKING_CONTEXT_MEMBERS = [
  "opportunities",
  "policy",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

/**
 * Read-only bundle one ranking may be given.
 * Nothing here is written back.
 */
export interface RankingContext {
  opportunities?: readonly unknown[];
  policy?: unknown;
  executionMetadata?: RankingMetadata;
  runtimeMetadata?: RankingMetadata;
  configuration?: RankingMetadata;
}
