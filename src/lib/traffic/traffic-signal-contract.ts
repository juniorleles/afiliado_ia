/**
 * Traffic Signal Framework: signal contract.
 *
 * What an independent traffic-analysis signal module must expose to be plugged
 * into the pipeline. The framework only calls these members; it never
 * interprets what a signal measures. No signal ships with the framework, and
 * no score exists.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficSignalContext } from "./traffic-signal-context";
import type { TrafficMetadata, TrafficSignalCategory } from "./traffic-types";

/** How a signal run ended. SKIPPED means analyze() was not run to completion. */
export const TRAFFIC_SIGNAL_RESULT_STATUSES = ["COMPLETED", "FAILED", "SKIPPED"] as const;
export type TrafficSignalResultStatus = (typeof TRAFFIC_SIGNAL_RESULT_STATUSES)[number];

/**
 * Relations to other signals by id. The framework validates them and never
 * resolves them on its own: nothing is registered or enabled automatically.
 */
export interface TrafficSignalDependencies {
  /** Must be registered and enabled, and run first. */
  requires: readonly string[];
  /** Run first when registered and enabled; otherwise ignored. */
  optional: readonly string[];
  /** Must not be enabled at the same time. */
  conflicts: readonly string[];
}

/** What analyze() returns. The executor adds the signal id and the timing. */
export interface TrafficSignalOutput {
  status: TrafficSignalResultStatus;
  /** Not interpreted by the framework. */
  confidence: number | null;
  metadata: TrafficMetadata;
  warnings: string[];
  errors: string[];
}

/** What the pipeline collects for each signal. Carries no score and no recommendation. */
export interface TrafficSignalResult extends TrafficSignalOutput {
  signalId: string;
  /** Milliseconds spent in supportsAnalysis, validate, and analyze. */
  executionTime: number;
}

/** Results of already-run signals this signal declared in requires or optional. */
export type TrafficSignalUpstream = Readonly<Record<string, Readonly<TrafficSignalResult>>>;

/** A registered signal and whether it is currently enabled. Changed only by the registry. */
export interface TrafficSignalEntry {
  readonly id: string;
  readonly module: TrafficSignalModule;
  readonly enabled: boolean;
}

export interface TrafficSignalModule {
  readonly id: string;
  readonly name: string;
  /** Semantic version, for example "1.0.0". */
  readonly version: string;
  readonly category: TrafficSignalCategory;
  /** Whether the signal starts enabled when registered. */
  readonly enabled: boolean;
  /** Higher runs first among signals with no dependency between them. */
  readonly priority: number;
  readonly dependencies: TrafficSignalDependencies;
  /** False skips the signal for this context. */
  supportsAnalysis(context: TrafficSignalContext): boolean;
  analyze(context: TrafficSignalContext, upstream: TrafficSignalUpstream): TrafficSignalOutput | Promise<TrafficSignalOutput>;
  /** Problems that stop analyze() from running on this context; empty when valid. */
  validate(context: TrafficSignalContext): TrafficIssue[];
}
