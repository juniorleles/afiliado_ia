// npx tsx scripts/test-design-system.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { composePresellPage } from "../src/lib/presell-page.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createDesignPlan, applyActionCodes, uniqueActionCodes } from "../src/lib/design/planner.ts";
import {
  DESIGN_PLAN_VERSION,
  HERO_VARIANTS,
  SECTION_VARIANTS,
  VISUAL_THEMES,
  parseDesignPlan,
  serializeDesignPlan,
} from "../src/lib/design/plan.ts";
import {
  MAX_VISUAL_OPTIMIZATION_ITERATIONS,
  assertNoFactualRewrite,
  presentationFields,
} from "../src/lib/design/optimize.ts";
import { classifyProductImageCandidate, extractProductImage } from "../src/lib/product-image.ts";
import { createCampaign, getCampaignBySlug, updateCampaignDesign, type CampaignInput } from "../src/lib/campaigns.ts";
import { resetDbForTests } from "../src/lib/db.ts";
import { VISUAL_QA_ACTION_CODES } from "../src/lib/visual-qa/types.ts";
import { ANALYTICS_SKIP_HEADER } from "../src/lib/analytics.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string) {
  return path.join(process.cwd(), rel);
}

const facts = emptyProductFacts("Winter Jacket XT-200", "https://example.com/jacket", "IMPORTED");
facts.description = "a mid-weight insulated layer for daily cold weather";
facts.confidence.description = "DIRECT_SOURCE";
facts.features = ["Water-resistant shell", "Insulated core"];
facts.confidence.features = "DIRECT_SOURCE";
facts.usageInformation = ["Machine-wash the outer shell"];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.guaranteeInformation = "30-day returns through the merchant";
facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
facts.ingredientsOrComponents = ["Shell", "Fill"];
facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
facts.importQuality = "SUFFICIENT";

const variant = {
  approach: "BUYER_GUIDE" as const,
  headline: "How to Choose a Winter Jacket",
  ctaLabel: "Check Current Price",
  body: `This winter jacket is a mid-weight insulated layer for daily cold weather.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting. Extra secondary explanation continues with more context for the reader who wants detail.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell
- Storm flap
- Interior pocket

## Ingredients

- Shell
- Fill
- Lining

## How to Use

- Machine-wash the outer shell

## Things to Consider

- Fit can run large
- Not a technical alpine shell

## FAQ

- Can I machine wash it? The product information describes a washable shell.
- Is it for mountaineering? No alpine rating is provided.

## Final Thoughts

A straightforward option for ordinary winter days.
`,
};

const page = composePresellPage({ variant, facts, template: "BUYER_GUIDE" });
assert(DESIGN_PLAN_VERSION === 2, "DesignPlan version 2");
assert(VISUAL_THEMES.join(",") === "CLEAN,NATURAL,BOLD,EDITORIAL,PREMIUM", "visual themes");
assert(HERO_VARIANTS.includes("PRODUCT_SPLIT"), "hero variants include PRODUCT_SPLIT");
assert(HERO_VARIANTS.includes("MAGAZINE_PRODUCT"), "hero V2 includes MAGAZINE_PRODUCT");
assert(SECTION_VARIANTS.includes("FEATURE_BENTO"), "section variants include FEATURE_BENTO");
assert(SECTION_VARIANTS.includes("INGREDIENT_EDITORIAL_GRID"), "section V2 includes ingredient editorial grid");

const premium = createDesignPlan({ page, theme: "PREMIUM", themeLocked: true });
assert(premium.visualTheme === "PREMIUM", "theme selection PREMIUM");
assert(premium.heroVariant === "MINIMAL_LUXURY" || premium.heroVariant === "MAGAZINE_PRODUCT" || premium.heroVariant === "EDITORIAL_SPLIT", "hero chosen from imagery + theme");
assert(premium.sectionPlans.some((s) => ["INGREDIENT_GRID", "INGREDIENT_EDITORIAL_GRID", "INGREDIENT_ORBIT"].includes(s.variant)), "ingredient grid composition");
assert(premium.sectionPlans.some((s) => ["NUMBERED_STEPS", "VISUAL_NUMBER_STEP"].includes(s.variant)), "usage numbered steps");
assert(premium.sectionPlans.some((s) => s.priority === "PRIMARY"), "content prioritization PRIMARY");
assert(premium.sectionPlans.some((s) => s.priority === "DETAIL" && s.collapsed), "progressive disclosure for DETAIL");
assert(premium.ctaStrategy.hero && premium.ctaStrategy.stickyMobile, "CTA strategy keeps hero + sticky");
assert(premium.mobileStrategy.productAboveText && premium.mobileStrategy.stackBento, "mobile art direction");
assert(premium.contentWidth === "wide", "desktop uses wider premium shell");

const editorial = createDesignPlan({ page: { ...page, template: "EDITORIAL" }, theme: "EDITORIAL" });
assert(editorial.ctaStrategy.afterPrimaryFacts === false, "EDITORIAL restrains mid CTA");
assert(editorial.typographyScale === "editorial", "EDITORIAL type scale");

const review = createDesignPlan({ page: { ...page, template: "REVIEW" }, theme: "CLEAN" });
assert(review.visualTheme === "CLEAN", "CLEAN theme on REVIEW template");

const mapped = applyActionCodes(
  structuredClone(premium),
  [
    "REDUCE_CARD_REPETITION",
    "COLLAPSE_SECONDARY_DETAILS",
    "IMPROVE_TYPE_SCALE",
    "CREATE_HERO_FOCAL_POINT",
    "ACQUIRE_PRODUCT_IMAGE",
  ],
  page,
);
assert(["EDITORIAL_QUOTE_STYLE", "MAGAZINE_TEXT_BLOCK"].includes(mapped.sectionPlans.find((s) => s.id === "overview")?.variant || ""), "overview not a card wall");
assert(mapped.sectionPlans.find((s) => s.id === "overview")?.collapsed === true, "overview collapsed");
assert(mapped.typographyScale === "confident", "type scale action");
assert(mapped.productVisualStrategy === "FALLBACK_COMPOSE", "missing image uses fallback, not a fake packshot");
assert(mapped.appliedActionCodes.includes("REDUCE_CARD_REPETITION"), "action codes consumed");

const allCodesCovered = [
  "REDUCE_VISIBLE_CONTENT_DENSITY",
  "PROMOTE_PRODUCT_VISUAL",
  "CREATE_HERO_FOCAL_POINT",
  "COLLAPSE_SECONDARY_DETAILS",
  "INCREASE_SECTION_VARIATION",
  "IMPROVE_TYPE_SCALE",
  "REDUCE_CARD_REPETITION",
  "IMPROVE_CTA_DISTRIBUTION",
  "ADD_VISUAL_ASSET_SLOT",
  "IMPROVE_MOBILE_COMPOSITION",
  "ACQUIRE_PRODUCT_IMAGE",
  "IMPROVE_PROGRESSIVE_DISCLOSURE",
  "STRENGTHEN_ART_DIRECTION",
];
const afterAll = applyActionCodes(structuredClone(premium), allCodesCovered, page);
assert(allCodesCovered.every((code) => afterAll.appliedActionCodes.includes(code)), "all listed Visual QA actions map");
assert(MAX_VISUAL_OPTIMIZATION_ITERATIONS === 2, "optimization iteration limit is 2");
assert(uniqueActionCodes([{ severity: "INFO", actionCode: "STRENGTHEN_ART_DIRECTION" } as never]).length === 0, "INFO findings are not optimization fuel");

assert(parseDesignPlan(serializeDesignPlan(premium))?.visualTheme === "PREMIUM", "DesignPlan roundtrip");
assert(parseDesignPlan("{not json") === null, "invalid design JSON is ignored");

assert("reject" in classifyProductImageCandidate({ url: "https://x.com/order-now-banner.png" }), "promo banners rejected");
assert("reject" in classifyProductImageCandidate({ url: "https://x.com/pixel.gif" }), "tracking pixels rejected");
assert("reject" in classifyProductImageCandidate({ url: "https://x.com/logo.svg" }), "logos rejected");
assert("reject" in classifyProductImageCandidate({ url: "https://x.com/a.jpg", width: 40, height: 40 }), "tiny images rejected");
assert("reject" in classifyProductImageCandidate({ url: "https://x.com/a.jpg", width: 1200, height: 200 }), "extreme banners rejected");
assert(!("reject" in classifyProductImageCandidate({ url: "https://cdn.example.com/product-pack.png", alt: "product pack" })), "packshot candidate accepted");

const html = `<html><head><meta property="og:image" content="https://cdn.example.com/jacket.jpg"></head><body>
<img srcset="https://cdn.example.com/pack-400.jpg 400w, https://cdn.example.com/pack-800.jpg 800w" alt="product pack">
<script type="application/ld+json">{"image":"https://cdn.example.com/ld-product.jpg"}</script>
</body></html>`;
const extracted = extractProductImage(html, "https://example.com/jacket");
assert(Boolean(extracted?.url), "asset pipeline returns a candidate");
assert(extractProductImage(`<img src="https://t.co/pixel.gif">`, "https://example.com") === null, "pixels still excluded");
assert(extractProductImage(`<meta property="og:image" content="https://cdn.example.com/order-now-banner.png">`, "https://example.com") === null, "CTA og:image still excluded");

const src = {
  pageView: readFileSync(joinSrc("src/components/presell/presell-page-view.tsx"), "utf8"),
  cta: readFileSync(joinSrc("src/components/presell/presell-cta.tsx"), "utf8"),
  opt: readFileSync(joinSrc("src/lib/design/optimize.ts"), "utf8"),
  frame: readFileSync(joinSrc("src/app/visual-frame/[slug]/page.tsx"), "utf8"),
  preview: readFileSync(joinSrc("src/app/admin/preview/[slug]/page.tsx"), "utf8"),
  hop: readFileSync(joinSrc("src/lib/clickbank-hop.ts"), "utf8"),
};
assert(src.cta.includes("AffiliateCta"), "CTA reuses AffiliateCta");
assert(src.pageView.includes("PresellCta"), "designed page uses PresellCta");
assert(!src.opt.includes("publishCampaign"), "optimizer does not auto-publish");
assert(src.opt.includes("MAX_VISUAL_OPTIMIZATION_ITERATIONS"), "iteration limit present");
assert(src.opt.includes("assertNoFactualRewrite"), "unsafe factual rewrite rejected");
assert(src.frame.includes("trackClicks={false}"), "preview/QA frame excludes CTA tracking");
assert(src.frame.includes("renderPixel={false}"), "preview/QA frame excludes pixel");
assert(src.preview.includes("Apply Design") || readFileSync(joinSrc("src/components/admin/design-studio-panel.tsx"), "utf8").includes("Apply Premium Design"), "admin Apply Design");
assert(readFileSync(joinSrc("src/components/admin/design-studio-panel.tsx"), "utf8").includes("Auto Optimize"), "admin Auto Optimize");
assert(src.hop.includes("extclid"), "extclid regression still in hop helper");
assert(ANALYTICS_SKIP_HEADER === "x-aia-analytics", "analytics skip header unchanged");
assert(readFileSync(joinSrc("src/components/campaign-template.tsx"), "utf8").includes("parseMarkdown"), "legacy markdown rendering remains");

const tmp = path.join(os.tmpdir(), `afiliado-ia-design-${process.pid}.db`);
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
process.env.PRESELL_OS_DB = tmp;
resetDbForTests();

const created = createCampaign({
  name: "Design fixture",
  slug: `design-fixture-${Date.now()}`,
  headline: "How to Choose a Winter Jacket",
  body: variant.body,
  ctaLabel: "Check Current Price",
  affiliateUrl: "https://example.com/hop",
  headScript: null,
  adHeadline: null,
  pageTemplate: "BUYER_GUIDE",
  pageComposition: JSON.stringify(page),
} satisfies CampaignInput);

assert(created.publicationStatus === "draft", "fixture is draft");
const beforeFields = presentationFields(created);
const designed = updateCampaignDesign(created.id, {
  designPlanJson: serializeDesignPlan(premium),
  visualTheme: "PREMIUM",
  designVersion: 1,
});
assert(designed.publicationStatus === "draft", "design update does not publish");
assert(designed.visualTheme === "PREMIUM", "visual theme persisted");
assertNoFactualRewrite(created, designed);
assert(JSON.stringify(beforeFields) === JSON.stringify(presentationFields(designed)), "copy unchanged after design persist");

const reloaded = getCampaignBySlug(created.slug);
assert(parseDesignPlan(reloaded?.designPlanJson || "")?.heroVariant === premium.heroVariant, "design plan persisted");

try {
  assertNoFactualRewrite(created, { ...designed, body: "rewritten facts" });
  assert(false, "should reject factual rewrite");
} catch (err) {
  assert(err instanceof Error && /Unsafe factual transformation/.test(err.message), "unsafe factual transformation rejection");
}

resetDbForTests();
delete process.env.PRESELL_OS_DB;
try {
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

assert(VISUAL_QA_ACTION_CODES.includes("REDUCE_CARD_REPETITION"), "Phase 7 action codes still exist");

console.log("\nTodos os testes da Fase 8 (Intelligent Page Designer) passaram.");
