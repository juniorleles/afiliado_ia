export const PRODUCT_VISUAL_PLANNER_VERSION = "product-visual-planner-v1";

export const PRODUCT_VISUAL_ROLES = [
  "HERO_PRODUCT_PRIMARY",
  "HERO_PRODUCT_SECONDARY",
  "PRODUCT_DETAIL",
  "PRODUCT_BUNDLE",
  "SECTION_PRODUCT_MOMENT",
  "CLOSING_PRODUCT_CUE",
] as const;

export type ProductVisualRole = (typeof PRODUCT_VISUAL_ROLES)[number];

export type RenderedProductShot = {
  src: string;
  width: number;
  height: number;
  assetId: string;
  roles: ProductVisualRole[];
};

export type RenderedProductVisuals = {
  heroPrimary?: RenderedProductShot;
  sectionMoment?: RenderedProductShot;
  closingCue?: RenderedProductShot;
};

export const PRODUCT_ASSET_CLASSES = [
  "PRODUCT_ONLY",
  "BOTTLE_ONLY",
  "BOX_ONLY",
  "BOTTLE_AND_BOX",
  "BUNDLE",
  "MULTI_BOTTLE",
  "ALTERNATE_PRODUCT_ANGLE",
  "TRANSPARENT_PACKSHOT",
  "CLEAN_STUDIO_PACKSHOT",
  "PRODUCT_STAGE",
  "COMPOSITE_PRODUCT_PERSON",
  "LOGO",
  "BRAND_GRAPHIC",
  "LIFESTYLE_IMAGE",
  "DECORATIVE_VENDOR_GRAPHIC",
  "UNKNOWN",
] as const;

export type ProductAssetClass = (typeof PRODUCT_ASSET_CLASSES)[number];
export type ProductVisualTri = "YES" | "NO" | "LIKELY" | "UNKNOWN";
export type ProductDominance = "LIKELY_HIGH" | "LIKELY_MEDIUM" | "LIKELY_LOW" | "NO" | "UNKNOWN";

export type ProductVisualSource = {
  assetId: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  assetClass: ProductAssetClass[];
  containsProduct: ProductVisualTri;
  containsPerson: ProductVisualTri;
  containsExternalIcons: ProductVisualTri;
  productDominance: ProductDominance;
  visualUsability: string[];
};

export type ProductVisualPresentation = "hero" | "secondary" | "bundle" | "section" | "closing";

export type PlannedProductUse = {
  role: ProductVisualRole;
  assetId: string;
  width: number;
  height: number;
  fit: "contain";
  presentation: ProductVisualPresentation;
};

export type OmittedProductRole = {
  role: ProductVisualRole;
  reason: string;
};

export type ProductVisualPlan = {
  plannerVersion: typeof PRODUCT_VISUAL_PLANNER_VERSION;
  imageTextReimportAllowed: false;
  factualAuthority: false;
  roles: Partial<Record<ProductVisualRole, PlannedProductUse>>;
  omitted: OmittedProductRole[];
};

export type ProductVisualPlanInput = {
  assets: ProductVisualSource[];
};
