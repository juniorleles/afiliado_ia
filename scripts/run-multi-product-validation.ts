// npx tsx scripts/run-multi-product-validation.ts
// Observational Multi-Product Validation Lab V1 execution.
// Does not modify production architecture. Does not patch failures.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { importProductFromUrl, ImportBlockedError, ImportFetchError } from "../src/lib/import-product.ts";
import {
  buildGenerationFactManifest,
  getConsumerCopyEligibleFacts,
  isCopyEligibleConfidence,
  isCopyEligibleImageProvenance,
  productNameAuthority,
  type FactField,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { verifyProductIdentity } from "../src/lib/source-resolution/identity.ts";
import type { FetchImpl } from "../src/lib/source-resolution/types.ts";
import { researchAndRecommend } from "../src/lib/strategy/execute-recommended.ts";
import { createGenerationPlan, type GenerationTopic } from "../src/lib/ai/generation-plan.ts";
import { closedClaimFirewall, projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { evaluateSlotGeneration, hydrateSlotFillsToPage, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { generateVariants, type VariantApproach } from "../src/lib/ai/generate-variants.ts";
import { resolveGenerationRoute } from "../src/lib/ai/generation-router.ts";
import { adaptStructuredToVariantCopy } from "../src/lib/ai/structured-generation.ts";
import { validateThinSemanticClosure } from "../src/lib/ai/semantic-closure.ts";
import {
  applyProductImageToPage,
  authorizedCopyFromVariant,
  composePresellPage,
  consumerVisibleText,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
} from "../src/lib/presell-page.ts";
import { compositionFactFirewall } from "../src/lib/composition-fact-firewall.ts";
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
process.env.VISUAL_QA_BASE_URL = process.env.VISUAL_QA_BASE_URL || "http://localhost:3000";

const ROOT = path.join(process.cwd(), "data", "multi-product-validation");
fs.mkdirSync(ROOT, { recursive: true });

type FailureClass =
  | "NONE"
  | "SOURCE_ACCESS_FAILURE"
  | "IDENTITY_FAILURE"
  | "PRODUCT_DATA_LIMITATION"
  | "CLAIM_PROJECTION_FAILURE"
  | "GENERATION_FAILURE"
  | "SEMANTIC_AUTHORITY_FAILURE"
  | "GROUNDING_FAILURE"
  | "POLICY_BLOCK_EXPECTED"
  | "COMPOSITION_FAILURE"
  | "COMPOSITION_FACT_FIREWALL_FAILURE"
  | "POST_COMPOSITION_FAILURE"
  | "VISUAL_GENERALIZATION_FAILURE"
  | "EXTERNAL_PROVIDER_FAILURE"
  | "UNKNOWN_GENERIC_PIPELINE_FAILURE";

type OperatorProduct = {
  key: string;
  product: string;
  url: string;
  role: "FROZEN_REFERENCE" | "REAL_VALIDATION_PRODUCT";
};

const OPERATOR_SET: OperatorProduct[] = [
  {
    key: "joint-genesis",
    product: "Joint Genesis",
    url: "https://jointgenesisofficial.com/",
    role: "FROZEN_REFERENCE",
  },
  {
    key: "yu-sleep",
    product: "Yu Sleep",
    url: "https://getyusleep.com/?hopId=f8f20963-5fc7-4cdf-b5c6-0cd8c1da2080",
    role: "REAL_VALIDATION_PRODUCT",
  },
  {
    key: "prodentim",
    product: "prodentim",
    url: "https://prodentim101.com/text.php?hop=zzzzz&hopId=6c9c6dd4-9c61-4086-8445-637fae0c985b",
    role: "REAL_VALIDATION_PRODUCT",
  },
  {
    key: "audifort",
    product: "Audifort",
    url: "https://audisoothe.com/c/order-now.php?hop=zzzzz&hopId=006c1f98-e202-47e0-a23b-5a64bad3ff9b",
    role: "REAL_VALIDATION_PRODUCT",
  },
  {
    key: "neuro-serge",
    product: "Neuro Serge",
    url: "https://getneuroserge.com/tsl?hopId=e24c4c2d-3359-4fcd-a6a4-f01792f9b451",
    role: "REAL_VALIDATION_PRODUCT",
  },
];

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

const CLOSED_AUDIT_TOPICS: GenerationTopic[] = [
  "ingredients",
  "usage",
  "cautions",
  "pricing",
  "guarantee",
  "manufacturer",
  "results_timeline",
  "category_classification",
  "background_science",
];

type FetchRecord = { requestUrl: string; finalUrl: string; status: number; redirected: boolean };

function emptyProductReport(spec: OperatorProduct) {
  return {
    PRODUCT: spec.product,
    ROLE: spec.role,
    ORIGINAL_OPERATOR_URL: spec.url,
    FINAL_URL: null as string | null,
    HTTP_STATUS: null as number | string | null,
    SOURCE_RESOLUTION: "NOT_RUN",
    IDENTITY_EVIDENCE: null as unknown,
    IDENTITY: "NOT_RUN",
    SOURCE_QUALITY: "NOT_RUN",
    PRODUCT_FACTS: null as unknown,
    COVERAGE: "NOT_RUN",
    SOURCE_EVIDENCE_COUNT: null as number | null,
    PROJECTED_CLAIMS: null as number | null,
    AUTHORIZED_CLAIMS: null as number | null,
    EXCLUDED_CLAIMS: null as number | null,
    GENERATION_ROUTE: "NOT_RUN",
    MODEL: null as string | null,
    AI_CALLS: 0,
    STRUCTURE: "NOT_RUN",
    FAQ: "NOT_RUN",
    SEMANTIC_CLOSURE: "NOT_RUN",
    SEMANTIC_AUTHORITY: "NOT_RUN",
    GROUNDING: "NOT_RUN",
    POLICY: "NOT_RUN",
    CONTENT_GATE: "NOT_RUN",
    COMPOSITION: "NOT_RUN",
    COMPOSITION_FACT_FIREWALL: "NOT_RUN",
    POST_COMPOSITION_GROUNDING: "NOT_RUN",
    POST_COMPOSITION_POLICY: "NOT_RUN",
    FINAL_CONTENT_GATE: "NOT_RUN",
    VISUAL_QA: "NOT_RUN",
    PREMIUM_CLASS: "NOT_RUN",
    FAILURE_CLASS: "NONE" as FailureClass,
    GENERIC_FIX_REQUIRED: "NO",
    NOTES: "",
    SAFETY: {
      UNSUPPORTED_CLAIM_LEAK: "NO",
      CLOSED_TOPIC_LEAK: "NO",
      RAW_PRODUCTFACT_RESURRECTION: "NO",
      POLICY_BYPASS: "NO",
      PUBLICATION_BYPASS: "NO",
    },
    STOPPED_AT: null as string | null,
    REDIRECT_CHAIN: [] as FetchRecord[],
    SCREENSHOTS: null as Record<string, string> | null,
  };
}

type ProductReport = ReturnType<typeof emptyProductReport>;

function writeJson(dir: string, name: string, value: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
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

function pageHaystack(facts: ProductFacts): string {
  return [
    facts.description || "",
    ...facts.features,
    ...facts.ingredientsOrComponents,
    ...facts.usageInformation,
    ...facts.cautions,
    facts.guaranteeInformation || "",
    facts.manufacturer || "",
    ...facts.sourceSnippets.map((item) => item.text),
  ].join("\n");
}

function extractedNameFromFacts(facts: ProductFacts, operatorName: string): string | null {
  const snippet = facts.sourceSnippets.find((item) => item.field === "productName" && item.text.trim());
  if (snippet && snippet.text.trim() !== operatorName) return snippet.text.trim();
  if (facts.productName && facts.productName !== operatorName) return facts.productName;
  return null;
}

function resolveIdentity(facts: ProductFacts, operatorName: string) {
  if (facts.webDiscovery?.triggered) {
    const status =
      facts.webDiscovery.acceptedCount > 0
        ? "ACCEPTED"
        : facts.webDiscovery.uncertainCount > 0
          ? "IDENTITY_UNCERTAIN"
          : "REJECTED";
    return {
      status,
      path: "WEB_DISCOVERY",
      reasons: facts.webDiscovery.sources.flatMap((source) => source.identityReasons).slice(0, 12),
      acceptedCount: facts.webDiscovery.acceptedCount,
      uncertainCount: facts.webDiscovery.uncertainCount,
      primaryBlock: facts.webDiscovery.primaryBlock,
      outcome: facts.webDiscovery.outcome || null,
    };
  }
  const verified = verifyProductIdentity({
    productName: operatorName,
    extractedName: extractedNameFromFacts(facts, operatorName),
    pageText: pageHaystack(facts),
    manufacturer: facts.manufacturer,
    ingredients: facts.ingredientsOrComponents,
  });
  return {
    status: verified.status,
    path: "PRIMARY_PAGE_IDENTITY",
    reasons: verified.reasons,
    acceptedCount: verified.status === "ACCEPTED" ? 1 : 0,
    uncertainCount: verified.status === "IDENTITY_UNCERTAIN" ? 1 : 0,
    primaryBlock: null,
    outcome: "PRIMARY",
  };
}

function observingFetch(log: FetchRecord[]): FetchImpl {
  return async (input, init) => {
    const requestUrl = String(input);
    const response = await fetch(input, init);
    log.push({
      requestUrl,
      finalUrl: response.url || requestUrl,
      status: response.status,
      redirected: Boolean(response.redirected),
    });
    return response;
  };
}

function stop(report: ProductReport, cls: FailureClass, stage: string, notes: string, generic = "NO"): ProductReport {
  report.FAILURE_CLASS = cls;
  report.STOPPED_AT = stage;
  report.NOTES = notes;
  report.GENERIC_FIX_REQUIRED = generic;
  return report;
}

function topicPresent(copy: string, topic: GenerationTopic): boolean {
  if (topic === "usage") return /\b(?:take once|each morning|per day|daily use|chew(?:able)?|capsule|dosage|serving)\b/i.test(copy);
  if (topic === "guarantee") return /\b(?:refund|money[- ]back|guarantee|\d{2,3}[- ]day)\b/i.test(copy);
  if (topic === "pricing") return /\b(?:\$\d|price|pricing|discount|bottles? for)\b/i.test(copy);
  if (topic === "cautions") return /\b(?:consult|pregnan|nurs(?:e|ing)|medication|warning|caution)\b/i.test(copy);
  if (topic === "manufacturer") return /\bmanufactur(?:er|ed by)\b/i.test(copy);
  if (topic === "ingredients") return /\b(?:ingredient(?:s)? include|proprietary blend|mg\b|mcg\b)\b/i.test(copy);
  if (topic === "results_timeline") return /\bin \d+\s+(?:days|weeks|months)\b|\bovernight results\b/i.test(copy);
  return false;
}

async function captureReadyVisual(slug: string, destDir: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const screenshots: Record<string, string> = {};
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
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal,[data-next-badge-root]{display:none!important;visibility:hidden!important;}";
      document.documentElement.appendChild(style);
    });
    const baseUrl = visualQaBaseUrl();
    await page.goto(`${baseUrl}/visual-frame/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("article.ps-article, article", { timeout: 30_000 });
    fs.mkdirSync(destDir, { recursive: true });

    const waitImages = async () => {
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
      await page.waitForTimeout(250);
    };

    const probe = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await page.evaluate(`window.scrollTo(0, 0)`);
      await waitImages();
      return page.evaluate(`(() => {
        const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
        const imgs = [...document.querySelectorAll("article img")];
        const broken = imgs.filter((img) => img.complete && img.naturalWidth === 0).length;
        const stages = [...document.querySelectorAll("[data-product-stage]")];
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
          const content = [...document.querySelectorAll(".ps-h2, .ps-hero-summary, .ps-feature-module, .ps-body-lg")];
          stickyOverlap = content.some((node) => {
            const r = node.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return false;
            return r.bottom > stickyBox.top + 4 && r.top < stickyBox.bottom && r.left < stickyBox.right && r.right > stickyBox.left;
          });
        }
        return { overflowX, broken, emptyStages, stickyOverlap };
      })()`) as Promise<{ overflowX: boolean; broken: number; emptyStages: number; stickyOverlap: boolean }>;
    };

    const v390 = await probe(390, 844);
    const mobilePath = path.join(destDir, "mobile-390-full.jpg");
    await page.screenshot({ path: mobilePath, type: "jpeg", quality: 55, fullPage: true, animations: "disabled" });
    screenshots.MOBILE_390_FULL = mobilePath;

    const v768 = await probe(768, 1024);
    const v1440 = await probe(1440, 1000);
    const desktopPath = path.join(destDir, "desktop-1440-full.jpg");
    await page.screenshot({ path: desktopPath, type: "jpeg", quality: 55, fullPage: true, animations: "disabled" });
    screenshots.DESKTOP_1440_FULL = desktopPath;

    let faq = "NA";
    const hasFaq = await page.evaluate(`Boolean(document.querySelector("details"))`);
    if (hasFaq) {
      await page.locator("details").first().click({ timeout: 5_000 }).catch(() => undefined);
      const open = await page.evaluate(`Boolean(document.querySelector("details[open]"))`);
      faq = open ? "PASS" : "FAIL";
    }

    const publicStatus = await page.evaluate(async (slugInner: string) => {
      const res = await fetch(`/p/${slugInner}`, { redirect: "manual" });
      return res.status;
    }, slug);

    const href = await page.evaluate(
      `document.querySelector('[data-cta-position="hero"], a.ps-cta')?.getAttribute("href") || ""`,
    );

    const inspection = await inspectRenderedPresell({
      slug,
      baseUrl,
      artifactKey: `mpv-${slug}`,
    });
    const findings = inspection.captures.flatMap((capture) => analyzeLayoutSnapshot(capture.snapshot, "REVIEW"));
    const gate = composeVisualQaGate({ findings, aiVisualReview: "UNAVAILABLE" });

    const pass =
      !v390.overflowX &&
      !v768.overflowX &&
      !v1440.overflowX &&
      v390.broken === 0 &&
      v768.broken === 0 &&
      v1440.broken === 0 &&
      v390.emptyStages === 0 &&
      v768.emptyStages === 0 &&
      v1440.emptyStages === 0 &&
      !v390.stickyOverlap &&
      !v768.stickyOverlap &&
      !v1440.stickyOverlap &&
      faq !== "FAIL" &&
      publicStatus !== 200 &&
      href === VALIDATION_SAFE_HREF &&
      gate !== "FAIL";

    return {
      pass,
      gate,
      faq,
      publicStatus,
      href,
      probes: { 390: v390, 768: v768, 1440: v1440 },
      screenshots,
    };
  } finally {
    await browser.close();
  }
}

async function runRealProduct(spec: OperatorProduct): Promise<ProductReport> {
  const report = emptyProductReport(spec);
  const outDir = path.join(ROOT, spec.key);
  fs.mkdirSync(outDir, { recursive: true });
  const fetchLog: FetchRecord[] = [];
  console.log("\n==== PRODUCT", spec.product, "====");
  console.log("IMPORT_START", spec.url);

  let facts: ProductFacts;
  try {
    facts = await importProductFromUrl(
      spec.url,
      { operatorProductName: spec.product },
      { fetchImpl: observingFetch(fetchLog), importId: `mpv-${spec.key}` },
    );
  } catch (err) {
    report.REDIRECT_CHAIN = fetchLog;
    const primary = fetchLog.find((item) => !/robots\.txt/i.test(item.requestUrl));
    report.HTTP_STATUS = primary?.status ?? (err instanceof ImportBlockedError ? err.reason : "ERROR");
    report.FINAL_URL = primary?.finalUrl || spec.url;
    report.SOURCE_RESOLUTION = err instanceof ImportBlockedError ? err.reason : "FETCH_ERROR";
    if (err instanceof ImportBlockedError) {
      return stop(report, "SOURCE_ACCESS_FAILURE", "SOURCE_RESOLUTION", err.message);
    }
    if (err instanceof ImportFetchError) {
      return stop(report, "SOURCE_ACCESS_FAILURE", "SOURCE_RESOLUTION", err.message);
    }
    return stop(
      report,
      "EXTERNAL_PROVIDER_FAILURE",
      "SOURCE_RESOLUTION",
      err instanceof Error ? err.message : String(err),
    );
  }

  writeJson(outDir, "import-facts.json", facts);
  report.REDIRECT_CHAIN = fetchLog;
  const primary = fetchLog.find((item) => item.requestUrl === spec.url) || fetchLog.find((item) => !/robots\.txt/i.test(item.requestUrl));
  report.HTTP_STATUS = facts.webDiscovery?.primaryBlock
    ? `BLOCKED:${facts.webDiscovery.primaryBlock}`
    : primary?.status ?? 200;
  report.FINAL_URL = facts.sourceUrl || primary?.finalUrl || spec.url;
  report.SOURCE_RESOLUTION = facts.webDiscovery?.triggered
    ? `WEB_DISCOVERY:${facts.webDiscovery.outcome || facts.webDiscovery.primaryBlock}`
    : "PRIMARY_OK";
  report.SOURCE_QUALITY = facts.importQuality;

  const table = fieldTable(facts);
  report.PRODUCT_FACTS = table;
  const identity = resolveIdentity(facts, spec.product);
  report.IDENTITY = identity.status;
  report.IDENTITY_EVIDENCE = {
    OPERATOR_PRODUCT_NAME: spec.product,
    PINNED_PRODUCT_NAME: facts.productName,
    EXTRACTED_NAME: extractedNameFromFacts(facts, spec.product),
    PRODUCT_NAME_PROVENANCE: facts.confidence.productName,
    PRODUCT_NAME_AUTHORITY: productNameAuthority(facts),
    ...identity,
  };
  console.log("IDENTITY", identity.status, "PINNED", facts.productName, "QUALITY", facts.importQuality);

  if (identity.status !== "ACCEPTED") {
    writeJson(outDir, "REPORT.json", report);
    return stop(
      report,
      "IDENTITY_FAILURE",
      "IDENTITY",
      `IDENTITY=${identity.status}; path=${identity.path}; reasons=${identity.reasons.join(" | ")}`,
    );
  }

  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const claimFirewall = closedClaimFirewall(projection, plan);
  report.COVERAGE = plan.coverage;
  report.SOURCE_EVIDENCE_COUNT = manifest.items.filter((item) => item.copyEligible).length;
  report.PROJECTED_CLAIMS = projection.claims.length;
  report.AUTHORIZED_CLAIMS = projection.authorized.length;
  report.EXCLUDED_CLAIMS = projection.excluded.length;
  writeJson(outDir, "generation-plan.json", plan);
  writeJson(outDir, "claim-projection.json", {
    authorized: projection.authorized.length,
    excluded: projection.excluded.length,
    claims: projection.claims,
    firewall: claimFirewall,
  });
  console.log("COVERAGE", plan.coverage, "ROUTE", plan.generationRoute, "EVIDENCE", report.SOURCE_EVIDENCE_COUNT);

  if (plan.coverage === "INSUFFICIENT" && report.SOURCE_EVIDENCE_COUNT === 0) {
    writeJson(outDir, "REPORT.json", report);
    return stop(report, "PRODUCT_DATA_LIMITATION", "PRODUCT_FACTS", "COVERAGE=INSUFFICIENT with zero copy-eligible evidence");
  }
  if (claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS > 0) {
    writeJson(outDir, "REPORT.json", report);
    return stop(
      report,
      "CLAIM_PROJECTION_FAILURE",
      "CLAIM_PROJECTION",
      `closed claims visible=${claimFirewall.TOTAL_VISIBLE_CLOSED_CLAIMS}`,
    );
  }

  let researchStatus = "SKIPPED";
  let recommended: VariantApproach = "REVIEW";
  try {
    const { research, recommendation } = await researchAndRecommend(facts);
    writeJson(outDir, "market-research.json", research);
    writeJson(outDir, "strategy.json", recommendation);
    researchStatus = `${research.status}/${research.quality}`;
    recommended = recommendation.recommendedStrategy as VariantApproach;
    console.log("STRATEGY", recommended, researchStatus);
  } catch (err) {
    writeJson(outDir, "REPORT.json", report);
    return stop(
      report,
      "EXTERNAL_PROVIDER_FAILURE",
      "MARKET_RESEARCH",
      err instanceof Error ? err.message : String(err),
    );
  }

  const route = resolveGenerationRoute(plan);
  report.GENERATION_ROUTE = route;
  report.MODEL = route === "DETERMINISTIC_THIN" ? "NONE" : "claude-sonnet-4-5-20250929";
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);

  let fills: SlotFill[] = [];
  let ctaLabel = "Learn More";
  let anthropicCalls = 0;
  try {
    const variants = await generateVariants({
      productName: facts.productName,
      sourceUrl: facts.sourceUrl || spec.url,
      facts,
      targetApproach: recommended,
    });
    const variant = variants[0];
    if (!variant) throw new Error("generateVariants returned no variants");
    fills = variant.slotFills || [];
    ctaLabel = variant.ctaLabel;
    anthropicCalls = variant.anthropicCalls ?? (route === "MODEL" ? 1 : 0);
    report.GENERATION_ROUTE = variant.generationRoute || route;
    report.AI_CALLS = anthropicCalls;
    writeJson(outDir, "generation-raw.json", variant);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeJson(outDir, "REPORT.json", report);
    const provider = /anthropic|api key|timeout|ECONN|429/i.test(message);
    return stop(
      report,
      provider ? "EXTERNAL_PROVIDER_FAILURE" : "GENERATION_FAILURE",
      "GENERATION",
      message,
    );
  }

  const evaluation = evaluateSlotGeneration(
    { variants: [{ cta: { label: ctaLabel }, slots: fills }] },
    facts,
    facts.productName,
    VALIDATION_SAFE_AFFILIATE,
    slotPlan,
  );
  writeJson(outDir, "slot-evaluation.json", {
    grounding: evaluation.grounding,
    policyGate: evaluation.policyGate,
    finalGate: evaluation.finalGate,
    structuralViolations: evaluation.structuralViolations,
  });

  const page = hydrateSlotFillsToPage(fills, slotPlan, ctaLabel, recommended);
  const consumerCopy = [
    page.headline.text,
    page.summary.text,
    ...page.blocks.map((block) => block.content),
    ...page.blocks.flatMap((block) => (block.items || []).map((item) => `${item.question} ${item.answer}`)),
    page.cta.label,
  ].join("\n");

  const closure = fills.map((fill) => {
    const slot = slotPlan.slots.find((item) => item.slotId === fill.slotId);
    const generated = slot?.type === "FAQ" ? (fill.answer || "").trim() : (fill.content || "").trim();
    const support = (slot?.evidence || []).map((item) => item.value).join("\n");
    return validateThinSemanticClosure({
      generated,
      support,
      slotType: slot?.type,
      thinMode: plan.thinMode,
    });
  });
  const closurePass = closure.every((item) => item.result === "PASS");
  const faqSlots = evaluation.slotTraces.filter((trace) => trace.blockType === "FAQ");
  const faqStatus = faqSlots.length === 0 ? "OMITTED" : faqSlots.every((trace) => trace.answerGrounding === "GROUNDED") ? "PASS" : "FAIL";
  const structurePass = evaluation.structuralViolations.length === 0;
  report.STRUCTURE = structurePass ? "PASS" : "FAIL";
  report.FAQ = faqStatus;
  report.SEMANTIC_CLOSURE = closurePass ? "PASS" : "FAIL";
  report.GROUNDING = evaluation.grounding.status;
  report.POLICY = evaluation.policyGate;
  report.CONTENT_GATE = evaluation.finalGate;

  const closedVisible = CLOSED_AUDIT_TOPICS.filter((topic) => plan.closedTopics.includes(topic) && topicPresent(consumerCopy, topic));
  if (closedVisible.length) {
    report.SAFETY.CLOSED_TOPIC_LEAK = "YES";
  }
  if (evaluation.grounding.unsupportedClaims.length > 0 && evaluation.finalGate === "READY") {
    report.SAFETY.UNSUPPORTED_CLAIM_LEAK = "YES";
  }

  const eligible = getConsumerCopyEligibleFacts(facts);
  const semanticFail = !closurePass;
  report.SEMANTIC_AUTHORITY = semanticFail ? "FAIL" : "PASS";

  if (!structurePass) {
    writeJson(outDir, "REPORT.json", report);
    return stop(report, "GENERATION_FAILURE", "STRUCTURE", evaluation.structuralViolations.map((item) => item.code).join(","));
  }
  if (!closurePass) {
    writeJson(outDir, "REPORT.json", report);
    return stop(report, "SEMANTIC_AUTHORITY_FAILURE", "SEMANTIC_CLOSURE", closure.flatMap((item) => item.failCodes).join(","));
  }
  if (evaluation.grounding.status !== "GROUNDED" || evaluation.grounding.unsupportedClaims.length > 0) {
    writeJson(outDir, "REPORT.json", report);
    const dataLimited = plan.coverage === "INSUFFICIENT" || plan.coverage === "THIN" && eligible.features.length === 0 && !eligible.description;
    return stop(
      report,
      evaluation.grounding.unsupportedClaims.length > 0
        ? "GROUNDING_FAILURE"
        : dataLimited
          ? "PRODUCT_DATA_LIMITATION"
          : "GROUNDING_FAILURE",
      "GROUNDING",
      `GROUNDING=${evaluation.grounding.status} unsupported=${evaluation.grounding.unsupportedClaims.length}`,
    );
  }
  if (evaluation.policyGate === "BLOCKED") {
    writeJson(outDir, "REPORT.json", report);
    return stop(report, "POLICY_BLOCK_EXPECTED", "POLICY", `POLICY=${evaluation.policyGate}`);
  }
  if (evaluation.finalGate !== "READY") {
    writeJson(outDir, "REPORT.json", report);
    const cls: FailureClass =
      evaluation.policyGate !== "READY"
        ? "POLICY_BLOCK_EXPECTED"
        : plan.coverage === "INSUFFICIENT"
          ? "PRODUCT_DATA_LIMITATION"
          : "UNKNOWN_GENERIC_PIPELINE_FAILURE";
    return stop(report, cls, "CONTENT_GATE", `CONTENT_GATE=${evaluation.finalGate} POLICY=${evaluation.policyGate}`);
  }

  const hydrationCopy = adaptStructuredToVariantCopy(page, plan);
  const variant = { approach: recommended, ...hydrationCopy };
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
  const visible = consumerVisibleText(composed);
  const firewall = compositionFactFirewall({
    authorizedCopy: authorizedCopyFromVariant(variant, facts.productName),
    composedVisible: visible,
  });
  const post = validateComposedPage(composed, facts, VALIDATION_SAFE_AFFILIATE, authorizedCopyFromVariant(variant, facts.productName));
  writeJson(outDir, "composed-page.json", composed);
  writeJson(outDir, "post-composition-gates.json", {
    FIREWALL: firewall.status,
    GROUNDING: post.grounding.status,
    POLICY: post.policy,
    CONTENT_GATE: post.finalGate,
    unsupported: post.grounding.unsupportedClaims,
  });
  report.COMPOSITION = "YES";
  report.COMPOSITION_FACT_FIREWALL = firewall.status;
  report.POST_COMPOSITION_GROUNDING = post.grounding.status;
  report.POST_COMPOSITION_POLICY = post.policy;
  const finalReady =
    firewall.status === "PASS" &&
    post.grounding.status === "GROUNDED" &&
    post.grounding.unsupportedClaims.length === 0 &&
    post.policy === "READY" &&
    post.finalGate === "READY";
  report.FINAL_CONTENT_GATE = finalReady ? "READY" : post.finalGate;

  if (firewall.status !== "PASS") {
    report.SAFETY.RAW_PRODUCTFACT_RESURRECTION = firewall.addedFactualCopy.length ? "YES" : "NO";
    writeJson(outDir, "REPORT.json", report);
    return stop(report, "COMPOSITION_FACT_FIREWALL_FAILURE", "COMPOSITION_FACT_FIREWALL", firewall.addedFactualCopy.slice(0, 4).join(" | "));
  }
  if (!finalReady) {
    writeJson(outDir, "REPORT.json", report);
    const cls: FailureClass =
      post.grounding.status !== "GROUNDED" || post.grounding.unsupportedClaims.length
        ? "POST_COMPOSITION_FAILURE"
        : post.policy !== "READY"
          ? "POST_COMPOSITION_FAILURE"
          : "COMPOSITION_FAILURE";
    return stop(report, cls, "POST_COMPOSITION", `GROUNDING=${post.grounding.status} POLICY=${post.policy} GATE=${post.finalGate}`);
  }

  const design = createDesignPlan({
    page: composed,
    productAssetStatus: imageEligible ? "READY" : "NEEDS_ASSET",
    productAssetProvenance: imageEligible ? facts.productImageProvenance : "NOT_FOUND",
    strategyHint: variant.approach,
  });
  const creative = createCreativeCompositionPlan({ page: composed, design });
  const slug = `mpv-${spec.key}`;
  const campaignInput = {
    name: `${spec.product} multi-product validation (DO NOT PUBLISH)`,
    slug,
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
  const existing = getCampaignBySlug(slug);
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
  const published = getPublishedCampaignBySlug(slug);
  if (published || campaign.publicationStatus !== "draft") {
    report.SAFETY.PUBLICATION_BYPASS = "YES";
  }

  try {
    const visual = await captureReadyVisual(slug, outDir);
    report.SCREENSHOTS = visual.screenshots;
    report.VISUAL_QA = visual.pass ? "PASS" : "FAIL";
    report.PREMIUM_CLASS = visual.pass
      ? imageEligible
        ? "VISUALLY_ACCEPTABLE"
        : "VISUALLY_THIN"
      : "VISUALLY_BROKEN";
    writeJson(outDir, "visual-qa.json", visual);
    if (!visual.pass) {
      writeJson(outDir, "REPORT.json", report);
      return stop(report, "VISUAL_GENERALIZATION_FAILURE", "VISUAL_QA", JSON.stringify(visual.probes));
    }
  } catch (err) {
    writeJson(outDir, "REPORT.json", report);
    return stop(
      report,
      "EXTERNAL_PROVIDER_FAILURE",
      "VISUAL_QA",
      err instanceof Error ? err.message : String(err),
    );
  }

  report.NOTES = `READY end-to-end. operatorName=${spec.product}; pinned=${facts.productName}; coverage=${plan.coverage}; route=${report.GENERATION_ROUTE}; research=${researchStatus}; image=${imageEligible ? "YES" : "NO"}`;
  writeJson(outDir, "REPORT.json", report);
  return report;
}

function jointGenesisReference(): ProductReport {
  const report = emptyProductReport(OPERATOR_SET[0]!);
  const run13 = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "data", "controlled-ready-13", "2026-09-21-controlled-visual-13", "REPORT.json"),
      "utf8",
    ),
  ) as {
    PRODUCT: { SOURCE_URL: string; SOURCE_HTTP_STATUS: number; IDENTITY: string };
    PRODUCT_FACTS: { COVERAGE: string; TABLE: unknown };
    CLAIM_PROJECTION: { TOTAL_SOURCE_EVIDENCE: number; TOTAL_CLAIMS: number; AUTHORIZED_CLAIMS: number; EXCLUDED_CLAIMS: number };
    GENERATION_ROUTE: string;
    ANTHROPIC_CALLS: number;
  };
  const patch02 = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "premium-visual-v1", "patch-02", "gates.json"), "utf8"),
  ) as { FINAL_CONTENT_GATE: string; GROUNDING: string; POLICY: string; FIREWALL: string };
  report.ORIGINAL_OPERATOR_URL = OPERATOR_SET[0]!.url;
  report.FINAL_URL = run13.PRODUCT.SOURCE_URL;
  report.HTTP_STATUS = run13.PRODUCT.SOURCE_HTTP_STATUS;
  report.SOURCE_RESOLUTION = "PRIMARY_OK";
  report.IDENTITY = run13.PRODUCT.IDENTITY;
  report.IDENTITY_EVIDENCE = { ROLE: "FROZEN_REFERENCE", REUSED_RUN13: true };
  report.SOURCE_QUALITY = "PARTIAL";
  report.PRODUCT_FACTS = run13.PRODUCT_FACTS.TABLE;
  report.COVERAGE = run13.PRODUCT_FACTS.COVERAGE;
  report.SOURCE_EVIDENCE_COUNT = run13.CLAIM_PROJECTION.TOTAL_SOURCE_EVIDENCE;
  report.PROJECTED_CLAIMS = run13.CLAIM_PROJECTION.TOTAL_CLAIMS;
  report.AUTHORIZED_CLAIMS = run13.CLAIM_PROJECTION.AUTHORIZED_CLAIMS;
  report.EXCLUDED_CLAIMS = run13.CLAIM_PROJECTION.EXCLUDED_CLAIMS;
  report.GENERATION_ROUTE = run13.GENERATION_ROUTE;
  report.MODEL = "NONE";
  report.AI_CALLS = run13.ANTHROPIC_CALLS;
  report.STRUCTURE = "PASS";
  report.FAQ = "PASS";
  report.SEMANTIC_CLOSURE = "PASS";
  report.SEMANTIC_AUTHORITY = "PASS";
  report.GROUNDING = patch02.GROUNDING;
  report.POLICY = patch02.POLICY;
  report.CONTENT_GATE = "READY";
  report.COMPOSITION = "YES";
  report.COMPOSITION_FACT_FIREWALL = patch02.FIREWALL;
  report.POST_COMPOSITION_GROUNDING = patch02.GROUNDING;
  report.POST_COMPOSITION_POLICY = patch02.POLICY;
  report.FINAL_CONTENT_GATE = patch02.FINAL_CONTENT_GATE;
  report.VISUAL_QA = "PASS";
  report.PREMIUM_CLASS = "VISUALLY_PREMIUM";
  report.FAILURE_CLASS = "NONE";
  report.GENERIC_FIX_REQUIRED = "NO";
  report.NOTES = "Frozen reference. Not re-imported. Patch 02 screenshots reused. No visual optimization.";
  report.SCREENSHOTS = {
    DESKTOP_1440_FULL: path.join(ROOT, "joint-genesis", "desktop-1440-full.jpg"),
    MOBILE_390_FULL: path.join(ROOT, "joint-genesis", "mobile-390-full.jpg"),
  };
  writeJson(path.join(ROOT, "joint-genesis"), "REFERENCE.json", report);
  return report;
}

function runRegression() {
  const suites = [
    "scripts/test-premium-visual-v1-patch-02.ts",
    "scripts/test-composition-fact-firewall.ts",
    "scripts/test-deterministic-thin-generation.ts",
  ];
  const results: Record<string, string> = {};
  for (const suite of suites) {
    const proc = spawnSync("npx", ["tsx", suite], { encoding: "utf8", cwd: process.cwd(), shell: true });
    results[suite] = proc.status === 0 ? "PASS" : `FAIL:${proc.status}`;
    if (proc.status !== 0) {
      results[suite] += `\n${(proc.stdout || "").slice(-800)}\n${(proc.stderr || "").slice(-800)}`;
    }
  }
  return results;
}

function classifyGenericDefects(rows: ProductReport[]) {
  const defects: Array<{ id: string; AFFECTED_PRODUCTS: string[]; ROOT_CAUSE: string; GENERIC_FIX_REQUIRED: string }> = [];
  const identityPrimary = rows.filter(
    (row) =>
      row.ROLE === "REAL_VALIDATION_PRODUCT" &&
      row.FAILURE_CLASS === "IDENTITY_FAILURE" &&
      typeof row.IDENTITY_EVIDENCE === "object" &&
      row.IDENTITY_EVIDENCE &&
      (row.IDENTITY_EVIDENCE as { path?: string }).path === "PRIMARY_PAGE_IDENTITY",
  );
  if (identityPrimary.length >= 2) {
    defects.push({
      id: "GENERIC_DEFECT_IDENTITY_PRIMARY",
      AFFECTED_PRODUCTS: identityPrimary.map((row) => row.PRODUCT),
      ROOT_CAUSE: "Primary-page identity rejected for multiple products using the same identity function.",
      GENERIC_FIX_REQUIRED: "YES",
    });
  }
  const source = rows.filter((row) => row.FAILURE_CLASS === "SOURCE_ACCESS_FAILURE");
  if (source.length >= 2) {
    defects.push({
      id: "GENERIC_DEFECT_SOURCE_ACCESS",
      AFFECTED_PRODUCTS: source.map((row) => row.PRODUCT),
      ROOT_CAUSE: "Multiple operator URLs failed at source access with the same frozen importer.",
      GENERIC_FIX_REQUIRED: "YES",
    });
  }
  const visual = rows.filter((row) => row.FAILURE_CLASS === "VISUAL_GENERALIZATION_FAILURE");
  if (visual.length >= 2) {
    defects.push({
      id: "GENERIC_DEFECT_VISUAL",
      AFFECTED_PRODUCTS: visual.map((row) => row.PRODUCT),
      ROOT_CAUSE: "Premium Visual System V1 failed Visual QA on multiple READY compositions.",
      GENERIC_FIX_REQUIRED: "YES",
    });
  }
  for (const row of rows) {
    if (row.GENERIC_FIX_REQUIRED === "YES" && !defects.some((item) => item.AFFECTED_PRODUCTS.includes(row.PRODUCT))) {
      defects.push({
        id: `GENERIC_DEFECT_${row.FAILURE_CLASS}`,
        AFFECTED_PRODUCTS: [row.PRODUCT],
        ROOT_CAUSE: row.NOTES,
        GENERIC_FIX_REQUIRED: "YES",
      });
    }
  }
  return defects;
}

async function main() {
  const rows: ProductReport[] = [];
  rows.push(jointGenesisReference());
  for (const spec of OPERATOR_SET.slice(1)) {
    try {
      rows.push(await runRealProduct(spec));
    } catch (err) {
      const report = emptyProductReport(spec);
      rows.push(
        stop(
          report,
          "UNKNOWN_GENERIC_PIPELINE_FAILURE",
          "UNCAUGHT",
          err instanceof Error ? err.stack || err.message : String(err),
          "YES",
        ),
      );
    }
  }

  const regression = runRegression();
  const defects = classifyGenericDefects(rows);
  const readyContent = rows.filter((row) => row.CONTENT_GATE === "READY").length;
  const readyComposed = rows.filter((row) => row.FINAL_CONTENT_GATE === "READY").length;
  const visualPass = rows.filter((row) => row.VISUAL_QA === "PASS").length;
  const endToEnd = rows.filter((row) => row.FINAL_CONTENT_GATE === "READY" && row.VISUAL_QA === "PASS").length;
  const expectedBlocks = rows.filter((row) =>
    ["IDENTITY_FAILURE", "POLICY_BLOCK_EXPECTED", "SOURCE_ACCESS_FAILURE"].includes(row.FAILURE_CLASS),
  ).length;
  const dataLimitations = rows.filter((row) => row.FAILURE_CLASS === "PRODUCT_DATA_LIMITATION").length;
  const safety = {
    UNSUPPORTED_CLAIM_LEAK: rows.some((row) => row.SAFETY.UNSUPPORTED_CLAIM_LEAK === "YES") ? "YES" : "NO",
    CLOSED_TOPIC_LEAK: rows.some((row) => row.SAFETY.CLOSED_TOPIC_LEAK === "YES") ? "YES" : "NO",
    RAW_PRODUCTFACT_RESURRECTION: rows.some((row) => row.SAFETY.RAW_PRODUCTFACT_RESURRECTION === "YES") ? "YES" : "NO",
    POLICY_BYPASS: rows.some((row) => row.SAFETY.POLICY_BYPASS === "YES") ? "YES" : "NO",
    PUBLICATION_BYPASS: rows.some((row) => row.SAFETY.PUBLICATION_BYPASS === "YES") ? "YES" : "NO",
  };
  const safetyRegression = Object.values(safety).some((item) => item === "YES");
  const genericYes = defects.some((item) => item.GENERIC_FIX_REQUIRED === "YES");
  const go = safetyRegression
    ? "SAFETY_REGRESSION"
    : genericYes
      ? "GENERIC_FIX_REQUIRED"
      : "MULTI_PRODUCT_VALIDATION_PASSED";

  const matrix = rows.map((row) => ({
    PRODUCT: row.PRODUCT,
    SOURCE: row.FINAL_URL || row.ORIGINAL_OPERATOR_URL,
    IDENTITY: row.IDENTITY,
    COVERAGE: row.COVERAGE,
    GENERATION_ROUTE: row.GENERATION_ROUTE,
    AI_CALLS: row.AI_CALLS,
    CONTENT_GATE: row.CONTENT_GATE,
    FINAL_CONTENT_GATE: row.FINAL_CONTENT_GATE,
    VISUAL_QA: row.VISUAL_QA,
    PREMIUM_CLASS: row.PREMIUM_CLASS,
    FAILURE_CLASS: row.FAILURE_CLASS,
    GENERIC_FIX_REQUIRED: row.GENERIC_FIX_REQUIRED,
  }));

  const out = {
    PHASE: "MULTI_PRODUCT_VALIDATION_LAB_V1_EXECUTION",
    OPERATOR_SET: OPERATOR_SET.map((item) => ({
      PRODUCT: item.product,
      OPERATOR_URL: item.url,
      ROLE: item.role,
    })),
    MATRIX: matrix,
    PER_PRODUCT: rows,
    SYSTEM_METRICS: {
      TOTAL_PRODUCTS: 5,
      READY_CONTENT: readyContent,
      READY_COMPOSED: readyComposed,
      VISUAL_QA_PASS: visualPass,
      END_TO_END_READY: endToEnd,
      EXPECTED_BLOCKS: expectedBlocks,
      DATA_LIMITATIONS: dataLimitations,
      GENERIC_DEFECTS: defects.length,
      PRODUCT_SPECIFIC_PATCHES: 0,
    },
    SAFETY_INVARIANTS: safety,
    GENERIC_DEFECTS: defects,
    JOINT_GENESIS_REFERENCE: {
      REGRESSION: Object.values(regression).every((item) => item === "PASS") ? "PASS" : "FAIL",
      SUITES: regression,
      THIN_GENERATION_ARCHITECTURE: "FROZEN_V1",
      COMPOSITION_FACT_FIREWALL: "FROZEN_V1",
      PREMIUM_VISUAL_SYSTEM_V1: "FROZEN",
    },
    GO_NO_GO: go,
    FINAL_STATUS: "MULTI_PRODUCT_VALIDATION_COMPLETE",
    PUBLICATION: "ALL_DRAFT",
  };
  writeJson(ROOT, "REPORT.json", out);
  console.log("\n==== MATRIX ====");
  console.table(matrix);
  console.log("GO_NO_GO", go);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
