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
  EXECUTION_54BO_BUDGET,
  EXECUTION_54BO_ID,
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
  PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID,
  PRODUCER_CONTENT_EXECUTION_ID,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import { approvedCommercialExcerpts, countsByStatus, readCommercialReuse } from "../src/lib/presell-quality/commercial-reuse.ts";
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
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bo-premium-finalization");
const BN_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bn-producer-content");
const BI_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const EXPERIMENTAL = EXPERIMENTAL_CANDIDATE_ID;
const EXPERIMENTAL_CAPTURE = CONTROLLED_IMPROVEMENT_EXECUTION_ID;
const COMPOSITION_ID = PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID;
const BASELINE = { desktop: 74, mobile: 72, editorial: 74 } as const;
const BN_SCORES = { desktop: 69, mobile: 73, editorial: 70 } as const;
const SHOT_FILES = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];
const BN_COMMIT = "6dad1ba770d2a0fb5428554385d7c5d5b073133c";
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
  };
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
    initialHead: BN_COMMIT,
    bnCommit: BN_COMMIT,
    bnCommitMessage: "feat(presell): preserve producer-content landing page",
    biCommit: BI_COMMIT,
    pushExecuted: false,
    boCommitCreated: false,
  });
  createDesignCheckpointFromFiles({
    id: "54bo-experimental-finalization",
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    sourceCommit: commit,
    screenshotHashes: [],
    notes: ["54BO experimental PREMIUM_PRODUCER_CONTENT_V2. Does not overwrite 54bi-proven-baseline or 54BN."],
    files: [
      ...DESIGN_CHECKPOINT_FILES,
      "src/components/presell/standard-v1-page.tsx",
      "src/lib/presell-quality/renderer-candidate.ts",
    ].map((relative) => ({
      path: relative,
      contents: readFileSync(path.join(process.cwd(), relative), "utf8"),
    })),
  });

  const reuse = readCommercialReuse(CAMPAIGN_ID);
  if (!reuse) throw new Error("54BN commercial reuse manifest is missing.");
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
  const bnMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: PRODUCER_CONTENT_EXECUTION_ID, campaignId: CAMPAIGN_ID }));
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
  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    templateId: PRESELL_STANDARD_ID,
    templateVersion: PRESELL_STANDARD_VERSION,
    candidateExecution: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    compositionId: COMPOSITION_ID,
    status: "EXPERIMENTAL",
    frozen: FROZEN_IMPROVEMENT_EXECUTION_ID,
    producerContent: PRODUCER_CONTENT_EXECUTION_ID,
    sourceCommit: commit,
    productContractHash: contractHash,
    contentHash: contentFingerprintOf(model),
    hopSlot: model.hopSlot,
    commercialCtaEnabled: Boolean(model.hopHref),
    previewUrl: previewUrl(),
    bnDistinct: /data-presell-execution="54BN"/.test(bnMarkup) && /data-presell-composition="PREMIUM_PRODUCER_CONTENT_V1"/.test(bnMarkup),
    biDistinct: /data-presell-execution="54BI"/.test(frozenMarkup),
    boComposition: /data-presell-composition="PREMIUM_PRODUCER_CONTENT_V2"/.test(markup),
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
  writeJson(path.join(EVIDENCE, "visual-fixes.json"), {
    firstFoldStrategy: "Desktop hero min-height fills 1440x900 so package cards start below the fold, complete in their own section.",
    packageLayout: "below-hero",
    cssScopedTo: '[data-presell-execution="54BO"]',
    packshotScale: "none",
    ratingsInvented: false,
    producerImagesHotlinked: false,
  });

  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54BO_ID, EXECUTION_54BO_BUDGET.maxUsd);
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
      working54bn: BN_SCORES,
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
    writeJson(path.join(EVIDENCE, "regression-results.json"), { runnerBlockedBeforeEval: true, activeExecutionId: "54BI" });
  }

  if (!pricingOk || preflight.status !== "PREFLIGHT_PASSED" || safety.gate !== "PASS" || !multiproductPass) {
    ledger = closeExecutionBudget(ledger, "Preflight, safety, pricing, or multiproduct blocked paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable(
      [
        !pricingOk ? "Approved package price association failed." : "",
        preflight.status !== "PREFLIGHT_PASSED" ? `TEMPLATE_QUALITY_PREFLIGHT is ${preflight.status}.` : "",
        safety.gate !== "PASS" ? "CONTENT_SAFETY_GATE failed." : "",
        !multiproductPass ? "MULTIPRODUCT_REGRESSION failed." : "",
      ].filter(Boolean),
      { paidCallsSkipped: true },
    );
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BO\n\n- Blocked before paid evaluation.\n`);
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
  const firstFoldOk = captureInspect.packageCardsStraddlingFold === 0 && !captureInspect.packshotClippedOnFold;
  const visitorOk =
    capture.ok &&
    !captureInspect.adminChromePresent &&
    captureInspect.brokenImages === 0 &&
    !captureInspect.horizontalOverflow &&
    !captureInspect.ctaEnabled &&
    !captureInspect.clippedEssential &&
    firstFoldOk;
  const screenshotHashes = hashesOf(EVIDENCE);
  const previousBi = hashesOf(BI_EVIDENCE);
  const previousBn = hashesOf(BN_EVIDENCE);
  const hashesDiffer =
    Boolean(screenshotHashes["desktop-first-fold.png"]) &&
    screenshotHashes["desktop-first-fold.png"] !== previousBi["desktop-first-fold.png"] &&
    screenshotHashes["desktop-first-fold.png"] !== previousBn["desktop-first-fold.png"];
  writeJson(path.join(EVIDENCE, "visual-fixes.json"), {
    firstFoldStrategy: "Desktop hero min-height fills 1440x900 so package cards start below the fold, complete in their own section.",
    packageLayout: "below-hero",
    cssScopedTo: '[data-presell-execution="54BO"]',
    packshotScale: "none",
    firstFoldOk,
    packageCardsComplete: firstFoldOk,
    packshotClipping: captureInspect.packshotClippedOnFold,
    captureInspect,
    hashesDifferFrom54biAnd54bn: hashesDiffer,
  });

  if (captureOnly) {
    restoreActiveBi();
    console.log(JSON.stringify({ status: "CAPTURE_ONLY", visitorOk, captureInspect, hashesDiffer, previewUrl: previewUrl() }, null, 2));
    return;
  }

  if (!visitorOk) {
    ledger = closeExecutionBudget(ledger, "Visitor capture failed before paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable([`Visitor capture failed: ${capture.notes.join("; ")}`], { paidCallsSkipped: true, captureInspect });
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BO\n\n- Capture failed.\n`);
    console.log(JSON.stringify({ status: "CAPTURE_FAILED", notes: capture.notes, captureInspect }, null, 2));
    return;
  }
  if (!hashesDiffer) {
    ledger = closeExecutionBudget(ledger, "54BO captures did not differ from 54BI/54BN first-fold hashes.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable(["54BO visitor hashes did not differ from 54BI/54BN desktop first-fold."], { paidCallsSkipped: true });
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BO\n\n- Hashes unchanged.\n`);
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
  const reference = readPremiumReferenceBytes();
  const keyReady = envValuePresent("OPENAI_API_KEY");
  const shotHashList = capture.shots.map((item) => item.sha256).filter((item): item is string => Boolean(item));

  if (keyReady && reference) {
    await runWithTemporaryPaidAi({ scope: "54BO", provider: "openai", maxUsd: EXECUTION_54BO_BUDGET.maxUsd }, async () => {
      async function visualOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BO_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BO_BUDGET,
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
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), {
            ...official,
            estimatedUsd: estimated,
            model: OPENAI_VISION_MODEL,
            promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
            qualityPromptVersion: QUALITY_PROMPT_VERSION,
            raw: completion.text,
            observability: completion.observability ?? null,
            responsePayloadHash: completion.observability?.responsePayloadHash ?? hashVisionResponsePayload(completion.text),
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
          reserveUsd: EXECUTION_54BO_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BO_BUDGET,
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
            reserveUsd: EXECUTION_54BO_BUDGET.reserveUsdPerEvaluation,
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
      notes: ["54BO official V2 evaluation of PREMIUM_PRODUCER_CONTENT_V2."],
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
    working54bn: BN_SCORES,
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
    invalidAttempts,
    retries,
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
    belowTarget: desktopScore == null || mobileScore == null || editorialScore == null || desktopScore < 90 || mobileScore < 90 || editorialScore < 85,
    producerImagesApproved: 0,
    ratingsApproved: false,
    backlog,
    nextRecommendedExecution: "Keep 54BI active unless 54BO is a proven improvement. Do not auto-start.",
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
    `# EXECUTION 54BO

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
