// npx tsx scripts/test-presell-quality-54ab.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { defaultEvaluationMeta, type PresellEvaluationInput } from "../src/lib/presell-quality/input.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { mockOpenAiVisionClient, mockPayloadFromScores, mockVisionClient } from "../src/lib/presell-quality/mock.ts";
import { createOpenAiVisionClient, openaiVisionProviderStatus, OPENAI_TEXT_ONLY_MODELS, OPENAI_VISION_MODEL, OPENAI_VISION_PROVIDER_ID } from "../src/lib/presell-quality/openai-provider.ts";
import { createAnthropicVisionClient } from "../src/lib/presell-quality/provider.ts";
import { normalizeModelPayload } from "../src/lib/presell-quality/normalize.ts";
import { assessmentIsCurrent, readQualityAssessment, writeQualityAssessment } from "../src/lib/presell-quality/persist.ts";
import { evaluationFingerprint } from "../src/lib/presell-quality/fingerprint.ts";
import { paidAiAuthorization, paidProviderAllowed, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { QUALITY_DIMENSIONS } from "../src/lib/presell-quality/types.ts";
import { budgetAllowsCall, emptyBudgetLedger, OPENAI_LOOP_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { classifyQualityFixes } from "../src/lib/presell-quality/classify.ts";
import { applyQualityPatch, emptyPatch } from "../src/lib/presell-quality/patch.ts";
import { runQualityImprovementLoop } from "../src/lib/presell-quality/loop.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { publicSectionTitle } from "../src/lib/product-showcase/v4/presentation.ts";
import type { CaptureManifest } from "../src/lib/presell-quality/capture.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { ModelQualityPayload } from "../src/lib/presell-quality/input.ts";

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
    role: name.startsWith("m") ? ("mobile" as const) : ("desktop" as const),
    path: file,
    generationId,
    sha256: require("node:crypto").createHash("sha256").update(PIXEL).digest("hex"),
    width: name.startsWith("m") ? 390 : 1440,
    height: name.startsWith("m") ? 844 : 900,
  };
}

function sampleInput(dir: string, campaignId: number, generationId: string, copy = "Novalis is presented by the seller."): PresellEvaluationInput {
  const meta = defaultEvaluationMeta();
  return {
    campaignId,
    generationId,
    productContractVersion: meta.productContractVersion,
    rendererVersion: meta.rendererVersion,
    screenshots: { desktop: shot(dir, `${generationId}-d.png`, generationId), mobile: shot(dir, `${generationId}-m.png`, generationId) },
    pageStructure: { sections: ["hero", "gallery"] },
    renderedCopy: copy,
    approvedFacts: ["description", "ingredients"],
    evidenceReferences: ["ev1"],
    approvedAssets: [{ id: "bottle", eligible: false, kind: "OTHER" }],
    editorialConstraints: ["Do not invent benefits."],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
}

function envOpenAi(flag: "0" | "1", extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    AIA_ALLOW_PAID_AI: flag,
    OPENAI_API_KEY: extra.OPENAI_API_KEY ?? "sk-test",
    AIA_PAID_AI_PROVIDER: "openai",
    AIA_PAID_AI_BUDGET_USD: "2",
    AIA_PAID_AI_SCOPE: "54AB",
    ...extra,
  };
}

function findingsPayload(score: number, message: string, action: string, allowed = true, extra: Partial<ModelQualityPayload> = {}): ModelQualityPayload {
  return {
    ...mockPayloadFromScores(score),
    findings: [{ id: "f1", dimension: "DESIGN_HIERARCHY", severity: "WARNING", message, evidence: ["desktop-viewport"] }],
    recommendedActions: [{ id: "a1", action, allowed, reason: allowed ? "Presentation-only." : "Not allowed." }],
    ...extra,
  };
}

function fakeCapture(dir: string, campaignId: number, generationId: string, ok = true): CaptureManifest {
  const desktop = shot(dir, `${generationId}-d.png`, generationId);
  const mobile = ok ? shot(dir, `${generationId}-m.png`, generationId) : null;
  return {
    campaignId,
    generationId,
    previewPath: "/admin/lab/lp-generator/x/preview",
    capturedAt: new Date().toISOString(),
    desktop,
    mobile,
    extras: [
      { ...desktop, role: "desktop-viewport" },
      ...(mobile ? [{ ...mobile, role: "mobile-viewport" as const }] : []),
    ],
    ok,
    notes: ok ? [] : ["mobile capture failed"],
  };
}

function assessmentShell(partial: Partial<PresellQualityAssessment>): PresellQualityAssessment {
  return {
    assessmentId: "pqa-test",
    assessmentVersion: 1,
    campaignId: 1,
    generationId: "gen",
    productContractVersion: 1,
    rendererVersion: "v4",
    evaluatorType: "MULTIMODAL_AI",
    evaluatorModel: OPENAI_VISION_MODEL,
    evaluatedAt: null,
    desktopScreenshotReference: null,
    mobileScreenshotReference: null,
    overallScore: 50,
    dimensionScores: [],
    criticalFailures: [],
    findings: [],
    recommendedActions: [],
    assessmentStatus: "QUALITY_REJECTED",
    humanReviewEligibility: "NOT_ELIGIBLE",
    evidenceReferences: [],
    costMetadata: { paidAiEnabled: true, estimatedUsd: 0, actualUsd: 0, evaluationCount: 1, cached: false, notes: [] },
    aiQualityApproval: false,
    humanReviewApproval: false,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    ...partial,
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const root = mkdtempSync(path.join(os.tmpdir(), "pqa-54ab-"));
  process.env.AIA_PRESELL_QUALITY_ROOT = root;
  const shots = path.join(root, "shots");
  mkdirSync(shots, { recursive: true });

  const isolated = createCampaign({
    name: "Novalis 54AB",
    slug: `novalis-54ab-${Date.now()}`,
    headline: "Novalis 54AB",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  let openaiFetch = 0;
  const adapter = createOpenAiVisionClient({
    env: envOpenAi("1"),
    fetchImpl: async () => {
      openaiFetch += 1;
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify(mockPayloadFromScores(86)),
          usage: { input_tokens: 1200, output_tokens: 350 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const wired = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: adapter,
    persist: (item) => item,
    readFile: () => PIXEL,
  }).evaluate(sampleInput(shots, isolated.id, "gen-openai"));
  assert(wired.provider === "openai" && wired.assessmentStatus === "QUALITY_PASSED" && openaiFetch >= 1, "1. OpenAI Vision real integrado (fetch mockado)");

  const missingKey = await createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-key"));
  assert(missingKey.assessmentStatus === "EVALUATION_FAILED" && missingKey.errorCode === "API_KEY_MISSING", "2. OPENAI_API_KEY ausente");

  const textOnly = openaiVisionProviderStatus(envOpenAi("1", { AIA_OPENAI_VISION_MODEL: "gpt-5-mini" }));
  assert(OPENAI_TEXT_ONLY_MODELS.has("gpt-5-mini") && textOnly.vision === false, "3. modelo sem suporte multimodal");
  const textOnlyEval = await createMultimodalPresellEvaluator({
    env: envOpenAi("1", { AIA_OPENAI_VISION_MODEL: "gpt-5-mini" }),
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-text-only"));
  assert(textOnlyEval.errorCode === "MODEL_NOT_MULTIMODAL", "3. avaliacao bloqueia modelo text-only");

  const valid = normalizeModelPayload(JSON.stringify(mockPayloadFromScores(88)));
  assert(valid.dimensionScores.length === QUALITY_DIMENSIONS.length, "4. resposta estruturada valida");
  const mapped = Object.fromEntries(valid.dimensionScores.map((row) => [row.dimension, { score: String(row.score), rationale: row.rationale }]));
  const fromMap = normalizeModelPayload(JSON.stringify({ dimensionScores: mapped, criticalFailures: [], findings: [], recommendedActions: [] }));
  assert(fromMap.dimensionScores.length === QUALITY_DIMENSIONS.length, "4. mapa de dimensoes e coercao de score");

  let invalid = false;
  try {
    normalizeModelPayload("not-json");
  } catch {
    invalid = true;
  }
  assert(invalid, "5. resposta invalida");

  const timeout = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(90), undefined, new Error("timeout waiting for vision")),
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-timeout"));
  assert(timeout.errorCode === "TIMEOUT", "6. timeout");

  const httpErr = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(90), undefined, new Error("HTTP_429: rate limit")),
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-http"));
  assert(httpErr.errorCode === "HTTP_ERROR", "7. erro HTTP");

  const ledger = emptyBudgetLedger("54AB");
  ledger.spentUsd = 1.9;
  const overBudget = budgetAllowsCall(ledger);
  assert(!overBudget.allowed, "8. orcamento excedido");

  const budgetCounter = { count: 0 };
  const budgetLoop = await runQualityImprovementLoop(
    {
      campaignId: isolated.id,
      generationId: "gen-budget",
      previewPath: "/x",
      model: buildV4Model(labScenarioKeys()[0]!)!,
      approvedFacts: ["description"],
      evidenceReferences: ["ev"],
      approvedAssets: [{ id: "a", eligible: false, kind: "OTHER" }],
      editorialConstraints: [],
      heroEligible: false,
    },
    {
      env: envOpenAi("1"),
      evaluator: createMultimodalPresellEvaluator({
        env: envOpenAi("1"),
        client: mockOpenAiVisionClient(mockPayloadFromScores(50), budgetCounter),
        persist: (item) => item,
        skipCache: true,
      }),
      capture: async () => fakeCapture(shots, isolated.id, "gen-budget"),
      ledger: { ...emptyBudgetLedger("54AB"), spentUsd: 1.9, maxUsd: 2 },
      apply: (_id, patch, model) => applyQualityPatch(model, patch),
    },
  );
  assert(budgetLoop.stopReason === "BUDGET_EXCEEDED" && budgetCounter.count === 0, "8. loop nao chama o provider acima do teto");

  let anthropicFetch = 0;
  const anthropic = createAnthropicVisionClient({
    env: envOpenAi("1"),
    fetchImpl: async () => {
      anthropicFetch += 1;
      return new Response("{}", { status: 200 });
    },
  });
  let anthropicBlocked = false;
  try {
    await anthropic.complete({ system: "x", userText: "y", images: [] });
  } catch (err) {
    anthropicBlocked = /scoped to openai/i.test(err instanceof Error ? err.message : "");
  }
  assert(anthropicBlocked && anthropicFetch === 0 && !paidProviderAllowed("anthropic", envOpenAi("1")).allowed, "9. bloqueio de fallback Anthropic");

  const s84 = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(84)),
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-84"));
  assert(s84.assessmentStatus === "QUALITY_REJECTED" && s84.overallScore === 84, "10. score abaixo de 85");

  const s85 = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(85)),
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-85"));
  assert(s85.assessmentStatus === "QUALITY_PASSED" && s85.overallScore === 85, "11. score igual a 85");

  const critical = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(95, ["INSUFFICIENT_EDITORIAL_CONTENT"])),
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-crit"));
  assert(critical.assessmentStatus === "QUALITY_BLOCKED" && (critical.overallScore ?? 100) < QUALITY_TARGET, "12. falhas criticas");

  const allowed = classifyQualityFixes({
    assessment: assessmentShell({
      findings: [{ id: "title", dimension: "COPY_CLARITY", severity: "WARNING", message: "How it works is used as a usage heading.", evidence: ["how_it_works"] }],
      recommendedActions: [{ id: "retitle", action: "Retitle the usage section to Directions for Use.", allowed: true, reason: "Editorial title only." }],
    }),
    heroEligible: false,
  });
  assert(allowed.applied.includes("RETITLE_USAGE_SECTION") && allowed.titles?.how_it_works === "Directions for Use", "13. correcao permitida");

  const forbidden = classifyQualityFixes({
    assessment: assessmentShell({
      recommendedActions: [{ id: "fake", action: "Invent a testimonial about blood sugar.", allowed: false, reason: "No reviews in evidence." }],
    }),
    heroEligible: false,
  });
  assert(forbidden.rejected.some((item) => item.code === "INVENT_TESTIMONIAL" || item.code === "INVENT_BENEFIT"), "14. correcao proibida");

  const hero = classifyQualityFixes({
    assessment: assessmentShell({
      findings: [{ id: "hero-img", dimension: "IMAGES_COMPOSITION", severity: "BLOCKING", message: "Hero has no packshot. A gallery image could fill the hero.", evidence: ["hero", "gallery"] }],
      recommendedActions: [{ id: "promote", action: "Promote the gallery bottle image to the hero.", allowed: true, reason: "Image exists." }],
    }),
    heroEligible: false,
  });
  assert(hero.rejected.some((item) => item.code === "PROMOTE_UNELIGIBLE_HERO") && !hero.applied.includes("PROMOTE_UNELIGIBLE_HERO" as never), "15. imagem nao elegivel para Hero");

  const v4 = buildV4Model(labScenarioKeys()[0]!);
  assert(Boolean(v4), "26. renderer V4 compoe modelo");
  const factsBefore = JSON.stringify(v4!.contract);
  const imageBefore = v4!.commercialImage?.src ?? null;
  const patched = applyQualityPatch(v4!, allowed);
  assert(JSON.stringify(patched.contract) === factsBefore, "16. preservacao de fatos aprovados");
  assert((patched.commercialImage?.src ?? null) === imageBefore, "17. preservacao das evidencias/assets");

  const noGain = await runQualityImprovementLoop(
    {
      campaignId: isolated.id,
      generationId: "gen-nprogress",
      previewPath: "/x",
      model: v4!,
      approvedFacts: ["description"],
      evidenceReferences: ["ev"],
      approvedAssets: [{ id: "a", eligible: false, kind: "OTHER" }],
      editorialConstraints: [],
      heroEligible: false,
    },
    {
      env: envOpenAi("1"),
      evaluator: createMultimodalPresellEvaluator({
        env: envOpenAi("1"),
        client: mockOpenAiVisionClient([
          findingsPayload(62, "Hero is empty and spacing is excessive.", "Tighten the hero layout."),
          findingsPayload(61, "Hero is empty and spacing is excessive.", "Tighten the hero layout."),
        ], { count: 0 }),
        persist: (item) => item,
        skipCache: true,
      }),
      capture: async () => fakeCapture(shots, isolated.id, "gen-nprogress"),
      ledger: emptyBudgetLedger("54AB-np"),
      apply: (_id, patch, model) => applyQualityPatch(model, patch),
    },
  );
  assert(noGain.stopReason === "NO_SCORE_IMPROVEMENT" && noGain.iterations.length >= 2, "18. ausencia de melhoria entre iteracoes");

  const limited = await runQualityImprovementLoop(
    {
      campaignId: isolated.id,
      generationId: "gen-limit",
      previewPath: "/x",
      model: v4!,
      approvedFacts: ["description"],
      evidenceReferences: ["ev"],
      approvedAssets: [{ id: "a", eligible: false, kind: "OTHER" }],
      editorialConstraints: [],
      heroEligible: false,
    },
    {
      env: envOpenAi("1"),
      evaluator: createMultimodalPresellEvaluator({
        env: envOpenAi("1"),
        client: mockOpenAiVisionClient([
          findingsPayload(50, "Hero is empty.", "Tighten the hero layout."),
          findingsPayload(58, "Gallery composition is weak.", "Rank gallery images without promoting them to hero."),
          findingsPayload(66, "SANDBOX CTA badge is visually loud.", "Quiet the SANDBOX CTA presentation."),
        ], { count: 0 }),
        persist: (item) => item,
        skipCache: true,
      }),
      capture: async () => fakeCapture(shots, isolated.id, "gen-limit"),
      ledger: emptyBudgetLedger("54AB-limit"),
      apply: (_id, patch, model) => applyQualityPatch(model, patch),
    },
  );
  assert(
    (limited.stopReason === "CORRECTION_LIMIT" || limited.stopReason === "EVALUATION_LIMIT") &&
      limited.iterations.length <= OPENAI_LOOP_BUDGET.maxEvaluations &&
      limited.ledger.correctionCount <= OPENAI_LOOP_BUDGET.maxCorrectionRounds,
    "19. limite de iteracoes",
  );

  const other = createCampaign({
    name: "Novalis 54AB B",
    slug: `novalis-54ab-b-${Date.now()}`,
    headline: "Novalis B",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  const aWrite = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(70)),
  }).evaluate(sampleInput(shots, isolated.id, "gen-iso-a"));
  const bWrite = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(71)),
  }).evaluate(sampleInput(shots, other.id, "gen-iso-b"));
  assert(readQualityAssessment(isolated.id, aWrite.assessmentId)?.campaignId === isolated.id, "20. isolamento campanha A");
  assert(readQualityAssessment(other.id, bWrite.assessmentId)?.campaignId === other.id, "20. isolamento campanha B");
  assert(snapshotProductResearch(237).latest?.campaignId === 237, "20. campanha 237 intacta");

  const first = await createMultimodalPresellEvaluator({
    env: envOpenAi("1"),
    client: mockOpenAiVisionClient(mockPayloadFromScores(90)),
  }).evaluate({ ...sampleInput(shots, isolated.id, "gen-stale", "v1"), pageVersionToken: "i1" });
  const changed = { ...sampleInput(shots, isolated.id, "gen-stale", "v1"), pageVersionToken: "i2-patched" };
  assert(first.assessmentStatus === "QUALITY_PASSED", "21. avaliacao persistida");
  assert(!assessmentIsCurrent(first, { generationId: changed.generationId, inputFingerprint: evaluationFingerprint(changed) }), "21. avaliacao obsoleta apos patch");

  const mobileFail = await runQualityImprovementLoop(
    {
      campaignId: isolated.id,
      generationId: "gen-mobile",
      previewPath: "/x",
      model: v4!,
      approvedFacts: ["description"],
      evidenceReferences: ["ev"],
      approvedAssets: [],
      editorialConstraints: [],
      heroEligible: false,
    },
    {
      env: envOpenAi("1"),
      evaluator: createMultimodalPresellEvaluator({
        env: envOpenAi("1"),
        client: mockOpenAiVisionClient(mockPayloadFromScores(90)),
        persist: (item) => item,
      }),
      capture: async () => fakeCapture(shots, isolated.id, "gen-mobile", false),
      ledger: emptyBudgetLedger("54AB-mobile"),
      apply: (_id, patch, model) => applyQualityPatch(model, patch),
    },
  );
  assert(mobileFail.stopReason === "CAPTURE_FAILED" && mobileFail.status === "EVALUATION_FAILED", "22. falha na captura mobile");

  const persisted = writeQualityAssessment(aWrite);
  assert(readQualityAssessment(isolated.id, persisted.assessmentId)?.assessmentId === persisted.assessmentId, "23. persistencia de avaliacoes");

  const aaBlocked = paidAiAuthorization({ AIA_ALLOW_PAID_AI: "0" });
  const aaPass = await createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", ANTHROPIC_API_KEY: "sk-ant-test" },
    client: mockVisionClient(mockPayloadFromScores(85)),
    persist: (item) => item,
  }).evaluate(sampleInput(shots, isolated.id, "gen-54aa"));
  assert(aaBlocked.allowed === false && aaPass.assessmentStatus === "QUALITY_PASSED", "24. regressao da 54AA");

  const weightSum = Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((sum, item) => sum + item, 0);
  assert(QUALITY_TARGET === 85 && Math.abs(weightSum - 1) < 0.001 && Boolean(QUALITY_PROMPT_VERSION), "25. regressao da 54Z");

  const visual = applyQualityPatch(v4!, {
    ...allowed,
    tightenHero: true,
    galleryLead: true,
    sandboxQuiet: true,
    applied: [...allowed.applied, "TIGHTEN_HERO_LAYOUT", "RANK_GALLERY", "QUIET_SANDBOX_CTA"],
  });
  const html = renderToStaticMarkup(createElement(V4Page, { model: visual }));
  assert(
    html.includes("data-quality-hero") &&
      html.includes("RETITLE_USAGE_SECTION") &&
      publicSectionTitle("how_it_works", "How it works", allowed.titles) === "Directions for Use" &&
      !html.includes("invented-packshot"),
    "26. regressao do Renderer V4",
  );
  assert(emptyPatch().applied.length === 0, "26. patch vazio nao altera o modelo");

  let restored = "0";
  await runWithTemporaryPaidAi({ scope: "54AB", provider: "openai", maxUsd: 2 }, async () => {
    restored = process.env.AIA_ALLOW_PAID_AI ?? "";
    assert(restored === "1", "4. autorizacao temporaria de processo");
  });
  assert(process.env.AIA_ALLOW_PAID_AI === "0", "4. autorizacao temporaria restaurada sem escrever .env");

  assert(s85.costMetadata.actualUsd === 0 && wired.costMetadata.actualUsd === 0, "27. testes nao consomem creditos");

  console.log(`PASS test-presell-quality-54ab.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
