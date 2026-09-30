import type { VisualAssetManifest, VisualAssetPlan, VisualAssetSemanticRole } from "@/lib/visual-concept/asset-manifest";

/** Semantic bindings. Generic components ask for a role, never a campaign filename. */
export const VISUAL_ASSET_BINDINGS = {
  heroAtmosphere: "HERO_ATMOSPHERE",
  editorialMaterial: "EDITORIAL_MATERIAL",
  featureVisual: "FEATURE_VISUAL",
  photographicPause: "PHOTOGRAPHIC_PAUSE",
  usageVisual: "USAGE_VISUAL",
  returnPolicyVisual: "RETURN_POLICY_VISUAL",
  decisionBackground: "DECISION_BACKGROUND",
  decorativeTexture: "DECORATIVE_TEXTURE",
} as const satisfies Record<string, VisualAssetSemanticRole>;

export type VisualAssetBinding = keyof typeof VISUAL_ASSET_BINDINGS;

/** Resolved public URLs per semantic binding. Missing bindings stay unbound. */
export type IntegratedVisualAssets = Partial<Record<VisualAssetBinding, string>>;

export function visualAssetForRole(manifest: VisualAssetManifest, role: VisualAssetSemanticRole): VisualAssetPlan | null {
  return manifest.assets.find((asset) => asset.semanticRole === role) ?? null;
}

export function visualAssetForBinding(manifest: VisualAssetManifest, binding: VisualAssetBinding): VisualAssetPlan | null {
  return visualAssetForRole(manifest, VISUAL_ASSET_BINDINGS[binding]);
}
