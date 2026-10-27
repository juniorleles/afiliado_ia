export const GALLERY_IMPACT_NOISE_BAND = 2;

export type GallerySuppressionImpact = "IMPROVED" | "REGRESSED" | "INCONCLUSIVE";

export function gallerySuppressionImpact(input: {
  previousWithGallery: number | null;
  currentWithoutGallery: number | null;
  noiseBand?: number;
}): GallerySuppressionImpact {
  if (input.previousWithGallery == null || input.currentWithoutGallery == null) return "INCONCLUSIVE";
  const delta = input.currentWithoutGallery - input.previousWithGallery;
  const band = input.noiseBand ?? GALLERY_IMPACT_NOISE_BAND;
  if (delta > band) return "IMPROVED";
  if (delta < -band) return "REGRESSED";
  return "INCONCLUSIVE";
}
