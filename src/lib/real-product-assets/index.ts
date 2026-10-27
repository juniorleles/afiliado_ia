export { inspectPublicHttpsUrl, isSafePublicHttpsUrl, stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
export { extractPageImages, productKeyFromName } from "@/lib/real-product-assets/extract";
export { imagesFromHtml, discoverFromUrls } from "@/lib/real-product-assets/discover";
export { applyDecision, reuseApproval, imageIdFor } from "@/lib/real-product-assets/authorize";
export { selectApprovedHero, selectApprovedGallery, assignVisualRole } from "@/lib/real-product-assets/select";
export { overlayApprovedAssets, commercialImageFromApproved } from "@/lib/real-product-assets/overlay";
export { gallerySection, toGalleryCard, groupGalleryCards, thumbnailPath, isDisplayableImageUrl } from "@/lib/real-product-assets/gallery";
export { loadCatalogThumbnail, validateThumbnailBytes } from "@/lib/real-product-assets/thumbnail";
export { approveCatalogImages, decideCatalogImage } from "@/lib/real-product-assets/approve";
export { storeApprovedFile } from "@/lib/real-product-assets/persist";
export { readCatalog, writeCatalog, listCatalogs, emptyCatalog, mergeDiscoveredWithoutApproval, DEFAULT_STORE_ROOT } from "@/lib/real-product-assets/store";
export { classifyVisualClass, isPromotionalVisual, isLabFixtureUrl } from "@/lib/real-product-assets/visual-class";
export {
  classifyContextualFit,
  galleryAllowedForContext,
  readContextReviews,
  writeContextReviews,
} from "@/lib/real-product-assets/context-fit";
export type { DiscoveredImage, DiscoveryReport, ProductCatalog, OperationalStatus } from "@/lib/real-product-assets/types";
