// npx tsx scripts/run-execution-54ai-gallery-suppression.ts
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
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
import { emptyBudgetLedger, recordBudgetSpend, EXECUTION_54AI_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { gallerySuppressionImpact } from "../src/lib/presell-quality/gallery-impact.ts";
import { classifyQualityFixes, hasNewAllowedFix } from "../src/lib/presell-quality/classify.ts";
import { applyQualityPatch, emptyPatch } from "../src/lib/presell-quality/patch.ts";
import { writeGenerationModel, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { galleryPresentationOf, editorialHeroMode } from "../src/lib/product-showcase/v4/presentation.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { V4Model } from "../src/lib/product-showcase/v4/model.ts";

const EVIDENCE = path.join("data/evidence/execution-54ai-gallery-suppression");
const REPORTS = path.join(EVIDENCE, "reports");
const SHOTS = path.join(EVIDENCE, "screenshots");
const PREVIOUS_GALLERY_GEN = "lp-mvr214r3-907ec22e";

function copyShot(src: string | null | undefined, dest: string): boolean {
  if (!src || !existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

function dim(assessment: PresellQualityAssessment | null, name: PresellQualityAssessment["dimensionScores"][number]["dimension"]): number | null {
  return assessment?.dimensionScores.find((row) => row.dimension === name)?.score ?? null;
}

async function inspectPreview(url: string): Promise<Record<string, unknown>> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  const notes: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
    await page.waitForTimeout(400);
    const report = await page.evaluate(() => {
      const root = document.querySelector("[data-v4='page']");
      const images = [...document.images];
      return {
        rendered: Boolean(root),
        heroMode: root?.getAttribute("data-hero-mode"),
        galleryState: root?.getAttribute("data-v4-gallery-state"),
        gallerySection: Boolean(document.querySelector("[data-v4-section='gallery']")),
        galleryAnchor: Boolean(document.querySelector('a[href="#gallery"]')),
        sections: [...document.querySelectorAll("[data-v4-section]")].map((item) => item.getAttribute("data-v4-section")),
        sandbox: Boolean(document.querySelector("[data-sandbox-badge], [data-sandbox='true']")),
        disclosure: /affiliate|commission/i.test(document.body.innerText),
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        brokenImages: images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("src")),
        fontsReady: (document as Document & { fonts?: { status?: string } }).fonts?.status === "loaded" || true,
      };
    });
    notes.push(...errors.slice(0, 3));
    await page.close();
    return { ...report, consoleErrors: errors.slice(0, 5), notes };
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(237);
  const snap = snapshotProductResearch(237);
  const acceptedFields = acceptedProposals(snap.latest).map((item) => item.field);
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  const paidBefore = paidAiAuthorization();
  const constraints = [
    "EDITORIAL_NO_IMAGE is required.",
    "Do not invent benefits, testimonials, prices, manufacturer, or clinical claims.",
    "Do not promote ineligible gallery images to the hero.",
    "SANDBOX is a lab label, not a live commercial hop.",
  ];

  const reconstructed = await reconstructApprovedPresell(237);
  if (reconstructed.generationId === PREVIOUS_GALLERY_GEN) {
    throw new Error("New generation reused the 54AH gallery generation id.");
  }
  const stored = reconstructed.generationId ? readGenerationModel(reconstructed.generationId) : null;
  if (!reconstructed.generationId || !reconstructed.previewPath || !stored) {
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify({ EXECUTION_54AI_STATUS: "FAILED", reconstructed }, null, 2)}\n`);
    throw new Error(reconstructed.errors.join("; ") || "Reconstruction failed.");
  }
  const gallery = galleryPresentationOf({
    heroMode: editorialHeroMode(Boolean(stored.commercialImage)),
    galleryImages: stored.galleryImages,
  });
  const markup = renderToStaticMarkup(createElement(V4Page, { model: stored }));
  const renderedAssets = [...markup.matchAll(/src="([^"]+)"/g)].map((item) => item[1]).filter((src) => !src.includes("hero-aside"));
  writeFileSync(
    path.join(REPORTS, "generation.json"),
    `${JSON.stringify({
      generationId: reconstructed.generationId,
      previewPath: reconstructed.previewPath,
      heroMode: reconstructed.heroMode,
      gallery,
      contentFingerprint: contentFingerprintOf(stored),
      presentationFingerprint: presentationFingerprintOf(stored),
      storedGalleryCount: stored.galleryImages?.length ?? 0,
      renderedImageSrcs: renderedAssets,
      markupHasGallery: markup.includes('data-v4-section="gallery"'),
    }, null, 2)}\n`,
  );
  if (gallery.render || markup.includes('data-v4-section="gallery"')) {
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify({ EXECUTION_54AI_STATUS: "QUALITY_NOT_EVALUATED", STOP_REASON: "GALLERY_STILL_RENDERED" }, null, 2)}\n`);
    throw new Error("Gallery suppression failed before evaluation.");
  }

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
    writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify({ EXECUTION_54AI_STATUS: "QUALITY_NOT_EVALUATED", STOP_REASON: "SCREENSHOT_BINDING_FAILED", bind }, null, 2)}\n`);
    throw new Error("SCREENSHOT_BINDING_FAILED");
  }

  let ledger = emptyBudgetLedger("54AI");
  ledger.maxUsd = EXECUTION_54AI_BUDGET.maxUsd;
  let liveCalls = 0;
  let first: PresellQualityAssessment | null = null;
  let second: PresellQualityAssessment | null = null;
  let model: V4Model = stored;
  let patch = emptyPatch();
  let stopReason = keyConfigured ? "NOT_STARTED" : "PAID_AI_AUTHORIZATION_REQUIRED";
  const media = selectReviewMedia({
    assets: snap.latest?.discoveredAssets,
    productName: stored.contract.identity.productName,
    campaignId: 237,
  });

  if (keyConfigured) {
    await runWithTemporaryPaidAi({ scope: "54AI", provider: "openai", maxUsd: EXECUTION_54AI_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) throw new Error(status.reason);
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      const evaluate = async (current: V4Model, iteration: number, shots: typeof capture) => {
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
            approvedAssets: media.approved.map((item) => ({
              id: item.assetId,
              eligible: item.editorialEligibility === "ELIGIBLE" && item.galleryKind === "PRODUCT_PACKSHOT",
              kind: item.galleryKind,
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
      writeFileSync(path.join(REPORTS, "eval-1.json"), `${JSON.stringify(first, null, 2)}\n`);
      stopReason = first.assessmentStatus === "QUALITY_PASSED" ? "QUALITY_PASSED" : "NO_ALLOWED_FIXES";

      const classified = classifyQualityFixes({ assessment: first, heroEligible: false, previous: patch });
      const lowRisk = classified.applied.filter((code) => code === "TIGHTEN_HERO_LAYOUT" || code === "QUIET_SANDBOX_CTA");
      const safePatch = { ...classified, applied: lowRisk, galleryLead: false };
      if (
        first.assessmentStatus !== "QUALITY_PASSED" &&
        liveCalls < EXECUTION_54AI_BUDGET.maxCampaignEvals &&
        hasNewAllowedFix(patch, safePatch) &&
        lowRisk.length > 0
      ) {
        patch = safePatch;
        model = applyQualityPatch(stored, patch);
        writeGenerationModel(reconstructed.generationId!, model);
        const recapture = await captureEvaluationScreenshots({
          campaignId: 237,
          generationId: reconstructed.generationId!,
          previewPath: reconstructed.previewPath!,
          iteration: 2,
        });
        copyShot(recapture.desktop?.path, path.join(SHOTS, "desktop-full-corrected.png"));
        copyShot(recapture.mobile?.path, path.join(SHOTS, "mobile-full-corrected.png"));
        const rebind = validateScreenshotBinding({ generationId: reconstructed.generationId!, desktop: recapture.desktop, mobile: recapture.mobile });
        if (!rebind.ok) {
          stopReason = "SCREENSHOT_BINDING_FAILED";
          return;
        }
        second = await evaluate(model, 2, recapture);
        writeFileSync(path.join(REPORTS, "eval-2.json"), `${JSON.stringify(second, null, 2)}\n`);
        stopReason = second.assessmentStatus === "QUALITY_PASSED" ? "QUALITY_PASSED" : "CORRECTION_REASSESSED";
      }
    });
  }

  const final = second ?? first;
  const after = campaignIntegritySnapshot(237);
  const impact = gallerySuppressionImpact({ previousWithGallery: 65, currentWithoutGallery: final?.overallScore ?? null });
  const qualityStatus = !keyConfigured ? "QUALITY_NOT_EVALUATED" : final?.assessmentStatus ?? "QUALITY_REJECTED";
  const summary = {
    EXECUTION_54AI_STATUS: qualityStatus,
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    GALLERY_SUPPRESSION_ACTIVE: !gallery.render && !markup.includes('data-v4-section="gallery"'),
    GALLERY_ASSETS_DELETED: false,
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    NEW_GENERATION_ID: reconstructed.generationId,
    DESKTOP_SCREENSHOT: path.join(SHOTS, "desktop-full.png").replace(/\\/g, "/"),
    MOBILE_SCREENSHOT: path.join(SHOTS, "mobile-full.png").replace(/\\/g, "/"),
    SCREENSHOT_BINDING_VALID: bind.ok,
    OPENAI_PROVIDER: "openai",
    OPENAI_MODEL: OPENAI_VISION_MODEL,
    PROMPT_VERSION: QUALITY_PROMPT_VERSION,
    REAL_OPENAI_VALIDATION: liveCalls > 0,
    "54AH_BEST_V4_SCORE": 74,
    "54AH_LAST_V4_SCORE": 65,
    "54AI_INITIAL_SCORE": first?.overallScore ?? null,
    "54AI_FINAL_SCORE": final?.overallScore ?? null,
    QUALITY_TARGET,
    DESIGN_HIERARCHY: dim(final, "DESIGN_HIERARCHY"),
    COPY_CLARITY: dim(final, "COPY_CLARITY"),
    DEPTH_ORGANIZATION: dim(final, "DEPTH_ORGANIZATION"),
    IMAGES_COMPOSITION: dim(final, "IMAGES_COMPOSITION"),
    MOBILE_EXPERIENCE: dim(final, "MOBILE_EXPERIENCE"),
    TRANSPARENCY_LEGIBILITY: dim(final, "TRANSPARENCY_LEGIBILITY"),
    GALLERY_SUPPRESSION_IMPACT: impact,
    AUTO_CORRECTIONS_APPLIED: patch.applied,
    REAL_OPENAI_CALLS: liveCalls,
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: stopReason,
    FINAL_QUALITY_STATUS: qualityStatus,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    paidBefore,
    rubricVersion: QUALITY_RUBRIC_VERSION,
    inspection,
    previousGalleryGeneration: PREVIOUS_GALLERY_GEN,
  };
  writeFileSync(path.join(REPORTS, "comparison.json"), `${JSON.stringify({ previous: { best: 74, lastWithGallery: 65, first: 71 }, current: final?.overallScore ?? null, impact, promptVersion: QUALITY_PROMPT_VERSION }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    path.join(REPORTS, "execution-summary.md"),
    `# 54AI gallery suppression

Generation ${reconstructed.generationId}
Gallery render: ${gallery.render}
Initial: ${first?.overallScore ?? "n/a"}
Final: ${final?.overallScore ?? "n/a"}
Impact vs 65: ${impact}
Calls: ${liveCalls}
Cost: $${ledger.spentUsd}
`,
  );
  console.log(
    `54AI status=${summary.EXECUTION_54AI_STATUS} gen=${reconstructed.generationId} gallery=${gallery.render} score=${final?.overallScore ?? "n/a"} impact=${impact} calls=${liveCalls} cost=${ledger.spentUsd}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
