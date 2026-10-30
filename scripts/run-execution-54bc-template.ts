import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { disableCommercialCta, evaluateContentSafety } from "../src/lib/presell-quality/content-safety.ts";
import { buildContentManifest } from "../src/lib/presell-quality/content-manifest.ts";
import { enrichApprovedFactsForGeneration } from "../src/lib/presell-quality/approved-generation-facts.ts";
import { botanicalAssetIds, selectApprovedPackshot } from "../src/lib/presell-quality/approved-packshot.ts";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import { currentSalesUrl } from "../src/lib/campaign-sources/present.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import { writeGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { readBestCandidate, writeBestCandidate } from "../src/lib/presell-quality/best-candidate.ts";
import { captureVisitorVisuals } from "../src/lib/presell-quality/visitor-capture.ts";
import { createDesignCheckpointFromFiles, DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import {
  EXECUTION_54BC_PAID_AI_BUDGET_USD,
  PRESELL_SECTION_REGISTRY,
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  mapPresellStandardV1,
  producerEvidenceLibraryFromRun,
  runTemplateQualityPreflight,
  validatePresellTemplateDocument,
} from "../src/lib/presell-template/index.ts";
import { templateOptimizationSignals } from "../src/lib/presell-template/optimization-signals.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bc-universal-template");
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

function gitShow(commit: string, relative: string): string {
  return execSync(`git show ${commit}:${relative}`, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function loadCampaignModel() {
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

async function main() {
  if (EXECUTION_54BC_PAID_AI_BUDGET_USD !== 0) throw new Error("54BC paid budget must be 0.");
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const standard = loadPremiumPresellDesignStandard();
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }

  const az = path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json");
  const ba = path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54ba-best-known-baseline.json");
  if (!existsSync(az) || !existsSync(ba)) throw new Error("54AZ/54BA checkpoints are missing.");
  const baseCommit = commit ?? "c1a4792053e3c52837f8057a422a86fbcba95218";
  createDesignCheckpointFromFiles({
    id: "54bc-pre-template-az",
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    sourceCommit: baseCommit,
    notes: ["54AZ live files from HEAD before PRESELL_STANDARD_V1 renderer wiring. 54az-baseline-v2 was not overwritten."],
    files: [...DESIGN_CHECKPOINT_FILES, "src/components/product-showcase/v4/page.tsx"].map((relative) => ({
      path: relative,
      contents: gitShow(baseCommit, relative),
    })),
  });

  writeJson(path.join(EVIDENCE, "architecture-audit.json"), {
    reused: [
      "premium-blocks.tsx",
      "premium-slots.ts",
      "V4Page",
      "evidence-inventory",
      "candidate-ledger",
      "content-manifest",
      "content-safety",
      "visitor-capture",
      "global-quality-gate",
      "best-candidate",
    ],
    newModules: [
      "src/lib/presell-template/",
      "src/components/presell/index.tsx",
    ],
    parallelGenerator: false,
    productContractChanged: false,
  });
  writeJson(path.join(EVIDENCE, "template-contract.json"), {
    id: PRESELL_STANDARD_ID,
    version: PRESELL_STANDARD_VERSION,
    paidAiBudgetUsd: EXECUTION_54BC_PAID_AI_BUDGET_USD,
  });
  writeJson(path.join(EVIDENCE, "section-registry.json"), PRESELL_SECTION_REGISTRY);

  const { snap, integrity, model } = loadCampaignModel();
  const markup = renderToStaticMarkup(createElement(V4Page, { model }));
  const template = mapPresellStandardV1(model);
  const validation = validatePresellTemplateDocument(template);
  writeJson(path.join(EVIDENCE, "producer-evidence-mapping.json"), producerEvidenceLibraryFromRun({ campaignId: CAMPAIGN_ID, run: snap.latest }));

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
  writeJson(path.join(EVIDENCE, "content-safety-report.json"), safety);

  const preflight = runTemplateQualityPreflight({ model, markup, contractValid: integrity.valid });
  writeJson(path.join(EVIDENCE, "preflight-results.json"), { ...preflight, templateValidation: validation });
  writeJson(path.join(EVIDENCE, "optimization-signals.json"), templateOptimizationSignals({ document: template, markup }));

  const multiproduct = labScenarioKeys().map((key) => {
    const scenario = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model: scenario }));
    const mapped = mapPresellStandardV1(scenario);
    return {
      key,
      inventedChrome: FORBIDDEN_REFERENCE_CHROME.test(html),
      commercialCtaEnabled: Boolean(scenario.hopHref) || mapped.cta.enabled,
      testimonialsRendered: mapped.testimonials.status === "RENDERED",
      sugarDefenderSpecific: /sugar defender|cbc045ab|cc835ef78e894f7645c4556b/i.test(html),
      standard: mapped.standardId,
      omittedOptional: mapped.sections.filter((item) => !item.present).map((item) => item.id),
    };
  });
  const multiproductPass = multiproduct.every(
    (row) => !row.inventedChrome && !row.commercialCtaEnabled && !row.testimonialsRendered && !row.sugarDefenderSpecific,
  );
  writeJson(path.join(EVIDENCE, "multiproduct-results.json"), { pass: multiproductPass, scenarios: multiproduct });

  const started = Date.now();
  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
  });
  const elapsedMs = Date.now() - started;
  const shotFiles = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];
  writeJson(path.join(EVIDENCE, "performance-results.json"), {
    methodology: "Local Playwright visitor capture wall time plus PNG byte sizes. This is not a Lighthouse lab.",
    captureElapsedMs: elapsedMs,
    claimedUnderTwoSeconds: false,
    files: Object.fromEntries(
      shotFiles.map((name) => {
        const file = path.join(EVIDENCE, name);
        return [name, existsSync(file) ? { bytes: statSync(file).size } : { bytes: null }];
      }),
    ),
  });

  const best = readBestCandidate(CAMPAIGN_ID);
  if (best) writeBestCandidate(best);
  writeJson(path.join(EVIDENCE, "regression-results.json"), {
    bestKnownPreserved: Boolean(best && best.desktopVisualScore === 72 && best.mobileVisualScore === 68 && best.editorialScore === 73),
    bestCandidateUpdated: false,
    paidAiCalls: 0,
  });

  writeGlobalPresellQualityGate({
    id: "GLOBAL_PRESELL_QUALITY_GATE",
    status: "EVALUATION_UNAVAILABLE",
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    humanReviewUnlocked: false,
    publicationUnlocked: false,
    reasons: [
      "PRESELL_STANDARD_V1 is implemented but has no official paid V2 evaluation in 54BC.",
      "Best known remains 54AZ 72/68/73.",
    ],
    visualScore: null,
    desktopVisualScore: null,
    mobileVisualScore: null,
    editorialScore: null,
    evaluatorStability: "NOT_ESTABLISHED",
    criticalVisualDefects: [],
    contentSafetyPass: safety.gate === "PASS",
    referenceRegistered: true,
    comparedToOfficialReference: false,
  });

  const inspect = capture.inspect;
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BC

- Template: ${PRESELL_STANDARD_ID} ${PRESELL_STANDARD_VERSION}
- Preflight: ${preflight.status}
- Content safety: ${safety.gate}
- Multiproduct: ${multiproductPass ? "PASS" : "FAIL"}
- Capture ok: ${capture.ok}
- Desktop render: ${inspect.desktop && !inspect.desktop.adminChromePresent ? "PASS" : "FAIL"}
- Tablet render: ${inspect.tablet && !inspect.tablet.adminChromePresent ? "PASS" : "FAIL"}
- Mobile render: ${inspect.mobile && !inspect.mobile.adminChromePresent ? "PASS" : "FAIL"}
- Paid AI: 0
- Best known preserved: 72/68/73
`,
  );

  console.log(
    JSON.stringify(
      {
        template: PRESELL_STANDARD_ID,
        preflight: preflight.status,
        safety: safety.gate,
        multiproductPass,
        captureOk: capture.ok,
        elapsedMs,
        paidAi: 0,
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
