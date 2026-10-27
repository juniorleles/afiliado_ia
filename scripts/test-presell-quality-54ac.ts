// npx tsx scripts/test-presell-quality-54ac.ts
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_TARGET, type PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import { classifyQualityGaps, QUALITY_GAP_KINDS } from "../src/lib/presell-quality/gaps.ts";
import { stageImageCandidates } from "../src/lib/presell-quality/asset-recovery.ts";
import { calibrateQualityEvaluator } from "../src/lib/presell-quality/calibration.ts";
import { proposeEditorialPlan } from "../src/lib/presell-quality/editorial-plan.ts";
import { nextQualityAction, runAutonomousRecovery, validateFactCandidate } from "../src/lib/presell-quality/recovery.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { OPENAI_LOOP_BUDGET, budgetAllowsCall, emptyBudgetLedger } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_DIMENSION_WEIGHTS } from "../src/lib/presell-quality/types.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { DiscoveredAffiliateAsset } from "../src/lib/affiliate-policy/types.ts";
import { OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function proposal(field: FieldProposal["field"], status: FieldProposal["status"], value: string, extra: Partial<FieldProposal> = {}): FieldProposal {
  return {
    field,
    currentValue: status === "ACCEPTED" ? value : "",
    suggestedValue: value,
    status,
    evidenceIds: extra.evidenceIds ?? (value ? ["ev-1"] : []),
    sourceUrl: extra.sourceUrl ?? "https://shop.novalis.example/core",
    sourceClass: extra.sourceClass ?? "SELLER",
    verification: extra.verification ?? "SELLER_STATED",
    restriction: null,
    collectedAt: "2026-01-01T00:00:00.000Z",
    eligibleForBatch: false,
    notes: extra.notes ?? [],
    evidenceExcerpt: extra.evidenceExcerpt ?? value.slice(0, 80),
    ...extra,
  };
}

function asset(url: string, status: DiscoveredAffiliateAsset["status"], kind: DiscoveredAffiliateAsset["galleryKind"], extra: Partial<DiscoveredAffiliateAsset> = {}): DiscoveredAffiliateAsset {
  return {
    assetUrl: url,
    sourceUrl: "https://shop.novalis.example/core",
    assetType: "IMAGE",
    context: extra.context ?? "product image",
    declaredAuthorization: "UNSTATED",
    usageRestrictions: ["Not independently licensed."],
    status,
    galleryKind: kind,
    hero: false,
    decidedAt: status === "USER_APPROVED" ? "2026-01-01T00:00:00.000Z" : null,
    ...extra,
  };
}

function runOf(campaignId: number, proposals: FieldProposal[], assets: DiscoveredAffiliateAsset[] = []): ProductResearchRun {
  return {
    version: 1,
    runId: `pr-test-${campaignId}`,
    campaignId,
    productName: "Novalis Core",
    status: "COMPLETED",
    stage: "review",
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: "2026-01-01T00:00:00.000Z",
    seeds: ["https://shop.novalis.example/core"],
    seedRejection: null,
    limitations: [],
    sources: [{ url: "https://shop.novalis.example/core", ok: true, sourceClass: "SELLER" }],
    coverageTotal: 40,
    coverageMax: 100,
    reviewAccepted: proposals.filter((item) => item.status === "ACCEPTED").length,
    reviewTotal: proposals.length,
    publicationReadiness: "BLOCKED",
    publicationReason: "blocked",
    grounding: "PASS",
    neutrality: "PASS",
    contentQuality: "PASS",
    commercialAuthorization: "BLOCKED",
    proposals,
    decisions: [],
    error: null,
    discoveredAssets: assets,
  };
}

function assessment(campaignId: number, score: number, extra: Partial<PresellQualityAssessment> = {}): PresellQualityAssessment {
  return {
    assessmentId: extra.assessmentId ?? "pqa-test",
    assessmentVersion: 1,
    campaignId,
    generationId: extra.generationId ?? "gen-1",
    productContractVersion: 1,
    rendererVersion: "v4",
    evaluatorType: "MULTIMODAL_AI",
    evaluatorModel: OPENAI_VISION_MODEL,
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    desktopScreenshotReference: "d.png",
    mobileScreenshotReference: extra.mobileScreenshotReference ?? "m.png",
    overallScore: score,
    dimensionScores: [
      { dimension: "DESIGN_HIERARCHY", weight: 0.25, score, rationale: extra.findings?.[0]?.message ?? "Hero section lacks a packshot." },
      { dimension: "COPY_CLARITY", weight: 0.2, score, rationale: "Copy is thin." },
      { dimension: "DEPTH_ORGANIZATION", weight: 0.2, score, rationale: "Insufficient editorial depth." },
      { dimension: "IMAGES_COMPOSITION", weight: 0.15, score, rationale: "Gallery images are not approved packshots." },
      { dimension: "MOBILE_EXPERIENCE", weight: 0.1, score, rationale: extra.findings?.[0]?.message ?? "Hero is empty on mobile." },
      { dimension: "TRANSPARENCY_LEGIBILITY", weight: 0.1, score, rationale: extra.dimensionScores?.[5]?.rationale ?? "Disclosure present." },
    ],
    criticalFailures: [],
    findings: extra.findings ?? [
      { id: "hero", dimension: "DESIGN_HIERARCHY", severity: "BLOCKING", message: "The hero section contains no packshot.", evidence: ["hero"] },
    ],
    recommendedActions: extra.recommendedActions ?? [],
    assessmentStatus: score >= QUALITY_TARGET ? "QUALITY_PASSED" : "QUALITY_REJECTED",
    humanReviewEligibility: "NOT_ELIGIBLE",
    evidenceReferences: ["ev"],
    costMetadata: { paidAiEnabled: true, estimatedUsd: 0.01, actualUsd: 0, evaluationCount: 1, cached: false, notes: [] },
    aiQualityApproval: false,
    humanReviewApproval: false,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    screenshotHashes: ["aaa", "bbb"],
    ...extra,
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const root = mkdtempSync(path.join(os.tmpdir(), "pqa-54ac-"));
  process.env.AIA_PRESELL_QUALITY_ROOT = root;

  const isolated = createCampaign({
    name: "Novalis 54AC",
    slug: `novalis-54ac-${Date.now()}`,
    headline: "Novalis 54AC",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  assert(QUALITY_GAP_KINDS.length === 7, "gap kinds are complete");

  const thinRun = runOf(isolated.id, [
    proposal("description", "ACCEPTED", "Novalis Core is a documented capsule."),
    proposal("ingredients", "ACCEPTED", "Mineral blend"),
    proposal("benefits", "NOT_FOUND", ""),
    proposal("warnings", "NOT_FOUND", ""),
    proposal("faq", "NOT_FOUND", ""),
  ], [
    asset("https://shop.novalis.example/2bootle.png", "USER_APPROVED", "OTHER", {
      context: "two bottles",
      kindProposal: {
        proposedKind: "PRODUCT_PACKSHOT",
        reason: "Filename suggests bottles.",
        status: "PENDING",
        limitations: ["Human confirmation is required."],
      },
    }),
  ]);

  const gaps = classifyQualityGaps({
    assessment: assessment(isolated.id, 15, {
      findings: [
        { id: "hero", dimension: "DESIGN_HIERARCHY", severity: "BLOCKING", message: "The hero section contains no packshot.", evidence: ["hero"] },
        { id: "copy", dimension: "DEPTH_ORGANIZATION", severity: "BLOCKING", message: "Copy is thin and ingredients are superficial.", evidence: ["copy"] },
      ],
    }),
    run: thinRun,
    previousScore: 16,
  });
  assert(gaps.gaps.some((item) => item.kind === "IMAGE_ELIGIBILITY_GAP"), "1. classificacao IMAGE_ELIGIBILITY_GAP");
  assert(gaps.gaps.some((item) => item.kind === "EVIDENCE_GAP"), "1. classificacao EVIDENCE_GAP");
  assert(gaps.gaps.some((item) => item.kind === "CONTENT_DEPTH_GAP"), "1. classificacao CONTENT_DEPTH_GAP");
  assert(nextQualityAction(gaps) === "RESEARCH", "2. recuperacao de pesquisa e a proxima acao");

  const accepted = [proposal("description", "ACCEPTED", "Novalis Core is a documented capsule.")];
  const sourced = validateFactCandidate({
    proposal: proposal("warnings", "FOUND_REVIEW_REQUIRED", "Keep out of reach of children.", {
      sourceUrl: "https://shop.novalis.example/core/faq",
      sourceClass: "MANUFACTURER_OR_BRAND",
      verification: "SOURCE_STATED",
      evidenceExcerpt: "Keep out of reach of children.",
    }),
    accepted,
  });
  assert(sourced.usable && sourced.approvedForUse === false && sourced.sourceUrl?.includes("faq"), "3. proveniencia registrada e nao auto-aprovada");

  const dup = validateFactCandidate({
    proposal: proposal("description", "FOUND_REVIEW_REQUIRED", "Novalis Core is a documented capsule."),
    accepted,
  });
  assert(dup.duplicateOf === "description" && !dup.usable, "4. duplicacao de fatos");

  const conflict = validateFactCandidate({
    proposal: proposal("description", "FOUND_REVIEW_REQUIRED", "A different overview of Novalis Core."),
    accepted,
  });
  assert(!conflict.usable && /conflict/i.test(conflict.blockReason ?? ""), "5. fontes conflitantes preservam o fato aceito");

  const medical = validateFactCandidate({
    proposal: proposal("benefits", "FOUND_REVIEW_REQUIRED", "Clinically proven to treat diabetes."),
    accepted,
  });
  assert(!medical.usable && /medical|health/i.test(medical.blockReason ?? ""), "6. alegacoes medicas sem comprovacao");

  const images = stageImageCandidates({
    assets: thinRun.discoveredAssets,
    productName: "Novalis Core",
    campaignId: isolated.id,
  });
  assert(images.candidates[0] && !images.candidates[0].identityVerified && images.candidates[0].heroPromotionBlocked, "7. identidade de imagem nao confirmada");
  assert(!images.candidates[0].rightsVerified, "8. direitos de uso nao verificados automaticamente");
  assert(images.heroEligibleCount === 0 && !images.candidates[0].placementEligible, "9. elegibilidade para Hero bloqueada");
  assert(images.approvalsChanged === false, "10. bloqueio de assets nao aprovados / aprovacoes intactas");

  const media = selectReviewMedia({ assets: thinRun.discoveredAssets, productName: "Novalis Core", campaignId: isolated.id });
  const plan = proposeEditorialPlan({ run: thinRun, media });
  assert(plan.heroMode === "EDITORIAL_NO_IMAGE" && plan.composition === "information-first", "11. regeneracao editorial sem packshot falso");
  assert(plan.canRegenerateFromAcceptedFacts && plan.blockedPadding.some((item) => /generic/i.test(item)), "11. plano nao preenche com texto generico");

  const recovered = await runAutonomousRecovery(
    {
      campaignId: isolated.id,
      assessment: assessment(isolated.id, 15),
      previousAssessment: assessment(isolated.id, 16, { assessmentId: "pqa-prev" }),
      run: thinRun,
    },
    {
      research: async () => ({
        ...thinRun,
        runId: "pr-recovered",
        sources: [
          ...thinRun.sources,
          { url: "https://shop.novalis.example/core/faq", ok: true, sourceClass: "MANUFACTURER_OR_BRAND" },
        ],
        proposals: [
          ...thinRun.proposals,
          proposal("warnings", "FOUND_REVIEW_REQUIRED", "Keep out of reach of children.", {
            sourceUrl: "https://shop.novalis.example/core/faq",
            sourceClass: "MANUFACTURER_OR_BRAND",
          }),
        ],
      }),
    },
  );
  assert(recovered.factsApprovedForUse === 0, "12. preservacao de fatos aprovados");
  assert(recovered.assetApprovalsChanged === false && recovered.commercialAuthorization === "BLOCKED", "12. aprovacoes e comercial intactos");
  assert(recovered.contentRegeneration === "BLOCKED_PENDING_FACTS", "11. regeneracao bloqueada ate aceite humano");

  const other = createCampaign({
    name: "Novalis 54AC B",
    slug: `novalis-54ac-b-${Date.now()}`,
    headline: "Novalis B",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  const isolatedB = await runAutonomousRecovery(
    { campaignId: other.id, assessment: assessment(other.id, 40), run: runOf(other.id, [proposal("description", "ACCEPTED", "Other product.")]) },
    { research: async () => runOf(other.id, [proposal("description", "ACCEPTED", "Other product.")]) },
  );
  assert(isolatedB.campaignId === other.id && recovered.campaignId === isolated.id, "13. isolamento entre campanhas");
  assert(snapshotProductResearch(237).latest?.campaignId === 237, "13. campanha 237 nao foi reescrita pelo teste");

  const again = await runAutonomousRecovery(
    {
      campaignId: isolated.id,
      assessment: assessment(isolated.id, 15),
      previousAssessment: assessment(isolated.id, 16, { assessmentId: "pqa-prev" }),
      run: thinRun,
    },
    { research: async () => { throw new Error("should not refetch"); } },
  );
  assert(again.skippedAsRedundant === true, "14. fingerprints impedem reprocessamento");

  const ledger = emptyBudgetLedger("54AC");
  ledger.spentUsd = 1.9;
  assert(!budgetAllowsCall(ledger).allowed && OPENAI_LOOP_BUDGET.maxEvaluations === 3, "15. limites de orcamento");

  const calib = calibrateQualityEvaluator({
    first: assessment(isolated.id, 15, {
      findings: [{ id: "cta", dimension: "TRANSPARENCY_LEGIBILITY", severity: "WARNING", message: "SANDBOX looks like a misleading live hop.", evidence: ["cta"] }],
    }),
    second: assessment(isolated.id, 14, { assessmentId: "pqa-2", generationId: "gen-1" }),
  });
  assert(calib.sandboxTreatedAsLiveHop && calib.scoreDelta === -1, "16. interrupcao / calibracao de loop improdutivo");
  assert(QUALITY_PROMPT_VERSION === "3", "16. prompt calibrado para v3");

  const weightSum = Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((sum, item) => sum + item, 0);
  assert(QUALITY_TARGET === 85 && Math.abs(weightSum - 1) < 0.001, "17. regressao 54Z");
  assert(process.env.AIA_ALLOW_PAID_AI === "0", "17. regressao 54AA paid gate");
  assert(recovered.publicationReadiness === "BLOCKED", "17. regressao 54AB publicacao bloqueada");

  console.log(`PASS test-presell-quality-54ac.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
