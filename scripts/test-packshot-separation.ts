import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { decodePng, encodeRgbaPng } from "../src/lib/visual-concept/compose.ts";
import { inspectPackshotSeparation } from "../src/lib/visual-concept/packshot-separation.ts";
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

const sourcePath = "data/product-images/6e84961241bdcd28c750ceff.png";
const before = readFileSync(sourcePath);
const beforeHash = createHash("sha256").update(before).digest("hex");
const source = decodePng(before);
const inspection = inspectPackshotSeparation(source);
const after = readFileSync(sourcePath);
const afterHash = createHash("sha256").update(after).digest("hex");

assert(beforeHash === afterHash, "source asset bytes stay unchanged");
assert(afterHash === "6e84961241bdcd28c750ceffd9aa7d67892c0dea3e146f2fe18ad45f51df4ca1", "source hash matches the authoritative packshot");
assert(inspection.width === 800 && inspection.height === 800, "source dimensions are 800x800");
assert(inspection.hasAlpha === true, "source has alpha");
assert(Math.abs(inspection.transparentPixelRatio - 295861 / 640000) < 1e-9, "transparent pixel ratio is measured from alpha");
assert(inspection.connectedComponentCount === 2920, "alpha-connected component count");
assert(inspection.majorComponentCount === 4, "four major foreground components");
assert(inspection.classification === "NOT_SAFELY_SEPARABLE", "fused vendor asset is not safely separable");
assert(inspection.synthesizedPixelsRequired === true, "isolating this asset would require synthesized pixels");
assert(
  !existsSync("data/visual-design/joint-genesis-controlled-ready-13/assets/product-only/product-only.png"),
  "no product-only derivative was written",
);

const facts = emptyProductFacts();
assert(rejectVisualMutation(facts) === facts, "visual analysis does not mutate product facts");

const clean = blank(48, 48);
fill(clean, 16, 8, 16, 32, 255);
const cleanInspection = inspectPackshotSeparation(clean);
assert(cleanInspection.classification === "CLEAN_COMPONENT_EXTRACTION", "a single isolated silhouette can be classified clean");
assert(cleanInspection.majorComponentCount === 1, "a single silhouette is one major component");

const fused = blank(80, 80);
fill(fused, 10, 24, 36, 50, 255);
fill(fused, 40, 4, 28, 36, 255);
const fusedInspection = inspectPackshotSeparation(fused);
assert(fusedInspection.classification === "NOT_SAFELY_SEPARABLE", "a joined upper-right mass is not safely separable");
assert(fusedInspection.majorComponentCount === 1, "the joined mass is one component");

const moduleSource = readFileSync("src/lib/visual-concept/packshot-separation.ts", "utf8");
assert(!/openai|anthropic|images\/generations|inpaint/i.test(moduleSource), "separation analysis does not call an image model");

console.log(`CLASSIFICATION=${inspection.classification}`);
console.log(`CONNECTED_COMPONENT_COUNT=${inspection.connectedComponentCount}`);
console.log(`MAJOR_COMPONENT_COUNT=${inspection.majorComponentCount}`);
console.log(`TRANSPARENT_PIXEL_RATIO=${inspection.transparentPixelRatio.toFixed(6)}`);
console.log(`SOURCE_ASSET_UNCHANGED=${beforeHash === afterHash ? "YES" : "NO"}`);

if (failed > 0) {
  console.error(`PACKSHOT_SEPARATION_CHECKS=FAIL ${failed}`);
  process.exit(1);
}
console.log("PACKSHOT_SEPARATION_CHECKS=PASS");
console.log("NO_AI_CALLS=PASS");

function blank(width: number, height: number) {
  return decodePng(encodeRgbaPng(width, height, Buffer.alloc(width * height * 4)));
}

function fill(image: ReturnType<typeof blank>, x: number, y: number, w: number, h: number, alpha: number) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const index = (row * image.width + col) * 4;
      image.rgba[index] = 240;
      image.rgba[index + 1] = 240;
      image.rgba[index + 2] = 240;
      image.rgba[index + 3] = alpha;
    }
  }
}
