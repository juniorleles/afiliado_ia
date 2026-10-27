import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";
import { decorateDiscoveredAssets, proposeGalleryKind } from "@/lib/product-research/asset-display";
import { selectReviewMedia } from "@/lib/product-research/media-contract";

export const IMAGE_STAGES = [
  "IMAGE_DISCOVERED",
  "IMAGE_IDENTITY_VERIFIED",
  "IMAGE_RIGHTS_VERIFIED",
  "IMAGE_PLACEMENT_ELIGIBLE",
  "IMAGE_APPROVED",
] as const;
export type ImageStage = (typeof IMAGE_STAGES)[number];

export type ImageRecoveryCandidate = {
  assetUrl: string;
  sourceUrl: string;
  currentKind: string;
  status: DiscoveredAffiliateAsset["status"];
  stages: ImageStage[];
  identityVerified: boolean;
  rightsVerified: boolean;
  placementEligible: boolean;
  approved: boolean;
  heroPromotionBlocked: boolean;
  justification: string;
  limitations: string[];
};

export function stageImageCandidates(input: {
  assets: DiscoveredAffiliateAsset[] | undefined;
  productName: string;
  campaignId?: number | null;
}): {
  candidates: ImageRecoveryCandidate[];
  heroEligibleCount: number;
  approvalsChanged: false;
} {
  const decorated = decorateDiscoveredAssets(input.assets);
  const media = selectReviewMedia({
    assets: input.assets,
    productName: input.productName,
    campaignId: input.campaignId ?? null,
  });
  const candidates = decorated.map((asset) => {
    const proposal = asset.kindProposal ?? proposeGalleryKind(asset);
    const packshotKind = asset.galleryKind === "PRODUCT_PACKSHOT";
    const identityVerified = packshotKind;
    const approved = asset.status === "USER_APPROVED";
    const rightsVerified = approved && asset.declaredAuthorization !== "UNSTATED";
    const placementEligible = approved && packshotKind;
    const stages: ImageStage[] = ["IMAGE_DISCOVERED"];
    if (identityVerified) stages.push("IMAGE_IDENTITY_VERIFIED");
    if (rightsVerified) stages.push("IMAGE_RIGHTS_VERIFIED");
    if (placementEligible) stages.push("IMAGE_PLACEMENT_ELIGIBLE");
    if (approved) stages.push("IMAGE_APPROVED");
    const limitations = [
      ...(asset.usageRestrictions ?? []),
      "Human approval is required before galleryKind or hero placement changes.",
      "A USER_APPROVED OTHER image is not a hero packshot.",
    ];
    if (proposal?.status === "PENDING") {
      limitations.push(proposal.reason, ...proposal.limitations);
    }
    return {
      assetUrl: asset.assetUrl,
      sourceUrl: asset.sourceUrl,
      currentKind: asset.galleryKind ?? "OTHER",
      status: asset.status,
      stages,
      identityVerified,
      rightsVerified,
      placementEligible,
      approved,
      heroPromotionBlocked: !placementEligible,
      justification: packshotKind
        ? "Gallery kind is already PRODUCT_PACKSHOT."
        : proposal?.status === "PENDING"
          ? `Pending kind proposal ${proposal.proposedKind}. Not confirmed.`
          : "No packshot identity evidence. Asset stays in its current role.",
      limitations,
    } satisfies ImageRecoveryCandidate;
  });
  return {
    candidates,
    heroEligibleCount: media.heroStatus === "SELECTED" ? 1 : 0,
    approvalsChanged: false,
  };
}
