import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BK_BUDGET,
  EXECUTION_54BK_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  PRESELL_STANDARD_ID,
  FORBIDDEN_REFERENCE_CHROME,
  methodologyThresholdsFrozen,
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  experimentalExecutionIdOf,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  conservativeMinPair,
  EVALUATOR_VARIATION_LIMIT,
  mapPresellStandardV1,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BK_BUDGET as BK_LEDGER,
  EXECUTION_54BK_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bk-architectural-analysis");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const bjEvidence = path.join(ROOT, "data/evidence/execution-54bj-visual-hierarchy");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const BJ_COMMIT = "2a648452cd47cc34c441ee70a751a798842c1175";
const BJ_MESSAGE = "test(presell): preserve visual regression evidence and candidate isolation";
const REQUIRED = [
  "execution-summary.md",
  "git-audit.json",
  "54bi-baseline-integrity.json",
  "54bj-regression-forensics.json",
  "evaluation-input-comparison.json",
  "mobile-regression-analysis.json",
  "premium-reference-gap-analysis.json",
  "visual-comparison-inventory.json",
  "css-architecture-audit.json",
  "component-architecture-audit.json",
  "template-universality-audit.json",
  "editorial-constraints-audit.json",
  "architectural-root-cause-matrix.json",
  "architectural-options-comparison.json",
  "architectural-decision.json",
  "execution-54bl-implementation-plan.md",
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

const bjSubject = git(`git log -1 --format=%s ${BJ_COMMIT}`);
const bjPresent = git(`git cat-file -t ${BJ_COMMIT}`) === "commit";
const biPresent = git(`git cat-file -t ${BI_COMMIT}`) === "commit";
assert(bjPresent && bjSubject === BJ_MESSAGE, "1. 54BJ commit integrity is preserved with the required message");

const biOfficial = readJson(biEvidence, "official-v2-results.json");
const liveBest = JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/best-candidate.json"), "utf8")) as {
  desktopVisualScore?: number;
  mobileVisualScore?: number;
  editorialScore?: number;
  humanReviewUnlocked?: boolean;
  qualityApproved?: boolean;
};
assert(
  biOfficial.finalDesktopVisualScore === 74 &&
    biOfficial.finalMobileVisualScore === 72 &&
    biOfficial.finalEditorialScore === 74 &&
    liveBest.desktopVisualScore === 74 &&
    liveBest.mobileVisualScore === 72 &&
    liveBest.editorialScore === 74,
  "2. 54BI baseline 74/72/74 remains the live best known candidate",
);

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT,
  "3. 54BI checkpoint remains recoverable",
);

const stored = readRendererCandidateSelection(237);
assert(
  stored.activeExecutionId === "54BI" &&
    liveBest.humanReviewUnlocked === false &&
    liveBest.qualityApproved === false,
  "4. Best Candidate Selector remains on 54BI and human review stays locked",
);

const lab = disableCommercialCta(buildV4Model("s1")!);
const biHtml = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID }));
const bjHtml = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID }));
const azHtml = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: BEST_KNOWN_CANDIDATE_ID }));
assert(
  CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BJ" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    parseRendererCandidateId("54BJ") === EXPERIMENTAL_CANDIDATE_ID &&
    parseRendererCandidateId("54BI") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BJ" }).executionId === "54BJ" &&
    resolveRendererCandidate({ requested: "54BI" }).executionId === "54BI" &&
    experimentalExecutionIdOf("54BI") === "54BI" &&
    /data-presell-execution="54BI"/.test(biHtml) &&
    /data-presell-execution="54BJ"/.test(bjHtml) &&
    /data-presell-candidate="54AZ"/.test(azHtml),
  "5. renderer switching keeps 54BI, 54BJ, and 54AZ distinct",
);

const ref = loadPremiumPresellDesignStandard();
const refBytes = readFileSync(path.join(ROOT, "design-references/premium-presell-reference.png"));
assert(ref.hash === EXPECTED_REFERENCE, "6. premium reference remains registered");
assert(createHash("sha256").update(refBytes).digest("hex") === EXPECTED_REFERENCE, "7. premium reference SHA-256 is unchanged");

assert(REQUIRED.every((name) => existsSync(path.join(evidence, name))), "8. 54BK evidence inventory exists");
const inventory = readJson(evidence, "evaluation-input-comparison.json");
assert(
  inventory.referenceHash === EXPECTED_REFERENCE &&
    inventory.rubric === PREMIUM_VISUAL_EVALUATION_V2 &&
    inventory.qualityPromptVersion === QUALITY_PROMPT_VERSION,
  "8b. evaluation inventory records the frozen V2 inputs",
);

const mobile = readJson(evidence, "mobile-regression-analysis.json");
const bjOfficial = readJson(bjEvidence, "official-v2-results.json");
assert(
  bjOfficial.finalDesktopVisualScore === 72 &&
    bjOfficial.finalMobileVisualScore === 62 &&
    bjOfficial.finalEditorialScore === 73 &&
    Number((mobile.officialDrop as { delta?: number } | undefined)?.delta) === -10 &&
    String(mobile.rootCauseLabel ?? "").includes("EVALUATOR"),
  "9. mobile regression analysis records the -10 drop without treating CSS as the sole cause",
);

const cssAudit = readJson(evidence, "css-architecture-audit.json");
const componentAudit = readJson(evidence, "component-architecture-audit.json");
const universality = readJson(evidence, "template-universality-audit.json");
assert(
  Array.isArray(cssAudit.layers) &&
    (cssAudit.layers as unknown[]).length >= 3 &&
    componentAudit.visualFilesChangedIn54bk === false &&
    universality.templateId === PRESELL_STANDARD_ID &&
    universality.sugarDefenderSpecificCss === false,
  "10. CSS, component, and universality audits are present",
);

const matrix = readJson(evidence, "architectural-root-cause-matrix.json");
const records = matrix.records as Array<{ id?: string; confidence?: string; category?: string }>;
assert(
  Array.isArray(records) &&
    records.some((row) => row.id === "RC-001" && row.confidence === "CONFIRMED") &&
    records.some((row) => row.id === "RC-005" && row.confidence === "SUPPORTED") &&
    records.some((row) => row.id === "RC-011" && row.confidence === "REFUTED") &&
    records.every((row) => ["CONFIRMED", "SUPPORTED", "INCONCLUSIVE", "REFUTED"].includes(String(row.confidence))),
  "11. root-cause matrix classifies structural evidence without inflating AI scores to CONFIRMED",
);

const editorial = readJson(evidence, "editorial-constraints-audit.json");
const classes = JSON.stringify(editorial);
assert(
  classes.includes("COPY_WEAK") &&
    classes.includes("LAYOUT_WEAK") &&
    classes.includes("EVIDENCE_GAP") &&
    classes.includes("CONTENT_RESTRICTION") &&
    classes.includes("EVALUATOR_UNCERTAINTY") &&
    editorial.copyChangedIn54bk === false,
  "12. editorial constraints are classified without rewriting copy",
);

const plan = readFileSync(path.join(evidence, "execution-54bl-implementation-plan.md"), "utf8");
const decision = readJson(evidence, "architectural-decision.json");
assert(
  plan.includes("BATCH_ID: BL-01") &&
    plan.includes("BATCH_ID: BL-06") &&
    plan.includes("Do not execute these batches in 54BK") &&
    decision.ARCHITECTURAL_RECOMMENDATION === "NEW_COMPOSITION" &&
    decision.doesNotPromise909085 === true &&
    decision.implementInThisExecution === false,
  "13. 54BL plan is ready and was not executed",
);

const visualDiff = git(`git diff --name-only HEAD -- ${VISUAL_PATHS.join(" ")}`);
const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
assert(
  visualDiff === "" &&
    css.includes('[data-presell-execution="54BJ"]') &&
    /minmax\(26rem, 1\.32fr\)/.test(css) &&
    !/scale\(1\.14\)/.test(css),
  "14. 54BK did not change visual CSS or composition files",
);

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "15. Product Contract remains valid");

const biSafety = readJson(biEvidence, "content-safety.json");
const bjSafety = readJson(bjEvidence, "content-safety.json");
assert(
  biSafety.gate === "PASS" &&
    bjSafety.gate === "PASS" &&
    !FORBIDDEN_REFERENCE_CHROME.test(biHtml) &&
    !FORBIDDEN_REFERENCE_CHROME.test(bjHtml),
  "16. Content Safety remains PASS and forbidden chrome is absent",
);

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 74,
  desktopVisualScore: 74,
  mobileVisualScore: 72,
  editorialScore: 74,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blocked.status === "QUALITY_BLOCKED" && blocked.publicationUnlocked === false, "17. Global Quality Gate stays QUALITY_BLOCKED");

assert(
  EXECUTION_54BK_MAX_AI_COST_USD === 0 &&
    EXECUTION_54BK_BUDGET.maxUsd === 0 &&
    BK_LEDGER.maxUsd === 0 &&
    EXECUTION_54BK_ID === "execution-54bk" &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bk", 0), { kind: "EVALUATION", reserveUsd: 0.01 }, BK_LEDGER).allowed,
  "18. exclusive 54BK budget is US$0.00 and refuses paid reserves",
);
const ledger = readJson(evidence, "budget-ledger.json");
assert(Number(ledger.spentUsd) === 0 && Number(ledger.paidCallCount) === 0, "18b. recorded 54BK spend is zero");

assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(biHtml) && mapPresellStandardV1(lab).cta.enabled === false, "19. CTA stays blocked");
assert(integrity.publicationReadiness === "BLOCKED" && blocked.publicationUnlocked === false, "20. publication stays blocked");
assert(
  VISUAL_SCORE_TARGET === 90 &&
    QUALITY_SCORE_TARGET === 85 &&
    !canEnterHumanReviewQueue(blocked) &&
    requestPresellHumanReview(blocked).ok === false &&
    blocked.publicationUnlocked === false,
  "21. ads and human review remain blocked below 90/90/85",
);

assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen(), "21b. V2 rubric and prompt version 4 stay frozen");
assert(conservativeMinPair(70, 62) === 62 && EVALUATOR_VARIATION_LIMIT === 8, "21c. min-of-pair and variation limit stay frozen");
assert(biPresent, "21d. 54BI commit object remains recoverable");

const template = readFileSync(path.join(ROOT, "src/components/presell/standard-v1-page.tsx"), "utf8");
assert(!/sugar\s*defender|femicore/i.test(template), "21e. universal template has no product-specific branches");

console.log(`PASS ${passed}`);
