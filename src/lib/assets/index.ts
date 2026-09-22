export {
  ASSET_ROLES,
  AI_ASSET_ROLES,
  ASSET_PROVENANCE,
  CLASSIFICATION_METHODS,
  PRODUCT_ASSET_STATUSES,
  ASSET_ROLE_QUESTION,
} from "@/lib/assets/types";
export type {
  AssetRole,
  AiAssetRole,
  AssetProvenance,
  ClassificationMethod,
  ProductAssetStatus,
  AssetCandidate,
  ProductAssetMetadata,
} from "@/lib/assets/types";
export { classifyAssetCandidate, pickBestPackshot, looksLikePromoCta } from "@/lib/assets/classify";
export { discoverSourceAssets, summarizeDiscovery } from "@/lib/assets/discover";
export { evaluateProductAsset, inspectStoredProductFile } from "@/lib/assets/status";
export { inspectImageQuality, readImageDimensions, sniffImageMime, looksLikeHtmlOrScript } from "@/lib/assets/quality";
export { parseAssetRoleResponse, assetRoleClassifierPrompt } from "@/lib/assets/vision";
export { acquireBestProductAsset, MAX_ASSET_PROBES } from "@/lib/assets/acquire";
export type { AcquisitionResult, ProbedCandidate } from "@/lib/assets/acquire";
