// npx tsx scripts/test-visual-patch-01.ts
import fs from "node:fs";
import path from "node:path";
import {
  composePresellPage,
  consumerVisibleText,
  validateComposedPage,
} from "../src/lib/presell-page.ts";
import { withImportQuality, type ProductFacts } from "../src/lib/product-facts.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";

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

const emptySrc = fs.readFileSync(path.join(process.cwd(), "src/components/presell/empty-asset-hero.tsx"), "utf8");
assert(emptySrc.includes("productName"), "empty asset label comes from productName");
assert(!emptySrc.includes("headline.split"), "empty asset does not extract a name from the headline");
assert(emptySrc.includes("Product image not available"), "empty-asset language stays neutral");
assert(emptySrc.includes("data-placeholder"), "empty-asset remains an intentional placeholder");

const pageView = fs.readFileSync(path.join(process.cwd(), "src/components/presell/presell-page-view.tsx"), "utf8");
assert(pageView.includes("productNameFromFacts"), "hero empty state reads ProductFacts productName");
assert(pageView.includes("featuresVisible ? 0"), "hero omits highlight chips when Features is present");
assert(pageView.includes('data-empty={ready ? "false" : "true"}'), "empty visual is marked for mobile collapse");

const sceneSrc = fs.readFileSync(path.join(process.cwd(), "src/components/presell/scene-render.tsx"), "utf8");
assert(sceneSrc.includes("data-usage-compact"), "single usage step uses a compact card");
assert(sceneSrc.includes("ps-overview-lede"), "overview first block has a lede treatment");
assert(sceneSrc.includes("ps-read-more"), "Read more has a dedicated hit-area class");
assert(sceneSrc.includes("ps-guarantee-statement"), "guarantee numeral stays grouped with money-back copy");

const css = fs.readFileSync(path.join(process.cwd(), "src/app/presell-design.css"), "utf8");
assert(css.includes("visibility: hidden"), "sticky OFF uses visibility hidden");
assert(css.includes("pointer-events: none"), "sticky OFF keeps pointer-events none");
assert(css.includes(".ps-read-more"), "Read more target class exists");
assert(css.includes("min-height: 44px"), "Read more minimum target is 44px");
assert(!css.includes("translateY(110%)"), "sticky no longer uses the 110% peek hide");
assert(css.includes("ps-empty-asset-compact"), "desktop empty asset is compact");
assert(css.includes('.ps-hero-visual[data-empty="true"]'), "mobile hides the empty visual hole");
assert(css.includes("max-width: 22ch"), "H1 measure is wider than 16ch");
assert(css.includes("clamp(2.15rem, 5.2vw, 3.55rem)"), "guarantee display size is reduced");
assert(!/background:\s*#b91c1c/.test(css), "caution does not use alarm red");

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
const visible = consumerVisibleText(page);
assert(page.hero.highlights.length > 0, "underlying hero highlight copy is unchanged");
assert(visible.includes(page.hero.highlights[0]), "highlight copy remains in the composed page");
assert(page.sections.some((section) => section.id === "features" && section.visible), "Features section still exists");
assert(facts.productName === "Joint Genesis", "productName is Joint Genesis");
assert(!visible.includes("HEURISTIC"), "no heuristic labels in consumer text");
assert(!/\bNOT_FOUND\b/.test(visible), "no NOT_FOUND labels in consumer text");
const validation = validateComposedPage(page, facts, VALIDATION_SAFE_AFFILIATE);
assert(validation.grounding.status === "UNGROUNDED", "fixture grounding remains UNGROUNDED");
assert(validation.finalGate === "BLOCKED", "fixture content gate remains BLOCKED");

const slug = "joint-genesis-second-controlled-render";
const campaign = getCampaignBySlug(slug);
assert(!campaign || campaign.publicationStatus === "draft", "diagnostic campaign stays draft if present");

const baseUrl = (process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

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
    await pw.waitForTimeout(350);

    const fold = await pw.evaluate(() => {
      const vh = window.innerHeight;
      const cta = document.querySelector('[data-cta-position="hero"]') as HTMLElement | null;
      const r = cta?.getBoundingClientRect();
      const mark = document.querySelector(".ps-empty-mark")?.textContent?.trim() || "";
      const empty = document.querySelector("[data-empty-asset]") as HTMLElement | null;
      const emptyVisible = Boolean(empty && getComputedStyle(empty).display !== "none" && empty.getBoundingClientRect().height > 8);
      const targets = [...document.querySelectorAll("[data-read-more] > summary")].map((el) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return Math.round(box.height);
      });
      return {
        ctaTop: r?.top ?? null,
        ctaBottom: r?.bottom ?? null,
        ctaFullyVisible: Boolean(r && r.top >= 0 && r.bottom <= vh && r.height >= 40),
        mark,
        emptyVisible,
        readMoreHeights: targets,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        compactUsage: Boolean(document.querySelector("[data-usage-compact]")),
        heroHeight: Math.round((document.querySelector(".ps-hero") as HTMLElement | null)?.getBoundingClientRect().height || 0),
        stickyVisible: document.querySelector("[data-sticky-visible]")?.getAttribute("data-sticky-visible"),
        stickyVisibility: document.querySelector(".ps-sticky-cta")
          ? getComputedStyle(document.querySelector(".ps-sticky-cta") as Element).visibility
          : null,
        href: cta?.getAttribute("href") || "",
      };
    });
    assert(fold.ctaFullyVisible, "mobile primary CTA is fully visible at 390x844");
    assert(fold.mark === "Joint Genesis" || fold.mark === "", "product label is Joint Genesis or omitted, not headline fragment");
    assert(!fold.mark.endsWith(":"), "product label has no trailing colon");
    assert(fold.emptyVisible === false, "mobile empty asset does not reserve a hole");
    assert(fold.readMoreHeights.every((h) => h >= 44), "Read more targets are >= 44px");
    assert(fold.overflowX === false, "mobile has no overflow-x");
    assert(fold.compactUsage === true, "usage renders as a compact card");
    assert(fold.stickyVisible === "0", "sticky is OFF while the hero CTA is in view");
    assert(fold.stickyVisibility === "hidden", "sticky OFF is visibility hidden");
    assert(fold.href === VALIDATION_SAFE_HREF, "preview CTA stays on the validation href");

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
      const highlights = document.querySelectorAll(".ps-hero-facts li").length;
      return {
        ctaVisible: Boolean(r && r.top >= 0 && r.bottom <= 1000 && r.height >= 40),
        ctaLeft: Math.round(r?.left || 0),
        copyLeft: Math.round((document.querySelector(".ps-hero-title") as HTMLElement | null)?.getBoundingClientRect().left || 0),
        h1Lines,
        emptyHeight: Math.round(empty?.getBoundingClientRect().height || 0),
        highlights,
        heroHeight: Math.round((document.querySelector(".ps-hero") as HTMLElement | null)?.getBoundingClientRect().height || 0),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        mark: document.querySelector(".ps-empty-mark")?.textContent?.trim() || "",
      };
    });
    assert(desktop.ctaVisible, "desktop primary CTA is visible above the fold");
    assert(Math.abs(desktop.ctaLeft - desktop.copyLeft) <= 24, "desktop CTA aligns to the copy axis");
    assert(desktop.h1Lines >= 2 && desktop.h1Lines <= 3, "desktop H1 wraps 2–3 lines");
    assert(desktop.emptyHeight > 0 && desktop.emptyHeight < 360, "desktop empty asset is compact");
    assert(desktop.highlights === 0, "hero highlight chips are omitted because Features follows");
    assert(desktop.overflowX === false, "desktop has no overflow-x");
    assert(desktop.mark === "Joint Genesis", "desktop empty label uses productName");

    const outDir = path.join(process.cwd(), "data", "visual-qa-tmp", "visual-patch-01-joint-genesis");
    fs.mkdirSync(outDir, { recursive: true });
    const desktopHero = path.join(outDir, "desktop-hero.jpg");
    const desktopFull = path.join(outDir, "desktop-full.jpg");
    await pw.screenshot({ path: desktopHero, type: "jpeg", quality: 62 });
    await pw.screenshot({ path: desktopFull, fullPage: true, type: "jpeg", quality: 50 });

    const desktopMore = await pw.evaluate(() => {
      const overview = document.querySelector('[data-section="overview"]') as HTMLElement | null;
      const guarantee = document.querySelector(".ps-guarantee-display");
      const article = document.querySelector("article.ps-article")?.textContent || "";
      return {
        overviewHeight: Math.round(overview?.getBoundingClientRect().height || 0),
        guaranteeSize: guarantee ? getComputedStyle(guarantee).fontSize : "",
        has180: /180\s*-?\s*day/i.test(article),
        heuristic: /HEURISTIC/i.test(article),
        notFound: /\bNOT_FOUND\b/.test(article),
        aiClass: /AI_SOURCE|SOURCE_CLASSIFICATION/i.test(article),
      };
    });
    assert(desktopMore.has180 === false, "180-day guarantee is absent");
    assert(desktopMore.heuristic === false, "no heuristic copy on the rendered page");
    assert(desktopMore.notFound === false, "no NOT_FOUND copy on the rendered page");
    assert(desktopMore.aiClass === false, "no AI source classification copy");

    await pw.setViewportSize({ width: 390, height: 844 });
    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(250);
    const mobileHero = path.join(outDir, "mobile-hero.jpg");
    const mobileFull = path.join(outDir, "mobile-full.jpg");
    await pw.screenshot({ path: mobileHero, type: "jpeg", quality: 62 });
    await pw.screenshot({ path: mobileFull, fullPage: true, type: "jpeg", quality: 50 });

    await pw.evaluate(() => window.scrollTo(0, 900));
    await pw.waitForTimeout(400);
    const stickyOn = await pw.evaluate(() => document.querySelector("[data-sticky-visible]")?.getAttribute("data-sticky-visible"));
    assert(stickyOn === "1", "sticky turns ON after leaving the hero CTA");
    const mobileSticky = path.join(outDir, "mobile-sticky-on.jpg");
    await pw.screenshot({ path: mobileSticky, type: "jpeg", quality: 62 });

    const widths = [375, 390, 768, 1024, 1440];
    for (const width of widths) {
      await pw.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
      await pw.evaluate(() => window.scrollTo(0, 0));
      await pw.waitForTimeout(200);
      const snap = await pw.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        ctaHeight: Math.round((document.querySelector('[data-cta-position="hero"]') as HTMLElement | null)?.getBoundingClientRect().height || 0),
      }));
      assert(snap.overflowX === false, `${width} has no overflow-x`);
      assert(snap.ctaHeight >= 40, `${width} hero CTA is present`);
    }

    const pub = await pw.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assert(pub !== null && pub.status() === 404, "public route stays 404");

    fs.writeFileSync(
      path.join(outDir, "METRICS.json"),
      JSON.stringify(
        {
          mobile: fold,
          desktop,
          desktopMore,
          screenshots: { desktopFull, desktopHero, mobileFull, mobileHero, mobileSticky },
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
    console.log("OK: visual patch 01 playwright checks");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
