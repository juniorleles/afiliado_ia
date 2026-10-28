import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { envValuePresent } from "../src/lib/lp-generator/ai-copy/config.ts";
import { runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { createOpenAiVisionClient, estimateOpenAiVisionUsd, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { contentFingerprintOf, evaluationInputFromModel } from "../src/lib/presell-quality/context.ts";
import { sha256File, sha256Text } from "../src/lib/presell-quality/fingerprint.ts";
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
import { parseVisualEvaluationPayload, type ParsedVisualEvaluation } from "../src/lib/presell-quality/visual-eval.ts";
import { visualComparisonPromptV2 } from "../src/lib/presell-quality/visual-eval-v2.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import {
  EXECUTION_54AY_BUDGET,
  EXECUTION_54AY_ID,
  emptyExecutionBudgetLedger,
  reservePaidCall,
  consumePaidCall,
  consumeReservedAsUnverified,
  closeExecutionBudget,
  writeExecutionBudgetLedger,
} from "../src/lib/presell-quality/execution-budget.ts";
import { loadPremiumPresellDesignStandard, readPremiumReferenceBytes } from "../src/lib/presell-quality/premium-standard.ts";
import { resolveGlobalPresellQualityGate, writeGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { evaluationIdentityOf, VISITOR_VISUAL_CAPTURE } from "../src/lib/presell-quality/evaluation-comparability.ts";
import { readBestCandidate, selectBestCandidate, writeBestCandidate } from "../src/lib/presell-quality/best-candidate.ts";
import { captureVisitorVisuals } from "../src/lib/presell-quality/visitor-capture.ts";
import {
  buildImprovementBacklog,
  conservativeMinPair,
  freezeCandidateManifest,
  officialEditorialRecord,
  officialEvaluatorStability,
  officialVisualV2Record,
  type OfficialEditorialRecord,
  type OfficialVisualV2Record,
} from "../src/lib/presell-quality/official-v2.ts";
import { PREMIUM_VISUAL_EVALUATION_V2 } from "../src/lib/presell-quality/visual-eval-v2.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";
import { QUALITY_SCORE_TARGET, VISUAL_SCORE_TARGET } from "../src/lib/presell-quality/premium-design.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54ay-official-evaluation");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sourceCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const standard = loadPremiumPresellDesignStandard();
  writeJson(path.join(EVIDENCE, "reference-validation.json"), {
    registered: standard.registered,
    path: standard.relativePath,
    hash: standard.hash,
    expectedHash: EXPECTED_REFERENCE,
    hashMatch: standard.hash === EXPECTED_REFERENCE,
    dimensions: standard.dimensions,
    accessibleToEvaluator: standard.accessibleToEvaluator,
    evaluatorPath: standard.evaluatorPath,
  });
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }

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
  const contractHash = sha256Text(
    JSON.stringify(
      acceptedProposals(snap.latest).map((item) => ({
        field: item.field,
        value: item.currentValue || item.suggestedValue,
        sourceUrl: item.sourceUrl,
        verification: item.verification,
        evidenceIds: item.evidenceIds,
      })),
    ),
  );
  const manifest = freezeCandidateManifest({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    contentHash: contentFingerprintOf(model),
    productContractHash: contractHash,
    sourceCommit: commit,
    referenceHash: standard.hash,
  });
  writeJson(path.join(EVIDENCE, "candidate-manifest.json"), {
    ...manifest,
    productContractChanged: false,
    newGenerationCreated: false,
    commercialCtaEnabled: Boolean(model.hopHref),
    hopSlot: model.hopSlot,
  });

  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
  });
  const visitorCaptureValidated =
    capture.ok &&
    !Object.values(capture.inspect).some((item) => item.adminChromePresent) &&
    capture.shots.length >= 6;
  if (!visitorCaptureValidated) {
    const gate = resolveGlobalPresellQualityGate({
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      desktopScreenshotPath: path.join(EVIDENCE, "desktop-full.png"),
      mobileScreenshotPath: path.join(EVIDENCE, "mobile-full.png"),
      comparedToOfficialReference: false,
      evaluatorIndependentFromGenerator: false,
      evaluatorStability: "NOT_ESTABLISHED",
      contentSafetyPass: integrity.valid,
      paidEvaluationAvailable: false,
      criticalVisualDefects: capture.notes,
    });
    writeGlobalPresellQualityGate(gate);
    writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), gate);
    writeFileSync(
      path.join(EVIDENCE, "execution-summary.md"),
      `# EXECUTION 54AY\n\nVisitor capture was not faithful. Paid evaluation was not started.\n\n${capture.notes.join("\n")}\n`,
    );
    throw new Error(`Visitor capture is not faithful: ${capture.notes.join("; ") || "incomplete shots"}`);
  }

  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({
    run: snap.latest,
    productName: snap.latest?.productName || "Product",
    sourceUrl: salesUrl,
  });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest: contentManifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
  });

  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54AY_ID, EXECUTION_54AY_BUDGET.maxUsd);
  writeExecutionBudgetLedger(budgetFile, ledger);

  let visualRun1: ParsedVisualEvaluation | null = null;
  let visualRun2: ParsedVisualEvaluation | null = null;
  let editorialRun1: PresellQualityAssessment | null = null;
  let editorialRun2: PresellQualityAssessment | null = null;
  let visualOfficial1: OfficialVisualV2Record | null = null;
  let visualOfficial2: OfficialVisualV2Record | null = null;
  let editorialOfficial1: OfficialEditorialRecord | null = null;
  let editorialOfficial2: OfficialEditorialRecord | null = null;
  const reference = readPremiumReferenceBytes();
  const keyReady = envValuePresent("OPENAI_API_KEY");
  const screenshotHashes = capture.shots.map((item) => item.sha256).filter((item): item is string => Boolean(item));

  if (keyReady && reference) {
    await runWithTemporaryPaidAi({ scope: "54AY", provider: "openai", maxUsd: EXECUTION_54AY_BUDGET.maxUsd }, async () => {
      const client = createOpenAiVisionClient({ jsonObject: true });
      const prompt = visualComparisonPromptV2();
      const desktopFoldB64 = readFileSync(path.join(EVIDENCE, "desktop-first-fold.png")).toString("base64");
      const mobileFoldB64 = readFileSync(path.join(EVIDENCE, "mobile-first-fold.png")).toString("base64");
      const refB64 = reference.toString("base64");
      const images = [
        { mediaType: "image/png" as const, base64: desktopFoldB64, label: "desktop-visitor-first-fold-1440x900" },
        { mediaType: "image/png" as const, base64: mobileFoldB64, label: "mobile-visitor-first-fold-390x844" },
        { mediaType: "image/png" as const, base64: refB64, label: "official-premium-presell-reference" },
      ];
      async function visualOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54AY_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54AY_BUDGET,
        });
        if (!reserved.ok) {
          ledger = reserved.ledger;
          writeExecutionBudgetLedger(budgetFile, ledger);
          return null;
        }
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const completion = await client.complete({
            system: prompt.system,
            userText: prompt.userText,
            images,
          });
          const parsed = parseVisualEvaluationPayload(completion.text);
          const estimated = estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens);
          ledger = consumePaidCall(ledger, {
            inputTokens: completion.inputTokens,
            outputTokens: completion.outputTokens,
            estimatedUsd: estimated,
          });
          writeExecutionBudgetLedger(budgetFile, ledger);
          const official = officialVisualV2Record(parsed, visitorCaptureValidated);
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), {
            ...official,
            inputTokens: completion.inputTokens,
            outputTokens: completion.outputTokens,
            estimatedUsd: estimated,
            model: OPENAI_VISION_MODEL,
            provider: "openai",
            raw: completion.text,
          });
          return { parsed, official };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), { error: message, invented: false });
          return null;
        }
      }
      const firstVisual = await visualOnce(1);
      visualRun1 = firstVisual?.parsed ?? null;
      visualOfficial1 = firstVisual?.official ?? null;
      const secondVisual = await visualOnce(2);
      visualRun2 = secondVisual?.parsed ?? null;
      visualOfficial2 = secondVisual?.official ?? null;

      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      async function editorialOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54AY_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54AY_BUDGET,
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
                path: path.join(EVIDENCE, "desktop-full.png"),
                generationId: GENERATION_ID,
                sha256: sha256File(path.join(EVIDENCE, "desktop-full.png")) ?? createHash("sha256").update("x").digest("hex"),
                width: 1440,
                height: 900,
              },
              mobile: {
                role: "mobile",
                path: path.join(EVIDENCE, "mobile-full.png"),
                generationId: GENERATION_ID,
                sha256: sha256File(path.join(EVIDENCE, "mobile-full.png")) ?? createHash("sha256").update("y").digest("hex"),
                width: 390,
                height: 844,
              },
            },
            approvedFacts: contentManifest.allowedFacts.map((item) => `${item.field}: ${item.value}`.slice(0, 240)),
            evidenceReferences: [String(CAMPAIGN_ID), GENERATION_ID, contractHash],
            approvedAssets: packshot ? [{ id: packshot.assetId, eligible: true, kind: "PRODUCT_PACKSHOT" }] : [],
            editorialConstraints: [
              "Score editorial quality against the Product Contract only.",
              "Criteria: clarity, organization, legibility, objectivity, fluency, commercial language, transparency, repetition, titles, FAQ, guarantee accuracy, shipping accuracy, section coherence.",
              "Do not reward unapproved medical claims.",
              "Do not require missing benefits, testimonials, certifications, or promotions.",
              "Do not suggest inventing facts to improve copy.",
            ],
            previewPath: `/admin/lab/lp-generator/${GENERATION_ID}/preview?visualCapture=visitor`,
            iteration: 0,
            patch: model.qualityPatch ?? null,
          });
          const assessment = await evaluator.evaluate(input);
          const estimated = estimateOpenAiVisionUsd(assessment.tokenUsage?.inputTokens ?? 0, assessment.tokenUsage?.outputTokens ?? 0);
          if (assessment.assessmentStatus === "EVALUATION_FAILED") {
            ledger = consumePaidCall(ledger, {
              inputTokens: assessment.tokenUsage?.inputTokens ?? 0,
              outputTokens: assessment.tokenUsage?.outputTokens ?? 0,
              estimatedUsd: estimated,
            });
            writeExecutionBudgetLedger(budgetFile, ledger);
            writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}.json`), {
              error: assessment.findings[0]?.message ?? "EVALUATION_FAILED",
              invented: false,
              assessmentStatus: assessment.assessmentStatus,
            });
            return null;
          }
          ledger = consumePaidCall(ledger, {
            inputTokens: assessment.tokenUsage?.inputTokens ?? 0,
            outputTokens: assessment.tokenUsage?.outputTokens ?? 0,
            estimatedUsd: estimated,
          });
          writeExecutionBudgetLedger(budgetFile, ledger);
          const official = officialEditorialRecord(assessment);
          writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}.json`), official ?? { error: "Editorial score missing", invented: false });
          return { assessment, official };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}.json`), { error: message, invented: false });
          return null;
        }
      }
      const firstEditorial = await editorialOnce(1);
      editorialRun1 = firstEditorial?.assessment ?? null;
      editorialOfficial1 = firstEditorial?.official ?? null;
      const secondEditorial = await editorialOnce(2);
      editorialRun2 = secondEditorial?.assessment ?? null;
      editorialOfficial2 = secondEditorial?.official ?? null;
    });
  }

  ledger = closeExecutionBudget(ledger, keyReady ? undefined : "OPENAI_API_KEY missing; paid evaluation was not started.");
  writeExecutionBudgetLedger(budgetFile, ledger);

  const desktopScore = conservativeMinPair(visualRun1?.desktopVisualScore, visualRun2?.desktopVisualScore);
  const mobileScore = conservativeMinPair(visualRun1?.mobileVisualScore, visualRun2?.mobileVisualScore);
  const editorialScore = conservativeMinPair(editorialRun1?.overallScore, editorialRun2?.overallScore);
  const identityBase = {
    generationId: GENERATION_ID,
    rendererVersion: capture.rendererVersion,
    sourceCommit: commit,
    referenceHash: standard.hash,
    screenshotHashes,
    captureMode: VISITOR_VISUAL_CAPTURE,
    adminChromePresent: false,
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    promptVersion: "2",
    rubricVersion: "2",
    model: OPENAI_VISION_MODEL,
  };
  const firstIdentity = evaluationIdentityOf(identityBase);
  const secondIdentity = evaluationIdentityOf(identityBase);
  const stability = officialEvaluatorStability({
    firstVisual: visualRun1 ? firstIdentity : null,
    secondVisual: visualRun2 ? secondIdentity : null,
    firstVisualOverall: visualRun1?.overall ?? null,
    secondVisualOverall: visualRun2?.overall ?? null,
    firstEditorial: editorialRun1?.overallScore ?? null,
    secondEditorial: editorialRun2?.overallScore ?? null,
  });
  const visualDelta =
    visualRun1 && visualRun2 ? Math.abs((visualRun1.overall ?? 0) - (visualRun2.overall ?? 0)) : null;
  const editorialDelta =
    editorialRun1 && editorialRun2 ? Math.abs((editorialRun1.overallScore ?? 0) - (editorialRun2.overallScore ?? 0)) : null;
  writeJson(path.join(EVIDENCE, "evaluator-stability.json"), {
    visualRuns: [visualRun1, visualRun2].filter(Boolean).length,
    editorialRuns: [editorialRun1, editorialRun2].filter(Boolean).length,
    stability,
    visualDelta,
    editorialDelta,
    materialDivergence: Boolean(
      (visualDelta != null && visualDelta > 8) || (editorialDelta != null && editorialDelta > 8),
    ),
    scoring: "min-of-pair",
    comparableTo54aw: false,
  });
  writeJson(path.join(EVIDENCE, "official-v2-scores.json"), {
    rubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
    desktopVisualRun1: visualRun1?.desktopVisualScore ?? null,
    desktopVisualRun2: visualRun2?.desktopVisualScore ?? null,
    finalDesktopVisualScore: desktopScore,
    mobileVisualRun1: visualRun1?.mobileVisualScore ?? null,
    mobileVisualRun2: visualRun2?.mobileVisualScore ?? null,
    finalMobileVisualScore: mobileScore,
    editorialRun1: editorialRun1?.overallScore ?? null,
    editorialRun2: editorialRun2?.overallScore ?? null,
    finalEditorialScore: editorialScore,
    method: "min-of-pair",
    comparableTo54aw: false,
    invented: false,
  });

  const evaluationComplete = desktopScore != null && mobileScore != null && editorialScore != null;
  const criticalFromModel = [
    ...(visualOfficial1?.criticalDefects ?? []),
    ...(visualOfficial2?.criticalDefects ?? []),
  ].filter((item, index, all) => all.indexOf(item) === index);
  const renderPass = {
    desktop: capture.inspect.desktop?.rendered && !capture.inspect.desktop.overflowX && !capture.inspect.desktop.brokenImages,
    tablet: capture.inspect.tablet?.rendered && !capture.inspect.tablet.overflowX && !capture.inspect.tablet.brokenImages,
    mobile: capture.inspect.mobile?.rendered && !capture.inspect.mobile.overflowX && !capture.inspect.mobile.brokenImages,
  };
  const gate = resolveGlobalPresellQualityGate({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    desktopScreenshotPath: path.join(EVIDENCE, "desktop-full.png"),
    mobileScreenshotPath: path.join(EVIDENCE, "mobile-full.png"),
    comparedToOfficialReference: Boolean(visualRun1 || visualRun2),
    evaluatorIndependentFromGenerator: Boolean(visualRun1 || visualRun2),
    visualScore: conservativeMinPair(visualRun1?.overall, visualRun2?.overall),
    desktopVisualScore: desktopScore,
    mobileVisualScore: mobileScore,
    editorialScore,
    evaluatorStability: stability === "STABLE" ? "STABLE" : stability === "UNSTABLE" ? "EVALUATOR_UNSTABLE" : "NOT_ESTABLISHED",
    criticalVisualDefects: criticalFromModel,
    contentSafetyPass: safety.gate === "PASS",
    paidEvaluationAvailable: keyReady,
  });
  const decided = evaluationComplete ? gate : { ...gate, status: "EVALUATION_UNAVAILABLE" as const, humanReviewUnlocked: false as const };
  writeGlobalPresellQualityGate(decided);
  writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), {
    ...decided,
    desktopRender: renderPass.desktop ? "PASS" : "FAIL",
    tabletRender: renderPass.tablet ? "PASS" : "FAIL",
    mobileRender: renderPass.mobile ? "PASS" : "FAIL",
    publicationUnlocked: false,
    commercialAuthorization: "BLOCKED",
    ctaEnabled: false,
    adsActivated: false,
    newGenerationCreated: false,
  });

  const backlog = buildImprovementBacklog({
    visualRuns: [visualOfficial1, visualOfficial2].filter((item): item is OfficialVisualV2Record => Boolean(item)),
    editorialRuns: [editorialOfficial1, editorialOfficial2].filter((item): item is OfficialEditorialRecord => Boolean(item)),
  });
  writeJson(path.join(EVIDENCE, "improvement-backlog.json"), backlog);

  const incomingValid = evaluationComplete && stability !== "NOT_ESTABLISHED";
  const decision = selectBestCandidate({
    current: readBestCandidate(CAMPAIGN_ID),
    incoming: {
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      contentSafetyPass: safety.gate === "PASS",
      evaluationValid: incomingValid,
      desktopVisualScore: desktopScore,
      mobileVisualScore: mobileScore,
      editorialScore,
      identity: firstIdentity,
      notes: ["Official V2 visitor evaluation. Not comparable to 54AW lab-chrome scores."],
    },
  });
  writeBestCandidate(decision.best);
  writeJson(path.join(EVIDENCE, "best-candidate-selection.json"), {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    updated: decision.updated,
    comparisonStatus: decision.comparisonStatus,
    reason: decision.reason,
    bestKnownGeneration: decision.best.generationId,
    qualityApproved: false,
    humanReviewUnlocked: decided.humanReviewUnlocked,
  });

  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54AY

- Generation: ${GENERATION_ID}
- Candidate frozen: true
- Product contract changed: NO
- Reference hash: ${standard.hash}
- Visitor capture validated: ${visitorCaptureValidated}
- Desktop visual: ${visualRun1?.desktopVisualScore ?? "n/a"} / ${visualRun2?.desktopVisualScore ?? "n/a"} → ${desktopScore ?? "n/a"} / ${VISUAL_SCORE_TARGET}
- Mobile visual: ${visualRun1?.mobileVisualScore ?? "n/a"} / ${visualRun2?.mobileVisualScore ?? "n/a"} → ${mobileScore ?? "n/a"} / ${VISUAL_SCORE_TARGET}
- Editorial: ${editorialRun1?.overallScore ?? "n/a"} / ${editorialRun2?.overallScore ?? "n/a"} → ${editorialScore ?? "n/a"} / ${QUALITY_SCORE_TARGET}
- Stability: ${stability}
- Content safety: ${safety.gate}
- Gate: ${decided.status}
- Human review unlocked: ${decided.humanReviewUnlocked}
- Paid AI spent: ${ledger.spentUsd} / ${ledger.maxUsd}
- Best known: ${decision.best.generationId}
- Best candidate updated: ${decision.updated}
- New generation created: false
- CTA enabled: false
`,
  );
  console.log(
    JSON.stringify(
      {
        gate: decided.status,
        desktopScore,
        mobileScore,
        editorialScore,
        stability,
        spent: ledger.spentUsd,
        remaining: ledger.remainingUsd,
        captureOk: capture.ok,
        updated: decision.updated,
        humanReviewUnlocked: decided.humanReviewUnlocked,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
