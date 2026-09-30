import type { Campaign } from "@/lib/campaigns";
import { readIngredientVisuals } from "@/lib/assets/source-visual-store";
import { NO_PRESELL_RENDER_ASSETS, type IngredientVisualBinding, type PresellRenderAssets } from "@/lib/presell-render-assets";
import { PRODUCTION_PRESENTATION_ID } from "@/lib/production-candidate-view";
import { renderedProductVisuals } from "@/lib/product-visual/load";
import { integratedVisualAssetSources } from "@/lib/visual-concept/asset-integration";

function sourceUrlOf(campaign: Campaign): string | null {
  if (!campaign.sourceFactsJson) return null;
  try {
    const facts = JSON.parse(campaign.sourceFactsJson) as { sourceUrl?: string };
    return facts.sourceUrl?.trim() || null;
  } catch {
    return null;
  }
}

function safeIngredientVisuals(campaign: Campaign): IngredientVisualBinding[] {
  return readIngredientVisuals(sourceUrlOf(campaign)).flatMap((record) =>
    record.assetAuthority === "SOURCE" && record.localSrc ? [{ factValue: record.associatedFactValue, src: record.localSrc }] : [],
  );
}

/** Server-only: reads persisted visual plans/provenance from disk. Never import from client components. */
export function resolvePresellRenderAssets(campaign: Campaign): PresellRenderAssets {
  const ingredientVisuals = safeIngredientVisuals(campaign);
  if (campaign.productionPresentation === PRODUCTION_PRESENTATION_ID) {
    return {
      visualAssets: integratedVisualAssetSources(campaign.slug),
      productVisuals: renderedProductVisuals(campaign.slug),
      ingredientVisuals,
    };
  }
  const visualAssets = integratedVisualAssetSources(campaign.slug);
  if (Object.keys(visualAssets).length === 0 && ingredientVisuals.length === 0) return NO_PRESELL_RENDER_ASSETS;
  return { visualAssets, productVisuals: {}, ingredientVisuals };
}
