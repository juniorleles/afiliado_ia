/**
 * Audience Fit Signal: profile definitions and dimension sources.
 *
 * These are initial, generic audience profiles written as plain metadata. They
 * are not the audience of any advertising platform, they cite none, and they
 * are not a classification of the product. They exist so the signal works out
 * of the box and so a reviewer has something concrete to correct. Replace or
 * extend them through the profile registry.
 *
 * A profile is a named set of structural and contextual requirements. The
 * signal never assigns the product to a profile. "Supported" means no
 * structural requirement was reported missing.
 */
import {
  AUDIENCE_DIMENSIONS,
  type AudienceDimension,
  type AudienceProfileFamily,
  type AudienceProfileStatus,
  type AudienceRequirementKind,
} from "./audience-fit-result";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficMetadata } from "./traffic-types";

export type AudienceRequirements = Readonly<Record<AudienceDimension, AudienceRequirementKind>>;

export interface AudienceProfile {
  /** Lowercase letters, digits, and hyphens, starting with a letter. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: AudienceProfileFamily;
  readonly status: AudienceProfileStatus;
  /** The initial state in a registry. */
  readonly enabled: boolean;
  readonly requirements: AudienceRequirements;
  readonly metadata: Readonly<TrafficMetadata>;
}

/**
 * Where each audience dimension can be established. Opportunity dimensions
 * are alternatives: any one of them being reported is enough to say the
 * dimension has been looked at. Visible landing-page sections of a listed
 * kind, and non-empty text on a listed field, are structural presence only:
 * the words themselves are never classified.
 */
export interface AudienceDimensionSource {
  readonly opportunityDimensions: readonly string[];
  readonly sectionKinds: readonly string[];
  readonly evidenceFields: readonly string[];
}
export type AudienceDimensionSources = Readonly<Record<AudienceDimension, AudienceDimensionSource>>;

export const DEFAULT_AUDIENCE_SOURCES: AudienceDimensionSources = freezeDeepTraffic({
  PROBLEM_AWARENESS: { opportunityDimensions: ["PROBLEM_AWARENESS"], sectionKinds: [], evidenceFields: [] },
  SOLUTION_AWARENESS: { opportunityDimensions: ["SOLUTION_AWARENESS"], sectionKinds: [], evidenceFields: [] },
  PURCHASE_INTENT: { opportunityDimensions: ["PURCHASE_INTENT", "BUYER_READINESS"], sectionKinds: ["cta"], evidenceFields: [] },
  PAIN_VISIBILITY: { opportunityDimensions: ["PROBLEM_AWARENESS", "WARNINGS"], sectionKinds: ["considerations", "warnings"], evidenceFields: ["pain"] },
  BENEFIT_CLARITY: { opportunityDimensions: ["FEATURES", "FEATURE_COVERAGE", "HERO_STRENGTH"], sectionKinds: ["hero", "features", "overview"], evidenceFields: ["benefit"] },
  TRUST_REQUIREMENTS: {
    opportunityDimensions: ["GUARANTEE", "GUARANTEE_COVERAGE", "RETURNS", "MANUFACTURER", "CONSUMER_TRUST"],
    sectionKinds: ["guarantee", "manufacturer"],
    evidenceFields: [],
  },
  OFFER_COMPLEXITY: {
    opportunityDimensions: ["OFFER_COVERAGE", "PRICING", "PRICING_COVERAGE", "OFFER_VISIBILITY", "PRICE_VISIBILITY"],
    sectionKinds: ["pricing"],
    evidenceFields: ["price"],
  },
  DECISION_COMPLEXITY: { opportunityDimensions: ["FAQ", "FAQ_COVERAGE", "INFORMATION_DENSITY"], sectionKinds: ["faq"], evidenceFields: [] },
  EMOTIONAL_APPEAL: { opportunityDimensions: ["PROBLEM_AWARENESS", "HERO_STRENGTH"], sectionKinds: ["hero", "testimonials"], evidenceFields: [] },
  RATIONAL_APPEAL: { opportunityDimensions: ["FEATURES", "INGREDIENTS", "FAQ", "INGREDIENT_COVERAGE"], sectionKinds: ["features", "ingredients"], evidenceFields: [] },
  URGENCY_ALIGNMENT: { opportunityDimensions: ["BUYER_READINESS", "PURCHASE_INTENT"], sectionKinds: [], evidenceFields: [] },
  RECURRING_NEED: { opportunityDimensions: ["RECURRING_PURCHASE_POTENTIAL"], sectionKinds: [], evidenceFields: [] },
});

const NOTE = { origin: "initial generic profile", status: "needs review" } as const;

const none = (): AudienceRequirements =>
  Object.fromEntries(AUDIENCE_DIMENSIONS.map((dimension) => [dimension, "NOT_APPLICABLE"])) as AudienceRequirements;

const requirements = (over: Partial<Record<AudienceDimension, AudienceRequirementKind>>): AudienceRequirements => ({ ...none(), ...over });

const define = (
  id: string,
  name: string,
  family: AudienceProfileFamily,
  description: string,
  over: Partial<Record<AudienceDimension, AudienceRequirementKind>>,
  status: AudienceProfileStatus = "DEFINED",
): AudienceProfile => ({
  id,
  name,
  description,
  family,
  status,
  enabled: true,
  requirements: requirements(over),
  metadata: { ...NOTE },
});

export const DEFAULT_AUDIENCE_PROFILES: readonly AudienceProfile[] = freezeDeepTraffic([
  define("cold", "Cold Audience", "AWARENESS_STAGE", "People who have not yet recognised the problem the offer addresses.", {
    PROBLEM_AWARENESS: "STRUCTURAL",
    PAIN_VISIBILITY: "STRUCTURAL",
    TRUST_REQUIREMENTS: "CONTEXTUAL",
    BENEFIT_CLARITY: "CONTEXTUAL",
    EMOTIONAL_APPEAL: "CONTEXTUAL",
  }),
  define("warm", "Warm Audience", "AWARENESS_STAGE", "People who recognise the problem and are looking at solutions.", {
    SOLUTION_AWARENESS: "STRUCTURAL",
    BENEFIT_CLARITY: "STRUCTURAL",
    PROBLEM_AWARENESS: "CONTEXTUAL",
    TRUST_REQUIREMENTS: "CONTEXTUAL",
    RATIONAL_APPEAL: "CONTEXTUAL",
  }),
  define("hot", "Hot Audience", "AWARENESS_STAGE", "People who are ready to decide on an offer.", {
    PURCHASE_INTENT: "STRUCTURAL",
    OFFER_COMPLEXITY: "STRUCTURAL",
    SOLUTION_AWARENESS: "CONTEXTUAL",
    BENEFIT_CLARITY: "CONTEXTUAL",
    TRUST_REQUIREMENTS: "CONTEXTUAL",
    URGENCY_ALIGNMENT: "CONTEXTUAL",
  }),
  define("existing-customer", "Existing Customer", "RELATIONSHIP", "People who already buy the offer and may buy it again.", {
    RECURRING_NEED: "STRUCTURAL",
    OFFER_COMPLEXITY: "CONTEXTUAL",
    TRUST_REQUIREMENTS: "CONTEXTUAL",
    BENEFIT_CLARITY: "CONTEXTUAL",
  }),
  define("professional", "Professional", "ROLE", "People who evaluate an offer as part of their work.", {
    RATIONAL_APPEAL: "STRUCTURAL",
    DECISION_COMPLEXITY: "STRUCTURAL",
    TRUST_REQUIREMENTS: "CONTEXTUAL",
    OFFER_COMPLEXITY: "CONTEXTUAL",
    BENEFIT_CLARITY: "CONTEXTUAL",
  }),
  define("consumer", "Consumer", "ROLE", "People who evaluate an offer for their own use.", {
    BENEFIT_CLARITY: "STRUCTURAL",
    TRUST_REQUIREMENTS: "CONTEXTUAL",
    EMOTIONAL_APPEAL: "CONTEXTUAL",
    PAIN_VISIBILITY: "CONTEXTUAL",
    URGENCY_ALIGNMENT: "CONTEXTUAL",
  }),
  define("b2b", "B2B", "MARKET", "A business-to-business buying context.", {
    RATIONAL_APPEAL: "STRUCTURAL",
    DECISION_COMPLEXITY: "STRUCTURAL",
    TRUST_REQUIREMENTS: "STRUCTURAL",
    OFFER_COMPLEXITY: "CONTEXTUAL",
    SOLUTION_AWARENESS: "CONTEXTUAL",
  }),
  define("b2c", "B2C", "MARKET", "A business-to-consumer buying context.", {
    BENEFIT_CLARITY: "STRUCTURAL",
    EMOTIONAL_APPEAL: "CONTEXTUAL",
    PAIN_VISIBILITY: "CONTEXTUAL",
    URGENCY_ALIGNMENT: "CONTEXTUAL",
  }),
  define("future", "Future Profiles", "FUTURE", "A placeholder for audience profiles that have not been defined yet.", {}, "PLACEHOLDER"),
]);
