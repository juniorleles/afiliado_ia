import type { DiscoveredAffiliateAsset, GalleryKind } from "@/lib/affiliate-policy/types";
import { decorateDiscoveredAssets } from "@/lib/product-research/asset-display";

export type CommercialMediaImage = { src: string; alt: string };

export type MediaExclusionReason =
  | "NOT_APPROVED"
  | "REJECTED"
  | "PENDING"
  | "PROMOTIONAL_BANNER"
  | "LOGO"
  | "INGREDIENT_NOT_PACKSHOT"
  | "NO_PACKSHOT_EVIDENCE"
  | "NOT_ELIGIBLE_FOR_ROLE";

export type MediaRole = "hero" | "gallery" | "ingredient" | "excluded";
export type HeroImageStatus = "SELECTED" | "HERO_IMAGE_MISSING";

export type ReviewMediaItem = {
  assetId: string;
  assetUrl: string;
  sourceUrl: string;
  campaignId: number | null;
  approvalStatus: DiscoveredAffiliateAsset["status"];
  galleryKind: GalleryKind;
  heroFlag: boolean;
  editorialEligibility: "ELIGIBLE" | "INELIGIBLE";
  role: MediaRole;
  used: boolean;
  exclusionReason: MediaExclusionReason | null;
};

export type ReviewMediaSelection = {
  approved: ReviewMediaItem[];
  eligible: ReviewMediaItem[];
  used: ReviewMediaItem[];
  excluded: ReviewMediaItem[];
  hero: CommercialMediaImage | null;
  gallery: CommercialMediaImage[];
  heroStatus: HeroImageStatus;
  approvedCount: number;
  eligibleCount: number;
  usedCount: number;
};

function fnvId(url: string): string {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `asset-${(hash >>> 0).toString(16)}`;
}

export function reviewAssetId(assetUrl: string): string {
  return fnvId(assetUrl.trim());
}

function kindOf(asset: DiscoveredAffiliateAsset): GalleryKind {
  return asset.galleryKind ?? "OTHER";
}

function pendingStatus(status: DiscoveredAffiliateAsset["status"]): boolean {
  return status === "DISCOVERED" || status === "REVIEW_REQUIRED";
}

function heroEligibleKind(kind: GalleryKind): boolean {
  return kind === "PRODUCT_PACKSHOT";
}

function galleryEligibleKind(kind: GalleryKind): boolean {
  return kind === "PRODUCT_PACKSHOT" || kind === "LIFESTYLE" || kind === "OTHER" || kind === "INGREDIENT";
}

function exclusionFor(asset: DiscoveredAffiliateAsset, role: MediaRole): MediaExclusionReason | null {
  if (asset.status === "REJECTED") return "REJECTED";
  if (pendingStatus(asset.status)) return "PENDING";
  if (asset.status !== "USER_APPROVED") return "NOT_APPROVED";
  const kind = kindOf(asset);
  if (kind === "BANNER") return "PROMOTIONAL_BANNER";
  if (kind === "LOGO") return "LOGO";
  if (role === "hero" && kind === "INGREDIENT") return "INGREDIENT_NOT_PACKSHOT";
  if (role === "hero" && !heroEligibleKind(kind)) return "NO_PACKSHOT_EVIDENCE";
  if (role === "excluded") return "NOT_ELIGIBLE_FOR_ROLE";
  return null;
}

function itemOf(input: {
  asset: DiscoveredAffiliateAsset;
  campaignId: number | null;
  role: MediaRole;
  used: boolean;
}): ReviewMediaItem {
  const kind = kindOf(input.asset);
  const eligible =
    input.asset.status === "USER_APPROVED" &&
    (heroEligibleKind(kind) || galleryEligibleKind(kind)) &&
    kind !== "BANNER" &&
    kind !== "LOGO";
  return {
    assetId: reviewAssetId(input.asset.assetUrl),
    assetUrl: input.asset.assetUrl,
    sourceUrl: input.asset.sourceUrl,
    campaignId: input.campaignId,
    approvalStatus: input.asset.status,
    galleryKind: kind,
    heroFlag: Boolean(input.asset.hero),
    editorialEligibility: eligible ? "ELIGIBLE" : "INELIGIBLE",
    role: input.role,
    used: input.used,
    exclusionReason: input.used ? null : exclusionFor(input.asset, input.role),
  };
}

function commercialOf(asset: DiscoveredAffiliateAsset, productName: string, role: MediaRole): CommercialMediaImage {
  const kind = kindOf(asset);
  const suffix = role === "ingredient" || kind === "INGREDIENT" ? "ingredient image" : "approved image";
  return { src: asset.assetUrl, alt: `${productName} ${suffix}` };
}

export function selectReviewMedia(input: {
  assets: DiscoveredAffiliateAsset[] | undefined;
  productName: string;
  campaignId?: number | null;
}): ReviewMediaSelection {
  const campaignId = input.campaignId ?? null;
  const decorated = decorateDiscoveredAssets(input.assets);
  const approved = decorated.filter((item) => item.status === "USER_APPROVED");
  const packshots = approved.filter((item) => heroEligibleKind(kindOf(item)));
  const heroAsset =
    packshots.find((item) => item.hero) ??
    packshots[0] ??
    null;
  const galleryAssets = approved.filter((item) => {
    if (heroAsset && item.assetUrl === heroAsset.assetUrl) return false;
    return galleryEligibleKind(kindOf(item));
  });
  const usedUrls = new Set([
    ...(heroAsset ? [heroAsset.assetUrl] : []),
    ...galleryAssets.map((item) => item.assetUrl),
  ]);
  const rows: ReviewMediaItem[] = decorated.map((asset) => {
    if (heroAsset && asset.assetUrl === heroAsset.assetUrl) {
      return itemOf({ asset, campaignId, role: "hero", used: true });
    }
    if (galleryAssets.some((item) => item.assetUrl === asset.assetUrl)) {
      return itemOf({
        asset,
        campaignId,
        role: kindOf(asset) === "INGREDIENT" ? "ingredient" : "gallery",
        used: true,
      });
    }
    const role: MediaRole =
      asset.status === "USER_APPROVED" && kindOf(asset) === "INGREDIENT" && !heroAsset ? "ingredient" : "excluded";
    return itemOf({ asset, campaignId, role, used: usedUrls.has(asset.assetUrl) });
  });
  const hero = heroAsset ? commercialOf(heroAsset, input.productName, "hero") : null;
  const gallery = galleryAssets.map((asset) =>
    commercialOf(asset, input.productName, kindOf(asset) === "INGREDIENT" ? "ingredient" : "gallery"),
  );
  const eligible = rows.filter((item) => item.editorialEligibility === "ELIGIBLE" && item.approvalStatus === "USER_APPROVED");
  const used = rows.filter((item) => item.used);
  return {
    approved: rows.filter((item) => item.approvalStatus === "USER_APPROVED"),
    eligible,
    used,
    excluded: rows.filter((item) => !item.used),
    hero,
    gallery,
    heroStatus: hero ? "SELECTED" : "HERO_IMAGE_MISSING",
    approvedCount: approved.length,
    eligibleCount: eligible.length,
    usedCount: used.length,
  };
}
