import { classifyVisualClass } from "@/lib/real-product-assets/visual-class";
import type { GalleryKind, DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";

export type AssetDecisionAction = "ACCEPT" | "REJECT" | "SET_HERO" | "CONFIRM_KIND";

export function proposeGalleryKind(asset: Pick<DiscoveredAffiliateAsset, "assetUrl" | "assetType" | "context" | "galleryKind">): DiscoveredAffiliateAsset["kindProposal"] {
  if (asset.galleryKind === "PRODUCT_PACKSHOT") return null;
  const fileName = fileNameOf(asset.assetUrl);
  const hay = `${asset.assetUrl} ${fileName} ${asset.context}`;
  if (/\b(?:i-|ingredient|formula|logo|banner|signature|sound\.svg|favicon)/i.test(hay)) return null;
  if (!/(?:pack(?:shot)?|(?:\d+)?bootles?|bottles?|box|jar|tub|pouch|sachet|product[-_ ]?(?:shot|image|pack))/i.test(hay)) return null;
  return {
    proposedKind: "PRODUCT_PACKSHOT",
    reason: "Filename or URL metadata suggests a product pack or bottles. Human confirmation is required before changing galleryKind.",
    status: "PENDING",
    limitations: [
      "The current galleryKind stays unchanged until a human confirms the proposal.",
      "Embedded promotional text in the image is not edited or removed.",
      "This proposal does not set the hero image.",
    ],
  };
}

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

export function galleryKindFromAsset(asset: Pick<DiscoveredAffiliateAsset, "assetUrl" | "assetType" | "context">): GalleryKind {
  if (asset.assetType === "BANNER") return "BANNER";
  if (asset.assetType === "LOGO") return "LOGO";
  const fileName = fileNameOf(asset.assetUrl);
  const hay = `${asset.assetUrl} ${fileName} ${asset.context}`;
  if (/\bingredient|formula|compos/i.test(hay)) return "INGREDIENT";
  const visual = classifyVisualClass({
    url: asset.assetUrl,
    fileName,
    probableKind: asset.assetType === "BANNER" ? "banner" : "other",
    alt: asset.context,
  });
  if (visual === "PRODUCT_PACKSHOT") return "PRODUCT_PACKSHOT";
  if (visual === "LIFESTYLE") return "LIFESTYLE";
  if (visual === "PROMOTIONAL") return "BANNER";
  if (visual === "UNSUITABLE" && /\blogo\b/i.test(hay)) return "LOGO";
  return "OTHER";
}

export function mergeAssetDecisions(
  previous: DiscoveredAffiliateAsset[] | undefined,
  next: DiscoveredAffiliateAsset[],
): DiscoveredAffiliateAsset[] {
  const prior = new Map((previous ?? []).map((item) => [item.assetUrl, item]));
  return next.map((item) => {
    const kept = prior.get(item.assetUrl);
    if (!kept) return item;
    const locked = kept.status === "USER_APPROVED" || kept.status === "REJECTED";
    return {
      ...item,
      status: locked ? kept.status : item.status,
      hero: locked ? Boolean(kept.hero) : item.hero,
      decidedAt: kept.decidedAt ?? item.decidedAt ?? null,
      galleryKind: kept.galleryKind ?? item.galleryKind,
      kindProposal: kept.kindProposal ?? item.kindProposal ?? null,
    };
  });
}

export function decorateDiscoveredAssets(assets: DiscoveredAffiliateAsset[] | undefined): DiscoveredAffiliateAsset[] {
  const seen = new Set<string>();
  return (assets ?? []).flatMap((item) => {
    const key = item.assetUrl.trim();
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{
      ...item,
      galleryKind: item.galleryKind ?? galleryKindFromAsset(item),
      hero: Boolean(item.hero),
      decidedAt: item.decidedAt ?? null,
      kindProposal: item.kindProposal ?? proposeGalleryKind({ ...item, galleryKind: item.galleryKind ?? galleryKindFromAsset(item) }),
    }];
  });
}

export function assetApprovalCounts(assets: DiscoveredAffiliateAsset[] | undefined): { approved: number; total: number; pending: number } {
  const list = decorateDiscoveredAssets(assets);
  const approved = list.filter((item) => item.status === "USER_APPROVED").length;
  return { approved, total: list.length, pending: list.filter((item) => item.status === "REVIEW_REQUIRED" || item.status === "DISCOVERED").length };
}
