// npx tsx scripts/run-execution-54ah-editorial-quality.ts
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, openaiVisionProviderStatus, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { captureEvaluationScreenshots } from "../src/lib/presell-quality/capture.ts";
import { evaluationInputFromModel } from "../src/lib/presell-quality/context.ts";
import { defaultEvaluationMeta } from "../src/lib/presell-quality/input.ts";
import { reconstructApprovedPresell } from "../src/lib/presell-quality/reconstruct.ts";
import { runQualityImprovementLoop } from "../src/lib/presell-quality/loop.ts";
import { emptyBudgetLedger, recordBudgetSpend, EXECUTION_54AH_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { measureEvaluatorConsistency } from "../src/lib/presell-quality/consistency.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { compareEditorialPages } from "../src/lib/presell-quality/visual-compare.ts";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { CALIBRATION_PAGES } from "../src/lib/presell-quality/calibration-pages.ts";
import { readQualityAssessment } from "../src/lib/presell-quality/persist.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { VisualComparisonResult } from "../src/lib/presell-quality/visual-compare.ts";

const EVIDENCE = path.join("data/evidence/execution-54ah-editorial-quality");
const REPORTS = path.join(EVIDENCE, "reports");
const SHOTS = path.join(EVIDENCE, "screenshots");

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
  mkdirSync(REPORTS, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(237);
  const snap = snapshotProductResearch(237);
  const accepted = acceptedProposals(snap.latest);
  const acceptedFields = accepted.map((item) => item.field);
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  const paidBefore = paidAiAuthorization();
  const editorial = CALIBRATION_PAGES.find((item) => item.id === "editorial-no-image")!;
  const current = loadApprovedReviewGeneration(237);
  const currentModel = current?.generationId ? readGenerationModel(current.generationId) : null;

  const constraints = [
    "EDITORIAL_NO_IMAGE is required. Do not treat the missing packshot as a broken layout.",
    "Use only description, ingredients, howItWorks, and guarantee.",
    "Do not invent benefits, testimonials, prices, manufacturer, or clinical claims.",
    "Do not promote ineligible gallery images to the hero.",
    "Do not approve assets, publish, or authorize ads.",
    "SANDBOX is a lab label, not a live commercial hop.",
  ];

  let ledger = emptyBudgetLedger("54AH");
  ledger.maxUsd = EXECUTION_54AH_BUDGET.maxUsd;
  let liveCalls = 0;
  let fixtureFirst: PresellQualityAssessment | null = null;
  let fixtureSecond: PresellQualityAssessment | null = null;
  let comparison: VisualComparisonResult | null = null;
  let reconstructed = null as Awaited<ReturnType<typeof reconstructApprovedPresell>> | null;
  let loop = null as Awaited<ReturnType<typeof runQualityImprovementLoop>> | null;
  let stopReason = keyConfigured ? "NOT_STARTED" : "PAID_AI_AUTHORIZATION_REQUIRED";
  const applied = [
    "Bound screenshot re-eval to the same generationId",
    "Hero editorial panel groups abstract art and section index",
    "Ingredient notes use a stacked list instead of sparse chips",
    "Directions render as numbered features",
    "Guarantee sits in a contextual panel without an isolated accent band",
    "Editorial pages use tighter section rhythm and reduced unused hero space",
    "Ineligible gallery is not rendered on EDITORIAL_NO_IMAGE pages",
  ];

  if (!keyConfigured) {
    writeFileSync(
      path.join(REPORTS, "summary.json"),
      `${JSON.stringify({ EXECUTION_54AH_STATUS: "PAID_AI_AUTHORIZATION_REQUIRED", REAL_OPENAI_CALLS: 0, TOTAL_API_COST: 0, STOP_REASON: stopReason, paidBefore }, null, 2)}\n`,
    );
  } else {
    await runWithTemporaryPaidAi({ scope: "54AH", provider: "openai", maxUsd: EXECUTION_54AH_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) throw new Error(status.reason);
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      const fixtureGen = "cal-editorial-no-image";
      const fixtureCapture = await captureEvaluationScreenshots({
        campaignId: 237,
        generationId: fixtureGen,
        previewPath: editorial.path,
        readySelector: "body",
        iteration: 0,
      });
      copyShot(fixtureCapture.desktop?.path, path.join(SHOTS, "reference-desktop.png"));
      copyShot(fixtureCapture.mobile?.path, path.join(SHOTS, "reference-mobile.png"));
      writeFileSync(path.join(REPORTS, "reference-capture.json"), `${JSON.stringify(fixtureCapture, null, 2)}\n`);
      const fixtureBind = validateScreenshotBinding({ generationId: fixtureGen, desktop: fixtureCapture.desktop, mobile: fixtureCapture.mobile });
      writeFileSync(path.join(REPORTS, "reference-binding.json"), `${JSON.stringify(fixtureBind, null, 2)}\n`);
      if (!fixtureCapture.ok || !fixtureBind.ok) {
        stopReason = "CAPTURE_FAILED";
        return;
      }

      const meta = defaultEvaluationMeta();
      const fixtureInput = {
        campaignId: 237,
        generationId: fixtureGen,
        productContractVersion: meta.productContractVersion,
        rendererVersion: meta.rendererVersion,
        screenshots: { desktop: fixtureCapture.desktop, mobile: fixtureCapture.mobile },
        pageStructure: { page: editorial.id, kind: editorial.kind },
        renderedCopy: "Editorial reference without a packshot.",
        approvedFacts: acceptedFields,
        evidenceReferences: ["calibration-editorial-no-image"],
        approvedAssets: [{ id: "none", eligible: false, kind: "OTHER" }],
        editorialConstraints: ["EDITORIAL_NO_IMAGE"],
        rubricVersion: QUALITY_RUBRIC_VERSION,
        promptVersion: QUALITY_PROMPT_VERSION,
      };
      fixtureFirst = await evaluator.evaluate(fixtureInput);
      if (fixtureFirst.tokenUsage && fixtureFirst.costMetadata.estimatedUsd > 0) {
        ledger = recordBudgetSpend(ledger, {
          inputTokens: fixtureFirst.tokenUsage.inputTokens,
          outputTokens: fixtureFirst.tokenUsage.outputTokens,
          estimatedUsd: fixtureFirst.costMetadata.estimatedUsd,
        });
        liveCalls += 1;
      }
      fixtureSecond = await evaluator.evaluate(fixtureInput);
      if (fixtureSecond.tokenUsage && fixtureSecond.costMetadata.estimatedUsd > 0) {
        ledger = recordBudgetSpend(ledger, {
          inputTokens: fixtureSecond.tokenUsage.inputTokens,
          outputTokens: fixtureSecond.tokenUsage.outputTokens,
          estimatedUsd: fixtureSecond.costMetadata.estimatedUsd,
        });
        liveCalls += 1;
      }
      writeFileSync(path.join(REPORTS, "fixture-eval-1.json"), `${JSON.stringify(fixtureFirst, null, 2)}\n`);
      writeFileSync(path.join(REPORTS, "fixture-eval-2.json"), `${JSON.stringify(fixtureSecond, null, 2)}\n`);

      if (current?.generationId && current.previewPath) {
        const campaignCapture = await captureEvaluationScreenshots({
          campaignId: 237,
          generationId: current.generationId,
          previewPath: current.previewPath,
          iteration: 0,
        });
        copyShot(campaignCapture.desktop?.path, path.join(SHOTS, "campaign-before-desktop.png"));
        copyShot(campaignCapture.mobile?.path, path.join(SHOTS, "campaign-before-mobile.png"));
        writeFileSync(path.join(REPORTS, "campaign-before-capture.json"), `${JSON.stringify(campaignCapture, null, 2)}\n`);
        if (campaignCapture.ok && campaignCapture.desktop && campaignCapture.mobile && liveCalls < 3) {
          comparison = await compareEditorialPages({
            referenceDesktop: fixtureCapture.desktop!,
            referenceMobile: fixtureCapture.mobile!,
            campaignDesktop: campaignCapture.desktop,
            campaignMobile: campaignCapture.mobile,
            approvedFacts: acceptedFields,
            editorialConstraints: constraints,
            pageStructure: currentModel ? { composition: currentModel.composition, hopSlot: currentModel.hopSlot, sections: currentModel.blueprint.sections.map((section) => section.sectionType) } : { campaignId: 237 },
          });
          liveCalls += 1;
          ledger = recordBudgetSpend(ledger, {
            inputTokens: comparison.inputTokens,
            outputTokens: comparison.outputTokens,
            estimatedUsd: comparison.estimatedUsd,
          });
          writeFileSync(path.join(REPORTS, "visual-comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
        }
      }

      reconstructed = await reconstructApprovedPresell(237);
      writeFileSync(path.join(REPORTS, "reconstruction.json"), `${JSON.stringify(reconstructed, null, 2)}\n`);
      const stored = reconstructed.generationId ? readGenerationModel(reconstructed.generationId) : null;
      const media = selectReviewMedia({
        assets: snap.latest?.discoveredAssets,
        productName: stored?.contract.identity.productName ?? "Product",
        campaignId: 237,
      });
      if (!reconstructed.generationId || !reconstructed.previewPath || !stored) {
        stopReason = "RECONSTRUCTION_FAILED";
        return;
      }

      loop = await runQualityImprovementLoop(
        {
          campaignId: 237,
          generationId: reconstructed.generationId,
          previewPath: reconstructed.previewPath,
          model: stored,
          approvedFacts: acceptedFields,
          evidenceReferences: [snap.latest?.runId ?? "research-237"],
          approvedAssets: media.approved.map((item) => ({
            id: item.assetId,
            eligible: item.editorialEligibility === "ELIGIBLE" && item.galleryKind === "PRODUCT_PACKSHOT",
            kind: item.galleryKind,
          })),
          editorialConstraints: constraints,
          heroEligible: false,
        },
        {
          ledger: emptyBudgetLedger("54AH-campaign"),
          evaluator,
        },
      );
      liveCalls += loop.ledger.evaluationCount;
      ledger = {
        ...ledger,
        spentUsd: Number((ledger.spentUsd + loop.ledger.spentUsd).toFixed(6)),
        evaluationCount: ledger.evaluationCount + loop.ledger.evaluationCount,
        correctionCount: loop.ledger.correctionCount,
        calls: [...ledger.calls, ...loop.ledger.calls],
      };
      stopReason = loop.stopReason;
      loop.iterations.forEach((item) => {
        const folder = path.join(SHOTS, `generation-${item.iteration}`);
        copyShot(item.capture?.desktop?.path, path.join(folder, "desktop.png"));
        copyShot(item.capture?.mobile?.path, path.join(folder, "mobile.png"));
        writeFileSync(path.join(REPORTS, `campaign-eval-${item.iteration}.json`), `${JSON.stringify(item, null, 2)}\n`);
      });
    });
  }

  const consistency = measureEvaluatorConsistency({ first: fixtureFirst, second: fixtureSecond });
  writeFileSync(path.join(REPORTS, "evaluator-consistency.json"), `${JSON.stringify(consistency, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "structural-changes.json"), `${JSON.stringify({ applied, comparisonRecommendations: comparison?.recommendations ?? [] }, null, 2)}\n`);

  const last = loop?.iterations[loop.iterations.length - 1] ?? null;
  const lastAssessment = last?.assessmentId ? readQualityAssessment(237, last.assessmentId) : null;
  const after = campaignIntegritySnapshot(237);
  const unstable = consistency.status === "EVALUATOR_UNSTABLE";
  const finalScore = loop?.finalScore ?? null;
  const qualityStatus =
    unstable && (finalScore ?? 0) >= QUALITY_TARGET
      ? "QUALITY_REJECTED"
      : loop?.status ?? (keyConfigured ? "QUALITY_REJECTED" : "NOT_EVALUATED");
  const summary = {
    EXECUTION_54AH_STATUS: keyConfigured ? qualityStatus : "PAID_AI_AUTHORIZATION_REQUIRED",
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    EVALUATOR_BINDING_FIXED: consistency.generationIdsMatch && consistency.screenshotHashesMatch,
    EVALUATOR_CONSISTENCY_STATUS: consistency.status,
    REFERENCE_SCORES: { first: consistency.firstScore, second: consistency.secondScore },
    REFERENCE_SCORE_VARIATION: consistency.variation,
    VISUAL_COMPARISON_EXECUTED: Boolean(comparison),
    VISUAL_ISSUES_IDENTIFIED: comparison?.recommendations.length ?? 0,
    STRUCTURAL_IMPROVEMENTS_APPLIED: applied,
    INITIAL_V4_SCORE: 65,
    NEW_GENERATION_ID: reconstructed?.generationId ?? null,
    NEW_GENERATION_SCORE: loop?.initialScore ?? null,
    FINAL_SCORE: finalScore,
    QUALITY_TARGET,
    DESIGN_HIERARCHY: dim(lastAssessment, "DESIGN_HIERARCHY"),
    COPY_CLARITY: dim(lastAssessment, "COPY_CLARITY"),
    DEPTH_ORGANIZATION: dim(lastAssessment, "DEPTH_ORGANIZATION"),
    IMAGES_COMPOSITION: dim(lastAssessment, "IMAGES_COMPOSITION"),
    MOBILE_EXPERIENCE: dim(lastAssessment, "MOBILE_EXPERIENCE"),
    TRANSPARENCY_LEGIBILITY: dim(lastAssessment, "TRANSPARENCY_LEGIBILITY"),
    REAL_OPENAI_CALLS: liveCalls,
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: unstable ? "EVALUATOR_UNSTABLE" : stopReason,
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    UNAPPROVED_FACTS_USED: reconstructed?.unapprovedFactsUsed ?? [],
    FINAL_QUALITY_STATUS: qualityStatus,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    promptVersion: QUALITY_PROMPT_VERSION,
    rubricVersion: QUALITY_RUBRIC_VERSION,
    model: OPENAI_VISION_MODEL,
    paidBefore,
    lastAssessmentId: last?.assessmentId ?? null,
    ledger,
  };
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    path.join(REPORTS, "execution-summary.md"),
    `# 54AH editorial quality

Commit ${baseCommit}
Fixture consistency: ${consistency.status} (${consistency.firstScore} / ${consistency.secondScore}, Δ ${consistency.variation})
Visual comparison: ${Boolean(comparison)}
New generation: ${reconstructed?.generationId ?? "none"}
Final score: ${finalScore}
Status: ${qualityStatus}
Cost: $${ledger.spentUsd}
Calls: ${liveCalls}
Stop: ${summary.STOP_REASON}
`,
  );
  console.log(
    `54AH status=${summary.EXECUTION_54AH_STATUS} bind=${summary.EVALUATOR_BINDING_FIXED} consistency=${consistency.status} gen=${reconstructed?.generationId ?? "none"} score=${finalScore ?? "n/a"} calls=${liveCalls} cost=${ledger.spentUsd}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
