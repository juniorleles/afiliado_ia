import type { TrafficPolicyStatus } from "@/lib/affiliate-program";
import { isConsumerHealthClaim } from "@/lib/landing-composer/present";
import {
  copyEligibleList,
  copyEligibleOperationalItems,
  copyEligibleScalar,
  type ProductFacts,
} from "@/lib/product-facts";

/**
 * Deterministic presentation plan for nutraceuticals.
 * Reads eligible Product Facts and already-approved assets.
 * Does not invent facts and is not consumer copy.
 */

export type ProductFormatKind = "capsule" | "drops" | "powder" | "other" | "unknown";
export type IngredientLayout = "none" | "sparse" | "grid" | "compact";
export type HeroMode = "image" | "editorial";

export type CommercialLimitationCode =
  | "NO_APPROVED_PACKSHOT"
  | "NO_ELIGIBLE_FEATURES"
  | "NO_ELIGIBLE_USAGE"
  | "NO_VERIFIED_PRICE"
  | "NO_ELIGIBLE_GUARANTEE"
  | "NO_AUTHORIZED_AFFILIATE_URL"
  | "PPC_PERMISSION_UNKNOWN"
  | "PPC_PROHIBITED";

const LIMITATION_ORDER: CommercialLimitationCode[] = [
  "NO_APPROVED_PACKSHOT",
  "NO_ELIGIBLE_FEATURES",
  "NO_ELIGIBLE_USAGE",
  "NO_VERIFIED_PRICE",
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
  usage: string[];
  price: { statement: string; currency: string | null } | null;
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
  const price = priceStatement && showable(priceStatement)
    ? { statement: priceStatement, currency: currencyIn(priceStatement) }
    : null;
  const guaranteeStatement = facts
    ? copyEligibleScalar(facts.guaranteeInformation, facts.confidence.guaranteeInformation)
    : "";
  const guarantee = guaranteeStatement && showable(guaranteeStatement) ? guaranteeStatement : null;
  const benefitLines = features.filter((line) => !guarantee || !sameText(line, guarantee)).filter((line) => !price || !sameText(line, price.statement));
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
    if (code === "NO_VERIFIED_PRICE") return !price;
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
    usage,
    price,
    guarantee,
    cta,
    limitations: [...limitations, ...ppcLimitations(input.ppc)],
  };
}
