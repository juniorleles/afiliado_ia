// npx tsx scripts/test-phase-8-2-acceptance.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { composePresellPage } from "../src/lib/presell-page.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { stickyCtaShouldShow, STICKY_SCROLL_INTENT_PX } from "../src/lib/creative/sticky.ts";
import { HERO_IMAGE_SIZES, productImageFallbackWidth, productImageSizes, productImageSrcSet } from "../src/lib/creative/image.ts";
import { assertNoCopyRewrite, assertNoFactualRewrite } from "../src/lib/design/optimize.ts";
import { ANALYTICS_SKIP_HEADER } from "../src/lib/analytics.ts";

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
facts.ingredientsOrComponents = ["Shell", "Fill", "Lining", "Zip"];
facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
facts.importQuality = "SUFFICIENT";
const variant = {
  approach: "BUYER_GUIDE" as const,
  headline: "How to Choose a Winter Jacket",
  ctaLabel: "Check Current Price",
  body: `This winter jacket is a mid-weight insulated layer for daily cold weather.

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

const src = {
  scene: readFileSync(path.join(process.cwd(), "src/components/presell/scene-render.tsx"), "utf8"),
  css: readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8"),
  sticky: readFileSync(path.join(process.cwd(), "src/components/presell/sticky-cta-bar.tsx"), "utf8"),
  stage: readFileSync(path.join(process.cwd(), "src/components/presell/product-stage.tsx"), "utf8"),
  page: readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8"),
};

assert(src.scene.includes('data-ingredient-compact="1"'), "mobile ingredient density marker");
assert(src.css.includes("grid-template-columns: 1fr 1fr") && src.css.includes(".ps-orbit-list"), "mobile ingredient 2-column layout");
assert(src.css.includes(".ps-ingredient-detail") && src.css.includes("display: none"), "ingredient DETAIL is not fully expanded on mobile");
assert(src.css.includes("details.ps-small:not([open])") && src.css.includes("details[open] .ps-ingredient-lead-body"), "progressive detail stays inside closed disclosure");
assert(src.scene.includes('TRANSITION_ANCHOR" ? "omit" : "on"'), "mobile usage omits third packshot reuse");
assert(src.css.includes('ps-usage-edge[data-mobile-asset="omit"]'), "mobile usage product-anchor is CSS-hidden");
assert(src.scene.includes("<Packshot scene={scene} image={image} />") && src.scene.includes("ps-desktop-only-asset"), "desktop usage still renders the transition packshot");
assert(plan.scenes.some((s) => s.assetUse === "TRANSITION_ANCHOR"), "desktop may still use a transition packshot");
assert(src.scene.includes("ps-overview-lead"), "overview uses a short visible orientation");
assert(src.scene.includes("firstSentence"), "safety/overview progressive detail stays presentation-only");
assert(src.scene.includes("HEALTH_DISCLAIMER_TEXT"), "required disclosure visibility");
assert(src.scene.includes("TRUST_EDITORIAL"), "review methodology remains visible");
assert(src.sticky.includes("STICKY_SCROLL_INTENT_PX"), "sticky CTA regression: scroll intent");
assert(
  readFileSync(path.join(process.cwd(), "src/lib/visual-qa/browser.ts"), "utf8").includes("[data-trust-disclosure] details summary"),
  "visual QA does not expand ingredient Read more before screenshots",
);
assert(stickyCtaShouldShow({ heroCtaVisible: true, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false, scrolledPastIntent: true }) === false, "sticky still hides while hero CTA is visible");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false, guaranteeVisible: true, scrolledPastIntent: true }) === false, "sticky still hides around guarantee");
assert(STICKY_SCROLL_INTENT_PX >= 160, "sticky is not more aggressive");
assert(HERO_IMAGE_SIZES.includes("232px"), "hero mobile sizes match rendered width");
assert(productImageFallbackWidth("hero") === 720, "hero default request is not the original 1080+ source");
assert(productImageSizes("hero") === HERO_IMAGE_SIZES, "hero image responsive request behavior");
assert(Boolean(productImageSrcSet("/media/product/pack.png")?.includes("w=720")), "srcset still offers a desktop variant");
assert(src.stage.includes('fetchPriority={priority ? "high" : "low"}'), "only hero is prioritized");
assert(!src.page.trimStart().startsWith('"use client"'), "performance architecture remains server-first");
assert(ANALYTICS_SKIP_HEADER === "x-aia-analytics", "no public tracking contamination in preview tooling");

const before = {
  headline: "A",
  body: "B",
  ctaLabel: "C",
  affiliateUrl: "https://example.com/hop",
  pageComposition: "{\"v\":1}",
} as never;
assertNoFactualRewrite(before, { ...before });
assertNoCopyRewrite(before, { ...before, creativeCompositionJson: "{}" } as never);

console.log("\nTodos os testes da Phase 8.2 acceptance passaram.");
