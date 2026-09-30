import type { VisualConceptSize } from "@/lib/visual-concept/config";
import { GENERATED_VISUAL_IS_EVIDENCE, IMAGE_TEXT_REIMPORT_ALLOWED } from "@/lib/visual-concept/firewall";

export const VISUAL_ASSET_MANIFEST_VERSION = "visual-asset-manifest-v1";

export const VISUAL_ASSET_SEMANTIC_ROLES = [
  "HERO_ATMOSPHERE",
  "EDITORIAL_MATERIAL",
  "FEATURE_VISUAL",
  "PHOTOGRAPHIC_PAUSE",
  "USAGE_VISUAL",
  "RETURN_POLICY_VISUAL",
  "DECISION_BACKGROUND",
  "DECORATIVE_TEXTURE",
] as const;

export type VisualAssetSemanticRole = (typeof VISUAL_ASSET_SEMANTIC_ROLES)[number];
export type VisualAssetPriority = "P0" | "P1" | "P2";
export type VisualAssetCropStrategy = "SAME_SOURCE_RESPONSIVE_CROP" | "SEPARATE_MOBILE_ASSET_REQUIRED";
export type VisualAssetStatus = "PLANNED" | "MISSING" | "READY" | "HUMAN_REVIEW";

export type VisualAssetProvenance = {
  kind: "PLANNED";
  derivedFrom: "VISUAL_DESIGN_REFERENCE";
  masterBitmapSliced: false;
  sourcePackshotRedrawn: false;
  generatedFile: null;
};

export type VisualAssetPlan = {
  assetId: string;
  semanticRole: VisualAssetSemanticRole;
  sectionId: string;
  placeholderSlot: string;
  purpose: string;
  desktopAspectRatio: string;
  mobileAspectRatio: string;
  recommendedGenerationSize: VisualConceptSize;
  cropStrategy: VisualAssetCropStrategy;
  generationGroup: string;
  focalPoint: string;
  visualDescription: string;
  compositionIntent: string;
  photographicLanguage: string;
  materialVocabulary: string[];
  lightingDirection: string;
  depthIntent: string;
  containsProduct: false;
  containsPerson: false;
  textAllowed: false;
  factualAuthority: false;
  evidenceAuthority: false;
  generatedAssetIsEvidence: false;
  imageTextReimportAllowed: false;
  responsiveUsage: string;
  priority: VisualAssetPriority;
  generationRequired: boolean;
  status: VisualAssetStatus;
  provenance: VisualAssetProvenance;
};

export type VisualAssetManifest = {
  manifestVersion: typeof VISUAL_ASSET_MANIFEST_VERSION;
  campaignSlug: string;
  contentVersion: string;
  visualAuthority: "VISUAL_MASTER_V1";
  masterIsBitmapSource: false;
  assets: VisualAssetPlan[];
};

export type VisualAssetNeed = {
  assetId: string;
  semanticRole: VisualAssetSemanticRole;
  sectionId: string;
  placeholderSlot: string;
  purpose: string;
  desktopAspectRatio: string;
  mobileAspectRatio?: string;
  recommendedGenerationSize: VisualConceptSize;
  cropStrategy?: VisualAssetCropStrategy;
  generationGroup: string;
  focalPoint: string;
  visualDescription: string;
  compositionIntent: string;
};

export type VisualAssetArtContext = {
  photographicLanguage: string;
  materialVocabulary: string[];
  depthIntent: string;
  lightingDirection: string;
};

const ROLE_PRIORITY: Record<VisualAssetSemanticRole, VisualAssetPriority> = {
  HERO_ATMOSPHERE: "P0",
  EDITORIAL_MATERIAL: "P0",
  FEATURE_VISUAL: "P0",
  PHOTOGRAPHIC_PAUSE: "P0",
  USAGE_VISUAL: "P1",
  RETURN_POLICY_VISUAL: "P1",
  DECISION_BACKGROUND: "P1",
  DECORATIVE_TEXTURE: "P2",
};

const ASPECT = /^\d+:\d+$/;

export function deriveVisualAssetManifest(input: {
  campaignSlug: string;
  contentVersion: string;
  art: VisualAssetArtContext;
  needs: VisualAssetNeed[];
}): VisualAssetManifest {
  return {
    manifestVersion: VISUAL_ASSET_MANIFEST_VERSION,
    campaignSlug: input.campaignSlug,
    contentVersion: input.contentVersion,
    visualAuthority: "VISUAL_MASTER_V1",
    masterIsBitmapSource: false,
    assets: input.needs.map((need) => ({
      ...need,
      mobileAspectRatio: need.mobileAspectRatio ?? need.desktopAspectRatio,
      cropStrategy: need.cropStrategy ?? "SAME_SOURCE_RESPONSIVE_CROP",
      photographicLanguage: input.art.photographicLanguage,
      materialVocabulary: input.art.materialVocabulary,
      lightingDirection: input.art.lightingDirection,
      depthIntent: input.art.depthIntent,
      containsProduct: false,
      containsPerson: false,
      textAllowed: false,
      factualAuthority: false,
      evidenceAuthority: false,
      generatedAssetIsEvidence: GENERATED_VISUAL_IS_EVIDENCE,
      imageTextReimportAllowed: IMAGE_TEXT_REIMPORT_ALLOWED,
      responsiveUsage: "One generated file. Desktop and mobile are crops of that file, chosen by focal point.",
      priority: ROLE_PRIORITY[need.semanticRole],
      generationRequired: true,
      status: "PLANNED",
      provenance: {
        kind: "PLANNED",
        derivedFrom: "VISUAL_DESIGN_REFERENCE",
        masterBitmapSliced: false,
        sourcePackshotRedrawn: false,
        generatedFile: null,
      },
    })),
  };
}

export function validateVisualAssetManifest(manifest: VisualAssetManifest): string[] {
  const errors: string[] = [];
  if (manifest.manifestVersion !== VISUAL_ASSET_MANIFEST_VERSION) errors.push("manifest version");
  if (manifest.masterIsBitmapSource !== false) errors.push("master bitmap is not a production source");
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (seen.has(asset.semanticRole)) errors.push(`duplicate role ${asset.semanticRole}`);
    seen.add(asset.semanticRole);
    if (!asset.assetId.trim() || asset.assetId.includes("/") || asset.assetId.includes(".")) errors.push("asset id must be a semantic token");
    if (!ASPECT.test(asset.desktopAspectRatio) || !ASPECT.test(asset.mobileAspectRatio)) errors.push("aspect ratio");
    if (asset.containsProduct !== false) errors.push("generated atmosphere must not contain the product");
    if (asset.containsPerson !== false) errors.push("generated atmosphere must not contain a person");
    if (asset.textAllowed !== false) errors.push("text requires human review and is not authorized by default");
    if (asset.factualAuthority !== false || asset.evidenceAuthority !== false || asset.generatedAssetIsEvidence !== false) {
      errors.push("generated asset is not evidence");
    }
    if (asset.imageTextReimportAllowed !== false) errors.push("image text cannot be reimported");
    if (asset.provenance.masterBitmapSliced !== false || asset.provenance.generatedFile !== null) errors.push("provenance");
    if (asset.provenance.sourcePackshotRedrawn !== false) errors.push("packshot redraw");
    if (!asset.visualDescription.trim() || !asset.compositionIntent.trim()) errors.push("missing visual intent");
    if (asset.priority !== ROLE_PRIORITY[asset.semanticRole]) errors.push("priority does not match role");
  }
  return errors;
}

export function imageCallPlan(manifest: VisualAssetManifest): {
  minimumRequiredAssets: number;
  idealAssetCount: number;
  p0Assets: number;
  p1Assets: number;
  p2Assets: number;
  minimumImageCalls: number;
  idealImageCalls: number;
} {
  const count = (priority: VisualAssetPriority) => manifest.assets.filter((asset) => asset.priority === priority).length;
  const requiredGroups = new Set(
    manifest.assets.filter((asset) => asset.generationRequired && asset.priority === "P0").map((asset) => asset.generationGroup),
  );
  const idealGroups = new Set(manifest.assets.filter((asset) => asset.generationRequired).map((asset) => asset.generationGroup));
  return {
    minimumRequiredAssets: requiredGroups.size,
    idealAssetCount: manifest.assets.length,
    p0Assets: count("P0"),
    p1Assets: count("P1"),
    p2Assets: count("P2"),
    minimumImageCalls: requiredGroups.size,
    idealImageCalls: idealGroups.size,
  };
}

export function missingRequiredRoles(manifest: VisualAssetManifest, roles: readonly VisualAssetSemanticRole[]): VisualAssetSemanticRole[] {
  const present = new Set(manifest.assets.map((asset) => asset.semanticRole));
  return roles.filter((role) => !present.has(role));
}
