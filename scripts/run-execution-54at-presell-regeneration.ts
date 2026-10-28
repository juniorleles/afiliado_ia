// npx tsx scripts/run-execution-54at-presell-regeneration.ts
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
import { evaluationInputFromModel, contentFingerprintOf, presentationFingerprintOf, renderedCopyFromModel } from "../src/lib/presell-quality/context.ts";
import { reconstructApprovedPresell } from "../src/lib/presell-quality/reconstruct.ts";
import {
  EXECUTION_54AT_BUDGET,
  EXECUTION_54AT_ID,
  emptyExecutionBudgetLedger,
  reservePaidCall,
  consumePaidCall,
  consumeReservedAsUnverified,
  closeExecutionBudget,
  writeExecutionBudgetLedger,
  estimateVisionCallUsd,
} from "../src/lib/presell-quality/execution-budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { writeGenerationModel, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { v4HeroMode } from "../src/lib/product-showcase/v4/presentation.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import { classifyAssetSuitabilityFromMetadata, fileNameFromUrl } from "../src/lib/presell-quality/asset-suitability.ts";
import { selectEditorialPlacement } from "../src/lib/presell-quality/editorial-placement.ts";
import { applyDeclaredPresellMedia } from "../src/lib/presell-quality/apply-declared-media.ts";
import { materializeProductImage } from "../src/lib/product-image.ts";
import { localMediaRoot } from "../src/lib/storage/local.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { enrichApprovedFactsForGeneration } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { evaluateContentSafety, disableCommercialCta, hydrateFaqSection } from "../src/lib/presell-quality/content-safety.ts";
import { selectApprovedPackshot, botanicalAssetIds } from "../src/lib/presell-quality/approved-packshot.ts";
import { compareAgainstBaseline } from "../src/lib/presell-quality/baseline-comparison.ts";
import { diagnoseEvaluatorPair } from "../src/lib/presell-quality/assessment-validity.ts";
import { currentSalesUrl } from "../src/lib/campaign-sources/present.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { getCampaignById } from "../src/lib/campaigns.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { V4Model } from "../src/lib/product-showcase/v4/model.ts";

const CAMPAIGN_ID = 237;
const EVIDENCE = path.join("data/evidence/execution-54at-presell-regeneration");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASELINE_GENERATION_ID = "lp-mvr3pp2f-ea2a99d2";
const BASELINE_SCORE = 82;
const LOCAL_BASE = "http://127.0.0.1:3000";

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

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
    await page.waitForFunction(() => {
      const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return !img || (img.complete && img.naturalWidth > 0);
    }, { timeout: 15_000 }).catch(() => undefined);
    const report = await page.evaluate(() => {
      const root = document.querySelector("[data-v4='page']");
      const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
        [...document.querySelectorAll("details")].forEach((item) => {
          item.setAttribute("open", "");
        });
        const text = `${document.body.innerText} ${document.body.textContent ?? ""}`;
      return {
        rendered: Boolean(root),
        title: document.title,
        heroMode: root?.getAttribute("data-hero-mode"),
        sections: [...document.querySelectorAll("[data-v4-section]")].map((item) => item.getAttribute("data-v4-section")),
        sandbox: Boolean(document.querySelector("[data-sandbox-badge], [data-sandbox='true']")),
        disclosure: /affiliate|commission/i.test(text),
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        hopHref: (document.querySelector("[data-v4-hop]") as HTMLAnchorElement | null)?.getAttribute("href") ?? null,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
        heroSrc: heroImg?.getAttribute("src") ?? null,
        hasShipping: /5 to 10 days|24 working hours/i.test(text),
        hasPayment: /one[- ]time payment/i.test(text),
        hasSslQualifier: /not independent proof/i.test(text),
        hasEmptyBottles: /empty bottles/i.test(text),
        has60Days: /60 days/i.test(text),
        hasManufacturer: /manufactured in the united states/i.test(text),
      };
    });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await mobile.locator("[data-v4='page']").waitFor({ timeout: 25_000 });
    const mobileReport = await mobile.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      heroMode: document.querySelector("[data-v4='page']")?.getAttribute("data-hero-mode"),
    }));
    await page.close();
    await mobile.close();
    return { ...report, mobileOverflowX: mobileReport.overflowX, mobileHeroMode: mobileReport.heroMode, consoleErrors: errors.slice(0, 5) };
  } finally {
    await browser.close();
  }
}

function visualMarkdown(kind: "desktop" | "mobile", inspection: Record<string, unknown>, captureOk: boolean): string {
  return [
    `# ${kind} visual review — 54AT`,
    "",
    `- Viewport: ${kind === "desktop" ? "1440x900" : "390x844"}`,
    `- Rendered: ${inspection.rendered ? "yes" : "no"}`,
    `- Hero mode: ${kind === "desktop" ? inspection.heroMode : inspection.mobileHeroMode}`,
    `- Hero loaded: ${inspection.heroLoaded ? "yes" : "no"}`,
    `- Horizontal overflow: ${kind === "desktop" ? inspection.overflowX : inspection.mobileOverflowX}`,
    `- Capture: ${captureOk ? "ok" : "failed"}`,
    `- Commercial hop: ${inspection.liveHop ? "YES" : "no"}`,
    `- Shipping estimate visible: ${inspection.hasShipping ? "yes" : "no"}`,
    `- One-time payment visible: ${inspection.hasPayment ? "yes" : "no"}`,
    `- SSL qualifier visible: ${inspection.hasSslQualifier ? "yes" : "no"}`,
    `- 60-day guarantee visible: ${inspection.has60Days ? "yes" : "no"}`,
    "",
    "No commercial CTA was clicked. No affiliate hop was used.",
    "",
  ].join("\n");
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  const baseCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(CAMPAIGN_ID);
  const snap = snapshotProductResearch(CAMPAIGN_ID);
  const integrity = validatePersistedProductContract(CAMPAIGN_ID, snap.latest);
  writeJson(path.join(EVIDENCE, "contract-validation.json"), integrity);

  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || snap.latest?.seeds.find((item) => /^https?:\/\//i.test(item)) || "";
  const productName = snap.latest?.productName || getCampaignById(CAMPAIGN_ID)?.name || "Product";
  const enriched = enrichApprovedFactsForGeneration({
    run: snap.latest,
    productName,
    sourceUrl: salesUrl,
  });
  const manifest = buildContentManifest({
    campaignId: CAMPAIGN_ID,
    run: snap.latest,
    integrity,
    generation: enriched,
  });
  writeJson(path.join(EVIDENCE, "content-manifest.json"), manifest);

  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const botanicals = botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration });
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54AT_ID, EXECUTION_54AT_BUDGET.maxUsd);
  const budgetFile = path.join(EVIDENCE, "ai-budget-ledger.json");
  writeExecutionBudgetLedger(budgetFile, ledger);

  if (!integrity.valid) {
    writeJson(path.join(EVIDENCE, "generation-result.json"), {
      GENERATION_EXECUTED: false,
      GENERATION_STATUS: "BLOCKED_INVALID_CONTRACT",
      reasons: integrity.reasons,
    });
    writeFileSync(
      path.join(EVIDENCE, "execution-summary.md"),
      `# 54AT blocked\n\nProduct contract is invalid. Regeneration was not started.\n\n${integrity.reasons.map((item) => `- ${item}`).join("\n")}\n`,
    );
    throw new Error(`PRODUCT_CONTRACT_VALID=false: ${integrity.reasons.join("; ")}`);
  }

  const resumeId = process.env.AIA_54AT_RESUME_GENERATION_ID?.trim();
  const reconstructed = resumeId
    ? {
        campaignId: CAMPAIGN_ID,
        status: "RECONSTRUCTED" as const,
        generationId: resumeId,
        previewPath: `/admin/lab/lp-generator/${resumeId}/preview`,
        heroMode: "PACKSHOT_SPLIT" as const,
        approvedFactsUsed: acceptedProposals(snap.latest).map((item) => item.field),
        unapprovedFactsUsed: [],
        plan: null,
        productContractPreserved: true,
        assetApprovalsPreserved: true,
        commercialAuthorization: "BLOCKED" as const,
        publicationReadiness: "BLOCKED" as const,
        errors: [],
      }
    : await reconstructApprovedPresell(CAMPAIGN_ID);
  const stored = reconstructed.generationId ? readGenerationModel(reconstructed.generationId) : null;
  if (!reconstructed.generationId || !reconstructed.previewPath || !stored) {
    writeJson(path.join(EVIDENCE, "generation-result.json"), { GENERATION_EXECUTED: false, reconstructed });
    throw new Error(reconstructed.errors.join("; ") || "Generation failed.");
  }

  let heroSrc = packshot?.assetUrl ?? null;
  if (packshot?.authorized) {
    const storedImage = await materializeProductImage(packshot.assetUrl, "DIRECT_SOURCE");
    heroSrc = storedImage?.src ?? packshot.assetUrl;
  }
  const sources = packshot && heroSrc
    ? [{ assetId: packshot.assetId, src: heroSrc, fileName: packshot.sourceFile }]
    : [];
  const classifications = sources.map((item) =>
    classifyAssetSuitabilityFromMetadata({ assetId: item.assetId, fileName: item.fileName, assetUrl: packshot?.assetUrl }, declaration),
  );
  const placement = selectEditorialPlacement({
    declaration,
    classifications,
    sources,
    productName,
  });
  let model: V4Model = hydrateFaqSection(disableCommercialCta(applyDeclaredPresellMedia(stored, placement)));
  writeGenerationModel(reconstructed.generationId, model);
  const markup = renderToStaticMarkup(createElement(V4Page, { model }));
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: [placement.hero?.assetId, ...placement.gallery.map((item) => item.assetId)].filter((item): item is string => Boolean(item)),
    botanicalAssetIds: botanicals,
  });
  writeJson(path.join(EVIDENCE, "content-safety-report.json"), safety);

  const capture = await captureEvaluationScreenshots({
    campaignId: CAMPAIGN_ID,
    generationId: reconstructed.generationId,
    previewPath: reconstructed.previewPath,
    baseUrl: LOCAL_BASE,
  });
  copyShot(capture.desktop?.path, path.join(SHOTS, "desktop-full.png"));
  copyShot(capture.mobile?.path, path.join(SHOTS, "mobile-full.png"));
  const bind = validateScreenshotBinding({ generationId: reconstructed.generationId, desktop: capture.desktop, mobile: capture.mobile });
  const previewUrl = `${LOCAL_BASE}${reconstructed.previewPath}`;
  let inspection: Record<string, unknown> = {};
  try {
    inspection = await inspectPreview(previewUrl);
  } catch (err) {
    inspection = { rendered: false, error: redactSecrets(err instanceof Error ? err.message : String(err)) };
  }
  writeFileSync(path.join(EVIDENCE, "desktop-visual-review.md"), visualMarkdown("desktop", inspection, Boolean(capture.desktop)));
  writeFileSync(path.join(EVIDENCE, "mobile-visual-review.md"), visualMarkdown("mobile", inspection, Boolean(capture.mobile)));

  const assessments: PresellQualityAssessment[] = [];
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  const paidBefore = paidAiAuthorization();
  let stopReason = keyConfigured ? "NOT_STARTED" : "PAID_AI_AUTHORIZATION_REQUIRED";
  const constraints = [
    "Use only accepted Product Contract facts.",
    "Do not invent benefits, testimonials, prices, manufacturer, or clinical claims.",
    "Do not treat seller SSL language as an independent security certification.",
    "Delivery windows are estimates, not guarantees.",
    "Commercial CTA stays disabled. Publication stays blocked.",
  ];

  if (keyConfigured && safety.gate === "PASS") {
    await runWithTemporaryPaidAi({ scope: "54AT", provider: "openai", maxUsd: EXECUTION_54AT_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) {
        stopReason = "PAID_AI_AUTHORIZATION_REQUIRED";
        return;
      }
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      for (let run = 1; run <= EXECUTION_54AT_BUDGET.maxEvaluations; run += 1) {
        const estimated = estimateVisionCallUsd(4000, 800);
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          estimatedUsd: estimated,
        });
        ledger = reserved.ok ? reserved.ledger : reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        if (!reserved.ok) {
          stopReason = reserved.reason;
          break;
        }
        try {
          const assessment = await evaluator.evaluate(
            evaluationInputFromModel({
              campaignId: CAMPAIGN_ID,
              generationId: reconstructed.generationId!,
              model,
              screenshots: {
                desktop: capture.extras.find((item) => item.role === "desktop-viewport") ?? capture.desktop,
                mobile: capture.extras.find((item) => item.role === "mobile-viewport") ?? capture.mobile,
              },
              approvedFacts: acceptedProposals(snap.latest).map((item) => item.field),
              evidenceReferences: [snap.latest?.runId ?? "research-237", ...enriched.operationalEvidenceIds],
              approvedAssets: packshot ? [{ id: packshot.assetId, eligible: true, kind: "PRODUCT_PACKSHOT" }] : [],
              editorialConstraints: constraints,
              previewPath: reconstructed.previewPath,
              iteration: run,
              patch: model.qualityPatch ?? null,
            }),
          );
          const estimatedUsd = assessment.costMetadata.estimatedUsd || estimateVisionCallUsd(assessment.tokenUsage?.inputTokens ?? 0, assessment.tokenUsage?.outputTokens ?? 0);
          ledger = consumePaidCall(ledger, {
            inputTokens: assessment.tokenUsage?.inputTokens ?? 0,
            outputTokens: assessment.tokenUsage?.outputTokens ?? 0,
            estimatedUsd,
            reportedUsd: estimatedUsd,
          });
          writeExecutionBudgetLedger(budgetFile, ledger);
          assessments.push(assessment);
          writeJson(path.join(EVIDENCE, `quality-evaluation-${run}.json`), assessment);
          stopReason = assessment.assessmentStatus;
        } catch (err) {
          const message = redactSecrets(err instanceof Error ? err.message : String(err));
          ledger = consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          stopReason = /timeout/i.test(message) ? "TIMEOUT_UNVERIFIED" : message;
          break;
        }
      }
    });
  } else if (safety.gate === "FAIL") {
    stopReason = "CONTENT_SAFETY_FAIL";
  }

  ledger = closeExecutionBudget(ledger, "54AT paid authorization closed. AIA_ALLOW_PAID_AI was not persisted.");
  writeExecutionBudgetLedger(budgetFile, ledger);

  const after = campaignIntegritySnapshot(CAMPAIGN_ID);
  const first = assessments[0] ?? null;
  const second = assessments[1] ?? null;
  const diagnosis = diagnoseEvaluatorPair({ first, second });
  const comparison = compareAgainstBaseline({
    baselineGenerationId: BASELINE_GENERATION_ID,
    baselineScore: BASELINE_SCORE,
    baseline: readGenerationModel(BASELINE_GENERATION_ID) ? first : first,
    nextGenerationId: reconstructed.generationId,
    assessments,
    contentSafetyPass: safety.gate === "PASS",
    addedOperationalContent: Boolean(
      inspection.hasShipping || inspection.hasPayment || inspection.hasEmptyBottles || enriched.shippingStatements.length || enriched.paymentStatements.length,
    ),
    criticalRegressions: [
      ...(inspection.liveHop ? ["Commercial hop is live."] : []),
      ...(inspection.overflowX || inspection.mobileOverflowX ? ["Horizontal overflow on a required viewport."] : []),
      ...(inspection.heroLoaded === false && placement.hero ? ["Approved packshot did not load."] : []),
      ...(JSON.stringify(before.acceptedFacts) !== JSON.stringify(after.acceptedFacts) ? ["Product Contract changed during generation."] : []),
    ],
  });
  writeJson(path.join(EVIDENCE, "quality-evaluation.json"), {
    promptVersion: QUALITY_PROMPT_VERSION,
    target: QUALITY_TARGET,
    assessments,
    diagnosis,
    stopReason,
    paidBefore: paidBefore.allowed,
  });
  writeJson(path.join(EVIDENCE, "baseline-comparison.json"), comparison);
  writeJson(path.join(EVIDENCE, "generation-result.json"), {
    GENERATION_EXECUTED: true,
    generationId: reconstructed.generationId,
    previewPath: reconstructed.previewPath,
    contractVersion: integrity.contractVersion,
    promptVersion: QUALITY_PROMPT_VERSION,
    model: "deterministic-templates",
    paidCopy: false,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    assetsUsed: sources,
    contentFingerprint: contentFingerprintOf(model),
    presentationFingerprint: presentationFingerprintOf(model),
    heroMode: v4HeroMode(model.commercialImage),
    packshotAssetId: packshot?.assetId ?? null,
    localPackshot: heroSrc ? localFileFromSrc(heroSrc) : null,
    gates: reconstructed,
    productContractPreserved: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    affiliateUrlUnchanged: before.affiliateUrl === after.affiliateUrl,
    renderedCopyPreview: renderedCopyFromModel(model).slice(0, 1200),
  });

  const summary = [
    "# EXECUTION 54AT — evidence-grounded presell regeneration",
    "",
    `- Base commit: ${baseCommit}`,
    `- Campaign: ${CAMPAIGN_ID}`,
    `- Contract valid: ${integrity.valid}`,
    `- Generation: ${reconstructed.generationId}`,
    `- Preview: ${previewUrl}`,
    `- Safety: ${safety.gate}`,
    `- Packshot: ${packshot?.assetId ?? "none"} (${packshot?.sourceFile ?? ""})`,
    `- AI provider: openai / ${OPENAI_VISION_MODEL}`,
    `- Paid calls: ${ledger.paidCallCount}`,
    `- Estimated USD: ${ledger.spentUsd}`,
    `- Remaining USD: ${ledger.remainingUsd}`,
    `- Comparison: ${comparison.status}`,
    `- Evaluator: ${comparison.evaluatorStability}`,
    `- CTA enabled: no`,
    `- Publication: blocked`,
    "",
    "Paid AI was authorized only inside this process. AIA_ALLOW_PAID_AI was not persisted.",
    "No ads, publish, or affiliate-hop clicks were performed.",
    "",
  ].join("\n");
  writeFileSync(path.join(EVIDENCE, "execution-summary.md"), summary);
  console.log(JSON.stringify({
    EXECUTION_54AT_STATUS: safety.gate === "PASS" ? (first ? first.assessmentStatus : "GENERATED") : "CONTENT_SAFETY_FAIL",
    GENERATION_ID: reconstructed.generationId,
    PREVIEW: previewUrl,
    SAFETY: safety.gate,
    COMPARISON: comparison.status,
    SCORE: first?.overallScore ?? null,
    SPENT: ledger.spentUsd,
  }, null, 2));
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
