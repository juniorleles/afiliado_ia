/**
 * Presentation density only.
 * Counts and structure choose the layout. Wording stays the authorized text.
 * Nothing here adds a claim, a price, or a product-specific branch.
 */
import type { PresellSection } from "@/lib/presell-page";
import { structuredSplit } from "@/lib/presell-structured-display";

export type DensityMode = "low" | "medium" | "rich";
export type FeaturePresentation = "paragraphs" | "strip" | "cards" | "grid" | "chips";
export type IngredientPresentation = "notes" | "editorial" | "dense";
export type HeroStrategy = "given" | "identity" | "value";

export type AdaptivePresentation = {
  mode: DensityMode;
  identity: string;
  heroStrategy: HeroStrategy;
  heroHeadline: string;
  heroSupport: string;
  heroChips: string[];
  replacedFeatureHeadline: boolean;
  featurePresentation: FeaturePresentation;
  featurePlacement: "hero" | "section";
  featureUnits: string[];
  ingredientPresentation: IngredientPresentation;
  ingredientUnits: string[];
  closing: string;
  omitDecorativePause: boolean;
  omitSectionMoment: boolean;
};

const SHORT_LABEL_WORDS = 8;
const SHORT_LABEL_CHARS = 64;
const LONG_TEXT_WORDS = 8;
const LIST_COVERAGE = 0.55;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[.\u2026]+$/g, "").trim().toLowerCase();
}

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function same(a: string, b: string): boolean {
  const left = normalize(a);
  return left.length > 0 && left === normalize(b);
}

function isShortLabel(value: string): boolean {
  return words(value).length <= SHORT_LABEL_WORDS && value.trim().length <= SHORT_LABEL_CHARS;
}

function isLongText(value: string): boolean {
  return words(value).length >= LONG_TEXT_WORDS || value.trim().length >= SHORT_LABEL_CHARS;
}

function visible(sections: ReadonlyArray<PresellSection>, id: PresellSection["id"]): PresellSection | undefined {
  return sections.find((section) => section.id === id && section.visible);
}

/** The authorized list, when the line is that list and not a longer sentence that mentions it. */
export function recoverAuthorizedList(text: string, groups: ReadonlyArray<ReadonlyArray<string>>): string[] | null {
  const exact = structuredSplit(text, groups);
  if (exact) return exact;
  const normalized = normalize(text);
  if (!normalized) return null;
  let best: string[] | null = null;
  let bestCoverage = 0;
  for (const group of groups) {
    if (group.length < 2) continue;
    let cursor = 0;
    let covered = 0;
    let matched = true;
    for (const item of group) {
      const token = normalize(item);
      if (!token) {
        matched = false;
        break;
      }
      const at = normalized.indexOf(token, cursor);
      if (at < 0) {
        matched = false;
        break;
      }
      covered += token.length;
      cursor = at + token.length;
    }
    if (!matched) continue;
    const coverage = covered / normalized.length;
    if (coverage >= LIST_COVERAGE && coverage > bestCoverage) {
      best = [...group];
      bestCoverage = coverage;
    }
  }
  return best;
}

function unitsFor(section: PresellSection | undefined, groups: ReadonlyArray<ReadonlyArray<string>>): string[] {
  if (!section) return [];
  if (section.cards.length > 0) {
    return section.cards.map((card) => card.title.trim()).filter(Boolean);
  }
  if (section.bullets.length > 0) {
    return section.bullets.map((item) => item.trim()).filter(Boolean);
  }
  const paragraphs = section.paragraphs.map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length === 1) {
    const recovered = recoverAuthorizedList(paragraphs[0], groups);
    if (recovered) return recovered;
  }
  return paragraphs;
}

function containsEveryUnit(text: string, units: string[]): boolean {
  if (units.length === 0) return false;
  const host = normalize(text);
  let cursor = 0;
  for (const unit of units) {
    const token = normalize(unit);
    const at = host.indexOf(token, cursor);
    if (at < 0) return false;
    cursor = at + token.length;
  }
  return true;
}

function headlineIsFeatureDump(headline: string, units: string[]): boolean {
  if (!headline.trim() || units.length === 0) return false;
  if (units.length === 1) return same(headline, units[0]) && isLongText(headline);
  return containsEveryUnit(headline, units);
}

function conciseValue(candidates: string[], blocked: string[]): string {
  for (const candidate of candidates) {
    const text = candidate.replace(/\s+/g, " ").trim();
    if (!text || blocked.some((item) => same(text, item))) continue;
    const count = words(text).length;
    if (count >= 4 && count <= 22 && text.length <= 160) return text;
  }
  return "";
}

export function composeAdaptivePresentation(input: {
  productName: string;
  headline: string;
  subheadline: string;
  summary: string;
  sections: ReadonlyArray<PresellSection>;
  structuredLists: ReadonlyArray<ReadonlyArray<string>>;
  offerCount: number;
}): AdaptivePresentation {
  const identity = input.productName.trim();
  const featureUnits = unitsFor(visible(input.sections, "features"), input.structuredLists);
  const ingredientUnits = unitsFor(visible(input.sections, "ingredients"), input.structuredLists);
  const overview = visible(input.sections, "overview");
  const faq = visible(input.sections, "faq");
  const overviewText = overview ? [...overview.paragraphs, ...overview.bullets].join(" ").trim() : "";
  const proseFeatures = featureUnits.filter((unit) => !isShortLabel(unit)).length;
  const faqCount = faq?.faq.length ?? 0;
  const offers = input.offerCount;

  const rich =
    offers >= 2 ||
    ingredientUnits.length >= 10 ||
    proseFeatures >= 4 ||
    faqCount >= 3 ||
    (overviewText.length >= 80 && proseFeatures >= 2);
  const low =
    !rich &&
    offers === 0 &&
    ingredientUnits.length <= 8 &&
    proseFeatures <= 1 &&
    faqCount === 0 &&
    overviewText.length < 80;
  const mode: DensityMode = rich ? "rich" : low ? "low" : "medium";

  const allShort = featureUnits.length > 0 && proseFeatures === 0;
  const count = featureUnits.length;
  let featurePresentation: FeaturePresentation = "paragraphs";
  let featurePlacement: "hero" | "section" = "section";
  if (count === 1) {
    featurePresentation = "strip";
  } else if (count >= 4 && mode !== "low") {
    featurePresentation = "grid";
  } else if (count >= 2 && count <= 3 && allShort) {
    featurePresentation = "cards";
  } else if (mode === "low" && allShort && count >= 4) {
    featurePresentation = "chips";
    featurePlacement = "hero";
  }

  const dump = headlineIsFeatureDump(input.headline, featureUnits);
  const value = conciseValue([input.subheadline, input.summary], [input.headline, ...featureUnits, identity]);
  const replacedFeatureHeadline = Boolean(dump && identity);
  let heroStrategy: HeroStrategy = "given";
  let heroHeadline = input.headline.trim();
  let heroSupport = "";
  let heroChips: string[] = [];
  if (replacedFeatureHeadline) {
    heroHeadline = identity;
    heroStrategy = value ? "value" : "identity";
    heroSupport = value;
    if (featurePlacement === "hero") heroChips = featureUnits;
  } else {
    const candidate = input.subheadline.trim() || input.summary.trim();
    heroSupport = candidate && !same(candidate, heroHeadline) ? candidate : "";
  }

  const closing = replacedFeatureHeadline && isLongText(input.headline) ? identity : input.headline.trim();
  const ingredientPresentation: IngredientPresentation =
    ingredientUnits.length >= 9 ? "dense" : mode === "low" && ingredientUnits.length > 0 ? "editorial" : "notes";

  return {
    mode,
    identity,
    heroStrategy,
    heroHeadline,
    heroSupport,
    heroChips,
    replacedFeatureHeadline,
    featurePresentation,
    featurePlacement,
    featureUnits,
    ingredientPresentation,
    ingredientUnits,
    closing,
    omitDecorativePause: mode === "low",
    omitSectionMoment: mode === "low",
  };
}
