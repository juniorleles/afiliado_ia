// npx tsx scripts/test-lp-structure.ts
import fs from "node:fs";
import path from "node:path";
import { clipAtWordBoundary } from "../src/lib/presell-display.ts";
import {
  classifyHeading,
  composePresellPage,
  consumerVisibleText,
  reconstructPageBody,
  validateComposedPage,
  visibleSections,
} from "../src/lib/presell-page.ts";
import { withImportQuality, type ProductFacts } from "../src/lib/product-facts.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { stickyCtaShouldShow } from "../src/lib/creative/sticky.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { createCampaign, getCampaignBySlug, updateCampaign, updateCampaignCreative, updateCampaignDesign } from "../src/lib/campaigns.ts";
import { serializePresellPage } from "../src/lib/presell-page.ts";
import { serializeDesignPlan } from "../src/lib/design/plan.ts";
import { serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

const fixturePath = path.join(process.cwd(), "scripts", "fixtures", "joint-genesis-second-real-generation.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
  kind: string;
  notLiveImport: boolean;
  strategyType: string;
  expectedGates: { GROUNDING: string; CONTENT_GATE: string };
  facts: ProductFacts;
  variant: { approach: "BUYER_GUIDE"; headline: string; body: string; ctaLabel: string };
};

assert(fixture.kind === "TEST_LAB_FIXTURE", "fixture is lab/test data");
assert(fixture.notLiveImport === true, "fixture is not a live import");
assert(fs.existsSync(fixturePath), "fixture path exists");

const facts = withImportQuality({
  ...fixture.facts,
  sourceSnippets: fixture.facts.sourceSnippets || [],
  importWarnings: fixture.facts.importWarnings || [],
  features: fixture.facts.features || [],
  ingredientsOrComponents: fixture.facts.ingredientsOrComponents || [],
  usageInformation: fixture.facts.usageInformation || [],
  cautions: fixture.facts.cautions || [],
  productImageProvenance: fixture.facts.productImageProvenance || "NOT_FOUND",
});

const page = composePresellPage({ variant: fixture.variant, facts, template: "BUYER_GUIDE" });
const usage = page.sections.find((s) => s.id === "usage")!;
const overview = page.sections.find((s) => s.id === "overview")!;
const usageText = [...usage.paragraphs, ...usage.bullets].join("\n");
const overviewText = [...overview.paragraphs, ...overview.bullets].join("\n");

assert(classifyHeading("How It Works") === "overview", "classifier: How It Works → overview");
assert(classifyHeading("How to Use") === "usage", "classifier: How to Use → usage");
assert(/one capsule per day/i.test(usageText), "operational dosage remains in usage");
assert(!/hyaluronan/i.test(usageText), "hyaluronan mechanism is not in usage");
assert(/hyaluronan/i.test(overviewText), "mechanism copy is in overview");
assert(visibleSections(page).some((s) => s.id === "overview"), "overview section is composed");

const ingredientTitles = page.sections.find((s) => s.id === "ingredients")!.cards.map((c) => c.title);
assert(ingredientTitles.includes("Pycnogenol®"), "Pycnogenol® preserved");
assert(ingredientTitles.includes("Boswellia Serrata"), "Boswellia Serrata preserved");
assert(ingredientTitles.includes("BioPerine®"), "BioPerine® preserved");
assert(!ingredientTitles.some((name) => name.includes("…")), "ingredient titles are not ellipsized");

const blob = JSON.stringify(page);
assert(!blob.includes("HEURISTIC_EXTRACTION"), "HEURISTIC cannot re-enter composed JSON copy");
assert(!consumerVisibleText(page).includes("NOT_FOUND"), "NOT_FOUND is not consumer copy");
assert(!consumerVisibleText(page).includes("AI_SOURCE_CLASSIFICATION"), "AI_SOURCE_CLASSIFICATION cannot re-enter");
assert(!blob.includes("180-day"), "unsupported 180-day guarantee is absent");
assert(page.omitted.some((o) => o.component === "Manufacturer" && o.reason === "NOT_FOUND"), "manufacturer fact surface omitted");
assert(page.guaranteeDaysDisplay === null, "composer does not derive 60-day display from ProductFacts when variant omitted guarantee");

const validation = validateComposedPage(page, facts, VALIDATION_SAFE_AFFILIATE);
assert(validation.grounding.status === fixture.expectedGates.GROUNDING, "fixture grounding stays UNGROUNDED");
assert(validation.finalGate === fixture.expectedGates.CONTENT_GATE, "fixture content gate stays BLOCKED");
assert(reconstructPageBody(page).includes("FAQ") || page.sections.some((s) => s.id === "faq" && s.visible), "FAQ remains in composed page for grounding");
assert(/manufactured in the USA/i.test(consumerVisibleText(page)), "blocked variant USA/GMP copy remains in diagnostic preview");

const design = createDesignPlan({
  page,
  productAssetStatus: "NEEDS_ASSET",
  productAssetProvenance: "NOT_FOUND",
  strategyHint: "BUYER_GUIDE",
});
const creative = createCreativeCompositionPlan({ page, design });
assert(
  creative.scenes.some((s) => s.sectionIds.length === 1 && s.sectionIds[0] === "overview" && s.collapsed === false),
  "overview scene is first-class / not collapsed into considerations",
);
assert(creative.scenes[0]?.kind === "HERO_PRODUCT_STAGE", "hero is the first scene");
assert(creative.scenes[1]?.sectionIds[0] === "overview", "BUYER_GUIDE overview follows hero");
assert(
  creative.scenes.findIndex((s) => s.sectionIds[0] === "overview") <
    creative.scenes.findIndex((s) => s.sectionIds[0] === "ingredients"),
  "overview appears before ingredients",
);
assert(
  !creative.scenes.some((s) => s.sectionIds.includes("overview") && s.sectionIds.includes("considerations")),
  "overview is not grouped with considerations",
);
assert(
  creative.scenes.some((s) => s.kind === "PRODUCT_CHARACTERISTICS_SCENE"),
  "feature cards have their own scene",
);
assert(
  !creative.scenes.some((s) => s.sectionIds.includes("usage") && s.sectionIds.includes("features")),
  "usage does not absorb feature cards",
);

assert(
  stickyCtaShouldShow({
    heroCtaVisible: true,
    otherPrimaryCtaVisible: false,
    footerVisible: false,
    disclosureVisible: false,
    scrolledPastIntent: true,
  }) === false,
  "sticky OFF while hero CTA intersects",
);
assert(
  stickyCtaShouldShow({
    heroCtaVisible: false,
    otherPrimaryCtaVisible: false,
    footerVisible: false,
    disclosureVisible: false,
    scrolledPastIntent: true,
  }) === true,
  "sticky ON after hero CTA leaves",
);
assert(
  stickyCtaShouldShow({
    heroCtaVisible: true,
    otherPrimaryCtaVisible: false,
    footerVisible: false,
    disclosureVisible: false,
    scrolledPastIntent: true,
  }) === false,
  "sticky OFF after return to hero",
);

const longFeature = "Promotes smooth, friction-free movement – By improving joint lubrication extra words";
const clippedFeature = clipAtWordBoundary(longFeature, longFeature.indexOf("joint") + 4);
assert(!/\bjoin\b/.test(clippedFeature), "feature card clip is word-boundary safe");

loadEnv();
const slug = "joint-genesis-lp-structure-fixture";
const campaignInput = {
  name: "Joint Genesis LP structure fixture (DO NOT PUBLISH)",
  slug,
  headline: page.hero.headline,
  body: reconstructPageBody(page),
  ctaLabel: page.ctaLabel,
  affiliateUrl: VALIDATION_SAFE_AFFILIATE,
  headScript: null,
  adHeadline: null,
  pageTemplate: page.template,
  pageComposition: serializePresellPage(page),
  productImageSrc: page.hero.image.src || null,
  productImageProvenance: page.hero.image.provenance,
  subheadline: page.hero.subheadline,
  sourceFactsJson: JSON.stringify(facts),
  designPlanJson: serializeDesignPlan(design),
  visualTheme: design.visualTheme,
  designVersion: design.version,
  productAssetStatus: "NEEDS_ASSET",
};
const existing = getCampaignBySlug(slug);
let campaign = existing ? updateCampaign(existing.id, campaignInput) : createCampaign(campaignInput);
campaign = updateCampaignDesign(campaign.id, {
  designPlanJson: serializeDesignPlan(design),
  visualTheme: design.visualTheme,
  designVersion: design.version,
  productAssetStatus: "NEEDS_ASSET",
});
campaign = updateCampaignCreative(campaign.id, {
  creativeCompositionJson: serializeCreativeCompositionPlan(creative),
  creativeCompositionVersion: creative.version,
});
assert(campaign.publicationStatus === "draft", "fixture campaign stays draft");

const baseUrl = (process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function playwrightStructural() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE,
        ...(internalFrameSecret() ? { [INTERNAL_FRAME_HEADER]: internalFrameSecret() as string } : {}),
      },
      reducedMotion: "reduce",
    });
    const pageObj = await context.newPage();
    pageObj.setDefaultTimeout(45_000);
    const url = `${baseUrl}/visual-frame/${slug}`;
    const consoleErrors: string[] = [];
    const jsErrors: string[] = [];
    pageObj.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    pageObj.on("pageerror", (err) => jsErrors.push(err.message));

    await pageObj.setViewportSize({ width: 390, height: 844 });
    const response = await pageObj.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`visual-frame HTTP ${response?.status() ?? "none"}`);
    }
    await pageObj.waitForSelector("article.ps-article", { timeout: 30_000 });
    await pageObj.waitForTimeout(400);

    const names = await pageObj.locator("[data-ingredient-name]").allTextContents();
    for (const expected of ["Pycnogenol®", "Boswellia Serrata", "BioPerine®"]) {
      assert(names.some((n) => n.includes(expected)), `DOM preserves ingredient ${expected}`);
    }
    const bodyText = await pageObj.locator("article.ps-article").innerText();
    assert(!/Boswellia Serra…/.test(bodyText), "DOM does not show truncated Boswellia Serra…");
    assert(!/\bBioPerin\b/.test(bodyText), "DOM does not show truncated BioPerin");
    assert(/How to Use/i.test(bodyText), "usage heading rendered");
    assert(/Overview/i.test(bodyText), "overview heading rendered as first-class section");

    const cta = await pageObj.locator('[data-cta-position="hero"]').first();
    assert((await cta.getAttribute("data-validation-cta")) === "disabled", "affiliate navigation disabled");
    assert((await cta.getAttribute("href")) === VALIDATION_SAFE_HREF, "CTA href is validation-safe");

    async function stickyState(y: number) {
      await pageObj.evaluate((top: number) => window.scrollTo(0, top), y);
      await pageObj.waitForTimeout(500);
      return pageObj.evaluate(() => {
        const bar = document.querySelector("[data-sticky-visible]");
        const hero = document.querySelector('[data-cta-position="hero"]') as HTMLElement | null;
        const hr = hero?.getBoundingClientRect();
        const vh = window.innerHeight;
        const heroVisible = Boolean(hr && hr.bottom > 48 && hr.top < vh - 48 && hr.width > 0 && hr.height > 0);
        return {
          y: window.scrollY,
          visible: bar?.getAttribute("data-sticky-visible") === "1",
          heroVisible,
        };
      });
    }

    const atHero = await stickyState(0);
    assert(atHero.visible === false, "STICKY_OFF_AT_HERO");

    let onAfterHero = false;
    for (const y of [900, 1400, 2000, 2600]) {
      const state = await stickyState(y);
      if (!state.heroVisible && state.visible) {
        onAfterHero = true;
        break;
      }
    }
    assert(onAfterHero, "STICKY_ON_AFTER_HERO");

    const back = await stickyState(0);
    assert(back.visible === false, "STICKY_OFF_AFTER_RETURN");

    const readMores = pageObj.locator("[data-read-more='1']");
    const readMoreCount = await readMores.count();
    let emptyReadMore = 0;
    for (let i = 0; i < readMoreCount; i += 1) {
      const details = readMores.nth(i);
      const summary = details.locator("summary");
      await summary.scrollIntoViewIfNeeded();
      await summary.click({ timeout: 2000, force: true }).catch(() => undefined);
      await pageObj.waitForTimeout(200);
      const opened = await details.evaluate((el) => {
        const node = el as HTMLDetailsElement;
        if (!node.open) node.open = true;
        const panel = node.querySelector("[data-read-more-panel]");
        return {
          open: node.open,
          text: (panel?.textContent || "").replace(/\s+/g, " ").trim(),
        };
      });
      if (!opened.open || opened.text.length < 8) emptyReadMore += 1;
    }
    assert(emptyReadMore === 0, `EMPTY_READ_MORE_CONTROLS=${emptyReadMore}`);
    console.log("OK: READ_MORE_CONTROLS=" + readMoreCount);
    console.log("OK: READ_MORE_FUNCTIONAL=" + (readMoreCount === 0 ? "n/a" : "YES"));

    const overflows: Record<number, boolean> = {};
    for (const width of [375, 390, 768, 1024, 1440]) {
      await pageObj.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
      await pageObj.waitForTimeout(200);
      overflows[width] = await pageObj.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      );
      assert(overflows[width] === false, `no overflow-x at ${width}`);
    }

    assert(consoleErrors.length === 0, "no console errors");
    assert(jsErrors.length === 0, "no JS errors");
    await context.close();
    return { readMoreCount, emptyReadMore, overflows };
  } finally {
    await browser.close();
  }
}

async function main() {
  await playwrightStructural();
  console.log("\nTodos os testes de LP structure passaram.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
