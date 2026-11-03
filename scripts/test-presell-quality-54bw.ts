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
  EXECUTION_54BW_BUDGET,
  EXECUTION_54BW_MAX_AI_COST_USD,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
  approvedOffersFromManifest,
  auditAffiliateOfferDestination,
  commercialOfferNavigationAllowed,
  labelIsUnverifiedPopularity,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FINAL_VISUAL_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  OFFER_CARDS_EXECUTION_ID,
  PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
  PREMIUM_OFFER_CARDS_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumFinalVisual,
  usesPremiumOfferCards,
  usesPremiumEditorialCorrection,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BW_BUDGET as BW_LEDGER,
  EXECUTION_54BW_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bw-premium-offer-cards");
const buEvidence = path.join(ROOT, "data/evidence/execution-54bu-final-visual-corrections");
const bvEvidence = path.join(ROOT, "data/evidence/execution-54bv-official-v2-evaluation");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const BV_COMMIT = "8b50e4cdd5f7984f0c9d9a60f37ffbb8ce9c0ef4";
const BV_MESSAGE = "test(presell): preserve official 54BU V2 evaluation";
const BU_COMMIT = "4adef1b19668d5a5ff698c73f60d8b4f76b4c74f";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const PACKSHOT_PATH = "/media/product/cc835ef78e894f7645c4556b.png";

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bw = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BW" }));
const bu = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BU" }));
const br = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BR" }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BI" }));

assert(execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim() === "feature/ai-presell-quality-gate", "1. branch is feature/ai-presell-quality-gate");
assert(execSync(`git cat-file -t ${BV_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "2. 54BV commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BV_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BV_MESSAGE, "3. 54BV commit message is preserved");
assert(execSync(`git cat-file -t ${BU_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "4. 54BU commit remains recoverable");
assert(execSync(`git cat-file -t ${BI_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "5. 54BI commit remains recoverable");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "6. 54BI proven baseline checkpoint is not overwritten",
);

assert(
  OFFER_CARDS_EXECUTION_ID === "54BW" &&
    PREMIUM_OFFER_CARDS_COMPOSITION_ID === "PREMIUM_OFFER_CARDS_V1" &&
    FINAL_VISUAL_EXECUTION_ID === "54BU" &&
    CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BR" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    parseRendererCandidateId("54BW") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BW" }).executionId === "54BW" &&
    resolveRendererCandidate({ requested: "54BU" }).executionId === "54BU" &&
    experimentalExecutionIdOf("54BW") === "54BW" &&
    usesPremiumOfferCards("54BW") &&
    !usesPremiumOfferCards("54BU") &&
    usesPremiumFinalVisual("54BU") &&
    !usesPremiumFinalVisual("54BW") &&
    usesPremiumEditorialCorrection("54BW"),
  "7. 54BW is an isolated experimental candidate and does not collapse 54BU/54BR/54BI",
);

assert(
  /data-presell-execution="54BW"/.test(bw) &&
    /data-presell-composition="PREMIUM_OFFER_CARDS_V1"/.test(bw) &&
    /data-presell-execution="54BU"/.test(bu) &&
    /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(bu) &&
    /data-presell-execution="54BR"/.test(br) &&
    /data-presell-execution="54BI"/.test(bi),
  "8. renderer switching keeps 54BW, 54BU, 54BR, and 54BI distinct",
);
assert(/\[data-presell-execution="54BW"\]/.test(css) && /\[data-presell-execution="54BU"\]/.test(css), "9. 54BW CSS exists without deleting 54BU selectors");

assert(
  EXECUTION_54BW_BUDGET.maxUsd === 0 &&
    EXECUTION_54BW_MAX_AI_COST_USD === 0 &&
    BW_LEDGER.maxUsd === 0 &&
    EXECUTION_54BW_ID === "execution-54bw" &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bw", 0), { kind: "EVALUATION", reserveUsd: 0.05 }, BW_LEDGER).allowed,
  "10. exclusive 54BW budget is US$0.00 and blocks paid calls",
);

assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && QUALITY_PROMPT_VERSION === "4", "11. official thresholds and evaluator versions stay frozen");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(bw) && mapPresellStandardV1(lab).cta.enabled === false, "12. CTA stays blocked");
assert(
  DESIGN_CHECKPOINT_FILES.length === 4 &&
    restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx"),
  "13. rollback cannot delete the template implementation or the switcher",
);

const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.length), "14. commercial reuse manifest is available");
const offers = approvedOffersFromManifest({
  manifest: reuse!,
  image: { assetId: "asset-cbc045ab", src: PACKSHOT_PATH, productName: "Sugar Defender" },
  navigationAllowed: false,
});
assert(offers.length === 3, "15. three approved offers are mapped");
assert(offers[0]?.bottleCount === 2 && offers[0].unitPriceLabel === "$79" && offers[0].totalPriceLabel === "$158", "16. two-bottle prices stay $79 / $158");
assert(offers[1]?.bottleCount === 3 && offers[1].unitPriceLabel === "$69" && offers[1].totalPriceLabel === "$207", "17. three-bottle prices stay $69 / $207");
assert(offers[2]?.bottleCount === 6 && offers[2].unitPriceLabel === "$49" && offers[2].totalPriceLabel === "$294", "18. six-bottle prices stay $49 / $294");
assert(offers[0]?.shippingDescription === "Shipping extra", "19. two-bottle shipping remains extra");
assert(offers[1]?.shippingDescription === "US shipping included" && offers[2]?.shippingDescription === "US shipping included", "20. 3- and 6-bottle US shipping remains included");
assert(offers[1]?.bonuses.some((item) => /2 digital guides/i.test(item)) && offers[2]?.bonuses.some((item) => /2 digital guides/i.test(item)), "21. approved digital-guide bonuses remain on 3- and 6-bottle offers");
assert(offers[0]?.bonuses.length === 0, "22. two-bottle offer does not invent bonuses");
assert(offers[2]?.featuredReason === "LOWEST_UNIT_PRICE", "23. lowest unit price is featured on the six-bottle offer");
assert(offers.every((item) => !labelIsUnverifiedPopularity(item.quantityLabel)), "24. quantity labels are factual");
assert(offers.every((item) => item.imageRole === "PRODUCT_ILLUSTRATION" && item.imageRepresentsBottleCount === false), "25. packshot is treated as an illustration, not a fabricated quantity composite");
assert(offers.every((item) => item.buyLabel.toLowerCase().startsWith("buy ") && item.commercialNavigationEnabled === false), "26. each offer has an individual blocked buy control");
assert(
  !commercialOfferNavigationAllowed({
    affiliateDestinationStatus: "PENDING",
    contentSafetyPass: true,
    qualityGateApproved: false,
    operationalAuthorization: false,
    hopEnabled: false,
  }),
  "27. commercial navigation stays unauthorized without every required approval",
);

const audit = auditAffiliateOfferDestination(reuse);
assert(audit.affiliateLinkVerified === true, "28. a registered affiliate destination exists");
assert(audit.packageSpecificLinksAvailable === false, "29. package-specific destinations are not available");
assert(audit.commercialDestinationApproved === false, "30. the commercial destination is not approved");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "31. Product Contract remains valid");

const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BW", campaignId: 237 }));
  const campaignBu = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BU", campaignId: 237 }));
  assert(/data-presell-execution="54BW"/.test(campaign) && /data-presell-composition="PREMIUM_OFFER_CARDS_V1"/.test(campaign), "32. 54BW campaign render uses the offer-card composition");
  assert(/data-presell-execution="54BU"/.test(campaignBu) && /MOST POPULAR/i.test(campaignBu), "33. 54BU still renders its previous package labels");
  assert(!/MOST POPULAR/i.test(campaign), "34. MOST POPULAR is removed from 54BW");
  assert(!/best seller|customer favorite|limited stock|only today/i.test(campaign), "35. other unverified popularity labels stay absent");
  assert(/lowest price per bottle/i.test(campaign), "36. lowest unit-price label is present");
  assert(/Buy 2 bottles/i.test(campaign) && /Buy 3 bottles/i.test(campaign) && /Buy 6 bottles/i.test(campaign), "37. three individual buy buttons render");
  assert((campaign.match(/data-offer-cta="blocked"/g) ?? []).length === 3, "38. all three buy controls are blocked");
  assert(!/data-v4-track="official_offer_click"/.test(campaign), "39. 54BW does not emit a commercial hop tracker");
  assert(!/href="https:\/\/sugardefender24\.com/i.test(campaign), "40. affiliate destination is not a live href");
  assert(campaign.includes(PACKSHOT_PATH) && /data-packshot-asset="asset-cbc045ab"/.test(campaign), "41. approved packshot is used on the offer cards");
  assert(/\$79/.test(campaign) && /\$158/.test(campaign) && /\$69/.test(campaign) && /\$207/.test(campaign) && /\$49/.test(campaign) && /\$294/.test(campaign), "42. approved prices remain");
  assert(/Shipping extra/i.test(campaign) && /US shipping included/i.test(campaign), "43. shipping terms remain");
  assert(/Includes 2 digital guides/i.test(campaign), "44. approved bonuses remain");
  assert(/seller-listed comparison/i.test(campaign), "45. comparison totals are labeled as seller-listed");
  assert(/discover sugar defender/i.test(campaign) && /two(?: full)? droppers/i.test(campaign), "46. hero copy and usage instructions remain");
  assert(/60/.test(campaign) && /commission/i.test(campaign), "47. guarantee window and disclosure remain");
  const declaration = readUserAssetDeclaration(237);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
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
  assert(safety.gate === "PASS" && safety.commercialCtaEnabled === false && safety.publicationReady === false, "48. content safety passes and keeps CTA/publication blocked");
  assert(runTemplateQualityPreflight({ model, markup: campaign, contractValid: integrity.valid }).status === "PREFLIGHT_PASSED", "49. preflight passes on the 54BW campaign page");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: "54BW" }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  }),
  "50. lab scenarios stay generic and do not inherit campaign packages",
);

const liveStore = readRendererCandidateSelection(237);
const liveBest = JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/best-candidate.json"), "utf8")) as {
  desktopVisualScore?: number;
  mobileVisualScore?: number;
  editorialScore?: number;
};
assert(liveStore.activeExecutionId === "54BI", "51. live store still selects 54BI");
assert(liveBest.desktopVisualScore === 74 && liveBest.mobileVisualScore === 72 && liveBest.editorialScore === 74, "52. Best Candidate Selector still holds 54BI 74/72/74");
assert(existsSync(path.join(buEvidence, "execution-summary.md")), "53. 54BU evidence remains");
assert(existsSync(path.join(bvEvidence, "official-v2-results.json")), "54. 54BV official V2 evidence remains");
assert(existsSync(path.join(biEvidence, "official-v2-results.json")), "55. 54BI evidence remains");

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "candidate-identity.json",
    "approved-assets.json",
    "offer-contract-validation.json",
    "affiliate-link-audit.json",
    "commercial-authorization-state.json",
    "desktop-offers-before.png",
    "desktop-offers-after.png",
    "mobile-offers-before.png",
    "mobile-offers-after.png",
    "desktop-full.png",
    "tablet-full.png",
    "mobile-full.png",
    "visual-comparison.md",
    "content-safety-results.json",
    "preflight-results.json",
    "regression-results.json",
    "remaining-blockers.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "56. 54BW evidence files exist");
  const auditFile = JSON.parse(readFileSync(path.join(evidence, "git-audit.json"), "utf8")) as { bvCommit?: string; pushExecuted?: boolean; bwCommitCreated?: boolean };
  assert(auditFile.bvCommit === BV_COMMIT && auditFile.pushExecuted === false && auditFile.bwCommitCreated === false, "57. git audit records the 54BV commit and no 54BW commit/push");
  const auth = JSON.parse(readFileSync(path.join(evidence, "commercial-authorization-state.json"), "utf8")) as { commercialNavigationEnabled?: boolean };
  assert(auth.commercialNavigationEnabled === false, "58. written authorization state keeps checkout blocked");
}

console.log(`PASS ${passed}`);
