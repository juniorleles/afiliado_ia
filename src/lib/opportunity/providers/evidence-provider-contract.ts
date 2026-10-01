/**
 * Evidence Provider Framework: provider contract.
 *
 * What an evidence provider must expose to be plugged into the resolver. A
 * provider is the only place that may read a platform module on behalf of a
 * signal: a signal asks the resolver for evidence of a kind and receives a
 * frozen copy. The framework only calls these members; it never interprets
 * the evidence, never combines two payloads, and never produces a score.
 *
 * Every platform reference here is a type-only import, so this module adds no
 * runtime dependency on ProductFacts, research, completeness, or anything else.
 */
import type { ImportCompletenessReport } from "@/lib/completeness-engine";
import type { LpQualityPrediction } from "@/lib/lp-quality-predictor";
import type { OverrideField } from "@/lib/manual-overrides";
import type { MarketResearchReport } from "@/lib/market-research/types";
import type { PresentationPlan } from "@/lib/presentation-plan";
import type { ProductFacts } from "@/lib/product-facts";
import type { CommercialIntentEvidence } from "../commercial-intent-provider-contract";
import type { OpportunityMetadata } from "../opportunity-types";
import type { OpportunityIssue } from "../opportunity-validator";
import type { EvidenceContext } from "./evidence-provider-context";

/** The kinds of evidence a provider can supply. One provider contract exists per kind. */
export const EVIDENCE_KINDS = [
  "PRODUCT_FACTS",
  "RESEARCH",
  "COMPLETENESS",
  "LP_QUALITY",
  "PRESENTATION_PLAN",
  "MANUAL_OVERRIDES",
  "COMMERCIAL_INTENT",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** An effective manual value: what an operator override currently resolves to. */
export interface ManualOverrideEvidence {
  field: OverrideField;
  value: unknown;
}

/** What a provider of each kind returns. These are the existing platform outputs, read-only. */
export interface EvidencePayloads {
  PRODUCT_FACTS: ProductFacts;
  RESEARCH: MarketResearchReport;
  COMPLETENESS: ImportCompletenessReport;
  LP_QUALITY: LpQualityPrediction;
  PRESENTATION_PLAN: PresentationPlan;
  MANUAL_OVERRIDES: readonly ManualOverrideEvidence[];
  /** Observations a channel provider made about commercial intent. Not a platform output. */
  COMMERCIAL_INTENT: CommercialIntentEvidence;
}

/**
 * What collect() returns. A null payload means the provider looked and has
 * nothing: absence stays absence and is never filled in. A payload must be
 * plain data, because it is copied and frozen before any signal sees it.
 */
export interface EvidenceOutput<P = unknown> {
  payload: P | null;
  metadata: OpportunityMetadata;
  warnings: string[];
}

export interface EvidenceProvider<K extends EvidenceKind = EvidenceKind> {
  readonly id: string;
  readonly name: string;
  /** Semantic version, for example "1.0.0". */
  readonly version: string;
  /** The kind of evidence this provider supplies. */
  readonly kind: K;
  /** Higher wins when two providers supply the same kind. Integer from 0 to 1000. */
  readonly priority: number;
  /** Whether the provider starts enabled when registered. */
  readonly enabled: boolean;
  /** False skips the provider for this context. */
  supports(context: EvidenceContext): boolean;
  collect(context: EvidenceContext): EvidenceOutput<EvidencePayloads[K]> | Promise<EvidenceOutput<EvidencePayloads[K]>>;
  /** Problems that stop collect() from running on this context; empty when valid. */
  validate(context: EvidenceContext): OpportunityIssue[];
}

/** A registered provider and whether it is currently enabled. Changed only by the registry. */
export interface EvidenceProviderEntry {
  readonly id: string;
  readonly provider: EvidenceProvider;
  readonly enabled: boolean;
}

/**
 * How one collection ended. COLLECTED: a payload was returned. EMPTY: the
 * provider ran and has nothing. FAILED: it did not complete. SKIPPED: it does
 * not support this context.
 */
export const EVIDENCE_RESULT_STATUSES = ["COLLECTED", "EMPTY", "FAILED", "SKIPPED"] as const;
export type EvidenceResultStatus = (typeof EVIDENCE_RESULT_STATUSES)[number];

/** What the resolver records for each provider. Carries the provider's identity, so provenance survives. */
export interface EvidenceCollectionResult {
  providerId: string;
  providerVersion: string;
  kind: EvidenceKind;
  priority: number;
  status: EvidenceResultStatus;
  /** A frozen copy of the payload, or null when there is none. */
  payload: unknown;
  metadata: OpportunityMetadata;
  warnings: string[];
  errors: string[];
  /** Milliseconds spent in supports, validate, and collect. */
  executionTime: number;
}
