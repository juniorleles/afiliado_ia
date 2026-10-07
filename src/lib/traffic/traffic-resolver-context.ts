/**
 * Traffic Resolver: execution context.
 *
 * Everything one traffic analysis reads, in one immutable object: the Discovery
 * candidate, the Opportunity analysis, an optional Opportunity explanation, and
 * the execution metadata, runtime metadata, and configuration of the run. It is
 * created from copies, so later changes to the caller's objects never reach the
 * pipeline, and it is frozen, so nothing downstream can change it.
 *
 * Creation never validates and never throws. A context with nothing in it is
 * legal to create and is refused by the validator, which is where "missing
 * candidate" and "missing Opportunity analysis" are decided.
 *
 * The only outside references are type-only imports of the Discovery candidate
 * and of the Opportunity analysis and explanation.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";
import { createTrafficSignalContext, freezeDeepTraffic, type TrafficSignalContext } from "./traffic-signal-context";
import type { TrafficMetadata } from "./traffic-types";

export interface TrafficExecutionContext {
  /** The Discovery candidate under analysis, or null when none was supplied. */
  readonly candidate: Readonly<DiscoveryCandidate> | null;
  /** The Opportunity analysis this traffic analysis follows, or null. */
  readonly opportunityAnalysis: Readonly<ResolvedOpportunityAnalysis> | null;
  /** The Opportunity explanation of that analysis, or null. */
  readonly opportunityExplanation: Readonly<OpportunityExplanation> | null;
  readonly executionMetadata: Readonly<TrafficMetadata>;
  readonly runtimeMetadata: Readonly<TrafficMetadata>;
  readonly configuration: Readonly<TrafficMetadata>;
}

export type TrafficExecutionContextInit = Partial<{
  candidate: DiscoveryCandidate | null;
  opportunityAnalysis: ResolvedOpportunityAnalysis | null;
  opportunityExplanation: OpportunityExplanation | null;
  executionMetadata: TrafficMetadata;
  runtimeMetadata: TrafficMetadata;
  configuration: TrafficMetadata;
}>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Copies the plain containers in a value and freezes the copies. Anything that
 * is not a plain container is kept by reference and is never frozen, so a
 * caller's own objects are never touched.
 */
export function cloneFrozenTraffic<T>(value: T): T {
  const copies = new WeakMap<object, unknown>();
  const copy = (current: unknown): unknown => {
    if (typeof current !== "object" || current === null) return current;
    if (copies.has(current)) return copies.get(current);
    if (Array.isArray(current)) {
      const list: unknown[] = [];
      copies.set(current, list);
      for (const item of current) list.push(copy(item));
      return Object.freeze(list);
    }
    if (!isPlainObject(current)) return current;
    const record: Record<string, unknown> = {};
    copies.set(current, record);
    for (const [key, inner] of Object.entries(current)) {
      if (inner !== undefined) record[key] = copy(inner);
    }
    return Object.freeze(record);
  };
  return copy(value) as T;
}

/** True when the value and every object inside it is frozen. Cycles are handled. */
export function isDeepFrozenTraffic(value: unknown): boolean {
  const seen = new Set<object>();
  const visit = (current: unknown): boolean => {
    if (typeof current !== "object" || current === null) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    if (!Object.isFrozen(current)) return false;
    return Object.values(current).every(visit);
  };
  return visit(value);
}

/** Builds a frozen context from copies of the inputs. Every missing member is empty or null. */
export function createTrafficExecutionContext(init: TrafficExecutionContextInit | null | undefined = {}): TrafficExecutionContext {
  const source = init ?? {};
  return freezeDeepTraffic({
    candidate: source.candidate ? cloneFrozenTraffic(source.candidate) : null,
    opportunityAnalysis: source.opportunityAnalysis ? cloneFrozenTraffic(source.opportunityAnalysis) : null,
    opportunityExplanation: source.opportunityExplanation ? cloneFrozenTraffic(source.opportunityExplanation) : null,
    executionMetadata: cloneFrozenTraffic(source.executionMetadata ?? {}),
    runtimeMetadata: cloneFrozenTraffic(source.runtimeMetadata ?? {}),
    configuration: cloneFrozenTraffic(source.configuration ?? {}),
  });
}

/** The context every traffic signal receives for this run. */
export function toTrafficSignalContext(context: TrafficExecutionContext): TrafficSignalContext {
  return createTrafficSignalContext({
    candidate: context.candidate as DiscoveryCandidate | null,
    opportunityAnalysis: context.opportunityAnalysis as ResolvedOpportunityAnalysis | null,
    opportunityExplanation: context.opportunityExplanation as OpportunityExplanation | null,
    executionMetadata: { ...context.executionMetadata },
    runtimeMetadata: { ...context.runtimeMetadata },
    configuration: { ...context.configuration },
    extensions: {},
  });
}
