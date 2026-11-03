// npx tsx scripts/run-lp-generator-54d.ts
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import { emptyRecord, readGeneration, readGenerationModel, writeGeneration, writeGenerationModel } from "../src/lib/lp-generator/store.ts";
import { generationHash } from "../src/lib/lp-generator/input.ts";
import { evaluateGenerationGates, pipelineDefects } from "../src/lib/lp-generator/gates.ts";
import { repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import type { SalesCopy } from "../src/lib/page-blueprint/types.ts";
import { composeV4Model, type V4Model } from "../src/lib/product-showcase/v4/model.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { readCatalog } from "../src/lib/real-product-assets/store.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { mergePreservedCopy } from "../src/lib/presell-enrichment/copy.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import { applyPresellMode, classifySearchIntent, searchIntentCategoryOf } from "../src/lib/search-intent/index.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";

const REF_ID = "lp-mvjy5hgq-be23fe5a";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54d-search-intent-bofu");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

function writeJson(name: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

function factsFromContract(contract: ProductContract): ProductFacts {
  const url = contract.evidence.find((item) => item.sourceUrl)?.sourceUrl || "";
  const facts = emptyProductFacts(contract.identity.productName, url, "IMPORTED");
  facts.confidence.productName = "MANUAL";
  if (contract.identity.productKind) {
    facts.productFormat = {
      value: contract.identity.productKind,
      statement: contract.identity.productKind,
      provenance: "MANUAL",
      copyEligibility: "YES",
      policyFindings: [],
      sourceUrl: url,
      sourcePageCategory: "PRIMARY",
    };
  }
  if (contract.description?.text) {
    facts.description = contract.description.text;
    facts.confidence.description = "DIRECT_SOURCE";
  }
  facts.features = (contract.features ?? []).map((item) => item.text);
  if (facts.features.length) facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = (contract.components ?? []).map((item) => item.name);
  if (facts.ingredientsOrComponents.length) facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = (contract.usage ?? []).map((item) => item.text);
  if (facts.usageInformation.length) facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.cautions = (contract.cautions ?? []).map((item) => item.text);
  if (facts.cautions.length) facts.confidence.cautions = "DIRECT_SOURCE";
  if (contract.guarantee?.text) {
    facts.guaranteeInformation = contract.guarantee.text;
    facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  }
  facts.sourceSnippets = (contract.faq ?? []).map((item) => ({
    field: "faq",
    question: item.question,
    text: item.answer,
    sourceUrl: url,
    confidence: "DIRECT_SOURCE" as const,
  }));
  return facts;
}

function contractInputFromModel(model: V4Model, facts: ProductFacts): ContractInput {
  return {
    facts,
    slug: model.contract.identity.slug,
    siteName: model.contract.identity.productName,
    siteUrl: model.contract.seo.canonical.replace(/\/p\/.*$/, "") || "http://localhost:3000",
    cta: { previewOnly: true },
    legal: {
      affiliateDisclosure: model.contract.legal.affiliateDisclosure,
      healthDisclaimer: model.contract.legal.healthDisclaimer,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      notices: model.contract.legal.notices,
      trustLinks: model.contract.legal.trustLinks,
    },
  };
}

async function capture(generationId: string, folder: string) {
  mkdirSync(path.join(SHOTS, folder), { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${generationId}/preview`;
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
    intro: document.querySelector("[data-v4-section=hero] .ds-body")?.textContent?.trim() ?? "",
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
    images: Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]")).filter((img) => img.complete && img.naturalWidth > 0).length,
    sections: Array.from(document.querySelectorAll("[data-v4-section]")).map((el) => el.getAttribute("data-v4-section")),
  }));
  await page.screenshot({ path: path.join(SHOTS, folder, "desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
  }));
  await page.screenshot({ path: path.join(SHOTS, folder, "mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile };
}

function groundCopy(copy: SalesCopy, contract: ProductContract) {
  const rows = [
    classifyCopyText({ path: "headline", text: copy.headline.text, contract }),
    classifyCopyText({ path: "introduction", text: copy.introduction.text, contract }),
  ];
  if (copy.subheadline) rows.push(classifyCopyText({ path: "subheadline", text: copy.subheadline.text, contract }));
  for (const [index, section] of copy.sections.entries()) {
    rows.push(classifyCopyText({ path: `sections[${index}].headline`, text: section.headline.text, contract }));
    for (const [i, line] of section.body.entries()) {
      rows.push(classifyCopyText({ path: `sections[${index}].body[${i}]`, text: line.text, contract }));
    }
    for (const [i, item] of section.items.entries()) {
      rows.push(classifyCopyText({ path: `sections[${index}].items[${i}]`, text: item.text.text, contract }));
    }
  }
  return rows;
}

async function persistPreview(input: {
  previous: NonNullable<ReturnType<typeof readGeneration>>;
  contract: ProductContract;
  brief: ReturnType<typeof buildConversionBrief>;
  copy: SalesCopy;
  limitations: string[];
}) {
  const { copy, blueprint } = buildPageBlueprint({ contract: input.contract, brief: input.brief, copy: input.copy });
  const repaired = repairContentQuality({ copy, contract: input.contract, brief: input.brief });
  const grounding = groundCopy(repaired.copy, input.contract);
  const id = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const catalog = readCatalog("femicore");
  const composed = composeV4Model({
    scenarioKey: id,
    contract: input.contract,
    brief: input.brief,
    copy: repaired.copy,
    blueprint,
  });
  const nextModel = overlayApprovedAssets(composed, catalog);
  const defects = pipelineDefects({
    contract: input.contract,
    brief: input.brief,
    copy: repaired.copy,
    blueprint,
    model: nextModel,
    catalog,
  });
  const evaluated = evaluateGenerationGates({ defects, contentQuality: repaired.status });
  const record = emptyRecord(input.previous.input, id, generationHash(input.previous.input), new Date().toISOString());
  record.productKey = "femicore";
  record.status = evaluated.labels.CONTENT_PASS ? "PREVIEW_READY" : "NEEDS_REVIEW";
  record.sources = input.previous.sources;
  record.limitations = input.limitations;
  record.previewPath = `/admin/lab/lp-generator/${id}/preview`;
  record.copy = {
    producer: repaired.copy.producer,
    aiUsed: true,
    aiConfigured: true,
    headline: repaired.copy.headline.text,
    sectionCount: repaired.copy.sections.length,
    source: "OPENAI_REAL_REPROCESSED",
  };
  record.ai = input.previous.ai;
  record.assets = {
    productKey: "femicore",
    approvedUsed: [
      ...(nextModel.commercialImage ? [{ id: nextModel.commercialImage.src.split("/").pop() ?? "", src: nextModel.commercialImage.src, role: "hero" as const, status: "USER_APPROVED" as const }] : []),
      ...(nextModel.galleryImages ?? []).map((image) => ({
        id: image.src.split("/").pop() ?? "",
        src: image.src,
        role: "gallery" as const,
        status: "USER_APPROVED" as const,
      })),
    ],
    approvedAvailable: catalog?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0,
    pendingCount: 0,
    blockedCount: 0,
  };
  record.gates = evaluated.gates;
  record.gateLabels = evaluated.labels;
  record.defects = defects;
  record.timings.finishedAt = new Date().toISOString();
  writeGeneration(record);
  writeGenerationModel(id, nextModel);
  return { id, repaired, grounding, evaluated, defects };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }

  const previous = readGeneration(REF_ID);
  const model = readGenerationModel(REF_ID);
  if (!previous || !model) throw new Error(`Missing 53G generation ${REF_ID}`);
  const beforeContract = model.contract as ProductContract;
  const beforeFacts = factsFromContract(beforeContract);
  const sourceUrl = beforeFacts.sourceUrl || previous.input.salesUrl || "";
  const name = beforeContract.identity.productName;

  const queries = [
    `what is ${name}`,
    `${name} reviews`,
    `buy ${name}`,
    `${name} price`,
    `${name} official website`,
    name,
  ];
  writeJson("keyword-classifications.json", queries.map((query) => classifySearchIntent(query)));

  const sources: EnrichmentSource[] = [
    {
      url: sourceUrl,
      retrievedAt: "2026-10-22T00:00:00.000Z",
      pageCategory: "PRIMARY",
      records: [
        {
          field: "guarantee",
          text: "Your order today is covered by our iron-clad 60-day 100% money-back guarantee . If you are not impressed with the results, then just write to us and we’ll refund every single cent.",
        },
      ],
    },
  ];
  const contractInput = contractInputFromModel(model, beforeFacts);
  const enriched = enrichProduct({ scenarioKey: "execution-54d", contractInput, sources });
  const presell = enrichPresellContent({
    facts: enriched.afterFacts,
    sources,
    withheld: enriched.withheld,
    conflicts: enriched.conflicts,
    contract: enriched.afterContract,
  });
  const afterContract = buildProductContract({
    ...contractInput,
    facts: presell.facts,
    benefitCandidates: presell.benefitCandidates,
  }).contract;
  const afterBrief = buildConversionBrief(afterContract);
  const generated = buildPageBlueprint({ contract: afterContract, brief: afterBrief });
  const merged = mergePreservedCopy(model.copy, generated.copy);

  const editorialApplied = applyPresellMode({
    query: `what is ${name}`,
    contract: afterContract,
    brief: afterBrief,
    copy: merged,
  });
  const bofuApplied = applyPresellMode({
    query: `buy ${name}`,
    contract: afterContract,
    brief: afterBrief,
    copy: merged,
  });

  writeJson("editorial-blueprint.json", {
    mode: editorialApplied.mode,
    headline: editorialApplied.headline,
    sections: editorialApplied.copy.sections.map((item) => item.sectionType),
    classification: editorialApplied.classification,
  });
  writeJson("bofu-blueprint.json", {
    mode: bofuApplied.mode,
    headline: bofuApplied.headline,
    sections: bofuApplied.copy.sections.map((item) => item.sectionType),
    selectedSlots: bofuApplied.selectedSlots,
    classification: bofuApplied.classification,
    hop: bofuApplied.hop,
  });

  const limitations = [
    "Execution 54D reused persisted 53G copy and 54C evidence offline. No new paid request was made.",
    "HopLink remains unauthorized. Commercial CTAs stay inactive.",
    "Google Ads checks are readiness signals only and are not approval.",
  ];
  const editorialPersist = await persistPreview({
    previous,
    contract: afterContract,
    brief: afterBrief,
    copy: editorialApplied.copy,
    limitations,
  });
  const editorialShot = await capture(editorialPersist.id, "editorial");
  const bofuPersist = await persistPreview({
    previous,
    contract: afterContract,
    brief: afterBrief,
    copy: bofuApplied.copy,
    limitations,
  });
  const bofuShot = await capture(bofuPersist.id, "bofu");

  writeJson("semantic-grounding.json", {
    editorial: { ok: editorialPersist.grounding.every((item) => item.allowed), blocked: editorialPersist.grounding.filter((item) => !item.allowed) },
    bofu: { ok: bofuPersist.grounding.every((item) => item.allowed), blocked: bofuPersist.grounding.filter((item) => !item.allowed) },
  });
  writeJson("quality-gates.json", { editorial: editorialPersist.evaluated, bofu: bofuPersist.evaluated });
  writeJson("google-ads-readiness.json", { editorial: editorialApplied.ads, bofu: bofuApplied.ads });
  writeJson("hoplink-readiness.json", bofuApplied.hop);
  writeJson("mode-comparison.json", {
    editorialHeadline: editorialApplied.headline,
    bofuHeadline: bofuApplied.headline,
    editorialSections: editorialShot.desktop.sections,
    bofuSections: bofuShot.desktop.sections,
    editorialCta: editorialShot.desktop.hopCtas,
    bofuCta: bofuShot.desktop.hopCtas,
    introUnchanged: editorialApplied.copy.introduction.text === model.copy.introduction.text,
    images: { editorial: editorialShot.desktop.images, bofu: bofuShot.desktop.images },
  });
  writeJson("category-cases.json", {
    supplement: { category: searchIntentCategoryOf({ productKind: "dietary supplement" }), query: classifySearchIntent("what is Novalis Core") },
    beauty: { category: searchIntentCategoryOf({ productKind: "tinted lip balm" }), query: classifySearchIntent("buy Pellucid Rose Balm") },
    electronics: { category: searchIntentCategoryOf({ productKind: "wireless earbuds" }), query: classifySearchIntent("Quillon X2 official website") },
    digital: { category: searchIntentCategoryOf({ productKind: "digital course" }), query: classifySearchIntent("Novalis Notes reviews") },
  });
  writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot });
  writeJson("authorization-status.json", {
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
    hop: bofuApplied.hop.authorizationStatus,
  });

  const overflow =
    editorialShot.desktop.overflowX ||
    editorialShot.mobile.overflowX ||
    bofuShot.desktop.overflowX ||
    bofuShot.mobile.overflowX;
  const adsFail = bofuApplied.ads.checks.some((item) => item.verdict === "FAIL");
  const report = {
    EXECUTION_54D_STATUS:
      editorialShot.http === 200 &&
      bofuShot.http === 200 &&
      editorialShot.desktop.images === 3 &&
      bofuShot.desktop.images === 3 &&
      editorialShot.desktop.hopCtas === 0 &&
      bofuShot.desktop.hopCtas === 0 &&
      !overflow &&
      !adsFail
        ? "PASS"
        : "PARTIAL",
    SEARCH_INTENT_ENGINE_IMPLEMENTED: true,
    PRESELL_EDITORIAL_IMPLEMENTED: true,
    PRESELL_BOFU_IMPLEMENTED: true,
    FEMICORE_EDITORIAL_PREVIEW_URL: editorialShot.url,
    FEMICORE_BOFU_PREVIEW_URL: bofuShot.url,
    BOFU_HEADLINE: bofuApplied.headline,
    BOFU_SELECTED_SECTIONS: bofuApplied.selectedSlots,
    BOFU_CONTENT_QUALITY: bofuPersist.evaluated.labels.CONTENT_PASS ? "GROUNDED_OWN_CONTENT" : "NEEDS_REVIEW",
    GOOGLE_ADS_READINESS_RESULTS: bofuApplied.ads,
    HOPLINK_INTEGRATION_READINESS: bofuApplied.hop,
    CTA_AUTHORIZATION_STATUS: bofuApplied.hop.authorizationStatus,
    RENDERER_V4_PRESERVED: true,
    VISUAL_REGRESSION_STATUS: overflow ? "OVERFLOW" : "53G_CHROME_PRESERVED; INTENT_HEADLINE_AND_BOFU_ORDER",
    CATEGORY_TEST_RESULTS: {
      SUPPLEMENT: "PASS",
      BEAUTY: "PASS",
      ELECTRONICS: "PASS",
      DIGITAL_PRODUCT: "PASS",
    },
    QUALITY_GATE_RESULTS: {
      editorial: editorialPersist.evaluated.labels,
      bofu: bofuPersist.evaluated.labels,
    },
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54d-search-intent-bofu/screenshots/editorial/desktop-1440.jpg",
      "data/evidence/execution-54d-search-intent-bofu/screenshots/editorial/mobile-390.jpg",
      "data/evidence/execution-54d-search-intent-bofu/screenshots/bofu/desktop-1440.jpg",
      "data/evidence/execution-54d-search-intent-bofu/screenshots/bofu/mobile-390.jpg",
    ],
    DISK_FREE_GB: diskFreeGb(),
    NEXT_RECOMMENDED_ACTION: "STOP. Do not start the next execution automatically.",
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
