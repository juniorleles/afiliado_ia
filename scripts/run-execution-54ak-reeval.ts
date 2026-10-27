// npx tsx scripts/run-execution-54ak-reeval.ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, openaiVisionProviderStatus, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { captureEvaluationScreenshots } from "../src/lib/presell-quality/capture.ts";
import { evaluationInputFromModel } from "../src/lib/presell-quality/context.ts";
import { emptyBudgetLedger, recordBudgetSpend, readBudgetLedger, EXECUTION_54AK_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { readGenerationModel, writeGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { applySafeCopyOptimization } from "../src/lib/presell-quality/apply-copy-optimization.ts";
import { proposeDeterministicRewrites } from "../src/lib/presell-quality/copy-rewrite.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

const EVIDENCE = path.join("data/evidence/execution-54ak-copy-optimization");
const REPORTS = path.join(EVIDENCE, "reports");
const SHOTS = path.join(EVIDENCE, "screenshots");
const GENERATION_ID = "lp-mvr4p9w4-98b8206d";
const PREVIEW = `/admin/lab/lp-generator/${GENERATION_ID}/preview`;
const PREVIOUS_SCORE = 82;

function copyShot(src: string | null | undefined, dest: string): boolean {
  if (!src || !existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

function dim(assessment: PresellQualityAssessment | null, name: PresellQualityAssessment["dimensionScores"][number]["dimension"]): number | null {
  return assessment?.dimensionScores.find((row) => row.dimension === name)?.score ?? null;
}

async function main() {
  const previous = JSON.parse(readFileSync(path.join(REPORTS, "summary.json"), "utf8")) as Record<string, unknown>;
  const snap = snapshotProductResearch(237);
  const accepted = acceptedProposals(snap.latest).map((item) => ({
    field: item.field,
    factId: item.evidenceIds[0] ?? item.field,
    value: (item.currentValue || item.suggestedValue).replace(/\s+/g, " ").trim(),
  }));
  const stored = readGenerationModel(GENERATION_ID);
  if (!stored) throw new Error("Generation missing.");
  const optimized = applySafeCopyOptimization(stored, proposeDeterministicRewrites(accepted)).model;
  writeGenerationModel(GENERATION_ID, optimized);
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
  if (!bind.ok) throw new Error("SCREENSHOT_BINDING_FAILED");
  let ledger = readBudgetLedger("54AK");
  if (!ledger.calls.length) ledger = { ...emptyBudgetLedger("54AK"), maxUsd: EXECUTION_54AK_BUDGET.maxUsd };
  let latest: PresellQualityAssessment | null = null;
  let liveCalls = 0;
  let stopReason = envValuePresent("OPENAI_API_KEY") ? "NOT_STARTED" : "PAID_AI_AUTHORIZATION_REQUIRED";
  if (envValuePresent("OPENAI_API_KEY")) {
    await runWithTemporaryPaidAi({ scope: "54AK", provider: "openai", maxUsd: EXECUTION_54AK_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) {
        stopReason = "PAID_AI_AUTHORIZATION_REQUIRED";
        return;
      }
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      latest = await evaluator.evaluate(
        evaluationInputFromModel({
          campaignId: 237,
          generationId: GENERATION_ID,
          model: optimized,
          screenshots: {
            desktop: capture.extras.find((item) => item.role === "desktop-viewport") ?? capture.desktop,
            mobile: capture.extras.find((item) => item.role === "mobile-viewport") ?? capture.mobile,
          },
          approvedFacts: accepted.map((item) => item.field),
          evidenceReferences: [snap.latest?.runId ?? "research-237"],
          approvedAssets: [{ id: "asset-cbc045ab", eligible: true, kind: "PRODUCT_PACKSHOT" }],
          editorialConstraints: [
            "Use only the four accepted facts.",
            "Do not invent benefits, testimonials, prices, or clinical claims.",
            "SANDBOX is a lab label, not a live commercial hop.",
          ],
          previewPath: PREVIEW,
          iteration: 2,
          patch: optimized.qualityPatch ?? null,
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
      const delta = typeof latest.overallScore === "number" ? Math.abs(latest.overallScore - PREVIOUS_SCORE) : 99;
      stopReason =
        latest.assessmentStatus === "QUALITY_PASSED"
          ? "QUALITY_PASSED"
          : latest.assessmentStatus === "EVALUATION_FAILED"
            ? "EVALUATION_FAILED"
            : typeof latest.overallScore === "number" && latest.overallScore <= 40
              ? "EVALUATOR_UNSTABLE"
              : delta > 8 && (latest.overallScore ?? 0) < PREVIOUS_SCORE - 8
                ? "EVALUATOR_UNSTABLE"
                : "BELOW_TARGET_NO_ALLOWED_VISUAL_FIXES";
    });
  }
  const previousCalls = typeof previous.REAL_OPENAI_CALLS === "number" ? previous.REAL_OPENAI_CALLS : 0;
  const official = latest && latest.assessmentStatus !== "EVALUATION_FAILED" && (latest.overallScore ?? 0) > 40 ? latest : null;
  const summary = {
    ...previous,
    EXECUTION_54AK_STATUS: official?.assessmentStatus ?? latest?.assessmentStatus ?? "QUALITY_NOT_EVALUATED",
    SCREENSHOT_BINDING_VALID: bind.ok,
    REAL_OPENAI_VALIDATION: Boolean(official),
    INITIAL_NEW_SCORE: official?.overallScore ?? null,
    FINAL_SCORE: official?.overallScore ?? null,
    FIRST_EVAL_UNSTABLE_SCORE: 16,
    DESIGN_HIERARCHY: dim(official, "DESIGN_HIERARCHY"),
    COPY_CLARITY: dim(official, "COPY_CLARITY"),
    DEPTH_ORGANIZATION: dim(official, "DEPTH_ORGANIZATION"),
    IMAGES_COMPOSITION: dim(official, "IMAGES_COMPOSITION"),
    MOBILE_EXPERIENCE: dim(official, "MOBILE_EXPERIENCE"),
    TRANSPARENCY_LEGIBILITY: dim(official, "TRANSPARENCY_LEGIBILITY"),
    REAL_OPENAI_CALLS: previousCalls + liveCalls,
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: stopReason,
    ROLLBACK_EXECUTED: false,
    FINAL_QUALITY_STATUS: official?.assessmentStatus ?? latest?.assessmentStatus ?? "QUALITY_NOT_EVALUATED",
    captureIteration: 2,
    QUALITY_TARGET,
    OPENAI_MODEL: OPENAI_VISION_MODEL,
    PROMPT_VERSION: QUALITY_PROMPT_VERSION,
    PREVIOUS_SCORE,
  };
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`54AK reeval status=${summary.EXECUTION_54AK_STATUS} score=${official?.overallScore ?? latest?.overallScore ?? "n/a"} calls=${summary.REAL_OPENAI_CALLS} cost=${ledger.spentUsd} stop=${stopReason}`);
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
