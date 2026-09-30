import {
  PRODUCT_VISUAL_PLANNER_VERSION,
  PRODUCT_VISUAL_ROLES,
  type PlannedProductUse,
  type ProductAssetClass,
  type ProductVisualPlan,
  type ProductVisualPlanInput,
  type ProductVisualRole,
  type ProductVisualSource,
  type ProductVisualTri,
} from "@/lib/product-visual/types";

const NON_PRODUCT_CLASSES = new Set<ProductAssetClass>(["LOGO", "BRAND_GRAPHIC", "LIFESTYLE_IMAGE", "DECORATIVE_VENDOR_GRAPHIC", "UNKNOWN"]);
const CLEAN_CLASSES = new Set<ProductAssetClass>([
  "PRODUCT_ONLY",
  "BOTTLE_ONLY",
  "BOX_ONLY",
  "BOTTLE_AND_BOX",
  "TRANSPARENT_PACKSHOT",
  "CLEAN_STUDIO_PACKSHOT",
  "PRODUCT_STAGE",
]);

function affirmative(value: ProductVisualTri): boolean {
  return value === "YES" || value === "LIKELY";
}

function hasClass(asset: ProductVisualSource, name: ProductAssetClass): boolean {
  return asset.assetClass.includes(name);
}

function productBearing(asset: ProductVisualSource): boolean {
  if (!affirmative(asset.containsProduct)) return false;
  if (asset.assetClass.length > 0 && asset.assetClass.every((name) => NON_PRODUCT_CLASSES.has(name))) return false;
  return true;
}

function rejectedWhenAlternativesExist(asset: ProductVisualSource): boolean {
  return asset.visualUsability.includes("NOT_RECOMMENDED");
}

function bundleAsset(asset: ProductVisualSource): boolean {
  return hasClass(asset, "BUNDLE") || hasClass(asset, "MULTI_BOTTLE");
}

/** Preference cascade. This is not a numeric quality score. */
function heroTier(asset: ProductVisualSource): number {
  const person = affirmative(asset.containsPerson);
  const icons = affirmative(asset.containsExternalIcons);
  const clean = asset.assetClass.some((name) => CLEAN_CLASSES.has(name)) && !person && !icons;
  if (clean && asset.hasAlpha && (hasClass(asset, "TRANSPARENT_PACKSHOT") || hasClass(asset, "CLEAN_STUDIO_PACKSHOT") || hasClass(asset, "PRODUCT_ONLY") || hasClass(asset, "BOTTLE_ONLY"))) {
    return 1;
  }
  if (clean && (hasClass(asset, "CLEAN_STUDIO_PACKSHOT") || hasClass(asset, "PRODUCT_ONLY") || hasClass(asset, "BOTTLE_ONLY"))) return 2;
  if (hasClass(asset, "PRODUCT_STAGE") && !person && !icons) return 3;
  if (!person && !hasClass(asset, "COMPOSITE_PRODUCT_PERSON")) return 4;
  return 5;
}

function preferHero(assets: ProductVisualSource[]): ProductVisualSource | null {
  const ranked = assets
    .map((asset, index) => ({ asset, index, tier: heroTier(asset) }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const aBundle = bundleAsset(a.asset) ? 1 : 0;
      const bBundle = bundleAsset(b.asset) ? 1 : 0;
      if (aBundle !== bBundle) return aBundle - bBundle;
      const aPrimary = a.asset.visualUsability.includes("HERO_PRIMARY") ? 0 : 1;
      const bPrimary = b.asset.visualUsability.includes("HERO_PRIMARY") ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      return a.index - b.index;
    });
  return ranked[0]?.asset ?? null;
}

function useOf(asset: ProductVisualSource, role: ProductVisualRole, presentation: PlannedProductUse["presentation"]): PlannedProductUse {
  return {
    role,
    assetId: asset.assetId,
    width: asset.width,
    height: asset.height,
    fit: "contain",
    presentation,
  };
}

export function planProductVisual(input: ProductVisualPlanInput): ProductVisualPlan {
  const bearing = input.assets.filter(productBearing);
  const preferred = bearing.filter((asset) => !rejectedWhenAlternativesExist(asset));
  const pool = preferred.length > 0 ? preferred : bearing;
  const roles: ProductVisualPlan["roles"] = {};
  const omitted: ProductVisualPlan["omitted"] = [];
  const hero = preferHero(pool);
  if (!hero) {
    for (const role of PRODUCT_VISUAL_ROLES) omitted.push({ role, reason: "no usable source product asset" });
    return { plannerVersion: PRODUCT_VISUAL_PLANNER_VERSION, imageTextReimportAllowed: false, factualAuthority: false, roles, omitted };
  }
  roles.HERO_PRODUCT_PRIMARY = useOf(hero, "HERO_PRODUCT_PRIMARY", "hero");

  const bundle =
    pool.find((asset) => bundleAsset(asset) && !affirmative(asset.containsPerson) && asset.assetId !== hero.assetId) ??
    (bundleAsset(hero) && !affirmative(hero.containsPerson) ? hero : null);
  if (bundle) {
    roles.PRODUCT_BUNDLE = useOf(bundle, "PRODUCT_BUNDLE", "bundle");
    roles.SECTION_PRODUCT_MOMENT = useOf(bundle, "SECTION_PRODUCT_MOMENT", "section");
  } else {
    omitted.push({ role: "PRODUCT_BUNDLE", reason: "no source bundle asset" });
    if (hero.visualUsability.includes("SECTION_PRODUCT_MOMENT") && !affirmative(hero.containsPerson)) {
      roles.SECTION_PRODUCT_MOMENT = useOf(hero, "SECTION_PRODUCT_MOMENT", "section");
    } else {
      omitted.push({ role: "SECTION_PRODUCT_MOMENT", reason: "no separate safe product moment" });
    }
  }

  const secondary = pool.find(
    (asset) =>
      asset.assetId !== hero.assetId &&
      asset.assetId !== bundle?.assetId &&
      asset.visualUsability.includes("HERO_SECONDARY") &&
      !affirmative(asset.containsPerson),
  );
  if (secondary) roles.HERO_PRODUCT_SECONDARY = useOf(secondary, "HERO_PRODUCT_SECONDARY", "secondary");
  else omitted.push({ role: "HERO_PRODUCT_SECONDARY", reason: bundle ? "bundle provides the second product moment" : "no distinct secondary source asset" });

  const closing =
    pool.find((asset) => asset.visualUsability.includes("CLOSING_PRODUCT_CUE") && !affirmative(asset.containsPerson)) ??
    (affirmative(hero.containsPerson) ? null : hero);
  if (closing) roles.CLOSING_PRODUCT_CUE = useOf(closing, "CLOSING_PRODUCT_CUE", "closing");
  else omitted.push({ role: "CLOSING_PRODUCT_CUE", reason: "no clean closing source asset" });

  omitted.push({ role: "PRODUCT_DETAIL", reason: "no isolated product-detail source selected" });
  return { plannerVersion: PRODUCT_VISUAL_PLANNER_VERSION, imageTextReimportAllowed: false, factualAuthority: false, roles, omitted };
}
