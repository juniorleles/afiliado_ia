import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta, evaluateContentSafety } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { enrichApprovedFactsForGeneration } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { botanicalAssetIds, selectApprovedPackshot } from "../src/lib/presell-quality/approved-packshot.ts";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BV_BUDGET,
  EXECUTION_54BV_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISUAL_EVAL_PROMPT_VERSION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  conservativeMinPair,
  selectBestCandidate,
  evaluationIdentityOf,
  officialPerDimensionStability,
  freezeCandidateManifest,
  parseVisualEvaluationPayload,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FINAL_VISUAL_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID,
  PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumFinalVisual,
  usesPremiumEditorialCorrection,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BV_BUDGET as BV_LEDGER,
  EXECUTION_54BV_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  reservePaidCall,
  consumePaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const evidence = path.join(ROOT, "data/evidence/execution-54bv-official-v2-evaluation");
const buEvidence = path.join(ROOT, "data/evidence/execution-54bu-final-visual-corrections");
const btEvidence = path.join(ROOT, "data/evidence/execution-54bt-evaluator-alignment");
const bsEvidence = path.join(ROOT, "data/evidence/execution-54bs-official-v2-decision");
const brEvidence = path.join(ROOT, "data/evidence/execution-54br-editorial-visual-correction");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BU_COMMIT = "4adef1b19668d5a5ff698c73f60d8b4f76b4c74f";
const BU_MESSAGE = "feat(presell): preserve final premium visual candidate";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bu = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BU" }));
const br = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BR" }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BI" }));

assert(execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim() === "feature/ai-presell-quality-gate", "1. branch is feature/ai-presell-quality-gate");
assert(execSync(`git cat-file -t ${BU_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "2. 54BU commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BU_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BU_MESSAGE, "3. 54BU commit message is preserved");
assert(execSync(`git cat-file -t ${BI_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "4. 54BI commit remains recoverable");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "5. 54BI proven baseline checkpoint is not overwritten",
);

assert(
  FINAL_VISUAL_EXECUTION_ID === "54BU" &&
    CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BR" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    PREMIUM_FINAL_VISUAL_COMPOSITION_ID === "PREMIUM_FINAL_VISUAL_V1" &&
    PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID === "PREMIUM_EDITORIAL_CORRECTION_V1" &&
    parseRendererCandidateId("54BU") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BU" }).executionId === "54BU" &&
    resolveRendererCandidate({ requested: "54BR" }).executionId === "54BR" &&
    experimentalExecutionIdOf("54BU") === "54BU" &&
    usesPremiumFinalVisual("54BU") &&
    !usesPremiumFinalVisual("54BR") &&
    usesPremiumEditorialCorrection("54BR"),
  "6. 54BV evaluates 54BU without collapsing 54BR or 54BI",
);

assert(
  /data-presell-execution="54BU"/.test(bu) &&
    /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(bu) &&
    /data-presell-execution="54BR"/.test(br) &&
    /data-presell-composition="PREMIUM_EDITORIAL_CORRECTION_V1"/.test(br) &&
    /data-presell-execution="54BI"/.test(bi),
  "7. renderer switching keeps 54BU, 54BR, and 54BI distinct",
);
assert(/\[data-presell-execution="54BU"\]/.test(css) && /\[data-presell-execution="54BR"\]/.test(css), "8. 54BU CSS remains isolated from 54BR");

assert(
  EXECUTION_54BV_BUDGET.maxUsd === 0.2 &&
    EXECUTION_54BV_MAX_AI_COST_USD === 0.2 &&
    BV_LEDGER.maxUsd === 0.2 &&
    EXECUTION_54BV_ID === "execution-54bv" &&
    BV_LEDGER.maxEvaluations === 6 &&
    BV_LEDGER.reserveUsdPerEvaluation === 0.05 &&
    budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bv", 0.2), { kind: "EVALUATION", reserveUsd: 0.05 }, BV_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bv", 0.2), { kind: "EVALUATION", reserveUsd: 0.21 }, BV_LEDGER).allowed,
  "9. exclusive 54BV budget is US$0.20 with a US$0.05 evaluation reserve",
);

let ledger = emptyExecutionBudgetLedger("execution-54bv", 0.2);
for (let i = 0; i < 4; i += 1) {
  const reserved = reservePaidCall(ledger, { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.05, caps: BV_LEDGER });
  assert(reserved.ok, `10.${i + 1} official protocol call ${i + 1} of 4 is reserved`);
  ledger = consumePaidCall(reserved.ledger, { inputTokens: 100, outputTokens: 50, estimatedUsd: 0.05, reportedUsd: 0.05 });
}
const fifth = reservePaidCall(ledger, { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.05, caps: BV_LEDGER });
assert(!fifth.ok, "11. a fifth reserved evaluation is blocked by the exclusive US$0.20 ledger");

assert(
  QUALITY_PROMPT_VERSION === "4" &&
    PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" &&
    VISUAL_EVAL_PROMPT_VERSION_V2 === "2" &&
    VISITOR_VISUAL_CAPTURE === "VISITOR_VISUAL_CAPTURE",
  "12. official evaluator versions stay frozen",
);
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "13. official thresholds stay frozen at 90/90/85");
assert(conservativeMinPair(76, 74) === 74 && conservativeMinPair(74, null) === null, "14. official score is the lesser valid pair score, never a mean");
assert(
  officialPerDimensionStability({ desktop: [74, 76], mobile: [72, 72], editorial: [74, 73] }).combined === "STABLE",
  "15. paired scores inside the variation limit are STABLE",
);
assert(
  officialPerDimensionStability({ desktop: [74, 86], mobile: [72, 72], editorial: [74, 74] }).desktop === "UNSTABLE",
  "16. a pair above the variation limit is UNSTABLE and is not treated as a proven defect by itself",
);

const parsed = parseVisualEvaluationPayload(
  JSON.stringify({
    desktopVisualScore: 76,
    mobileVisualScore: 72,
    HERO_FIRST_IMPRESSION: 74,
    COMPOSITION_HIERARCHY: 74,
    TYPOGRAPHY_LEGIBILITY: 74,
    CARDS_COMPONENTS: 74,
    IMAGE_USE: 74,
    CTA_EMPHASIS: 74,
    MOBILE: 72,
    criticalDefects: [],
  }),
);
assert(parsed?.desktopVisualScore === 76 && parsed.mobileVisualScore === 72, "17. visual V2 parser keeps independent desktop and mobile scores");

const identity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  rendererVersion: "v4",
  sourceCommit: BI_COMMIT,
  referenceHash: EXPECTED_REFERENCE,
  screenshotHashes: ["a", "b"],
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
  rubricVersion: "2",
  model: "gpt-4o-mini",
});
const rejected = selectBestCandidate({
  current: {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    state: "BEST_KNOWN",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 74,
    mobileVisualScore: 72,
    editorialScore: 74,
    identity,
    qualityApproved: false,
    humanReviewUnlocked: false,
    notes: [],
  },
  incoming: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 73,
    mobileVisualScore: 80,
    editorialScore: 80,
    identity,
    notes: [],
  },
});
assert(rejected.updated === false, "18. selector rejects an incoming candidate that regresses any dimension");
const promoted = selectBestCandidate({
  current: {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    state: "BEST_KNOWN",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 74,
    mobileVisualScore: 72,
    editorialScore: 74,
    identity,
    qualityApproved: false,
    humanReviewUnlocked: false,
    notes: [],
  },
  incoming: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 75,
    mobileVisualScore: 72,
    editorialScore: 74,
    identity,
    notes: [],
  },
});
assert(promoted.updated === true, "19. selector promotes only a comparable candidate that is not worse on any score and better on at least one");

const freeze = freezeCandidateManifest({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  contentHash: "content",
  productContractHash: "contract",
  sourceCommit: BU_COMMIT,
  referenceHash: EXPECTED_REFERENCE,
});
assert(
  freeze.immutable === true &&
    freeze.visualEvalVersion === PREMIUM_VISUAL_EVALUATION_V2 &&
    freeze.promptVersion === VISUAL_EVAL_PROMPT_VERSION_V2 &&
    freeze.captureMode === VISITOR_VISUAL_CAPTURE,
  "20. candidate freeze records the official V2 identity and is immutable",
);

assert(loadPremiumPresellDesignStandard().hash === EXPECTED_REFERENCE, "21. official premium reference hash is unchanged");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(bu) && mapPresellStandardV1(lab).cta.enabled === false, "22. CTA stays blocked");
assert(
  DESIGN_CHECKPOINT_FILES.length === 4 &&
    restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx"),
  "23. rollback cannot delete the template implementation or the switcher",
);

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 80,
  desktopVisualScore: 80,
  mobileVisualScore: 80,
  editorialScore: 80,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blocked.status === "QUALITY_BLOCKED", "24. Global Quality Gate stays QUALITY_BLOCKED below 90/90/85");
assert(blocked.publicationUnlocked === false, "25. publication stays blocked");
assert(!canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "26. ads and human review remain blocked below 90/90/85");
assert(PRESELL_STANDARD_ID === "PRESELL_STANDARD_V1", "27. template id remains PRESELL_STANDARD_V1");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "28. Product Contract remains valid");
const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.length), "29. commercial reuse manifest is available");
const expected = [
  { id: "pkg-2", unit: "$79", total: "$158" },
  { id: "pkg-3", unit: "$69", total: "$207" },
  { id: "pkg-6", unit: "$49", total: "$294" },
];
assert(
  Boolean(
    reuse &&
      expected.every((row) => {
        const found = reuse.approvedPackages.find((item) => item.id === row.id);
        return found?.unitPrice === row.unit && found.currentTotal === row.total;
      }),
  ),
  "30. approved package prices stay associated with the correct quantities",
);

const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BU", campaignId: 237 }));
  const campaignBr = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BR", campaignId: 237 }));
  assert(/data-presell-execution="54BU"/.test(campaign) && /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(campaign), "31. 54BU campaign render keeps the final visual composition");
  assert(/data-presell-execution="54BR"/.test(campaignBr) && /data-presell-composition="PREMIUM_EDITORIAL_CORRECTION_V1"/.test(campaignBr), "32. 54BR remains independently selectable");
  assert(/discover sugar defender/i.test(campaign), "33. approved headline remains");
  assert(/two(?: full)? droppers/i.test(campaign) && !/\btwo drops\b/i.test(campaign), "34. usage instruction remains two droppers, not two drops");
  assert(/\$79/.test(campaign) && /\$158/.test(campaign) && /\$69/.test(campaign) && /\$207/.test(campaign) && /\$49/.test(campaign) && /\$294/.test(campaign), "35. approved package prices remain on the 54BU page");
  assert(/60/.test(campaign) && /commission/i.test(campaign), "36. guarantee window and disclosure remain");
  assert(!/#1 rated blood sugar|verified purchase|sean b|sabine s/i.test(campaign), "37. blocked medical claims and rejected testimonials stay absent");
  const declaration = readUserAssetDeclaration(237);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  assert(packshot?.assetId === "asset-cbc045ab", "38. approved packshot remains asset-cbc045ab");
  const enriched = enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: "" });
  const manifest = buildContentManifest({ campaignId: 237, run: snap.latest, integrity, generation: enriched });
  const safety = evaluateContentSafety({
    model,
    markup: campaign,
    manifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: approvedCommercialExcerpts(reuse),
  });
  assert(safety.gate === "PASS" && safety.commercialCtaEnabled === false && safety.publicationReady === false, "39. content safety passes and keeps CTA/publication blocked");
  assert(runTemplateQualityPreflight({ model, markup: campaign, contractValid: integrity.valid }).status === "PREFLIGHT_PASSED", "40. preflight passes on the 54BU campaign page");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: "54BU" }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  }),
  "41. lab scenarios stay generic and do not inherit campaign packages",
);

const biOfficial = readJson(biEvidence, "official-v2-results.json");
assert(biOfficial?.finalDesktopVisualScore === 74 && biOfficial.finalMobileVisualScore === 72 && biOfficial.finalEditorialScore === 74, "42. 54BI official baseline 74/72/74 remains in evidence");
assert(existsSync(path.join(buEvidence, "execution-summary.md")), "43. 54BU evidence remains");
assert(existsSync(path.join(btEvidence, "execution-54bu-final-corrections.md")), "44. 54BT plan remains");
assert(existsSync(path.join(bsEvidence, "official-v2-results.json")), "45. 54BS official V2 evidence remains");
assert(existsSync(path.join(brEvidence, "execution-summary.md")), "46. 54BR evidence remains");

const liveBest = JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/best-candidate.json"), "utf8")) as {
  desktopVisualScore?: number;
  mobileVisualScore?: number;
  editorialScore?: number;
};
const liveStore = readRendererCandidateSelection(237);

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "candidate-freeze.json",
    "input-integrity.json",
    "preflight-results.json",
    "content-safety-results.json",
    "official-v2-results.json",
    "evaluator-observability.json",
    "evaluation-stability.json",
    "budget-ledger.json",
    "best-candidate-comparison.json",
    "best-candidate-selector.json",
    "quality-gate-decision.json",
    "top-three-blockers.json",
    "regression-results.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "47. 54BV evidence files exist in a new directory");
  const audit = readJson(evidence, "git-audit.json");
  assert(audit?.buCommit === BU_COMMIT && audit.pushExecuted === false && audit.bvCommitCreated === false, "48. git audit records the 54BU commit and no 54BV commit/push");
  const freezeFile = readJson(evidence, "candidate-freeze.json");
  assert(
    freezeFile?.executionId === "54BU" &&
      freezeFile.compositionId === "PREMIUM_FINAL_VISUAL_V1" &&
      freezeFile.templateId === "PRESELL_STANDARD_V1" &&
      freezeFile.generationId === "lp-mvs7mja3-0d690e7c" &&
      freezeFile.immutable === true,
    "49. frozen 54BU identity matches execution, composition, template, and generation",
  );
  const integrityFile = readJson(evidence, "input-integrity.json");
  assert(integrityFile?.referenceHashValid === true && integrityFile.referenceHash === EXPECTED_REFERENCE, "50. frozen reference hash matches the official premium PNG");
  const preflightFile = readJson(evidence, "preflight-results.json");
  assert(preflightFile?.status === "PREFLIGHT_PASSED", "51. recorded preflight passed");
  const safetyFile = readJson(evidence, "content-safety-results.json");
  assert(safetyFile?.gate === "PASS", "52. recorded content safety passed");
  const ledgerFile = readJson(evidence, "budget-ledger.json");
  assert(Number(ledgerFile?.maxUsd) === 0.2 && Number(ledgerFile?.spentUsd ?? 1) <= 0.2, "53. recorded spend stays within the exclusive 54BV ledger");
  const official = readJson(evidence, "official-v2-results.json");
  const selectorFile = readJson(evidence, "best-candidate-selector.json");
  const stability = readJson(evidence, "evaluation-stability.json");
  if (official?.skipped === true) {
    assert(selectorFile?.bestKnownExecution === "54BI" && selectorFile.bestCandidateUpdated === false, "54. incomplete official protocol preserves 54BI and is BLOCKED");
    assert(liveStore.activeExecutionId === "54BI", "55. live store remains on 54BI after a blocked evaluation");
    assert(liveBest.desktopVisualScore === 74 && liveBest.mobileVisualScore === 72 && liveBest.editorialScore === 74, "56. best-candidate ledger still holds 54BI 74/72/74");
  } else {
    assert(
      official?.method === "min-of-pair" &&
        official.desktopVisualRun1 != null &&
        official.desktopVisualRun2 != null &&
        official.mobileVisualRun1 != null &&
        official.mobileVisualRun2 != null &&
        official.editorialRun1 != null &&
        official.editorialRun2 != null,
      "54. two independent evaluations were recorded per dimension",
    );
    assert(
      official.finalDesktopVisualScore === Math.min(Number(official.desktopVisualRun1), Number(official.desktopVisualRun2)) &&
        official.finalMobileVisualScore === Math.min(Number(official.mobileVisualRun1), Number(official.mobileVisualRun2)) &&
        official.finalEditorialScore === Math.min(Number(official.editorialRun1), Number(official.editorialRun2)),
      "55. official scores are the lesser valid score of each pair",
    );
    assert(
      (selectorFile?.bestCandidateUpdated === true && selectorFile.bestKnownExecution === "54BU" && liveStore.activeExecutionId === "54BU") ||
        (selectorFile?.bestCandidateUpdated === false && selectorFile.bestKnownExecution === "54BI" && liveStore.activeExecutionId === "54BI"),
      "56. Best Candidate Selector decision matches the live store",
    );
    assert(stability?.method === "min-of-pair" && Boolean(stability.desktop) && Boolean(stability.editorial), "57. evaluation stability is recorded separately");
  }
  const gate = readJson(evidence, "quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "58. written gate never unlocks publication, ads, or checkout");
  assert(gate?.humanReviewUnlocked === false, "59. human review stays locked");
  const blockers = readJson(evidence, "top-three-blockers.json");
  assert(Array.isArray(blockers?.blockers) && (blockers.blockers as unknown[]).length <= 3, "60. remaining blockers are capped at three");
  if (SHOTS.every((file) => existsSync(path.join(evidence, file)))) {
    assert(
      SHOTS.every((file) => readFileSync(path.join(evidence, file)).length > 8000),
      "61. visitor captures exist for desktop, tablet, and mobile",
    );
  }
} else {
  assert(liveStore.activeExecutionId === "54BI", "47. live store still selects 54BI before the official evaluation");
  assert(liveBest.desktopVisualScore === 74 && liveBest.mobileVisualScore === 72 && liveBest.editorialScore === 74, "48. Best Candidate Selector still holds 54BI 74/72/74");
}

console.log(`PASS ${passed}`);
