/**
 * Asset Intelligence types. Presentation assistance only.
 * Roles never imply medical efficacy, authenticity, or endorsement.
 */

export const ASSET_ROLES = [
  "PRODUCT_PACKSHOT",
  "PRODUCT_LIFESTYLE",
  "INGREDIENT_VISUAL",
  "BRAND_LOGO",
  "DECORATIVE_SOURCE",
  "UNUSABLE",
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const AI_ASSET_ROLES = [...ASSET_ROLES, "UNCERTAIN"] as const;
export type AiAssetRole = (typeof AI_ASSET_ROLES)[number];

export const ASSET_PROVENANCE = ["DIRECT_SOURCE", "MANUAL", "NOT_FOUND"] as const;
export type AssetProvenance = (typeof ASSET_PROVENANCE)[number];

export const CLASSIFICATION_METHODS = ["DETERMINISTIC", "AI_CLASSIFIED", "MANUAL"] as const;
export type ClassificationMethod = (typeof CLASSIFICATION_METHODS)[number];

export const PRODUCT_ASSET_STATUSES = ["READY", "NEEDS_ASSET", "NOT_APPLICABLE"] as const;
export type ProductAssetStatus = (typeof PRODUCT_ASSET_STATUSES)[number];

export const ASSET_DISCOVERY_SOURCES = ["og", "twitter", "jsonld", "img", "srcset", "picture", "css", "lazy"] as const;
export type AssetDiscoverySource = (typeof ASSET_DISCOVERY_SOURCES)[number];

export type AssetCandidate = {
  url: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  source: AssetDiscoverySource;
  tagHtml: string;
  className: string;
  parentHint: string;
  role: AssetRole | "UNCERTAIN";
  packshotScore: number;
  rejected: boolean;
  rejectReason: string | null;
  classificationMethod: ClassificationMethod;
  provenance: AssetProvenance;
};

export type ProductAssetMetadata = {
  status: ProductAssetStatus;
  role: AssetRole | "UNCERTAIN" | null;
  provenance: AssetProvenance;
  classificationMethod: ClassificationMethod | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  src: string | null;
  qualityFindings: string[];
};

export const ASSET_ROLE_QUESTION = "What role does this image appear to serve?";
