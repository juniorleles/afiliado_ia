import { type CompositionId } from "@/lib/design-system/compose";
import type { ThemeId } from "@/lib/design-system/tokens";
import { labContractInput, labScenarioKeys } from "@/lib/design-system/scenarios";
import { pageDensity, stickyCtaAllowed } from "@/lib/design-system/layout";
import { presellCtaAuthorization } from "@/lib/presell-strategy/plan";
import { buildPageBlueprint } from "@/lib/page-blueprint/blueprint";
import type { PageBlueprint, SalesCopy } from "@/lib/page-blueprint/types";
import type { ConversionBrief, SectionType } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import { enrichProduct } from "@/lib/product-enrichment/pipeline";
import { labSources } from "@/lib/product-enrichment/lab-sources";
import { commercialImageOf, themeForV4, type CommercialImage } from "@/lib/product-showcase/v4/presentation";
import type { QualityPresentationPatch } from "@/lib/presell-quality/patch";
import { applyEditorialNeutrality } from "@/lib/editorial-neutrality/apply";

export type HopSlot = "hero" | "offers" | "none";

export type V4Model = {
  scenarioKey: string;
  contract: ProductContract;
  brief: ConversionBrief;
  copy: SalesCopy;
  blueprint: PageBlueprint;
  composition: CompositionId;
  theme: ThemeId;
  density: "thin" | "full";
  hopSlot: HopSlot;
  hopHref?: string;
  hopLabel?: string;
  sandbox?: { mode: true };
  sticky: boolean;
  commercialImage?: CommercialImage;
  galleryImages?: CommercialImage[];
  qualityPatch?: QualityPresentationPatch;
};

export function hopSlotFor(blueprint: PageBlueprint, contract: ProductContract): HopSlot {
  if (blueprint.cta.action !== "AUTHORIZED_HOP" || presellCtaAuthorization(contract).status !== "AUTHORIZED" || !blueprint.cta.href) return "none";
  if (blueprint.sections.some((item) => item.sectionType === "offers" && item.renderEligibility === "ELIGIBLE")) {
    return "offers";
  }
  return "hero";
}

export function shouldRenderSection(input: {
  type: SectionType;
  blueprint: PageBlueprint;
  hopSlot: HopSlot;
  hasHeroImage: boolean;
}): boolean {
  const section = input.blueprint.sections.find((item) => item.sectionType === input.type);
  if (!section || section.renderEligibility !== "ELIGIBLE") return false;
  if (input.type !== "hero" && input.type !== "legal" && input.type !== "faq" && section.body.length === 0 && section.items.length === 0) {
    return false;
  }
  if (input.type === "cta_final" && input.hopSlot !== "none") return false;
  if (input.type === "demonstration" && (!input.hasHeroImage || input.blueprint.narrative.shape === "IMAGE_LED")) {
    return false;
  }
  return true;
}

export function composeV4Model(input: {
  scenarioKey: string;
  contract: ProductContract;
  brief: ConversionBrief;
  copy: SalesCopy;
  blueprint: PageBlueprint;
}): V4Model {
  const copy = applyEditorialNeutrality(input.copy).copy;
  const blueprint = {
    ...input.blueprint,
    sections: input.blueprint.sections.map((section) => {
      const match = copy.sections.find((item) => item.sectionType === section.sectionType);
      if (!match) return section;
      return { ...section, body: match.body, items: match.items };
    }),
  };
  const composition = blueprint.narrative.compositionHint;
  const hopSlot = hopSlotFor(blueprint, input.contract);
  const commercialImage = commercialImageOf(blueprint.images.hero);
  return {
    scenarioKey: input.scenarioKey,
    contract: input.contract,
    brief: input.brief,
    copy,
    blueprint,
    composition,
    theme: themeForV4({
      composition,
      contract: input.contract,
      hasCommercialImage: Boolean(commercialImage),
    }),
    density: pageDensity(input.contract),
    hopSlot,
    hopHref: hopSlot === "none" ? undefined : input.blueprint.cta.href,
    hopLabel: hopSlot === "none" ? undefined : input.blueprint.cta.label?.text ?? input.contract.cta.label,
    sticky: stickyCtaAllowed(input.contract),
    commercialImage,
  };
}

export function buildV4Model(scenarioKey: string): V4Model | null {
  if (!labScenarioKeys().includes(scenarioKey)) return null;
  const index = Number(scenarioKey.slice(1)) - 1;
  const enriched = enrichProduct({
    scenarioKey,
    contractInput: labContractInput(index),
    sources: labSources(scenarioKey),
  });
  const { copy, blueprint } = buildPageBlueprint({
    contract: enriched.afterContract,
    brief: enriched.afterBrief,
  });
  return composeV4Model({
    scenarioKey,
    contract: enriched.afterContract,
    brief: enriched.afterBrief,
    copy,
    blueprint,
  });
}
