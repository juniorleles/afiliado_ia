// npx tsx scripts/run-execution-54ag-calibration.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, openaiVisionProviderStatus, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { captureEvaluationScreenshots } from "../src/lib/presell-quality/capture.ts";
import { evaluationInputFromModel } from "../src/lib/presell-quality/context.ts";
import { defaultEvaluationMeta } from "../src/lib/presell-quality/input.ts";
import { CALIBRATION_PAGES } from "../src/lib/presell-quality/calibration-pages.ts";
import { detectDoublePenalty } from "../src/lib/presell-quality/dimension-overlap.ts";
import { triageFactCandidates } from "../src/lib/presell-quality/fact-triage.ts";
import { buildEditorialEnrichmentPlan } from "../src/lib/presell-quality/enrichment-plan.ts";
import { OPENAI_LOOP_BUDGET, emptyBudgetLedger, recordBudgetSpend } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import type { FactCandidate } from "../src/lib/presell-quality/recovery.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

const EVIDENCE = path.join("data/evidence/execution-54ag-quality-calibration");
const REPORTS = path.join(EVIDENCE, "reports");
const CANDIDATES = path.join("data/evidence/execution-54ae-commercial-source-research/reports/fact-candidates.json");

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = campaignIntegritySnapshot(237);
  const snap = snapshotProductResearch(237);
  const accepted = acceptedProposals(snap.latest);
  const candidates = existsSync(CANDIDATES) ? (JSON.parse(readFileSync(CANDIDATES, "utf8")) as FactCandidate[]) : [];
  const officialHosts = [...new Set(readCampaignSources(237).map((item) => hostOf(item.originalUrl)).filter(Boolean))];
  const triaged = triageFactCandidates({
    candidates,
    acceptedTexts: accepted.map((item) => item.currentValue || item.suggestedValue),
    officialHosts,
  });
  const plan = buildEditorialEnrichmentPlan({
    acceptedFields: accepted.map((item) => item.field),
    triaged,
  });
  writeFileSync(path.join(REPORTS, "fact-triage.json"), `${JSON.stringify(triaged, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "editorial-enrichment-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);

  const af54 = {
    promptVersion: "3",
    initialScore: 62,
    finalScore: 59,
    generationId: "lp-mvr0jsla-d86c93dd",
    dimensions: {
      DESIGN_HIERARCHY: 60,
      COPY_CLARITY: 70,
      DEPTH_ORGANIZATION: 50,
      IMAGES_COMPOSITION: 40,
      MOBILE_EXPERIENCE: 80,
      TRANSPARENCY_LEGIBILITY: 60,
    },
  };
  const priorOverlap = detectDoublePenalty({
    dimensionScores: [
      { dimension: "DESIGN_HIERARCHY", score: 60, rationale: "Hero lacks a packshot.", weight: 0.25 },
      { dimension: "COPY_CLARITY", score: 70, rationale: "Clear.", weight: 0.2 },
      { dimension: "DEPTH_ORGANIZATION", score: 50, rationale: "Thin.", weight: 0.2 },
      { dimension: "IMAGES_COMPOSITION", score: 40, rationale: "No eligible packshot.", weight: 0.15 },
      { dimension: "MOBILE_EXPERIENCE", score: 80, rationale: "Readable.", weight: 0.1 },
      { dimension: "TRANSPARENCY_LEGIBILITY", score: 60, rationale: "Disclosure present.", weight: 0.1 },
    ],
    findings: [{ id: "hero", dimension: "DESIGN_HIERARCHY", severity: "WARNING", message: "Hero lacks packshot.", evidence: [] }],
  });

  let ledger = emptyBudgetLedger("54AG");
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  const paidBefore = paidAiAuthorization();
  const referenceResults: Array<Record<string, unknown>> = [];
  let liveCalls = 0;
  let reeval: PresellQualityAssessment | null = null;
  let consistency: { first: number | null; second: number | null; delta: number | null } = { first: null, second: null, delta: null };

  if (!keyConfigured) {
    writeFileSync(
      path.join(REPORTS, "summary.json"),
      `${JSON.stringify({ EXECUTION_54AG_STATUS: "PAID_AI_AUTHORIZATION_REQUIRED", REAL_OPENAI_CALIBRATION_CALLS: 0 }, null, 2)}\n`,
    );
  } else {
    await runWithTemporaryPaidAi({ scope: "54AG", provider: "openai", maxUsd: OPENAI_LOOP_BUDGET.maxUsd }, async () => {
      const status = openaiVisionProviderStatus();
      if (!status.authorized) throw new Error(status.reason);
      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      for (const page of CALIBRATION_PAGES) {
        const capture = await captureEvaluationScreenshots({
          campaignId: 237,
          generationId: `cal-${page.id}`,
          previewPath: page.path,
          readySelector: "body",
          iteration: 0,
        });
        const meta = defaultEvaluationMeta();
        const assessment = await evaluator.evaluate({
          campaignId: 237,
          generationId: `cal-${page.id}`,
          productContractVersion: meta.productContractVersion,
          rendererVersion: meta.rendererVersion,
          screenshots: { desktop: capture.desktop, mobile: capture.mobile },
          pageStructure: { page: page.id },
          renderedCopy: page.id,
          approvedFacts: ["description"],
          evidenceReferences: ["calibration"],
          approvedAssets: page.kind === "AUTHORIZED_IMAGE" ? [{ id: "ref", eligible: true, kind: "PRODUCT_PACKSHOT" }] : [{ id: "none", eligible: false, kind: "OTHER" }],
          editorialConstraints: page.kind === "EDITORIAL_NO_IMAGE" ? ["EDITORIAL_NO_IMAGE"] : [],
          rubricVersion: QUALITY_RUBRIC_VERSION,
          promptVersion: QUALITY_PROMPT_VERSION,
        });
        if (assessment.tokenUsage && assessment.costMetadata.estimatedUsd > 0) {
          ledger = recordBudgetSpend(ledger, {
            inputTokens: assessment.tokenUsage.inputTokens,
            outputTokens: assessment.tokenUsage.outputTokens,
            estimatedUsd: assessment.costMetadata.estimatedUsd,
          });
          liveCalls += 1;
        }
        referenceResults.push({
          id: page.id,
          kind: page.kind,
          score: assessment.overallScore,
          status: assessment.assessmentStatus,
          promptVersion: QUALITY_PROMPT_VERSION,
          doublePenalty: detectDoublePenalty(assessment),
          dimensions: assessment.dimensionScores.map((row) => ({ dimension: row.dimension, score: row.score })),
        });
        if (page.id === "editorial-no-image") {
          const again = await evaluator.evaluate({
            campaignId: 237,
            generationId: `cal-${page.id}-b`,
            productContractVersion: meta.productContractVersion,
            rendererVersion: meta.rendererVersion,
            screenshots: { desktop: capture.desktop, mobile: capture.mobile },
            pageStructure: { page: page.id },
            renderedCopy: page.id,
            approvedFacts: ["description"],
            evidenceReferences: ["calibration"],
            approvedAssets: [{ id: "none", eligible: false, kind: "OTHER" }],
            editorialConstraints: ["EDITORIAL_NO_IMAGE"],
            rubricVersion: QUALITY_RUBRIC_VERSION,
            promptVersion: QUALITY_PROMPT_VERSION,
          });
          if (again.tokenUsage && again.costMetadata.estimatedUsd > 0) {
            ledger = recordBudgetSpend(ledger, {
              inputTokens: again.tokenUsage.inputTokens,
              outputTokens: again.tokenUsage.outputTokens,
              estimatedUsd: again.costMetadata.estimatedUsd,
            });
            liveCalls += 1;
          }
          consistency = {
            first: assessment.overallScore,
            second: again.overallScore,
            delta: assessment.overallScore != null && again.overallScore != null ? again.overallScore - assessment.overallScore : null,
          };
        }
      }

      const generation = loadApprovedReviewGeneration(237);
      const stored = generation?.generationId ? readGenerationModel(generation.generationId) : null;
      if (generation?.generationId && generation.previewPath && stored) {
        const capture = await captureEvaluationScreenshots({
          campaignId: 237,
          generationId: generation.generationId,
          previewPath: generation.previewPath,
          iteration: 54,
        });
        if (capture.ok && capture.desktop && capture.mobile) {
          reeval = await evaluator.evaluate(
            evaluationInputFromModel({
              campaignId: 237,
              generationId: generation.generationId,
              model: stored,
              screenshots: {
                desktop: capture.extras.find((item) => item.role === "desktop-viewport") ?? capture.desktop,
                mobile: capture.extras.find((item) => item.role === "mobile-viewport") ?? capture.mobile,
              },
              approvedFacts: accepted.map((item) => item.field),
              evidenceReferences: [snap.latest?.runId ?? "research-237"],
              approvedAssets: [{ id: "gallery", eligible: false, kind: "OTHER" }],
              editorialConstraints: [
                "EDITORIAL_NO_IMAGE is required.",
                "Do not invent benefits or packshots.",
                "SANDBOX is not a live hop.",
              ],
              previewPath: generation.previewPath,
              iteration: 54,
              patch: stored.qualityPatch ?? null,
            }),
          );
          if (reeval.tokenUsage && reeval.costMetadata.estimatedUsd > 0) {
            ledger = recordBudgetSpend(ledger, {
              inputTokens: reeval.tokenUsage.inputTokens,
              outputTokens: reeval.tokenUsage.outputTokens,
              estimatedUsd: reeval.costMetadata.estimatedUsd,
            });
            liveCalls += 1;
          }
        }
      }
    });
  }

  const after = campaignIntegritySnapshot(237);
  const editorialPage = referenceResults.find((item) => item.id === "editorial-no-image");
  const summary = {
    EXECUTION_54AG_STATUS: keyConfigured ? "CALIBRATED" : "PAID_AI_AUTHORIZATION_REQUIRED",
    BASE_COMMIT: baseCommit,
    CAMPAIGN_ID: 237,
    CALIBRATION_STATUS: keyConfigured ? "PROMPT_V4_APPLIED" : "TESTS_ONLY",
    REFERENCE_PAGES_EVALUATED: referenceResults.length,
    REAL_OPENAI_CALIBRATION_CALLS: liveCalls,
    MODEL_CONSISTENCY_RESULT: consistency,
    DOUBLE_PENALTY_DETECTED: priorOverlap.detected,
    EDITORIAL_NO_IMAGE_RESULT: editorialPage ?? null,
    SANDBOX_INTERPRETATION_RESULT: referenceResults.find((item) => item.id === "affiliate-transparency") ?? null,
    FACT_CANDIDATES_ANALYZED: triaged.length,
    LOW_RISK_CANDIDATES: triaged.filter((item) => item.triageClass === "DESCRIPTIVE_LOW_RISK").length,
    SELLER_STATED_CANDIDATES: triaged.filter((item) => item.triageClass === "SELLER_STATED_COMMERCIAL").length,
    HEALTH_CLAIMS_BLOCKED: triaged.filter((item) => item.triageClass === "HEALTH_OR_EFFICACY_CLAIM").length,
    INDEPENDENTLY_SUPPORTED_CANDIDATES: triaged.filter((item) => item.triageClass === "INDEPENDENTLY_SUPPORTED").length,
    ELIGIBLE_FOR_REVIEW: triaged.filter((item) => item.nextState === "ELIGIBLE_FOR_REVIEW").length,
    FACTS_AUTO_APPROVED: 0,
    PRESELL_REEVALUATED: Boolean(reeval),
    INITIAL_SCORE: af54.finalScore,
    FINAL_SCORE: reeval?.overallScore ?? null,
    FINAL_QUALITY_STATUS: reeval?.assessmentStatus ?? "QUALITY_REJECTED",
    TOTAL_API_COST: ledger.spentUsd,
    STOP_REASON: keyConfigured ? (reeval ? "CALIBRATION_AND_COMPARISON_COMPLETE" : "REFERENCE_ONLY") : "PAID_AI_AUTHORIZATION_REQUIRED",
    PRODUCT_CONTRACT_PRESERVED: JSON.stringify(before.acceptedFacts) === JSON.stringify(after.acceptedFacts),
    ASSET_APPROVALS_PRESERVED: JSON.stringify(before.approvedAssets) === JSON.stringify(after.approvedAssets),
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    paidBefore,
    promptVersion: QUALITY_PROMPT_VERSION,
    previousPromptVersion: "3",
    QUALITY_TARGET,
    ledger,
  };
  writeFileSync(path.join(REPORTS, "reference-page-results.json"), `${JSON.stringify(referenceResults, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "quality-comparison.json"), `${JSON.stringify({ previous: af54, current: reeval ? { promptVersion: QUALITY_PROMPT_VERSION, score: reeval.overallScore, status: reeval.assessmentStatus, dimensions: reeval.dimensionScores, comparable: false, reason: "Prompt v3 vs v4 are not treated as identical rubrics." } : null, doublePenalty54af: priorOverlap }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "calibration-report.json"), `${JSON.stringify({ promptVersion: QUALITY_PROMPT_VERSION, consistency, priorOverlap, referenceResults, liveCalls }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    path.join(REPORTS, "execution-summary.md"),
    `# 54AG quality calibration

Prompt ${QUALITY_PROMPT_VERSION}. Prior 54AF used prompt 3.
Reference pages evaluated: ${referenceResults.length}
Live OpenAI calls: ${liveCalls}
Cost: $${ledger.spentUsd}
Eligible for review: ${summary.ELIGIBLE_FOR_REVIEW}
Auto-approved facts: 0
237 re-evaluated: ${Boolean(reeval)} score=${reeval?.overallScore ?? "n/a"}
`,
  );
  void copyFileSync;
  console.log(
    `54AG status=${summary.EXECUTION_54AG_STATUS} refs=${referenceResults.length} calls=${liveCalls} cost=${ledger.spentUsd} eligible=${summary.ELIGIBLE_FOR_REVIEW} reeval=${reeval?.overallScore ?? "none"}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
