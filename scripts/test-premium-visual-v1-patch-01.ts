// npx tsx scripts/test-premium-visual-v1-patch-01.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { stickyCtaShouldShow, STICKY_COLLISION_PADDING_PX } from "../src/lib/creative/sticky.ts";
import { splitSentences } from "../src/lib/presell-display.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { composePresellPage } from "../src/lib/presell-page.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const css = readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8");
const stage = readFileSync(path.join(process.cwd(), "src/components/presell/product-stage.tsx"), "utf8");
const scenes = readFileSync(path.join(process.cwd(), "src/components/presell/scene-render.tsx"), "utf8");
const pageView = readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8");
const stickyBar = readFileSync(path.join(process.cwd(), "src/components/presell/sticky-cta-bar.tsx"), "utf8");

assert(!/64vh/.test(css), "packshot max-height is not viewport-relative");
assert(css.includes("--ps-space-section"), "spacing tokens exist");
assert(css.includes("ps-overview-bridge"), "overview visual scene styles exist");
assert(css.includes("ps-feature-module"), "feature module styles exist");
assert(css.includes('a[data-cta-position="hero"]'), "hero CTA has a primary treatment");
assert(css.includes('a[data-cta-position="final"]'), "final CTA has a closing treatment");
assert(css.includes('a[data-cta-position="sticky"]'), "sticky CTA has a compact utility treatment");
assert(css.includes("visibility: hidden"), "sticky OFF still uses visibility hidden");
assert(stage.includes('loading="eager"'), "product images load eagerly");
assert(stage.includes("onError"), "failed packshot has an intentional fallback");
assert(scenes.includes("OverviewVisualBridge"), "overview visual bridge exists");
assert(scenes.includes("splitSentences"), "features split on existing sentence boundaries");
assert(!scenes.includes("clipAtWordBoundary"), "features are not clipped into new fragments");
assert(pageView.includes("OverviewVisualBridge"), "page view injects the overview visual scene");
assert(stickyBar.includes("contentInStickyZone"), "sticky hides when it would occlude content");
assert(STICKY_COLLISION_PADDING_PX >= 96, "sticky reserves bottom space");
assert(
  stickyCtaShouldShow({
    heroCtaVisible: false,
    otherPrimaryCtaVisible: false,
    footerVisible: false,
    disclosureVisible: false,
    contentInStickyZone: true,
  }) === false,
  "sticky does not show over consumer copy",
);

const featuresCopy =
  "Joint Genesis is designed for steady joint wellness rather than dramatic overnight promises. Its strongest benefit story connects a clearly defined mechanism. The ingredients also give the formula broader support. Together, those features create a multi-angle daily formula.";
assert(splitSentences(featuresCopy).length === 4, "authorized feature paragraph splits into four scannable units");

const facts = emptyProductFacts("Winter Jacket XT-200", "https://example.com/jacket", "IMPORTED");
facts.description = "a mid-weight insulated layer for daily cold weather";
facts.confidence.description = "DIRECT_SOURCE";
facts.features = ["Water-resistant shell"];
facts.confidence.features = "DIRECT_SOURCE";
facts.usageInformation = ["Machine-wash the outer shell"];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.ingredientsOrComponents = ["Shell", "Fill", "Lining"];
facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
facts.guaranteeInformation = "30-day returns through the merchant";
facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
facts.importQuality = "SUFFICIENT";
const variant = {
  approach: "BUYER_GUIDE" as const,
  headline: "How to Choose a Winter Jacket",
  ctaLabel: "Check Current Details",
  body: `This winter jacket is a mid-weight insulated layer for daily cold weather.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting.

## Key Features

- Insulated core for ordinary winter days

## Ingredients

- Shell
- Fill
- Lining

## How to Use

- Machine-wash the outer shell

## FAQ

- Can I machine wash it? The product information describes a washable shell.
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
assert(plan.scenes[0]?.kind === "HERO_PRODUCT_STAGE", "hero remains first");
assert(plan.scenes[1]?.sectionIds[0] === "overview", "visible overview still follows hero");
assert(!pageView.includes("Doctor Formulated"), "vendor photo pixels are not extracted into copy");

console.log("PASS premium visual v1 patch 01");
