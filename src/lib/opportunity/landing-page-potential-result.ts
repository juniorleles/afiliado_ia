/**
 * Landing Page Potential Signal: inputs and result.
 *
 * The signal reports whether the evidence a product already has is enough, in
 * structure, to build a landing page. It reads existing platform outputs and
 * writes nothing. It produces no score, no ranking, and no recommendation.
 *
 * Every platform reference here is a type-only import, so this module adds no
 * runtime dependency on the importer, ProductFacts, or any other platform code.
 */
import type { ImportCompletenessReport } from "@/lib/completeness-engine";
import type { LpQualityPrediction } from "@/lib/lp-quality-predictor";
import type { OverrideField } from "@/lib/manual-overrides";
import type { PresentationPlan } from "@/lib/presentation-plan";
import type { ProductFacts } from "@/lib/product-facts";
import type { SignalOutput, SignalResultStatus } from "./opportunity-signal-contract";
import type { OpportunityMetadata } from "./opportunity-types";
import type { EvidenceResult } from "./evidence-result";

/** What the signal looks at. Structure only: how much is there, never how good it is. */
export const LP_POTENTIAL_DIMENSIONS = [
  "HERO_STRENGTH",
  "FEATURE_COVERAGE",
  "INGREDIENT_COVERAGE",
  "OFFER_COVERAGE",
  "PRICING_COVERAGE",
  "FAQ_COVERAGE",
  "GUARANTEE_COVERAGE",
  "CTA_AVAILABILITY",
  "MEDIA_AVAILABILITY",
  "INFORMATION_DENSITY",
  "SECTION_BALANCE",
  "PRESENTATION_READINESS",
] as const;
export type LandingPageDimension = (typeof LP_POTENTIAL_DIMENSIONS)[number];

/**
 * A structural reading of one dimension. These are labels, not numbers, and
 * they are not combined into anything. NOT_ASSESSED means the input needed to
 * judge the dimension was not supplied, which is different from MISSING.
 */
export const LP_POTENTIAL_RATINGS = ["STRONG", "ADEQUATE", "WEAK", "MISSING", "NOT_ASSESSED"] as const;
export type LandingPageRating = (typeof LP_POTENTIAL_RATINGS)[number];

/**
 * An effective manual value: what the operator's override currently resolves
 * to. Ids, timestamps, and previous values are not part of it and are never read.
 */
export interface EffectiveManualOverride {
  field: OverrideField;
  value: unknown;
}

/**
 * Existing outputs only. ProductFacts, the completeness report, and the
 * presentation plan are required. The rest are optional; when supplied they
 * must be valid.
 */
export interface LandingPagePotentialInputs {
  facts: ProductFacts;
  /** From analyzeImportCompleteness. Its score is never read. */
  completeness: ImportCompletenessReport;
  /** From planPresentation. */
  presentationPlan: PresentationPlan;
  /** From predictLpQuality. Only its density and readiness labels are read, never its score. */
  qualityPrediction?: LpQualityPrediction | null;
  /** The Evidence Signal's result. */
  evidence?: EvidenceResult | null;
  /** Effective manual values only. A supplied empty list means there are none. */
  manualOverrides?: readonly EffectiveManualOverride[] | null;
  /** Flat passthrough, copied into the result metadata as `input.<key>`. */
  metadata?: OpportunityMetadata;
}

export interface LandingPagePotentialResult {
  status: SignalResultStatus;
  /**
   * Share of the evidence-backed dimensions that are present and rest only on
   * DIRECT_SOURCE or MANUAL provenance, from 0 to 1; null when none is present.
   * It describes where the evidence came from, not how good the page would be,
   * and is not a score.
   */
  confidence: number | null;
  /** Dimensions rated STRONG, each as "<DIMENSION>: <what was found>". */
  strengths: string[];
  /** Dimensions rated WEAK or MISSING, each as "<DIMENSION>: <what was found>". */
  weaknesses: string[];
  /** Landing-page sections that have no material at all. */
  missingSections: string[];
  warnings: string[];
  /** Flat. Arrays are comma-joined. */
  metadata: OpportunityMetadata;
  /** Milliseconds spent analyzing. */
  executionTime: number;
}

/** The framework's view of a result. The executor adds the signal id and timing. */
export function landingPagePotentialToSignalOutput(result: LandingPagePotentialResult): SignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
