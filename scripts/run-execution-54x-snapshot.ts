// npx tsx scripts/run-execution-54x-snapshot.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { classifyMissingFieldCause } from "../src/lib/product-research/gaps.ts";
import { assessPresellQuality } from "../src/lib/product-research/presell-quality.ts";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";

const DIR = path.join("data/evidence/execution-54x-deep-product-research/reports");

function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  mkdirSync(DIR, { recursive: true });
  const snap = snapshotProductResearch(237);
  const generation = loadApprovedReviewGeneration(237);
  const quality = assessPresellQuality({ run: snap.latest, sandboxStatus: generation?.status });
  const payload = {
    runId: snap.latest?.runId,
    coverage: `${snap.latest?.coverageTotal}/${snap.latest?.coverageMax}`,
    review: `${snap.latest?.reviewAccepted}/${snap.latest?.reviewTotal}`,
    accepted: acceptedProposals(snap.latest).map((item) => item.field),
    pending: (snap.latest?.proposals ?? [])
      .filter((item) => item.suggestedValue.trim() && item.status !== "ACCEPTED" && item.status !== "REJECTED" && item.status !== "NOT_FOUND")
      .map((item) => ({ field: item.field, status: item.status, excerpt: item.evidenceExcerpt })),
    gaps: (snap.latest?.proposals ?? []).map((item) => ({ field: item.field, status: item.status, cause: classifyMissingFieldCause(item) })),
    sources: snap.latest?.sources.map((item) => ({ url: item.url, ok: item.ok, mode: item.extractionMode, class: item.sourceClass })),
    assets: (snap.latest?.discoveredAssets ?? []).map((item) => ({ status: item.status, hero: item.hero, kind: item.galleryKind })),
    quality,
    generation: generation
      ? { id: generation.generationId, status: generation.status, previewPath: generation.previewPath, hero: generation.heroImageStatus }
      : null,
  };
  writeFileSync(path.join(DIR, "campaign-237-deep-research.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`54X snapshot coverage=${payload.coverage} review=${payload.review} pending=${payload.pending.map((item) => item.field).join(",") || "none"} preview=${payload.generation?.previewPath}`);
}

main();
