import type { ConversionBrief, SectionType } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import { buildSalesCopy } from "@/lib/page-blueprint/copy";
import { applyCopyIntelligence, offlineCopyAdapter, type CopyAdapter } from "@/lib/page-blueprint/adapter";
import type { BlueprintSection, PageBlueprint, SalesCopy, VisualIntent } from "@/lib/page-blueprint/types";
import { PAGE_BLUEPRINT_VERSION } from "@/lib/page-blueprint/types";

const PURPOSE: Record<SectionType, string> = {
  hero: "Identify the product and open with the grounded proposition",
  presentation: "State what the source said the product is",
  differentiators: "Show source-stated characteristics without repeating the headline",
  benefits: "Show seller-stated claims, attributed as claims",
  demonstration: "Show the authorized product image",
  specifications: "Show structured specifications and declared composition",
  offers: "Present verified packages and prices without arithmetic",
  guarantee: "Restate the source-stated guarantee",
  trust: "Restate returns, shipping and cautions",
  faq: "Answer only questions the source already answered",
  cta_final: "Offer the authorized action, or explain that none exists",
  legal: "Keep the affiliate disclosure and required notices",
};

function visualIntent(type: SectionType, contract: ProductContract): VisualIntent {
  if (type === "demonstration" && contract.images?.hero) return "PRODUCT_IMAGE";
  if (type === "hero" && contract.images?.hero) return "PRODUCT_IMAGE";
  if (type === "offers" && contract.offer?.packages.length) return "OFFER_CARDS";
  if (type === "legal" || type === "cta_final") return "NONE";
  return "TEXT";
}

export function buildPageBlueprint(input: {
  contract: ProductContract;
  brief: ConversionBrief;
  copy?: SalesCopy;
  adapter?: CopyAdapter;
}): { copy: SalesCopy; blueprint: PageBlueprint } {
  const raw = input.copy ?? buildSalesCopy(input.contract, input.brief);
  const copy = applyCopyIntelligence(raw, input.contract, input.brief, input.adapter ?? offlineCopyAdapter());
  const sections: BlueprintSection[] = copy.sections.map((section, index) => ({
    sectionId: `${section.sectionType}-${index + 1}`,
    sectionType: section.sectionType,
    commercialPurpose: PURPOSE[section.sectionType],
    headline: section.headline,
    body: section.body,
    supportingFacts: [
      ...section.body.map((item) => item.text),
      ...section.items.map((item) => item.text.text),
    ],
    evidenceRefs: [
      ...section.headline.evidenceRefs,
      ...section.body.flatMap((item) => item.evidenceRefs),
      ...section.items.flatMap((item) => item.text.evidenceRefs),
    ],
    visualIntent: visualIntent(section.sectionType, input.contract),
    renderEligibility: "ELIGIBLE",
    items: section.items,
  }));

  const throughline = copy.valueProposition ?? copy.introduction;
  const hierarchy = [copy.headline, copy.subheadline, copy.introduction].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    copy,
    blueprint: {
      blueprintVersion: PAGE_BLUEPRINT_VERSION,
      producer: copy.producer,
      productIdentity: {
        productName: input.contract.identity.productName,
        brand: input.contract.identity.brand,
        productKind: input.contract.identity.productKind,
        language: "en",
      },
      conversionGoal: input.brief.conversionGoal,
      trafficIntent: input.brief.trafficIntent,
      strategyStatus: input.brief.status,
      narrative: {
        shape: input.brief.creativeBrief.narrativeShape,
        density: input.brief.creativeBrief.density,
        compositionHint: input.brief.creativeBrief.compositionHint,
        throughline,
      },
      messageHierarchy: hierarchy,
      sections,
      images: {
        hero: input.contract.images?.hero
          ? { src: input.contract.images.hero.src, alt: input.contract.images.hero.alt, evidenceRefs: [] }
          : undefined,
        gallery: (input.contract.images?.gallery ?? []).map((item) => ({ src: item.src, alt: item.alt })),
      },
      offers: copy.offerMicrocopy,
      cta: copy.cta,
      absence: input.brief.missingEvidence,
      publication: { approval: "REQUIRED", blockers: [...input.contract.publication.blockers] },
    },
  };
}
