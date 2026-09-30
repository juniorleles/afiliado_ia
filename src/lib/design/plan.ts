import type { PageTemplateId, PresellPage, PresellSectionId } from "@/lib/presell-page";
import type { VisualQaActionCode } from "@/lib/visual-qa/types";
import type { AssetProvenance, ProductAssetStatus } from "@/lib/assets/types";

export const DESIGN_PLAN_VERSION = 2 as const;

export const VISUAL_THEMES = ["CLEAN", "NATURAL", "BOLD", "EDITORIAL", "PREMIUM"] as const;
export type VisualTheme = (typeof VISUAL_THEMES)[number];

export const HERO_VARIANTS = [
  "PRODUCT_STAGE",
  "ASYMMETRIC_EDITORIAL",
  "PRODUCT_CANVAS",
  "MAGAZINE_PRODUCT",
  "MINIMAL_LUXURY",
  "PRODUCT_SPLIT",
  "EDITORIAL_SPLIT",
  "CENTERED_PRODUCT",
  "ASYMMETRIC_PRODUCT",
] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];

export const SECTION_VARIANTS = [
  "FACT_STRIP",
  "FEATURE_BENTO",
  "INGREDIENT_GRID",
  "EDITORIAL_SPLIT",
  "NUMBERED_STEPS",
  "PROS_CONSIDERATIONS_SPLIT",
  "GUARANTEE_PANEL",
  "FAQ_ACCORDION",
  "DETAILS_ACCORDION",
  "EDITORIAL_QUOTE_STYLE",
  "IMAGE_TEXT_SPLIT",
  "FULL_WIDTH_STATEMENT",
  "PRODUCT_FACT_CANVAS",
  "INGREDIENT_ORBIT",
  "INGREDIENT_EDITORIAL_GRID",
  "EDITORIAL_FEATURE_SPLIT",
  "VISUAL_NUMBER_STEP",
  "CONSIDERATION_COLUMNS",
  "WIDE_GUARANTEE_STATEMENT",
  "MAGAZINE_TEXT_BLOCK",
  "FACT_RIBBON",
  "VISUAL_DISCLOSURE_GROUP",
] as const;
export type SectionVariant = (typeof SECTION_VARIANTS)[number];

export const CONTENT_PRIORITIES = ["PRIMARY", "SECONDARY", "DETAIL"] as const;
export type ContentPriority = (typeof CONTENT_PRIORITIES)[number];

export const HERO_SCALES = ["editorial", "stage", "luxury"] as const;
export type HeroScale = (typeof HERO_SCALES)[number];
export const DISPLAY_SCALES = ["confident", "expressive"] as const;
export type DisplayScale = (typeof DISPLAY_SCALES)[number];
export const SECTION_SPACINGS = ["tight", "balanced", "generous"] as const;
export type SectionSpacing = (typeof SECTION_SPACINGS)[number];
export const SECTION_CONTRASTS = ["subtle", "tonal"] as const;
export type SectionContrast = (typeof SECTION_CONTRASTS)[number];
export const CORNER_LANGUAGES = ["soft", "sharp"] as const;
export type CornerLanguage = (typeof CORNER_LANGUAGES)[number];
export const SHADOW_LANGUAGES = ["none", "soft"] as const;
export type ShadowLanguage = (typeof SHADOW_LANGUAGES)[number];
export const SURFACE_DEPTHS = ["flat", "layered"] as const;
export type SurfaceDepth = (typeof SURFACE_DEPTHS)[number];
export const DECORATIVE_INTENSITIES = ["quiet", "measured"] as const;
export type DecorativeIntensity = (typeof DECORATIVE_INTENSITIES)[number];
export const IMAGE_SCALES = ["contain", "stage"] as const;
export type ImageScale = (typeof IMAGE_SCALES)[number];
export const CONTENT_RHYTHMS = ["story", "template"] as const;
export type ContentRhythm = (typeof CONTENT_RHYTHMS)[number];
export const ACCENT_PLACEMENTS = ["left", "band"] as const;
export type AccentPlacement = (typeof ACCENT_PLACEMENTS)[number];
export const STORY_BANDS = ["quiet", "impact", "compact", "wide", "split", "statement", "disclosure"] as const;
export type StoryBand = (typeof STORY_BANDS)[number];

export type ArtDirectionTokensV2 = {
  heroScale: HeroScale;
  displayScale: DisplayScale;
  sectionSpacing: SectionSpacing;
  sectionContrast: SectionContrast;
  cornerLanguage: CornerLanguage;
  shadowLanguage: ShadowLanguage;
  surfaceDepth: SurfaceDepth;
  decorativeIntensity: DecorativeIntensity;
  imageScale: ImageScale;
  imageOverlap: boolean;
  contentRhythm: ContentRhythm;
  accentPlacement: AccentPlacement;
};

export type SectionPlan = {
  id: PresellSectionId;
  variant: SectionVariant;
  priority: ContentPriority;
  collapsed: boolean;
  visibleLeadCount: number;
  band: StoryBand;
};

export type DesignPlan = {
  version: typeof DESIGN_PLAN_VERSION;
  visualTheme: VisualTheme;
  artDirection: string;
  heroVariant: HeroVariant;
  typographyScale: "confident" | "editorial";
  spacingDensity: "generous" | "compact";
  contentWidth: "wide" | "editorial";
  sectionPlans: SectionPlan[];
  productVisualStrategy: "HERO_FOCAL" | "FALLBACK_COMPOSE";
  productAssetStatus: ProductAssetStatus;
  productAssetProvenance: AssetProvenance;
  backgroundRhythm: "alternating" | "flat";
  tokens: ArtDirectionTokensV2;
  ctaStrategy: {
    hero: boolean;
    afterPrimaryFacts: boolean;
    nearGuarantee: boolean;
    final: boolean;
    stickyMobile: boolean;
  };
  mobileStrategy: {
    productAboveText: boolean;
    collapseSecondary: boolean;
    stackBento: boolean;
    stackHero: boolean;
  };
  decorativeAssets: boolean;
  appliedActionCodes: VisualQaActionCode[];
  themeLocked: boolean;
};

const DEFAULT_TOKENS: ArtDirectionTokensV2 = {
  heroScale: "editorial",
  displayScale: "expressive",
  sectionSpacing: "balanced",
  sectionContrast: "tonal",
  cornerLanguage: "soft",
  shadowLanguage: "soft",
  surfaceDepth: "layered",
  decorativeIntensity: "measured",
  imageScale: "contain",
  imageOverlap: false,
  contentRhythm: "story",
  accentPlacement: "band",
};

export function isVisualTheme(value: unknown): value is VisualTheme {
  return typeof value === "string" && (VISUAL_THEMES as readonly string[]).includes(value);
}

export function isHeroVariant(value: unknown): value is HeroVariant {
  return typeof value === "string" && (HERO_VARIANTS as readonly string[]).includes(value);
}

export function isSectionVariant(value: unknown): value is SectionVariant {
  return typeof value === "string" && (SECTION_VARIANTS as readonly string[]).includes(value);
}

function inList<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function defaultArtDirectionTokens(status: ProductAssetStatus, theme: VisualTheme): ArtDirectionTokensV2 {
  const ready = status === "READY";
  return {
    ...DEFAULT_TOKENS,
    heroScale: ready ? "stage" : theme === "EDITORIAL" ? "editorial" : "luxury",
    displayScale: "expressive",
    imageScale: ready ? "stage" : "contain",
    imageOverlap: ready,
    decorativeIntensity: ready ? "quiet" : "measured",
    surfaceDepth: "layered",
    sectionContrast: "tonal",
  };
}

export function parseDesignPlan(raw: string | null | undefined): DesignPlan | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Omit<DesignPlan, "version">> & { version?: number };
    if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) return null;
    if (!isVisualTheme(parsed.visualTheme) || !isHeroVariant(parsed.heroVariant)) return null;
    if (!Array.isArray(parsed.sectionPlans)) return null;
    const status = inList(parsed.productAssetStatus, ["READY", "NEEDS_ASSET", "NOT_APPLICABLE"], "NEEDS_ASSET");
    const tokens = {
      ...defaultArtDirectionTokens(status, parsed.visualTheme),
      ...(parsed.tokens || {}),
    };
    return {
      version: 2,
      visualTheme: parsed.visualTheme,
      artDirection: parsed.artDirection || artDirectionCopy(parsed.visualTheme, "REVIEW"),
      heroVariant: parsed.heroVariant,
      typographyScale: parsed.typographyScale === "editorial" ? "editorial" : "confident",
      spacingDensity: parsed.spacingDensity === "compact" ? "compact" : "generous",
      contentWidth: parsed.contentWidth === "editorial" ? "editorial" : "wide",
      sectionPlans: parsed.sectionPlans.map((section, index) => ({
        ...section,
        band: section.band || defaultBandForIndex(section.id, index),
      })),
      productVisualStrategy: parsed.productVisualStrategy === "HERO_FOCAL" ? "HERO_FOCAL" : "FALLBACK_COMPOSE",
      productAssetStatus: status,
      productAssetProvenance: inList(parsed.productAssetProvenance, ["DIRECT_SOURCE", "MANUAL", "NOT_FOUND"], "NOT_FOUND"),
      backgroundRhythm: parsed.backgroundRhythm === "flat" ? "flat" : "alternating",
      tokens,
      ctaStrategy: parsed.ctaStrategy || {
        hero: true,
        afterPrimaryFacts: true,
        nearGuarantee: true,
        final: true,
        stickyMobile: true,
      },
      mobileStrategy: {
        productAboveText: parsed.mobileStrategy?.productAboveText !== false,
        collapseSecondary: parsed.mobileStrategy?.collapseSecondary !== false,
        stackBento: parsed.mobileStrategy?.stackBento !== false,
        stackHero: parsed.mobileStrategy?.stackHero !== false,
      },
      decorativeAssets: parsed.decorativeAssets !== false,
      appliedActionCodes: parsed.appliedActionCodes || [],
      themeLocked: Boolean(parsed.themeLocked),
    };
  } catch {
    return null;
  }
}

export function serializeDesignPlan(plan: DesignPlan): string {
  return JSON.stringify(plan);
}

export function hasUsableProductImage(page: PresellPage): boolean {
  const image = page.hero.image;
  if (!image.src) return false;
  if (image.provenance === "PLACEHOLDER" || image.provenance === "NOT_FOUND") return false;
  if (/order[-_ ]?now|\bcta\b|buy[-_ ]?now/i.test(`${image.src} ${image.alt}`)) return false;
  return true;
}

export function packshotAvailable(plan: DesignPlan): boolean {
  return plan.productAssetStatus === "READY";
}

export function defaultThemeForTemplate(template: PageTemplateId): VisualTheme {
  if (template === "EDITORIAL") return "EDITORIAL";
  if (template === "BUYER_GUIDE") return "PREMIUM";
  return "PREMIUM";
}

export function defaultHeroVariant(
  page: PresellPage,
  theme: VisualTheme,
  status: ProductAssetStatus = hasUsableProductImage(page) ? "READY" : "NEEDS_ASSET",
): HeroVariant {
  const ready = status === "READY";
  const longHeadline = page.hero.headline.length > 72;
  if (!ready) {
    if (theme === "EDITORIAL" || longHeadline) return "MAGAZINE_PRODUCT";
    return "MINIMAL_LUXURY";
  }
  if (theme === "EDITORIAL" || longHeadline) return "ASYMMETRIC_EDITORIAL";
  if (theme === "BOLD") return "PRODUCT_CANVAS";
  if (theme === "PREMIUM" || theme === "NATURAL") return "PRODUCT_STAGE";
  return "PRODUCT_STAGE";
}

export function defaultBandForIndex(id: PresellSectionId, index: number): StoryBand {
  if (id === "guarantee") return "statement";
  if (id === "faq") return "disclosure";
  if (id === "ingredients") return "impact";
  if (id === "features") return "compact";
  if (id === "usage") return "wide";
  if (id === "considerations" || id === "pros") return "split";
  if (id === "quickSummary") return "compact";
  const cycle: StoryBand[] = ["quiet", "impact", "compact", "wide", "split", "statement", "disclosure"];
  return cycle[index % cycle.length];
}

export function defaultSectionVariant(
  id: PresellSectionId,
  template: PageTemplateId,
  status: ProductAssetStatus = "NEEDS_ASSET",
): SectionVariant {
  if (id === "quickSummary") return "FACT_RIBBON";
  if (id === "ingredients") return status === "READY" ? "INGREDIENT_ORBIT" : "INGREDIENT_EDITORIAL_GRID";
  if (id === "features") return template === "EDITORIAL" ? "EDITORIAL_FEATURE_SPLIT" : "PRODUCT_FACT_CANVAS";
  if (id === "usage") return "VISUAL_NUMBER_STEP";
  if (id === "guarantee") return "WIDE_GUARANTEE_STATEMENT";
  if (id === "faq") return "VISUAL_DISCLOSURE_GROUP";
  if (id === "overview") return "MAGAZINE_TEXT_BLOCK";
  if (id === "pros" || id === "considerations") return "CONSIDERATION_COLUMNS";
  return "FULL_WIDTH_STATEMENT";
}

export function defaultPriority(id: PresellSectionId, template: PageTemplateId): ContentPriority {
  if (id === "ingredients" || id === "usage" || id === "features" || id === "guarantee" || id === "quickSummary") {
    return "PRIMARY";
  }
  if (id === "considerations" && template === "BUYER_GUIDE") return "SECONDARY";
  if (id === "pros") return "SECONDARY";
  if (id === "considerations") return "SECONDARY";
  return "DETAIL";
}

export function defaultVisibleLead(id: PresellSectionId, priority: ContentPriority): number {
  if (id === "overview") return 2;
  if (id === "ingredients") return 6;
  if (id === "features") return 4;
  if (id === "faq") return 4;
  if (id === "considerations" || id === "pros") return 4;
  if (priority === "DETAIL") return 2;
  if (priority === "SECONDARY") return 4;
  return 8;
}

export function artDirectionCopy(theme: VisualTheme, template: PageTemplateId): string {
  return `${theme} art direction V2 for ${template}: presentation only, no new product facts.`;
}
