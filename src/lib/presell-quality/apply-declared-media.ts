import type { V4Model } from "@/lib/product-showcase/v4/model";
import type { EditorialPlacement } from "@/lib/presell-quality/editorial-placement";

export function applyDeclaredPresellMedia(model: V4Model, placement: EditorialPlacement): V4Model {
  const hero = placement.hero;
  const composition = hero ? "product-hero" : model.composition;
  return {
    ...model,
    composition,
    commercialImage: hero
      ? { src: hero.src, alt: hero.alt, presentation: "PRODUCT_IMAGE" }
      : undefined,
    galleryImages: placement.gallery.map((item) => ({ src: item.src, alt: item.alt })),
    blueprint: {
      ...model.blueprint,
      narrative: {
        ...model.blueprint.narrative,
        compositionHint: composition,
        shape: hero ? model.blueprint.narrative.shape : "FACTS_LED",
      },
      images: {
        ...model.blueprint.images,
        hero: hero
          ? {
              src: hero.src,
              alt: hero.alt,
              evidenceRefs: model.blueprint.images.hero?.evidenceRefs ?? [],
            }
          : undefined,
      },
    },
  };
}

export function galleryHasDuplicateSrc(images: Array<{ src: string }> | undefined, heroSrc?: string): boolean {
  const seen = new Set<string>();
  if (heroSrc) seen.add(heroSrc);
  for (const image of images ?? []) {
    if (!image.src) continue;
    if (seen.has(image.src)) return true;
    seen.add(image.src);
  }
  return false;
}
