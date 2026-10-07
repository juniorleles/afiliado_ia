/**
 * Opportunity Explanation Engine: input and output shapes.
 *
 * The input is the Resolver's analysis and nothing else. The analysis is a
 * snapshot of the run: it holds the signal results, what each signal is called
 * and which category it belongs to, the provider results, and the execution
 * and pipeline metadata. So explaining needs no signal to run and no provider
 * to be resolved. There is no ProductFacts in it, and the engine reads none.
 *
 * The output has exactly the fields below. There is no score, ranking, or
 * recommendation, and the validator rejects any extra field.
 */
import type { OpportunityMetadata } from "./opportunity-types";
import type { OpportunityIssue } from "./opportunity-validator";
import type { SignalResultStatus } from "./opportunity-signal-contract";
import type { ResolvedOpportunityAnalysis } from "./opportunity-resolver-analysis";
import type { ExplanationItem, ExplanationSection } from "./opportunity-explanation-section";

/** The whole input: the analysis a Resolver run produced. */
export type OpportunityExplanationInput = ResolvedOpportunityAnalysis;

export const SIGNAL_BREAKDOWN_STATUSES = ["COMPLETED", "FAILED", "SKIPPED", "NOT_RUN"] as const;
export type SignalBreakdownStatus = SignalResultStatus | "NOT_RUN";

export interface SignalBreakdownEntry {
  signalId: string;
  name: string;
  category: string | null;
  /** NOT_RUN: registered, but no result exists (disabled, or the run did not reach it). */
  status: SignalBreakdownStatus;
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

export const EXPLANATION_KEYS = [
  "analysisId",
  "candidateId",
  "summary",
  "strengths",
  "weaknesses",
  "warnings",
  "errors",
  "missingEvidence",
  "signalBreakdown",
  "sections",
  "metadata",
  "executionTime",
] as const;

export interface OpportunityExplanation {
  analysisId: string;
  candidateId: string | null;
  /** The short summary: one paragraph, no judgement. */
  summary: string;
  strengths: ExplanationItem[];
  weaknesses: ExplanationItem[];
  warnings: ExplanationItem[];
  /** Errors signals or the run reported. Kept apart from warnings. */
  errors: ExplanationItem[];
  missingEvidence: ExplanationItem[];
  signalBreakdown: SignalBreakdownEntry[];
  /** The eight sections, in a fixed order. */
  sections: ExplanationSection[];
  /** Flat. */
  metadata: OpportunityMetadata;
  /** Milliseconds this explanation took to build. */
  executionTime: number;
}

export const EXPLANATION_OUTCOME_STATUSES = ["EXPLAINED", "REJECTED"] as const;
export type ExplanationOutcomeStatus = (typeof EXPLANATION_OUTCOME_STATUSES)[number];

/** What the engine hands back. It never throws: a rejected input is described, not explained. */
export interface ExplanationOutcome {
  status: ExplanationOutcomeStatus;
  explanation: OpportunityExplanation | null;
  issues: OpportunityIssue[];
}

/** Said at the end of every detailed explanation, and carried in the metadata. */
export const EXPLANATION_SCOPE_NOTE =
  "This explanation restates what the signals reported. It is not a score, a ranking, or a recommendation about the candidate.";
