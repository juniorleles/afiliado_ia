import { isIngredientIdentityName, isProductAttributeChip, isPromotionalOrCta } from "@/lib/import-heuristics";
import { isIncompleteFragment } from "@/lib/lp-generator/structure";

export const ATTRIBUTE_CLASS_VERSION = 1 as const;

export type AttributeClass =
  | "INGREDIENT"
  | "PRODUCT_FEATURE"
  | "USAGE_INSTRUCTION"
  | "SELLER_CLAIM"
  | "GUARANTEE_OR_POLICY"
  | "UNKNOWN";

export type AttributeClassification = {
  class: AttributeClass;
  reason: string;
};

const USAGE =
  /\b(how to (use|apply|take)|chew|swallow|apply|take one|once (a|per) day|every morning|with water|directions?|suggested use)\b/i;
const GUARANTEE =
  /\b(money[- ]back|refund|guarantee|warranty|return window|days? to (return|refund))\b/i;
const FEATURE_SHAPE =
  /^(?:no|non[- ])\b|[- ]free$|^easy\s+to\b|habit[- ]forming|^natural formula$|^all[- ]natural$/i;
const MATERIAL =
  /\b[A-Za-z]\.\s*[a-z]{3,}\b|\b[A-Z]{1,4}[-.]?\d{2,}\b|[®™]|\b(extract|vitamin|mineral|acid|oil|zinc|iron|magnesium|calcium|probiotic|bacillus|lactobacillus|coccus|berry|root|leaf|seed)\b/i;
const LATIN = /\b[A-Z][a-z]{3,}\s+[a-z]{3,}\b/;
const SELLER =
  /\b(transform(?:s|ed|ing)? lives?|life[- ]changing|clinically|scientifically|miracle|guaranteed results?|backed by research)\b/i;

export function classifyAttribute(
  text: string,
  context?: { sourceHeading?: string; fieldHint?: string },
): AttributeClassification {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || isIncompleteFragment(value)) {
    return { class: "UNKNOWN", reason: "empty or incomplete text" };
  }
  if (GUARANTEE.test(value)) {
    return { class: "GUARANTEE_OR_POLICY", reason: "refund or warranty language" };
  }
  if (USAGE.test(value) && value.split(/\s+/).length >= 4) {
    return { class: "USAGE_INSTRUCTION", reason: "usage or direction language" };
  }
  if (SELLER.test(value) || isPromotionalOrCta(value)) {
    return { class: "SELLER_CLAIM", reason: "promotional or unverifiable seller language" };
  }

  if (FEATURE_SHAPE.test(value)) {
    return { class: "PRODUCT_FEATURE", reason: "short commercial characteristic, not a material name" };
  }
  if (isIngredientIdentityName(value)) {
    return { class: "INGREDIENT", reason: "material or organism name stated by the source" };
  }
  if (/\b(formula|system|complex|blend|support)\b/i.test(value)) {
    return { class: "UNKNOWN", reason: "blend or support caption is not a single ingredient" };
  }
  if (isProductAttributeChip(value)) {
    return { class: "PRODUCT_FEATURE", reason: "short commercial characteristic, not a material name" };
  }
  const heading = (context?.sourceHeading ?? context?.fieldHint ?? "").toLowerCase();
  if (heading.includes("ingredient") && (MATERIAL.test(value) || LATIN.test(value))) {
    return { class: "INGREDIENT", reason: "source heading presented this as a component" };
  }
  return { class: "UNKNOWN", reason: "not enough evidence to treat this as an ingredient" };
}

export function isRenderableIngredient(text: string, context?: { sourceHeading?: string; fieldHint?: string }): boolean {
  return classifyAttribute(text, context).class === "INGREDIENT";
}
