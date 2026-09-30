import { readFileSync } from "node:fs";
import {
  buildDecorativePlatePrompt,
  buildProductionAssetPrompt,
  buildProductionAssetRequest,
  buildUsageStillPrompt,
  buildUsageStillRequest,
  p0ProductionGroups,
  PRODUCTION_ASSET_MODEL,
  PRODUCTION_ASSET_QUALITY,
  PRODUCTION_ASSET_SIZE,
  USAGE_STILL_SIZE,
} from "../src/lib/visual-concept/asset-production.ts";
import type { VisualAssetManifest } from "../src/lib/visual-concept/asset-manifest.ts";

let failed = 0;
function assert(cond: unknown, message: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

const manifest = JSON.parse(
  readFileSync("data/visual-design/joint-genesis-controlled-ready-13/visual-master/assets/manifest.json", "utf8"),
) as VisualAssetManifest;
const groups = p0ProductionGroups(manifest);
assert(groups.join(",") === "open-ground,tactile-stone,photographic-pause", "P0 production is the three shared groups");

const open = buildProductionAssetPrompt(manifest, "open-ground");
const stone = buildProductionAssetPrompt(manifest, "tactile-stone");
const pause = buildProductionAssetPrompt(manifest, "photographic-pause");
assert(!open.includes("glass of water") && !stone.includes("glass of water") && !pause.includes("glass of water"), "P1 usage copy stays out of the P0 prompts");
assert(!open.includes("Dark green vegetation") && !stone.includes("Dark green vegetation"), "the return-policy asset is not part of these prompts");
assert(open.includes("No written text") && stone.includes("No bottle") && pause.includes("No person"), "each prompt forbids text, product, and people");
assert(!open.includes("webpage") || open.includes("not a webpage"), "the prompt asks for a photograph rather than a page");

const request = buildProductionAssetRequest({
  manifest,
  job: { assetId: "open-ground-v1", generationGroup: "open-ground" },
});
assert(
  request.model === PRODUCTION_ASSET_MODEL &&
    request.quality === PRODUCTION_ASSET_QUALITY &&
    request.size === PRODUCTION_ASSET_SIZE &&
    request.operation === "generations" &&
    request.outputFormat === "png" &&
    !request.referenceImagePath,
  "the production request uses sunburst, high, landscape, and no packshot upload",
);
let rejected = false;
try {
  buildProductionAssetRequest({ manifest, job: { assetId: "usage-still-v1", generationGroup: "usage-still" } });
} catch {
  rejected = true;
}
assert(rejected, "a P1-only group cannot be sent as a production asset");

const usage = buildUsageStillRequest({ manifest, assetId: "usage-visual-v1" });
const usagePrompt = buildUsageStillPrompt(manifest);
assert(
  usage.model === PRODUCTION_ASSET_MODEL &&
    usage.quality === PRODUCTION_ASSET_QUALITY &&
    usage.size === USAGE_STILL_SIZE &&
    usage.operation === "generations" &&
    !usage.referenceImagePath,
  "the usage still is one square sunburst request with no packshot upload",
);
assert(usagePrompt.includes("clear drinking glass containing water"), "the usage prompt asks for a glass of water");
assert(usagePrompt.includes("not a landscape") && !usagePrompt.includes("Dark green vegetation"), "the usage prompt is not the return-policy image");
assert(!usagePrompt.includes("Take one capsule"), "the usage prompt does not restate the instruction");

const plate = buildDecorativePlatePrompt({
  purpose: "HERO_ATMOSPHERE",
  motif: "clarity",
  palette: ["#112233", "#445566"],
});
assert(plate.includes("HERO_ATMOSPHERE") && plate.includes("#112233"), "a decorative plate uses the supplied palette");
assert(plate.includes("No bottle") && plate.includes("No person") && plate.includes("No written text"), "a decorative plate forbids product, people, and text");
assert(!/visiflora|astaxanthin/i.test(plate), "a decorative plate is not named for a product");

const source = readFileSync("src/lib/visual-concept/asset-production.ts", "utf8");
assert(!/joint[\s-]?genesis/i.test(source), "production planning has no campaign hardcoding");
assert(!/openai|images\/generations|anthropic/i.test(source), "production planning does not call an image model");
const view = readFileSync("src/components/presell/visual-master-view.tsx", "utf8");
assert(
  !view.includes("asset-production") && !view.includes("open-ground-v1") && !view.includes("usage-visual-v1"),
  "the generic view does not hardcode a production filename",
);

if (failed) {
  console.error("VISUAL_ASSET_PRODUCTION_CHECKS=FAIL " + failed);
  process.exit(1);
}
console.log("VISUAL_ASSET_PRODUCTION_CHECKS=PASS");
console.log("NO_TEST_API_CALLS=PASS");
console.log("NO_RENDER_SIDE_EFFECTS=PASS");
