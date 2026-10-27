// npx tsx scripts/test-presell-quality-54ah.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore } from "../src/lib/presell-quality/score.ts";
import { MULTIMODAL_QUALITY_JSON_SCHEMA } from "../src/lib/presell-quality/schema.ts";
import { mockOpenAiVisionClient, mockPayloadFromScores } from "../src/lib/presell-quality/mock.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { budgetAllowsCall, emptyBudgetLedger, EXECUTION_54AH_BUDGET, OPENAI_LOOP_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { classifyQualityFixes } from "../src/lib/presell-quality/classify.ts";
import { emptyPatch } from "../src/lib/presell-quality/patch.ts";
import { runQualityImprovementLoop } from "../src/lib/presell-quality/loop.ts";
import { applyEditorialReconstruction } from "../src/lib/presell-quality/reconstruct.ts";
import { proposeEditorialPlan } from "../src/lib/presell-quality/editorial-plan.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { evaluationFingerprint } from "../src/lib/presell-quality/fingerprint.ts";
import { defaultEvaluationMeta, type PresellEvaluationInput } from "../src/lib/presell-quality/input.ts";
import { screenshotAssociationError, bindScreenshotsToGeneration } from "../src/lib/presell-quality/normalize.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { measureEvaluatorConsistency } from "../src/lib/presell-quality/consistency.ts";
import { compareEditorialPages, normalizeVisualComparisonPayload, VISUAL_COMPARISON_JSON_SCHEMA } from "../src/lib/presell-quality/visual-compare.ts";
import { assessmentFromScores } from "../src/lib/presell-quality/evaluator.ts";
import { listQualityAssessments, writeQualityAssessment } from "../src/lib/presell-quality/persist.ts";
import type { CaptureManifest } from "../src/lib/presell-quality/capture.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function shot(dir: string, name: string, generationId: string) {
  const file = path.join(dir, name);
  writeFileSync(file, PIXEL);
  return {
    role: name.includes("-m.") ? ("mobile" as const) : ("desktop" as const),
    path: file,
    generationId,
    sha256: createHash("sha256").update(PIXEL).digest("hex"),
    width: name.includes("-m.") ? 390 : 1440,
    height: name.includes("-m.") ? 844 : 900,
  };
}

function sampleInput(dir: string, campaignId: number, generationId: string): PresellEvaluationInput {
  const meta = defaultEvaluationMeta();
  return {
    campaignId,
    generationId,
    productContractVersion: meta.productContractVersion,
    rendererVersion: meta.rendererVersion,
    screenshots: { desktop: shot(dir, `${generationId}-d.png`, generationId), mobile: shot(dir, `${generationId}-m.png`, generationId) },
    pageStructure: { sections: ["hero", "specifications", "how_it_works", "guarantee"] },
    renderedCopy: "Novalis Core is a documented capsule. Mineral blend. One capsule daily. 30-day returns.",
    approvedFacts: ["description", "ingredients", "howItWorks", "guarantee"],
    evidenceReferences: ["ev1"],
    approvedAssets: [{ id: "bottle", eligible: false, kind: "OTHER" }],
    editorialConstraints: ["EDITORIAL_NO_IMAGE", "Do not invent benefits."],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
}

function fakeCapture(dir: string, generationId: string, campaignId: number): CaptureManifest {
  return {
    campaignId,
    generationId,
    previewPath: "/sandbox/x",
    capturedAt: new Date().toISOString(),
    desktop: shot(dir, `${generationId}-d.png`, generationId),
    mobile: shot(dir, `${generationId}-m.png`, generationId),
    extras: [],
    ok: true,
    notes: [],
  };
}

function scored(partial: Partial<PresellQualityAssessment> & { generationId: string; overallScore: number }): PresellQualityAssessment {
  const base = assessmentFromScores(
    { campaignId: 1, generationId: partial.generationId, evaluatorType: "MULTIMODAL_AI" },
    {
      dimensionScores: [
        { dimension: "DESIGN_HIERARCHY", score: partial.overallScore, rationale: "mock" },
        { dimension: "COPY_CLARITY", score: partial.overallScore, rationale: "mock" },
        { dimension: "DEPTH_ORGANIZATION", score: partial.overallScore, rationale: "mock" },
        { dimension: "IMAGES_COMPOSITION", score: partial.overallScore, rationale: "mock" },
        { dimension: "MOBILE_EXPERIENCE", score: partial.overallScore, rationale: "mock" },
        { dimension: "TRANSPARENCY_LEGIBILITY", score: partial.overallScore, rationale: "mock" },
      ],
      criticalFailures: [],
      evaluatorType: "MULTIMODAL_AI",
      evaluationCompleted: true,
    },
  );
  return {
    ...base,
    ...partial,
    rubricVersion: partial.rubricVersion ?? QUALITY_RUBRIC_VERSION,
    promptVersion: partial.promptVersion ?? QUALITY_PROMPT_VERSION,
    screenshotHashes: partial.screenshotHashes ?? ["desk", "mob"],
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54ah-quality-"));
  const isolated = createCampaign({
    name: "Novalis 54AH",
    slug: `novalis-54ah-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const dir = mkdtempSync(path.join(os.tmpdir(), "54ah-"));
  mkdirSync(dir, { recursive: true });
  const bound = sampleInput(dir, isolated.id, "gen-ah");
  assert(screenshotAssociationError({ generationId: "gen-ah", desktop: bound.screenshots.desktop, mobile: bound.screenshots.mobile }) === null, "binding de screenshots valido");
  assert(
    screenshotAssociationError({ generationId: "other-gen", desktop: bound.screenshots.desktop, mobile: bound.screenshots.mobile })?.code === "SCREENSHOT_GENERATION_MISMATCH",
    "generationId inconsistente e rejeitado",
  );
  const rebound = bindScreenshotsToGeneration(bound.screenshots, "fixture-ah");
  assert(rebound.desktop?.generationId === "fixture-ah" && rebound.mobile?.generationId === "fixture-ah", "fixture imutavel pode reassociar refs");
  const validated = validateScreenshotBinding({ generationId: "gen-ah", desktop: bound.screenshots.desktop, mobile: bound.screenshots.mobile });
  assert(validated.ok && validated.desktopHash === bound.screenshots.desktop?.sha256, "fingerprint dos arquivos capturados");

  const fp1 = evaluationFingerprint(bound);
  const fp2 = evaluationFingerprint({ ...bound, generationId: "other-gen", screenshots: bound.screenshots });
  assert(fp1 !== fp2, "fingerprint muda com generationId");
  assert(evaluationFingerprint(bound) === fp1, "fingerprints estaveis para a mesma geracao");

  const noImage = labScenarioKeys()
    .map((key) => buildV4Model(key))
    .find((model) => model && !model.commercialImage);
  assert(Boolean(noImage), "renderer v4 builds a no-image model");
  const plan = proposeEditorialPlan({
    run: {
      campaignId: isolated.id,
      runId: "run-ah",
      productName: "Novalis Core",
      status: "COMPLETED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      seeds: [],
      proposals: [
        { field: "description", currentValue: "Novalis Core is a documented capsule.", suggestedValue: "Novalis Core is a documented capsule.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
        { field: "ingredients", currentValue: "Mineral blend.", suggestedValue: "Mineral blend.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
        { field: "howItWorks", currentValue: "One capsule daily.", suggestedValue: "One capsule daily.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
        { field: "guarantee", currentValue: "30-day returns.", suggestedValue: "30-day returns.", status: "ACCEPTED", evidenceIds: ["e"], sourceUrl: "https://shop.novalis.example/", sourceClass: "SELLER", verification: "SELLER_STATED", restriction: null, collectedAt: "2026-01-01T00:00:00.000Z", eligibleForBatch: false, notes: [] },
      ],
    } as never,
    media: { heroStatus: "HERO_IMAGE_MISSING", approved: [], approvedCount: 0, eligibleCount: 0, usedCount: 0, excluded: [] } as never,
  });
  const reconstructed = applyEditorialReconstruction(noImage!, plan);
  const markup = renderToStaticMarkup(createElement(V4Page, { model: reconstructed }));
  assert(markup.includes("v4-hero-panel") && markup.includes("v4-hero-aside") && !markup.includes('data-v4-image="commercial"') && !markup.includes("data-v4-gallery"), "hero editorial em painel sem packshot nem galeria inelegivel");
  assert(markup.includes("v4-ingredient-stack") || markup.includes("Directions for Use") || markup.includes("ds-feature"), "secoes de ingredientes/uso presentes");
  assert(!/clinically proven|verified buyer|limited time|erases wrinkles/i.test(markup), "fatos nao inventados");
  const css = readFileSync(path.join(process.cwd(), "src/app/renderer-v4-lab.css"), "utf8");
  assert(css.includes("overflow-x: clip"), "ausencia de overflow horizontal no lab v4");
  assert(markup.includes("ds-hero--editorial-full"), "layout editorial responsivo");

  const before237 = campaignIntegritySnapshot(237);
  applyEditorialReconstruction(noImage!, plan);
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "fatos de 237 preservados");
  assert(JSON.stringify(before237.approvedAssets) === JSON.stringify(after237.approvedAssets), "assets de 237 preservados");

  const first = scored({ generationId: "cal-editorial", overallScore: 81, assessmentId: "pqa-a" });
  const second = scored({ generationId: "cal-editorial", overallScore: 80, assessmentId: "pqa-b" });
  const stable = measureEvaluatorConsistency({ first, second });
  assert(stable.status === "COMPARABLE" && stable.variation === 1, "consistencia comparavel na mesma rubrica");
  const reboundEval = measureEvaluatorConsistency({
    first,
    second: scored({ generationId: "cal-editorial-b", overallScore: 81, assessmentId: "pqa-c" }),
  });
  assert(reboundEval.status === "BINDING_MISMATCH", "segunda avaliacao com outro generationId nao e comparavel");
  const unstable = measureEvaluatorConsistency({
    first,
    second: scored({ generationId: "cal-editorial", overallScore: 60, assessmentId: "pqa-d" }),
  });
  assert(unstable.status === "EVALUATOR_UNSTABLE", "variacao excessiva registra EVALUATOR_UNSTABLE");
  const rubricMismatch = measureEvaluatorConsistency({
    first,
    second: scored({ generationId: "cal-editorial", overallScore: 81, rubricVersion: "9", assessmentId: "pqa-e" }),
  });
  assert(rubricMismatch.status === "RUBRIC_MISMATCH", "scores so comparam rubricas equivalentes");

  writeQualityAssessment(first);
  writeQualityAssessment(second);
  assert(listQualityAssessments(1).length >= 2, "avaliacoes historicas nao sao sobrescritas");

  const comparisonJson = {
    axes: [
      { id: "hero_composition", observedDifference: "Campaign hero has more unused vertical space.", visualEvidence: "desktop top band", severity: "MEDIUM" },
    ],
    recommendations: [
      {
        id: "tighten-hero",
        problem: "Unused vertical space in the campaign hero.",
        visualEvidence: "Desktop 1440 hero band is taller than the reference.",
        severity: "MEDIUM",
        proposedChange: "Tighten editorial hero padding and panel proportion.",
        probableFile: "src/app/renderer-v4-lab.css",
        expectedImpact: "Denser first screen without inventing facts.",
        safetyConstraints: "Keep EDITORIAL_NO_IMAGE. Do not add a packshot.",
        allowed: true,
      },
    ],
    copyFixtureBlindly: true,
    summary: "Reference is denser.",
  };
  const normalized = normalizeVisualComparisonPayload(JSON.stringify(comparisonJson));
  assert(normalized.copyFixtureBlindly === false, "comparacao nao clona a fixture");
  assert(VISUAL_COMPARISON_JSON_SCHEMA.type === "object" && MULTIMODAL_QUALITY_JSON_SCHEMA.type === "object", "validacao de JSON schema");
  const compared = await compareEditorialPages(
    {
      referenceDesktop: bound.screenshots.desktop!,
      referenceMobile: bound.screenshots.mobile!,
      campaignDesktop: bound.screenshots.desktop!,
      campaignMobile: bound.screenshots.mobile!,
      approvedFacts: bound.approvedFacts,
      editorialConstraints: bound.editorialConstraints,
      pageStructure: bound.pageStructure,
    },
    {
      env: { AIA_ALLOW_PAID_AI: "1", AIA_PAID_AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" },
      complete: async () => ({ text: JSON.stringify(comparisonJson), inputTokens: 20, outputTokens: 10 }),
      readFile: () => PIXEL,
    },
  );
  assert(compared.recommendations[0]?.problem.includes("vertical space"), "comparacao visual estruturada");

  const client = mockOpenAiVisionClient(mockPayloadFromScores(70));
  const evaluator = createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai" },
    client,
    skipCache: true,
  });
  const assessment = await evaluator.evaluate(bound);
  assert(assessment.overallScore === weightedQualityScore(assessment.dimensionScores.map((row) => ({ dimension: row.dimension, score: row.score }))), "calculo de score host-side");
  const mismatch = await evaluator.evaluate({ ...bound, generationId: "stolen-from-other-gen" });
  assert(mismatch.errorCode === "SCREENSHOT_GENERATION_MISMATCH", "nao reutiliza screenshots de outra geracao");

  const empty = emptyBudgetLedger("54AH");
  assert(EXECUTION_54AH_BUDGET.maxUsd === 2 && EXECUTION_54AH_BUDGET.maxFixtureEvals === 2, "limite de orcamento 54AH");
  assert(OPENAI_LOOP_BUDGET.maxEvaluations === 3 && OPENAI_LOOP_BUDGET.maxCorrectionRounds === 2, "limite de iteracoes");
  assert(budgetAllowsCall({ ...empty, evaluationCount: 3 }).allowed === false, "cap de avaliacoes da campanha");
  assert(budgetAllowsCall({ ...empty, spentUsd: 1.8 }).allowed === false, "reserva de orcamento bloqueia chamada");

  const loop = await runQualityImprovementLoop(
    {
      campaignId: isolated.id,
      generationId: "gen-ah",
      previewPath: "/sandbox/x",
      model: reconstructed,
      approvedFacts: ["description", "ingredients", "howItWorks", "guarantee"],
      evidenceReferences: ["e"],
      approvedAssets: [],
      editorialConstraints: ["EDITORIAL_NO_IMAGE"],
      heroEligible: false,
    },
    {
      env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai", AIA_PAID_AI_BUDGET_USD: "2" },
      evaluator,
      capture: async () => fakeCapture(dir, "gen-ah", isolated.id),
      ledger: emptyBudgetLedger("54AH"),
    },
  );
  assert(loop.stopReason === "NO_ALLOWED_FIXES" || loop.stopReason === "NO_SCORE_IMPROVEMENT" || loop.stopReason === "QUALITY_PASSED" || loop.stopReason === "EVALUATION_LIMIT", "interrupcao por ausencia de progresso ou limite");
  assert(loop.publicationReadiness === "BLOCKED" && loop.commercialAuthorization === "BLOCKED", "publicacao bloqueada");
  assert(loop.factsPreserved && loop.assetApprovalsPreserved, "contrato e assets preservados no loop");

  const classified = classifyQualityFixes({
    assessment: {
      ...assessment,
      recommendedActions: [{ id: "fake", action: "Generate a fake packshot", reason: "Missing image", allowed: false }],
    } as PresellQualityAssessment,
    heroEligible: false,
  });
  assert(classified.rejected.some((item) => item.code === "GENERATE_PACKSHOT"), "packshot falso rejeitado");

  assert(paidAiAuthorization().allowed === false, "paid AI permanece bloqueada fora do gate");
  const restored = await runWithTemporaryPaidAi({ scope: "54AH", provider: "openai", maxUsd: 2 }, async () => paidAiAuthorization().allowed);
  assert(restored === true && paidAiAuthorization().allowed === false, "autorizacao temporaria nao grava env");
  assert(QUALITY_PROMPT_VERSION === "4" && QUALITY_TARGET === 85, "rubrica v4 e meta 85 intactas");
  assert(QUALITY_DIMENSION_WEIGHTS.DESIGN_HIERARCHY === 0.25, "pesos da rubrica intactos");
  assert(emptyPatch().applied.length === 0, "patch vazio");

  console.log(`PASS test-presell-quality-54ah.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
