import { isTechnicalPlaceholderImage, type CommercialImage } from "@/lib/product-showcase/v4/presentation";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import { selectApprovedGallery, selectApprovedHero } from "@/lib/real-product-assets/select";
import {
  classifyContextualFit,
  galleryAllowedForContext,
  readContextReviews,
  reviewFor,
} from "@/lib/real-product-assets/context-fit";
import type { DiscoveredImage, ProductCatalog } from "@/lib/real-product-assets/types";
import type { PresellMode } from "@/lib/search-intent/types";

export function publicSrcFor(image: DiscoveredImage): string | null {
  if (image.status !== "USER_APPROVED") return null;
  if (!image.localFile) return null;
  if (isTechnicalPlaceholderImage(image.localFile, image.alt ?? undefined)) return null;
  return `/admin/lab/real-assets/file/${image.productKey}/${image.id}`;
}

export function commercialImageFromApproved(catalog: ProductCatalog | null): CommercialImage | undefined {
  if (!catalog) return undefined;
  const hero = selectApprovedHero(catalog.images);
  if (!hero) return undefined;
  const src = publicSrcFor(hero);
  if (!src) return undefined;
  return { src, alt: `${catalog.productName} product image` };
}

export function overlayApprovedAssets(
  model: V4Model,
  catalog: ProductCatalog | null,
  options?: { mode?: PresellMode; root?: string },
): V4Model {
  const mode = options?.mode ?? (model.sandbox?.mode ? "PRESELL_BOFU" : "PRESELL_EDITORIAL");
  const commercialImage = commercialImageFromApproved(catalog);
  const galleryImages = approvedGallerySrcs(catalog, mode, options?.root);
  return {
    ...model,
    commercialImage,
    galleryImages,
    blueprint: {
      ...model.blueprint,
      images: {
        ...model.blueprint.images,
        hero: commercialImage
          ? { src: commercialImage.src, alt: commercialImage.alt, evidenceRefs: model.blueprint.images.hero?.evidenceRefs ?? [] }
          : model.blueprint.images.hero,
      },
    },
  };
}

export function approvedGallerySrcs(catalog: ProductCatalog | null, mode: PresellMode = "PRESELL_EDITORIAL", root?: string): CommercialImage[] {
  if (!catalog) return [];
  const reviews = readContextReviews(catalog.productKey, root);
  return selectApprovedGallery(catalog.images)
    .filter((item) => galleryAllowedForContext(classifyContextualFit(item, reviewFor(item.id, reviews)), mode))
    .map((item) => {
      const src = publicSrcFor(item);
      return src ? { src, alt: `${catalog.productName} product image` } : null;
    })
    .filter((item): item is CommercialImage => Boolean(item));
}
