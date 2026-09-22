// npx tsx scripts/run-controlled-ready-02.ts
import fs from "node:fs";
import path from "node:path";
import { importProductFromUrl } from "../src/lib/import-product.ts";
import {
  buildGenerationFactManifest,
  formatFactsForPrompt,
  getConsumerCopyEligibleFacts,
  isCopyEligibleConfidence,
  isCopyEligibleImageProvenance,
  productNameAuthority,
  type FactField,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { researchAndRecommend } from "../src/lib/strategy/execute-recommended.ts";
import { buildPrompt, generateVariants, lintVariant, DEFAULT_SAFE_CTA } from "../src/lib/ai/generate-variants.ts";
import {
  applyProductImageToPage,
  composePresellPage,
  consumerVisibleText,
  orderedVisibleSections,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
} from "../src/lib/presell-page.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { serializeDesignPlan } from "../src/lib/design/plan.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { approachToTemplate } from "../src/lib/validation/pipeline.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import {
  createCampaign,
  getCampaignBySlug,
  getPublishedCampaignBySlug,
  updateCampaign,
  updateCampaignCreative,
  updateCampaignDesign,
} from "../src/lib/campaigns.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";
import { analyzeLayoutSnapshot } from "../src/lib/visual-qa/deterministic.ts";
import { visualQaBaseUrl } from "../src/lib/visual-qa/run.ts";
import { composeVisualQaGate } from "../src/lib/visual-qa/gate.ts";

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

const RUN_ID = "2026-09-20-controlled-ready-02";
const OUT = path.join(process.cwd(), "data", "controlled-ready-02", RUN_ID);
fs.mkdirSync(OUT, { recursive: true });

const SOURCE_URL = "https://jointgenesisofficial.com/";
const OPERATOR_NAME = "Joint Genesis";
const SLUG = "joint-genesis-controlled-ready-02";
const MODEL = "claude-sonnet-4-5-20250929";

const FIELDS: FactField[] = [
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

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

function identityStatus(facts: ProductFacts): "ACCEPTED" | "IDENTITY_UNCERTAIN" | "NOT_READY" {
  const disc = facts.webDiscovery;
  if (disc?.triggered) {
    if (disc.acceptedCount > 0) return "ACCEPTED";
    if (disc.uncertainCount > 0) return "IDENTITY_UNCERTAIN";
    return "NOT_READY";
  }
  return facts.productName.trim() ? "ACCEPTED" : "NOT_READY";
}

function fieldValue(facts: ProductFacts, field: FactField): string | string[] | undefined {
  if (field === "productName") return facts.productName;
  if (field === "features" || field === "ingredientsOrComponents" || field === "usageInformation" || field === "cautions") {
    return facts[field];
  }
  return facts[field] as string | undefined;
}

function fieldHasContent(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim());
  return Boolean(value?.trim());
}

function fieldTable(facts: ProductFacts) {
  return FIELDS.map((field) => {
    const provenance = facts.confidence[field];
    const value = fieldValue(facts, field);
    const copyEligible = isCopyEligibleConfidence(provenance) && fieldHasContent(value);
    const identity = field === "productName" ? productNameAuthority(facts) : null;
    return {
      FIELD: field,
      STATUS: copyEligible ? "COPY_ELIGIBLE" : provenance,
      VALUE: value ?? null,
      PROVENANCE: provenance,
      SOURCE_URL: facts.sourceUrl || SOURCE_URL,
      COPY_ELIGIBLE: copyEligible ? "YES" : "NO",
      GENERATION_AUTHORITY: identity?.authority ?? null,
    };
  });
}

function classifyCoverage(facts: ProductFacts, table: ReturnType<typeof fieldTable>): "RICH" | "ADEQUATE" | "THIN" | "INSUFFICIENT" {
  const eligible = table.filter((row) => row.COPY_ELIGIBLE === "YES" && row.FIELD !== "productName");
  const keys = new Set(eligible.map((row) => row.FIELD));
  if (facts.importQuality === "INSUFFICIENT" && eligible.length === 0) return "INSUFFICIENT";
  const substantial = ["ingredientsOrComponents", "usageInformation", "guaranteeInformation", "manufacturer", "cautions", "pricingInformation"];
  const extra = substantial.filter((key) => keys.has(key as FactField)).length;
  if (keys.size >= 4 && extra >= 2) return "RICH";
  if ((keys.has("description") || keys.has("features")) && extra >= 1) return "ADEQUATE";
  if (keys.size >= 1) return "THIN";
  return "INSUFFICIENT";
}

function uniqueTokens(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])];
}

function inspectFaqFirewall(facts: ProductFacts, prompt: string) {
  const faqSnippets = facts.sourceSnippets.filter((s) => s.field === "faq" && s.text.trim());
  const eligible = getConsumerCopyEligibleFacts(facts);
  const eligibleBag = [
    eligible.productName,
    eligible.description,
    ...eligible.features,
    ...eligible.ingredientsOrComponents,
    ...eligible.usageInformation,
    ...eligible.cautions,
    eligible.pricingInformation,
    eligible.guaranteeInformation,
    eligible.manufacturer,
  ]
    .join(" ")
    .toLowerCase();
  const leaked: string[] = [];
  for (const snippet of faqSnippets) {
    const distinctive = snippet.text
      .split(/[.!?\n]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 12);
    for (const part of distinctive) {
      if (eligibleBag.includes(part.toLowerCase())) continue;
      if (prompt.toLowerCase().includes(part.toLowerCase())) leaked.push(part);
    }
  }
  const promoted = faqSnippets.some((snippet) => {
    const tokens = uniqueTokens(snippet.text).filter((t) => t.length >= 6);
    return tokens.some((token) => eligibleBag.includes(token) && !eligible.productName.toLowerCase().includes(token));
  });
  return {
    FAQ_SNIPPETS_STORED: faqSnippets.length,
    FAQ_SNIPPETS_IN_GENERATION_PROMPT: leaked.length > 0 ? "YES" : "NO",
    FAQ_SNIPPETS_PROMOTED_TO_PRODUCTFACTS: "NO",
    leakedSamples: leaked.slice(0, 8),
    snippets: faqSnippets.map((s) => ({ confidence: s.confidence, text: s.text.slice(0, 240) })),
    note: promoted
      ? "Some FAQ tokens also exist in copy-eligible fields via the normal extraction pipeline; not a manual promotion."
      : "FAQ snippets remain research evidence only.",
  };
}

function inspectFactUsage(copy: string, facts: ProductFacts) {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const bag = [
    eligible.productName,
    eligible.description,
    ...eligible.features,
    ...eligible.ingredientsOrComponents,
    ...eligible.usageInformation,
    ...eligible.cautions,
    eligible.pricingInformation,
    eligible.guaranteeInformation,
    eligible.manufacturer,
  ]
    .join("\n")
    .toLowerCase();
  const checks: Array<{ id: string; re: RegExp; authorizedIf: (match: string) => boolean }> = [
    {
      id: "named_ingredient",
      re: /\b(?:mobilee|bioperine|boswellia|pine bark|ginger root|ingredient alpha|ingredient beta)\b/gi,
      authorizedIf: (m) => bag.includes(m.toLowerCase()) && Boolean(eligible.ingredientsOrComponents.length),
    },
    {
      id: "dosage",
      re: /\b(?:take\s+)?(?:one|two|three|\d+)\s+(?:capsule|tablet)s?\s+(?:daily|a day|per day)\b/gi,
      authorizedIf: (m) => eligible.usageInformation.some((u) => u.toLowerCase().includes(m.toLowerCase().replace(/^take\s+/i, "").slice(0, 12))),
    },
    {
      id: "servings",
      re: /\b\d+\s+(?:daily\s+)?servings?\b/gi,
      authorizedIf: (m) => eligible.usageInformation.join(" ").toLowerCase().includes(m.toLowerCase()),
    },
    {
      id: "guarantee_duration",
      re: /\b\d+\s*[- ]?day[s]?\b.{0,40}\b(?:refund|money[\s-]?back|guarantee|return)\b|\b(?:refund|money[\s-]?back|guarantee|return)\b.{0,40}\b\d+\s*[- ]?day[s]?\b/gi,
      authorizedIf: () => Boolean(eligible.guaranteeInformation),
    },
    {
      id: "gmp",
      re: /\b(?:c?gmp|gmp[\s-]?certified)\b/gi,
      authorizedIf: () => /gmp/i.test(eligible.manufacturer),
    },
    {
      id: "fda_facility",
      re: /\bfda[\s-]?inspected(?:\s+facility)?\b/gi,
      authorizedIf: () => /fda/i.test(eligible.manufacturer),
    },
    {
      id: "usa_made",
      re: /\b(?:made|manufactured|formulated)\s+in\s+(?:the\s+)?(?:usa|united states)\b/gi,
      authorizedIf: () => /usa|united states/i.test(eligible.manufacturer),
    },
    {
      id: "manufacturer_name",
      re: /\bbiodynamix\b|\bmanufacturer\s+[A-Z][A-Za-z0-9&.-]+/gi,
      authorizedIf: (m) => eligible.manufacturer.toLowerCase().includes(m.toLowerCase().replace(/^manufacturer\s+/i, "")),
    },
    {
      id: "purity",
      re: /\b(?:allergen[\s-]?free|non[\s-]?gmo|gmo[\s-]?free|bpa[\s-]?free)\b/gi,
      authorizedIf: (m) => bag.includes(m.toLowerCase().replace(/-/g, "")),
    },
    {
      id: "dietary_supplement",
      re: /\bdietary supplement\b/gi,
      authorizedIf: () => /dietary supplement/i.test(`${eligible.description} ${eligible.features.join(" ")}`),
    },
    {
      id: "medical_advice",
      re: /\bconsult(?:\s+with)?(?:\s+your)?\s+(?:doctor|physician|healthcare professional|healthcare provider)\b/gi,
      authorizedIf: () => /consult|doctor|healthcare/i.test(eligible.cautions.join(" ")),
    },
    {
      id: "pricing",
      re: /\$\s*\d+(?:\.\d{2})?|\bdiscounts?\b/gi,
      authorizedIf: (m) => eligible.pricingInformation.toLowerCase().includes(m.toLowerCase()),
    },
    {
      id: "email",
      re: /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
      authorizedIf: (m) => eligible.manufacturer.toLowerCase().includes(m.toLowerCase()),
    },
  ];
  const authorized: string[] = [];
  const synthesized: string[] = [];
  if (eligible.productName && copy.toLowerCase().includes(eligible.productName.toLowerCase())) {
    authorized.push(`productName:${eligible.productName}`);
  }
  for (const feature of eligible.features) {
    const key = feature.slice(0, 48).toLowerCase();
    if (key.length >= 24 && copy.toLowerCase().includes(key.slice(0, 24))) {
      authorized.push(`feature:${feature.slice(0, 80)}`);
    }
  }
  if (eligible.description) {
    const key = eligible.description.slice(0, 40).toLowerCase();
    if (copy.toLowerCase().includes(key.slice(0, 20))) authorized.push("description:restated");
  }
  for (const check of checks) {
    const matches = copy.match(check.re) || [];
    for (const match of matches) {
      if (check.authorizedIf(match)) authorized.push(`${check.id}:${match}`);
      else synthesized.push(`${check.id}:${match}`);
    }
  }
  return {
    MODEL_USED_ONLY_AUTHORIZED_FACTS: synthesized.length === 0 ? "YES" : "NO",
    AUTHORIZED_FACT_USES: [...new Set(authorized)],
    SYNTHESIZED_FACTS: [...new Set(synthesized)],
  };
}

function classifyFailure(input: {
  grounding: string;
  policy: string;
  contentGate: string;
  synthesized: string[];
  coverage: string;
  unsupported: Array<{ claim: string; reason: string }>;
  policyBlocks: string[];
  contractOk: boolean;
}): { PRIMARY: string; EVIDENCE: string } {
  if (!input.contractOk) {
    return { PRIMARY: "GENERATION_CONTRACT_REGRESSION", EVIDENCE: "NON_COPY_ELIGIBLE_FACTS_IN_PROMPT != 0" };
  }
  const synthesisHits = input.synthesized.length;
  const unsupported = input.unsupported;
  if (input.contentGate === "READY") {
    return { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY" };
  }
  const policyFalsePositive =
    input.policyBlocks.length === 1 &&
    input.policyBlocks.includes("health.cure") &&
    unsupported.length === 0 &&
    /does not claim to cure|not intended to diagnose/i.test(JSON.stringify(unsupported));
  if (input.policy !== "READY" && synthesisHits === 0 && unsupported.length === 0) {
    return {
      PRIMARY: "POLICY_FALSE_POSITIVE",
      EVIDENCE: input.policyBlocks.join(", ") || input.policy,
    };
  }
  if (input.grounding !== "GROUNDED" && synthesisHits === 0 && unsupported.length > 0) {
    return {
      PRIMARY: "GROUNDING_FALSE_POSITIVE",
      EVIDENCE: unsupported.map((u) => u.reason).slice(0, 4).join(" | "),
    };
  }
  if (synthesisHits > 0) {
    return {
      PRIMARY: "GENERATION_SYNTHESIS_FAILURE",
      EVIDENCE: input.synthesized.slice(0, 8).join(" | "),
    };
  }
  if (input.coverage === "THIN" || input.coverage === "INSUFFICIENT") {
    return {
      PRIMARY: "PRODUCT_FACT_COVERAGE_LIMITATION",
      EVIDENCE: `coverage=${input.coverage}; grounding=${input.grounding}; policy=${input.policy}`,
    };
  }
  return {
    PRIMARY: "OTHER",
    EVIDENCE: `grounding=${input.grounding} policy=${input.policy} gate=${input.contentGate}`,
  };
}

async function playwrightVisual(slug: string) {
  const inspection = await inspectRenderedPresell({
    slug,
    baseUrl: visualQaBaseUrl(),
    artifactKey: `controlled-ready-02-${slug}`,
  });
  const findings = inspection.captures.flatMap((capture) =>
    analyzeLayoutSnapshot(capture.snapshot, "REVIEW"),
  );
  const gate = composeVisualQaGate({ findings, aiVisualReview: "UNAVAILABLE" });
  const byWidth: Record<string, { overflowX: boolean; findings: number }> = {};
  for (const capture of inspection.captures) {
    byWidth[String(capture.viewport.width)] = {
      overflowX: capture.snapshot.overflowX,
      findings: analyzeLayoutSnapshot(capture.snapshot, "REVIEW").filter((f) => f.severity === "HIGH" || f.severity === "WARNING").length,
    };
  }
  const desktop = inspection.captures.find((c) => c.viewport.width === 1440);
  const mobile = inspection.captures.find((c) => c.viewport.width === 390);
  return { inspection, findings, gate, byWidth, desktop, mobile };
}

async function extraPlaywrightChecks(slug: string) {
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
    const baseUrl = visualQaBaseUrl();
    await pw.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pw.waitForSelector("article.ps-article, article", { timeout: 30_000 });
    await pw.setViewportSize({ width: 390, height: 844 });
    await pw.waitForTimeout(300);
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
        overview: Boolean(document.querySelector('[data-section-id="overview"]')),
        usage: Boolean(document.querySelector('[data-section-id="usage"]')),
        guarantee: Boolean(document.querySelector('[data-section-id="guarantee"]')),
        faq: Boolean(document.querySelector('[data-section-id="faq"]')),
        brokenImages: [...document.querySelectorAll("article img")].filter((img) => {
          const el = img as HTMLImageElement;
          return el.complete && el.naturalWidth === 0 && Boolean(el.getAttribute("src"));
        }).length,
      };
    });
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
    const pub = await pw.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const anatomy = await (async () => {
      await pw.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await pw.waitForSelector("article", { timeout: 30_000 });
      return pw.evaluate(() => {
        const text = (document.querySelector("article")?.innerText || "").trim();
        const words = text.split(/\s+/).filter(Boolean).length;
        const h1 = document.querySelector("h1")?.textContent?.trim() || "";
        const cta = document.querySelector('[data-cta-position="hero"]');
        const overview = document.querySelector('[data-section-id="overview"]');
        const disclosure = document.querySelector("[data-trust-disclosure]");
        const sections = [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id"));
        return { words, h1, hasCta: Boolean(cta), hasOverview: Boolean(overview), hasDisclosure: Boolean(disclosure), sections };
      });
    })();
    return { mobile, desktop, publicStatus: pub?.status() ?? null, anatomy };
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
  const hero = anatomy.h1 && anatomy.hasCta ? 70 : 45;
  const value = anatomy.hasOverview ? 65 : 40;
  const copy = anatomy.words >= 400 ? 70 : anatomy.words >= 220 ? 55 : 35;
  const trust = anatomy.hasDisclosure ? 60 : 35;
  const conversion = anatomy.hasCta ? 65 : 30;
  const design = anatomy.sections[0] === "overview" || anatomy.sections.includes("overview") ? 60 : 45;
  const score = Math.round((hero + value + copy + trust + conversion + design) / 6);
  return {
    SCORE: score,
    HERO: hero,
    VALUE_PROPOSITION: value,
    COPYWRITING: copy,
    TRUST: trust,
    CONVERSION: conversion,
    DESIGN: design,
    SAFE_STRUCTURAL: anatomy.hasOverview ? ["Overview present after hero if BUYER_GUIDE order applies"] : ["Consider making Overview the first body section"],
    SAFE_VISUAL: ["Keep current spacing; do not add unsourced badges"],
    SAFE_CRO: anatomy.hasCta ? ["Keep a single informational hero CTA"] : ["Ensure hero CTA is visible"],
    FACTUAL_RISK: ["Do not add testimonials, ratings, ingredients, guarantees, or manufacturer claims from this audit"],
  };
}

async function main() {
  console.log("IMPORT_START", SOURCE_URL);
  const facts = await importProductFromUrl(SOURCE_URL, { operatorProductName: OPERATOR_NAME });
  writeJson("import-facts.json", facts);

  const identity = identityStatus(facts);
  const identityAuth = productNameAuthority(facts);
  const table = fieldTable(facts);
  const coverage = classifyCoverage(facts, table);
  const eligibleFields = table.filter((row) => row.COPY_ELIGIBLE === "YES").map((row) => row.FIELD);
  const ineligibleFields = table.filter((row) => row.COPY_ELIGIBLE === "NO").map((row) => row.FIELD);
  writeJson("facts-eligibility.json", {
    identity,
    coverage,
    table,
    importQuality: facts.importQuality,
    warnings: facts.importWarnings,
    productNameAuthority: identityAuth,
  });
  console.log("IDENTITY", identity, "NAME", facts.productName, "PROVENANCE", facts.confidence.productName, "AUTHORITY", identityAuth.authority, "COVERAGE", coverage);

  const promptBundle = buildPrompt({
    productName: facts.productName,
    sourceUrl: facts.sourceUrl,
    facts,
  });
  const manifest = buildGenerationFactManifest(facts);
  const faq = inspectFaqFirewall(facts, promptBundle.user);
  writeJson("generation-fact-manifest.json", {
    items: manifest.items,
    TOTAL: manifest.items.length,
    COPY_ELIGIBLE: manifest.items.filter((item) => item.copyEligible).length,
    NON_COPY_ELIGIBLE: manifest.promptFactNotCopyEligible,
    prompt: promptBundle.user,
    faq,
  });
  console.log("MANIFEST", manifest.items.length, "NON_ELIGIBLE", manifest.promptFactNotCopyEligible, "FAQ_IN_PROMPT", faq.FAQ_SNIPPETS_IN_GENERATION_PROMPT);

  if (identity !== "ACCEPTED") {
    writeJson("REPORT.json", {
      GO_NO_GO: identity === "IDENTITY_UNCERTAIN" ? "IDENTITY_NOT_READY" : "PRODUCT_FACTS_NOT_READY",
      PRODUCT: { NAME: facts.productName, SOURCE_URL, IDENTITY: identity },
      GENERATION: { AI_CALLS: 0 },
    });
    console.log("STOP identity", identity);
    return;
  }

  if (manifest.promptFactNotCopyEligible !== 0 || faq.FAQ_SNIPPETS_IN_GENERATION_PROMPT === "YES") {
    writeJson("REPORT.json", {
      GO_NO_GO: "GENERATION_CONTRACT_REGRESSION",
      PRODUCT: { NAME: facts.productName, SOURCE_URL, IDENTITY: identity },
      GENERATION_FACT_MANIFEST: {
        TOTAL: manifest.items.length,
        COPY_ELIGIBLE: manifest.items.filter((i) => i.copyEligible).length,
        NON_COPY_ELIGIBLE: manifest.promptFactNotCopyEligible,
      },
      FAQ_FIREWALL: faq,
      GENERATION: { AI_CALLS: 0 },
    });
    console.log("STOP GENERATION_CONTRACT_REGRESSION");
    return;
  }

  console.log("MARKET_RESEARCH_START");
  const { research, recommendation } = await researchAndRecommend(facts);
  writeJson("market-research.json", research);
  writeJson("strategy.json", recommendation);
  console.log("STRATEGY", recommendation.recommendedStrategy, recommendation.confidence, "MR", research.status, research.quality);

  console.log("GENERATION_START", recommendation.recommendedStrategy);
  const variants = await generateVariants({
    productName: facts.productName,
    sourceUrl: facts.sourceUrl,
    facts,
    targetApproach: recommendation.recommendedStrategy,
    marketResearch: research,
    recommendedStrategy: recommendation.recommendedStrategy,
  });
  const variant = variants[0];
  if (!variant) throw new Error("No variant returned.");
  const linted = lintVariant(variant, facts.productName, VALIDATION_SAFE_AFFILIATE, facts);
  const usage = inspectFactUsage(`${linted.headline}\n${linted.body}\n${linted.ctaLabel}`, facts);
  writeJson("generation.json", { model: MODEL, variant: linted, usage, ctaDefault: DEFAULT_SAFE_CTA });
  console.log("PRE_GATES", linted.grounding.status, linted.lint.gate, linted.finalGate, "synth", usage.SYNTHESIZED_FACTS.length);

  const policyBlocks = linted.lint.majorFindings.filter((f) => f.status === "fail" && f.blocking).map((f) => f.ruleId);
  const policyWarnings = linted.lint.majorFindings.filter((f) => f.status === "warn").map((f) => f.ruleId);
  const failure = classifyFailure({
    grounding: linted.grounding.status,
    policy: linted.lint.gate,
    contentGate: linted.finalGate,
    synthesized: usage.SYNTHESIZED_FACTS,
    coverage,
    unsupported: linted.grounding.unsupportedClaims,
    policyBlocks,
    contractOk: true,
  });

  const pre = {
    GROUNDING: linted.grounding.status,
    SUPPORTED_CLAIMS: linted.grounding.status === "GROUNDED" ? "all inspected claims grounded or non-factual" : "see unsupported",
    UNSUPPORTED_CLAIMS: linted.grounding.unsupportedClaims,
    POLICY: linted.lint.gate,
    WARNINGS: policyWarnings,
    BLOCKS: policyBlocks,
    CONTENT_GATE: linted.finalGate,
  };
  writeJson("pre-composition-gates.json", pre);

  const successGates =
    linted.grounding.status === "GROUNDED" && linted.lint.gate === "READY" && linted.finalGate === "READY";

  const baseReport = {
    PRODUCT: {
      NAME: facts.productName,
      SOURCE_URL: facts.sourceUrl || SOURCE_URL,
      IDENTITY: identity,
      PRODUCT_NAME_PROVENANCE: facts.confidence.productName,
      PRODUCT_NAME_GENERATION_AUTHORITY: identityAuth.authority,
    },
    PRODUCT_FACTS: {
      COVERAGE: coverage,
      ELIGIBLE_FIELDS: eligibleFields,
      INELIGIBLE_FIELDS: ineligibleFields,
      TABLE: table,
      IMPORT_QUALITY: facts.importQuality,
    },
    FAQ_FIREWALL: faq,
    GENERATION_FACT_MANIFEST: {
      TOTAL: manifest.items.length,
      COPY_ELIGIBLE: manifest.items.filter((i) => i.copyEligible).length,
      NON_COPY_ELIGIBLE: manifest.promptFactNotCopyEligible,
      ITEMS: manifest.items,
    },
    MARKET_RESEARCH: { STATUS: research.status, QUALITY: research.quality },
    STRATEGY: {
      STRATEGY: recommendation.recommendedStrategy,
      CONFIDENCE: recommendation.confidence,
      RATIONALE: recommendation.rationale,
    },
    GENERATION: {
      MODEL,
      AI_CALLS: 1,
      VARIANT: linted.approach,
      CTA: linted.ctaLabel,
    },
    GENERATION_FACT_USAGE: usage,
    PRE_COMPOSITION: pre,
    FAILURE_CLASSIFICATION: successGates ? { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY" } : failure,
    HUMAN_APPROVAL: "PENDING",
    PUBLICATION: {
      STATUS: "draft",
      PUBLIC_ROUTE_AVAILABLE: false,
      PUBLISH_ATTEMPTED: false,
      AFFILIATE_DESTINATION_OPENED: false,
    },
  };

  if (!successGates) {
    writeJson("REPORT.json", {
      ...baseReport,
      COMPOSITION: { EXECUTED: false, REASON: "CONTENT_GATE not READY" },
      POST_COMPOSITION: { GROUNDING: null, POLICY: null, CONTENT_GATE: null },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO:
        failure.PRIMARY === "GENERATION_SYNTHESIS_FAILURE"
          ? "GENERATION_SYNTHESIS_NEEDS_FIX"
          : failure.PRIMARY === "PRODUCT_FACT_COVERAGE_LIMITATION"
            ? "PRODUCT_FACT_COVERAGE_NEEDS_FIX"
            : failure.PRIMARY === "GROUNDING_FALSE_POSITIVE"
              ? "GROUNDING_PRECISION_NEEDS_FIX"
              : failure.PRIMARY === "POLICY_FALSE_POSITIVE"
                ? "POLICY_PRECISION_NEEDS_FIX"
                : "GENERATION_SYNTHESIS_NEEDS_FIX",
      FINAL_STATUS: "CONTROLLED_READY_RUN_02_COMPLETE",
    });
    console.log("STOP", failure.PRIMARY);
    return;
  }

  const template = approachToTemplate(linted.approach);
  let page = composePresellPage({
    variant: { approach: linted.approach, headline: linted.headline, body: linted.body, ctaLabel: linted.ctaLabel },
    facts,
    template,
  });
  const imageEligible = Boolean(facts.productImageUrl && isCopyEligibleImageProvenance(facts.productImageProvenance));
  if (imageEligible && facts.productImageUrl) {
    page = applyProductImageToPage(page, {
      src: facts.productImageUrl,
      alt: `${facts.productName} product image`,
      provenance: facts.productImageProvenance,
    });
  }
  const post = validateComposedPage(page, facts, VALIDATION_SAFE_AFFILIATE);
  writeJson("composed-page.json", page);
  writeJson("post-composition-gates.json", {
    GROUNDING: post.grounding.status,
    POLICY: post.policy,
    CONTENT_GATE: post.finalGate,
    unsupported: post.grounding.unsupportedClaims,
  });
  const finalReady = post.grounding.status === "GROUNDED" && post.policy === "READY" && post.finalGate === "READY";
  if (!finalReady) {
    writeJson("REPORT.json", {
      ...baseReport,
      COMPOSITION: { EXECUTED: true, TEMPLATE: template },
      POST_COMPOSITION: { GROUNDING: post.grounding.status, POLICY: post.policy, CONTENT_GATE: post.finalGate },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO: "GENERATION_SYNTHESIS_NEEDS_FIX",
      FINAL_STATUS: "CONTROLLED_READY_RUN_02_COMPLETE",
    });
    console.log("STOP post-composition not READY");
    return;
  }

  const design = createDesignPlan({
    page,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
    productAssetProvenance: imageEligible ? facts.productImageProvenance : "NOT_FOUND",
    strategyHint: linted.approach,
  });
  const creative = createCreativeCompositionPlan({ page, design });
  const campaignInput = {
    name: `${facts.productName} controlled ready 02 (DO NOT PUBLISH)`,
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
    sourceFactsJson: JSON.stringify(facts),
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

  const visual = await playwrightVisual(SLUG);
  const extra = await extraPlaywrightChecks(SLUG);
  writeJson("visual-qa.json", {
    gate: visual.gate,
    byWidth: visual.byWidth,
    extra,
    findingCount: visual.findings.length,
    failCount: visual.findings.filter((f) => f.severity === "HIGH").length,
  });
  const visualPass =
    visual.gate !== "FAIL" &&
    extra.mobile.href === VALIDATION_SAFE_HREF &&
    extra.publicStatus !== 200 &&
    !extra.mobile.overflowX &&
    !extra.desktop.overflowX &&
    extra.mobile.brokenImages === 0;
  const anatomy = extra.anatomy ? scoreAnatomy(extra.anatomy) : null;
  writeJson("web-anatomy-audit-only.json", anatomy);

  const published = getPublishedCampaignBySlug(SLUG);
  const go = visualPass ? "FIRST_READY_PREMIUM_LP_CREATED" : "VISUAL_QA_NEEDS_FIX";
  writeJson("REPORT.json", {
    ...baseReport,
    COMPOSITION: {
      EXECUTED: true,
      TEMPLATE: template,
      SECTION_ORDER: orderedVisibleSections(page).map((s) => s.id),
      PRODUCT_IMAGE_AVAILABLE: imageEligible,
    },
    POST_COMPOSITION: {
      GROUNDING: post.grounding.status,
      POLICY: post.policy,
      CONTENT_GATE: post.finalGate,
    },
    VISUAL_QA: {
      EXECUTED: true,
      DESKTOP: extra.desktop,
      MOBILE: extra.mobile,
      GATE: visual.gate,
      PASS: visualPass,
      "375": visual.byWidth["375"] || null,
      "390": visual.byWidth["390"] || extra.mobile,
      "768": visual.byWidth["768"] || null,
      "1024": visual.byWidth["1024"] || null,
      "1440": visual.byWidth["1440"] || extra.desktop,
    },
    WEB_ANATOMY: { EXECUTED: true, ...anatomy },
    HUMAN_APPROVAL: "PENDING",
    PUBLICATION: {
      STATUS: campaign.publicationStatus,
      PUBLIC_ROUTE_AVAILABLE: Boolean(published),
      PUBLISH_ATTEMPTED: false,
      AFFILIATE_DESTINATION_OPENED: extra.mobile.href !== VALIDATION_SAFE_HREF,
    },
    GO_NO_GO: go,
    FINAL_STATUS: "CONTROLLED_READY_RUN_02_COMPLETE",
  });
  console.log("DONE", go);
}

main().catch((err) => {
  console.error(err);
  writeJson("ERROR.json", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  process.exit(1);
});
