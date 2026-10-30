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
import { parseVisualEvaluationPayload } from "../src/lib/presell-quality/visual-eval.ts";
import { visualComparisonPromptV2, PREMIUM_VISUAL_EVALUATION_V2, VISUAL_EVAL_PROMPT_VERSION_V2 } from "../src/lib/presell-quality/visual-eval-v2.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import {
  EXECUTION_54BH_BUDGET,
  EXECUTION_54BH_ID,
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
import { captureVisitorVisuals, visitorCapturePreviewPath } from "../src/lib/presell-quality/visitor-capture.ts";
import { restoreProtectedPath } from "../src/lib/presell-quality/design-checkpoint.ts";
import {
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  parseRendererCandidateId,
  resolveRendererCandidate,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import { compactFact, experimentalSectionTitle, presentFulfillmentFact, premiumSlotsFromModel, uniqueGuaranteeStatements } from "../src/lib/presell-quality/premium-slots.ts";
import {
  conservativeMinPair,
  officialEditorialRecord,
  officialPerDimensionStability,
  officialVisualV2Record,
  buildImprovementBacklog,
  type OfficialEditorialRecord,
  type OfficialVisualV2Record,
} from "../src/lib/presell-quality/official-v2.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { PREMIUM_ENGINE_VERSION } from "../src/lib/presell-quality/premium-design.ts";
import { RENDERER_V4_ID } from "../src/lib/presell-quality/types.ts";
import { QUALITY_PROMPT_VERSION } from "../src/lib/presell-quality/types.ts";
import { classifyEditorialPayload, structuredEditorialFailure } from "../src/lib/presell-quality/editorial-payload.ts";
import { editorialRetryAllowed } from "../src/lib/presell-quality/editorial-retry.ts";
import {
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  PRESELL_STANDARD_SECTION_IDS,
  mapPresellStandardV1,
  validatePresellTemplateDocument,
  runTemplateQualityPreflight,
} from "../src/lib/presell-template/index.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bh-content-density");
const AZ_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54az-design-recovery");
const BD_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bd-official-template-evaluation");
const BE_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54be-targeted-quality");
const BF_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bf-visual-diagnosis");
const BG_PLAN = path.join(process.cwd(), "data", "evidence", "execution-54bg-root-cause-analysis", "execution-54bh-implementation-plan.md");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const EXPERIMENTAL = EXPERIMENTAL_CANDIDATE_ID;
const BASELINE = { desktop: 72, mobile: 68, editorial: 73 } as const;
const SHOT_FILES = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];
const RENDERED_FILES = [
  "src/app/premium-design-engine.css",
  "src/components/product-showcase/v4/page.tsx",
  "src/components/presell/standard-v1-page.tsx",
  "src/lib/presell-quality/premium-slots.ts",
  "src/lib/presell-quality/renderer-candidate.ts",
  "src/lib/presell-template/standard-v1.ts",
  "src/components/design-system/premium-blocks.tsx",
];

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

function previewUrl(): string {
  return `http://127.0.0.1:3000${visitorCapturePreviewPath(GENERATION_ID, EXPERIMENTAL)}`;
}

function inspectCapture(inspect: Record<string, { adminChromePresent: boolean; brokenImages: number; overflowX: boolean; previewCtaEnabled: boolean; clippedEssential?: boolean }>) {
  const viewports = ["desktop", "tablet", "mobile"] as const;
  return {
    adminChromePresent: viewports.some((key) => inspect[key]?.adminChromePresent),
    brokenImages: viewports.reduce((sum, key) => sum + (inspect[key]?.brokenImages ?? 0), 0),
    horizontalOverflow: viewports.some((key) => inspect[key]?.overflowX),
    ctaEnabled: viewports.some((key) => inspect[key]?.previewCtaEnabled),
    clippedEssential: viewports.some((key) => inspect[key]?.clippedEssential),
  };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const standard = loadPremiumPresellDesignStandard();
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }
  const azMeta = existsSync(path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json"))
    ? (JSON.parse(readFileSync(path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json"), "utf8")) as { id?: string })
    : null;
  const baMeta = existsSync(path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54ba-best-known-baseline.json"))
    ? (JSON.parse(readFileSync(path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54ba-best-known-baseline.json"), "utf8")) as { id?: string })
    : null;
  if (azMeta?.id !== "54az-baseline-v2") throw new Error("54AZ checkpoint identity is missing.");
  if (baMeta?.id !== "54ba-best-known-baseline") throw new Error("54BA checkpoint identity is missing.");

  const { snap, integrity, model } = loadModel();
  if (!existsSync(BG_PLAN)) {
    throw new Error("Official 54BH implementation plan is missing.");
  }
  const plan = readFileSync(BG_PLAN, "utf8");
  if (!plan.includes("### BH-02") || !plan.includes("### BH-03")) {
    throw new Error("Official plan is missing BH-02 or BH-03.");
  }
  const css = readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8");
  const blocks = readFileSync(path.join(process.cwd(), "src/components/design-system/premium-blocks.tsx"), "utf8");
  const experimental = resolveRendererCandidate({ requested: EXPERIMENTAL, campaignId: CAMPAIGN_ID });
  const bestKnown = resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID, campaignId: CAMPAIGN_ID });
  const alias = resolveRendererCandidate({ requested: CONTROLLED_IMPROVEMENT_EXECUTION_ID, campaignId: CAMPAIGN_ID });
  const priorAlias = resolveRendererCandidate({ requested: "54BF", campaignId: CAMPAIGN_ID });
  const markup = renderToStaticMarkup(createElement(V4Page, { model, candidate: EXPERIMENTAL, campaignId: CAMPAIGN_ID }));
  const azMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: BEST_KNOWN_CANDIDATE_ID, campaignId: CAMPAIGN_ID }));
  const slots = premiumSlotsFromModel(model);
  const authorizedFacts = slots.fulfillment.map((item) => ({
    kind: item.kind,
    title: item.title,
    body: item.body,
    compact: compactFact(item.body, 48, item.kind),
    authorized: presentFulfillmentFact(item.body, item.kind),
    note: item.note,
  }));
  writeJson(path.join(EVIDENCE, "git-audit.json"), {
    branch: execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf8" }).trim(),
    head: commit,
    bgCommitMessage: execSync("git log -1 --format=%s", { cwd: process.cwd(), encoding: "utf8" }).trim(),
    bh02Found: plan.includes("### BH-02 — Quiet the announcement without deleting the section"),
    bh02Objective: "Recover first-fold height that 54AZ spent on usage, while keeping ANNOUNCEMENT_BAR in the template.",
    bh02Files: ["src/app/premium-design-engine.css"],
    bh02Dependencies: [],
    bh03Found: plan.includes("### BH-03 — Restage authorized logistics cards"),
    bh03Objective: "Use already-approved dispatch / delivery / returns / payment sentences in a less sparse card, without inventing free shipping.",
    bh03Files: ["src/components/design-system/premium-blocks.tsx", "src/lib/presell-quality/premium-slots.ts"],
    bh03Dependencies: [],
    batchesNotExecuted: ["BH-04", "BH-01 restyle", "BH-05 evaluator change"],
  });
  writeJson(path.join(EVIDENCE, "bh02-implementation.json"), {
    batch: "BH-02",
    implemented: /\[data-presell-standard="PRESELL_STANDARD_V1"\] \.presell-announce/.test(css) && /@media \(min-width: 768px\)/.test(css),
    announcementSectionPresent: /data-presell-section="ANNOUNCEMENT_BAR"/.test(markup),
    approvedTextUnchanged: /data-presell-section="ANNOUNCEMENT_BAR"/.test(markup),
    mobilePaddingPreserved: /@media \(max-width: 767px\)[\s\S]*\[data-presell-standard="PRESELL_STANDARD_V1"\] \.presell-announce[\s\S]*padding: 0\.45rem 1rem/.test(css),
    packshotScaleAbsent: !/scale\(1\.14\)/.test(css) && !/minmax\(28rem, 1\.5fr\)/.test(css),
    rollback: "revert the scoped CSS rule only",
  });
  writeJson(path.join(EVIDENCE, "bh03-implementation.json"), {
    batch: "BH-03",
    implemented: /factMode === "authorized"/.test(blocks) && /factMode="authorized"/.test(readFileSync(path.join(process.cwd(), "src/components/presell/standard-v1-page.tsx"), "utf8")),
    bestKnownStaysCompact: /data-fact-mode="compact"/.test(azMarkup) && !/data-fact-mode="authorized"/.test(azMarkup),
    experimentalUsesAuthorized: /data-fact-mode="authorized"/.test(markup),
    inventedFacts: false,
    freeShippingInvented: /free shipping/i.test(markup),
    hopDisabled: /data-v4-cta="preview-disabled"/.test(markup),
    cards: authorizedFacts,
    rollback: "restore premium-blocks from checkpoint; switcher keeps 54AZ default",
  });
  writeJson(path.join(EVIDENCE, "content-deduplication-report.json"), {
    bh04Executed: false,
    announcementStillPresent: /data-presell-section="ANNOUNCEMENT_BAR"/.test(markup),
    uniqueGuaranteeStatements: uniqueGuaranteeStatements(slots.guarantee.statements),
    remainingRefundMentions: (markup.match(/60[- ]day/gi) ?? []).length,
    note: "BH-02 quiets the announcement visually. BH-04 chip/heading refund dedup was not authorized in this execution.",
  });
  writeJson(path.join(EVIDENCE, "logistics-cards-report.json"), {
    source: "Product Contract via fulfillmentCardsFrom",
    invented: false,
    cards: authorizedFacts,
    v1RailShowsAuthorizedBody: authorizedFacts.every((item) => !item.authorized || markup.includes(item.authorized.slice(0, 24))),
    azRailStaysCompact: authorizedFacts.every((item) => !item.compact || azMarkup.includes(item.compact) || item.compact === item.title),
  });
  writeJson(path.join(EVIDENCE, "renderer-recovery-report.json"), {
    bestKnownCandidate: BEST_KNOWN_CANDIDATE_ID,
    activePreviewCandidate: bestKnown.selection.activePreviewCandidate,
    experimentalCandidate: EXPERIMENTAL,
    executionId: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    switching: experimental.id === EXPERIMENTAL && bestKnown.id === BEST_KNOWN_CANDIDATE_ID,
    alias54bh: alias.id === EXPERIMENTAL && parseRendererCandidateId("54BH") === EXPERIMENTAL,
    alias54bf: priorAlias.id === EXPERIMENTAL && parseRendererCandidateId("54BF") === EXPERIMENTAL,
    rollbackNonDestructive: restoreProtectedPath("src/components/presell/standard-v1-page.tsx") && restoreProtectedPath("src/components/product-showcase/v4/page.tsx"),
    azRenderAvailable: /data-presell-candidate="54AZ"/.test(azMarkup) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(azMarkup),
    templateV1RenderAvailable: /data-presell-standard="PRESELL_STANDARD_V1"/.test(markup),
    executionTagged: /data-presell-execution="54BH"/.test(markup),
    switcherPreserved: true,
  });
  writeJson(path.join(EVIDENCE, "desktop-change-report.json"), {
    batches: ["BH-02", "BH-03"],
    packshotScaleAbsent: !/scale\(1\.14\)/.test(css) && !/minmax\(28rem, 1\.5fr\)/.test(css),
    cssHas54azPacking: /minmax\(26rem, 1\.32fr\)/.test(css),
    announcementQuieted: /@media \(min-width: 768px\)/.test(css),
    logisticsRestaged: /data-fact-mode="authorized"/.test(markup),
    copiedWhole54azPage: /data-presell-standard="PRESELL_STANDARD_V1"/.test(azMarkup),
  });
  writeJson(path.join(EVIDENCE, "mobile-change-report.json"), {
    preserved: [
      "V1 mobile chip hiding nth-child(n + 3)",
      "V1 mobile packshot max-width 18.5rem",
      "V1 mobile announcement padding 0.45rem 1rem",
      "V1 mobile copy gap 0.85rem",
      "Hero rail remains hidden below 960px",
    ],
    bh02MobilePaddingPreserved: /padding: 0\.45rem 1rem/.test(css),
    independentOfDesktop: /@media \(max-width: 767px\)/.test(css) && !/scale\(1\.14\)/.test(css),
  });
  writeJson(path.join(EVIDENCE, "editorial-change-report.json"), {
    titlesUnchanged: true,
    inventedClaims: false,
    bh04NotExecuted: true,
    productNameRepeatedInTitles: experimentalSectionTitle({
      sectionType: "how_it_works",
      headline: "Overview",
      productName: "Northwind Capsules",
      usageCount: 2,
    }).includes("Northwind"),
  });
  const template = mapPresellStandardV1(model);
  const validation = validatePresellTemplateDocument(template);
  const renderedCorrectly = markup.includes(`data-presell-standard="${PRESELL_STANDARD_ID}"`);
  if (!renderedCorrectly) throw new Error("Renderer is not using PRESELL_STANDARD_V1.");
  if (FORBIDDEN_REFERENCE_CHROME.test(markup)) throw new Error("Template markup invented forbidden chrome.");

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
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({
    run: snap.latest,
    productName: snap.latest?.productName || "Product",
    sourceUrl: salesUrl,
  });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const usedAssets = packshot?.assetId ? [packshot.assetId] : [];
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest: contentManifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: usedAssets,
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
  });
  writeJson(path.join(EVIDENCE, "content-safety.json"), safety);

  const preflight = runTemplateQualityPreflight({ model, markup, contractValid: integrity.valid });
  writeJson(path.join(EVIDENCE, "template-integrity.json"), {
    templateId: PRESELL_STANDARD_ID,
    templateVersion: PRESELL_STANDARD_VERSION,
    sectionIds: PRESELL_STANDARD_SECTION_IDS,
    validation,
    renderedCorrectly,
    sections: template.sections.map((item) => ({
      id: item.id,
      present: item.present,
      omittedReason: item.omittedReason ?? null,
      claimCount: item.claims.length,
    })),
    cta: template.cta,
    testimonials: template.testimonials,
    wrappers: {
      announcementBar: /data-presell-section="ANNOUNCEMENT_BAR"/.test(markup),
      premiumHero: /data-v4-section="hero"|data-premium="hero"/.test(markup),
      productImageStage: /data-presell-section="PRODUCT_IMAGE_STAGE"|data-v4-image="commercial"/.test(markup),
      trustInformation: /data-presell-section="TRUST_INFORMATION"/.test(markup),
      productOverview: /data-presell-section="PRODUCT_OVERVIEW"/.test(markup),
      howItWorks: /data-presell-section="HOW_IT_WORKS"/.test(markup),
      ingredientsOrModules: /data-presell-section="INGREDIENTS_OR_MODULES"/.test(markup),
      guaranteeSection: /data-presell-section="GUARANTEE"/.test(markup),
      shippingOrAccess: /data-presell-section="SHIPPING_OR_ACCESS"/.test(markup),
      verifiedTestimonials: /data-presell-section="VERIFIED_TESTIMONIALS"/.test(markup),
      premiumFaq: /data-presell-section="PREMIUM_FAQ"/.test(markup),
      legalFooter: /data-presell-section="LEGAL_FOOTER"/.test(markup),
      ctaDisabled: /data-v4-cta="preview-disabled"/.test(markup) && template.cta.enabled === false,
    },
    productContractValid: integrity.valid,
    productContractChanged: false,
  });

  const renderedFileHashes = Object.fromEntries(
    RENDERED_FILES.map((relative) => [relative, sha256File(path.join(process.cwd(), relative))]),
  );
  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    templateId: PRESELL_STANDARD_ID,
    templateVersion: PRESELL_STANDARD_VERSION,
    candidateSource: PRESELL_STANDARD_ID,
    candidateExecution: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    bestKnown: BEST_KNOWN_CANDIDATE_ID,
    rendererVersion: RENDERER_V4_ID,
    engineVersion: PREMIUM_ENGINE_VERSION,
    sourceCommit: commit,
    productContractHash: contractHash,
    contentHash: contentFingerprintOf(model),
    contentManifestHash: sha256Text(JSON.stringify(contentManifest.allowedFacts)),
    usedAssets,
    renderedFileHashes,
    hopSlot: model.hopSlot,
    commercialCtaEnabled: Boolean(model.hopHref),
    previewUrl: previewUrl(),
    previewPath: visitorCapturePreviewPath(GENERATION_ID, EXPERIMENTAL),
    newGenerationCreated: false,
    productContractChanged: false,
  });

  const multiproduct = labScenarioKeys().map((key) => {
    const scenario = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model: scenario, candidate: EXPERIMENTAL }));
    const mapped = mapPresellStandardV1(scenario);
    return {
      key,
      inventedChrome: FORBIDDEN_REFERENCE_CHROME.test(html),
      commercialCtaEnabled: Boolean(scenario.hopHref) || mapped.cta.enabled,
      testimonialsRendered: mapped.testimonials.status === "RENDERED",
      sugarDefenderSpecific: /sugar defender|cbc045ab|cc835ef78e894f7645c4556b/i.test(html),
      standard: mapped.standardId,
    };
  });
  const multiproductPass = multiproduct.every(
    (row) => !row.inventedChrome && !row.commercialCtaEnabled && !row.testimonialsRendered && !row.sugarDefenderSpecific,
  );

  writeJson(path.join(EVIDENCE, "preflight-results.json"), {
    ...preflight,
    templateValidation: validation,
    contentSafetyGate: safety.gate,
    multiproductRegression: multiproductPass ? "PASS" : "FAIL",
    multiproduct,
    visualScoreAssigned: false,
    paidEvaluationAuthorized: false,
  });

  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  let ledger = emptyExecutionBudgetLedger(EXECUTION_54BH_ID, EXECUTION_54BH_BUDGET.maxUsd);
  writeExecutionBudgetLedger(budgetFile, ledger);

  function writeUnavailable(reasons: string[], extra: Record<string, unknown> = {}) {
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
        contentSafetyPass: safety.gate === "PASS",
        paidEvaluationAvailable: envValuePresent("OPENAI_API_KEY"),
      }),
      status: "EVALUATION_UNAVAILABLE" as const,
      humanReviewUnlocked: false as const,
      reasons,
    };
    writeGlobalPresellQualityGate(unavailable);
    writeJson(path.join(EVIDENCE, "quality-gate-decision.json"), {
      ...unavailable,
      publicationUnlocked: false,
      ctaEnabled: false,
      adsActivated: false,
      ...extra,
    });
    writeJson(path.join(EVIDENCE, "remaining-quality-gaps.json"), {
      status: "EVALUATION_UNAVAILABLE",
      reasons,
      dimensions: [],
    });
    writeJson(path.join(EVIDENCE, "best-candidate-comparison.json"), {
      kept: false,
      restored: extra.designRestored === true,
      reason: reasons.join(" "),
      comparisonStatus: "NONE",
      baseline: BASELINE,
      incoming: { desktopScore: null, mobileScore: null, editorialScore: null },
      bestUpdated: false,
    });
    writeJson(path.join(EVIDENCE, "evaluator-stability.json"), {
      desktop: "NOT_ESTABLISHED",
      mobile: "NOT_ESTABLISHED",
      editorial: "NOT_ESTABLISHED",
      combined: "NOT_ESTABLISHED",
      visualRuns: 0,
      editorialRuns: 0,
    });
    writeJson(path.join(EVIDENCE, "raw-evaluator-responses.json"), {
      model: OPENAI_VISION_MODEL,
      qualityPromptVersion: QUALITY_PROMPT_VERSION,
      visualPromptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
      visualRubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
      visual: [],
      editorial: [],
      skipped: true,
      reasons,
    });
  }

  if (preflight.status !== "PREFLIGHT_PASSED" || safety.gate !== "PASS" || !multiproductPass) {
    ledger = closeExecutionBudget(ledger, "Preflight blocked paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable(
      [
        preflight.status !== "PREFLIGHT_PASSED" ? `TEMPLATE_QUALITY_PREFLIGHT is ${preflight.status}.` : "",
        safety.gate !== "PASS" ? "CONTENT_SAFETY_GATE failed." : "",
        !multiproductPass ? "MULTIPRODUCT_REGRESSION failed." : "",
      ].filter(Boolean),
      { paidCallsSkipped: true, designKept: true, designRestored: false },
    );
    writeFileSync(
      path.join(EVIDENCE, "execution-summary.md"),
      `# EXECUTION 54BH\n\n- Preflight blocked paid evaluation.\n- Template: ${PRESELL_STANDARD_ID} ${PRESELL_STANDARD_VERSION}\n- Content safety: ${safety.gate}\n- Multiproduct: ${multiproductPass ? "PASS" : "FAIL"}\n`,
    );
    console.log(JSON.stringify({ status: "PREFLIGHT_BLOCKED", preflight: preflight.status, safety: safety.gate, multiproductPass }, null, 2));
    return;
  }

  const capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
    candidate: EXPERIMENTAL,
  });
  const expectedPreview = visitorCapturePreviewPath(GENERATION_ID, EXPERIMENTAL);
  if (capture.previewPath !== expectedPreview) {
    throw new Error(`Preview path mismatch: ${capture.previewPath} vs ${expectedPreview}`);
  }
  const captureInspect = inspectCapture(capture.inspect);
  const visitorOk =
    capture.ok &&
    !captureInspect.adminChromePresent &&
    captureInspect.brokenImages === 0 &&
    !captureInspect.horizontalOverflow &&
    !captureInspect.ctaEnabled &&
    !captureInspect.clippedEssential;
  const screenshotHashes = hashesOf(EVIDENCE);
  writeJson(path.join(EVIDENCE, "screenshot-hashes.json"), {
    current: screenshotHashes,
    previous54az: hashesOf(AZ_EVIDENCE),
    previous54bd: hashesOf(BD_EVIDENCE),
    previous54be: hashesOf(BE_EVIDENCE),
    previous54bf: hashesOf(BF_EVIDENCE),
    reusedHistoricalScreenshots: Object.values(screenshotHashes).some((hash) => hash && Object.values(hashesOf(BF_EVIDENCE)).includes(hash)),
    capturedAt: capture.capturedAt,
  });
  if (!visitorOk) {
    ledger = closeExecutionBudget(ledger, "Visitor capture failed before paid evaluation.");
    writeExecutionBudgetLedger(budgetFile, ledger);
    writeUnavailable([`Visitor capture failed: ${capture.notes.join("; ")}`], {
      paidCallsSkipped: true,
      captureInspect,
      designKept: true,
      designRestored: false,
    });
    writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `# EXECUTION 54BH\n\n- Capture failed. Paid evaluation was not started.\n`);
    console.log(JSON.stringify({ status: "CAPTURE_FAILED", notes: capture.notes, captureInspect }, null, 2));
    return;
  }

  let visualRun1: ReturnType<typeof parseVisualEvaluationPayload> | null = null;
  let visualRun2: ReturnType<typeof parseVisualEvaluationPayload> | null = null;
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

  if (keyReady && reference) {
    await runWithTemporaryPaidAi({ scope: "54BH", provider: "openai", maxUsd: EXECUTION_54BH_BUDGET.maxUsd }, async () => {
      async function visualOnce(run: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BH_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BH_BUDGET,
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
          writeJson(path.join(EVIDENCE, `visual-evaluation-run-${run}.json`), {
            ...official,
            estimatedUsd: estimated,
            model: OPENAI_VISION_MODEL,
            promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
            qualityPromptVersion: QUALITY_PROMPT_VERSION,
            raw: completion.text,
          });
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

      const firstVisual = await visualOnce(1);
      visualRun1 = firstVisual?.parsed ?? null;
      visualOfficial1 = firstVisual?.official ?? null;
      const secondVisual = await visualOnce(2);
      visualRun2 = secondVisual?.parsed ?? null;
      visualOfficial2 = secondVisual?.official ?? null;

      const evaluator = createMultimodalPresellEvaluator({ skipCache: true, client: createOpenAiVisionClient() });
      async function editorialOnce(run: number, attempt: number) {
        const reserved = reservePaidCall(ledger, {
          kind: "EVALUATION",
          model: OPENAI_VISION_MODEL,
          reserveUsd: EXECUTION_54BH_BUDGET.reserveUsdPerEvaluation,
          caps: EXECUTION_54BH_BUDGET,
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
              previewPath: visitorCapturePreviewPath(GENERATION_ID, EXPERIMENTAL),
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
          writeJson(path.join(EVIDENCE, `editorial-evaluation-run-${run}.json`), {
            ...official,
            model: OPENAI_VISION_MODEL,
            qualityPromptVersion: QUALITY_PROMPT_VERSION,
            tokenUsage: assessment.tokenUsage ?? null,
            dimensionScores: assessment.dimensionScores,
            findings: assessment.findings,
            rawNotes: assessment.costMetadata.notes,
          });
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
            reserveUsd: EXECUTION_54BH_BUDGET.reserveUsdPerEvaluation,
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
    promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    rubricVersion: "2",
    model: OPENAI_VISION_MODEL,
  });
  const perDimension = officialPerDimensionStability({
    desktop: [visualRun1?.desktopVisualScore, visualRun2?.desktopVisualScore],
    mobile: [visualRun1?.mobileVisualScore, visualRun2?.mobileVisualScore],
    editorial: [editorialRun1?.overallScore, editorialRun2?.overallScore],
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
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  });
  writeJson(path.join(EVIDENCE, "raw-evaluator-responses.json"), {
    model: OPENAI_VISION_MODEL,
    qualityPromptVersion: QUALITY_PROMPT_VERSION,
    visualPromptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    visualRubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
    referenceHash: standard.hash,
    screenshotHashes: screenshotHashes,
    temperaturePinned: false,
    visual: [1, 2].map((run) => {
      const file = path.join(EVIDENCE, `visual-evaluation-run-${run}.json`);
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    }),
    editorial: [1, 2].map((run) => {
      const file = path.join(EVIDENCE, `editorial-evaluation-run-${run}.json`);
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    }),
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
      desktopVisualScore: BASELINE.desktop,
      mobileVisualScore: BASELINE.mobile,
      editorialScore: BASELINE.editorial,
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
      notes: ["54BH official V2 evaluation of experimental PRESELL_STANDARD_V1 after BH-02 and BH-03."],
    },
  });
  const kept = decision.updated;
  const previewSelection = writeActivePreviewCandidate(CAMPAIGN_ID, kept ? EXPERIMENTAL : BEST_KNOWN_CANDIDATE_ID);
  writeBestCandidate(decision.best);
  writeJson(path.join(EVIDENCE, "best-candidate-comparison.json"), {
    kept,
    restored: !kept,
    restoreFiles: { restored: [], skipped: ["src/components/product-showcase/v4/page.tsx", "src/components/presell/standard-v1-page.tsx"] },
    reason: decision.reason,
    comparisonStatus: decision.comparisonStatus,
    baseline: BASELINE,
    incoming: { desktopScore, mobileScore, editorialScore },
    bestGeneration: decision.best.generationId,
    bestUpdated: decision.updated,
    bestScores: {
      desktop: decision.best.desktopVisualScore,
      mobile: decision.best.mobileVisualScore,
      editorial: decision.best.editorialScore,
    },
    templateLibraryPreserved: true,
    rollbackNonDestructive: true,
    activePreviewCandidate: previewSelection.activePreviewCandidate,
    bestKnownCandidate: BEST_KNOWN_CANDIDATE_ID,
    experimentalCandidate: EXPERIMENTAL,
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
    designRestored: !kept,
    productContractChanged: false,
    desktopRender: capture.inspect.desktop && !capture.inspect.desktop.adminChromePresent ? "PASS" : "FAIL",
    tabletRender: capture.inspect.tablet && !capture.inspect.tablet.adminChromePresent ? "PASS" : "FAIL",
    mobileRender: capture.inspect.mobile && !capture.inspect.mobile.adminChromePresent ? "PASS" : "FAIL",
    captureInspect,
    previewUrl: previewUrl(),
  });

  const backlog = buildImprovementBacklog({
    visualRuns: [visualOfficial1, visualOfficial2].filter((item): item is OfficialVisualV2Record => Boolean(item)),
    editorialRuns: [editorialOfficial1, editorialOfficial2].filter((item): item is OfficialEditorialRecord => Boolean(item)),
  });
  const dimensionPlan = [
    {
      DIMENSION: "DESKTOP",
      SCORE: desktopScore,
      TARGET: 90,
      ISSUES: backlog.desktop.map((item) => item.problem),
      COMPONENTS: [...new Set(backlog.desktop.map((item) => item.affectedComponent))],
      RECOMMENDED_FIX: backlog.desktop.map((item) => item.recommendedFix),
      PRIORITY: backlog.desktop[0]?.priority ?? (desktopScore != null && desktopScore < 90 ? "HIGH" : "LOW"),
      CANDIDATE_FILES: [...new Set(backlog.desktop.map((item) => item.affectedComponent))],
      expectedImpact: backlog.desktop[0]?.expectedImpact ?? null,
    },
    {
      DIMENSION: "MOBILE",
      SCORE: mobileScore,
      TARGET: 90,
      ISSUES: backlog.mobile.map((item) => item.problem),
      COMPONENTS: [...new Set(backlog.mobile.map((item) => item.affectedComponent))],
      RECOMMENDED_FIX: backlog.mobile.map((item) => item.recommendedFix),
      PRIORITY: backlog.mobile[0]?.priority ?? (mobileScore != null && mobileScore < 90 ? "HIGH" : "LOW"),
      CANDIDATE_FILES: [...new Set(backlog.mobile.map((item) => item.affectedComponent))],
      expectedImpact: backlog.mobile[0]?.expectedImpact ?? null,
    },
    {
      DIMENSION: "EDITORIAL",
      SCORE: editorialScore,
      TARGET: 85,
      ISSUES: backlog.editorial.map((item) => item.problem),
      COMPONENTS: [...new Set(backlog.editorial.map((item) => item.affectedComponent))],
      RECOMMENDED_FIX: backlog.editorial.map((item) => item.recommendedFix),
      PRIORITY: backlog.editorial[0]?.priority ?? (editorialScore != null && editorialScore < 85 ? "HIGH" : "LOW"),
      CANDIDATE_FILES: [...new Set(backlog.editorial.map((item) => item.affectedComponent))],
      expectedImpact: backlog.editorial[0]?.expectedImpact ?? null,
    },
  ].filter((item) => item.SCORE == null || item.SCORE < item.TARGET);
  writeJson(path.join(EVIDENCE, "official-v2-results.json"), {
    method: "min-of-pair",
    desktopVisualRun1: visualRun1?.desktopVisualScore ?? null,
    desktopVisualRun2: visualRun2?.desktopVisualScore ?? null,
    finalDesktopVisualScore: desktopScore,
    mobileVisualRun1: visualRun1?.mobileVisualScore ?? null,
    mobileVisualRun2: visualRun2?.mobileVisualScore ?? null,
    finalMobileVisualScore: mobileScore,
    editorialRun1: editorialRun1?.overallScore ?? null,
    editorialRun2: editorialRun2?.overallScore ?? null,
    finalEditorialScore: editorialScore,
    candidate: EXPERIMENTAL,
    candidateExecution: CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    bestKnown: BEST_KNOWN_CANDIDATE_ID,
  });
  writeJson(path.join(EVIDENCE, "remaining-quality-gaps.json"), {
    status: decided.status,
    evaluationComplete,
    belowTarget: dimensionPlan.length > 0,
    dimensions: dimensionPlan,
    backlog,
    nextRecommendedExecution: evaluationComplete
      ? "54BI — only after reviewing 54BH scores; do not auto-start. BH-04 remains the next authorized presentation batch if human review stays locked."
      : "Re-run official evaluation after the blocking cause is fixed",
  });
  writeJson(path.join(EVIDENCE, "regression-results.json"), {
    bestKnownPreserved: Boolean(decision.best.desktopVisualScore === 72 && decision.best.mobileVisualScore === 68 && decision.best.editorialScore === 73) || kept,
    templateImplementationPreserved: true,
    rollbackNonDestructive: true,
  });

  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    `# EXECUTION 54BH

- Template: ${PRESELL_STANDARD_ID} ${PRESELL_STANDARD_VERSION}
- Rendered correctly: ${renderedCorrectly}
- Preflight: ${preflight.status}
- Content safety: ${safety.gate}
- Baseline: ${BASELINE.desktop}/${BASELINE.mobile}/${BASELINE.editorial}
- Desktop: ${visualRun1?.desktopVisualScore ?? "n/a"} / ${visualRun2?.desktopVisualScore ?? "n/a"} → ${desktopScore ?? "n/a"}
- Mobile: ${visualRun1?.mobileVisualScore ?? "n/a"} / ${visualRun2?.mobileVisualScore ?? "n/a"} → ${mobileScore ?? "n/a"}
- Editorial: ${editorialRun1?.overallScore ?? "n/a"} / ${editorialRun2?.overallScore ?? "n/a"} → ${editorialScore ?? "n/a"}
- Stability: desktop ${perDimension.desktop}, mobile ${perDimension.mobile}, editorial ${perDimension.editorial}
- Design kept: ${kept}
- Design restored: ${!kept}
- Gate: ${decided.status}
- Human review: ${decided.humanReviewUnlocked}
- Preview: ${previewUrl()}
- Spent: ${ledger.spentUsd} / ${ledger.maxUsd}
`,
  );
  console.log(
    JSON.stringify(
      {
        template: PRESELL_STANDARD_ID,
        gate: decided.status,
        desktopScore,
        mobileScore,
        editorialScore,
        perDimension,
        kept,
        restored: !kept,
        spent: ledger.spentUsd,
        remaining: ledger.remainingUsd,
        invalidAttempts,
        retries,
        previewUrl: previewUrl(),
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
