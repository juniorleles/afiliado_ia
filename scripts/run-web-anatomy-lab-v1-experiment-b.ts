// npx tsx scripts/run-web-anatomy-lab-v1-experiment-b.ts
import fs from "node:fs";
import path from "node:path";
import {
  authorizedCopyFromVariant,
  consumerVisibleText,
  parsePresellPage,
  validateComposedPage,
  type PresellPage,
} from "../src/lib/presell-page.ts";
import {
  composerAddedFactualCopy,
  compositionFactFirewall,
} from "../src/lib/composition-fact-firewall.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { analyzeLayoutSnapshot } from "../src/lib/visual-qa/deterministic.ts";
import { composeVisualQaGate } from "../src/lib/visual-qa/gate.ts";
import { visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";
import {
  applyVisualPresentationBonuses,
  categoryMapFromSkill,
  scoreHeuristic,
  scoreSkillPack,
  type HeuristicAnatomy,
  type SkillDomSignals,
  type VisualPresentationMetrics,
} from "../src/lib/web-anatomy-lab/score.ts";

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
const OUT = path.join(process.cwd(), "data", "web-anatomy-lab", "v1", "experiment-b");
const RUN13 = path.join(process.cwd(), "data", "controlled-ready-13", "2026-09-21-controlled-visual-13");
const EXPERIMENT_A = path.join(process.cwd(), "data", "web-anatomy-lab", "v1", "experiment-a");
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

function hideChromeCss() {
  return "nextjs-portal,[data-next-badge-root]{display:none!important;visibility:hidden!important;}";
}

function frameHeaders() {
  return {
    [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE,
    ...(internalFrameSecret() ? { [INTERNAL_FRAME_HEADER]: internalFrameSecret() as string } : {}),
  };
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

async function captureShot(page: import("playwright").Page, dest: string, fullPage: boolean) {
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

function packshotState(pageEval: { painted: number; emptyStages: number; broken: number }) {
  if (pageEval.broken > 0) return "FAIL";
  if (pageEval.emptyStages > 0) return "FAIL";
  if (pageEval.painted > 0) return "PASS";
  return "FAIL";
}

const PROBE_JS = `(() => {
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
  const sticky = document.querySelector(".ps-sticky-cta");
  const stickyOn = sticky && sticky.getAttribute("data-sticky-visible") === "1";
  const stickyBox = sticky && stickyOn ? sticky.getBoundingClientRect() : null;
  let stickyOverlap = false;
  if (stickyBox && stickyBox.height > 8) {
    const content = [...document.querySelectorAll(".ps-h2, .ps-hero-summary, .ps-feature-module, .ps-body-lg, .ps-overview-lede")];
    stickyOverlap = content.some((node) => {
      const r = node.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      return r.bottom > stickyBox.top + 4 && r.top < stickyBox.bottom && r.left < stickyBox.right && r.right > stickyBox.left;
    });
  }
  const clipped = [...document.querySelectorAll("h1, h2, p, a")].filter((el) => el.scrollWidth > el.clientWidth + 2).length;
  const boxes = [...document.querySelectorAll("h1, h2, .ps-feature-module, [data-cta-position]:not([data-cta-position='sticky']), .ps-product-stage")].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 8 && r.height > 8);
  let overlap = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const sameColumn = Math.abs(a.left - b.left) < 8;
      if (!sameColumn) continue;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 24 && h > 16) overlap += 1;
    }
  }
  const overview = document.querySelector("[data-overview-bridge]");
  const overviewTop = overview ? overview.getBoundingClientRect().top : null;
  return {
    overflowX,
    broken,
    painted,
    emptyStages,
    stickyOverlap,
    stickyOn: Boolean(stickyOn),
    clipped,
    overlap,
    featureModules: document.querySelectorAll(".ps-feature-module").length,
    waLab: document.querySelector("[data-wa-lab='v1']") ? "YES" : "NO",
    waExp: document.querySelector("[data-wa-exp='b']") ? "B" : "A",
    overviewInFold: overviewTop !== null ? overviewTop < window.innerHeight - 8 : false,
    ctaLabels: [...document.querySelectorAll("[data-cta-position]:not([data-cta-position='sticky'])")].map((n) => n.getAttribute("data-cta-position")),
  };
})()`;

const ANATOMY_JS = `(() => {
  const text = (document.querySelector("article")?.innerText || "").trim();
  return {
    words: text.split(/\\s+/).filter(Boolean).length,
    h1: document.querySelector("h1")?.textContent?.trim() || "",
    hasCta: Boolean(document.querySelector('[data-cta-position="hero"]')),
    hasOverview: Boolean(document.querySelector("[data-overview-bridge], [data-section-id='overview']")),
    hasDisclosure: Boolean(document.querySelector("[data-trust-disclosure]")),
    articleText: text,
    ctaLabels: [...document.querySelectorAll("[data-cta-position]")].map((n) => ((n.innerText || "").trim())),
  };
})()`;

const METRICS_JS = `(() => {
  const rgbLum = (color) => {
    if (!color) return null;
    const m = String(color).match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/);
    if (!m) return null;
    return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
  };
  const opaque = (color) => {
    if (!color || color === "transparent") return false;
    if (color === "rgba(0, 0, 0, 0)" || color === "rgba(0,0,0,0)") return false;
    const a = String(color).match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+([0-9.]+))?/);
    if (a && a[4] !== undefined && Number(a[4]) <= 0.04) return false;
    return true;
  };
  const summary = document.querySelector(".ps-hero-summary");
  const canvas = document.querySelector(".presell-canvas");
  const heroCta = document.querySelector('[data-cta-position="hero"]');
  const finalCta = document.querySelector('[data-cta-position="final"]');
  const feature = document.querySelector(".ps-feature-module");
  const faq = document.querySelector(".ps-faq-band");
  const footer = document.querySelector(".ps-footer");
  const h1 = document.querySelector("h1");
  const product = document.querySelector(".ps-hero [data-product-stage] img, .ps-hero [data-product-lcp]");
  const overview = document.querySelector("[data-overview-bridge]");
  const closing = document.querySelector(".ps-closing-scene");
  const fold = window.innerHeight;
  const inFold = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top < fold - 8 && r.bottom > 8 && r.width > 8 && r.height > 8;
  };
  const summaryCs = summary ? getComputedStyle(summary) : null;
  const textCs = canvas ? getComputedStyle(canvas) : null;
  const summaryLum = rgbLum(summaryCs?.color || "");
  const textLum = rgbLum(textCs?.color || "");
  const grid = feature?.parentElement ? getComputedStyle(feature.parentElement).gridTemplateColumns : "";
  const cols = grid ? grid.split(" ").filter(Boolean).length : 0;
  const pack = product && product.complete && product.naturalWidth > 0 && product.getBoundingClientRect().height > 24;
  const p = product ? product.getBoundingClientRect() : null;
  const c = heroCta ? heroCta.getBoundingClientRect() : null;
  let productCtaGapPx = 999;
  let productCtaYOverlap = false;
  if (p && c) {
    const yOverlap = Math.min(p.bottom, c.bottom) - Math.max(p.top, c.top);
    productCtaYOverlap = yOverlap > 40;
    if (p.left >= c.right) productCtaGapPx = p.left - c.right;
    else if (c.left >= p.right) productCtaGapPx = c.left - p.right;
    else productCtaGapPx = 0;
  }
  return {
    summaryFontPx: summaryCs ? parseFloat(summaryCs.fontSize) : 0,
    summaryUsesPrimaryText: summaryLum !== null && textLum !== null ? Math.abs(summaryLum - textLum) < 0.08 : false,
    heroCtaHeight: heroCta ? Math.round(heroCta.getBoundingClientRect().height) : 0,
    finalCtaHeight: finalCta ? Math.round(finalCta.getBoundingClientRect().height) : 0,
    featureSurfaceOpaque: feature ? opaque(getComputedStyle(feature).backgroundColor) : false,
    faqSurfaceOpaque: faq ? opaque(getComputedStyle(faq).backgroundColor) : false,
    footerPadTop: footer ? parseFloat(getComputedStyle(footer.querySelector("div") || footer).paddingTop) : 0,
    featureGridColumns: cols,
    overviewInFold: overview ? overview.getBoundingClientRect().top < fold - 8 : false,
    closingSurfaceOpaque: closing ? opaque(getComputedStyle(closing).backgroundColor) : false,
    productCtaGapPx: Math.round(productCtaGapPx),
    productCtaYOverlap,
    h1InFold: inFold(h1),
    ctaInFold: inFold(heroCta),
    productInFold: inFold(product),
    packshotPainted: Boolean(pack),
    heroGuarantee: Boolean(document.querySelector("[data-hero-guarantee]")),
    ctaCount: document.querySelectorAll("[data-cta-position]:not([data-cta-position='sticky'])").length,
    faqPresent: Boolean(document.querySelector(".ps-faq-band details, [data-trust-disclosure] details")),
    footerLinks: document.querySelectorAll(".ps-footer a").length,
    featureModules: document.querySelectorAll(".ps-feature-module").length,
  };
})()`;

async function openFrame(page: import("playwright").Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!response || response.status() >= 400) {
    throw new Error(`Frame HTTP ${response?.status() ?? "none"} for ${url}`);
  }
  await page.waitForSelector("article", { timeout: 30_000 });
  await page.addStyleTag({ content: hideChromeCss() });
  await waitImages(page);
  return response;
}

async function probeViewport(page: import("playwright").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.evaluate(`window.scrollTo(0, 0)`);
  await waitImages(page);
  return page.evaluate(PROBE_JS);
}

type FrameAudit = {
  anatomy: HeuristicAnatomy & { articleText: string; ctaLabels: string[] };
  metrics1440: VisualPresentationMetrics & SkillDomSignals;
  metrics768: VisualPresentationMetrics & SkillDomSignals;
  desktopFold: Awaited<ReturnType<typeof probeViewport>>;
  desktopFull: Awaited<ReturnType<typeof probeViewport>>;
  mobileFold: Awaited<ReturnType<typeof probeViewport>>;
  mobileFull: Awaited<ReturnType<typeof probeViewport>>;
  t768: Awaited<ReturnType<typeof probeViewport>>;
  stickyMid: { stickyOn: boolean; overlap: boolean };
  faqInteraction: string;
  ctaHref: string;
  publicStatus: number | null;
  screenshots?: Record<string, string>;
};

async function auditFrame(opts: { url: string; capture: boolean; publicSlug: string }): Promise<FrameAudit> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const shotDir = path.join(OUT, "screenshots");
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: frameHeaders(),
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    const baseUrl = visualQaBaseUrl();
    await openFrame(page, opts.url);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await waitImages(page);
    const metrics1440 = (await page.evaluate(METRICS_JS)) as VisualPresentationMetrics & SkillDomSignals;
    const desktopFold = await probeViewport(page, 1440, 1000);
    if (opts.capture) await captureShot(page, path.join(shotDir, "desktop-1440-above-fold.jpg"), false);
    const desktopFull = await probeViewport(page, 1440, 1000);
    if (opts.capture) await captureShot(page, path.join(shotDir, "desktop-1440-full.jpg"), true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileFold = await probeViewport(page, 390, 844);
    if (opts.capture) await captureShot(page, path.join(shotDir, "mobile-390-above-fold.jpg"), false);
    if (opts.capture) await captureShot(page, path.join(shotDir, "mobile-390-full.jpg"), true);
    const mobileFull = await probeViewport(page, 390, 844);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.evaluate(`window.scrollTo(0,0)`);
    await waitImages(page);
    const metrics768 = (await page.evaluate(METRICS_JS)) as VisualPresentationMetrics & SkillDomSignals;
    const t768 = await probeViewport(page, 768, 1024);
    if (opts.capture) await captureShot(page, path.join(shotDir, "tablet-768-full.jpg"), true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(`window.scrollTo(0, 420)`);
    await page.waitForTimeout(400);
    const stickyMid = (await page.evaluate(`(() => {
      const sticky = document.querySelector(".ps-sticky-cta");
      const stickyOn = sticky && sticky.getAttribute("data-sticky-visible") === "1";
      const stickyBox = sticky && stickyOn ? sticky.getBoundingClientRect() : null;
      let overlap = false;
      if (stickyBox) {
        overlap = [...document.querySelectorAll(".ps-h2, .ps-feature-module, .ps-body-lg")].some((node) => {
          const r = node.getBoundingClientRect();
          return r.width > 8 && r.height > 8 && r.bottom > stickyBox.top + 4 && r.top < stickyBox.bottom;
        });
      }
      return { stickyOn: Boolean(stickyOn), overlap };
    })()`)) as { stickyOn: boolean; overlap: boolean };

    const faq = page.locator("[data-trust-disclosure] details summary").first();
    let faqInteraction = "SKIP";
    if ((await faq.count()) > 0) {
      await faq.click({ timeout: 2000 }).catch(() => undefined);
      faqInteraction = (await page.locator("details[open]").count()) > 0 ? "PASS" : "FAIL";
    }

    const pub = await page.goto(`${baseUrl}/p/${opts.publicSlug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await openFrame(page, opts.url);
    const ctaHref =
      (await page.evaluate(`document.querySelector('[data-cta-position="hero"]')?.getAttribute("href") || ""`)) as string;
    const anatomy = (await page.evaluate(ANATOMY_JS)) as FrameAudit["anatomy"];

    return {
      anatomy,
      metrics1440,
      metrics768,
      desktopFold,
      desktopFull,
      mobileFold,
      mobileFull,
      t768,
      stickyMid,
      faqInteraction,
      ctaHref,
      publicStatus: pub?.status() ?? null,
      screenshots: opts.capture
        ? {
            DESKTOP_ABOVE_FOLD: path.join(shotDir, "desktop-1440-above-fold.jpg"),
            DESKTOP_FULL: path.join(shotDir, "desktop-1440-full.jpg"),
            MOBILE_ABOVE_FOLD: path.join(shotDir, "mobile-390-above-fold.jpg"),
            MOBILE_FULL: path.join(shotDir, "mobile-390-full.jpg"),
            TABLET_FULL: path.join(shotDir, "tablet-768-full.jpg"),
          }
        : undefined,
    };
  } finally {
    await browser.close();
  }
}

function qaFrom(audit: FrameAudit) {
  const overflow =
    audit.desktopFold.overflowX || audit.mobileFold.overflowX || audit.t768.overflowX || audit.desktopFull.overflowX || audit.mobileFull.overflowX;
  const clipping = audit.desktopFold.clipped > 0 || audit.mobileFold.clipped > 0 || audit.t768.clipped > 0;
  const overlap = audit.desktopFold.overlap > 0 || audit.mobileFold.overlap > 0 || audit.t768.overlap > 0;
  const broken = audit.desktopFold.broken > 0 || audit.mobileFold.broken > 0 || audit.t768.broken > 0;
  const sticky =
    audit.desktopFold.stickyOverlap ||
    audit.mobileFold.stickyOverlap ||
    audit.mobileFull.stickyOverlap ||
    audit.t768.stickyOverlap ||
    audit.stickyMid.overlap;
  const packshot = {
    "390": packshotState(audit.mobileFull),
    "768": packshotState(audit.t768),
    "1440": packshotState(audit.desktopFull),
  };
  return {
    "390": overflow || clipping || broken || audit.mobileFold.stickyOverlap ? "FAIL" : "PASS",
    "768": audit.t768.overflowX || audit.t768.clipped > 0 || audit.t768.broken > 0 ? "FAIL" : "PASS",
    "1440": audit.desktopFold.overflowX || audit.desktopFold.clipped > 0 || audit.desktopFold.broken > 0 ? "FAIL" : "PASS",
    OVERFLOW: overflow ? "YES" : "NO",
    CLIPPING: clipping ? "YES" : "NO",
    OVERLAP: overlap ? "YES" : "NO",
    BROKEN_ASSETS: broken ? "YES" : "NO",
    STICKY_CONTENT_OVERLAP: sticky ? "YES" : "NO",
    packshot,
    faqInteraction: audit.faqInteraction,
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
  const addedVsRun13 = composerAddedFactualCopy(baselineVisible, currentVisible);
  const removedVsRun13 = composerAddedFactualCopy(currentVisible, baselineVisible);

  const acceptedA = JSON.parse(fs.readFileSync(path.join(EXPERIMENT_A, "web-anatomy-after.json"), "utf8")) as {
    LAB_OVERLAY: {
      TOTAL: number;
      HERO: number;
      VALUE_PROPOSITION: number;
      COPYWRITING: number;
      TRUST: number;
      CONVERSION: number;
      DESIGN: number;
    };
  };

  writeJson("gates.json", {
    FIREWALL: firewall.status,
    GROUNDING: post.grounding.status,
    UNSUPPORTED: post.grounding.unsupportedClaims,
    POLICY: post.policy,
    FINAL_CONTENT_GATE: post.finalGate,
    ADDED_VS_RUN13: addedVsRun13,
    REMOVED_VS_RUN13: removedVsRun13,
    CONSUMER_VISIBLE_BYTE_EQUAL: currentVisible === baselineVisible,
  });

  const baseUrl = visualQaBaseUrl();
  const experimentAUrl = `${baseUrl}/visual-frame-lab/${SLUG}`;
  const experimentBUrl = `${baseUrl}/visual-frame-lab/${SLUG}?exp=b`;

  const auditA = await auditFrame({ url: experimentAUrl, capture: false, publicSlug: SLUG });
  const auditB = await auditFrame({ url: experimentBUrl, capture: true, publicSlug: SLUG });

  const heuristicA = scoreHeuristic(auditA.anatomy);
  const heuristicB = scoreHeuristic(auditB.anatomy);
  const overlayA = applyVisualPresentationBonuses(heuristicA, auditA.metrics1440);
  const overlayB = applyVisualPresentationBonuses(heuristicB, auditB.metrics1440);
  const skillA = scoreSkillPack(auditA.metrics1440);
  const skillB = scoreSkillPack(auditB.metrics1440);

  const addedDom = composerAddedFactualCopy(auditA.anatomy.articleText, auditB.anatomy.articleText);
  const removedDom = composerAddedFactualCopy(auditB.anatomy.articleText, auditA.anatomy.articleText);
  const ctaWordsChanged = JSON.stringify(auditA.anatomy.ctaLabels) !== JSON.stringify(auditB.anatomy.ctaLabels);

  const visual = await inspectRenderedPresell({
    slug: SLUG,
    baseUrl,
    url: experimentBUrl,
    artifactKey: "web-anatomy-lab-v1-experiment-b",
  });
  const findings = visual.captures.flatMap((capture) => analyzeLayoutSnapshot(capture.snapshot, "BUYER_GUIDE"));
  const gate = composeVisualQaGate({ findings, aiVisualReview: "UNAVAILABLE" });
  const qa = qaFrom(auditB);
  const visualPass =
    gate !== "FAIL" &&
    auditB.ctaHref === VALIDATION_SAFE_HREF &&
    auditB.publicStatus !== 200 &&
    qa.OVERFLOW === "NO" &&
    qa.CLIPPING === "NO" &&
    qa.OVERLAP === "NO" &&
    qa.BROKEN_ASSETS === "NO" &&
    qa.STICKY_CONTENT_OVERLAP === "NO" &&
    auditB.faqInteraction !== "FAIL" &&
    Object.values(qa.packshot).every((item) => item === "PASS");

  const after = overlayB.score;
  const accepted = acceptedA.LAB_OVERLAY;
  const deltaVsA = {
    OVERALL: after.TOTAL - accepted.TOTAL,
    HERO: after.HERO - accepted.HERO,
    VALUE_PROPOSITION: after.VALUE_PROPOSITION - accepted.VALUE_PROPOSITION,
    COPYWRITING: after.COPYWRITING - accepted.COPYWRITING,
    TRUST: after.TRUST - accepted.TRUST,
    CONVERSION: after.CONVERSION - accepted.CONVERSION,
    DESIGN: after.DESIGN - accepted.DESIGN,
  };
  const comparableDelta = {
    OVERALL: after.TOTAL - overlayA.score.TOTAL,
    HERO: after.HERO - overlayA.score.HERO,
    VALUE: after.VALUE_PROPOSITION - overlayA.score.VALUE_PROPOSITION,
    COPY: after.COPYWRITING - overlayA.score.COPYWRITING,
    TRUST: after.TRUST - overlayA.score.TRUST,
    CONVERSION: after.CONVERSION - overlayA.score.CONVERSION,
    DESIGN: after.DESIGN - overlayA.score.DESIGN,
  };

  const safetyPass =
    firewall.status === "PASS" &&
    post.grounding.status === "GROUNDED" &&
    post.grounding.unsupportedClaims.length === 0 &&
    post.policy === "READY" &&
    post.finalGate === "READY" &&
    addedVsRun13.length === 0 &&
    removedVsRun13.length === 0 &&
    addedDom.length === 0 &&
    removedDom.length === 0 &&
    !ctaWordsChanged;

  const report = {
    EXPERIMENT: "WA_CRO_DECISION_B",
    ISOLATION: {
      PREMIUM_ROUTE: "/visual-frame/[slug]",
      LAB_A: "/visual-frame-lab/[slug]",
      LAB_B: "/visual-frame-lab/[slug]?exp=b",
      PREMIUM_CSS_TOUCHED: false,
      EXPERIMENT_A_ARTIFACTS_TOUCHED: false,
    },
    CTA_CLASSIFICATION: {
      hero: "PRIMARY",
      final: "PRIMARY",
      sticky: "UTILITY",
      middle: "ABSENT",
      trust: "ABSENT",
    },
    CHANGES: [
      "First-screen decision: extra hero bottom space so Overview chrome leaves the fold",
      "Quieter hero geometry/orb; packshot aligned to the summary/CTA cluster on desktop",
      "Hero CTA slightly larger as the entry action",
      "Closing scene becomes a grouped decision panel (surface + tighter product/CTA)",
      "Final CTA slightly stronger as the endpoint",
      "FAQ/transparency start after more closing space",
      "Mobile packshot slightly smaller so the first CTA keeps air",
    ],
    NOT_CHANGED: [
      "ProductFacts",
      "generation",
      "authorized consumer copy",
      "CTA wording",
      "CTA count",
      "sticky show/hide rules",
      "Premium Visual System V1",
      "Experiment A screenshots",
    ],
    EXPERIMENT_A_ACCEPTED: accepted,
    EXPERIMENT_A_RESCORED_SAME_OVERLAY: overlayA,
    EXPERIMENT_B: {
      PRODUCTION_HEURISTIC: heuristicB,
      LAB_OVERLAY: overlayB,
      SKILL_PACK: categoryMapFromSkill(skillB),
      METRICS_1440: auditB.metrics1440,
      METRICS_768: auditB.metrics768,
      FOLD: {
        desktopOverviewInFold: auditB.desktopFold.overviewInFold,
        mobileOverviewInFold: auditB.mobileFold.overviewInFold,
        aDesktopOverviewInFold: auditA.desktopFold.overviewInFold,
      },
    },
    FACTUAL_DELTA: {
      ADDED_FACTUAL_STATEMENTS: addedVsRun13.length + addedDom.length,
      REMOVED_FACTUAL_STATEMENTS: removedVsRun13.length + removedDom.length,
      CHANGED_FACTUAL_MEANING: ctaWordsChanged ? 1 : 0,
      NEW_FACTUAL_CLAIMS: addedVsRun13.length + addedDom.length,
      CONSUMER_VISIBLE_BYTE_EQUAL: currentVisible === baselineVisible,
      DOM_TEXT_EQUAL: auditA.anatomy.articleText === auditB.anatomy.articleText,
      ADDED_UNITS: [...addedVsRun13, ...addedDom],
      REMOVED_UNITS: [...removedVsRun13, ...removedDom],
    },
    SAFETY: {
      COMPOSITION_FACT_FIREWALL: firewall.status,
      GROUNDING: post.grounding.status,
      UNSUPPORTED_CLAIMS: post.grounding.unsupportedClaims.length,
      POLICY: post.policy,
      FINAL_CONTENT_GATE: post.finalGate,
    },
    VISUAL_QA: qa,
    VISUAL_QA_GATE: gate,
    VISUAL_PASS: visualPass,
    WEB_ANATOMY_AFTER: after,
    DELTA_B_VS_A_ACCEPTED: deltaVsA,
    DELTA_B_VS_A_SAME_SCORER: comparableDelta,
    SKILL_PACK_DELTA: {
      OVERALL: (skillB.overall ?? 0) - (skillA.overall ?? 0),
      HERO: (skillB.categories.Hero ?? 0) - (skillA.categories.Hero ?? 0),
      VALUE: (skillB.categories["Value Proposition"] ?? 0) - (skillA.categories["Value Proposition"] ?? 0),
      COPY: (skillB.categories.Copywriting ?? 0) - (skillA.categories.Copywriting ?? 0),
      TRUST: (skillB.categories["Trust & Credibility"] ?? 0) - (skillA.categories["Trust & Credibility"] ?? 0),
      CONVERSION: (skillB.categories.Conversion ?? 0) - (skillA.categories.Conversion ?? 0),
      DESIGN: (skillB.categories["Design & UX"] ?? 0) - (skillA.categories["Design & UX"] ?? 0),
    },
    SCREENSHOTS: auditB.screenshots,
    SAFETY_PASS: safetyPass,
  };
  writeJson("REPORT.json", report);
  writeJson("web-anatomy-after.json", {
    PRODUCTION_HEURISTIC: heuristicB,
    LAB_OVERLAY: after,
    SKILL_PACK: categoryMapFromSkill(skillB),
    skillItems: skillB.items,
  });
  writeJson("visual-qa.json", { gate, qa, findings: findings.filter((item) => item.severity === "HIGH") });

  console.log(
    JSON.stringify(
      {
        A_ACCEPTED: accepted.TOTAL,
        A_RESCORED: overlayA.score.TOTAL,
        B: after.TOTAL,
        DELTA_VS_A: deltaVsA,
        COMPARABLE: comparableDelta,
        BONUSES_A: overlayA.bonuses,
        BONUSES_B: overlayB.bonuses,
        SAFETY_PASS: safetyPass,
        VISUAL_PASS: visualPass,
        FACTUAL: report.FACTUAL_DELTA,
        FOLD: report.EXPERIMENT_B.FOLD,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
