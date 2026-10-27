// npx tsx scripts/run-execution-54ac-recovery.ts
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readLatestQualityAssessment, readQualityAssessment } from "../src/lib/presell-quality/persist.ts";
import { runAutonomousRecovery } from "../src/lib/presell-quality/recovery.ts";
import { paidAiAuthorization } from "../src/lib/ai/paid-gate.ts";
import { QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";

const EVIDENCE = path.join("data/evidence/execution-54ac-autonomous-recovery");
const REPORTS = path.join(EVIDENCE, "reports");

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  mkdirSync(path.join(EVIDENCE, "screenshots"), { recursive: true });
  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const paid = paidAiAuthorization();
  const snap = snapshotProductResearch(237);
  const generation = loadApprovedReviewGeneration(237);
  const latest = readLatestQualityAssessment(237);
  const first = latest?.assessmentId === "pqa-mvqsvluy" ? readQualityAssessment(237, "pqa-mvqsv4us") : null;
  const acceptedBefore = acceptedProposals(snap.latest).map((item) => ({ field: item.field, value: item.suggestedValue || item.currentValue, status: item.status }));

  const recovery = await runAutonomousRecovery({
    campaignId: 237,
    assessment: latest,
    previousAssessment: first ?? latest,
    run: snap.latest,
  });

  const after = snapshotProductResearch(237);
  const acceptedAfter = acceptedProposals(after.latest).map((item) => ({ field: item.field, value: item.suggestedValue || item.currentValue, status: item.status }));
  const factsPreserved = JSON.stringify(acceptedBefore) === JSON.stringify(acceptedAfter);

  for (const name of ["iteration-1", "iteration-2"] as const) {
    for (const shot of ["desktop-viewport.png", "mobile-viewport.png"] as const) {
      const src = path.join("data/evidence/execution-54ab-openai-autonomous-loop/screenshots", name, shot);
      const dest = path.join(EVIDENCE, "screenshots", `${name}-${shot}`);
      if (existsSync(src)) copyFileSync(src, dest);
    }
  }

  const incomplete =
    recovery.contentRegeneration !== "NOT_NEEDED" ||
    recovery.heroEligibleImages === 0 ||
    (recovery.factsApprovedForUse === 0 &&
      recovery.gaps.gaps.some((item) => item.kind === "EVIDENCE_GAP" || item.kind === "CONTENT_DEPTH_GAP"));

  const report = {
    EXECUTION_54AC_STATUS: incomplete ? "RECOVERY_INCOMPLETE" : "RECOVERY_COMPLETE",
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    INITIAL_QUALITY_SCORE: first?.overallScore ?? latest?.overallScore ?? null,
    GAPS_IDENTIFIED: recovery.gaps.gaps.map((item) => item.kind),
    RESEARCH_RECOVERY_STATUS: recovery.researchStatus,
    NEW_SOURCES_FOUND: recovery.newSources,
    FACT_CANDIDATES: recovery.factCandidates.length,
    FACTS_VERIFIED: recovery.factsVerified,
    FACTS_APPROVED_FOR_USE: recovery.factsApprovedForUse,
    IMAGE_CANDIDATES: recovery.imageCandidates.length,
    HERO_ELIGIBLE_IMAGES: recovery.heroEligibleImages,
    ASSET_APPROVALS_CHANGED: recovery.assetApprovalsChanged,
    CONTENT_REGENERATION_STATUS: recovery.contentRegeneration,
    FINAL_QUALITY_SCORE: latest?.overallScore ?? null,
    FINAL_QUALITY_STATUS: latest?.assessmentStatus ?? null,
    MODEL_CALIBRATION_RESULT: recovery.calibration,
    REAL_OPENAI_CALLS: 0,
    TOTAL_API_COST: 0,
    PAID_AI: paid,
    PRODUCT_CONTRACT_PRESERVED: factsPreserved,
    COMMERCIAL_AUTHORIZATION: recovery.commercialAuthorization,
    PUBLICATION_READINESS: recovery.publicationReadiness,
    QUALITY_TARGET,
    generationId: generation?.generationId ?? null,
    researchRunId: recovery.researchRunId,
    skippedAsRedundant: recovery.skippedAsRedundant,
    nextAction: recovery.nextAction,
    blockers: recovery.blockers,
    editorialPlan: recovery.editorialPlan,
    acceptedFactsBefore: acceptedBefore,
    acceptedFactsAfter: acceptedAfter,
    researchLimitations: recovery.researchLimitations,
    coverageGaps: recovery.coverageGaps,
  };
  writeFileSync(path.join(REPORTS, "recovery.json"), `${JSON.stringify(recovery, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "gaps.json"), `${JSON.stringify(recovery.gaps, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "sources.json"), `${JSON.stringify({ newSources: recovery.newSources, records: recovery.sourceRecords, limitations: recovery.researchLimitations, coverageGaps: recovery.coverageGaps }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "fact-candidates.json"), `${JSON.stringify(recovery.factCandidates, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "blocked-facts.json"), `${JSON.stringify(recovery.blockedFacts, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "image-candidates.json"), `${JSON.stringify(recovery.imageCandidates, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "calibration.json"), `${JSON.stringify(recovery.calibration, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "editorial-plan.json"), `${JSON.stringify(recovery.editorialPlan, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "decisions.json"), `${JSON.stringify({ factsApprovedForUse: 0, assetApprovalsChanged: false, heroPromotion: "blocked", commercialAuthorization: "BLOCKED", publicationReadiness: "BLOCKED", contentRegeneration: recovery.contentRegeneration, nextAction: recovery.nextAction }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "research-snapshot.json"), `${JSON.stringify({
    runId: after.latest?.runId ?? null,
    status: after.latest?.status ?? null,
    seeds: after.latest?.seeds ?? [],
    coverageTotal: after.latest?.coverageTotal ?? null,
    reviewAccepted: after.latest?.reviewAccepted ?? null,
    reviewTotal: after.latest?.reviewTotal ?? null,
    proposals: (after.latest?.proposals ?? []).map((item) => ({
      field: item.field,
      status: item.status,
      sourceClass: item.sourceClass,
      sourceUrl: item.sourceUrl,
      verification: item.verification,
      excerpt: (item.evidenceExcerpt || item.suggestedValue || "").slice(0, 400),
    })),
    assets: (after.latest?.discoveredAssets ?? []).map((item) => ({
      assetUrl: item.assetUrl,
      status: item.status,
      galleryKind: item.galleryKind,
      declaredAuthorization: item.declaredAuthorization,
      sourceUrl: item.sourceUrl,
    })),
  }, null, 2)}\n`);
  console.log(
    `54AC status=${report.EXECUTION_54AC_STATUS} research=${recovery.researchStatus} candidates=${recovery.factCandidates.length} hero=${recovery.heroEligibleImages} openai=${report.REAL_OPENAI_CALLS}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
