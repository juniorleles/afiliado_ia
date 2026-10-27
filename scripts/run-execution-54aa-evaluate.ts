// npx tsx scripts/run-execution-54aa-evaluate.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { paidAiAuthorization } from "../src/lib/ai/paid-gate.ts";
import { multimodalProviderStatus } from "../src/lib/presell-quality/provider.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION } from "../src/lib/presell-quality/types.ts";
import { readLatestQualityAssessment } from "../src/lib/presell-quality/persist.ts";

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const paid = paidAiAuthorization();
  const provider = multimodalProviderStatus();
  const snap = snapshotProductResearch(237);
  const generation = loadApprovedReviewGeneration(237);
  const accepted = acceptedProposals(snap.latest).map((item) => item.field);
  const dir = path.join("data/evidence/execution-54aa-multimodal-evaluator/reports");
  mkdirSync(dir, { recursive: true });

  const latest = readLatestQualityAssessment(237);
  const report = {
    REAL_MULTIMODAL_EVALUATION: "NOT_EXECUTED",
    AIA_ALLOW_PAID_AI: process.env.AIA_ALLOW_PAID_AI,
    paidGate: paid,
    provider,
    campaignId: 237,
    runId: snap.latest?.runId ?? null,
    acceptedFacts: accepted,
    generationId: generation?.generationId ?? null,
    previewPath: generation?.previewPath ?? null,
    latestAssessmentId: latest?.assessmentId ?? null,
    latestEvaluatorType: latest?.evaluatorType ?? null,
    latestStatus: latest?.assessmentStatus ?? null,
    latestScore: latest?.evaluatorType === "MULTIMODAL_AI" ? latest.overallScore : null,
    SUGAR_DEFENDER_AI_SCORE: "NOT_EVALUATED",
    promptVersion: QUALITY_PROMPT_VERSION,
    rubricVersion: QUALITY_RUBRIC_VERSION,
  };
  writeFileSync(path.join(dir, "integration.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`54AA REAL_MULTIMODAL_EVALUATION=NOT_EXECUTED score=${report.SUGAR_DEFENDER_AI_SCORE} paid=${paid.allowed}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
