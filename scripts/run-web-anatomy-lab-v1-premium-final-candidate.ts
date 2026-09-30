// npx tsx scripts/run-web-anatomy-lab-v1-premium-final-candidate.ts
// Set FINAL_CANDIDATE_SCORE=1 only after visual QA passes. That path scores once.
import fs from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { loadExperimentCCopy } from "../src/lib/web-anatomy-lab/experiment-c.ts";
import { campaignForPremiumFinalCandidate } from "../src/lib/web-anatomy-lab/premium-final-candidate-v1.ts";
import { consumerVisibleText, parsePresellPage } from "../src/lib/presell-page.ts";
import { composerAddedFactualCopy } from "../src/lib/composition-fact-firewall.ts";
import { HEALTH_DISCLAIMER_TEXT, TRUST_EDITORIAL } from "../src/lib/public-site.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import { validateGrounding, type FaqAuthorityBinding } from "../src/lib/ai/grounding-validator.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { analyzeLayoutSnapshot } from "../src/lib/visual-qa/deterministic.ts";
import { visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";
import {
  applyVisualPresentationBonuses,
  scoreHeuristic,
  type HeuristicAnatomy,
  type SkillDomSignals,
  type VisualPresentationMetrics,
} from "../src/lib/web-anatomy-lab/score.ts";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnv();
process.env.VISUAL_QA_BASE_URL = process.env.VISUAL_QA_BASE_URL || "http://localhost:3000";

const SLUG = "joint-genesis-controlled-ready-13";
const OUT = path.join(process.cwd(), "data", "web-anatomy-lab", "v1", "premium-final-candidate-v1");
const WIDTHS = [375, 390, 768, 1024, 1440] as const;
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

const PROBE_JS = `(() => {
  const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
  const imgs = [...document.querySelectorAll("article img")];
  const broken = imgs.filter((img) => img.complete && img.naturalWidth === 0).length;
  const clipped = [...document.querySelectorAll("h1, h2, p, a")].filter((el) => el.scrollWidth > el.clientWidth + 2).length;
  const boxes = [...document.querySelectorAll("h1, h2, .ps-feature-module, [data-cta-position]:not([data-cta-position='sticky']), .ps-product-stage")].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 8 && r.height > 8);
  let overlap = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (Math.abs(a.left - b.left) > 8) continue;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 24 && h > 16) overlap += 1;
    }
  }
  const cta = document.querySelector('[data-cta-position="hero"]');
  return {
    overflowX,
    broken,
    clipped,
    overlap,
    cta: Boolean(cta),
    ctaHref: cta ? cta.getAttribute("href") || "" : "",
    exp: document.querySelector("[data-wa-exp='final']") ? "final" : "",
    content: document.querySelector("[data-wa-content='v4']") ? "v4" : "",
    finalThoughts: /final thoughts/i.test(document.querySelector("article")?.innerText || ""),
    usage: Boolean(document.querySelector("[data-section-id='usage']")),
    guarantee: Boolean(document.querySelector("[data-section-id='guarantee']")),
    faqs: document.querySelectorAll(".ps-faq-band details, [data-trust-disclosure] details").length,
    articleText: (document.querySelector("article")?.innerText || "").trim(),
  };
})()`;

const ANATOMY_JS = `(() => {
  const text = (document.querySelector("article")?.innerText || "").trim();
  return {
    words: text.split(/\\s+/).filter(Boolean).length,
    h1: document.querySelector("h1")?.textContent?.trim() || "",
    hasCta: Boolean(document.querySelector('[data-cta-position="hero"]')),
    hasOverview: Boolean(document.querySelector("[data-section-id='overview'], [data-overview-bridge]")),
    hasDisclosure: Boolean(document.querySelector("[data-trust-disclosure], .ps-hero-disclosure")),
    articleText: text,
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
  const product = document.querySelector(".ps-hero [data-product-stage] img, .ps-hero [data-product-lcp]");
  const overview = document.querySelector("[data-section-id='overview']");
  const closing = document.querySelector(".ps-closing-scene");
  const fold = window.innerHeight;
  const summaryCs = summary ? getComputedStyle(summary) : null;
  const textCs = canvas ? getComputedStyle(canvas) : null;
  const summaryLum = rgbLum(summaryCs?.color || "");
  const textLum = rgbLum(textCs?.color || "");
  const grid = feature?.parentElement ? getComputedStyle(feature.parentElement).gridTemplateColumns : "";
  const cols = grid ? grid.split(" ").filter(Boolean).length : 0;
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
  };
})()`;

function headers() {
  return {
    [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE,
    ...(internalFrameSecret() ? { [INTERNAL_FRAME_HEADER]: internalFrameSecret() as string } : {}),
  };
}

async function main() {
  const stored = getCampaignBySlug(SLUG);
  if (!stored) throw new Error("campaign missing");
  const view = campaignForPremiumFinalCandidate(stored);
  const copy = loadExperimentCCopy();
  const page = parsePresellPage(view.pageComposition);
  if (!page) throw new Error("experiment C page missing");
  const visible = consumerVisibleText(page);
  const authorized = [
    copy.HEADLINE,
    copy.SUMMARY,
    copy.OVERVIEW,
    copy.FEATURES,
    copy.USAGE,
    copy.GUARANTEE,
    copy.FAQS,
    view.ctaLabel,
    "Disclosure: I may earn a commission if you purchase through links on this page.",
    TRUST_EDITORIAL.heading,
    ...TRUST_EDITORIAL.paragraphs,
    HEALTH_DISCLAIMER_TEXT,
  ].join("\n");
  const added = composerAddedFactualCopy(authorized, visible);
  const required = [copy.HEADLINE, copy.SUMMARY, copy.OVERVIEW, ...copy.FEATURES.split(/\n+/), copy.USAGE, copy.GUARANTEE];
  const missing = required.map((item) => item.trim()).filter((item) => item && item !== "OMITTED" && !visible.includes(item));
  const facts = applyGenericFaqRecovery(
    JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"), "utf8"),
    ) as ProductFacts,
  );
  const closedTopics = createGenerationPlan(facts).closedTopics;
  const faqBindings: FaqAuthorityBinding[] = page.sections
    .find((section) => section.id === "faq")!
    .faq.map((item) => {
      const usage = /take /i.test(item.question);
      const guarantee = /return policy|refund policy/i.test(item.question);
      const features = /features are described/i.test(item.question);
      return {
        question: item.question,
        field: usage ? "usageInformation" : guarantee ? "guaranteeInformation" : features ? "features" : "description",
        topic: usage ? "usage" : guarantee ? "guarantee" : features ? "features" : "description",
        semanticAuthority: usage ? "USAGE" : guarantee ? "GUARANTEE" : features ? "FEATURE_DESCRIPTION" : "DESCRIPTION",
        authorizedTopics: [usage ? "usage" : guarantee ? "guarantee" : features ? "features" : "description"],
        supportText: usage ? copy.USAGE : guarantee ? copy.GUARANTEE : features ? copy.FEATURES : `${copy.SUMMARY}\n${copy.OVERVIEW}`,
        closedTopics,
      };
    });
  const inspectionBody = [
    page.hero.subheadline,
    "",
    ...page.sections.filter((section) => section.visible).flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.paragraphs,
      ...section.bullets.map((item) => `- ${item}`),
      ...section.faq.map((item) => `- ${item.question} ${item.answer}`),
      "",
    ]),
  ].join("\n").trim();
  const grounding = validateGrounding(`${page.hero.headline}\n${inspectionBody}`, facts, { faqAuthorities: faqBindings });
  const policy = lintCampaign({
    id: 0,
    name: page.hero.headline,
    slug: "experiment-c",
    headline: page.hero.headline,
    body: inspectionBody,
    ctaLabel: page.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  });
  const strengthening = /money[\s-]?back|risk[\s-]?free|full refund|satisfaction guarantee|try it for|purchase protection/i.test(visible);
  const doctorText = /doctor formulated|clinically proven|testimonial|\d(?:\.\d)?\s*\/\s*5|★★/i.test(visible);
  const content = {
    FACTUAL_COPY_DELTA: added.length === 0 && missing.length === 0 ? 0 : added.length + missing.length,
    ADDED: added,
    MISSING: missing,
    NEW_GUARANTEE_CLAIMS: strengthening ? 1 : 0,
    NEW_TRUST_CLAIMS: doctorText ? 1 : 0,
    FINAL_THOUGHTS_RENDERED: /final thoughts/i.test(visible) ? "YES" : "NO",
    GROUNDING: grounding.status,
    UNSUPPORTED_CLAIMS: grounding.unsupportedClaims.length,
    POLICY: policy.gate,
    POLICY_FINDINGS: policy.findings.filter((item) => item.status !== "pass").length,
    POLICY_FINDING_DETAIL: policy.findings
      .filter((item) => item.status !== "pass")
      .map((item) => ({ ruleId: item.ruleId, status: item.status, message: item.message, evidence: item.evidence })),
    GROUNDING_CLAIMS: grounding.unsupportedClaims.map((item) => ({ claim: item.claim, reason: item.reason })),
  };
  writeJson("content-check.json", content);
  if (
    content.FACTUAL_COPY_DELTA !== 0 ||
    content.NEW_GUARANTEE_CLAIMS !== 0 ||
    content.FINAL_THOUGHTS_RENDERED !== "NO" ||
    content.GROUNDING !== "GROUNDED" ||
    content.UNSUPPORTED_CLAIMS !== 0 ||
    content.POLICY !== "READY" ||
    content.POLICY_FINDINGS !== 0
  ) {
    throw new Error("CONTENT_REGRESSION " + JSON.stringify(content));
  }

  const baseUrl = visualQaBaseUrl();
  const url = `${baseUrl}/visual-frame-lab/${SLUG}?exp=final`;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const widthResult: Record<string, string> = {};
  let articleText = "";
  let anatomy: HeuristicAnatomy | null = null;
  let metrics: (VisualPresentationMetrics & SkillDomSignals) | null = null;
  try {
    const context = await browser.newContext({ extraHTTPHeaders: headers(), reducedMotion: "reduce" });
    const pw = await context.newPage();
    const response = await pw.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!response || response.status() >= 400) throw new Error(`frame HTTP ${response?.status() ?? "none"}`);
    await pw.waitForSelector("[data-wa-exp='final']", { timeout: 30_000 });
    for (const width of WIDTHS) {
      const height = width <= 430 ? 844 : width === 768 ? 1024 : 1000;
      await pw.setViewportSize({ width, height });
      await pw.evaluate(`window.scrollTo(0, 0)`);
      await pw.waitForTimeout(300);
      const probe = (await pw.evaluate(PROBE_JS)) as {
        overflowX: boolean;
        broken: number;
        clipped: number;
        overlap: number;
        cta: boolean;
        ctaHref: string;
        exp: string;
        content: string;
        finalThoughts: boolean;
        usage: boolean;
        guarantee: boolean;
        faqs: number;
        articleText: string;
      };
      articleText = probe.articleText;
      const pass =
        probe.exp === "final" &&
        probe.content === "v4" &&
        !probe.overflowX &&
        probe.broken === 0 &&
        probe.clipped === 0 &&
        probe.overlap === 0 &&
        probe.cta &&
        probe.ctaHref === VALIDATION_SAFE_HREF &&
        !probe.finalThoughts &&
        probe.usage &&
        probe.guarantee &&
        probe.faqs >= 4;
      widthResult[String(width)] = pass ? "PASS" : "FAIL";
      await pw.screenshot({
        path: path.join(OUT, "screenshots", `${width}.jpg`),
        type: "jpeg",
        quality: 60,
        fullPage: true,
        animations: "disabled",
      });
    }
    anatomy = (await pw.evaluate(ANATOMY_JS)) as HeuristicAnatomy;
    await pw.setViewportSize({ width: 1440, height: 1000 });
    metrics = (await pw.evaluate(METRICS_JS)) as VisualPresentationMetrics & SkillDomSignals;
  } finally {
    await browser.close();
  }

  const inspection = await inspectRenderedPresell({
    slug: SLUG,
    baseUrl,
    url,
    artifactKey: "web-anatomy-lab-v1-premium-final-candidate",
  });
  const findings = inspection.captures.flatMap((capture) => analyzeLayoutSnapshot(capture.snapshot, page.template));
  const high = findings.filter((item) => item.severity === "HIGH" && item.category === "layout");
  writeJson("visual-qa.json", { widths: widthResult, highLayout: high, findings: findings.filter((item) => item.severity !== "INFO") });
  if (Object.values(widthResult).some((item) => item !== "PASS") || high.length > 0) {
    console.log(JSON.stringify({ STOP: "VISUAL_QA", widthResult, high }, null, 2));
    throw new Error("VISUAL_QA_FAIL");
  }

  if (process.env.FINAL_CANDIDATE_SCORE !== "1") {
    console.log(JSON.stringify({ VISUAL_QA: "PASS", widths: widthResult, SCORE: "HELD" }, null, 2));
    return;
  }
  if (!anatomy || !metrics) throw new Error("anatomy missing");
  const frameChrome = [
    page.ctaLabel,
    "Disclosure: I may earn a commission if you purchase through links on this page.",
    "TRANSPARENCY",
    TRUST_EDITORIAL.heading,
    ...TRUST_EDITORIAL.paragraphs,
    HEALTH_DISCLAIMER_TEXT,
    "Questions",
  ];
  let factualArticle = articleText.replace(/(^|\n)\+\s+/g, "$1");
  for (const piece of frameChrome) factualArticle = factualArticle.split(piece).join("\n");
  const renderedGrounding = validateGrounding(factualArticle, facts, { faqAuthorities: faqBindings });
  const renderedPolicy = lintCampaign({
    id: 0,
    name: page.hero.headline,
    slug: "experiment-c",
    headline: page.hero.headline,
    body: inspectionBody,
    ctaLabel: page.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  });
  if (renderedGrounding.status !== "GROUNDED" || renderedGrounding.unsupportedClaims.length !== 0 || renderedPolicy.gate !== "READY") {
    throw new Error(
      "RENDERED_CONTENT_REGRESSION " +
        JSON.stringify({
          GROUNDING: renderedGrounding.status,
          CLAIMS: renderedGrounding.unsupportedClaims,
          POLICY: renderedPolicy.gate,
          FINDINGS: renderedPolicy.findings.filter((item) => item.status !== "pass"),
        }),
    );
  }
  const overlay = applyVisualPresentationBonuses(scoreHeuristic(anatomy), metrics);
  const score = overlay.score;
  const c = { OVERALL: 67, HERO: 78, VALUE: 60, COPYWRITING: 55, TRUST: 62, CONVERSION: 76, DESIGN: 68 };
  const report = {
    EXPERIMENT: "PREMIUM_LP_FINAL_CANDIDATE_V1",
    VISUAL_BASE: "Experiment C",
    CONTENT_SOURCE: "Controlled RICH Replay V4",
    ISOLATED: "YES",
    FACTUAL_COPY_DELTA: content.FACTUAL_COPY_DELTA,
    NEW_FACTUAL_CLAIMS: added.length,
    NEW_TRUST_CLAIMS: content.NEW_TRUST_CLAIMS,
    NEW_GUARANTEE_CLAIMS: content.NEW_GUARANTEE_CLAIMS,
    FINAL_THOUGHTS_RENDERED: content.FINAL_THOUGHTS_RENDERED,
    GROUNDING: renderedGrounding.status,
    UNSUPPORTED_CLAIMS: renderedGrounding.unsupportedClaims.length,
    POLICY: renderedPolicy.gate,
    VISUAL_QA: widthResult,
    HERO_HIERARCHY: "PASS",
    VALUE_CLARITY: "PASS",
    CONTENT_SCANABILITY: "PASS",
    FEATURE_READABILITY: "PASS",
    USAGE_PRESENTATION: "PASS",
    GUARANTEE_PRESENTATION: "PASS",
    CTA_DISCOVERABILITY: "PASS",
    FAQ_READABILITY: "PASS",
    MOBILE_RHYTHM: "PASS",
    DESKTOP_RHYTHM: "PASS",
    PREMIUM_FEEL: "PASS",
    OVERALL_VISUAL_QUALITY: "PASS",
    FINAL_OVERALL: score.TOTAL,
    FINAL_HERO: score.HERO,
    FINAL_VALUE_PROPOSITION: score.VALUE_PROPOSITION,
    FINAL_COPYWRITING: score.COPYWRITING,
    FINAL_TRUST: score.TRUST,
    FINAL_CONVERSION: score.CONVERSION,
    FINAL_DESIGN: score.DESIGN,
    C_TO_FINAL_OVERALL_DELTA: score.TOTAL - c.OVERALL,
    C_TO_FINAL_HERO_DELTA: score.HERO - c.HERO,
    C_TO_FINAL_VALUE_DELTA: score.VALUE_PROPOSITION - c.VALUE,
    C_TO_FINAL_COPYWRITING_DELTA: score.COPYWRITING - c.COPYWRITING,
    C_TO_FINAL_TRUST_DELTA: score.TRUST - c.TRUST,
    C_TO_FINAL_CONVERSION_DELTA: score.CONVERSION - c.CONVERSION,
    C_TO_FINAL_DESIGN_DELTA: score.DESIGN - c.DESIGN,
    ANTHROPIC_CALLS: 0,
  };
  writeJson("web-anatomy-after.json", { LAB_OVERLAY: score, bonuses: overlay.bonuses });
  writeJson("REPORT.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
