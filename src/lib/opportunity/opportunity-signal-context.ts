/**
 * Opportunity Signal Framework: shared context.
 *
 * One immutable context is handed to every signal in a run. It is created
 * empty: nothing populates the candidate, imported metadata, configuration, or
 * runtime information yet. `extensions` is the room left for future inputs.
 *
 * The only outside reference is a type-only import of the Discovery candidate.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { OpportunityMetadata } from "./opportunity-types";

export interface SignalContext {
  /** The Discovery candidate under analysis, or null when none is supplied. */
  readonly candidate: Readonly<DiscoveryCandidate> | null;
  readonly importedMetadata: Readonly<OpportunityMetadata>;
  readonly executionMetadata: Readonly<OpportunityMetadata>;
  readonly configuration: Readonly<OpportunityMetadata>;
  readonly runtime: Readonly<OpportunityMetadata>;
  /** Reserved for future inputs. */
  readonly extensions: Readonly<OpportunityMetadata>;
}

export type SignalContextInit = Partial<{
  candidate: DiscoveryCandidate | null;
  importedMetadata: OpportunityMetadata;
  executionMetadata: OpportunityMetadata;
  configuration: OpportunityMetadata;
  runtime: OpportunityMetadata;
  extensions: OpportunityMetadata;
}>;

/** Freezes an object and every object inside it. Returns the same value. */
export function freezeDeep<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) freezeDeep(inner);
  }
  return value;
}

/**
 * Builds a frozen context from copies of the inputs, so later changes to the
 * caller's objects never reach a signal. Every field defaults to empty.
 */
export function createSignalContext(init: SignalContextInit = {}): SignalContext {
  return freezeDeep({
    candidate: init.candidate ? { ...init.candidate } : null,
    importedMetadata: { ...(init.importedMetadata ?? {}) },
    executionMetadata: { ...(init.executionMetadata ?? {}) },
    configuration: { ...(init.configuration ?? {}) },
    runtime: { ...(init.runtime ?? {}) },
    extensions: { ...(init.extensions ?? {}) },
  });
}
