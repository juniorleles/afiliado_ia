/**
 * Audience Fit Signal: vocabulary, inputs, and result.
 *
 * The signal reports, for each audience profile, whether the profile is
 * structurally compatible with what the Opportunity analysis established and
 * with the supplied content. It evaluates structure only. It does not
 * classify the product into an audience, does not estimate audience size, and
 * does not produce a score, a ranking, or a recommendation.
 *
 * What the lists mean:
 *  - supportedProfiles: no structural incompatibility was found. It does not
 *    mean the profile is a good choice, and it does not mean every dimension
 *    was established; the verdicts in the metadata say which were.
 *  - unsupportedProfiles: at least one structural incompatibility was found,
 *    or the profile is unavailable. A profile is never unsupported only because
 *    information is missing about something it does not strictly need.
 * Both lists are sorted by id. Their order says nothing about fit.
 *
 * Every outside reference here is a type-only import.
 */
import type { TrafficSignalOutput, TrafficSignalResultStatus } from "./traffic-signal-contract";
import type { TrafficMetadata } from "./traffic-types";

/** The twelve audience dimensions, in the specified order. */
export const AUDIENCE_DIMENSIONS = [
  "PROBLEM_AWARENESS",
  "SOLUTION_AWARENESS",
  "PURCHASE_INTENT",
  "PAIN_VISIBILITY",
  "BENEFIT_CLARITY",
  "TRUST_REQUIREMENTS",
  "OFFER_COMPLEXITY",
  "DECISION_COMPLEXITY",
  "EMOTIONAL_APPEAL",
  "RATIONAL_APPEAL",
  "URGENCY_ALIGNMENT",
  "RECURRING_NEED",
] as const;
export type AudienceDimension = (typeof AUDIENCE_DIMENSIONS)[number];

/**
 * How one profile stands on one dimension.
 *  - COMPATIBLE: what the profile needs is present.
 *  - INCOMPATIBLE: something the profile strictly needs was reported missing.
 *  - NOT_ASSESSED: the information to decide was not reported. Not a finding.
 *  - NOT_APPLICABLE: the profile has no requirement on this dimension.
 */
export const AUDIENCE_VERDICTS = ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"] as const;
export type AudienceVerdict = (typeof AUDIENCE_VERDICTS)[number];

/** What a profile asks of a dimension. CONTEXTUAL absence never excludes the profile. */
export const AUDIENCE_REQUIREMENT_KINDS = ["STRUCTURAL", "CONTEXTUAL", "NOT_APPLICABLE"] as const;
export type AudienceRequirementKind = (typeof AUDIENCE_REQUIREMENT_KINDS)[number];

export const AUDIENCE_PROFILE_FAMILIES = ["AWARENESS_STAGE", "RELATIONSHIP", "ROLE", "MARKET", "FUTURE"] as const;
export type AudienceProfileFamily = (typeof AUDIENCE_PROFILE_FAMILIES)[number];

export const AUDIENCE_PROFILE_STATUSES = ["DEFINED", "PLACEHOLDER"] as const;
export type AudienceProfileStatus = (typeof AUDIENCE_PROFILE_STATUSES)[number];

export const AUDIENCE_PROFILE_KEYS = [
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
export const AUDIENCE_INPUT_KEYS = {
  /** Comma-separated profile ids. When present and not empty, only these profiles are available. */
  enabled: "audiences.enabled",
  /** Comma-separated profile ids that are not available. */
  disabled: "audiences.disabled",
} as const;

export const AUDIENCE_FIT_SCOPE_NOTE =
  "This reports structural audience compatibility only. It is not a classification, a ranking, a score, or a recommendation, and a supported profile is not a suggested one. Nothing here estimates audience size.";

export const AUDIENCE_RESULT_KEYS = [
  "status",
  "confidence",
  "supportedProfiles",
  "unsupportedProfiles",
  "warnings",
  "metadata",
  "executionTime",
] as const;

/** One piece of the Evidence Context. Provenance is carried, never dropped. */
export interface AudienceEvidenceItem {
  id: string;
  text: string;
  sourceUrl: string | null;
  pageCategory: string | null;
  /** The field it states, so that an effective manual override of that field supersedes it. */
  field?: string | null;
}

/** One section of the Landing Page Structure. Hidden sections are not on the page and are not read. */
export interface AudiencePageSection {
  id: string;
  kind: string;
  visible: boolean;
  texts: readonly string[];
  field?: string | null;
}

/** An effective manual value: what the operator's override currently resolves to. */
export interface AudienceEffectiveOverride {
  field: string;
  value: unknown;
}

export interface AudienceFitContent {
  evidenceContext: { items: readonly AudienceEvidenceItem[] } | null;
  landingPage: { sections: readonly AudiencePageSection[] } | null;
  manualOverrides: readonly AudienceEffectiveOverride[] | null;
}

export interface AudienceFitResult {
  status: TrafficSignalResultStatus;
  /**
   * Share of the applicable profile-and-dimension pairs that could be
   * established either way, from 0 to 1; null when none apply. It describes
   * how much was established, not how well any profile fits, and is not a
   * score and not an audience size.
   */
  confidence: number | null;
  /** Profile ids with no structural incompatibility found, sorted by id. */
  supportedProfiles: string[];
  /** Profile ids with at least one structural incompatibility found, sorted by id. */
  unsupportedProfiles: string[];
  warnings: string[];
  /** Flat. Arrays are comma-joined. */
  metadata: TrafficMetadata;
  /** Milliseconds spent analyzing. */
  executionTime: number;
}

/** The framework's view of a result. The executor adds the signal id and timing. */
export function audienceFitToSignalOutput(result: AudienceFitResult): TrafficSignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
