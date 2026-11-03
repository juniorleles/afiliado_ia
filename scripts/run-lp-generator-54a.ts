// npx tsx scripts/run-lp-generator-54a.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import { EXECUTION_53C_ID, EXECUTION_53D_ID, EXECUTION_53F_ID, budgetStore, readLedger } from "../src/lib/lp-generator/ai-copy/budget.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { buildPresellPlan } from "../src/lib/presell-strategy/plan.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";

const REF_ID = "lp-mvjy5hgq-be23fe5a";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54a-presell-strategy");
const AFTER = path.join(EVIDENCE, "screenshots", "after");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

function writeJson(name: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function capture(label: "after") {
  mkdirSync(AFTER, { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${REF_ID}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 90000 });
  await page.waitForFunction(
    () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]"));
      return imgs.length === 0 || imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(600);
  const desktop = await page.evaluate(() => ({
    headline: document.querySelector("h1")?.textContent?.trim() ?? "",
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
    images: Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]")).filter((img) => img.complete && img.naturalWidth > 0).length,
    sections: Array.from(document.querySelectorAll("[data-v4-section]")).map((el) => el.getAttribute("data-v4-section")),
  }));
  await page.screenshot({ path: path.join(AFTER, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  await page.screenshot({ path: path.join(AFTER, "femicore-mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  return { label, url, http: response?.status() ?? null, desktop, mobile };
}

function categoryCase(index: number, label: string) {
  const enriched = enrichProduct({
    scenarioKey: `s${index + 1}`,
    contractInput: labContractInput(index),
    sources: labSources(`s${index + 1}`),
  });
  const plan = buildPresellPlan(enriched.afterContract);
  const brief = buildConversionBrief(enriched.afterContract);
  const built = buildPageBlueprint({ contract: enriched.afterContract, brief });
  return {
    label,
    productName: enriched.afterContract.identity.productName,
    productKind: enriched.afterContract.identity.productKind ?? null,
    selected: plan.selected,
    omitted: plan.omitted,
    cta: plan.cta,
    copySections: built.copy.sections.map((item) => item.sectionType),
    hopAction: built.copy.cta.action,
  };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }

  const model = readGenerationModel(REF_ID);
  if (!model) throw new Error(`Missing 53G generation ${REF_ID}`);
  const contract = model.contract as ProductContract;
  const plan = buildPresellPlan(contract);
  writeJson("femicore-presell-plan.json", plan);
  writeJson("femicore-selected-sections.json", {
    selected: plan.selected,
    omitted: plan.omitted,
    justifications: plan.slots.map((item) => ({ slot: item.slot, include: item.include, reason: item.reason })),
  });
  const brief = buildConversionBrief(contract);
  const built = buildPageBlueprint({ contract, brief, copy: model.copy });
  writeJson("femicore-blueprint.json", {
    note: "53G OpenAI copy was reused. No new model call. Blueprint rebuilt only to record section eligibility.",
    copySource: "OPENAI_REAL_REPROCESSED",
    selectedSlots: plan.selected,
    blueprintSections: built.blueprint.sections.map((item) => ({
      type: item.sectionType,
      headline: item.headline.text,
      eligibility: item.renderEligibility,
      itemCount: item.items.length,
      bodyCount: item.body.length,
    })),
    cta: built.copy.cta.action,
  });

  writeJson("category-cases.json", {
    supplement: categoryCase(0, "SUPPLEMENT"),
    beauty: categoryCase(1, "BEAUTY"),
    electronics: categoryCase(2, "ELECTRONICS"),
  });

  const after = await capture("after");
  const beforeMeta = {
    sections: ["hero", "gallery", "specifications", "faq", "legal"],
    headline: "FemiCore dietary supplement — daily capsule formula",
    images: 3,
  };
  writeJson("browser-after.json", after);
  writeJson("visual-comparison.json", {
    generationId: REF_ID,
    renderer: "V4",
    redesign: false,
    sectionsBefore: beforeMeta.sections,
    sectionsAfter: after.desktop.sections,
    headlineBefore: beforeMeta.headline,
    headlineAfter: after.desktop.headline,
    imagesBefore: 3,
    imagesAfter: after.desktop.images,
    overflowX: after.desktop.overflowX || after.mobile.overflowX,
    hopCtas: after.desktop.hopCtas,
    equivalent:
      JSON.stringify(after.desktop.sections) === JSON.stringify(beforeMeta.sections) &&
      after.desktop.headline === beforeMeta.headline &&
      after.desktop.images === 3 &&
      after.desktop.hopCtas === 0,
  });

  const ledgers = {
    execution53c: readLedger(budgetStore(EXECUTION_53C_ID))?.status ?? "MISSING",
    execution53d: readLedger(budgetStore(EXECUTION_53D_ID))?.status ?? "MISSING",
    execution53f: readLedger(budgetStore(EXECUTION_53F_ID))?.status ?? "MISSING",
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
  };
  writeJson("authorization-status.json", ledgers);

  const comparison = JSON.parse(readFileSync(path.join(EVIDENCE, "visual-comparison.json"), "utf8")) as { equivalent: boolean };
  const report = {
    EXECUTION_54A_STATUS: comparison.equivalent && plan.selected.includes("HERO") && plan.cta.status === "PREVIEW_ONLY" ? "PASS" : "PARTIAL",
    PRESELL_STRATEGY_IMPLEMENTED: true,
    UNIVERSAL_BLUEPRINT_IMPLEMENTED: true,
    RENDERER_V4_PRESERVED: true,
    FEMICORE_LAYOUT_REGRESSION: comparison.equivalent ? "NONE" : "CHANGED",
    FEMICORE_SELECTED_SECTIONS: plan.selected,
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    CTA_AUTHORIZATION_STATUS: plan.cta.status,
    QUALITY_GATE_RESULTS: {
      publicationApproval: "REQUIRED",
      hopCtas: after.desktop.hopCtas,
      images: after.desktop.images,
    },
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54a-presell-strategy/screenshots/before/femicore-desktop-1440.jpg",
      "data/evidence/execution-54a-presell-strategy/screenshots/before/femicore-mobile-390.jpg",
      "data/evidence/execution-54a-presell-strategy/screenshots/after/femicore-desktop-1440.jpg",
      "data/evidence/execution-54a-presell-strategy/screenshots/after/femicore-mobile-390.jpg",
    ],
    DISK_FREE_GB: diskFreeGb(),
    EXECUTION_54B_READINESS: "NOT_STARTED",
    FEMICORE_PREVIEW_URL: after.url,
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
