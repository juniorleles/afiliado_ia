import type { TrafficPolicyStatus } from "@/lib/affiliate-program";
import { isConsumerHealthClaim } from "@/lib/landing-composer/present";
import {
  copyEligibleList,
  copyEligibleOperationalItems,
  copyEligibleScalar,
  type ProductFacts,
} from "@/lib/product-facts";
import { namesPriceContext, UNIT_NOUN_SOURCE } from "@/lib/product-contract/units";

/**
 * Deterministic presentation plan for physical products.
 * Reads eligible Product Facts and already-approved assets.
 * Does not invent facts and is not consumer copy.
 */

export type ProductFormatKind = "capsule" | "drops" | "powder" | "other" | "unknown";
export type IngredientLayout = "none" | "sparse" | "grid" | "compact";
export type HeroMode = "image" | "editorial";
export type HeroComposition = "split" | "balanced" | "short";
export type ContentVolume = "thin" | "supported";
export type WarningVolume = "none" | "brief" | "extended";
export type OfferLayout = "single" | "comparison";
export type CommercialDensity = "sparse" | "layered";

export type VerifiedOffer = {
  quantityLabel: string;
  totalLabel: string;
  unitLabel: string | null;
};

export type CommercialLimitationCode =
  | "NO_APPROVED_PACKSHOT"
  | "NO_ELIGIBLE_FEATURES"
  | "NO_ELIGIBLE_USAGE"
  | "NO_VERIFIED_PRICE"
  | "PRICE_CONTEXT_INSUFFICIENT"
  | "NO_ELIGIBLE_GUARANTEE"
  | "NO_AUTHORIZED_AFFILIATE_URL"
  | "PPC_PERMISSION_UNKNOWN"
  | "PPC_PROHIBITED";

const LIMITATION_ORDER: CommercialLimitationCode[] = [
  "NO_APPROVED_PACKSHOT",
  "NO_ELIGIBLE_FEATURES",
  "NO_ELIGIBLE_USAGE",
  "NO_VERIFIED_PRICE",
  "PRICE_CONTEXT_INSUFFICIENT",
  "NO_ELIGIBLE_GUARANTEE",
  "NO_AUTHORIZED_AFFILIATE_URL",
  "PPC_PERMISSION_UNKNOWN",
  "PPC_PROHIBITED",
];

export type AdaptivePresentationPlan = {
  format: ProductFormatKind;
  formatStatement: string | null;
  ingredientCount: number;
  ingredients: string[];
  ingredientLayout: IngredientLayout;
  ingredientPhotos: boolean;
  features: string[];
  benefits: "required" | "omit";
  hero: HeroMode;
  heroComposition: HeroComposition;
  contentVolume: ContentVolume;
  warningVolume: WarningVolume;
  commercialDensity: CommercialDensity;
  usage: string[];
  price: { statement: string; currency: string | null; layout: OfferLayout; offers: VerifiedOffer[] } | null;
  guarantee: string | null;
  cta: { href: string; label: string } | null;
  limitations: CommercialLimitationCode[];
};

export type AdaptivePlanInput = {
  facts: ProductFacts | null;
  approvedPackshot?: { src: string; alt: string } | null;
  approvedIngredientImages?: Array<{ name: string; src: string; alt: string }>;
  cta?: { href: string; label: string } | null;
  ppc?: { brandPpc?: TrafficPolicyStatus | null; genericSearchPpc?: TrafficPolicyStatus | null } | null;
};

const CURRENCY = /(?:R\$|US\$|[$€£])|\b(?:USD|EUR|GBP|CAD|AUD|BRL)\b/i;

function sameText(left: string, right: string): boolean {
  return left.toLowerCase().replace(/\s+/g, " ").trim() === right.toLowerCase().replace(/\s+/g, " ").trim();
}

function showable(value: string): boolean {
  const text = value.trim();
  return Boolean(text) && !isConsumerHealthClaim(text);
}

export function classifyProductFormat(value: string): ProductFormatKind {
  const text = value.toLowerCase();
  if (/\b(capsules?|softgels?|tablets?)\b/.test(text)) return "capsule";
  if (/\b(drops?|tinctures?)\b/.test(text)) return "drops";
  if (/\b(powders?|scoops?)\b/.test(text)) return "powder";
  if (text.trim()) return "other";
  return "unknown";
}

function ingredientLayout(count: number): IngredientLayout {
  if (count <= 0) return "none";
  if (count <= 4) return "sparse";
  if (count <= 9) return "grid";
  return "compact";
}

function currencyIn(statement: string): string | null {
  return statement.match(CURRENCY)?.[0] ?? null;
}

const MONEY_AMOUNT = /(?:R\$|US\$|[$€£])\s?\d|\b(?:USD|EUR|GBP|CAD|AUD|BRL)\s?\d|\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP|CAD|AUD|BRL)\b/gi;

// The commercial unit vocabulary is shared with the universal contract: pieces, pairs and sets count like bottles.
const OFFER_QUANTITY = new RegExp(`\\b(\\d+)\\s+(${UNIT_NOUN_SOURCE})\\b`, "i");
const OFFER_SPLIT = new RegExp(`(?=\\b\\d+\\s+(?:bottles?|pouch(?:es)?|jars?|packs?|box(?:es)?|pairs?|pieces?|sets?|kits?|units?|bags?|tubes?|sachets?)\\b)`, "i");
const OFFER_MONEY = /((?:R\$|US\$|[$€£])\s?\d+(?:[.,]\d{1,2})?|\b(?:USD|EUR|GBP|CAD|AUD|BRL)\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP|CAD|AUD|BRL)\b)(\s+total)?/i;

function centsOf(token: string): number | null {
  const digits = token.match(/(\d+)(?:[.,](\d{1,2}))?/);
  if (!digits) return null;
  const whole = Number(digits[1]);
  const fraction = (digits[2] ?? "").padEnd(2, "0");
  if (!Number.isInteger(whole) || fraction.length !== 2) return null;
  return whole * 100 + Number(fraction);
}

function formatUnit(cents: number, sample: string): string | null {
  const amount = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  const trimmed = sample.trim();
  if (trimmed.startsWith("US$")) return `US$${amount}`;
  if (trimmed.startsWith("R$")) return `R$${amount}`;
  if (trimmed.startsWith("$")) return `$${amount}`;
  if (trimmed.startsWith("€")) return `€${amount}`;
  if (trimmed.startsWith("£")) return `£${amount}`;
  const code = trimmed.match(/\b(USD|EUR|GBP|CAD|AUD|BRL)\b/i)?.[1];
  return code ? `${code.toUpperCase()} ${amount}` : null;
}

/** Splits a verified price statement into offers. Returns none when any part is ambiguous. */
export function parseVerifiedOffers(statement: string): VerifiedOffer[] {
  const explicit = statement.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean);
  const parts = explicit.length >= 2
    ? explicit
    : statement.split(OFFER_SPLIT).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [];
  const offers: VerifiedOffer[] = [];
  for (const part of parts) {
    const quantity = part.match(OFFER_QUANTITY);
    const money = part.match(OFFER_MONEY);
    if (!quantity || !money) return [];
    const count = Number(quantity[1]);
    const cents = centsOf(money[1]);
    if (!Number.isInteger(count) || count < 1 || cents == null) return [];
    const unitCents = count > 1 && cents % count === 0 ? cents / count : null;
    offers.push({
      quantityLabel: quantity[0],
      totalLabel: money[0].replace(/\s+/g, " ").trim(),
      unitLabel: unitCents == null ? null : formatUnit(unitCents, money[1]),
    });
  }
  return offers.length >= 2 ? offers : [];
}

function contentVolume(groups: number, ingredientCount: number): ContentVolume {
  if (ingredientCount <= 2 && groups <= 2) return "thin";
  return "supported";
}

function warningVolume(count: number): WarningVolume {
  if (count <= 0) return "none";
  if (count <= 2) return "brief";
  return "extended";
}

/** A lone currency amount is not enough to show as a price. */
export function priceHasCommercialContext(statement: string): boolean {
  const text = statement.trim();
  if (!text) return false;
  if (namesPriceContext(text)) return true;
  return (text.match(MONEY_AMOUNT) ?? []).length >= 2;
}

function ppcLimitations(ppc: AdaptivePlanInput["ppc"]): CommercialLimitationCode[] {
  if (!ppc) return [];
  const statuses = [ppc.brandPpc, ppc.genericSearchPpc].filter((item): item is TrafficPolicyStatus => item === "BLOCKED" || item === "UNKNOWN" || item === "ALLOWED");
  const codes: CommercialLimitationCode[] = [];
  if (statuses.includes("UNKNOWN")) codes.push("PPC_PERMISSION_UNKNOWN");
  if (statuses.includes("BLOCKED")) codes.push("PPC_PROHIBITED");
  return codes;
}

export function buildAdaptivePlan(input: AdaptivePlanInput): AdaptivePresentationPlan {
  const facts = input.facts;
  const features = facts
    ? copyEligibleList(facts.features, facts.confidence.features).filter(showable)
    : [];
  const ingredients = facts
    ? copyEligibleList(facts.ingredientsOrComponents, facts.confidence.ingredientsOrComponents).filter(showable)
    : [];
  const usageLines = facts
    ? copyEligibleList(facts.usageInformation, facts.confidence.usageInformation).filter(showable)
    : [];
  const operationalFormat = facts
    ? copyEligibleOperationalItems(facts).find((item) => item.field === "productFormat")
    : undefined;
  const formatFromUsage = usageLines.find((line) => {
    const kind = classifyProductFormat(line);
    return kind === "capsule" || kind === "drops" || kind === "powder";
  });
  const formatStatement = (operationalFormat?.statement || formatFromUsage || "").trim() || null;
  const format = formatStatement
    ? classifyProductFormat(`${operationalFormat?.kind ?? ""} ${formatStatement}`)
    : "unknown";
  const usage = usageLines.filter((line) => !formatStatement || !sameText(line, formatStatement));
  const priceStatement = facts
    ? copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation)
    : "";
  const eligiblePrice = priceStatement && showable(priceStatement)
    ? { statement: priceStatement, currency: currencyIn(priceStatement) }
    : null;
  const offers = eligiblePrice && priceHasCommercialContext(eligiblePrice.statement) ? parseVerifiedOffers(eligiblePrice.statement) : [];
  const price = eligiblePrice && priceHasCommercialContext(eligiblePrice.statement)
    ? { ...eligiblePrice, layout: offers.length >= 2 ? "comparison" as const : "single" as const, offers }
    : null;
  const guaranteeStatement = facts
    ? copyEligibleScalar(facts.guaranteeInformation, facts.confidence.guaranteeInformation)
    : "";
  const guarantee = guaranteeStatement && showable(guaranteeStatement) ? guaranteeStatement : null;
  const benefitLines = features.filter((line) => !guarantee || !sameText(line, guarantee)).filter((line) => !eligiblePrice || !sameText(line, eligiblePrice.statement));
  const cautionCount = facts ? copyEligibleList(facts.cautions, facts.confidence.cautions).filter(showable).length : 0;
  const groups = [
    Boolean(formatStatement),
    ingredients.length > 0,
    usage.length > 0,
    Boolean(price),
    Boolean(guarantee),
    benefitLines.length > 0,
  ].filter(Boolean).length;
  const volume = contentVolume(groups, ingredients.length);
  const packshot = input.approvedPackshot?.src?.trim() && input.approvedPackshot.alt?.trim()
    ? input.approvedPackshot
    : null;
  const cta = input.cta?.href?.trim() && input.cta.label?.trim() ? { href: input.cta.href.trim(), label: input.cta.label.trim() } : null;
  const namedImages = input.approvedIngredientImages ?? [];
  const ingredientPhotos = ingredients.length > 0 && ingredients.every((name) =>
    namedImages.some((image) => sameText(image.name, name) && image.src.trim() && image.alt.trim()),
  );
  const limitations = LIMITATION_ORDER.filter((code) => {
    if (code === "NO_APPROVED_PACKSHOT") return !packshot;
    if (code === "NO_ELIGIBLE_FEATURES") return benefitLines.length === 0;
    if (code === "NO_ELIGIBLE_USAGE") return usage.length === 0 && !usageLines.length;
    if (code === "NO_VERIFIED_PRICE") return !eligiblePrice;
    if (code === "PRICE_CONTEXT_INSUFFICIENT") return Boolean(eligiblePrice) && !price;
    if (code === "NO_ELIGIBLE_GUARANTEE") return !guarantee;
    if (code === "NO_AUTHORIZED_AFFILIATE_URL") return !cta;
    return false;
  });

  return {
    format,
    formatStatement,
    ingredientCount: ingredients.length,
    ingredients,
    ingredientLayout: ingredientLayout(ingredients.length),
    ingredientPhotos,
    features: benefitLines,
    benefits: benefitLines.length > 0 ? "required" : "omit",
    hero: packshot ? "image" : "editorial",
    heroComposition: packshot ? "split" : volume === "thin" ? "short" : "balanced",
    contentVolume: volume,
    warningVolume: warningVolume(cautionCount),
    commercialDensity: usage.length > 1 || price?.layout === "comparison" ? "layered" : "sparse",
    usage,
    price,
    guarantee,
    cta,
    limitations: [...limitations, ...ppcLimitations(input.ppc)],
  };
}
