import type { SectionType } from "@/lib/conversion-strategy/types";
import type { ProductContract } from "@/lib/product-contract/types";
import { presellCtaAuthorization } from "@/lib/presell-strategy/plan";
import type { BofuSlot } from "@/lib/search-intent/types";

const EDITORIAL_ORDER: SectionType[] = [
  "hero",
  "specifications",
  "how_it_works",
  "differentiators",
  "trust",
  "guarantee",
  "presentation",
  "faq",
  "legal",
];

const BOFU_ORDER: SectionType[] = [
  "hero",
  "guarantee",
  "differentiators",
  "specifications",
  "how_it_works",
  "trust",
  "offers",
  "benefits",
  "faq",
  "cta_final",
  "legal",
];

export function editorialSectionOrder(): SectionType[] {
  return [...EDITORIAL_ORDER];
}

const SLOT_OF: Partial<Record<SectionType, BofuSlot>> = {
  hero: "HERO",
  presentation: "PRODUCT_SUMMARY",
  offers: "VERIFIED_OFFER_DETAILS",
  guarantee: "GUARANTEE",
  differentiators: "KEY_FEATURES",
  specifications: "KEY_FEATURES",
  faq: "FAQ",
  cta_final: "OFFICIAL_OFFER_HANDOFF",
  legal: "LEGAL_DISCLOSURE",
};

export function bofuSectionOrder(): SectionType[] {
  return [...BOFU_ORDER];
}

export function selectedBofuSlots(contract: ProductContract, sectionTypes: SectionType[]): BofuSlot[] {
  const hop = presellCtaAuthorization(contract).status === "AUTHORIZED";
  const slots: BofuSlot[] = [];
  const seen = new Set<BofuSlot>();
  for (const type of sectionTypes) {
    if (type === "cta_final" && !hop) continue;
    if (type === "offers" && !(contract.offer?.packages.length)) continue;
    const slot = SLOT_OF[type];
    if (!slot || seen.has(slot)) continue;
    seen.add(slot);
    slots.push(slot);
  }
  if (!seen.has("HERO")) slots.unshift("HERO");
  if (!seen.has("LEGAL_DISCLOSURE")) slots.push("LEGAL_DISCLOSURE");
  return slots;
}
