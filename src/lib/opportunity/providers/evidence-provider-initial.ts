/**
 * Evidence Provider Framework: the initial provider contracts.
 *
 * One contract per kind of evidence, and nothing else. These are types only:
 * no provider is implemented here, none is registered by default, and none
 * reads ProductFacts, research, completeness, the LP quality predictor, the
 * presentation plan, or manual overrides. A later step writes the providers
 * that satisfy them.
 */
import type { CommercialIntentProviderContract } from "../commercial-intent-provider-contract";
import type { EvidenceKind, EvidenceProvider } from "./evidence-provider-contract";

/** Supplies ProductFacts. */
export type ProductFactsProvider = EvidenceProvider<"PRODUCT_FACTS">;
/** Supplies the market research report. */
export type ResearchProvider = EvidenceProvider<"RESEARCH">;
/** Supplies the import completeness report. */
export type CompletenessProvider = EvidenceProvider<"COMPLETENESS">;
/** Supplies the LP quality prediction. */
export type LpQualityProvider = EvidenceProvider<"LP_QUALITY">;
/** Supplies the presentation plan. */
export type PresentationPlanProvider = EvidenceProvider<"PRESENTATION_PLAN">;
/** Supplies the effective manual override values. */
export type ManualOverridesProvider = EvidenceProvider<"MANUAL_OVERRIDES">;

/** Supplies channel observations about commercial intent. Its payload is defined by the Commercial Intent Signal. */
export type CommercialIntentProvider = CommercialIntentProviderContract;

/** Every initial contract, by kind. A missing kind is a compile error. */
export interface InitialEvidenceProviders {
  PRODUCT_FACTS: ProductFactsProvider;
  RESEARCH: ResearchProvider;
  COMPLETENESS: CompletenessProvider;
  LP_QUALITY: LpQualityProvider;
  PRESENTATION_PLAN: PresentationPlanProvider;
  MANUAL_OVERRIDES: ManualOverridesProvider;
  COMMERCIAL_INTENT: CommercialIntentProvider;
}

/** The provider contract for a kind. */
export type EvidenceProviderFor<K extends EvidenceKind> = InitialEvidenceProviders[K];
