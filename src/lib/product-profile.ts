/**
 * Product Profile Analyzer.
 * Describes authorized ProductFacts. It does not choose how a page is drawn.
 */
import {
  copyEligibleOperationalItems,
  getConsumerCopyEligibleFacts,
  isCopyEligibleImageProvenance,
  type OfferFact,
  type ProductFacts,
} from "@/lib/product-facts";

export const PRODUCT_PROFILE_VERSION = "product-profile-v1" as const;

export const PRODUCT_DENSITIES = ["LOW", "MEDIUM", "HIGH", "PREMIUM"] as const;
export type ProductDensity = (typeof PRODUCT_DENSITIES)[number];

export type ProductProfile = {
  version: typeof PRODUCT_PROFILE_VERSION;
  ingredientCount: number;
  featureCount: number;
  faqCount: number;
  offerCount: number;
  warningCount: number;
  manufacturerPresent: boolean;
  pricingPresent: boolean;
  guaranteePresent: boolean;
  usagePresent: boolean;
  descriptionPresent: boolean;
  visualAssets: number;
  density: ProductDensity;
  /** Share of the completeness set that authorized facts fill. 0–1. */
  confidence: number;
};

const COMPLETENESS_SLOTS = 8;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function authorizedOffers(facts: ProductFacts): OfferFact[] {
  return (facts.offerFacts ?? []).filter((offer) => {
    if (offer.confidence !== "DIRECT_SOURCE") return false;
    return Boolean(offer.packageName?.trim() || offer.unitPrice?.trim() || offer.totalPrice?.trim());
  });
}

function offerHasPrice(offer: OfferFact): boolean {
  return Boolean(offer.unitPrice?.trim() || offer.totalPrice?.trim());
}

/** FAQ text counts only when that answer is already an authorized fact. */
function authorizedFaqCount(facts: ProductFacts): number {
  const authorized = new Set(copyEligibleOperationalItems(facts).map((item) => normalize(item.statement)));
  const seen = new Set<string>();
  const rows: Array<{ statement: string; question?: string }> = [
    ...(facts.returnsInformation ?? []),
    ...(facts.shippingInformation ?? []),
  ];
  if (facts.productFormat) rows.push(facts.productFormat);
  for (const fact of rows) {
    const question = fact.question?.replace(/\s+/g, " ").trim();
    if (!question || !authorized.has(normalize(fact.statement))) continue;
    seen.add(normalize(question));
  }
  return seen.size;
}

function visualAssetCount(facts: ProductFacts, offers: OfferFact[]): number {
  const urls = new Set<string>();
  const packshot = facts.productImageUrl?.trim();
  if (packshot && isCopyEligibleImageProvenance(facts.productImageProvenance)) urls.add(packshot);
  for (const offer of offers) {
    const image = offer.imageUrl?.trim();
    if (image) urls.add(image);
  }
  return urls.size;
}

/** Extra weight for longer authorized lists. The steps are structural, not product names. */
function volumeTier(count: number, mid: number, high: number): number {
  if (count >= high) return 2;
  if (count >= mid) return 1;
  return 0;
}

function densityFor(score: number): ProductDensity {
  if (score >= 14) return "PREMIUM";
  if (score >= 10) return "HIGH";
  if (score >= 6) return "MEDIUM";
  return "LOW";
}

function roundConfidence(filled: number): number {
  return Math.round((filled / COMPLETENESS_SLOTS) * 100) / 100;
}

export function analyzeProductProfile(facts: ProductFacts): ProductProfile {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const offers = authorizedOffers(facts);
  const faqCount = authorizedFaqCount(facts);
  const visualAssets = visualAssetCount(facts, offers);
  const descriptionPresent = eligible.description.length > 0;
  const featureCount = eligible.features.length;
  const ingredientCount = eligible.ingredientsOrComponents.length;
  const usagePresent = eligible.usageInformation.length > 0;
  const warningCount = eligible.cautions.length;
  const guaranteePresent = eligible.guaranteeInformation.length > 0;
  const manufacturerPresent = eligible.manufacturer.length > 0;
  const pricingText = eligible.pricingInformation.length > 0;
  const pricedOffers = offers.some(offerHasPrice);
  const pricingPresent = pricingText || pricedOffers;
  const offerCount = offers.length;
  const returnsPresent = eligible.returnsInformation.length > 0;
  const shippingPresent = eligible.shippingInformation.length > 0;
  const formatPresent = eligible.productFormat.length > 0;

  const sections = [
    descriptionPresent,
    featureCount > 0,
    ingredientCount > 0,
    usagePresent,
    warningCount > 0,
    pricingPresent || offerCount > 0,
    guaranteePresent,
    manufacturerPresent,
    faqCount > 0,
    returnsPresent,
    shippingPresent,
    formatPresent,
    visualAssets > 0,
  ].filter(Boolean).length;

  const score =
    sections +
    volumeTier(ingredientCount, 4, 10) +
    volumeTier(featureCount, 3, 6) +
    volumeTier(offerCount, 2, 3) +
    volumeTier(faqCount, 3, 6) +
    (visualAssets >= 2 ? 1 : 0);

  const completeness = [
    descriptionPresent,
    featureCount > 0,
    ingredientCount > 0,
    usagePresent,
    guaranteePresent,
    pricingPresent || offerCount > 0,
    manufacturerPresent,
    returnsPresent || shippingPresent,
  ].filter(Boolean).length;

  return {
    version: PRODUCT_PROFILE_VERSION,
    ingredientCount,
    featureCount,
    faqCount,
    offerCount,
    warningCount,
    manufacturerPresent,
    pricingPresent,
    guaranteePresent,
    usagePresent,
    descriptionPresent,
    visualAssets,
    density: densityFor(score),
    confidence: roundConfidence(completeness),
  };
}
