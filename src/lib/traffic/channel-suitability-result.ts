/**
 * Channel Suitability Signal: dimensions, verdicts, and result.
 *
 * The signal reports, for each channel definition, whether the channel is
 * structurally compatible with what the Opportunity analysis established. It
 * evaluates structure only. It produces no score, no ranking, no
 * recommendation, no budget, and no campaign.
 *
 * What the lists mean:
 *  - supportedChannels: no structural incompatibility was found. It does not
 *    mean the channel is a good choice, and it does not mean every dimension
 *    was established; the verdicts in the metadata say which were.
 *  - unsupportedChannels: at least one structural incompatibility was found.
 *    A channel is never unsupported only because information is missing about
 *    something the channel does not strictly need.
 * Both lists are sorted by id. Their order says nothing about suitability.
 *
 * Every outside reference here is a type-only import.
 */
import type { TrafficSignalOutput, TrafficSignalResultStatus } from "./traffic-signal-contract";
import type { TrafficMetadata } from "./traffic-types";

/** What the signal checks for each channel. */
export const CHANNEL_DIMENSIONS = [
  "CHANNEL_AVAILABILITY",
  "OFFER_COMPATIBILITY",
  "CONTENT_COMPATIBILITY",
  "CREATIVE_REQUIREMENTS",
  "LANDING_PAGE_READINESS",
  "BRAND_DEPENDENCY",
  "POLICY_SENSITIVITY",
  "AUDIENCE_MATCH",
  "FUNNEL_COMPATIBILITY",
  "TRAFFIC_INTENT",
] as const;
export type ChannelDimension = (typeof CHANNEL_DIMENSIONS)[number];

/**
 * How one channel stands on one dimension.
 *  - COMPATIBLE: what the channel needs is present.
 *  - INCOMPATIBLE: something the channel strictly needs was reported missing.
 *  - NOT_ASSESSED: the information to decide was not reported. Not a finding.
 *  - NOT_APPLICABLE: the channel has no requirement on this dimension.
 */
export const CHANNEL_VERDICTS = ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"] as const;
export type ChannelVerdict = (typeof CHANNEL_VERDICTS)[number];

/**
 * The keys the signal reads from the Traffic Context's configuration. They are
 * settings the caller supplies; nothing is looked up from anywhere else.
 */
export const CHANNEL_INPUT_KEYS = {
  /** Comma-separated channel ids. When present and not empty, only these channels are available. */
  enabled: "channels.enabled",
  /** Comma-separated channel ids that are not available. */
  disabled: "channels.disabled",
  /** true or false: whether the offer has been declared policy-sensitive by the caller. Not verified here. */
  policySensitive: "offer.policySensitive",
} as const;

export const CHANNEL_SUITABILITY_SCOPE_NOTE =
  "This reports structural compatibility only. It is not a ranking, a score, or a recommendation, and a supported channel is not a suggested one.";

export const CHANNEL_RESULT_KEYS = ["status", "confidence", "supportedChannels", "unsupportedChannels", "warnings", "metadata", "executionTime"] as const;

export interface ChannelSuitabilityResult {
  status: TrafficSignalResultStatus;
  /**
   * Share of the applicable channel-and-dimension pairs that could be
   * established either way, from 0 to 1; null when none apply. It describes
   * how much was established, not how suitable any channel is, and is not a
   * score.
   */
  confidence: number | null;
  /** Channel ids with no structural incompatibility found, sorted by id. */
  supportedChannels: string[];
  /** Channel ids with at least one structural incompatibility found, sorted by id. */
  unsupportedChannels: string[];
  warnings: string[];
  /** Flat. Arrays are comma-joined. */
  metadata: TrafficMetadata;
  /** Milliseconds spent analyzing. */
  executionTime: number;
}

/** The framework's view of a result. The executor adds the signal id and timing. */
export function channelSuitabilityToSignalOutput(result: ChannelSuitabilityResult): TrafficSignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
