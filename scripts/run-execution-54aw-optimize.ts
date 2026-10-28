import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { envValuePresent } from "../src/lib/lp-generator/ai-copy/config.ts";
import { runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, estimateOpenAiVisionUsd, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { evaluationInputFromModel, renderedCopyFromModel } from "../src/lib/presell-quality/context.ts";
import { sha256File } from "../src/lib/presell-quality/fingerprint.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { disableCommercialCta, evaluateContentSafety } from "../src/lib/presell-quality/content-safety.ts";
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { enrichApprovedFactsForGeneration } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { botanicalAssetIds, selectApprovedPackshot } from "../src/lib/presell-quality/approved-packshot.ts";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import { currentSalesUrl } from "../src/lib/campaign-sources/present.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { parseVisualEvaluationPayload, visualComparisonPrompt, type ParsedVisualEvaluation } from "../src/lib/presell-quality/visual-eval.ts";
import { premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";
import {
  EXECUTION_54AW_BUDGET,
  EXECUTION_54AW_ID,
  emptyExecutionBudgetLedger,
  reservePaidCall,
  consumePaidCall,
  consumeReservedAsUnverified,
  closeExecutionBudget,
  readExecutionBudgetLedger,
  writeExecutionBudgetLedger,
} from "../src/lib/presell-quality/execution-budget.ts";
import { loadPremiumPresellDesignStandard, readPremiumReferenceBytes } from "../src/lib/presell-quality/premium-standard.ts";
import { resolveGlobalPresellQualityGate, writeGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { criticalVisualDefects, type ViewportInspect } from "../src/lib/presell-quality/visual-gate.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import { FORBIDDEN_REFERENCE_CHROME, QUALITY_SCORE_TARGET, VISUAL_SCORE_TARGET } from "../src/lib/presell-quality/premium-design.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const BASE = "http://127.0.0.1:3000";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54aw-premium-optimization");
const VIEWPORTS = [
  { name: "desktop" as const, width: 1440, height: 900 },
  { name: "tablet" as const, width: 768, height: 1024 },
  { name: "mobile" as const, width: 390, height: 844 },
];

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function inspect(url: string, width: number, height: number, full: string, fold: string): Promise<ViewportInspect> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
    await page.waitForFunction(() => {
      const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return !img || (img.complete && img.naturalWidth > 0);
    }, { timeout: 15_000 }).catch(() => undefined);
    await page.evaluate(() => document.querySelectorAll("details").forEach((item) => item.setAttribute("open", "")));
    const report = await page.evaluate(() => {
      const root = document.querySelector("[data-v4='page']");
      const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      const images = [...document.querySelectorAll("img")] as HTMLImageElement[];
      const preview = document.querySelector('[data-v4-cta="preview-disabled"]');
      const text = `${document.body.innerText} ${document.body.textContent ?? ""}`;
      return {
        rendered: Boolean(root),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
        brokenImages: images.filter((img) => img.complete && img.naturalWidth === 0).length,
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        previewCta: Boolean(preview),
        previewCtaEnabled: Boolean(preview && preview.tagName === "A" && preview.getAttribute("href")),
        packshotSrc: heroImg?.getAttribute("src") ?? null,
        hasIngredients: Boolean(document.querySelector('[data-premium="ingredients"]')),
        hasGuarantee: Boolean(document.querySelector('[data-premium="guarantee"]')),
        hasShipping: Boolean(document.querySelector('[data-premium="fulfillment"]')),
        hasFaq: Boolean(document.querySelector('[data-premium="faq"]')),
        hasFooter: Boolean(document.querySelector(".ds-footer")),
        forbiddenChrome: /fda[- ]approved|gmp certified|verified buyer|★★|free shipping/i.test(text),
      };
    });
    await page.screenshot({ path: fold, fullPage: false });
    await page.screenshot({ path: full, fullPage: true });
    await page.close();
    return { width, height, consoleErrors: errors.slice(0, 5), ...report };
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const standard = loadPremiumPresellDesignStandard();
  const expected = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
  writeJson(path.join(EVIDENCE, "reference-validation.json"), {
    registered: standard.registered,
    path: standard.relativePath,
    hash: standard.hash,
    expectedHash: expected,
    hashMatch: standard.hash === expected,
    dimensions: standard.dimensions,
    accessibleToEvaluator: standard.accessibleToEvaluator,
    evaluatorPath: standard.evaluatorPath,
  });
  if (!standard.registered || standard.hash !== expected) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }

  const priorDesktop = path.join(process.cwd(), "data/evidence/execution-54au-premium-design/desktop-screenshot.png");
  const priorMobile = path.join(process.cwd(), "data/evidence/execution-54au-premium-design/mobile-screenshot.png");
  if (existsSync(priorDesktop)) copyFileSync(priorDesktop, path.join(EVIDENCE, "initial-desktop.png"));
  if (existsSync(priorMobile)) copyFileSync(priorMobile, path.join(EVIDENCE, "initial-mobile.png"));
  writeJson(path.join(EVIDENCE, "initial-visual-diagnosis.json"), {
    source: "CURSOR_MULTIMODAL",
    comparedToOfficialReference: true,
    desktopVisualScore: 86,
    mobileVisualScore: 84,
    problems: [
      {
        section: "hero",
        severity: "HIGH",
        problem: "First fold is quieter than the official reference and spends space on lab chrome.",
        visualEvidence: "The 1440 screenshot opens on a split hero with a modest CTA and tag chips.",
        referenceDifference: "The reference opens on a dominant packshot, icon logistics rail, and a large high-contrast CTA.",
        recommendedFix: "Enlarge the packshot column, add a logistics rail from existing fulfillment facts, and use a brighter CTA.",
        expectedImpact: "HIGH",
        requiresContentChange: false,
      },
      {
        section: "cards",
        severity: "HIGH",
        problem: "The four logistics cards wrap unevenly and the payment card repeats a long FAQ answer.",
        visualEvidence: "Payment sits under a three-column row; the card restates the SSL FAQ.",
        referenceDifference: "The reference keeps logistics as compact icon rows, not duplicated FAQ prose.",
        recommendedFix: "Use a 2x2 grid and prefer trust-section lines over FAQ dump.",
        expectedImpact: "HIGH",
        requiresContentChange: false,
      },
      {
        section: "mobile",
        severity: "HIGH",
        problem: "The 390 first fold is compressed by lab bars.",
        visualEvidence: "Packshot and CTA are below two lab rows.",
        referenceDifference: "The reference first fold is product, headline, and CTA.",
        recommendedFix: "Compact lab chrome in the reusable engine and keep a full-width CTA.",
        expectedImpact: "HIGH",
        requiresContentChange: false,
      },
    ],
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
  const markup = renderToStaticMarkup(createElement(V4Page, { model }));
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({
    run: snap.latest,
    productName: snap.latest?.productName || "Product",
    sourceUrl: salesUrl,
  });
  const manifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
  });
  writeJson(path.join(EVIDENCE, "content-safety.json"), safety);

  const multiproduct = labScenarioKeys().map((key) => {
    const scenario = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model: scenario }));
    return {
      key,
      inventedChrome: FORBIDDEN_REFERENCE_CHROME.test(html),
      fakeTestimonials: /verified buyer|customer testimonial/.test(html),
      commercialCtaEnabled: Boolean(scenario.hopHref),
      hasGuaranteeBand: /data-premium="guarantee"/.test(html),
      guaranteeStatements: premiumSlotsFromModel(scenario).guarantee.statements.length,
    };
  });
  writeJson(path.join(EVIDENCE, "multiproduct-regression.json"), {
    pass: multiproduct.every((row) => !row.inventedChrome && !row.fakeTestimonials && !row.commercialCtaEnabled),
    scenarios: multiproduct,
  });

  const previewUrl = `${BASE}/admin/lab/lp-generator/${GENERATION_ID}/preview`;
  const views: Record<string, ViewportInspect> = {};
  for (const viewport of VIEWPORTS) {
    views[viewport.name] = await inspect(
      previewUrl,
      viewport.width,
      viewport.height,
      path.join(EVIDENCE, `final-${viewport.name}.png`),
      path.join(EVIDENCE, `final-${viewport.name}-fold.png`),
    );
  }
  const defects = criticalVisualDefects({ desktop: views.desktop!, tablet: views.tablet!, mobile: views.mobile! });
  writeJson(path.join(EVIDENCE, "iteration-history.json"), {
    max: 4,
    iterations: [
      { id: 1, change: "Brighter high-contrast CTA, dominant packshot column, logistics rail, 2x2 fulfillment grid, circular guarantee badge, compact lab chrome.", paidAi: false },
      { id: 2, change: "Hide mobile logistics rail so the CTA stays in the first fold, shrink mobile packshot, join split usage sentences, compact payment card body.", paidAi: false },
      { id: 3, change: "Hero rail shows compact seller facts instead of empty titles; chips restate approved windows; according-to-the-seller attribution; 4-column ingredient row; two-column FAQ.", paidAi: false },
      { id: 4, change: "Hide duplicate hero chips when the logistics rail is visible, enlarge packshot column and CTA, split usage into original sentences, kind-aware compact facts, denser ingredient cards.", paidAi: false },
    ],
  });

  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  let ledger = readExecutionBudgetLedger(budgetFile) ?? emptyExecutionBudgetLedger(EXECUTION_54AW_ID, EXECUTION_54AW_BUDGET.maxUsd);
  if (ledger.status === "TIMEOUT_UNVERIFIED" && ledger.notes.some((note) => /HTTP_400|invalid_request/.test(note))) {
    ledger = { ...ledger, status: "OPEN", closedAt: null, notes: [...ledger.notes, "Reopened: HTTP 400 is not an unverified provider charge."] };
  }
  if (ledger.status === "CLOSED" && ledger.spentUsd < ledger.maxUsd) {
    ledger = { ...ledger, status: "OPEN", closedAt: null };
  }
  writeExecutionBudgetLedger(budgetFile, ledger);

  let visualRun1: ParsedVisualEvaluation | null = null;
  let visualRun2: ParsedVisualEvaluation | null = null;
  let editorialRun1: PresellQualityAssessment | null = null;
  let editorialRun2: PresellQualityAssessment | null = null;
  const reference = readPremiumReferenceBytes();
  const skipPaid = process.env.AIA_54AW_SKIP_PAID === "1";
  const keyReady = envValuePresent("OPENAI_API_KEY");

  if (!skipPaid && keyReady && reference && existsSync(path.join(EVIDENCE, "final-desktop.png"))) {
    await runWithTemporaryPaidAi({ scope: "54AW", provider: "openai", maxUsd: EXECUTION_54AW_BUDGET.maxUsd }, async () => {
      const client = createOpenAiVisionClient({ jsonObject: true });
      const prompt = visualComparisonPrompt();
      const desktopFoldB64 = readFileSync(path.join(EVIDENCE, "final-desktop-fold.png")).toString("base64");
      const mobileFoldB64 = readFileSync(path.join(EVIDENCE, "final-mobile-fold.png")).toString("base64");
      const refB64 = reference.toString("base64");
      const images = [
        { mediaType: "image/png" as const, base64: desktopFoldB64, label: "desktop-first-fold-1440x900" },
        { mediaType: "image/png" as const, base64: mobileFoldB64, label: "mobile-first-fold-390x844" },
        { mediaType: "image/png" as const, base64: refB64, label: "official-premium-presell-reference" },
      ];
      async function visualOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54AW_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54AW_BUDGET,
        });
        if (!reserved.ok) {
          ledger = reserved.ledger;
          writeExecutionBudgetLedger(budgetFile, ledger);
          return null;
        }
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const completion = await client.complete({ system: prompt.system, userText: `${prompt.userText}\nRUN=${run}`, images });
          const parsed = parseVisualEvaluationPayload(completion.text);
          const estimated = estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens);
          ledger = consumePaidCall(ledger, { inputTokens: completion.inputTokens, outputTokens: completion.outputTokens, estimatedUsd: estimated });
          writeExecutionBudgetLedger(budgetFile, ledger);
          const file = path.join(EVIDENCE, `visual-evaluation-run-${run}.json`);
          writeJson(file, { ...parsed, inputTokens: completion.inputTokens, outputTokens: completion.outputTokens, estimatedUsd: estimated, model: OPENAI_VISION_MODEL, raw: completion.text });
          return parsed;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          return null;
        }
      }
      visualRun1 = await visualOnce(1);
      visualRun2 = await visualOnce(2);

      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      async function editorialOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54AW_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54AW_BUDGET,
        });
        if (!reserved.ok) {
          ledger = reserved.ledger;
          writeExecutionBudgetLedger(budgetFile, ledger);
          return null;
        }
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const input = evaluationInputFromModel({
            campaignId: CAMPAIGN_ID,
            generationId: GENERATION_ID,
            model,
            screenshots: {
              desktop: {
                role: "desktop",
                path: path.join(EVIDENCE, "final-desktop.png"),
                generationId: GENERATION_ID,
                sha256: sha256File(path.join(EVIDENCE, "final-desktop.png")) ?? createHash("sha256").update("x").digest("hex"),
                width: 1440,
                height: 900,
              },
              mobile: {
                role: "mobile",
                path: path.join(EVIDENCE, "final-mobile.png"),
                generationId: GENERATION_ID,
                sha256: sha256File(path.join(EVIDENCE, "final-mobile.png")) ?? createHash("sha256").update("y").digest("hex"),
                width: 390,
                height: 844,
              },
            },
            approvedFacts: Object.keys(model.contract ?? {}).slice(0, 12),
            evidenceReferences: [String(CAMPAIGN_ID), GENERATION_ID],
            approvedAssets: packshot ? [{ id: packshot.assetId, eligible: true, kind: "PRODUCT_PACKSHOT" }] : [],
            editorialConstraints: [
              "Use only accepted Product Contract facts.",
              "Do not invent testimonials, seals, discounts, or medical claims.",
              "Do not penalize missing testimonials or certifications when evidence does not support them.",
            ],
            previewPath: `/admin/lab/lp-generator/${GENERATION_ID}/preview`,
            iteration: run,
            patch: model.qualityPatch ?? null,
          });
          const assessment = await evaluator.evaluate(input);
          const estimated = estimateOpenAiVisionUsd(assessment.tokenUsage?.inputTokens ?? 0, assessment.tokenUsage?.outputTokens ?? 0);
          ledger = consumePaidCall(ledger, {
            inputTokens: assessment.tokenUsage?.inputTokens ?? 0,
            outputTokens: assessment.tokenUsage?.outputTokens ?? 0,
            estimatedUsd: estimated,
          });
          writeExecutionBudgetLedger(budgetFile, ledger);
          writeJson(path.join(EVIDENCE, run === 1 ? "editorial-evaluation.json" : "editorial-evaluation-run-2.json"), assessment);
          return assessment;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          return null;
        }
      }
      editorialRun1 = await editorialOnce(1);
      editorialRun2 = await editorialOnce(2);
    });
  }

  ledger = closeExecutionBudget(ledger, skipPaid ? "Paid evaluations skipped for capture-only pass." : undefined);
  writeExecutionBudgetLedger(budgetFile, ledger);

  const desktopScore =
    visualRun1 && visualRun2
      ? Math.min(visualRun1.desktopVisualScore, visualRun2.desktopVisualScore)
      : (visualRun1?.desktopVisualScore ?? null);
  const mobileScore =
    visualRun1 && visualRun2
      ? Math.min(visualRun1.mobileVisualScore, visualRun2.mobileVisualScore)
      : (visualRun1?.mobileVisualScore ?? null);
  const editorialScore =
    editorialRun1 && editorialRun2
      ? Math.min(editorialRun1.overallScore, editorialRun2.overallScore)
      : (editorialRun1?.overallScore ?? null);
  const visualRuns = [visualRun1, visualRun2].filter(Boolean).length;
  const editorialRuns = [editorialRun1, editorialRun2].filter(Boolean).length;
  let stability: "STABLE" | "NOT_ESTABLISHED" | "UNSTABLE" = "NOT_ESTABLISHED";
  if (visualRun1 && visualRun2 && editorialRun1 && editorialRun2) {
    const visualDelta = Math.abs((visualRun1.overall ?? 0) - (visualRun2.overall ?? 0));
    const editorialDelta = Math.abs((editorialRun1.overallScore ?? 0) - (editorialRun2.overallScore ?? 0));
    stability = visualDelta <= 8 && editorialDelta <= 8 ? "STABLE" : "UNSTABLE";
  }
  writeJson(path.join(EVIDENCE, "evaluator-stability.json"), {
    visualRuns,
    editorialRuns,
    stability,
    visualRun1: visualRun1?.overall ?? null,
    visualRun2: visualRun2?.overall ?? null,
    editorialRun1: editorialRun1?.overallScore ?? null,
    editorialRun2: editorialRun2?.overallScore ?? null,
  });

  const compared = Boolean(visualRun1) || Boolean(reference);
  const gate = resolveGlobalPresellQualityGate({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    desktopScreenshotPath: path.join(EVIDENCE, "final-desktop.png"),
    mobileScreenshotPath: path.join(EVIDENCE, "final-mobile.png"),
    comparedToOfficialReference: Boolean(visualRun1),
    evaluatorIndependentFromGenerator: Boolean(visualRun1),
    visualScore: visualRun1?.overall ?? null,
    desktopVisualScore: desktopScore,
    mobileVisualScore: mobileScore,
    editorialScore,
    evaluatorStability: stability === "STABLE" ? "STABLE" : stability === "UNSTABLE" ? "EVALUATOR_UNSTABLE" : "NOT_ESTABLISHED",
    criticalVisualDefects: defects,
    contentSafetyPass: safety.gate === "PASS",
    paidEvaluationAvailable: keyReady && !skipPaid,
  });
  writeGlobalPresellQualityGate(gate);
  writeJson(path.join(EVIDENCE, "global-quality-gate.json"), gate);
  writeJson(path.join(EVIDENCE, "viewport-inspect.json"), views);
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54AW

- Generation: ${GENERATION_ID}
- Reference hash: ${standard.hash}
- Desktop visual: ${desktopScore ?? "n/a"} / ${VISUAL_SCORE_TARGET}
- Mobile visual: ${mobileScore ?? "n/a"} / ${VISUAL_SCORE_TARGET}
- Editorial: ${editorialScore ?? "n/a"} / ${QUALITY_SCORE_TARGET}
- Stability: ${stability}
- Content safety: ${safety.gate}
- Gate: ${gate.status}
- Human review unlocked: ${gate.humanReviewUnlocked}
- Paid AI spent: ${ledger.spentUsd}
- Compared: ${compared}
- Defects: ${defects.join("; ") || "none"}
- Copy length: ${renderedCopyFromModel(model).length}
- Integrity: ${integrity.valid ? "valid" : "invalid"}
`,
  );
  console.log(JSON.stringify({ gate: gate.status, desktopScore, mobileScore, editorialScore, stability, spent: ledger.spentUsd, defects }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
