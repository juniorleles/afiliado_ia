/**
 * Visual emphasis for facts that already exist.
 * Fact type and presence decide weight. Nothing here creates a ranking,
 * a recommendation, or a new commercial claim.
 */

const SAVINGS_AMOUNT = /^savings:\s*([$€£]\s?\d[\d,]*(?:\.\d{1,2})?)\s*$/i;

/** Leading integer in an authorized quantity phrase, such as "6 Bottles". */
export function authorizedQuantityCount(quantity: string | undefined): number | null {
  if (!quantity) return null;
  const match = quantity.trim().match(/^(\d{1,2})\s+[A-Za-z]/);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count < 1 || count > 12) return null;
  return count;
}

/**
 * Copies of an asset for an authorized quantity.
 * Only an asset that depicts exactly one unit may be repeated.
 * Unknown or multi-unit photos are omitted rather than cropped or tiled.
 */
export function quantityImageRepeats(authorized: number | null, unitsDepicted: number | null): number | null {
  if (authorized == null || unitsDepicted !== 1) return null;
  if (!Number.isInteger(authorized) || authorized < 1 || authorized > 12) return null;
  return authorized;
}

export type OfferAssetLink = "same-card" | "alt-text" | "structured" | "url-only" | "none";
export type OfferAssetDecision = "package" | "single-unit-repeat" | "omit";

/**
 * A package image renders only when the source ties it to that offer
 * and embedded commercial stickers are known to be absent.
 * A url by itself is not that tie. An unknown sticker check omits the image.
 */
export function offerAssetAssociation(input: {
  associatedBy: OfferAssetLink;
  embeddedUnsupportedClaim: boolean | null;
  unitsDepicted: number | null;
  authorizedQuantity: number | null;
}): OfferAssetDecision {
  if (quantityImageRepeats(input.authorizedQuantity, input.unitsDepicted) != null) return "single-unit-repeat";
  const linked = input.associatedBy === "same-card" || input.associatedBy === "alt-text" || input.associatedBy === "structured";
  if (linked && input.embeddedUnsupportedClaim === false) return "package";
  return "omit";
}

/**
 * "Savings: $434" may be shown as "SAVE $434".
 * Any other wording stays verbatim. The amount is never calculated.
 */
export function presentSavings(savings: string | undefined): string | null {
  const text = savings?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  const match = text.match(SAVINGS_AMOUNT);
  if (!match) return text;
  return `SAVE ${match[1].replace(/\s+/g, "")}`;
}

/** Free-shipping wording is an advantage. A fee stays a fee. */
export function shippingTone(shipping: string | undefined): "advantage" | "plain" | null {
  const text = shipping?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  if (!/\bshipping\b/i.test(text)) return "plain";
  if (/\b(fee|fees|cost|charge|charges|paid|extra)\b/i.test(text)) return "plain";
  if (/\bfree\b/i.test(text)) return "advantage";
  return "plain";
}

/**
 * When an authorized sentence already says "helping you …", that clause
 * can lead the hero. The words stay the same. "helping you maintain"
 * displays as "Help maintain". Nothing is strengthened.
 */
export function heroBenefitSplit(valueLine: string): { benefit: string; support: string } | null {
  const text = valueLine.replace(/\s+/g, " ").trim();
  const match = text.match(/^(.*),\s+helping you\s+(.+?)[.!]?\s*$/i);
  if (!match) return null;
  const support = match[1].trim();
  const benefitBody = match[2].trim();
  if (support.split(/\s+/).length < 4 || benefitBody.split(/\s+/).length < 3) return null;
  const headline = benefitBody.split(/\s+/).map((word) => (/^and$/i.test(word) ? "&" : word.charAt(0).toUpperCase() + word.slice(1)));
  return { benefit: `Help ${headline.join(" ")}`, support };
}
