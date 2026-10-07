/**
 * Competition Signal: inputs and result.
 *
 * The Competition Signal reports which parts of the competition picture the
 * available evidence covers. It reads evidence that came through the Evidence
 * Provider Framework and the Discovery candidate, and nothing else. It
 * produces no score, no ranking, and no recommendation.
 *
 * A dimension being missing means no evidence for it was found. It does not
 * mean the competition is absent.
 *
 * Every outside reference here is a type-only import.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { MergedEvidence } from "./providers/evidence-provider-resolver";
import type { SignalOutput, SignalResultStatus } from "./opportunity-signal-contract";
import type { OpportunityMetadata } from "./opportunity-types";

/** What the signal checks for evidence. Presence only: nothing here is counted into a judgement. */
export const COMPETITION_DIMENSIONS = [
  "SEARCH_PRESENCE",
  "MARKETPLACE_PRESENCE",
  "BRAND_STRENGTH",
  "AFFILIATE_AVAILABILITY",
  "CONTENT_SATURATION",
  "LANDING_PAGE_AVAILABILITY",
  "PRICING_VISIBILITY",
  "REVIEW_AVAILABILITY",
  "AUTHORITY_PRESENCE",
  "ADVERTISING_PRESENCE",
] as const;
export type CompetitionDimension = (typeof COMPETITION_DIMENSIONS)[number];

/** Whether the evidence covers a dimension. */
export const COMPETITION_DIMENSION_STATES = ["AVAILABLE", "MISSING"] as const;
export type CompetitionDimensionState = (typeof COMPETITION_DIMENSION_STATES)[number];

/**
 * Evidence from the Evidence Provider Framework, plus the candidate it is
 * about. The evidence is the framework's merged output: the signal never
 * reaches a platform module itself.
 */
export interface CompetitionInputs {
  /** The Discovery candidate under analysis. */
  candidate: Readonly<DiscoveryCandidate>;
  evidence: MergedEvidence;
  /** The dimensions to check, in any order, without repeats. Defaults to all of them. */
  dimensions?: readonly CompetitionDimension[];
  /** Flat passthrough, copied into the result metadata as `input.<key>`. */
  metadata?: OpportunityMetadata;
}

export interface CompetitionResult {
  status: SignalResultStatus;
  /**
   * Share of the checked dimensions the evidence covers, from 0 to 1; null when
   * it covers none. It describes how much of the picture is evidenced, not how
   * strong the competition is, and is not a score.
   */
  confidence: number | null;
  availableDimensions: CompetitionDimension[];
  missingDimensions: CompetitionDimension[];
  warnings: string[];
  /** Flat. Arrays are comma-joined. */
  metadata: OpportunityMetadata;
  /** Milliseconds spent analyzing. */
  executionTime: number;
}

/** The framework's view of a result. The executor adds the signal id and timing. */
export function competitionResultToSignalOutput(result: CompetitionResult): SignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
