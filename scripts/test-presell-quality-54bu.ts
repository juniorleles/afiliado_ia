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
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { enrichApprovedFactsForGeneration } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { botanicalAssetIds, selectApprovedPackshot } from "../src/lib/presell-quality/approved-packshot.ts";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BU_BUDGET,
  EXECUTION_54BU_MAX_AI_COST_USD,
  FORBIDDEN_REFERENCE_CHROME,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  methodologyThresholdsFrozen,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FINAL_VISUAL_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID,
  PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumEditorialCorrection,
  usesPremiumFinalVisual,
  usesPremiumConversionOptimization,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
  defaultVisualComposition,
  selectBestCandidate,
  readBestCandidate,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BU_BUDGET as BU_LEDGER,
  EXECUTION_54BU_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bu-final-visual-corrections");
const btEvidence = path.join(ROOT, "data/evidence/execution-54bt-evaluator-alignment");
const bsEvidence = path.join(ROOT, "data/evidence/execution-54bs-official-v2-decision");
const brEvidence = path.join(ROOT, "data/evidence/execution-54br-editorial-visual-correction");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const BT_COMMIT = "11c4d0effee38cffbab23c91294946e0af56eea8";
const BT_MESSAGE = "docs(presell): preserve evaluator alignment and final correction plan";
const BS_COMMIT = "7050029f6d7d7e6a385c9e71d252abd747768fde";
const BR_COMMIT = "f2aa4b1e3eec904e4c64c312bb3ddf1138901329";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const PACKSHOT_PATH = "/media/product/cc835ef78e894f7645c4556b.png";

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bu = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BU" }));
const br = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BR" }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BI" }));

assert(execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim() === "feature/ai-presell-quality-gate", "1. branch is feature/ai-presell-quality-gate");
assert(execSync(`git cat-file -t ${BT_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "2. 54BT commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BT_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BT_MESSAGE, "3. 54BT commit message is preserved");
assert(execSync(`git cat-file -t ${BS_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "4. 54BS commit remains recoverable");
assert(execSync(`git cat-file -t ${BR_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "5. 54BR commit remains recoverable");
assert(execSync(`git cat-file -t ${BI_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "6. 54BI commit remains recoverable");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "7. 54BI proven baseline checkpoint is not overwritten",
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
    experimentalExecutionIdOf("54BR") === "54BR" &&
    experimentalExecutionIdOf(null) === "54BR" &&
    usesPremiumFinalVisual("54BU") &&
    !usesPremiumFinalVisual("54BR") &&
    !usesPremiumFinalVisual("54BI") &&
    usesPremiumEditorialCorrection("54BU") &&
    usesPremiumEditorialCorrection("54BR") &&
    usesPremiumConversionOptimization("54BU") &&
    usesPremiumConversionOptimization("54BR"),
  "8. 54BU has a distinct experimental identity and preserves 54BR/54BI",
);

assert(
  /data-presell-execution="54BU"/.test(bu) &&
    /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(bu) &&
    /data-final-visual="1"/.test(bu) &&
    /data-presell-execution="54BR"/.test(br) &&
    /data-presell-composition="PREMIUM_EDITORIAL_CORRECTION_V1"/.test(br) &&
    !/data-final-visual="1"/.test(br) &&
    /data-presell-execution="54BI"/.test(bi),
  "9. renderer switching keeps 54BU, 54BR, and 54BI distinct",
);

assert(
  /\[data-presell-execution="54BU"\]/.test(css) &&
    /\[data-presell-execution="54BR"\]/.test(css) &&
    /padding-block: 0\.55rem 0\.7rem/.test(css) &&
    /\[data-presell-execution="54BR"\][\s\S]{0,220}padding-block: 1\.15rem 1\.25rem/.test(css),
  "10. 54BU CSS is isolated and 54BR hero spacing is unchanged",
);

assert(
  EXECUTION_54BU_BUDGET.maxUsd === 0 &&
    EXECUTION_54BU_MAX_AI_COST_USD === 0 &&
    BU_LEDGER.maxUsd === 0 &&
    EXECUTION_54BU_ID === "execution-54bu" &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bu", 0), { kind: "EVALUATION", reserveUsd: 0.01 }, BU_LEDGER).allowed,
  "11. exclusive 54BU budget is US$0.00 and blocks paid calls",
);

assert(defaultVisualComposition("54BU").executionId === "54BU" && defaultVisualComposition("54BR").executionId === "54BR", "12. composition seeds stay candidate-specific");
assert(readRendererCandidateSelection(237).activeExecutionId === "54BI", "13. live store still selects 54BI");
assert(QUALITY_PROMPT_VERSION === "4" && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "14. official thresholds stay frozen");
assert(
  lab.hopSlot === "none" &&
    /data-v4-cta="preview-disabled"/.test(bu) &&
    !/data-v4-track="official_offer_click"/.test(bu),
  "15. 54BU lab CTA stays blocked without a live checkout",
);
assert(DESIGN_CHECKPOINT_FILES.length === 4 && restoreProtectedPath("src/components/presell/standard-v1-page.tsx"), "16. rollback cannot delete the template implementation");

const liveBest = readBestCandidate(237);
assert(liveBest?.desktopVisualScore === 74 && liveBest.mobileVisualScore === 72 && liveBest.editorialScore === 74, "17. best-known scores remain 54BI 74/72/74");
const decision = selectBestCandidate({
  current: liveBest,
  incoming: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: false,
    desktopVisualScore: null,
    mobileVisualScore: null,
    editorialScore: null,
    identity: liveBest!.identity,
    notes: ["54BU has no official V2 scores"],
  },
});
assert(decision.updated === false && decision.best.desktopVisualScore === 74, "18. Best Candidate Selector does not promote 54BU without official V2");

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 73,
  desktopVisualScore: 73,
  mobileVisualScore: 75,
  editorialScore: 65,
  evaluatorStability: "UNSTABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["official V2 not executed"],
});
assert(blocked.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blocked), "19. publication and ads remain blocked");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "20. Product Contract remains valid");
const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.some((item) => item.unitPrice === "$79" && item.currentTotal === "$158")), "21. approved package prices remain associated");
const packshot = selectApprovedPackshot({ assets: snapshotProductResearch(237).latest?.discoveredAssets, declaration: readUserAssetDeclaration(237) });
assert(packshot?.assetId === "asset-cbc045ab", "22. approved packshot remains asset-cbc045ab");

const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BU", campaignId: 237 }));
  const brCampaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BR", campaignId: 237 }));
  const h1 = campaign.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  assert(/discover sugar defender/i.test(h1), "23. approved headline Discover Sugar Defender is preserved");
  assert(
    /Explore Sugar Defender Ingredients and Packages/i.test(campaign) &&
      /Explore Sugar Defender Ingredients and Packages/i.test(brCampaign),
    "23b. 54BU reuses the approved 54BR subheadline",
  );
  assert(
    /data-presell-execution="54BU"/.test(campaign) &&
      /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(campaign) &&
      /\$79/.test(campaign) &&
      /\$158/.test(campaign) &&
      /\$69/.test(campaign) &&
      /\$207/.test(campaign) &&
      /\$49/.test(campaign) &&
      /\$294/.test(campaign),
    "24. 54BU preserves approved prices and identity",
  );
  assert((campaign.match(/data-seller-package=/g) ?? []).length === 3, "25. three commercial package cards remain");
  assert(/premium-card--featured/.test(campaign), "26. lowest unit-price package is featured without invented scarcity labels");
  assert(!/limited offer/i.test(campaign), "27. no invented limited-offer label");
  assert(/60/.test(campaign) && /two(?: full)? droppers/i.test(campaign) && !/\btwo drops\b/i.test(campaign), "28. guarantee window and two droppers remain");
  assert(/commission/i.test(campaign), "29. affiliate disclosure remains");
  assert(campaign.includes(PACKSHOT_PATH), "30. approved packshot path remains");
  assert(/data-presell-execution="54BR"/.test(brCampaign) && /data-presell-composition="PREMIUM_EDITORIAL_CORRECTION_V1"/.test(brCampaign), "31. 54BR remains independently selectable");
  assert(!/#1 rated blood sugar|verified purchase|sean b/i.test(campaign), "32. blocked claims stay absent");
  const declaration = readUserAssetDeclaration(237);
  const safety = evaluateContentSafety({
    model,
    markup: campaign,
    manifest: buildContentManifest({
      campaignId: 237,
      run: snap.latest,
      integrity,
      generation: enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: "" }),
    }),
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: [
      ...approvedCommercialExcerpts(reuse),
      ...(reuse?.approvedPackages.flatMap((item) => [item.unitPrice, item.currentTotal, item.comparedTotal ?? ""]) ?? []),
    ].filter(Boolean),
  });
  assert(safety.gate === "PASS" && safety.commercialCtaEnabled === false, "33. content safety passes and keeps CTA blocked");
  assert(runTemplateQualityPreflight({ model, markup: campaign, contractValid: integrity.valid }).status === "PREFLIGHT_PASSED", "34. preflight passes on 54BU");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: "54BU" }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html) && /data-presell-execution="54BU"/.test(html);
  }),
  "35. lab scenarios stay generic and do not inherit campaign packages",
);

assert(existsSync(path.join(btEvidence, "execution-54bu-final-corrections.md")), "36. 54BT correction plan remains");
assert(existsSync(path.join(bsEvidence, "official-v2-results.json")), "37. 54BS official V2 evidence remains");
assert(existsSync(path.join(brEvidence, "execution-summary.md")), "38. 54BR evidence remains");
assert(existsSync(path.join(biEvidence, "official-v2-results.json")), "39. 54BI evidence remains");

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "candidate-identity.json",
    "bt-01-hero-density.json",
    "bt-02-card-craft.json",
    "bt-03-text-contrast.json",
    "desktop-before.png",
    "desktop-after.png",
    "tablet-after.png",
    "mobile-before.png",
    "mobile-after.png",
    "desktop-first-fold.png",
    "desktop-full.png",
    "tablet-first-fold.png",
    "tablet-full.png",
    "mobile-first-fold.png",
    "mobile-full.png",
    "visual-comparison.md",
    "commercial-content-integrity.json",
    "preflight-results.json",
    "content-safety-results.json",
    "regression-results.json",
    "remaining-blockers.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "40. 54BU evidence files exist");
  for (const name of ["desktop-after.png", "tablet-after.png", "mobile-after.png", "desktop-full.png", "mobile-full.png"]) {
    assert(existsSync(path.join(evidence, name)) && readFileSync(path.join(evidence, name)).length > 8000, `41. ${name} is a real capture`);
  }
  const identity = JSON.parse(readFileSync(path.join(evidence, "candidate-identity.json"), "utf8")) as { CANDIDATE_ID?: string; STATUS?: string };
  assert(identity.CANDIDATE_ID === "54BU" && identity.STATUS === "EXPERIMENTAL", "42. 54BU identity is experimental");
  const regression = JSON.parse(readFileSync(path.join(evidence, "regression-results.json"), "utf8")) as { officialV2Executed?: boolean; aiCalls?: number; liveStore?: string };
  assert(regression.officialV2Executed === false && regression.aiCalls === 0 && regression.liveStore === "54BI", "43. official V2 was not executed and 54BI stays active");
  const preflight = JSON.parse(readFileSync(path.join(evidence, "preflight-results.json"), "utf8")) as { status?: string };
  const safety = JSON.parse(readFileSync(path.join(evidence, "content-safety-results.json"), "utf8")) as { gate?: string };
  assert(preflight.status === "PREFLIGHT_PASSED" && safety.gate === "PASS", "44. recorded preflight and content safety passed");
  const remaining = JSON.parse(readFileSync(path.join(evidence, "remaining-blockers.json"), "utf8")) as { CTA_ENABLED?: boolean; ADS_ACTIVATED?: boolean };
  assert(remaining.CTA_ENABLED === false && remaining.ADS_ACTIVATED === false, "45. checkout, publication, and ads stay blocked");
}

console.log(`PASS ${passed}`);
