/**
 * Adaptive component composers.
 * PresentationPlan chooses the variant. These functions only name that
 * variant and pick an already-authorized line for it. They do not write copy.
 */
import type {
  HeroStrategy,
  IngredientVariant,
  PlanSection,
  PresentationPlan,
  PricingVariant,
  SpacingProfile,
} from "@/lib/presentation-plan";

export const FAQ_TREATMENTS = ["ACCORDION", "CARDS", "COMPACT", "EDITORIAL"] as const;
export type FaqTreatment = (typeof FAQ_TREATMENTS)[number];

export const USAGE_TREATMENTS = ["COMPACT", "EDITORIAL"] as const;
export type UsageTreatment = (typeof USAGE_TREATMENTS)[number];

export const GUARANTEE_TREATMENTS = ["BAND", "PLAIN", "EMPHASIS", "EDITORIAL"] as const;
export type GuaranteeTreatment = (typeof GUARANTEE_TREATMENTS)[number];

export type PageDensity = "low" | "medium" | "rich";
export type ContentDensity = "compact" | "standard";

export type ComponentDirection = {
  heroStrategy: HeroStrategy;
  heroHeadline: string;
  heroSupport: string;
  heroChips: string[];
  featureVariant: "HIGHLIGHT" | "LIST" | "CARDS" | "MOSAIC" | "CHIPS" | null;
  ingredientVariant: IngredientVariant | null;
  pricingVariant: PricingVariant;
  faqVariant: FaqTreatment | null;
  usageVariant: UsageTreatment | null;
  guaranteeVariant: GuaranteeTreatment | null;
  closing: string;
  collapseClosing: boolean;
  pageDensity: PageDensity;
  contentDensity: ContentDensity;
  spacingProfile: SpacingProfile;
  rhythmProfile: PresentationPlan["rhythmProfile"];
  omitDecorativePause: boolean;
  emphasis: readonly PlanSection[];
};

const SAFE_WORDS = 14;
const SAFE_CHARS = 90;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return clean(value).replace(/[.\u2026]+$/g, "").toLowerCase();
}

function same(a: string, b: string): boolean {
  const left = normalize(a);
  return left.length > 0 && left === normalize(b);
}

function wordCount(value: string): number {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function isFeatureDump(headline: string, units: readonly string[]): boolean {
  if (!clean(headline) || units.length === 0) return false;
  if (units.length === 1) return same(headline, units[0]) && wordCount(headline) > SAFE_WORDS;
  const host = normalize(headline);
  let cursor = 0;
  for (const unit of units) {
    const token = normalize(unit);
    if (!token) return false;
    const at = host.indexOf(token, cursor);
    if (at < 0) return false;
    cursor = at + token.length;
  }
  return true;
}

function safeLine(candidates: readonly string[], blocked: readonly string[]): string {
  for (const candidate of candidates) {
    const text = clean(candidate);
    if (!text || blocked.some((item) => same(text, item))) continue;
    if (wordCount(text) <= SAFE_WORDS && text.length <= SAFE_CHARS) return text;
  }
  return "";
}

/**
 * A thin facts profile must not collapse a page the renderer already
 * composed as rich. That keeps a full editorial page on its own shell.
 */
export function followsPresentationPlan(plan: PresentationPlan, renderedMode: PageDensity): boolean {
  return !(renderedMode === "rich" && plan.density === "LOW");
}

function pageDensityFor(plan: PresentationPlan): PageDensity {
  if (plan.density === "LOW") return "low";
  if (plan.density === "MEDIUM") return "medium";
  return "rich";
}

function contentDensityFor(plan: PresentationPlan, legacy: ContentDensity): ContentDensity {
  if (plan.density === "LOW" || plan.spacingProfile === "COMPACT") return "compact";
  if (plan.density === "HIGH" || plan.density === "PREMIUM" || plan.spacingProfile === "AIRY") return "standard";
  return legacy;
}

function faqVariant(plan: PresentationPlan): FaqTreatment | null {
  if (!plan.sectionVisibility.faq) return null;
  if (plan.rhythmProfile === "EDITORIAL") return "EDITORIAL";
  if (plan.spacingProfile === "COMPACT") return "COMPACT";
  if (plan.density === "HIGH" || plan.density === "PREMIUM") return "CARDS";
  return "ACCORDION";
}

function usageVariant(plan: PresentationPlan): UsageTreatment | null {
  if (!plan.sectionVisibility.usage) return null;
  if (plan.spacingProfile === "COMPACT" || plan.density === "LOW") return "COMPACT";
  return "EDITORIAL";
}

function guaranteeVariant(plan: PresentationPlan): GuaranteeTreatment | null {
  if (!plan.sectionVisibility.guarantee) return null;
  if (plan.emphasisProfile.includes("guarantee")) return "EMPHASIS";
  if (plan.rhythmProfile === "EDITORIAL") return "EDITORIAL";
  if (plan.spacingProfile === "COMPACT") return "PLAIN";
  return "BAND";
}

function heroCopy(input: {
  plan: PresentationPlan;
  identity: string;
  headline: string;
  subheadline: string;
  summary: string;
  description: string;
  featureUnits: readonly string[];
}): { headline: string; support: string; chips: string[] } {
  const identity = clean(input.identity);
  const given = clean(input.headline);
  const description = clean(input.description);
  const dump = isFeatureDump(given, input.featureUnits);
  const blocked = [...input.featureUnits, ...(dump ? [given] : [])];
  const value = safeLine([input.subheadline, input.summary], [given, identity, ...blocked]);
  const described = safeLine([description], [given, identity, ...blocked]);
  const givenSafe = !dump && safeLine([given], blocked);
  const identityOrGiven = identity || givenSafe || given;

  switch (input.plan.heroStrategy) {
    case "FEATURE_CHIPS":
      return { headline: identity || givenSafe || given, support: "", chips: [...input.featureUnits] };
    case "DESCRIPTION":
      return described
        ? { headline: described, support: "", chips: [] }
        : { headline: identityOrGiven, support: description && !same(description, identityOrGiven) ? description : "", chips: [] };
    case "VALUE":
      return {
        headline: value || identityOrGiven,
        support: description && !same(description, value || identityOrGiven) ? description : "",
        chips: [],
      };
    case "BENEFIT":
      return {
        headline: givenSafe || identityOrGiven,
        support: value && !same(value, givenSafe || identityOrGiven) ? value : "",
        chips: [],
      };
    case "IDENTITY":
    default:
      return { headline: identity || givenSafe || given, support: "", chips: [] };
  }
}

function closingLine(heroHeadline: string, identity: string, given: string, dump: boolean): string {
  const name = clean(identity);
  const original = clean(given);
  if (dump) return name || heroHeadline;
  if (same(original, heroHeadline) && name && !same(name, heroHeadline)) return name;
  return original || heroHeadline;
}

export function composeComponents(input: {
  plan: PresentationPlan;
  identity: string;
  headline: string;
  subheadline: string;
  summary: string;
  description: string;
  featureUnits: readonly string[];
  legacyContentDensity: ContentDensity;
}): ComponentDirection {
  const hero = heroCopy(input);
  const dump = isFeatureDump(clean(input.headline), input.featureUnits);
  const chips = input.plan.heroStrategy === "FEATURE_CHIPS" && hero.chips.length > 0;
  const featureVariant = chips
    ? "CHIPS"
    : input.plan.sectionVisibility.features
      ? input.plan.sectionVariants.features === "NONE"
        ? null
        : input.plan.sectionVariants.features
      : null;
  const ingredientVariant =
    input.plan.sectionVisibility.ingredients && input.plan.sectionVariants.ingredients !== "NONE"
      ? input.plan.sectionVariants.ingredients
      : null;
  const pageDensity = pageDensityFor(input.plan);
  return {
    heroStrategy: input.plan.heroStrategy,
    heroHeadline: hero.headline,
    heroSupport: hero.support,
    heroChips: chips ? hero.chips : [],
    featureVariant,
    ingredientVariant,
    pricingVariant: input.plan.sectionVisibility.pricing ? input.plan.sectionVariants.pricing : "NONE",
    faqVariant: faqVariant(input.plan),
    usageVariant: usageVariant(input.plan),
    guaranteeVariant: guaranteeVariant(input.plan),
    closing: closingLine(hero.headline, input.identity, input.headline, dump),
    collapseClosing: !input.plan.sectionVisibility.closing,
    pageDensity,
    contentDensity: contentDensityFor(input.plan, input.legacyContentDensity),
    spacingProfile: input.plan.spacingProfile,
    rhythmProfile: input.plan.rhythmProfile,
    omitDecorativePause: pageDensity === "low",
    emphasis: input.plan.emphasisProfile,
  };
}
