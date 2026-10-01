/**
 * Traffic Explanation Engine: input and output shapes.
 *
 * The input is the Resolver's analysis and nothing else. The analysis is a
 * snapshot of the run: it holds the signal results, what each signal is called
 * and which category it belongs to, and the execution and pipeline metadata.
 * So explaining needs no signal to run. The engine reads none of ProductFacts.
 *
 * The output has exactly the fields below. There is no score, ranking, or
 * recommendation, and the validator rejects any extra field.
 */
import type { TrafficMetadata } from "./traffic-types";
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficSignalResultStatus } from "./traffic-signal-contract";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import type { TrafficExplanationItem, TrafficExplanationSection } from "./traffic-explanation-section";

/** The whole input: the analysis a Resolver run produced. */
export type TrafficExplanationInput = ResolvedTrafficAnalysis;

export const TRAFFIC_SIGNAL_BREAKDOWN_STATUSES = ["COMPLETED", "FAILED", "SKIPPED", "NOT_RUN"] as const;
export type TrafficSignalBreakdownStatus = TrafficSignalResultStatus | "NOT_RUN";

export interface TrafficSignalBreakdownEntry {
  signalId: string;
  name: string;
  category: string | null;
  /** NOT_RUN: registered, but no result exists (disabled, or the run did not reach it). */
  status: TrafficSignalBreakdownStatus;
  /** As the signal reported it. Not combined and not interpreted. */
  confidence: number | null;
  executionTime: number | null;
  strengthCount: number;
  weaknessCount: number;
  missingCount: number;
  warningCount: number;
  errorCount: number;
  /** One sentence restating how the signal ended. */
  statement: string;
  /** Notes the signal itself attached about its evidence, such as how provenance should be read. */
  notes: string[];
}

export const TRAFFIC_EXPLANATION_KEYS = [
  "analysisId",
  "candidateId",
  "summary",
  "sectionBreakdown",
  "strengths",
  "weaknesses",
  "warnings",
  "missingInformation",
  "errors",
  "signalBreakdown",
  "metadata",
  "executionTime",
] as const;

export interface TrafficExplanation {
  analysisId: string;
  candidateId: string | null;
  /** The short summary: one paragraph, no judgement. */
  summary: string;
  /** The eight sections, in a fixed order. */
  sectionBreakdown: TrafficExplanationSection[];
  strengths: TrafficExplanationItem[];
  weaknesses: TrafficExplanationItem[];
  warnings: TrafficExplanationItem[];
  missingInformation: TrafficExplanationItem[];
  /** Errors signals or the run reported. Kept apart from warnings. */
  errors: TrafficExplanationItem[];
  signalBreakdown: TrafficSignalBreakdownEntry[];
  /** Flat. */
  metadata: TrafficMetadata;
  /** Milliseconds this explanation took to build. */
  executionTime: number;
}

export const TRAFFIC_EXPLANATION_OUTCOME_STATUSES = ["EXPLAINED", "REJECTED"] as const;
export type TrafficExplanationOutcomeStatus = (typeof TRAFFIC_EXPLANATION_OUTCOME_STATUSES)[number];

/** What the engine hands back. It never throws: a rejected input is described, not explained. */
export interface TrafficExplanationOutcome {
  status: TrafficExplanationOutcomeStatus;
  explanation: TrafficExplanation | null;
  issues: TrafficIssue[];
}

/** Said at the end of every detailed explanation, and carried in the metadata. */
export const TRAFFIC_EXPLANATION_SCOPE_NOTE =
  "This explanation restates what the signals reported. It is not a score, a ranking, or a recommendation.";
