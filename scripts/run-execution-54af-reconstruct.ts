// npx tsx scripts/run-execution-54af-reconstruct.ts
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { envLookup, envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { openaiVisionProviderStatus, OPENAI_VISION_MODEL, createOpenAiVisionClient } from "../src/lib/presell-quality/openai-provider.ts";
import { reconstructApprovedPresell } from "../src/lib/presell-quality/reconstruct.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { runQualityImprovementLoop } from "../src/lib/presell-quality/loop.ts";
import { OPENAI_LOOP_BUDGET, emptyBudgetLedger } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { captureEvaluationScreenshots } from "../src/lib/presell-quality/capture.ts";
import { calibrateQualityEvaluator } from "../src/lib/presell-quality/calibration.ts";
import { QUALITY_CALIBRATION_FIXTURES } from "../src/lib/presell-quality/fixtures.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";

const EVIDENCE = path.join("data/evidence/execution-54af-editorial-reconstruction");
const REPORTS = path.join(EVIDENCE, "reports");

function copyShot(src: string | null | undefined, dest: string): boolean {
  if (!src || !existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

async function probeOpenAi(apiKey: string): Promise<{ ok: boolean; models: string[]; reason: string }> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return { ok: false, models: [], reason: redactSecrets(`HTTP_${response.status}`) };
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = (data.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
    const vision = ids.filter((id) => id === "gpt-4o-mini" || id === "gpt-4o" || id.includes("gpt-4o"));
    return { ok: vision.length > 0 || ids.length > 0, models: vision.slice(0, 8), reason: "Models listed." };
  } catch (error) {
    return { ok: false, models: [], reason: redactSecrets(error instanceof Error ? error.message : String(error)) };
  }
}

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  mkdirSync(path.join(EVIDENCE, "screenshots"), { recursive: true });
  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(237);
  const reconstructed = await reconstructApprovedPresell(237);
  const stored = reconstructed.generationId ? readGenerationModel(reconstructed.generationId) : null;
  const snap = snapshotProductResearch(237);
  const accepted = acceptedProposals(snap.latest).map((item) => item.field);
  const media = selectReviewMedia({
    assets: snap.latest?.discoveredAssets,
    productName: stored?.contract.identity.productName ?? "Sugar Defender",
    campaignId: 237,
  });
  const after = campaignIntegritySnapshot(237);
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  const paidBefore = paidAiAuthorization();
  const probe = keyConfigured ? await probeOpenAi(envLookup("OPENAI_API_KEY")) : { ok: false, models: [], reason: "OPENAI_API_KEY is not configured." };

  writeFileSync(
    path.join(REPORTS, "reconstruction.json"),
    `${JSON.stringify({ reconstructed, acceptedFacts: accepted, heroStatus: media.heroStatus, composition: stored?.composition, heroMode: reconstructed.heroMode }, null, 2)}\n`,
  );

  if (!reconstructed.generationId || !reconstructed.previewPath || !stored) {
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify({ EXECUTION_54AF_STATUS: "FAILED", reconstructed }, null, 2)}\n`);
    throw new Error(reconstructed.errors.join("; ") || "Reconstruction failed.");
  }

  let capture = await captureEvaluationScreenshots({
    campaignId: 237,
    generationId: reconstructed.generationId,
    previewPath: reconstructed.previewPath,
    iteration: 0,
  });
  copyShot(capture.desktop?.path, path.join(EVIDENCE, "screenshots", "initial-desktop-full.png"));
  copyShot(capture.mobile?.path, path.join(EVIDENCE, "screenshots", "initial-mobile-full.png"));
  writeFileSync(path.join(REPORTS, "capture-initial.json"), `${JSON.stringify(capture, null, 2)}\n`);

  if (!keyConfigured) {
    const summary = {
      EXECUTION_54AF_STATUS: "PAID_AI_AUTHORIZATION_REQUIRED",
      BASE_COMMIT: baseCommit,
      NEW_GENERATION_ID: reconstructed.generationId,
      HERO_MODE: reconstructed.heroMode,
      OPENAI_LIVE_VALIDATION: false,
      REAL_OPENAI_EVALUATIONS: 0,
      TOTAL_API_COST: 0,
      STOP_REASON: "OPENAI_API_KEY is not configured.",
      paidBefore,
      PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
      ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    };
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`54AF status=PAID_AI_AUTHORIZATION_REQUIRED gen=${reconstructed.generationId} openai=0`);
    return;
  }
  writeFileSync(path.join(REPORTS, "openai-probe.json"), `${JSON.stringify({ ...probe, note: "A 403 on /v1/models does not by itself block Responses API vision calls." }, null, 2)}\n`);

  const result = await runWithTemporaryPaidAi({ scope: "54AF", provider: "openai", maxUsd: OPENAI_LOOP_BUDGET.maxUsd }, async () => {
    const status = openaiVisionProviderStatus();
    if (!status.authorized) throw new Error(status.reason);
    return runQualityImprovementLoop(
      {
        campaignId: 237,
        generationId: reconstructed.generationId!,
        previewPath: reconstructed.previewPath!,
        model: stored,
        approvedFacts: accepted,
        evidenceReferences: [snap.latest?.runId ?? "research-237"],
        approvedAssets: media.approved.map((item) => ({
          id: item.assetId,
          eligible: item.editorialEligibility === "ELIGIBLE" && item.galleryKind === "PRODUCT_PACKSHOT",
          kind: item.galleryKind,
        })),
        editorialConstraints: [
          "EDITORIAL_NO_IMAGE is required. Do not treat the missing packshot as a broken layout.",
          "Do not invent benefits, testimonials, prices, manufacturer, or clinical claims.",
          "Do not promote ineligible gallery images to the hero.",
          "Do not approve assets, publish, or authorize ads.",
          "SANDBOX is a lab label, not a live commercial hop.",
        ],
        heroEligible: false,
        baseUrl: "http://127.0.0.1:3000",
      },
      {
        ledger: emptyBudgetLedger("54AF"),
        evaluator: createMultimodalPresellEvaluator({
          skipCache: true,
          client: createOpenAiVisionClient(),
        }),
      },
    );
  });

  const first = result.iterations[0];
  const last = result.iterations[result.iterations.length - 1];
  const calibration = calibrateQualityEvaluator({
    first: first
      ? {
          generationId: first.generationId,
          screenshotHashes: first.screenshotHashes,
          mobileScreenshotReference: first.capture?.mobile?.path ?? null,
          dimensionScores: [],
          findings: first.findings,
          recommendedActions: [],
          overallScore: first.score,
        } as never
      : null,
  });
  result.iterations.forEach((item) => {
    const folder = path.join(EVIDENCE, "screenshots", `iteration-${item.iteration}`);
    copyShot(item.capture?.desktop?.path, path.join(folder, "desktop-full.png"));
    copyShot(item.capture?.mobile?.path, path.join(folder, "mobile-full.png"));
    writeFileSync(path.join(REPORTS, `iteration-${item.iteration}.json`), `${JSON.stringify(item, null, 2)}\n`);
  });

  const finalAfter = campaignIntegritySnapshot(237);
  const summary = {
    EXECUTION_54AF_STATUS: result.status,
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    EDITORIAL_RECONSTRUCTION_STATUS: reconstructed.status,
    NEW_GENERATION_ID: reconstructed.generationId,
    HERO_MODE: reconstructed.heroMode,
    APPROVED_FACTS_USED: reconstructed.approvedFactsUsed,
    UNAPPROVED_FACTS_USED: reconstructed.unapprovedFactsUsed,
    DESKTOP_SCREENSHOT: path.join(EVIDENCE, "screenshots", `iteration-${last?.iteration ?? 0}`, "desktop-full.png").replace(/\\/g, "/"),
    MOBILE_SCREENSHOT: path.join(EVIDENCE, "screenshots", `iteration-${last?.iteration ?? 0}`, "mobile-full.png").replace(/\\/g, "/"),
    OPENAI_PROVIDER: "openai",
    OPENAI_MODEL: OPENAI_VISION_MODEL,
    OPENAI_LIVE_VALIDATION: result.ledger.evaluationCount > 0,
    INITIAL_SCORE: result.initialScore,
    FINAL_SCORE: result.finalScore,
    QUALITY_TARGET,
    AUTO_CORRECTIONS_APPLIED: result.autoFixesApplied,
    AUTO_CORRECTIONS_REJECTED: result.autoFixesRejected,
    REAL_OPENAI_EVALUATIONS: result.ledger.evaluationCount,
    TOTAL_API_COST: result.ledger.spentUsd,
    STOP_REASON: result.stopReason,
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(finalAfter.acceptedFacts),
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(finalAfter.approvedAssets),
    FINAL_QUALITY_STATUS: result.status,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    calibrationFixtures: QUALITY_CALIBRATION_FIXTURES.map((item) => item.id),
    calibration,
    captureOk: capture.ok,
    ledger: result.ledger,
  };
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "loop.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "costs.json"), `${JSON.stringify(result.ledger, null, 2)}\n`);
  console.log(
    `54AF status=${result.status} stop=${result.stopReason} gen=${reconstructed.generationId} initial=${result.initialScore} final=${result.finalScore} evals=${result.ledger.evaluationCount} cost=${result.ledger.spentUsd}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
