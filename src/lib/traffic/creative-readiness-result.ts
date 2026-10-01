/**
 * Creative Readiness Signal: vocabulary, inputs, and result.
 *
 * The signal reports which creative assets are present or missing, and which
 * creative formats are structurally ready given what the Opportunity analysis
 * established and the supplied content. It evaluates creative readiness only.
 * It does not generate copy, images, or video, does not classify the product
 * into a format, and does not produce a score or a ranking.
 *
 * What the lists mean:
 *  - availableAssets: the asset was established as present. It is not a
 *    generated asset.
 *  - missingAssets: the asset was reported missing. Unknown is not missing.
 *  - supportedFormats: no structural unreadiness was found. It is not a
 *    suggested format.
 *  - unsupportedFormats: at least one structural unreadiness was found, or
 *    the format is unavailable.
 * All four lists are sorted by id. Their order says nothing about preference.
 *
 * Every outside reference here is a type-only import.
 */
import type { TrafficSignalOutput, TrafficSignalResultStatus } from "./traffic-signal-contract";
import type { TrafficMetadata } from "./traffic-types";

/** The fourteen creative dimensions, in the specified order. */
export const CREATIVE_DIMENSIONS = [
  "HEADLINE_AVAILABILITY",
  "HOOK_AVAILABILITY",
  "PRIMARY_BENEFITS",
  "VISUAL_ASSETS",
  "PRODUCT_IMAGES",
  "LIFESTYLE_IMAGES",
  "SOCIAL_PROOF",
  "TESTIMONIALS",
  "CTA_READINESS",
  "OFFER_CLARITY",
  "BRAND_ASSETS",
  "VIDEO_POTENTIAL",
  "COMPARISON_POTENTIAL",
  "EDUCATIONAL_CONTENT",
] as const;
export type CreativeDimension = (typeof CREATIVE_DIMENSIONS)[number];

export const CREATIVE_VERDICTS = ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"] as const;
export type CreativeVerdict = (typeof CREATIVE_VERDICTS)[number];

export const CREATIVE_REQUIREMENT_KINDS = ["STRUCTURAL", "CONTEXTUAL", "NOT_APPLICABLE"] as const;
export type CreativeRequirementKind = (typeof CREATIVE_REQUIREMENT_KINDS)[number];

export const CREATIVE_ASSET_FAMILIES = ["COPY", "VISUAL", "SOCIAL", "OFFER", "BRAND", "MOTION", "EDUCATIONAL"] as const;
export type CreativeAssetFamily = (typeof CREATIVE_ASSET_FAMILIES)[number];

export const CREATIVE_FORMAT_FAMILIES = ["TEXT", "DISPLAY", "NATIVE", "MOTION", "IMAGE", "FUTURE"] as const;
export type CreativeFormatFamily = (typeof CREATIVE_FORMAT_FAMILIES)[number];

export const CREATIVE_STATUSES = ["DEFINED", "PLACEHOLDER"] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export const CREATIVE_ASSET_KEYS = [
  "id",
  "name",
  "description",
  "dimension",
  "family",
  "status",
  "enabled",
  "sources",
  "metadata",
] as const;

export const CREATIVE_FORMAT_KEYS = [
  "id",
  "name",
  "description",
  "family",
  "status",
  "enabled",
  "requirements",
  "metadata",
] as const;

export const CREATIVE_INPUT_KEYS = {
  formatsEnabled: "formats.enabled",
  formatsDisabled: "formats.disabled",
  assetsEnabled: "assets.enabled",
  assetsDisabled: "assets.disabled",
} as const;

export const CREATIVE_READINESS_SCOPE_NOTE =
  "This reports structural creative readiness only. It is not a ranking, a score, or a recommendation, and a supported format is not a suggested one. Nothing here generates copy, images, or video.";

export const CREATIVE_RESULT_KEYS = [
  "status",
  "confidence",
  "availableAssets",
  "missingAssets",
  "supportedFormats",
  "unsupportedFormats",
  "warnings",
  "metadata",
  "executionTime",
] as const;

export interface CreativeEvidenceItem {
  id: string;
  text: string;
  sourceUrl: string | null;
  pageCategory: string | null;
  field?: string | null;
}

export interface CreativePageSection {
  id: string;
  kind: string;
  visible: boolean;
  texts: readonly string[];
  field?: string | null;
}

export interface CreativeEffectiveOverride {
  field: string;
  value: unknown;
}

/**
 * A structural reading of a presentation plan. Only visibility, the hero
 * strategy label, and variant labels are read. The plan is never executed.
 */
export interface CreativePresentationPlan {
  heroStrategy: string | null;
  sectionVisibility: Readonly<Record<string, boolean>> | null;
  sectionVariants: Readonly<Record<string, string>> | null;
}

export interface CreativeReadinessContent {
  evidenceContext: { items: readonly CreativeEvidenceItem[] } | null;
  landingPage: { sections: readonly CreativePageSection[] } | null;
  presentationPlan: CreativePresentationPlan | null;
  manualOverrides: readonly CreativeEffectiveOverride[] | null;
}

export interface CreativeReadinessResult {
  status: TrafficSignalResultStatus;
  /**
   * Share of the enabled assets that could be established either way, from 0
   * to 1; null when none apply. It describes how much was established, not
   * how good any creative would be, and is not a score.
   */
  confidence: number | null;
  availableAssets: string[];
  missingAssets: string[];
  supportedFormats: string[];
  unsupportedFormats: string[];
  warnings: string[];
  metadata: TrafficMetadata;
  executionTime: number;
}

export function creativeReadinessToSignalOutput(result: CreativeReadinessResult): TrafficSignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
