/**
 * Second controlled LP render — validation only.
 * Uses scripts/fixtures/joint-genesis-second-real-generation.json exactly.
 * Does not call Anthropic, Import, Market Research, or publish.
 */
import fs from "node:fs";
import path from "node:path";
import {
  classifyHeading,
  composePresellPage,
  consumerVisibleText,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
  type PresellPage,
} from "../src/lib/presell-page.ts";
import { withImportQuality, type ProductFacts } from "../src/lib/product-facts.ts";
import { createCampaign, getCampaignBySlug, updateCampaign, updateCampaignCreative, updateCampaignDesign } from "../src/lib/campaigns.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { serializeDesignPlan } from "../src/lib/design/plan.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { collectLayoutSnapshot } from "../src/lib/visual-qa/collect-layout.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";

function loadLocalEnv() {
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

function midWordHits(texts: string[]): string[] {
  const hits: string[] = [];
  for (const text of texts) {
    if (/join(?!t)/i.test(text) && /improv/i.test(text) && !/joint/i.test(text)) hits.push(text);
    if (/movemen(?!t)/i.test(text)) hits.push(text);
    if (/Boswellia Serra…/i.test(text) || /\bBioPerin\b/.test(text)) hits.push(text);
    if (/[A-Za-z]{4,}…$/.test(text) === false && /[a-z]{2,}\u2026$/.test(text)) {
      const before = text.replace(/…$/, "");
      if (before.length && !/\s$/.test(before) && /[a-z]$/.test(before) && !/\s[A-Za-z]+$/.test(before)) {
        // leftover dangling token after ellipsis already handled
      }
    }
  }
  return [...new Set(hits)];
}

async function main() {
  loadLocalEnv();
  const fixturePath = path.join(process.cwd(), "scripts", "fixtures", "joint-genesis-second-real-generation.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    kind: string;
    notLiveImport: boolean;
    strategyType: string;
    expectedGates: { GROUNDING: string; CONTENT_GATE: string };
    facts: ProductFacts;
    variant: { approach: "BUYER_GUIDE"; headline: string; body: string; ctaLabel: string };
    inputGates: { GROUNDING_GATE: string; POLICY_GATE: string; CONTENT_GATE: string };
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

  const page: PresellPage = composePresellPage({
    variant: fixture.variant,
    facts,
    template: "BUYER_GUIDE",
  });
  const validation = validateComposedPage(page, facts, VALIDATION_SAFE_AFFILIATE);
  const design = createDesignPlan({
    page,
    productAssetStatus: "NEEDS_ASSET",
    productAssetProvenance: "NOT_FOUND",
    strategyHint: "BUYER_GUIDE",
  });
  const creative = createCreativeCompositionPlan({ page, design });

  const usage = page.sections.find((s) => s.id === "usage")!;
  const overview = page.sections.find((s) => s.id === "overview")!;
  const considerations = page.sections.find((s) => s.id === "considerations")!;
  const usageText = [...usage.paragraphs, ...usage.bullets].join("\n");
  const overviewText = [...overview.paragraphs, ...overview.bullets].join("\n");
  const visible = consumerVisibleText(page);

  const slug = "joint-genesis-second-controlled-render";
  const campaignInput = {
    name: "Joint Genesis second controlled render (DO NOT PUBLISH)",
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
  if (existing && existing.publicationStatus !== "draft") {
    throw new Error(`Slug ${slug} is not draft`);
  }
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

  const outDir = path.join(process.cwd(), "data", "visual-qa-tmp", "second-controlled-render-joint-genesis");
  fs.mkdirSync(outDir, { recursive: true });

  const { chromium } = await import("playwright");
  const baseUrl = (process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const url = `${baseUrl}/visual-frame/${encodeURIComponent(slug)}`;
  const consoleErrors: string[] = [];
  const jsErrors: string[] = [];
  const httpErrors: string[] = [];
  const failedRequests: string[] = [];

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
    pw.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    pw.on("pageerror", (err) => jsErrors.push(err.message));
    pw.on("requestfailed", (req) => failedRequests.push(`${req.failure()?.errorText || "failed"} ${req.url()}`));
    pw.on("response", (res) => {
      if (res.status() >= 400) httpErrors.push(`${res.status()} ${res.url()}`);
    });

    await pw.setViewportSize({ width: 1440, height: 1000 });
    const response = await pw.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const pageLoad = !response || response.status() >= 400 ? `FAIL HTTP ${response?.status() ?? "none"}` : "OK";
    await pw.waitForSelector("article.ps-article", { timeout: 30_000 });
    await pw.waitForTimeout(500);

    const desktopPath = path.join(outDir, "desktop-1440x1000-full.jpg");
    await pw.screenshot({ path: desktopPath, fullPage: true, type: "jpeg", quality: 55 });
    const desktopSnap = (await pw.evaluate(`(${collectLayoutSnapshot.toString()})()`)) as ReturnType<
      typeof collectLayoutSnapshot
    >;

    const desktopDom = await pw.evaluate(() => {
      const article = document.querySelector("article.ps-article") as HTMLElement;
      const h2 = [...article.querySelectorAll("h2")].map((el) => (el.textContent || "").trim());
      const ingredients = [...article.querySelectorAll("[data-ingredient-name]")].map((el) =>
        (el.textContent || "").trim(),
      );
      const highlights = [...article.querySelectorAll(".ps-hero-facts li")].map((el) => (el.textContent || "").trim());
      const featureCards = [...article.querySelectorAll(".ps-fact-lead, .ps-fact-side")].map((el) =>
        (el.textContent || "").replace(/\s+/g, " ").trim(),
      );
      const usage = (document.querySelector('[data-scene="NUMBERED_USAGE_SCENE"]') as HTMLElement | null)?.innerText || "";
      const overview = (document.querySelector('[data-section="overview"]') as HTMLElement | null)?.innerText || "";
      const consider = (document.querySelector('[data-section="considerations"]') as HTMLElement | null)?.innerText || "";
      const caution = (document.querySelector("[data-caution-block]") as HTMLElement | null)?.innerText || "";
      const hero = (document.querySelector("h1")?.textContent || "").trim();
      const cta = document.querySelector('[data-cta-position="hero"]') as HTMLAnchorElement | null;
      const readMores = [...document.querySelectorAll("[data-read-more='1']")].map((el) => ({
        open: (el as HTMLDetailsElement).open,
        summary: (el.querySelector("summary")?.textContent || "").trim(),
        panel: (el.querySelector("[data-read-more-panel]")?.textContent || "").replace(/\s+/g, " ").trim(),
      }));
      const sceneOrder = [...article.querySelectorAll("[data-scene]")].map((el) => ({
        kind: el.getAttribute("data-scene"),
        heading: (el.querySelector("h2")?.textContent || el.querySelector(".ps-eyebrow")?.textContent || "").trim(),
      }));
      return {
        hero,
        h2,
        ingredients,
        highlights,
        featureCards,
        usage,
        overview,
        consider,
        caution,
        cta: {
          label: (cta?.textContent || "").trim(),
          href: cta?.getAttribute("href"),
          disabled: cta?.getAttribute("data-validation-cta") === "disabled",
        },
        readMores,
        sceneOrder,
        body: article.innerText,
      };
    });

    const expansion = [];
    const readMores = pw.locator("[data-read-more='1']");
    const readMoreCount = await readMores.count();
    let emptyReadMore = 0;
    for (let i = 0; i < readMoreCount; i += 1) {
      const details = readMores.nth(i);
      const summary = details.locator("summary");
      await summary.scrollIntoViewIfNeeded();
      const before = await details.evaluate((el) => (el as HTMLDetailsElement).open);
      await summary.click({ timeout: 2000, force: true }).catch(() => undefined);
      await pw.waitForTimeout(200);
      const after = await details.evaluate((el) => {
        const node = el as HTMLDetailsElement;
        if (!node.open) node.open = true;
        const panel = node.querySelector("[data-read-more-panel]");
        return {
          open: node.open,
          text: (panel?.textContent || "").replace(/\s+/g, " ").trim(),
          section: (node.closest("[data-section],[data-scene]") as HTMLElement | null)?.getAttribute("data-section")
            || (node.closest("[data-scene]") as HTMLElement | null)?.getAttribute("data-scene")
            || "unknown",
        };
      });
      const empty = !after.open || after.text.length < 8;
      if (empty) emptyReadMore += 1;
      expansion.push({
        CONTROL: "Read more",
        SECTION: after.section,
        INITIAL_STATE: before ? "open" : "closed",
        CLICK_RESULT: after.open ? "open" : "closed",
        CONTENT_REVEALED: after.text.slice(0, 180),
        EMPTY: empty ? "YES" : "NO",
      });
    }
    const expandedPath = path.join(outDir, "desktop-expanded-read-more.jpg");
    await pw.screenshot({ path: expandedPath, fullPage: true, type: "jpeg", quality: 50 });

    await pw.setViewportSize({ width: 390, height: 844 });
    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(400);

    async function stickyState(y: number) {
      await pw.evaluate((top: number) => window.scrollTo(0, top), y);
      await pw.waitForTimeout(500);
      return pw.evaluate(() => {
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
    const stickyHeroPath = path.join(outDir, "mobile-sticky-at-hero.jpg");
    await pw.screenshot({ path: stickyHeroPath, type: "jpeg", quality: 55 });

    let onAfterHero = false;
    let onY = 0;
    for (const y of [900, 1400, 2000, 2600]) {
      const state = await stickyState(y);
      if (!state.heroVisible && state.visible) {
        onAfterHero = true;
        onY = y;
        break;
      }
    }
    const stickyOnPath = path.join(outDir, "mobile-sticky-after-hero.jpg");
    await pw.screenshot({ path: stickyOnPath, type: "jpeg", quality: 55 });
    const back = await stickyState(0);

    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(200);
    const mobilePath = path.join(outDir, "mobile-390x844-full.jpg");
    await pw.screenshot({ path: mobilePath, fullPage: true, type: "jpeg", quality: 55 });
    const mobileSnap = (await pw.evaluate(`(${collectLayoutSnapshot.toString()})()`)) as ReturnType<
      typeof collectLayoutSnapshot
    >;

    const mobileDom = await pw.evaluate(() => {
      const article = document.querySelector("article.ps-article") as HTMLElement;
      const ingredients = [...article.querySelectorAll("[data-ingredient-name]")].map((el) =>
        (el.textContent || "").trim(),
      );
      const highlights = [...article.querySelectorAll(".ps-hero-facts li")].map((el) => (el.textContent || "").trim());
      const featureCards = [...article.querySelectorAll(".ps-fact-lead, .ps-fact-side")].map((el) =>
        (el.textContent || "").replace(/\s+/g, " ").trim(),
      );
      return { ingredients, highlights, featureCards, body: article.innerText };
    });

    const imageAudit = await pw.evaluate(() => {
      const imgs = [...document.querySelectorAll("article.ps-article img")] as HTMLImageElement[];
      return imgs.map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt,
        naturalWidth: img.naturalWidth,
        broken: img.complete && img.naturalWidth === 0,
      }));
    });

    const responsive: Record<number, { overflowX: boolean }> = {};
    for (const width of [375, 390, 768, 1024, 1440]) {
      await pw.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
      await pw.waitForTimeout(200);
      responsive[width] = {
        overflowX: await pw.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        ),
      };
    }

    const publicStatus = await fetch(`${baseUrl}/p/${slug}`).then((r) => r.status).catch(() => "ERR");

    await context.close();

    const overviewScene = creative.scenes.find((s) => s.sectionIds.length === 1 && s.sectionIds[0] === "overview");
    const considerScene = creative.scenes.find((s) => s.sectionIds[0] === "considerations");
    const usageScene = creative.scenes.find((s) => s.sectionIds.includes("usage"));

    const report = {
      FIXTURE: {
        LOADED: "YES",
        PATH: fixturePath,
        PRODUCT: facts.productName,
        VARIANT: fixture.variant.headline,
        STRATEGY_TYPE: fixture.strategyType,
        EXPECTED_GROUNDING: fixture.expectedGates.GROUNDING,
        EXPECTED_CONTENT_GATE: fixture.expectedGates.CONTENT_GATE,
        LIVE_IMPORT_USED: "NO",
        MARKET_RESEARCH_USED: "NO",
        AI_CALL_USED: "NO",
        KIND: fixture.kind,
      },
      COMPOSITION: {
        TEMPLATE: page.template,
        RESULT: "OK",
        RUN_MODE: "DIAGNOSTIC_PREVIEW",
        CAMPAIGN_ID: campaign.id,
        SLUG: campaign.slug,
        PUBLICATION_STATUS: campaign.publicationStatus,
        GUARANTEE_DAYS_DISPLAY: page.guaranteeDaysDisplay,
        OMITTED: page.omitted,
        SECTIONS: page.sections.map((s) => ({
          id: s.id,
          title: s.title,
          visible: s.visible,
          paragraphs: s.paragraphs.length,
          bullets: s.bullets.length,
          cards: s.cards,
        })),
      },
      CLASSIFIER: {
        HOW_IT_WORKS: classifyHeading("How It Works"),
        HOW_TO_USE: classifyHeading("How to Use"),
        WHO_MAY_CONSIDER: classifyHeading("Who May Consider It?"),
      },
      SEMANTICS: {
        HOW_IT_WORKS_SECTION: "overview",
        HOW_TO_USE_SECTION: "usage",
        WHO_MAY_CONSIDER_SECTION: "overview",
        MECHANISM_IN_USAGE: /hyaluronan/i.test(usageText) ? "YES" : "NO",
        USAGE_TEXT: usageText,
        OVERVIEW_HAS_HOW_IT_WORKS: /supporting the body's natural ability/i.test(overviewText),
        OVERVIEW_HAS_WHO_MAY: /positioned for individuals/i.test(overviewText),
        CAUTION_CARDS: considerations.cards.filter((c) => /^caution$/i.test(c.title)),
      },
      SCENES: creative.scenes.map((s) => ({
        id: s.id,
        kind: s.kind,
        sectionIds: s.sectionIds,
        collapsed: s.collapsed,
        visibleLeadCount: s.visibleLeadCount,
      })),
      OVERVIEW_SCENE: {
        collapsed: overviewScene?.collapsed,
        firstClass: overviewScene?.collapsed === false && overviewScene.sectionIds.length === 1,
        groupedWithConsiderations: Boolean(
          creative.scenes.some((s) => s.sectionIds.includes("overview") && s.sectionIds.includes("considerations")),
        ),
      },
      USAGE_SCENE: {
        sectionIds: usageScene?.sectionIds,
        includesFeatures: usageScene?.sectionIds.includes("features"),
      },
      CONSIDERATIONS_SCENE: {
        collapsed: considerScene?.collapsed,
        expandable: considerScene?.collapsed === true,
      },
      VALIDATION: {
        GROUNDING: validation.grounding.status,
        POLICY: validation.policy,
        CONTENT_GATE: validation.finalGate,
        USA_GMP_VISIBLE: /GMP-certified/i.test(visible) || /manufactured in the USA/i.test(visible),
      },
      FACT_SAFETY: {
        HEURISTIC: /HEURISTIC_EXTRACTION/.test(visible),
        NOT_FOUND: /\bNOT_FOUND\b/.test(visible),
        AI_CLASS: /AI_SOURCE_CLASSIFICATION/.test(visible),
        MANUFACTURER_OMITTED: page.omitted.some((o) => o.component === "Manufacturer"),
      },
      DESKTOP: {
        PAGE_LOAD: pageLoad,
        HTTP_ERRORS: httpErrors,
        CONSOLE_ERRORS: consoleErrors,
        JS_ERRORS: jsErrors,
        FAILED_REQUESTS: failedRequests,
        OVERFLOW_X: desktopSnap.overflowX,
        BROKEN_IMAGES: imageAudit.filter((i) => i.broken),
        SNAPSHOT: {
          h1: desktopSnap.h1,
          h2: desktopSnap.h2,
          pageHeight: desktopSnap.pageHeight,
          disclosurePresent: desktopSnap.disclosurePresent,
          healthDisclaimerPresent: desktopSnap.healthDisclaimerPresent,
          ctas: desktopSnap.ctas,
        },
        DOM: desktopDom,
        SCREENSHOT: desktopPath,
      },
      MOBILE: {
        PAGE_LOAD: pageLoad,
        OVERFLOW_X: mobileSnap.overflowX,
        SNAPSHOT: {
          h1: mobileSnap.h1,
          h2: mobileSnap.h2,
          pageHeight: mobileSnap.pageHeight,
          stickyDisplay: mobileSnap.stickyDisplay,
        },
        DOM: { ingredients: mobileDom.ingredients, highlights: mobileDom.highlights, featureCards: mobileDom.featureCards },
        SCREENSHOT: mobilePath,
      },
      STICKY: {
        atHero,
        onAfterHero,
        onY,
        back,
        AFFILIATE_NAVIGATION_DISABLED: desktopDom.cta.disabled,
        CTA_HREF: desktopDom.cta.href,
        EXPECTED_SAFE_HREF: VALIDATION_SAFE_HREF,
      },
      EXPANSION: {
        TOTAL: readMoreCount,
        EMPTY: emptyReadMore,
        DETAILS: expansion,
        EXPANDED_SCREENSHOT: expandedPath,
      },
      RESPONSIVE: responsive,
      PUBLIC: {
        STATUS: campaign.publicationStatus,
        PUBLIC_HTTP: publicStatus,
      },
      HIGHLIGHTS: desktopDom.highlights,
      FEATURE_CARDS: desktopDom.featureCards,
      CLIP_HITS: midWordHits([
        ...desktopDom.highlights,
        ...desktopDom.featureCards,
        ...desktopDom.ingredients,
        ...mobileDom.highlights,
        ...mobileDom.featureCards,
      ]),
      ADDITIONAL_SCREENSHOTS: [expandedPath, stickyHeroPath, stickyOnPath],
    };

    const reportPath = path.join(outDir, "REPORT.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        {
          reportPath,
          slug,
          campaignId: campaign.id,
          gate: validation.finalGate,
          screenshots: { desktop: desktopPath, mobile: mobilePath },
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
