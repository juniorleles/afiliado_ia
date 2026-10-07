/**
 * Offer Strategy Signal: strategy definitions and dimension sources.
 *
 * These are initial, generic offer strategies written as plain metadata. They
 * are not campaign types, they cite no advertising platform, and they are not
 * a classification of the product. They exist so the signal works out of the
 * box and so a reviewer has something concrete to correct. Replace or extend
 * them through the strategy registry.
 *
 * A strategy is a named set of structural and contextual requirements. The
 * signal never assigns the product to a strategy. "Supported" means no
 * structural requirement was reported missing.
 */
import {
  OFFER_DIMENSIONS,
  type OfferDimension,
  type OfferRequirementKind,
  type OfferStrategyFamily,
  type OfferStrategyStatus,
} from "./offer-strategy-result";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficMetadata } from "./traffic-types";

export type OfferRequirements = Readonly<Record<OfferDimension, OfferRequirementKind>>;

export interface OfferStrategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: OfferStrategyFamily;
  readonly status: OfferStrategyStatus;
  readonly enabled: boolean;
  readonly requirements: OfferRequirements;
  readonly metadata: Readonly<TrafficMetadata>;
}

/**
 * Where each offer dimension can be established. Opportunity dimensions are
 * alternatives: any one of them being reported is enough to say the dimension
 * has been looked at. Visible landing-page sections of a listed kind, and
 * non-empty text on a listed field, are structural presence only: the words
 * themselves are never classified.
 */
export interface OfferDimensionSource {
  readonly opportunityDimensions: readonly string[];
  readonly sectionKinds: readonly string[];
  readonly evidenceFields: readonly string[];
}
export type OfferDimensionSources = Readonly<Record<OfferDimension, OfferDimensionSource>>;

export const DEFAULT_OFFER_SOURCES: OfferDimensionSources = freezeDeepTraffic({
  OFFER_CLARITY: { opportunityDimensions: ["OFFER_COVERAGE", "OFFER_VISIBILITY", "HERO_STRENGTH"], sectionKinds: ["hero", "overview"], evidenceFields: ["offer"] },
  VALUE_PROPOSITION: { opportunityDimensions: ["FEATURES", "FEATURE_COVERAGE", "HERO_STRENGTH"], sectionKinds: ["hero", "features"], evidenceFields: ["benefit"] },
  PRICE_TRANSPARENCY: { opportunityDimensions: ["PRICING", "PRICING_COVERAGE", "PRICE_VISIBILITY"], sectionKinds: ["pricing"], evidenceFields: ["price"] },
  GUARANTEE_PRESENCE: { opportunityDimensions: ["GUARANTEE", "GUARANTEE_COVERAGE", "RETURNS"], sectionKinds: ["guarantee"], evidenceFields: [] },
  BONUS_AVAILABILITY: { opportunityDimensions: ["UPSELL_POTENTIAL"], sectionKinds: ["bonus", "bonuses"], evidenceFields: ["bonus"] },
  URGENCY_ELEMENTS: { opportunityDimensions: ["BUYER_READINESS"], sectionKinds: ["urgency"], evidenceFields: [] },
  SCARCITY_ELEMENTS: { opportunityDimensions: [], sectionKinds: ["scarcity"], evidenceFields: [] },
  OFFER_SIMPLICITY: { opportunityDimensions: ["OFFER_COVERAGE", "HERO_STRENGTH"], sectionKinds: ["hero"], evidenceFields: ["offer"] },
  OFFER_COMPLEXITY: { opportunityDimensions: ["OFFER_COVERAGE", "FAQ", "FAQ_COVERAGE", "INFORMATION_DENSITY"], sectionKinds: ["faq", "features"], evidenceFields: [] },
  TRUST_ELEMENTS: { opportunityDimensions: ["GUARANTEE", "MANUFACTURER", "CONSUMER_TRUST"], sectionKinds: ["guarantee", "manufacturer"], evidenceFields: [] },
  CALL_TO_ACTION_READINESS: { opportunityDimensions: ["CTA_AVAILABILITY", "PRESENTATION_READINESS"], sectionKinds: ["cta", "closing"], evidenceFields: [] },
  RECURRING_REVENUE_POTENTIAL: { opportunityDimensions: ["RECURRING_PURCHASE_POTENTIAL"], sectionKinds: [], evidenceFields: [] },
});

const NOTE = { origin: "initial generic strategy", status: "needs review" } as const;

const none = (): OfferRequirements =>
  Object.fromEntries(OFFER_DIMENSIONS.map((dimension) => [dimension, "NOT_APPLICABLE"])) as OfferRequirements;

const requirements = (over: Partial<Record<OfferDimension, OfferRequirementKind>>): OfferRequirements => ({ ...none(), ...over });

const define = (
  id: string,
  name: string,
  family: OfferStrategyFamily,
  description: string,
  over: Partial<Record<OfferDimension, OfferRequirementKind>>,
  status: OfferStrategyStatus = "DEFINED",
): OfferStrategy => ({
  id,
  name,
  description,
  family,
  status,
  enabled: true,
  requirements: requirements(over),
  metadata: { ...NOTE },
});

export const DEFAULT_OFFER_STRATEGIES: readonly OfferStrategy[] = freezeDeepTraffic([
  define("single-product", "Single Product", "PRODUCT", "One product, stated plainly, with a price and a way to act.", {
    OFFER_CLARITY: "STRUCTURAL",
    PRICE_TRANSPARENCY: "STRUCTURAL",
    CALL_TO_ACTION_READINESS: "STRUCTURAL",
    VALUE_PROPOSITION: "CONTEXTUAL",
    GUARANTEE_PRESENCE: "CONTEXTUAL",
    TRUST_ELEMENTS: "CONTEXTUAL",
    OFFER_SIMPLICITY: "CONTEXTUAL",
  }),
  define("bundle", "Bundle", "PRODUCT", "More than one item sold together, so the offer needs enough structure to be understood.", {
    OFFER_CLARITY: "STRUCTURAL",
    VALUE_PROPOSITION: "STRUCTURAL",
    PRICE_TRANSPARENCY: "STRUCTURAL",
    OFFER_COMPLEXITY: "STRUCTURAL",
    BONUS_AVAILABILITY: "CONTEXTUAL",
    TRUST_ELEMENTS: "CONTEXTUAL",
    CALL_TO_ACTION_READINESS: "CONTEXTUAL",
    GUARANTEE_PRESENCE: "CONTEXTUAL",
  }),
  define("subscription", "Subscription", "ACCESS", "Ongoing access that depends on recurring purchase being established.", {
    RECURRING_REVENUE_POTENTIAL: "STRUCTURAL",
    PRICE_TRANSPARENCY: "STRUCTURAL",
    OFFER_CLARITY: "STRUCTURAL",
    CALL_TO_ACTION_READINESS: "STRUCTURAL",
    TRUST_ELEMENTS: "CONTEXTUAL",
    GUARANTEE_PRESENCE: "CONTEXTUAL",
    VALUE_PROPOSITION: "CONTEXTUAL",
  }),
  define("trial", "Trial", "ACCESS", "A low-commitment first step that still needs a clear offer and a way to act.", {
    OFFER_CLARITY: "STRUCTURAL",
    CALL_TO_ACTION_READINESS: "STRUCTURAL",
    TRUST_ELEMENTS: "STRUCTURAL",
    VALUE_PROPOSITION: "CONTEXTUAL",
    GUARANTEE_PRESENCE: "CONTEXTUAL",
    PRICE_TRANSPARENCY: "CONTEXTUAL",
  }),
  define("lead-magnet", "Lead Magnet", "ACQUISITION", "An offer that asks for a step before a purchase, so a price is not required.", {
    OFFER_CLARITY: "STRUCTURAL",
    VALUE_PROPOSITION: "STRUCTURAL",
    CALL_TO_ACTION_READINESS: "STRUCTURAL",
    OFFER_SIMPLICITY: "CONTEXTUAL",
    TRUST_ELEMENTS: "CONTEXTUAL",
  }),
  define("future", "Future Types", "FUTURE", "A placeholder for offer strategies that have not been defined yet.", {}, "PLACEHOLDER"),
]);
