import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import {
  MAX_DESIGN_ITERATIONS,
  PAID_AI_BUDGET_USD,
  PREMIUM_ENGINE_ID,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
} from "../src/lib/presell-quality/premium-design.ts";
import { premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";
import {
  criticalVisualDefects,
  evaluateVisualGate,
  markupHasForbiddenChrome,
  type ViewportInspect,
  type VisualEvaluation,
} from "../src/lib/presell-quality/visual-gate.ts";
import { EXECUTION_54AU_BUDGET } from "../src/lib/presell-quality/budget.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = process.env.AIA_54AU_GENERATION_ID?.trim() || "lp-mvs7mja3-0d690e7c";
const BASE = "http://127.0.0.1:3000";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54au-premium-design");
const VIEWPORTS = [
  { name: "desktop" as const, width: 1440, height: 900 },
  { name: "tablet" as const, width: 768, height: 1024 },
  { name: "mobile" as const, width: 390, height: 844 },
];

function writeJson(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(file: string): string | null {
  if (!existsSync(file)) return null;
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function inspect(url: string, width: number, height: number, shot: string): Promise<ViewportInspect> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
    await page.waitForFunction(() => {
      const img = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      return !img || (img.complete && img.naturalWidth > 0);
    }, { timeout: 15_000 }).catch(() => undefined);
    await page.evaluate(() => {
      document.querySelectorAll("details").forEach((item) => item.setAttribute("open", ""));
    });
    const report = await page.evaluate(() => {
      const root = document.querySelector("[data-v4='page']");
      const heroImg = document.querySelector("[data-v4-image='commercial']") as HTMLImageElement | null;
      const images = [...document.querySelectorAll("img")] as HTMLImageElement[];
      const preview = document.querySelector('[data-v4-cta="preview-disabled"]');
      const text = `${document.body.innerText} ${document.body.textContent ?? ""}`;
      return {
        rendered: Boolean(root),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroLoaded: Boolean(heroImg && heroImg.complete && heroImg.naturalWidth > 0),
        brokenImages: images.filter((img) => img.complete && img.naturalWidth === 0).length,
        liveHop: Boolean(document.querySelector('[data-v4-track="official_offer_click"]')),
        previewCta: Boolean(preview),
        previewCtaEnabled: Boolean(preview && preview.tagName === "A" && preview.getAttribute("href")),
        packshotSrc: heroImg?.getAttribute("src") ?? null,
        hasIngredients: Boolean(document.querySelector('[data-premium="ingredients"]')),
        hasGuarantee: Boolean(document.querySelector('[data-premium="guarantee"]')),
        hasShipping: /5 to 10 days|24 working hours/i.test(text),
        hasFaq: Boolean(document.querySelector('[data-premium="faq"]')),
        hasFooter: Boolean(document.querySelector(".ds-footer")),
        forbiddenChrome: /fda[- ]approved|gmp certified|verified buyer|★★|free shipping/i.test(text),
      };
    });
    await page.screenshot({ path: shot, fullPage: true });
    await page.close();
    return { width, height, consoleErrors: errors.slice(0, 5), ...report };
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  if (EXECUTION_54AU_BUDGET.maxUsd !== 0 || PAID_AI_BUDGET_USD !== 0) {
    throw new Error("54AU paid AI budget must remain 0.");
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
  const slots = premiumSlotsFromModel(model);
  const markup = renderToStaticMarkup(createElement(V4Page, { model }));
  const salesUrl = currentSalesUrl(readCampaignSources(CAMPAIGN_ID)) || "";
  const enriched = enrichApprovedFactsForGeneration({
    run: snap.latest,
    productName: snap.latest?.productName || "Product",
    sourceUrl: salesUrl,
  });
  const manifest = buildContentManifest({
    campaignId: CAMPAIGN_ID,
    run: snap.latest,
    integrity,
    generation: enriched,
  });
  const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
  const packshot = selectApprovedPackshot({ assets: snap.latest?.discoveredAssets, declaration });
  const safety = evaluateContentSafety({
    model,
    markup,
    manifest,
    packshotAssetId: packshot?.assetId ?? null,
    usedAssetIds: packshot?.assetId ? [packshot.assetId] : [],
    botanicalAssetIds: botanicalAssetIds({ assets: snap.latest?.discoveredAssets, declaration }),
  });

  const referenceCandidates = [
    path.join(process.cwd(), "data", "evidence", "execution-54au-premium-design", "owner-premium-reference.png"),
    path.join(process.cwd(), "data", "evidence", "execution-54au-premium-design", "owner-premium-reference.jpg"),
  ];
  const referencePath = referenceCandidates.find((file) => existsSync(file)) ?? null;
  writeJson(path.join(EVIDENCE, "design-reference-manifest.json"), {
    id: "owner-premium-reference",
    available: Boolean(referencePath),
    path: referencePath,
    dimensions: null,
    hash: referencePath ? sha256File(referencePath) : null,
    visualTraits: [
      "High-impact commercial hero",
      "Large well-placed packshot",
      "Professional typography and hierarchy",
      "Highlighted CTAs",
      "Informational cards and consistent icons",
      "Visual ingredients, guarantee, shipping, FAQ, footer",
    ],
    comparisonCriteria: [
      "Do not copy fictional testimonials, FDA/GMP seals, invented discounts, or medical promises.",
      "Preserve composition while substituting eligible contract facts.",
    ],
    reason: referencePath ? null : "No owner-approved reference image was attached to this execution or present in the evidence directory.",
  });
  writeJson(path.join(EVIDENCE, "design-system.json"), {
    engineId: PREMIUM_ENGINE_ID,
    displayTheme: "forest",
    ctaLabel: slots.cta.label,
    ctaEnabled: slots.cta.enabled,
    tokens: ["--ds-cta", "--ds-accent", "--ds-shadow-md"],
    maxIterations: MAX_DESIGN_ITERATIONS,
  });

  const previewUrl = `${BASE}/admin/lab/lp-generator/${GENERATION_ID}/preview`;
  const views: Record<string, ViewportInspect> = {};
  for (const viewport of VIEWPORTS) {
    const shot = path.join(EVIDENCE, `${viewport.name}-screenshot.png`);
    views[viewport.name] = await inspect(previewUrl, viewport.width, viewport.height, shot);
  }

  const defects = criticalVisualDefects({
    desktop: views.desktop!,
    tablet: views.tablet!,
    mobile: views.mobile!,
  });
  const visual: VisualEvaluation = {
    scores: {
      HERO_FIRST_IMPRESSION: 0,
      COMPOSITION_HIERARCHY: 0,
      TYPOGRAPHY_LEGIBILITY: 0,
      CARDS_COMPONENTS: 0,
      IMAGE_USE: 0,
      CTA_EMPHASIS: 0,
      MOBILE: 0,
    },
    rationales: {
      HERO_FIRST_IMPRESSION: "Pending screenshot review in this execution.",
      COMPOSITION_HIERARCHY: "Pending screenshot review in this execution.",
      TYPOGRAPHY_LEGIBILITY: "Pending screenshot review in this execution.",
      CARDS_COMPONENTS: "Pending screenshot review in this execution.",
      IMAGE_USE: "Pending screenshot review in this execution.",
      CTA_EMPHASIS: "Pending screenshot review in this execution.",
      MOBILE: "Pending screenshot review in this execution.",
    },
    overall: 0,
    criticalDefects: defects,
    noCriticalVisualDefects: defects.length === 0,
    target: VISUAL_SCORE_TARGET,
    source: "NOT_EXECUTED",
    comparedToReference: Boolean(referencePath),
  };
  writeJson(path.join(EVIDENCE, "visual-evaluation.json"), visual);
  writeJson(path.join(EVIDENCE, "quality-evaluation.json"), {
    note: "54AU paid budget is 0. Existing 54AT multimodal scores are carried forward and not replaced.",
    generationId: GENERATION_ID,
    scores: [81, 83],
    officialScore: 82,
    qualityTarget: QUALITY_SCORE_TARGET,
    qualityTargetReached: false,
    evaluatorStability: "STABLE",
    paidAiCalls: 0,
  });
  writeJson(path.join(EVIDENCE, "content-safety.json"), {
    ...safety,
    forbiddenChrome: markupHasForbiddenChrome(markup),
  });
  writeJson(path.join(EVIDENCE, "iteration-history.json"), {
    max: MAX_DESIGN_ITERATIONS,
    iterations: [
      {
        id: 1,
        change: "Introduce reusable premium engine, forest display theme, orange preview CTA, ingredient/shipping/guarantee/FAQ components.",
        paidAi: false,
      },
      {
        id: 2,
        change: "Disable sandbox hop on lab preview, group fulfillment cards by kind, drop placeholder ingredient captions.",
        paidAi: false,
      },
      {
        id: 3,
        change: "Drop leftover trust bullets already restated in fulfillment cards.",
        paidAi: false,
      },
    ],
  });
  const gate = evaluateVisualGate({
    visual,
    qualityScore: 82,
    qualityTargetReached: false,
    contentSafetyPass: safety.gate === "PASS",
    desktopPass: views.desktop?.rendered === true && views.desktop.overflowX === false,
    tabletPass: views.tablet?.rendered === true && views.tablet.overflowX === false,
    mobilePass: views.mobile?.rendered === true && views.mobile.overflowX === false,
  });
  writeJson(path.join(EVIDENCE, "capture-inspect.json"), views);
  writeFileSync(
    path.join(EVIDENCE, "execution-summary.md"),
    [
      "# EXECUTION 54AU — premium design engine",
      "",
      `- Generation: ${GENERATION_ID}`,
      `- Preview: ${previewUrl}`,
      `- Engine: ${PREMIUM_ENGINE_ID}`,
      `- Content safety: ${safety.gate}`,
      `- Visual gate: ${gate.visualQualityGate}`,
      `- Paid AI: 0`,
      `- Reference image available: ${Boolean(referencePath)}`,
      "",
      gate.blockers.map((item) => `- ${item}`).join("\n"),
      "",
    ].join("\n"),
  );
  for (const viewport of VIEWPORTS) {
    const src = path.join(EVIDENCE, `${viewport.name}-screenshot.png`);
    if (existsSync(src)) copyFileSync(src, src);
  }
  console.log(JSON.stringify({ previewUrl, gate, defects, views: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, { overflowX: v.overflowX, heroLoaded: v.heroLoaded, previewCta: v.previewCta, liveHop: v.liveHop }])) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
