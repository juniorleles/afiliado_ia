/**
 * Presentation Planner.
 * Turns a ProductProfile into a plan for later composers.
 * It does not write copy, change facts, or draw a page.
 */
import type { ProductFacts } from "@/lib/product-facts";
import type { ProductDensity, ProductProfile } from "@/lib/product-profile";

export const PRESENTATION_PLAN_VERSION = "presentation-plan-v1" as const;

export const PLAN_SECTIONS = [
  "hero",
  "description",
  "features",
  "ingredients",
  "usage",
  "pricing",
  "guarantee",
  "warnings",
  "manufacturer",
  "faq",
  "closing",
] as const;
export type PlanSection = (typeof PLAN_SECTIONS)[number];

export const HERO_STRATEGIES = ["IDENTITY", "VALUE", "BENEFIT", "DESCRIPTION", "FEATURE_CHIPS"] as const;
export type HeroStrategy = (typeof HERO_STRATEGIES)[number];

export const INGREDIENT_VARIANTS = ["EDITORIAL", "GRID", "COMPACT", "DENSE"] as const;
export type IngredientVariant = (typeof INGREDIENT_VARIANTS)[number];

export const FEATURE_VARIANTS = ["HIGHLIGHT", "CARDS", "MOSAIC", "LIST"] as const;
export type FeatureVariant = (typeof FEATURE_VARIANTS)[number];

export const PRICING_VARIANTS = ["NONE", "SINGLE", "COMPARISON", "GRID"] as const;
export type PricingVariant = (typeof PRICING_VARIANTS)[number];

export const SPACING_PROFILES = ["COMPACT", "NORMAL", "AIRY"] as const;
export type SpacingProfile = (typeof SPACING_PROFILES)[number];

export const RHYTHM_PROFILES = ["FAST", "BALANCED", "EDITORIAL"] as const;
export type RhythmProfile = (typeof RHYTHM_PROFILES)[number];

export type SectionVariants = {
  ingredients: IngredientVariant | "NONE";
  features: FeatureVariant | "NONE";
  pricing: PricingVariant;
};

export type PresentationPlan = {
  version: typeof PRESENTATION_PLAN_VERSION;
  density: ProductDensity;
  heroStrategy: HeroStrategy;
  sectionOrder: PlanSection[];
  sectionVisibility: Record<PlanSection, boolean>;
  sectionVariants: SectionVariants;
  spacingProfile: SpacingProfile;
  rhythmProfile: RhythmProfile;
  emphasisProfile: PlanSection[];
};

/** Priority after the hero. Hidden sections drop out, so the same list is not one fixed page. */
const PRIORITY: Record<ProductDensity, readonly PlanSection[]> = {
  LOW: ["ingredients", "usage", "features", "description", "guarantee", "warnings", "manufacturer", "pricing", "faq", "closing"],
  MEDIUM: ["description", "ingredients", "features", "usage", "pricing", "guarantee", "warnings", "manufacturer", "faq", "closing"],
  HIGH: ["description", "features", "ingredients", "pricing", "usage", "guarantee", "warnings", "manufacturer", "faq", "closing"],
  PREMIUM: ["description", "features", "ingredients", "pricing", "usage", "guarantee", "warnings", "manufacturer", "faq", "closing"],
};

function heroStrategyFor(profile: ProductProfile): HeroStrategy {
  const low = profile.density === "LOW" || profile.density === "MEDIUM";
  if (low && !profile.descriptionPresent && profile.featureCount >= 2) return "FEATURE_CHIPS";
  if (profile.descriptionPresent && profile.featureCount === 0) return "DESCRIPTION";
  if (profile.descriptionPresent && (profile.density === "HIGH" || profile.density === "PREMIUM") && profile.featureCount > 0) {
    return "BENEFIT";
  }
  if (profile.descriptionPresent && profile.featureCount > 0) return "VALUE";
  if (!profile.descriptionPresent && profile.featureCount >= 3 && (profile.density === "HIGH" || profile.density === "PREMIUM")) {
    return "BENEFIT";
  }
  return "IDENTITY";
}

function ingredientVariant(profile: ProductProfile): IngredientVariant | "NONE" {
  if (profile.ingredientCount === 0) return "NONE";
  if (profile.ingredientCount >= 10) return "DENSE";
  if (profile.ingredientCount >= 4 && (profile.density === "HIGH" || profile.density === "PREMIUM")) return "GRID";
  if (profile.ingredientCount <= 3) return "COMPACT";
  return "EDITORIAL";
}

function featureVariant(profile: ProductProfile): FeatureVariant | "NONE" {
  if (profile.featureCount === 0) return "NONE";
  if (profile.featureCount === 1) return "HIGHLIGHT";
  if (profile.featureCount <= 3) return "CARDS";
  if (profile.density === "HIGH" || profile.density === "PREMIUM") return "MOSAIC";
  return "LIST";
}

function pricingVariant(profile: ProductProfile): PricingVariant {
  if (!profile.pricingPresent && profile.offerCount === 0) return "NONE";
  if (profile.offerCount >= 3) return "GRID";
  if (profile.offerCount === 2) return "COMPARISON";
  return "SINGLE";
}

function visibilityFor(profile: ProductProfile): Record<PlanSection, boolean> {
  const closing = profile.density === "HIGH" || profile.density === "PREMIUM";
  return {
    hero: true,
    description: profile.descriptionPresent,
    features: profile.featureCount > 0,
    ingredients: profile.ingredientCount > 0,
    usage: profile.usagePresent,
    pricing: profile.pricingPresent || profile.offerCount > 0,
    guarantee: profile.guaranteePresent,
    warnings: profile.warningCount > 0,
    manufacturer: profile.manufacturerPresent,
    faq: profile.faqCount > 0,
    closing,
  };
}

function emphasisFor(profile: ProductProfile, visible: Record<PlanSection, boolean>): PlanSection[] {
  const ranked: PlanSection[] = ["hero"];
  if (visible.pricing && profile.offerCount >= 2) ranked.push("pricing");
  if (visible.ingredients && profile.ingredientCount >= 4) ranked.push("ingredients");
  else if (visible.features && profile.featureCount >= 3) ranked.push("features");
  if (visible.description && (profile.density === "HIGH" || profile.density === "PREMIUM")) ranked.push("description");
  if (visible.guarantee && (profile.density === "LOW" || profile.density === "MEDIUM")) ranked.push("guarantee");
  return ranked.slice(0, 4);
}

function spacingFor(density: ProductDensity): SpacingProfile {
  if (density === "LOW") return "COMPACT";
  if (density === "PREMIUM" || density === "HIGH") return "AIRY";
  return "NORMAL";
}

function rhythmFor(density: ProductDensity): RhythmProfile {
  if (density === "LOW") return "FAST";
  if (density === "PREMIUM") return "EDITORIAL";
  return "BALANCED";
}

/**
 * `facts` is the contract for later composers. This planner does not read
 * wording from it. Density and visibility come from the profile.
 */
export function planPresentation(facts: ProductFacts, profile: ProductProfile): PresentationPlan {
  void facts;
  const density = profile.density;
  const sectionVisibility = visibilityFor(profile);
  const sectionOrder = (["hero", ...PRIORITY[density]] as PlanSection[]).filter((section) => sectionVisibility[section]);
  return {
    version: PRESENTATION_PLAN_VERSION,
    density,
    heroStrategy: heroStrategyFor(profile),
    sectionOrder,
    sectionVisibility,
    sectionVariants: {
      ingredients: ingredientVariant(profile),
      features: featureVariant(profile),
      pricing: pricingVariant(profile),
    },
    spacingProfile: spacingFor(density),
    rhythmProfile: rhythmFor(density),
    emphasisProfile: emphasisFor(profile, sectionVisibility),
  };
}
