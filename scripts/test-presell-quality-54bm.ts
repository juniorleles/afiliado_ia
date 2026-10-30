import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import { parseVisualEvaluationPayload } from "../src/lib/presell-quality/visual-eval.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BM_BUDGET,
  EXECUTION_54BM_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  PRESELL_STANDARD_ID,
  FORBIDDEN_REFERENCE_CHROME,
  methodologyThresholdsFrozen,
  BEST_KNOWN_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  STRUCTURAL_COMPOSITION_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  VISUAL_HIERARCHY_EXECUTION_ID,
  PREMIUM_STRUCTURAL_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumStructuralComposition,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  conservativeMinPair,
  EVALUATOR_VARIATION_LIMIT,
  officialPerDimensionStability,
  dimensionPairStability,
  selectBestCandidate,
  evaluationIdentityOf,
  mapPresellStandardV1,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BM_BUDGET as BM_LEDGER,
  EXECUTION_54BM_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const evidence = path.join(ROOT, "data/evidence/execution-54bm-evaluation-reliability");
const blEvidence = path.join(ROOT, "data/evidence/execution-54bl-structural-composition");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BL_COMMIT = "4d531b2e075141f5164991b4197fbd73c25403b3";
const BL_MESSAGE = "feat(presell): preserve experimental structural composition and evaluation evidence";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const REQUIRED = [
  "execution-summary.md",
  "git-audit.json",
  "54bi-baseline-integrity.json",
  "54bl-evaluation-forensics.json",
  "evaluation-pipeline-audit.json",
  "evaluation-request-observability.json",
  "evaluation-pair-comparison.json",
  "historical-score-variance.json",
  "visual-gap-analysis.json",
  "visual-comparison-inventory.json",
  "content-vs-design-gap-analysis.json",
  "evaluation-reliability-assessment.json",
  "execution-54bn-implementation-plan.md",
  "regression-results.json",
  "budget-ledger.json",
];
const VISUAL_PATHS = [
  "src/app/premium-design-engine.css",
  "src/components/presell/standard-v1-page.tsx",
  "src/components/design-system/premium-blocks.tsx",
  "src/lib/design-system/tokens.ts",
  "src/components/product-showcase/v4/page.tsx",
];

function readJson(dir: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
}

function git(command: string): string {
  return execSync(command, { cwd: ROOT, encoding: "utf8" }).trim();
}

assert(
  REQUIRED.every((file) => existsSync(path.join(evidence, file))),
  "0. 54BM evidence files exist in a new directory",
);

const blPresent = git(`git cat-file -t ${BL_COMMIT}`) === "commit";
const blMessage = git(`git log -1 --format=%s ${BL_COMMIT}`);
const gitAudit = readJson(evidence, "git-audit.json");
assert(
  blPresent &&
    blMessage === BL_MESSAGE &&
    gitAudit.blCommit === BL_COMMIT &&
    gitAudit.blCommitMessage === BL_MESSAGE &&
    gitAudit.pushExecuted === false &&
    gitAudit.bmCommitCreated === false,
  "1. 54BL commit integrity is preserved with the required message",
);

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" &&
    checkpoint.sourceCommit === BI_COMMIT &&
    checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "2. 54BI checkpoint remains recoverable",
);

const stored = readRendererCandidateSelection(237);
const liveBest = JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/best-candidate.json"), "utf8")) as {
  desktopVisualScore?: number;
  mobileVisualScore?: number;
  editorialScore?: number;
  humanReviewUnlocked?: boolean;
  qualityApproved?: boolean;
};
const biOfficial = readJson(biEvidence, "official-v2-results.json");
assert(
  stored.activeExecutionId === "54BI" &&
    liveBest.desktopVisualScore === 74 &&
    liveBest.mobileVisualScore === 72 &&
    liveBest.editorialScore === 74 &&
    liveBest.humanReviewUnlocked === false &&
    liveBest.qualityApproved === false &&
    biOfficial.finalDesktopVisualScore === 74 &&
    biOfficial.finalMobileVisualScore === 72 &&
    biOfficial.finalEditorialScore === 74 &&
    STRUCTURAL_COMPOSITION_EXECUTION_ID === "54BL" &&
    CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BQ" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    resolveRendererCandidate({ requested: "54BI" }).executionId === "54BI" &&
    resolveRendererCandidate({ requested: "54BL" }).executionId === "54BL",
  "3. active 54BI selection is preserved and 54BL remains experimental",
);

const standard = loadPremiumPresellDesignStandard();
assert(standard.hash === EXPECTED_REFERENCE, "4. official premium reference hash is unchanged");

const blOfficial = readJson(blEvidence, "official-v2-results.json");
const inventory = readJson(evidence, "visual-comparison-inventory.json");
const historical = readJson(evidence, "historical-score-variance.json");
assert(
  blOfficial.finalDesktopVisualScore === 72 &&
    blOfficial.finalMobileVisualScore === 68 &&
    blOfficial.finalEditorialScore === 68 &&
    Array.isArray(inventory.items) &&
    Array.isArray(historical.rows) &&
    (historical.rows as unknown[]).length >= 29,
  "5. official 54BL results and historical inventory are present",
);

const hashes = readJson(blEvidence, "screenshot-hashes.json");
const pair = readJson(evidence, "evaluation-pair-comparison.json");
const currentHashes = hashes.current as Record<string, string>;
assert(
  currentHashes["desktop-first-fold.png"] === "324dc48b47cddf7df5f4f28cf756e5270160890c8fec56e3a9c3362c594c2637" &&
    currentHashes["mobile-first-fold.png"] === "32f613cc19041694b177ea1da708afba114527518cda28d8e02b5be1b2f0b278" &&
    (hashes.previous54bi as Record<string, string>)["desktop-first-fold.png"] ===
      "5807c9b4816a073cacda5a4676798aa7fe31ea8904a4e589ab05e18f82bd2106" &&
    pair.pairs != null,
  "6. capture hashes are compared and differ from 54BI",
);

const raw = readJson(blEvidence, "raw-evaluator-responses.json");
assert(
  raw.visualPromptVersion === "2" &&
    raw.qualityPromptVersion === "4" &&
    raw.visualRubricVersion === PREMIUM_VISUAL_EVALUATION_V2 &&
    QUALITY_PROMPT_VERSION === "4",
  "7. prompt and rubric versions match across the 54BL pair",
);

const requestObs = readJson(evidence, "evaluation-request-observability.json");
const providerSrc = readFileSync(path.join(ROOT, "src/lib/presell-quality/openai-provider.ts"), "utf8");
assert(
  raw.temperaturePinned === false &&
    requestObs.temperaturePinned === false &&
    !/temperature\s*:/.test(providerSrc) &&
    providerSrc.includes("max_output_tokens: 4096") &&
    requestObs.parametersActuallySent != null,
  "8. model parameters that were sent versus omitted are recorded",
);

const visual1 = readJson(blEvidence, "visual-evaluation-run-1.json");
const visual2 = readJson(blEvidence, "visual-evaluation-run-2.json");
const parsed1 = parseVisualEvaluationPayload(String(visual1.raw));
const parsed2 = parseVisualEvaluationPayload(String(visual2.raw));
assert(
  typeof visual1.raw === "string" &&
    typeof visual2.raw === "string" &&
    parsed1.desktopVisualScore === 72 &&
    parsed1.mobileVisualScore === 68 &&
    parsed2.desktopVisualScore === 75 &&
    parsed2.mobileVisualScore === 78 &&
    visual1.desktopScore === 72 &&
    visual2.desktopScore === 75,
  "9. raw visual responses are complete and parser-preserved",
);

const forensics = readJson(evidence, "54bl-evaluation-forensics.json");
const desktopOfficial = blOfficial as {
  desktopVisualRun1: number;
  desktopVisualRun2: number;
  mobileVisualRun1: number;
  mobileVisualRun2: number;
  editorialRun1: number;
  editorialRun2: number;
};
assert(
  Math.abs(desktopOfficial.mobileVisualRun1 - desktopOfficial.mobileVisualRun2) === 10 &&
    Math.abs(desktopOfficial.editorialRun1 - desktopOfficial.editorialRun2) === 10 &&
    Math.abs(desktopOfficial.desktopVisualRun1 - desktopOfficial.desktopVisualRun2) === 3 &&
    forensics.official != null,
  "10. 54BL spreads are 3 / 10 / 10",
);

assert(
  conservativeMinPair(desktopOfficial.desktopVisualRun1, desktopOfficial.desktopVisualRun2) === 72 &&
    conservativeMinPair(desktopOfficial.mobileVisualRun1, desktopOfficial.mobileVisualRun2) === 68 &&
    conservativeMinPair(desktopOfficial.editorialRun1, desktopOfficial.editorialRun2) === 68 &&
    blOfficial.finalDesktopVisualScore === 72 &&
    blOfficial.finalMobileVisualScore === 68 &&
    blOfficial.finalEditorialScore === 68,
  "11. official scores remain the minimum of each pair",
);

const stability = officialPerDimensionStability({
  desktop: [desktopOfficial.desktopVisualRun1, desktopOfficial.desktopVisualRun2],
  mobile: [desktopOfficial.mobileVisualRun1, desktopOfficial.mobileVisualRun2],
  editorial: [desktopOfficial.editorialRun1, desktopOfficial.editorialRun2],
});
const recordedStability = readJson(blEvidence, "evaluator-stability.json");
assert(
  EVALUATOR_VARIATION_LIMIT === 8 &&
    dimensionPairStability(68, 78) === "UNSTABLE" &&
    dimensionPairStability(72, 75) === "STABLE" &&
    dimensionPairStability(70, 62) === "STABLE" &&
    stability.desktop === "STABLE" &&
    stability.mobile === "UNSTABLE" &&
    stability.editorial === "UNSTABLE" &&
    recordedStability.combined === "UNSTABLE",
  "12. stability classification matches the variation limit",
);

const identity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  rendererVersion: "v4",
  sourceCommit: BI_COMMIT,
  referenceHash: EXPECTED_REFERENCE,
  screenshotHashes: ["a", "b"],
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  rubricVersion: "2",
  promptVersion: "2",
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  captureMode: "VISITOR_VISUAL_CAPTURE",
  adminChromePresent: false,
  model: "gpt-4o-mini",
  evaluatedAt: null,
  scores: null,
  rationales: null,
});
const selector = selectBestCandidate({
  current: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 74,
    mobileVisualScore: 72,
    editorialScore: 74,
    identity,
    notes: [],
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    state: "BEST_KNOWN",
    qualityApproved: false,
    humanReviewUnlocked: false,
  },
  incoming: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 72,
    mobileVisualScore: 68,
    editorialScore: 68,
    identity,
    notes: [],
  },
});
const comparison = readJson(blEvidence, "best-candidate-comparison.json");
assert(
  selector.updated === false &&
    comparison.kept === false &&
    String(comparison.reason).includes("not a proven improvement") &&
    usesPremiumStructuralComposition("54BL") &&
    !usesPremiumStructuralComposition("54BI") &&
    experimentalExecutionIdOf("54BL") === "54BL" &&
    parseRendererCandidateId("PREMIUM_STRUCTURAL_V2") === PRESELL_STANDARD_ID &&
    PREMIUM_STRUCTURAL_COMPOSITION_ID === "PREMIUM_STRUCTURAL_V2",
  "13. Best Candidate Selector keeps 54BI and rejects 54BL",
);

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 72,
  desktopVisualScore: 72,
  mobileVisualScore: 68,
  editorialScore: 68,
  evaluatorStability: "EVALUATOR_UNSTABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
const writtenGate = readJson(blEvidence, "quality-gate-decision.json");
assert(
  blocked.status === "QUALITY_BLOCKED" &&
    blocked.publicationUnlocked === false &&
    writtenGate.status === "QUALITY_BLOCKED" &&
    writtenGate.humanReviewUnlocked === false,
  "14. Global Quality Gate stays QUALITY_BLOCKED",
);

const gaps = readJson(evidence, "visual-gap-analysis.json");
const gapList = gaps.gaps as Array<{ GAP_ID: string; CONFIDENCE: string }>;
assert(
  gapList.some((row) => row.GAP_ID === "VG-002" && row.CONFIDENCE === "CONFIRMED") &&
    gapList.some((row) => row.GAP_ID === "VG-011" && row.CONFIDENCE === "INCONCLUSIVE") &&
    gapList.some((row) => row.GAP_ID === "VG-013" && row.CONFIDENCE === "INCONCLUSIVE") &&
    Number((gaps.counts as { CONFIRMED?: number }).CONFIRMED) >= 8,
  "15. visual audit classifies confirmed versus inconclusive gaps",
);

const reliability = readJson(evidence, "evaluation-reliability-assessment.json");
const pipeline = readJson(evidence, "evaluation-pipeline-audit.json");
const classes = JSON.stringify(readJson(evidence, "content-vs-design-gap-analysis.json"));
assert(
  reliability.EVALUATION_RELIABILITY === "LIMITED" &&
    JSON.stringify(pipeline.observabilityFields).includes("MISSING") &&
    classes.includes("VISUAL_COMPOSITION") &&
    classes.includes("CONTENT_RESTRICTION") &&
    classes.includes("EVALUATOR_UNCERTAINTY"),
  "16. evidence classification and LIMITED reliability are recorded",
);

const plan = readFileSync(path.join(evidence, "execution-54bn-implementation-plan.md"), "utf8");
assert(
  plan.includes("Recommended path: **A — Instrumentação do avaliador**") &&
    plan.includes("BATCH_ID: BN-01") &&
    plan.includes("BATCH_ID: BN-04") &&
    plan.includes("Do not execute these batches in 54BM") &&
    plan.includes("PREMIUM_VISUAL_EVALUATION_V2"),
  "17. 54BN plan is ready and was not executed",
);

const ledger = readJson(evidence, "budget-ledger.json");
assert(
  EXECUTION_54BM_MAX_AI_COST_USD === 0 &&
    EXECUTION_54BM_BUDGET.maxUsd === 0 &&
    BM_LEDGER.maxUsd === 0 &&
    EXECUTION_54BM_ID === "execution-54bm" &&
    Number(ledger.spentUsd) === 0 &&
    Number(ledger.paidCallCount) === 0 &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bm", 0), { kind: "EVALUATION", reserveUsd: 0.01 }, BM_LEDGER)
      .allowed,
  "18. exclusive 54BM budget is US$0.00 and refuses paid reserves",
);

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "19. Product Contract remains valid");

const lab = disableCommercialCta(buildV4Model("s1")!);
const biHtml = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID }));
const blHtml = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: STRUCTURAL_COMPOSITION_EXECUTION_ID }));
assert(
  lab.hopSlot === "none" &&
    /data-v4-cta="preview-disabled"/.test(biHtml) &&
    /data-v4-cta="preview-disabled"/.test(blHtml) &&
    mapPresellStandardV1(lab).cta.enabled === false,
  "20. CTA stays blocked",
);

assert(integrity.publicationReadiness === "BLOCKED" && blocked.publicationUnlocked === false, "21. publication stays blocked");
assert(
  VISUAL_SCORE_TARGET === 90 &&
    QUALITY_SCORE_TARGET === 85 &&
    !canEnterHumanReviewQueue(blocked) &&
    requestPresellHumanReview(blocked).ok === false &&
    methodologyThresholdsFrozen(),
  "22. ads and human review remain blocked below 90/90/85",
);

const BM_COMMIT = "0f1f76269638936361f79df248462617c9b2291d";
const visualDiff = git(`git diff --name-only ${BL_COMMIT} ${BM_COMMIT} -- ${VISUAL_PATHS.join(" ")}`);
const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
assert(
  visualDiff === "" &&
    css.includes('[data-presell-execution="54BL"]') &&
    css.includes('[data-presell-execution="54BJ"]') &&
    !/scale\(1\.14\)/.test(css) &&
    /data-presell-composition="PREMIUM_STRUCTURAL_V2"/.test(blHtml) &&
    !/data-presell-composition="PREMIUM_STRUCTURAL_V2"/.test(biHtml),
  "22b. 54BM did not change visual CSS or composition files",
);

assert(
  resolveRendererCandidate({ requested: VISUAL_HIERARCHY_EXECUTION_ID }).executionId === "54BJ" &&
    resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID }).id === BEST_KNOWN_CANDIDATE_ID &&
    !FORBIDDEN_REFERENCE_CHROME.test(biHtml) &&
    !FORBIDDEN_REFERENCE_CHROME.test(blHtml),
  "22c. 54BJ/54AZ remain renderable and forbidden chrome stays absent",
);

assert(historical["54blIsolated"] === false, "22d. 54BL instability is recorded as recurrent, not isolated");

console.log(`PASS ${passed}`);
