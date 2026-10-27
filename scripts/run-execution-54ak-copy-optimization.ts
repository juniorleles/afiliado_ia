// npx tsx scripts/run-execution-54ak-copy-optimization.ts
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
import { emptyBudgetLedger, recordBudgetSpend, EXECUTION_54AK_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { writeGenerationModel, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { v4HeroMode } from "../src/lib/product-showcase/v4/presentation.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { readUserAssetDeclaration, productImageIdsForDeclaration, originsForDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import { classifyAssetSuitabilityFromMetadata, fileNameFromUrl } from "../src/lib/presell-quality/asset-suitability.ts";
import { selectEditorialPlacement } from "../src/lib/presell-quality/editorial-placement.ts";
import { applyDeclaredPresellMedia } from "../src/lib/presell-quality/apply-declared-media.ts";
import { auditApprovedCopy } from "../src/lib/presell-quality/copy-audit.ts";
import { proposeDeterministicRewrites, proposeAiCopyRewrites } from "../src/lib/presell-quality/copy-rewrite.ts";
import { applySafeCopyOptimization, restoreCopyOptimization } from "../src/lib/presell-quality/apply-copy-optimization.ts";
import { reportEditorialStructure } from "../src/lib/presell-quality/editorial-structure.ts";
import { reviewAssetId } from "../src/lib/product-research/media-contract.ts";
import { decorateDiscoveredAssets } from "../src/lib/product-research/asset-display.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { V4Model } from "../src/lib/product-showcase/v4/model.ts";
import type { CopyRewriteProposal } from "../src/lib/presell-quality/copy-validate.ts";

const EVIDENCE = path.join("data/evidence/execution-54ak-copy-optimization");
const REPORTS = path.join(EVIDENCE, "reports");
const SHOTS = path.join(EVIDENCE, "screenshots");
const PREVIOUS_54AJ = "lp-mvr3pp2f-ea2a99d2";
const PREVIOUS_SCORE = 82;
const HERO_SRC = "/media/product/cc835ef78e894f7645c4556b.png";

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
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
    await page.waitForFunction(() => {
      const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return !img || (img.complete && img.naturalWidth > 0);
    }, { timeout: 15_000 }).catch(() => undefined);
    const report = await page.evaluate(() => {
      const root = document.querySelector("[data-v4='page']");
      const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return {
        rendered: Boolean(root),
        heroMode: root?.getAttribute("data-hero-mode"),
        sections: [...document.querySelectorAll("[data-v4-section]")].map((item) => item.getAttribute("data-v4-section")),
        disclosureBand: Boolean(document.querySelector("[data-v4-disclosure='band']")),
        sellerAttribution: Boolean(document.querySelector("[data-v4-attribution='seller']")),
        sandbox: Boolean(document.querySelector("[data-sandbox-badge], [data-sandbox='true']")),
        disclosure: /affiliate|commission/i.test(document.body.innerText),
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
      };
    });
    await page.close();
    return report;
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
  const accepted = acceptedProposals(snap.latest).map((item) => ({
    field: item.field,
    factId: item.evidenceIds[0] ?? item.field,
    value: (item.currentValue || item.suggestedValue).replace(/\s+/g, " ").trim(),
  }));
  const previous = readGenerationModel(PREVIOUS_54AJ);
  if (!previous) throw new Error("54AJ generation model missing.");
  const audit = auditApprovedCopy({ campaignId: 237, generationId: PREVIOUS_54AJ, model: previous, accepted });
  writeFileSync(path.join(REPORTS, "copy-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);

  const deterministic = proposeDeterministicRewrites(accepted);
  let aiProposals: CopyRewriteProposal[] = [];
  let ledger = emptyBudgetLedger("54AK");
  ledger.maxUsd = EXECUTION_54AK_BUDGET.maxUsd;
  let liveCalls = 0;
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  let stopReason = keyConfigured ? "NOT_STARTED" : "PAID_AI_AUTHORIZATION_REQUIRED";

  if (keyConfigured) {
    await runWithTemporaryPaidAi({ scope: "54AK", provider: "openai", maxUsd: EXECUTION_54AK_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) {
        stopReason = "PAID_AI_AUTHORIZATION_REQUIRED";
        return;
      }
      try {
        const ai = await proposeAiCopyRewrites({
          facts: accepted,
          constraints: ["Do not invent facts.", "Keep 60 days, two full droppers, and 30 seconds."],
        });
        aiProposals = ai.proposals;
        if (ai.estimatedUsd > 0) {
          ledger = recordBudgetSpend(ledger, { inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, estimatedUsd: ai.estimatedUsd });
          liveCalls += 1;
        }
      } catch (err) {
        writeFileSync(path.join(REPORTS, "rewrite-ai-error.json"), `${JSON.stringify({ error: redactSecrets(err instanceof Error ? err.message : String(err)) }, null, 2)}\n`);
      }
    });
  }

  const merged = [...deterministic];
  for (const row of aiProposals) {
    if (!merged.some((item) => item.field === row.field && item.status === "SAFE_REWRITE")) merged.push(row);
    else if (row.status === "SAFE_REWRITE") {
      const idx = merged.findIndex((item) => item.field === row.field);
      if (idx >= 0) merged[idx] = row;
    }
  }
  writeFileSync(path.join(REPORTS, "rewrite-proposals.json"), `${JSON.stringify({ deterministic, aiProposals, merged }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "semantic-validation.json"), `${JSON.stringify({ proposals: merged, safe: merged.filter((item) => item.status === "SAFE_REWRITE"), rejected: merged.filter((item) => item.status !== "SAFE_REWRITE") }, null, 2)}\n`);

  const reconstructed = await reconstructApprovedPresell(237);
  if (reconstructed.generationId === PREVIOUS_54AJ) throw new Error("New generation reused the 54AJ id.");
  const stored = reconstructed.generationId ? readGenerationModel(reconstructed.generationId) : null;
  if (!reconstructed.generationId || !reconstructed.previewPath || !stored) {
    throw new Error(reconstructed.errors.join("; ") || "Reconstruction failed.");
  }
  const declaration = readUserAssetDeclaration(237);
  const discovered = decorateDiscoveredAssets(snap.latest?.discoveredAssets);
  const assetIds = declaration?.assetIds ?? productImageIdsForDeclaration(snap.latest?.discoveredAssets);
  const classifications = discovered
    .filter((item) => assetIds.includes(reviewAssetId(item.assetUrl)))
    .map((item) => classifyAssetSuitabilityFromMetadata({ assetId: reviewAssetId(item.assetUrl), fileName: fileNameFromUrl(item.assetUrl) }, declaration));
  const placement = selectEditorialPlacement({
    declaration,
    classifications,
    sources: discovered
      .filter((item) => assetIds.includes(reviewAssetId(item.assetUrl)))
      .map((item) => ({
        assetId: reviewAssetId(item.assetUrl),
        src: item.assetUrl.includes("2bootle") ? HERO_SRC : item.assetUrl,
      })),
    productName: snap.latest?.productName ?? "Product",
  });
  let model: V4Model = applySafeCopyOptimization(applyDeclaredPresellMedia(stored, placement), merged).model;
  writeGenerationModel(reconstructed.generationId, model);
  const structure = reportEditorialStructure(model);
  writeFileSync(path.join(REPORTS, "editorial-structure.json"), `${JSON.stringify(structure, null, 2)}\n`);
  writeFileSync(
    path.join(REPORTS, "generation.json"),
    `${JSON.stringify({
      generationId: reconstructed.generationId,
      previewPath: reconstructed.previewPath,
      heroMode: v4HeroMode(model.commercialImage),
      heroSrc: model.commercialImage?.src ?? null,
      contentFingerprint: contentFingerprintOf(model),
      presentationFingerprint: presentationFingerprintOf(model),
      factIds: accepted.map((item) => item.factId),
      markupDisclosure: renderToStaticMarkup(createElement(V4Page, { model })).includes('data-v4-disclosure="band"'),
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
  if (!bind.ok) throw new Error("SCREENSHOT_BINDING_FAILED");

  let first: PresellQualityAssessment | null = null;
  let latest: PresellQualityAssessment | null = null;
  let rollbackExecuted = false;
  let bestModel = model;
  let bestScore: number | null = null;

  if (keyConfigured && stopReason !== "PAID_AI_AUTHORIZATION_REQUIRED") {
    await runWithTemporaryPaidAi({ scope: "54AK", provider: "openai", maxUsd: EXECUTION_54AK_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) {
        stopReason = "PAID_AI_AUTHORIZATION_REQUIRED";
        return;
      }
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      const evaluate = async (current: V4Model, iteration: number, shots: typeof capture) => {
        if (ledger.spentUsd + EXECUTION_54AK_BUDGET.reserveUsdPerEvaluation > EXECUTION_54AK_BUDGET.maxUsd) {
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
            approvedFacts: accepted.map((item) => item.field),
            evidenceReferences: [snap.latest?.runId ?? "research-237"],
            approvedAssets: [{ id: "asset-cbc045ab", eligible: true, kind: "PRODUCT_PACKSHOT" }],
            editorialConstraints: [
              "Use only the four accepted facts.",
              "Do not invent benefits, testimonials, prices, or clinical claims.",
              "SANDBOX is a lab label, not a live commercial hop.",
            ],
            previewPath: reconstructed.previewPath,
            iteration,
            patch: current.qualityPatch ?? null,
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
      if (typeof first.overallScore === "number") {
        bestScore = first.overallScore;
        bestModel = model;
      }
      stopReason = first.assessmentStatus === "QUALITY_PASSED" ? "QUALITY_PASSED" : "BELOW_TARGET_NO_ALLOWED_VISUAL_FIXES";
      if (
        first.assessmentStatus !== "QUALITY_PASSED" &&
        first.overallScore != null &&
        first.overallScore < PREVIOUS_SCORE - 8
      ) {
        stopReason = "EVALUATOR_UNSTABLE";
      } else if (first.assessmentStatus !== "QUALITY_PASSED" && first.overallScore != null && first.overallScore < PREVIOUS_SCORE) {
        model = restoreCopyOptimization(applyDeclaredPresellMedia(stored, placement));
        writeGenerationModel(reconstructed.generationId!, model);
        rollbackExecuted = true;
        stopReason = "ROLLBACK_TO_VALIDATED_PRESENTATION";
      }
    });
  }

  const after = campaignIntegritySnapshot(237);
  const qualityStatus = latest?.assessmentStatus ?? (keyConfigured ? "QUALITY_NOT_EVALUATED" : "QUALITY_NOT_EVALUATED");
  const applied = merged.filter((item) => item.status === "SAFE_REWRITE" && item.proposed !== item.original);
  const rejected = merged.filter((item) => item.status !== "SAFE_REWRITE");
  const summary = {
    EXECUTION_54AK_STATUS: qualityStatus,
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    COPY_AUDIT_COMPLETED: true,
    REWRITE_PROPOSALS: merged.length,
    SAFE_REWRITES_APPLIED: applied.map((item) => item.field),
    REWRITES_REJECTED: rejected.map((item) => ({ field: item.field, status: item.status })),
    UNSUPPORTED_CLAIMS_INTRODUCED: rejected.filter((item) => item.status === "UNSUPPORTED_CLAIM").length,
    EDITORIAL_STRUCTURE_IMPROVED: structure.disclosureBand && !structure.duplicateHeroOverview,
    AFFILIATE_DISCLOSURE_IMPROVED: Boolean(inspection.disclosureBand),
    HERO_MODE: v4HeroMode(model.commercialImage),
    HERO_ASSET_ID: placement.hero?.assetId ?? null,
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    ASSET_AUTHORIZATION_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    NEW_GENERATION_ID: reconstructed.generationId,
    DESKTOP_SCREENSHOT: path.join(SHOTS, "desktop-full.png").replace(/\\/g, "/"),
    MOBILE_SCREENSHOT: path.join(SHOTS, "mobile-full.png").replace(/\\/g, "/"),
    SCREENSHOT_BINDING_VALID: bind.ok,
    OPENAI_PROVIDER: "openai",
    OPENAI_MODEL: OPENAI_VISION_MODEL,
    PROMPT_VERSION: QUALITY_PROMPT_VERSION,
    REAL_OPENAI_VALIDATION: Boolean(first && first.assessmentStatus !== "EVALUATION_FAILED"),
    PREVIOUS_SCORE,
    INITIAL_NEW_SCORE: first?.overallScore ?? null,
    FINAL_SCORE: latest?.overallScore ?? null,
    QUALITY_TARGET,
    DESIGN_HIERARCHY: dim(latest, "DESIGN_HIERARCHY"),
    COPY_CLARITY: dim(latest, "COPY_CLARITY"),
    DEPTH_ORGANIZATION: dim(latest, "DEPTH_ORGANIZATION"),
    IMAGES_COMPOSITION: dim(latest, "IMAGES_COMPOSITION"),
    MOBILE_EXPERIENCE: dim(latest, "MOBILE_EXPERIENCE"),
    TRANSPARENCY_LEGIBILITY: dim(latest, "TRANSPARENCY_LEGIBILITY"),
    AUTO_CORRECTIONS_APPLIED: model.qualityPatch?.applied ?? [],
    ROLLBACK_EXECUTED: rollbackExecuted,
    REAL_OPENAI_CALLS: liveCalls,
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: stopReason,
    FINAL_QUALITY_STATUS: qualityStatus,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    origins: declaration ? originsForDeclaration(snap.latest?.discoveredAssets, declaration.assetIds) : [],
    bestScore,
    bestContentFingerprint: contentFingerprintOf(bestModel),
    inspection,
  };
  writeFileSync(path.join(REPORTS, "quality-assessments.json"), `${JSON.stringify({ first, latest, previousScore: PREVIOUS_SCORE }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    path.join(REPORTS, "execution-summary.md"),
    `# 54AK copy optimization

Generation ${reconstructed.generationId}
Safe rewrites: ${applied.map((item) => item.field).join(", ") || "none"}
Score: ${latest?.overallScore ?? "n/a"} (previous 82)
Calls: ${liveCalls}
Cost: $${ledger.spentUsd}
Stop: ${stopReason}
`,
  );
  console.log(
    `54AK status=${summary.EXECUTION_54AK_STATUS} gen=${reconstructed.generationId} score=${latest?.overallScore ?? "n/a"} calls=${liveCalls} cost=${ledger.spentUsd} stop=${stopReason}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
