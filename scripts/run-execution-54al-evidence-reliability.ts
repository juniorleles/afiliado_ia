import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { FactCandidate } from "../src/lib/presell-quality/recovery.ts";
import {
  aggregateValidAssessments,
  classifyAssessmentValidity,
  diagnoseEvaluatorPair,
  ASSESSMENT_VALIDITY_VERSION,
  DISPERSION_LIMIT,
} from "../src/lib/presell-quality/assessment-validity.ts";
import { auditQualityRubric } from "../src/lib/presell-quality/rubric-audit.ts";
import { autoAcceptDecision, buildEvidenceInventory, reviewQueueFromInventory } from "../src/lib/presell-quality/evidence-inventory.ts";
import { buildContentGapReport } from "../src/lib/presell-quality/content-gap-report.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION } from "../src/lib/presell-quality/types.ts";
import { EXECUTION_54AL_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { paidAiAuthorization } from "../src/lib/ai/paid-gate.ts";

const ROOT = path.join(process.cwd(), "data/evidence/execution-54al-evidence-reliability");
const REPORTS = path.join(ROOT, "reports");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  mkdirSync(REPORTS, { recursive: true });
  const aj1 = readJson<PresellQualityAssessment>("data/evidence/execution-54aj-authorized-images/reports/eval-1.json");
  const aj2 = readJson<PresellQualityAssessment>("data/evidence/execution-54aj-authorized-images/reports/eval-2.json");
  const ak1 = readJson<PresellQualityAssessment>("data/evidence/execution-54ak-copy-optimization/reports/eval-1.json");
  const ak2 = readJson<PresellQualityAssessment>("data/evidence/execution-54ak-copy-optimization/reports/eval-2.json");

  const score16 = diagnoseEvaluatorPair({ first: ak1, second: ak2 });
  const ajPair = diagnoseEvaluatorPair({ first: aj1, second: aj2 });
  const diagnosis = {
    protocolVersion: ASSESSMENT_VALIDITY_VERSION,
    dispersionLimit: DISPERSION_LIMIT,
    campaignId: 237,
    questions: {
      payloadInvalid: classifyAssessmentValidity({ assessment: ak1 }).state === "SCHEMA_INVALID",
      validButDivergent: score16.rootCause === "VALID_BUT_DISCORDANT",
      materialChanged: !score16.sameScreenshots,
      sameImages: score16.sameScreenshots,
      truncated: false,
      scaleMisread: ak1.dimensionScores.every((row) => row.score >= 0 && row.score <= 100) === false,
      discardedByDocumentedRule: false,
      discardedByScriptHeuristic: true,
      rubricRequiresUnsupportedClaims: false,
      singleCallDependent: true,
    },
    score16: {
      assessmentId: ak1.assessmentId,
      overallScore: ak1.overallScore,
      validity: classifyAssessmentValidity({ assessment: ak1 }).state,
      hostWeightedCheck: 16,
      tokenUsage: ak1.tokenUsage,
      errorCode: ak1.errorCode,
      generationId: ak1.generationId,
      screenshotHashes: ak1.screenshotHashes,
    },
    score76: {
      assessmentId: ak2.assessmentId,
      overallScore: ak2.overallScore,
      validity: classifyAssessmentValidity({ assessment: ak2 }).state,
      generationId: ak2.generationId,
      screenshotHashes: ak2.screenshotHashes,
    },
    score82: {
      assessmentId: aj2.assessmentId,
      overallScore: aj2.overallScore,
      validity: classifyAssessmentValidity({ assessment: aj2 }).state,
      generationId: aj2.generationId,
    },
    ajEval1: classifyAssessmentValidity({ assessment: aj1 }),
    akPair: score16,
    ajPair,
    rootCause: score16.rootCause,
    notes: [
      "Score 16 is a completed, schema-valid, host-weighted assessment of the same screenshot hashes as score 76.",
      "54AK discarded it because the runner treated score <= 40 as unstable. That heuristic is not a library discard rule.",
      "The new protocol keeps score 16 as VALID_ASSESSMENT in isolation and VALID_BUT_DISCORDANT in the same-screenshot pair.",
      "54AJ eval-1 is SCHEMA_INVALID (duplicate dimension / MISSING_DIMENSION) and is discarded objectively.",
      "Do not assign the 54AJ score 82 to the 54AK generation.",
    ],
  };

  const validity = {
    protocolVersion: ASSESSMENT_VALIDITY_VERSION,
    ak: aggregateValidAssessments([ak1, ak2]),
    aj: aggregateValidAssessments([aj1, aj2]),
    officialAk: aggregateValidAssessments([ak1, ak2]).officialScore,
    officialAj: aggregateValidAssessments([aj1, aj2]).officialScore,
    qualityPassedBlockedWhileUnstable: aggregateValidAssessments([ak1, ak2]).officialStatus !== "QUALITY_PASSED",
  };

  const rubric = auditQualityRubric({
    evaluatorRationales: [
      ...ak1.dimensionScores.map((row) => row.rationale),
      ...ak2.dimensionScores.map((row) => row.rationale),
      ...aj2.dimensionScores.map((row) => row.rationale),
    ],
  });

  const run = readLatestProductResearch(237);
  const expansion = existsSync("data/presell-quality/237/expansion-54ae.json")
    ? readJson<{ factCandidates?: FactCandidate[] }>("data/presell-quality/237/expansion-54ae.json")
    : { factCandidates: [] };
  const inventory = buildEvidenceInventory({
    campaignId: 237,
    run,
    candidates: expansion.factCandidates ?? [],
    officialHosts: [],
    idPrefix: "54AE",
  });
  const gaps = buildContentGapReport({ inventory });
  const queue = reviewQueueFromInventory(inventory);
  const accepted = acceptedProposals(run);

  const generations = {
    aj: {
      generationId: aj2.generationId,
      assessmentId: aj2.assessmentId,
      score: aj2.overallScore,
      screenshotHashes: aj2.screenshotHashes,
      evidenceDir: "data/evidence/execution-54aj-authorized-images",
      preserved: existsSync("data/evidence/execution-54aj-authorized-images/reports/eval-2.json"),
    },
    ak: {
      generationId: ak2.generationId,
      assessmentId: ak2.assessmentId,
      score: ak2.overallScore,
      screenshotHashes: ak2.screenshotHashes,
      evidenceDir: "data/evidence/execution-54ak-copy-optimization",
      preserved: existsSync("data/evidence/execution-54ak-copy-optimization/reports/eval-2.json"),
    },
    newPresellGenerated: false,
    rollbackExecuted: false,
  };

  const complementaryResearch = {
    performed: false,
    reason: "Existing informational pages were already fetched in prior executions. No new checkout, hop, or affiliate-tracking fetch is authorized in 54AL.",
    avoided: ["checkout", "affiliate hop", "order-now", "clickbank tracking"],
    storedSourcesInspected: 5,
    newFactsAccepted: 0,
  };

  writeJson(path.join(REPORTS, "evaluator-diagnosis.json"), diagnosis);
  writeJson(path.join(REPORTS, "assessment-validity.json"), validity);
  writeJson(path.join(REPORTS, "rubric-audit.json"), rubric);
  writeJson(path.join(REPORTS, "evidence-inventory.json"), inventory);
  writeJson(path.join(REPORTS, "content-gaps.json"), gaps);
  writeJson(path.join(REPORTS, "candidate-review-queue.json"), {
    policy: autoAcceptDecision(),
    readyForReview: queue.filter((item) => item.currentState === "READY_FOR_REVIEW"),
    needsIndependentEvidence: queue.filter((item) => item.currentState === "NEEDS_INDEPENDENT_EVIDENCE").length,
    medicalBlocked: inventory.totals.medicalBlocked,
    items: queue,
  });
  writeJson(path.join(REPORTS, "generation-preservation.json"), generations);
  writeJson(path.join(REPORTS, "complementary-research.json"), complementaryResearch);

  const summary = `# Execution 54AL — evidence coverage and quality reliability

- Protocol version: ${ASSESSMENT_VALIDITY_VERSION}
- Dispersion limit: ${DISPERSION_LIMIT}
- Score 16 validity: ${classifyAssessmentValidity({ assessment: ak1 }).state}
- Score 16 root cause: ${score16.rootCause}
- 54AK official aggregated score: ${validity.officialAk} (${validity.ak.reliabilityStatus})
- 54AJ official aggregated score: ${validity.officialAj} (${validity.aj.reliabilityStatus})
- Rubric changed: ${rubric.versionChanged}
- Accepted facts: ${accepted.length}
- Candidates inventoried: ${inventory.totals.candidates}
- Ready for review: ${inventory.totals.readyForReview}
- New facts accepted: 0
- Real OpenAI calls: 0
- Paid AI authorization: ${paidAiAuthorization().allowed ? "ACTIVE" : "NOT_GRANTED"}
- Budget unused: $${EXECUTION_54AL_BUDGET.maxUsd.toFixed(2)} ${EXECUTION_54AL_BUDGET.provider} / prompt ${QUALITY_PROMPT_VERSION} / rubric ${QUALITY_RUBRIC_VERSION}
- Commercial authorization: BLOCKED
- Publication readiness: BLOCKED
`;
  writeFileSync(path.join(REPORTS, "execution-summary.md"), summary);
  writeJson(path.join(REPORTS, "summary.json"), {
    campaignId: 237,
    score16RootCause: score16.rootCause,
    evaluatorReliability: validity.ak.reliabilityStatus,
    rubricVersionChanged: false,
    acceptedFacts: accepted.length,
    readyForReview: inventory.totals.readyForReview,
    newFactsAccepted: 0,
    realOpenAiCalls: 0,
    publicationReadiness: "BLOCKED",
    commercialAuthorization: "BLOCKED",
  });
  console.log(summary);
}

main();
