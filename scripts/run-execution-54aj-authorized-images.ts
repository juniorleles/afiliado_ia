// npx tsx scripts/run-execution-54aj-authorized-images.ts
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, openaiVisionProviderStatus, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { captureEvaluationScreenshots } from "../src/lib/presell-quality/capture.ts";
import { evaluationInputFromModel, contentFingerprintOf, presentationFingerprintOf } from "../src/lib/presell-quality/context.ts";
import { reconstructApprovedPresell } from "../src/lib/presell-quality/reconstruct.ts";
import { emptyBudgetLedger, recordBudgetSpend, EXECUTION_54AJ_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { classifyQualityFixes, hasNewAllowedFix } from "../src/lib/presell-quality/classify.ts";
import { applyQualityPatch, emptyPatch } from "../src/lib/presell-quality/patch.ts";
import { writeGenerationModel, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { reviewAssetId } from "../src/lib/product-research/media-contract.ts";
import { decorateDiscoveredAssets } from "../src/lib/product-research/asset-display.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { galleryPresentationOf, v4HeroMode } from "../src/lib/product-showcase/v4/presentation.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { materializeProductImage } from "../src/lib/product-image.ts";
import { localMediaRoot } from "../src/lib/storage/local.ts";
import {
  recordUserAssetDeclaration,
  productImageIdsForDeclaration,
  originsForDeclaration,
  declarationAuthorizesAds,
} from "../src/lib/presell-quality/user-asset-declaration.ts";
import {
  classifyAssetSuitabilityFromMetadata,
  classifyAssetsWithVision,
  fileNameFromUrl,
  type AssetSuitability,
} from "../src/lib/presell-quality/asset-suitability.ts";
import { selectEditorialPlacement } from "../src/lib/presell-quality/editorial-placement.ts";
import { applyDeclaredPresellMedia, galleryHasDuplicateSrc } from "../src/lib/presell-quality/apply-declared-media.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { V4Model } from "../src/lib/product-showcase/v4/model.ts";

const EVIDENCE = path.join("data/evidence/execution-54aj-authorized-images");
const REPORTS = path.join(EVIDENCE, "reports");
const SHOTS = path.join(EVIDENCE, "screenshots");
const PREVIOUS_54AI_SCORE = 65;
const PREVIOUS_54AI_GEN = "lp-mvr2k7sr-eed804e8";

function copyShot(src: string | null | undefined, dest: string): boolean {
  if (!src || !existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

function dim(assessment: PresellQualityAssessment | null, name: PresellQualityAssessment["dimensionScores"][number]["dimension"]): number | null {
  return assessment?.dimensionScores.find((row) => row.dimension === name)?.score ?? null;
}

function localFileFromSrc(src: string): string | null {
  const name = src.startsWith("/media/product/") ? src.slice("/media/product/".length) : null;
  if (!name) return null;
  const file = path.join(localMediaRoot(), name);
  return existsSync(file) ? file : null;
}

async function inspectPreview(url: string): Promise<Record<string, unknown>> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
    await page.waitForTimeout(500);
    const report = await page.evaluate(() => {
      const root = document.querySelector("[data-v4='page']");
      const images = [...document.images];
      const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return {
        rendered: Boolean(root),
        heroMode: root?.getAttribute("data-hero-mode"),
        galleryState: root?.getAttribute("data-v4-gallery-state"),
        gallerySection: Boolean(document.querySelector("[data-v4-section='gallery']")),
        sandbox: Boolean(document.querySelector("[data-sandbox-badge], [data-sandbox='true']")),
        disclosure: /affiliate|commission/i.test(document.body.innerText),
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        brokenImages: images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("src")),
        heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
        heroNaturalWidth: heroImg?.naturalWidth ?? 0,
        heroNaturalHeight: heroImg?.naturalHeight ?? 0,
      };
    });
    await page.close();
    return { ...report, consoleErrors: errors.slice(0, 5) };
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  const baseCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(237);
  const snap = snapshotProductResearch(237);
  const acceptedFields = acceptedProposals(snap.latest).map((item) => item.field);
  const discovered = decorateDiscoveredAssets(snap.latest?.discoveredAssets);
  const assetIds = productImageIdsForDeclaration(snap.latest?.discoveredAssets);
  const declaration = recordUserAssetDeclaration({
    campaignId: 237,
    declarationText: "As imagens do produto já estão autorizadas.",
    assetIds,
    origins: originsForDeclaration(snap.latest?.discoveredAssets, assetIds),
  });
  writeFileSync(path.join(REPORTS, "authorization.json"), `${JSON.stringify(declaration, null, 2)}\n`);

  const sources: Array<{ assetId: string; src: string; fileName: string; localPath: string | null; assetUrl: string }> = [];
  for (const item of discovered.filter((row) => assetIds.includes(reviewAssetId(row.assetUrl)))) {
    const stored = await materializeProductImage(item.assetUrl, "DIRECT_SOURCE");
    const src = stored?.src ?? item.assetUrl;
    sources.push({
      assetId: reviewAssetId(item.assetUrl),
      src,
      fileName: fileNameFromUrl(item.assetUrl),
      localPath: localFileFromSrc(src),
      assetUrl: item.assetUrl,
    });
  }

  const metadata = sources.map((item) =>
    classifyAssetSuitabilityFromMetadata({ assetId: item.assetId, fileName: item.fileName, assetUrl: item.assetUrl }, declaration),
  );
  let classifications: AssetSuitability[] = metadata;
  let classifyCost = { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, model: OPENAI_VISION_MODEL };
  let liveCalls = 0;
  let ledger = emptyBudgetLedger("54AJ");
  ledger.maxUsd = EXECUTION_54AJ_BUDGET.maxUsd;
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  const paidBefore = paidAiAuthorization();
  let stopReason = keyConfigured ? "NOT_STARTED" : "PAID_AI_AUTHORIZATION_REQUIRED";

  if (keyConfigured) {
    await runWithTemporaryPaidAi({ scope: "54AJ", provider: "openai", maxUsd: EXECUTION_54AJ_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) {
        stopReason = "PAID_AI_AUTHORIZATION_REQUIRED";
        return;
      }
      const classified = await classifyAssetsWithVision({
        assets: sources.map((item) => ({ assetId: item.assetId, fileName: item.fileName, localPath: item.localPath })),
        metadata,
      });
      classifications = classified.classifications;
      classifyCost = classified;
      if (classified.estimatedUsd > 0) {
        ledger = recordBudgetSpend(ledger, {
          inputTokens: classified.inputTokens,
          outputTokens: classified.outputTokens,
          estimatedUsd: classified.estimatedUsd,
        });
        liveCalls += 1;
      }
    });
  }

  writeFileSync(path.join(REPORTS, "classification.json"), `${JSON.stringify({ metadata, classifications, classifyCost }, null, 2)}\n`);
  const placement = selectEditorialPlacement({
    declaration,
    classifications,
    sources,
    productName: snap.latest?.productName ?? "Product",
  });
  writeFileSync(path.join(REPORTS, "placement.json"), `${JSON.stringify(placement, null, 2)}\n`);

  const reconstructed = await reconstructApprovedPresell(237);
  if (reconstructed.generationId === PREVIOUS_54AI_GEN) {
    throw new Error("New generation reused the 54AI generation id.");
  }
  const storedModel = reconstructed.generationId ? readGenerationModel(reconstructed.generationId) : null;
  if (!reconstructed.generationId || !reconstructed.previewPath || !storedModel) {
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify({ EXECUTION_54AJ_STATUS: "FAILED", reconstructed }, null, 2)}\n`);
    throw new Error(reconstructed.errors.join("; ") || "Reconstruction failed.");
  }
  let model: V4Model = applyDeclaredPresellMedia(storedModel, placement);
  writeGenerationModel(reconstructed.generationId, model);
  const heroMode = v4HeroMode(model.commercialImage);
  const gallery = galleryPresentationOf({ heroMode, galleryImages: model.galleryImages });
  const markup = renderToStaticMarkup(createElement(V4Page, { model }));
  writeFileSync(
    path.join(REPORTS, "generation.json"),
    `${JSON.stringify({
      generationId: reconstructed.generationId,
      previewPath: reconstructed.previewPath,
      heroMode,
      galleryMode: placement.galleryMode,
      selectedHeroAssetId: placement.hero?.assetId ?? null,
      galleryAssetIds: placement.gallery.map((item) => item.assetId),
      contentFingerprint: contentFingerprintOf(model),
      presentationFingerprint: presentationFingerprintOf(model),
      duplicateGallery: galleryHasDuplicateSrc(model.galleryImages, model.commercialImage?.src),
      markupHeroMode: /data-hero-mode="([^"]+)"/.exec(markup)?.[1] ?? null,
    }, null, 2)}\n`,
  );

  const capture = await captureEvaluationScreenshots({
    campaignId: 237,
    generationId: reconstructed.generationId,
    previewPath: reconstructed.previewPath,
    iteration: 1,
  });
  copyShot(capture.desktop?.path, path.join(SHOTS, "desktop-full.png"));
  copyShot(capture.mobile?.path, path.join(SHOTS, "mobile-full.png"));
  copyShot(capture.extras.find((item) => item.path.includes("desktop-hero"))?.path, path.join(SHOTS, "desktop-hero.png"));
  copyShot(capture.extras.find((item) => item.path.includes("mobile-hero"))?.path, path.join(SHOTS, "mobile-hero.png"));
  const bind = validateScreenshotBinding({ generationId: reconstructed.generationId, desktop: capture.desktop, mobile: capture.mobile });
  const inspection = await inspectPreview(`http://127.0.0.1:3000${reconstructed.previewPath}`);
  writeFileSync(path.join(REPORTS, "capture.json"), `${JSON.stringify({ capture, bind, inspection }, null, 2)}\n`);
  if (!bind.ok) {
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify({ EXECUTION_54AJ_STATUS: "QUALITY_NOT_EVALUATED", STOP_REASON: "SCREENSHOT_BINDING_FAILED", bind }, null, 2)}\n`);
    throw new Error("SCREENSHOT_BINDING_FAILED");
  }

  let first: PresellQualityAssessment | null = null;
  let latest: PresellQualityAssessment | null = null;
  let patch = emptyPatch();
  const corrections: string[] = [];
  const constraints = [
    "Use only the four accepted facts.",
    "Do not invent benefits, testimonials, prices, manufacturer, or clinical claims.",
    "Do not generate a fake packshot or alter labels.",
    "SANDBOX is a lab label, not a live commercial hop.",
    "User declaration is PRESELL_USE only and is not an independently verified license.",
  ];

  if (keyConfigured && stopReason !== "PAID_AI_AUTHORIZATION_REQUIRED") {
    await runWithTemporaryPaidAi({ scope: "54AJ", provider: "openai", maxUsd: EXECUTION_54AJ_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) {
        stopReason = "PAID_AI_AUTHORIZATION_REQUIRED";
        return;
      }
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      const evaluate = async (current: V4Model, iteration: number, shots: typeof capture) => {
        const remaining = EXECUTION_54AJ_BUDGET.maxUsd - ledger.spentUsd;
        if (remaining < EXECUTION_54AJ_BUDGET.reserveUsdPerEvaluation) {
          throw new Error("BUDGET_EXCEEDED");
        }
        const assessment = await evaluator.evaluate(
          evaluationInputFromModel({
            campaignId: 237,
            generationId: reconstructed.generationId!,
            model: current,
            screenshots: {
              desktop: shots.extras.find((item) => item.role === "desktop-viewport") ?? shots.desktop,
              mobile: shots.extras.find((item) => item.role === "mobile-viewport") ?? shots.mobile,
            },
            approvedFacts: acceptedFields,
            evidenceReferences: [snap.latest?.runId ?? "research-237"],
            approvedAssets: classifications.map((item) => ({
              id: item.assetId,
              eligible: item.heroEligible,
              kind: item.imageType,
            })),
            editorialConstraints: constraints,
            previewPath: reconstructed.previewPath,
            iteration,
            patch,
          }),
        );
        if (assessment.tokenUsage && assessment.costMetadata.estimatedUsd > 0) {
          ledger = recordBudgetSpend(ledger, {
            inputTokens: assessment.tokenUsage.inputTokens,
            outputTokens: assessment.tokenUsage.outputTokens,
            estimatedUsd: assessment.costMetadata.estimatedUsd,
          });
          liveCalls += 1;
        }
        return assessment;
      };

      first = await evaluate(model, 1, capture);
      latest = first;
      writeFileSync(path.join(REPORTS, "eval-1.json"), `${JSON.stringify(first, null, 2)}\n`);
      stopReason = first.assessmentStatus === "QUALITY_PASSED" ? "QUALITY_PASSED" : "NO_SCORE_IMPROVEMENT";

      let currentCapture = capture;
      for (let round = 1; round <= EXECUTION_54AJ_BUDGET.maxCorrectionRounds; round += 1) {
        if (!latest || latest.assessmentStatus === "QUALITY_PASSED") break;
        if (liveCalls >= 1 + EXECUTION_54AJ_BUDGET.maxCampaignEvals) break;
        if (ledger.spentUsd + EXECUTION_54AJ_BUDGET.reserveUsdPerEvaluation > EXECUTION_54AJ_BUDGET.maxUsd) {
          stopReason = "BUDGET_EXCEEDED";
          break;
        }
        const classified = classifyQualityFixes({
          assessment: latest,
          heroEligible: placement.status === "SELECTED",
          previous: patch,
        });
        const lowRisk = classified.applied.filter((code) => code === "TIGHTEN_HERO_LAYOUT" || code === "QUIET_SANDBOX_CTA");
        const safePatch = { ...classified, applied: lowRisk, galleryLead: false };
        if (!hasNewAllowedFix(patch, safePatch) || lowRisk.length === 0) {
          stopReason = latest.overallScore >= PREVIOUS_54AI_SCORE ? "NO_ALLOWED_FIXES" : "NO_SCORE_IMPROVEMENT";
          break;
        }
        patch = safePatch;
        corrections.push(...lowRisk);
        model = applyQualityPatch(model, patch);
        writeGenerationModel(reconstructed.generationId!, model);
        currentCapture = await captureEvaluationScreenshots({
          campaignId: 237,
          generationId: reconstructed.generationId!,
          previewPath: reconstructed.previewPath!,
          iteration: round + 1,
        });
        copyShot(currentCapture.desktop?.path, path.join(SHOTS, `desktop-full-r${round}.png`));
        copyShot(currentCapture.mobile?.path, path.join(SHOTS, `mobile-full-r${round}.png`));
        const rebind = validateScreenshotBinding({
          generationId: reconstructed.generationId!,
          desktop: currentCapture.desktop,
          mobile: currentCapture.mobile,
        });
        if (!rebind.ok) {
          stopReason = "SCREENSHOT_BINDING_FAILED";
          break;
        }
        latest = await evaluate(model, round + 1, currentCapture);
        writeFileSync(path.join(REPORTS, `eval-${round + 1}.json`), `${JSON.stringify(latest, null, 2)}\n`);
        if (latest.assessmentStatus === "QUALITY_PASSED") {
          stopReason = "QUALITY_PASSED";
          break;
        }
        if ((first?.overallScore ?? 0) >= (latest.overallScore ?? 0)) {
          stopReason = "NO_SCORE_IMPROVEMENT";
          break;
        }
        stopReason = "CORRECTION_REASSESSED";
      }
    });
  }

  const after = campaignIntegritySnapshot(237);
  const qualityStatus = !keyConfigured || stopReason === "PAID_AI_AUTHORIZATION_REQUIRED"
    ? "QUALITY_NOT_EVALUATED"
    : latest?.assessmentStatus ?? "QUALITY_REJECTED";
  const summary = {
    EXECUTION_54AJ_STATUS: qualityStatus,
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    USER_AUTHORIZATION_RECORDED: true,
    AUTHORIZATION_SCOPE: declaration.authorizationScope,
    AUTHORIZATION_VERIFICATION: declaration.verificationStatus,
    TOTAL_ASSETS: discovered.length,
    ASSETS_AUTHORIZED_FOR_PRESELL: assetIds.length,
    HERO_CANDIDATES: placement.heroCandidates.length,
    HERO_ELIGIBLE_ASSETS: placement.heroEligibleAssetIds.length,
    SELECTED_HERO_ASSET_ID: placement.hero?.assetId ?? null,
    HERO_MODE: heroMode,
    GALLERY_MODE: placement.galleryMode,
    NEW_GENERATION_ID: reconstructed.generationId,
    DESKTOP_SCREENSHOT: path.join(SHOTS, "desktop-full.png").replace(/\\/g, "/"),
    MOBILE_SCREENSHOT: path.join(SHOTS, "mobile-full.png").replace(/\\/g, "/"),
    SCREENSHOT_BINDING_VALID: bind.ok,
    OPENAI_PROVIDER: "openai",
    OPENAI_MODEL: OPENAI_VISION_MODEL,
    PROMPT_VERSION: QUALITY_PROMPT_VERSION,
    REAL_OPENAI_VALIDATION: Boolean(first),
    PREVIOUS_SCORE: PREVIOUS_54AI_SCORE,
    INITIAL_NEW_SCORE: first?.overallScore ?? null,
    FINAL_SCORE: latest?.overallScore ?? null,
    QUALITY_TARGET,
    DESIGN_HIERARCHY: dim(latest, "DESIGN_HIERARCHY"),
    COPY_CLARITY: dim(latest, "COPY_CLARITY"),
    DEPTH_ORGANIZATION: dim(latest, "DEPTH_ORGANIZATION"),
    IMAGES_COMPOSITION: dim(latest, "IMAGES_COMPOSITION"),
    MOBILE_EXPERIENCE: dim(latest, "MOBILE_EXPERIENCE"),
    TRANSPARENCY_LEGIBILITY: dim(latest, "TRANSPARENCY_LEGIBILITY"),
    AUTO_CORRECTIONS_APPLIED: corrections,
    REAL_OPENAI_CALLS: liveCalls,
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: stopReason,
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    UNAPPROVED_FACTS_USED: acceptedFields.filter((field) => !["description", "ingredients", "howItWorks", "guarantee"].includes(field)),
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    FINAL_QUALITY_STATUS: qualityStatus,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    ADS_AUTHORIZED: declarationAuthorizesAds(declaration),
    paidBefore,
    rubricVersion: QUALITY_RUBRIC_VERSION,
    inspection,
    classifyCost,
  };
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    path.join(REPORTS, "execution-summary.md"),
    `# 54AJ authorized product images

Generation ${reconstructed.generationId}
Hero mode: ${heroMode}
Selected hero: ${placement.hero?.assetId ?? "none"}
Initial: ${first?.overallScore ?? "n/a"}
Final: ${latest?.overallScore ?? "n/a"}
Previous 54AI: ${PREVIOUS_54AI_SCORE}
Calls: ${liveCalls}
Cost: $${ledger.spentUsd}
Stop: ${stopReason}
`,
  );
  console.log(
    `54AJ status=${summary.EXECUTION_54AJ_STATUS} gen=${reconstructed.generationId} hero=${heroMode} score=${latest?.overallScore ?? "n/a"} calls=${liveCalls} cost=${ledger.spentUsd} stop=${stopReason}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
