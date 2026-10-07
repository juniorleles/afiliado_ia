/**
 * Opportunity Engine: result contract.
 *
 * Interface only. It states what an analysis hands back. No scale, range, or
 * formula is defined here: `score` and `confidence` are null until a later
 * step defines and computes them.
 */
import type { OpportunitySignal } from "./opportunity-types";

export interface OpportunityResult {
  /** Not computed by this architecture. */
  score: number | null;
  /** Not computed by this architecture. */
  confidence: number | null;
  /** The signals the analysis considered. */
  signals: OpportunitySignal[];
  warnings: string[];
  recommendations: string[];
}
