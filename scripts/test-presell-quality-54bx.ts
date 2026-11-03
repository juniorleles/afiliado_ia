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
  EXECUTION_54BX_BUDGET,
  EXECUTION_54BX_MAX_AI_COST_USD,
  FORBIDDEN_REFERENCE_CHROME,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  restoreProtectedPath,
  readCommercialReuse,
  approvedCommercialExcerpts,
  approvedOffersFromManifest,
  bindOfferCardImage,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FINAL_VISUAL_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  OFFER_CARDS_EXECUTION_ID,
  OFFER_IMAGES_EXECUTION_ID,
  PREMIUM_OFFER_CARDS_COMPOSITION_ID,
  PREMIUM_OFFER_IMAGES_COMPOSITION_ID,
  experimentalExecutionIdOf,
  usesPremiumFinalVisual,
  usesPremiumOfferCards,
  usesPremiumOfferImages,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  extractOfferImageCandidates,
  associateOfferImage,
  inspectOfferImageBuffer,
  mapOfferImages,
  selectRenderableOfferImage,
  resolveOfferImageAuthorization,
  diagnoseMissingOfferImages,
  candidatesFromRenderedDom,
  decideOfferImage,
  listOfferImagesEligibleForApproval,
  offerImageIsPublishable,
  offerImagePublicationBlockers,
  recordOperatorOfferImageAttestation,
  readOfferImageInventory,
  OFFER_PACKAGE_IMAGE,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BX_BUDGET as BX_LEDGER,
  EXECUTION_54BX_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";
import type { OfferImageAsset, OfferImageInventory } from "../src/lib/presell-quality/offer-images.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const evidence = path.join(ROOT, "data/evidence/execution-54bx-producer-offer-images");
const bwEvidence = path.join(ROOT, "data/evidence/execution-54bw-premium-offer-cards");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const BW_COMMIT = execSync('git log -1 --grep="preserve 54BW premium offer cards" --format=%H', { cwd: ROOT, encoding: "utf8" }).trim();
const BW_MESSAGE = "feat(presell): preserve 54BW premium offer cards";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const PACKSHOT_PATH = "/media/product/cc835ef78e894f7645c4556b.png";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const HARBOR = `<!doctype html><html><body>
<article class="offer">
  <h2>1 jar</h2>
  <img src="https://cdn.example.com/harbor-1.png" alt="Harbor Tonic 1 jar" srcset="https://cdn.example.com/harbor-1-800.png 800w, https://cdn.example.com/harbor-1.png 400w">
</article>
<article class="offer">
  <h2>4 jars</h2>
  <img data-src="https://cdn.example.com/harbor-4.png" alt="Harbor Tonic 4 jars" loading="lazy">
</article>
<div class="hero" style="background-image: url('https://cdn.example.com/harbor-bg.png')"></div>
<img src="https://cdn.example.com/stars.png" alt="Stars">
<img src="https://cdn.example.com/pixel.gif" width="1" height="1" alt="">
</body></html>`;

const SUGAR = `<!doctype html><html><body>
<div class="package"><h3>2 Bottles</h3><img src="https://producer.example/assets/img/SUGARDEFENDERx2-500px.png" alt="Sugar Defender 2 Bottle"></div>
<div class="package"><h3>3 Bottles</h3><img src="https://producer.example/assets/img/SUGARDEFENDERx3-500px.png" alt="Sugar Defender 3 Bottle"></div>
<div class="package"><h3>6 Bottles</h3><img src="https://producer.example/assets/img/SUGARDEFENDERx6-500px.png" alt="Sugar Defender 6 Bottle"></div>
<img src="https://producer.example/assets/img/cards.png" alt="Card">
</body></html>`;

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bx = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BX" }));
const bw = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BW" }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BI" }));

assert(execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim() === "feature/ai-presell-quality-gate", "identity: branch is feature/ai-presell-quality-gate");
assert(execSync(`git cat-file -t ${BW_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "identity: 54BW commit remains");
assert(execSync(`git log -1 --format=%s ${BW_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BW_MESSAGE, "identity: 54BW commit message is preserved");
assert(
  OFFER_IMAGES_EXECUTION_ID === "54BX" &&
    PREMIUM_OFFER_IMAGES_COMPOSITION_ID === "PREMIUM_OFFER_IMAGES_V1" &&
    parseRendererCandidateId("54BX") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BX" }).executionId === "54BX" &&
    experimentalExecutionIdOf("54BX") === "54BX" &&
    usesPremiumOfferImages("54BX") &&
    usesPremiumOfferCards("54BX") &&
    !usesPremiumOfferImages("54BW") &&
    usesPremiumOfferCards("54BW") &&
    !usesPremiumFinalVisual("54BX") &&
    resolveRendererCandidate({ requested: "54BW" }).executionId === "54BW",
  "identity: 54BX is isolated and does not collapse 54BW/54BU/54BI",
);
assert(/data-presell-execution="54BX"/.test(bx) && /data-presell-composition="PREMIUM_OFFER_IMAGES_V1"/.test(bx), "identity: 54BX renderer composition is tagged");
assert(/data-presell-execution="54BW"/.test(bw) && /PREMIUM_OFFER_CARDS_V1/.test(bw) && /data-presell-execution="54BI"/.test(bi), "identity: 54BW and 54BI remain distinct");
assert(
  EXECUTION_54BX_BUDGET.maxUsd === 0 &&
    EXECUTION_54BX_MAX_AI_COST_USD === 0 &&
    BX_LEDGER.maxUsd === 0 &&
    EXECUTION_54BX_ID === "execution-54bx" &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bx", 0), { kind: "EVALUATION", reserveUsd: 0.05 }, BX_LEDGER).allowed,
  "identity: exclusive 54BX budget is US$0.00",
);
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && QUALITY_PROMPT_VERSION === "4", "identity: official thresholds stay frozen");

const imgCandidates = extractOfferImageCandidates(HARBOR, "https://cdn.example.com/offer");
assert(imgCandidates.some((item) => item.source === "img" && /harbor-1\.png/.test(item.sourceUrl)), "1. img tags are extracted");
assert(imgCandidates.some((item) => item.source === "srcset" && /harbor-1-800\.png/.test(item.sourceUrl)), "2. srcset variants are extracted");
assert(imgCandidates.some((item) => item.source === "css" && /harbor-bg\.png/.test(item.sourceUrl)), "3. CSS background images are extracted");
assert(imgCandidates.some((item) => item.source === "lazy" && /harbor-4\.png/.test(item.sourceUrl)), "4. lazy data-src images are extracted");
const cdn = candidatesFromRenderedDom({
  pageUrl: "https://store.example/offers",
  images: [],
  cssBackgrounds: [],
  networkUrls: ["https://images.cdn.example/pack.webp"],
});
assert(cdn.some((item) => item.source === "network" && item.sourceUrl.includes("images.cdn.example")), "5. CDN network images are collected");

const mapped = mapOfferImages({
  productId: "prod-harbor",
  sourcePageUrl: "https://cdn.example.com/offer",
  candidates: imgCandidates,
  knownBottleCounts: [1, 4],
  integrityByUrl: new Map([
    ["https://cdn.example.com/harbor-1-800.png", inspectOfferImageBuffer(PNG)],
    ["https://cdn.example.com/harbor-4.png", inspectOfferImageBuffer(PNG)],
  ]),
});
assert(
  mapped.assets.some((item) => item.bottleCount === 1 && item.associationConfidence >= 0.75) &&
    mapped.assets.some((item) => item.bottleCount === 4),
  "6. images associate to the matching package quantity",
);

const hashed = inspectOfferImageBuffer(PNG);
assert(hashed.ok && hashed.sha256.length === 64 && hashed.mimeType === "image/png", "8. integrity hash is computed for a valid image");
const invalid = inspectOfferImageBuffer(Buffer.from("<html>not an image</html>"));
assert(!invalid.ok && invalid.reason === "not-an-image", "9. invalid files are rejected");

const dupInventory = mapOfferImages({
  productId: "prod-harbor",
  sourcePageUrl: "https://cdn.example.com/offer",
  candidates: [
    { sourceUrl: "https://cdn.example.com/a.png", sourcePageUrl: "https://cdn.example.com/offer", alt: "1 jar", title: "", className: "", parentHint: "1 jar", containerText: "1 jar", width: 200, height: 200, source: "img", exclusionReason: null },
    { sourceUrl: "https://cdn.example.com/b.png", sourcePageUrl: "https://cdn.example.com/offer", alt: "1 jar copy", title: "", className: "", parentHint: "1 jar", containerText: "1 jar", width: 200, height: 200, source: "img", exclusionReason: null },
  ],
  integrityByUrl: new Map([
    ["https://cdn.example.com/a.png", hashed],
    ["https://cdn.example.com/b.png", hashed],
  ]),
});
assert(dupInventory.assets.some((item) => item.duplicateOf), "7. duplicate byte hashes are detected");

const ambiguous = associateOfferImage({
  sourceUrl: "https://cdn.example.com/maybe.png",
  sourcePageUrl: "https://cdn.example.com/offer",
  alt: "2 bottles and 3 bottles",
  title: "",
  className: "",
  parentHint: "",
  containerText: "",
  width: 200,
  height: 200,
  source: "img",
  exclusionReason: null,
});
assert(ambiguous.ambiguous && ambiguous.rationale.length > 0, "10. conflicting quantities are marked ambiguous");

const pendingAuth = resolveOfferImageAuthorization({
  assetId: "asset-pending",
  sourceUrl: "https://producer.example/x2.png",
  sha256: hashed.sha256,
  declaration: null,
  discoveredAssets: [],
});
assert(pendingAuth.usageAuthorization === "PENDING" && pendingAuth.reviewStatus === "REQUIRES_HUMAN_REVIEW", "11. discovered images stay pending without authorization");
const rejectedAuth = resolveOfferImageAuthorization({
  assetId: "asset-rejected",
  sourceUrl: "https://producer.example/x2.png",
  sha256: hashed.sha256,
  declaration: null,
  discoveredAssets: [{ assetUrl: "https://producer.example/x2.png", sourceUrl: "https://producer.example/", assetType: "IMAGE", context: "", declaredAuthorization: "UNSTATED", usageRestrictions: [], status: "REJECTED" }],
});
assert(rejectedAuth.usageAuthorization === "REJECTED", "12. rejected research assets stay rejected");
const approvedAuth = resolveOfferImageAuthorization({
  assetId: "asset-ok",
  sourceUrl: "https://producer.example/x2.png",
  sha256: hashed.sha256,
  declaration: {
    campaignId: 1,
    authorizationSource: "USER_DECLARATION",
    authorizationScope: "PRESELL_USE",
    verificationStatus: "USER_ATTESTED_NOT_INDEPENDENTLY_VERIFIED",
    independentlyVerifiedLicense: false,
    declarationText: "test",
    declaredAt: "2026-01-01T00:00:00.000Z",
    assetIds: ["asset-ok"],
    origins: [],
    excludedScopes: ["GOOGLE_ADS", "META_ADS", "PINTEREST", "OTHER_CAMPAIGNS", "SUBLICENSE", "EXTERNAL_DISTRIBUTION"],
    history: [],
  },
  discoveredAssets: [{ assetUrl: "https://producer.example/x2.png", sourceUrl: "https://producer.example/", assetType: "IMAGE", context: "", declaredAuthorization: "UNSTATED", usageRestrictions: [], status: "USER_APPROVED" }],
});
assert(approvedAuth.usageAuthorization === "APPROVED", "13. explicit declaration plus USER_APPROVED is accepted");

function fakeAsset(partial: Partial<OfferImageAsset>): OfferImageAsset {
  return {
    assetId: "asset-x",
    productId: "prod",
    offerId: "offer-2",
    bottleCount: 2,
    sourceUrl: "https://producer.example/x2.png",
    sourcePageUrl: "https://producer.example/order-now.php",
    sha256: hashed.sha256,
    mimeType: "image/png",
    width: 500,
    height: 500,
    classification: OFFER_PACKAGE_IMAGE,
    associationConfidence: 0.92,
    associationRationale: ["Alt names 2 units."],
    evidenceStatus: "VERIFIED",
    usageAuthorization: "PENDING",
    reviewStatus: "REQUIRES_HUMAN_REVIEW",
    localFile: "/media/product/package-2.png",
    collectedAt: "2026-11-03T00:00:00.000Z",
    duplicateOf: null,
    exclusionReason: null,
    ...partial,
  };
}
const pendingInventory: OfferImageInventory = {
  version: 1,
  productId: "prod",
  sourcePageUrl: "https://producer.example/order-now.php",
  collectedAt: "2026-11-03T00:00:00.000Z",
  assets: [fakeAsset({})],
  discarded: [],
};
assert(!offerImageIsPublishable(fakeAsset({})), "11c. VERIFIED evidence does not make a pending image publishable");
assert(
  decideOfferImage({
    inventory: pendingInventory,
    assetId: "asset-x",
    action: "APPROVE",
    actor: "lab-operator",
    justification: "Producer license recorded in the operator declaration.",
  }).ok === false,
  "13c. publication approval stays blocked without a proven rights-holder license",
);
assert(
  decideOfferImage({
    inventory: { ...pendingInventory, assets: [fakeAsset({ rightsHolderLicenseStatus: "PROVEN", rightsHolderLicenseEvidence: "Vendor media kit grant MK-1." })] },
    assetId: "asset-x",
    action: "APPROVE",
    actor: "lab-operator",
    justification: "Producer license recorded in the operator declaration.",
  }).ok === true,
  "13c2. human approval with proven rights-holder license is accepted",
);
assert(
  decideOfferImage({
    inventory: pendingInventory,
    assetId: "asset-x",
    action: "APPROVE",
    actor: "lab-operator",
    justification: "too short",
  }).ok === false,
  "13d. approval without usage-rights justification is blocked",
);
const operatorAttested = recordOperatorOfferImageAttestation({
  inventory: pendingInventory,
  assetIds: ["asset-x"],
  actor: "campaign-operator",
  declarationText: "Campaign operator authorizes package image use for this presell.",
  now: "2026-11-03T15:00:00.000Z",
});
assert(operatorAttested.attested.includes("asset-x"), "13e. operator attestation is recorded");
assert(
  operatorAttested.inventory.assets[0]?.operatorAttestation === "OPERATOR_APPROVED" &&
    operatorAttested.inventory.assets[0]?.usageAuthorization === "PENDING" &&
    operatorAttested.inventory.assets[0]?.rightsHolderLicenseStatus === "UNPROVEN",
  "13f. OPERATOR_APPROVED does not approve usage or prove rights-holder license",
);
assert(
  offerImagePublicationBlockers(operatorAttested.inventory.assets[0]!).some((item) => /titular/i.test(item)),
  "13g. publication blockers call out the missing rights-holder license",
);
assert(selectRenderableOfferImage({ inventory: pendingInventory, bottleCount: 2 }) == null, "11b. pending images are not renderable");
assert(
  bindOfferCardImage({ bottleCount: 2, fallback: { assetId: "asset-cbc045ab", src: PACKSHOT_PATH, productName: "Harbor Tonic" }, inventory: pendingInventory }).image.src === PACKSHOT_PATH,
  "14. pending images fall back to the approved packshot",
);
const rejectedInventory: OfferImageInventory = { ...pendingInventory, assets: [fakeAsset({ usageAuthorization: "REJECTED", reviewStatus: "REJECTED", evidenceStatus: "REJECTED" })] };
assert(selectRenderableOfferImage({ inventory: rejectedInventory, bottleCount: 2 }) == null, "12b. rejected images are not renderable");
const approvedInventory: OfferImageInventory = {
  ...pendingInventory,
  assets: [
    fakeAsset({
      usageAuthorization: "APPROVED",
      reviewStatus: "APPROVED",
      rightsHolderLicenseStatus: "PROVEN",
      rightsHolderLicenseEvidence: "Vendor media kit grant MK-1.",
      publicSrc: "/media/product/package-2.png",
    }),
  ],
};
assert(selectRenderableOfferImage({ inventory: approvedInventory, bottleCount: 2 })?.localFile === "/media/product/package-2.png", "13b. approved verified images are selectable");
assert(
  bindOfferCardImage({ bottleCount: 6, fallback: { assetId: "asset-cbc045ab", src: PACKSHOT_PATH, productName: "Harbor Tonic" }, inventory: approvedInventory }).image.src === PACKSHOT_PATH,
  "15. a 2-bottle approved image is not used on a 6-bottle card",
);

const sugarMapped = mapOfferImages({
  productId: "prod-harbor",
  sourcePageUrl: "https://producer.example/order-now.php",
  candidates: extractOfferImageCandidates(SUGAR, "https://producer.example/order-now.php"),
  knownBottleCounts: [2, 3, 6],
});
assert(
  sugarMapped.discarded.some((item) => item.reason === "icon-or-badge" || item.reason === "non-package-visual") &&
    sugarMapped.assets.filter((item) => item.bottleCount === 2).length >= 1 &&
    sugarMapped.assets.filter((item) => item.bottleCount === 3).length >= 1 &&
    sugarMapped.assets.filter((item) => item.bottleCount === 6).length >= 1,
  "16. generic association works for another product shape and discards payment chrome",
);

const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.length), "commercial reuse remains");
const offers = approvedOffersFromManifest({
  manifest: reuse!,
  image: { assetId: "asset-cbc045ab", src: PACKSHOT_PATH, productName: "Sugar Defender" },
  navigationAllowed: false,
  offerImages: pendingInventory,
});
assert(offers.every((item) => item.imageRole === "PRODUCT_ILLUSTRATION"), "14b. 54BX public offers keep the approved fallback while producer images are pending");
assert(offers[0]?.unitPriceLabel === "$79" && offers[1]?.unitPriceLabel === "$69" && offers[2]?.unitPriceLabel === "$49", "17. approved prices are preserved");
assert(offers.every((item) => item.commercialNavigationEnabled === false), "18. buy buttons stay blocked");

const diagnosis = diagnoseMissingOfferImages({
  checkoutClassified: true,
  researchSeededOrderPage: false,
  primaryInventoryImageCount: 32,
  associatedCount: 0,
  approvedCount: 0,
});
assert(diagnosis.found && diagnosis.unassociated && diagnosis.pendingApproval === false, "root cause: images were found but not associated");

assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(bx), "CTA stays blocked on 54BX");
assert(
  DESIGN_CHECKPOINT_FILES.length === 4 && restoreProtectedPath("src/components/presell/standard-v1-page.tsx"),
  "rollback cannot delete the template implementation",
);

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "Product Contract remains valid");
const snap = snapshotProductResearch(237);
const record = readGeneration("lp-mvs7mja3-0d690e7c");
const storedModel = readGenerationModel("lp-mvs7mja3-0d690e7c");
if (record && storedModel) {
  const patch = readQualityPatch("lp-mvs7mja3-0d690e7c");
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const campaign = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BX", campaignId: 237 }));
  const campaignBw = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BW", campaignId: 237 }));
  assert(/data-presell-composition="PREMIUM_OFFER_IMAGES_V1"/.test(campaign), "54BX campaign uses the offer-image composition");
  assert(/PREMIUM_OFFER_CARDS_V1/.test(campaignBw), "21. 54BW composition remains");
  assert(campaign.includes(PACKSHOT_PATH), "14c. public 54BX cards still use the approved packshot fallback");
  assert(/Buy 2 bottles/i.test(campaign) && (campaign.match(/data-offer-cta="blocked"/g) ?? []).length === 3, "18b. three blocked buy buttons remain");
  assert(/\$79/.test(campaign) && /\$69/.test(campaign) && /\$49/.test(campaign), "17b. campaign prices remain");
  assert(!/MOST POPULAR/i.test(campaign), "unverified popularity stays removed");
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
  assert(safety.gate === "PASS" && safety.commercialCtaEnabled === false, "19. content safety passes");
  assert(runTemplateQualityPreflight({ model, markup: campaign, contractValid: integrity.valid }).status === "PREFLIGHT_PASSED", "20. preflight passes");
}

assert(
  labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: "54BX" }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html);
  }),
  "16b. lab scenarios stay generic",
);

const liveStore = readRendererCandidateSelection(237);
assert(liveStore.activeExecutionId === "54BI", "22. live store still selects 54BI");
assert(existsSync(path.join(bwEvidence, "execution-summary.md")), "21b. 54BW evidence remains");
assert(existsSync(path.join(biEvidence, "official-v2-results.json")), "22b. 54BI evidence remains");
assert(/\[data-presell-execution="54BX"\]/.test(css) && /\[data-presell-execution="54BW"\]/.test(css), "54BX CSS overlays 54BW without deleting it");

const liveOfferImages = readOfferImageInventory(237);
assert(Boolean(liveOfferImages?.assets.length), "live offer-image inventory remains");
assert(
  (liveOfferImages?.assets ?? []).every((asset) => asset.usageAuthorization === "PENDING"),
  "live inventory was not silently auto-approved",
);
assert(listOfferImagesEligibleForApproval(liveOfferImages).length === 0, "live images stay publication-ineligible without proven rights-holder license");
assert(
  ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"].every((assetId) => {
    const asset = liveOfferImages?.assets.find((item) => item.assetId === assetId);
    return asset?.operatorAttestation === "OPERATOR_APPROVED" && asset.usageAuthorization === "PENDING";
  }),
  "live package images keep OPERATOR_APPROVED without usage APPROVED",
);

if (existsSync(evidence)) {
  const required = [
    "execution-summary.md",
    "git-audit.json",
    "producer-page-diagnostics.json",
    "image-discovery-inventory.json",
    "network-image-inventory.json",
    "offer-image-mapping.json",
    "asset-integrity-results.json",
    "usage-authorization-audit.json",
    "pending-assets.json",
    "approved-assets.json",
    "rejected-assets.json",
    "fallback-validation.json",
    "multiproduct-regression.json",
    "content-safety-results.json",
    "preflight-results.json",
    "remaining-blockers.json",
  ];
  assert(required.every((file) => existsSync(path.join(evidence, file))), "evidence files exist");
}

console.log(`PASS ${passed}`);
