/**
 * Landing Page Potential Signal: analyzer.
 *
 * Reads twelve structural dimensions of what a landing page could be built
 * from: how much material ProductFacts holds for each section, and whether the
 * presentation plan and completeness report agree with it. It looks at
 * presence, counts, and provenance only: it reads no wording, calls no AI,
 * crawls nothing, and uses no HTTP. It never changes its inputs and returns
 * no score, no ranking, and no recommendation.
 *
 * ProductFacts is the only authority. A value whose provenance is NOT_FOUND is
 * not material, and no other input can bring it back. DIRECT_SOURCE means the
 * source stated it, not that anyone verified it. The completeness report only
 * supplies the platform's own targets (how many items count as covered); the
 * quality prediction and the evidence result are cross-checks that can add
 * warnings and never change a rating.
 */
import type { PlanSection } from "@/lib/presentation-plan";
import type { ProductFacts } from "@/lib/product-facts";
import {
  LP_POTENTIAL_DIMENSIONS,
  type EffectiveManualOverride,
  type LandingPageDimension,
  type LandingPagePotentialInputs,
  type LandingPagePotentialResult,
  type LandingPageRating,
} from "./landing-page-potential-result";
import { validateLandingPagePotentialInputs } from "./landing-page-potential-validator";
import type { EvidenceDimension } from "./evidence-result";
import type { OpportunityIssue } from "./opportunity-validator";
import type { OpportunityMetadata } from "./opportunity-types";

export class LandingPagePotentialInputError extends Error {
  constructor(readonly issues: OpportunityIssue[]) {
    super("Landing page potential inputs are invalid.");
    this.name = "LandingPagePotentialInputError";
  }
}

export interface LandingPagePotentialAnalyzerOptions {
  /** Milliseconds clock for executionTime. */
  now?: () => number;
}

/** The provenances that mean "the source stated it" or "an operator entered it". */
export const LP_POTENTIAL_AUTHORITATIVE_PROVENANCES: readonly string[] = ["DIRECT_SOURCE", "MANUAL"];
const AUTHORITATIVE = LP_POTENTIAL_AUTHORITATIVE_PROVENANCES;

/** Structural cut-offs. Counts and shares of sections, never points. */
export const LP_POTENTIAL_THRESHOLDS = {
  /** Found / recommended at or above this share reads ADEQUATE when the target is not met. */
  adequateShare: 0.5,
  /** Structured offers needed for a side-by-side comparison. */
  offersStrong: 2,
  /** Planned content sections for STRONG readiness. */
  readinessStrongSections: 5,
  /** Planned content sections for ADEQUATE readiness. */
  readinessAdequateSections: 3,
} as const;

/** Section groups a page needs some of to hold together. Hero and closing are not content. */
export const LP_POTENTIAL_BALANCE_GROUPS: Readonly<Record<string, readonly PlanSection[]>> = {
  DESCRIBE: ["description", "usage"],
  SUBSTANCE: ["features", "ingredients"],
  CONVERSION: ["pricing", "guarantee"],
  REASSURANCE: ["faq", "warnings", "manufacturer"],
};

const CONTENT_SECTIONS = [
  "description",
  "features",
  "ingredients",
  "usage",
  "pricing",
  "guarantee",
  "warnings",
  "manufacturer",
  "faq",
] as const;
type ContentSection = (typeof CONTENT_SECTIONS)[number];

const SECTION_FOR_MISSING: Partial<Record<LandingPageDimension, string>> = {
  HERO_STRENGTH: "hero",
  FEATURE_COVERAGE: "features",
  INGREDIENT_COVERAGE: "ingredients",
  OFFER_COVERAGE: "offers",
  PRICING_COVERAGE: "pricing",
  FAQ_COVERAGE: "faq",
  GUARANTEE_COVERAGE: "guarantee",
  CTA_AVAILABILITY: "cta",
  MEDIA_AVAILABILITY: "media",
};

const EVIDENCE_FOR: Partial<Record<LandingPageDimension, EvidenceDimension>> = {
  FEATURE_COVERAGE: "FEATURES",
  INGREDIENT_COVERAGE: "INGREDIENTS",
  FAQ_COVERAGE: "FAQ",
  GUARANTEE_COVERAGE: "GUARANTEE",
  PRICING_COVERAGE: "PRICING",
};

const COMPLETENESS_FOR: Partial<Record<LandingPageDimension, string>> = {
  FEATURE_COVERAGE: "features",
  INGREDIENT_COVERAGE: "ingredients",
  FAQ_COVERAGE: "faq",
  GUARANTEE_COVERAGE: "guarantee",
  PRICING_COVERAGE: "pricing",
};

/** What one dimension found. provenances is null for a dimension derived from structure alone. */
interface Reading {
  rating: LandingPageRating;
  detail: string;
  provenances: string[] | null;
  /** Items behind the reading; 0 when none. */
  count: number;
  /** Values exist but their provenance is NOT_FOUND, so they were not counted. */
  suppressed: boolean;
}

interface Counted {
  count: number;
  provenances: string[];
  suppressed: boolean;
}

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

function filled(items: readonly string[] | undefined): string[] {
  return (items ?? []).map(clean).filter((item) => item.length > 0 && item.toUpperCase() !== "NOT_FOUND");
}

const NONE: Counted = { count: 0, provenances: [], suppressed: false };

function listOf(values: readonly string[] | undefined, provenance: string): Counted {
  const n = filled(values).length;
  if (n === 0) return NONE;
  if (provenance === "NOT_FOUND") return { count: 0, provenances: [], suppressed: true };
  return { count: n, provenances: [provenance], suppressed: false };
}

function scalarOf(value: string | undefined, provenance: string): Counted {
  return listOf(value === undefined ? [] : [value], provenance);
}

function faqOf(facts: ProductFacts): Counted {
  const seen = new Map<string, string>();
  let suppressed = false;
  for (const snippet of facts.sourceSnippets ?? []) {
    if (snippet.field !== "faq") continue;
    const question = clean(snippet.question);
    const answer = clean(snippet.text);
    if (!question && !answer) continue;
    if (snippet.confidence === "NOT_FOUND") {
      suppressed = true;
      continue;
    }
    seen.set(`${question.toLowerCase()}\n${answer.toLowerCase()}`, snippet.confidence);
  }
  return { count: seen.size, provenances: [...seen.values()], suppressed: suppressed && seen.size === 0 };
}

function offersOf(facts: ProductFacts): Counted {
  const offers = (facts.offerFacts ?? []).filter((offer) => clean(offer.unitPrice) || clean(offer.totalPrice));
  return { count: offers.length, provenances: offers.map((offer) => offer.confidence), suppressed: false };
}

function pricingOf(facts: ProductFacts, offers: Counted): Counted {
  const text = scalarOf(facts.pricingInformation, facts.confidence.pricingInformation);
  const count = text.count > 0 || offers.count > 0 ? 1 : 0;
  return {
    count,
    provenances: [...text.provenances, ...offers.provenances],
    suppressed: text.suppressed && count === 0,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return clean(value).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === "object" && value !== null) return Object.values(value).some(hasValue);
  return false;
}

function rate(found: number, recommended: number | null): LandingPageRating {
  if (found <= 0) return "MISSING";
  if (recommended === null || recommended <= 0) return "ADEQUATE";
  if (found >= recommended) return "STRONG";
  return found / recommended >= LP_POTENTIAL_THRESHOLDS.adequateShare ? "ADEQUATE" : "WEAK";
}

function coverage(counted: Counted, recommended: number | null, noun: string): Reading {
  const target = recommended === null ? "no platform target" : `${recommended} recommended`;
  return {
    rating: rate(counted.count, recommended),
    detail: `${counted.count} ${noun} in ProductFacts, ${target}.`,
    provenances: counted.provenances,
    count: counted.count,
    suppressed: counted.suppressed,
  };
}

const LEVEL: Record<string, number> = { LOW: 0, Low: 0, MEDIUM: 1, Medium: 1, HIGH: 2, High: 2, PREMIUM: 2 };

/** Analyzes validated inputs. Throws LandingPagePotentialInputError when they are not valid. */
export function analyzeLandingPagePotential(
  inputs: LandingPagePotentialInputs,
  options: LandingPagePotentialAnalyzerOptions = {},
): LandingPagePotentialResult {
  const now = options.now ?? (() => performance.now());
  const start = now();
  const problems = validateLandingPagePotentialInputs(inputs);
  if (problems.length > 0) throw new LandingPagePotentialInputError(problems);

  const { facts, completeness, presentationPlan: plan } = inputs;
  const c = facts.confidence;
  const warnings: string[] = [];
  const sectionOf = (id: string) => completeness.sections.find((section) => section.id === id);
  const target = (id: string): number | null => sectionOf(id)?.recommended ?? null;

  const features = listOf(facts.features, c.features);
  const ingredients = listOf(facts.ingredientsOrComponents, c.ingredientsOrComponents);
  const faq = faqOf(facts);
  const guarantee = scalarOf(facts.guaranteeInformation, c.guaranteeInformation);
  const description = scalarOf(facts.description, c.description);
  const usage = listOf(facts.usageInformation, c.usageInformation);
  const cautions = listOf(facts.cautions, c.cautions);
  const manufacturer = scalarOf(facts.manufacturer, c.manufacturer);
  const offers = offersOf(facts);
  const pricing = pricingOf(facts, offers);

  const factCount: Record<ContentSection, number> = {
    description: description.count,
    features: features.count,
    ingredients: ingredients.count,
    usage: usage.count,
    pricing: pricing.count,
    guarantee: guarantee.count,
    warnings: cautions.count,
    manufacturer: manufacturer.count,
    faq: faq.count,
  };

  const readings = {} as Record<LandingPageDimension, Reading>;

  // Hero: the plan's strategy must be backed by material ProductFacts holds.
  {
    const strategy = plan.heroStrategy;
    const headline = (sectionOf("hero")?.found ?? 0) > 0;
    const backed = description.count > 0 || features.count > 0;
    if (clean(facts.productName) === "" || !plan.sectionVisibility.hero) {
      readings.HERO_STRENGTH = {
        rating: "MISSING",
        detail: clean(facts.productName) === "" ? "ProductFacts holds no product name." : "The plan hides the hero section.",
        provenances: null,
        count: 0,
        suppressed: false,
      };
    } else {
      let rating: LandingPageRating = strategy === "IDENTITY" ? "WEAK" : strategy === "BENEFIT" ? "STRONG" : "ADEQUATE";
      let detail = `Hero strategy ${strategy}.`;
      if (strategy !== "IDENTITY" && !backed) {
        rating = "WEAK";
        detail = `Hero strategy ${strategy}, but ProductFacts holds no description or features to carry it.`;
        warnings.push(`HERO_STRENGTH: the plan chose ${strategy} but ProductFacts holds no description or features.`);
      } else if (strategy === "IDENTITY" && headline) {
        rating = "ADEQUATE";
        detail = "Hero strategy IDENTITY with a headline supplied.";
      }
      readings.HERO_STRENGTH = { rating, detail, provenances: null, count: backed || headline ? 1 : 0, suppressed: false };
    }
  }

  readings.FEATURE_COVERAGE = coverage(features, target("features"), "features");
  readings.INGREDIENT_COVERAGE = coverage(ingredients, target("ingredients"), "ingredients");
  readings.FAQ_COVERAGE = coverage(faq, target("faq"), "FAQ entries");
  readings.GUARANTEE_COVERAGE = coverage(guarantee, target("guarantee"), "guarantee statements");
  readings.PRICING_COVERAGE = coverage(pricing, target("pricing"), "pricing statements");

  // Offers: structured packages with a price. Two or more allow a comparison.
  readings.OFFER_COVERAGE = {
    rating: offers.count === 0 ? "MISSING" : offers.count >= LP_POTENTIAL_THRESHOLDS.offersStrong ? "STRONG" : "ADEQUATE",
    detail: `${offers.count} priced offer${offers.count === 1 ? "" : "s"} in ProductFacts.`,
    provenances: offers.provenances,
    count: offers.count,
    suppressed: false,
  };

  // CTA: only effective manual values can show one. Without them it cannot be judged.
  const overrides: readonly EffectiveManualOverride[] | null = inputs.manualOverrides ?? null;
  if (overrides === null) {
    readings.CTA_AVAILABILITY = {
      rating: "NOT_ASSESSED",
      detail: "No effective manual values were supplied, so the call to action cannot be judged.",
      provenances: null,
      count: 0,
      suppressed: false,
    };
    warnings.push("CTA_AVAILABILITY: not assessed because no effective manual values were supplied.");
  } else {
    const valueOf = (field: string) => overrides.find((entry) => entry.field === field)?.value;
    const label = typeof valueOf("cta") === "string" && clean(valueOf("cta") as string) !== "";
    const destination = typeof valueOf("trackingUrl") === "string" && isHttpUrl(clean(valueOf("trackingUrl") as string));
    const rating: LandingPageRating = label && destination ? "STRONG" : destination ? "ADEQUATE" : label ? "WEAK" : "MISSING";
    readings.CTA_AVAILABILITY = {
      rating,
      detail: `Effective call-to-action label ${label ? "present" : "absent"}, destination ${destination ? "present" : "absent"}.`,
      provenances: label || destination ? ["MANUAL"] : [],
      count: (label ? 1 : 0) + (destination ? 1 : 0),
      suppressed: false,
    };
  }

  // Media: the product image and any visual assets the completeness report counted.
  {
    const factsImage =
      clean(facts.productImageUrl) !== "" &&
      isHttpUrl(clean(facts.productImageUrl)) &&
      (facts.productImageProvenance === "DIRECT_SOURCE" || facts.productImageProvenance === "MANUAL");
    const images = sectionOf("images") ? sectionOf("images")!.found : factsImage ? 1 : 0;
    const assets = sectionOf("visualAssets")?.found ?? 0;
    const rating: LandingPageRating = images > 0 && assets > 0 ? "STRONG" : images > 0 ? "ADEQUATE" : assets > 0 ? "WEAK" : "MISSING";
    if (images > 0 && !factsImage) {
      warnings.push("MEDIA_AVAILABILITY: the completeness report counts an image that ProductFacts does not hold with DIRECT_SOURCE or MANUAL provenance.");
    }
    readings.MEDIA_AVAILABILITY = {
      rating,
      detail: `${images} product image${images === 1 ? "" : "s"} and ${assets} visual asset${assets === 1 ? "" : "s"} counted.`,
      provenances: images + assets === 0 ? [] : [factsImage ? facts.productImageProvenance : "UNKNOWN"],
      count: images + assets,
      suppressed: false,
    };
  }

  // Structure of the plan: density, balance, readiness.
  const visible = (section: PlanSection) => plan.sectionVisibility[section];
  const visibleContent = CONTENT_SECTIONS.filter(visible);

  readings.INFORMATION_DENSITY = {
    rating: visibleContent.length === 0 ? "MISSING" : plan.density === "LOW" ? "WEAK" : plan.density === "MEDIUM" ? "ADEQUATE" : "STRONG",
    detail: `${visibleContent.length} content section${visibleContent.length === 1 ? "" : "s"} planned, plan density ${plan.density}.`,
    provenances: null,
    count: visibleContent.length,
    suppressed: false,
  };

  const groupNames = Object.keys(LP_POTENTIAL_BALANCE_GROUPS);
  const presentGroups = groupNames.filter((name) => LP_POTENTIAL_BALANCE_GROUPS[name].some(visible));
  const absentGroups = groupNames.filter((name) => !presentGroups.includes(name));
  readings.SECTION_BALANCE = {
    rating: presentGroups.length === 0 ? "MISSING" : presentGroups.length <= 2 ? "WEAK" : presentGroups.length === 3 ? "ADEQUATE" : "STRONG",
    detail:
      absentGroups.length === 0
        ? `All ${groupNames.length} section groups have a planned section.`
        : `${presentGroups.length} of ${groupNames.length} section groups planned; none planned for ${absentGroups.join(", ")}.`,
    provenances: null,
    count: presentGroups.length,
    suppressed: false,
  };

  const planned = new Set<string>(plan.sectionOrder);
  const orderMismatch = Object.keys(plan.sectionVisibility).filter(
    (section) => visible(section as PlanSection) !== planned.has(section),
  );
  const unsupported = visibleContent.filter((section) => factCount[section] === 0);
  if (orderMismatch.length > 0) {
    warnings.push(`PRESENTATION_READINESS: the plan's section order and visibility disagree for ${orderMismatch.join(", ")}.`);
  }
  for (const section of unsupported) {
    warnings.push(`PRESENTATION_READINESS: the plan shows ${section} but ProductFacts holds no material for it.`);
  }
  const readiness: LandingPageRating =
    visibleContent.length === 0
      ? "MISSING"
      : orderMismatch.length > 0 || unsupported.length > 0
        ? "WEAK"
        : visibleContent.length >= LP_POTENTIAL_THRESHOLDS.readinessStrongSections
          ? "STRONG"
          : visibleContent.length >= LP_POTENTIAL_THRESHOLDS.readinessAdequateSections
            ? "ADEQUATE"
            : "WEAK";
  readings.PRESENTATION_READINESS = {
    rating: readiness,
    detail:
      orderMismatch.length > 0 || unsupported.length > 0
        ? `${visibleContent.length} content sections planned; ${unsupported.length} without material, ${orderMismatch.length} order mismatch.`
        : `${visibleContent.length} content sections planned and each has material in ProductFacts.`,
    provenances: null,
    count: visibleContent.length,
    suppressed: false,
  };

  // Provenance notes and NOT_FOUND closure.
  for (const dimension of LP_POTENTIAL_DIMENSIONS) {
    const reading = readings[dimension];
    if (reading.suppressed) {
      warnings.push(`${dimension}: values are present but their provenance is NOT_FOUND, so they are not counted as material.`);
    }
    if (reading.provenances !== null && reading.count > 0 && !reading.provenances.every((p) => AUTHORITATIVE.includes(p))) {
      const others = [...new Set(reading.provenances.filter((p) => !AUTHORITATIVE.includes(p)))].sort();
      warnings.push(`${dimension}: material rests on ${others.join(", ")} provenance, not a direct source statement or manual entry.`);
    }
  }
  if (facts.importWarnings.length > 0) {
    warnings.push(`Import reported ${facts.importWarnings.length} warning${facts.importWarnings.length === 1 ? "" : "s"}.`);
  }

  // Completeness: compared by section status only. Its score is not read.
  for (const dimension of LP_POTENTIAL_DIMENSIONS) {
    const id = COMPLETENESS_FOR[dimension];
    const section = id ? sectionOf(id) : undefined;
    if (!section || readings[dimension].suppressed) continue;
    const present = readings[dimension].count > 0;
    if (!present && section.status !== "MISSING") {
      warnings.push(`${dimension}: completeness reports ${section.status} but ProductFacts holds no material.`);
    } else if (present && section.status === "MISSING") {
      warnings.push(`${dimension}: completeness reports MISSING but ProductFacts holds material.`);
    }
  }

  // Effective manual values should already be inside the resolved ProductFacts.
  const byOverride: Record<string, number> = {
    productName: clean(facts.productName) ? 1 : 0,
    manufacturer: manufacturer.count,
    description: description.count,
    ingredients: ingredients.count,
    features: features.count,
    faq: faq.count,
    usage: usage.count,
    guarantee: guarantee.count,
    warnings: cautions.count,
    pricing: pricing.count,
  };
  for (const entry of overrides ?? []) {
    if (entry.field in byOverride && hasValue(entry.value) && byOverride[entry.field] === 0) {
      warnings.push(`${entry.field}: an effective manual value exists but ProductFacts does not hold it; the facts may not be the resolved ones.`);
    }
  }

  // Evidence Signal: a cross-check on presence.
  const evidence = inputs.evidence ?? null;
  if (evidence) {
    if (evidence.status !== "COMPLETED") {
      warnings.push("Evidence result is not COMPLETED and was not used.");
    } else {
      for (const dimension of LP_POTENTIAL_DIMENSIONS) {
        const mapped = EVIDENCE_FOR[dimension];
        if (!mapped || readings[dimension].suppressed) continue;
        const present = readings[dimension].count > 0;
        if (present && evidence.missingDimensions.includes(mapped)) {
          warnings.push(`${dimension}: ProductFacts holds material but the evidence result lists ${mapped} as missing.`);
        } else if (!present && evidence.availableDimensions.includes(mapped)) {
          warnings.push(`${dimension}: the evidence result lists ${mapped} as available but ProductFacts holds no material.`);
        }
      }
    }
  }

  // LP Quality Predictor: labels only, and only as a cross-check.
  const prediction = inputs.qualityPrediction ?? null;
  if (prediction) {
    const planLevel = readings.INFORMATION_DENSITY.rating;
    const planned = planLevel === "WEAK" ? 0 : planLevel === "ADEQUATE" ? 1 : planLevel === "STRONG" ? 2 : null;
    if (planned !== null && Math.abs(planned - LEVEL[prediction.informationDensity]) === 2) {
      warnings.push(`INFORMATION_DENSITY: the plan reads ${planLevel} but the quality prediction reports ${prediction.informationDensity} information density.`);
    }
    const bothThin = prediction.conversionReadiness === "Thin" && prediction.croReadiness === "Thin";
    const bothReady = prediction.conversionReadiness === "Ready" && prediction.croReadiness === "Ready";
    if (readiness === "STRONG" && bothThin) {
      warnings.push("PRESENTATION_READINESS: the plan reads STRONG but the quality prediction reports Thin conversion and CRO readiness.");
    } else if ((readiness === "WEAK" || readiness === "MISSING") && bothReady) {
      warnings.push(`PRESENTATION_READINESS: the plan reads ${readiness} but the quality prediction reports Ready conversion and CRO readiness.`);
    }
  }

  // Outputs.
  const by = (rating: LandingPageRating) => LP_POTENTIAL_DIMENSIONS.filter((d) => readings[d].rating === rating);
  const strong = by("STRONG");
  const adequate = by("ADEQUATE");
  const weak = by("WEAK");
  const missing = by("MISSING");
  const notAssessed = by("NOT_ASSESSED");
  const strengths = strong.map((d) => `${d}: ${readings[d].detail}`);
  const weaknesses = LP_POTENTIAL_DIMENSIONS.filter((d) => readings[d].rating === "WEAK" || readings[d].rating === "MISSING").map(
    (d) => `${d}: ${readings[d].detail}`,
  );
  const missingSections = missing.map((d) => SECTION_FOR_MISSING[d]).filter((s): s is string => s !== undefined);

  const backed = LP_POTENTIAL_DIMENSIONS.filter((d) => readings[d].provenances !== null && readings[d].count > 0);
  const authoritativeCount = backed.filter(
    (d) => readings[d].provenances!.length > 0 && readings[d].provenances!.every((p) => AUTHORITATIVE.includes(p)),
  ).length;
  const confidence = backed.length === 0 ? null : Math.round((authoritativeCount / backed.length) * 1000) / 1000;

  const metadata: OpportunityMetadata = {
    strongDimensions: strong.join(","),
    adequateDimensions: adequate.join(","),
    weakDimensions: weak.join(","),
    missingDimensions: missing.join(","),
    notAssessedDimensions: notAssessed.join(","),
    strongCount: strong.length,
    adequateCount: adequate.length,
    weakCount: weak.length,
    missingCount: missing.length,
    notAssessedCount: notAssessed.length,
    missingSections: missingSections.join(","),
    evidenceBackedCount: backed.length,
    authoritativeCount,
    planDensity: plan.density,
    heroStrategy: plan.heroStrategy,
    visibleContentSections: visibleContent.length,
    balanceGroups: presentGroups.join(","),
    importWarningCount: facts.importWarnings.length,
    qualityPredictionSupplied: prediction !== null,
    evidenceSupplied: evidence !== null,
    manualOverridesSupplied: overrides !== null,
    manualOverrideFieldCount: overrides?.filter((entry) => hasValue(entry.value)).length ?? null,
    provenanceNote: "DIRECT_SOURCE means the source stated it; it is not independently verified.",
  };
  if (prediction) {
    metadata["predictor.informationDensity"] = prediction.informationDensity;
    metadata["predictor.conversionReadiness"] = prediction.conversionReadiness;
    metadata["predictor.croReadiness"] = prediction.croReadiness;
  }
  for (const dimension of LP_POTENTIAL_DIMENSIONS) {
    metadata[`dimension.${dimension}`] = readings[dimension].rating;
    if (readings[dimension].rating === "STRONG") metadata[`strength.${dimension}`] = readings[dimension].detail;
    if (readings[dimension].rating === "WEAK" || readings[dimension].rating === "MISSING") {
      metadata[`weakness.${dimension}`] = readings[dimension].detail;
    }
  }
  for (const [key, value] of Object.entries(inputs.metadata ?? {})) metadata[`input.${key}`] = value;

  return {
    status: "COMPLETED",
    confidence,
    strengths,
    weaknesses,
    missingSections,
    warnings,
    metadata,
    executionTime: Math.max(0, now() - start),
  };
}
