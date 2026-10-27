import { classifyAttribute } from "@/lib/attribute-class";
import { isIngredientIdentityName } from "@/lib/import-heuristics";
import type { OfferFact, ProductFacts, ProductFormatFact, SpecificationFact } from "@/lib/product-facts";

export type ResearchSlot =
  | "PRODUCT_NAME"
  | "PRODUCT_CATEGORY"
  | "PRODUCT_DESCRIPTION"
  | "INGREDIENTS"
  | "PRODUCT_FEATURES"
  | "SELLER_CLAIMS"
  | "VERIFIED_FACTS"
  | "USAGE_INFORMATION"
  | "OFFER_INFORMATION"
  | "PURCHASE_LINK"
  | "SOURCE_EVIDENCE";

export type StructuredDrop = { slot: ResearchSlot; text: string; reason: string };

export type StructuredResearch = {
  productName: string;
  category?: string;
  description?: string;
  ingredients: string[];
  features: string[];
  sellerClaims: string[];
  verifiedFacts: string[];
  usage: string[];
  offers: OfferFact[];
  specifications: SpecificationFact[];
  purchaseLink: string | null;
  dropped: StructuredDrop[];
};

const HTML_MARK = /<[^>]+>|&[a-z]+;|{\s*\/|<\/?[a-z]/i;
const SELLER_CLAIM = /\b(clinically proven|scientifically proven|cures?|treats?|erases?|guaranteed results?|doctors? (?:recommend|worldwide))\b/i;
const INCOMPLETE_VERB = /^(create|make|build|get|see|learn|discover|provide|deliver|support|helps?|boosts?)\b/i;
const GENERIC_NOUN = /\b(formula|system|complex|blend|support)\b/i;

const GENERIC_KIND = /^(natural )?formula$|^product$|^item$/i;

function operatorCategoryFormat(category: string | undefined, facts: ProductFacts): ProductFormatFact | undefined {
  if (facts.productFormat?.value?.trim()) return facts.productFormat;
  const value = category?.replace(/\s+/g, " ").trim() ?? "";
  if (!value || value.length < 2 || value.length > 40 || GENERIC_KIND.test(value)) return facts.productFormat;
  return {
    value,
    statement: value,
    provenance: "MANUAL",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: facts.sourceUrl,
    sourcePageCategory: "PRIMARY",
  };
}

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

export function isIncompleteFragment(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (HTML_MARK.test(t)) return true;
  if (/(?:\u2026|\.{3}|…)\s*$/.test(t)) return true;
  const words = t.split(/\s+/);
  if (INCOMPLETE_VERB.test(t) && words.length <= 5 && !/\d/.test(t)) return true;
  if (words.length <= 3 && INCOMPLETE_VERB.test(t) && GENERIC_NOUN.test(t) && !/\d/.test(t)) return true;
  return false;
}

export function isIngredientOnlyLabel(text: string, productName: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || keyOf(t) === keyOf(productName)) return false;
  if (t.split(/\s+/).length >= 6) return false;
  return isIngredientIdentityName(t);
}

export function isWeakCommercialLead(text: string, productName: string, ingredients: string[]): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (keyOf(t) === keyOf(productName)) return false;
  if (isIngredientOnlyLabel(t, productName)) return true;
  if (ingredients.some((item) => keyOf(item) === keyOf(t))) return true;
  if (isIncompleteFragment(t)) return true;
  return false;
}

function keepList(items: string[], productName: string, dropped: StructuredDrop[], slot: ResearchSlot): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (HTML_MARK.test(text)) {
      dropped.push({ slot, text, reason: "HTML or markup fragment" });
      continue;
    }
    if (keyOf(text) === keyOf(`${productName} is listed as ${text}`)) continue;
    if (new RegExp(`^${productName} is listed as `, "i").test(text)) {
      dropped.push({ slot, text, reason: "operator category restatement is not a product feature" });
      continue;
    }
    if (isIncompleteFragment(text)) {
      dropped.push({ slot, text, reason: "incomplete phrase" });
      continue;
    }
    out.push(text);
  }
  return unique(out);
}

export function structureResearchFacts(input: {
  operatorName: string;
  category?: string;
  facts: ProductFacts;
  purchaseLink?: string | null;
}): { facts: ProductFacts; research: StructuredResearch } {
  const dropped: StructuredDrop[] = [];
  const productName = input.operatorName.trim();
  const facts = input.facts;

  const incomingIngredients = unique([...(facts.ingredientsOrComponents ?? [])]);
  const incomingFeatures = unique([...(facts.features ?? [])]);

  const ingredients: string[] = [];
  const features: string[] = [];
  const sellerClaims: string[] = [];
  const verifiedFacts: string[] = [];

  for (const item of incomingIngredients) {
    if (isIncompleteFragment(item) || (GENERIC_NOUN.test(item) && item.trim().split(/\s+/).length <= 3 && !/\d/.test(item))) {
      dropped.push({ slot: "INGREDIENTS", text: item, reason: "incomplete phrase" });
      continue;
    }
    const classified = classifyAttribute(item);
    if (classified.class === "PRODUCT_FEATURE") {
      features.push(item);
      dropped.push({ slot: "PRODUCT_FEATURES", text: item, reason: classified.reason });
      continue;
    }
    if (classified.class === "SELLER_CLAIM" || SELLER_CLAIM.test(item)) {
      sellerClaims.push(item);
      dropped.push({ slot: "SELLER_CLAIMS", text: item, reason: classified.reason || "seller claim is not an ingredient identity" });
      continue;
    }
    if (classified.class === "USAGE_INSTRUCTION") {
      dropped.push({ slot: "USAGE_INFORMATION", text: item, reason: classified.reason });
      continue;
    }
    if (classified.class === "GUARANTEE_OR_POLICY") {
      dropped.push({ slot: "SELLER_CLAIMS", text: item, reason: classified.reason });
      continue;
    }
    if (classified.class !== "INGREDIENT" && !isIngredientOnlyLabel(item, productName)) {
      dropped.push({ slot: "INGREDIENTS", text: item, reason: classified.reason });
      continue;
    }
    ingredients.push(item);
  }

  for (const item of incomingFeatures) {
    if (isIncompleteFragment(item)) {
      dropped.push({ slot: "PRODUCT_FEATURES", text: item, reason: "incomplete phrase" });
      continue;
    }
    if (isIngredientOnlyLabel(item, productName)) {
      ingredients.push(item);
      dropped.push({ slot: "INGREDIENTS", text: item, reason: "ingredient label moved out of features" });
      continue;
    }
    if (SELLER_CLAIM.test(item)) {
      sellerClaims.push(item);
      continue;
    }
    features.push(item);
    verifiedFacts.push(item);
  }

  let description = facts.description?.replace(/\s+/g, " ").trim() || undefined;
  if (description) {
    if (isWeakCommercialLead(description, productName, unique([...ingredients, ...incomingIngredients]))) {
      dropped.push({ slot: "PRODUCT_DESCRIPTION", text: description, reason: "description is an ingredient or a weak lead" });
      description = undefined;
    } else if (isIncompleteFragment(description)) {
      dropped.push({ slot: "PRODUCT_DESCRIPTION", text: description, reason: "incomplete description" });
      description = undefined;
    }
  }

  const usage = keepList(facts.usageInformation ?? [], productName, dropped, "USAGE_INFORMATION");
  const specifications = (facts.specifications ?? []).filter((spec) => {
    const blob = `${spec.name} ${spec.value} ${spec.unit ?? ""}`;
    if (isIncompleteFragment(spec.name) || isIncompleteFragment(spec.value) || !spec.value.trim()) {
      dropped.push({ slot: "VERIFIED_FACTS", text: blob, reason: "specification is incomplete" });
      return false;
    }
    if (!/\d/.test(spec.value) && (spec.value.trim().split(/\s+/).length <= 3) && INCOMPLETE_VERB.test(spec.value)) {
      dropped.push({ slot: "VERIFIED_FACTS", text: blob, reason: "specification has no measured value" });
      return false;
    }
    return true;
  });

  const offers = (facts.offerFacts ?? []).filter((offer) => offer.packageName.trim() && (offer.unitPrice || offer.totalPrice));

  const next: ProductFacts = {
    ...facts,
    productName,
    confidence: { ...facts.confidence, productName: facts.confidence.productName === "NOT_FOUND" ? "MANUAL" : facts.confidence.productName },
    description,
    productFormat: operatorCategoryFormat(input.category, facts),
    features: unique(features),
    ingredientsOrComponents: unique(ingredients),
    usageInformation: usage,
    specifications,
    offerFacts: offers,
    sourceSnippets: facts.sourceSnippets,
  };

  return {
    facts: next,
    research: {
      productName,
      category: input.category,
      description,
      ingredients: unique(ingredients),
      features: unique(features),
      sellerClaims: unique(sellerClaims),
      verifiedFacts: unique(verifiedFacts),
      usage,
      offers,
      specifications,
      purchaseLink: input.purchaseLink ?? null,
      dropped,
    },
  };
}

export function commercialHeadline(productName: string, category?: string): string {
  return productName.trim();
}

export function commercialSubheadline(category?: string): string | undefined {
  const kind = category?.trim();
  return kind || undefined;
}
