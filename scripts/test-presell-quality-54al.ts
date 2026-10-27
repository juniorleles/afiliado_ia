// npx tsx scripts/test-presell-quality-54al.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCampaign } from "../src/lib/campaigns.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { weightedQualityScore } from "../src/lib/presell-quality/score.ts";
import { normalizeModelPayload } from "../src/lib/presell-quality/normalize.ts";
import { classifyJsonPayload } from "../src/lib/ai/parse-ai-json.ts";
import { mockOpenAiVisionClient, mockPayloadFromScores } from "../src/lib/presell-quality/mock.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { budgetAllowsCall, emptyBudgetLedger, EXECUTION_54AL_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { assessmentFromScores } from "../src/lib/presell-quality/evaluator.ts";
import { screenshotAssociationError } from "../src/lib/presell-quality/normalize.ts";
import { validateScreenshotBinding } from "../src/lib/presell-quality/binding.ts";
import { defaultEvaluationMeta, type PresellEvaluationInput } from "../src/lib/presell-quality/input.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { FactCandidate } from "../src/lib/presell-quality/recovery.ts";
import {
  aggregateValidAssessments,
  classifyAssessmentValidity,
  diagnoseEvaluatorPair,
  medianScore,
  DISPERSION_LIMIT,
  ASSESSMENT_VALIDITY_VERSION,
} from "../src/lib/presell-quality/assessment-validity.ts";
import { auditQualityRubric, EXPECTED_QUALITY_WEIGHTS } from "../src/lib/presell-quality/rubric-audit.ts";
import {
  AUTO_ACCEPT_POLICY_AUTHORIZED,
  autoAcceptDecision,
  buildEvidenceInventory,
  reviewQueueFromInventory,
} from "../src/lib/presell-quality/evidence-inventory.ts";
import { buildContentGapReport } from "../src/lib/presell-quality/content-gap-report.ts";

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

function proposal(field: FieldProposal["field"], text: string, status: FieldProposal["status"] = "ACCEPTED"): FieldProposal {
  return {
    field,
    currentValue: text,
    suggestedValue: text,
    status,
    evidenceIds: ["ev-n1"],
    sourceUrl: "https://example.test/novalis",
    sourceClass: "SELLER",
    verification: "SELLER_STATED",
    restriction: "PUBLISHABLE",
    collectedAt: "2026-01-01T00:00:00.000Z",
    eligibleForBatch: false,
    notes: [],
  };
}

function candidate(partial: Partial<FactCandidate> & { field: string; text: string }): FactCandidate {
  return {
    sourceUrl: "https://example.test/novalis",
    sourceClass: "SELLER",
    excerpt: partial.text,
    collectedAt: "2026-01-01T00:00:00.000Z",
    verification: "SELLER_STATED",
    usable: true,
    approvedForUse: false,
    blockReason: null,
    duplicateOf: null,
    ...partial,
  };
}

function fakeRun(proposals: FieldProposal[]): ProductResearchRun {
  return {
    version: 1,
    runId: "run-novalis",
    campaignId: 1,
    productName: "Novalis Core",
    status: "COMPLETED",
    stage: "done",
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:00.000Z",
    seeds: [],
    seedRejection: null,
    limitations: [],
    sources: [],
    coverageTotal: proposals.length,
    coverageMax: 11,
    reviewAccepted: proposals.filter((item) => item.status === "ACCEPTED").length,
    reviewTotal: proposals.length,
    publicationReadiness: "BLOCKED",
    publicationReason: "quality",
    grounding: "PASS",
    neutrality: "PASS",
    contentQuality: "PASS",
    commercialAuthorization: "BLOCKED",
    proposals,
    decisions: [],
    error: null,
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  process.env.AIA_PRESELL_QUALITY_ROOT = mkdtempSync(path.join(os.tmpdir(), "54al-quality-"));

  const validPayload = JSON.stringify(mockPayloadFromScores(80));
  assert(Boolean(normalizeModelPayload(validPayload).dimensionScores.length), "1. payload valido");
  try {
    normalizeModelPayload("not-json");
    assert(false, "2. payload invalido");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    assert(/INVALID_JSON|invalid|malformed|empty/i.test(`${code} ${String(err)}`), "2. payload invalido");
  }
  try {
    normalizeModelPayload(JSON.stringify({ dimensionScores: [{ dimension: "COPY_CLARITY", score: 40, rationale: "only one" }] }));
    assert(false, "3. dimensao ausente");
  } catch (err) {
    assert(err instanceof Error && /MISSING_DIMENSION|missing/i.test(String(err)), "3. dimensao ausente");
  }
  try {
    normalizeModelPayload(JSON.stringify({ ...mockPayloadFromScores(80), dimensionScores: mockPayloadFromScores(80).dimensionScores.map((row, i) => (i === 0 ? { ...row, score: 140 } : row)) }));
    assert(false, "4. score fora da escala");
  } catch (err) {
    assert(err instanceof Error && /SCORE_OUT_OF_RANGE|0-100/i.test(String(err)), "4. score fora da escala");
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "54al-"));
  mkdirSync(dir, { recursive: true });
  const input: PresellEvaluationInput = {
    campaignId: 1,
    generationId: "gen-al",
    productContractVersion: defaultEvaluationMeta().productContractVersion,
    rendererVersion: defaultEvaluationMeta().rendererVersion,
    screenshots: { desktop: shot(dir, "gen-al-d.png", "gen-al"), mobile: shot(dir, "gen-al-m.png", "gen-al") },
    pageStructure: {},
    renderedCopy: "Novalis Core is a documented capsule.",
    approvedFacts: ["description"],
    evidenceReferences: ["ev1"],
    approvedAssets: [],
    editorialConstraints: [],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  };
  assert(screenshotAssociationError({ generationId: "gen-al", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }) === null, "5. screenshot correto");
  assert(validateScreenshotBinding({ generationId: "other", desktop: input.screenshots.desktop, mobile: input.screenshots.mobile }).ok === false, "6. generationId incorreto");

  const first = scored({ generationId: "gen-al", overallScore: 70, assessmentId: "pqa-a" });
  const same = scored({ generationId: "gen-al", overallScore: 70, assessmentId: "pqa-b" });
  const low = scored({ generationId: "gen-al", overallScore: 16, assessmentId: "pqa-low" });
  const high = scored({ generationId: "gen-al", overallScore: 76, assessmentId: "pqa-high" });
  const otherGen = scored({ generationId: "gen-other", overallScore: 90, assessmentId: "pqa-x", screenshotHashes: ["other-d", "other-m"] });
  assert(classifyAssessmentValidity({ assessment: first }).state === "VALID_ASSESSMENT", "7. duas avaliacoes identicas");
  assert(aggregateValidAssessments([first, same]).unstable === false && aggregateValidAssessments([first, same]).officialScore === 70, "7. agregacao identica");
  const discord = diagnoseEvaluatorPair({ first: low, second: high });
  assert(discord.rootCause === "VALID_BUT_DISCORDANT" && discord.first.state === "VALID_BUT_DISCORDANT", "8. avaliacoes divergentes");
  assert(classifyAssessmentValidity({ assessment: low }).state === "VALID_ASSESSMENT", "9. score baixo valido");

  const failed = createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai" },
    client: mockOpenAiVisionClient(mockPayloadFromScores(70), undefined, new Error("HTTP_502")),
    skipCache: true,
  });
  const transport = await failed.evaluate(input);
  assert(transport.assessmentStatus === "EVALUATION_FAILED" && classifyAssessmentValidity({ assessment: transport }).state === "TRANSPORT_FAILURE", "10. falha de transporte");
  assert(classifyJsonPayload("{\"dimensionScores\":[") === "truncated", "11. truncamento");
  assert(classifyAssessmentValidity({ truncated: true }).state === "SCHEMA_INVALID", "11. truncamento e schema invalido");

  assert(medianScore([16, 76]) === 46 && medianScore([70, 70, 90]) === 70, "12. agregacao por mediana");
  const spread = aggregateValidAssessments([low, high]);
  assert(spread.dispersion.range === 60 && spread.dispersionLimit === DISPERSION_LIMIT && spread.unstable, "13. calculo de dispersao");
  const mixed = aggregateValidAssessments([first, otherGen]);
  assert(mixed.mixedGenerations && mixed.generationId === "gen-al" && mixed.officialScore === 70, "14. separacao entre geracoes");

  const rubric = auditQualityRubric({ evaluatorRationales: ["missing benefits"] });
  assert(
    rubric.weightsUnchanged &&
      rubric.versionChanged === false &&
      rubric.informationalPageCanScoreHigh &&
      !rubric.requiresClinicalBenefits &&
      QUALITY_PROMPT_VERSION === "4" &&
      QUALITY_TARGET === 85 &&
      QUALITY_DIMENSION_WEIGHTS.DESIGN_HIERARCHY === EXPECTED_QUALITY_WEIGHTS.DESIGN_HIERARCHY,
    "15. rubrica preservada",
  );

  const accepted = [proposal("description", "Novalis Core is a documented mineral capsule."), proposal("howItWorks", "Take one capsule daily with water.")];
  const inventory = buildEvidenceInventory({
    campaignId: 1,
    run: fakeRun(accepted),
    officialHosts: ["example.test"],
    idPrefix: "NOV",
    candidates: [
      candidate({ field: "benefits", text: "Clinically proven to treat fatigue.", usable: false, blockReason: "Medical or health claim is not restated as a product fact." }),
      candidate({ field: "shipping", text: "Ships by USPS to the address on the order." }),
      candidate({ field: "description", text: "Novalis Core is a documented mineral capsule." }),
    ],
  });
  assert(inventory.candidates.some((item) => item.currentState === "BLOCKED_MEDICAL"), "16. rejeicao de claims nao suportados");
  assert(inventory.totals.accepted === 2 && inventory.acceptedFacts.some((item) => item.text.includes("Novalis Core")), "17. preservacao de evidencias");
  assert(AUTO_ACCEPT_POLICY_AUTHORIZED === false && autoAcceptDecision().accepted === false && inventory.totals.newFactsAccepted === 0, "18. ausencia de promocao automatica indevida");
  const ready = reviewQueueFromInventory(inventory);
  assert(ready.every((item) => item.approvedForUse === false), "18. fila nao aprova fatos");
  const gaps = buildContentGapReport({ inventory });
  assert(gaps.gaps.some((item) => item.field === "benefits" && item.resolutionClass === "MUST_NOT_FILL"), "16. beneficios medicos nao sao obrigatorios");
  assert(gaps.automatable === 0, "18. aceite automatico continua fechado");

  const isolated = createCampaign({
    name: "Novalis 54AL",
    slug: `novalis-54al-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  const evaluator = createMultimodalPresellEvaluator({
    env: { AIA_ALLOW_PAID_AI: "1", OPENAI_API_KEY: "sk-test", AIA_PAID_AI_PROVIDER: "openai" },
    client: mockOpenAiVisionClient(mockPayloadFromScores(84)),
    skipCache: true,
  });
  const assessment = await evaluator.evaluate({ ...input, campaignId: isolated.id });
  assert(assessment.overallScore === weightedQualityScore(assessment.dimensionScores.map((row) => ({ dimension: row.dimension, score: row.score }))), "12. score host-side");
  assert(assessment.publicationReadiness === "BLOCKED", "19. publicacao bloqueada");
  assert(assessment.commercialAuthorization === "BLOCKED", "20. CTA comercial bloqueado");
  assert(spread.officialStatus === "QUALITY_REJECTED", "avaliacao instavel nao passa qualidade");
  assert(ASSESSMENT_VALIDITY_VERSION === "1" && DISPERSION_LIMIT === 8, "limites de dispersao versionados");
  assert(EXECUTION_54AL_BUDGET.maxUsd === 0.5 && EXECUTION_54AL_BUDGET.maxCampaignEvals === 4, "teto 54AL");
  assert(budgetAllowsCall({ ...emptyBudgetLedger("54AL"), maxUsd: 0.5, spentUsd: 0.45 }, EXECUTION_54AL_BUDGET.reserveUsdPerEvaluation).allowed === false, "limite de orcamento");
  assert(paidAiAuthorization().allowed === false, "paid AI bloqueada fora do gate");
  const restored = await runWithTemporaryPaidAi({ scope: "54AL", provider: "openai", maxUsd: 0.5 }, async () => paidAiAuthorization().allowed);
  assert(restored === true && paidAiAuthorization().allowed === false, "autorizacao temporaria 54AL nao grava env");

  const before237 = campaignIntegritySnapshot(237);
  buildEvidenceInventory({ campaignId: 237, run: fakeRun(accepted), candidates: [] });
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "17. campanha 237 nao e mutada pelo inventario");

  console.log(`PASS test-presell-quality-54al.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
