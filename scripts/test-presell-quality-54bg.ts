import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
  EXECUTION_54BG_BUDGET,
  EXECUTION_54BG_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  PRESELL_STANDARD_ID,
  methodologyThresholdsFrozen,
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  parseRendererCandidateId,
  resolveRendererCandidate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  conservativeMinPair,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BG_BUDGET as BG_LEDGER,
  EXECUTION_54BG_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bg-root-cause-analysis");
const bf = path.join(ROOT, "data/evidence/execution-54bf-visual-diagnosis");
const az = path.join(ROOT, "data/evidence/execution-54az-design-recovery");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const REQUIRED = [
  "execution-summary.md",
  "git-audit.json",
  "evaluation-forensics.json",
  "evaluation-input-comparison.json",
  "reference-vs-54az-desktop.png",
  "reference-vs-54bf-desktop.png",
  "54az-vs-54bf-mobile.png",
  "54bd-vs-54be-vs-54bf-desktop.png",
  "visual-architecture-diagnosis.json",
  "editorial-root-cause-analysis.json",
  "quality-gate-audit.json",
  "root-cause-matrix.json",
  "execution-54bh-implementation-plan.md",
  "budget-ledger.json",
];

function readJson(dir: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
}

assert(REQUIRED.every((name) => existsSync(path.join(evidence, name))), "1. 54BG evidence files exist");
const ref = loadPremiumPresellDesignStandard();
const refBytes = readFileSync(path.join(ROOT, "design-references/premium-presell-reference.png"));
assert(ref.hash === EXPECTED_REFERENCE && createHash("sha256").update(refBytes).digest("hex") === EXPECTED_REFERENCE, "2. premium reference hash is unchanged");

const identity = JSON.parse(readFileSync(path.join(bf, "candidate-identity.json"), "utf8")) as Record<string, unknown>;
const officialBf = readJson(bf, "official-v2-results.json");
assert(identity.generationId === "lp-mvs7mja3-0d690e7c" && identity.candidateExecution === "54BF" && identity.bestKnown === "54AZ", "3. 54BF results stay associated with PRESELL_STANDARD_V1 / 54AZ best known");
assert(officialBf.finalDesktopVisualScore === 70 && officialBf.finalMobileVisualScore === 60 && officialBf.finalEditorialScore === 67, "4. 54BF official scores are preserved and not rewritten");
const azScores = readJson(az, "official-v2-scores.json");
assert(azScores.finalDesktopVisualScore === 72 && azScores.finalMobileVisualScore === 68 && azScores.finalEditorialScore === 73, "4b. 54AZ official scores are preserved");

const forensics = readJson(evidence, "evaluation-forensics.json");
assert(JSON.stringify(forensics).includes("60") && JSON.stringify(forensics).includes("UNSTABLE"), "5. forensics keep the unfavorable mobile 60 / UNSTABLE pair");
assert(officialBf.finalMobileVisualScore === 60, "5b. 54BF mobile 60 was not replaced by 72");

assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen() && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "6. thresholds, rubric, and prompt version 4 are unchanged");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "7. Product Contract remains valid");

const lab = disableCommercialCta(buildV4Model("s1")!);
const bestKnown = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: BEST_KNOWN_CANDIDATE_ID }));
const experimental = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));
assert(/data-presell-candidate="54AZ"/.test(bestKnown) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(bestKnown), "8. 54AZ remains renderable");
assert(/data-presell-standard="PRESELL_STANDARD_V1"/.test(experimental), "9. universal template remains renderable");
assert(
  parseRendererCandidateId("54BF") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({}).id === BEST_KNOWN_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: EXPERIMENTAL_CANDIDATE_ID }).id === EXPERIMENTAL_CANDIDATE_ID,
  "10. candidate switching remains explicit",
);

assert(/data-v4-cta="preview-disabled"/.test(experimental) && lab.hopSlot === "none", "11. CTA stays blocked");
assert(integrity.publicationReadiness === "BLOCKED", "12. publication stays blocked");
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
  editorialScore: 73,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blocked.status === "QUALITY_BLOCKED" && blocked.publicationUnlocked === false, "13. ads/publication remain blocked below 90/90/85");
assert(!canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "13b. human review stays locked");

const matrix = readJson(evidence, "root-cause-matrix.json");
const plan = readFileSync(path.join(evidence, "execution-54bh-implementation-plan.md"), "utf8");
assert(Array.isArray(matrix.items) && (matrix.items as unknown[]).length >= 6 && plan.includes("BH-01"), "14. root-cause matrix and 54BH plan are present");
assert(conservativeMinPair(72, 60) === 60, "14b. min-of-pair still selects the lower valid score");

assert(EXECUTION_54BG_MAX_AI_COST_USD === 0 && BG_LEDGER.maxUsd === 0 && EXECUTION_54BG_ID === "execution-54bg", "15. exclusive 54BG budget is US$0.00");
assert(
  !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bg", 0), { kind: "EVALUATION", reserveUsd: 0.01 }, BG_LEDGER).allowed,
  "15b. any paid reserve is refused at US$0",
);
const ledger = readJson(evidence, "budget-ledger.json");
assert(Number(ledger.spentUsd) === 0 && Number(ledger.paidCallCount) === 0, "15c. recorded 54BG spend is zero");

console.log(`PASS ${passed}`);
