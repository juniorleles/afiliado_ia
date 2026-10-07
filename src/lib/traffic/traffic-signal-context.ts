/**
 * Traffic Signal Framework: shared context.
 *
 * One immutable context is handed to every signal in a run. It carries the
 * Discovery candidate, the Opportunity analysis, the Opportunity explanation,
 * execution metadata, runtime metadata, configuration, and `extensions`, the
 * room left for future inputs.
 *
 * It is created empty and holds only what the caller hands in, as deep copies:
 * nothing here reads a file, a database, the network, or any other engine, so
 * the context is never populated from outside data. Later changes to the
 * caller's objects never reach a signal, and a signal cannot change what other
 * signals see.
 *
 * The only outside references are type-only imports of the shapes of the
 * Discovery candidate and of the Opportunity analysis and explanation.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import { TrafficFrameworkError } from "./traffic-signal-registry";
import { validateTrafficSignalContext } from "./traffic-signal-validator";
import type { TrafficMetadata } from "./traffic-types";

export interface TrafficSignalContext {
  /** The Discovery candidate under analysis, or null when none is supplied. */
  readonly candidate: Readonly<DiscoveryCandidate> | null;
  /** The Opportunity analysis the traffic analysis follows, or null. */
  readonly opportunityAnalysis: Readonly<ResolvedOpportunityAnalysis> | null;
  /** The Opportunity explanation of that analysis, or null. */
  readonly opportunityExplanation: Readonly<OpportunityExplanation> | null;
  readonly executionMetadata: Readonly<TrafficMetadata>;
  readonly runtimeMetadata: Readonly<TrafficMetadata>;
  readonly configuration: Readonly<TrafficMetadata>;
  /** Reserved for future inputs. */
  readonly extensions: Readonly<TrafficMetadata>;
}

export type TrafficSignalContextInit = Partial<{
  candidate: DiscoveryCandidate | null;
  opportunityAnalysis: ResolvedOpportunityAnalysis | null;
  opportunityExplanation: OpportunityExplanation | null;
  executionMetadata: TrafficMetadata;
  runtimeMetadata: TrafficMetadata;
  configuration: TrafficMetadata;
  extensions: TrafficMetadata;
}>;

/** Freezes an object and every object inside it. Returns the same value. */
export function freezeDeepTraffic<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) freezeDeepTraffic(inner);
  }
  return value;
}

/** A deep copy of plain data. The caller has checked that the data is plain. */
function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlain(inner)])) as T;
  }
  return value;
}

/**
 * Builds a frozen context from deep copies of the inputs. Every member
 * defaults to empty. Throws TrafficFrameworkError for anything that is not
 * plain data, for metadata that is not flat, and for Opportunity records that
 * do not refer to the same candidate and analysis.
 */
export function createTrafficSignalContext(init: TrafficSignalContextInit = {}): TrafficSignalContext {
  const issues = validateTrafficSignalContext(init ?? {});
  if (issues.length > 0) throw new TrafficFrameworkError("Context is invalid.", issues);
  const source = init ?? {};
  return freezeDeepTraffic({
    candidate: source.candidate ? copyPlain(source.candidate) : null,
    opportunityAnalysis: source.opportunityAnalysis ? copyPlain(source.opportunityAnalysis) : null,
    opportunityExplanation: source.opportunityExplanation ? copyPlain(source.opportunityExplanation) : null,
    executionMetadata: copyPlain(source.executionMetadata ?? {}),
    runtimeMetadata: copyPlain(source.runtimeMetadata ?? {}),
    configuration: copyPlain(source.configuration ?? {}),
    extensions: copyPlain(source.extensions ?? {}),
  });
}
