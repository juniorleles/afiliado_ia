// npx tsx scripts/test-phase-8-2.ts
import { composePresellPage } from "../src/lib/presell-page.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { MAX_VISUAL_OPTIMIZATION_ITERATIONS } from "../src/lib/design/optimize.ts";
import { assertNoCopyRewrite, assertNoFactualRewrite } from "../src/lib/design/optimize.ts";
import {
  CREATIVE_COMPOSITION_VERSION,
  NARRATIVE_ROLES,
  SCENE_KINDS,
} from "../src/lib/creative/types.ts";
import { createCreativeCompositionPlan, applyCreativeActionCodes } from "../src/lib/creative/planner.ts";
import { parseCreativeCompositionPlan, serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { stickyCtaShouldShow, STICKY_COLLISION_PADDING_PX } from "../src/lib/creative/sticky.ts";
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

assert(CREATIVE_COMPOSITION_VERSION === 1, "CreativeCompositionPlan schema v1");
assert(NARRATIVE_ROLES.includes("INTRODUCE"), "narrative role INTRODUCE");
assert(SCENE_KINDS.includes("HERO_PRODUCT_STAGE"), "scene HERO_PRODUCT_STAGE");
assert(SCENE_KINDS.includes("NUMBERED_USAGE_SCENE"), "scene NUMBERED_USAGE_SCENE");

const plan = createCreativeCompositionPlan({ page: readyPage, design });
assert(plan.version === 1, "plan version 1");
assert(plan.packshotReady === true, "packshot ready is reflected");
assert(plan.scenes.some((s) => s.kind === "HERO_PRODUCT_STAGE"), "hero scene selected");
assert(plan.scenes.some((s) => s.kind === "INGREDIENT_SHOWCASE"), "ingredient showcase selected");
assert(plan.narrative.includes("INTRODUCE"), "narrative includes INTRODUCE");
assert(plan.scenes[0]?.desktopComposition !== plan.scenes[0]?.mobileComposition || plan.scenes[0]?.mobileComposition === "PRODUCT_FIRST_STACK", "desktop/mobile composition can diverge");
assert(plan.scenes.find((s) => s.kind === "HERO_PRODUCT_STAGE")?.mobileComposition === "PRODUCT_FIRST_STACK", "mobile hero is PRODUCT_FIRST_STACK");
assert(plan.scenes.find((s) => s.kind === "HERO_PRODUCT_STAGE")?.desktopComposition === "HERO_STAGE_ASYMMETRIC", "desktop hero is asymmetric stage");

const usageScene = plan.scenes.find((s) => s.sectionIds.includes("usage"));
assert(Boolean(usageScene), "usage scene exists");
assert(usageScene?.sectionIds.filter((id) => id === "usage").length === 1, "single-step usage remains one usage section");
const usageSection = readyPage.sections.find((s) => s.id === "usage")!;
assert([...usageSection.bullets, ...usageSection.paragraphs].length === 1, "fixture still has a single usage step");
assert(!usageScene?.sectionIds.includes("features"), "usage is not grouped with feature cards");
assert(
  plan.scenes.some((s) => s.kind === "PRODUCT_CHARACTERISTICS_SCENE" && s.sectionIds.includes("features")),
  "features render as their own characteristic scene",
);

const considerScene = plan.scenes.find((s) => s.sectionIds.length === 1 && s.sectionIds[0] === "considerations");
const overviewScene = plan.scenes.find((s) => s.sectionIds.length === 1 && s.sectionIds[0] === "overview");
assert(Boolean(considerScene), "considerations is its own scene");
assert(Boolean(overviewScene), "overview is first-class and not grouped into considerations");
assert(overviewScene?.collapsed === false, "overview is not silently collapsed");
assert(plan.scenes[0]?.kind === "HERO_PRODUCT_STAGE", "hero remains the first scene");
assert(plan.scenes[1]?.sectionIds[0] === "overview", "BUYER_GUIDE overview follows the hero");

const uses = plan.scenes.filter((s) => s.assetUse !== "NONE");
assert(uses.length <= 3, "asset reuse is bounded");
assert(uses[0]?.assetUse === "PRIMARY_HERO", "first packshot use is PRIMARY_HERO");
assert(new Set(uses.map((s) => s.assetUse)).size >= 2, "packshot is not repeated at the same use role");
assert(plan.scenes.filter((s) => s.kind === "HERO_PRODUCT_STAGE").length === 1, "ProductStage reuse is planned, not cloned as extra heroes");

assert(plan.scenes.some((s) => s.weight === "PRIMARY"), "content priority PRIMARY");
assert(plan.scenes.some((s) => s.weight === "DETAIL"), "content priority DETAIL");
const detail = plan.scenes.filter((s) => s.weight === "DETAIL");
assert(detail.every((s) => s.collapsed), "DETAIL scenes use progressive disclosure");

const roundtrip = parseCreativeCompositionPlan(serializeCreativeCompositionPlan(plan));
assert(roundtrip?.scenes.length === plan.scenes.length, "CreativeCompositionPlan roundtrip");

const missing = createDesignPlan({ page, theme: "PREMIUM", productAssetStatus: "NEEDS_ASSET" });
const emptyPlan = createCreativeCompositionPlan({ page, design: missing });
assert(emptyPlan.packshotReady === false, "missing packshot is not invented");
assert(emptyPlan.scenes.find((s) => s.kind === "HERO_PRODUCT_STAGE")?.desktopComposition === "HERO_EDITORIAL_EMPTY", "empty-asset hero composition");
assert(emptyPlan.scenes.every((s) => s.assetUse === "NONE"), "no invented imagery slots when packshot is missing");

const afterActions = applyCreativeActionCodes(plan, ["CREATE_HERO_FOCAL_POINT", "PROMOTE_PRODUCT_VISUAL", "COLLAPSE_SECONDARY_DETAILS"]);
assert(afterActions.scenes.find((s) => s.kind === "HERO_PRODUCT_STAGE")?.visibleLeadCount === 2, "hero focal point reduces competing micro facts");
assert(afterActions.scenes.find((s) => s.kind === "INGREDIENT_SHOWCASE")?.assetUse === "SECTION_ANCHOR" || afterActions.scenes.find((s) => s.kind === "INGREDIENT_SHOWCASE")?.assetUse === "NONE", "promote product visual is presentation-only");
assert(afterActions.scenes.filter((s) => s.weight !== "PRIMARY").every((s) => s.collapsed), "collapse secondary details");

assert(stickyCtaShouldShow({ heroCtaVisible: true, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false }) === false, "sticky CTA hidden while hero CTA is visible");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: true, footerVisible: false, disclosureVisible: false }) === false, "sticky CTA hides when another primary CTA is visible");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: true, disclosureVisible: false }) === false, "sticky CTA avoids footer");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: true }) === false, "sticky CTA avoids disclosure band");
assert(stickyCtaShouldShow({ heroCtaVisible: false, otherPrimaryCtaVisible: false, footerVisible: false, disclosureVisible: false }) === true, "sticky CTA shows after hero CTA leaves");
assert(STICKY_COLLISION_PADDING_PX >= 72, "sticky CTA collision padding reserves space");

const src = {
  page: readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8"),
  sticky: readFileSync(path.join(process.cwd(), "src/components/presell/sticky-cta-bar.tsx"), "utf8"),
  css: readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8"),
  hop: readFileSync(path.join(process.cwd(), "src/lib/clickbank-hop.ts"), "utf8"),
  opt: readFileSync(path.join(process.cwd(), "src/lib/design/optimize.ts"), "utf8"),
  cta: readFileSync(path.join(process.cwd(), "src/components/affiliate-cta.tsx"), "utf8"),
};
assert(src.page.includes("StickyCtaBar"), "sticky CTA visibility component is wired");
assert(src.sticky.includes("safe-area-inset-bottom") || src.css.includes("safe-area-inset-bottom"), "safe-area behavior");
assert(src.css.includes("ps-sticky-cta"), "sticky CTA collision class");
assert(src.css.includes("ps-hero-v3"), "hero product stage V3");
assert(src.css.includes("ps-ingredient-v2"), "ingredient showcase V2");
assert(src.css.includes("ps-usage-split"), "numbered usage / characteristics grouping");
assert(src.css.includes("ps-pull-fact"), "pull-quote style is a visual treatment of existing copy");
assert(src.cta.includes("sendBeacon"), "CTA tracking regression");
assert(src.hop.includes("extclid"), "extclid regression");
assert(ANALYTICS_SKIP_HEADER === "x-aia-analytics", "preview analytics exclusion");
assert(!src.opt.includes("publishCampaign"), "creative optimizer does not auto-publish");
assert(src.opt.includes("MAX_VISUAL_OPTIMIZATION_ITERATIONS"), "Visual QA feedback loop exists");
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

console.log("\nTodos os testes da Phase 8.2 passaram.");
