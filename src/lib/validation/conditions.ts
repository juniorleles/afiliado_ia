import type { ProductFacts } from "@/lib/product-facts";
import type { AssetQaSnapshot, SourceCondition, SourceQaSnapshot } from "@/lib/validation/types";

const HEALTH_HINT =
  /\b(supplement|probiotic|vitamin|immune|oral|gum|tooth|dental|joint|weight|diet|collagen|cbd|health|capsule|tablet|gummies)\b/i;

export function factCompleteness(facts: ProductFacts): SourceQaSnapshot["productFactCompleteness"] {
  const filled = [
    Boolean(facts.description?.trim()),
    facts.features.length > 0,
    facts.ingredientsOrComponents.length > 0,
    facts.usageInformation.length > 0,
    facts.cautions.length > 0,
    Boolean(facts.guaranteeInformation?.trim()),
    Boolean(facts.pricingInformation?.trim()),
    Boolean(facts.manufacturer?.trim()),
  ].filter(Boolean).length;
  if (filled === 0) return "EMPTY";
  if (filled >= 4) return "RICH";
  return "LIMITED";
}

export function detectSourceConditions(facts: ProductFacts, asset: AssetQaSnapshot): SourceCondition[] {
  const out: SourceCondition[] = [];
  if (!asset.packshotFound) out.push("NO_PACKSHOT");
  else if (asset.packshotRole === "PRODUCT_PACKSHOT" && asset.packshotDimensions && Math.min(asset.packshotDimensions.width, asset.packshotDimensions.height) >= 400) {
    out.push("GOOD_PACKSHOT");
  } else {
    out.push("WEAK_PACKSHOT");
  }

  const completeness = factCompleteness(facts);
  if (completeness === "RICH") out.push("RICH_PRODUCT_FACTS");
  else out.push("LIMITED_PRODUCT_FACTS");

  const haystack = [
    facts.description || "",
    facts.features.join(" "),
    facts.ingredientsOrComponents.join(" "),
    facts.cautions.join(" "),
  ].join(" ");
  if (HEALTH_HINT.test(haystack) || facts.ingredientsOrComponents.length > 0) out.push("HEALTH_SENSITIVE");
  else out.push("NON_HEALTH");

  const snippetChars = facts.sourceSnippets.reduce((sum, item) => sum + item.text.length, 0);
  if (snippetChars >= 1200 || (facts.description || "").length >= 600) out.push("LONG_SOURCE");
  else out.push("SHORT_SOURCE");

  if (facts.importQuality === "SUFFICIENT") out.push("GOOD_IMPORT_SOURCE");
  else out.push("DIFFICULT_IMPORT_SOURCE");

  return out;
}

export function buildSourceQa(facts: ProductFacts, asset: AssetQaSnapshot): SourceQaSnapshot {
  return {
    importQuality: facts.importQuality,
    productAssetStatus: asset.packshotFound ? "READY" : "NEEDS_ASSET",
    productFactCompleteness: factCompleteness(facts),
    sourceProvenance: facts.origin,
    conditions: detectSourceConditions(facts, asset),
  };
}
