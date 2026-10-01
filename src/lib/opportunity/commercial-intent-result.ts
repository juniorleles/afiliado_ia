/**
 * Commercial Intent Signal: inputs and result.
 *
 * The Commercial Intent Signal reports which parts of the commercial-intent
 * picture the available evidence covers. It reads evidence that came through
 * the Evidence Provider Framework and the Discovery candidate, and nothing
 * else. It produces no score, no ranking, and no recommendation.
 *
 * It is channel-agnostic: a dimension is covered when any provider supplied an
 * observation for it, whichever channel the provider speaks for. The channel
 * is provenance and is reported, never weighed.
 *
 * A dimension being missing means no evidence for it was found. It does not
 * mean there is no commercial intent.
 *
 * Every outside reference here is a type-only import.
 */
import type { DiscoveryCandidate } from "../discovery/discovery-types";
import type { CommercialIntentEvidence } from "./commercial-intent-provider-contract";
import type { SignalOutput, SignalResultStatus } from "./opportunity-signal-contract";
import type { OpportunityMetadata } from "./opportunity-types";

/** What the signal checks for evidence. Presence only: nothing here is counted into a judgement. */
export const COMMERCIAL_INTENT_DIMENSIONS = [
  "PURCHASE_INTENT",
  "PROBLEM_AWARENESS",
  "SOLUTION_AWARENESS",
  "OFFER_VISIBILITY",
  "PRICE_VISIBILITY",
  "CONSUMER_TRUST",
  "MARKET_DEMAND",
  "BUYER_READINESS",
  "RECURRING_PURCHASE_POTENTIAL",
  "UPSELL_POTENTIAL",
] as const;
export type CommercialIntentDimension = (typeof COMMERCIAL_INTENT_DIMENSIONS)[number];

/**
 * What an observation tagged with a dimension is evidence about. This is the
 * definition providers write against. Every dimension is direction-neutral:
 * evidence about trust may be evidence of trust or of distrust, and the signal
 * does not tell the two apart.
 */
export const COMMERCIAL_INTENT_DIMENSION_MEANINGS: Readonly<Record<CommercialIntentDimension, string>> = {
  PURCHASE_INTENT: "evidence that people look to buy this kind of product",
  PROBLEM_AWARENESS: "evidence that people recognise the problem the product addresses",
  SOLUTION_AWARENESS: "evidence that people know solutions of this kind exist",
  OFFER_VISIBILITY: "evidence that the offer can be seen by prospective buyers",
  PRICE_VISIBILITY: "evidence that the price is shown or discussed",
  CONSUMER_TRUST: "evidence about buyers' trust in the product or its seller, in either direction",
  MARKET_DEMAND: "evidence of demand for the product or its category",
  BUYER_READINESS: "evidence that buyers are comparing options or ready to decide",
  RECURRING_PURCHASE_POTENTIAL: "evidence of repeat purchase, refills, or subscription",
  UPSELL_POTENTIAL: "evidence of add-ons, bundles, or upgrades",
};

/** One provider's evidence, as the Evidence Provider Framework collected it. */
export interface CommercialIntentSource {
  providerId: string;
  providerVersion: string;
  payload: CommercialIntentEvidence;
}

/**
 * Evidence from the Evidence Provider Framework, plus the candidate it is
 * about. The signal never reaches a platform module itself.
 */
export interface CommercialIntentInputs {
  /** The Discovery candidate under analysis. */
  candidate: Readonly<DiscoveryCandidate>;
  /** One entry per provider that collected evidence. Empty when none did. */
  sources: readonly CommercialIntentSource[];
  /** Warnings from collection, copied into the result. */
  warnings?: readonly string[];
  /** The dimensions to check, in any order, without repeats. Defaults to all of them. */
  dimensions?: readonly CommercialIntentDimension[];
  /** Flat passthrough, copied into the result metadata as `input.<key>`. */
  metadata?: OpportunityMetadata;
}

export interface CommercialIntentResult {
  status: SignalResultStatus;
  /**
   * Share of the checked dimensions the evidence covers, from 0 to 1; null when
   * it covers none. It describes how much of the picture is evidenced, not how
   * strong the intent is, and is not a score.
   */
  confidence: number | null;
  availableDimensions: CommercialIntentDimension[];
  missingDimensions: CommercialIntentDimension[];
  warnings: string[];
  /** Flat. Arrays are comma-joined. */
  metadata: OpportunityMetadata;
  /** Milliseconds spent analyzing. */
  executionTime: number;
}

/** The framework's view of a result. The executor adds the signal id and timing. */
export function commercialIntentResultToSignalOutput(result: CommercialIntentResult): SignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
