/**
 * Opportunity Signal Framework: signal contract.
 *
 * What an independent signal module must expose to be plugged into the
 * pipeline. The framework only calls these members; it never interprets what a
 * signal measures. No signal ships with the framework, and no score exists.
 */
import type { OpportunityIssue } from "./opportunity-validator";
import type { SignalContext } from "./opportunity-signal-context";
import type { OpportunityMetadata, OpportunitySignalCategory } from "./opportunity-types";

/** How a signal run ended. SKIPPED means analyze() was not run to completion. */
export const SIGNAL_RESULT_STATUSES = ["COMPLETED", "FAILED", "SKIPPED"] as const;
export type SignalResultStatus = (typeof SIGNAL_RESULT_STATUSES)[number];

/**
 * Relations to other signals by id. The framework validates them and never
 * resolves them on its own: nothing is registered or enabled automatically.
 */
export interface SignalDependencies {
  /** Must be registered and enabled, and run first. */
  requires: readonly string[];
  /** Run first when registered and enabled; otherwise ignored. */
  optional: readonly string[];
  /** Must not be enabled at the same time. */
  conflicts: readonly string[];
}

/** What analyze() returns. The executor adds the signal id and the timing. */
export interface SignalOutput {
  status: SignalResultStatus;
  /** Not interpreted by the framework. */
  confidence: number | null;
  metadata: OpportunityMetadata;
  warnings: string[];
  errors: string[];
}

/** What the pipeline collects for each signal. Carries no score. */
export interface SignalResult extends SignalOutput {
  signalId: string;
  /** Milliseconds spent in supportsCandidate, validate, and analyze. */
  executionTime: number;
}

/** Results of already-run signals this signal declared in requires or optional. */
export type SignalUpstream = Readonly<Record<string, Readonly<SignalResult>>>;

/** A registered signal and whether it is currently enabled. Changed only by the registry. */
export interface SignalEntry {
  readonly id: string;
  readonly module: OpportunitySignalModule;
  readonly enabled: boolean;
}

export interface OpportunitySignalModule {
  readonly id: string;
  readonly name: string;
  /** Semantic version, for example "1.0.0". */
  readonly version: string;
  readonly category: OpportunitySignalCategory;
  /** Whether the signal starts enabled when registered. */
  readonly enabled: boolean;
  /** Higher runs first among signals with no dependency between them. */
  readonly priority: number;
  readonly dependencies: SignalDependencies;
  /** False skips the signal for this context. */
  supportsCandidate(context: SignalContext): boolean;
  analyze(context: SignalContext, upstream: SignalUpstream): SignalOutput | Promise<SignalOutput>;
  /** Problems that stop analyze() from running on this context; empty when valid. */
  validate(context: SignalContext): OpportunityIssue[];
}
