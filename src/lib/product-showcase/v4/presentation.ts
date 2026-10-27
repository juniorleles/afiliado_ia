import type { ThemeId } from "@/lib/design-system/tokens";
import type { CompositionId } from "@/lib/design-system/compose";
import type { SectionType } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import type { GroundedText } from "@/lib/page-blueprint/types";

const AUDIT_HEADLINE = /what the source states|seller-stated claims|questions the source answered/i;
const AFFILIATE_LINK_CLAIM = /this page contains an affiliate link|earn a commission if you buy through it/i;
const SELLER_PREFIX = /^the seller states:\s*/i;

const EDITORIAL_TITLE: Partial<Record<SectionType, string>> = {
  differentiators: "Features",
  benefits: "Product details",
  specifications: "Ingredients",
  faq: "Frequently asked questions",
  trust: "Cautions",
  presentation: "Product Overview",
  demonstration: "Product image",
  how_it_works: "Directions for Use",
  guarantee: "Seller-Stated Guarantee",
  legal: "Affiliate Transparency",
};

export type CommercialImage = { src: string; alt: string };

export function isTechnicalPlaceholderImage(src: string, alt?: string): boolean {
  const blob = `${src} ${alt ?? ""}`.toLowerCase();
  return (
    src.includes("/lab-fixtures/synthetic") ||
    /placeholder|synthetic fixture|neutral synthetic/i.test(blob)
  );
}

export function commercialImageOf(hero?: { src: string; alt: string } | null): CommercialImage | undefined {
  if (!hero?.src) return undefined;
  if (isTechnicalPlaceholderImage(hero.src, hero.alt)) return undefined;
  return { src: hero.src, alt: hero.alt };
}

export function themeForV4(input: {
  composition: CompositionId;
  contract: ProductContract;
  hasCommercialImage: boolean;
}): ThemeId {
  const specs = input.contract.specifications?.length ?? 0;
  const features = input.contract.features?.length ?? 0;
  if (input.composition === "information-first") return "ember";
  if (input.composition === "editorial-premium") return "forest";
  if (specs >= 5 && features <= 3) return "midnight";
  if (input.hasCommercialImage) return "ink";
  return "ink";
}

export function publicSectionTitle(
  sectionType: SectionType,
  headline: string,
  titles?: Partial<Record<SectionType, string>>,
): string {
  if (titles?.[sectionType]) return titles[sectionType]!;
  if (EDITORIAL_TITLE[sectionType] && (AUDIT_HEADLINE.test(headline) || /^(overview|details|ingredients|how (it works|to use)|returns?|guarantee|legal)$/i.test(headline))) {
    return EDITORIAL_TITLE[sectionType]!;
  }
  if (sectionType === "specifications" && /^(details|ingredients)$/i.test(headline)) {
    return /^ingredients$/i.test(headline) ? "Ingredients" : "Specifications";
  }
  if (sectionType === "how_it_works") return "Directions for Use";
  if (sectionType === "guarantee") return "Seller-Stated Guarantee";
  if (sectionType === "presentation") return "Product Overview";
  return headline;
}

export function publicItemText(text: string): string {
  return text.replace(SELLER_PREFIX, "");
}

export function publicLegalLines(input: {
  hopSlot: "hero" | "offers" | "none";
  body: GroundedText[];
  caption?: GroundedText;
}): string[] {
  const hopLive = input.hopSlot !== "none";
  const lines = input.body.map((item) => item.text).filter((text) => hopLive || !AFFILIATE_LINK_CLAIM.test(text));
  if (!hopLive && input.caption && !lines.includes(input.caption.text)) {
    return [input.caption.text, ...lines];
  }
  return lines;
}

export function distinctText(value: string | undefined, ...others: Array<string | undefined>): value is string {
  return Boolean(value && !others.includes(value));
}

export function editorialHeroMode(hasCommercialImage: boolean): "EDITORIAL_NO_IMAGE" | "PACKSHOT_SPLIT" {
  return hasCommercialImage ? "PACKSHOT_SPLIT" : "EDITORIAL_NO_IMAGE";
}

export function editorialIndexCards(input: {
  visible: Array<{ type: SectionType; id: string }>;
  titles?: Partial<Record<SectionType, string>>;
}): Array<{ id: string; label: string }> {
  const order: SectionType[] = ["presentation", "specifications", "how_it_works", "guarantee"];
  return order
    .map((type) => {
      const match = input.visible.find((item) => item.type === type);
      if (!match) return null;
      return { id: match.id, label: publicSectionTitle(type, type.replace(/_/g, " "), input.titles) };
    })
    .filter((item): item is { id: string; label: string } => Boolean(item));
}
