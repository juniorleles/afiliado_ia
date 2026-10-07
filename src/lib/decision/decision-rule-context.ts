/**
 * Decision Rule Framework: shared context.
 *
 * One immutable context is handed to every rule in a run. It carries the
 * Discovery candidate, the Opportunity analysis, the Traffic analysis, the
 * page (LP) analysis, execution metadata, runtime metadata, configuration,
 * and `extensions`, the room left for future inputs.
 *
 * It is created empty and holds only what the caller hands in, as deep copies:
 * nothing here reads a file, a database, the network, or any other engine, so
 * the context is never populated from outside data. Later changes to the
 * caller's objects never reach a rule, and a rule cannot change what other
 * rules see. A rule never mutates an analysis.
 *
 * The only outside references are type-only imports of the shapes of the
 * Discovery candidate and of the Opportunity and Traffic analyses. The page
 * analysis is an id holder only: no LP Builder type is imported.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { OpportunityAnalysis } from "../opportunity/opportunity-types";
import type { TrafficAnalysis } from "../traffic/traffic-types";
import { DecisionFrameworkError } from "./decision-rule-registry";
import { validateDecisionRuleContext } from "./decision-rule-validator";
import type { DecisionMetadata } from "./decision-types";

/** The page (LP) analysis as an id holder. Extra plain fields are allowed at runtime. */
export interface DecisionPageAnalysis {
  id: string;
}

export interface DecisionRuleContext {
  /** The Discovery candidate under analysis, or null when none is supplied. */
  readonly candidate: Readonly<DiscoveryCandidate> | null;
  /** The Opportunity analysis this decision follows, or null. */
  readonly opportunityAnalysis: Readonly<OpportunityAnalysis> | null;
  /** The Traffic analysis this decision follows, or null. */
  readonly trafficAnalysis: Readonly<TrafficAnalysis> | null;
  /** The page (LP) analysis this decision follows, or null. */
  readonly pageAnalysis: Readonly<DecisionPageAnalysis> | null;
  readonly executionMetadata: Readonly<DecisionMetadata>;
  readonly runtimeMetadata: Readonly<DecisionMetadata>;
  readonly configuration: Readonly<DecisionMetadata>;
  /** Reserved for future inputs. */
  readonly extensions: Readonly<DecisionMetadata>;
}

export type DecisionRuleContextInit = Partial<{
  candidate: DiscoveryCandidate | null;
  opportunityAnalysis: OpportunityAnalysis | null;
  trafficAnalysis: TrafficAnalysis | null;
  pageAnalysis: DecisionPageAnalysis | null;
  executionMetadata: DecisionMetadata;
  runtimeMetadata: DecisionMetadata;
  configuration: DecisionMetadata;
  extensions: DecisionMetadata;
}>;

/** Freezes an object and every object inside it. Returns the same value. */
export function freezeDeepDecisionRule<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) freezeDeepDecisionRule(inner);
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
 * defaults to empty. Throws DecisionFrameworkError for anything that is not
 * plain data, for metadata that is not flat, and for analysis records that
 * do not refer to the same candidate and analysis.
 */
export function createDecisionRuleContext(init: DecisionRuleContextInit = {}): DecisionRuleContext {
  const issues = validateDecisionRuleContext(init ?? {});
  if (issues.length > 0) throw new DecisionFrameworkError("Context is invalid.", issues);
  const source = init ?? {};
  return freezeDeepDecisionRule({
    candidate: source.candidate ? copyPlain(source.candidate) : null,
    opportunityAnalysis: source.opportunityAnalysis ? copyPlain(source.opportunityAnalysis) : null,
    trafficAnalysis: source.trafficAnalysis ? copyPlain(source.trafficAnalysis) : null,
    pageAnalysis: source.pageAnalysis ? copyPlain(source.pageAnalysis) : null,
    executionMetadata: copyPlain(source.executionMetadata ?? {}),
    runtimeMetadata: copyPlain(source.runtimeMetadata ?? {}),
    configuration: copyPlain(source.configuration ?? {}),
    extensions: copyPlain(source.extensions ?? {}),
  });
}
