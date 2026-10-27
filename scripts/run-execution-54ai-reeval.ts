// npx tsx scripts/run-execution-54ai-reeval.ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, openaiVisionProviderStatus } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { captureEvaluationScreenshots } from "../src/lib/presell-quality/capture.ts";
import { evaluationInputFromModel } from "../src/lib/presell-quality/context.ts";
import { emptyBudgetLedger, recordBudgetSpend, readBudgetLedger, EXECUTION_54AI_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { gallerySuppressionImpact } from "../src/lib/presell-quality/gallery-impact.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";

const EVIDENCE = path.join("data/evidence/execution-54ai-gallery-suppression");
const REPORTS = path.join(EVIDENCE, "reports");
const SHOTS = path.join(EVIDENCE, "screenshots");
const GEN = "lp-mvr2k7sr-eed804e8";
const PREVIEW = `/admin/lab/lp-generator/${GEN}/preview`;

function copyShot(src: string | null | undefined, dest: string): boolean {
  if (!src || !existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

async function main() {
  if (!envValuePresent("OPENAI_API_KEY")) throw new Error("PAID_AI_AUTHORIZATION_REQUIRED");
  const stored = readGenerationModel(GEN);
  if (!stored) throw new Error("Generation model missing.");
  const snap = snapshotProductResearch(237);
  const acceptedFields = acceptedProposals(snap.latest).map((item) => item.field);
  const media = selectReviewMedia({
    assets: snap.latest?.discoveredAssets,
    productName: stored.contract.identity.productName,
    campaignId: 237,
  });
  const capture = await captureEvaluationScreenshots({
    campaignId: 237,
    generationId: GEN,
    previewPath: PREVIEW,
    iteration: 2,
  });
  const bind = validateScreenshotBinding({ generationId: GEN, desktop: capture.desktop, mobile: capture.mobile });
  if (!bind.ok) throw new Error("SCREENSHOT_BINDING_FAILED");
  copyShot(capture.desktop?.path, path.join(SHOTS, "desktop-full-reeval.png"));
  copyShot(capture.mobile?.path, path.join(SHOTS, "mobile-full-reeval.png"));

  const second = await runWithTemporaryPaidAi({ scope: "54AI", provider: "openai", maxUsd: EXECUTION_54AI_BUDGET.maxUsd }, async () => {
    const status = openaiVisionProviderStatus();
    if (!status.authorized) throw new Error(status.reason);
    const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
    return evaluator.evaluate(
      evaluationInputFromModel({
        campaignId: 237,
        generationId: GEN,
        model: stored,
        screenshots: {
          desktop: capture.extras.find((item) => item.role === "desktop-viewport") ?? capture.desktop,
          mobile: capture.extras.find((item) => item.role === "mobile-viewport") ?? capture.mobile,
        },
        approvedFacts: acceptedFields,
        evidenceReferences: [snap.latest?.runId ?? "research-237"],
        approvedAssets: media.approved.map((item) => ({
          id: item.assetId,
          eligible: item.editorialEligibility === "ELIGIBLE" && item.galleryKind === "PRODUCT_PACKSHOT",
          kind: item.galleryKind,
        })),
        editorialConstraints: [
          "EDITORIAL_NO_IMAGE is required.",
          "Do not invent benefits, testimonials, prices, manufacturer, or clinical claims.",
          "Do not promote ineligible gallery images to the hero.",
          "SANDBOX is a lab label, not a live commercial hop.",
        ],
        previewPath: PREVIEW,
        iteration: 2,
        patch: stored.qualityPatch ?? null,
      }),
    );
  });

  let ledger = existsSync(path.join("data/presell-quality", "budget-54AI.json")) ? readBudgetLedger("54AI") : emptyBudgetLedger("54AI");
  if (second.tokenUsage && second.costMetadata.estimatedUsd > 0) {
    ledger = recordBudgetSpend({ ...ledger, maxUsd: EXECUTION_54AI_BUDGET.maxUsd }, {
      inputTokens: second.tokenUsage.inputTokens,
      outputTokens: second.tokenUsage.outputTokens,
      estimatedUsd: second.costMetadata.estimatedUsd,
    });
  }
  writeFileSync(path.join(REPORTS, "eval-2.json"), `${JSON.stringify(second, null, 2)}\n`);
  const first = JSON.parse(readFileSync(path.join(REPORTS, "eval-1.json"), "utf8")) as { overallScore: number };
  const summary = JSON.parse(readFileSync(path.join(REPORTS, "summary.json"), "utf8")) as Record<string, unknown>;
  const impact = gallerySuppressionImpact({ previousWithGallery: 65, currentWithoutGallery: second.overallScore });
  const next = {
    ...summary,
    "54AI_FINAL_SCORE": second.overallScore,
    DESIGN_HIERARCHY: second.dimensionScores.find((row) => row.dimension === "DESIGN_HIERARCHY")?.score ?? null,
    COPY_CLARITY: second.dimensionScores.find((row) => row.dimension === "COPY_CLARITY")?.score ?? null,
    DEPTH_ORGANIZATION: second.dimensionScores.find((row) => row.dimension === "DEPTH_ORGANIZATION")?.score ?? null,
    IMAGES_COMPOSITION: second.dimensionScores.find((row) => row.dimension === "IMAGES_COMPOSITION")?.score ?? null,
    MOBILE_EXPERIENCE: second.dimensionScores.find((row) => row.dimension === "MOBILE_EXPERIENCE")?.score ?? null,
    TRANSPARENCY_LEGIBILITY: second.dimensionScores.find((row) => row.dimension === "TRANSPARENCY_LEGIBILITY")?.score ?? null,
    GALLERY_SUPPRESSION_IMPACT: impact,
    AUTO_CORRECTIONS_APPLIED: ["REPORT_RENDERED_GALLERY_ONLY"],
    REAL_OPENAI_CALLS: 2,
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: second.assessmentStatus === "QUALITY_PASSED" ? "QUALITY_PASSED" : "CORRECTION_REASSESSED",
    FINAL_QUALITY_STATUS: second.assessmentStatus,
    EXECUTION_54AI_STATUS: second.assessmentStatus,
  };
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(next, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "comparison.json"), `${JSON.stringify({ previous: { best: 74, lastWithGallery: 65, firstEval: first.overallScore }, current: second.overallScore, impact }, null, 2)}\n`);
  console.log(`54AI reeval score=${second.overallScore} impact=${impact} cost=${ledger.spentUsd} status=${second.assessmentStatus}`);
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
