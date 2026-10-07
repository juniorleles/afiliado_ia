/**
 * Evidence Signal: inputs and result.
 *
 * The Evidence Signal reports how much evidence a product has and how well its
 * provenance holds up. It reads existing platform outputs and writes nothing.
 * It produces no score and no recommendation.
 *
 * Every platform reference here is a type-only import, so this module adds no
 * runtime dependency on the importer, ProductFacts, or any other platform code.
 */
import type { ImportCompletenessReport } from "@/lib/completeness-engine";
import type { ContentSection } from "@/lib/content-boundary";
import type { MarketResearchReport } from "@/lib/market-research/types";
import type { PresentationPlan } from "@/lib/presentation-plan";
import type { ProductFacts } from "@/lib/product-facts";
import type { SignalOutput, SignalResultStatus } from "./opportunity-signal-contract";
import type { OpportunityMetadata } from "./opportunity-types";

/** What the signal checks for presence and consistency. */
export const EVIDENCE_DIMENSIONS = [
  "INGREDIENTS",
  "FEATURES",
  "FAQ",
  "GUARANTEE",
  "PRICING",
  "RETURNS",
  "WARNINGS",
  "SHIPPING",
  "MANUFACTURER",
  "SUPPORTING_CONTENT",
  "EVIDENCE_SOURCES",
] as const;
export type EvidenceDimension = (typeof EVIDENCE_DIMENSIONS)[number];

/**
 * AVAILABLE_AUTHORITATIVE: every item behind the dimension is DIRECT_SOURCE or
 * MANUAL. That means the source stated it or an operator entered it; it does
 * not mean independently verified. AVAILABLE_OTHER: at least one item rests on
 * heuristic or AI-classified provenance.
 */
export const EVIDENCE_DIMENSION_STATES = ["AVAILABLE_AUTHORITATIVE", "AVAILABLE_OTHER", "MISSING"] as const;
export type EvidenceDimensionState = (typeof EVIDENCE_DIMENSION_STATES)[number];

/**
 * Existing outputs only. ProductFacts is the authority and is required. The
 * others are optional cross-checks; when supplied they must be valid.
 */
export interface EvidenceInputs {
  facts: ProductFacts;
  /** From analyzeImportCompleteness. Its score is never read. */
  completeness?: ImportCompletenessReport | null;
  research?: MarketResearchReport | null;
  presentationPlan?: PresentationPlan | null;
  /** From classifyContentBoundaries. */
  boundary?: readonly ContentSection[] | null;
  /** Flat passthrough, copied into the result metadata as `input.<key>`. */
  metadata?: OpportunityMetadata;
}

export interface EvidenceResult {
  status: SignalResultStatus;
  /**
   * Share of the available dimensions whose provenance is DIRECT_SOURCE or
   * MANUAL, from 0 to 1; null when no dimension is available. It describes the
   * provenance of the evidence, not the merit of the product, and is not a score.
   */
  confidence: number | null;
  availableDimensions: EvidenceDimension[];
  missingDimensions: EvidenceDimension[];
  warnings: string[];
  /** Flat. Arrays are comma-joined. */
  metadata: OpportunityMetadata;
  /** Milliseconds spent analyzing. */
  executionTime: number;
}

/** The framework's view of a result. The executor adds the signal id and timing. */
export function evidenceResultToSignalOutput(result: EvidenceResult): SignalOutput {
  return {
    status: result.status,
    confidence: result.confidence,
    metadata: { ...result.metadata },
    warnings: [...result.warnings],
    errors: [],
  };
}
