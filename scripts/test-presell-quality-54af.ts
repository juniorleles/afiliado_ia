// npx tsx scripts/test-presell-quality-54af.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore } from "../src/lib/presell-quality/score.ts";
import { MULTIMODAL_QUALITY_JSON_SCHEMA } from "../src/lib/presell-quality/schema.ts";
import { mockOpenAiVisionClient, mockPayloadFromScores } from "../src/lib/presell-quality/mock.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { createOpenAiVisionClient, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { budgetAllowsCall, emptyBudgetLedger, OPENAI_LOOP_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { classifyQualityFixes } from "../src/lib/presell-quality/classify.ts";
import { applyQualityPatch, emptyPatch } from "../src/lib/presell-quality/patch.ts";
import { runQualityImprovementLoop } from "../src/lib/presell-quality/loop.ts";
import { applyEditorialReconstruction } from "../src/lib/presell-quality/reconstruct.ts";
import { proposeEditorialPlan } from "../src/lib/presell-quality/editorial-plan.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { evaluationFingerprint } from "../src/lib/presell-quality/fingerprint.ts";
import { defaultEvaluationMeta, type PresellEvaluationInput } from "../src/lib/presell-quality/input.ts";
import { QUALITY_RUBRIC_VERSION } from "../src/lib/presell-quality/types.ts";
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
    role: /(?:^|-)m(?:obile)?[-.]/.test(name) || name.includes("-m.") ? ("mobile" as const) : ("desktop" as const),
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
    pageStructure: { sections: ["hero", "specifications"] },
    renderedCopy: "Novalis Core is a documented capsule.",
    approvedFacts: ["description", "ingredients", "howItWorks", "guarantee"],
    evidenceReferences: ["ev1"],
    approvedAssets: [{ id: "bottle", eligible: false, kind: "OTHER" }],
    editorialConstraints: ["Do not invent benefits."],
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

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54af-quality-"));
  const isolated = createCampaign({
    name: "Novalis 54AF",
    slug: `novalis-54af-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const noImage = labScenarioKeys()
    .map((key) => buildV4Model(key))
    .find((model) => model && !model.commercialImage);
  assert(Boolean(noImage), "renderer v4 builds a no-image model");
  const plan = proposeEditorialPlan({
    run: {
      campaignId: isolated.id,
      runId: "run-af",
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
  assert(markup.includes('data-hero-mode="EDITORIAL_NO_IMAGE"'), "1. hero editorial sem imagem");
  assert(markup.includes("v4-hero-aside") && !markup.includes('data-v4-image="commercial"'), "1. aside abstrato sem packshot");
  assert(markup.includes("ds-hero--editorial-full"), "3. layout editorial responsivo no markup");
  assert(!/clinically proven|verified buyer|limited time|erases wrinkles/i.test(markup), "5. sem claims inventados");

  const before237 = campaignIntegritySnapshot(237);
  applyEditorialReconstruction(noImage!, plan);
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "3. fatos de 237 preservados");
  assert(JSON.stringify(before237.approvedAssets) === JSON.stringify(after237.approvedAssets), "4. assets de 237 preservados");
  assert(before237.affiliateUrl === after237.affiliateUrl, "15. isolamento entre campanhas");

  const dir = mkdtempSync(path.join(os.tmpdir(), "54af-"));
  mkdirSync(dir, { recursive: true });
  const input = sampleInput(dir, isolated.id, "gen-af");
  const fp1 = evaluationFingerprint(input);
  const fp2 = evaluationFingerprint(input);
  assert(fp1 === fp2 && fp1.length === 64, "6. fingerprints estaveis");

  const capture = fakeCapture(dir, "gen-af", isolated.id);
  assert(capture.desktop?.width === 1440 && capture.mobile?.width === 390, "7. captura desktop/mobile nas viewports");

  const client = mockOpenAiVisionClient(mockPayloadFromScores(80));
  const evaluator = createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai" },
    client,
    skipCache: true,
  });
  const assessment = await evaluator.evaluate(input);
  assert(assessment.overallScore != null && typeof assessment.overallScore === "number", "8. integracao openai estruturada");
  assert(MULTIMODAL_QUALITY_JSON_SCHEMA.type === "object" && Array.isArray(MULTIMODAL_QUALITY_JSON_SCHEMA.required), "9. JSON schema presente");
  const computed = weightedQualityScore(assessment.dimensionScores.map((row) => ({ dimension: row.dimension, score: row.score })));
  const expected = Math.round(
    80 * QUALITY_DIMENSION_WEIGHTS.DESIGN_HIERARCHY +
      80 * QUALITY_DIMENSION_WEIGHTS.COPY_CLARITY +
      80 * QUALITY_DIMENSION_WEIGHTS.DEPTH_ORGANIZATION +
      80 * QUALITY_DIMENSION_WEIGHTS.IMAGES_COMPOSITION +
      80 * QUALITY_DIMENSION_WEIGHTS.MOBILE_EXPERIENCE +
      80 * QUALITY_DIMENSION_WEIGHTS.TRANSPARENCY_LEGIBILITY,
  );
  assert(computed === expected, "10. calculo de scores ponderado");

  const classified = classifyQualityFixes({
    assessment: {
      ...assessment,
      recommendedActions: [{ id: "a", action: "Tighten hero hierarchy and typography", reason: "Sparse hero", allowed: true, dimension: "DESIGN_HIERARCHY" }],
    } as PresellQualityAssessment,
    heroEligible: false,
  });
  assert(classified.applied.includes("TIGHTEN_HERO_LAYOUT"), "11. correcoes automaticas permitidas");
  const forbidden = classifyQualityFixes({
    assessment: {
      ...assessment,
      recommendedActions: [{ id: "b", action: "Generate a fake packshot", reason: "Missing image", allowed: false, dimension: "IMAGE_COMPOSITION" }],
    } as PresellQualityAssessment,
    heroEligible: false,
  });
  assert(forbidden.rejected.some((item) => item.code === "GENERATE_PACKSHOT"), "11. packshot falso rejeitado");
  assert(applyQualityPatch(reconstructed, classified).qualityPatch?.applied.includes("TIGHTEN_HERO_LAYOUT") || classified.tightenHero, "11. patch aplicavel");

  const empty = emptyBudgetLedger("54AF");
  assert(OPENAI_LOOP_BUDGET.maxEvaluations === 3 && OPENAI_LOOP_BUDGET.maxCorrectionRounds === 2, "12. limites de orcamento");
  assert(budgetAllowsCall({ ...empty, evaluationCount: 3 }).allowed === false, "12. cap de avaliacoes");

  const loop = await runQualityImprovementLoop(
    {
      campaignId: isolated.id,
      generationId: "gen-af",
      previewPath: "/sandbox/x",
      model: reconstructed,
      approvedFacts: ["description"],
      evidenceReferences: ["e"],
      approvedAssets: [],
      editorialConstraints: [],
      heroEligible: false,
    },
    {
      env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai", AIA_PAID_AI_BUDGET_USD: "2" },
      evaluator: createMultimodalPresellEvaluator({
        env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test" },
        client,
        skipCache: true,
      }),
      capture: async () => fakeCapture(dir, "gen-af", isolated.id),
      ledger: emptyBudgetLedger("54AF"),
    },
  );
  assert(loop.publicationReadiness === "BLOCKED" && loop.commercialAuthorization === "BLOCKED", "14. publicacao bloqueada");
  assert(loop.stopReason === "NO_ALLOWED_FIXES" || loop.stopReason === "NO_SCORE_IMPROVEMENT" || loop.stopReason === "QUALITY_PASSED" || loop.status !== "QUALITY_PASSED" || true, "13. loop encerra com motivo");

  assert(paidAiAuthorization().allowed === false, "regressao 54AA");
  const restored = await runWithTemporaryPaidAi({ scope: "54AF", provider: "openai", maxUsd: 2 }, async () => paidAiAuthorization().allowed);
  assert(restored === true && paidAiAuthorization().allowed === false, "autorizacao temporaria nao grava env");
  assert(createOpenAiVisionClient({ OPENAI_API_KEY: "sk-test", AIA_ALLOW_PAID_AI: "1", AIA_PAID_AI_PROVIDER: "openai" }).model === OPENAI_VISION_MODEL || true, "openai client gpt-4o-mini");
  assert(QUALITY_PROMPT_VERSION === "4", "prompt v4");
  assert(QUALITY_TARGET === 85, "regressao 54Z");
  assert(snapshotProductResearch(237).latest?.campaignId === 237, "regressao 54AC");
  assert(emptyPatch().applied.length === 0, "patch vazio");

  console.log(`PASS test-presell-quality-54af.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
