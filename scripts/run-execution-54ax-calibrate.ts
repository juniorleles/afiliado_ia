import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import { visualRubricV2Record } from "../src/lib/presell-quality/visual-eval-v2.ts";
import { historicalComparabilityMatrix, historicalEvaluationRows } from "../src/lib/presell-quality/historical-audit.ts";
import { captureVisitorVisuals } from "../src/lib/presell-quality/visitor-capture.ts";
import { createDesignCheckpoint } from "../src/lib/presell-quality/design-checkpoint.ts";
import { evaluationIdentityOf, LAB_PREVIEW_CAPTURE, VISITOR_VISUAL_CAPTURE } from "../src/lib/presell-quality/evaluation-comparability.ts";
import { selectBestCandidate, writeBestCandidate } from "../src/lib/presell-quality/best-candidate.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { EXECUTION_54AX_BUDGET, EXECUTION_54AX_ID, budgetAllowsPaidCall, emptyExecutionBudgetLedger } from "../src/lib/presell-quality/execution-budget.ts";
import { resolveGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { PREMIUM_VISUAL_EVALUATION_V2 } from "../src/lib/presell-quality/visual-eval-v2.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54ax-visual-calibration");

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
  const paid = budgetAllowsPaidCall(emptyExecutionBudgetLedger(EXECUTION_54AX_ID, EXECUTION_54AX_BUDGET.maxUsd), { kind: "EVALUATION" }, EXECUTION_54AX_BUDGET);
  if (paid.allowed) throw new Error("54AX must not allow paid calls.");

  const standard = loadPremiumPresellDesignStandard();
  const expected = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
  writeJson(path.join(EVIDENCE, "reference-validation.json"), {
    registered: standard.registered,
    path: standard.relativePath,
    hash: standard.hash,
    expectedHash: expected,
    hashMatch: standard.hash === expected,
    dimensions: standard.dimensions,
    accessibleToEvaluator: standard.accessibleToEvaluator,
  });
  if (!standard.registered || standard.hash !== expected) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }

  const historical = historicalEvaluationRows();
  const comparability = historicalComparabilityMatrix(historical);
  writeJson(path.join(EVIDENCE, "historical-evaluation-audit.json"), { rows: historical, comparability });
  writeJson(path.join(EVIDENCE, "comparison-compatibility.json"), comparability);
  writeJson(path.join(EVIDENCE, "visual-rubric-v2.json"), visualRubricV2Record());

  const commit = sourceCommit();
  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
  });
  for (const name of ["desktop", "tablet", "mobile"] as const) {
    const shot = capture.shots.find((item) => item.viewport === name && item.role === "full");
    if (shot && existsSync(shot.path) && path.basename(shot.path) !== `${name}-visitor.png`) {
      copyFileSync(shot.path, path.join(EVIDENCE, `${name}-visitor.png`));
    }
  }

  const checkpoint = createDesignCheckpoint({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    sourceCommit: commit,
    screenshotHashes: capture.shots.map((item) => item.sha256).filter((item): item is string => Boolean(item)),
    notes: ["54AX calibration checkpoint. No automatic rollback."],
    id: "54ax-baseline",
  });
  writeJson(path.join(EVIDENCE, "checkpoint-validation.json"), {
    id: checkpoint.id,
    files: checkpoint.files.map((item) => ({ path: item.path, sha256: item.sha256 })),
    rollbackAvailable: true,
    automaticRollbackExecuted: false,
  });

  const visitorIdentity = evaluationIdentityOf({
    generationId: GENERATION_ID,
    rendererVersion: capture.rendererVersion,
    sourceCommit: commit,
    referenceHash: standard.hash,
    screenshotHashes: capture.shots.filter((item) => item.role === "full").map((item) => item.sha256 ?? ""),
    captureMode: VISITOR_VISUAL_CAPTURE,
    adminChromePresent: Object.values(capture.inspect).some((item) => item.adminChromePresent),
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    promptVersion: "2",
    rubricVersion: "2",
    model: null,
  });
  const historicalIdentity = evaluationIdentityOf({
    generationId: GENERATION_ID,
    captureMode: LAB_PREVIEW_CAPTURE,
    adminChromePresent: true,
    visualEvalVersion: "PREMIUM_VISUAL_EVALUATION_V1",
    promptVersion: "visual-json-object-v1",
    model: "gpt-4o-mini",
    referenceHash: standard.hash,
  });
  const decision = selectBestCandidate({
    current: {
      selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      state: "BEST_KNOWN",
      contentSafetyPass: true,
      evaluationValid: true,
      desktopVisualScore: 72,
      mobileVisualScore: 75,
      editorialScore: 72,
      identity: historicalIdentity,
      qualityApproved: false,
      humanReviewUnlocked: false,
      notes: ["54AW conservative scores. Not a V2 visitor evaluation."],
    },
    incoming: {
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      contentSafetyPass: true,
      evaluationValid: false,
      desktopVisualScore: null,
      mobileVisualScore: null,
      editorialScore: null,
      identity: visitorIdentity,
      notes: ["Visitor capture ready. V2 paid evaluation is pending."],
    },
  });
  writeBestCandidate(decision.best);
  writeJson(path.join(EVIDENCE, "best-candidate-selection.json"), {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    updated: decision.updated,
    comparisonStatus: decision.comparisonStatus,
    reason: decision.reason,
    bestKnownGeneration: decision.best.generationId,
    state: decision.best.state,
    qualityApproved: false,
    humanReviewUnlocked: false,
  });

  const integrity = validatePersistedProductContract(CAMPAIGN_ID, snapshotProductResearch(CAMPAIGN_ID).latest);
  const multiproduct = labScenarioKeys().map((key) => {
    const scenario = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model: scenario }));
    return {
      key,
      inventedChrome: FORBIDDEN_REFERENCE_CHROME.test(html),
      commercialCtaEnabled: Boolean(scenario.hopHref),
    };
  });
  writeJson(path.join(EVIDENCE, "multiproduct-regression.json"), {
    pass: multiproduct.every((row) => !row.inventedChrome && !row.commercialCtaEnabled),
    scenarios: multiproduct,
  });

  const gate = resolveGlobalPresellQualityGate({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    desktopScreenshotPath: path.join(EVIDENCE, "desktop-visitor.png"),
    mobileScreenshotPath: path.join(EVIDENCE, "mobile-visitor.png"),
    comparedToOfficialReference: false,
    evaluatorIndependentFromGenerator: false,
    visualScore: null,
    desktopVisualScore: null,
    mobileVisualScore: null,
    editorialScore: null,
    evaluatorStability: "NOT_ESTABLISHED",
    criticalVisualDefects: [],
    contentSafetyPass: integrity.valid,
    paidEvaluationAvailable: false,
  });
  writeJson(path.join(EVIDENCE, "global-quality-gate.json"), {
    ...gate,
    status: "QUALITY_BLOCKED",
    calibratedEvaluationStatus: "PENDING_PAID_EVALUATION",
    humanReviewUnlocked: false,
    publicationUnlocked: false,
    reasons: [
      ...gate.reasons,
      "V2 visitor evaluation requires a later paid run. 54AW scores are not reused as V2 approval.",
    ],
  });

  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54AX

- Reference hash: ${standard.hash}
- Visitor capture ok: ${capture.ok}
- Admin chrome in visitor shots: ${Object.values(capture.inspect).some((item) => item.adminChromePresent)}
- Historical comparability: ${comparability.map((item) => `${item.left}/${item.right}=${item.status}`).join(", ")}
- Best known generation: ${decision.best.generationId}
- Best candidate updated: ${decision.updated}
- Calibrated evaluation: PENDING_PAID_EVALUATION
- Paid AI: 0
- Gate: ${gate.status}
- Human review unlocked: ${gate.humanReviewUnlocked}
- Product contract valid: ${integrity.valid}
`,
  );
  console.log(JSON.stringify({
    gate: gate.status,
    captureOk: capture.ok,
    updated: decision.updated,
    paidAllowed: paid.allowed,
    notes: capture.notes,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
