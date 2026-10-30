import type { SectionType } from "@/lib/conversion-strategy/types";
import {
  PRESELL_REQUIRED_SECTIONS,
  PRESELL_STANDARD_SECTION_IDS,
  type PresellStandardSectionId,
} from "@/lib/presell-template/standard-v1";

export type PresellSectionKind = "PHYSICAL" | "DIGITAL" | "BOTH";

export type PresellSectionRegistryEntry = {
  id: PresellStandardSectionId;
  order: number;
  required: boolean;
  kind: PresellSectionKind;
  blueprintType: SectionType | null;
  existingComponent: string;
  omitWhenEmpty: true;
  mayInventContent: false;
};

export const PRESELL_SECTION_REGISTRY: readonly PresellSectionRegistryEntry[] = PRESELL_STANDARD_SECTION_IDS.map((id, order) => {
  const required = PRESELL_REQUIRED_SECTIONS.includes(id);
  const blueprintType: SectionType | null =
    id === "PREMIUM_HERO"
      ? "hero"
      : id === "TRUST_INFORMATION"
        ? "trust"
        : id === "PRODUCT_OVERVIEW"
          ? "differentiators"
          : id === "HOW_IT_WORKS"
            ? "how_it_works"
            : id === "INGREDIENTS_OR_MODULES"
              ? "specifications"
              : id === "GUARANTEE"
                ? "guarantee"
                : id === "COMMERCIAL_CTA"
                  ? "cta_final"
                  : id === "SHIPPING_OR_ACCESS"
                    ? "trust"
                    : id === "PREMIUM_FAQ"
                      ? "faq"
                      : id === "LEGAL_FOOTER"
                        ? "legal"
                        : null;
  const existingComponent =
    id === "ANNOUNCEMENT_BAR"
      ? "AnnouncementBar"
      : id === "PREMIUM_HERO"
        ? "Hero + EvidenceChips + ProductImageStage + PremiumCta"
        : id === "TRUST_INFORMATION"
          ? "FulfillmentCardGrid"
          : id === "PRODUCT_OVERVIEW"
            ? "FeatureSection"
            : id === "HOW_IT_WORKS"
              ? "UsageSteps"
              : id === "INGREDIENTS_OR_MODULES"
                ? "IngredientCardGrid"
                : id === "GUARANTEE"
                  ? "GuaranteeBand"
                  : id === "COMMERCIAL_CTA"
                    ? "PremiumCta"
                    : id === "SHIPPING_OR_ACCESS"
                      ? "FulfillmentCardGrid"
                      : id === "VERIFIED_TESTIMONIALS"
                        ? "VerifiedTestimonials"
                        : id === "PREMIUM_FAQ"
                          ? "PremiumFaq"
                          : "LegalSection";
  return {
    id,
    order,
    required,
    kind: id === "INGREDIENTS_OR_MODULES" || id === "HOW_IT_WORKS" || id === "SHIPPING_OR_ACCESS" ? "BOTH" : "BOTH",
    blueprintType,
    existingComponent,
    omitWhenEmpty: true as const,
    mayInventContent: false as const,
  };
});

export function presellSectionRegistryRecord(): Record<PresellStandardSectionId, PresellSectionRegistryEntry> {
  return Object.fromEntries(PRESELL_SECTION_REGISTRY.map((item) => [item.id, item])) as Record<
    PresellStandardSectionId,
    PresellSectionRegistryEntry
  >;
}
