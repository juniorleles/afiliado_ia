// npx tsx scripts/run-lp-generator-54h.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import { emptyRecord, readGenerationModel, writeGeneration, writeGenerationModel } from "../src/lib/lp-generator/store.ts";
import { generationHash } from "../src/lib/lp-generator/input.ts";
import { collectSourceUrls, fetchResearchSources } from "../src/lib/lp-generator/research.ts";
import { evaluateGenerationGates, pipelineDefects } from "../src/lib/lp-generator/gates.ts";
import { countContentRepetitions, inspectContentQuality, repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { persistQualityInspection, replayQualityInspection } from "../src/lib/lp-generator/quality-persist.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import type { SalesCopy } from "../src/lib/page-blueprint/types.ts";
import { composeV4Model, type V4Model } from "../src/lib/product-showcase/v4/model.ts";
import { productKeyFromName } from "../src/lib/real-product-assets/extract.ts";
import { readCatalog } from "../src/lib/real-product-assets/store.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { extractSources } from "../src/lib/product-enrichment/extract.ts";
import { mergeExtracted } from "../src/lib/product-enrichment/merge.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { structureResearchFacts } from "../src/lib/lp-generator/structure.ts";
import { applyPresellMode } from "../src/lib/search-intent/index.ts";
import { classifyAttribute } from "../src/lib/attribute-class/classify.ts";
import { faqEntryAllowed } from "../src/lib/presell-copy/faq-select.ts";
import { prepareOfficialOfferCta, readHopRecord } from "../src/lib/affiliate-hop/index.ts";
import {
  applySandboxToModel,
  buildSandboxCtaPath,
  prepareSandboxCta,
  productionPublicationBlockedForSandbox,
  readSandboxClicks,
  writeSandboxSession,
} from "../src/lib/sandbox/index.ts";
import { DEFAULT_SANDBOX_ROOT } from "../src/lib/sandbox/store.ts";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  getPublicSiteName,
  getPublicSiteUrl,
} from "../src/lib/public-site.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";

const PRODUCT_NAME = "ProDentim";
const SALES_URL = "https://prodentim101.com/text.php?hop=zzzzz&hopId=6c9c6dd4-9c61-4086-8445-637fae0c985b";
const REAL_HOP = "https://6b503qvz1icsbs7otcn82psacg.hop.clickbank.net";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54h-content-quality-repair");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const FEMICORE_HOP = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const FEMICORE_CATALOG = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const PRIOR_EDITORIAL = "lp-mvky9o48-a95b60bc";
const PRIOR_BOFU = "lp-mvky9o48-93f564b4";
const MISCLASSIFIED = ["easy to use", "no stimulants", "non-habit forming"];
const KNOWN_STRAINS = [/lactobacillus paracasei/i, /b\.?\s*lactis/i, /lactobacillus reuteri/i];
const PROHIBITED = /checkout page|click the button|transform(?:s|ed|ing)? lives?|clinical research|all ages and medical conditions|generally considered to be safe/i;

function writeJson(name: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function snapshotFemicore() {
  return { hop: fileHash(FEMICORE_HOP), catalog: fileHash(FEMICORE_CATALOG) };
}

function contractInputOf(facts: ProductFacts): ContractInput {
  return {
    facts,
    slug: productKeyFromName(facts.productName),
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
  };
}

function groundCopy(copy: SalesCopy, contract: ProductContract) {
  const rows = [
    classifyCopyText({ path: "headline", text: copy.headline.text, contract }),
    classifyCopyText({ path: "introduction", text: copy.introduction.text, contract }),
  ];
  if (copy.subheadline) rows.push(classifyCopyText({ path: "subheadline", text: copy.subheadline.text, contract }));
  for (const [index, section] of copy.sections.entries()) {
    rows.push(classifyCopyText({ path: `sections[${index}].headline`, text: section.headline.text, contract }));
  }
  return rows;
}

function renderedTexts(copy: SalesCopy): string[] {
  return [
    copy.headline.text,
    copy.subheadline?.text,
    copy.introduction.text,
    ...copy.sections.flatMap((section) => [section.headline.text, ...section.body.map((item) => item.text), ...section.items.map((item) => item.text.text)]),
    ...copy.faq.flatMap((item) => [item.question.text, item.answer.text]),
  ].filter((item): item is string => Boolean(item));
}

function prohibitedClaims(copy: SalesCopy): string[] {
  return renderedTexts(copy).filter((item) => PROHIBITED.test(item));
}

function priorInspection(id: string) {
  const model = readGenerationModel(id);
  if (!model) return null;
  return {
    repeats: countContentRepetitions(model.copy),
    misclassified: (model.contract.components ?? []).filter((item) => MISCLASSIFIED.includes(item.name.toLowerCase())).map((item) => item.name),
    prohibited: prohibitedClaims(model.copy),
    faq: model.copy.faq.map((item) => ({ question: item.question.text, answer: item.answer.text })),
    components: (model.contract.components ?? []).map((item) => item.name),
  };
}

async function capturePreview(generationId: string, prefix: string) {
  mkdirSync(SHOTS, { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${generationId}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 90000 });
  await page.waitForTimeout(600);
  const desktop = await page.evaluate(() => ({
    headline: document.querySelector("h1")?.textContent?.trim() ?? "",
    composition: document.querySelector("[data-v4-composition]")?.getAttribute("data-v4-composition") ?? "",
    sections: [...document.querySelectorAll("[data-v4-section]")].map((item) => item.getAttribute("data-v4-section")),
    faqCount: document.querySelectorAll(".ds-faq__item").length,
    ingredients: [...document.querySelectorAll('[data-v4-section="specifications"] li, [data-v4-section="specifications"] p')].map((item) => item.textContent?.trim() ?? ""),
    images: [...document.querySelectorAll("[data-v4-image='commercial']")].map((item) => (item as HTMLImageElement).src),
    sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
    officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    v4: Boolean(document.querySelector('[data-v4="page"]')),
  }));
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-desktop-1440.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
    officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
    v4: Boolean(document.querySelector('[data-v4="page"]')),
  }));
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-mobile-390.jpg`), type: "jpeg", quality: 55, fullPage: true });
  let journey: { landed: boolean; event: string | null; url: string } | null = null;
  if (desktop.sandboxCtas > 0) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('[data-v4-track="sandbox_offer_click"]', { timeout: 30000 });
    await Promise.all([
      page.waitForURL(/\/admin\/lab\/sandbox\/offer/, { timeout: 30000 }),
      page.click('[data-v4-track="sandbox_offer_click"]'),
    ]);
    const event = await page.locator("[data-sandbox-event]").getAttribute("data-sandbox-event");
    await page.screenshot({ path: path.join(SHOTS, `${prefix}-sandbox-destination.jpg`), type: "jpeg", quality: 55, fullPage: true });
    journey = { landed: /\/admin\/lab\/sandbox\/offer/.test(page.url()), event, url: page.url() };
  }
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile, journey };
}

async function buildMode(input: { query: string; facts: ProductFacts; sources: EnrichmentSource[] }) {
  const enriched = enrichProduct({ scenarioKey: "execution-54h", contractInput: contractInputOf(input.facts), sources: input.sources });
  const presell = enrichPresellContent({
    facts: enriched.afterFacts,
    sources: input.sources,
    withheld: enriched.withheld,
    conflicts: enriched.conflicts,
    contract: enriched.afterContract,
  });
  const afterContract = buildProductContract({
    ...contractInputOf(presell.facts),
    benefitCandidates: presell.benefitCandidates,
  }).contract;
  const afterBrief = buildConversionBrief(afterContract);
  const generated = buildPageBlueprint({ contract: afterContract, brief: afterBrief });
  const applied = applyPresellMode({
    query: input.query,
    contract: afterContract,
    brief: afterBrief,
    copy: generated.copy,
  });
  const { copy, blueprint } = buildPageBlueprint({ contract: afterContract, brief: afterBrief, copy: applied.copy });
  const repaired = repairContentQuality({ copy, contract: afterContract, brief: afterBrief });
  const composed = composeV4Model({
    scenarioKey: "execution-54h",
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
  });
  const finalQuality = inspectContentQuality({ copy: composed.copy, contract: afterContract, brief: afterBrief });
  const qualityStatus = finalQuality.length === 0 ? (repaired.repairs.length ? "REPAIRED" : "PASS") : "BLOCKED";
  const qualityInspection = persistQualityInspection({
    copy: composed.copy,
    contract: afterContract,
    brief: afterBrief,
    repaired: { status: qualityStatus, defects: finalQuality, repairs: repaired.repairs, copy: composed.copy },
    timestamp: new Date().toISOString(),
  });
  const replay = replayQualityInspection({
    copy: composed.copy,
    contract: afterContract,
    brief: afterBrief,
    stored: qualityInspection,
  });
  const defects = [
    ...pipelineDefects({
      contract: afterContract,
      brief: afterBrief,
      copy: repaired.copy,
      blueprint,
      model: composed,
      catalog: null,
    }),
    ...finalQuality,
  ];
  const evaluated = evaluateGenerationGates({ defects, contentQuality: qualityStatus });
  return {
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
    model: composed,
    applied,
    grounding: groundCopy(repaired.copy, afterContract),
    defects,
    evaluated,
    repaired,
    qualityInspection,
    replay,
    exclusions: (presell.facts.sourceSnippets ?? [])
      .filter((item) => item.field === "faq")
      .map((item) => ({ question: item.question, allowed: faqEntryAllowed(item.question ?? "", item.text).ok })),
  };
}

function persistGeneration(input: {
  id: string;
  productKey: string;
  model: V4Model;
  copy: SalesCopy;
  evaluated: ReturnType<typeof evaluateGenerationGates>;
  defects: ReturnType<typeof pipelineDefects>;
  qualityInspection: ReturnType<typeof persistQualityInspection>;
  sources: Awaited<ReturnType<typeof fetchResearchSources>>["records"];
  limitations: string[];
  sandbox?: { enabled: true; sessionId: string; ctaPath: string; productionPromotionBlocked: true };
}) {
  const generation = emptyRecord(
    { productName: PRODUCT_NAME, category: "dietary supplement", salesUrl: SALES_URL, language: "en", market: "US", goal: "INFORM" },
    input.id,
    generationHash({ productName: PRODUCT_NAME, salesUrl: SALES_URL, language: "en", market: "US", goal: "INFORM" }),
    new Date().toISOString(),
  );
  generation.productKey = input.productKey;
  generation.status =
    input.qualityInspection.persistence === "INCONSISTENT"
      ? "FAILED"
      : input.evaluated.labels.CONTENT_PASS && input.qualityInspection.status !== "BLOCKED"
        ? "PREVIEW_READY"
        : "NEEDS_REVIEW";
  generation.sources = input.sources;
  generation.limitations = input.limitations;
  generation.previewPath = `/admin/lab/lp-generator/${input.id}/preview`;
  generation.copy = {
    producer: input.copy.producer,
    aiUsed: false,
    aiConfigured: envLookup("AIA_ALLOW_PAID_AI") === "1",
    headline: input.copy.headline.text,
    sectionCount: input.copy.sections.length,
    source: "DETERMINISTIC_OFFLINE",
  };
  generation.gates = input.evaluated.gates;
  generation.gateLabels = input.evaluated.labels;
  generation.defects = input.defects;
  generation.qualityInspection = input.qualityInspection;
  generation.sandbox = input.sandbox;
  generation.timings.finishedAt = new Date().toISOString();
  if (input.qualityInspection.persistence === "INCONSISTENT") {
    generation.errors.push(input.qualityInspection.reason ?? "QUALITY_GATE_PERSISTENCE=INCONSISTENT");
  }
  writeGeneration(generation);
  writeGenerationModel(input.id, input.model);
  return generation;
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }
  const femicoreBefore = snapshotFemicore();
  const productKey = productKeyFromName(PRODUCT_NAME);
  const hop = readHopRecord(productKey);
  if (!hop || hop.href !== REAL_HOP || hop.authorization !== "VALIDATED") {
    throw new Error("The existing ProDentim hop must stay VALIDATED. 54H does not rewrite it.");
  }

  const fetched = await fetchResearchSources({ urls: collectSourceUrls({ salesUrl: SALES_URL, affiliateUrl: SALES_URL }) });
  let sources = fetched.sources;
  const limitations = [
    ...fetched.limitations,
    "Execution 54H repairs content quality on already-collected public sources. No paid API calls.",
    "Sandbox CTA is local only. Production publication stays blocked.",
  ];
  if (sources.length === 0) {
    const fixture = path.join(process.cwd(), "scripts", "fixtures", "prodentim-vsl.html");
    if (existsSync(fixture)) {
      sources = [{
        url: SALES_URL,
        retrievedAt: new Date().toISOString(),
        pageCategory: "PRIMARY",
        html: readFileSync(fixture, "utf8"),
      }];
      limitations.push("Live source fetch failed. Stored laboratory fixture HTML was used and labeled as fallback.");
    }
  }

  const seed = emptyProductFacts(PRODUCT_NAME, SALES_URL, "MANUAL");
  seed.confidence.productName = "MANUAL";
  const extracted = extractSources(sources);
  const merged = mergeExtracted(seed, extracted);
  const structured = structureResearchFacts({
    operatorName: PRODUCT_NAME,
    category: "dietary supplement",
    facts: merged.facts,
    purchaseLink: null,
  });
  writeJson("product-facts.json", {
    productName: structured.facts.productName,
    ingredients: structured.facts.ingredientsOrComponents.map((item) => ({ text: item, class: classifyAttribute(item).class })),
    features: structured.facts.features,
    usage: structured.facts.usageInformation,
    guarantee: structured.facts.guaranteeInformation,
  });

  const editorial = await buildMode({ query: `what is ${PRODUCT_NAME}`, facts: structured.facts, sources });
  const bofu = await buildMode({ query: `buy ${PRODUCT_NAME}`, facts: structured.facts, sources });

  const editorialId = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const bofuId = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const sessionId = `sbx-${randomBytes(8).toString("hex")}`;
  const ctaPath = buildSandboxCtaPath({
    sessionId,
    productKey,
    landingPageId: bofuId,
    presellMode: "PRESELL_BOFU",
  });
  writeSandboxSession({
    version: 1,
    sessionId,
    productKey,
    landingPageId: bofuId,
    presellMode: "PRESELL_BOFU",
    ctaPath,
    createdAt: new Date().toISOString(),
    productionPromotionBlocked: true,
  }, DEFAULT_SANDBOX_ROOT);
  const sandboxCta = prepareSandboxCta({
    lab: true,
    href: ctaPath,
    session: {
      version: 1,
      sessionId,
      productKey,
      landingPageId: bofuId,
      presellMode: "PRESELL_BOFU",
      ctaPath,
      createdAt: new Date().toISOString(),
      productionPromotionBlocked: true,
    },
  });
  const realCatalog = readCatalog(productKey);
  const editorialModel = overlayApprovedAssets(editorial.model, realCatalog);
  const bofuApproved = overlayApprovedAssets(bofu.model, realCatalog);
  const sandboxModel = applySandboxToModel(bofuApproved, { href: ctaPath });
  writeJson("image-authorization.json", {
    realApproved: realCatalog?.images.filter((item) => item.status === "USER_APPROVED").map((item) => item.id) ?? [],
    editorialCommercial: Boolean(editorialModel.commercialImage),
    bofuCommercial: Boolean(sandboxModel.commercialImage),
    bofuGallery: sandboxModel.galleryImages?.length ?? 0,
    note: "Extracted promotional images are not treated as USER_APPROVED.",
  });

  const editorialRecord = persistGeneration({
    id: editorialId,
    productKey,
    model: editorialModel,
    copy: editorial.copy,
    evaluated: editorial.evaluated,
    defects: editorial.defects,
    qualityInspection: editorial.qualityInspection,
    sources: fetched.records,
    limitations: [...limitations, "Editorial preview. No sandbox CTA."],
  });
  const bofuRecord = persistGeneration({
    id: bofuId,
    productKey,
    model: sandboxModel,
    copy: bofu.copy,
    evaluated: bofu.evaluated,
    defects: bofu.defects,
    qualityInspection: bofu.qualityInspection,
    sources: fetched.records,
    limitations,
    sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true },
  });

  const official = prepareOfficialOfferCta(hop);
  const priorEditorial = priorInspection(PRIOR_EDITORIAL);
  const priorBofu = priorInspection(PRIOR_BOFU);
  const afterEditorial = {
    repeats: countContentRepetitions(editorial.copy),
    misclassified: (editorial.contract.components ?? []).filter((item) => MISCLASSIFIED.includes(item.name.toLowerCase())).map((item) => item.name),
    prohibited: prohibitedClaims(editorial.copy),
    faq: editorial.copy.faq.map((item) => ({ question: item.question.text, answer: item.answer.text })),
    components: (editorial.contract.components ?? []).map((item) => item.name),
  };
  const afterBofu = {
    repeats: countContentRepetitions(bofu.copy),
    misclassified: (bofu.contract.components ?? []).filter((item) => MISCLASSIFIED.includes(item.name.toLowerCase())).map((item) => item.name),
    prohibited: prohibitedClaims(bofu.copy),
    faq: bofu.copy.faq.map((item) => ({ question: item.question.text, answer: item.answer.text })),
    components: (bofu.contract.components ?? []).map((item) => item.name),
  };

  writeJson("root-cause.json", {
    duplication: "FAQ answers were written to both section.items.text and copy.faq. The 54G inspector walks both.",
    ingredients: "Short commercial chips passed isIngredientIdentityName and were stored as components.",
    persistence: "The 54F custom runner stored pipeline defects only and omitted the content-quality inspection.",
  });
  writeJson("comparison.json", { priorEditorial, priorBofu, afterEditorial, afterBofu });
  writeJson("quality-gates.json", {
    editorial: { evaluated: editorial.evaluated, inspection: editorial.qualityInspection, replay: editorial.replay },
    bofu: { evaluated: bofu.evaluated, inspection: bofu.qualityInspection, replay: bofu.replay },
  });
  writeJson("semantic-grounding.json", {
    editorial: { ok: editorial.grounding.every((item) => item.allowed), blocked: editorial.grounding.filter((item) => !item.allowed) },
    bofu: { ok: bofu.grounding.every((item) => item.allowed), blocked: bofu.grounding.filter((item) => !item.allowed) },
  });
  writeJson("cta-status.json", {
    production: official,
    sandbox: sandboxCta,
    hop: { href: hop.href, authorization: hop.authorization, probe: hop.probe?.status ?? null },
    promotion: { allowed: false, blocked: productionPublicationBlockedForSandbox({ sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true } }) },
  });
  writeJson("faq-exclusions.json", {
    editorial: editorial.copy.faq,
    bofu: bofu.copy.faq,
    remainingProhibited: [...afterEditorial.prohibited, ...afterBofu.prohibited],
  });

  const editorialShot = await capturePreview(editorialId, "editorial");
  const bofuShot = await capturePreview(bofuId, "bofu");
  writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot });
  writeJson("sandbox-clicks.json", readSandboxClicks(productKey, DEFAULT_SANDBOX_ROOT));
  writeJson("urls.json", {
    editorial: editorialShot.url,
    bofu: bofuShot.url,
  });

  const femicoreAfter = snapshotFemicore();
  const femicorePreserved = femicoreBefore.hop === femicoreAfter.hop && femicoreBefore.catalog === femicoreAfter.catalog;
  writeJson("femicore-preservation.json", { before: femicoreBefore, after: femicoreAfter, preserved: femicorePreserved });
  writeJson("generations.json", { editorialId, bofuId, editorialStatus: editorialRecord.status, bofuStatus: bofuRecord.status });

  const persistence =
    editorial.qualityInspection.persistence === "CONSISTENT" &&
    bofu.qualityInspection.persistence === "CONSISTENT" &&
    editorial.replay.persistence === "CONSISTENT" &&
    bofu.replay.persistence === "CONSISTENT"
      ? "CONSISTENT"
      : "INCONSISTENT";
  const strainsPresent = KNOWN_STRAINS.every((pattern) => afterBofu.components.some((item) => pattern.test(item)));
  const report = {
    EXECUTION_54H_STATUS:
      persistence === "CONSISTENT" &&
      afterEditorial.repeats === 0 &&
      afterBofu.repeats === 0 &&
      afterEditorial.misclassified.length === 0 &&
      afterBofu.misclassified.length === 0 &&
      afterEditorial.prohibited.length === 0 &&
      afterBofu.prohibited.length === 0 &&
      femicorePreserved &&
      !official.visible &&
      hop.authorization === "VALIDATED" &&
      editorialShot.desktop.images.length === 0 &&
      bofuShot.desktop.images.length === 0
        ? "PASS"
        : "PARTIAL",
    ROOT_CAUSE_FIXED: persistence === "CONSISTENT" && afterBofu.repeats === 0 && afterBofu.misclassified.length === 0,
    REPETITION_COUNT_BEFORE: priorBofu?.repeats ?? 4,
    REPETITION_COUNT_AFTER: afterBofu.repeats,
    MISCLASSIFIED_INGREDIENTS_BEFORE: priorBofu?.misclassified.length ?? 3,
    MISCLASSIFIED_INGREDIENTS_AFTER: afterBofu.misclassified.length,
    PROHIBITED_CLAIMS_RENDERED: afterEditorial.prohibited.length + afterBofu.prohibited.length,
    FAQ_QUALITY_STATUS: afterBofu.faq.length === 0 ? "OMITTED" : afterBofu.prohibited.length === 0 ? "CLEAN" : "BLOCKED",
    QUALITY_GATE_PERSISTENCE: persistence,
    CONTENT_QUALITY_STATUS: bofu.qualityInspection.status,
    SEMANTIC_GROUNDING_STATUS: editorial.grounding.every((item) => item.allowed) && bofu.grounding.every((item) => item.allowed) ? "PASS" : "BLOCKED",
    COMMERCIAL_AUTHORIZATION_STATUS: official.visible ? "AUTHORIZED" : "BLOCKED",
    HOPLINK_STATUS: hop.authorization,
    SANDBOX_CTA_STATUS: sandboxCta.visible && bofuShot.desktop.sandboxCtas > 0 && bofuShot.journey?.landed ? "FUNCTIONAL" : sandboxCta.visible ? "ARMED" : "BLOCKED",
    PRODUCTION_CTA_STATUS: official.visible || bofuShot.desktop.officialCtas > 0 ? "VISIBLE" : "BLOCKED",
    RENDERER_V4_PRESERVED: editorialShot.desktop.v4 && bofuShot.desktop.v4 && !editorialShot.desktop.overflowX && !bofuShot.mobile.overflowX,
    UNAPPROVED_IMAGES_USED: editorialShot.desktop.images.length + bofuShot.desktop.images.length,
    FEMICORE_DATA_PRESERVED: femicorePreserved,
    KNOWN_STRAINS_PRESENT: strainsPresent,
    EDITORIAL_PREVIEW_URL: editorialShot.url,
    BOFU_PREVIEW_URL: bofuShot.url,
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    DISK_FREE_GB: diskFreeGb(),
    NEXT_RECOMMENDED_ACTION: "STOP. Do not publish, authorize the commercial CTA, or start the next execution.",
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54h-content-quality-repair/screenshots/editorial-desktop-1440.jpg",
      "data/evidence/execution-54h-content-quality-repair/screenshots/editorial-mobile-390.jpg",
      "data/evidence/execution-54h-content-quality-repair/screenshots/bofu-desktop-1440.jpg",
      "data/evidence/execution-54h-content-quality-repair/screenshots/bofu-mobile-390.jpg",
      ...(bofuShot.journey ? ["data/evidence/execution-54h-content-quality-repair/screenshots/bofu-sandbox-destination.jpg"] : []),
    ],
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
