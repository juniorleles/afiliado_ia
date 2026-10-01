/**
 * Offer Strategy Signal: vocabulary, inputs, and result.
 *
 * The signal reports, for each offer strategy, whether the strategy is
 * structurally ready given what the Opportunity analysis established and the
 * supplied content. It evaluates offer readiness only. It does not classify
 * the product into an offer type, does not recommend a campaign, and does not
 * produce a score or a ranking.
 *
 * What the lists mean:
 *  - supportedStrategies: no structural unreadiness was found. It does not
 *    mean the strategy is a good choice, and it does not mean every dimension
 *    was established; the verdicts in the metadata say which were.
 *  - unsupportedStrategies: at least one structural unreadiness was found,
 *    or the strategy is unavailable. A strategy is never unsupported only
 *    because information is missing about something it does not strictly need.
 * Both lists are sorted by id. Their order says nothing about preference.
 *
 * Every outside reference here is a type-only import.
 */
import type { TrafficSignalOutput, TrafficSignalResultStatus } from "./traffic-signal-contract";
import type { TrafficMetadata } from "./traffic-types";

/** The twelve offer dimensions, in the specified order. */
export const OFFER_DIMENSIONS = [
  "OFFER_CLARITY",
  "VALUE_PROPOSITION",
  "PRICE_TRANSPARENCY",
  "GUARANTEE_PRESENCE",
  "BONUS_AVAILABILITY",
  "URGENCY_ELEMENTS",
  "SCARCITY_ELEMENTS",
  "OFFER_SIMPLICITY",
  "OFFER_COMPLEXITY",
  "TRUST_ELEMENTS",
  "CALL_TO_ACTION_READINESS",
  "RECURRING_REVENUE_POTENTIAL",
] as const;
export type OfferDimension = (typeof OFFER_DIMENSIONS)[number];

/**
 * How one strategy stands on one dimension.
 *  - COMPATIBLE: what the strategy needs is present.
 *  - INCOMPATIBLE: something the strategy strictly needs was reported missing.
 *  - NOT_ASSESSED: the information to decide was not reported. Not a finding.
 *  - NOT_APPLICABLE: the strategy has no requirement on this dimension.
 */
export const OFFER_VERDICTS = ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"] as const;
export type OfferVerdict = (typeof OFFER_VERDICTS)[number];

/** What a strategy asks of a dimension. CONTEXTUAL absence never excludes the strategy. */
export const OFFER_REQUIREMENT_KINDS = ["STRUCTURAL", "CONTEXTUAL", "NOT_APPLICABLE"] as const;
export type OfferRequirementKind = (typeof OFFER_REQUIREMENT_KINDS)[number];

export const OFFER_STRATEGY_FAMILIES = ["PRODUCT", "ACCESS", "ACQUISITION", "FUTURE"] as const;
export type OfferStrategyFamily = (typeof OFFER_STRATEGY_FAMILIES)[number];

export const OFFER_STRATEGY_STATUSES = ["DEFINED", "PLACEHOLDER"] as const;
export type OfferStrategyStatus = (typeof OFFER_STRATEGY_STATUSES)[number];

export const OFFER_STRATEGY_KEYS = [
  "id",
  "name",
  "description",
  "family",
  "status",
  "enabled",
  "requirements",
  "metadata",
] as const;

/**
 * The keys the signal reads from the Traffic Context's configuration. They are
 * settings the caller supplies; nothing is looked up from anywhere else.
 */
export const OFFER_INPUT_KEYS = {
  /** Comma-separated strategy ids. When present and not empty, only these strategies are available. */
  enabled: "offers.enabled",
  /** Comma-separated strategy ids that are not available. */
  disabled: "offers.disabled",
} as const;

export const OFFER_STRATEGY_SCOPE_NOTE =
  "This reports structural offer readiness only. It is not a classification, a ranking, a score, or a recommendation, and a supported strategy is not a suggested campaign. Nothing here predicts conversion.";

export const OFFER_RESULT_KEYS = [
  "status",
  "confidence",
  "supportedStrategies",
  "unsupportedStrategies",
  "warnings",
  "metadata",
  "executionTime",
] as const;

/** One piece of the Evidence Context. Provenance is carried, never dropped. */
export interface OfferEvidenceItem {
  id: string;
  text: string;
  sourceUrl: string | null;
  pageCategory: string | null;
  field?: string | null;
}

/** One section of the Landing Page Structure. Hidden sections are not on the page and are not read. */
export interface OfferPageSection {
  id: string;
  kind: string;
  visible: boolean;
  texts: readonly string[];
  field?: string | null;
}

/** An effective manual value: what the operator's override currently resolves to. */
export interface OfferEffectiveOverride {
  field: string;
  value: unknown;
}

export interface OfferStrategyContent {
  evidenceContext: { items: readonly OfferEvidenceItem[] } | null;
  landingPage: { sections: readonly OfferPageSection[] } | null;
  manualOverrides: readonly OfferEffectiveOverride[] | null;
}

export interface OfferStrategyResult {
  status: TrafficSignalResultStatus;
  /**
   * Share of the applicable strategy-and-dimension pairs that could be
   * established either way, from 0 to 1; null when none apply. It describes
   * how much was established, not how ready any strategy is, and is not a
   * score and not a conversion prediction.
   */
  confidence: number | null;
  /** Strategy ids with no structural unreadiness found, sorted by id. */
  supportedStrategies: string[];
  /** Strategy ids with at least one structural unreadiness found, sorted by id. */
  unsupportedStrategies: string[];
  warnings: string[];
  metadata: TrafficMetadata;
  executionTime: number;
}

export function offerStrategyToSignalOutput(result: OfferStrategyResult): TrafficSignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
