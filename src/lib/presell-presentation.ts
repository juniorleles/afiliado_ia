/**
 * Presentation-only choices. Stored copy, facts, and the content gate stay
 * unchanged. Labels and offer rows restate authorized fields or replace a
 * generic hop label. They do not add discounts, rankings, or checkout claims.
 */

import { copyEligibleScalar, type ProductFacts } from "@/lib/product-facts";

const GENERIC_HOP_LABEL = /^(learn more|view product details|check current details|see details)$/i;
const MONEY = /[$€£]\s?\d[\d,]*(?:\.\d{1,2})?/;

export type AuthorizedOffer = {
  name: string;
  price: string;
  quantity?: string;
  totalPrice?: string;
  originalPrice?: string;
  savings?: string;
  shipping?: string;
  bonuses?: string;
  popularityLabel?: string;
  imageUrl?: string;
};

/** Split an already copy-eligible pricing string into name + price phrase. */
export function authorizedOffers(pricing: string): AuthorizedOffer[] {
  const text = pricing.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const parts = text.split(/\s*;\s*|\n+/).map((part) => part.trim()).filter(Boolean);
  const offers: AuthorizedOffer[] = [];
  for (const part of parts) {
    const match = part.match(MONEY);
    if (!match || match.index == null) return [];
    const name = part.slice(0, match.index).replace(/[\s:–—-]+$/g, "").trim();
    const price = part.slice(match.index).trim();
    if (!price) return [];
    offers.push({ name, price });
  }
  return offers;
}

/** Structured offer cards when the importer kept them; otherwise the pricing string. */
export function presentOffers(facts: ProductFacts | null | undefined): AuthorizedOffer[] {
  const pricing = facts
    ? copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation)
    : "";
  const structured = facts?.offerFacts;
  if (
    pricing &&
    structured &&
    structured.length > 0 &&
    structured.every((offer) => offer.confidence === "DIRECT_SOURCE" && offer.packageName && offer.unitPrice)
  ) {
    return structured.map((offer) => ({
      name: offer.packageName,
      price: offer.unitPrice,
      quantity: offer.quantity,
      totalPrice: offer.totalPrice,
      originalPrice: offer.originalPrice,
      savings: offer.savings,
      shipping: offer.shipping,
      bonuses: offer.bonuses,
      popularityLabel: offer.popularityLabel,
      imageUrl: offer.imageUrl,
    }));
  }
  return authorizedOffers(pricing);
}

/**
 * Primary hop buttons replace a generic informational label.
 * Pricing on the page points at the current offer. Otherwise the hop is
 * only "view the official offer" — never a checkout on this site.
 * A specific stored label is left as written.
 */
export function primaryConversionLabel(stored: string, pricingAuthorized: boolean): string {
  const label = stored.trim();
  if (!GENERIC_HOP_LABEL.test(label)) return label;
  return pricingAuthorized ? "Check Current Offer" : "View Official Offer";
}
