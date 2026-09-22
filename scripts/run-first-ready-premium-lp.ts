// npx tsx scripts/run-first-ready-premium-lp.ts
import fs from "node:fs";
import path from "node:path";
import { importProductFromUrl } from "../src/lib/import-product.ts";
import {
  copyEligibleList,
  copyEligibleScalar,
  isCopyEligibleConfidence,
  isCopyEligibleImageProvenance,
  type FactConfidence,
  type FactField,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { researchAndRecommend } from "../src/lib/strategy/execute-recommended.ts";
import { generateVariants, lintVariant, DEFAULT_SAFE_CTA } from "../src/lib/ai/generate-variants.ts";
import {
  applyProductImageToPage,
  composePresellPage,
  consumerVisibleText,
  serializePresellPage,
  validateComposedPage,
} from "../src/lib/presell-page.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { serializeDesignPlan } from "../src/lib/design/plan.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { approachToTemplate } from "../src/lib/validation/pipeline.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { createCampaign, getCampaignBySlug, updateCampaign, updateCampaignCreative, updateCampaignDesign } from "../src/lib/campaigns.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { reconstructPageBody } from "../src/lib/presell-page.ts";

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

const RUN_ID = "2026-09-20-first-ready-premium-lp";
const OUT = path.join(process.cwd(), "data", "first-ready-premium-lp", RUN_ID);
fs.mkdirSync(OUT, { recursive: true });

const SOURCE_URL = "https://jointgenesisofficial.com/";
const OPERATOR_NAME = "Joint Genesis";
const SLUG = "joint-genesis-first-ready-premium";

const SCALAR_FIELDS: FactField[] = [
  "guaranteeInformation",
  "usageInformation",
  "pricingInformation",
  "manufacturer",
];

function snippetUrl(facts: ProductFacts, field: string): string {
  const hit = facts.sourceSnippets.find((s) => s.field === field && s.url);
  return hit?.url || facts.sourceUrl || SOURCE_URL;
}

function identityStatus(facts: ProductFacts): "ACCEPTED" | "IDENTITY_UNCERTAIN" | "NOT_READY" {
  const disc = facts.webDiscovery;
  if (!disc || !disc.triggered) {
    return facts.productName.trim() ? "ACCEPTED" : "NOT_READY";
  }
  if (disc.acceptedCount > 0) return "ACCEPTED";
  if (disc.uncertainCount > 0) return "IDENTITY_UNCERTAIN";
  return "NOT_READY";
}

function eligibleReport(facts: ProductFacts) {
  const fields: FactField[] = [
    "productName",
    "description",
    "features",
    "ingredientsOrComponents",
    "usageInformation",
    "cautions",
    "pricingInformation",
    "guaranteeInformation",
    "manufacturer",
  ];
  const eligible = [];
  const ineligible = [];
  for (const field of fields) {
    const provenance = facts.confidence[field];
    const copyEligible = isCopyEligibleConfidence(provenance);
    let value: string | string[] | undefined;
    if (field === "features" || field === "ingredientsOrComponents" || field === "usageInformation" || field === "cautions") {
      value = copyEligible ? copyEligibleList(facts[field], provenance) : facts[field];
    } else if (field === "productName") {
      value = facts.productName;
    } else {
      value = facts[field] as string | undefined;
    }
    const row = {
      FIELD: field,
      VALUE: value,
      PROVENANCE: provenance,
      SOURCE_URL: snippetUrl(facts, field),
      COPY_ELIGIBLE: copyEligible ? "YES" : "NO",
    };
    if (copyEligible && ((Array.isArray(value) && value.length) || (typeof value === "string" && value.trim()))) {
      eligible.push(row);
    } else {
      ineligible.push(row);
    }
  }
  return { eligible, ineligible };
}

function scalarConflicts(facts: ProductFacts): string[] {
  const warnings = (facts.importWarnings || []).filter((w) => /CONFLICT/i.test(w));
  const extra: string[] = [];
  const guaranteeSnips = facts.sourceSnippets.filter((s) => s.field === "guaranteeInformation" && isCopyEligibleConfidence(s.confidence));
  const days = [...new Set(guaranteeSnips.map((s) => s.text.match(/(\d+)\s*-?\s*days?/i)?.[1]).filter(Boolean))];
  if (days.length > 1) extra.push(`guarantee duration conflict: ${days.join(" vs ")}-day`);
  const usageSnips = facts.sourceSnippets.filter((s) => s.field === "usageInformation" && isCopyEligibleConfidence(s.confidence));
  const doses = [...new Set(usageSnips.map((s) => s.text.match(/\b(\d+|one|two)\s+(capsules?|tablets?|drops?)/i)?.[0]?.toLowerCase()).filter(Boolean))];
  if (doses.length > 1) extra.push(`dosage conflict: ${doses.join(" vs ")}`);
  const prices = [...new Set(facts.sourceSnippets.filter((s) => s.field === "pricingInformation" && isCopyEligibleConfidence(s.confidence)).map((s) => s.text))];
  if (prices.length > 1 && new Set(prices.map((p) => p.replace(/\s+/g, "").toLowerCase())).size > 1) {
    extra.push("pricing conflict across accepted sources");
  }
  const manufacturers = [...new Set(facts.sourceSnippets.filter((s) => s.field === "manufacturer" && isCopyEligibleConfidence(s.confidence)).map((s) => s.text.trim().toLowerCase()))];
  if (manufacturers.length > 1) extra.push(`manufacturer conflict: ${manufacturers.join(" vs ")}`);
  return [...warnings, ...extra];
}

function excludeConflicts(facts: ProductFacts, conflicts: string[]): ProductFacts {
  const next = structuredClone(facts);
  const dropGuarantee = conflicts.some((c) => /guarantee/i.test(c));
  const dropUsage = conflicts.some((c) => /dosage|usage/i.test(c));
  const dropPrice = conflicts.some((c) => /pricing/i.test(c));
  const dropMfr = conflicts.some((c) => /manufacturer/i.test(c));
  if (dropGuarantee) {
    next.guaranteeInformation = undefined;
    next.confidence.guaranteeInformation = "NOT_FOUND";
  }
  if (dropUsage) {
    next.usageInformation = [];
    next.confidence.usageInformation = "NOT_FOUND";
  }
  if (dropPrice) {
    next.pricingInformation = undefined;
    next.confidence.pricingInformation = "NOT_FOUND";
  }
  if (dropMfr) {
    next.manufacturer = undefined;
    next.confidence.manufacturer = "NOT_FOUND";
  }
  return next;
}

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

async function playwrightIfReady(slug: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const shots = path.join(OUT, "screenshots");
  fs.mkdirSync(shots, { recursive: true });
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
    const baseUrl = (process.env.PHASE1_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
    const url = `${baseUrl}/visual-frame/${slug}`;
    await pw.setViewportSize({ width: 390, height: 844 });
    const response = await pw.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!response || response.status() >= 400) throw new Error(`visual-frame HTTP ${response?.status() ?? "none"}`);
    await pw.waitForSelector("article.ps-article", { timeout: 30_000 });
    await pw.waitForTimeout(400);
    const mobile = await pw.evaluate(() => {
      const vh = window.innerHeight;
      const cta = document.querySelector('[data-cta-position="hero"]') as HTMLElement | null;
      const r = cta?.getBoundingClientRect();
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        ctaFullyVisible: Boolean(r && r.top >= 0 && r.bottom <= vh && r.height >= 40),
        href: cta?.getAttribute("href") || "",
        sectionOrder: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
        sticky: document.querySelector("[data-sticky-visible]")?.getAttribute("data-sticky-visible"),
      };
    });
    const mobileHero = path.join(shots, "mobile-hero.jpg");
    await pw.screenshot({ path: mobileHero, type: "jpeg", quality: 62 });
    await pw.evaluate(() => {
      const first = document.querySelector("[data-section-id]") as HTMLElement | null;
      window.scrollTo(0, Math.max(0, Math.round((first?.getBoundingClientRect().top || 0) + window.scrollY - 8)));
    });
    await pw.waitForTimeout(200);
    const mobileAfter = path.join(shots, "mobile-after-hero.jpg");
    await pw.screenshot({ path: mobileAfter, type: "jpeg", quality: 62 });
    await pw.setViewportSize({ width: 1440, height: 1000 });
    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(250);
    const desktop = await pw.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      ctaVisible: Boolean((() => {
        const r = (document.querySelector('[data-cta-position="hero"]') as HTMLElement | null)?.getBoundingClientRect();
        return r && r.top >= 0 && r.bottom <= 1000 && r.height >= 40;
      })()),
      sectionOrder: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
    }));
    const desktopHero = path.join(shots, "desktop-hero.jpg");
    await pw.screenshot({ path: desktopHero, type: "jpeg", quality: 62 });
    const desktopFull = path.join(shots, "desktop-full.jpg");
    await pw.screenshot({ path: desktopFull, fullPage: true, type: "jpeg", quality: 50 });
    await pw.evaluate(() => {
      const first = document.querySelector("[data-section-id]") as HTMLElement | null;
      window.scrollTo(0, Math.max(0, Math.round((first?.getBoundingClientRect().top || 0) + window.scrollY - 24)));
    });
    await pw.waitForTimeout(200);
    const desktopFirst = path.join(shots, "desktop-hero-editorial.jpg");
    await pw.screenshot({ path: desktopFirst, type: "jpeg", quality: 62 });
    await pw.setViewportSize({ width: 390, height: 844 });
    await pw.evaluate(() => window.scrollTo(0, 0));
    await pw.waitForTimeout(200);
    const mobileFull = path.join(shots, "mobile-full.jpg");
    await pw.screenshot({ path: mobileFull, fullPage: true, type: "jpeg", quality: 50 });
    await pw.evaluate(() => window.scrollTo(0, 900));
    await pw.waitForTimeout(400);
    const stickyOn = await pw.evaluate(() => document.querySelector("[data-sticky-visible]")?.getAttribute("data-sticky-visible"));
    const mobileSticky = path.join(shots, "mobile-sticky-on.jpg");
    await pw.screenshot({ path: mobileSticky, type: "jpeg", quality: 62 });
    const widths: Record<number, { overflowX: boolean; ctaHeight: number }> = {};
    for (const width of [375, 390, 768, 1024, 1440]) {
      await pw.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
      await pw.evaluate(() => window.scrollTo(0, 0));
      await pw.waitForTimeout(180);
      widths[width] = await pw.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        ctaHeight: Math.round((document.querySelector('[data-cta-position="hero"]') as HTMLElement | null)?.getBoundingClientRect().height || 0),
      }));
    }
    const pub = await pw.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return {
      mobile,
      desktop,
      stickyOn,
      widths,
      publicStatus: pub?.status() ?? null,
      hrefOk: mobile.href === VALIDATION_SAFE_HREF,
      screenshots: { desktopFull, desktopHero, desktopFirst, mobileFull, mobileHero, mobileAfter, mobileSticky },
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("IMPORT_START", SOURCE_URL);
  const facts = await importProductFromUrl(SOURCE_URL, { operatorProductName: OPERATOR_NAME });
  writeJson("import-facts.json", facts);
  const identity = identityStatus(facts);
  const eligibility = eligibleReport(facts);
  const conflicts = scalarConflicts(facts);
  writeJson("facts-eligibility.json", { identity, eligibility, conflicts, importQuality: facts.importQuality, warnings: facts.importWarnings });
  console.log("IDENTITY", identity, "QUALITY", facts.importQuality, "ACCEPTED_SOURCES", facts.webDiscovery?.acceptedCount ?? "primary");

  if (identity !== "ACCEPTED") {
    writeJson("REPORT.json", {
      GO_NO_GO: identity === "IDENTITY_UNCERTAIN" ? "IDENTITY_NOT_READY" : "PRODUCT_FACTS_NOT_READY",
      PRODUCT: { NAME: facts.productName, SOURCE_URL, IDENTITY: identity },
      PRODUCT_FACTS: eligibility,
      SCALAR_CONFLICTS: conflicts,
      GENERATION: { AI_CALLS: 0 },
      PRE_COMPOSITION: { GROUNDING: null, POLICY: null, CONTENT_GATE: null },
      COMPOSITION: { EXECUTED: false },
      HUMAN_APPROVAL: "PENDING",
      PUBLICATION: { STATUS: "draft", PUBLISH_ATTEMPTED: false },
    });
    console.log("STOP", identity);
    return;
  }

  const generationFacts = conflicts.length ? excludeConflicts(facts, conflicts) : facts;
  if (generationFacts !== facts) writeJson("generation-facts-excluded-conflicts.json", generationFacts);

  console.log("MARKET_RESEARCH_START");
  const { research, recommendation } = await researchAndRecommend(generationFacts);
  writeJson("market-research.json", research);
  writeJson("strategy.json", recommendation);
  console.log("STRATEGY", recommendation.recommendedStrategy, recommendation.confidence, "MR", research.quality);

  console.log("GENERATION_START", recommendation.recommendedStrategy);
  const variants = await generateVariants({
    productName: generationFacts.productName,
    sourceUrl: generationFacts.sourceUrl,
    facts: generationFacts,
    targetApproach: recommendation.recommendedStrategy,
    marketResearch: research,
    recommendedStrategy: recommendation.recommendedStrategy,
  });
  const variant = variants[0];
  if (!variant) throw new Error("No variant returned.");
  const linted = lintVariant(variant, generationFacts.productName, VALIDATION_SAFE_AFFILIATE, generationFacts);
  writeJson("generation.json", {
    model: "claude-sonnet-4-5-20250929",
    variant: linted,
    ctaDefault: DEFAULT_SAFE_CTA,
  });
  console.log("PRE_GATES", linted.grounding.status, linted.lint.gate, linted.finalGate, "unsupported", linted.grounding.unsupportedClaims.length);

  const pre = {
    GROUNDING: linted.grounding.status,
    POLICY: linted.lint.gate,
    CONTENT_GATE: linted.finalGate,
    UNSUPPORTED_CLAIMS: linted.grounding.unsupportedClaims,
  };
  writeJson("pre-composition-gates.json", pre);

  const successGates =
    linted.grounding.status === "GROUNDED" && linted.lint.gate === "READY" && linted.finalGate === "READY";

  if (!successGates) {
    writeJson("REPORT.json", {
      GO_NO_GO: "GENERATION_SAFETY_NEEDS_FIX",
      PRODUCT: { NAME: facts.productName, SOURCE_URL: facts.sourceUrl, IDENTITY: identity },
      PRODUCT_FACTS: eligibility,
      SCALAR_CONFLICTS: conflicts,
      MARKET_RESEARCH: { STATUS: research.status, QUALITY: research.quality },
      STRATEGY: { STRATEGY: recommendation.recommendedStrategy, CONFIDENCE: recommendation.confidence },
      GENERATION: { MODEL: "claude-sonnet-4-5-20250929", VARIANT: linted.approach, AI_CALLS: 1, CTA: linted.ctaLabel },
      PRE_COMPOSITION: pre,
      COMPOSITION: { EXECUTED: false, REASON: "CONTENT_GATE not READY" },
      HUMAN_APPROVAL: "PENDING",
      PUBLICATION: { STATUS: "draft", PUBLIC_ROUTE_AVAILABLE: false, PUBLISH_ATTEMPTED: false },
    });
    console.log("STOP GENERATION_SAFETY_NEEDS_FIX");
    return;
  }

  const template = approachToTemplate(linted.approach);
  let page = composePresellPage({
    variant: { approach: linted.approach, headline: linted.headline, body: linted.body, ctaLabel: linted.ctaLabel },
    facts: generationFacts,
    template,
  });
  const imageEligible = Boolean(generationFacts.productImageUrl && isCopyEligibleImageProvenance(generationFacts.productImageProvenance));
  if (imageEligible && generationFacts.productImageUrl) {
    page = applyProductImageToPage(page, {
      src: generationFacts.productImageUrl,
      alt: `${generationFacts.productName} product image`,
      provenance: generationFacts.productImageProvenance,
    });
  }
  const post = validateComposedPage(page, generationFacts, VALIDATION_SAFE_AFFILIATE);
  const visible = consumerVisibleText(page);
  writeJson("composed-page.json", page);
  writeJson("post-composition-gates.json", {
    GROUNDING: post.grounding.status,
    POLICY: post.policy,
    CONTENT_GATE: post.finalGate,
    unsupported: post.grounding.unsupportedClaims,
  });

  const finalReady =
    post.grounding.status === "GROUNDED" && post.policy === "READY" && post.finalGate === "READY";
  if (!finalReady) {
    writeJson("REPORT.json", {
      GO_NO_GO: "GENERATION_SAFETY_NEEDS_FIX",
      PRODUCT: { NAME: facts.productName, SOURCE_URL: facts.sourceUrl, IDENTITY: identity },
      PRE_COMPOSITION: pre,
      COMPOSITION: { EXECUTED: true, TEMPLATE: template },
      POST_COMPOSITION: { GROUNDING: post.grounding.status, POLICY: post.policy, CONTENT_GATE: post.finalGate },
      HUMAN_APPROVAL: "PENDING",
      PUBLICATION: { STATUS: "draft", PUBLISH_ATTEMPTED: false },
    });
    console.log("STOP post-composition not READY");
    return;
  }

  const design = createDesignPlan({
    page,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
    productAssetProvenance: imageEligible ? generationFacts.productImageProvenance : "NOT_FOUND",
    strategyHint: linted.approach,
  });
  const creative = createCreativeCompositionPlan({ page, design });
  const campaignInput = {
    name: `${generationFacts.productName} first ready premium (DO NOT PUBLISH)`,
    slug: SLUG,
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
    sourceFactsJson: JSON.stringify(generationFacts),
    designPlanJson: serializeDesignPlan(design),
    visualTheme: design.visualTheme,
    designVersion: design.version,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
  };
  const existing = getCampaignBySlug(SLUG);
  let campaign = existing ? updateCampaign(existing.id, campaignInput) : createCampaign(campaignInput);
  campaign = updateCampaignDesign(campaign.id, {
    designPlanJson: serializeDesignPlan(design),
    visualTheme: design.visualTheme,
    designVersion: design.version,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
  });
  campaign = updateCampaignCreative(campaign.id, {
    creativeCompositionJson: serializeCreativeCompositionPlan(creative),
    creativeCompositionVersion: creative.version,
  });

  const visual = await playwrightIfReady(SLUG);
  writeJson("visual-qa.json", visual);

  const report = {
    GO_NO_GO: "FIRST_READY_PREMIUM_LP_CREATED",
    PRODUCT: { NAME: facts.productName, SOURCE_URL: facts.sourceUrl, IDENTITY: identity },
    PRODUCT_FACTS: eligibility,
    SCALAR_CONFLICTS: conflicts,
    MARKET_RESEARCH: { STATUS: research.status, QUALITY: research.quality },
    STRATEGY: { STRATEGY: recommendation.recommendedStrategy, CONFIDENCE: recommendation.confidence },
    GENERATION: { MODEL: "claude-sonnet-4-5-20250929", VARIANT: linted.approach, AI_CALLS: 1, CTA: linted.ctaLabel },
    PRE_COMPOSITION: pre,
    COMPOSITION: {
      EXECUTED: true,
      TEMPLATE: template,
      SECTION_ORDER: creative.scenes.map((s) => s.sectionIds[0] || s.kind),
      PRODUCT_IMAGE_AVAILABLE: imageEligible,
    },
    POST_COMPOSITION: { GROUNDING: post.grounding.status, POLICY: post.policy, CONTENT_GATE: post.finalGate },
    FACT_SAFETY: {
      HEURISTIC_COPY_PRESENT: /HEURISTIC/i.test(visible),
      NOT_FOUND_COPY_PRESENT: /\bNOT_FOUND\b/.test(visible),
      AI_SOURCE_CLASSIFICATION_COPY_PRESENT: /AI_SOURCE_CLASSIFICATION/i.test(visible),
    },
    VISUAL_QA: visual,
    HUMAN_APPROVAL: "PENDING",
    PUBLICATION: {
      STATUS: campaign.publicationStatus,
      PUBLIC_ROUTE_AVAILABLE: false,
      PUBLISH_ATTEMPTED: false,
      AFFILIATE_DESTINATION_OPENED: false,
    },
  };
  writeJson("REPORT.json", report);
  console.log("DONE", report.GO_NO_GO);
}

main().catch((err) => {
  console.error(err);
  writeJson("ERROR.json", { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
  process.exit(1);
});
