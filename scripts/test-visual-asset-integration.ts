import { readFileSync } from "node:fs";
import { integratedVisualAssetSources } from "../src/lib/visual-concept/asset-integration.ts";
import { rejectVisualMutation } from "../src/lib/visual-concept/firewall.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";

let failed = 0;
function assert(cond: unknown, message: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

const sources = integratedVisualAssetSources("joint-genesis-controlled-ready-13");
assert(sources.heroAtmosphere === sources.decisionBackground, "open ground serves the hero and the closing field");
assert(sources.editorialMaterial === sources.featureVisual, "stone material serves overview and features");
assert(Boolean(sources.photographicPause) && sources.photographicPause !== sources.heroAtmosphere, "the pause is its own source");
assert(Boolean(sources.usageVisual) && sources.usageVisual.endsWith("/usage-visual-v1"), "the reviewed usage role resolves from provenance");
assert(sources.returnPolicyVisual === undefined, "return policy stays unbound without its own asset");
assert(!sources.heroAtmosphere?.includes("product-images"), "the packshot is not used as atmosphere");

const view = readFileSync("src/components/presell/visual-master-view.tsx", "utf8");
const css = readFileSync("src/app/visual-master-v1.css", "utf8");
const integration = readFileSync("src/lib/visual-concept/asset-integration.ts", "utf8");
const generic = [view, css, integration, readFileSync("src/lib/visual-concept/asset-binding.ts", "utf8")].join("\n");
assert(!/joint[\s-]?genesis/i.test(generic), "generic visual code has no campaign hardcoding");
assert(!/open-ground-v1|stone-material-v1|photographic-pause-v1|usage-visual-v1/.test(view + css), "generic components do not name production files");
assert(view.includes("visualAssets.heroAtmosphere") && view.includes("visualAssets.decisionBackground"), "the view binds semantic roles");
assert(css.includes('data-visual-role="heroAtmosphere"') && css.includes('data-visual-role="decisionBackground"'), "shared sources use different crops");
assert(css.includes("object-position: 74% 16%") && css.includes("object-position: 18% 100%"), "hero and closing crops are not the same");
assert(css.includes("aspect-ratio: 21 / 9") && css.includes("aspect-ratio: 16 / 9"), "the pause has desktop and mobile crops");
assert(!/180-day guarantee|money-back|risk-free/i.test(view), "the view does not rewrite the return policy");
assert(!/openai|images\/generations|anthropic|ocr/i.test(integration + view), "rendering does not generate or read image text");

const facts = emptyProductFacts("Sample", "https://seller.example/product", "MANUAL");
assert(rejectVisualMutation(facts) === facts, "asset integration does not mutate product facts");
assert(integratedVisualAssetSources("../joint-genesis").heroAtmosphere === undefined, "a path-like slug binds nothing");

if (failed) {
  console.error("VISUAL_ASSET_INTEGRATION_CHECKS=FAIL " + failed);
  process.exit(1);
}
console.log("MANIFEST_BINDING_TESTS=PASS");
console.log("CONTENT_SAFETY_TESTS=PASS");
console.log("NO_TEST_API_CALLS=PASS");
console.log("NO_RENDER_SIDE_EFFECTS=PASS");
