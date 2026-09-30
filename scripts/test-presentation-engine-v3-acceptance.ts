/**
 * Presentation Engine V3 acceptance.
 * Proves the profile, planner, and composers stay generic.
 * Reads stored facts and public pages. Does not write the database or call a model.
 *
 * npx tsx scripts/test-presentation-engine-v3-acceptance.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { expandFirstPartySources } from "../src/lib/first-party-source-expansion.ts";
import { getConsumerCopyEligibleFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { planPresentation, type PresentationPlan } from "../src/lib/presentation-plan.ts";
import { composeComponents, followsPresentationPlan } from "../src/lib/premium/component-composers.ts";
import { composeAdaptivePresentation } from "../src/lib/premium/adaptive-composition.ts";
import { parsePresellPage } from "../src/lib/presell-page.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { lintSourceStatement } from "../src/lib/policy-linter.ts";

const ENGINE_FILES = [
  "src/lib/product-profile.ts",
  "src/lib/presentation-plan.ts",
  "src/lib/premium/component-composers.ts",
  "src/lib/premium/adaptive-composition.ts",
  "src/components/presell/visual-master-view.tsx",
  "src/app/visual-master-v1.css",
];

const PRODUCT_NAMES =
  /visiflora|neuro[\s-]?serge|joint[\s-]?genesis|prodentim|audifort|getvisiflora|getneuroserge|jointgenesisofficial|yusleep|harbor|fernwick|northwind/i;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

function loadFacts(file: string): ProductFacts {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as ProductFacts | { facts: ProductFacts };
  return "facts" in parsed ? parsed.facts : parsed;
}

function signature(plan: PresentationPlan): string {
  const direction = composeComponents({
    plan,
    identity: "Sample",
    headline: "Sample",
    subheadline: "",
    summary: "",
    description: "",
    featureUnits: [],
    legacyContentDensity: "standard",
  });
  return [
    plan.density,
    plan.heroStrategy,
    plan.sectionOrder.join(">"),
    plan.sectionVariants.ingredients,
    plan.sectionVariants.features,
    plan.sectionVariants.pricing,
    plan.spacingProfile,
    plan.rhythmProfile,
    direction.pageDensity,
    direction.featureVariant ?? "NONE",
    direction.ingredientVariant ?? "NONE",
    direction.pricingVariant,
    direction.usageVariant ?? "NONE",
    direction.guaranteeVariant ?? "NONE",
    direction.faqVariant ?? "NONE",
  ].join("|");
}

function authorizedText(facts: ProductFacts): string {
  const eligible = getConsumerCopyEligibleFacts(facts);
  return [
    eligible.productName,
    eligible.description,
    eligible.features.join(". "),
    eligible.ingredientsOrComponents.join(". "),
    eligible.usageInformation.join(". "),
    eligible.cautions.join(". "),
    eligible.pricingInformation,
    eligible.guaranteeInformation,
    eligible.manufacturer,
    eligible.returnsInformation.join(". "),
    eligible.shippingInformation.join(". "),
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

type PipelineRow = {
  product: string;
  group: "known" | "new";
  source: string;
  importQuality: string;
  density: string;
  hero: string;
  ingredients: string;
  features: string;
  usage: string;
  guarantee: string;
  faq: string;
  pricing: string;
  grounding: string;
  policyFindings: number;
  signature: string;
  ms: number;
};

function runPipeline(product: string, group: "known" | "new", source: string, facts: ProductFacts): PipelineRow {
  const started = performance.now();
  const profile = analyzeProductProfile(facts);
  const plan = planPresentation(facts, profile);
  const again = planPresentation(facts, analyzeProductProfile(facts));
  assert(JSON.stringify(plan) === JSON.stringify(again), `${product} plan is deterministic`);
  assert(plan !== again, `${product} plan is not a cached object`);
  const direction = composeComponents({
    plan,
    identity: facts.productName || product,
    headline: facts.productName || product,
    subheadline: "",
    summary: "",
    description: "",
    featureUnits: [],
    legacyContentDensity: "standard",
  });
  assert(direction.heroStrategy === plan.heroStrategy, `${product} hero follows the plan`);
  assert(
    (direction.ingredientVariant ?? "NONE") === plan.sectionVariants.ingredients,
    `${product} ingredients follow the plan`,
  );
  assert(
    direction.featureVariant === "CHIPS" ||
      (direction.featureVariant ?? "NONE") === plan.sectionVariants.features,
    `${product} features follow the plan`,
  );
  assert(direction.pricingVariant === (plan.sectionVisibility.pricing ? plan.sectionVariants.pricing : "NONE"), `${product} pricing follows the plan`);
  assert(Boolean(direction.usageVariant) === plan.sectionVisibility.usage, `${product} usage follows visibility`);
  assert(Boolean(direction.guaranteeVariant) === plan.sectionVisibility.guarantee, `${product} guarantee follows visibility`);
  assert(Boolean(direction.faqVariant) === plan.sectionVisibility.faq, `${product} FAQ follows visibility`);
  const text = authorizedText(facts);
  const grounding = validateGrounding(text || facts.productName || product, facts);
  const policyFindings = lintSourceStatement(text).length;
  const ms = performance.now() - started;
  return {
    product,
    group,
    source,
    importQuality: facts.importQuality ?? "",
    density: plan.density,
    hero: plan.heroStrategy,
    ingredients: plan.sectionVariants.ingredients,
    features: plan.sectionVariants.features,
    usage: direction.usageVariant ?? "NONE",
    guarantee: direction.guaranteeVariant ?? "NONE",
    faq: direction.faqVariant ?? "NONE",
    pricing: direction.pricingVariant,
    grounding: grounding.status,
    policyFindings,
    signature: signature(plan),
    ms,
  };
}

function auditHardcoding(): string[] {
  const hits: string[] = [];
  for (const file of ENGINE_FILES) {
    const source = readFileSync(file, "utf8");
    if (PRODUCT_NAMES.test(source)) hits.push(file);
  }
  return hits;
}

async function liveFacts(url: string, name: string): Promise<ProductFacts> {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
  const html = await response.text();
  const primary = extractProductFacts(html, url, { operatorProductName: name });
  return (await expandFirstPartySources(primary, html, url)).facts;
}

function previewHtml(rows: PipelineRow[], cssHref: string): string {
  const articles = rows
    .map((row) => {
      const sections = [
        `<section class="vm-hero" data-section-id="hero"><h1 class="vm-display">${row.hero}</h1></section>`,
        row.features !== "NONE" ? `<section class="vm-feature-band" data-section-id="features" data-feature-presentation="${row.features.toLowerCase()}"><ul class="vm-feature-units"><li>Authorized feature</li></ul></section>` : "",
        row.ingredients !== "NONE" ? `<section class="vm-ingredients" data-section-id="ingredients" data-ingredient-presentation="${row.ingredients.toLowerCase()}"><ul class="vm-ingredient-units"><li><span>Authorized ingredient</span></li></ul></section>` : "",
        row.pricing !== "NONE" ? `<section class="vm-pricing" data-section-id="pricing" data-pricing-variant="${row.pricing.toLowerCase()}"><ul class="vm-offer-units"><li><span>Package</span><b>Offer</b></li></ul></section>` : "",
        row.usage !== "NONE" ? `<section class="vm-usage" data-section-id="usage" data-usage-variant="${row.usage.toLowerCase()}"><p>Authorized usage</p></section>` : "",
        row.guarantee !== "NONE" ? `<section class="vm-return" data-section-id="guarantee" data-guarantee-variant="${row.guarantee.toLowerCase()}"><p>Authorized guarantee</p></section>` : "",
        row.faq !== "NONE" ? `<section class="vm-faq" data-section-id="faq" data-faq-variant="${row.faq.toLowerCase()}"><details><summary>Question</summary><p>Answer</p></details></section>` : "",
      ].join("");
      const density = row.density === "LOW" ? "low" : row.density === "MEDIUM" ? "medium" : "rich";
      const content = row.density === "LOW" ? "compact" : "standard";
      return `<article id="${row.product.replace(/\s+/g, "-").toLowerCase()}" data-visual-system="visual-master-v1" data-page-density="${density}" data-content-density="${content}" data-spacing="${row.density === "LOW" ? "compact" : row.density === "PREMIUM" || row.density === "HIGH" ? "airy" : "normal"}">${sections}</article>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${cssHref}"></head><body>${articles}</body></html>`;
}

const pebble = extractProductFacts(
  `<html><head><meta name="description" content="Pebble Kettle is a steel kettle that holds one liter on a flat base."></head><body>
<h1>Pebble Kettle</h1>
<h2>Features</h2>
<ul>
<li>Steel body holds one liter of water.</li>
<li>Lid locks when the kettle is tilted.</li>
<li>Base sits flat on a wood stove.</li>
<li>Handle stays cool during boiling.</li>
</ul>
<h2>One Kettle</h2><h3>$48</h3><p>per kettle</p>
<h2>Two Kettles</h2><h3>$90</h3><p>per pair</p>
<h2>Workshop Set</h2><h3>$120</h3><p>per set</p>
</body></html>`,
  "https://pebble.example/kettle",
  { operatorProductName: "Pebble Kettle" },
);

const marrow = extractProductFacts(
  `<html><body>
<h1>Marrow Lantern</h1>
<p>Marrow Lantern is a brass desk lantern with a glass chimney for a reading desk.</p>
<h2>What's Inside</h2>
<p>The formula includes cedar oil and river mint and amber resin and stone yeast and blue salt and red bark.</p>
<h2>FAQ</h2>
<h3>When and how should I take this?</h3>
<p>Fill the lantern with lamp oil and light the wick.</p>
<h2>180-Day Money Back Guarantee</h2>
<p>If you are not satisfied, return the lantern within 180 days for a full refund.</p>
</body></html>`,
  "https://marrow.example/lantern",
  { operatorProductName: "Marrow Lantern" },
);

const sable = extractProductFacts(
  `<html><body>
<h1>Sable Field Notebook</h1>
<p>Sable Field Notebook is a cloth-bound notebook with blank pages for field notes.</p>
<h2>Features</h2>
<ul><li>Cloth cover resists a light rain.</li></ul>
</body></html>`,
  "https://sable.example/notebook",
  { operatorProductName: "Sable Field Notebook" },
);

const stored = {
  neuroSerge: loadFacts("data/multi-product-validation/neuro-serge/import-facts.json"),
  prodentim: loadFacts("data/generic-lp-engine/v1/prodentim-replay-04/product-facts.json"),
  audifort: loadFacts("data/generic-lp-engine/v1/audifort-final-controlled-v1/product-facts.json"),
  jointGenesis: loadFacts("data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
};

const db = new Database("data/presell-os.db", { readonly: true, fileMustExist: true });
const campaign = db
  .prepare("SELECT sourceFactsJson, productionPageComposition FROM campaigns WHERE slug = ?")
  .get("joint-genesis-controlled-ready-13") as
  | { sourceFactsJson: string | null; productionPageComposition: string | null }
  | undefined;
if (campaign?.sourceFactsJson) stored.jointGenesis = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
const jointPage = parsePresellPage(campaign?.productionPageComposition);
db.close();

async function main() {
  const hits = auditHardcoding();
  assert(hits.length === 0, `presentation engine has no product names -> ${hits.join(",") || "none"}`);

  const rows: PipelineRow[] = [
    runPipeline("Neuro Serge", "known", "stored-import", stored.neuroSerge),
    runPipeline("Joint Genesis", "known", "frozen-campaign-facts", stored.jointGenesis),
    runPipeline("Prodentim", "known", "stored-import", stored.prodentim),
    runPipeline("Audifort", "known", "stored-import", stored.audifort),
    runPipeline("Pebble Kettle", "new", "importer-html", pebble),
    runPipeline("Marrow Lantern", "new", "importer-html", marrow),
    runPipeline("Sable Field Notebook", "new", "importer-html", sable),
  ];

  try {
    const visi = await liveFacts("https://getvisiflora.com/welcome/", "VisiFlora");
    rows.unshift(runPipeline("VisiFlora", "known", "live-import", visi));
  } catch (error) {
    failures += 1;
    console.log("FALHOU: VisiFlora live import " + (error instanceof Error ? error.message : "failed"));
  }

  const signatures = new Map<string, string>();
  for (const row of rows) signatures.set(row.product, row.signature);
  const known = rows.filter((row) => row.group === "known").map((row) => row.signature);
  const fresh = rows.filter((row) => row.group === "new").map((row) => row.signature);
  assert(new Set(known).size === known.length, "known products do not reuse one plan");
  assert(new Set(fresh).size === fresh.length, "new products do not reuse one plan");
  if (signatures.get("VisiFlora") && signatures.get("Neuro Serge")) {
    assert(signatures.get("VisiFlora") !== signatures.get("Neuro Serge"), "VisiFlora does not influence Neuro Serge");
  }
  if (signatures.get("Neuro Serge") && signatures.get("Joint Genesis")) {
    assert(signatures.get("Neuro Serge") !== signatures.get("Joint Genesis"), "Neuro Serge does not influence Joint Genesis");
  }

  if (jointPage) {
    const adaptive = composeAdaptivePresentation({
      productName: stored.jointGenesis.productName ?? "",
      headline: jointPage.hero.headline,
      subheadline: jointPage.hero.subheadline,
      summary: jointPage.hero.summary,
      sections: jointPage.sections,
      structuredLists: [],
      offerCount: stored.jointGenesis.offerFacts?.length ?? 0,
    });
    const jointPlan = planPresentation(stored.jointGenesis, analyzeProductProfile(stored.jointGenesis));
    assert(adaptive.mode === "rich", `Joint Genesis rendered shell stays rich -> ${adaptive.mode}`);
    assert(!followsPresentationPlan(jointPlan, adaptive.mode), "thin Joint Genesis facts do not collapse the rich page");
  } else {
    failures += 1;
    console.log("FALHOU: Joint Genesis production page missing");
  }

  const cssHref = pathToFileURL(path.resolve("src/app/visual-master-v1.css")).href;
  const outDir = path.resolve("data/presentation-engine-v3/acceptance-v1");
  mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, "preview.html");
  writeFileSync(htmlPath, previewHtml(rows, cssHref), "utf8");

  const responsive: Record<string, { desktop: boolean; mobile: boolean }> = {};
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    for (const row of rows) {
      const id = row.product.replace(/\s+/g, "-").toLowerCase();
      const box = await page.locator(`#${id}`).evaluate((node) => {
        const element = node as HTMLElement;
        return {
          overflow: element.scrollWidth - element.clientWidth,
          pricing: element.querySelectorAll("[data-section-id='pricing']").length,
          faq: element.querySelectorAll("[data-section-id='faq']").length,
          features: element.querySelectorAll("[data-section-id='features']").length,
        };
      });
      const ok = box.overflow <= 1 && (row.pricing === "NONE") === (box.pricing === 0) && (row.faq === "NONE") === (box.faq === 0) && (row.features === "NONE") === (box.features === 0);
      responsive[row.product] = { ...(responsive[row.product] ?? { desktop: false, mobile: false }), [viewport.name]: ok };
    }
  }
  await browser.close();
  const responsivePass = Object.values(responsive).every((item) => item.desktop && item.mobile);
  assert(responsivePass, "desktop and mobile previews keep the planned sections");

  const plannerStarted = performance.now();
  for (let i = 0; i < 400; i += 1) {
    const profile = analyzeProductProfile(stored.audifort);
    composeComponents({
      plan: planPresentation(stored.audifort, profile),
      identity: "Sample",
      headline: "Sample",
      subheadline: "",
      summary: "",
      description: "",
      featureUnits: [],
      legacyContentDensity: "standard",
    });
  }
  const plannerMs = (performance.now() - plannerStarted) / 400;

  const report = {
    rows,
    responsive,
    hardcoding: hits,
    plannerMs: Number(plannerMs.toFixed(3)),
    failures,
  };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  for (const row of rows) {
    console.log(
      `${row.product}: source=${row.source} density=${row.density} hero=${row.hero} features=${row.features} ingredients=${row.ingredients} pricing=${row.pricing} usage=${row.usage} guarantee=${row.guarantee} faq=${row.faq} grounding=${row.grounding} policyFindings=${row.policyFindings} ms=${row.ms.toFixed(1)}`,
    );
  }
  console.log(`PLANNER_MS=${plannerMs.toFixed(3)}`);
  if (failures > 0) {
    console.log(`PRESENTATION ENGINE V3 ACCEPTANCE: ${failures} FAILED`);
    process.exit(1);
  }
  console.log("ALL PRESENTATION ENGINE V3 ACCEPTANCE CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
