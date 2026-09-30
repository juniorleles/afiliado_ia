import type { RenderedProductVisuals } from "@/lib/product-visual/types";
import type { IntegratedVisualAssets } from "@/lib/visual-concept/asset-binding";

/**
 * Visual sources already resolved on the server (see presell-render-assets-server.ts).
 * The shared renderer only receives this data; it never touches the filesystem.
 */
export type IngredientVisualBinding = {
  factValue: string;
  src: string;
};

export type PresellRenderAssets = {
  visualAssets: IntegratedVisualAssets;
  productVisuals: RenderedProductVisuals;
  ingredientVisuals?: readonly IngredientVisualBinding[];
};

export const NO_PRESELL_RENDER_ASSETS: PresellRenderAssets = { visualAssets: {}, productVisuals: {} };
