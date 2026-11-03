// npx tsx scripts/run-execution-54y-apply.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyEditorialRecovery } from "../src/lib/product-research/recover.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { writeProductResearchRun } from "../src/lib/product-research/store.ts";
import { runApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { assessPresellQuality } from "../src/lib/product-research/presell-quality.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const before = snapshotProductResearch(237);
  if (!before.latest) throw new Error("Campaign 237 has no research run.");
  const acceptedBefore = acceptedProposals(before.latest).map((item) => `${item.field}:${item.currentValue || item.suggestedValue}`);
  const assetsBefore = (before.latest.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.galleryKind}:${item.hero ? 1 : 0}`);
  const recovered = applyEditorialRecovery(before.latest);
  const acceptedAfter = acceptedProposals(recovered).map((item) => `${item.field}:${item.currentValue || item.suggestedValue}`);
  const assetsAfter = (recovered.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.galleryKind}:${item.hero ? 1 : 0}`);
  if (acceptedBefore.join("|") !== acceptedAfter.join("|")) throw new Error("54Y apply would change accepted facts.");
  if (assetsBefore.join("|") !== assetsAfter.join("|")) throw new Error("54Y apply would change approved image kinds or statuses.");
  const written = writeProductResearchRun(recovered);
  const generation = await runApprovedReviewGeneration({ campaignId: 237, runId: written.runId });
  const quality = assessPresellQuality({ run: written, sandboxStatus: generation.status });
  const dir = path.join("data/evidence/execution-54y-structured-content-recovery/reports");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "apply-237.json"),
    `${JSON.stringify({
      runId: written.runId,
      acceptedFacts: acceptedAfter,
      howItWorks: written.proposals.find((item) => item.field === "howItWorks"),
      description: written.proposals.find((item) => item.field === "description"),
      faq: written.proposals.find((item) => item.field === "faq"),
      packshotProposal: (written.discoveredAssets ?? []).map((item) => ({
        assetUrl: item.assetUrl,
        status: item.status,
        galleryKind: item.galleryKind,
        kindProposal: item.kindProposal ?? null,
      })),
      generationId: generation.generationId,
      previewPath: generation.previewPath,
      contentStatus: generation.status,
      heroImageStatus: generation.heroImageStatus,
      quality,
      paidAi: process.env.AIA_ALLOW_PAID_AI,
    }, null, 2)}\n`,
  );
  console.log(`54Y apply run=${written.runId} preview=${generation.previewPath} status=${generation.status} hero=${generation.heroImageStatus}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
