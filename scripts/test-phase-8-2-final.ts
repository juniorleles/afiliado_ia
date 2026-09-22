// npx tsx scripts/test-phase-8-2-final.ts
import { composePresellPage } from "../src/lib/presell-page.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { MAX_VISUAL_OPTIMIZATION_ITERATIONS } from "../src/lib/design/optimize.ts";
import { assertNoCopyRewrite, assertNoFactualRewrite } from "../src/lib/design/optimize.ts";
import {
  MAX_DECORATIVE_GEOMETRY,
  MAX_PACKSHOT_USES,
} from "../src/lib/creative/types.ts";
import { createCreativeCompositionPlan, applyCreativeActionCodes } from "../src/lib/creative/planner.ts";
import { parseCreativeCompositionPlan, serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import {
  stickyCtaShouldShow,
  STICKY_COLLISION_PADDING_PX,
  STICKY_SCROLL_INTENT_PX,
} from "../src/lib/creative/sticky.ts";
import {
  classifySceneWhitespace,
  decorateScenes,
  geometryForScene,
  repeatedGeometryCount,
} from "../src/lib/creative/whitespace.ts";
import {
  HERO_IMAGE_SIZES,
  PRODUCT_IMAGE_WIDTHS,
  productImageSizes,
  productImageSrcSet,
  productImageVariant,
} from "../src/lib/creative/image.ts";
import { parseProductImageOptimizeQuery } from "../src/lib/product-image.ts";
import { ANALYTICS_SKIP_HEADER } from "../src/lib/analytics.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const facts = emptyProductFacts("Winter Jacket XT-200", "https://example.com/jacket", "IMPORTED");
facts.description = "a mid-weight insulated layer for daily cold weather";
facts.confidence.description = "DIRECT_SOURCE";
facts.features = ["Water-resistant shell", "Insulated core", "Adjustable cuffs"];
facts.confidence.features = "DIRECT_SOURCE";
facts.usageInformation = ["Machine-wash the outer shell"];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.guaranteeInformation = "30-day returns through the merchant";
facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
facts.ingredientsOrComponents = ["Shell", "Fill", "Lining"];
facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
facts.importQuality = "SUFFICIENT";
const variant = {
  approach: "BUYER_GUIDE" as const,
  headline: "How to Choose a Winter Jacket",
  ctaLabel: "Check Current Price",
  body: `This winter jacket is a mid-weight insulated layer for daily cold weather.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting. Additional overview copy stays grounded.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell
- Water-resistant finish

## Ingredients

- Shell
- Fill
- Lining

## How to Use

- Machine-wash the outer shell

## Things to Consider

- Fit can run large
- Layers change warmth

## Guarantee

30-day returns through the merchant

## FAQ

- Can I machine wash it? The product information describes a washable shell.

## Final Thoughts

A straightforward option for ordinary winter days.
`,
};
const page = composePresellPage({ variant, facts, template: "BUYER_GUIDE" });
const readyPage = {
  ...page,
  hero: { ...page.hero, image: { src: "/media/product/pack.png", alt: "product pack", provenance: "MANUAL" as const } },
};
const design = createDesignPlan({
  page: readyPage,
  theme: "PREMIUM",
  productAssetStatus: "READY",
  productAssetProvenance: "MANUAL",
});
const plan = createCreativeCompositionPlan({ page: readyPage, design });

assert(classifySceneWhitespace({ kind: "CTA_TRANSITION_SCENE", rhythm: "QUIET", weight: "SUPPORTING", sectionIds: [] }) === "CONTENT_GAP", "whitespace classification flags CTA-only bands");
assert(classifySceneWhitespace({ kind: "HERO_PRODUCT_STAGE", rhythm: "HIGH_IMPACT", weight: "PRIMARY", sectionIds: [] }) === "INTENTIONAL_NEGATIVE_SPACE", "hero whitespace is intentional");
assert(geometryForScene("HERO_PRODUCT_STAGE", []) === "orb", "hero geometry is a single orb");
assert(geometryForScene("INGREDIENT_SHOWCASE", ["orb"]) === "grain", "ingredient geometry varies");
assert(geometryForScene("CONSIDERATION_EDITORIAL_SCENE", ["orb", "grain"]) === "none", "decorative repetition is capped");
assert(MAX_DECORATIVE_GEOMETRY === 2, "max two decorated scenes");
const counts = repeatedGeometryCount(plan.scenes);
assert([...counts.values()].every((n) => n <= 1), "no repeated geometry variant");
assert(plan.scenes.filter((s) => s.geometry !== "none").length <= MAX_DECORATIVE_GEOMETRY, "decorative geometry limit");

const uses = plan.scenes.filter((s) => s.assetUse !== "NONE");
assert(uses.length <= MAX_PACKSHOT_USES, "asset reuse is still bounded");
assert(uses.some((s) => s.assetUse === "PRIMARY_HERO"), "hero remains primary packshot");
assert(uses.some((s) => s.assetUse === "SECTION_ANCHOR") || uses.some((s) => s.assetUse === "TRANSITION_ANCHOR"), "one additional product-anchored moment is planned");
assert(new Set(uses.map((s) => s.assetUse)).size === uses.length, "packshot roles are not duplicated");
assert(plan.scenes.filter((s) => s.visualMoment).length >= 3, "at least three distinct visual moments when packshot is ready");

const editorial = plan.scenes.find((s) => s.kind === "CONSIDERATION_EDITORIAL_SCENE");
assert(editorial?.weight === "DETAIL", "editorial copy is DETAIL");
assert(editorial?.collapsed === true, "progressive detail stays collapsed");
assert((editorial?.visibleLeadCount || 9) <= 2, "secondary editorial lead count is restrained");

assert(plan.scenes.find((s) => s.kind === "CTA_TRANSITION_SCENE")?.whitespace === "CONTENT_GAP", "CTA transition is classified as a content gap");
assert(plan.stickyCta.compact === true, "sticky CTA uses compact presentation");
assert(plan.stickyCta.hideWhenGuaranteeVisible === true, "sticky CTA hides around guarantee");
assert(plan.stickyCta.requireScrollIntentPx === STICKY_SCROLL_INTENT_PX, "sticky CTA requires scroll intent");

assert(stickyCtaShouldShow({ heroCtaVisible: true, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false, scrolledPastIntent: true }) === false, "sticky hidden while hero CTA is visible");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false, scrolledPastIntent: false }) === false, "sticky waits for scroll intent");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false, guaranteeVisible: true, scrolledPastIntent: true }) === false, "sticky hides around guarantee");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: true, disclosureVisible: false, scrolledPastIntent: true }) === false, "sticky still avoids footer");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: true, scrolledPastIntent: true }) === false, "sticky still avoids disclosure");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false, scrolledPastIntent: true }) === true, "sticky can show after intent");
assert(STICKY_COLLISION_PADDING_PX >= 72, "collision padding remains");
assert(STICKY_SCROLL_INTENT_PX >= 160, "scroll intent is meaningful");

const query = parseProductImageOptimizeQuery(new URLSearchParams("w=720&fm=webp&q=72"));
assert(query.width === 720, "image optimize width");
assert(query.format === "webp", "image optimize format");
assert(parseProductImageOptimizeQuery(new URLSearchParams("w=99999")).width === 1600 || parseProductImageOptimizeQuery(new URLSearchParams("w=99999")).width === null, "image width is clamped");
assert(productImageSrcSet("/media/product/pack.png")?.includes("w=720"), "responsive srcset");
assert(productImageSizes("hero") === HERO_IMAGE_SIZES, "hero sizes");
assert(productImageVariant("/media/product/pack.png", 1080).includes("w=1080"), "hero LCP variant is not the original 2550px file");
assert(PRODUCT_IMAGE_WIDTHS.includes(1080), "responsive widths include a hero LCP size");

const src = {
  page: readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8"),
  stage: readFileSync(path.join(process.cwd(), "src/components/presell/product-stage.tsx"), "utf8"),
  sticky: readFileSync(path.join(process.cwd(), "src/components/presell/sticky-cta-bar.tsx"), "utf8"),
  template: readFileSync(path.join(process.cwd(), "src/components/campaign-template.tsx"), "utf8"),
  css: readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8"),
  media: readFileSync(path.join(process.cwd(), "src/app/media/product/[file]/route.ts"), "utf8"),
  scene: readFileSync(path.join(process.cwd(), "src/components/presell/scene-render.tsx"), "utf8"),
};
assert(!src.page.trimStart().startsWith('"use client"'), "composed presell view is a server component");
assert(!src.template.trimStart().startsWith('"use client"'), "campaign template is a server component");
assert(src.sticky.includes('"use client"'), "sticky CTA remains the interaction island");
assert((src.page.match(/"use client"/g) || []).length === 0, "page view does not pull the whole article onto the client");
assert(src.stage.includes('loading={priority ? "eager" : "lazy"}'), "below-fold images lazy load");
assert(src.stage.includes('fetchPriority={priority ? "high" : "low"}'), "only the hero LCP image is prioritized");
assert(src.stage.includes("srcSet"), "responsive image sizes/srcset");
assert(src.stage.includes("width={width}"), "layout-shift protection via width/height");
assert(src.media.includes("optimizeLocalProductImage"), "image optimization configuration");
assert(src.css.includes("ps-sticky-cta-compact"), "compact sticky CTA");
assert(src.css.includes("safe-area-inset-bottom"), "safe-area behavior");
assert(src.css.includes("ps-cta-bridge-compact"), "CTA transition footprint reduced");
assert(src.scene.includes("ps-pull-fact"), "pull-quote remains a visual treatment of existing copy");
assert(src.scene.includes("HEALTH_DISCLAIMER_TEXT"), "required disclosure stays visible");
assert(src.scene.includes("TRUST_EDITORIAL"), "review methodology disclosure stays visible");
assert(!src.css.includes("lottie") && !src.css.includes("three.js"), "no new design scripts");
assert(!src.page.includes("unpkg.com") && !src.scene.includes("cdnjs"), "no design CDN scripts");

const clientFiles = [
  "src/components/presell/sticky-cta-bar.tsx",
  "src/components/affiliate-cta.tsx",
];
assert(clientFiles.every((file) => readFileSync(path.join(process.cwd(), file), "utf8").includes('"use client"')), "public interaction remains two client islands");

const after = applyCreativeActionCodes(plan, ["PROMOTE_PRODUCT_VISUAL", "COLLAPSE_SECONDARY_DETAILS"]);
assert(after.scenes.filter((s) => s.assetUse !== "NONE").length <= MAX_PACKSHOT_USES, "promote product visual does not exceed reuse cap");
assert(after.scenes.filter((s) => s.weight === "DETAIL").every((s) => s.collapsed), "progressive detail after collapse action");

const roundtrip = parseCreativeCompositionPlan(serializeCreativeCompositionPlan(plan));
assert(roundtrip?.stickyCta.requireScrollIntentPx === plan.stickyCta.requireScrollIntentPx, "sticky plan roundtrip");
assert(roundtrip?.scenes[0]?.geometry === plan.scenes[0]?.geometry, "geometry roundtrip");

assert(ANALYTICS_SKIP_HEADER === "x-aia-analytics", "preview analytics exclusion");
assert(MAX_VISUAL_OPTIMIZATION_ITERATIONS === 2, "max optimization iterations remain 2");

const before = {
  headline: "A",
  body: "B",
  ctaLabel: "C",
  affiliateUrl: "https://example.com/hop",
  pageComposition: "{\"v\":1}",
} as never;
assertNoFactualRewrite(before, { ...before });
assertNoCopyRewrite(before, { ...before, creativeCompositionJson: "{}" } as never);

const decorated = decorateScenes(plan.scenes.map((scene) => ({ ...scene, geometry: "none" as const })));
assert(decorated.filter((s) => s.geometry !== "none").length <= MAX_DECORATIVE_GEOMETRY, "decorateScenes enforces the cap");

console.log("\nTodos os testes da Phase 8.2 final passaram.");
