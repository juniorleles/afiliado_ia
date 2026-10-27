// npx tsx scripts/run-execution-54aj-reeval.ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, openaiVisionProviderStatus, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { captureEvaluationScreenshots } from "../src/lib/presell-quality/capture.ts";
import { evaluationInputFromModel } from "../src/lib/presell-quality/context.ts";
import { emptyBudgetLedger, recordBudgetSpend, readBudgetLedger, EXECUTION_54AJ_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { emptyPatch } from "../src/lib/presell-quality/patch.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

const EVIDENCE = path.join("data/evidence/execution-54aj-authorized-images");
const REPORTS = path.join(EVIDENCE, "reports");
const SHOTS = path.join(EVIDENCE, "screenshots");
const GENERATION_ID = "lp-mvr3pp2f-ea2a99d2";
const PREVIEW = `/admin/lab/lp-generator/${GENERATION_ID}/preview`;
const PREVIOUS_54AI_SCORE = 65;

function copyShot(src: string | null | undefined, dest: string): boolean {
  if (!src || !existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

function dim(assessment: PresellQualityAssessment | null, name: PresellQualityAssessment["dimensionScores"][number]["dimension"]): number | null {
  return assessment?.dimensionScores.find((row) => row.dimension === name)?.score ?? null;
}

async function inspectPreview(url: string): Promise<Record<string, unknown>> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const failed: string[] = [];
    page.on("requestfailed", (req) => failed.push(`${req.url()} ${req.failure()?.errorText ?? ""}`));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
    await page.waitForFunction(
      () => {
        const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
        return !img || (img.complete && img.naturalWidth > 0);
      },
      { timeout: 15_000 },
    ).catch(() => undefined);
    const report = await page.evaluate(() => {
      const root = document.querySelector("[data-v4='page']");
      const images = [...document.images];
      const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return {
        rendered: Boolean(root),
        heroMode: root?.getAttribute("data-hero-mode"),
        galleryState: root?.getAttribute("data-v4-gallery-state"),
        gallerySection: Boolean(document.querySelector("[data-v4-section='gallery']")),
        sandbox: Boolean(document.querySelector("[data-sandbox-badge], [data-sandbox='true']")),
        disclosure: /affiliate|commission/i.test(document.body.innerText),
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        brokenImages: images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("src")),
        heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
        heroNaturalWidth: heroImg?.naturalWidth ?? 0,
        heroNaturalHeight: heroImg?.naturalHeight ?? 0,
      };
    });
    await page.close();
    return { ...report, requestFailed: failed.slice(0, 5) };
  } finally {
    await browser.close();
  }
}

async function main() {
  const previous = JSON.parse(readFileSync(path.join(REPORTS, "summary.json"), "utf8")) as Record<string, unknown>;
  const model = readGenerationModel(GENERATION_ID);
  if (!model) throw new Error("Generation model missing.");
  const snap = snapshotProductResearch(237);
  const acceptedFields = acceptedProposals(snap.latest).map((item) => item.field);
  const before = campaignIntegritySnapshot(237);
  const capture = await captureEvaluationScreenshots({
    campaignId: 237,
    generationId: GENERATION_ID,
    previewPath: PREVIEW,
    iteration: 2,
  });
  copyShot(capture.desktop?.path, path.join(SHOTS, "desktop-full.png"));
  copyShot(capture.mobile?.path, path.join(SHOTS, "mobile-full.png"));
  copyShot(capture.extras.find((item) => item.path.includes("desktop-hero"))?.path, path.join(SHOTS, "desktop-hero.png"));
  copyShot(capture.extras.find((item) => item.path.includes("mobile-hero"))?.path, path.join(SHOTS, "mobile-hero.png"));
  const bind = validateScreenshotBinding({ generationId: GENERATION_ID, desktop: capture.desktop, mobile: capture.mobile });
  const inspection = await inspectPreview(`http://127.0.0.1:3000${PREVIEW}`);
  writeFileSync(path.join(REPORTS, "capture-2.json"), `${JSON.stringify({ capture, bind, inspection }, null, 2)}\n`);
  if (!bind.ok) throw new Error("SCREENSHOT_BINDING_FAILED");
  if (inspection.heroLoaded !== true) {
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify({ ...previous, STOP_REASON: "HERO_IMAGE_NOT_LOADED", inspection }, null, 2)}\n`);
    throw new Error("HERO_IMAGE_NOT_LOADED");
  }

  let ledger = readBudgetLedger("54AJ");
  if (!ledger.calls.length) ledger = { ...emptyBudgetLedger("54AJ"), maxUsd: EXECUTION_54AJ_BUDGET.maxUsd };
  let latest: PresellQualityAssessment | null = null;
  let liveCalls = 0;
  let stopReason = envValuePresent("OPENAI_API_KEY") ? "NOT_STARTED" : "PAID_AI_AUTHORIZATION_REQUIRED";

  if (envValuePresent("OPENAI_API_KEY")) {
    await runWithTemporaryPaidAi({ scope: "54AJ", provider: "openai", maxUsd: EXECUTION_54AJ_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) {
        stopReason = "PAID_AI_AUTHORIZATION_REQUIRED";
        return;
      }
      if (ledger.spentUsd + EXECUTION_54AJ_BUDGET.reserveUsdPerEvaluation > EXECUTION_54AJ_BUDGET.maxUsd) {
        stopReason = "BUDGET_EXCEEDED";
        return;
      }
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      latest = await evaluator.evaluate(
        evaluationInputFromModel({
          campaignId: 237,
          generationId: GENERATION_ID,
          model,
          screenshots: {
            desktop: capture.extras.find((item) => item.role === "desktop-viewport") ?? capture.desktop,
            mobile: capture.extras.find((item) => item.role === "mobile-viewport") ?? capture.mobile,
          },
          approvedFacts: acceptedFields,
          evidenceReferences: [snap.latest?.runId ?? "research-237"],
          approvedAssets: [{ id: "asset-cbc045ab", eligible: true, kind: "PRODUCT_PACKSHOT" }],
          editorialConstraints: [
            "Use only the four accepted facts.",
            "Do not invent benefits, testimonials, prices, manufacturer, or clinical claims.",
            "SANDBOX is a lab label, not a live commercial hop.",
          ],
          previewPath: PREVIEW,
          iteration: 2,
          patch: emptyPatch(),
        }),
      );
      if (latest.tokenUsage && latest.costMetadata.estimatedUsd > 0) {
        ledger = recordBudgetSpend(ledger, {
          inputTokens: latest.tokenUsage.inputTokens,
          outputTokens: latest.tokenUsage.outputTokens,
          estimatedUsd: latest.costMetadata.estimatedUsd,
        });
        liveCalls += 1;
      }
      writeFileSync(path.join(REPORTS, "eval-2.json"), `${JSON.stringify(latest, null, 2)}\n`);
      stopReason = latest.assessmentStatus === "QUALITY_PASSED" ? "QUALITY_PASSED" : latest.assessmentStatus === "EVALUATION_FAILED" ? "EVALUATION_FAILED" : "NO_SCORE_IMPROVEMENT";
    });
  }

  const after = campaignIntegritySnapshot(237);
  const previousCalls = typeof previous.REAL_OPENAI_CALLS === "number" ? previous.REAL_OPENAI_CALLS : 0;
  const summary = {
    ...previous,
    EXECUTION_54AJ_STATUS: latest?.assessmentStatus ?? "QUALITY_NOT_EVALUATED",
    SCREENSHOT_BINDING_VALID: bind.ok,
    REAL_OPENAI_VALIDATION: Boolean(latest && latest.assessmentStatus !== "EVALUATION_FAILED"),
    INITIAL_NEW_SCORE: latest?.overallScore ?? null,
    FINAL_SCORE: latest?.overallScore ?? null,
    DESIGN_HIERARCHY: dim(latest, "DESIGN_HIERARCHY"),
    COPY_CLARITY: dim(latest, "COPY_CLARITY"),
    DEPTH_ORGANIZATION: dim(latest, "DEPTH_ORGANIZATION"),
    IMAGES_COMPOSITION: dim(latest, "IMAGES_COMPOSITION"),
    MOBILE_EXPERIENCE: dim(latest, "MOBILE_EXPERIENCE"),
    TRANSPARENCY_LEGIBILITY: dim(latest, "TRANSPARENCY_LEGIBILITY"),
    REAL_OPENAI_CALLS: previousCalls + liveCalls,
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: stopReason,
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    FINAL_QUALITY_STATUS: latest?.assessmentStatus ?? "QUALITY_NOT_EVALUATED",
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    paidBefore: paidAiAuthorization(),
    inspection,
    captureIteration: 2,
    QUALITY_TARGET,
    OPENAI_MODEL: OPENAI_VISION_MODEL,
    PROMPT_VERSION: QUALITY_PROMPT_VERSION,
    PREVIOUS_SCORE: PREVIOUS_54AI_SCORE,
  };
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `54AJ reeval status=${summary.EXECUTION_54AJ_STATUS} heroLoaded=${inspection.heroLoaded} score=${latest?.overallScore ?? "n/a"} calls=${summary.REAL_OPENAI_CALLS} cost=${ledger.spentUsd} stop=${stopReason}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
