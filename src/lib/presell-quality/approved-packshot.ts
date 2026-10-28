import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";
import { fileNameFromUrl, looksBotanicalOrIngredient, looksLikePackshotName } from "@/lib/presell-quality/asset-suitability";
import { declarationCoversAsset, type UserAssetDeclaration } from "@/lib/presell-quality/user-asset-declaration";
import { reviewAssetId } from "@/lib/product-research/media-contract";

export type ApprovedPackshot = {
  assetId: string;
  assetUrl: string;
  sourceFile: string;
  authorized: boolean;
};

export function selectApprovedPackshot(input: {
  assets: DiscoveredAffiliateAsset[] | undefined;
  declaration: UserAssetDeclaration | null;
}): ApprovedPackshot | null {
  const approved = (input.assets ?? []).filter((item) => item.status === "USER_APPROVED");
  const declared = input.declaration?.origins ?? [];
  const packshotOrigin = declared.find((item) => looksLikePackshotName(item.sourceFile) && !looksBotanicalOrIngredient(item.sourceFile));
  const match = packshotOrigin
    ? approved.find((item) => reviewAssetId(item.assetUrl) === packshotOrigin.assetId)
    : approved.find((item) => looksLikePackshotName(fileNameFromUrl(item.assetUrl)) && !looksBotanicalOrIngredient(fileNameFromUrl(item.assetUrl)));
  if (!match) return null;
  const assetId = reviewAssetId(match.assetUrl);
  return {
    assetId,
    assetUrl: match.assetUrl,
    sourceFile: packshotOrigin?.sourceFile || fileNameFromUrl(match.assetUrl),
    authorized: declarationCoversAsset(input.declaration, assetId),
  };
}

export function botanicalAssetIds(input: {
  assets: DiscoveredAffiliateAsset[] | undefined;
  declaration: UserAssetDeclaration | null;
}): string[] {
  const fromOrigins = (input.declaration?.origins ?? [])
    .filter((item) => looksBotanicalOrIngredient(item.sourceFile))
    .map((item) => item.assetId);
  const fromAssets = (input.assets ?? [])
    .filter((item) => looksBotanicalOrIngredient(fileNameFromUrl(item.assetUrl)))
    .map((item) => reviewAssetId(item.assetUrl));
  return [...new Set([...fromOrigins, ...fromAssets])];
}
