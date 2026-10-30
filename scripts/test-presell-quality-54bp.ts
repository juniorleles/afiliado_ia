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
  EXECUTION_54BP_BUDGET,
  EXECUTION_54BP_MAX_AI_COST_USD,
  FORBIDDEN_REFERENCE_CHROME,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  methodologyThresholdsFrozen,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  VISUAL_OPTIMIZATION_EXECUTION_ID,
  PRODUCER_CONTENT_EXECUTION_ID,
  PRODUCER_CONTENT_V2_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumVisualOptimization,
  usesPremiumProducerContentV2,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
  VISUAL_OPTIMIZATION_MAX_ITERATIONS,
  parseVisualAnalysisPlan,
  applyVisualPlan,
  confirmedDefectPlan,
  defaultVisualComposition,
  presentCommercialHeroCopy,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BP_BUDGET as BP_LEDGER,
  EXECUTION_54BP_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bp-ai-visual-optimization");
const BO_COMMIT = "0b0f23315e06426253e0f14ef9d54967d99096bc";
const BO_MESSAGE = "feat(presell): preserve premium producer-content v2 candidate";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bp = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BP" }));
const bo = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BO" }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BI" }));

assert(execSync(`git cat-file -t ${BO_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "1. 54BO commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BO_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BO_MESSAGE, "2. 54BO commit message is preserved");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "3. 54BI proven baseline checkpoint is not overwritten",
);

assert(
  CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BR" &&
    VISUAL_OPTIMIZATION_EXECUTION_ID === "54BP" &&
    PRODUCER_CONTENT_V2_EXECUTION_ID === "54BO" &&
    PRODUCER_CONTENT_EXECUTION_ID === "54BN" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID === "PREMIUM_VISUAL_OPTIMIZATION_V1" &&
    parseRendererCandidateId("54BP") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BP" }).executionId === "54BP" &&
    resolveRendererCandidate({ requested: "54BO" }).executionId === "54BO" &&
    experimentalExecutionIdOf("54BP") === "54BP" &&
    usesPremiumVisualOptimization("54BP") &&
    usesPremiumVisualOptimization("54BQ") &&
    !usesPremiumVisualOptimization("54BO") &&
    usesPremiumProducerContentV2("54BO") &&
    !usesPremiumProducerContentV2("54BP"),
  "4. 54BP has a distinct experimental identity and PREMIUM_VISUAL_OPTIMIZATION_V1 composition",
);

assert(
  /data-presell-execution="54BP"/.test(bp) &&
    /data-presell-composition="PREMIUM_VISUAL_OPTIMIZATION_V1"/.test(bp) &&
    /data-presell-execution="54BO"/.test(bo) &&
    /data-presell-composition="PREMIUM_PRODUCER_CONTENT_V2"/.test(bo) &&
    /data-presell-execution="54BI"/.test(bi),
  "5. renderer switching keeps 54BP, 54BO, and 54BI distinct",
);

assert(/\[data-presell-execution="54BP"\]/.test(css) && /\[data-presell-execution="54BO"\]/.test(css), "6. 54BP CSS is isolated from 54BO");
assert(
  EXECUTION_54BP_BUDGET.maxUsd === 0.5 &&
    EXECUTION_54BP_MAX_AI_COST_USD === 0.5 &&
    BP_LEDGER.maxUsd === 0.5 &&
    EXECUTION_54BP_ID === "execution-54bp" &&
    budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bp", 0.5), { kind: "EVALUATION", reserveUsd: 0.12 }, BP_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bp", 0.5), { kind: "EVALUATION", reserveUsd: 0.51 }, BP_LEDGER).allowed,
  "7. exclusive 54BP budget is US$0.50",
);
assert(VISUAL_OPTIMIZATION_MAX_ITERATIONS === 3, "8. agent is limited to three optimization iterations");

const parsed = parseVisualAnalysisPlan(
  JSON.stringify({
    visual_defects: [{ id: "VG-01", severity: "HIGH", component: "hero", problem: "Empty space", proposed_fix: "Compact hero" }],
    layout_changes: [{ op: "SET_HERO_DENSITY", value: "compact" }],
    copy_changes: [{ op: "MOVE_COMPLIANCE" }],
    expected_improvements: ["Fill first fold"],
    content_safety_risks: [],
  }),
);
assert(parsed.ok && parsed.plan.visual_defects[0]?.id === "VG-01", "9. visual analysis schema accepts a valid plan");
assert(!parseVisualAnalysisPlan("not-json").ok, "10. visual analysis schema rejects invalid JSON");

const applied = applyVisualPlan(defaultVisualComposition("54BP", 0), {
  ...confirmedDefectPlan(),
  iteration: 1,
  executionId: "54BP",
});
assert(applied.composition.hero.density === "compact" && applied.composition.hero.packshotScale === "xl", "11. controlled application updates hero density and packshot scale");
assert(applied.applied.every((item) => item.applied), "12. confirmed defect operations are supported");
const rejected = applyVisualPlan(defaultVisualComposition("54BP", 0), {
  layout_changes: [{ op: "QUALITY_GATE", value: "PASS" }],
  copy_changes: [{ op: "INVENT_HEADLINE", value: "Cure blood sugar" }],
  iteration: 1,
  executionId: "54BP",
});
assert(rejected.applied.every((item) => !item.applied), "13. forbidden and unsupported operations are not applied");
assert(presentCommercialHeroCopy("According to the seller, the declared composition includes Maca Root.").startsWith("Includes "), "14. commercial copy restates approved ingredients without technical framing");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "15. Product Contract remains valid");
assert(readRendererCandidateSelection(237).activeExecutionId === "54BI", "16. live store still selects 54BI");
assert(QUALITY_PROMPT_VERSION === "4" && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "17. official thresholds stay frozen");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(bp), "18. CTA stays blocked");
assert(DESIGN_CHECKPOINT_FILES.length === 4 && restoreProtectedPath("src/components/presell/standard-v1-page.tsx"), "19. rollback cannot delete the template implementation");

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
  editorialScore: 66,
  evaluatorStability: "UNSTABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blocked.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blocked), "20. publication and ads remain blocked");

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
  const campaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BP", campaignId: 237 }));
  assert(/data-presell-execution="54BP"/.test(campaign) && /\$79/.test(campaign) && /data-compliance-band="1"/.test(campaign), "23. 54BP campaign render uses optimized packages and a compliance aside");
  assert(/Includes /.test(campaign) && !/#1 rated blood sugar|verified purchase|sean b/i.test(campaign), "24. blocked claims stay absent and hero copy is commercial");
  assert(/empty bottles/i.test(campaign) && /two droppers|two drops|30 seconds/i.test(campaign), "25. guarantee and approved usage remain");
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
  assert(safety.gate === "PASS" && safety.commercialCtaEnabled === false, "26. content safety passes and keeps CTA blocked");
  assert(runTemplateQualityPreflight({ model, markup: campaign, contractValid: integrity.valid }).status === "PREFLIGHT_PASSED", "27. preflight passes on 54BP");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  }),
  "28. lab scenarios stay generic and do not inherit campaign packages",
);

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "agent-configuration.json",
    "visual-defects.json",
    "applied-changes.json",
    "iteration-comparison.json",
    "selected-iteration.json",
    "preflight-results.json",
    "content-safety-results.json",
    "budget-ledger.json",
    "regression-results.json",
    "remaining-blockers.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "29. 54BP evidence files exist");
  const selected = JSON.parse(readFileSync(path.join(evidence, "selected-iteration.json"), "utf8")) as { officialV2Executed?: boolean; iteration?: number };
  assert(selected.officialV2Executed === false, "30. official V2 was not executed");
  const ledger = JSON.parse(readFileSync(path.join(evidence, "budget-ledger.json"), "utf8")) as { maxUsd?: number; spentUsd?: number };
  assert(Number(ledger.maxUsd) === 0.5 && Number(ledger.spentUsd ?? 1) <= 0.5, "31. recorded spend stays within the exclusive 54BP ledger");
}

console.log(`PASS ${passed}`);
