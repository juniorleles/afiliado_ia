import type { VariantApproach } from "@/lib/ai/generate-variants";
import type { CreativeCompositionPlan } from "@/lib/creative/types";
import type { DesignPlan } from "@/lib/design/plan";
import type { PresellPage } from "@/lib/presell-page";
import type { StructureFingerprint } from "@/lib/validation/types";

function compact(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((part) => String(part ?? "")).join("|");
}

export function fingerprintHeroFamily(heroVariant: string): string {
  if (heroVariant.includes("EDITORIAL") || heroVariant === "MAGAZINE_PRODUCT") return "EDITORIAL";
  if (heroVariant.includes("CANVAS") || heroVariant.includes("CENTERED") || heroVariant.includes("MINIMAL")) {
    return "CENTERED";
  }
  if (heroVariant.includes("SPLIT")) return "SPLIT";
  return "STAGE";
}

export function buildStructureFingerprint(input: {
  page: PresellPage;
  design: DesignPlan;
  creative: CreativeCompositionPlan;
  approach: VariantApproach;
}): StructureFingerprint {
  const { page, design, creative, approach } = input;
  const heroFamily = fingerprintHeroFamily(design.heroVariant);
  const sceneSequence = creative.scenes.map((scene) => `${scene.kind}:${scene.narrativeRole}`).join(">");
  const sectionVariants = design.sectionPlans.map((section) => `${section.id}:${section.variant}`).join(",");
  const cta = design.ctaStrategy;
  const ctaDistribution = compact([
    cta.hero ? "hero" : "",
    cta.afterPrimaryFacts ? "facts" : "",
    cta.nearGuarantee ? "guarantee" : "",
    cta.final ? "final" : "",
    cta.stickyMobile ? "sticky" : "",
  ]);
  const imageSlotDistribution = creative.scenes
    .map((scene) => scene.assetUse)
    .filter((use) => use !== "NONE")
    .join(",");
  const layoutFamilies = Array.from(
    new Set(creative.scenes.map((scene) => `${scene.desktopComposition}/${scene.mobileComposition}`)),
  ).join(",");
  const contentPriorityPattern = design.sectionPlans.map((section) => `${section.id}:${section.priority}`).join(",");
  const raw = compact([
    heroFamily,
    sceneSequence,
    sectionVariants,
    ctaDistribution,
    imageSlotDistribution,
    layoutFamilies,
    contentPriorityPattern,
    design.visualTheme,
    page.template,
    approach,
  ]);
  return {
    heroFamily,
    sceneSequence,
    sectionVariants,
    ctaDistribution,
    imageSlotDistribution,
    layoutFamilies,
    contentPriorityPattern,
    visualTheme: design.visualTheme,
    template: page.template,
    approach,
    key: raw,
  };
}

export function fingerprintsSimilar(a: StructureFingerprint, b: StructureFingerprint): boolean {
  if (a.key === b.key) return true;
  const sameCore =
    a.heroFamily === b.heroFamily &&
    a.sceneSequence === b.sceneSequence &&
    a.ctaDistribution === b.ctaDistribution &&
    a.layoutFamilies === b.layoutFamilies;
  const sameSections = a.sectionVariants === b.sectionVariants && a.contentPriorityPattern === b.contentPriorityPattern;
  return sameCore && sameSections;
}

export function uniqueFingerprintCount(prints: StructureFingerprint[]): number {
  return new Set(prints.map((item) => item.key)).size;
}
