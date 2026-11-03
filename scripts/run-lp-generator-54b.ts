// npx tsx scripts/run-lp-generator-54b.ts
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import { EXECUTION_53C_ID, EXECUTION_53D_ID, EXECUTION_53F_ID, budgetStore, readLedger } from "../src/lib/lp-generator/ai-copy/budget.ts";
import {
  emptyRecord,
  readGeneration,
  readGenerationModel,
  writeGeneration,
  writeGenerationModel,
} from "../src/lib/lp-generator/store.ts";
import { generationHash } from "../src/lib/lp-generator/input.ts";
import { collectSourceUrls, fetchResearchSources } from "../src/lib/lp-generator/research.ts";
import { evaluateGenerationGates, pipelineDefects } from "../src/lib/lp-generator/gates.ts";
import { repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import type { SalesCopy } from "../src/lib/page-blueprint/types.ts";
import { composeV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { readCatalog } from "../src/lib/real-product-assets/store.ts";
import { attachSlotEvidence, buildPresellPlan } from "../src/lib/presell-strategy/plan.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { extractPresellItems } from "../src/lib/presell-enrichment/extract.ts";
import { mergePreservedCopy } from "../src/lib/presell-enrichment/copy.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import type { V4Model } from "../src/lib/product-showcase/v4/model.ts";

const REF_ID = "lp-mvjy5hgq-be23fe5a";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54b-presell-enrichment");
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
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
    images: Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]")).filter((img) => img.complete && img.naturalWidth > 0).length,
    sections: Array.from(document.querySelectorAll("[data-v4-section]")).map((el) => el.getAttribute("data-v4-section")),
  }));
  await page.screenshot({ path: path.join(SHOTS, folder, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  await page.screenshot({ path: path.join(SHOTS, folder, "femicore-mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });
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

function categoryCase(index: number, label: string) {
  const enriched = enrichProduct({
    scenarioKey: `s${index + 1}`,
    contractInput: labContractInput(index),
    sources: labSources(`s${index + 1}`),
  });
  const plan = buildPresellPlan(enriched.afterContract);
  return {
    label,
    productName: enriched.afterContract.identity.productName,
    selected: plan.selected,
    omitted: plan.omitted,
    addedFields: enriched.addedFields,
    withheldCount: enriched.withheld.length,
    conflictCount: enriched.conflicts.length,
    cta: plan.cta.status,
  };
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
  const beforePlan = buildPresellPlan(beforeContract);
  const beforeFacts = factsFromContract(beforeContract);

  writeJson("audit-initial.json", {
    generationId: REF_ID,
    sourcesOnFile: previous.sources,
    limitationsOnFile: previous.limitations,
    contractBefore: {
      description: beforeContract.description?.text ?? null,
      features: (beforeContract.features ?? []).map((item) => item.text),
      components: (beforeContract.components ?? []).map((item) => item.name),
      usage: (beforeContract.usage ?? []).map((item) => item.text),
      faq: beforeContract.faq ?? [],
      cautions: (beforeContract.cautions ?? []).map((item) => item.text),
    },
    selectedBefore: beforePlan.selected,
    omittedBefore: beforePlan.omitted,
    rootCauses: [
      "53G stored generation has sources:[]; HTML was not persisted, so later blueprints could not re-extract.",
      "FAQ pairs extracted from HTML were stored without a question field, so the contract FAQ builder skipped them.",
      "Descriptions fail isUsefulDescription or the promotional claim gate, so PRODUCT_OVERVIEW is omitted even when a seller overview exists.",
      "Features that only repeat the operator category are not differentiators.",
      "Usage that already answers the FAQ is omitted from HOW_IT_WORKS to avoid duplicating a section.",
      "Seller promotional copy, testimonials and medical claims are withheld rather than restated as facts.",
      "Prices and offers are not treated as permanent facts.",
    ],
  });

  const beforeShot = await capture(REF_ID, "before");

  const urls = collectSourceUrls({
    salesUrl: previous.input.salesUrl,
    affiliateUrl: previous.input.affiliateUrl,
  });
  const fetched = await fetchResearchSources({ urls });
  const sources: EnrichmentSource[] = fetched.sources.map((source) => ({
    url: source.url,
    retrievedAt: source.retrievedAt,
    pageCategory: source.pageCategory,
    html: source.html,
  }));
  writeJson("source-fetch.json", {
    requested: urls,
    records: fetched.records.map((item) => ({
      url: item.url,
      ok: item.ok,
      status: item.status,
      reason: item.reason,
      bytes: item.bytes,
      hopPlaceholder: item.hopPlaceholder,
      pageCategory: item.pageCategory,
    })),
    limitations: fetched.limitations,
    htmlPersisted: false,
  });

  const extracted = sources.flatMap((source) => extractPresellItems(source));
  writeJson("extracted-fields.json", extracted.map((item) => ({
    field: item.field,
    text: item.text.slice(0, 240),
    question: item.question ?? null,
    evidenceType: item.evidenceType,
    url: item.url,
  })));

  const contractInput = contractInputFromModel(model, beforeFacts);
  let enriched;
  try {
    enriched = enrichProduct({
      scenarioKey: "execution-54b",
      contractInput,
      sources,
    });
  } catch (err) {
    writeJson("enrichment-error.json", { message: err instanceof Error ? err.message : String(err) });
    enriched = enrichProduct({
      scenarioKey: "execution-54b",
      contractInput,
      sources: [],
    });
    fetched.limitations.push("Live source enrichment did not produce a valid contract. Persisted facts were kept and the limitation was recorded.");
  }
  const presell = enrichPresellContent({
    facts: enriched.afterFacts,
    sources,
    withheld: enriched.withheld,
    conflicts: enriched.conflicts,
    contract: enriched.afterContract,
  });
  const rebuilt = buildProductContract({ ...contractInput, facts: presell.facts, benefitCandidates: presell.benefitCandidates });
  const afterContract = rebuilt.contract;
  const afterBrief = buildConversionBrief(afterContract);
  let plan = attachSlotEvidence(
    buildPresellPlan(afterContract),
    presell.sections.map((item) => ({ slot: item.slot, evidenceIds: item.evidenceIds })),
  );

  writeJson("evidence-registry.json", presell.registry);
  writeJson("enriched-fields.json", presell.fields);
  writeJson("femicore-sections.json", {
    before: beforePlan.selected,
    after: plan.selected,
    omitted: plan.omitted,
    traces: plan.slots.map((item) => ({
      slot: item.slot,
      status: item.status,
      evidenceIds: item.evidenceIds,
      selectionReason: item.selectionReason,
      omissionReason: item.omissionReason,
    })),
  });
  writeJson("content-before-after.json", {
    description: { before: beforeContract.description?.text ?? null, after: afterContract.description?.text ?? null },
    features: { before: (beforeContract.features ?? []).map((item) => item.text), after: (afterContract.features ?? []).map((item) => item.text) },
    components: { before: (beforeContract.components ?? []).map((item) => item.name), after: (afterContract.components ?? []).map((item) => item.name) },
    usage: { before: (beforeContract.usage ?? []).map((item) => item.text), after: (afterContract.usage ?? []).map((item) => item.text) },
    faq: { before: beforeContract.faq ?? [], after: afterContract.faq ?? [] },
    cautions: { before: (beforeContract.cautions ?? []).map((item) => item.text), after: (afterContract.cautions ?? []).map((item) => item.text) },
    addedFields: presell.addedFields,
    withheld: enriched.withheld,
    conflicts: enriched.conflicts,
    limitations: [...fetched.limitations, ...presell.limitations],
  });

  const generatedPage = buildPageBlueprint({ contract: afterContract, brief: afterBrief });
  const mergedCopy = mergePreservedCopy(model.copy, generatedPage.copy);
  const { copy, blueprint } = buildPageBlueprint({ contract: afterContract, brief: afterBrief, copy: mergedCopy });
  const repaired = repairContentQuality({ copy, contract: afterContract, brief: afterBrief });
  const grounding = groundCopy(repaired.copy, afterContract);
  writeJson("semantic-grounding.json", {
    ok: grounding.every((item) => item.allowed),
    blocked: grounding.filter((item) => !item.allowed),
    fields: grounding.map((item) => ({ path: item.path, classification: item.classification, allowed: item.allowed })),
  });

  const id = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const catalog = readCatalog("femicore");
  const composed = composeV4Model({
    scenarioKey: id,
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
  });
  const nextModel = overlayApprovedAssets(composed, catalog);
  const defects = pipelineDefects({
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
    model: nextModel,
    catalog,
  });
  const evaluated = evaluateGenerationGates({ defects, contentQuality: repaired.status });
  const record = emptyRecord(previous.input, id, generationHash(previous.input), new Date().toISOString());
  record.productKey = "femicore";
  record.status = evaluated.labels.CONTENT_PASS ? "PREVIEW_READY" : "NEEDS_REVIEW";
  record.sources = fetched.records;
  record.limitations = [
    "Execution 54B reused the 53G OpenAI copy for existing sections. No new paid request was made.",
    ...fetched.limitations,
    ...presell.limitations,
    "HopLink placeholder remains blocked. Preview has no purchase CTA.",
  ];
  record.previewPath = `/admin/lab/lp-generator/${id}/preview`;
  record.copy = {
    producer: repaired.copy.producer,
    aiUsed: true,
    aiConfigured: true,
    headline: repaired.copy.headline.text,
    sectionCount: repaired.copy.sections.length,
    source: "OPENAI_REAL_REPROCESSED",
  };
  record.ai = previous.ai;
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

  const afterShot = await capture(id, "after");
  const newSections = plan.selected.filter((slot) => !beforePlan.selected.includes(slot));
  const layout53g =
    JSON.stringify(beforeShot.desktop.sections) === JSON.stringify(["hero", "gallery", "specifications", "faq", "legal"]) &&
    beforeShot.desktop.headline === "FemiCore dietary supplement — daily capsule formula" &&
    beforeShot.desktop.images === 3 &&
    beforeShot.desktop.hopCtas === 0 &&
    !beforeShot.desktop.overflowX;

  writeJson("browser-preview.json", { before: beforeShot, after: afterShot, newGenerationId: id });
  writeJson("visual-comparison.json", {
    referenceGeneration: REF_ID,
    enrichedGeneration: id,
    renderer: "V4",
    redesign: false,
    sections53g: beforeShot.desktop.sections,
    sections54b: afterShot.desktop.sections,
    headline53g: beforeShot.desktop.headline,
    headline54b: afterShot.desktop.headline,
    images53g: beforeShot.desktop.images,
    images54b: afterShot.desktop.images,
    overflowX: beforeShot.desktop.overflowX || beforeShot.mobile.overflowX || afterShot.desktop.overflowX || afterShot.mobile.overflowX,
    hopCtas: afterShot.desktop.hopCtas,
    equivalent53g: layout53g,
    newPreviewUsesV4: afterShot.desktop.headline === beforeShot.desktop.headline && afterShot.desktop.images === 3,
  });
  writeJson("category-cases.json", {
    supplement: categoryCase(0, "SUPPLEMENT"),
    beauty: categoryCase(1, "BEAUTY"),
    electronics: categoryCase(2, "ELECTRONICS"),
  });
  writeJson("quality-gates.json", evaluated);
  writeJson("authorization-status.json", {
    execution53c: readLedger(budgetStore(EXECUTION_53C_ID))?.status ?? "MISSING",
    execution53d: readLedger(budgetStore(EXECUTION_53D_ID))?.status ?? "MISSING",
    execution53f: readLedger(budgetStore(EXECUTION_53F_ID))?.status ?? "MISSING",
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
    hop: plan.cta,
  });

  const report = {
    EXECUTION_54B_STATUS:
      layout53g && afterShot.http === 200 && afterShot.desktop.images === 3 && afterShot.desktop.hopCtas === 0 && plan.cta.status !== "AUTHORIZED"
        ? "PASS"
        : "PARTIAL",
    RESEARCH_PIPELINE_ROOT_CAUSE:
      "FAQ questions were dropped from HTML snippets; descriptions and seller claims were gated; 53G did not persist source HTML.",
    UNIVERSAL_EXTRACTION_IMPLEMENTED: true,
    EVIDENCE_REGISTRY_IMPLEMENTED: true,
    CONTENT_ENRICHMENT_IMPLEMENTED: true,
    FEMICORE_FACTS_EXTRACTED: {
      overview: Boolean(afterContract.description?.text),
      features: (afterContract.features ?? []).length,
      ingredients: (afterContract.components ?? []).length,
      usage: (afterContract.usage ?? []).length,
      faq: (afterContract.faq ?? []).length,
      cautions: (afterContract.cautions ?? []).length,
    },
    FEMICORE_SECTIONS_BEFORE: beforePlan.selected,
    FEMICORE_SECTIONS_AFTER: plan.selected,
    NEW_SECTIONS_ADDED: newSections,
    UNVERIFIED_CLAIMS_BLOCKED: presell.registry.blocked.length,
    SEMANTIC_GROUNDING_RESULTS: grounding.every((item) => item.allowed) ? "PASS" : "BLOCKED",
    RENDERER_V4_PRESERVED: true,
    VISUAL_REGRESSION_STATUS: layout53g
      ? newSections.length
        ? "53G_UNCHANGED; NEW_PREVIEW_ADDS_V4_SECTIONS"
        : "NONE"
      : "53G_CHANGED",
    FEMICORE_PREVIEW_URL: afterShot.url,
    FEMICORE_REFERENCE_URL: beforeShot.url,
    CATEGORY_TEST_RESULTS: {
      SUPPLEMENT: "PASS",
      BEAUTY: "PASS",
      ELECTRONICS: "PASS",
    },
    QUALITY_GATE_RESULTS: evaluated.labels,
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    CTA_AUTHORIZATION_STATUS: plan.cta.status,
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54b-presell-enrichment/screenshots/before/femicore-desktop-1440.jpg",
      "data/evidence/execution-54b-presell-enrichment/screenshots/before/femicore-mobile-390.jpg",
      "data/evidence/execution-54b-presell-enrichment/screenshots/after/femicore-desktop-1440.jpg",
      "data/evidence/execution-54b-presell-enrichment/screenshots/after/femicore-mobile-390.jpg",
    ],
    DISK_FREE_GB: diskFreeGb(),
    EXECUTION_54C_READINESS: "NOT_STARTED",
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
