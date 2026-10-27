import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";
import { decorateDiscoveredAssets } from "@/lib/product-research/asset-display";
import { reviewAssetId } from "@/lib/product-research/media-contract";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";

export const USER_AUTHORIZATION_SOURCE = "USER_DECLARATION" as const;
export const PRESELL_AUTHORIZATION_SCOPE = "PRESELL_USE" as const;
export const USER_ATTESTED_VERIFICATION = "USER_ATTESTED_NOT_INDEPENDENTLY_VERIFIED" as const;

export const PRESELL_EXCLUDED_SCOPES = [
  "GOOGLE_ADS",
  "META_ADS",
  "PINTEREST",
  "OTHER_CAMPAIGNS",
  "SUBLICENSE",
  "EXTERNAL_DISTRIBUTION",
] as const;

export type UserAssetOrigin = {
  assetId: string;
  originalHost: string;
  originalPath: string;
  sourceFile: string;
};

export type UserAssetDeclarationEvent = {
  at: string;
  action: string;
  note: string;
};

export type UserAssetDeclaration = {
  campaignId: number;
  authorizationSource: typeof USER_AUTHORIZATION_SOURCE;
  authorizationScope: typeof PRESELL_AUTHORIZATION_SCOPE;
  verificationStatus: typeof USER_ATTESTED_VERIFICATION;
  independentlyVerifiedLicense: false;
  declarationText: string;
  declaredAt: string;
  assetIds: string[];
  origins: UserAssetOrigin[];
  excludedScopes: typeof PRESELL_EXCLUDED_SCOPES;
  history: UserAssetDeclarationEvent[];
};

export type RightToUseState = {
  rightToUse: boolean;
  assetSuitability: boolean;
  editorialApproval: boolean;
};

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);
  } catch {
    return url.split("/").pop() ?? url;
  }
}

function originOf(url: string): UserAssetOrigin {
  const assetId = reviewAssetId(url);
  try {
    const parsed = new URL(url);
    return {
      assetId,
      originalHost: parsed.hostname,
      originalPath: parsed.pathname.split("/").slice(-2).join("/"),
      sourceFile: fileNameOf(url),
    };
  } catch {
    return { assetId, originalHost: "local", originalPath: fileNameOf(url), sourceFile: fileNameOf(url) };
  }
}

export function isDecorativeOrChromeAsset(asset: Pick<DiscoveredAffiliateAsset, "assetUrl" | "assetType">): boolean {
  const name = fileNameOf(asset.assetUrl);
  return (
    asset.assetType !== "IMAGE" ||
    /\.svg$/i.test(name) ||
    /(?:favicon|signature|sound|continue|logo|banner)\b/i.test(name)
  );
}

/** Raster product images only. Does not expand to chrome, SVGs, or pending files. */
export function productImageIdsForDeclaration(assets: DiscoveredAffiliateAsset[] | undefined): string[] {
  return decorateDiscoveredAssets(assets)
    .filter((item) => item.status === "USER_APPROVED" && !isDecorativeOrChromeAsset(item))
    .map((item) => reviewAssetId(item.assetUrl));
}

export function originsForDeclaration(assets: DiscoveredAffiliateAsset[] | undefined, assetIds: string[]): UserAssetOrigin[] {
  const wanted = new Set(assetIds);
  return decorateDiscoveredAssets(assets)
    .filter((item) => wanted.has(reviewAssetId(item.assetUrl)))
    .map((item) => originOf(item.assetUrl));
}

function declarationFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), "user-asset-declarations", `${campaignId}.json`);
}

export function readUserAssetDeclaration(campaignId: number): UserAssetDeclaration | null {
  const file = declarationFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as UserAssetDeclaration;
  } catch {
    return null;
  }
}

export function recordUserAssetDeclaration(input: {
  campaignId: number;
  declarationText: string;
  assetIds: string[];
  origins: UserAssetOrigin[];
  declaredAt?: string;
}): UserAssetDeclaration {
  if (!input.assetIds.length) {
    throw new Error("USER_DECLARATION requires explicit asset IDs. Do not expand an ambiguous set.");
  }
  const declaredAt = input.declaredAt ?? new Date().toISOString();
  const previous = readUserAssetDeclaration(input.campaignId);
  const next: UserAssetDeclaration = {
    campaignId: input.campaignId,
    authorizationSource: USER_AUTHORIZATION_SOURCE,
    authorizationScope: PRESELL_AUTHORIZATION_SCOPE,
    verificationStatus: USER_ATTESTED_VERIFICATION,
    independentlyVerifiedLicense: false,
    declarationText: input.declarationText.trim(),
    declaredAt: previous?.declaredAt ?? declaredAt,
    assetIds: [...new Set(input.assetIds)],
    origins: input.origins,
    excludedScopes: PRESELL_EXCLUDED_SCOPES,
    history: [
      ...(previous?.history ?? []),
      {
        at: declaredAt,
        action: previous ? "APPEND_DECLARATION" : "RECORD_DECLARATION",
        note: "User attested PRESELL_USE. Not an independently verified license. Ads and other campaigns stay excluded.",
      },
    ],
  };
  mkdirSync(path.dirname(declarationFile(input.campaignId)), { recursive: true });
  writeFileSync(declarationFile(input.campaignId), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function declarationCoversAsset(record: UserAssetDeclaration | null, assetId: string): boolean {
  return Boolean(record && record.assetIds.includes(assetId));
}

export function declarationAuthorizesAds(_record: UserAssetDeclaration | null): false {
  return false;
}

export function declarationAuthorizesScope(record: UserAssetDeclaration | null, scope: string): boolean {
  if (!record) return false;
  if (scope !== PRESELL_AUTHORIZATION_SCOPE) return false;
  return record.authorizationScope === PRESELL_AUTHORIZATION_SCOPE;
}

export function separateMediaStates(input: {
  rightToUse: boolean;
  suitableForRole: boolean;
  editorialApproved: boolean;
}): RightToUseState {
  return {
    rightToUse: input.rightToUse,
    assetSuitability: input.suitableForRole,
    editorialApproval: input.rightToUse && input.suitableForRole && input.editorialApproved,
  };
}
