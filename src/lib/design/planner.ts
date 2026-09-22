import type { VariantApproach } from "@/lib/ai/generate-variants";
import { FACT_SECTION_IDS, orderedVisibleSections, type PresellPage } from "@/lib/presell-page";
import type { VisualQaActionCode, VisualQaFinding } from "@/lib/visual-qa/types";
import type { ProductAssetStatus } from "@/lib/assets/types";
import {
  artDirectionCopy,
  defaultArtDirectionTokens,
  defaultBandForIndex,
  defaultHeroVariant,
  defaultPriority,
  defaultSectionVariant,
  defaultThemeForTemplate,
  defaultVisibleLead,
  hasUsableProductImage,
  type DesignPlan,
  type HeroVariant,
  type VisualTheme,
} from "@/lib/design/plan";

function resolveAssetStatus(page: PresellPage, status?: ProductAssetStatus): ProductAssetStatus {
  if (status) return status;
  return hasUsableProductImage(page) ? "READY" : "NEEDS_ASSET";
}

export function createDesignPlan(input: {
  page: PresellPage;
  theme?: VisualTheme;
  heroVariant?: HeroVariant;
  findings?: VisualQaFinding[];
  themeLocked?: boolean;
  productAssetStatus?: ProductAssetStatus;
  productAssetProvenance?: DesignPlan["productAssetProvenance"];
  strategyHint?: VariantApproach;
}): DesignPlan {
  const template = input.page.template;
  const theme = input.theme ?? defaultThemeForTemplate(template);
  const status = resolveAssetStatus(input.page, input.productAssetStatus);
  const ready = status === "READY";
  const heroVariant = input.heroVariant ?? defaultHeroVariant(input.page, theme, status);
  const visible = orderedVisibleSections(input.page);
  const tokens = defaultArtDirectionTokens(status, theme);

  const plan: DesignPlan = {
    version: 2,
    visualTheme: theme,
    artDirection: artDirectionCopy(theme, template),
    heroVariant,
    typographyScale: theme === "EDITORIAL" ? "editorial" : "confident",
    spacingDensity: "generous",
    contentWidth: template === "EDITORIAL" ? "editorial" : "wide",
    sectionPlans: visible.map((section, index) => {
      const priority = defaultPriority(section.id, template);
      return {
        id: section.id,
        variant: defaultSectionVariant(section.id, template, status),
        priority,
        collapsed: priority === "DETAIL",
        visibleLeadCount: defaultVisibleLead(section.id, priority),
        band: defaultBandForIndex(section.id, index),
      };
    }),
    productVisualStrategy: ready ? "HERO_FOCAL" : "FALLBACK_COMPOSE",
    productAssetStatus: status,
    productAssetProvenance: input.productAssetProvenance ?? (ready ? "DIRECT_SOURCE" : "NOT_FOUND"),
    backgroundRhythm: "alternating",
    tokens,
    ctaStrategy: {
      hero: true,
      afterPrimaryFacts: template !== "EDITORIAL" && visible.some((s) => FACT_SECTION_IDS.includes(s.id)),
      nearGuarantee: visible.some((s) => s.id === "guarantee"),
      final: true,
      stickyMobile: true,
    },
    mobileStrategy: {
      productAboveText: true,
      collapseSecondary: true,
      stackBento: true,
      stackHero: true,
    },
    decorativeAssets: true,
    appliedActionCodes: [],
    themeLocked: Boolean(input.themeLocked),
  };

  if (input.findings?.length) {
    applyActionCodes(plan, uniqueActionCodes(input.findings), input.page);
  }
  if (input.strategyHint) applyStrategyVisualHint(plan, input.strategyHint);
  return plan;
}

export function applyStrategyVisualHint(plan: DesignPlan, approach: VariantApproach): DesignPlan {
  if (approach === "EDUCATIONAL") {
    plan.spacingDensity = "generous";
    for (const section of plan.sectionPlans) {
      if (section.id === "faq" || section.id === "usage") section.priority = "PRIMARY";
      if (section.priority === "DETAIL") {
        section.collapsed = true;
        plan.mobileStrategy.collapseSecondary = true;
      }
    }
  } else if (approach === "BUYER_GUIDE") {
    for (const section of plan.sectionPlans) {
      if (section.id === "considerations" || section.id === "pros") {
        section.priority = "PRIMARY";
        section.collapsed = false;
      }
    }
  } else {
    if (plan.productVisualStrategy === "HERO_FOCAL") {
      plan.productVisualStrategy = "HERO_FOCAL";
    }
  }
  return plan;
}

export function uniqueActionCodes(findings: VisualQaFinding[]): VisualQaActionCode[] {
  const codes: VisualQaActionCode[] = [];
  for (const finding of findings) {
    if (finding.severity === "INFO") continue;
    if (!codes.includes(finding.actionCode)) codes.push(finding.actionCode);
  }
  return codes;
}

export function applyActionCodes(plan: DesignPlan, codes: VisualQaActionCode[], page: PresellPage): DesignPlan {
  const ready = plan.productAssetStatus === "READY";
  for (const code of codes) {
    if (!plan.appliedActionCodes.includes(code)) plan.appliedActionCodes.push(code);
    switch (code) {
      case "REDUCE_VISIBLE_CONTENT_DENSITY":
      case "COLLAPSE_SECONDARY_DETAILS":
      case "IMPROVE_PROGRESSIVE_DISCLOSURE":
        for (const section of plan.sectionPlans) {
          if (section.priority !== "PRIMARY") {
            section.collapsed = true;
            section.visibleLeadCount = Math.min(section.visibleLeadCount, 2);
          }
        }
        plan.mobileStrategy.collapseSecondary = true;
        break;
      case "REDUCE_CARD_REPETITION":
        for (const section of plan.sectionPlans) {
          if (section.id === "overview") {
            section.variant = "MAGAZINE_TEXT_BLOCK";
            section.collapsed = true;
            section.visibleLeadCount = 2;
            section.band = "quiet";
          }
          if (section.id === "features") {
            section.variant = "PRODUCT_FACT_CANVAS";
            section.visibleLeadCount = Math.min(section.visibleLeadCount, 4);
            section.band = "compact";
          }
          if (section.id === "ingredients") {
            section.variant = ready ? "INGREDIENT_ORBIT" : "INGREDIENT_EDITORIAL_GRID";
            section.visibleLeadCount = Math.min(section.visibleLeadCount, 6);
            section.band = "impact";
          }
          if (section.id === "considerations" || section.id === "pros") {
            section.variant = "CONSIDERATION_COLUMNS";
            section.visibleLeadCount = Math.min(section.visibleLeadCount, 3);
            section.collapsed = true;
            section.band = "split";
          }
        }
        break;
      case "INCREASE_SECTION_VARIATION":
        plan.backgroundRhythm = "alternating";
        plan.tokens.contentRhythm = "story";
        plan.tokens.sectionContrast = "tonal";
        break;
      case "IMPROVE_TYPE_SCALE":
        plan.typographyScale = "confident";
        plan.spacingDensity = "generous";
        plan.tokens.displayScale = "expressive";
        break;
      case "STRENGTHEN_ART_DIRECTION":
        plan.decorativeAssets = true;
        plan.backgroundRhythm = "alternating";
        plan.tokens.surfaceDepth = "layered";
        plan.tokens.decorativeIntensity = "measured";
        break;
      case "CREATE_HERO_FOCAL_POINT":
        plan.heroVariant = ready ? "PRODUCT_STAGE" : "MAGAZINE_PRODUCT";
        plan.productVisualStrategy = ready ? "HERO_FOCAL" : "FALLBACK_COMPOSE";
        plan.tokens.heroScale = ready ? "stage" : "luxury";
        break;
      case "PROMOTE_PRODUCT_VISUAL":
        plan.heroVariant = ready ? "PRODUCT_CANVAS" : "MINIMAL_LUXURY";
        plan.productVisualStrategy = ready ? "HERO_FOCAL" : "FALLBACK_COMPOSE";
        plan.mobileStrategy.productAboveText = true;
        plan.tokens.imageOverlap = ready;
        break;
      case "ACQUIRE_PRODUCT_IMAGE":
        plan.productVisualStrategy = ready ? "HERO_FOCAL" : "FALLBACK_COMPOSE";
        if (!ready) {
          plan.heroVariant = "MAGAZINE_PRODUCT";
          plan.productAssetStatus = "NEEDS_ASSET";
        }
        break;
      case "IMPROVE_CTA_DISTRIBUTION":
        plan.ctaStrategy.hero = true;
        plan.ctaStrategy.afterPrimaryFacts = page.template !== "EDITORIAL";
        plan.ctaStrategy.final = true;
        plan.ctaStrategy.stickyMobile = true;
        break;
      case "IMPROVE_MOBILE_COMPOSITION":
        plan.mobileStrategy = { productAboveText: true, collapseSecondary: true, stackBento: true, stackHero: true };
        plan.heroVariant = ready ? "PRODUCT_STAGE" : "MINIMAL_LUXURY";
        break;
      case "ADD_VISUAL_ASSET_SLOT":
        plan.decorativeAssets = true;
        break;
      case "REMOVE_FAKE_TRUST_SIGNAL":
        break;
      default:
        break;
    }
  }
  if (!ready) {
    plan.productVisualStrategy = "FALLBACK_COMPOSE";
    plan.tokens.imageOverlap = false;
    if (
      codes.includes("ACQUIRE_PRODUCT_IMAGE") ||
      codes.includes("PROMOTE_PRODUCT_VISUAL") ||
      codes.includes("CREATE_HERO_FOCAL_POINT")
    ) {
      plan.heroVariant = "MAGAZINE_PRODUCT";
    }
  }
  return plan;
}

export function plansEqual(a: DesignPlan, b: DesignPlan): boolean {
  const left = { ...a, appliedActionCodes: [...a.appliedActionCodes].sort() };
  const right = { ...b, appliedActionCodes: [...b.appliedActionCodes].sort() };
  return JSON.stringify(left) === JSON.stringify(right);
}
