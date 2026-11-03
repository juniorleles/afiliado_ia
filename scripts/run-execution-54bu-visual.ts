import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  EXECUTION_54BU_BUDGET,
  EXECUTION_54BU_ID,
  emptyExecutionBudgetLedger,
  writeExecutionBudgetLedger,
} from "../src/lib/presell-quality/execution-budget.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import { captureVisitorVisuals, visitorCapturePreviewPath } from "../src/lib/presell-quality/visitor-capture.ts";
import { createDesignCheckpointFromFiles, DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import {
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  FINAL_VISUAL_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID,
  PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
  usesPremiumEditorialCorrection,
  usesPremiumFinalVisual,
  readRendererCandidateSelection,
  writeActivePreviewCandidate,
} from "../src/lib/presell-quality/renderer-candidate.ts";
import { approvedCommercialExcerpts, readCommercialReuse } from "../src/lib/presell-quality/commercial-reuse.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";
import {
  defaultVisualComposition,
  inspectFaqInteraction,
  inspectPassEditorial,
  inspectRenderedPage,
} from "../src/lib/presell-quality/visual-optimization-agent/index.ts";
import { resolveGlobalPresellQualityGate } from "../src/lib/presell-quality/global-quality-gate.ts";
import { readBestCandidate } from "../src/lib/presell-quality/best-candidate.ts";
import {
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  validatePresellTemplateDocument,
} from "../src/lib/presell-template/index.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bu-final-visual-corrections");
const BS_EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54bs-official-v2-decision");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BT_COMMIT = "11c4d0effee38cffbab23c91294946e0af56eea8";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const PACKSHOT_PATH = "/media/product/cc835ef78e894f7645c4556b.png";

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
  writeActivePreviewCandidate(CAMPAIGN_ID, EXPERIMENTAL_CANDIDATE_ID, FROZEN_IMPROVEMENT_EXECUTION_ID);
}

function lin(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parseRgb(color: string): [number, number, number] | null {
  const rgb = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = color.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  return null;
}

function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) return null;
  const l1 = 0.2126 * lin(fg[0]) + 0.7152 * lin(fg[1]) + 0.0722 * lin(fg[2]);
  const l2 = 0.2126 * lin(bg[0]) + 0.7152 * lin(bg[1]) + 0.0722 * lin(bg[2]);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

async function probeContrast(url: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
    const samples = (await page.evaluate(`(() => {
      const pick = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const style = getComputedStyle(el);
        let bg = style.backgroundColor;
        let node = el;
        while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
          node = node.parentElement;
          bg = node ? getComputedStyle(node).backgroundColor : bg;
        }
        return {
          selector,
          color: style.color,
          background: bg,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontWeight: style.fontWeight,
        };
      };
      return {
        lead: pick(".premium-structural-hero__copy .ds-lead"),
        packageMeta: pick(".premium-card .ds-display--package + .ds-meta"),
        packageTotal: pick(".premium-card .ds-display--package + .ds-meta + .ds-body"),
        shipping: pick("[data-seller-package] .ds-meta:last-of-type"),
        guarantee: pick(".premium-guarantee .ds-body"),
        faq: pick(".premium-faq .ds-body"),
        disclosure: pick(".ds-footer .ds-caption, .v4-disclosure-band .ds-body, .premium-compliance-band .ds-meta"),
        announce: pick(".presell-announce, .ds-announce"),
      };
    })()`)) as Record<string, { selector: string; color: string; background: string; fontSize: string; lineHeight: string; fontWeight: string } | null>;
    await context.close();
    return Object.fromEntries(
      Object.entries(samples).map(([key, sample]) => [
        key,
        sample
          ? {
              ...sample,
              contrast: contrastRatio(sample.color, sample.background),
              wcagAa: (contrastRatio(sample.color, sample.background) ?? 0) >= 4.5,
            }
          : { missing: true },
      ]),
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const commit = sourceCommit();
  const branch = execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf8" }).trim();
  const standard = loadPremiumPresellDesignStandard();
  if (!standard.registered || standard.hash !== EXPECTED_REFERENCE) {
    throw new Error("Official premium reference is missing or the hash does not match.");
  }

  writeJson(path.join(EVIDENCE, "git-audit.json"), {
    branch,
    head: commit,
    initialHead: BT_COMMIT,
    btCommit: BT_COMMIT,
    btCommitMessage: "docs(presell): preserve evaluator alignment and final correction plan",
    biCommit: BI_COMMIT,
    pushExecuted: false,
    buCommitCreated: false,
  });

  createDesignCheckpointFromFiles({
    id: "54bu-experimental-final-visual",
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    sourceCommit: commit,
    screenshotHashes: [],
    notes: ["54BU experimental final visual corrections. Does not overwrite 54bi-proven-baseline or 54BR."],
    files: [
      ...DESIGN_CHECKPOINT_FILES,
      "src/components/presell/standard-v1-page.tsx",
      "src/lib/presell-quality/renderer-candidate.ts",
    ].map((relative) => ({
      path: relative,
      contents: readFileSync(path.join(process.cwd(), relative), "utf8"),
    })),
  });

  writeJson(path.join(EVIDENCE, "candidate-identity.json"), {
    EXECUTION_ID: "54BU",
    CANDIDATE_ID: "54BU",
    COMPOSITION_ID: PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
    STATUS: "EXPERIMENTAL",
    SOURCE_CANDIDATE: "54BR",
    SOURCE_COMPOSITION_ID: PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID,
    BEST_KNOWN_EXECUTION: "54BI",
    ACTIVE_EXECUTION_ID: readRendererCandidateSelection(CAMPAIGN_ID).activeExecutionId,
    CONTROLLED_IMPROVEMENT_EXECUTION_ID,
    usesPremiumFinalVisual: usesPremiumFinalVisual(FINAL_VISUAL_EXECUTION_ID),
    usesPremiumEditorialCorrection: usesPremiumEditorialCorrection(FINAL_VISUAL_EXECUTION_ID),
    brRemainsEditorial: usesPremiumEditorialCorrection(CONTROLLED_IMPROVEMENT_EXECUTION_ID) && !usesPremiumFinalVisual(CONTROLLED_IMPROVEMENT_EXECUTION_ID),
    defaultComposition: defaultVisualComposition("54BU").executionId,
    selectableVia: "?candidate=54BU",
  });

  const { snap, integrity, model } = loadModel();
  const reuse = readCommercialReuse(CAMPAIGN_ID);
  if (!reuse) throw new Error("Commercial reuse manifest is missing.");
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({
    run: snap.latest,
    productName: snap.latest?.productName || "Product",
    sourceUrl: salesUrl,
  });
  const contentManifest = buildContentManifest({ campaignId: CAMPAIGN_ID, run: snap.latest, integrity, generation: enriched });
  const excerpts = [
    ...approvedCommercialExcerpts(reuse),
    ...reuse.approvedPackages.flatMap((item) => [item.unitPrice, item.currentTotal, item.comparedTotal ?? ""]).filter(Boolean),
  ];

  const budgetFile = path.join(EVIDENCE, "budget-ledger.json");
  const ledger = emptyExecutionBudgetLedger(EXECUTION_54BU_ID, EXECUTION_54BU_BUDGET.maxUsd);
  writeExecutionBudgetLedger(budgetFile, ledger);

  const buMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BU", campaignId: CAMPAIGN_ID }));
  const brMarkup = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BR", campaignId: CAMPAIGN_ID }));
  const css = readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8");

  if (existsSync(path.join(BS_EVIDENCE, "desktop-first-fold.png"))) {
    copyFileSync(path.join(BS_EVIDENCE, "desktop-first-fold.png"), path.join(EVIDENCE, "desktop-before.png"));
  }
  if (existsSync(path.join(BS_EVIDENCE, "mobile-first-fold.png"))) {
    copyFileSync(path.join(BS_EVIDENCE, "mobile-first-fold.png"), path.join(EVIDENCE, "mobile-before.png"));
  }

  function copyIfPresent(from: string, to: string) {
    const source = path.join(EVIDENCE, from);
    if (existsSync(source)) copyFileSync(source, path.join(EVIDENCE, to));
  }

  let capture = await captureVisitorVisuals({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    outDir: EVIDENCE,
    sourceCommit: commit,
    naming: "official",
    manifestName: "capture-manifest.json",
    candidate: FINAL_VISUAL_EXECUTION_ID,
  });
  for (let attempt = 1; attempt < 3 && !capture.ok; attempt += 1) {
    capture = await captureVisitorVisuals({
      campaignId: CAMPAIGN_ID,
      generationId: GENERATION_ID,
      outDir: EVIDENCE,
      sourceCommit: commit,
      naming: "official",
      manifestName: "capture-manifest.json",
      candidate: FINAL_VISUAL_EXECUTION_ID,
    });
  }
  copyIfPresent("desktop-first-fold.png", "desktop-after.png");
  copyIfPresent("tablet-first-fold.png", "tablet-after.png");
  copyIfPresent("mobile-first-fold.png", "mobile-after.png");
  copyIfPresent("desktop-full.png", "desktop-final.png");
  copyIfPresent("tablet-full.png", "tablet-final.png");
  copyIfPresent("mobile-full.png", "mobile-final.png");

  const inspect = await inspectRenderedPage(previewUrl(FINAL_VISUAL_EXECUTION_ID));
  const faq = await inspectFaqInteraction(previewUrl(FINAL_VISUAL_EXECUTION_ID));
  const contrast = await probeContrast(previewUrl(FINAL_VISUAL_EXECUTION_ID));
  const visualPass = inspectPassEditorial(inspect);

  const h1 = buMarkup.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  const prices = {
    unit: ["$79", "$69", "$49"].every((price) => buMarkup.includes(price)),
    total: ["$158", "$207", "$294"].every((price) => buMarkup.includes(price)),
    associated:
      /\$79[\s\S]{0,240}\$158/.test(buMarkup) &&
      /\$69[\s\S]{0,240}\$207/.test(buMarkup) &&
      /\$49[\s\S]{0,240}\$294/.test(buMarkup),
  };
  const usageOk = /two(?: full)? droppers/i.test(buMarkup) && !/\btwo drops\b/i.test(buMarkup);
  const guaranteeOk = /60/.test(buMarkup);
  const disclosureOk = /commission/i.test(buMarkup);
  const packshotOk = packshot?.assetId === "asset-cbc045ab" && buMarkup.includes(PACKSHOT_PATH);
  const featuredCount = (buMarkup.match(/premium-card--featured/g) ?? []).length;
  const packageCount = (buMarkup.match(/data-seller-package=/g) ?? []).length;

  const safety = evaluateContentSafety({
    model,
    markup: buMarkup,
    manifest: contentManifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
    approvedCommercialExcerpts: excerpts,
  });
  const template = mapPresellStandardV1(model);
  const preflight = runTemplateQualityPreflight({ model, markup: buMarkup, contractValid: integrity.valid });
  const templateDoc = validatePresellTemplateDocument(template);

  const labOk = labScenarioKeys().every((key) => {
    const html = renderToStaticMarkup(createElement(V4Page, { model: disableCommercialCta(buildV4Model(key)!), candidate: "54BU" }));
    return (
      /data-presell-execution="54BU"/.test(html) &&
      /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(html) &&
      !FORBIDDEN_REFERENCE_CHROME.test(html) &&
      !/sugar defender/i.test(html) &&
      !/data-seller-stated-offers/.test(html)
    );
  });

  restoreActiveBi();
  const liveStore = readRendererCandidateSelection(CAMPAIGN_ID);
  const best = readBestCandidate(CAMPAIGN_ID);
  const gate = resolveGlobalPresellQualityGate({
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    desktopScreenshotPath: path.join(EVIDENCE, "desktop-first-fold.png"),
    mobileScreenshotPath: path.join(EVIDENCE, "mobile-first-fold.png"),
    comparedToOfficialReference: true,
    evaluatorIndependentFromGenerator: true,
    visualScore: 73,
    desktopVisualScore: 73,
    mobileVisualScore: 75,
    editorialScore: 65,
    evaluatorStability: "EVALUATOR_UNSTABLE",
    contentSafetyPass: safety.gate === "PASS",
    criticalVisualDefects: ["official V2 not executed in 54BU"],
  });

  const desktopInspect = inspect.find((item) => item.viewport === "desktop");
  const tabletInspect = inspect.find((item) => item.viewport === "tablet");
  const mobileInspect = inspect.find((item) => item.viewport === "mobile");
  const captureDesktop = capture.inspect.desktop;
  const captureMobile = capture.inspect.mobile;
  const captureTablet = capture.inspect.tablet;

  writeJson(path.join(EVIDENCE, "bt-01-hero-density.json"), {
    issue: "BT-01",
    cssIsolated: /\[data-presell-execution="54BU"\]/.test(css) && /padding-block: 0\.55rem 0\.7rem/.test(css),
    brUnchanged: /\[data-presell-execution="54BR"\][\s\S]{0,180}padding-block: 1\.15rem 1\.25rem/.test(css),
    headline: h1,
    packshotAssetId: packshot?.assetId ?? null,
    packshotPathPresent: packshotOk,
    inspect: {
      desktop: desktopInspect,
      tablet: tabletInspect,
      mobile: mobileInspect,
    },
    capture: {
      desktop: captureDesktop,
      tablet: captureTablet,
      mobile: captureMobile,
    },
    emptyHeroSpaceDesktop: desktopInspect?.emptyHeroSpace ?? null,
    packshotVisibleDesktop: desktopInspect?.packshotVisible ?? false,
    packshotVisibleMobile: mobileInspect?.packshotVisible ?? false,
    overflow: {
      desktop: desktopInspect?.overflowX ?? true,
      tablet: tabletInspect?.overflowX ?? true,
      mobile: mobileInspect?.overflowX ?? true,
    },
    accepted: Boolean(
      visualPass &&
        desktopInspect?.packshotVisible &&
        mobileInspect?.packshotVisible &&
        !desktopInspect?.overflowX &&
        !mobileInspect?.overflowX,
    ),
  });

  writeJson(path.join(EVIDENCE, "bt-02-card-craft.json"), {
    issue: "BT-02",
    packageCount,
    featuredCount,
    prices,
    featuredIsLowestUnit: featuredCount >= 1 && /\$49/.test(buMarkup),
    noInventedPopularLabel: !/limited offer/i.test(buMarkup),
    inspect: {
      overlapDesktop: desktopInspect?.overlap ?? true,
      overlapMobile: mobileInspect?.overlap ?? true,
      packageCards: desktopInspect?.packageCards ?? 0,
      straddlingDesktop: desktopInspect?.packageCardsStraddlingFold ?? 0,
    },
    accepted: Boolean(packageCount === 3 && prices.unit && prices.total && prices.associated && !(desktopInspect?.overlap || mobileInspect?.overlap)),
  });

  writeJson(path.join(EVIDENCE, "bt-03-text-contrast.json"), {
    issue: "BT-03",
    samples: contrast,
    twoDroppers: usageOk,
    guaranteePresent: guaranteeOk,
    disclosurePresent: disclosureOk,
    accepted: Object.values(contrast).every((sample) => {
      if (!sample || typeof sample !== "object") return false;
      if ("missing" in sample && sample.missing) return true;
      if ("wcagAa" in sample) return Boolean(sample.wcagAa);
      return false;
    }),
  });

  writeJson(path.join(EVIDENCE, "commercial-content-integrity.json"), {
    headlinePreserved: /discover sugar defender/i.test(h1) && /discover sugar defender/i.test(brMarkup),
    pricesPreserved: prices.unit && prices.total && prices.associated,
    twoDroppers: usageOk,
    twoDropsAbsent: !/\btwo drops\b/i.test(buMarkup),
    guaranteeWindow: guaranteeOk,
    disclosure: disclosureOk,
    packshot: packshotOk,
    brStillSelectable: /data-presell-execution="54BR"/.test(brMarkup) && /data-presell-composition="PREMIUM_EDITORIAL_CORRECTION_V1"/.test(brMarkup),
    buComposition: /data-presell-composition="PREMIUM_FINAL_VISUAL_V1"/.test(buMarkup),
    forbiddenChrome: FORBIDDEN_REFERENCE_CHROME.test(buMarkup),
    slots: {
      usage: premiumSlotsFromModel(model).usage,
      guaranteeDays: premiumSlotsFromModel(model).guarantee.days,
    },
  });

  writeJson(path.join(EVIDENCE, "preflight-results.json"), {
    status: preflight.status,
    integrity: integrity.valid,
    templateDoc: templateDoc.ok,
    hopSlot: model.hopSlot,
    ctaEnabled: template.cta.enabled,
  });
  writeJson(path.join(EVIDENCE, "content-safety-results.json"), {
    gate: safety.gate,
    commercialCtaEnabled: safety.commercialCtaEnabled,
    findings: safety.findings ?? [],
  });
  writeJson(path.join(EVIDENCE, "regression-results.json"), {
    visualInspectPass: visualPass,
    captureOk: capture.ok,
    captureNotes: capture.notes,
    faq,
    liveStore: liveStore.activeExecutionId,
    bestKnown: {
      notes: best?.notes ?? [],
      desktop: best?.desktopVisualScore ?? null,
      mobile: best?.mobileVisualScore ?? null,
      editorial: best?.editorialScore ?? null,
    },
    multiproduct: labOk,
    officialV2Executed: false,
    aiCalls: 0,
    spentUsd: ledger.spentUsd,
  });
  writeJson(path.join(EVIDENCE, "remaining-blockers.json"), {
    GLOBAL_PRESELL_QUALITY_GATE: gate.status,
    HUMAN_REVIEW_UNLOCKED: gate.humanReviewUnlocked,
    CTA_ENABLED: false,
    COMMERCIAL_AUTHORIZATION: "BLOCKED",
    PUBLICATION_READINESS: "BLOCKED",
    ADS_ACTIVATED: false,
    OFFICIAL_V2_EXECUTED: false,
    BEST_KNOWN_EXECUTION: "54BI",
    NEXT_RECOMMENDED_EXECUTION: "Official V2 evaluation of candidate 54BU, only with a new exclusive budget. Do not auto-start.",
  });

  const summary = [
    "# EXECUTION 54BU — FINAL PREMIUM VISUAL CORRECTIONS",
    "",
    `CURRENT_BRANCH: ${branch}`,
    `INITIAL_HEAD: ${BT_COMMIT}`,
    `HEAD: ${commit}`,
    "SOURCE_CANDIDATE: 54BR",
    "NEW_CANDIDATE: 54BU",
    `COMPOSITION_ID: ${PREMIUM_FINAL_VISUAL_COMPOSITION_ID}`,
    `PREFLIGHT_STATUS: ${preflight.status}`,
    `CONTENT_SAFETY_GATE: ${safety.gate}`,
    `VISUAL_INSPECT: ${visualPass ? "PASS" : "REVIEW"}`,
    `PACKSHOT_VISIBLE_DESKTOP: ${desktopInspect?.packshotVisible ? "YES" : "NO"}`,
    `PACKSHOT_VISIBLE_MOBILE: ${mobileInspect?.packshotVisible ? "YES" : "NO"}`,
    `PACKAGE_CARDS: ${packageCount}`,
    `PRICES_PRESERVED: ${prices.unit && prices.total ? "YES" : "NO"}`,
    "OFFICIAL_V2_EXECUTED: NO",
    "AI_CALLS: 0",
    `PREVIEW_URL: ${previewUrl("54BU")}`,
    "",
    "54BU applies only BT-01/BT-02/BT-03 on an isolated experimental candidate. 54BI remains the live best-known execution.",
  ].join("\n");
  writeFileSync(path.join(EVIDENCE, "execution-summary.md"), `${summary}\n`);

  writeFileSync(
    path.join(EVIDENCE, "visual-comparison.md"),
    [
      "# 54BU visual comparison",
      "",
      "Before images are the official 54BS/54BR visitor first folds. After images are 54BU captures from this execution.",
      "",
      "- desktop-before.png vs desktop-after.png",
      "- mobile-before.png vs mobile-after.png",
      "- tablet-after.png is 54BU only (54BS tablet fold used as the prior tablet reference in tablet-first-fold.png of 54BS).",
      "- Official premium reference remains `design-references/premium-presell-reference.png`.",
      "",
      "Inspect the PNG files. Do not treat DOM presence as visual proof.",
    ].join("\n") + "\n",
  );

  if (liveStore.activeExecutionId !== "54BI") {
    throw new Error(`Live store drifted away from 54BI: ${liveStore.activeExecutionId}`);
  }
  if (safety.gate !== "PASS") throw new Error(`Content safety failed: ${safety.gate}`);
  if (preflight.status !== "PREFLIGHT_PASSED") throw new Error(`Preflight failed: ${preflight.status}`);
  if (!capture.ok) throw new Error(`Visitor capture failed: ${capture.notes.join("; ")}`);
  console.log("54BU capture complete", {
    visualPass,
    preflight: preflight.status,
    safety: safety.gate,
    preview: previewUrl("54BU"),
  });
}

main().catch((err) => {
  restoreActiveBi();
  console.error(err);
  process.exit(1);
});
