import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { disableCommercialCta, evaluateContentSafety } from "../src/lib/presell-quality/content-safety.ts";
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { enrichApprovedFactsForGeneration } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { botanicalAssetIds, selectApprovedPackshot } from "../src/lib/presell-quality/approved-packshot.ts";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import { currentSalesUrl } from "../src/lib/campaign-sources/present.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import {
  EXECUTION_54BW_BUDGET,
  EXECUTION_54BW_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  writeExecutionBudgetLedger,
} from "../src/lib/presell-quality/execution-budget.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import { captureVisitorVisuals, visitorCapturePreviewPath } from "../src/lib/presell-quality/visitor-capture.ts";
import {
  EXPERIMENTAL_CANDIDATE_ID,
  FINAL_VISUAL_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  OFFER_CARDS_EXECUTION_ID,
  PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
  PREMIUM_OFFER_CARDS_COMPOSITION_ID,
  usesPremiumFinalVisual,
  usesPremiumOfferCards,
  readRendererCandidateSelection,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import { approvedCommercialExcerpts, readCommercialReuse } from "../src/lib/presell-quality/commercial-reuse.ts";
import {
  approvedOffersFromManifest,
  auditAffiliateOfferDestination,
  commercialOfferNavigationAllowed,
  labelIsUnverifiedPopularity,
} from "../src/lib/presell-quality/approved-offers.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { resolveGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { readBestCandidate } from "../src/lib/presell-quality/best-candidate.ts";
import { runTemplateQualityPreflight } from "../src/lib/presell-template/index.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bw-premium-offer-cards");
const BV_COMMIT = "8b50e4cdd5f7984f0c9d9a60f37ffbb8ce9c0ef4";
const BU_COMMIT = "4adef1b19668d5a5ff698c73f60d8b4f76b4c74f";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const PACKSHOT_PATH = "/media/product/cc835ef78e894f7645c4556b.png";

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sourceCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function previewUrl(candidate: string): string {
  return `http://127.0.0.1:3000${visitorCapturePreviewPath(GENERATION_ID, candidate)}`;
}

function loadModel() {
  const snap = snapshotProductResearch(CAMPAIGN_ID);
  const integrity = validatePersistedProductContract(CAMPAIGN_ID, snap.latest);
  const record = readGeneration(GENERATION_ID);
  const stored = readGenerationModel(GENERATION_ID);
  if (!record || !stored) throw new Error(`Generation ${GENERATION_ID} is not recoverable.`);
  const patch = readQualityPatch(GENERATION_ID);
  const patched = patch ? applyQualityPatch(stored, patch) : stored;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  return { snap, integrity, model: disableCommercialCta(sandboxed) };
}

function restoreActiveBi() {
  writeActivePreviewCandidate(CAMPAIGN_ID, EXPERIMENTAL_CANDIDATE_ID, FROZEN_IMPROVEMENT_EXECUTION_ID);
}

async function captureOffersSection(candidate: string, outFile: string, viewport: { width: number; height: number }) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(previewUrl(candidate), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
    const section = page.locator("#seller-stated-packages");
    await section.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll("#seller-stated-packages img")] as HTMLImageElement[];
      return images.length === 0 || images.every((img) => img.complete && img.naturalWidth > 0);
    }, { timeout: 15_000 }).catch(() => undefined);
    await section.screenshot({ path: outFile });
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const branch = execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf8" }).trim();
  const standard = loadPremiumPresellDesignStandard();
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }

  writeJson(path.join(EVIDENCE, "git-audit.json"), {
    branch,
    head: commit,
    initialHead: BV_COMMIT,
    bvCommit: BV_COMMIT,
    bvCommitMessage: "test(presell): preserve official 54BU V2 evaluation",
    buCommit: BU_COMMIT,
    biCommit: BI_COMMIT,
    pushExecuted: false,
    bwCommitCreated: false,
  });

  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    EXECUTION_ID: OFFER_CARDS_EXECUTION_ID,
    CANDIDATE_ID: "54BW",
    COMPOSITION_ID: PREMIUM_OFFER_CARDS_COMPOSITION_ID,
    STATUS: "EXPERIMENTAL",
    SOURCE_CANDIDATE: FINAL_VISUAL_EXECUTION_ID,
    SOURCE_COMPOSITION_ID: PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
    BEST_KNOWN_EXECUTION: "54BI",
    ACTIVE_EXECUTION_ID: readRendererCandidateSelection(CAMPAIGN_ID).activeExecutionId,
    usesPremiumOfferCards: usesPremiumOfferCards(OFFER_CARDS_EXECUTION_ID),
    usesPremiumFinalVisual54bu: usesPremiumFinalVisual(FINAL_VISUAL_EXECUTION_ID),
    usesPremiumOfferCards54bu: usesPremiumOfferCards(FINAL_VISUAL_EXECUTION_ID),
    selectableVia: "?candidate=54BW",
  });

  const { snap, integrity, model } = loadModel();
  const reuse = readCommercialReuse(CAMPAIGN_ID);
  if (!reuse) throw new Error("Commercial reuse manifest is missing.");
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const offers = approvedOffersFromManifest({
    manifest: reuse,
    image: {
      assetId: packshot?.assetId ?? null,
      src: model.commercialImage?.src ?? PACKSHOT_PATH,
      productName: model.contract.identity.productName,
    },
    navigationAllowed: false,
  });
  const affiliateAudit = auditAffiliateOfferDestination(reuse);
  const navigationAllowed = commercialOfferNavigationAllowed({
    affiliateDestinationStatus: affiliateAudit.commercialDestinationApproved ? "APPROVED" : "PENDING",
    contentSafetyPass: true,
    qualityGateApproved: false,
    operationalAuthorization: false,
    hopEnabled: Boolean(model.hopHref),
  });

  writeJson(path.join(EVIDENCE, "approved-assets.json"), {
    packshotAssetId: packshot?.assetId ?? null,
    packshotPath: model.commercialImage?.src ?? null,
    expectedPath: PACKSHOT_PATH,
    producerImagesApproved: 0,
    imageRole: "PRODUCT_ILLUSTRATION",
    imageRepresentsBottleCount: false,
    reason: "The approved packshot is a multi-bottle product image. Cards use it as an illustration plus a textual bottle count instead of repeating or fabricating quantity-specific packs.",
  });
  writeJson(path.join(EVIDENCE, "offer-contract-validation.json"), {
    offers: offers.map((item) => ({
      id: item.id,
      bottleCount: item.bottleCount,
      unitPriceLabel: item.unitPriceLabel,
      totalPriceLabel: item.totalPriceLabel,
      shippingDescription: item.shippingDescription,
      bonuses: item.bonuses,
      featuredReason: item.featuredReason,
      buyLabel: item.buyLabel,
      commercialNavigationEnabled: item.commercialNavigationEnabled,
    })),
    popularityLabelsRemoved: reuse.approvedPackages.every((item) => !offers.some((offer) => labelIsUnverifiedPopularity(offer.quantityLabel) || (offer.featuredReason !== "LOWEST_UNIT_PRICE" && labelIsUnverifiedPopularity(item.label)))),
    lowestUnitFeatured: offers.some((item) => item.featuredReason === "LOWEST_UNIT_PRICE" && item.unitPriceLabel === "$49"),
  });
  writeJson(path.join(EVIDENCE, "affiliate-link-audit.json"), {
    ...affiliateAudit,
    AFFILIATE_LINK_VERIFIED: affiliateAudit.affiliateLinkVerified,
    PACKAGE_SPECIFIC_LINKS_AVAILABLE: affiliateAudit.packageSpecificLinksAvailable,
    AFFILIATE_TRACKING_VERIFIED: affiliateAudit.affiliateTrackingVerified,
    COMMERCIAL_DESTINATION_APPROVED: affiliateAudit.commercialDestinationApproved,
    hopOrHopIdModified: false,
  });
  writeJson(path.join(EVIDENCE, "commercial-authorization-state.json"), {
    previewUnauthorized: true,
    qualityGateApproved: false,
    operationalAuthorization: false,
    hopEnabled: Boolean(model.hopHref),
    commercialNavigationEnabled: navigationAllowed,
    buttonsRendered: true,
    checkoutEnabled: false,
  });

  const ledger = emptyExecutionBudgetLedger(EXECUTION_54BW_ID, EXECUTION_54BW_BUDGET.maxUsd);
  writeExecutionBudgetLedger(path.join(EVIDENCE, "budget-ledger.json"), ledger);
  const paidBlocked = !budgetAllowsPaidCall(ledger, { kind: "EVALUATION", reserveUsd: 0.05 }, EXECUTION_54BW_BUDGET).allowed;

  const bwMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BW", campaignId: CAMPAIGN_ID }));
  const buMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BU", campaignId: CAMPAIGN_ID }));
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: salesUrl });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const excerpts = [
    ...approvedCommercialExcerpts(reuse),
    ...reuse.approvedPackages.flatMap((item) => [item.unitPrice, item.currentTotal, item.comparedTotal ?? ""]).filter(Boolean),
  ];
  const safety = evaluateContentSafety({
    model,
    markup: bwMarkup,
    manifest: contentManifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: excerpts,
  });
  writeJson(path.join(EVIDENCE, "content-safety-results.json"), safety);
  const preflight = runTemplateQualityPreflight({ model, markup: bwMarkup, contractValid: integrity.valid });
  const multiproduct = labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: "54BW" }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  });
  writeJson(path.join(EVIDENCE, "preflight-results.json"), {
    ...preflight,
    contentSafetyGate: safety.gate,
    multiproductRegression: multiproduct ? "PASS" : "FAIL",
    paidCallsBlocked: paidBlocked,
  });

  await captureOffersSection("54BU", path.join(EVIDENCE, "desktop-offers-before.png"), { width: 1440, height: 900 });
  await captureOffersSection("54BU", path.join(EVIDENCE, "mobile-offers-before.png"), { width: 390, height: 844 });
  await captureOffersSection("54BW", path.join(EVIDENCE, "desktop-offers-after.png"), { width: 1440, height: 900 });
  await captureOffersSection("54BW", path.join(EVIDENCE, "mobile-offers-after.png"), { width: 390, height: 844 });

  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
    candidate: OFFER_CARDS_EXECUTION_ID,
  });

  restoreActiveBi();
  const live = readRendererCandidateSelection(CAMPAIGN_ID);
  const best = readBestCandidate(CAMPAIGN_ID);
  const gate = resolveGlobalPresellQualityGate({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    comparedToOfficialReference: false,
    evaluatorIndependentFromGenerator: false,
    visualScore: null,
    desktopVisualScore: best?.desktopVisualScore ?? 74,
    mobileVisualScore: best?.mobileVisualScore ?? 72,
    editorialScore: best?.editorialScore ?? 74,
    evaluatorStability: "STABLE",
    contentSafetyPass: safety.gate === "PASS",
    paidEvaluationAvailable: false,
  });

  writeJson(path.join(EVIDENCE, "regression-results.json"), {
    activeExecutionId: live.activeExecutionId,
    bestKnownPreserved: best?.desktopVisualScore === 74 && best.mobileVisualScore === 72 && best.editorialScore === 74,
    buDistinct: /data-presell-execution="54BU"/.test(buMarkup) && /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(buMarkup),
    bwDistinct: /data-presell-execution="54BW"/.test(bwMarkup) && /data-presell-composition="PREMIUM_OFFER_CARDS_V1"/.test(bwMarkup),
    officialV2Executed: false,
  });
  writeJson(path.join(EVIDENCE, "remaining-blockers.json"), {
    commercialNavigation: "BLOCKED",
    packageSpecificLinks: affiliateAudit.packageSpecificLinksAvailable ? "YES" : "NO",
    officialV2: "NOT_EXECUTED",
    qualityGate: gate.status,
    publication: "BLOCKED",
    ads: "NO",
  });
  writeFileSync(
    path.join(EVIDENCE, "visual-comparison.md"),
    `# 54BW vs 54BU offer section

- 54BU cards keep Try Two / Most Popular / Best Value kickers and have no package images or buy buttons.
- 54BW cards use factual quantity labels, illustrate the approved packshot, feature lowest unit price, and render blocked Buy N bottles controls.
- Other sections stay on the 54BU visual inheritance and were not rewritten.
- Capture ok: ${capture.ok}
- Overflow: ${Boolean(capture.inspect.desktop?.overflowX || capture.inspect.tablet?.overflowX || capture.inspect.mobile?.overflowX)}
- CTA enabled: ${Boolean(capture.inspect.desktop?.previewCtaEnabled)}
`,
  );
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BW

- Candidate: 54BW / ${PREMIUM_OFFER_CARDS_COMPOSITION_ID}
- Source: 54BU
- Best known: 54BI
- Preflight: ${preflight.status}
- Content safety: ${safety.gate}
- Buy buttons commercially enabled: ${navigationAllowed}
- Affiliate package-specific links: ${affiliateAudit.packageSpecificLinksAvailable}
- Spent: 0.00 / 0.00
- Preview: ${previewUrl("54BW")}
`,
  );
  console.log(
    JSON.stringify(
      {
        candidate: "54BW",
        safety: safety.gate,
        preflight: preflight.status,
        navigationAllowed,
        packageSpecific: affiliateAudit.packageSpecificLinksAvailable,
        captureOk: capture.ok,
        activeExecutionId: live.activeExecutionId,
        previewUrl: previewUrl("54BW"),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  try {
    restoreActiveBi();
  } catch {
    /* restore best-effort */
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
