// npx tsx scripts/run-execution-54z-baseline.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { runApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { assessPresellQuality } from "../src/lib/product-research/presell-quality.ts";
import { deterministicBaselineAssessment } from "../src/lib/presell-quality/baseline.ts";
import { writeQualityAssessment } from "../src/lib/presell-quality/persist.ts";
import { tenProductProtocol } from "../src/lib/presell-quality/protocol.ts";
import { qualityCostGate } from "../src/lib/presell-quality/cost.ts";

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const snap = snapshotProductResearch(237);
  if (!snap.latest) throw new Error("Campaign 237 has no research run.");
  const acceptedBefore = acceptedProposals(snap.latest).map((item) => `${item.field}:${item.status}`);
  const assetsBefore = (snap.latest.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.galleryKind}:${item.hero ? 1 : 0}`);
  const generation = await runApprovedReviewGeneration({ campaignId: 237, runId: snap.latest.runId });
  const after = snapshotProductResearch(237);
  const acceptedAfter = acceptedProposals(after.latest).map((item) => `${item.field}:${item.status}`);
  const assetsAfter = (after.latest?.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.galleryKind}:${item.hero ? 1 : 0}`);
  if (acceptedBefore.join("|") !== acceptedAfter.join("|")) throw new Error("54Z baseline changed 237 fact approvals.");
  if (assetsBefore.join("|") !== assetsAfter.join("|")) throw new Error("54Z baseline changed 237 assets.");
  const research = assessPresellQuality({ run: after.latest, sandboxStatus: generation.status });
  const assessment = writeQualityAssessment(
    deterministicBaselineAssessment({
      run: after.latest,
      campaignId: 237,
      generationId: generation.generationId,
      desktopScreenshotReference: "data/evidence/execution-54z-quality-baseline/screenshots/desktop/237-full.png",
      mobileScreenshotReference: "data/evidence/execution-54z-quality-baseline/screenshots/mobile/237-full.png",
    }),
  );
  const dir = path.join("data/evidence/execution-54z-quality-baseline/reports");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "baseline-237.json"),
    `${JSON.stringify({
      runId: after.latest?.runId,
      acceptedFacts: acceptedAfter,
      generationId: generation.generationId,
      previewPath: generation.previewPath,
      contentStatus: generation.status,
      heroImageStatus: generation.heroImageStatus,
      research,
      assessment,
      protocol: tenProductProtocol()[0],
      paidAi: process.env.AIA_ALLOW_PAID_AI,
      costGate: qualityCostGate(),
    }, null, 2)}\n`,
  );
  console.log(`54Z baseline preview=${generation.previewPath} status=${generation.status} quality=${assessment.assessmentStatus} score=${assessment.overallScore}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
