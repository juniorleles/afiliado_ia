/**
 * Opportunity Engine: signal registry contract.
 *
 * Interface only. The registry is the single list of signal definitions the
 * engine may use. No implementation ships in this step.
 */
import type { OpportunityIssue } from "./opportunity-validator";
import type {
  OpportunitySignal,
  OpportunitySignalCategory,
  OpportunitySignalStatus,
} from "./opportunity-types";

export interface OpportunitySignalFilter {
  category?: OpportunitySignalCategory;
  status?: OpportunitySignalStatus;
}

export interface OpportunitySignalRegistry {
  /** Adds a signal. Rejects an invalid signal or a duplicate id. */
  register(signal: OpportunitySignal): OpportunitySignal;
  /** Marks a registered signal ENABLED. */
  enable(id: string): OpportunitySignal;
  /** Marks a registered signal DISABLED. */
  disable(id: string): OpportunitySignal;
  get(id: string): OpportunitySignal | null;
  list(filter?: OpportunitySignalFilter): OpportunitySignal[];
  /** Reports problems with a signal without registering it. */
  validate(signal: unknown): OpportunityIssue[];
}
