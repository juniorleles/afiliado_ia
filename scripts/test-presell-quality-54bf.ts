import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BF_BUDGET,
  EXECUTION_54BF_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  experimentalSectionTitle,
  conservativeMinPair,
  selectBestCandidate,
  evaluationIdentityOf,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  PRIOR_CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  parseRendererCandidateId,
  resolveRendererCandidate,
  restoreProtectedPath,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BF_BUDGET as BF_LEDGER,
  EXECUTION_54BF_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bf-visual-diagnosis");
const beEvidence = path.join(ROOT, "data/evidence/execution-54be-targeted-quality");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BE_COMMIT = "ed02c8ee689416a51ee2323a531e118c1cf1cf78";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const v1 = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));
const az = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: BEST_KNOWN_CANDIDATE_ID }));
const via54bf = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID }));
const def = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const identity = readJson(evidence, "candidate-identity.json");
const comparison = readJson(evidence, "visual-comparison-report.json");
const log = execSync("git log -1 --format=%H", { cwd: ROOT, encoding: "utf8" }).trim();
const bePresent = execSync(`git cat-file -t ${BE_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit";

assert(bePresent && existsSync(path.join(beEvidence, "official-v2-results.json")), "1. 54BE audit evidence and commit object remain");
assert(
  parseRendererCandidateId("54BF") === EXPERIMENTAL_CANDIDATE_ID &&
    PRIOR_CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BF" &&
    (identity == null || identity.candidateExecution === "54BF"),
  "2. experimental candidate identity is PRESELL_STANDARD_V1 / execution 54BF",
);
assert(
  Boolean(comparison?.visualObservations) && Array.isArray(comparison?.visualObservations) && (comparison.visualObservations as unknown[]).length >= 6,
  "3. visual comparison report exists with documented issues",
);
assert(
  resolveRendererCandidate({ requested: EXPERIMENTAL_CANDIDATE_ID }).id === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID }).id === BEST_KNOWN_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BF" }).id === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({}).id === BEST_KNOWN_CANDIDATE_ID,
  "4. renderer candidate switching remains explicit, including the 54BF alias",
);
assert(/data-presell-candidate="54AZ"/.test(az) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(az), "5. 54AZ remains renderable without the V1 tag");
assert(
  /data-presell-standard="PRESELL_STANDARD_V1"/.test(v1) &&
    /data-presell-execution="54BI"/.test(v1) &&
    /data-presell-execution="54BI"/.test(via54bf),
  "6. template V1 remains renderable and is tagged with the current experimental execution",
);
assert(/minmax\(26rem, 1\.32fr\)/.test(css) && !/minmax\(28rem, 1\.5fr\)/.test(css) && !/scale\(1\.14\)/.test(css), "7. desktop hero packing restores 54AZ and no longer clips via scale");
assert(
  /max-width: 18\.5rem/.test(css) &&
    /premium-hero-chips li:nth-child\(n \+ 3\)/.test(css) &&
    !/-webkit-line-clamp:\s*4/.test(css),
  "8. mobile 54BE spacing and chip reduction are preserved without clipping body copy",
);
assert(
  experimentalSectionTitle({
    sectionType: "how_it_works",
    headline: "Overview",
    productName: "Northwind Capsules",
    usageCount: 3,
  }) === "Directions for use" &&
    experimentalSectionTitle({
      sectionType: "specifications",
      headline: "Overview",
      productName: "Northwind Capsules",
      ingredientCount: 4,
    }) === "Declared ingredients",
  "9. editorial titles use approved fact types without repeating the product name",
);
const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "10. Product Contract remains valid and unchanged by this execution");
assert(!/clinically proven|cure|treat/i.test(v1), "11. blocked medical claims are not added");
const v1Preflight = runTemplateQualityPreflight({ model: lab, markup: v1, contractValid: true });
assert(v1Preflight.status === "PREFLIGHT_PASSED" && v1Preflight.visualScoreAssigned === false, "12. V1 preflight passes without assigning a visual score");
assert(!FORBIDDEN_REFERENCE_CHROME.test(v1), "13. content-safety chrome is not invented on V1");

if (existsSync(path.join(evidence, "desktop-first-fold.png"))) {
  assert(SHOTS.every((name) => existsSync(path.join(evidence, name))), "14. real visitor captures exist");
  const capture = readJson(evidence, "capture-manifest.json");
  assert(capture?.mode === VISITOR_VISUAL_CAPTURE && String(capture?.previewPath ?? "").includes("candidate=PRESELL_STANDARD_V1"), "14b. captures used the experimental candidate preview");
}

assert(loadPremiumPresellDesignStandard().hash === EXPECTED_REFERENCE, "14c. official reference is unchanged");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen(), "14d. V2 rubric and prompt version 4 stay frozen");
assert(conservativeMinPair(80, 71) === 71, "15. official pair score stays the minimum of two valid runs");
assert(EXECUTION_54BF_MAX_AI_COST_USD === 0.3 && BF_LEDGER.maxUsd === 0.3 && EXECUTION_54BF_ID === "execution-54bf", "17. exclusive 54BF budget is US$0.30");
assert(
  budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bf", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BF_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bf", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BF_LEDGER).allowed,
  "17b. overspend is blocked before the call",
);

const worse = selectBestCandidate({
  current: {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    state: "BEST_KNOWN",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 72,
    mobileVisualScore: 68,
    editorialScore: 73,
    identity: evaluationIdentityOf({
      generationId: "lp-mvs7mja3-0d690e7c",
      rendererVersion: "v4",
      referenceHash: EXPECTED_REFERENCE,
      captureMode: VISITOR_VISUAL_CAPTURE,
      adminChromePresent: false,
      visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
      promptVersion: "2",
      rubricVersion: "2",
      model: "gpt-4o-mini",
    }),
    qualityApproved: false,
    humanReviewUnlocked: false,
    notes: [],
  },
  incoming: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 60,
    mobileVisualScore: 60,
    editorialScore: 60,
    identity: evaluationIdentityOf({
      generationId: "lp-mvs7mja3-0d690e7c",
      rendererVersion: "v4",
      referenceHash: EXPECTED_REFERENCE,
      captureMode: VISITOR_VISUAL_CAPTURE,
      adminChromePresent: false,
      visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
      promptVersion: "2",
      rubricVersion: "2",
      model: "gpt-4o-mini",
    }),
    notes: [],
  },
});
assert(!worse.updated, "18. a worse candidate is not selected as best known");

const blockedGate = resolveGlobalPresellQualityGate({
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
assert(blockedGate.status === "QUALITY_BLOCKED", "19. Global Quality Gate stays QUALITY_BLOCKED below 90/90/85");
assert(
  restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx") &&
    !restoreProtectedPath("src/app/premium-design-engine.css"),
  "20. rollback cannot delete the template implementation or the switcher",
);
assert(!canEnterHumanReviewQueue(blockedGate) && requestPresellHumanReview(blockedGate).ok === false, "21. human review stays locked without QUALITY_APPROVED");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(v1) && mapPresellStandardV1(lab).cta.enabled === false, "22. CTA stays blocked");
assert(integrity.publicationReadiness === "BLOCKED" && blockedGate.publicationUnlocked === false, "23. publication stays blocked");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && blockedGate.publicationUnlocked === false, "24. ads/publication remain blocked and thresholds stay 90/90/85");
assert(!/data-presell-standard="PRESELL_STANDARD_V1"/.test(def), "5b. data-presell-standard appears only when V1 is active");
assert(
  existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) && DESIGN_CHECKPOINT_FILES.length === 4,
  "5c. 54AZ checkpoint and file list remain",
);
assert(
  labScenarioKeys().every((key) => {
    const model = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model, candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && mapPresellStandardV1(model).cta.enabled === false;
  }),
  "11b. multiproduct V1 stays generic",
);
assert(log.length === 40, "1b. HEAD is a real git commit");

const official = readJson(evidence, "official-v2-results.json");
if (official) {
  assert(official.finalDesktopVisualScore != null && official.finalMobileVisualScore != null && official.finalEditorialScore != null, "15b. independent evaluations produced official pair scores");
  const stability = readJson(evidence, "evaluator-stability.json");
  assert(Boolean(stability), "16. stability is recorded");
  const ledger = readJson(evidence, "budget-ledger.json");
  assert(Boolean(ledger) && Number(ledger?.spentUsd ?? 1) <= 0.3, "17c. recorded spend stays within the exclusive 54BF ledger");
  const gate = readJson(evidence, "quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "24b. written gate never unlocks publication or ads");
  assert(gate?.humanReviewUnlocked === (gate?.status === "QUALITY_APPROVED"), "21b. human review unlock matches QUALITY_APPROVED only");
  if (gate?.status === "QUALITY_APPROVED") {
    assert(Number(gate.desktopVisualScore) >= 90 && Number(gate.mobileVisualScore) >= 90 && Number(gate.editorialScore) >= 85, "19b. QUALITY_APPROVED was not granted below 90/90/85");
  }
}

console.log(`PASS ${passed}`);
