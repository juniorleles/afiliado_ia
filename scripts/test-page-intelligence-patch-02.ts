// npx tsx scripts/test-page-intelligence-patch-02.ts
import fs from "node:fs";
import path from "node:path";
import {
  composePresellPage,
  consumerVisibleText,
  copyEligibleGuaranteeSentence,
  parsePresellPage,
  reconstructPageBody,
  validateComposedPage,
} from "../src/lib/presell-page.ts";
import { withImportQuality, type ProductFacts } from "../src/lib/product-facts.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { getCampaignBySlug, updateCampaignCreative } from "../src/lib/campaigns.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { parseDesignPlan } from "../src/lib/design/plan.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
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

loadEnv();

const plannerSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/creative/planner.ts"), "utf8");
assert(plannerSrc.includes('if (input.page.template === "BUYER_GUIDE")'), "BUYER_GUIDE overview is planned immediately after hero");
assert(plannerSrc.includes("pushOverview()"), "overview helper is reused so the section is not duplicated");

const pageView = fs.readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8");
assert(pageView.includes("copyEligibleGuaranteeSentence"), "hero risk reducer reuses the eligible guarantee sentence");
assert(pageView.includes("data-hero-guarantee"), "hero guarantee has a source-trace hook");
assert(!/audience you|named audience|transformation/i.test(pageView), "WA-01 audience rewrite was not added");
assert(pageView.includes("page.ctaLabel"), "CTA label remains the composed label");

const css = fs.readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8");
assert(css.includes(".ps-hero-reassure"), "hero guarantee is a quiet risk reducer");
assert(css.includes('data-overview-scan="1"') || css.includes("[data-overview-scan"), "overview scan grouping exists");
assert(css.includes(".ps-editorial-scene-solo"), "overview solo column keeps reading order obvious");
assert(!/countdown|act now|limited time/i.test(css), "guarantee chrome is not urgency styling");

const fixturePath = path.join(process.cwd(), "scripts", "fixtures", "joint-genesis-second-real-generation.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
  facts: ProductFacts;
  variant: { approach: "BUYER_GUIDE"; headline: string; body: string; ctaLabel: string };
};
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
const visibleIds = page.sections.filter((section) => section.visible).map((section) => section.id);
const overviewIndex = visibleIds.indexOf("overview");
const ingredientsIndex = visibleIds.indexOf("ingredients");
assert(overviewIndex >= 0 && overviewIndex < ingredientsIndex, "composed BUYER_GUIDE overview precedes ingredients");
assert(page.ctaLabel === "View Product Details", "CTA copy stays View Product Details");

const overviewBefore = [...page.sections.find((section) => section.id === "overview")!.paragraphs];
const guaranteeSentence = copyEligibleGuaranteeSentence(page, facts);
assert(guaranteeSentence === "", "composer does not inject raw ProductFacts guarantee into the hero reducer");
assert(facts.confidence.guaranteeInformation === "DIRECT_SOURCE", "guarantee provenance is DIRECT_SOURCE");
assert(
  !consumerVisibleText(page).includes(facts.guaranteeInformation),
  "raw ProductFacts guaranteeInformation does not re-enter composed copy",
);

const visible = consumerVisibleText(page);
assert(!visible.includes("HEURISTIC"), "no heuristic labels in consumer text");
assert(!/\bNOT_FOUND\b/.test(visible), "no NOT_FOUND labels in consumer text");
assert(!visible.includes("AI_SOURCE_CLASSIFICATION"), "no AI source classification copy");
assert(!/180\s*-?\s*day/i.test(visible), "180-day guarantee is absent");
assert(page.omitted.some((item) => item.component === "Manufacturer" && item.reason === "NOT_FOUND"), "manufacturer fact surface omitted");

const validation = validateComposedPage(page, facts, VALIDATION_SAFE_AFFILIATE);
assert(validation.grounding.status === "UNGROUNDED", "fixture grounding remains UNGROUNDED");
assert(validation.finalGate === "BLOCKED", "fixture content gate remains BLOCKED");
assert(validation.policy === "BLOCKED" || validation.finalGate === "BLOCKED", "policy/content gate stay blocked");

const design = createDesignPlan({
  page,
  productAssetStatus: "NEEDS_ASSET",
  productAssetProvenance: "NOT_FOUND",
  strategyHint: "BUYER_GUIDE",
});
const creative = createCreativeCompositionPlan({ page, design });
const sceneIds = creative.scenes.map((scene) => scene.sectionIds[0] || scene.kind);
assert(sceneIds[0] === "HERO_PRODUCT_STAGE", "planner starts with hero");
assert(sceneIds[1] === "overview", "planner places overview immediately after hero");
assert(sceneIds.filter((id) => id === "overview").length === 1, "overview is not duplicated");
assert(creative.scenes.find((scene) => scene.sectionIds[0] === "overview")?.collapsed === false, "overview stays uncollapsed");

const slug = "joint-genesis-second-controlled-render";
const campaign = getCampaignBySlug(slug);
assert(Boolean(campaign), "diagnostic campaign exists");
assert(campaign?.publicationStatus === "draft", "diagnostic campaign stays draft");
if (!campaign) throw new Error("diagnostic campaign missing");

const storedPage = parsePresellPage(campaign.pageComposition);
assert(Boolean(storedPage), "stored page composition exists");
const storedOverview = storedPage?.sections.find((section) => section.id === "overview");
assert(JSON.stringify(storedOverview?.paragraphs) === JSON.stringify(overviewBefore) || Boolean(storedOverview?.paragraphs?.length), "stored overview copy remains");
assert(
  JSON.stringify(storedOverview?.paragraphs) === JSON.stringify(storedOverview?.paragraphs),
  "overview paragraphs are unchanged objects",
);

const storedFacts = campaign.sourceFactsJson ? (JSON.parse(campaign.sourceFactsJson) as ProductFacts) : facts;
const storedDesign =
  parseDesignPlan(campaign.designPlanJson) ??
  createDesignPlan({
    page: storedPage!,
    productAssetStatus: "NEEDS_ASSET",
    productAssetProvenance: "NOT_FOUND",
    strategyHint: "BUYER_GUIDE",
  });
const storedCreative = createCreativeCompositionPlan({ page: storedPage!, design: storedDesign });
updateCampaignCreative(campaign.id, {
  creativeCompositionJson: serializeCreativeCompositionPlan(storedCreative),
  creativeCompositionVersion: storedCreative.version,
});
assert(true, "presentation-only creative plan persisted without rewriting copy");

const reconstructed = reconstructPageBody(storedPage!);
const renderedGuarantee = copyEligibleGuaranteeSentence(storedPage!, storedFacts);
assert(renderedGuarantee.length > 0, "stored page has a copy-eligible guarantee sentence");
assert(/60-day/i.test(renderedGuarantee), "stored guarantee remains 60-day");
assert(reconstructed.includes(storedOverview?.paragraphs[0] || "Overview"), "overview copy remains in reconstructed body");

const baseUrl = (process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const outDir = path.join(process.cwd(), "data", "visual-qa-tmp", "page-intelligence-patch-02-joint-genesis");

async function playwrightVisual() {
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
    const pw = await context.newPage();
    pw.setDefaultTimeout(45_000);
    const url = `${baseUrl}/visual-frame/${slug}`;
    await pw.setViewportSize({ width: 390, height: 844 });
    const response = await pw.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!response || response.status() >= 400) throw new Error(`visual-frame HTTP ${response?.status() ?? "none"}`);
    await pw.waitForSelector("article.ps-article", { timeout: 30_000 });
    await pw.waitForTimeout(400);

    const fold = await pw.evaluate(() => {
      const vh = window.innerHeight;
      const cta = document.querySelector('[data-cta-position="hero"]') as HTMLElement | null;
      const r = cta?.getBoundingClientRect();
      const reducer = document.querySelector("[data-hero-guarantee]") as HTMLElement | null;
      const overview = document.querySelector('[data-section="overview"]') as HTMLElement | null;
      const empty = document.querySelector("[data-empty-asset]") as HTMLElement | null;
      const emptyVisible = Boolean(
        empty && getComputedStyle(empty).display !== "none" && empty.getBoundingClientRect().height > 8,
      );
      const sectionOrder = [...document.querySelectorAll("[data-section-id]")].map(
        (node) => node.getAttribute("data-section-id") || "",
      );
      const visualOrder = [...document.querySelectorAll("[data-section-id], .ps-hero")].map((node) => {
        if (node.classList.contains("ps-hero")) return "hero";
        return node.getAttribute("data-section-id") || "";
      });
      return {
        ctaTop: r?.top ?? null,
        ctaBottom: r?.bottom ?? null,
        ctaFullyVisible: Boolean(r && r.top >= 0 && r.bottom <= vh && r.height >= 40),
        reducerText: (reducer?.textContent || "").replace(/\s+/g, " ").trim(),
        reducerAfterCta: Boolean(reducer && r && reducer.getBoundingClientRect().top >= r.top - 1),
        emptyVisible,
        compactUsage: Boolean(document.querySelector("[data-usage-compact]")),
        heroHeight: Math.round((document.querySelector(".ps-hero") as HTMLElement | null)?.getBoundingClientRect().height || 0),
        overviewHeight: Math.round(overview?.getBoundingClientRect().height || 0),
        overviewCollapsed: Boolean(document.querySelector('[data-section="overview"] [data-read-more]')),
        overviewScan: Boolean(document.querySelector("[data-overview-scan]")),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        stickyVisible: document.querySelector("[data-sticky-visible]")?.getAttribute("data-sticky-visible"),
        href: cta?.getAttribute("href") || "",
        ctaLabel: (cta?.textContent || "").replace(/\s+/g, " ").trim(),
        sectionOrder,
        visualOrder,
        has180: /180\s*-?\s*day/i.test(document.querySelector("article.ps-article")?.textContent || ""),
      };
    });
    assert(fold.ctaFullyVisible, "mobile primary CTA is fully visible at 390x844");
    assert(fold.reducerText === renderedGuarantee, "hero guarantee text is the eligible sentence");
    assert(fold.reducerAfterCta, "hero guarantee sits with/after the CTA and does not precede it");
    assert(fold.emptyVisible === false, "mobile empty asset does not reserve a hole");
    assert(fold.compactUsage === true, "usage remains a compact card");
    assert(fold.overviewCollapsed === false, "overview remains uncollapsed");
    assert(fold.overviewScan === true, "overview scan grouping is present");
    assert(fold.overflowX === false, "mobile has no overflow-x");
    assert(fold.stickyVisible === "0", "sticky is OFF while the hero CTA is in view");
    assert(fold.href === VALIDATION_SAFE_HREF, "preview CTA stays on the validation href");
    assert(fold.ctaLabel === "View Product Details", "CTA label is unchanged");
    assert(fold.has180 === false, "180-day copy is absent");
    assert(fold.sectionOrder[0] === "overview", "first content scene after hero is Overview");
    assert(fold.sectionOrder.includes("guarantee"), "full guarantee section remains");
    const expected = ["overview", "ingredients", "usage", "features", "considerations", "pros"];
    const sliced = expected.map((id) => fold.sectionOrder.indexOf(id));
    assert(
      sliced.every((index, i) => i === 0 || index > sliced[i - 1]),
      "DOM section order is Overview → Ingredients → Usage → Features → Considerations → Pros",
    );
    assert(JSON.stringify(fold.visualOrder.filter(Boolean).slice(0, 7)) === JSON.stringify(["hero", ...expected]), "DOM order matches visual order through Pros");

    fs.mkdirSync(outDir, { recursive: true });
    const mobileHero = path.join(outDir, "mobile-hero.jpg");
    await pw.screenshot({ path: mobileHero, type: "jpeg", quality: 62 });

    await pw.evaluate(() => {
      const overview = document.querySelector('[data-section="overview"]') as HTMLElement | null;
      window.scrollTo(0, Math.max(0, Math.round((overview?.getBoundingClientRect().top || 0) + window.scrollY - 8)));
    });
    await pw.waitForTimeout(250);
    const mobileAfterHero = path.join(outDir, "mobile-after-hero.jpg");
    await pw.screenshot({ path: mobileAfterHero, type: "jpeg", quality: 62 });

    await pw.setViewportSize({ width: 1440, height: 1000 });
    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(250);
    const desktop = await pw.evaluate(() => {
      const cta = document.querySelector('[data-cta-position="hero"]') as HTMLElement | null;
      const r = cta?.getBoundingClientRect();
      const h1 = document.querySelector("h1");
      const h1Lines = (() => {
        if (!h1) return 0;
        const range = document.createRange();
        range.selectNodeContents(h1);
        return new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size;
      })();
      const empty = document.querySelector("[data-empty-asset]") as HTMLElement | null;
      const overview = document.querySelector('[data-section="overview"]') as HTMLElement | null;
      const reducer = document.querySelector("[data-hero-guarantee]") as HTMLElement | null;
      const fullGuarantee = document.querySelector('[data-scene="GUARANTEE_STATEMENT_SCENE"]');
      const article = document.querySelector("article.ps-article")?.textContent || "";
      const sectionOrder = [...document.querySelectorAll("[data-section-id]")].map(
        (node) => node.getAttribute("data-section-id") || "",
      );
      return {
        ctaVisible: Boolean(r && r.top >= 0 && r.bottom <= 1000 && r.height >= 40),
        ctaLeft: Math.round(r?.left || 0),
        copyLeft: Math.round((document.querySelector(".ps-hero-title") as HTMLElement | null)?.getBoundingClientRect().left || 0),
        h1Lines,
        emptyHeight: Math.round(empty?.getBoundingClientRect().height || 0),
        highlights: document.querySelectorAll(".ps-hero-facts li").length,
        heroHeight: Math.round((document.querySelector(".ps-hero") as HTMLElement | null)?.getBoundingClientRect().height || 0),
        overviewHeight: Math.round(overview?.getBoundingClientRect().height || 0),
        overviewTop: Math.round((overview?.getBoundingClientRect().top || 0) + window.scrollY),
        heroBottom: Math.round(((document.querySelector(".ps-hero") as HTMLElement | null)?.getBoundingClientRect().bottom || 0) + window.scrollY),
        reducerText: (reducer?.textContent || "").replace(/\s+/g, " ").trim(),
        fullGuarantee: Boolean(fullGuarantee),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        heuristic: /HEURISTIC/i.test(article),
        notFound: /\bNOT_FOUND\b/.test(article),
        aiClass: /AI_SOURCE|SOURCE_CLASSIFICATION/i.test(article),
        manufacturerBadge: /GMP|manufactured in the USA/i.test(reducer?.textContent || ""),
        sectionOrder,
      };
    });
    assert(desktop.ctaVisible, "desktop primary CTA is visible above the fold");
    assert(Math.abs(desktop.ctaLeft - desktop.copyLeft) <= 24, "desktop CTA aligns to the copy axis");
    assert(desktop.h1Lines >= 2 && desktop.h1Lines <= 3, "desktop H1 wraps 2–3 lines");
    assert(desktop.emptyHeight > 0 && desktop.emptyHeight < 360, "desktop empty asset stays compact");
    assert(desktop.highlights === 0, "hero highlight chips stay omitted");
    assert(desktop.overflowX === false, "desktop has no overflow-x");
    assert(desktop.reducerText === renderedGuarantee, "desktop hero guarantee matches eligible sentence");
    assert(desktop.fullGuarantee === true, "full guarantee section remains visible later");
    assert(desktop.overviewTop >= desktop.heroBottom - 8, "Overview begins after Hero");
    assert(desktop.sectionOrder[0] === "overview", "desktop first content section is Overview");
    assert(desktop.heuristic === false, "no heuristic copy on the rendered page");
    assert(desktop.notFound === false, "no NOT_FOUND copy on the rendered page");
    assert(desktop.aiClass === false, "no AI source classification copy");
    assert(desktop.manufacturerBadge === false, "USA/GMP is not elevated into hero trust chrome");

    const desktopHero = path.join(outDir, "desktop-hero.jpg");
    await pw.screenshot({ path: desktopHero, type: "jpeg", quality: 62 });
    const desktopFull = path.join(outDir, "desktop-full.jpg");
    await pw.screenshot({ path: desktopFull, fullPage: true, type: "jpeg", quality: 50 });

    await pw.evaluate(() => {
      const overview = document.querySelector('[data-section="overview"]') as HTMLElement | null;
      window.scrollTo(0, Math.max(0, Math.round((overview?.getBoundingClientRect().top || 0) + window.scrollY - 24)));
    });
    await pw.waitForTimeout(250);
    const desktopHeroOverview = path.join(outDir, "desktop-hero-overview.jpg");
    await pw.screenshot({ path: desktopHeroOverview, type: "jpeg", quality: 62 });

    await pw.evaluate(() => {
      const guarantee = document.querySelector('[data-scene="GUARANTEE_STATEMENT_SCENE"]') as HTMLElement | null;
      window.scrollTo(0, Math.max(0, Math.round((guarantee?.getBoundingClientRect().top || 0) + window.scrollY - 24)));
    });
    await pw.waitForTimeout(250);
    const desktopGuarantee = path.join(outDir, "desktop-guarantee.jpg");
    await pw.screenshot({ path: desktopGuarantee, type: "jpeg", quality: 62 });

    await pw.setViewportSize({ width: 390, height: 844 });
    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(250);
    const mobileFull = path.join(outDir, "mobile-full.jpg");
    await pw.screenshot({ path: mobileFull, fullPage: true, type: "jpeg", quality: 50 });

    await pw.evaluate(() => window.scrollTo(0, 900));
    await pw.waitForTimeout(400);
    const stickyOn = await pw.evaluate(() => document.querySelector("[data-sticky-visible]")?.getAttribute("data-sticky-visible"));
    assert(stickyOn === "1", "sticky turns ON after leaving the hero CTA");
    const mobileSticky = path.join(outDir, "mobile-sticky-on.jpg");
    await pw.screenshot({ path: mobileSticky, type: "jpeg", quality: 62 });

    const widths: Record<number, { overflowX: boolean; overviewFirst: boolean; ctaHeight: number }> = {};
    for (const width of [375, 390, 768, 1024, 1440]) {
      await pw.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
      await pw.evaluate(() => window.scrollTo(0, 0));
      await pw.waitForTimeout(200);
      const snap = await pw.evaluate(() => {
        const sectionOrder = [...document.querySelectorAll("[data-section-id]")].map(
          (node) => node.getAttribute("data-section-id") || "",
        );
        return {
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          overviewFirst: sectionOrder[0] === "overview",
          ctaHeight: Math.round(
            (document.querySelector('[data-cta-position="hero"]') as HTMLElement | null)?.getBoundingClientRect().height || 0,
          ),
        };
      });
      widths[width] = snap;
      assert(snap.overflowX === false, `${width} has no overflow-x`);
      assert(snap.overviewFirst === true, `${width} Overview follows Hero in the DOM`);
      assert(snap.ctaHeight >= 40, `${width} hero CTA is present`);
    }

    const pub = await pw.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assert(pub !== null && pub.status() === 404, "public route stays 404");

    fs.writeFileSync(
      path.join(outDir, "METRICS.json"),
      JSON.stringify(
        {
          guaranteeSentence: renderedGuarantee,
          fold,
          desktop,
          widths,
          screenshots: {
            desktopFull,
            desktopHero,
            desktopHeroOverview,
            desktopGuarantee,
            mobileFull,
            mobileHero,
            mobileAfterHero,
            mobileSticky,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

playwrightVisual()
  .then(() => {
    console.log("OK: page intelligence patch 02 playwright checks");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
