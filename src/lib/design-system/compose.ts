import type { ProductContract } from "@/lib/product-contract/types";
import type { ThemeId } from "@/lib/design-system/tokens";

/**
 * Three reusable visual compositions. A composition is a layout, not a category.
 *
 * The same product can use a different composition when its available data changes. The choice is
 * made from contract fields (image, offer, feature count, specifications, editorial extras) — never
 * from a product name, a slug, a campaign id or a category.
 */

export const COMPOSITION_IDS = ["product-hero", "editorial-premium", "information-first"] as const;

export type CompositionId = (typeof COMPOSITION_IDS)[number];

export type CompositionDescriptor = {
  id: CompositionId;
  name: string;
  when: string;
};

export const COMPOSITIONS: Record<CompositionId, CompositionDescriptor> = {
  "product-hero": {
    id: "product-hero",
    name: "Product Hero",
    when: "Authorized image plus enough copy to fill a two-column hero and a commercial offer.",
  },
  "editorial-premium": {
    id: "editorial-premium",
    name: "Editorial Premium",
    when: "Richer editorial content: several features, specifications, or extra blocks (usage, guarantee, FAQ, operations).",
  },
  "information-first": {
    id: "information-first",
    name: "Information First",
    when: "Thin data, no authorized image, or an incomplete offer. The page leads with facts, not pictures.",
  },
};

export function isCompositionId(value: unknown): value is CompositionId {
  return typeof value === "string" && (COMPOSITION_IDS as readonly string[]).includes(value);
}

export type CompositionSignals = {
  hasHero: boolean;
  featureCount: number;
  specCount: number;
  extraEditorialBlocks: number;
  hasOffer: boolean;
  hasCta: boolean;
};

export function compositionSignals(contract: ProductContract): CompositionSignals {
  const extraEditorialBlocks =
    (contract.usage?.length ? 1 : 0) +
    (contract.cautions?.length ? 1 : 0) +
    (contract.faq?.length ? 1 : 0) +
    (contract.guarantee ? 1 : 0) +
    (contract.operational?.returns?.length || contract.operational?.shipping?.length ? 1 : 0);
  return {
    hasHero: Boolean(contract.images?.hero),
    featureCount: contract.features?.length ?? 0,
    specCount: contract.specifications?.length ?? 0,
    extraEditorialBlocks,
    hasOffer: Boolean(contract.offer?.packages.length),
    hasCta: contract.cta.state === "AUTHORIZED",
  };
}

/** Default composition from the contract. Generic rules only. */
export function pickComposition(contract: ProductContract): CompositionId {
  const s = compositionSignals(contract);
  if (s.hasHero && (s.hasOffer || s.featureCount >= 2)) return "product-hero";
  if (s.featureCount + s.specCount + s.extraEditorialBlocks >= 4) return "editorial-premium";
  return "information-first";
}

export function resolveComposition(contract: ProductContract, requested?: string | null): CompositionId {
  return isCompositionId(requested) ? requested : pickComposition(contract);
}

/** Themes cycle by composition so a comparison of the three looks different. Not tied to a product. */
export function themeForComposition(composition: CompositionId): ThemeId {
  if (composition === "product-hero") return "ink";
  if (composition === "editorial-premium") return "forest";
  return "ember";
}
