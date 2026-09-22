// npx tsx scripts/run-controlled-ready-03.ts
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
import {
  buildPrompt,
  lintVariant,
  parseVariantsResponse,
  DEFAULT_SAFE_CTA,
  SINGLE_VARIANT_JSON_SCHEMA,
  type Variant,
} from "../src/lib/ai/generate-variants.ts";
import {
  createGenerationPlan,
  isKnowledgeExpansion,
  validateGenerationPlan,
  type GenerationPlan,
} from "../src/lib/ai/generation-plan.ts";
import {
  applyProductImageToPage,
  composePresellPage,
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

const RUN_ID = "2026-09-20-controlled-ready-03";
const OUT = path.join(process.cwd(), "data", "controlled-ready-03", RUN_ID);
fs.mkdirSync(OUT, { recursive: true });

const SOURCE_URL = "https://jointgenesisofficial.com/";
const OPERATOR_NAME = "Joint Genesis";
const SLUG = "joint-genesis-controlled-ready-03";
const MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

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
  return {
    FAQ_SNIPPETS_STORED: faqSnippets.length,
    FAQ_SNIPPETS_IN_GENERATION_PROMPT: leaked.length > 0 ? "YES" : "NO",
    leakedSamples: leaked.slice(0, 8),
    snippets: faqSnippets.map((s) => ({ confidence: s.confidence, text: s.text.slice(0, 240) })),
  };
}

function inspectPromptFirewall(facts: ProductFacts, prompt: string) {
  const faq = inspectFaqFirewall(facts, prompt);
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

  const rawLeaks: string[] = [];
  for (const snippet of facts.sourceSnippets) {
    const text = snippet.text.trim();
    if (text.length < 24) continue;
    if (eligibleBag.includes(text.toLowerCase().slice(0, 40))) continue;
    if (promptLower.includes(text.toLowerCase().slice(0, 40))) rawLeaks.push(text.slice(0, 80));
  }

  const serpLeaks: string[] = [];
  for (const source of facts.webDiscovery?.sources || []) {
    const title = (source.title || "").trim();
    if (title.length < 18) continue;
    if (eligibleBag.includes(title.toLowerCase())) continue;
    if (promptLower.includes(title.toLowerCase())) serpLeaks.push(title);
  }

  const heuristicLeaks: string[] = [];
  for (const field of FIELDS) {
    if (facts.confidence[field] !== "HEURISTIC_EXTRACTION") continue;
    const value = fieldValue(facts, field);
    const parts = Array.isArray(value) ? value : value ? [value] : [];
    for (const part of parts) {
      const slice = part.trim();
      if (slice.length < 16) continue;
      if (eligibleBag.includes(slice.toLowerCase().slice(0, 24))) continue;
      if (promptLower.includes(slice.toLowerCase().slice(0, 24))) heuristicLeaks.push(`${field}:${slice.slice(0, 80)}`);
    }
  }

  const notFoundLeaks: string[] = [];
  for (const field of FIELDS) {
    if (facts.confidence[field] !== "NOT_FOUND") continue;
    const value = fieldValue(facts, field);
    const parts = Array.isArray(value) ? value : value ? [value] : [];
    for (const part of parts) {
      const slice = part.trim();
      if (slice.length < 16) continue;
      if (promptLower.includes(slice.toLowerCase().slice(0, 24))) notFoundLeaks.push(`${field}:${slice.slice(0, 80)}`);
    }
  }

  return {
    FAQ_SNIPPETS: faq.FAQ_SNIPPETS_IN_GENERATION_PROMPT,
    RAW_SOURCE_SNIPPETS: rawLeaks.length > 0 ? "YES" : "NO",
    SERP_TITLES: serpLeaks.length > 0 ? "YES" : "NO",
    HEURISTIC_FACTS: heuristicLeaks.length > 0 ? "YES" : "NO",
    NOT_FOUND_FACTS: notFoundLeaks.length > 0 ? "YES" : "NO",
    faq,
    rawLeaks: rawLeaks.slice(0, 6),
    serpLeaks: serpLeaks.slice(0, 6),
    heuristicLeaks: heuristicLeaks.slice(0, 6),
    notFoundLeaks: notFoundLeaks.slice(0, 6),
  };
}

type AuditRow = {
  PRESENT: "YES" | "NO";
  AUTHORIZED: "YES" | "NO";
  EVIDENCE_FIELD: string;
  MATCHES: string[];
};

function auditPresence(
  copy: string,
  pattern: RegExp,
  topicOpen: boolean,
  evidenceField: string,
  authorizedIf: (match: string) => boolean,
): AuditRow {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...new Set(copy.match(new RegExp(pattern.source, flags)) || [])];
  const present = matches.length > 0;
  if (!present) {
    return { PRESENT: "NO", AUTHORIZED: topicOpen ? "YES" : "NO", EVIDENCE_FIELD: evidenceField, MATCHES: [] };
  }
  const authorized = topicOpen && matches.every((match) => authorizedIf(match));
  return {
    PRESENT: "YES",
    AUTHORIZED: authorized ? "YES" : "NO",
    EVIDENCE_FIELD: evidenceField,
    MATCHES: matches.slice(0, 8),
  };
}

function synthesisAudit(copy: string, facts: ProductFacts, plan: GenerationPlan) {
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
  const open = new Set(plan.allowedTopics);
  const inBag = (match: string) => bag.includes(match.toLowerCase());

  return {
    NAMED_INGREDIENTS: auditPresence(
      copy,
      /\b(?:contains|includes|made with|formulated with)\s+[A-Z][A-Za-z0-9-]+|\b(?:mobilee|bioperine|boswellia)\b/gi,
      open.has("ingredients"),
      "ingredientsOrComponents",
      inBag,
    ),
    DOSAGE: auditPresence(
      copy,
      /\b(?:take\s+(?:one|a)\s+(?:capsule|dose|tablet)|recommended dosage|one dose(?:\s+each|\s+every|\s+daily)?|how to (?:take|use))\b/gi,
      open.has("usage"),
      "usageInformation",
      inBag,
    ),
    SERVINGS: auditPresence(
      copy,
      /\b\d+\s+(?:daily\s+)?servings?\b|\bcapsules?\s+(?:daily|a day|per day)\b/gi,
      open.has("usage"),
      "usageInformation",
      inBag,
    ),
    MANUFACTURER: auditPresence(
      copy,
      /\bmanufacturer(?:'s)?\s+(?:identity|transparency|information|is|does not)\b|\bbiodynamix\b/gi,
      open.has("manufacturer"),
      "manufacturer",
      inBag,
    ),
    MANUFACTURING_LOCATION: auditPresence(
      copy,
      /\bmanufacturing (?:location|facility)\b|\bmade in (?:the )?(?:usa|united states)\b/gi,
      open.has("manufacturer"),
      "manufacturer",
      inBag,
    ),
    GMP: auditPresence(copy, /\b(?:c?gmp|gmp[\s-]?certified)\b/gi, open.has("manufacturer"), "manufacturer", inBag),
    FDA_FACILITY: auditPresence(
      copy,
      /\bfda[\s-]?inspected(?:\s+facility)?\b/gi,
      open.has("manufacturer"),
      "manufacturer",
      inBag,
    ),
    PRICING: auditPresence(
      copy,
      /\$\s*\d+(?:\.\d{2})?|\b(?:price|pricing|cost)\b|\bcheck current price\b/gi,
      open.has("pricing"),
      "pricingInformation",
      inBag,
    ),
    DISCOUNT: auditPresence(
      copy,
      /\b(?:discount|on sale|deal|pricing transparency)\b/gi,
      open.has("pricing"),
      "pricingInformation",
      inBag,
    ),
    GUARANTEE: auditPresence(
      copy,
      /\b(?:guarantee|refund|money[\s-]?back|risk[\s-]?free|return window|trial period)\b/gi,
      open.has("guarantee"),
      "guaranteeInformation",
      inBag,
    ),
    RESULTS_TIMELINE: auditPresence(
      copy,
      /\bhow long does it take to notice results\b|\btime[- ]to[- ]effect\b|\bexpected results\b|\bresults in \d+\s+(?:days?|weeks?|months?)\b/gi,
      open.has("results_timeline"),
      "usageInformation",
      inBag,
    ),
    CATEGORY_CLASSIFICATION: auditPresence(
      copy,
      /\bdietary supplement\b|\bdaily supplement\b|\bjoint supplement\b|\bmedical device\b/gi,
      open.has("category_classification"),
      "description",
      inBag,
    ),
    MEDICAL_ADVICE: auditPresence(
      copy,
      /\bconsult(?:\s+with)?(?:\s+your)?\s+(?:doctor|physician|healthcare)\b/gi,
      open.has("cautions"),
      "cautions",
      inBag,
    ),
    BACKGROUND_SCIENCE: auditPresence(
      copy,
      /\bnatural lubricant\b|\bcushion between\b|\bfriction between (?:the )?cartilage\b|\bphysiological\b|\bthis mechanism improves mobility\b/gi,
      open.has("background_science"),
      "description",
      inBag,
    ),
    ABSENCE_COMMENTARY: auditPresence(
      copy,
      /\b(?:ingredient names are not disclosed|ingredients? (?:are|is) not (?:disclosed|listed|provided)|manufacturer (?:is unknown|information is unavailable)|pricing (?:is|was) (?:unavailable|not provided)|servings? (?:are|is) not listed|allergen information (?:is missing|is not listed)|guarantee (?:information|details) (?:are|is) (?:unclear|unavailable))\b/gi,
      false,
      "omission",
      () => false,
    ),
  };
}

function knowledgeExpansionCheck(copy: string, facts: ProductFacts) {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const support = `${eligible.description}\n${eligible.features.join("\n")}`;
  const sentences = copy.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const expansions = sentences.filter((sentence) => isKnowledgeExpansion(sentence, support));
  const extraHits =
    copy.match(
      /\bnatural lubricant\b|\bcushion between joints\b|\bcartilage friction\b|\bphysiological mechanism\b|\bscientific explanation\b|\bcausal mobility\b|\bbody's natural lubricant\b/gi,
    ) || [];
  return {
    BACKGROUND_KNOWLEDGE_EXPANSION: expansions.length > 0 || extraHits.length > 0 ? "YES" : "NO",
    SENTENCES: expansions.slice(0, 8),
    EXTRA_HITS: [...new Set(extraHits)].slice(0, 8),
  };
}

function featurePromotionCheck(copy: string, facts: ProductFacts, plan: GenerationPlan) {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const featureHasMorning = eligible.features.some((item) => /once each morning/i.test(item));
  const restated = /once[- ]each[- ]morning|once each morning/i.test(copy);
  const promoted = /\b(?:take (?:one|a) (?:capsule|dose)|recommended dosage|one capsule|one dose|how to (?:take|use)|directions)\b/i.test(
    copy,
  );
  return {
    FEATURE_PRESENT_IN_FACTS: featureHasMorning ? "YES" : "NO",
    FEATURE_RESTATEMENT: restated ? "YES" : "NO",
    USAGE_FIELD: plan.factualFieldsAvailable.includes("usageInformation") ? "OPEN" : "NOT_FOUND",
    USAGE_PROMOTION: promoted ? "YES" : "NO",
  };
}

function unauthorizedClosedTopics(audit: ReturnType<typeof synthesisAudit>): string[] {
  const hits: string[] = [];
  for (const [key, row] of Object.entries(audit)) {
    if (row.PRESENT === "YES" && row.AUTHORIZED === "NO") hits.push(key);
  }
  return hits;
}

function mapGoNoGo(primary: string, visualPass?: boolean): string {
  if (primary === "NONE") return visualPass === false ? "VISUAL_QA_NEEDS_FIX" : "FIRST_READY_PREMIUM_LP_CREATED";
  if (primary === "GENERATION_TOPIC_BUDGET_FAILURE") return "GENERATION_TOPIC_BUDGET_NEEDS_FIX";
  if (primary === "GENERATION_FACT_CONTRACT_REGRESSION") return "GENERATION_CONTRACT_REGRESSION";
  if (primary === "GENERATION_SYNTHESIS_FAILURE") return "GENERATION_SYNTHESIS_NEEDS_FIX";
  if (primary === "GROUNDING_PRECISION_FAILURE") return "GROUNDING_PRECISION_NEEDS_FIX";
  if (primary === "POLICY_PRECISION_FAILURE") return "POLICY_PRECISION_NEEDS_FIX";
  if (primary === "PRODUCT_FACT_COVERAGE_LIMITATION") return "PRODUCT_FACT_COVERAGE_NEEDS_FIX";
  return "REGRESSION_DETECTED";
}

function classifyFailure(input: {
  planViolations: number;
  unauthorizedTopics: string[];
  knowledgeExpansion: boolean;
  usagePromotion: boolean;
  absenceCommentary: boolean;
  grounding: string;
  policy: string;
  contentGate: string;
  coverage: string;
  unsupported: Array<{ claim: string; reason: string }>;
  policyBlocks: string[];
}): { PRIMARY: string; EVIDENCE: string } {
  if (input.contentGate === "READY" && input.planViolations === 0 && input.unauthorizedTopics.length === 0) {
    return { PRIMARY: "NONE", EVIDENCE: "CONTENT_GATE=READY" };
  }
  if (input.planViolations > 0) {
    return {
      PRIMARY: "GENERATION_TOPIC_BUDGET_FAILURE",
      EVIDENCE: `PLAN_VIOLATIONS=${input.planViolations}`,
    };
  }
  if (input.unauthorizedTopics.length > 0 || input.knowledgeExpansion || input.usagePromotion || input.absenceCommentary) {
    return {
      PRIMARY: "GENERATION_SYNTHESIS_FAILURE",
      EVIDENCE: [
        input.unauthorizedTopics.join(","),
        input.knowledgeExpansion ? "BACKGROUND_KNOWLEDGE_EXPANSION" : "",
        input.usagePromotion ? "USAGE_PROMOTION" : "",
        input.absenceCommentary ? "ABSENCE_COMMENTARY" : "",
      ]
        .filter(Boolean)
        .join(" | "),
    };
  }
  if (input.grounding !== "GROUNDED" && input.unsupported.length > 0) {
    return {
      PRIMARY: "GROUNDING_PRECISION_FAILURE",
      EVIDENCE: input.unsupported.map((u) => u.reason).slice(0, 4).join(" | "),
    };
  }
  if (input.policy !== "READY") {
    return {
      PRIMARY: "POLICY_PRECISION_FAILURE",
      EVIDENCE: input.policyBlocks.join(", ") || input.policy,
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

async function oneShotGeneration(system: string, user: string, approach: Variant["approach"]): Promise<{
  variant: Variant;
  raw: string;
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
          schema: SINGLE_VARIANT_JSON_SCHEMA,
        },
      },
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Anthropic API respondeu ${response.status}: ${errorBody.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    stop_reason?: string;
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) throw new Error("Resposta da Anthropic não trouxe bloco de texto.");
  const parsed = parseVariantsResponse(textBlock.text, 1);
  return { variant: { ...parsed[0]!, approach }, raw: textBlock.text };
}

async function playwrightVisual(slug: string) {
  const inspection = await inspectRenderedPresell({
    slug,
    baseUrl: visualQaBaseUrl(),
    artifactKey: `controlled-ready-03-${slug}`,
  });
  const findings = inspection.captures.flatMap((capture) => analyzeLayoutSnapshot(capture.snapshot, "REVIEW"));
  const gate = composeVisualQaGate({ findings, aiVisualReview: "UNAVAILABLE" });
  const byWidth: Record<string, { overflowX: boolean; findings: number }> = {};
  for (const capture of inspection.captures) {
    byWidth[String(capture.viewport.width)] = {
      overflowX: capture.snapshot.overflowX,
      findings: analyzeLayoutSnapshot(capture.snapshot, "REVIEW").filter(
        (f) => f.severity === "HIGH" || f.severity === "WARNING",
      ).length,
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
        sectionOrder: [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id")),
        sticky: document.querySelector("[data-sticky-visible]")?.getAttribute("data-sticky-visible"),
        emptySections: [...document.querySelectorAll("[data-section-id]")].filter((n) => !((n as HTMLElement).innerText || "").trim()).map((n) => n.getAttribute("data-section-id")),
        brokenImages: [...document.querySelectorAll("article img")].filter((img) => {
          const el = img as HTMLImageElement;
          return el.complete && el.naturalWidth === 0 && Boolean(el.getAttribute("src"));
        }).length,
        articleHeight: (document.querySelector("article") as HTMLElement | null)?.scrollHeight || 0,
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
    await pw.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pw.waitForSelector("article", { timeout: 30_000 });
    const anatomy = await pw.evaluate(() => {
      const text = (document.querySelector("article")?.innerText || "").trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      const h1 = document.querySelector("h1")?.textContent?.trim() || "";
      const cta = document.querySelector('[data-cta-position="hero"]');
      const overview = document.querySelector('[data-section-id="overview"]');
      const disclosure = document.querySelector("[data-trust-disclosure]");
      const sections = [...document.querySelectorAll("[data-section-id]")].map((n) => n.getAttribute("data-section-id"));
      return { words, h1, hasCta: Boolean(cta), hasOverview: Boolean(overview), hasDisclosure: Boolean(disclosure), sections };
    });
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
  const design = anatomy.sections.includes("overview") ? 60 : 45;
  const score = Math.round((hero + value + copy + trust + conversion + design) / 6);
  return {
    TOTAL_SCORE: score,
    HERO: hero,
    VALUE_PROPOSITION: value,
    COPYWRITING: copy,
    TRUST: trust,
    CONVERSION: conversion,
    DESIGN: design,
    SAFE_STRUCTURAL: anatomy.hasOverview ? ["Overview present"] : ["Consider making Overview the first body section"],
    SAFE_VISUAL: ["Keep current spacing; do not add unsourced badges"],
    SAFE_CRO: anatomy.hasCta ? ["Keep a single informational hero CTA"] : ["Ensure hero CTA is visible"],
    FACTUAL_RISK: ["Do not add testimonials, ratings, ingredients, guarantees, or manufacturer claims from this audit"],
  };
}

function premiumQuality(input: {
  words: number;
  visualPass: boolean;
  overflow: boolean;
  emptySections: number;
  brokenImages: number;
}): "VISUALLY_PREMIUM" | "VISUALLY_ACCEPTABLE" | "VISUALLY_THIN" | "VISUALLY_BROKEN" {
  if (!input.visualPass || input.overflow || input.brokenImages > 0) return "VISUALLY_BROKEN";
  if (input.words < 180 || input.emptySections > 0) return "VISUALLY_THIN";
  if (input.words >= 400) return "VISUALLY_PREMIUM";
  return "VISUALLY_ACCEPTABLE";
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
  writeJson("generation-plan.json", plan);
  writeJson("facts-eligibility.json", {
    identity,
    coverage: plan.coverage,
    table,
    importQuality: facts.importQuality,
    warnings: facts.importWarnings,
    productNameAuthority: identityAuth,
  });
  console.log(
    "IDENTITY",
    identity,
    "NAME",
    facts.productName,
    "PROVENANCE",
    facts.confidence.productName,
    "AUTHORITY",
    identityAuth.authority,
    "COVERAGE",
    plan.coverage,
  );

  const factsPrompt = formatFactsForPrompt(facts);
  const manifest = buildGenerationFactManifest(facts);
  writeJson("generation-fact-manifest.json", {
    items: manifest.items,
    TOTAL: manifest.items.length,
    COPY_ELIGIBLE: manifest.items.filter((item) => item.copyEligible).length,
    NON_COPY_ELIGIBLE: manifest.promptFactNotCopyEligible,
    factsPrompt,
  });
  console.log("MANIFEST", manifest.items.length, "NON_ELIGIBLE", manifest.promptFactNotCopyEligible);

  if (identity !== "ACCEPTED") {
    writeJson("REPORT.json", {
      GO_NO_GO: identity === "IDENTITY_UNCERTAIN" ? "IDENTITY_NOT_READY" : "PRODUCT_FACTS_NOT_READY",
      PRODUCT: { NAME: facts.productName, SOURCE_URL, IDENTITY: identity },
      GENERATION: { AI_CALLS: 0 },
      FINAL_STATUS: "CONTROLLED_READY_RUN_03_COMPLETE",
    });
    console.log("STOP identity", identity);
    return;
  }

  if (manifest.promptFactNotCopyEligible !== 0) {
    writeJson("REPORT.json", {
      GO_NO_GO: "GENERATION_CONTRACT_REGRESSION",
      PRODUCT: { NAME: facts.productName, SOURCE_URL, IDENTITY: identity },
      GENERATION_FACT_MANIFEST: {
        TOTAL: manifest.items.length,
        COPY_ELIGIBLE: manifest.items.filter((i) => i.copyEligible).length,
        NON_COPY_ELIGIBLE: manifest.promptFactNotCopyEligible,
      },
      GENERATION: { AI_CALLS: 0 },
      FINAL_STATUS: "CONTROLLED_READY_RUN_03_COMPLETE",
    });
    console.log("STOP GENERATION_CONTRACT_REGRESSION");
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

  if (firewall.FAQ_SNIPPETS === "YES" || firewall.HEURISTIC_FACTS === "YES" || firewall.NOT_FOUND_FACTS === "YES") {
    writeJson("REPORT.json", {
      GO_NO_GO: "GENERATION_CONTRACT_REGRESSION",
      PRODUCT: { NAME: facts.productName, SOURCE_URL, IDENTITY: identity },
      FIREWALL: firewall,
      GENERATION: { AI_CALLS: 0 },
      FINAL_STATUS: "CONTROLLED_READY_RUN_03_COMPLETE",
    });
    console.log("STOP GENERATION_CONTRACT_REGRESSION firewall");
    return;
  }

  console.log("GENERATION_START", recommendation.recommendedStrategy);
  const generated = await oneShotGeneration(promptBundle.system, promptBundle.user, recommendation.recommendedStrategy);
  const copy = `${generated.variant.headline}\n${generated.variant.body}\n${generated.variant.ctaLabel}`;
  const planHits = validateGenerationPlan(copy, plan);
  const audit = synthesisAudit(copy, facts, plan);
  const knowledge = knowledgeExpansionCheck(copy, facts);
  const promotion = featurePromotionCheck(copy, facts, plan);
  const linted = lintVariant(generated.variant, facts.productName, VALIDATION_SAFE_AFFILIATE, facts);
  writeJson("generation.json", {
    model: MODEL,
    variant: linted,
    raw: generated.raw,
    planHits,
    audit,
    knowledge,
    promotion,
    ctaDefault: DEFAULT_SAFE_CTA,
  });
  console.log("PLAN_VIOLATIONS", planHits.violations.length, "PRE_GATES", linted.grounding.status, linted.lint.gate, linted.finalGate);

  const policyBlocks = linted.lint.majorFindings.filter((f) => f.status === "fail" && f.blocking).map((f) => f.ruleId);
  const policyWarnings = linted.lint.majorFindings.filter((f) => f.status === "warn").map((f) => f.ruleId);
  const unauthorized = unauthorizedClosedTopics(audit);
  const failure = classifyFailure({
    planViolations: planHits.violations.length,
    unauthorizedTopics: unauthorized,
    knowledgeExpansion: knowledge.BACKGROUND_KNOWLEDGE_EXPANSION === "YES",
    usagePromotion: promotion.USAGE_PROMOTION === "YES",
    absenceCommentary: audit.ABSENCE_COMMENTARY.PRESENT === "YES",
    grounding: linted.grounding.status,
    policy: linted.lint.gate,
    contentGate: linted.finalGate,
    coverage: plan.coverage,
    unsupported: linted.grounding.unsupportedClaims,
    policyBlocks,
  });

  const pre = {
    GROUNDING: linted.grounding.status,
    UNSUPPORTED_CLAIMS: linted.grounding.unsupportedClaims,
    POLICY: linted.lint.gate,
    WARNINGS: policyWarnings,
    BLOCKS: policyBlocks,
    CONTENT_GATE: linted.finalGate,
  };
  writeJson("pre-composition-gates.json", pre);

  const successGates =
    planHits.violations.length === 0 &&
    knowledge.BACKGROUND_KNOWLEDGE_EXPANSION === "NO" &&
    promotion.USAGE_PROMOTION === "NO" &&
    audit.ABSENCE_COMMENTARY.PRESENT === "NO" &&
    linted.grounding.status === "GROUNDED" &&
    linted.lint.gate === "READY" &&
    linted.finalGate === "READY";

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
      IMPORT_QUALITY: facts.importQuality,
    },
    FACT_MANIFEST: {
      TOTAL: manifest.items.length,
      COPY_ELIGIBLE: manifest.items.filter((i) => i.copyEligible).length,
      NON_COPY_ELIGIBLE: manifest.promptFactNotCopyEligible,
    },
    GENERATION_PLAN: {
      THIN_MODE: plan.thinMode,
      COVERAGE: plan.coverage,
      ALLOWED_TOPICS: plan.allowedTopics,
      CLOSED_TOPICS: plan.closedTopics,
      ALLOWED_SECTIONS: plan.allowedSections,
      DISALLOWED_SECTIONS: plan.disallowedSections,
    },
    FIREWALL: {
      FAQ_SNIPPETS: firewall.FAQ_SNIPPETS,
      RAW_SOURCE_SNIPPETS: firewall.RAW_SOURCE_SNIPPETS,
      SERP_TITLES: firewall.SERP_TITLES,
      HEURISTIC_FACTS: firewall.HEURISTIC_FACTS,
      NOT_FOUND_FACTS: firewall.NOT_FOUND_FACTS,
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
      HEADLINE: linted.headline,
    },
    PLAN_VALIDATION: {
      VIOLATIONS: planHits.violations.length,
      DETAILS: planHits.violations,
    },
    SYNTHESIS_AUDIT: audit,
    FEATURE_PROMOTION: promotion,
    KNOWLEDGE_EXPANSION: knowledge,
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
      COMPOSITION: { EXECUTED: false, REASON: "CONTENT_GATE not READY or topic-budget/synthesis checks failed" },
      POST_COMPOSITION: { GROUNDING: null, POLICY: null, CONTENT_GATE: null },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO: mapGoNoGo(failure.PRIMARY),
      FINAL_STATUS: "CONTROLLED_READY_RUN_03_COMPLETE",
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
  const rendered = orderedVisibleSections(page).map((s) => s.id);
  const omittedDueToBudget = page.omitted.filter((item) =>
    ["Ingredients", "Usage", "Cautions", "Pricing", "Guarantee", "Manufacturer"].includes(item.component),
  );
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
      COMPOSITION: {
        EXECUTED: true,
        TEMPLATE: template,
        SECTIONS_RENDERED: rendered,
        SECTIONS_OMITTED_DUE_TO_FACT_BUDGET: omittedDueToBudget,
      },
      POST_COMPOSITION: { GROUNDING: post.grounding.status, POLICY: post.policy, CONTENT_GATE: post.finalGate },
      VISUAL_QA: { EXECUTED: false },
      WEB_ANATOMY: { EXECUTED: false },
      GO_NO_GO: "GENERATION_SYNTHESIS_NEEDS_FIX",
      FINAL_STATUS: "CONTROLLED_READY_RUN_03_COMPLETE",
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
    name: `${facts.productName} controlled ready 03 (DO NOT PUBLISH)`,
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
  const visualPass =
    visual.gate !== "FAIL" &&
    extra.mobile.href === VALIDATION_SAFE_HREF &&
    extra.publicStatus !== 200 &&
    !extra.mobile.overflowX &&
    !extra.desktop.overflowX &&
    extra.mobile.brokenImages === 0;
  writeJson("visual-qa.json", {
    gate: visual.gate,
    byWidth: visual.byWidth,
    extra,
    findingCount: visual.findings.length,
    failCount: visual.findings.filter((f) => f.severity === "HIGH").length,
    pass: visualPass,
  });

  let anatomy: ReturnType<typeof scoreAnatomy> | null = null;
  if (visualPass) {
    anatomy = extra.anatomy ? scoreAnatomy(extra.anatomy) : null;
    writeJson("web-anatomy-audit-only.json", anatomy);
  }

  const published = getPublishedCampaignBySlug(SLUG);
  const quality = premiumQuality({
    words: extra.anatomy?.words || linted.wordCount,
    visualPass,
    overflow: Boolean(extra.mobile.overflowX || extra.desktop.overflowX),
    emptySections: extra.mobile.emptySections.length,
    brokenImages: extra.mobile.brokenImages,
  });

  writeJson("REPORT.json", {
    ...baseReport,
    COMPOSITION: {
      EXECUTED: true,
      TEMPLATE: template,
      SECTIONS_RENDERED: rendered,
      SECTIONS_OMITTED_DUE_TO_FACT_BUDGET: omittedDueToBudget,
      PRODUCT_IMAGE_AVAILABLE: imageEligible,
    },
    POST_COMPOSITION: {
      GROUNDING: post.grounding.status,
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
      DESKTOP: extra.desktop,
      MOBILE: extra.mobile,
    },
    WEB_ANATOMY: visualPass && anatomy ? { EXECUTED: true, ...anatomy } : { EXECUTED: false },
    HUMAN_APPROVAL: "PENDING",
    PUBLICATION: {
      STATUS: campaign.publicationStatus,
      PUBLIC_ROUTE_AVAILABLE: Boolean(published),
      PUBLISH_ATTEMPTED: false,
      AFFILIATE_DESTINATION_OPENED: extra.mobile.href !== VALIDATION_SAFE_HREF,
    },
    GO_NO_GO: mapGoNoGo("NONE", visualPass),
    FINAL_STATUS: "CONTROLLED_READY_RUN_03_COMPLETE",
  });
  console.log("DONE", mapGoNoGo("NONE", visualPass));
}

main().catch((err) => {
  console.error(err);
  writeJson("ERROR.json", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  process.exit(1);
});
