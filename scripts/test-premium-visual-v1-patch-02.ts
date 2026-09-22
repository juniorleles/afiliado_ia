// npx tsx scripts/test-premium-visual-v1-patch-02.ts
import { readFileSync } from "node:fs";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const css = readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8");
const scenes = readFileSync(path.join(process.cwd(), "src/components/presell/scene-render.tsx"), "utf8");
const pageView = readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8");

assert(scenes.includes("export function OverviewVisualBridge()"), "overview transition has no factual copy props");
assert(!scenes.includes("ps-overview-bridge-pull"), "overview does not repeat the hero summary");
assert(scenes.includes("ClosingProductScene"), "closing product scene exists");
assert(scenes.includes("data-closing-scene"), "closing scene is marked for QA");
assert(scenes.includes('data-feature-grid="2x2"'), "features use a 2x2 editorial grid");
assert(scenes.includes("ps-feature-num"), "feature numerals are graphic anchors");
assert(scenes.includes("ps-faq-band"), "FAQ is a separate visual band");
assert(scenes.includes("ps-trust-editorial"), "methodology remains its own band");
assert(pageView.includes("<OverviewVisualBridge />"), "overview chrome is injected without copy/image");
assert(pageView.includes("ClosingProductScene"), "closing scene is wired before FAQ");
assert(pageView.includes('scene.kind === "CTA_TRANSITION_SCENE") return null'), "redundant middle CTA is omitted");
assert(!pageView.includes("Doctor Formulated"), "vendor photo pixels are not extracted");
assert(css.includes("ps-overview-transition"), "overview is a compact visual transition");
assert(css.includes("ps-closing-scene"), "closing scene styles exist");
assert(css.includes("min-height: 13.5rem"), "desktop feature modules share visual weight");
assert(css.includes("ps-faq-band"), "FAQ/methodology separation is styled");
assert(css.includes("max-height: 15rem"), "mobile hero packshot height is tightened");

console.log("PASS premium visual v1 patch 02");
