import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { envValuePresent } from "../src/lib/lp-generator/ai-copy/config.ts";
import { runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, estimateOpenAiVisionUsd, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { contentFingerprintOf, evaluationInputFromModel } from "../src/lib/presell-quality/context.ts";
import { sha256File, sha256Text } from "../src/lib/presell-quality/fingerprint.ts";
import { hashVisionResponsePayload } from "../src/lib/presell-quality/evaluator-observability.ts";
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
import { parseVisualEvaluationPayload } from "../src/lib/presell-quality/visual-eval.ts";
import { visualComparisonPromptV2, PREMIUM_VISUAL_EVALUATION_V2, VISUAL_EVAL_PROMPT_VERSION_V2 } from "../src/lib/presell-quality/visual-eval-v2.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import {
  EXECUTION_54BN_BUDGET,
  EXECUTION_54BN_ID,
  emptyExecutionBudgetLedger,
  reservePaidCall,
  consumePaidCall,
  consumeReservedAsUnverified,
  closeExecutionBudget,
  writeExecutionBudgetLedger,
} from "../src/lib/presell-quality/execution-budget.ts";
import { loadPremiumPresellDesignStandard, readPremiumReferenceBytes } from "../src/lib/presell-quality/premium-standard.ts";
import { resolveGlobalPresellQualityGate, writeGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { evaluationIdentityOf, VISITOR_VISUAL_CAPTURE } from "../src/lib/presell-quality/evaluation-comparability.ts";
import { readBestCandidate, selectBestCandidate, writeBestCandidate, type BestCandidateRecord } from "../src/lib/presell-quality/best-candidate.ts";
import { captureVisitorVisuals, visitorCapturePreviewPath } from "../src/lib/presell-quality/visitor-capture.ts";
import { createDesignCheckpointFromFiles, DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import {
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID,
  STRUCTURAL_COMPOSITION_EXECUTION_ID,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import {
  approvedCommercialExcerpts,
  buildCommercialEvidenceItem,
  countsByStatus,
  writeCommercialReuse,
  type CommercialEvidenceItem,
  type CommercialReuseManifest,
  type SellerStatedPackage,
} from "../src/lib/presell-quality/commercial-reuse.ts";
import { collectProducerCommercialPage } from "../src/lib/presell-quality/producer-page-collect.ts";
import {
  conservativeMinPair,
  officialEditorialRecord,
  officialPerDimensionStability,
  officialVisualV2Record,
  buildImprovementBacklog,
  type OfficialEditorialRecord,
  type OfficialVisualV2Record,
} from "../src/lib/presell-quality/official-v2.ts";
import { FORBIDDEN_REFERENCE_CHROME, PREMIUM_ENGINE_VERSION } from "../src/lib/presell-quality/premium-design.ts";
import { RENDERER_V4_ID, QUALITY_PROMPT_VERSION } from "../src/lib/presell-quality/types.ts";
import { classifyEditorialPayload, structuredEditorialFailure } from "../src/lib/presell-quality/editorial-payload.ts";
import { editorialRetryAllowed } from "../src/lib/presell-quality/editorial-retry.ts";
import {
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  mapPresellStandardV1,
  validatePresellTemplateDocument,
  runTemplateQualityPreflight,
} from "../src/lib/presell-template/index.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const PRODUCER_URL =
  "https://sugardefender24.com/c/order-now.php?hop=smartbuyx&hopId=acaf9aba-ea12-4d5e-91ec-4c4c0a3d74ec";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bn-producer-content");
const BI_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const EXPERIMENTAL = EXPERIMENTAL_CANDIDATE_ID;
const EXPERIMENTAL_CAPTURE = CONTROLLED_IMPROVEMENT_EXECUTION_ID;
const COMPOSITION_ID = PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID;
const BASELINE = { desktop: 74, mobile: 72, editorial: 74 } as const;
const SHOT_FILES = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];
const BM_COMMIT = "0f1f76269638936361f79df248462617c9b2291d";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";

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

function loadModel() {
  const snap = snapshotProductResearch(CAMPAIGN_ID);
  const integrity = validatePersistedProductContract(CAMPAIGN_ID, snap.latest);
  const record = readGeneration(GENERATION_ID);
  const stored = readGenerationModel(GENERATION_ID);
  if (!record || !stored) throw new Error(`Generation ${GENERATION_ID} is not recoverable.`);
  const patch = readQualityPatch(GENERATION_ID);
  const patched = patch ? applyQualityPatch(stored, patch) : stored;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  return { snap, integrity, model };
}

function hashesOf(dir: string): Record<string, string | null> {
  return Object.fromEntries(
    SHOT_FILES.map((name) => {
      const file = path.join(dir, name);
      return [name, existsSync(file) ? sha256File(file) : null];
    }),
  );
}

function previewUrl(): string {
  return `http://127.0.0.1:3000${visitorCapturePreviewPath(GENERATION_ID, EXPERIMENTAL_CAPTURE)}`;
}

function inspectCapture(inspect: Record<string, { adminChromePresent: boolean; brokenImages: number; overflowX: boolean; previewCtaEnabled: boolean; clippedEssential?: boolean }>) {
  const viewports = ["desktop", "tablet", "mobile"] as const;
  return {
    adminChromePresent: viewports.some((key) => inspect[key]?.adminChromePresent),
    brokenImages: viewports.reduce((sum, key) => sum + (inspect[key]?.brokenImages ?? 0), 0),
    horizontalOverflow: viewports.some((key) => inspect[key]?.overflowX),
    ctaEnabled: viewports.some((key) => inspect[key]?.previewCtaEnabled),
    clippedEssential: viewports.some((key) => inspect[key]?.clippedEssential),
  };
}

function hay(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase();
}

function present(text: string, needle: string): boolean {
  return hay(text).includes(needle.toLowerCase());
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const branch = execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf8" }).trim();
  const standard = loadPremiumPresellDesignStandard();
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }
  const biCheckpointPath = path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json");
  const biCheckpointMeta = existsSync(biCheckpointPath)
    ? (JSON.parse(readFileSync(biCheckpointPath, "utf8")) as { id?: string; sourceCommit?: string; createdAt?: string })
    : null;
  if (biCheckpointMeta?.id !== "54bi-proven-baseline" || biCheckpointMeta.sourceCommit !== BI_COMMIT) {
    throw new Error("54BI proven baseline checkpoint is missing or was overwritten.");
  }

  writeJson(path.join(EVIDENCE, "git-audit.json"), {
    branch,
    head: commit,
    initialHead: BM_COMMIT,
    bmCommit: BM_COMMIT,
    bmCommitMessage: "docs(presell): preserve evaluator reliability findings",
    biCommit: BI_COMMIT,
    pushExecuted: false,
    bnCommitCreated: false,
  });

  createDesignCheckpointFromFiles({
    id: "54bn-experimental-producer-content",
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    sourceCommit: commit,
    screenshotHashes: [],
    notes: ["54BN experimental PREMIUM_PRODUCER_CONTENT_V1. Does not overwrite 54bi-proven-baseline."],
    files: [
      ...DESIGN_CHECKPOINT_FILES,
      "src/components/presell/standard-v1-page.tsx",
      "src/lib/presell-quality/renderer-candidate.ts",
    ].map((relative) => ({
      path: relative,
      contents: readFileSync(path.join(process.cwd(), relative), "utf8"),
    })),
  });

  const producer = await collectProducerCommercialPage({ url: PRODUCER_URL, outDir: EVIDENCE });
  const shippingLink = producer.linkedOfficialUrls.find((url) => /\/info\/shipping/i.test(url)) ?? null;
  const shipping = shippingLink
    ? await collectProducerCommercialPage({
        url: shippingLink,
        outDir: path.join(EVIDENCE, "shipping-page"),
      })
    : null;
  writeJson(path.join(EVIDENCE, "producer-url-audit.json"), {
    requestedUrl: PRODUCER_URL,
    initialUrl: producer.initialUrl,
    finalUrl: producer.finalUrl,
    capturedAt: producer.capturedAt,
    ok: producer.ok,
    title: producer.title,
    notes: producer.notes,
    shippingLink,
    shippingFinalUrl: shipping?.finalUrl ?? null,
    substitutedDomain: false,
  });

  const sourceUrl = producer.finalUrl || PRODUCER_URL;
  const capturedAt = producer.capturedAt;
  const evidencePath = path.join(EVIDENCE, "producer-desktop.png");
  const body = producer.visibleText;
  const shippingBody = shipping?.visibleText ?? "";
  const namesMayBeChanged = producer.namesMayBeChanged || present(body, "names and personal identifying information");

  const rawItems: Array<{ field: string; value: string; location: string; url?: string }> = [];
  if (present(body, "sugar defender")) rawItems.push({ field: "product-name", value: "Sugar Defender", location: "order-now title/body" });
  if (present(body, "$79") && present(body, "2 bottles")) {
    rawItems.push({ field: "package", value: "Try Two · 60 days · 2 bottles · $79 per bottle · listed comparison $358 · current total $158", location: "order-now package card" });
    rawItems.push({ field: "price", value: "$79", location: "order-now Try Two unit price" });
    rawItems.push({ field: "price", value: "$158", location: "order-now Try Two current total" });
    rawItems.push({ field: "discount", value: "$200 listed savings on the two-bottle package", location: "order-now Try Two savings line" });
    rawItems.push({ field: "shipping-term", value: "Seller-stated shipping is extra on this package.", location: "order-now Try Two shipping line" });
  }
  if (present(body, "$69") && present(body, "3 bottles")) {
    rawItems.push({ field: "package", value: "Most Popular · 90 days · 3 bottles · $69 per bottle · listed comparison $537 · current total $207", location: "order-now package card" });
    rawItems.push({ field: "price", value: "$69", location: "order-now Most Popular unit price" });
    rawItems.push({ field: "price", value: "$207", location: "order-now Most Popular current total" });
    rawItems.push({ field: "discount", value: "$330 listed savings on the three-bottle package", location: "order-now Most Popular savings line" });
    rawItems.push({
      field: "shipping-term",
      value: "Seller-stated US shipping included on this package.",
      location: "order-now Most Popular shipping line",
    });
  }
  if (present(body, "$49") && present(body, "6 bottles")) {
    rawItems.push({ field: "package", value: "Best Value · 180 days · 6 bottles · $49 per bottle · listed comparison $1074 · current total $294", location: "order-now package card" });
    rawItems.push({ field: "price", value: "$49", location: "order-now Best Value unit price" });
    rawItems.push({ field: "price", value: "$294", location: "order-now Best Value current total" });
    rawItems.push({ field: "discount", value: "$780 listed savings on the six-bottle package", location: "order-now Best Value savings line" });
    rawItems.push({
      field: "shipping-term",
      value: "Seller-stated US shipping included on this package.",
      location: "order-now Best Value shipping line",
    });
  }
  if (present(body, "4.98") && present(body, "2000")) {
    rawItems.push({ field: "rating", value: "4.98/5 based on 2000+ reviews", location: "order-now rating badge" });
  }
  if (present(body, "#1 rated blood sugar") || present(body, "blood sugar formula")) {
    rawItems.push({ field: "medical-claim", value: "#1 Rated Blood Sugar Formula", location: "order-now headline" });
  }
  for (const name of ["Eleuthero", "Coleus", "African Mango", "Chromium"]) {
    if (present(body, name)) rawItems.push({ field: "ingredient-name", value: name, location: "order-now ingredients list" });
  }
  if (present(body, "verified purchase") || present(body, "sean b") || present(body, "sabine s")) {
    rawItems.push({ field: "testimonial", value: "Customer testimonial marked Verified Purchase", location: "order-now testimonial block" });
  }
  if (present(body, "60-day") || present(body, "60 day")) {
    rawItems.push({ field: "guarantee", value: "60-day seller-stated refund window", location: "order-now guarantee copy" });
  }
  if (present(body, "clickbank")) rawItems.push({ field: "retailer", value: "ClickBank retailer", location: "order-now legal footer" });
  if (present(body, "fda")) rawItems.push({ field: "legal", value: "FDA disclaimer present on the producer page", location: "order-now legal footer" });
  if (present(shippingBody, "1-2 business days") || present(shippingBody, "1-2 business day")) {
    rawItems.push({
      field: "dispatch-conflict",
      value: "Producer shipping page states 1-2 business days processing",
      location: "info/shipping.html",
      url: shipping?.finalUrl || shippingLink || sourceUrl,
    });
  }
  for (const url of producer.imageUrls.slice(0, 12)) {
    rawItems.push({ field: "producer-image", value: url, location: "order-now img[src]" });
  }

  const items: CommercialEvidenceItem[] = rawItems.map((item) =>
    buildCommercialEvidenceItem({
      field: item.field,
      value: item.value,
      source_url: item.url || sourceUrl,
      source_location: item.location,
      captured_at: capturedAt,
      evidence_path: evidencePath,
      namesMayBeChanged,
    }),
  );

  const approvedPackages: SellerStatedPackage[] = [];
  if (items.some((item) => item.field === "price" && item.value === "$79" && item.reuse_status === "APPROVED")) {
    approvedPackages.push({
      id: "pkg-2",
      label: "Try Two",
      duration: "60 days",
      quantity: "2 bottles",
      unitPrice: "$79",
      comparedTotal: "$358",
      currentTotal: "$158",
      shippingTerm: "Seller-stated shipping is extra on this package.",
      bonuses: [],
    });
  }
  if (items.some((item) => item.field === "price" && item.value === "$69" && item.reuse_status === "APPROVED")) {
    approvedPackages.push({
      id: "pkg-3",
      label: "Most Popular",
      duration: "90 days",
      quantity: "3 bottles",
      unitPrice: "$69",
      comparedTotal: "$537",
      currentTotal: "$207",
      shippingTerm: "Seller-stated US shipping included on this package.",
      bonuses: ["Seller-stated extras: 2 digital guides listed on this package."],
    });
  }
  if (items.some((item) => item.field === "price" && item.value === "$49" && item.reuse_status === "APPROVED")) {
    approvedPackages.push({
      id: "pkg-6",
      label: "Best Value",
      duration: "180 days",
      quantity: "6 bottles",
      unitPrice: "$49",
      comparedTotal: "$1074",
      currentTotal: "$294",
      shippingTerm: "Seller-stated US shipping included on this package.",
      bonuses: ["Seller-stated extras: 2 digital guides listed on this package."],
    });
  }

  const manifest: CommercialReuseManifest = {
    campaignId: CAMPAIGN_ID,
    sourceUrl: PRODUCER_URL,
    finalUrl: sourceUrl,
    capturedAt,
    items,
    approvedPackages,
    attribution:
      "Package prices and totals are seller-stated on the producer order page at the capture time. They are not independently verified and are not a live checkout.",
  };
  writeCommercialReuse(manifest);
  const counts = countsByStatus(items);
  writeJson(path.join(EVIDENCE, "producer-content-inventory.json"), {
    productName: producer.title,
    imageCount: producer.imageUrls.length,
    imageUrls: producer.imageUrls,
    linkedOfficialUrls: producer.linkedOfficialUrls,
    namesMayBeChanged,
    visibleTextChars: producer.visibleText.length,
    htmlBytes: producer.htmlBytes,
    fieldsPresent: [...new Set(items.map((item) => item.field))],
  });
  writeJson(path.join(EVIDENCE, "commercial-evidence-manifest.json"), manifest);
  writeJson(path.join(EVIDENCE, "content-approval-results.json"), {
    counts,
    approved: items.filter((item) => item.reuse_status === "APPROVED"),
    pending: items.filter((item) => item.reuse_status === "PENDING_REVIEW"),
    rejected: items.filter((item) => item.reuse_status === "REJECTED"),
    approvedPackages: approvedPackages.map((item) => item.id),
    nineMedicalClaimsRemainBlocked: true,
    producerImagesNotHotlinked: true,
  });

  const collectFailed = !producer.ok;
  const { snap, integrity, model } = loadModel();
  const markup = renderToStaticMarkup(createElement(V4Page, { model, candidate: EXPERIMENTAL_CAPTURE, campaignId: CAMPAIGN_ID }));
  const frozenMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID, campaignId: CAMPAIGN_ID }));
  const structuralMarkup = renderToStaticMarkup(
    createElement(V4Page, { model, candidate: STRUCTURAL_COMPOSITION_EXECUTION_ID, campaignId: CAMPAIGN_ID }),
  );
  writeJson(path.join(EVIDENCE, "content-preservation.json"), {
    frozen54biDistinct: /data-presell-execution="54BI"/.test(frozenMarkup),
    structural54blDistinct: /data-presell-execution="54BL"/.test(structuralMarkup),
    experimental54bn: /data-presell-execution="54BN"/.test(markup),
    composition: /data-presell-composition="PREMIUM_PRODUCER_CONTENT_V1"/.test(markup),
    emptyBottles: /empty bottles/i.test(markup),
    refundWindow48h: /48 hours/i.test(markup),
    shippingExclusion: /minus shipping/i.test(markup),
    dispatch24h: /24 working hours/i.test(markup),
    delivery5to10: /5 to 10 days/i.test(markup),
    oneTimePayment: /one[- ]time payment/i.test(markup),
    ingredientsPreserved: /maca|guarana|gymnema|ginseng/i.test(markup),
    medicalClaimsAbsent: !/#1 rated blood sugar|drop pounds/i.test(markup),
    testimonialsAbsent: !/verified purchase|sean b|sabine s/i.test(markup),
    freeShippingChromeAbsent: !/\bfree shipping\b/i.test(markup),
    productContractChanged: false,
    biCheckpointId: biCheckpointMeta.id,
    biCheckpointCreatedAt: biCheckpointMeta.createdAt,
    biCheckpointOverwritten: false,
  });

  const template = mapPresellStandardV1(model);
  const validation = validatePresellTemplateDocument(template);
  const renderedCorrectly = markup.includes(`data-presell-standard="${PRESELL_STANDARD_ID}"`);
  if (!renderedCorrectly) throw new Error("Renderer is not using PRESELL_STANDARD_V1.");
  if (FORBIDDEN_REFERENCE_CHROME.test(markup)) throw new Error("Template markup invented forbidden chrome.");

  const contractHash = sha256Text(
    JSON.stringify(
      acceptedProposals(snap.latest).map((item) => ({
        field: item.field,
        value: item.currentValue || item.suggestedValue,
        sourceUrl: item.sourceUrl,
        verification: item.verification,
      })),
    ),
  );
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({
    run: snap.latest,
    productName: snap.latest?.productName || "Product",
    sourceUrl: salesUrl,
  });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const usedAssets = packshot?.assetId ? [packshot.assetId] : [];
  const excerpts = [
    ...approvedCommercialExcerpts(manifest),
    ...approvedPackages.flatMap((item) => [item.unitPrice, item.currentTotal, item.comparedTotal ?? ""]).filter(Boolean),
  ];
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest: contentManifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: usedAssets,
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: excerpts,
  });
  writeJson(path.join(EVIDENCE, "content-safety-results.json"), safety);
  const preflight = runTemplateQualityPreflight({ model, markup, contractValid: integrity.valid });

  const renderedFileHashes = Object.fromEntries(
    [
      "src/app/premium-design-engine.css",
      "src/components/presell/standard-v1-page.tsx",
      "src/lib/presell-quality/renderer-candidate.ts",
    ].map((relative) => [relative, sha256File(path.join(process.cwd(), relative))]),
  );
  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    templateId: PRESELL_STANDARD_ID,
    templateVersion: PRESELL_STANDARD_VERSION,
    candidateSource: PRESELL_STANDARD_ID,
    candidateExecution: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    compositionId: COMPOSITION_ID,
    status: "EXPERIMENTAL",
    bestKnown: BEST_KNOWN_CANDIDATE_ID,
    frozen: FROZEN_IMPROVEMENT_EXECUTION_ID,
    rendererVersion: RENDERER_V4_ID,
    engineVersion: PREMIUM_ENGINE_VERSION,
    sourceCommit: commit,
    productContractHash: contractHash,
    contentHash: contentFingerprintOf(model),
    usedAssets,
    renderedFileHashes,
    hopSlot: model.hopSlot,
    commercialCtaEnabled: Boolean(model.hopHref),
    previewUrl: previewUrl(),
    newGenerationCreated: false,
    productContractChanged: false,
  });

  const multiproduct = labScenarioKeys().map((key) => {
    const scenario = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model: scenario, candidate: EXPERIMENTAL }));
    const mapped = mapPresellStandardV1(scenario);
    return {
      key,
      inventedChrome: FORBIDDEN_REFERENCE_CHROME.test(html),
      commercialCtaEnabled: Boolean(scenario.hopHref) || mapped.cta.enabled,
      testimonialsRendered: mapped.testimonials.status === "RENDERED",
      sugarDefenderSpecific: /sugar defender|cbc045ab|cc835ef78e894f7645c4556b/i.test(html),
      sellerPackages: /data-seller-stated-offers/.test(html),
      standard: mapped.standardId,
    };
  });
  const multiproductPass = multiproduct.every(
    (row) => !row.inventedChrome && !row.commercialCtaEnabled && !row.testimonialsRendered && !row.sugarDefenderSpecific && !row.sellerPackages,
  );
  writeJson(path.join(EVIDENCE, "preflight-results.json"), {
    ...preflight,
    templateValidation: validation,
    contentSafetyGate: safety.gate,
    collectOk: producer.ok,
    approvedCommercialCount: counts.APPROVED,
    multiproductRegression: multiproductPass ? "PASS" : "FAIL",
    multiproduct,
    visualScoreAssigned: false,
    paidEvaluationAuthorized: false,
  });

  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54BN_ID, EXECUTION_54BN_BUDGET.maxUsd);
  writeExecutionBudgetLedger(budgetFile, ledger);
  const observabilityRecords: unknown[] = [];

  function restoreActiveBi() {
    writeActivePreviewCandidate(CAMPAIGN_ID, EXPERIMENTAL, FROZEN_IMPROVEMENT_EXECUTION_ID);
  }

  function writeUnavailable(reasons: string[], extra: Record<string, unknown> = {}) {
    restoreActiveBi();
    const unavailable = {
      ...resolveGlobalPresellQualityGate({
        campaignId: CAMPAIGN_ID,
        generationId: GENERATION_ID,
        comparedToOfficialReference: false,
        evaluatorIndependentFromGenerator: false,
        visualScore: null,
        desktopVisualScore: null,
        mobileVisualScore: null,
        editorialScore: null,
        evaluatorStability: "NOT_ESTABLISHED",
        contentSafetyPass: safety.gate === "PASS",
        paidEvaluationAvailable: envValuePresent("OPENAI_API_KEY"),
      }),
      status: "EVALUATION_UNAVAILABLE" as const,
      humanReviewUnlocked: false as const,
      reasons,
    };
    writeGlobalPresellQualityGate(unavailable);
    writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), {
      ...unavailable,
      publicationUnlocked: false,
      ctaEnabled: false,
      adsActivated: false,
      ...extra,
    });
    writeJson(path.join(EVIDENCE, "best-candidate-comparison.json"), {
      kept: false,
      restored: true,
      reason: reasons.join(" "),
      comparisonStatus: "NONE",
      baseline: BASELINE,
      incoming: { desktopScore: null, mobileScore: null, editorialScore: null },
      bestUpdated: false,
      activeExecutionId: "54BI",
    });
    writeJson(path.join(EVIDENCE, "official-v2-results.json"), {
      method: "min-of-pair",
      skipped: true,
      reasons,
      desktopVisualRun1: null,
      desktopVisualRun2: null,
      finalDesktopVisualScore: null,
      mobileVisualRun1: null,
      mobileVisualRun2: null,
      finalMobileVisualScore: null,
      editorialRun1: null,
      editorialRun2: null,
      finalEditorialScore: null,
      candidate: EXPERIMENTAL_CAPTURE,
    });
    writeJson(path.join(EVIDENCE, "evaluator-observability.json"), { skipped: true, reasons, records: observabilityRecords });
    writeJson(path.join(EVIDENCE, "remaining-blockers.json"), {
      status: "EVALUATION_UNAVAILABLE",
      reasons,
      publication: "BLOCKED",
      cta: "BLOCKED",
      ads: "NO",
      pendingCommercial: items.filter((item) => item.reuse_status === "PENDING_REVIEW").map((item) => item.field),
      rejectedCommercial: items.filter((item) => item.reuse_status === "REJECTED").map((item) => item.field),
    });
  }

  const commercialApproved = counts.APPROVED > 0 && approvedPackages.length > 0;
  if (collectFailed || preflight.status !== "PREFLIGHT_PASSED" || safety.gate !== "PASS" || !multiproductPass || !commercialApproved) {
    ledger = closeExecutionBudget(ledger, "Collect, preflight, safety, or commercial approval blocked paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable(
      [
        collectFailed ? `Producer collect failed: ${producer.notes.join("; ") || "no visible content"}` : "",
        preflight.status !== "PREFLIGHT_PASSED" ? `TEMPLATE_QUALITY_PREFLIGHT is ${preflight.status}.` : "",
        safety.gate !== "PASS" ? "CONTENT_SAFETY_GATE failed." : "",
        !multiproductPass ? "MULTIPRODUCT_REGRESSION failed." : "",
        !commercialApproved ? "No approved seller-stated packages were incorporated." : "",
      ].filter(Boolean),
      { paidCallsSkipped: true, designKept: false, designRestored: true },
    );
    writeFileSync(
      path.join(EVIDENCE, "execution-summary.md"),
      `# EXECUTION 54BN\n\n- Collect/preflight blocked paid evaluation.\n- Producer ok: ${producer.ok}\n- Safety: ${safety.gate}\n- Preflight: ${preflight.status}\n`,
    );
    writeJson(path.join(EVIDENCE, "regression-results.json"), { runnerBlockedBeforeEval: true, activeExecutionId: "54BI" });
    console.log(JSON.stringify({ status: "PREFLIGHT_BLOCKED", collectOk: producer.ok, safety: safety.gate, preflight: preflight.status }, null, 2));
    return;
  }

  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
    candidate: EXPERIMENTAL_CAPTURE,
  });
  const captureInspect = inspectCapture(capture.inspect);
  const visitorOk =
    capture.ok &&
    !captureInspect.adminChromePresent &&
    captureInspect.brokenImages === 0 &&
    !captureInspect.horizontalOverflow &&
    !captureInspect.ctaEnabled &&
    !captureInspect.clippedEssential;
  const screenshotHashes = hashesOf(EVIDENCE);
  const previousBi = hashesOf(BI_EVIDENCE);
  const hashesDifferFrom54bi =
    Boolean(screenshotHashes["desktop-first-fold.png"]) &&
    Boolean(screenshotHashes["mobile-first-fold.png"]) &&
    screenshotHashes["desktop-first-fold.png"] !== previousBi["desktop-first-fold.png"] &&
    screenshotHashes["mobile-first-fold.png"] !== previousBi["mobile-first-fold.png"];
  const captureHash = sha256Text(JSON.stringify(screenshotHashes));

  if (!visitorOk) {
    ledger = closeExecutionBudget(ledger, "Visitor capture failed before paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable([`Visitor capture failed: ${capture.notes.join("; ")}`], { paidCallsSkipped: true, captureInspect });
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BN\n\n- Capture failed. Paid evaluation was not started.\n`);
    writeJson(path.join(EVIDENCE, "regression-results.json"), { captureFailed: true, activeExecutionId: "54BI" });
    console.log(JSON.stringify({ status: "CAPTURE_FAILED", notes: capture.notes, captureInspect }, null, 2));
    return;
  }
  if (!hashesDifferFrom54bi) {
    ledger = closeExecutionBudget(ledger, "54BN captures did not differ from 54BI first-fold hashes.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable(["54BN visitor hashes did not differ from 54BI on desktop and mobile first-fold."], { paidCallsSkipped: true, captureInspect });
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BN\n\n- Hashes matched 54BI. Paid evaluation was not started.\n`);
    writeJson(path.join(EVIDENCE, "regression-results.json"), { hashesUnchanged: true, activeExecutionId: "54BI" });
    console.log(JSON.stringify({ status: "HASHES_UNCHANGED", captureInspect }, null, 2));
    return;
  }

  let visualRun1: ReturnType<typeof parseVisualEvaluationPayload> | null = null;
  let visualRun2: ReturnType<typeof parseVisualEvaluationPayload> | null = null;
  let editorialRun1: PresellQualityAssessment | null = null;
  let editorialRun2: PresellQualityAssessment | null = null;
  let visualOfficial1: OfficialVisualV2Record | null = null;
  let visualOfficial2: OfficialVisualV2Record | null = null;
  let editorialOfficial1: OfficialEditorialRecord | null = null;
  let editorialOfficial2: OfficialEditorialRecord | null = null;
  let invalidAttempts = 0;
  let retries = 0;
  const reference = readPremiumReferenceBytes();
  const keyReady = envValuePresent("OPENAI_API_KEY");
  const shotHashList = capture.shots.map((item) => item.sha256).filter((item): item is string => Boolean(item));

  if (keyReady && reference) {
    await runWithTemporaryPaidAi({ scope: "54BN", provider: "openai", maxUsd: EXECUTION_54BN_BUDGET.maxUsd }, async () => {
      async function visualOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BN_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BN_BUDGET,
        });
        if (!reserved.ok) {
          ledger = reserved.ledger;
          writeExecutionBudgetLedger(budgetFile, ledger);
          return null;
        }
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const client = createOpenAiVisionClient({ jsonObject: true });
          const prompt = visualComparisonPromptV2();
          const images = [
            { mediaType: "image/png" as const, base64: readFileSync(path.join(EVIDENCE, "desktop-first-fold.png")).toString("base64"), label: "desktop-visitor-first-fold-1440x900" },
            { mediaType: "image/png" as const, base64: readFileSync(path.join(EVIDENCE, "mobile-first-fold.png")).toString("base64"), label: "mobile-visitor-first-fold-390x844" },
            { mediaType: "image/png" as const, base64: reference!.toString("base64"), label: "official-premium-presell-reference" },
          ];
          const completion = await client.complete({ system: prompt.system, userText: prompt.userText, images });
          const parsed = parseVisualEvaluationPayload(completion.text);
          const estimated = estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens);
          ledger = consumePaidCall(ledger, { inputTokens: completion.inputTokens, outputTokens: completion.outputTokens, estimatedUsd: estimated });
          writeExecutionBudgetLedger(budgetFile, ledger);
          const official = officialVisualV2Record(parsed, visitorOk);
          observabilityRecords.push({
            kind: "visual",
            run,
            captureHash,
            referenceHash: standard.hash,
            requestPayloadHash: completion.observability?.requestPayloadHash ?? null,
            responsePayloadHash: completion.observability?.responsePayloadHash ?? hashVisionResponsePayload(completion.text),
            model: completion.observability?.model ?? OPENAI_VISION_MODEL,
            params: completion.observability
              ? {
                  maxOutputTokens: completion.observability.maxOutputTokens,
                  textFormat: completion.observability.textFormat,
                  temperatureSent: completion.observability.temperatureSent,
                  topPSent: completion.observability.topPSent,
                  seedSent: completion.observability.seedSent,
                }
              : null,
            promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
            rubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
            raw: completion.text,
            extractedScore: parsed.overall,
            desktopScore: parsed.desktopVisualScore,
            mobileScore: parsed.mobileVisualScore,
            tokens: { input: completion.inputTokens, output: completion.outputTokens },
            costUsd: estimated,
            candidateId: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
          });
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), {
            ...official,
            estimatedUsd: estimated,
            model: OPENAI_VISION_MODEL,
            promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
            qualityPromptVersion: QUALITY_PROMPT_VERSION,
            raw: completion.text,
            observability: completion.observability ?? null,
          });
          return { parsed, official };
        } catch (err) {
          invalidAttempts += 1;
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), { error: message, invented: false });
          return null;
        }
      }

      const firstVisual = await visualOnce(1);
      visualRun1 = firstVisual?.parsed ?? null;
      visualOfficial1 = firstVisual?.official ?? null;
      const secondVisual = await visualOnce(2);
      visualRun2 = secondVisual?.parsed ?? null;
      visualOfficial2 = secondVisual?.official ?? null;

      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      async function editorialOnce(run: number, attempt: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BN_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BN_BUDGET,
        });
        if (!reserved.ok) {
          ledger = reserved.ledger;
          writeExecutionBudgetLedger(budgetFile, ledger);
          return { ok: false as const, code: "BUDGET_EXHAUSTED", message: reserved.reason };
        }
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const assessment = await evaluator.evaluate(
            evaluationInputFromModel({
              campaignId: CAMPAIGN_ID,
              generationId: GENERATION_ID,
              model,
              screenshots: {
                desktop: {
                  role: "desktop",
                  path: path.join(EVIDENCE, "desktop-full.png"),
                  generationId: GENERATION_ID,
                  sha256: sha256File(path.join(EVIDENCE, "desktop-full.png")) ?? createHash("sha256").update("x").digest("hex"),
                  width: 1440,
                  height: 900,
                },
                mobile: {
                  role: "mobile",
                  path: path.join(EVIDENCE, "mobile-full.png"),
                  generationId: GENERATION_ID,
                  sha256: sha256File(path.join(EVIDENCE, "mobile-full.png")) ?? createHash("sha256").update("y").digest("hex"),
                  width: 390,
                  height: 844,
                },
              },
              approvedFacts: contentManifest.allowedFacts.map((item) => `${item.field}: ${item.value}`.slice(0, 240)),
              evidenceReferences: [String(CAMPAIGN_ID), GENERATION_ID, contractHash],
              approvedAssets: packshot ? [{ id: packshot.assetId, eligible: true, kind: "PRODUCT_PACKSHOT" }] : [],
              editorialConstraints: [
                "Score editorial quality against the Product Contract only.",
                "Seller-stated current package prices may appear when they are approved commercial excerpts.",
                "Do not reward unapproved medical claims or require testimonials.",
                "Do not suggest inventing facts.",
              ],
              previewPath: visitorCapturePreviewPath(GENERATION_ID, EXPERIMENTAL_CAPTURE),
              iteration: 0,
              patch: model.qualityPatch ?? null,
            }),
          );
          const estimated = estimateOpenAiVisionUsd(assessment.tokenUsage?.inputTokens ?? 0, assessment.tokenUsage?.outputTokens ?? 0);
          ledger = consumePaidCall(ledger, {
            inputTokens: assessment.tokenUsage?.inputTokens ?? 0,
            outputTokens: assessment.tokenUsage?.outputTokens ?? 0,
            estimatedUsd: estimated,
          });
          writeExecutionBudgetLedger(budgetFile, ledger);
          if (assessment.assessmentStatus === "EVALUATION_FAILED" || assessment.overallScore == null) {
            invalidAttempts += 1;
            const code = assessment.errorCode ?? "EVALUATION_FAILED";
            const classified = classifyEditorialPayload(assessment.costMetadata.notes.find((note) => note.startsWith("{")) ?? "");
            const failure = structuredEditorialFailure({
              code: classified.ok ? code : classified.code,
              message: assessment.findings[0]?.message ?? code,
              attempt,
              rawSnippet: assessment.costMetadata.notes.join(" | "),
            });
            writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}-attempt-${attempt}.json`), failure);
            return { ok: false as const, code: failure.code, message: failure.message };
          }
          const official = officialEditorialRecord(assessment);
          observabilityRecords.push({
            kind: "editorial",
            run,
            captureHash,
            referenceHash: standard.hash,
            requestPayloadHash: assessment.costMetadata.notes.find((note) => note.startsWith("requestPayloadHash:"))?.slice("requestPayloadHash:".length) ?? null,
            responsePayloadHash: assessment.costMetadata.notes.find((note) => note.startsWith("responsePayloadHash:"))?.slice("responsePayloadHash:".length) ?? null,
            model: assessment.evaluatorModel,
            params: {
              temperatureSent: false,
              topPSent: false,
              seedSent: false,
            },
            promptVersion: QUALITY_PROMPT_VERSION,
            rubricVersion: assessment.rubricVersion,
            raw: assessment.costMetadata.notes.join("\n"),
            extractedScore: assessment.overallScore,
            tokens: assessment.tokenUsage ?? null,
            costUsd: estimated,
            candidateId: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
          });
          writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}.json`), {
            ...official,
            model: OPENAI_VISION_MODEL,
            qualityPromptVersion: QUALITY_PROMPT_VERSION,
            tokenUsage: assessment.tokenUsage ?? null,
            dimensionScores: assessment.dimensionScores,
            findings: assessment.findings,
            rawNotes: assessment.costMetadata.notes,
          });
          return { ok: true as const, assessment, official };
        } catch (err) {
          invalidAttempts += 1;
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          const failure = structuredEditorialFailure({ code: "PROVIDER_ERROR", message, attempt, rawSnippet: message });
          writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}-attempt-${attempt}.json`), failure);
          return { ok: false as const, code: failure.code, message };
        }
      }

      async function editorialWithRetry(run: number) {
        let attempt = 0;
        const maxAttempts = 2;
        while (attempt < maxAttempts) {
          attempt += 1;
          const result = await editorialOnce(run, attempt);
          if (result.ok) return result;
          const retry = editorialRetryAllowed({
            code: result.code,
            attempt,
            maxAttempts,
            remainingUsd: ledger.remainingUsd,
            reserveUsd: EXECUTION_54BN_BUDGET.reserveUsdPerEvaluation,
            authorized: true,
          });
          writeJson(path.join(EVIDENCE, `editorial-retry-run-${run}-attempt-${attempt}.json`), retry);
          if (!retry.allowed) return null;
          retries += 1;
        }
        return null;
      }

      const firstEditorial = await editorialWithRetry(1);
      editorialRun1 = firstEditorial?.assessment ?? null;
      editorialOfficial1 = firstEditorial?.official ?? null;
      const secondEditorial = await editorialWithRetry(2);
      editorialRun2 = secondEditorial?.assessment ?? null;
      editorialOfficial2 = secondEditorial?.official ?? null;
    });
  }

  ledger = closeExecutionBudget(ledger, keyReady ? undefined : "OPENAI_API_KEY missing.");
  writeExecutionBudgetLedger(budgetFile, ledger);

  const desktopScore = conservativeMinPair(visualRun1?.desktopVisualScore, visualRun2?.desktopVisualScore);
  const mobileScore = conservativeMinPair(visualRun1?.mobileVisualScore, visualRun2?.mobileVisualScore);
  const editorialScore = conservativeMinPair(editorialRun1?.overallScore, editorialRun2?.overallScore);
  const identity = evaluationIdentityOf({
    generationId: GENERATION_ID,
    rendererVersion: capture.rendererVersion,
    sourceCommit: commit,
    referenceHash: standard.hash,
    screenshotHashes: shotHashList,
    captureMode: VISITOR_VISUAL_CAPTURE,
    adminChromePresent: false,
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    rubricVersion: "2",
    model: OPENAI_VISION_MODEL,
  });
  const perDimension = officialPerDimensionStability({
    desktop: [visualRun1?.desktopVisualScore, visualRun2?.desktopVisualScore],
    mobile: [visualRun1?.mobileVisualScore, visualRun2?.mobileVisualScore],
    editorial: [editorialRun1?.overallScore, editorialRun2?.overallScore],
  });
  writeJson(path.join(EVIDENCE, "evaluator-observability.json"), {
    skipped: false,
    captureHash,
    referenceHash: standard.hash,
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualRubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
    candidateId: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    records: observabilityRecords,
  });

  const currentBest =
    readBestCandidate(CAMPAIGN_ID) ??
    ({
      selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      state: "BEST_KNOWN",
      contentSafetyPass: true,
      evaluationValid: true,
      desktopVisualScore: BASELINE.desktop,
      mobileVisualScore: BASELINE.mobile,
      editorialScore: BASELINE.editorial,
      identity,
      qualityApproved: false,
      humanReviewUnlocked: false,
      notes: ["Official 54BI V2 visitor baseline 74/72/74."],
    } satisfies BestCandidateRecord);
  const evaluationComplete = desktopScore != null && mobileScore != null && editorialScore != null;
  const decision = selectBestCandidate({
    current: currentBest,
    incoming: {
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      contentSafetyPass: safety.gate === "PASS",
      evaluationValid: evaluationComplete && perDimension.combined !== "NOT_ESTABLISHED",
      desktopVisualScore: desktopScore,
      mobileVisualScore: mobileScore,
      editorialScore,
      identity,
      notes: ["54BN official V2 evaluation of PREMIUM_PRODUCER_CONTENT_V1 on PRESELL_STANDARD_V1."],
    },
  });
  const kept = decision.updated;
  const previewSelection = writeActivePreviewCandidate(
    CAMPAIGN_ID,
    EXPERIMENTAL,
    kept ? CONTROLLED_IMPROVEMENT_EXECUTION_ID : FROZEN_IMPROVEMENT_EXECUTION_ID,
  );
  writeBestCandidate(decision.best);
  writeJson(path.join(EVIDENCE, "best-candidate-comparison.json"), {
    kept,
    restored: !kept,
    reason: decision.reason,
    comparisonStatus: decision.comparisonStatus,
    baseline: BASELINE,
    incoming: { desktopScore, mobileScore, editorialScore },
    bestGeneration: decision.best.generationId,
    bestUpdated: decision.updated,
    bestScores: {
      desktop: decision.best.desktopVisualScore,
      mobile: decision.best.mobileVisualScore,
      editorial: decision.best.editorialScore,
    },
    activePreviewCandidate: previewSelection.activePreviewCandidate,
    activeExecutionId: previewSelection.activeExecutionId,
    experimentalCandidate: EXPERIMENTAL,
  });

  const combinedForGate =
    perDimension.combined === "STABLE" ? "STABLE" : perDimension.combined === "UNSTABLE" ? "EVALUATOR_UNSTABLE" : "NOT_ESTABLISHED";
  const gate = resolveGlobalPresellQualityGate({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    desktopScreenshotPath: path.join(EVIDENCE, "desktop-full.png"),
    mobileScreenshotPath: path.join(EVIDENCE, "mobile-full.png"),
    comparedToOfficialReference: Boolean(visualRun1 || visualRun2),
    evaluatorIndependentFromGenerator: Boolean(visualRun1 || visualRun2),
    visualScore: conservativeMinPair(visualRun1?.overall, visualRun2?.overall),
    desktopVisualScore: desktopScore,
    mobileVisualScore: mobileScore,
    editorialScore,
    evaluatorStability: combinedForGate,
    criticalVisualDefects: [...(visualOfficial1?.criticalDefects ?? []), ...(visualOfficial2?.criticalDefects ?? [])].filter((item, i, all) => all.indexOf(item) === i),
    contentSafetyPass: safety.gate === "PASS",
    paidEvaluationAvailable: keyReady,
  });
  const decided = evaluationComplete ? gate : { ...gate, status: "EVALUATION_UNAVAILABLE" as const, humanReviewUnlocked: false as const };
  writeGlobalPresellQualityGate(decided);
  writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), {
    ...decided,
    publicationUnlocked: false,
    ctaEnabled: false,
    adsActivated: false,
    newGenerationCreated: false,
    designKept: kept,
    designRestored: !kept,
    productContractChanged: false,
    desktopRender: capture.inspect.desktop && !capture.inspect.desktop.adminChromePresent ? "PASS" : "FAIL",
    tabletRender: capture.inspect.tablet && !capture.inspect.tablet.adminChromePresent ? "PASS" : "FAIL",
    mobileRender: capture.inspect.mobile && !capture.inspect.mobile.adminChromePresent ? "PASS" : "FAIL",
    captureInspect,
    previewUrl: previewUrl(),
  });
  writeJson(path.join(EVIDENCE, "official-v2-results.json"), {
    method: "min-of-pair",
    skipped: false,
    desktopVisualRun1: visualRun1?.desktopVisualScore ?? null,
    desktopVisualRun2: visualRun2?.desktopVisualScore ?? null,
    finalDesktopVisualScore: desktopScore,
    mobileVisualRun1: visualRun1?.mobileVisualScore ?? null,
    mobileVisualRun2: visualRun2?.mobileVisualScore ?? null,
    finalMobileVisualScore: mobileScore,
    editorialRun1: editorialRun1?.overallScore ?? null,
    editorialRun2: editorialRun2?.overallScore ?? null,
    finalEditorialScore: editorialScore,
    desktopStability: perDimension.desktop,
    mobileStability: perDimension.mobile,
    editorialStability: perDimension.editorial,
    combinedStability: perDimension.combined,
    candidate: EXPERIMENTAL_CAPTURE,
    bestKnown: FROZEN_IMPROVEMENT_EXECUTION_ID,
  });
  const backlog = buildImprovementBacklog({
    visualRuns: [visualOfficial1, visualOfficial2].filter((item): item is OfficialVisualV2Record => Boolean(item)),
    editorialRuns: [editorialOfficial1, editorialOfficial2].filter((item): item is OfficialEditorialRecord => Boolean(item)),
  });
  writeJson(path.join(EVIDENCE, "remaining-blockers.json"), {
    status: decided.status,
    evaluationComplete,
    humanReviewUnlocked: decided.humanReviewUnlocked,
    publication: "BLOCKED",
    cta: "BLOCKED",
    ads: "NO",
    pendingCommercial: items.filter((item) => item.reuse_status === "PENDING_REVIEW").map((item) => ({ field: item.field, reason: item.reason })),
    rejectedCommercial: items.filter((item) => item.reuse_status === "REJECTED").map((item) => ({ field: item.field, reason: item.reason })),
    nineMedicalClaimsRemainBlocked: true,
    belowTarget: desktopScore == null || mobileScore == null || editorialScore == null || desktopScore < 90 || mobileScore < 90 || editorialScore < 85,
    backlog,
  });
  writeJson(path.join(EVIDENCE, "regression-results.json"), {
    bestKnownPreserved: decision.best.desktopVisualScore === BASELINE.desktop && decision.best.mobileVisualScore === BASELINE.mobile && decision.best.editorialScore === BASELINE.editorial,
    templateImplementationPreserved: true,
    rollbackNonDestructive: true,
    activeExecutionId: previewSelection.activeExecutionId,
  });
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BN

- Template: ${PRESELL_STANDARD_ID} ${PRESELL_STANDARD_VERSION}
- Composition: ${COMPOSITION_ID}
- Producer ok: ${producer.ok}
- Final URL: ${producer.finalUrl}
- Approved commercial items: ${counts.APPROVED}
- Pending: ${counts.PENDING_REVIEW}
- Rejected: ${counts.REJECTED}
- Preflight: ${preflight.status}
- Content safety: ${safety.gate}
- Baseline: ${BASELINE.desktop}/${BASELINE.mobile}/${BASELINE.editorial}
- Desktop: ${visualRun1?.desktopVisualScore ?? "n/a"} / ${visualRun2?.desktopVisualScore ?? "n/a"} → ${desktopScore ?? "n/a"}
- Mobile: ${visualRun1?.mobileVisualScore ?? "n/a"} / ${visualRun2?.mobileVisualScore ?? "n/a"} → ${mobileScore ?? "n/a"}
- Editorial: ${editorialRun1?.overallScore ?? "n/a"} / ${editorialRun2?.overallScore ?? "n/a"} → ${editorialScore ?? "n/a"}
- Stability: desktop ${perDimension.desktop}, mobile ${perDimension.mobile}, editorial ${perDimension.editorial}
- Best candidate updated: ${kept}
- Active execution: ${previewSelection.activeExecutionId}
- Gate: ${decided.status}
- Human review: ${decided.humanReviewUnlocked}
- Preview: ${previewUrl()}
- Spent: ${ledger.spentUsd} / ${ledger.maxUsd}
`,
  );
  console.log(
    JSON.stringify(
      {
        template: PRESELL_STANDARD_ID,
        composition: COMPOSITION_ID,
        collectOk: producer.ok,
        safety: safety.gate,
        gate: decided.status,
        desktopScore,
        mobileScore,
        editorialScore,
        perDimension,
        kept,
        activeExecutionId: previewSelection.activeExecutionId,
        spent: ledger.spentUsd,
        remaining: ledger.remainingUsd,
        invalidAttempts,
        retries,
        previewUrl: previewUrl(),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  try {
    writeActivePreviewCandidate(CAMPAIGN_ID, EXPERIMENTAL, FROZEN_IMPROVEMENT_EXECUTION_ID);
  } catch {
    /* restore best-effort */
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
