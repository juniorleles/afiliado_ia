// npx tsx scripts/run-lp-generator-53c.ts
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import {
  EXECUTION_53C_ID,
  MAX_TOTAL_COST_USD,
  PAID_COPY_TIMEOUT_MS,
  budgetStore,
  closeAuthorization,
  conservativeInputTokens,
  createBudgetGatedCopyCaller,
  openExecutionLedger,
  paidCallsBlocked,
  readLedger,
  reservePaidCall,
  setEnvLocalFlag,
} from "../src/lib/lp-generator/ai-copy/budget.ts";
import { envLookup, envValuePresent, resolveCopyProvider } from "../src/lib/lp-generator/ai-copy/config.ts";
import { createOpenAiCopyCaller, diagnoseAiProvider } from "../src/lib/lp-generator/ai-copy/provider.ts";
import { buildCommercialCopyPrompt } from "../src/lib/lp-generator/ai-copy/prompt.ts";
import { AI_COMMERCIAL_COPY_SCHEMA } from "../src/lib/lp-generator/ai-copy/schema.ts";
import { resolveCommercialCopy } from "../src/lib/lp-generator/ai-copy/resolve.ts";
import { repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import type { StructuredResearch } from "../src/lib/lp-generator/structure.ts";
import { evaluateGenerationGates, pipelineDefects } from "../src/lib/lp-generator/gates.ts";
import {
  DEFAULT_GENERATION_ROOT,
  emptyRecord,
  readGeneration,
  readGenerationModel,
  writeGeneration,
  writeGenerationModel,
} from "../src/lib/lp-generator/store.ts";
import { generationHash } from "../src/lib/lp-generator/input.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { offlineCopyAdapter } from "../src/lib/page-blueprint/adapter.ts";
import { composeV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { productKeyFromName } from "../src/lib/real-product-assets/extract.ts";
import { readCatalog } from "../src/lib/real-product-assets/store.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { ConversionBrief } from "../src/lib/conversion-strategy/types.ts";
import type { SalesCopy } from "../src/lib/page-blueprint/types.ts";

const PREV_ID = "lp-mvjujouq-a42c9bc9";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-53c-openai-real-test");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const FORBIDDEN =
  /clinically proven|doctors worldwide|verified buyer|★★|testimonial|limited time|%\s*off|best greens|immune support complex|erases wrinkles|never needs charging|recommended by doctors/i;

function envKeyNamed(name: string): boolean {
  return envValuePresent(name);
}

function writeJson(name: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

function copySnapshot(copy: SalesCopy) {
  return {
    producer: copy.producer,
    headline: copy.headline.text,
    subheadline: copy.subheadline?.text ?? null,
    introduction: copy.introduction.text,
    sections: copy.sections.map((section) => ({
      type: section.sectionType,
      headline: section.headline.text,
      items: section.items.map((item) => item.text.text),
      body: section.body.map((item) => item.text),
    })),
    faq: copy.faq.map((item) => ({ question: item.question.text, answer: item.answer.text })),
    cta: { action: copy.cta.action, label: copy.cta.label?.text ?? null },
  };
}

function researchFromContract(contract: ProductContract, brief: ConversionBrief): StructuredResearch {
  return {
    productName: contract.identity.productName,
    category: contract.identity.productKind ?? brief.productCategory,
    description: contract.description?.text,
    ingredients: (contract.components ?? []).map((item) => item.name),
    features: (contract.features ?? []).map((item) => item.text),
    sellerClaims: (contract.benefits ?? []).map((item) => item.text),
    verifiedFacts: [
      ...(contract.specifications ?? []).map((item) => `${item.name}: ${item.value}`),
      ...(contract.usage ?? []).map((item) => item.text),
    ],
    usage: (contract.usage ?? []).map((item) => item.text),
    offers: [],
    specifications: [],
    purchaseLink: null,
    dropped: [],
  };
}

function restorePaidFlag(): { previous: string | null; final: string } {
  const result = setEnvLocalFlag("AIA_ALLOW_PAID_AI", "0");
  return { previous: result.previous, final: envLookup("AIA_ALLOW_PAID_AI") || "0" };
}

async function capturePreview(generationId: string, headline: string) {
  mkdirSync(SHOTS, { recursive: true });
  const previewPath = `/admin/lab/lp-generator/${generationId}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const preview = await page.goto(`${BASE}${previewPath}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]"));
      return imgs.length === 0 || imgs.every((img) => img.complete);
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(600);
  const desktop = await page.evaluate((expectedHeadline: string) => {
    const root = document.documentElement;
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]"));
    return {
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      headlineMatches: (document.querySelector("h1")?.textContent ?? "").includes(expectedHeadline),
      overflowX: root.scrollWidth > root.clientWidth + 2,
      hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
      loadedImages: imgs.filter((img) => img.complete && img.naturalWidth > 0).length,
      imageAlts: imgs.map((img) => img.alt),
    };
  }, headline);
  await page.screenshot({ path: path.join(SHOTS, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => {
    const root = document.documentElement;
    return { overflowX: root.scrollWidth > root.clientWidth + 2 };
  });
  await page.screenshot({ path: path.join(SHOTS, "femicore-mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  return {
    previewStatus: preview?.status() ?? null,
    previewUrl: `${BASE}${previewPath}`,
    desktop,
    mobile,
    screenshots: ["screenshots/femicore-desktop-1440.jpg", "screenshots/femicore-mobile-390.jpg"],
  };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }

  const envCheck = {
    OPENAI_API_KEY: envKeyNamed("OPENAI_API_KEY") ? "present" : "absent",
    AI_PROVIDER: envLookup("AI_PROVIDER") || "(unset)",
    AI_MODEL: envLookup("AI_MODEL") || "(unset)",
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
  };
  const diagnosis = diagnoseAiProvider();
  const selection = resolveCopyProvider();
  writeJson("env-check.json", { envCheck, diagnosis, selection, paidCallInThisStep: false });
  if (envCheck.OPENAI_API_KEY !== "present") throw new Error("OPENAI_API_KEY is missing.");
  if (selection.provider !== "openai" || selection.model !== "gpt-5-mini") {
    throw new Error(`Unexpected provider/model: ${selection.provider} ${selection.model}`);
  }

  const previous = readGeneration(PREV_ID);
  const previousModel = readGenerationModel(PREV_ID);
  if (!previous || !previousModel) throw new Error(`Missing previous generation ${PREV_ID}.`);

  const productKey = productKeyFromName("FemiCore");
  const catalogBefore = readCatalog(productKey);
  const approvedBefore = (catalogBefore?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id);
  writeJson("approved-assets-before.json", { productKey, approvedCount: approvedBefore.length, ids: approvedBefore });

  const research = researchFromContract(previousModel.contract, previousModel.brief);
  const prompt = buildCommercialCopyPrompt({
    contract: previousModel.contract,
    brief: previousModel.brief,
    research,
    language: "en",
    market: "US",
  });
  const inputTokensConservative = conservativeInputTokens([
    prompt.system,
    prompt.user,
    JSON.stringify(AI_COMMERCIAL_COPY_SCHEMA),
  ]);

  const store = budgetStore(EXECUTION_53C_ID);
  const ledgerOpen = openExecutionLedger(store);
  writeJson("budget-ledger-open.json", ledgerOpen);
  const reserved = reservePaidCall(store, { inputTokensConservative, model: "gpt-5-mini" });
  writeJson("budget-reservation.json", reserved);
  if (!reserved.ok) {
    const closed = closeAuthorization(store, "Blocked before the paid call.");
    const flag = restorePaidFlag();
    writeJson("report.json", {
      EXECUTION_53C_STATUS: "BLOCKED_BEFORE_CALL",
      OPENAI_REAL_EXECUTION_STATUS: reserved.reason,
      BUDGET_STATUS: reserved.reason,
      AUTHORIZATION_FINAL_STATUS: closed.status,
      AIA_ALLOW_PAID_AI_FINAL_VALUE: flag.final,
      PAID_REQUEST_COUNT: 0,
      DISK_FREE_GB: free,
    });
    console.log(JSON.stringify({ ok: false, reason: reserved.reason, worstCaseUsd: reserved.ledger.reserved?.worstCaseUsd }, null, 2));
    return;
  }

  const id = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const now = () => new Date().toISOString();
  const record = emptyRecord(previous.input, id, generationHash(previous.input), now());
  record.productKey = productKey;
  record.assets.productKey = productKey;
  record.previewPath = `/admin/lab/lp-generator/${id}/preview`;
  record.limitations = [
    "HopLink placeholder rejected. Preview has no purchase CTA.",
    "No authorized HopLink was supplied. The landing page stays in preview mode.",
    "Copy refresh reused the verified 53B contract, brief and research slots. No new image approvals were made.",
  ];
  writeGeneration(record);

  const gated = createBudgetGatedCopyCaller({
    store,
    inner: createOpenAiCopyCaller(),
  });

  let browser: Awaited<ReturnType<typeof capturePreview>> | null = null;
  try {
    record.status = "GENERATING_COPY";
    writeGeneration(record);
    const resolved = await resolveCommercialCopy({
      copy: previousModel.copy,
      contract: previousModel.contract,
      brief: previousModel.brief,
      research,
      language: "en",
      market: "US",
      caller: gated,
      timeoutMs: PAID_COPY_TIMEOUT_MS,
    });
    const repaired = repairContentQuality({
      copy: resolved.copy,
      contract: previousModel.contract,
      brief: previousModel.brief,
    });
    const { copy, blueprint } = buildPageBlueprint({
      contract: previousModel.contract,
      brief: previousModel.brief,
      copy: repaired.copy,
      adapter: offlineCopyAdapter(),
    });
    const catalog = readCatalog(productKey);
    const composed = composeV4Model({
      scenarioKey: id,
      contract: previousModel.contract,
      brief: previousModel.brief,
      copy,
      blueprint,
    });
    const model = overlayApprovedAssets(composed, catalog);
    writeGenerationModel(id, model);
    const defects = [
      ...pipelineDefects({
        contract: previousModel.contract,
        brief: previousModel.brief,
        copy,
        blueprint,
        model,
        catalog,
      }),
      ...repaired.defects,
    ];
    const evaluated = evaluateGenerationGates({ defects, contentQuality: repaired.status });
    record.ai = {
      provider: resolved.run.provider,
      model: resolved.run.model,
      status: resolved.run.status,
      fallbackUsed: resolved.run.fallbackUsed,
      latencyMs: resolved.run.latencyMs,
      costEstimate: resolved.run.costEstimate,
      usage: resolved.run.usage ?? null,
      requestId: resolved.run.requestId ?? null,
      costUsd: resolved.run.costUsd ?? null,
      costStatus: resolved.run.costStatus ?? null,
    };
    record.copy = {
      producer: copy.producer,
      aiUsed: resolved.run.status === "USED",
      aiConfigured: true,
      headline: copy.headline.text,
      sectionCount: copy.sections.length,
    };
    record.gateLabels = evaluated.labels;
    record.gates = evaluated.gates;
    record.defects = defects;
    record.assets.approvedAvailable = catalog?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0;
    record.assets.approvedUsed = [
      ...(model.commercialImage
        ? [{ id: model.commercialImage.src.split("/").pop() ?? "", src: model.commercialImage.src, role: "hero" as const, status: "USER_APPROVED" as const }]
        : []),
      ...(model.galleryImages ?? []).map((image) => ({
        id: image.src.split("/").pop() ?? "",
        src: image.src,
        role: "gallery" as const,
        status: "USER_APPROVED" as const,
      })),
    ].filter((item) => item.id);
    record.status = evaluated.labels.CONTENT_PASS ? "PREVIEW_READY" : "NEEDS_REVIEW";
    if (resolved.run.fallbackUsed) {
      record.limitations.push(`AI copy did not apply (${resolved.run.status}). Deterministic commercial copy was used.`);
    }
    if (repaired.repairs.length) record.limitations.push(`Content quality repairs: ${repaired.repairs.join("; ")}.`);
    writeGeneration(record);

    const afterCatalog = readCatalog(productKey);
    const approvedAfter = (afterCatalog?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id);
    writeJson("approved-assets-after.json", { productKey, approvedCount: approvedAfter.length, ids: approvedAfter });
    writeJson("token-report.json", {
      requestId: resolved.run.requestId ?? null,
      usage: resolved.run.usage ?? null,
      calculatedCostUsd: resolved.run.costUsd ?? null,
      costStatus: resolved.run.costStatus ?? null,
      maxAuthorizedCostUsd: MAX_TOTAL_COST_USD,
      reservedWorstCaseUsd: reserved.ledger.reserved?.worstCaseUsd ?? null,
      provider: resolved.run.provider,
      model: resolved.run.model,
      fallbackUsed: resolved.run.fallbackUsed,
    });
    writeJson("copy-before-after.json", {
      before: copySnapshot(previousModel.copy),
      after: copySnapshot(model.copy),
      notes: [
        "No automatic aesthetic score was assigned.",
        resolved.run.status === "USED" ? "After copy came from the OpenAI response after schema and grounding checks." : "After copy fell back to deterministic commercial copy.",
      ],
    });
    writeJson("quality-gates.json", { labels: evaluated.labels, defectCount: defects.length });
    writeJson("call-result.json", {
      generationId: id,
      status: record.status,
      ai: record.ai,
      headline: model.copy.headline.text,
      producer: model.copy.producer,
      hopSlot: model.hopSlot,
      realImagesUsed: record.assets.approvedUsed.length,
      forbiddenHits: FORBIDDEN.test(
        [model.copy.headline.text, model.copy.subheadline?.text, model.copy.introduction.text].join(" "),
      ),
    });

    browser = await capturePreview(id, model.copy.headline.text);
    writeJson("browser-preview.json", browser);

    let secondBlocked = false;
    let secondError = "";
    try {
      const blockedCaller = createBudgetGatedCopyCaller({
        store,
        inner: async () => {
          throw new Error("INNER_MUST_NOT_RUN");
        },
      });
      await blockedCaller({ system: "s", user: "u", schema: {}, timeoutMs: 1000 });
    } catch (err) {
      secondError = err instanceof Error ? err.message : String(err);
      secondBlocked = secondError !== "INNER_MUST_NOT_RUN";
    }
    writeJson("post-call-block.json", {
      paidCallsBlocked: paidCallsBlocked(store),
      secondBlocked,
      secondError,
      innerMustNotRun: !secondError.includes("INNER_MUST_NOT_RUN"),
    });
  } finally {
    const closed = closeAuthorization(store, "Execution 53C finished. Single-use authorization is closed.");
    const flag = restorePaidFlag();
    writeJson("budget-ledger-final.json", closed);
    writeJson("authorization-final.json", {
      AUTHORIZATION_FINAL_STATUS: closed.status,
      AIA_ALLOW_PAID_AI_FINAL_VALUE: flag.final,
      paidRequestCount: closed.paidRequestCount,
      costStatus: closed.result?.costStatus ?? null,
      calculatedCostUsd: closed.result?.calculatedCostUsd ?? null,
    });
    const latest = readGeneration(id);
    const latestModel = readGenerationModel(id);
    writeJson("report.json", {
      EXECUTION_53C_STATUS: latest?.copy?.aiUsed ? "COMPLETED_REAL_OPENAI" : latest ? "COMPLETED_WITH_FALLBACK" : "FAILED",
      OPENAI_REAL_EXECUTION_STATUS: latest?.ai?.status ?? "FAILED",
      MODEL_USED: latest?.ai?.model ?? "gpt-5-mini",
      PAID_REQUEST_COUNT: closed.paidRequestCount,
      INPUT_TOKENS: latest?.ai?.usage?.inputTokens ?? closed.result?.usage?.inputTokens ?? null,
      OUTPUT_TOKENS: latest?.ai?.usage?.outputTokens ?? closed.result?.usage?.outputTokens ?? null,
      TOTAL_COST_USD: closed.result?.calculatedCostUsd ?? latest?.ai?.costUsd ?? null,
      MAX_AUTHORIZED_COST_USD: MAX_TOTAL_COST_USD,
      BUDGET_STATUS: closed.result?.costStatus ?? closed.status,
      AUTHORIZATION_FINAL_STATUS: closed.status,
      AIA_ALLOW_PAID_AI_FINAL_VALUE: flag.final,
      FEMICORE_GENERATION_ID: id,
      FEMICORE_PREVIEW_URL: latest?.previewPath ? `${BASE}${latest.previewPath}` : null,
      QUALITY_GATE_RESULTS: latest?.gateLabels ?? null,
      SCREENSHOT_PATHS: browser?.screenshots ?? [],
      DISK_FREE_GB: diskFreeGb(),
      EXECUTION_54_READINESS: "NOT_STARTED",
      headline: latestModel?.copy.headline.text ?? null,
      producer: latest?.copy?.producer ?? null,
      realImagesUsed: latest?.assets.approvedUsed.length ?? 0,
    });
  }
}

main().catch((err) => {
  try {
    const store = budgetStore(EXECUTION_53C_ID);
    if (readLedger(store)) closeAuthorization(store, "Failed; authorization closed.");
    setEnvLocalFlag("AIA_ALLOW_PAID_AI", "0");
  } catch {
    /* still report */
  }
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
