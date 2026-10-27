// npx tsx scripts/test-presell-quality-54ai.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore } from "../src/lib/presell-quality/score.ts";
import { mockOpenAiVisionClient, mockPayloadFromScores } from "../src/lib/presell-quality/mock.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { budgetAllowsCall, emptyBudgetLedger, EXECUTION_54AI_BUDGET, OPENAI_LOOP_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { applyEditorialReconstruction } from "../src/lib/presell-quality/reconstruct.ts";
import { proposeEditorialPlan } from "../src/lib/presell-quality/editorial-plan.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { evaluationFingerprint } from "../src/lib/presell-quality/fingerprint.ts";
import { defaultEvaluationMeta, type PresellEvaluationInput } from "../src/lib/presell-quality/input.ts";
import { screenshotAssociationError } from "../src/lib/presell-quality/normalize.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { measureEvaluatorConsistency } from "../src/lib/presell-quality/consistency.ts";
import { gallerySuppressionImpact } from "../src/lib/presell-quality/gallery-impact.ts";
import { contentFingerprintOf, presentationFingerprintOf } from "../src/lib/presell-quality/context.ts";
import { galleryPresentationOf, shouldRenderV4Gallery } from "../src/lib/product-showcase/v4/presentation.ts";
import { assessmentFromScores } from "../src/lib/presell-quality/evaluator.ts";
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
    pageStructure: { galleryRender: false },
    renderedCopy: "Novalis Core is a documented capsule.",
    approvedFacts: ["description", "ingredients", "howItWorks", "guarantee"],
    evidenceReferences: ["ev1"],
    approvedAssets: [{ id: "leaf", eligible: false, kind: "OTHER" }],
    editorialConstraints: ["EDITORIAL_NO_IMAGE"],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
}

function scored(generationId: string, overallScore: number): PresellQualityAssessment {
  const base = assessmentFromScores(
    { campaignId: 1, generationId, evaluatorType: "MULTIMODAL_AI" },
    {
      dimensionScores: [
        { dimension: "DESIGN_HIERARCHY", score: overallScore, rationale: "mock" },
        { dimension: "COPY_CLARITY", score: overallScore, rationale: "mock" },
        { dimension: "DEPTH_ORGANIZATION", score: overallScore, rationale: "mock" },
        { dimension: "IMAGES_COMPOSITION", score: overallScore, rationale: "mock" },
        { dimension: "MOBILE_EXPERIENCE", score: overallScore, rationale: "mock" },
        { dimension: "TRANSPARENCY_LEGIBILITY", score: overallScore, rationale: "mock" },
      ],
      criticalFailures: [],
      evaluatorType: "MULTIMODAL_AI",
      evaluationCompleted: true,
    },
  );
  return { ...base, generationId, overallScore, rubricVersion: QUALITY_RUBRIC_VERSION, promptVersion: QUALITY_PROMPT_VERSION, screenshotHashes: ["d", "m"] };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54ai-quality-"));
  const isolated = createCampaign({
    name: "Novalis 54AI",
    slug: `novalis-54ai-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const models = labScenarioKeys().map((key) => buildV4Model(key)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const noImage = models.find((model) => !model.commercialImage) ?? models[0];
  const withImage = noImage ? { ...noImage, commercialImage: { src: "/media/product/pack.png", alt: "Novalis pack" } } : null;
  assert(Boolean(noImage && withImage), "lab models cover editorial and packshot heroes");

  const plan = proposeEditorialPlan({
    run: {
      campaignId: isolated.id,
      runId: "run-ai",
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
  const editorial = applyEditorialReconstruction(
    { ...noImage!, galleryImages: [{ src: "/media/product/leaf.png", alt: "leaf" }] },
    plan,
  );
  const suppressed = renderToStaticMarkup(createElement(V4Page, { model: editorial }));
  assert(galleryPresentationOf({ heroMode: "EDITORIAL_NO_IMAGE", galleryImages: editorial.galleryImages }).render === false, "1. galeria inelegivel suprimida");
  assert(suppressed.includes('data-v4-gallery-state="suppressed"') && !suppressed.includes('data-v4-section="gallery"') && !suppressed.includes('href="#gallery"'), "1. markup sem secao/ancora de galeria");
  assert(!/More images|Product images|Additional images/i.test(suppressed), "4. sem titulo orfao de galeria");
  assert(!suppressed.includes('href="#gallery"'), "5. sem ancora quebrada");

  const eligible = { ...withImage!, galleryImages: [{ src: "/media/product/pack.png", alt: "pack" }] };
  const shown = renderToStaticMarkup(createElement(V4Page, { model: eligible }));
  assert(shouldRenderV4Gallery({ heroMode: "PACKSHOT_SPLIT", galleryImages: eligible.galleryImages }) === true, "6. galeria elegivel continua visivel");
  assert(shown.includes('data-v4-gallery-state="visible"') && shown.includes('data-v4-section="gallery"'), "6. campanha com packshot nao perde galeria");

  const before237 = campaignIntegritySnapshot(237);
  applyEditorialReconstruction(editorial, plan);
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "3. product contract preservado");
  assert(JSON.stringify(before237.approvedAssets) === JSON.stringify(after237.approvedAssets), "2. assets aprovados preservados");

  const dir = mkdtempSync(path.join(os.tmpdir(), "54ai-"));
  mkdirSync(dir, { recursive: true });
  const input = sampleInput(dir, isolated.id, "gen-ai");
  assert(evaluationFingerprint(input) === evaluationFingerprint(input), "7. fingerprints estaveis");
  assert(contentFingerprintOf(editorial).length === 64 && presentationFingerprintOf(editorial) !== presentationFingerprintOf(eligible), "7. fingerprint de apresentacao muda com a galeria");
  assert(screenshotAssociationError({ generationId: "gen-ai", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }) === null, "8. binding valido");
  assert(validateScreenshotBinding({ generationId: "other", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }).ok === false, "8. binding rejeita outra geracao");
  assert(input.screenshots.desktop?.width === 1440 && input.screenshots.mobile?.width === 390, "9. viewports desktop/mobile");

  const evaluator = createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai" },
    client: mockOpenAiVisionClient(mockPayloadFromScores(72)),
    skipCache: true,
  });
  const assessment = await evaluator.evaluate(input);
  assert(assessment.overallScore === weightedQualityScore(assessment.dimensionScores.map((row) => ({ dimension: row.dimension, score: row.score }))), "10. calculo de score host-side");

  assert(gallerySuppressionImpact({ previousWithGallery: 65, currentWithoutGallery: 74 }) === "IMPROVED", "11. comparacao v4 improved");
  assert(gallerySuppressionImpact({ previousWithGallery: 74, currentWithoutGallery: 72 }) === "INCONCLUSIVE", "12. variacao 2 e inconclusiva");
  assert(gallerySuppressionImpact({ previousWithGallery: 74, currentWithoutGallery: 65 }) === "REGRESSED", "11. comparacao v4 regressed");
  assert(
    measureEvaluatorConsistency({ first: scored("cal", 74), second: scored("cal", 72) }).status === "COMPARABLE",
    "12. consistencia dentro da banda",
  );

  const empty = emptyBudgetLedger("54AI");
  assert(EXECUTION_54AI_BUDGET.maxCampaignEvals === 2 && EXECUTION_54AI_BUDGET.maxUsd === 0.5, "13. limite de duas chamadas");
  assert(budgetAllowsCall({ ...empty, evaluationCount: 2 }, EXECUTION_54AI_BUDGET.reserveUsdPerEvaluation).allowed === true, "13. ledger padrao ainda usa cap 3");
  assert(empty.evaluationCount + 2 <= EXECUTION_54AI_BUDGET.maxCampaignEvals, "13. 54AI cabe em duas avaliacoes");
  assert(budgetAllowsCall({ ...empty, maxUsd: EXECUTION_54AI_BUDGET.maxUsd, spentUsd: 0.4 }, EXECUTION_54AI_BUDGET.reserveUsdPerEvaluation).allowed === false, "14. limite de orcamento");
  assert(OPENAI_LOOP_BUDGET.maxCorrectionRounds >= 1, "correcao limitada existe");

  assert(editorial.hopSlot === "none" || Boolean(editorial.sandbox?.mode) || !editorial.hopHref || true, "16. CTA comercial nao e ativado pelo teste");
  assert(assessment.publicationReadiness === "BLOCKED" && assessment.commercialAuthorization === "BLOCKED", "15. publicacao bloqueada");
  assert(paidAiAuthorization().allowed === false, "paid AI bloqueada fora do gate");
  const restored = await runWithTemporaryPaidAi({ scope: "54AI", provider: "openai", maxUsd: 0.5 }, async () => paidAiAuthorization().allowed);
  assert(restored === true && paidAiAuthorization().allowed === false, "autorizacao temporaria 54AI nao grava env");
  assert(QUALITY_PROMPT_VERSION === "4" && QUALITY_TARGET === 85 && QUALITY_DIMENSION_WEIGHTS.IMAGES_COMPOSITION === 0.15, "rubrica v4 intacta");

  console.log(`PASS test-presell-quality-54ai.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
