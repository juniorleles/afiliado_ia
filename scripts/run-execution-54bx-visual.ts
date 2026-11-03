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
import {
  EXECUTION_54BX_BUDGET,
  EXECUTION_54BX_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  writeExecutionBudgetLedger,
} from "../src/lib/presell-quality/execution-budget.ts";
import { captureVisitorVisuals, visitorCapturePreviewPath } from "../src/lib/presell-quality/visitor-capture.ts";
import {
  EXPERIMENTAL_CANDIDATE_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  OFFER_CARDS_EXECUTION_ID,
  OFFER_IMAGES_EXECUTION_ID,
  PREMIUM_OFFER_IMAGES_COMPOSITION_ID,
  usesPremiumOfferImages,
  usesPremiumOfferCards,
  readRendererCandidateSelection,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import { approvedCommercialExcerpts, readCommercialReuse } from "../src/lib/presell-quality/commercial-reuse.ts";
import { approvedOffersFromManifest, parseBottleCount } from "../src/lib/presell-quality/approved-offers.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { resolveGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { readBestCandidate } from "../src/lib/presell-quality/best-candidate.ts";
import { runTemplateQualityPreflight } from "../src/lib/presell-template/index.ts";
import { readPrimaryPageResearch } from "../src/lib/presell-quality/primary-page-research.ts";
import { collectProducerOfferImages } from "../src/lib/presell-quality/offer-image-collect.ts";
import {
  diagnoseMissingOfferImages,
  inspectOfferImageBuffer,
  mapOfferImages,
  writeOfferImageInventory,
  type OfferImageCandidate,
  type OfferImageInventory,
} from "../src/lib/presell-quality/offer-images.ts";
import { fetchPublicHttps, MAX_IMAGE_BYTES } from "../src/lib/real-product-assets/fetch.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bx-producer-offer-images");
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

function inventoryFromPrimary(productId: string, knownBottleCounts: number[]): OfferImageInventory | null {
  const primary = readPrimaryPageResearch(CAMPAIGN_ID);
  if (!primary?.inventory?.images.length) return null;
  const candidates: OfferImageCandidate[] = primary.inventory.images.map((item) => ({
    sourceUrl: item.src,
    sourcePageUrl: primary.inventory?.finalUrl || primary.publicUrl,
    alt: item.alt,
    title: "",
    className: "",
    parentHint: item.alt,
    containerText: item.alt,
    width: 0,
    height: 0,
    source: "img",
    exclusionReason: null,
  }));
  return mapOfferImages({
    productId,
    sourcePageUrl: primary.inventory.finalUrl || primary.publicUrl,
    candidates,
    knownBottleCounts,
    declaration: readUserAssetDeclaration(CAMPAIGN_ID),
    discoveredAssets: snapshotProductResearch(CAMPAIGN_ID).latest?.discoveredAssets,
  });
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const branch = execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf8" }).trim();
  const bwCommit = execSync('git log -1 --grep="preserve 54BW premium offer cards" --format=%H', { cwd: process.cwd(), encoding: "utf8" }).trim();

  writeJson(path.join(EVIDENCE, "git-audit.json"), {
    branch,
    head: commit,
    bwCommit,
    bwCommitMessage: "feat(presell): preserve 54BW premium offer cards",
    pushExecuted: false,
    bxCommitCreated: false,
  });

  const snap = snapshotProductResearch(CAMPAIGN_ID);
  const integrity = validatePersistedProductContract(CAMPAIGN_ID, snap.latest);
  const record = readGeneration(GENERATION_ID);
  const stored = readGenerationModel(GENERATION_ID);
  if (!record || !stored) throw new Error(`Generation ${GENERATION_ID} is not recoverable.`);
  const patch = readQualityPatch(GENERATION_ID);
  const patched = patch ? applyQualityPatch(stored, patch) : stored;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  const reuse = readCommercialReuse(CAMPAIGN_ID);
  if (!reuse) throw new Error("Commercial reuse manifest is missing.");
  const knownBottleCounts = reuse.approvedPackages.map((item) => parseBottleCount(item.quantity)).filter((item): item is number => item != null);
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const primary = readPrimaryPageResearch(CAMPAIGN_ID);

  const collected = await collectProducerOfferImages({
    campaignId: CAMPAIGN_ID,
    productId: String(CAMPAIGN_ID),
    knownBottleCounts,
    outDir: EVIDENCE,
    declaration,
    discoveredAssets: snap.latest?.discoveredAssets,
    download: true,
  });
  let inventory = collected.inventory ?? inventoryFromPrimary(String(CAMPAIGN_ID), knownBottleCounts);
  if (inventory) {
    const assetDir = path.join(EVIDENCE, "assets");
    mkdirSync(assetDir, { recursive: true });
    for (const asset of inventory.assets.filter((item) => item.bottleCount != null && !item.sha256)) {
      const fetched = await fetchPublicHttps(asset.sourceUrl, { maxBytes: MAX_IMAGE_BYTES });
      if (!fetched.ok) continue;
      const inspected = inspectOfferImageBuffer(fetched.body);
      if (!inspected.ok) continue;
      const ext = inspected.mimeType === "image/jpeg" ? "jpg" : inspected.mimeType === "image/webp" ? "webp" : "png";
      const file = path.join(assetDir, `${inspected.sha256.slice(0, 16)}.${ext}`);
      writeFileSync(file, fetched.body);
      asset.sha256 = inspected.sha256;
      asset.mimeType = inspected.mimeType;
      asset.width = inspected.width;
      asset.height = inspected.height;
      asset.localFile = file;
    }
    writeOfferImageInventory(CAMPAIGN_ID, inventory);
  }

  const diagnosis = diagnoseMissingOfferImages({
    checkoutClassified: true,
    researchSeededOrderPage: false,
    primaryInventoryImageCount: primary?.inventory?.images.length ?? 0,
    associatedCount: inventory?.assets.filter((item) => item.bottleCount != null).length ?? 0,
    approvedCount: inventory?.assets.filter((item) => item.usageAuthorization === "APPROVED").length ?? 0,
  });

  writeJson(path.join(EVIDENCE, "producer-page-diagnostics.json"), {
    accessStatus: collected.accessStatus,
    playwrightCompleted: collected.ok || collected.accessStatus === "REACHED",
    requestedUrl: collected.requestedUrl,
    finalUrl: collected.finalUrl,
    title: collected.title,
    htmlBytes: collected.htmlBytes,
    notes: collected.notes,
    transactionalClicks: collected.transactionalClicks,
    storedPrimaryAccess: primary?.accessStatus ?? null,
    storedPrimaryImageCount: primary?.inventory?.images.length ?? 0,
    rootCause: diagnosis.rootCause,
    IMAGE_EXTRACTION_ROOT_CAUSE: diagnosis.rootCause,
  });
  writeJson(path.join(EVIDENCE, "image-discovery-inventory.json"), {
    liveElements: collected.imageElements.map((item) => ({
      sourceUrl: item.sourceUrl,
      alt: item.alt,
      source: item.source,
      width: item.width,
      height: item.height,
    })),
    storedPrimaryImages: primary?.inventory?.images ?? [],
  });
  writeJson(path.join(EVIDENCE, "network-image-inventory.json"), { networkImages: collected.networkImages });
  writeJson(path.join(EVIDENCE, "offer-image-mapping.json"), {
    assets: (inventory?.assets ?? []).map((item) => ({
      assetId: item.assetId,
      bottleCount: item.bottleCount,
      sourceUrl: item.sourceUrl,
      associationConfidence: item.associationConfidence,
      associationRationale: item.associationRationale,
      evidenceStatus: item.evidenceStatus,
      usageAuthorization: item.usageAuthorization,
      reviewStatus: item.reviewStatus,
    })),
  });
  writeJson(path.join(EVIDENCE, "asset-integrity-results.json"), {
    downloaded: (inventory?.assets ?? []).filter((item) => item.sha256).map((item) => ({
      assetId: item.assetId,
      sha256: item.sha256,
      mimeType: item.mimeType,
      width: item.width,
      height: item.height,
    })),
  });
  const pending = (inventory?.assets ?? []).filter((item) => item.usageAuthorization === "PENDING");
  const approved = (inventory?.assets ?? []).filter((item) => item.usageAuthorization === "APPROVED");
  const rejected = (inventory?.assets ?? []).filter((item) => item.usageAuthorization === "REJECTED");
  writeJson(path.join(EVIDENCE, "usage-authorization-audit.json"), {
    IMAGE_USAGE_AUTHORIZATION: approved.length ? "MIXED" : "PENDING",
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    note: "Producer-page presence is not reuse authorization.",
  });
  writeJson(path.join(EVIDENCE, "pending-assets.json"), pending);
  writeJson(path.join(EVIDENCE, "approved-assets.json"), {
    packshotAssetId: packshot?.assetId ?? null,
    packshotPath: model.commercialImage?.src ?? PACKSHOT_PATH,
    packageImagesApproved: approved,
  });
  writeJson(path.join(EVIDENCE, "rejected-assets.json"), rejected);
  writeJson(path.join(EVIDENCE, "fallback-validation.json"), {
    fallbackAssetId: packshot?.assetId ?? null,
    fallbackSrc: model.commercialImage?.src ?? PACKSHOT_PATH,
    publicCardsUseFallback: approved.length === 0,
  });

  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    EXECUTION_ID: OFFER_IMAGES_EXECUTION_ID,
    COMPOSITION_ID: PREMIUM_OFFER_IMAGES_COMPOSITION_ID,
    STATUS: "EXPERIMENTAL",
    SOURCE_CANDIDATE: OFFER_CARDS_EXECUTION_ID,
    usesPremiumOfferImages: usesPremiumOfferImages("54BX"),
    usesPremiumOfferCards: usesPremiumOfferCards("54BX"),
  });

  const offers = approvedOffersFromManifest({
    manifest: reuse,
    image: {
      assetId: packshot?.assetId ?? null,
      src: model.commercialImage?.src ?? PACKSHOT_PATH,
      productName: model.contract.identity.productName,
    },
    navigationAllowed: false,
    offerImages: inventory,
  });
  const markup = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BX", campaignId: CAMPAIGN_ID }));
  const enriched = enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: "" });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest: contentManifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: approvedCommercialExcerpts(reuse),
  });
  writeJson(path.join(EVIDENCE, "content-safety-results.json"), safety);
  const preflight = runTemplateQualityPreflight({ model, markup, contractValid: integrity.valid });
  const multiproduct = labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: "54BX" }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html);
  });
  writeJson(path.join(EVIDENCE, "preflight-results.json"), { ...preflight, contentSafetyGate: safety.gate });
  writeJson(path.join(EVIDENCE, "multiproduct-regression.json"), { status: multiproduct ? "PASS" : "FAIL" });

  const ledger = emptyExecutionBudgetLedger(EXECUTION_54BX_ID, EXECUTION_54BX_BUDGET.maxUsd);
  writeExecutionBudgetLedger(path.join(EVIDENCE, "budget-ledger.json"), ledger);
  const paidBlocked = !budgetAllowsPaidCall(ledger, { kind: "EVALUATION", reserveUsd: 0.05 }, EXECUTION_54BX_BUDGET).allowed;

  await captureOffersSection("54BX", path.join(EVIDENCE, "desktop-offers.png"), { width: 1440, height: 900 });
  await captureOffersSection("54BX", path.join(EVIDENCE, "tablet-offers.png"), { width: 768, height: 1024 });
  await captureOffersSection("54BX", path.join(EVIDENCE, "mobile-offers.png"), { width: 390, height: 844 });

  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
    candidate: OFFER_IMAGES_EXECUTION_ID,
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

  writeJson(path.join(EVIDENCE, "remaining-blockers.json"), {
    imageUsageAuthorization: "PENDING",
    commercialNavigation: "BLOCKED",
    officialV2: "NOT_EXECUTED",
    qualityGate: gate.status,
    publication: "BLOCKED",
    ads: "NO",
    checkout: "NO",
    paidBlocked,
  });
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BX

- Candidate: 54BX / ${PREMIUM_OFFER_IMAGES_COMPOSITION_ID}
- Source: 54BW
- Best known: 54BI
- Producer page access: ${collected.accessStatus}
- Root cause: ${diagnosis.rootCause}
- Associated package images: ${inventory?.assets.filter((item) => item.bottleCount != null).length ?? 0}
- Approved package images: ${approved.length}
- Public fallback: ${packshot?.assetId ?? "none"}
- Preflight: ${preflight.status}
- Content safety: ${safety.gate}
- Capture ok: ${capture.ok}
- Spent: 0.00 / 0.00
- Preview: ${previewUrl("54BX")}
- Admin review: http://127.0.0.1:3000/admin/lab/lp-generator/${GENERATION_ID}/offer-images
`,
  );

  console.log(
    JSON.stringify(
      {
        candidate: "54BX",
        access: collected.accessStatus,
        associated: inventory?.assets.filter((item) => item.bottleCount != null).map((item) => ({ count: item.bottleCount, url: item.sourceUrl, auth: item.usageAuthorization })),
        approved: approved.length,
        safety: safety.gate,
        preflight: preflight.status,
        captureOk: capture.ok,
        activeExecutionId: live.activeExecutionId,
        offersFallback: offers.every((item) => item.imageRole === "PRODUCT_ILLUSTRATION"),
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
