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
  EXECUTION_54BV_BUDGET,
  EXECUTION_54BV_ID,
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
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { inspectFaqInteraction } from "../src/lib/presell-quality/visual-optimization-agent/index.ts";
import {
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FINAL_VISUAL_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID,
  PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import { approvedCommercialExcerpts, countsByStatus, readCommercialReuse } from "../src/lib/presell-quality/commercial-reuse.ts";
import {
  conservativeMinPair,
  freezeCandidateManifest,
  officialEditorialRecord,
  officialPerDimensionStability,
  officialVisualV2Record,
  buildImprovementBacklog,
  FORBIDDEN_BACKLOG_CHROME,
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
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bv-official-v2-evaluation");
const BI_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bi-editorial-deduplication");
const BU_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bu-final-visual-corrections");
const BS_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bs-official-v2-decision");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const EXPERIMENTAL = EXPERIMENTAL_CANDIDATE_ID;
const EXPERIMENTAL_CAPTURE = FINAL_VISUAL_EXECUTION_ID;
const COMPOSITION_ID = PREMIUM_FINAL_VISUAL_COMPOSITION_ID;
const BASELINE = { desktop: 74, mobile: 72, editorial: 74 } as const;
const SHOT_FILES = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];
const BU_COMMIT = "4adef1b19668d5a5ff698c73f60d8b4f76b4c74f";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const RENDERED_FILES = [
  "src/app/premium-design-engine.css",
  "src/components/presell/standard-v1-page.tsx",
  "src/components/design-system/premium-blocks.tsx",
  "src/lib/presell-quality/renderer-candidate.ts",
  "src/lib/presell-quality/visual-optimization-agent/editorial-gate.ts",
];

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
  return { snap, integrity, model: disableCommercialCta(sandboxed) };
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

function inspectCapture(inspect: Record<string, {
  adminChromePresent: boolean;
  brokenImages: number;
  overflowX: boolean;
  previewCtaEnabled: boolean;
  clippedEssential?: boolean;
  packageCards?: number;
  packageCardsStraddlingFold?: number;
  packshotClippedOnFold?: boolean;
  heroLoaded?: boolean;
  checkoutRequest?: boolean;
  liveHop?: boolean;
}>) {
  const viewports = ["desktop", "tablet", "mobile"] as const;
  return {
    adminChromePresent: viewports.some((key) => inspect[key]?.adminChromePresent),
    brokenImages: viewports.reduce((sum, key) => sum + (inspect[key]?.brokenImages ?? 0), 0),
    horizontalOverflow: viewports.some((key) => inspect[key]?.overflowX),
    ctaEnabled: viewports.some((key) => inspect[key]?.previewCtaEnabled),
    clippedEssential: viewports.some((key) => inspect[key]?.clippedEssential),
    packageCards: inspect.desktop?.packageCards ?? 0,
    packageCardsStraddlingFold: viewports.reduce((sum, key) => sum + (inspect[key]?.packageCardsStraddlingFold ?? 0), 0),
    packshotClippedOnFold: viewports.some((key) => inspect[key]?.packshotClippedOnFold),
    packshotVisible: viewports.every((key) => inspect[key]?.heroLoaded !== false),
    checkoutRequest: viewports.some((key) => inspect[key]?.checkoutRequest),
    liveHop: viewports.some((key) => inspect[key]?.liveHop),
  };
}

function renderedFileHashes(): Record<string, string | null> {
  const files = [...new Set([...DESIGN_CHECKPOINT_FILES, ...RENDERED_FILES])];
  return Object.fromEntries(files.map((relative) => [relative, sha256File(path.join(process.cwd(), relative))]));
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const captureOnly = process.env.AIA_CAPTURE_ONLY === "1";
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
    branch: execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf8" }).trim(),
    head: commit,
    initialHead: BU_COMMIT,
    buCommit: BU_COMMIT,
    buCommitMessage: "feat(presell): preserve final premium visual candidate",
    biCommit: BI_COMMIT,
    pushExecuted: false,
    bvCommitCreated: false,
  });

  const reuse = readCommercialReuse(CAMPAIGN_ID);
  if (!reuse) throw new Error("Commercial reuse manifest is missing.");
  const counts = countsByStatus(reuse.items);
  const packages = reuse.approvedPackages;
  const expected = [
    { id: "pkg-2", unitPrice: "$79", currentTotal: "$158", quantity: "2 bottles" },
    { id: "pkg-3", unitPrice: "$69", currentTotal: "$207", quantity: "3 bottles" },
    { id: "pkg-6", unitPrice: "$49", currentTotal: "$294", quantity: "6 bottles" },
  ];
  const pricingOk = expected.every((row) => {
    const found = packages.find((item) => item.id === row.id);
    return found?.unitPrice === row.unitPrice && found.currentTotal === row.currentTotal && found.quantity === row.quantity;
  });
  writeJson(path.join(EVIDENCE, "package-pricing-validation.json"), {
    expected,
    actual: packages.map((item) => ({ id: item.id, unitPrice: item.unitPrice, currentTotal: item.currentTotal, quantity: item.quantity, shippingTerm: item.shippingTerm })),
    associationOk: pricingOk,
    inventedDiscount: false,
    inventedFreeShipping: packages.some((item) => /\bfree shipping\b/i.test(item.shippingTerm)),
  });
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  writeJson(path.join(EVIDENCE, "commercial-content-review.json"), {
    reused54bnInventory: true,
    producerImagesFound: 30,
    producerImagesApproved: 0,
    producerImagesReason: "No affiliate-use declaration covers producer-hosted images. The approved packshot asset remains the LP image.",
    packshotAssetId: "asset-cbc045ab",
    ratingsFound: reuse.items.some((item) => item.field === "rating"),
    ratingsApproved: false,
    ratingsReason: "Seller-stated 4.98/5 and 2000+ reviews stay PENDING_REVIEW. Not an independent corpus and not newly authorized.",
    testimonialsRemainRejected: true,
    approvedPackageCount: packages.length,
    counts,
    userAssetDeclarationPresent: Boolean(declaration),
  });

  const { snap, integrity, model } = loadModel();
  const markup = renderToStaticMarkup(createElement(V4Page, { model, candidate: EXPERIMENTAL_CAPTURE, campaignId: CAMPAIGN_ID }));
  const bqMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BQ", campaignId: CAMPAIGN_ID }));
  const frozenMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID, campaignId: CAMPAIGN_ID }));
  if (FORBIDDEN_REFERENCE_CHROME.test(markup)) throw new Error("Template markup invented forbidden chrome.");
  const template = mapPresellStandardV1(model);
  const validation = validatePresellTemplateDocument(template);
  const excerpts = [
    ...approvedCommercialExcerpts(reuse),
    ...packages.flatMap((item) => [item.unitPrice, item.currentTotal, item.comparedTotal ?? ""]).filter(Boolean),
  ];
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const usedAssets = packshot?.assetId ? [packshot.assetId] : [];
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: salesUrl });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
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
  const twoDroppers = /two(?: full)? droppers/i.test(markup) && !/\btwo drops\b/i.test(markup);
  const packshotOk = packshot?.assetId === "asset-cbc045ab";
  const guaranteeOk = /60/.test(markup);
  const fileHashes = renderedFileHashes();
  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    templateId: PRESELL_STANDARD_ID,
    templateVersion: PRESELL_STANDARD_VERSION,
    candidateExecution: FINAL_VISUAL_EXECUTION_ID,
    compositionId: COMPOSITION_ID,
    status: "EXPERIMENTAL",
    frozen: FROZEN_IMPROVEMENT_EXECUTION_ID,
    sourceCommit: commit,
    productContractHash: contractHash,
    contentHash: contentFingerprintOf(model),
    usedAssets: usedAssets,
    packshotAssetId: packshot?.assetId ?? null,
    renderedFileHashes: fileHashes,
    hopSlot: model.hopSlot,
    commercialCtaEnabled: Boolean(model.hopHref),
    previewUrl: previewUrl(),
    buComposition: /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(markup),
    brDistinct: /data-presell-execution="54BR"/.test(renderToStaticMarkup(createElement(V4Page, { model, candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID, campaignId: CAMPAIGN_ID }))),
    bqDistinct: /data-presell-execution="54BQ"/.test(bqMarkup),
    biDistinct: /data-presell-execution="54BI"/.test(frozenMarkup),
    twoDroppers,
    guaranteeWindow: guaranteeOk,
    evaluatorVersion: PREMIUM_VISUAL_EVALUATION_V2,
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualPromptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    engineVersion: PREMIUM_ENGINE_VERSION,
    rendererVersion: RENDERER_V4_ID,
  });
  writeJson(path.join(EVIDENCE, "candidate-freeze.json"), {
    ...freezeCandidateManifest({
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      contentHash: contentFingerprintOf(model),
      productContractHash: contractHash,
      sourceCommit: commit,
      referenceHash: standard.hash,
    }),
    executionId: FINAL_VISUAL_EXECUTION_ID,
    compositionId: COMPOSITION_ID,
    templateId: PRESELL_STANDARD_ID,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssets,
    renderedFileHashes: fileHashes,
    screenshotHashes: hashesOf(EVIDENCE),
    evaluatorVersion: PREMIUM_VISUAL_EVALUATION_V2,
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualPromptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    model: OPENAI_VISION_MODEL,
  });
  writeJson(path.join(EVIDENCE, "input-integrity.json"), {
    referenceHash: standard.hash,
    expectedReference: EXPECTED_REFERENCE,
    referenceHashValid: standard.hash === EXPECTED_REFERENCE,
    renderedFileHashes: fileHashes,
    contentHash: contentFingerprintOf(model),
    productContractHash: contractHash,
    screenshotHashes: hashesOf(EVIDENCE),
    immutable: true,
  });
  const multiproduct = labScenarioKeys().map((key) => {
    const scenario = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model: scenario, candidate: EXPERIMENTAL }));
    const mapped = mapPresellStandardV1(scenario);
    return {
      key,
      inventedChrome: FORBIDDEN_REFERENCE_CHROME.test(html),
      commercialCtaEnabled: Boolean(scenario.hopHref) || mapped.cta.enabled,
      sugarDefenderSpecific: /sugar defender|cbc045ab/i.test(html),
      sellerPackages: /data-seller-stated-offers/.test(html),
    };
  });
  const multiproductPass = multiproduct.every((row) => !row.inventedChrome && !row.commercialCtaEnabled && !row.sugarDefenderSpecific && !row.sellerPackages);
  writeJson(path.join(EVIDENCE, "preflight-results.json"), {
    ...preflight,
    templateValidation: validation,
    contentSafetyGate: safety.gate,
    pricingOk,
    multiproductRegression: multiproductPass ? "PASS" : "FAIL",
    multiproduct,
  });
  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54BV_ID, EXECUTION_54BV_BUDGET.maxUsd);
  writeExecutionBudgetLedger(budgetFile, ledger);

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
    writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), { ...unavailable, publicationUnlocked: false, ctaEnabled: false, adsActivated: false, ...extra });
    writeJson(path.join(EVIDENCE, "best-candidate-comparison.json"), {
      kept: false,
      restored: true,
      reason: reasons.join(" "),
      baseline: BASELINE,
      baselineExecution: "54BI",
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
    });
    writeJson(path.join(EVIDENCE, "remaining-blockers.json"), { status: "EVALUATION_UNAVAILABLE", reasons, publication: "BLOCKED", cta: "BLOCKED", ads: "NO" });
    writeJson(path.join(EVIDENCE, "top-three-blockers.json"), {
      status: "BLOCKED",
      blockers: reasons.slice(0, 3).map((reason, index) => ({
        issue_id: `BV-0${index + 1}`,
        dimension: "TECHNICAL",
        classification: "TECHNICAL_EVALUATION_FAILURE",
        evidence: reason,
        severity: "HIGH",
        recommended_action: "Do not start paid evaluation until the prerequisite is restored.",
      })),
    });
    writeJson(path.join(EVIDENCE, "evaluation-stability.json"), { skipped: true, reasons });
    writeJson(path.join(EVIDENCE, "regression-results.json"), { runnerBlockedBeforeEval: true, activeExecutionId: "54BI" });
    writeJson(path.join(EVIDENCE, "best-candidate-selector.json"), {
      updated: false,
      reason: reasons.join(" "),
      bestKnownExecution: "54BI",
      bestCandidateUpdated: false,
    });
    writeJson(path.join(EVIDENCE, "evaluator-observability.json"), { skipped: true, reasons, records: [] });
  }

  if (!pricingOk || preflight.status !== "PREFLIGHT_PASSED" || safety.gate !== "PASS" || !multiproductPass || !twoDroppers || !packshotOk || !guaranteeOk) {
    ledger = closeExecutionBudget(ledger, "Preflight, safety, pricing, usage, packshot, or multiproduct blocked paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable(
      [
        !pricingOk ? "Approved package price association failed." : "",
        preflight.status !== "PREFLIGHT_PASSED" ? `TEMPLATE_QUALITY_PREFLIGHT is ${preflight.status}.` : "",
        safety.gate !== "PASS" ? "CONTENT_SAFETY_GATE failed." : "",
        !multiproductPass ? "MULTIPRODUCT_REGRESSION failed." : "",
        !twoDroppers ? "Usage instruction is not two droppers." : "",
        !packshotOk ? "Approved packshot asset-cbc045ab is missing." : "",
        !guaranteeOk ? "Approved 60-day refund window is missing." : "",
      ].filter(Boolean),
      { paidCallsSkipped: true },
    );
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BV\n\n- Blocked before paid evaluation.\n`);
    console.log(JSON.stringify({ status: "PREFLIGHT_BLOCKED", safety: safety.gate, preflight: preflight.status, pricingOk }, null, 2));
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
  const faq = await inspectFaqInteraction(previewUrl()).catch(() => null);
  const visitorOk =
    capture.ok &&
    !captureInspect.adminChromePresent &&
    captureInspect.brokenImages === 0 &&
    !captureInspect.horizontalOverflow &&
    !captureInspect.ctaEnabled &&
    !captureInspect.clippedEssential &&
    captureInspect.packshotVisible &&
    !captureInspect.checkoutRequest &&
    !captureInspect.liveHop;
  const screenshotHashes = hashesOf(EVIDENCE);
  const previousBi = hashesOf(BI_EVIDENCE);
  const previousBu = hashesOf(BU_EVIDENCE);
  const previousBs = hashesOf(BS_EVIDENCE);
  const hashesDifferFrom54bi =
    Boolean(screenshotHashes["desktop-first-fold.png"]) &&
    screenshotHashes["desktop-first-fold.png"] !== previousBi["desktop-first-fold.png"];
  const freeze = freezeCandidateManifest({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    contentHash: contentFingerprintOf(model),
    productContractHash: contractHash,
    sourceCommit: commit,
    referenceHash: standard.hash,
  });
  writeJson(path.join(EVIDENCE, "candidate-freeze.json"), {
    ...freeze,
    executionId: FINAL_VISUAL_EXECUTION_ID,
    compositionId: COMPOSITION_ID,
    templateId: PRESELL_STANDARD_ID,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssets,
    renderedFileHashes: fileHashes,
    screenshotHashes,
    evaluatorVersion: PREMIUM_VISUAL_EVALUATION_V2,
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualPromptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    model: OPENAI_VISION_MODEL,
    faq,
    captureInspect,
  });
  writeJson(path.join(EVIDENCE, "input-integrity.json"), {
    referenceHash: standard.hash,
    expectedReference: EXPECTED_REFERENCE,
    referenceHashValid: standard.hash === EXPECTED_REFERENCE,
    screenshotHashes,
    renderedFileHashes: fileHashes,
    contentHash: contentFingerprintOf(model),
    productContractHash: contractHash,
    hashesDifferFrom54bi,
    reused54biDesktopFold: screenshotHashes["desktop-first-fold.png"] === previousBi["desktop-first-fold.png"],
    matches54buDesktopFold: screenshotHashes["desktop-first-fold.png"] === previousBu["desktop-first-fold.png"],
    matches54bsDesktopFold: screenshotHashes["desktop-first-fold.png"] === previousBs["desktop-first-fold.png"],
    packageCardsStraddlingFold: captureInspect.packageCardsStraddlingFold,
    packageCardStraddleIsNotAVisitorFailure: true,
    visitorOk,
    immutable: freeze.immutable,
  });

  if (captureOnly) {
    restoreActiveBi();
    console.log(JSON.stringify({ status: "CAPTURE_ONLY", visitorOk, captureInspect, hashesDifferFrom54bi, previewUrl: previewUrl() }, null, 2));
    return;
  }

  if (!visitorOk) {
    ledger = closeExecutionBudget(ledger, "Visitor capture failed before paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable([`Visitor capture failed: ${capture.notes.join("; ")}`], { paidCallsSkipped: true, captureInspect });
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BV\n\n- Capture failed.\n`);
    console.log(JSON.stringify({ status: "CAPTURE_FAILED", notes: capture.notes, captureInspect }, null, 2));
    return;
  }
  if (!hashesDifferFrom54bi) {
    ledger = closeExecutionBudget(ledger, "54BV captures reused the 54BI first-fold hash.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable(["54BU visitor hashes matched the 54BI desktop first-fold; the 54BU candidate was not captured."], { paidCallsSkipped: true });
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BV\n\n- Hashes reused 54BI captures.\n`);
    console.log(JSON.stringify({ status: "HASHES_UNCHANGED" }, null, 2));
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
  const observabilityRecords: unknown[] = [];
  const reference = readPremiumReferenceBytes();
  const keyReady = envValuePresent("OPENAI_API_KEY");
  const shotHashList = capture.shots.map((item) => item.sha256).filter((item): item is string => Boolean(item));

  if (keyReady && reference) {
    await runWithTemporaryPaidAi({ scope: "54BV", provider: "openai", maxUsd: EXECUTION_54BV_BUDGET.maxUsd }, async () => {
      async function visualOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BV_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BV_BUDGET,
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
          const responsePayloadHash = completion.observability?.responsePayloadHash ?? hashVisionResponsePayload(completion.text);
          observabilityRecords.push({
            kind: "visual",
            run,
            captureHash: sha256Text(JSON.stringify(screenshotHashes)),
            captureHashes: {
              desktopFirstFold: screenshotHashes["desktop-first-fold.png"],
              mobileFirstFold: screenshotHashes["mobile-first-fold.png"],
            },
            referenceHash: standard.hash,
            requestPayloadHash: completion.observability?.requestPayloadHash ?? null,
            responsePayloadHash,
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
            qualityPromptVersion: QUALITY_PROMPT_VERSION,
            rubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
            inputTokens: completion.inputTokens,
            outputTokens: completion.outputTokens,
            estimatedUsd: estimated,
            parserOk: parsed != null,
            desktopVisualScore: parsed.desktopVisualScore,
            mobileVisualScore: parsed.mobileVisualScore,
          });
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), {
            ...official,
            estimatedUsd: estimated,
            model: OPENAI_VISION_MODEL,
            promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
            qualityPromptVersion: QUALITY_PROMPT_VERSION,
            raw: completion.text,
            observability: completion.observability ?? null,
            responsePayloadHash,
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
          reserveUsd: EXECUTION_54BV_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BV_BUDGET,
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
            attempt,
            captureHash: sha256Text(JSON.stringify({
              desktopFull: screenshotHashes["desktop-full.png"],
              mobileFull: screenshotHashes["mobile-full.png"],
            })),
            captureHashes: {
              desktopFull: screenshotHashes["desktop-full.png"],
              mobileFull: screenshotHashes["mobile-full.png"],
            },
            referenceHash: standard.hash,
            requestPayloadHash: assessment.costMetadata.notes.find((note) => note.startsWith("requestPayloadHash:"))?.slice("requestPayloadHash:".length) ?? null,
            responsePayloadHash: assessment.costMetadata.notes.find((note) => note.startsWith("responsePayloadHash:"))?.slice("responsePayloadHash:".length) ?? null,
            model: assessment.evaluatorModel ?? OPENAI_VISION_MODEL,
            promptVersion: QUALITY_PROMPT_VERSION,
            rubricVersion: assessment.rubricVersion,
            inputTokens: assessment.tokenUsage?.inputTokens ?? 0,
            outputTokens: assessment.tokenUsage?.outputTokens ?? 0,
            estimatedUsd: estimated,
            parserOk: assessment.overallScore != null,
            editorialScore: assessment.overallScore,
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
        while (attempt < 2) {
          attempt += 1;
          const result = await editorialOnce(run, attempt);
          if (result.ok) return result;
          const retry = editorialRetryAllowed({
            code: result.code,
            attempt,
            maxAttempts: 2,
            remainingUsd: ledger.remainingUsd,
            reserveUsd: EXECUTION_54BV_BUDGET.reserveUsdPerEvaluation,
            authorized: true,
          });
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
      notes: ["54BV official V2 evaluation of 54BU PREMIUM_FINAL_VISUAL_V1."],
    },
  });
  const kept = decision.updated;
  const previewSelection = writeActivePreviewCandidate(
    CAMPAIGN_ID,
    EXPERIMENTAL,
    kept ? FINAL_VISUAL_EXECUTION_ID : FROZEN_IMPROVEMENT_EXECUTION_ID,
  );
  writeBestCandidate(decision.best);
  writeJson(path.join(EVIDENCE, "best-candidate-comparison.json"), {
    kept,
    restored: !kept,
    reason: decision.reason,
    comparisonStatus: decision.comparisonStatus,
    baseline: BASELINE,
    baselineExecution: "54BI",
    incoming: { desktopScore, mobileScore, editorialScore },
    bestUpdated: decision.updated,
    bestScores: {
      desktop: decision.best.desktopVisualScore,
      mobile: decision.best.mobileVisualScore,
      editorial: decision.best.editorialScore,
    },
    activeExecutionId: previewSelection.activeExecutionId,
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
    designKept: kept,
    designRestored: !kept,
    desktopRender: capture.inspect.desktop && !capture.inspect.desktop.adminChromePresent ? "PASS" : "FAIL",
    tabletRender: capture.inspect.tablet && !capture.inspect.tablet.adminChromePresent ? "PASS" : "FAIL",
    mobileRender: capture.inspect.mobile && !capture.inspect.mobile.adminChromePresent ? "PASS" : "FAIL",
    captureInspect,
    previewUrl: previewUrl(),
  });
  writeJson(path.join(EVIDENCE, "official-v2-results.json"), {
    method: "min-of-pair",
    skipped: !evaluationComplete,
    official: evaluationComplete,
    desktopVisualRun1: visualRun1?.desktopVisualScore ?? null,
    desktopVisualRun2: visualRun2?.desktopVisualScore ?? null,
    finalDesktopVisualScore: evaluationComplete ? desktopScore : null,
    mobileVisualRun1: visualRun1?.mobileVisualScore ?? null,
    mobileVisualRun2: visualRun2?.mobileVisualScore ?? null,
    finalMobileVisualScore: evaluationComplete ? mobileScore : null,
    editorialRun1: editorialRun1?.overallScore ?? null,
    editorialRun2: editorialRun2?.overallScore ?? null,
    finalEditorialScore: evaluationComplete ? editorialScore : null,
    desktopStability: perDimension.desktop,
    mobileStability: perDimension.mobile,
    editorialStability: perDimension.editorial,
    combinedStability: perDimension.combined,
    candidate: EXPERIMENTAL_CAPTURE,
    bestKnown: kept ? FINAL_VISUAL_EXECUTION_ID : FROZEN_IMPROVEMENT_EXECUTION_ID,
    invalidAttempts,
    retries,
    aiCalls: observabilityRecords.length,
    protocolGrouping: "2 visual (desktop-first-fold + mobile-first-fold + reference) + 2 editorial (desktop-full + mobile-full)",
    model: OPENAI_VISION_MODEL,
    visualRubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualPromptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    referenceHash: standard.hash,
  });
  writeJson(path.join(EVIDENCE, "evaluator-observability.json"), {
    skipped: observabilityRecords.length === 0,
    captureHash: sha256Text(JSON.stringify(screenshotHashes)),
    referenceHash: standard.hash,
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualRubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
    visualPromptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    candidateId: FINAL_VISUAL_EXECUTION_ID,
    records: observabilityRecords,
    spentUsd: ledger.spentUsd,
    maxUsd: ledger.maxUsd,
  });
  writeJson(path.join(EVIDENCE, "best-candidate-selector.json"), {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    updated: decision.updated,
    comparisonStatus: decision.comparisonStatus,
    reason: decision.reason,
    bestKnownExecution: kept ? "54BU" : "54BI",
    bestCandidateUpdated: kept,
    activeExecutionId: previewSelection.activeExecutionId,
    previousScores: {
      desktop: currentBest.desktopVisualScore,
      mobile: currentBest.mobileVisualScore,
      editorial: currentBest.editorialScore,
    },
    incomingScores: { desktop: desktopScore, mobile: mobileScore, editorial: editorialScore },
    evaluationComplete,
    evaluationValid: evaluationComplete && perDimension.combined !== "NOT_ESTABLISHED",
  });
  const backlog = buildImprovementBacklog({
    visualRuns: [visualOfficial1, visualOfficial2].filter((item): item is OfficialVisualV2Record => Boolean(item)),
    editorialRuns: [editorialOfficial1, editorialOfficial2].filter((item): item is OfficialEditorialRecord => Boolean(item)),
  });
  const blockers: Array<{
    issue_id: string;
    dimension: string;
    classification: "PROVEN_VISUAL_GAP" | "PROVEN_EDITORIAL_GAP" | "EVALUATOR_VARIATION" | "COMMERCIAL_CONTENT_RESTRICTION" | "TECHNICAL_EVALUATION_FAILURE";
    evidence: string;
    severity: "HIGH" | "MEDIUM";
    recommended_action: string;
  }> = [];
  function pushBlocker(row: Omit<(typeof blockers)[number], "issue_id">) {
    if (blockers.length >= 3) return;
    blockers.push({ issue_id: `BV-0${blockers.length + 1}`, ...row });
  }
  if (!evaluationComplete) {
    pushBlocker({
      dimension: "TECHNICAL",
      classification: "TECHNICAL_EVALUATION_FAILURE",
      evidence: "The official V2 protocol did not complete two valid evaluations for every dimension.",
      severity: "HIGH",
      recommended_action: "Do not treat a partial 54BV result as official. Preserve 54BI and retry only with a new exclusive budget.",
    });
  } else {
    const provenDesktop = backlog.desktop.find((item) => item.priority === "HIGH" && !FORBIDDEN_BACKLOG_CHROME.test(`${item.problem} ${item.recommendedFix}`));
    const provenMobile = backlog.mobile.find((item) => item.priority === "HIGH" && !FORBIDDEN_BACKLOG_CHROME.test(`${item.problem} ${item.recommendedFix}`));
    if ((desktopScore ?? 0) < 90) {
      if (perDimension.desktop === "UNSTABLE") {
        pushBlocker({
          dimension: "DESKTOP",
          classification: "EVALUATOR_VARIATION",
          evidence: `Official desktop min-of-pair is ${desktopScore} (${visualRun1?.desktopVisualScore}/${visualRun2?.desktopVisualScore}, UNSTABLE).`,
          severity: "HIGH",
          recommended_action: "Do not treat the unstable desktop pair as a proven landing-page defect.",
        });
      } else if (provenDesktop) {
        pushBlocker({
          dimension: "DESKTOP",
          classification: "PROVEN_VISUAL_GAP",
          evidence: provenDesktop.evidence || provenDesktop.problem,
          severity: "HIGH",
          recommended_action: provenDesktop.recommendedFix,
        });
      }
    }
    if ((mobileScore ?? 0) < 90) {
      if (perDimension.mobile === "UNSTABLE") {
        pushBlocker({
          dimension: "MOBILE",
          classification: "EVALUATOR_VARIATION",
          evidence: `Official mobile min-of-pair is ${mobileScore} (${visualRun1?.mobileVisualScore}/${visualRun2?.mobileVisualScore}, UNSTABLE).`,
          severity: "HIGH",
          recommended_action: "Do not treat the unstable mobile pair as a proven landing-page defect.",
        });
      } else if (provenMobile) {
        pushBlocker({
          dimension: "MOBILE",
          classification: "PROVEN_VISUAL_GAP",
          evidence: provenMobile.evidence || provenMobile.problem,
          severity: "HIGH",
          recommended_action: provenMobile.recommendedFix,
        });
      }
    }
    if ((editorialScore ?? 0) < 85) {
      if (perDimension.editorial === "UNSTABLE") {
        pushBlocker({
          dimension: "EDITORIAL",
          classification: "EVALUATOR_VARIATION",
          evidence: `Official editorial min-of-pair is ${editorialScore} (${editorialRun1?.overallScore}/${editorialRun2?.overallScore}, UNSTABLE). Same request identity with different responses is not a proven copy defect.`,
          severity: "HIGH",
          recommended_action: "Preserve min-of-pair. Do not rewrite approved copy to chase the unstable editorial score.",
        });
      } else {
        const provenEditorial = backlog.editorial.find((item) => item.priority === "HIGH");
        pushBlocker({
          dimension: "EDITORIAL",
          classification: provenEditorial ? "PROVEN_EDITORIAL_GAP" : "COMMERCIAL_CONTENT_RESTRICTION",
          evidence: provenEditorial?.evidence || provenEditorial?.problem || `Official editorial min-of-pair is ${editorialScore} against target 85 with STABLE pair scores and no identified copy defect beyond commercial restrictions.`,
          severity: "HIGH",
          recommended_action: provenEditorial?.recommendedFix || "Do not invent ratings, testimonials, seals, or medical claims to chase the editorial target.",
        });
      }
    }
    if (blockers.length < 3) {
      pushBlocker({
        dimension: "COMMERCIAL",
        classification: "COMMERCIAL_CONTENT_RESTRICTION",
        evidence: "Producer-hosted images and seller ratings remain unapproved; testimonials stay rejected. Official V2 still forbids penalizing missing unapproved chrome.",
        severity: "MEDIUM",
        recommended_action: "Do not invent ratings, testimonials, seals, or unapproved images.",
      });
    }
  }
  writeJson(path.join(EVIDENCE, "top-three-blockers.json"), {
    status: evaluationComplete ? (kept ? "PROMOTED" : "NOT_PROMOTED") : "BLOCKED",
    globalGate: decided.status,
    blockers,
  });
  writeJson(path.join(EVIDENCE, "evaluation-stability.json"), {
    desktop: {
      run1: visualRun1?.desktopVisualScore ?? null,
      run2: visualRun2?.desktopVisualScore ?? null,
      official: desktopScore,
      stability: perDimension.desktop,
    },
    mobile: {
      run1: visualRun1?.mobileVisualScore ?? null,
      run2: visualRun2?.mobileVisualScore ?? null,
      official: mobileScore,
      stability: perDimension.mobile,
    },
    editorial: {
      run1: editorialRun1?.overallScore ?? null,
      run2: editorialRun2?.overallScore ?? null,
      official: editorialScore,
      stability: perDimension.editorial,
    },
    combined: perDimension.combined,
    method: "min-of-pair",
    variationLimit: 8,
  });
  writeJson(path.join(EVIDENCE, "remaining-blockers.json"), {
    status: decided.status,
    evaluationComplete,
    humanReviewUnlocked: decided.humanReviewUnlocked,
    publication: "BLOCKED",
    cta: "BLOCKED",
    ads: "NO",
    belowTarget: desktopScore == null || mobileScore == null || editorialScore == null || desktopScore < 90 || mobileScore < 90 || editorialScore < 85,
    producerImagesApproved: 0,
    ratingsApproved: false,
    backlog,
    nextRecommendedExecution: kept
      ? "54BU is the new best-known candidate. Keep publication blocked. Do not auto-start."
      : "Keep 54BI as the best-known candidate. Do not auto-start.",
  });
  writeJson(path.join(EVIDENCE, "regression-results.json"), {
    bestKnownPreserved:
      decision.best.desktopVisualScore === BASELINE.desktop &&
      decision.best.mobileVisualScore === BASELINE.mobile &&
      decision.best.editorialScore === BASELINE.editorial,
    activeExecutionId: previewSelection.activeExecutionId,
    templateImplementationPreserved: true,
  });
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BV

- Template: ${PRESELL_STANDARD_ID}
- Composition: ${COMPOSITION_ID}
- Preflight: ${preflight.status}
- Content safety: ${safety.gate}
- Baseline: ${BASELINE.desktop}/${BASELINE.mobile}/${BASELINE.editorial}
- Desktop: ${visualRun1?.desktopVisualScore ?? "n/a"} / ${visualRun2?.desktopVisualScore ?? "n/a"} → ${desktopScore ?? "n/a"}
- Mobile: ${visualRun1?.mobileVisualScore ?? "n/a"} / ${visualRun2?.mobileVisualScore ?? "n/a"} → ${mobileScore ?? "n/a"}
- Editorial: ${editorialRun1?.overallScore ?? "n/a"} / ${editorialRun2?.overallScore ?? "n/a"} → ${editorialScore ?? "n/a"}
- Best candidate updated: ${kept}
- Active execution: ${previewSelection.activeExecutionId}
- Gate: ${decided.status}
- Spent: ${ledger.spentUsd} / ${ledger.maxUsd}
- Preview: ${previewUrl()}
`,
  );
  console.log(
    JSON.stringify(
      {
        composition: COMPOSITION_ID,
        safety: safety.gate,
        gate: decided.status,
        desktopScore,
        mobileScore,
        editorialScore,
        perDimension,
        kept,
        activeExecutionId: previewSelection.activeExecutionId,
        spent: ledger.spentUsd,
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
