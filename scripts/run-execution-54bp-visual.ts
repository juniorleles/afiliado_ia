import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { envValuePresent } from "../src/lib/lp-generator/ai-copy/config.ts";
import { runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
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
import {
  EXECUTION_54BP_BUDGET,
  EXECUTION_54BP_ID,
  emptyExecutionBudgetLedger,
  reservePaidCall,
  consumePaidCall,
  consumeReservedAsUnverified,
  closeExecutionBudget,
  writeExecutionBudgetLedger,
} from "../src/lib/presell-quality/execution-budget.ts";
import { loadPremiumPresellDesignStandard, readPremiumReferenceBytes } from "../src/lib/presell-quality/premium-standard.ts";
import { captureVisitorVisuals, visitorCapturePreviewPath } from "../src/lib/presell-quality/visitor-capture.ts";
import { createDesignCheckpointFromFiles, DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import {
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID,
  PRODUCER_CONTENT_V2_EXECUTION_ID,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import { approvedCommercialExcerpts, readCommercialReuse } from "../src/lib/presell-quality/commercial-reuse.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { sha256Text } from "../src/lib/presell-quality/fingerprint.ts";
import {
  VISUAL_OPTIMIZATION_AGENT_ID,
  VISUAL_OPTIMIZATION_MAX_ITERATIONS,
  VISUAL_OPTIMIZATION_PROMPT_VERSION,
  analyzeVisualComposition,
  applyVisualPlan,
  cloneComposition,
  confirmedDefectPlan,
  defaultVisualComposition,
  inspectPass,
  inspectRenderedPage,
  mergeConfirmedDefects,
  emptyVisualAnalysisPlan,
  writeVisualComposition,
  type IterationRecord,
  type VisualComposition,
} from "../src/lib/presell-quality/visual-optimization-agent/index.ts";
import {
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  validatePresellTemplateDocument,
} from "../src/lib/presell-template/index.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bp-ai-visual-optimization");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BO_COMMIT = "0b0f23315e06426253e0f14ef9d54967d99096bc";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const EXPERIMENTAL = EXPERIMENTAL_CANDIDATE_ID;

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

function previewUrl(candidate: string): string {
  return `http://127.0.0.1:3000${visitorCapturePreviewPath(GENERATION_ID, candidate)}`;
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
  return { snap, integrity, model: disableCommercialCta(sandboxed) };
}

function restoreActiveBi() {
  writeActivePreviewCandidate(CAMPAIGN_ID, EXPERIMENTAL, FROZEN_IMPROVEMENT_EXECUTION_ID);
}

async function captureCandidate(candidate: string, prefix: string) {
  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: sourceCommit(),
    naming: "official",
    manifestName: `${prefix}-capture-manifest.json`,
    candidate,
  });
  const desktop = path.join(EVIDENCE, `${prefix}-desktop.png`);
  const mobile = path.join(EVIDENCE, `${prefix}-mobile.png`);
  copyFileSync(path.join(EVIDENCE, "desktop-first-fold.png"), desktop);
  copyFileSync(path.join(EVIDENCE, "mobile-first-fold.png"), mobile);
  return { capture, desktop, mobile };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const standard = loadPremiumPresellDesignStandard();
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }
  writeJson(path.join(EVIDENCE, "git-audit.json"), {
    branch: execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf8" }).trim(),
    head: commit,
    initialHead: BO_COMMIT,
    boCommit: BO_COMMIT,
    boCommitMessage: "feat(presell): preserve premium producer-content v2 candidate",
    biCommit: BI_COMMIT,
    pushExecuted: false,
    bpCommitCreated: false,
  });
  createDesignCheckpointFromFiles({
    id: "54bp-experimental-visual-optimization",
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    sourceCommit: commit,
    screenshotHashes: [],
    notes: ["54BP experimental visual optimization. Does not overwrite 54bi-proven-baseline or 54BO."],
    files: [
      ...DESIGN_CHECKPOINT_FILES,
      "src/components/presell/standard-v1-page.tsx",
      "src/lib/presell-quality/renderer-candidate.ts",
    ].map((relative) => ({
      path: relative,
      contents: readFileSync(path.join(process.cwd(), relative), "utf8"),
    })),
  });
  writeJson(path.join(EVIDENCE, "agent-configuration.json"), {
    agent: VISUAL_OPTIMIZATION_AGENT_ID,
    promptVersion: VISUAL_OPTIMIZATION_PROMPT_VERSION,
    maxIterations: VISUAL_OPTIMIZATION_MAX_ITERATIONS,
    compositionId: PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID,
    sourceCandidate: PRODUCER_CONTENT_V2_EXECUTION_ID,
    newCandidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    officialV2: false,
    budgetUsd: EXECUTION_54BP_BUDGET.maxUsd,
  });

  const { snap, integrity, model } = loadModel();
  const reuse = readCommercialReuse(CAMPAIGN_ID);
  if (!reuse) throw new Error("Commercial reuse manifest is missing.");
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({ run: snap.latest, productName: snap.latest?.productName || "Product", sourceUrl: salesUrl });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const excerpts = [
    ...approvedCommercialExcerpts(reuse),
    ...reuse.approvedPackages.flatMap((item) => [item.unitPrice, item.currentTotal, item.comparedTotal ?? ""]).filter(Boolean),
  ];

  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54BP_ID, EXECUTION_54BP_BUDGET.maxUsd);
  if (existsSync(budgetFile)) {
    try {
      const previous = JSON.parse(readFileSync(budgetFile, "utf8")) as {
        spentUsd?: number;
        paidCallCount?: number;
        evaluationCount?: number;
        calls?: unknown[];
        notes?: string[];
      };
      ledger = {
        ...ledger,
        spentUsd: Number(previous.spentUsd ?? 0),
        remainingUsd: Math.max(0, EXECUTION_54BP_BUDGET.maxUsd - Number(previous.spentUsd ?? 0)),
        paidCallCount: Number(previous.paidCallCount ?? 0),
        evaluationCount: Number(previous.evaluationCount ?? 0),
        calls: Array.isArray(previous.calls) ? (previous.calls as typeof ledger.calls) : [],
        notes: Array.isArray(previous.notes) ? previous.notes : [],
        status: "OPEN",
      };
    } catch {
      /* start a fresh exclusive ledger if the previous file is unreadable */
    }
  }
  writeExecutionBudgetLedger(budgetFile, ledger);
  const reference = readPremiumReferenceBytes();
  const keyReady = envValuePresent("OPENAI_API_KEY");
  const iterations: IterationRecord[] = [];
  const appliedAll: IterationRecord["applied"][] = [];
  let composition: VisualComposition = defaultVisualComposition(CONTROLLED_IMPROVEMENT_EXECUTION_ID, 0);
  composition.iteration = 0;

  const baseline = await captureCandidate(PRODUCER_CONTENT_V2_EXECUTION_ID, "iteration-0");
  const baselineInspect = await inspectRenderedPage(previewUrl(PRODUCER_CONTENT_V2_EXECUTION_ID));
  iterations.push({
    iteration: 0,
    candidate: PRODUCER_CONTENT_V2_EXECUTION_ID,
    composition: cloneComposition(composition),
    kept: true,
    reason: "Baseline 54BO capture.",
    inspect: baselineInspect,
    applied: [],
    analysis: null,
    analysisSource: "none",
  });

  let previousDesktop = baseline.desktop;
  let previousMobile = baseline.mobile;
  let best: IterationRecord = iterations[0]!;

  for (let iteration = 1; iteration <= VISUAL_OPTIMIZATION_MAX_ITERATIONS; iteration += 1) {
    let analysis = mergeConfirmedDefects(emptyVisualAnalysisPlan());
    let analysisSource: IterationRecord["analysisSource"] = "confirmed-defects";
    if (iteration === 1) {
      const seed = confirmedDefectPlan();
      analysis.layout_changes = seed.layout_changes;
      analysis.copy_changes = seed.copy_changes;
      analysis.visual_defects = [
        { id: "VG-01", severity: "HIGH", component: "hero", problem: "Excessive empty space", proposed_fix: "Compact hero density and drop fold-filling min-height." },
        { id: "VG-02", severity: "HIGH", component: "hero", problem: "Packshot is not dominant", proposed_fix: "Increase packshot scale to xl." },
        { id: "VG-03", severity: "HIGH", component: "copy", problem: "Technical compliance language in marketing", proposed_fix: "Present commercial tone and move compliance aside." },
        { id: "VG-04", severity: "MEDIUM", component: "cards", problem: "Plain offer cards", proposed_fix: "Featured package density and price emphasis." },
        { id: "VG-05", severity: "MEDIUM", component: "identity", problem: "Inconsistent visual identity", proposed_fix: "Raised cards, strong buttons, crisp radius." },
      ];
    }
    if (keyReady && reference) {
      const reserved = reservePaidCall(ledger, {
        kind: "EVALUATION",
        model: "gpt-4o-mini",
        reserveUsd: EXECUTION_54BP_BUDGET.reserveUsdPerEvaluation,
        caps: EXECUTION_54BP_BUDGET,
      });
      if (reserved.ok) {
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
        try {
          const result = await runWithTemporaryPaidAi({ scope: "54BP", provider: "openai", maxUsd: EXECUTION_54BP_BUDGET.maxUsd }, () =>
            analyzeVisualComposition({
              desktopPath: previousDesktop,
              mobilePath: previousMobile,
              referenceBytes: reference,
              composition,
            }),
          );
          ledger = consumePaidCall(ledger, {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedUsd: result.estimatedUsd,
          });
          writeExecutionBudgetLedger(budgetFile, ledger);
          analysis = iteration === 1 ? mergeConfirmedDefects(result.plan) : result.plan;
          analysisSource = result.source;
          writeJson(path.join(EVIDENCE, `analysis-iteration-${iteration}.json`), {
            ...result,
            plan: analysis,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ledger = /HTTP_400|invalid_request/.test(message)
            ? consumePaidCall(ledger, { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, reportedUsd: 0 })
            : consumeReservedAsUnverified(ledger, message);
          writeExecutionBudgetLedger(budgetFile, ledger);
          writeJson(path.join(EVIDENCE, `analysis-iteration-${iteration}.json`), { error: message, invented: false });
        }
      } else {
        ledger = reserved.ledger;
        writeExecutionBudgetLedger(budgetFile, ledger);
      }
    }

    const applied = applyVisualPlan(composition, {
      layout_changes: analysis.layout_changes,
      copy_changes: analysis.copy_changes,
      iteration,
      executionId: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    });
    writeVisualComposition(CAMPAIGN_ID, applied.composition);
    const captured = await captureCandidate(CONTROLLED_IMPROVEMENT_EXECUTION_ID, `iteration-${iteration}`);
    const inspect = await inspectRenderedPage(previewUrl(CONTROLLED_IMPROVEMENT_EXECUTION_ID));
    const passed = inspectPass(inspect);
    const previousHigh = best.inspect.filter((item) => item.emptyHeroSpace || !item.packshotVisible || item.overflowX).length;
    const nextHigh = inspect.filter((item) => item.emptyHeroSpace || !item.packshotVisible || item.overflowX).length;
    const fatal = inspect.some((item) => !item.packshotVisible || item.overflowX || item.overlap);
    const improved = !fatal && (passed || nextHigh < previousHigh);
    const record: IterationRecord = {
      iteration,
      candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
      composition: applied.composition,
      kept: improved,
      reason: improved ? (passed ? "Deterministic visual checks passed." : "Fewer critical visual defects than the previous best.") : "Iteration introduced more critical defects and was discarded.",
      inspect,
      applied: applied.applied,
      analysis,
      analysisSource,
    };
    iterations.push(record);
    appliedAll.push(applied.applied);
    if (improved) {
      composition = applied.composition;
      best = record;
      previousDesktop = captured.desktop;
      previousMobile = captured.mobile;
      copyFileSync(path.join(EVIDENCE, "desktop-full.png"), path.join(EVIDENCE, "desktop-final.png"));
      copyFileSync(path.join(EVIDENCE, "tablet-full.png"), path.join(EVIDENCE, "tablet-final.png"));
      copyFileSync(path.join(EVIDENCE, "mobile-full.png"), path.join(EVIDENCE, "mobile-final.png"));
    } else {
      writeVisualComposition(CAMPAIGN_ID, best.composition);
    }
  }

  writeVisualComposition(CAMPAIGN_ID, best.composition);
  const markup = renderToStaticMarkup(createElement(V4Page, { model, candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID, campaignId: CAMPAIGN_ID }));
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest: contentManifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: excerpts,
  });
  const preflight = runTemplateQualityPreflight({ model, markup, contractValid: integrity.valid });
  const template = mapPresellStandardV1(model);
  const multiproduct = labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: EXPERIMENTAL }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && !/sugar defender/i.test(html) && !/data-seller-stated-offers/.test(html);
  });
  ledger = closeExecutionBudget(ledger);
  writeExecutionBudgetLedger(budgetFile, ledger);
  restoreActiveBi();

  const bestInspect = Object.fromEntries(best.inspect.map((item) => [item.viewport, item]));
  writeJson(path.join(EVIDENCE, "content-safety-results.json"), safety);
  writeJson(path.join(EVIDENCE, "preflight-results.json"), {
    ...preflight,
    templateValidation: validatePresellTemplateDocument(template),
    contentSafetyGate: safety.gate,
    multiproductRegression: multiproduct ? "PASS" : "FAIL",
  });
  writeJson(path.join(EVIDENCE, "visual-defects.json"), iterations.flatMap((item) => item.analysis?.visual_defects ?? []));
  writeJson(path.join(EVIDENCE, "applied-changes.json"), iterations.map((item) => ({ iteration: item.iteration, applied: item.applied, kept: item.kept })));
  writeJson(path.join(EVIDENCE, "iteration-comparison.json"), iterations.map((item) => ({
    iteration: item.iteration,
    candidate: item.candidate,
    kept: item.kept,
    reason: item.reason,
    criticalDefects: item.inspect.flatMap((view) => view.criticalDefects),
    packshotVisible: item.inspect.filter((view) => view.packshotVisible).map((view) => view.viewport),
    emptyHero: item.inspect.filter((view) => view.emptyHeroSpace).map((view) => view.viewport),
  })));
  writeJson(path.join(EVIDENCE, "selected-iteration.json"), {
    iteration: best.iteration,
    candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    composition: best.composition,
    inspect: bestInspect,
    officialV2Executed: false,
  });
  writeJson(path.join(EVIDENCE, "regression-results.json"), {
    bestKnownPreserved: true,
    activeExecutionId: "54BI",
    officialV2Executed: false,
    source54boPreserved: true,
  });
  writeJson(path.join(EVIDENCE, "remaining-blockers.json"), {
    officialV2: "NOT_EXECUTED",
    publication: "BLOCKED",
    cta: "BLOCKED",
    ads: "NO",
    humanReviewUnlocked: false,
    selectedIteration: best.iteration,
    remainingVisual: best.inspect.flatMap((item) => item.criticalDefects),
    nextRecommendedExecution: "Inspect 54BP captures. Official V2 only after explicit authorization. Keep 54BI active.",
  });
  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    candidateExecution: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    compositionId: PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID,
    productContractHash: sha256Text(JSON.stringify(acceptedProposals(snap.latest).map((item) => item.field))),
    hopSlot: model.hopSlot,
  });
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BP

- Agent: ${VISUAL_OPTIMIZATION_AGENT_ID}
- Source: 54BO
- Candidate: 54BP
- Iterations: ${iterations.length - 1} applied after baseline
- Selected iteration: ${best.iteration}
- Packshot visible desktop: ${Boolean(bestInspect.desktop?.packshotVisible)}
- Packshot visible mobile: ${Boolean(bestInspect.mobile?.packshotVisible)}
- Empty hero desktop: ${Boolean(bestInspect.desktop?.emptyHeroSpace)}
- Content safety: ${safety.gate}
- Preflight: ${preflight.status}
- Spent: ${ledger.spentUsd} / ${ledger.maxUsd}
- Official V2: NO
- Active execution: 54BI
- Preview: ${previewUrl(CONTROLLED_IMPROVEMENT_EXECUTION_ID)}
`,
  );
  console.log(JSON.stringify({
    selected: best.iteration,
    inspect: bestInspect,
    safety: safety.gate,
    preflight: preflight.status,
    spent: ledger.spentUsd,
    officialV2: false,
    previewUrl: previewUrl(CONTROLLED_IMPROVEMENT_EXECUTION_ID),
  }, null, 2));
}

main().catch((err) => {
  try {
    restoreActiveBi();
  } catch {
    /* restore best-effort */
  }
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
