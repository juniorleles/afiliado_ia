// npx tsx scripts/run-controlled-ready-05b.ts
import fs from "node:fs";
import path from "node:path";
import { importProductFromUrl } from "../src/lib/import-product.ts";
import {
  buildGenerationFactManifest,
  getConsumerCopyEligibleFacts,
  isCopyEligibleConfidence,
  isCopyEligibleImageProvenance,
  productNameAuthority,
  type FactField,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { researchAndRecommend } from "../src/lib/strategy/execute-recommended.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";
import {
  createGenerationPlan,
  GENERATION_TOPICS,
  hasUsageAuthorityLanguage,
  isCanonicalGenerationTopic,
  isKnowledgeExpansion,
  validateGenerationPlan,
  type GenerationPlan,
} from "../src/lib/ai/generation-plan.ts";
import {
  coerceStructuredPage,
  evaluateStructuredPage,
  parseStructuredVariants,
  structuredVariantsSchema,
  type StructuredGenerationPage,
} from "../src/lib/ai/structured-generation.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import {
  classifyIngredientLanguage,
  namedIngredientMentions,
} from "../src/lib/ai/ingredient-claims.ts";
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

const RUN_ID = "2026-09-20-controlled-ready-05b";
const OUT = path.join(process.cwd(), "data", "controlled-ready-05b", RUN_ID);
fs.mkdirSync(OUT, { recursive: true });

const SOURCE_URL = "https://jointgenesisofficial.com/";
const OPERATOR_NAME = "Joint Genesis";
const SLUG = "joint-genesis-controlled-ready-05b";
const MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const BLOCK_FIELD_COMPAT: Record<string, string[]> = {
  HERO: ["productName", "description", "features"],
  OVERVIEW: ["productName", "description", "features"],
  FEATURES: ["productName", "features", "description"],
  INGREDIENTS: ["ingredientsOrComponents"],
  USAGE: ["usageInformation"],
  CAUTIONS: ["cautions"],
  PRICING: ["pricingInformation"],
  GUARANTEE: ["guaranteeInformation"],
  MANUFACTURER: ["manufacturer"],
  FINAL_THOUGHTS: ["productName", "description", "features"],
  FAQ: ["open-topic evidence only"],
};

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
      VALUE: value ?? null,
      PROVENANCE: provenance,
      COPY_ELIGIBLE: copyEligible ? "YES" : "NO",
      GENERATION_AUTHORITY: identity?.authority ?? null,
    };
  });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function inspectPromptFirewall(facts: ProductFacts, prompt: string) {
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
    .join("\n")
    .toLowerCase();
  const promptLower = prompt.toLowerCase();
  const leaked: string[] = [];
  for (const snippet of faqSnippets) {
    for (const part of snippet.text.split(/[.!?\n]/).map((item) => item.trim()).filter((item) => item.length >= 12)) {
      if (eligibleBag.includes(part.toLowerCase())) continue;
      if (promptLower.includes(part.toLowerCase())) leaked.push(part);
    }
  }
  const rawLeaks: string[] = [];
  for (const snippet of facts.sourceSnippets) {
    const text = snippet.text.trim();
    if (text.length < 24 || eligibleBag.includes(text.toLowerCase().slice(0, 40))) continue;
    if (promptLower.includes(text.toLowerCase().slice(0, 40))) rawLeaks.push(text.slice(0, 80));
  }
  const serpLeaks: string[] = [];
  for (const source of facts.webDiscovery?.sources || []) {
    const title = (source.title || "").trim();
    if (title.length < 18 || eligibleBag.includes(title.toLowerCase())) continue;
    if (promptLower.includes(title.toLowerCase())) serpLeaks.push(title);
  }
  const heuristicLeaks: string[] = [];
  const notFoundLeaks: string[] = [];
  for (const field of FIELDS) {
    const value = fieldValue(facts, field);
    const parts = Array.isArray(value) ? value : value ? [value] : [];
    for (const part of parts) {
      const slice = part.trim();
      if (slice.length < 16) continue;
      if (facts.confidence[field] === "HEURISTIC_EXTRACTION" && !eligibleBag.includes(slice.toLowerCase().slice(0, 24)) && promptLower.includes(slice.toLowerCase().slice(0, 24))) {
        heuristicLeaks.push(`${field}:${slice.slice(0, 80)}`);
      }
      if (facts.confidence[field] === "NOT_FOUND" && promptLower.includes(slice.toLowerCase().slice(0, 24))) {
        notFoundLeaks.push(`${field}:${slice.slice(0, 80)}`);
      }
    }
  }
  return {
    FAQ_SNIPPETS: leaked.length > 0 ? "YES" : "NO",
    RAW_SOURCE_SNIPPETS: rawLeaks.length > 0 ? "YES" : "NO",
    SERP_TITLES: serpLeaks.length > 0 ? "YES" : "NO",
    HEURISTIC_FACTS: heuristicLeaks.length > 0 ? "YES" : "NO",
    NOT_FOUND_FACTS: notFoundLeaks.length > 0 ? "YES" : "NO",
    leaked,
    rawLeaks: rawLeaks.slice(0, 6),
    serpLeaks: serpLeaks.slice(0, 6),
    heuristicLeaks: heuristicLeaks.slice(0, 6),
    notFoundLeaks: notFoundLeaks.slice(0, 6),
  };
}

async function oneShotStructured(
  system: string,
  user: string,
  schema: unknown,
): Promise<{
  requestSent: boolean;
  httpStatus: number | null;
  providerError: string | null;
  raw: string | null;
  jsonValid: boolean;
  page: StructuredGenerationPage | null;
  parseError: string | null;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16384,
      system,
      messages: [{ role: "user", content: user }],
      output_config: {
        format: {
          type: "json_schema",
          schema,
        },
      },
    }),
  });
  const httpStatus = response.status;
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return {
      requestSent: true,
      httpStatus,
      providerError: errorBody.slice(0, 500) || `HTTP ${httpStatus}`,
      raw: null,
      jsonValid: false,
      page: null,
      parseError: null,
    };
  }
  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) {
    return {
      requestSent: true,
      httpStatus,
      providerError: "Anthropic response had no text block",
      raw: null,
      jsonValid: false,
      page: null,
      parseError: null,
    };
  }
  const raw = textBlock.text;
  try {
    const pages = parseStructuredVariants(raw, 1);
    return {
      requestSent: true,
      httpStatus,
      providerError: null,
      raw,
      jsonValid: true,
      page: pages[0] || coerceStructuredPage(JSON.parse(raw)),
      parseError: null,
    };
  } catch (err) {
    return {
      requestSent: true,
      httpStatus,
      providerError: null,
      raw,
      jsonValid: false,
      page: coerceStructuredPage(raw),
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

function consumerCopyFromPage(page: StructuredGenerationPage): string {
  const faq = page.blocks
    .flatMap((block) => block.items || [])
    .map((item) => `${item.question} ${item.answer}`)
    .join("\n");
  return [
    page.headline.text,
    page.summary.text,
    ...page.blocks.map((block) => block.content),
    faq,
    page.cta.label,
  ].join("\n");
}

function absenceHits(copy: string): string[] {
  const cue =
    /\b(?:not (?:disclosed|provided|available|listed|included|specified|confirmed)|unavailable|unknown|unclear|no information about|details are absent|is missing|are missing|are absent)\b/i;
  return copy
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item && cue.test(item) && /\b(?:ingredient|manufacturer|facility|pric|cost|dosage|serving|usage|caution|allergen|guarantee|refund)\b/i.test(item));
}

function closedTopicAudit(copy: string, plan: GenerationPlan) {
  const hits = validateGenerationPlan(copy, plan).violations;
  const byTopic = new Map<string, string[]>();
  for (const hit of hits) {
    const list = byTopic.get(hit.topic) || [];
    list.push(hit.text);
    byTopic.set(hit.topic, list);
  }
  const out: Record<string, { OPEN_OR_CLOSED: string; PRESENT_IN_COPY: string; AUTHORIZED: string; SAMPLES: string[] }> = {};
  for (const topic of plan.closedTopics) {
    const samples = byTopic.get(topic) || [];
    out[topic.toUpperCase()] = {
      OPEN_OR_CLOSED: "CLOSED",
      PRESENT_IN_COPY: samples.length > 0 ? "YES" : "NO",
      AUTHORIZED: "NO",
      SAMPLES: samples.slice(0, 4),
    };
  }
  return { PLAN_VIOLATIONS: hits, BY_CLOSED_TOPIC: out };
}

function ingredientAudit(copy: string, facts: ProductFacts, plan: GenerationPlan) {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const support = [eligible.description, ...eligible.features].join("\n").toLowerCase();
  const sentences = copy
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item && /\bingredients?\b/i.test(item));
  const occurrences = sentences.map((text) => {
    const claimClass = classifyIngredientLanguage(text);
    const named = namedIngredientMentions(text);
    const extra =
      /\b(?:synerg(?:y|istic(?:ally)?)|work(?:s|ing)? together|reduce inflammation|improves? mobility)\b/i.test(text) &&
      !/\b(?:synerg|work(?:s|ing)? together|reduce inflammation|improves? mobility)\b/i.test(support);
    const restatement =
      claimClass === "GENERIC_INGREDIENT_RESTATEMENT" &&
      !extra &&
      (/\bfive targeted ingredients\b/i.test(text)
        ? /\bfive targeted ingredients\b/i.test(support)
        : /\bingredients?\b/i.test(support));
    return {
      TEXT: text,
      CLAIM_CLASS: claimClass,
      NAMED_SPANS: named,
      SUPPORTED_RESTATEMENT: restatement ? "YES" : "NO",
      UNSUPPORTED_SEMANTIC_EXPANSION: extra ? "YES" : "NO",
    };
  });
  return {
    GENERIC_REFERENCES: occurrences.filter((item) => item.CLAIM_CLASS === "GENERIC_INGREDIENT_RESTATEMENT"),
    NAMED_INGREDIENT_CLAIMS: namedIngredientMentions(copy),
    OCCURRENCES: occurrences,
    UNSUPPORTED_SEMANTIC_EXPANSIONS: occurrences.filter((item) => item.UNSUPPORTED_SEMANTIC_EXPANSION === "YES").map((item) => item.TEXT),
    PLAN_INGREDIENTS_HITS: validateGenerationPlan(copy, plan).violations.filter((item) => item.topic === "ingredients"),
  };
}

function guaranteeAudit(copy: string) {
  const has180 = /\b180[\s-]?day\b/i.test(copy);
  const promo = /\b180[\s-]?day\b.{0,40}\b(?:refund|money[\s-]?back|guarantee|return policy)\b|\b(?:refund|money[\s-]?back|guarantee|return policy)\b.{0,40}\b180[\s-]?day\b/i.test(
    copy,
  );
  return {
    DESCRIPTION_RESTATEMENT: has180 && !promo ? "YES" : has180 ? "AMBIGUOUS" : "NO",
    GUARANTEE_PROMOTION: promo ? "YES" : "NO",
    SAMPLES: copy
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter((item) => /\b180[\s-]?day\b/i.test(item)),
  };
}

function faqContract(page: StructuredGenerationPage, plan: GenerationPlan, violations: Array<{ code: string; text: string; reason: string }>) {
  const items = page.blocks.flatMap((block) => (block.type === "FAQ" ? block.items || [] : []));
  return {
    CANONICAL_TOPICS: [...GENERATION_TOPICS],
    RUNTIME_ALLOWED_TOPICS: plan.allowedTopics,
    FREE_TEXT_ALLOWED: "NO",
    ZERO_FAQ_VALID: "YES",
    FAQ_COUNT: items.length,
    ITEMS: items.map((item) => ({
      TOPIC: item.topic,
      QUESTION: item.question,
      QUESTION_WORDS: countWords(item.question),
      ANSWER: item.answer,
      ANSWER_WORDS: countWords(item.answer),
      EVIDENCE_IDS: item.evidenceIds,
      CANONICAL: isCanonicalGenerationTopic(item.topic) ? "YES" : "NO",
      RUNTIME_OPEN: plan.allowedTopics.includes(item.topic as (typeof plan.allowedTopics)[number]) ? "YES" : "NO",
    })),
    INVALID_FAQ_TOPICS: violations.filter((item) => item.code === "INVALID_FAQ_TOPIC").length,
    FAQ_EVIDENCE_VIOLATIONS: violations.filter((item) =>
      ["UNKNOWN_EVIDENCE", "INELIGIBLE_EVIDENCE", "INCOMPATIBLE_EVIDENCE"].includes(item.code) && /FAQ/i.test(item.text + item.reason),
    ).length,
    FAQ_WORD_BUDGET_VIOLATIONS: violations.filter((item) => item.code === "WORD_BUDGET" && /FAQ/i.test(item.reason)).length,
    FAQ_SEMANTIC_VIOLATIONS: violations.filter((item) => item.code === "INCOMPATIBLE_FAQ_TOPIC" || (item.code === "CLOSED_TOPIC" && /FAQ/i.test(item.text + item.reason))).length,
  };
}

function classifyFailure(input: {
  jsonValid: boolean;
  structuralFail: boolean;
  unknownBlocks: number;
  unknownEvidence: number;
  incompatible: number;
  closedTopic: number;
  invalidFaqTopics: number;
  faqWordBudget: number;
  faqSemantic: number;
  absence: number;
  usagePromotion: boolean;
  knowledge: boolean;
  namedIngredients: number;
  grounding: string;
  policy: string;
  gate: string;
  coverage: string;
}): { PRIMARY: string; EVIDENCE: string; GO: string } {
  if (!input.jsonValid) {
    return { PRIMARY: "STRUCTURED_MODEL_COMPLIANCE_FAILURE", EVIDENCE: "JSON_VALID=NO", GO: "STRUCTURED_MODEL_COMPLIANCE_NEEDS_FIX" };
  }
  if (input.invalidFaqTopics > 0 || input.faqWordBudget > 0 || input.faqSemantic > 0) {
    return {
      PRIMARY: "FAQ_CONTRACT_FAILURE",
      EVIDENCE: `invalidTopics=${input.invalidFaqTopics} faqWordBudget=${input.faqWordBudget} faqSemantic=${input.faqSemantic}`,
      GO: "FAQ_CONTRACT_NEEDS_FIX",
    };
  }
  if (input.unknownBlocks || input.unknownEvidence || input.incompatible || input.structuralFail) {
    return {
      PRIMARY: input.unknownEvidence || input.incompatible ? "EVIDENCE_SCOPE_FAILURE" : "STRUCTURED_MODEL_COMPLIANCE_FAILURE",
      EVIDENCE: `unknownBlocks=${input.unknownBlocks} unknownEvidence=${input.unknownEvidence} incompatible=${input.incompatible} closed=${input.closedTopic}`,
      GO: input.unknownEvidence || input.incompatible ? "EVIDENCE_SCOPE_NEEDS_FIX" : "STRUCTURED_MODEL_COMPLIANCE_NEEDS_FIX",
    };
  }
  if (input.namedIngredients > 0 || input.knowledge || input.usagePromotion || input.absence > 0 || input.closedTopic > 0) {
    return {
      PRIMARY: input.namedIngredients > 0 ? "GENERATION_SYNTHESIS_FAILURE" : "GENERATION_SYNTHESIS_FAILURE",
      EVIDENCE: `namedIngredients=${input.namedIngredients} knowledge=${input.knowledge} usagePromotion=${input.usagePromotion} absence=${input.absence} closed=${input.closedTopic}`,
      GO: "GENERATION_SYNTHESIS_NEEDS_FIX",
    };
  }
  if (input.grounding !== "GROUNDED") {
    return { PRIMARY: "GROUNDING_PRECISION_FAILURE", EVIDENCE: `GROUNDING=${input.grounding}`, GO: "GROUNDING_PRECISION_NEEDS_FIX" };
  }
  if (input.policy !== "READY") {
    return { PRIMARY: "POLICY_PRECISION_FAILURE", EVIDENCE: `POLICY=${input.policy}`, GO: "POLICY_PRECISION_NEEDS_FIX" };
  }
  if (input.gate !== "READY") {
    return {
      PRIMARY: input.coverage === "THIN" || input.coverage === "INSUFFICIENT" ? "PRODUCT_FACT_COVERAGE_LIMITATION" : "OTHER",
      EVIDENCE: `gate=${input.gate} coverage=${input.coverage}`,
      GO: input.coverage === "THIN" || input.coverage === "INSUFFICIENT" ? "PRODUCT_FACT_COVERAGE_NEEDS_FIX" : "REGRESSION_DETECTED",
    };
  }
  return { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY", GO: "CONTENT_READY_VISUAL_PENDING" };
}

async function playwrightVisual(slug: string) {
  const inspection = await inspectRenderedPresell({
    slug,
    baseUrl: visualQaBaseUrl(),
    artifactKey: `controlled-ready-05b-${slug}`,
  });
  const findings = inspection.captures.flatMap((capture) => analyzeLayoutSnapshot(capture.snapshot, "REVIEW"));
  const gate = composeVisualQaGate({ findings, aiVisualReview: "UNAVAILABLE" });
  const byWidth: Record<string, { overflowX: boolean; findings: number }> = {};
  for (const capture of inspection.captures) {
    byWidth[String(capture.viewport.width)] = {
      overflowX: capture.snapshot.overflowX,
      findings: analyzeLayoutSnapshot(capture.snapshot, "REVIEW").filter((f) => f.severity === "HIGH" || f.severity === "WARNING").length,
    };
  }
  return { inspection, findings, gate, byWidth };
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
        emptySections: [...document.querySelectorAll("[data-section-id]")].filter((n) => !((n as HTMLElement).innerText || "").trim()).map((n) => n.getAttribute("data-section-id")),
        brokenImages: [...document.querySelectorAll("article img")].filter((img) => {
          const el = img as HTMLImageElement;
          return el.complete && el.naturalWidth === 0 && Boolean(el.getAttribute("src"));
        }).length,
        sectionOrder: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
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
    }));
    const pub = await pw.goto(`${baseUrl}/p/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pw.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pw.waitForSelector("article", { timeout: 30_000 });
    const anatomy = await pw.evaluate(() => {
      const text = (document.querySelector("article")?.innerText || "").trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      const h1 = document.querySelector("h1")?.textContent?.trim() || "";
      return {
        words,
        h1,
        hasCta: Boolean(document.querySelector('[data-cta-position="hero"]')),
        hasOverview: Boolean(document.querySelector('[data-section-id="overview"]')),
        hasDisclosure: Boolean(document.querySelector("[data-trust-disclosure]")),
        sections: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
      };
    });
    return { mobile, desktop, publicStatus: pub?.status() ?? null, anatomy };
  } finally {
    await browser.close();
  }
}

function scoreAnatomy(anatomy: { words: number; h1: string; hasCta: boolean; hasOverview: boolean; hasDisclosure: boolean; sections: Array<string | null> }) {
  const hero = anatomy.h1 && anatomy.hasCta ? 70 : 45;
  const value = anatomy.hasOverview ? 65 : 40;
  const copy = anatomy.words >= 400 ? 70 : anatomy.words >= 220 ? 55 : 35;
  const trust = anatomy.hasDisclosure ? 60 : 35;
  const conversion = anatomy.hasCta ? 65 : 30;
  const design = anatomy.sections.includes("overview") ? 60 : 45;
  return {
    TOTAL_SCORE: Math.round((hero + value + copy + trust + conversion + design) / 6),
    HERO: hero,
    VALUE_PROPOSITION: value,
    COPYWRITING: copy,
    TRUST: trust,
    CONVERSION: conversion,
    DESIGN: design,
    SAFE_STRUCTURAL: anatomy.hasOverview ? ["Overview present"] : ["Keep overview as first body section"],
    SAFE_VISUAL: ["Do not add unsourced badges or filler images"],
    SAFE_CRO: anatomy.hasCta ? ["Keep a single informational hero CTA"] : ["Ensure hero CTA is visible"],
    FACTUAL_RISK: ["Do not add testimonials, ratings, ingredients, guarantees, or manufacturer claims from this audit"],
    NOT_APPLICABLE: ["Do not treat Web Anatomy score as a ProductFact"],
  };
}

async function main() {
  console.log("IMPORT_START", SOURCE_URL);
  const facts = await importProductFromUrl(SOURCE_URL, { operatorProductName: OPERATOR_NAME });
  writeJson("import-facts.json", facts);

  const identity = identityStatus(facts);
  const identityAuth = productNameAuthority(facts);
  const table = fieldTable(facts);
  const eligibleFields = table.filter((row) => row.COPY_ELIGIBLE === "YES").map((row) => row.FIELD);
  const ineligibleFields = table.filter((row) => row.COPY_ELIGIBLE === "NO").map((row) => row.FIELD);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  writeJson("generation-plan.json", plan);
  writeJson("evidence-manifest.json", manifest);
  writeJson("facts-eligibility.json", { identity, coverage: plan.coverage, table, importQuality: facts.importQuality, productNameAuthority: identityAuth });
  console.log("IDENTITY", identity, facts.productName, facts.confidence.productName, identityAuth.authority, "COVERAGE", plan.coverage);

  if (identity !== "ACCEPTED") {
    writeJson("REPORT.json", { GO_NO_GO: "PRODUCT_FACTS_NOT_READY", PRODUCT: { NAME: facts.productName, IDENTITY: identity }, GENERATION: { AI_CALLS: 0 }, FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE" });
    console.log("STOP identity", identity);
    return;
  }
  if (manifest.promptFactNotCopyEligible !== 0) {
    writeJson("REPORT.json", { GO_NO_GO: "STRUCTURED_GENERATION_REGRESSION", FACT_MANIFEST: { NON_COPY_ELIGIBLE_EVIDENCE: manifest.promptFactNotCopyEligible }, GENERATION: { AI_CALLS: 0 }, FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE" });
    console.log("STOP STRUCTURED_GENERATION_REGRESSION");
    return;
  }

  console.log("MARKET_RESEARCH_START");
  const { research, recommendation } = await researchAndRecommend(facts);
  writeJson("market-research.json", research);
  writeJson("strategy.json", recommendation);
  console.log("STRATEGY", recommendation.recommendedStrategy, recommendation.confidence, "MR", research.status, research.quality);

  const promptBundle = buildPrompt({
    productName: facts.productName,
    sourceUrl: facts.sourceUrl,
    facts,
    targetApproach: recommendation.recommendedStrategy,
    marketResearch: research,
    recommendedStrategy: recommendation.recommendedStrategy,
  });
  const firewall = inspectPromptFirewall(facts, promptBundle.user);
  writeJson("generation-prompt.json", { system: promptBundle.system, user: promptBundle.user, firewall });
  console.log("FIREWALL", firewall.FAQ_SNIPPETS, firewall.RAW_SOURCE_SNIPPETS, firewall.SERP_TITLES, firewall.HEURISTIC_FACTS, firewall.NOT_FOUND_FACTS);
  if (firewall.FAQ_SNIPPETS === "YES" || firewall.RAW_SOURCE_SNIPPETS === "YES" || firewall.SERP_TITLES === "YES" || firewall.HEURISTIC_FACTS === "YES" || firewall.NOT_FOUND_FACTS === "YES") {
    writeJson("REPORT.json", { GO_NO_GO: "STRUCTURED_GENERATION_REGRESSION", FIREWALL: firewall, GENERATION: { AI_CALLS: 0 }, FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE" });
    console.log("STOP firewall regression");
    return;
  }

  console.log("GENERATION_START", recommendation.recommendedStrategy);
  const schema = structuredVariantsSchema(plan.allowedTopics);
  writeJson("structured-schema.json", { FAQ_RUNTIME_ALLOWED_TOPICS: plan.allowedTopics, FAQ_CANONICAL_TOPICS: [...GENERATION_TOPICS], schema });
  const generated = await oneShotStructured(promptBundle.system, promptBundle.user, schema);
  writeJson("generation-raw.json", {
    raw: generated.raw,
    jsonValid: generated.jsonValid,
    parseError: generated.parseError,
    httpStatus: generated.httpStatus,
    providerError: generated.providerError,
  });
  const provider = {
    ANTHROPIC_REQUEST_SENT: generated.requestSent ? "YES" : "NO",
    ANTHROPIC_RESPONSE_RECEIVED: generated.httpStatus != null ? "YES" : "NO",
    HTTP_STATUS: generated.httpStatus,
    PROVIDER_ERROR: generated.providerError,
    STRUCTURED_CANDIDATE_RECEIVED: generated.raw ? "YES" : "NO",
  };
  writeJson("provider.json", provider);
  console.log("PROVIDER", generated.httpStatus, generated.providerError ? "ERROR" : "OK");

  if (generated.providerError && !generated.raw) {
    writeJson("REPORT.json", {
      PRODUCT: { NAME: facts.productName, IDENTITY: identity, PRODUCT_NAME_PROVENANCE: facts.confidence.productName, PRODUCT_NAME_GENERATION_AUTHORITY: identityAuth.authority },
      PRODUCT_FACTS: { COVERAGE: plan.coverage, ELIGIBLE_FIELDS: eligibleFields, INELIGIBLE_FIELDS: ineligibleFields, TABLE: table },
      EVIDENCE_MANIFEST: { TOTAL: manifest.items.length, ITEMS: manifest.items, NON_COPY_ELIGIBLE_EVIDENCE: manifest.promptFactNotCopyEligible },
      GENERATION_PLAN: {
        THIN_MODE: plan.thinMode,
        ALLOWED_TOPICS: plan.allowedTopics,
        CLOSED_TOPICS: plan.closedTopics,
        AUTHORIZED_BLOCKS: plan.authorizedBlocks,
        DISALLOWED_BLOCKS: plan.disallowedBlocks,
        WORD_BUDGET: plan.wordBudget,
      },
      FAQ_CONTRACT: {
        CANONICAL_TOPICS: [...GENERATION_TOPICS],
        RUNTIME_ALLOWED_TOPICS: plan.allowedTopics,
        FREE_TEXT_ALLOWED: "NO",
        ZERO_FAQ_VALID: "YES",
      },
      FIREWALL: firewall,
      MARKET_RESEARCH: { STATUS: research.status, QUALITY: research.quality },
      STRATEGY: { STRATEGY: recommendation.recommendedStrategy, CONFIDENCE: recommendation.confidence },
      PROVIDER: provider,
      GENERATION: { MODEL, AI_CALLS: 1, JSON_VALID: "NO", SCHEMA_VALID: "NO" },
      FAILURE_CLASSIFICATION: {
        PRIMARY: "EXTERNAL_PROVIDER_FAILURE",
        EVIDENCE: `HTTP_STATUS=${generated.httpStatus} PROVIDER_ERROR=${generated.providerError}`,
      },
      ADAPTER: { EXECUTED: false },
      COMPOSITION: { EXECUTED: false, REASON: "no structured candidate from provider" },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      HUMAN_APPROVAL: "PENDING",
      PUBLICATION: { STATUS: "draft", PUBLIC_ROUTE_AVAILABLE: false, PUBLISH_ATTEMPTED: false, AFFILIATE_DESTINATION_OPENED: false },
      GO_NO_GO: null,
      FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE",
    });
    console.log("STOP EXTERNAL_PROVIDER_FAILURE", generated.httpStatus);
    return;
  }

  const page = generated.page;
  const schemaValid = Boolean(page);
  const faqCount = page ? page.blocks.reduce((sum, block) => sum + (block.items?.length || 0), 0) : 0;
  console.log("JSON_VALID", generated.jsonValid, "SCHEMA_VALID", schemaValid, "BLOCKS", page?.blocks.length ?? 0);

  if (!generated.jsonValid || !page) {
    writeJson("REPORT.json", {
      PRODUCT: { NAME: facts.productName, IDENTITY: identity, PRODUCT_NAME_PROVENANCE: facts.confidence.productName, PRODUCT_NAME_GENERATION_AUTHORITY: identityAuth.authority },
      PROVIDER: provider,
      GENERATION: { MODEL, AI_CALLS: 1, JSON_VALID: generated.jsonValid ? "YES" : "NO", SCHEMA_VALID: schemaValid ? "YES" : "NO" },
      FAILURE_CLASSIFICATION: { PRIMARY: "STRUCTURED_MODEL_COMPLIANCE_FAILURE", EVIDENCE: generated.parseError || "malformed structured output" },
      GO_NO_GO: "STRUCTURED_MODEL_COMPLIANCE_NEEDS_FIX",
      FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE",
      PUBLICATION: { STATUS: "draft", PUBLIC_ROUTE_AVAILABLE: false, PUBLISH_ATTEMPTED: false, AFFILIATE_DESTINATION_OPENED: false },
    });
    console.log("STOP malformed");
    return;
  }

  const evaluation = evaluateStructuredPage(page, facts, facts.productName, VALIDATION_SAFE_AFFILIATE);
  writeJson("structured-evaluation.json", evaluation);
  const violations = evaluation.structuralViolations;
  const countCode = (code: string) => violations.filter((item) => item.code === code).length;
  const copy = consumerCopyFromPage(page);
  const absences = absenceHits(copy);
  const topicAudit = closedTopicAudit(copy, plan);
  const ingredients = ingredientAudit(copy, facts, plan);
  const guarantee = guaranteeAudit(copy);
  const faq = faqContract(page, plan, violations);
  const support = `${plan.descriptionText}\n${plan.featurePhrases.join("\n")}`;
  const knowledge = isKnowledgeExpansion(copy, support) || /\bnatural lubricant\b|\blubricating substance found in joints\b|\bcushion\b|\bcartilage\b|\bfriction\b/i.test(copy);
  const featureRestated = /once[- ]each[- ]morning|once each morning/i.test(copy);
  const usagePromotion = hasUsageAuthorityLanguage(copy);
  const byId = new Map(manifest.items.map((item) => [item.id, item]));
  const declaration = [
    { BLOCK_ID: "HERO", BLOCK_TYPE: "HERO", DECLARED_EVIDENCE_IDS: [...page.headline.evidenceIds, ...page.summary.evidenceIds] },
    ...page.blocks.map((block) => ({
      BLOCK_ID: block.id,
      BLOCK_TYPE: block.type,
      DECLARED_EVIDENCE_IDS: [...block.evidenceIds, ...(block.items || []).flatMap((item) => item.evidenceIds)],
    })),
  ].map((row) => ({
    ...row,
    DECLARED_FIELDS: row.DECLARED_EVIDENCE_IDS.map((id) => byId.get(id)?.field || "UNKNOWN"),
  }));

  const inspection = evaluation.inspectionCopy;
  const adaptedAfterPass = evaluation.adapted;
  const adapterExecuted = Boolean(adaptedAfterPass) && evaluation.structuralViolations.length === 0 && evaluation.grounding.status === "GROUNDED" && evaluation.policyGate === "READY";
  const declaredText = copy.toLowerCase().replace(/\s+/g, " ");
  const adaptedText = `${inspection.headline}\n${inspection.body}\n${inspection.ctaLabel}`.toLowerCase().replace(/\s+/g, " ");
  const extraFactual = adaptedText.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const slice = sentence.trim().slice(0, 40);
    return slice.length >= 20 && !declaredText.includes(slice);
  });

  const policyLint = lintCampaign({
    id: 0,
    name: facts.productName,
    slug: SLUG,
    headline: inspection.headline,
    body: inspection.body,
    ctaLabel: inspection.ctaLabel,
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
  const policyWarnings = policyLint.findings.filter((item) => item.status === "warn").map((item) => item.ruleId);
  const policyBlocks = policyLint.findings.filter((item) => item.status === "fail" && item.blocking).map((item) => item.ruleId);

  const contentReady =
    evaluation.structuralViolations.length === 0 &&
    evaluation.traces.every((item) => item.groundingResult === "GROUNDED" || item.groundingResult === "NOT_RUN") &&
    evaluation.grounding.status === "GROUNDED" &&
    evaluation.grounding.unsupportedClaims.length === 0 &&
    evaluation.policyGate === "READY" &&
    evaluation.finalGate === "READY";

  const success =
    contentReady &&
    absences.length === 0 &&
    !usagePromotion &&
    !knowledge &&
    ingredients.NAMED_INGREDIENT_CLAIMS.length === 0 &&
    guarantee.GUARANTEE_PROMOTION === "NO" &&
    faq.INVALID_FAQ_TOPICS === 0 &&
    faq.FAQ_WORD_BUDGET_VIOLATIONS === 0;

  const failure = classifyFailure({
    jsonValid: true,
    structuralFail: evaluation.structuralViolations.length > 0,
    unknownBlocks: countCode("UNKNOWN_BLOCK"),
    unknownEvidence: countCode("UNKNOWN_EVIDENCE"),
    incompatible: countCode("INCOMPATIBLE_EVIDENCE"),
    closedTopic: countCode("CLOSED_TOPIC"),
    invalidFaqTopics: faq.INVALID_FAQ_TOPICS,
    faqWordBudget: faq.FAQ_WORD_BUDGET_VIOLATIONS,
    faqSemantic: faq.FAQ_SEMANTIC_VIOLATIONS,
    absence: absences.length,
    usagePromotion,
    knowledge,
    namedIngredients: ingredients.NAMED_INGREDIENT_CLAIMS.length,
    grounding: evaluation.grounding.status,
    policy: evaluation.policyGate,
    gate: evaluation.finalGate,
    coverage: plan.coverage,
  });

  const baseReport = {
    PRODUCT: {
      NAME: facts.productName,
      SOURCE_URL: facts.sourceUrl || SOURCE_URL,
      IDENTITY: identity,
      PRODUCT_NAME_PROVENANCE: facts.confidence.productName,
      PRODUCT_NAME_GENERATION_AUTHORITY: identityAuth.authority,
    },
    PRODUCT_FACTS: {
      COVERAGE: plan.coverage,
      ELIGIBLE_FIELDS: eligibleFields,
      INELIGIBLE_FIELDS: ineligibleFields,
      TABLE: table,
    },
    EVIDENCE_MANIFEST: {
      TOTAL: manifest.items.length,
      ITEMS: manifest.items,
      NON_COPY_ELIGIBLE_EVIDENCE: manifest.promptFactNotCopyEligible,
    },
    GENERATION_PLAN: {
      THIN_MODE: plan.thinMode,
      ALLOWED_TOPICS: plan.allowedTopics,
      CLOSED_TOPICS: plan.closedTopics,
      AUTHORIZED_BLOCKS: plan.authorizedBlocks,
      DISALLOWED_BLOCKS: plan.disallowedBlocks,
      OPTIONAL_BLOCKS: plan.optionalBlocks,
      WORD_BUDGET: plan.wordBudget,
    },
    BLOCK_EVIDENCE_COMPATIBILITY: [...plan.authorizedBlocks, ...plan.optionalBlocks].map((type) => ({
      BLOCK_TYPE: type,
      ALLOWED_EVIDENCE_FIELDS: type === "FAQ" ? "open-topic evidence only" : BLOCK_FIELD_COMPAT[type] || [],
    })),
    FIREWALL: firewall,
    MARKET_RESEARCH: { STATUS: research.status, QUALITY: research.quality },
    STRATEGY: { STRATEGY: recommendation.recommendedStrategy, CONFIDENCE: recommendation.confidence, RATIONALE: recommendation.rationale },
    PROVIDER: provider,
    FAQ_CONTRACT: faq,
    GENERATION: {
      MODEL,
      AI_CALLS: 1,
      JSON_VALID: "YES",
      SCHEMA_VALID: "YES",
      HEADLINE_WORDS: countWords(page.headline.text),
      SUMMARY_WORDS: countWords(page.summary.text),
      BLOCK_COUNT: page.blocks.length,
      BLOCK_TYPES: page.blocks.map((block) => block.type),
      BLOCKS: page.blocks.map((block) => ({
        BLOCK_ID: block.id,
        BLOCK_TYPE: block.type,
        WORD_COUNT: countWords(block.content),
        EVIDENCE_IDS: block.evidenceIds,
      })),
      FAQ_COUNT: faqCount,
      CTA: page.cta.label,
      HEADLINE: page.headline.text,
      SUMMARY: page.summary.text,
    },
    STRUCTURAL_VALIDATION: {
      RESULT: evaluation.structuralViolations.length === 0 ? "PASS" : "FAIL",
      UNKNOWN_BLOCKS: countCode("UNKNOWN_BLOCK"),
      UNKNOWN_EVIDENCE_IDS: countCode("UNKNOWN_EVIDENCE"),
      INCOMPATIBLE_EVIDENCE: countCode("INCOMPATIBLE_EVIDENCE"),
      CLOSED_TOPIC_VIOLATIONS: countCode("CLOSED_TOPIC"),
      WORD_BUDGET_VIOLATIONS: countCode("WORD_BUDGET"),
      FAQ_TOPIC_VIOLATIONS: countCode("INVALID_FAQ_TOPIC") + violations.filter((item) => item.code === "CLOSED_TOPIC" && /FAQ/i.test(item.text + item.reason)).length,
      MISSING_REQUIRED_STRUCTURE: violations.filter((item) => item.code === "MALFORMED").length,
      DETAILS: violations,
    },
    CLOSED_TOPIC_AUDIT: { ...topicAudit, ABSENCE_COMMENTARY_COUNT: absences.length, ABSENCE_SAMPLES: absences },
    INGREDIENT_AUDIT: ingredients,
    FEATURE_PROMOTION: {
      FEATURE_RESTATEMENT: featureRestated ? "YES" : "NO",
      USAGE_PROMOTION: usagePromotion ? "YES" : "NO",
    },
    GUARANTEE_PROMOTION: guarantee,
    KNOWLEDGE_EXPANSION: {
      MODEL_WORLD_KNOWLEDGE_EXPANSION: knowledge ? "YES" : "NO",
    },
    ABSENCE_COMMENTARY: { COUNT: absences.length, SAMPLES: absences },
    EVIDENCE_TRACE: evaluation.traces,
    EVIDENCE_DECLARATION: declaration,
    PRE_COMPOSITION: {
      BLOCK_SCOPED_GROUNDING: evaluation.traces.every((item) => item.groundingResult === "GROUNDED") ? "PASS" : "FAIL",
      GROUNDING: evaluation.grounding.status,
      UNSUPPORTED_CLAIMS: evaluation.grounding.unsupportedClaims,
      POLICY: evaluation.policyGate,
      WARNINGS: policyWarnings,
      BLOCKS: policyBlocks,
      CONTENT_GATE: evaluation.finalGate,
      CONTENT_READY_MILESTONE: contentReady ? "YES" : "NO",
    },
    ADAPTER: {
      EXECUTED: adapterExecuted,
      ADDED_FACTUAL_COPY: extraFactual.length > 0 ? "YES" : "NO",
      EXTRA_SENTENCES: extraFactual.slice(0, 6),
    },
    FAILURE_CLASSIFICATION: success ? { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY" } : failure,
    HUMAN_APPROVAL: "PENDING",
    PUBLICATION: { STATUS: "draft", PUBLIC_ROUTE_AVAILABLE: false, PUBLISH_ATTEMPTED: false, AFFILIATE_DESTINATION_OPENED: false },
  };

  if (!success) {
    writeJson("REPORT.json", {
      ...baseReport,
      COMPOSITION: { EXECUTED: false, REASON: "CONTENT_GATE not READY" },
      POST_COMPOSITION: { GROUNDING: null, POLICY: null, CONTENT_GATE: null },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO: failure.GO,
      FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE",
    });
    console.log("STOP", failure.PRIMARY, evaluation.finalGate);
    return;
  }

  const variant = { approach: recommendation.recommendedStrategy, ...adaptedAfterPass! };
  const template = approachToTemplate(variant.approach);
  let composed = composePresellPage({ variant, facts, template });
  const imageEligible = Boolean(facts.productImageUrl && isCopyEligibleImageProvenance(facts.productImageProvenance));
  if (imageEligible && facts.productImageUrl) {
    composed = applyProductImageToPage(composed, {
      src: facts.productImageUrl,
      alt: `${facts.productName} product image`,
      provenance: facts.productImageProvenance,
    });
  }
  const post = validateComposedPage(composed, facts, VALIDATION_SAFE_AFFILIATE);
  const rendered = orderedVisibleSections(composed).map((section) => section.id);
  const omitted = composed.omitted.map((item) => item.component);
  writeJson("composed-page.json", composed);
  writeJson("post-composition-gates.json", { GROUNDING: post.grounding.status, POLICY: post.policy, CONTENT_GATE: post.finalGate, unsupported: post.grounding.unsupportedClaims });
  const visible = consumerVisibleText(composed);
  const variantBody = `${adaptedAfterPass!.headline}\n${adaptedAfterPass!.body}\n${adaptedAfterPass!.ctaLabel}`.toLowerCase().replace(/\s+/g, " ");
  const composerAdded = visible
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((sentence) => {
      const slice = sentence.toLowerCase().slice(0, 48);
      if (slice.length < 24) return false;
      if (variantBody.includes(slice.slice(0, 32))) return false;
      if (/^(key features|what is|final thoughts|faq|things to consider|affiliate disclosure)/i.test(sentence)) return false;
      return /[a-z]/i.test(sentence);
    });
  const emptySections = composed.sections.filter((section) => section.visible && !(section.paragraphs.join("") + section.bullets.join("") + section.cards.map((c) => c.title + c.body).join("") + section.faq.map((f) => f.question).join("")).trim()).map((section) => section.id);
  const finalReady = post.grounding.status === "GROUNDED" && post.policy === "READY" && post.finalGate === "READY" && emptySections.length === 0;
  if (!finalReady) {
    writeJson("REPORT.json", {
      ...baseReport,
      COMPOSITION: { EXECUTED: true, TEMPLATE: template, SECTION_ORDER: rendered, SECTIONS_RENDERED: rendered, SECTIONS_OMITTED: omitted, EMPTY_SECTIONS: emptySections.length, COMPOSER_ADDED_FACTUAL_COPY: composerAdded.length ? composerAdded.slice(0, 8) : "NONE" },
      POST_COMPOSITION: { GROUNDING: post.grounding.status, UNSUPPORTED_CLAIMS: post.grounding.unsupportedClaims, POLICY: post.policy, CONTENT_GATE: post.finalGate },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO: post.grounding.status !== "GROUNDED" ? "GROUNDING_PRECISION_NEEDS_FIX" : "GENERATION_SYNTHESIS_NEEDS_FIX",
      FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE",
    });
    console.log("STOP post-composition");
    return;
  }

  const design = createDesignPlan({
    page: composed,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
    productAssetProvenance: imageEligible ? facts.productImageProvenance : "NOT_FOUND",
    strategyHint: variant.approach,
  });
  const creative = createCreativeCompositionPlan({ page: composed, design });
  const campaignInput = {
    name: `${facts.productName} controlled ready 05b (DO NOT PUBLISH)`,
    slug: SLUG,
    headline: composed.hero.headline,
    body: reconstructPageBody(composed),
    ctaLabel: composed.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    pageTemplate: composed.template,
    pageComposition: serializePresellPage(composed),
    productImageSrc: composed.hero.image.src || null,
    productImageProvenance: composed.hero.image.provenance,
    subheadline: composed.hero.subheadline,
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
  const visualPass =
    visual.gate !== "FAIL" &&
    extra.mobile.href === VALIDATION_SAFE_HREF &&
    extra.publicStatus !== 200 &&
    !extra.mobile.overflowX &&
    !extra.desktop.overflowX &&
    extra.mobile.brokenImages === 0;
  writeJson("visual-qa.json", { gate: visual.gate, byWidth: visual.byWidth, extra, pass: visualPass });
  const quality =
    !visualPass ? "VISUALLY_BROKEN" : extra.anatomy && extra.anatomy.words < 180 ? "VISUALLY_THIN" : extra.anatomy && extra.anatomy.words >= 400 ? "VISUALLY_PREMIUM" : "VISUALLY_ACCEPTABLE";
  const anatomy = visualPass && extra.anatomy ? scoreAnatomy(extra.anatomy) : null;
  if (anatomy) writeJson("web-anatomy-audit-only.json", anatomy);
  const published = getPublishedCampaignBySlug(SLUG);

  writeJson("REPORT.json", {
    ...baseReport,
    COMPOSITION: {
      EXECUTED: true,
      TEMPLATE: template,
      SECTION_ORDER: rendered,
      SECTIONS_RENDERED: rendered,
      SECTIONS_OMITTED: omitted,
      EMPTY_SECTIONS: extra.mobile.emptySections.length,
      COMPOSER_ADDED_FACTUAL_COPY: composerAdded.length ? composerAdded.slice(0, 8) : "NONE",
      VISIBLE_TEXT_CHARS: visible.length,
    },
    POST_COMPOSITION: {
      GROUNDING: post.grounding.status,
      UNSUPPORTED_CLAIMS: post.grounding.unsupportedClaims,
      POLICY: post.policy,
      CONTENT_GATE: post.finalGate,
    },
    VISUAL_QA: {
      EXECUTED: true,
      RESULT: visualPass ? "PASS" : "FAIL",
      GATE: visual.gate,
      "375": visual.byWidth["375"] || null,
      "390": visual.byWidth["390"] || extra.mobile,
      "768": visual.byWidth["768"] || null,
      "1024": visual.byWidth["1024"] || null,
      "1440": visual.byWidth["1440"] || extra.desktop,
      PREMIUM_QUALITY: quality,
    },
    WEB_ANATOMY: visualPass && anatomy ? { EXECUTED: true, ...anatomy } : { EXECUTED: false },
    HUMAN_APPROVAL: "PENDING",
    PUBLICATION: {
      STATUS: campaign.publicationStatus,
      PUBLIC_ROUTE_AVAILABLE: Boolean(published),
      PUBLISH_ATTEMPTED: false,
      AFFILIATE_DESTINATION_OPENED: extra.mobile.href !== VALIDATION_SAFE_HREF,
    },
    GO_NO_GO: visualPass && extraFactual.length === 0 && composerAdded.length === 0
      ? "FIRST_READY_PREMIUM_LP_CREATED"
      : visualPass
        ? "CONTENT_READY_VISUAL_PENDING"
        : "VISUAL_QA_NEEDS_FIX",
    FINAL_STATUS: "CONTROLLED_READY_RUN_05B_COMPLETE",
  });
  console.log("DONE", visualPass ? "FIRST_READY_PREMIUM_LP_CREATED" : "VISUAL_QA_NEEDS_FIX");
}

main().catch((err) => {
  console.error(err);
  writeJson("ERROR.json", { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
  process.exit(1);
});
