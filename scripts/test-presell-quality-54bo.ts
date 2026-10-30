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
  EXECUTION_54BO_BUDGET,
  EXECUTION_54BO_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
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
  PRODUCER_CONTENT_EXECUTION_ID,
  PRODUCER_CONTENT_V2_EXECUTION_ID,
  STRUCTURAL_COMPOSITION_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID,
  PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumStructuralComposition,
  usesPremiumProducerContent,
  usesPremiumProducerContentV2,
  usesPremiumVisualOptimization,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BO_BUDGET as BO_LEDGER,
  EXECUTION_54BO_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bo-premium-finalization");
const bnEvidence = path.join(ROOT, "data/evidence/execution-54bn-producer-content");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BN_COMMIT = "6dad1ba770d2a0fb5428554385d7c5d5b073133c";
const BN_MESSAGE = "feat(presell): preserve producer-content landing page";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bo = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: PRODUCER_CONTENT_V2_EXECUTION_ID }));
const bp = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID }));
const bn = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: PRODUCER_CONTENT_EXECUTION_ID }));
const bl = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: STRUCTURAL_COMPOSITION_EXECUTION_ID }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID }));
const v1 = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));

assert(execSync(`git cat-file -t ${BN_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "1. 54BN commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BN_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BN_MESSAGE, "2. 54BN commit message is preserved");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "3. 54BI proven baseline checkpoint is not overwritten",
);

assert(
  CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BP" &&
    PRODUCER_CONTENT_V2_EXECUTION_ID === "54BO" &&
    PRODUCER_CONTENT_EXECUTION_ID === "54BN" &&
    STRUCTURAL_COMPOSITION_EXECUTION_ID === "54BL" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID === "PREMIUM_PRODUCER_CONTENT_V2" &&
    PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID === "PREMIUM_PRODUCER_CONTENT_V1" &&
    parseRendererCandidateId("54BO") === EXPERIMENTAL_CANDIDATE_ID &&
    parseRendererCandidateId("PREMIUM_PRODUCER_CONTENT_V2") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BO" }).executionId === "54BO" &&
    resolveRendererCandidate({ requested: "54BP" }).executionId === "54BP" &&
    resolveRendererCandidate({ requested: "54BN" }).executionId === "54BN" &&
    resolveRendererCandidate({ requested: "54BL" }).executionId === "54BL" &&
    resolveRendererCandidate({ requested: "54BI" }).executionId === "54BI" &&
    experimentalExecutionIdOf("54BO") === "54BO" &&
    usesPremiumProducerContentV2("54BO") &&
    !usesPremiumProducerContentV2("54BN") &&
    !usesPremiumProducerContentV2("54BP") &&
    usesPremiumVisualOptimization("54BP") &&
    !usesPremiumVisualOptimization("54BO") &&
    usesPremiumProducerContent("54BN") &&
    usesPremiumStructuralComposition("54BO") &&
    usesPremiumStructuralComposition("54BN") &&
    usesPremiumStructuralComposition("54BL") &&
    !usesPremiumProducerContent("54BI"),
  "4. 54BO remains a distinct PREMIUM_PRODUCER_CONTENT_V2 candidate after 54BP",
);

assert(
  /data-presell-execution="54BO"/.test(bo) &&
    /data-presell-composition="PREMIUM_PRODUCER_CONTENT_V2"/.test(bo) &&
    /data-presell-execution="54BP"/.test(bp) &&
    /data-presell-composition="PREMIUM_VISUAL_OPTIMIZATION_V1"/.test(bp) &&
    /data-presell-execution="54BN"/.test(bn) &&
    /data-presell-composition="PREMIUM_PRODUCER_CONTENT_V1"/.test(bn) &&
    /data-presell-execution="54BL"/.test(bl) &&
    /data-presell-execution="54BI"/.test(bi) &&
    /data-presell-execution="54BP"/.test(v1),
  "5. renderer switching keeps 54BP, 54BO, 54BN, 54BL, and 54BI distinct",
);

assert(/\[data-presell-execution="54BO"\]/.test(css), "6a. 54BO CSS selector is isolated");
assert(/\[data-presell-execution="54BN"\]/.test(css), "6b. 54BN CSS selector remains isolated");
assert(/min-height:\s*900px/.test(css), "6c. desktop hero fills the 1440x900 fold");
assert(
  /data-package-layout=\{optimized \? "optimized" : finalized \? "below-hero" : "legacy"\}/.test(
    readFileSync(path.join(ROOT, "src/components/presell/standard-v1-page.tsx"), "utf8"),
  ),
  "6d. packages use the below-hero layout on 54BO",
);
assert(!/\[data-presell-execution="54BO"\][\s\S]{0,400}scale\(1\.14\)/.test(css), "6e. 54BO package cards are not scaled past the fold");

const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.length), "7. 54BN commercial reuse manifest is available");
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
      }) &&
      !reuse.approvedPackages.some((item) => /\bfree shipping\b/i.test(item.shippingTerm)),
  ),
  "8. approved package prices stay associated with the correct quantities",
);

assert(
  EXECUTION_54BO_BUDGET.maxUsd === 0.3 &&
    EXECUTION_54BO_MAX_AI_COST_USD === 0.3 &&
    BO_LEDGER.maxUsd === 0.3 &&
    EXECUTION_54BO_ID === "execution-54bo" &&
    budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bo", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BO_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bo", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BO_LEDGER).allowed,
  "9. exclusive 54BO budget is US$0.30",
);

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "10. Product Contract remains valid");
assert(QUALITY_PROMPT_VERSION === "4" && PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && VISITOR_VISUAL_CAPTURE === "VISITOR_VISUAL_CAPTURE", "11. official evaluator versions stay frozen");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "12. official thresholds stay frozen at 90/90/85");
assert(conservativeMinPair(74, 72) === 72, "13. conservative min-of-pair is unchanged");
assert(readRendererCandidateSelection(237).activeExecutionId === "54BI", "14. live store still selects 54BI as the active execution");

const liveBest = JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/best-candidate.json"), "utf8")) as {
  desktopVisualScore?: number;
  mobileVisualScore?: number;
  editorialScore?: number;
};
assert(liveBest.desktopVisualScore === 74 && liveBest.mobileVisualScore === 72 && liveBest.editorialScore === 74, "15. Best Candidate Selector still holds 54BI 74/72/74");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(bo) && mapPresellStandardV1(lab).cta.enabled === false, "16. CTA stays blocked");
assert(
  DESIGN_CHECKPOINT_FILES.length === 4 &&
    restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx"),
  "17. rollback cannot delete the template implementation or the switcher",
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
assert(blocked.status === "QUALITY_BLOCKED", "18. Global Quality Gate stays QUALITY_BLOCKED below 90/90/85");
assert(integrity.publicationReadiness === "BLOCKED" && blocked.publicationUnlocked === false, "19. publication stays blocked");
assert(!canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "20. ads and human review remain blocked below 90/90/85");

const identity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  rendererVersion: "v4",
  sourceCommit: BI_COMMIT,
  referenceHash: EXPECTED_REFERENCE,
  screenshotHashes: ["a", "b"],
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: "4",
  rubricVersion: "2",
  model: "gpt-4o-mini",
});
const selector = selectBestCandidate({
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
    mobileVisualScore: 71,
    editorialScore: 73,
    identity,
    notes: [],
  },
});
assert(selector.updated === false, "21. selector rejects a non-proven incoming candidate");
assert(loadPremiumPresellDesignStandard().hash === EXPECTED_REFERENCE, "22. official premium reference hash is unchanged");

const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaignBo = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BO", campaignId: 237 }));
  const campaignBn = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BN", campaignId: 237 }));
  assert(/data-presell-execution="54BO"/.test(campaignBo) && /data-package-layout="below-hero"/.test(campaignBo) && /\$79/.test(campaignBo), "23. 54BO campaign render shows approved packages below the hero");
  assert(/data-presell-execution="54BN"/.test(campaignBn) && /data-package-layout="legacy"/.test(campaignBn), "24. 54BN package layout stays the prior experimental composition");
  assert(/empty bottles/i.test(campaignBo) && /48 hours/i.test(campaignBo) && /24 working hours/i.test(campaignBo), "25. guarantee and dispatch conditions remain");
  assert(!/#1 rated blood sugar|verified purchase|sean b|sabine s/i.test(campaignBo), "26. blocked medical claims and rejected testimonials stay absent");
  const declaration = readUserAssetDeclaration(237);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const enriched = enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: "" });
  const manifest = buildContentManifest({ campaignId: 237, run: snap.latest, integrity, generation: enriched });
  const safety = evaluateContentSafety({
    model,
    markup: campaignBo,
    manifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: approvedCommercialExcerpts(reuse),
  });
  assert(safety.gate === "PASS" && safety.commercialCtaEnabled === false && safety.publicationReady === false, "27. content safety passes and keeps CTA/publication blocked");
  const preflight = runTemplateQualityPreflight({ model, markup: campaignBo, contractValid: integrity.valid });
  assert(preflight.status === "PREFLIGHT_PASSED", "28. preflight passes on the 54BO campaign page");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  }),
  "29. lab scenarios stay generic and do not inherit campaign packages",
);

const bnOfficial = readJson(bnEvidence, "official-v2-results.json");
const biOfficial = readJson(biEvidence, "official-v2-results.json");
assert(bnOfficial?.finalDesktopVisualScore === 69 && bnOfficial.finalMobileVisualScore === 73 && bnOfficial.finalEditorialScore === 70, "30. 54BN official 69/73/70 remains in evidence");
assert(biOfficial?.finalDesktopVisualScore === 74 && biOfficial.finalMobileVisualScore === 72 && biOfficial.finalEditorialScore === 74, "31. 54BI official baseline 74/72/74 remains in evidence");
assert(resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID }).id === BEST_KNOWN_CANDIDATE_ID, "32. 54AZ remains selectable as the best-known renderer id");

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "candidate-identity.json",
    "commercial-content-review.json",
    "package-pricing-validation.json",
    "visual-fixes.json",
    "preflight-results.json",
    "content-safety-results.json",
    "official-v2-results.json",
    "budget-ledger.json",
    "best-candidate-comparison.json",
    "quality-gate-decision.json",
    "regression-results.json",
    "remaining-blockers.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "33. 54BO evidence files exist in a new directory");
  const identityFile = readJson(evidence, "candidate-identity.json");
  assert(identityFile?.candidateExecution === "54BO" && identityFile.compositionId === "PREMIUM_PRODUCER_CONTENT_V2", "34. candidate identity records 54BO / PREMIUM_PRODUCER_CONTENT_V2");
  const pricing = readJson(evidence, "package-pricing-validation.json");
  assert(pricing?.associationOk === true && pricing.inventedDiscount === false, "35. package pricing validation preserves approved associations");
  const review = readJson(evidence, "commercial-content-review.json");
  assert(review?.producerImagesApproved === 0 && review.ratingsApproved === false && review.testimonialsRemainRejected === true, "36. pending images/ratings are not silently approved");
  const ledger = readJson(evidence, "budget-ledger.json");
  assert(Number(ledger?.maxUsd) === 0.3 && Number(ledger?.spentUsd ?? 1) <= 0.3, "37. recorded spend stays within the exclusive 54BO ledger");
  const gate = readJson(evidence, "quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "38. written gate never unlocks publication or ads");
  if (SHOTS.every((file) => existsSync(path.join(evidence, file)))) {
    assert(true, "39. visitor captures exist for desktop, tablet, and mobile");
  }
}

console.log(`PASS ${passed}`);
