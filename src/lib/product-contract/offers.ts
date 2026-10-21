import { copyEligibleScalar, hasContactDetail, hasEncodingCorruption, type OfferFact, type ProductFacts } from "@/lib/product-facts";
import { namesPriceContext, parseCommercialQuantity, UNIT_NOUN_SOURCE, type CommercialQuantity } from "@/lib/product-contract/units";

/**
 * Offer normalization.
 *
 * A package is kept only when its label and at least one price were stated together. Prices are
 * verbatim strings in the stated currency. No arithmetic: no unit price is derived, no saving is
 * computed, nothing is struck through unless the source stated the original price.
 */

export type NormalizedOffer = {
  label: string;
  quantity?: CommercialQuantity;
  totalPrice?: string;
  unitPrice?: string;
  originalPrice?: string;
  savings?: string;
  shipping?: string;
  bonuses?: string;
  popularityLabel?: string;
  sourceUrl: string | null;
  origin: "OFFER_FACTS" | "PRICING_TEXT";
};

export type OfferResult = {
  packages: NormalizedOffer[];
  /** A price was stated but not with a label that says what it is for. */
  contextInsufficient: boolean;
  /** No price statement exists at all. */
  noPrice: boolean;
  dropped: Array<{ reason: string; text: string }>;
};

const MONEY =
  /(?:R\$|US\$|[$€£])\s?\d[\d.,]*|\b(?:USD|EUR|GBP|CAD|AUD|BRL)\s?\d[\d.,]*|\d[\d.,]*\s?(?:USD|EUR|GBP|CAD|AUD|BRL)\b/i;

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function plain(value: string | undefined): string | undefined {
  const text = clean(value);
  if (!text || hasEncodingCorruption(text) || hasContactDetail(text)) return undefined;
  return text;
}

function stated(price: string | undefined): string | undefined {
  const text = plain(price);
  return text && /\d/.test(text) ? text : undefined;
}

function fromOfferFact(offer: OfferFact): { offer?: NormalizedOffer; dropped?: { reason: string; text: string } } {
  const label = plain(offer.packageName);
  const unitPrice = stated(offer.unitPrice);
  const totalPrice = stated(offer.totalPrice);
  const text = [offer.packageName, offer.unitPrice, offer.totalPrice].map(clean).filter(Boolean).join(" | ");
  if (!label) return { dropped: { reason: "OFFER_WITHOUT_LABEL", text } };
  if (!unitPrice && !totalPrice) return { dropped: { reason: "OFFER_WITHOUT_PRICE", text } };
  const quantity = parseCommercialQuantity(clean(offer.quantity)) ?? parseCommercialQuantity(label) ?? undefined;
  const originalPrice = stated(offer.originalPrice);
  const savings = plain(offer.savings);
  return {
    offer: {
      label,
      ...(quantity ? { quantity } : {}),
      ...(totalPrice ? { totalPrice } : {}),
      ...(unitPrice ? { unitPrice } : {}),
      ...(originalPrice ? { originalPrice } : {}),
      ...(savings ? { savings } : {}),
      ...(plain(offer.shipping) ? { shipping: plain(offer.shipping) } : {}),
      ...(plain(offer.bonuses) ? { bonuses: plain(offer.bonuses) } : {}),
      ...(plain(offer.popularityLabel) ? { popularityLabel: plain(offer.popularityLabel) } : {}),
      sourceUrl: clean(offer.sourceUrl) || null,
      origin: "OFFER_FACTS",
    },
  };
}

function fromPricingText(statement: string, sourceUrl: string | null): { packages: NormalizedOffer[]; dropped: Array<{ reason: string; text: string }> } {
  const explicit = statement.split(/[;\n]+/).map(clean).filter(Boolean);
  const parts = explicit.length >= 2
    ? explicit
    : statement.split(new RegExp(`(?=\\b\\d+\\s+${UNIT_NOUN_SOURCE}\\b)`, "i")).map(clean).filter(Boolean);
  const packages: NormalizedOffer[] = [];
  const dropped: Array<{ reason: string; text: string }> = [];
  for (const part of parts) {
    const quantity = parseCommercialQuantity(part);
    const money = part.match(MONEY)?.[0];
    if (!quantity || !money) {
      dropped.push({ reason: !money ? "PART_WITHOUT_PRICE" : "PART_WITHOUT_QUANTITY", text: part });
      continue;
    }
    packages.push({ label: quantity.text, quantity, totalPrice: clean(money), sourceUrl, origin: "PRICING_TEXT" });
  }
  return { packages, dropped };
}

export function normalizeOffers(facts: ProductFacts | null): OfferResult {
  const result: OfferResult = { packages: [], contextInsufficient: false, noPrice: false, dropped: [] };
  if (!facts) {
    result.noPrice = true;
    return result;
  }
  const structured = facts.offerFacts ?? [];
  for (const offer of structured) {
    const outcome = fromOfferFact(offer);
    if (outcome.offer) result.packages.push(outcome.offer);
    if (outcome.dropped) result.dropped.push(outcome.dropped);
  }
  if (structured.length > 0) {
    result.contextInsufficient = result.packages.length === 0 && result.dropped.some((item) => item.reason === "OFFER_WITHOUT_LABEL");
    result.noPrice = result.packages.length === 0 && !result.contextInsufficient;
    return result;
  }
  const statement = copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation);
  if (!statement) {
    result.noPrice = true;
    return result;
  }
  const hasMoney = MONEY.test(statement);
  const parsed = fromPricingText(statement, clean(facts.sourceUrl) || null);
  result.packages = parsed.packages;
  result.dropped.push(...parsed.dropped);
  if (result.packages.length === 0) {
    // A statement with no money in it is not a price. A price with no unit of sale is not an offer.
    result.contextInsufficient = hasMoney;
    result.noPrice = !hasMoney;
    if (hasMoney && namesPriceContext(statement)) {
      result.dropped.push({ reason: "PRICE_NOT_SPLIT_INTO_PACKAGES", text: statement });
    }
  }
  return result;
}
