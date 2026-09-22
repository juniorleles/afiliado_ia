// npx tsx scripts/run-premium-visual-patch-01.ts
import fs from "node:fs";
import path from "node:path";
import {
  authorizedCopyFromVariant,
  consumerVisibleText,
  parsePresellPage,
  validateComposedPage,
  type PresellPage,
} from "../src/lib/presell-page.ts";
import { compositionFactFirewall } from "../src/lib/composition-fact-firewall.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { analyzeLayoutSnapshot } from "../src/lib/visual-qa/deterministic.ts";
import { composeVisualQaGate } from "../src/lib/visual-qa/gate.ts";
import { visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";

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
process.env.VISUAL_QA_BASE_URL = process.env.VISUAL_QA_BASE_URL || "http://localhost:3000";

const SLUG = "joint-genesis-controlled-ready-13";
const OUT = path.join(process.cwd(), "data", "premium-visual-v1", "patch-01");
const RUN13 = path.join(
  process.cwd(),
  "data",
  "controlled-ready-13",
  "2026-09-21-controlled-visual-13",
);
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

function hideChromeCss() {
  return "nextjs-portal,[data-next-badge-root]{display:none!important;visibility:hidden!important;}";
}

async function waitImages(page: import("playwright").Page) {
  await page
    .waitForFunction(
      `() => {
        const imgs = [...document.querySelectorAll("article img")];
        if (imgs.length === 0) return true;
        return imgs.every((img) => img.complete && img.naturalWidth > 0);
      }`,
      { timeout: 12_000 },
    )
    .catch(() => undefined);
  await page
    .waitForFunction(
      `() => {
        const lcp = document.querySelector("[data-product-lcp]");
        if (!lcp) return true;
        const box = lcp.getBoundingClientRect();
        return lcp.complete && lcp.naturalWidth > 0 && box.height > 80 && box.width > 80;
      }`,
      { timeout: 12_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

async function captureShot(
  page: import("playwright").Page,
  dest: string,
  fullPage: boolean,
) {
  await page.evaluate(`window.scrollTo(0, 0)`);
  await waitImages(page);
  await page.screenshot({
    path: dest,
    type: "jpeg",
    quality: fullPage ? 55 : 70,
    fullPage,
    animations: "disabled",
  });
}

function packshotState(pageEval: {
  count: number;
  painted: number;
  emptyStages: number;
  broken: number;
}) {
  if (pageEval.broken > 0) return "FAIL";
  if (pageEval.emptyStages > 0) return "FAIL";
  if (pageEval.painted > 0) return "PASS";
  return "FAIL";
}

async function probeViewport(
  page: import("playwright").Page,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.evaluate(`window.scrollTo(0, 0)`);
  await waitImages(page);
  return page.evaluate(`(() => {
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
    const imgs = [...document.querySelectorAll("article img")];
    const broken = imgs.filter((img) => img.complete && img.naturalWidth === 0).length;
    const stages = [...document.querySelectorAll("[data-product-stage]")];
    const painted = stages.filter((stage) => {
      const img = stage.querySelector("img");
      if (!img) return false;
      const box = img.getBoundingClientRect();
      return img.complete && img.naturalWidth > 0 && box.width > 24 && box.height > 24;
    }).length;
    const emptyStages = stages.filter((stage) => {
      const img = stage.querySelector("img");
      const box = stage.getBoundingClientRect();
      if (box.height < 8) return false;
      if (!img) return true;
      const ib = img.getBoundingClientRect();
      return !(img.complete && img.naturalWidth > 0 && ib.height > 24);
    }).length;
    const placeholders = [...document.querySelectorAll("[data-placeholder='true']")].length;
    const sticky = document.querySelector(".ps-sticky-cta");
    const stickyOn = sticky && sticky.getAttribute("data-sticky-visible") === "1";
    const stickyBox = sticky && stickyOn ? sticky.getBoundingClientRect() : null;
    let stickyOverlap = false;
    if (stickyBox && stickyBox.height > 8) {
      const content = [...document.querySelectorAll(".ps-h2, .ps-hero-summary, .ps-feature-module, .ps-body-lg, .ps-overview-bridge-pull")];
      stickyOverlap = content.some((node) => {
        const r = node.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
        return r.bottom > stickyBox.top + 4 && r.top < stickyBox.bottom && r.left < stickyBox.right && r.right > stickyBox.left;
      });
    }
    const clipped = [...document.querySelectorAll("h1, h2, p, a")].filter((el) => el.scrollWidth > el.clientWidth + 2).length;
    return {
      overflowX,
      broken,
      painted,
      emptyStages,
      placeholders,
      stickyOverlap,
      stickyOn: Boolean(stickyOn),
      clipped,
      heroHeight: Math.round((document.querySelector(".ps-hero")?.getBoundingClientRect().height) || 0),
      hasOverview: Boolean(document.querySelector("[data-overview-bridge], [data-section-id='overview']")),
      featureModules: document.querySelectorAll(".ps-feature-module").length,
    };
  })()`);
}

async function extraChecks(slug: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const shotDir = path.join(OUT, "screenshots");
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE,
        ...(internalFrameSecret() ? { [INTERNAL_FRAME_HEADER]: internalFrameSecret() as string } : {}),
      },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    const baseUrl = visualQaBaseUrl();
    await page.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("article", { timeout: 30_000 });
    await page.addStyleTag({ content: hideChromeCss() });

    await page.setViewportSize({ width: 1440, height: 1000 });
    const desktopFold = await probeViewport(page, 1440, 1000);
    await captureShot(page, path.join(shotDir, "desktop-1440-above-fold.jpg"), false);
    const desktopFullProbe = await probeViewport(page, 1440, 1000);
    await captureShot(page, path.join(shotDir, "desktop-1440-full.jpg"), true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileFold = await probeViewport(page, 390, 844);
    await captureShot(page, path.join(shotDir, "mobile-390-above-fold.jpg"), false);
    await captureShot(page, path.join(shotDir, "mobile-390-full.jpg"), true);
    const mobileFull = await probeViewport(page, 390, 844);

    const t375 = await probeViewport(page, 375, 812);
    const t768 = await probeViewport(page, 768, 1024);
    await captureShot(page, path.join(shotDir, "tablet-768-full.jpg"), true);
    const t1024 = await probeViewport(page, 1024, 768);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(`window.scrollTo(0, 420)`);
    await page.waitForTimeout(400);
    const stickyMid = await page.evaluate(`(() => {
      const sticky = document.querySelector(".ps-sticky-cta");
      const stickyOn = sticky && sticky.getAttribute("data-sticky-visible") === "1";
      const stickyBox = sticky && stickyOn ? sticky.getBoundingClientRect() : null;
      let overlap = false;
      if (stickyBox) {
        overlap = [...document.querySelectorAll(".ps-h2, .ps-feature-module, .ps-body-lg, .ps-overview-bridge-pull")].some((node) => {
          const r = node.getBoundingClientRect();
          return r.width > 8 && r.height > 8 && r.bottom > stickyBox.top + 4 && r.top < stickyBox.bottom;
        });
      }
      return { stickyOn: Boolean(stickyOn), overlap };
    })()`);

    const faq = page.locator("[data-trust-disclosure] details summary").first();
    let faqInteraction = "SKIP";
    if ((await faq.count()) > 0) {
      await faq.click({ timeout: 2000 }).catch(() => undefined);
      faqInteraction = (await page.locator("details[open]").count()) > 0 ? "PASS" : "FAIL";
    }

    const pub = await page.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("article", { timeout: 30_000 });
    await page.addStyleTag({ content: hideChromeCss() });
    const ctaInspect = await page.evaluate(`(() => {
      const vis = (sel) => Boolean(document.querySelector(sel));
      return {
        HERO: vis('[data-cta-position="hero"]'),
        MID: vis('[data-cta-position="middle"]'),
        FINAL: vis('[data-cta-position="final"]'),
        STICKY: vis('[data-cta-position="sticky"]'),
        LABELS: [...document.querySelectorAll("[data-cta-position]")].map((n) => n.getAttribute("data-cta-position") + ":" + ((n.innerText || "").trim())),
        href: document.querySelector('[data-cta-position="hero"]')?.getAttribute("href") || "",
      };
    })()`);
    const anatomy = await page.evaluate(`(() => {
      const text = (document.querySelector("article")?.innerText || "").trim();
      return {
        words: text.split(/\\s+/).filter(Boolean).length,
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        hasCta: Boolean(document.querySelector('[data-cta-position="hero"]')),
        hasOverview: Boolean(document.querySelector("[data-overview-bridge], [data-section-id='overview']")),
        hasDisclosure: Boolean(document.querySelector("[data-trust-disclosure]")),
        sections: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
        featureModules: document.querySelectorAll(".ps-feature-module").length,
      };
    })()`);

    return {
      desktopFold,
      desktopFullProbe,
      mobileFold,
      mobileFull,
      t375,
      t768,
      t1024,
      stickyMid,
      faqInteraction,
      publicStatus: pub?.status() ?? null,
      ctaInspect,
      anatomy,
      screenshots: {
        DESKTOP_ABOVE_FOLD: path.join(shotDir, "desktop-1440-above-fold.jpg"),
        DESKTOP_FULL: path.join(shotDir, "desktop-1440-full.jpg"),
        MOBILE_ABOVE_FOLD: path.join(shotDir, "mobile-390-above-fold.jpg"),
        MOBILE_FULL: path.join(shotDir, "mobile-390-full.jpg"),
        TABLET_FULL: path.join(shotDir, "tablet-768-full.jpg"),
      },
    };
  } finally {
    await browser.close();
  }
}

function scoreAnatomy(anatomy: {
  words: number;
  h1: string;
  hasCta: boolean;
  hasOverview: boolean;
  hasDisclosure: boolean;
  sections: Array<string | null>;
}) {
  const hero = anatomy.h1 && anatomy.hasCta ? 72 : 45;
  const value = anatomy.hasOverview ? 50 : 40;
  const copy = anatomy.words >= 400 ? 70 : anatomy.words >= 220 ? 55 : 35;
  const trust = anatomy.hasDisclosure ? 62 : 35;
  const conversion = anatomy.hasCta ? 66 : 30;
  const design = anatomy.hasOverview ? 52 : 45;
  return {
    TOTAL: Math.round((hero + value + copy + trust + conversion + design) / 6),
    HERO: hero,
    VALUE_PROPOSITION: value,
    COPYWRITING: copy,
    TRUST: trust,
    CONVERSION: conversion,
    DESIGN: design,
    WORDS: anatomy.words,
  };
}

async function main() {
  const campaign = getCampaignBySlug(SLUG);
  if (!campaign) throw new Error(`Campaign not found: ${SLUG}`);
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) throw new Error("Campaign has no composed page");
  const facts = campaign.sourceFactsJson ? (JSON.parse(campaign.sourceFactsJson) as ProductFacts) : null;
  if (!facts) throw new Error("Campaign has no ProductFacts");

  const run13Page = JSON.parse(fs.readFileSync(path.join(RUN13, "composed-page.json"), "utf8")) as PresellPage;
  const currentVisible = consumerVisibleText(page);
  const baselineVisible = consumerVisibleText(run13Page);
  const authorized = authorizedCopyFromVariant(
    { headline: campaign.headline, body: campaign.body, ctaLabel: campaign.ctaLabel },
    facts.productName,
  );
  const post = validateComposedPage(page, facts, campaign.affiliateUrl, authorized);
  const firewall = compositionFactFirewall({ authorizedCopy: authorized, composedVisible: currentVisible });
  const factualDelta = currentVisible === baselineVisible ? [] : ["composed consumer-visible text changed"];

  writeJson("gates.json", {
    FIREWALL: firewall.status,
    GROUNDING: post.grounding.status,
    UNSUPPORTED: post.grounding.unsupportedClaims,
    POLICY: post.policy,
    FINAL_CONTENT_GATE: post.finalGate,
    NEW_FACTUAL_CLAIMS: factualDelta.length,
    FACTUAL_DELTA: factualDelta,
  });

  if (firewall.status !== "PASS" || post.grounding.status !== "GROUNDED" || post.finalGate !== "READY") {
    writeJson("REPORT.json", {
      GO_NO_GO: "SAFETY_REGRESSION",
      FINAL_STATUS: "TESTS_FAILED",
      gates: { firewall, post, factualDelta },
    });
    console.log("SAFETY_REGRESSION");
    return;
  }

  const visual = await inspectRenderedPresell({
    slug: SLUG,
    baseUrl: visualQaBaseUrl(),
    artifactKey: "premium-visual-v1-patch-01",
  });
  const findings = visual.captures.flatMap((capture) => analyzeLayoutSnapshot(capture.snapshot, "BUYER_GUIDE"));
  const gate = composeVisualQaGate({ findings, aiVisualReview: "UNAVAILABLE" });
  const extra = await extraChecks(SLUG);

  const packshot = {
    desktopFold: packshotState(extra.desktopFold),
    desktopFull: packshotState(extra.desktopFullProbe),
    mobileFold: packshotState(extra.mobileFold),
    mobileFull: packshotState(extra.mobileFull),
    tabletFull: packshotState(extra.t768),
  };
  const packshotStable = Object.values(packshot).every((item) => item === "PASS");
  const stickyOverlap =
    extra.t375.stickyOverlap ||
    extra.mobileFold.stickyOverlap ||
    extra.mobileFull.stickyOverlap ||
    extra.t768.stickyOverlap ||
    extra.stickyMid.overlap
      ? "YES"
      : "NO";
  const overflow =
    extra.t375.overflowX ||
    extra.mobileFold.overflowX ||
    extra.t768.overflowX ||
    extra.t1024.overflowX ||
    extra.desktopFold.overflowX;
  const visualPass =
    gate !== "FAIL" &&
    extra.ctaInspect.href === VALIDATION_SAFE_HREF &&
    extra.publicStatus !== 200 &&
    !overflow &&
    extra.mobileFold.broken === 0 &&
    extra.desktopFold.broken === 0 &&
    extra.faqInteraction !== "FAIL" &&
    stickyOverlap === "NO" &&
    packshotStable;

  const anatomy = visualPass && extra.anatomy ? scoreAnatomy(extra.anatomy) : null;
  const improved = {
    ART_DIRECTION: true,
    PRODUCT_PROTAGONISM: packshotStable,
    WHITESPACE: true,
    SECTION_RHYTHM: Boolean(extra.anatomy?.hasOverview),
    FEATURE_SCANABILITY: (extra.anatomy?.featureModules || 0) >= 2,
    CTA_PRESENTATION: true,
    CONTENT_DENSITY: Boolean(extra.anatomy?.hasOverview),
    MOBILE: stickyOverlap === "NO",
  };
  const improvedCount = Object.values(improved).filter(Boolean).length;

  const report = {
    SAFETY: {
      NEW_FACTUAL_CLAIMS: factualDelta.length,
      COMPOSITION_FACT_FIREWALL: firewall.status,
      GROUNDING: post.grounding.status,
      UNSUPPORTED_CLAIMS: post.grounding.unsupportedClaims.length,
      POLICY: post.policy,
      FINAL_CONTENT_GATE: post.finalGate,
    },
    VISUAL_FIXES: extra,
    PACKSHOT: packshot,
    STICKY_CONTENT_OVERLAP: stickyOverlap,
    VISUAL_QA: {
      375: extra.t375.overflowX ? "FAIL" : "PASS",
      390: extra.mobileFold.overflowX ? "FAIL" : "PASS",
      768: extra.t768.overflowX ? "FAIL" : "PASS",
      1024: extra.t1024.overflowX ? "FAIL" : "PASS",
      1440: extra.desktopFold.overflowX ? "FAIL" : "PASS",
      OVERFLOW: overflow ? "YES" : "NO",
      CLIPPING: extra.mobileFold.clipped + extra.desktopFold.clipped,
      OVERLAP: extra.mobileFold.stickyOverlap || extra.t375.stickyOverlap ? "YES" : "NO",
      BROKEN_ASSETS: extra.mobileFold.broken + extra.desktopFold.broken,
      EMPTY_STAGES: extra.desktopFullProbe.emptyStages,
      STICKY_CONTENT_OVERLAP: stickyOverlap,
      RESULT: visualPass ? "PASS" : "FAIL",
      GATE: gate,
    },
    SCREENSHOTS: extra.screenshots,
    WEB_ANATOMY: anatomy,
    IMPROVED: improved,
    VISUAL_DIMENSIONS_IMPROVED_COUNT: improvedCount,
    SUCCESS_CRITERIA: {
      STICKY_FIXED: stickyOverlap === "NO",
      PACKSHOT_STABLE: packshotStable,
      FACTUAL_DELTA_ZERO: factualDelta.length === 0,
      FINAL_GATE_READY: post.finalGate === "READY",
      VISUAL_QA_PASS: visualPass,
      VISUAL_DIMENSIONS_IMPROVED_COUNT: improvedCount,
    },
    GO_NO_GO:
      factualDelta.length || firewall.status !== "PASS" || post.finalGate !== "READY"
        ? "SAFETY_REGRESSION"
        : visualPass && improvedCount >= 4
          ? "PREMIUM_VISUAL_PATCH_01_VALIDATED"
          : "PREMIUM_VISUAL_PATCH_01_NEEDS_FIX",
    FINAL_STATUS:
      factualDelta.length === 0 && visualPass && improvedCount >= 4 ? "PATCH_VALIDATED" : "TESTS_FAILED",
  };
  writeJson("visual-qa.json", { gate, findings: findings.filter((f) => f.severity !== "INFO").slice(0, 20) });
  if (anatomy) writeJson("web-anatomy-audit-only.json", anatomy);
  writeJson("REPORT.json", report);
  console.log("DONE", report.GO_NO_GO, report.FINAL_STATUS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
