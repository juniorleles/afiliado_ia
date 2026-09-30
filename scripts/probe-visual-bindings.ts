/** Read-only: which decorative slots each campaign binds, and which product roles render. */
import { integratedVisualAssetSources } from "../src/lib/visual-concept/asset-integration.ts";
import { renderedProductVisuals } from "../src/lib/product-visual/load.ts";

for (const slug of process.argv.slice(2)) {
  const assets = integratedVisualAssetSources(slug);
  const product = renderedProductVisuals(slug);
  console.log(`${slug}`);
  console.log(`  decorative: ${Object.keys(assets).sort().join(", ") || "none"}`);
  console.log(`  inlineSlotsUnbound: ${["editorialMaterial", "featureVisual", "usageVisual"].filter((key) => !(key in assets)).join(", ") || "none"}`);
  console.log(`  product: ${Object.entries(product).filter(([, value]) => value).map(([key]) => key).join(", ") || "none"}`);
}
