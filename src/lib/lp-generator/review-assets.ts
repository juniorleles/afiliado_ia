import type { ReviewMediaSelection } from "@/lib/product-research/media-contract";
import type { V4Model } from "@/lib/product-showcase/v4/model";

export function overlayReviewMedia(model: V4Model, selection: ReviewMediaSelection): V4Model {
  return {
    ...model,
    commercialImage: selection.hero ?? undefined,
    galleryImages: selection.gallery,
    blueprint: {
      ...model.blueprint,
      images: {
        ...model.blueprint.images,
        hero: selection.hero
          ? {
              src: selection.hero.src,
              alt: selection.hero.alt,
              evidenceRefs: model.blueprint.images.hero?.evidenceRefs ?? [],
            }
          : null,
      },
    },
  };
}
