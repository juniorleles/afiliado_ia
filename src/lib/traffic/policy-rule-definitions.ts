/**
 * Policy Risk Signal: the built-in rules and safeguard sources.
 *
 * These are initial, generic, English-language rules written as plain
 * metadata. They are not the policy of any platform, advertiser program, or
 * regulator, they cite none, and they are not complete. They exist so the
 * signal works out of the box and so a reviewer has something concrete to
 * correct. Replace or extend them through the rule registry.
 *
 * A match only means the phrase appears in the supplied content. Phrases are
 * compared as whole words, so a phrase inside a longer word does not match,
 * but the same phrase used in a harmless sense (or negated) does match. That
 * is why a result calls them potential risks.
 */
import type { PolicyRule } from "./policy-rule-registry";
import type { PolicySafeguard, PolicySafeguardSources } from "./policy-risk-result";
import { freezeDeepTraffic } from "./traffic-signal-context";

/**
 * For each safeguard: the Opportunity dimensions that can show it, and the
 * Landing Page section kinds that carry it. A safeguard is present when a
 * visible section of one of its kinds exists, when a disclaimer-style phrase
 * provides it, or when an Opportunity dimension reports it strong.
 */
export const DEFAULT_SAFEGUARD_SOURCES: PolicySafeguardSources = freezeDeepTraffic({
  DISCLAIMER: { opportunityDimensions: [], sectionKinds: ["disclaimer", "warnings"] },
  PRICING_DISCLOSURE: { opportunityDimensions: ["PRICING", "PRICING_COVERAGE"], sectionKinds: ["pricing"] },
  RETURN_TERMS: { opportunityDimensions: ["RETURNS", "GUARANTEE", "GUARANTEE_COVERAGE"], sectionKinds: ["guarantee"] },
  SHIPPING_TERMS: { opportunityDimensions: ["SHIPPING"], sectionKinds: [] },
  MANUFACTURER_IDENTITY: { opportunityDimensions: ["MANUFACTURER"], sectionKinds: ["manufacturer"] },
  PAGE_READINESS: { opportunityDimensions: ["PRESENTATION_READINESS"], sectionKinds: [] },
  CONTENT_SUBSTANCE: { opportunityDimensions: ["INFORMATION_DENSITY", "SUPPORTING_CONTENT"], sectionKinds: [] },
});

const NOTE = { origin: "initial generic rule", status: "needs review" } as const;
const DISCLAIMER: readonly PolicySafeguard[] = ["DISCLAIMER"];

function rule(over: Partial<PolicyRule> & Pick<PolicyRule, "id" | "name" | "description" | "dimension" | "kind">): PolicyRule {
  return { version: "1.0.0", enabled: true, indicators: [], sectionKinds: [], requires: [], provides: [], metadata: { ...NOTE }, ...over };
}

export const DEFAULT_POLICY_RULES: readonly PolicyRule[] = freezeDeepTraffic([
  rule({
    id: "medical-claims",
    name: "Medical claims",
    description: "Language that presents the offer as treating, curing, or preventing a medical condition.",
    dimension: "MEDICAL_CLAIMS",
    kind: "RISK",
    indicators: ["cure", "cures", "treats", "heals", "reverses", "prevents disease", "clinically proven", "doctor recommended", "relieves pain", "lowers blood pressure", "diabetes", "cancer"],
    requires: DISCLAIMER,
  }),
  rule({
    id: "weight-loss-claims",
    name: "Weight loss claims",
    description: "Language that promises weight or fat loss.",
    dimension: "WEIGHT_LOSS_CLAIMS",
    kind: "RISK",
    indicators: ["lose weight", "weight loss", "burn fat", "fat burner", "melt fat", "slimming", "shed pounds", "drop pounds"],
    requires: DISCLAIMER,
  }),
  rule({
    id: "before-after-references",
    name: "Before and after references",
    description: "References to before-and-after comparisons.",
    dimension: "BEFORE_AFTER_REFERENCES",
    kind: "RISK",
    indicators: ["before and after", "before & after", "before/after", "before after", "transformation photo", "results photo"],
    sectionKinds: ["before-after", "before_after"],
    requires: DISCLAIMER,
  }),
  rule({
    id: "financial-claims",
    name: "Financial claims",
    description: "Language about financial outcomes or returns.",
    dimension: "FINANCIAL_CLAIMS",
    kind: "RISK",
    indicators: ["guaranteed returns", "risk-free", "risk free", "passive income", "get rich", "double your money", "financial freedom", "investment opportunity"],
    requires: DISCLAIMER,
  }),
  rule({
    id: "income-claims",
    name: "Income claims",
    description: "Language about how much a person can earn.",
    dimension: "INCOME_CLAIMS",
    kind: "RISK",
    indicators: ["earn money", "make money", "six figures", "six-figure", "quit your job", "daily income", "monthly income", "income potential"],
    requires: DISCLAIMER,
  }),
  rule({
    id: "guarantee-language",
    name: "Guarantee language",
    description: "Language that promises a result or a refund.",
    dimension: "GUARANTEE_LANGUAGE",
    kind: "RISK",
    indicators: ["guaranteed", "guarantee", "money-back", "money back", "100% satisfaction"],
    requires: ["RETURN_TERMS"],
  }),
  rule({
    id: "urgency-language",
    name: "Urgency language",
    description: "Language that pressures the reader to act at once.",
    dimension: "URGENCY_LANGUAGE",
    kind: "RISK",
    indicators: ["act now", "hurry", "limited time", "today only", "expires soon", "don't wait", "last chance", "ends tonight"],
  }),
  rule({
    id: "scarcity-language",
    name: "Scarcity language",
    description: "Language that claims limited availability.",
    dimension: "SCARCITY_LANGUAGE",
    kind: "RISK",
    indicators: ["limited stock", "limited supply", "only a few left", "few left", "while supplies last", "almost sold out", "selling out"],
  }),
  rule({
    id: "testimonials",
    name: "Testimonials",
    description: "Testimonial language, or a testimonial section on the page.",
    dimension: "TESTIMONIALS",
    kind: "RISK",
    indicators: ["testimonial", "testimonials", "verified buyer", "real customers", "customer story", "changed my life", "my results"],
    sectionKinds: ["testimonials", "testimonial", "reviews"],
    requires: DISCLAIMER,
  }),
  rule({
    id: "compliance-disclaimer-language",
    name: "Disclaimer language",
    description: "Disclaimer-style wording that shows a disclaimer is present.",
    dimension: "COMPLIANCE_DISCLAIMERS",
    kind: "SAFEGUARD_INDICATOR",
    indicators: ["results may vary", "individual results", "not medical advice", "not financial advice", "consult your doctor", "consult a physician", "not guaranteed", "past performance"],
    provides: DISCLAIMER,
  }),
  rule({
    id: "restricted-categories",
    name: "Restricted categories",
    description: "Mentions of categories that are commonly restricted or regulated.",
    dimension: "RESTRICTED_CATEGORIES",
    kind: "RISK",
    indicators: ["prescription", "firearm", "weapon", "tobacco", "vape", "cannabis", "gambling", "counterfeit", "steroid"],
  }),
  rule({
    id: "destination-quality",
    name: "Destination quality",
    description: "Whether the page is ready and substantial enough to be a destination.",
    dimension: "DESTINATION_QUALITY",
    kind: "SAFEGUARD_CHECK",
    requires: ["PAGE_READINESS", "CONTENT_SUBSTANCE"],
  }),
  rule({
    id: "transparency-signals",
    name: "Transparency signals",
    description: "Whether the page states the price, the return terms, and who makes the product.",
    dimension: "TRANSPARENCY_SIGNALS",
    kind: "SAFEGUARD_CHECK",
    requires: ["PRICING_DISCLOSURE", "RETURN_TERMS", "MANUFACTURER_IDENTITY"],
  }),
]);
