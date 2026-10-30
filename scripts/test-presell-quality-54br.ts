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
  EXECUTION_54BR_BUDGET,
  EXECUTION_54BR_MAX_AI_COST_USD,
  FORBIDDEN_REFERENCE_CHROME,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  methodologyThresholdsFrozen,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  CONVERSION_OPTIMIZATION_EXECUTION_ID,
  VISUAL_OPTIMIZATION_EXECUTION_ID,
  PRODUCER_CONTENT_EXECUTION_ID,
  PRODUCER_CONTENT_V2_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID,
  PREMIUM_CONVERSION_OPTIMIZATION_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumVisualOptimization,
  usesPremiumConversionOptimization,
  usesPremiumEditorialCorrection,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
  VISUAL_OPTIMIZATION_MAX_ITERATIONS,
  applyCommercialPlan,
  confirmedEditorialPlan,
  defaultVisualComposition,
  buildEditorialCopy,
  buildSeedCommercialCopy,
  copyChangeIsGrounded,
  inventoryFromPage,
  mapApprovedFacts,
  runEditorialQualityGate,
  isFactDumpHeadline,
  wordCount,
  detectDuplicateSectionTitles,
  detectEmptySections,
  detectFaqWithoutAnswer,
  EDITORIAL_QUALITY_GATE_ID,
  EDITORIAL_HEADLINE_MAX_WORDS,
} from "../src/lib/presell-quality/index.ts";
import { ALLOWED_COPY_OPS, VISUAL_OPTIMIZATION_OPS } from "../src/lib/presell-quality/visual-optimization-agent/index.ts";
import {
  EXECUTION_54BR_BUDGET as BR_LEDGER,
  EXECUTION_54BR_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54br-editorial-visual-correction");
const BQ_HASH = "29c4a979f5175dcb6e1c4a2e366bfd05a2af1456";
const BQ_MESSAGE = "feat(presell): preserve AI commercial copy optimizer";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const br = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BR" }));
const bq = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BQ" }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BI" }));

assert(Boolean(BQ_HASH) && execSync(`git cat-file -t ${BQ_HASH}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "1. 54BQ commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BQ_HASH}`, { cwd: ROOT, encoding: "utf8" }).trim() === BQ_MESSAGE, "2. 54BQ commit message is preserved");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "3. 54BI proven baseline checkpoint is not overwritten",
);

assert(
  CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BR" &&
    CONVERSION_OPTIMIZATION_EXECUTION_ID === "54BQ" &&
    VISUAL_OPTIMIZATION_EXECUTION_ID === "54BP" &&
    PRODUCER_CONTENT_V2_EXECUTION_ID === "54BO" &&
    PRODUCER_CONTENT_EXECUTION_ID === "54BN" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID === "PREMIUM_EDITORIAL_CORRECTION_V1" &&
    PREMIUM_CONVERSION_OPTIMIZATION_COMPOSITION_ID === "PREMIUM_CONVERSION_OPTIMIZATION_V1" &&
    parseRendererCandidateId("54BR") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BR" }).executionId === "54BR" &&
    resolveRendererCandidate({ requested: "54BQ" }).executionId === "54BQ" &&
    experimentalExecutionIdOf("54BR") === "54BR" &&
    experimentalExecutionIdOf("54BQ") === "54BQ" &&
    usesPremiumEditorialCorrection("54BR") &&
    !usesPremiumEditorialCorrection("54BQ") &&
    usesPremiumConversionOptimization("54BR") &&
    usesPremiumConversionOptimization("54BQ") &&
    usesPremiumVisualOptimization("54BR") &&
    usesPremiumVisualOptimization("54BQ"),
  "4. 54BR has a distinct editorial identity and preserves 54BQ",
);

assert(
  /data-presell-execution="54BR"/.test(br) &&
    /data-presell-composition="PREMIUM_EDITORIAL_CORRECTION_V1"/.test(br) &&
    /data-presell-execution="54BQ"/.test(bq) &&
    /data-presell-composition="PREMIUM_CONVERSION_OPTIMIZATION_V1"/.test(bq) &&
    /data-presell-execution="54BI"/.test(bi),
  "5. renderer switching keeps 54BR, 54BQ, and 54BI distinct",
);

assert(/\[data-presell-execution="54BR"\]/.test(css) && /\[data-presell-execution="54BQ"\]/.test(css), "6. 54BR CSS is isolated from 54BQ");
assert(
  EXECUTION_54BR_BUDGET.maxUsd === 0.35 &&
    EXECUTION_54BR_MAX_AI_COST_USD === 0.35 &&
    BR_LEDGER.maxUsd === 0.35 &&
    EXECUTION_54BR_ID === "execution-54br" &&
    budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54br", 0.35), { kind: "EVALUATION", reserveUsd: 0.12 }, BR_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54br", 0.35), { kind: "EVALUATION", reserveUsd: 0.36 }, BR_LEDGER).allowed,
  "7. exclusive 54BR budget is US$0.35",
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
const dump = buildSeedCommercialCopy({ ...inventory, executionId: "54BQ" });
const editorial = buildEditorialCopy({ ...inventory, executionId: "54BR" });
assert(isFactDumpHeadline(dump.headline.text), "9. fact-dump headlines are detected");
assert(wordCount(editorial.headline.text) <= EDITORIAL_HEADLINE_MAX_WORDS && editorial.headline.text === "Discover Harbor Drops", "10. editorial headline is short and natural");
assert(wordCount(editorial.subheadline.text) <= 25 && /60-day refund terms/.test(editorial.subheadline.text), "11. editorial subheadline stays within 25 words");
assert(copyChangeIsGrounded(editorial.headline.text, editorial.headline.supportingFactIds, inventory, "headline").ok, "12. editorial headline is grounded");
assert(!copyChangeIsGrounded("Cure blood sugar now", ["identity.productName"], inventory, "headline").ok, "13. blocked medical headline is rejected");

const dumpMarkup = `<main><h1>${dump.headline.text}</h1><h2>Delivery and payment</h2><p>pay</p><h2>Delivery and payment</h2><p>ship</p><h2>The product</h2><div data-product-presentation="editorial"><img alt=""></div></main>`;
assert(detectDuplicateSectionTitles(dumpMarkup).includes("delivery and payment"), "14. duplicated section titles are detected");
assert(detectEmptySections(dumpMarkup).includes("The product"), "15. empty sections are detected");
assert(detectFaqWithoutAnswer(`<div data-premium="faq"><details><summary>Q</summary></details></div>`), "16. FAQ without answers is detected");

const gate = runEditorialQualityGate({
  markup: dumpMarkup,
  copy: dump,
  composition: defaultVisualComposition("54BQ", 0),
  inventory,
});
assert(gate.gateId === EDITORIAL_QUALITY_GATE_ID && !gate.pass && gate.issues.some((item) => item.issue === "HEADLINE_FACT_DUMP"), "17. editorial quality gate flags the 54BQ headline");

const applied = applyCommercialPlan({
  composition: defaultVisualComposition("54BR", 0),
  copy: dump,
  ...confirmedEditorialPlan(1, inventory, dump),
  inventory,
  iteration: 1,
  executionId: "54BR",
});
assert(applied.copy.headline.text === "Discover Harbor Drops", "18. REWRITE_HEADLINE applies a short commercial headline");
assert(applied.composition.conversion.mergeFulfillment && applied.composition.conversion.productPresentation === "none", "19. duplicate and empty sections are merged or removed");
assert(
  applied.composition.conversion.typographyScale === "readable" &&
    applied.composition.conversion.ingredientLayout === "distinct" &&
    applied.composition.conversion.faqMode === "interactive",
  "20. typography, ingredient layout, and FAQ operations apply",
);
assert(mapApprovedFacts(applied.copy, inventory).every((row) => row.grounded), "21. applied copy maps to approved facts");

const rejected = applyCommercialPlan({
  composition: defaultVisualComposition("54BR", 0),
  copy: editorial,
  layout_changes: [{ op: "QUALITY_GATE", value: "PASS" }],
  copy_changes: [{ op: "REWRITE_HEADLINE", value: "Cure blood sugar" }],
  inventory,
  iteration: 1,
  executionId: "54BR",
});
assert(rejected.applied.every((item) => !item.applied) && rejected.copy.headline.text === editorial.headline.text, "22. forbidden and unsupported operations roll back");
assert(
  ["REWRITE_HEADLINE", "MERGE_DUPLICATE_SECTIONS", "REMOVE_EMPTY_SECTION", "ADJUST_TYPOGRAPHY", "REFINE_INGREDIENT_LAYOUT", "COMPLETE_GROUNDED_FAQ"].every((op) =>
    (ALLOWED_COPY_OPS as readonly string[]).includes(op),
  ) && (VISUAL_OPTIMIZATION_OPS as readonly string[]).includes("SET_TYPOGRAPHY_SCALE"),
  "23. allowed editorial operations are in the controlled schema",
);

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "24. Product Contract remains valid");
assert(readRendererCandidateSelection(237).activeExecutionId === "54BI", "25. live store still selects 54BI");
assert(QUALITY_PROMPT_VERSION === "4" && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "26. official thresholds stay frozen");
assert(
  lab.hopSlot === "none" &&
    /data-v4-cta="preview-disabled"/.test(br) &&
    !/data-v4-track="official_offer_click"/.test(br),
  "27. 54BR lab CTA stays blocked without a live checkout",
);
assert(DESIGN_CHECKPOINT_FILES.length === 4 && restoreProtectedPath("src/components/presell/standard-v1-page.tsx"), "28. rollback cannot delete the template implementation");

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
assert(blocked.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blocked), "29. publication and ads remain blocked");

const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.some((item) => item.unitPrice === "$79" && item.currentTotal === "$158")), "30. approved package prices remain associated");
const packshot = selectApprovedPackshot({ assets: snapshotProductResearch(237).latest?.discoveredAssets, declaration: readUserAssetDeclaration(237) });
assert(packshot?.assetId === "asset-cbc045ab", "31. approved packshot remains asset-cbc045ab");

const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BR", campaignId: 237 }));
  const bqCampaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BQ", campaignId: 237 }));
  const h1 = campaign.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  assert(wordCount(h1) <= 8 && /discover sugar defender/i.test(h1) && !isFactDumpHeadline(h1), "32. 54BR campaign headline is short and natural");
  assert(
    /data-presell-execution="54BR"/.test(campaign) &&
      /\$79/.test(campaign) &&
      /\$158/.test(campaign) &&
      /\$69/.test(campaign) &&
      /\$294/.test(campaign) &&
      /data-v4-cta="inpage"/.test(campaign),
    "33. 54BR preserves approved prices and in-page package links",
  );
  assert(/60/.test(campaign) && /two(?: full)? droppers/i.test(campaign) && !/\btwo drops\b/i.test(campaign), "34. guarantee window and two droppers remain");
  assert((campaign.match(/<h2[^>]*>\s*Delivery and payment\s*<\/h2>/gi) ?? []).length <= 1, "35. duplicated Delivery and payment is removed");
  assert(!/<h2[^>]*>\s*The product\s*<\/h2>/i.test(campaign), "36. empty product section is removed");
  assert(/data-ingredient-layout="distinct"/.test(campaign) && /data-faq-answer="1"/.test(campaign) && /<details[^>]*open/.test(campaign), "37. ingredient layout and interactive FAQ are present");
  assert(/data-presell-execution="54BQ"/.test(bqCampaign) && /data-presell-composition="PREMIUM_CONVERSION_OPTIMIZATION_V1"/.test(bqCampaign), "38. 54BQ remains independently selectable");
  assert(!/#1 rated blood sugar|verified purchase|sean b/i.test(campaign), "39. blocked claims stay absent");
  assert(/commission/i.test(campaign), "40. affiliate disclosure remains");
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
  assert(safety.gate === "PASS" && safety.commercialCtaEnabled === false, "41. content safety passes and keeps CTA blocked");
  assert(runTemplateQualityPreflight({ model, markup: campaign, contractValid: integrity.valid }).status === "PREFLIGHT_PASSED", "42. preflight passes on 54BR");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  }),
  "43. lab scenarios stay generic and do not inherit campaign packages",
);

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "editorial-quality-gate.json",
    "editorial-defects.json",
    "approved-fact-mapping.json",
    "applied-corrections.json",
    "selected-iteration.json",
    "faq-interaction-results.json",
    "preflight-results.json",
    "content-safety-results.json",
    "budget-ledger.json",
    "regression-results.json",
    "remaining-blockers.json",
    "desktop-final.png",
    "tablet-final.png",
    "mobile-final.png",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "44. 54BR evidence files exist");
  for (const name of ["iteration-0-desktop.png", "iteration-1-desktop.png", "desktop-final.png", "tablet-final.png", "mobile-final.png"]) {
    assert(existsSync(path.join(evidence, name)) && readFileSync(path.join(evidence, name)).length > 8000, `45. ${name} is a real capture`);
  }
  const selected = JSON.parse(readFileSync(path.join(evidence, "selected-iteration.json"), "utf8")) as { officialV2Executed?: boolean };
  assert(selected.officialV2Executed === false, "46. official V2 was not executed");
  const ledger = JSON.parse(readFileSync(path.join(evidence, "budget-ledger.json"), "utf8")) as { maxUsd?: number; spentUsd?: number };
  assert(Number(ledger.maxUsd) === 0.35 && Number(ledger.spentUsd ?? 1) <= 0.35, "47. recorded spend stays within the exclusive 54BR ledger");
  const faq = JSON.parse(readFileSync(path.join(evidence, "faq-interaction-results.json"), "utf8")) as { clickToggles?: boolean; keyboardToggles?: boolean; answersPresent?: boolean };
  assert(Boolean(faq.answersPresent && faq.clickToggles && faq.keyboardToggles), "48. FAQ is functional with click and keyboard");
}

console.log(`PASS ${passed}`);
