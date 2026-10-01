/**
 * Traffic Resolver: execution plan.
 *
 * What a run will do, worked out from the signal registry alone and before
 * anything executes: the stages, every registered signal with the members the
 * Signal Contract exposes, and the order the enabled ones will run in. Building
 * a plan runs no signal and asks no signal anything beyond those members.
 *
 * The plan reports problems with the declared dependencies and never repairs
 * them: nothing is registered, enabled, or reordered to make a plan valid.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficSignalCategory } from "./traffic-types";
import type { TrafficSignalEntry } from "./traffic-signal-contract";
import { freezeDeepTraffic } from "./traffic-signal-context";
import { resolveTrafficSignalOrder } from "./traffic-signal-resolver";

/** The fixed flow of every run. */
export const TRAFFIC_PIPELINE_STAGES = [
  "RESOLVE_CANDIDATE",
  "RESOLVE_OPPORTUNITY_ANALYSIS",
  "RESOLVE_TRAFFIC_SIGNALS",
  "VALIDATE_RESULTS",
  "AGGREGATE_RESULTS",
  "BUILD_ANALYSIS",
] as const;
export type TrafficPipelineStage = (typeof TRAFFIC_PIPELINE_STAGES)[number];

/** One registered signal, as the Signal Contract describes it. */
export interface PlannedTrafficSignal {
  signalId: string;
  name: string;
  version: string;
  category: TrafficSignalCategory;
  priority: number;
  enabled: boolean;
  requires: readonly string[];
  optional: readonly string[];
  /** Zero-based place in the run order; null for a signal that will not run. */
  position: number | null;
}

export interface TrafficExecutionPlan {
  readonly stages: readonly TrafficPipelineStage[];
  /** Every registered signal, in registry order. */
  readonly signals: readonly PlannedTrafficSignal[];
  /** Enabled signal ids in run order; empty when the dependencies are invalid. */
  readonly order: readonly string[];
  /** Registered signals that will not run because they are disabled. */
  readonly disabled: readonly string[];
  /** Problems with the declared dependencies of the enabled signals. */
  readonly issues: readonly TrafficIssue[];
}

/** Plans a run from the registry's entries. Pure: it reads only Signal Contract members. */
export function buildTrafficExecutionPlan(entries: readonly TrafficSignalEntry[]): TrafficExecutionPlan {
  const { order, issues } = resolveTrafficSignalOrder(entries);
  const signals: PlannedTrafficSignal[] = entries.map((entry) => {
    const position = order.indexOf(entry.id);
    return {
      signalId: entry.id,
      name: entry.module.name,
      version: entry.module.version,
      category: entry.module.category,
      priority: entry.module.priority,
      enabled: entry.enabled,
      requires: [...entry.module.dependencies.requires],
      optional: [...entry.module.dependencies.optional],
      position: position === -1 ? null : position,
    };
  });
  return freezeDeepTraffic({
    stages: [...TRAFFIC_PIPELINE_STAGES],
    signals,
    order,
    disabled: entries.filter((entry) => !entry.enabled).map((entry) => entry.id),
    issues,
  });
}
