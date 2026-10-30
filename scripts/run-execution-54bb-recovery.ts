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
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
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
import { visualComparisonPromptV2, PREMIUM_VISUAL_EVALUATION_V2 } from "../src/lib/presell-quality/visual-eval-v2.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import {
  EXECUTION_54BB_BUDGET,
  EXECUTION_54BB_ID,
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
import { readBestCandidate, selectBestCandidate, writeBestCandidate, type BestCandidateRecord } from "../src/lib/presell-quality/best-candidate.ts";
import { captureVisitorVisuals } from "../src/lib/presell-quality/visitor-capture.ts";
import { createDesignCheckpoint, restoreDesignCheckpoint } from "../src/lib/presell-quality/design-checkpoint.ts";
import {
  conservativeMinPair,
  officialEditorialRecord,
  officialPerDimensionStability,
  officialVisualV2Record,
  type OfficialEditorialRecord,
  type OfficialVisualV2Record,
} from "../src/lib/presell-quality/official-v2.ts";
import { EXECUTION_54BA_BASELINE, EXECUTION_54BA_CHECKPOINT_ID } from "../src/lib/presell-quality/premium-redesign.ts";
import { premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { applyRecovered54baFiles, recover54baComposition } from "../src/lib/presell-quality/recover-54ba.ts";
import { classifyEditorialPayload, structuredEditorialFailure } from "../src/lib/presell-quality/editorial-payload.ts";
import { editorialRetryAllowed } from "../src/lib/presell-quality/editorial-retry.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bb-recovery");
const BA_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54ba-premium-redesign");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const TEMP_CHECKPOINT_ID = "54bb-pre-restore-az";
const AZ_CHECKPOINT = path.join(process.cwd(), "data", "presell-quality", "237", "design-checkpoints", "54az-baseline-v2.json");
const BA_CHECKPOINT = path.join(process.cwd(), "data", "presell-quality", "237", "design-checkpoints", "54ba-best-known-baseline.json");
const SHOT_FILES = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

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

function loadModel() {
  const snap = snapshotProductResearch(CAMPAIGN_ID);
  const integrity = validatePersistedProductContract(CAMPAIGN_ID, snap.latest);
  const record = readGeneration(GENERATION_ID);
  const stored = readGenerationModel(GENERATION_ID);
  if (!record || !stored) throw new Error(`Generation ${GENERATION_ID} is not recoverable.`);
  const patch = readQualityPatch(GENERATION_ID);
  const patched = patch ? applyQualityPatch(stored, patch) : stored;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  const model = disableCommercialCta(sandboxed);
  return { snap, integrity, model };
}

function hashesOf(dir: string): Record<string, string | null> {
  return Object.fromEntries(
    SHOT_FILES.map((name) => {
      const file = path.join(dir, name);
      return [name, existsSync(file) ? sha256File(file) : null];
    }),
  );
}

function visualReuseEligible(current: Record<string, string | null>, previous: Record<string, string | null>): boolean {
  return SHOT_FILES.every((name) => current[name] && previous[name] && current[name] === previous[name]);
}

function loadReusableVisual(run: number): { parsed: ParsedVisualEvaluation; official: OfficialVisualV2Record } | null {
  const file = path.join(BA_EVIDENCE, `visual-evaluation-run-${run}.json`);
  if (!existsSync(file)) return null;
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")) as { raw?: string; error?: string };
    if (!stored.raw || stored.error) return null;
    const parsed = parseVisualEvaluationPayload(stored.raw);
    return { parsed, official: officialVisualV2Record(parsed, true) };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const standard = loadPremiumPresellDesignStandard();
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }
  const azMeta = existsSync(AZ_CHECKPOINT) ? (JSON.parse(readFileSync(AZ_CHECKPOINT, "utf8")) as { id?: string }) : null;
  const baMeta = existsSync(BA_CHECKPOINT) ? (JSON.parse(readFileSync(BA_CHECKPOINT, "utf8")) as { id?: string }) : null;
  if (azMeta?.id !== "54az-baseline-v2") throw new Error("54AZ checkpoint identity is missing.");
  if (baMeta?.id !== EXECUTION_54BA_CHECKPOINT_ID) throw new Error("54BA checkpoint identity is missing.");

  const recovery = recover54baComposition({ root: process.cwd() });
  writeJson(path.join(EVIDENCE, "recovery-report.json"), {
    status: recovery.complete ? "RECOVERED" : "RECOVERY_INCOMPLETE",
    complete: recovery.complete,
    reason: recovery.reason,
    markers: recovery.markers,
    files: recovery.files.map((item) => ({ path: item.path, sha256: item.sha256 })),
  });
  writeJson(path.join(EVIDENCE, "editorial-schema-diagnosis.json"), {
    rootCause: "MODEL_PAYLOAD_INCOMPLETE",
    missingDimension: "TRANSPARENCY_LEGIBILITY",
    parser: "MISSING_DIMENSION is a structured error; scores are not filled or copied.",
    rubricUnchanged: true,
    promptVersionUnchanged: true,
  });

  if (!recovery.complete) {
    const unavailable = {
      ...resolveGlobalPresellQualityGate({
        campaignId: CAMPAIGN_ID,
        generationId: GENERATION_ID,
        comparedToOfficialReference: false,
        evaluatorIndependentFromGenerator: false,
        visualScore: null,
        desktopVisualScore: null,
        mobileVisualScore: null,
        editorialScore: null,
        evaluatorStability: "NOT_ESTABLISHED",
        contentSafetyPass: false,
        paidEvaluationAvailable: envValuePresent("OPENAI_API_KEY"),
      }),
      status: "EVALUATION_UNAVAILABLE" as const,
      humanReviewUnlocked: false as const,
    };
    writeGlobalPresellQualityGate(unavailable);
    writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), {
      ...unavailable,
      publicationUnlocked: false,
      ctaEnabled: false,
      adsActivated: false,
      recoveryIncomplete: true,
    });
    console.log(JSON.stringify({ status: "RECOVERY_INCOMPLETE", reason: recovery.reason }, null, 2));
    return;
  }

  const temp = createDesignCheckpoint({
    id: TEMP_CHECKPOINT_ID,
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    sourceCommit: commit,
    extraFiles: ["src/components/product-showcase/v4/page.tsx"],
    notes: [
      "Temporary 54AZ snapshot taken immediately before restoring the recovered 54BA composition.",
      "54az-baseline-v2 and 54ba-best-known-baseline were not overwritten.",
    ],
  });
  writeJson(path.join(EVIDENCE, "temp-checkpoint.json"), {
    id: temp.id,
    files: temp.files.map((item) => ({ path: item.path, sha256: item.sha256 })),
    azPreserved: azMeta?.id === "54az-baseline-v2",
    baPreserved: baMeta?.id === EXECUTION_54BA_CHECKPOINT_ID,
  });
  applyRecovered54baFiles(recovery.files);
  await sleep(4000);

  const { snap, integrity, model } = loadModel();
  const markup = renderToStaticMarkup(createElement(V4Page, { model }));
  if (FORBIDDEN_REFERENCE_CHROME.test(markup)) {
    restoreDesignCheckpoint(temp, { confirm: true });
    throw new Error("Recovered engine invented forbidden chrome.");
  }
  const contractHash = sha256Text(
    JSON.stringify(
      acceptedProposals(snap.latest).map((item) => ({
        field: item.field,
        value: item.currentValue || item.suggestedValue,
        sourceUrl: item.sourceUrl,
        verification: item.verification,
      })),
    ),
  );
  writeJson(path.join(EVIDENCE, "candidate-manifest.json"), {
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    contentHash: contentFingerprintOf(model),
    productContractHash: contractHash,
    productContractChanged: false,
    newGenerationCreated: false,
    hopSlot: model.hopSlot,
    commercialCtaEnabled: Boolean(model.hopHref),
  });

  const multiproduct = labScenarioKeys().map((key) => {
    const scenario = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model: scenario }));
    const slots = premiumSlotsFromModel(scenario);
    return {
      key,
      inventedChrome: FORBIDDEN_REFERENCE_CHROME.test(html),
      commercialCtaEnabled: Boolean(scenario.hopHref),
      sugarDefenderSpecific: /sugar defender|cbc045ab|cc835ef78e894f7645c4556b/i.test(html),
      ingredientCount: slots.ingredients.length,
      guaranteeStatements: slots.guarantee.statements.length,
      fulfillmentCount: slots.fulfillment.length,
    };
  });
  const multiproductPass = multiproduct.every(
    (row) => !row.inventedChrome && !row.commercialCtaEnabled && !row.sugarDefenderSpecific,
  );
  writeJson(path.join(EVIDENCE, "multiproduct-regression.json"), { pass: multiproductPass, scenarios: multiproduct });
  if (!multiproductPass) {
    restoreDesignCheckpoint(temp, { confirm: true });
    throw new Error("Multiproduct regression failed before evaluation.");
  }

  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
  });
  const visitorOk = capture.ok && !Object.values(capture.inspect).some((item) => item.adminChromePresent);
  const screenshotHashes = hashesOf(EVIDENCE);
  const previousHashes = hashesOf(BA_EVIDENCE);
  const reuseVisual = visitorOk && visualReuseEligible(screenshotHashes, previousHashes);
  writeJson(path.join(EVIDENCE, "screenshot-hashes.json"), {
    current: screenshotHashes,
    previous54ba: previousHashes,
    reuseVisual,
  });
  if (!visitorOk) {
    restoreDesignCheckpoint(temp, { confirm: true });
    throw new Error(`Visitor capture failed: ${capture.notes.join("; ")}`);
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
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54BB_ID, EXECUTION_54BB_BUDGET.maxUsd);
  writeExecutionBudgetLedger(budgetFile, ledger);
  let visualRun1: ParsedVisualEvaluation | null = null;
  let visualRun2: ParsedVisualEvaluation | null = null;
  let editorialRun1: PresellQualityAssessment | null = null;
  let editorialRun2: PresellQualityAssessment | null = null;
  let visualOfficial1: OfficialVisualV2Record | null = null;
  let visualOfficial2: OfficialVisualV2Record | null = null;
  let editorialOfficial1: OfficialEditorialRecord | null = null;
  let editorialOfficial2: OfficialEditorialRecord | null = null;
  let invalidAttempts = 0;
  let retries = 0;
  const reference = readPremiumReferenceBytes();
  const keyReady = envValuePresent("OPENAI_API_KEY");
  const shotHashList = capture.shots.map((item) => item.sha256).filter((item): item is string => Boolean(item));

  if (reuseVisual) {
    const first = loadReusableVisual(1);
    const second = loadReusableVisual(2);
    if (first && second) {
      visualRun1 = first.parsed;
      visualRun2 = second.parsed;
      visualOfficial1 = first.official;
      visualOfficial2 = second.official;
      writeJson(path.join(EVIDENCE, "visual-evaluation-run-1.json"), { ...first.official, reused: true, reason: "Screenshot hashes match 54BA visitor captures; visual rubric V2 unchanged." });
      writeJson(path.join(EVIDENCE, "visual-evaluation-run-2.json"), { ...second.official, reused: true, reason: "Screenshot hashes match 54BA visitor captures; visual rubric V2 unchanged." });
    }
  }

  if (keyReady && reference) {
    await runWithTemporaryPaidAi({ scope: "54BB", provider: "openai", maxUsd: EXECUTION_54BB_BUDGET.maxUsd }, async () => {
      async function visualOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BB_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BB_BUDGET,
        });
        if (!reserved.ok) {
          ledger = reserved.ledger;
          writeExecutionBudgetLedger(budgetFile, ledger);
          return null;
        }
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const client = createOpenAiVisionClient({ jsonObject: true });
          const prompt = visualComparisonPromptV2();
          const images = [
            { mediaType: "image/png" as const, base64: readFileSync(path.join(EVIDENCE, "desktop-first-fold.png")).toString("base64"), label: "desktop-visitor-first-fold-1440x900" },
            { mediaType: "image/png" as const, base64: readFileSync(path.join(EVIDENCE, "mobile-first-fold.png")).toString("base64"), label: "mobile-visitor-first-fold-390x844" },
            { mediaType: "image/png" as const, base64: reference!.toString("base64"), label: "official-premium-presell-reference" },
          ];
          const completion = await client.complete({ system: prompt.system, userText: prompt.userText, images });
          const parsed = parseVisualEvaluationPayload(completion.text);
          const estimated = estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens);
          ledger = consumePaidCall(ledger, { inputTokens: completion.inputTokens, outputTokens: completion.outputTokens, estimatedUsd: estimated });
          writeExecutionBudgetLedger(budgetFile, ledger);
          const official = officialVisualV2Record(parsed, visitorOk);
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), { ...official, estimatedUsd: estimated, model: OPENAI_VISION_MODEL, raw: completion.text });
          return { parsed, official };
        } catch (err) {
          invalidAttempts += 1;
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), { error: message, invented: false });
          return null;
        }
      }

      if (!visualRun1 || !visualRun2) {
        const firstVisual = await visualOnce(1);
        visualRun1 = firstVisual?.parsed ?? null;
        visualOfficial1 = firstVisual?.official ?? null;
        const secondVisual = await visualOnce(2);
        visualRun2 = secondVisual?.parsed ?? null;
        visualOfficial2 = secondVisual?.official ?? null;
      }

      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      async function editorialOnce(run: number, attempt: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BB_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BB_BUDGET,
        });
        if (!reserved.ok) {
          ledger = reserved.ledger;
          writeExecutionBudgetLedger(budgetFile, ledger);
          return { ok: false as const, code: "BUDGET_EXHAUSTED", message: reserved.reason };
        }
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const assessment = await evaluator.evaluate(
            evaluationInputFromModel({
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
                "Do not reward unapproved medical claims or require testimonials.",
                "Do not suggest inventing facts.",
              ],
              previewPath: `/admin/lab/lp-generator/${GENERATION_ID}/preview?visualCapture=visitor`,
              iteration: 0,
              patch: model.qualityPatch ?? null,
            }),
          );
          const estimated = estimateOpenAiVisionUsd(assessment.tokenUsage?.inputTokens ?? 0, assessment.tokenUsage?.outputTokens ?? 0);
          ledger = consumePaidCall(ledger, {
            inputTokens: assessment.tokenUsage?.inputTokens ?? 0,
            outputTokens: assessment.tokenUsage?.outputTokens ?? 0,
            estimatedUsd: estimated,
          });
          writeExecutionBudgetLedger(budgetFile, ledger);
          if (assessment.assessmentStatus === "EVALUATION_FAILED" || assessment.overallScore == null) {
            invalidAttempts += 1;
            const code = assessment.errorCode ?? "EVALUATION_FAILED";
            const classified = classifyEditorialPayload(assessment.costMetadata.notes.find((note) => note.startsWith("{")) ?? "");
            const failure = structuredEditorialFailure({
              code: classified.ok ? code : classified.code,
              message: assessment.findings[0]?.message ?? code,
              attempt,
              rawSnippet: assessment.costMetadata.notes.join(" | "),
            });
            writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}-attempt-${attempt}.json`), failure);
            return { ok: false as const, code: failure.code, message: failure.message };
          }
          const official = officialEditorialRecord(assessment);
          writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}.json`), official);
          return { ok: true as const, assessment, official };
        } catch (err) {
          invalidAttempts += 1;
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          const failure = structuredEditorialFailure({ code: "PROVIDER_ERROR", message, attempt, rawSnippet: message });
          writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}-attempt-${attempt}.json`), failure);
          return { ok: false as const, code: failure.code, message };
        }
      }

      async function editorialWithRetry(run: number) {
        let attempt = 0;
        const maxAttempts = 2;
        while (attempt < maxAttempts) {
          attempt += 1;
          const result = await editorialOnce(run, attempt);
          if (result.ok) return result;
          const retry = editorialRetryAllowed({
            code: result.code,
            attempt,
            maxAttempts,
            remainingUsd: ledger.remainingUsd,
            reserveUsd: EXECUTION_54BB_BUDGET.reserveUsdPerEvaluation,
            authorized: true,
          });
          writeJson(path.join(EVIDENCE, `editorial-retry-run-${run}-attempt-${attempt}.json`), retry);
          if (!retry.allowed) return null;
          retries += 1;
        }
        return null;
      }

      const firstEditorial = await editorialWithRetry(1);
      editorialRun1 = firstEditorial?.assessment ?? null;
      editorialOfficial1 = firstEditorial?.official ?? null;
      const secondEditorial = await editorialWithRetry(2);
      editorialRun2 = secondEditorial?.assessment ?? null;
      editorialOfficial2 = secondEditorial?.official ?? null;
    });
  }

  ledger = closeExecutionBudget(ledger, keyReady ? undefined : "OPENAI_API_KEY missing.");
  writeExecutionBudgetLedger(budgetFile, ledger);

  const desktopScore = conservativeMinPair(visualRun1?.desktopVisualScore, visualRun2?.desktopVisualScore);
  const mobileScore = conservativeMinPair(visualRun1?.mobileVisualScore, visualRun2?.mobileVisualScore);
  const editorialScore = conservativeMinPair(editorialRun1?.overallScore, editorialRun2?.overallScore);
  const identity = evaluationIdentityOf({
    generationId: GENERATION_ID,
    rendererVersion: capture.rendererVersion,
    sourceCommit: commit,
    referenceHash: standard.hash,
    screenshotHashes: shotHashList,
    captureMode: VISITOR_VISUAL_CAPTURE,
    adminChromePresent: false,
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    promptVersion: "2",
    rubricVersion: "2",
    model: OPENAI_VISION_MODEL,
  });
  const perDimension = officialPerDimensionStability({
    desktop: [visualRun1?.desktopVisualScore, visualRun2?.desktopVisualScore],
    mobile: [visualRun1?.mobileVisualScore, visualRun2?.mobileVisualScore],
    editorial: [editorialRun1?.overallScore, editorialRun2?.overallScore],
  });
  writeJson(path.join(EVIDENCE, "official-v2-scores.json"), {
    baseline: EXECUTION_54BA_BASELINE,
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
    visualReused: reuseVisual && Boolean(visualRun1 && visualRun2),
  });
  writeJson(path.join(EVIDENCE, "evaluator-stability.json"), {
    desktop: perDimension.desktop,
    mobile: perDimension.mobile,
    editorial: perDimension.editorial,
    combined: perDimension.combined,
    visualRuns: [visualRun1, visualRun2].filter(Boolean).length,
    editorialRuns: [editorialRun1, editorialRun2].filter(Boolean).length,
    invalidAttempts,
    retries,
  });

  const currentBest =
    readBestCandidate(CAMPAIGN_ID) ??
    ({
      selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      state: "BEST_KNOWN",
      contentSafetyPass: true,
      evaluationValid: true,
      desktopVisualScore: EXECUTION_54BA_BASELINE.desktop,
      mobileVisualScore: EXECUTION_54BA_BASELINE.mobile,
      editorialScore: EXECUTION_54BA_BASELINE.editorial,
      identity,
      qualityApproved: false,
      humanReviewUnlocked: false,
      notes: ["Official 54AZ V2 visitor baseline 72/68/73."],
    } satisfies BestCandidateRecord);
  const evaluationComplete = desktopScore != null && mobileScore != null && editorialScore != null;
  const decision = selectBestCandidate({
    current: currentBest,
    incoming: {
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      contentSafetyPass: safety.gate === "PASS",
      evaluationValid: evaluationComplete && perDimension.combined !== "NOT_ESTABLISHED",
      desktopVisualScore: desktopScore,
      mobileVisualScore: mobileScore,
      editorialScore,
      identity,
      notes: ["54BB recovered 54BA composition evaluated under V2 with repaired editorial schema."],
    },
  });
  let kept = decision.updated;
  let restored = false;
  if (!kept) {
    restoreDesignCheckpoint(temp, { confirm: true });
    restored = true;
  }
  writeBestCandidate(decision.best);
  writeJson(path.join(EVIDENCE, "best-candidate-comparison.json"), {
    kept,
    restored,
    reason: decision.reason,
    comparisonStatus: decision.comparisonStatus,
    baseline: EXECUTION_54BA_BASELINE,
    incoming: { desktopScore, mobileScore, editorialScore },
    bestGeneration: decision.best.generationId,
    bestUpdated: decision.updated,
  });

  const combinedForGate =
    perDimension.combined === "STABLE" ? "STABLE" : perDimension.combined === "UNSTABLE" ? "EVALUATOR_UNSTABLE" : "NOT_ESTABLISHED";
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
    evaluatorStability: combinedForGate,
    criticalVisualDefects: [...(visualOfficial1?.criticalDefects ?? []), ...(visualOfficial2?.criticalDefects ?? [])].filter((item, i, all) => all.indexOf(item) === i),
    contentSafetyPass: safety.gate === "PASS",
    paidEvaluationAvailable: keyReady,
  });
  const decided = evaluationComplete ? gate : { ...gate, status: "EVALUATION_UNAVAILABLE" as const, humanReviewUnlocked: false as const };
  writeGlobalPresellQualityGate(decided);
  writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), {
    ...decided,
    publicationUnlocked: false,
    ctaEnabled: false,
    adsActivated: false,
    newGenerationCreated: false,
    designKept: kept,
    designRestored: restored,
    productContractChanged: false,
    desktopRender: capture.inspect.desktop && !capture.inspect.desktop.adminChromePresent ? "PASS" : "FAIL",
    tabletRender: capture.inspect.tablet && !capture.inspect.tablet.adminChromePresent ? "PASS" : "FAIL",
    mobileRender: capture.inspect.mobile && !capture.inspect.mobile.adminChromePresent ? "PASS" : "FAIL",
  });
  writeJson(path.join(EVIDENCE, "budget-summary.json"), {
    provider: "openai",
    model: OPENAI_VISION_MODEL,
    calls: ledger.paidCallCount,
    inputTokens: ledger.calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: ledger.calls.reduce((sum, call) => sum + call.outputTokens, 0),
    spentUsd: ledger.spentUsd,
    remainingUsd: ledger.remainingUsd,
    invalidAttempts,
    retries,
    visualReused: reuseVisual && Boolean(visualRun1 && visualRun2),
  });
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BB

- Recovery: ${recovery.complete ? "RECOVERED" : "RECOVERY_INCOMPLETE"}
- Baseline: ${EXECUTION_54BA_BASELINE.desktop}/${EXECUTION_54BA_BASELINE.mobile}/${EXECUTION_54BA_BASELINE.editorial}
- Desktop: ${visualRun1?.desktopVisualScore ?? "n/a"} / ${visualRun2?.desktopVisualScore ?? "n/a"} → ${desktopScore ?? "n/a"}
- Mobile: ${visualRun1?.mobileVisualScore ?? "n/a"} / ${visualRun2?.mobileVisualScore ?? "n/a"} → ${mobileScore ?? "n/a"}
- Editorial: ${editorialRun1?.overallScore ?? "n/a"} / ${editorialRun2?.overallScore ?? "n/a"} → ${editorialScore ?? "n/a"}
- Stability: desktop ${perDimension.desktop}, mobile ${perDimension.mobile}, editorial ${perDimension.editorial}
- Design kept: ${kept}
- Design restored: ${restored}
- Gate: ${decided.status}
- Spent: ${ledger.spentUsd} / ${ledger.maxUsd}
`,
  );
  console.log(
    JSON.stringify(
      {
        recovery: recovery.complete,
        gate: decided.status,
        desktopScore,
        mobileScore,
        editorialScore,
        perDimension,
        kept,
        restored,
        spent: ledger.spentUsd,
        remaining: ledger.remainingUsd,
        invalidAttempts,
        retries,
        reuseVisual,
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
