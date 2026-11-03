// npx tsx scripts/run-lp-generator-53g.ts
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import {
  EXECUTION_53C_ID,
  EXECUTION_53D_ID,
  EXECUTION_53F_ID,
  budgetStore,
  paidCallsBlocked,
  readLedger,
} from "../src/lib/lp-generator/ai-copy/budget.ts";
import { inspectAiCommercialDraft } from "../src/lib/lp-generator/ai-copy/apply.ts";
import { classifyCopyText, classifyDraft } from "../src/lib/page-blueprint/semantic-grounding.ts";
import type { AiCommercialCopyDraft } from "../src/lib/lp-generator/ai-copy/types.ts";
import { repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { evaluateGenerationGates, pipelineDefects } from "../src/lib/lp-generator/gates.ts";
import {
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
import type { SalesCopy } from "../src/lib/page-blueprint/types.ts";

const PREV_ID = "lp-mvjujouq-a42c9bc9";
const SOURCE_53F = path.join(process.cwd(), "data", "evidence", "execution-53f-openai-real", "sanitized-response.json");
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-53g-semantic-grounding");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

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

async function capturePreview(generationId: string, headline: string, introduction: string) {
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
  const desktop = await page.evaluate(
    (expected: { headline: string; introduction: string }) => {
      const root = document.documentElement;
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]"));
      const body = document.querySelector('[data-v4="page"]')?.textContent ?? "";
      return {
        title: document.querySelector("h1")?.textContent?.trim() ?? "",
        headlineMatches: (document.querySelector("h1")?.textContent ?? "").includes(expected.headline),
        introductionRendered: expected.introduction ? body.includes(expected.introduction.slice(0, 80)) : false,
        overflowX: root.scrollWidth > root.clientWidth + 2,
        hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
        loadedImages: imgs.filter((img) => img.complete && img.naturalWidth > 0).length,
      };
    },
    { headline, introduction },
  );
  await page.screenshot({ path: path.join(SHOTS, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
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

  const ledgers = {
    execution53c: readLedger(budgetStore(EXECUTION_53C_ID))?.status ?? "MISSING",
    execution53d: readLedger(budgetStore(EXECUTION_53D_ID))?.status ?? "MISSING",
    execution53f: readLedger(budgetStore(EXECUTION_53F_ID))?.status ?? "MISSING",
    paidCallsBlocked53f: paidCallsBlocked(budgetStore(EXECUTION_53F_ID)),
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
    paidApiCallCount: 0,
  };
  writeJson("authorization-status.json", ledgers);

  if (!existsSync(SOURCE_53F)) {
    writeJson("report.json", {
      EXECUTION_53G_STATUS: "BLOCKED_MISSING_AI_RESPONSE",
      ORIGINAL_AI_RESPONSE_RECOVERED: false,
      PAID_API_CALL_COUNT: 0,
      EXECUTION_54_READINESS: "NOT_STARTED",
    });
    console.log(JSON.stringify({ ok: false, reason: "BLOCKED_MISSING_AI_RESPONSE" }, null, 2));
    return;
  }

  const saved = JSON.parse(readFileSync(SOURCE_53F, "utf8")) as { draft?: AiCommercialCopyDraft | null; requestId?: string | null };
  if (!saved.draft?.headline || !saved.draft.introduction) {
    writeJson("report.json", {
      EXECUTION_53G_STATUS: "BLOCKED_MISSING_AI_RESPONSE",
      ORIGINAL_AI_RESPONSE_RECOVERED: false,
      PAID_API_CALL_COUNT: 0,
      EXECUTION_54_READINESS: "NOT_STARTED",
    });
    console.log(JSON.stringify({ ok: false, reason: "BLOCKED_MISSING_AI_RESPONSE" }, null, 2));
    return;
  }

  const previous = readGeneration(PREV_ID);
  const previousModel = readGenerationModel(PREV_ID);
  if (!previous || !previousModel) throw new Error(`Missing previous generation ${PREV_ID}.`);

  const originalRejects = [
    { path: "introduction", text: saved.draft.introduction },
    { path: "subheadline", text: saved.draft.subheadline ?? "" },
    { path: "sections[0].headline", text: saved.draft.sectionHeadlines.hero ?? "" },
    { path: "sections[1].headline", text: saved.draft.sectionHeadlines.specifications ?? "" },
    { path: "sections[2].headline", text: saved.draft.sectionHeadlines.faq ?? "" },
    { path: "sections[3].headline", text: saved.draft.sectionHeadlines.legal ?? "" },
  ];
  const audit = originalRejects.map((item) => classifyCopyText({ text: item.text, path: item.path, contract: previousModel.contract }));
  writeJson("trace-audit.json", {
    rootCause: "TRACE required exact contract strings, so editorial section titles and evidence-supported paraphrases were rejected.",
    original53FRejects: originalRejects.map((item, i) => ({
      ...item,
      previousRule: "TRACE_LITERAL",
      reclassified: audit[i].classification,
      allowedNow: audit[i].allowed,
      reason: audit[i].reason,
    })),
  });

  const draftClass = classifyDraft(saved.draft, previousModel.contract);
  writeJson("draft-classification.json", {
    accepted: draftClass.filter((item) => item.allowed),
    rejected: draftClass.filter((item) => !item.allowed),
  });

  const inspected = inspectAiCommercialDraft(previousModel.copy, saved.draft, previousModel.contract, previousModel.brief);
  writeJson("reprocess-grounding.json", inspected.report);

  const productKey = productKeyFromName("FemiCore");
  const catalogBefore = readCatalog(productKey);
  const approvedBefore = (catalogBefore?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id);
  writeJson("approved-assets-before.json", { productKey, approvedCount: approvedBefore.length, ids: approvedBefore });

  const aiCopyApplied = inspected.report.ok;
  if (!aiCopyApplied) {
    writeJson("copy-before-after.json", {
      before53FFallback: copySnapshot(previousModel.copy),
      after53G: null,
      aiCopyApplied: false,
      rejected: inspected.report.violations,
    });
    writeJson("report.json", {
      EXECUTION_53G_STATUS: "GROUNDING_STILL_BLOCKED",
      ORIGINAL_AI_RESPONSE_RECOVERED: true,
      AI_COPY_REPROCESSED: true,
      AI_COPY_APPLIED: false,
      PAID_API_CALL_COUNT: 0,
      AUTHORIZATION_STATUS: ledgers,
      DISK_FREE_GB: free,
      EXECUTION_54_READINESS: "NOT_STARTED",
      rejected: inspected.report.violations,
    });
    console.log(JSON.stringify({ ok: false, reason: "GROUNDING_STILL_BLOCKED", violations: inspected.report.violations }, null, 2));
    return;
  }

  const repaired = repairContentQuality({ copy: inspected.copy, contract: previousModel.contract, brief: previousModel.brief });
  const { copy, blueprint } = buildPageBlueprint({
    contract: previousModel.contract,
    brief: previousModel.brief,
    copy: repaired.copy,
    adapter: offlineCopyAdapter(),
  });
  const catalog = readCatalog(productKey);
  const id = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const composed = composeV4Model({ scenarioKey: id, contract: previousModel.contract, brief: previousModel.brief, copy, blueprint });
  const model = overlayApprovedAssets(composed, catalog);
  const defects = [
    ...pipelineDefects({ contract: previousModel.contract, brief: previousModel.brief, copy, blueprint, model, catalog }),
    ...repaired.defects,
  ];
  const evaluated = evaluateGenerationGates({ defects, contentQuality: repaired.status });

  const record = emptyRecord(previous.input, id, generationHash(previous.input), new Date().toISOString());
  record.productKey = productKey;
  record.assets.productKey = productKey;
  record.previewPath = `/admin/lab/lp-generator/${id}/preview`;
  record.limitations = [
    "HopLink placeholder rejected. Preview has no purchase CTA.",
    "Copy was produced by OpenAI in execution 53F and revalidated offline in execution 53G. No new paid request was made.",
  ];
  record.ai = {
    provider: "openai",
    model: "gpt-5-mini",
    status: "USED",
    fallbackUsed: false,
    latencyMs: null,
    costEstimate: null,
    usage: null,
    requestId: saved.requestId ?? null,
    costUsd: null,
    costStatus: "NOT_CHARGED",
  };
  record.copy = {
    producer: copy.producer,
    aiUsed: true,
    aiConfigured: true,
    headline: copy.headline.text,
    sectionCount: copy.sections.length,
    source: "OPENAI_REAL_REPROCESSED",
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
  writeGeneration(record);
  writeGenerationModel(id, model);

  const afterCatalog = readCatalog(productKey);
  writeJson("approved-assets-after.json", {
    productKey,
    approvedCount: (afterCatalog?.images ?? []).filter((item) => item.status === "USER_APPROVED").length,
    ids: (afterCatalog?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id),
    unchanged: JSON.stringify(approvedBefore) === JSON.stringify((afterCatalog?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id)),
  });
  writeJson("copy-before-after.json", {
    before53B: copySnapshot(previousModel.copy),
    after53G: copySnapshot(model.copy),
    aiCopyApplied: true,
    copySource: "OPENAI_REAL_REPROCESSED",
    origin: "execution-53f sanitized OpenAI draft, revalidated in 53G",
  });
  writeJson("quality-gates.json", { labels: evaluated.labels, defectCount: defects.length, repairs: repaired.repairs });

  const browser = await capturePreview(id, model.copy.headline.text, model.copy.introduction.text);
  writeJson("browser-preview.json", browser);

  const pass = Boolean(
    copy.producer === "AI_COMMERCIAL" &&
      record.copy.source === "OPENAI_REAL_REPROCESSED" &&
      evaluated.labels.CONTENT_PASS &&
      browser.previewStatus === 200 &&
      browser.desktop.headlineMatches &&
      browser.desktop.loadedImages === 3 &&
      ledgers.AIA_ALLOW_PAID_AI === "0",
  );

  const report = {
    EXECUTION_53G_STATUS: pass ? "PASS" : "PARTIAL",
    TRACE_ROOT_CAUSE: "Literal TRACE rejected editorial labels and evidence-supported paraphrases.",
    SEMANTIC_GROUNDING_IMPLEMENTED: true,
    EDITORIAL_LABEL_HANDLING: "Neutral section titles are allowed without matching a contract string.",
    SUPPORTED_PARAPHRASE_RESULTS: draftClass.filter((item) => item.classification === "SUPPORTED_PARAPHRASE").map((item) => item.path),
    UNSUPPORTED_CLAIMS_BLOCKED: draftClass.filter((item) => !item.allowed).map((item) => ({ path: item.path, reason: item.reason })),
    ORIGINAL_AI_RESPONSE_RECOVERED: true,
    AI_COPY_REPROCESSED: true,
    AI_COPY_APPLIED: true,
    CONTENT_QUALITY_STATUS: evaluated.labels.CONTENT_QUALITY_STATUS,
    FEMICORE_GENERATION_ID: id,
    FEMICORE_PREVIEW_URL: `${BASE}${record.previewPath}`,
    SCREENSHOT_PATHS: browser.screenshots.map((item) => `data/evidence/execution-53g-semantic-grounding/${item}`),
    TEST_RESULTS: {
      previewStatus: browser.previewStatus,
      headline: browser.desktop.title,
      images: browser.desktop.loadedImages,
      overflowX: browser.desktop.overflowX || browser.mobile.overflowX,
      hopCtas: browser.desktop.hopCtas,
    },
    PAID_API_CALL_COUNT: 0,
    AUTHORIZATION_STATUS: ledgers,
    DISK_FREE_GB: diskFreeGb(),
    EXECUTION_54_READINESS: "NOT_STARTED",
    COPY_SOURCE: "OPENAI_REAL_REPROCESSED",
    REQUEST_ID_FROM_53F: saved.requestId ?? null,
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
