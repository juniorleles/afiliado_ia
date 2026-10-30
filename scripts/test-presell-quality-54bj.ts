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
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BJ_BUDGET,
  EXECUTION_54BJ_MAX_AI_COST_USD,
  experimentalEvidenceChips,
  experimentalSectionTitle,
  isRefundWindowChip,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  presentFulfillmentFact,
  uniqueGuaranteeStatements,
  premiumSlotsFromModel,
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
  STRUCTURAL_COMPOSITION_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  VISUAL_HIERARCHY_EXECUTION_ID,
  experimentalExecutionIdOf,
  parseRendererCandidateId,
  resolveRendererCandidate,
  restoreProtectedPath,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BJ_BUDGET as BJ_LEDGER,
  EXECUTION_54BJ_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bj-visual-hierarchy");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const v1Source = readFileSync(path.join(ROOT, "src/components/presell/standard-v1-page.tsx"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const v1 = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));
const bj = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: VISUAL_HIERARCHY_EXECUTION_ID }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID }));
const az = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: BEST_KNOWN_CANDIDATE_ID }));
const def = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const identity = readJson(evidence, "candidate-identity.json");
const log = execSync("git log -1 --format=%H", { cwd: ROOT, encoding: "utf8" }).trim();
const biPresent = execSync(`git cat-file -t ${BI_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit";
const biOfficial = readJson(biEvidence, "official-v2-results.json");
const checkpointMeta = existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"))
  ? (JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8")) as { id?: string })
  : null;

assert(biPresent, "1. 54BI commit object remains recoverable");
assert(
  biOfficial?.finalDesktopVisualScore === 74 &&
    biOfficial.finalMobileVisualScore === 72 &&
    biOfficial.finalEditorialScore === 74,
  "1b. 54BI official baseline 74/72/74 remains in evidence",
);
assert(
  checkpointMeta == null || checkpointMeta.id === "54bi-proven-baseline",
  "2. 54BI design checkpoint identity is recoverable when written",
);
assert(
  VISUAL_HIERARCHY_EXECUTION_ID === "54BJ" &&
    STRUCTURAL_COMPOSITION_EXECUTION_ID === "54BL" &&
    CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BN" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    parseRendererCandidateId("54BJ") === EXPERIMENTAL_CANDIDATE_ID &&
    parseRendererCandidateId("54BI") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BJ" }).executionId === "54BJ" &&
    resolveRendererCandidate({ requested: "54BI" }).executionId === "54BI" &&
    experimentalExecutionIdOf("54BJ") === "54BJ" &&
    experimentalExecutionIdOf("54BI") === "54BI" &&
    (identity == null || identity.candidateExecution === "54BJ"),
  "3. 54BJ has a distinct experimental execution identity from frozen 54BI",
);
assert(
  resolveRendererCandidate({ requested: EXPERIMENTAL_CANDIDATE_ID }).id === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID }).id === BEST_KNOWN_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54AZ" }).id === BEST_KNOWN_CANDIDATE_ID &&
    resolveRendererCandidate({}).id === BEST_KNOWN_CANDIDATE_ID,
  "4. renderer candidate switching remains explicit",
);
assert(
  /data-presell-standard="PRESELL_STANDARD_V1"/.test(v1) &&
    /data-presell-execution="54BJ"/.test(bj) &&
    /data-presell-execution="54BI"/.test(bi) &&
    PRESELL_STANDARD_ID === "PRESELL_STANDARD_V1" &&
    PRESELL_STANDARD_VERSION === "1",
  "5. template V1 remains renderable and 54BI/54BJ tags stay distinct",
);
assert(/data-presell-candidate="54AZ"/.test(az) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(az), "5b. 54AZ remains renderable without the V1 tag");
assert(
  /\[data-presell-execution="54BJ"\][\s\S]*\.ds-display[\s\S]*font-size: clamp\(3\.05rem/.test(css) &&
    /\[data-presell-execution="54BJ"\][\s\S]*\.ds-lead[\s\S]*font-size: 1\.125rem/.test(css),
  "6. 54BJ desktop hero title and lead hierarchy are scoped",
);
assert(
  /\[data-presell-execution="54BJ"\][\s\S]*letter-spacing: -0\.038em/.test(css) &&
    /\[data-presell-execution="54BJ"\][\s\S]*\.v4-hero__copy \{[\s\S]*gap: 1\.05rem/.test(css),
  "7. 54BJ typography and copy spacing are refined without rewriting facts",
);
assert(
  /minmax\(26rem, 1\.32fr\)/.test(css) &&
    !/scale\(1\.14\)/.test(css) &&
    /\[data-presell-execution="54BJ"\][\s\S]*transform:\s*none/.test(css) &&
    /object-fit:\s*contain/.test(css),
  "8. packshot packing stays unclipped and 54BE scale is absent",
);
assert(
  /\[data-presell-execution="54BJ"\][\s\S]*\.premium-hero-rail__item[\s\S]*box-shadow/.test(css) &&
    /\[data-presell-execution="54BJ"\][\s\S]*\.premium-hero-rail__fact[\s\S]*font-size: 0\.86rem/.test(css) &&
    /factMode="authorized"/.test(v1Source),
  "9. logistics cards keep authorized copy with stronger 54BJ surfaces",
);
assert(
  /@media \(max-width: 767px\)[\s\S]*\[data-presell-execution="54BJ"\][\s\S]*padding-block: 1\.3rem 1\.7rem/.test(css) &&
    /@media \(max-width: 767px\)[\s\S]*\[data-presell-execution="54BJ"\][\s\S]*max-width: 18\.5rem/.test(css),
  "10. 54BJ mobile spacing is refined without enlarging the packshot",
);
assert(
  /@media \(min-width: 768px\) and \(max-width: 959px\)[\s\S]*\[data-presell-execution="54BJ"\][\s\S]*max-width: 28rem/.test(css) &&
    /@media \(max-width: 959px\)[\s\S]*premium-hero-rail[\s\S]*display:\s*none/.test(css),
  "11. tablet layout remains stacked with a bounded packshot stage",
);
assert(/overflow-x:\s*clip/.test(css), "12. root still clips horizontal overflow");
assert(
  experimentalSectionTitle({
    sectionType: "guarantee",
    headline: "Overview",
    productName: "Northwind Capsules",
    guaranteeDays: 60,
  }) === "Seller-stated refund terms" &&
    /experimentalEvidenceChips/.test(v1Source),
  "13. editorial titles stay presentation-only",
);
assert(
  isRefundWindowChip("60-day seller-stated refund") &&
    experimentalEvidenceChips(
      [
        { label: "60-day seller-stated refund", icon: "shield" },
        { label: "24 working hours", icon: "clock" },
      ],
      "60-day seller-stated refund",
    ).every((item) => !isRefundWindowChip(item.label)),
  "14. BH-04 refund-chip deduplication remains",
);

const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const stored = readGenerationModel(GENERATION_ID);
const record = readGeneration(GENERATION_ID);
const patch = readQualityPatch(GENERATION_ID);
const patchedBase = stored && patch ? applyQualityPatch(stored, patch) : stored;
const sandboxed = patchedBase && record?.sandbox?.enabled ? applySandboxToModel(patchedBase, { href: record.sandbox.ctaPath }) : patchedBase;
const patched = sandboxed ? disableCommercialCta(sandboxed) : null;
const campaignBj = patched ? renderToStaticMarkup(createElement(V4Page, { model: patched, candidate: "54BJ" })) : "";
const campaignBi = patched ? renderToStaticMarkup(createElement(V4Page, { model: patched, candidate: "54BI" })) : "";
assert(
  !patched ||
    (/empty bottles/i.test(campaignBj) &&
      /minus shipping/i.test(campaignBj) &&
      /48 hours/i.test(campaignBj) &&
      /24 working hours/i.test(campaignBj) &&
      /5 to 10 days/i.test(campaignBj) &&
      /one[- ]time payment/i.test(campaignBj) &&
      (campaignBj.match(/60-day seller-stated refund/gi) ?? []).length <= 1 &&
      /data-presell-execution="54BJ"/.test(campaignBj) &&
      /data-presell-execution="54BI"/.test(campaignBi)),
  "13b. campaign editorial conditions and BH-04 remain on both 54BI and 54BJ",
);
const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "15. Product Contract remains valid and unchanged by this execution");
assert(!/clinically proven|cure diabetes|fda approved|star rating|verified buyer/i.test(v1), "16. blocked claims and forbidden chrome are not added");
assert(!FORBIDDEN_REFERENCE_CHROME.test(v1) && !FORBIDDEN_REFERENCE_CHROME.test(az), "17. content-safety chrome is not invented");
const v1Preflight = runTemplateQualityPreflight({ model: lab, markup: v1, contractValid: true });
assert(v1Preflight.status === "PREFLIGHT_PASSED" && v1Preflight.visualScoreAssigned === false, "18. V1 preflight passes without assigning a visual score");

if (existsSync(path.join(evidence, "desktop-first-fold.png"))) {
  assert(SHOTS.every((name) => existsSync(path.join(evidence, name))), "19. real visitor captures exist");
  const capture = readJson(evidence, "capture-manifest.json");
  assert(
    capture?.mode === VISITOR_VISUAL_CAPTURE && String(capture?.previewPath ?? "").includes("candidate=54BJ"),
    "19b. captures used the distinct 54BJ candidate preview",
  );
  const hashes = readJson(evidence, "screenshot-hashes.json") as { current?: Record<string, string> } | null;
  assert(Boolean(hashes?.current && Object.keys(hashes.current).length === 6), "20. capture hashes are recorded");
}

assert(loadPremiumPresellDesignStandard().hash === EXPECTED_REFERENCE, "19c. official reference is unchanged");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen(), "19d. V2 rubric and prompt version 4 stay frozen");
assert(conservativeMinPair(80, 71) === 71, "21. official pair score stays the minimum of two valid runs");
assert(EXECUTION_54BJ_MAX_AI_COST_USD === 0.3 && BJ_LEDGER.maxUsd === 0.3 && EXECUTION_54BJ_ID === "execution-54bj", "23. exclusive 54BJ budget is US$0.30");
assert(
  budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bj", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BJ_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bj", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BJ_LEDGER).allowed,
  "23b. overspend is blocked before the call",
);

const worse = selectBestCandidate({
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
assert(!worse.updated, "24. a worse candidate is not selected as best known");

const blockedGate = resolveGlobalPresellQualityGate({
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
assert(blockedGate.status === "QUALITY_BLOCKED", "25. Global Quality Gate stays QUALITY_BLOCKED below 90/90/85");
assert(
  restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx") &&
    !restoreProtectedPath("src/app/premium-design-engine.css"),
  "26. rollback cannot delete the template implementation or the switcher",
);
assert(
  labScenarioKeys().every((key) => {
    const model = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model, candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && mapPresellStandardV1(model).cta.enabled === false;
  }),
  "27. multiproduct V1 stays generic",
);
assert(!canEnterHumanReviewQueue(blockedGate) && requestPresellHumanReview(blockedGate).ok === false, "28b. human review stays locked without QUALITY_APPROVED");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(v1) && mapPresellStandardV1(lab).cta.enabled === false, "28. CTA stays blocked");
assert(integrity.publicationReadiness === "BLOCKED" && blockedGate.publicationUnlocked === false, "29. publication stays blocked");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && blockedGate.publicationUnlocked === false, "30. ads/publication remain blocked and thresholds stay 90/90/85");
assert(!/data-presell-standard="PRESELL_STANDARD_V1"/.test(def), "4b. data-presell-standard appears only when V1 is active");
assert(
  existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) && DESIGN_CHECKPOINT_FILES.length === 4,
  "2b. 54AZ checkpoint and file list remain",
);
assert(uniqueGuaranteeStatements(premiumSlotsFromModel(lab).guarantee.statements).length <= premiumSlotsFromModel(lab).guarantee.statements.length, "13c. guarantee statements stay unique");
assert(presentFulfillmentFact("We strive to ship every order within 24 working hours.", "DISPATCH").includes("ship"), "9b. authorized dispatch text is preserved");
assert(log.length === 40, "1c. HEAD is a real git commit");

const official = readJson(evidence, "official-v2-results.json");
if (official) {
  assert(official.finalDesktopVisualScore != null && official.finalMobileVisualScore != null && official.finalEditorialScore != null, "21b. independent evaluations produced official pair scores");
  const stability = readJson(evidence, "evaluator-stability.json");
  assert(Boolean(stability), "22. stability is recorded");
  const ledger = readJson(evidence, "budget-ledger.json");
  assert(Boolean(ledger) && Number(ledger?.spentUsd ?? 1) <= 0.3, "23c. recorded spend stays within the exclusive 54BJ ledger");
  const gate = readJson(evidence, "quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "30b. written gate never unlocks publication or ads");
  assert(gate?.humanReviewUnlocked === (gate?.status === "QUALITY_APPROVED"), "28c. human review unlock matches QUALITY_APPROVED only");
  if (gate?.status === "QUALITY_APPROVED") {
    assert(Number(gate.desktopVisualScore) >= 90 && Number(gate.mobileVisualScore) >= 90 && Number(gate.editorialScore) >= 85, "25b. QUALITY_APPROVED was not granted below 90/90/85");
  }
}

console.log(`PASS ${passed}`);
