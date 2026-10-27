import type { V4Model } from "@/lib/product-showcase/v4/model";
import { publicSectionTitle, v4HeroMode } from "@/lib/product-showcase/v4/presentation";

export type EditorialStructureReport = {
  heroMode: ReturnType<typeof v4HeroMode>;
  heroAssetSrc: string | null;
  sections: Array<{ type: string; title: string }>;
  duplicateHeroOverview: boolean;
  disclosureBand: boolean;
  sellerAttribution: boolean;
};

export function reportEditorialStructure(model: V4Model): EditorialStructureReport {
  const titles = model.qualityPatch?.titles;
  const sections = model.blueprint.sections
    .filter((section) => section.sectionType !== "hero")
    .map((section) => ({
      type: section.sectionType,
      title: publicSectionTitle(section.sectionType, section.headline.text, titles),
    }));
  const hasOverview = sections.some((item) => item.type === "presentation");
  const intro = model.copy.introduction.text.trim();
  const overviewBody = model.blueprint.sections.find((item) => item.sectionType === "presentation")?.body[0]?.text ?? "";
  return {
    heroMode: v4HeroMode(model.commercialImage),
    heroAssetSrc: model.commercialImage?.src ?? null,
    sections,
    duplicateHeroOverview: Boolean(hasOverview && overviewBody && intro && overviewBody === intro),
    disclosureBand: Boolean(model.qualityPatch?.disclosureBand),
    sellerAttribution: Boolean(model.qualityPatch?.sellerAttribution),
  };
}
