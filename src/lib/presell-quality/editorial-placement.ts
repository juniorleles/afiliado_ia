import type { AssetSuitability } from "@/lib/presell-quality/asset-suitability";
import {
  declarationAuthorizesAds,
  declarationAuthorizesScope,
  declarationCoversAsset,
  separateMediaStates,
  type UserAssetDeclaration,
} from "@/lib/presell-quality/user-asset-declaration";

export type DeclaredMediaImage = {
  assetId: string;
  src: string;
  alt: string;
  imageType: AssetSuitability["imageType"];
};

export type EditorialPlacement = {
  heroMode: "EDITORIAL_NO_IMAGE" | "PACKSHOT_SPLIT" | "PRODUCT_IMAGE";
  galleryMode: "NONE" | "SUPPRESSED" | "EDITORIAL_GALLERY";
  status: "SELECTED" | "HERO_ASSET_NOT_SUITABLE";
  hero: DeclaredMediaImage | null;
  gallery: DeclaredMediaImage[];
  heroCandidates: string[];
  heroEligibleAssetIds: string[];
  rejectedHero: Array<{ assetId: string; reason: string }>;
};

export function selectEditorialPlacement(input: {
  declaration: UserAssetDeclaration | null;
  classifications: AssetSuitability[];
  sources: Array<{ assetId: string; src: string }>;
  productName: string;
}): EditorialPlacement {
  const adsBlocked = declarationAuthorizesAds(input.declaration) === false;
  const presellOnly = declarationAuthorizesScope(input.declaration, "PRESELL_USE");
  const srcById = new Map(input.sources.map((item) => [item.assetId, item.src]));
  const rejectedHero: Array<{ assetId: string; reason: string }> = [];
  const heroCandidates: string[] = [];
  const heroEligibleAssetIds: string[] = [];

  for (const row of input.classifications) {
    const right = declarationCoversAsset(input.declaration, row.assetId) && presellOnly && adsBlocked;
    const pack = row.imageType === "PRODUCT_PACKSHOT" || row.imageType === "PACKAGING";
    const states = separateMediaStates({
      rightToUse: right,
      suitableForRole: pack && row.heroEligible,
      editorialApproved: false,
    });
    if (pack) heroCandidates.push(row.assetId);
    if (states.assetSuitability && states.rightToUse) heroEligibleAssetIds.push(row.assetId);
    if (!states.rightToUse) {
      rejectedHero.push({ assetId: row.assetId, reason: "RIGHT_TO_USE does not cover this asset for PRESELL_USE." });
    } else if (!states.assetSuitability) {
      rejectedHero.push({ assetId: row.assetId, reason: row.reason });
    }
  }

  const ranked = input.classifications
    .filter((row) => heroEligibleAssetIds.includes(row.assetId))
    .slice()
    .sort((a, b) => b.confidence - a.confidence);
  const chosen = ranked[0] ?? null;
  const heroSrc = chosen ? srcById.get(chosen.assetId) : null;
  const hero =
    chosen && heroSrc
      ? {
          assetId: chosen.assetId,
          src: heroSrc,
          alt: `${input.productName} product image`,
          imageType: chosen.imageType,
        }
      : null;

  const gallery: DeclaredMediaImage[] = [];
  const seen = new Set<string>(hero ? [hero.src] : []);
  for (const row of input.classifications) {
    if (hero && row.assetId === hero.assetId) continue;
    const right = declarationCoversAsset(input.declaration, row.assetId) && presellOnly;
    const src = srcById.get(row.assetId);
    if (!right || !src || !row.galleryEligible) continue;
    if (row.imageType === "INGREDIENT" || row.imageType === "DECORATIVE") continue;
    if (seen.has(src)) continue;
    seen.add(src);
    gallery.push({
      assetId: row.assetId,
      src,
      alt: `${input.productName} approved image`,
      imageType: row.imageType,
    });
  }

  return {
    heroMode: hero ? "PRODUCT_IMAGE" : "EDITORIAL_NO_IMAGE",
    galleryMode: !hero ? "SUPPRESSED" : gallery.length ? "EDITORIAL_GALLERY" : "NONE",
    status: hero ? "SELECTED" : "HERO_ASSET_NOT_SUITABLE",
    hero,
    gallery,
    heroCandidates,
    heroEligibleAssetIds,
    rejectedHero,
  };
}
