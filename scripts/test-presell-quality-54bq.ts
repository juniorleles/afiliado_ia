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
  EXECUTION_54BQ_BUDGET,
  EXECUTION_54BQ_MAX_AI_COST_USD,
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
  PREMIUM_CONVERSION_OPTIMIZATION_COMPOSITION_ID,
  PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumVisualOptimization,
  usesPremiumConversionOptimization,
  usesPremiumProducerContentV2,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
  VISUAL_OPTIMIZATION_MAX_ITERATIONS,
  parseCommercialCopyPlan,
  applyCommercialPlan,
  confirmedConversionPlan,
  defaultVisualComposition,
  buildSeedCommercialCopy,
  copyChangeIsGrounded,
  inventoryFromPage,
  mapApprovedFacts,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BQ_BUDGET as BQ_LEDGER,
  EXECUTION_54BQ_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bq-ai-conversion-optimization");
const BP_HASH = "28dfa96cad1902642d22bc513b93855285d5e050";
const BP_MESSAGE = "feat(presell): preserve AI visual optimization agent";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bq = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BQ" }));
const bp = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BP" }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BI" }));

assert(Boolean(BP_HASH) && execSync(`git cat-file -t ${BP_HASH}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "1. 54BP commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BP_HASH}`, { cwd: ROOT, encoding: "utf8" }).trim() === BP_MESSAGE, "2. 54BP commit message is preserved");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "3. 54BI proven baseline checkpoint is not overwritten",
);

assert(
  CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BQ" &&
    VISUAL_OPTIMIZATION_EXECUTION_ID === "54BP" &&
    PRODUCER_CONTENT_V2_EXECUTION_ID === "54BO" &&
    PRODUCER_CONTENT_EXECUTION_ID === "54BN" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    PREMIUM_CONVERSION_OPTIMIZATION_COMPOSITION_ID === "PREMIUM_CONVERSION_OPTIMIZATION_V1" &&
    PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID === "PREMIUM_VISUAL_OPTIMIZATION_V1" &&
    parseRendererCandidateId("54BQ") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BQ" }).executionId === "54BQ" &&
    resolveRendererCandidate({ requested: "54BP" }).executionId === "54BP" &&
    experimentalExecutionIdOf("54BQ") === "54BQ" &&
    usesPremiumConversionOptimization("54BQ") &&
    !usesPremiumConversionOptimization("54BP") &&
    usesPremiumVisualOptimization("54BP") &&
    usesPremiumVisualOptimization("54BQ") &&
    usesPremiumProducerContentV2("54BO") &&
    !usesPremiumProducerContentV2("54BQ"),
  "4. 54BQ has a distinct experimental identity and PREMIUM_CONVERSION_OPTIMIZATION_V1 composition",
);

assert(
  /data-presell-execution="54BQ"/.test(bq) &&
    /data-presell-composition="PREMIUM_CONVERSION_OPTIMIZATION_V1"/.test(bq) &&
    /data-presell-execution="54BP"/.test(bp) &&
    /data-presell-composition="PREMIUM_VISUAL_OPTIMIZATION_V1"/.test(bp) &&
    /data-presell-execution="54BI"/.test(bi),
  "5. renderer switching keeps 54BQ, 54BP, and 54BI distinct",
);

assert(/\[data-presell-execution="54BQ"\]/.test(css) && /\[data-presell-execution="54BP"\]/.test(css), "6. 54BQ CSS is isolated from 54BP");
assert(
  EXECUTION_54BQ_BUDGET.maxUsd === 0.5 &&
    EXECUTION_54BQ_MAX_AI_COST_USD === 0.5 &&
    BQ_LEDGER.maxUsd === 0.5 &&
    EXECUTION_54BQ_ID === "execution-54bq" &&
    budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bq", 0.5), { kind: "EVALUATION", reserveUsd: 0.12 }, BQ_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bq", 0.5), { kind: "EVALUATION", reserveUsd: 0.51 }, BQ_LEDGER).allowed,
  "7. exclusive 54BQ budget is US$0.50",
);
assert(VISUAL_OPTIMIZATION_MAX_ITERATIONS === 3, "8. agent is limited to three optimization iterations");

const inventory = inventoryFromPage({
  productName: "Harbor Drops",
  productKind: "liquid formula",
  ingredients: ["Maca Root", "Guarana", "Gymnema", "Ginseng"],
  description: "Harbor Drops is presented as a liquid formula.",
  usage: "Take two full droppers and hold under your tongue for 30 seconds before breakfast.",
  guarantee: "60 days refund if you return the bottles.",
  guaranteeDays: 60,
  packages: [
    { quantity: "2 bottles", unitPrice: "$79", currentTotal: "$158", duration: "60 days", shippingTerm: "Standard shipping", bonuses: [] },
    { quantity: "3 bottles", unitPrice: "$69", currentTotal: "$207", duration: "90 days", shippingTerm: "Standard shipping", bonuses: [] },
    { quantity: "6 bottles", unitPrice: "$49", currentTotal: "$294", duration: "180 days", shippingTerm: "Standard shipping", bonuses: [] },
  ],
  approvedExcerpts: ["$79", "$158", "$69", "$207", "$49", "$294"],
});
const seed = buildSeedCommercialCopy({ ...inventory, executionId: "54BQ" });
assert(seed.headline.text.includes("Harbor Drops") && seed.headline.text !== "Harbor Drops", "9. seed headline is commercial and keeps product identity");
assert(seed.subheadline.text.includes("Maca Root") && seed.heroBody.text.includes("bottle"), "10. seed copy uses approved ingredients and packages");
assert(copyChangeIsGrounded(seed.headline.text, seed.headline.supportingFactIds, inventory, "headline").ok, "11. seed headline is grounded in approved facts");
assert(!copyChangeIsGrounded("Cure blood sugar now", ["identity.productName"], inventory, "headline").ok, "12. blocked medical headline is rejected");
assert(!copyChangeIsGrounded("Unlock Wellness with Harbor Drops", ["identity.productName"], inventory, "headline").ok, "12b. invented benefit language is rejected");
assert(!copyChangeIsGrounded("Buy now", ["identity.productName"], inventory, "ctaLabel").ok, "13. checkout simulation is rejected");

const parsed = parseCommercialCopyPlan(
  JSON.stringify({
    headline: { current: "Harbor Drops", proposed: seed.headline.text, supporting_fact_ids: seed.headline.supportingFactIds },
    subheadline: { current: "", proposed: seed.subheadline.text, supporting_fact_ids: seed.subheadline.supportingFactIds },
    section_changes: [{ op: "MOVE_SANDBOX_TO_ADMIN" }],
    offer_presentation: [{ op: "SET_OFFER_COMPARE", value: true }],
    visual_changes: [{ op: "SET_PRODUCT_PRESENTATION", value: "editorial" }],
    conversion_improvements: ["Clearer offer comparison"],
    compliance_risks: [],
  }),
  seed,
);
assert(parsed.ok && parsed.plan.headline.proposed.includes("Harbor Drops"), "14. commercial analysis schema accepts a valid plan");
assert(!parseCommercialCopyPlan("not-json", seed).ok, "15. commercial analysis schema rejects invalid JSON");

const applied = applyCommercialPlan({
  composition: defaultVisualComposition("54BQ", 0),
  copy: seed,
  ...confirmedConversionPlan(1, inventory, seed),
  inventory,
  iteration: 1,
  executionId: "54BQ",
});
assert(applied.composition.conversion.sandboxPlacement === "admin" && applied.copy.headline.text.includes("Harbor Drops"), "16. controlled application updates sandbox placement and headline");
assert(applied.applied.some((item) => item.applied && item.op === "SET_HEADLINE"), "17. confirmed copy operations are supported");
assert(mapApprovedFacts(applied.copy, inventory).every((row) => row.grounded), "18. applied copy maps to approved facts");
const rejected = applyCommercialPlan({
  composition: defaultVisualComposition("54BQ", 0),
  copy: seed,
  layout_changes: [{ op: "QUALITY_GATE", value: "PASS" }],
  copy_changes: [{ op: "SET_HEADLINE", value: "Cure blood sugar" }],
  inventory,
  iteration: 1,
  executionId: "54BQ",
});
assert(rejected.applied.every((item) => !item.applied), "19. forbidden and unsupported operations are not applied");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "20. Product Contract remains valid");
assert(readRendererCandidateSelection(237).activeExecutionId === "54BI", "21. live store still selects 54BI");
assert(QUALITY_PROMPT_VERSION === "4" && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "22. official thresholds stay frozen");
assert(
  lab.hopSlot === "none" &&
    /data-v4-cta="preview-disabled"/.test(bq) &&
    !/data-v4-track="official_offer_click"/.test(bq),
  "23. 54BQ lab CTA stays blocked without a live checkout",
);
assert(DESIGN_CHECKPOINT_FILES.length === 4 && restoreProtectedPath("src/components/presell/standard-v1-page.tsx"), "24. rollback cannot delete the template implementation");

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
assert(blocked.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blocked), "25. publication and ads remain blocked");

const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.some((item) => item.unitPrice === "$79" && item.currentTotal === "$158")), "26. approved package prices remain associated");
const packshot = selectApprovedPackshot({ assets: snapshotProductResearch(237).latest?.discoveredAssets, declaration: readUserAssetDeclaration(237) });
assert(packshot?.assetId === "asset-cbc045ab", "27. approved packshot remains asset-cbc045ab");

const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BQ", campaignId: 237 }));
  assert(
    /data-presell-execution="54BQ"/.test(campaign) &&
      /\$79/.test(campaign) &&
      /\$158/.test(campaign) &&
      /data-v4-cta="inpage"/.test(campaign) &&
      !/data-v4-track="official_offer_click"/.test(campaign),
    "28. 54BQ campaign render preserves approved prices and in-page package links",
  );
  assert(/60/.test(campaign) && /two(?: full)? droppers/i.test(campaign) && !/\btwo drops\b/i.test(campaign), "29. guarantee window and two droppers remain");
  assert(!/#1 rated blood sugar|verified purchase|sean b/i.test(campaign), "30. blocked claims stay absent");
  assert(!/Preview only\. Commercial checkout is not enabled/i.test(campaign), "31. sandbox chrome is not mixed into commercial copy");
  assert(/commission/i.test(campaign), "32. affiliate disclosure remains");
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
  assert(runTemplateQualityPreflight({ model, markup: campaign, contractValid: integrity.valid }).status === "PREFLIGHT_PASSED", "34. preflight passes on 54BQ");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  }),
  "35. lab scenarios stay generic and do not inherit campaign packages",
);

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "agent-configuration.json",
    "commercial-copy-analysis.json",
    "approved-fact-mapping.json",
    "selected-iteration.json",
    "applied-copy-changes.json",
    "applied-layout-changes.json",
    "preflight-results.json",
    "content-safety-results.json",
    "budget-ledger.json",
    "regression-results.json",
    "remaining-blockers.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "36. 54BQ evidence files exist");
  const selected = JSON.parse(readFileSync(path.join(evidence, "selected-iteration.json"), "utf8")) as { officialV2Executed?: boolean; iteration?: number };
  assert(selected.officialV2Executed === false, "37. official V2 was not executed");
  const ledger = JSON.parse(readFileSync(path.join(evidence, "budget-ledger.json"), "utf8")) as { maxUsd?: number; spentUsd?: number };
  assert(Number(ledger.maxUsd) === 0.5 && Number(ledger.spentUsd ?? 1) <= 0.5, "38. recorded spend stays within the exclusive 54BQ ledger");
}

console.log(`PASS ${passed}`);
