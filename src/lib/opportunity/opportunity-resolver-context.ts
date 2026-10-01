/**
 * Opportunity Resolver: execution context.
 *
 * Everything one analysis reads, in one immutable object: the Discovery
 * candidate, the Evidence Context, and the execution metadata, runtime
 * metadata, and configuration of the run. It is created from copies, so later
 * changes to the caller's objects never reach the pipeline, and it is frozen,
 * so nothing downstream can change it.
 *
 * Creation never validates and never throws. A context with nothing in it is
 * legal to create and is refused by the validator, which is where "missing
 * candidate" and "missing context" are decided.
 *
 * The only outside references are type-only imports of the Discovery candidate
 * and the shared evidence context.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { OpportunityMetadata } from "./opportunity-types";
import { createSignalContext, type SignalContext } from "./opportunity-signal-context";
import { cloneFrozenData, type EvidenceContext } from "./providers/evidence-provider-context";

export interface OpportunityExecutionContext {
  /** The Discovery candidate under analysis, or null when none was supplied. */
  readonly candidate: Readonly<DiscoveryCandidate> | null;
  /** The Evidence Context the providers are resolved against, or null when none was supplied. */
  readonly evidenceContext: EvidenceContext | null;
  readonly executionMetadata: Readonly<OpportunityMetadata>;
  readonly runtimeMetadata: Readonly<OpportunityMetadata>;
  readonly configuration: Readonly<OpportunityMetadata>;
}

export type OpportunityExecutionContextInit = Partial<{
  candidate: DiscoveryCandidate | null;
  evidenceContext: EvidenceContext | null;
  executionMetadata: OpportunityMetadata;
  runtimeMetadata: OpportunityMetadata;
  configuration: OpportunityMetadata;
}>;

/** Builds a frozen context from copies of the inputs. Every missing member is empty or null. */
export function createOpportunityExecutionContext(init: OpportunityExecutionContextInit | null | undefined = {}): OpportunityExecutionContext {
  const source = init ?? {};
  return Object.freeze({
    candidate: source.candidate ? cloneFrozenData(source.candidate) : null,
    evidenceContext: source.evidenceContext ? cloneFrozenData(source.evidenceContext) : null,
    executionMetadata: cloneFrozenData(source.executionMetadata ?? {}),
    runtimeMetadata: cloneFrozenData(source.runtimeMetadata ?? {}),
    configuration: cloneFrozenData(source.configuration ?? {}),
  });
}

/**
 * The context every signal receives. The Evidence Context's metadata and
 * extensions become the signal's imported metadata and extensions, so a
 * signal that builds its own evidence context from the signal context
 * reproduces the one the run was resolved against.
 */
export function toSignalContext(context: OpportunityExecutionContext): SignalContext {
  return createSignalContext({
    candidate: context.candidate as DiscoveryCandidate | null,
    importedMetadata: { ...(context.evidenceContext?.metadata ?? {}) },
    executionMetadata: { ...context.executionMetadata },
    configuration: { ...context.configuration },
    runtime: { ...context.runtimeMetadata },
    extensions: { ...(context.evidenceContext?.extensions ?? {}) },
  });
}
