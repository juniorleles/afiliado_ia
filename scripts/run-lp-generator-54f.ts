// npx tsx scripts/run-lp-generator-54f.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import { emptyRecord, writeGeneration, writeGenerationModel } from "../src/lib/lp-generator/store.ts";
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
import { composeV4Model, type V4Model } from "../src/lib/product-showcase/v4/model.ts";
import { imagesFromHtml } from "../src/lib/real-product-assets/discover.ts";
import { emptyCatalog, upsertImage } from "../src/lib/real-product-assets/store.ts";
import { productKeyFromName } from "../src/lib/real-product-assets/extract.ts";
import { readCatalog } from "../src/lib/real-product-assets/store.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { extractSources } from "../src/lib/product-enrichment/extract.ts";
import { mergeExtracted } from "../src/lib/product-enrichment/merge.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { structureResearchFacts } from "../src/lib/lp-generator/structure.ts";
import { applyPresellMode } from "../src/lib/search-intent/index.ts";
import {
  markValidated,
  prepareOfficialOfferCta,
  probeHopDestination,
  registerHop,
  writeHopRecord,
} from "../src/lib/affiliate-hop/index.ts";
import {
  applySandboxToModel,
  buildSandboxCtaPath,
  extractHopCandidates,
  prepareSandboxCta,
  productionPublicationBlockedForSandbox,
  realCatalogApprovalsUnchanged,
  readSandboxClicks,
  simulateSandboxApprovals,
  writeSandboxSession,
} from "../src/lib/sandbox/index.ts";
import { DEFAULT_SANDBOX_ASSET_ROOT, DEFAULT_SANDBOX_ROOT } from "../src/lib/sandbox/store.ts";
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
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54f-prodentim-sandbox");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const FEMICORE_HOP = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const FEMICORE_CATALOG = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");

function writeJson(name: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function snapshotFemicore() {
  return {
    hop: fileHash(FEMICORE_HOP),
    catalog: fileHash(FEMICORE_CATALOG),
  };
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
    sandboxBadge: Boolean(document.querySelector("[data-sandbox-badge]")),
    sandboxRoot: document.documentElement.closest("[data-sandbox]")?.getAttribute("data-sandbox") === "true"
      || Boolean(document.querySelector("[data-sandbox='true']")),
    sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
    officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-desktop-1440.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
    officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
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

async function buildMode(input: {
  query: string;
  productKey: string;
  facts: ProductFacts;
  sources: EnrichmentSource[];
}) {
  const enriched = enrichProduct({ scenarioKey: "execution-54f", contractInput: contractInputOf(input.facts), sources: input.sources });
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
    scenarioKey: "execution-54f",
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
  });
  const defects = pipelineDefects({
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
    model: composed,
    catalog: null,
  });
  const evaluated = evaluateGenerationGates({ defects, contentQuality: repaired.status });
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
  };
}

function persistGeneration(input: {
  id: string;
  productKey: string;
  model: V4Model;
  copy: SalesCopy;
  evaluated: ReturnType<typeof evaluateGenerationGates>;
  defects: ReturnType<typeof pipelineDefects>;
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
  generation.status = input.evaluated.labels.CONTENT_PASS ? "PREVIEW_READY" : "NEEDS_REVIEW";
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
  generation.sandbox = input.sandbox;
  generation.timings.finishedAt = new Date().toISOString();
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
  const realCatalogBefore = readCatalog(productKey);

  const fetched = await fetchResearchSources({ urls: collectSourceUrls({ salesUrl: SALES_URL, affiliateUrl: SALES_URL }) });
  let sources = fetched.sources;
  const limitations = [
    ...fetched.limitations,
    "Execution 54F is a SANDBOX homologation. Production publication stays blocked.",
    "No paid API calls. No purchase was attempted.",
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

  writeJson("research.json", {
    liveRecords: fetched.records,
    sourceCount: sources.length,
    usedFallback: fetched.sources.length === 0 && sources.length > 0,
  });

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
    ingredients: structured.facts.ingredientsOrComponents,
    features: structured.facts.features,
    usage: structured.facts.usageInformation,
    guarantee: structured.facts.guaranteeInformation,
  });

  const html = sources.map((item) => item.html ?? "").join("\n");
  const hopCandidates = extractHopCandidates(html, SALES_URL);
  writeJson("hop-candidates.json", hopCandidates);
  const clickbank = hopCandidates.find((item) => item.format.ok);
  const observedHref = clickbank?.href ?? SALES_URL;
  let hop = registerHop({ productKey, href: observedHref });
  const probe = hop.format.ok
    ? await probeHopDestination({ href: hop.href, productName: PRODUCT_NAME })
    : {
        status: "FAIL" as const,
        initialUrl: observedHref,
        chain: [],
        finalUrl: observedHref,
        finalHost: null,
        httpStatus: null,
        productMention: false,
        trackingPreserved: "ABSENT" as const,
        reason: hop.format.issues.join(", ") || "The observed hop is not a valid ClickBank hop.",
      };
  hop = { ...hop, probe, updatedAt: new Date().toISOString() };
  if (hop.format.ok && probe.status !== "FAIL") hop = markValidated(hop);
  writeHopRecord(hop);
  writeJson("hop-record.json", hop);
  writeJson("destination-probe.json", { ...probe, commissionAssumed: false });

  const official = prepareOfficialOfferCta(hop);
  writeJson("production-cta.json", official);

  let discoveryCatalog = emptyCatalog(productKey, PRODUCT_NAME);
  const discoveredImages = [];
  for (const source of sources) {
    if (!source.html) continue;
    const images = imagesFromHtml({ productName: PRODUCT_NAME, productKey, pageUrl: source.url, html: source.html });
    discoveredImages.push(...images);
    for (const image of images) discoveryCatalog = upsertImage(discoveryCatalog, image);
  }
  writeJson("image-discovery.json", {
    found: discoveredImages.map((item) => ({ id: item.id, url: item.url, status: item.status, relevant: item.relevant, match: item.match })),
  });
  const sandboxAssets = await simulateSandboxApprovals({ catalog: discoveryCatalog, root: DEFAULT_SANDBOX_ASSET_ROOT });
  writeJson("sandbox-assets.json", { approved: sandboxAssets.approved, skipped: sandboxAssets.skipped, count: sandboxAssets.catalog.images.length });
  const realCatalogAfter = readCatalog(productKey);
  writeJson("real-catalog-approvals.json", {
    unchanged: realCatalogApprovalsUnchanged(realCatalogBefore, realCatalogAfter),
    before: (realCatalogBefore?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id),
    after: (realCatalogAfter?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id),
  });

  const editorial = await buildMode({
    query: `what is ${PRODUCT_NAME}`,
    productKey,
    facts: structured.facts,
    sources,
  });
  const bofu = await buildMode({
    query: `buy ${PRODUCT_NAME}`,
    productKey,
    facts: structured.facts,
    sources,
  });

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
  const sandboxModel = applySandboxToModel(bofu.model, { href: ctaPath, catalog: sandboxAssets.catalog });

  persistGeneration({
    id: editorialId,
    productKey,
    model: editorial.model,
    copy: editorial.copy,
    evaluated: editorial.evaluated,
    defects: editorial.defects,
    sources: fetched.records,
    limitations: [...limitations, "Editorial preview. No sandbox CTA."],
  });
  persistGeneration({
    id: bofuId,
    productKey,
    model: sandboxModel,
    copy: bofu.copy,
    evaluated: bofu.evaluated,
    defects: bofu.defects,
    sources: fetched.records,
    limitations,
    sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true },
  });

  writeJson("quality-gates.json", {
    editorial: editorial.evaluated,
    bofu: bofu.evaluated,
    note: "Gates were evaluated on the production-faithful models before sandbox overlay.",
  });
  writeJson("semantic-grounding.json", {
    editorial: { ok: editorial.grounding.every((item) => item.allowed), blocked: editorial.grounding.filter((item) => !item.allowed) },
    bofu: { ok: bofu.grounding.every((item) => item.allowed), blocked: bofu.grounding.filter((item) => !item.allowed) },
  });
  writeJson("cta-status.json", {
    production: official,
    sandbox: sandboxCta,
    promotion: { allowed: false, blocked: productionPublicationBlockedForSandbox({ sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true } }) },
  });

  const editorialShot = await capturePreview(editorialId, "editorial");
  const bofuShot = await capturePreview(bofuId, "bofu");
  writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot });
  writeJson("sandbox-clicks.json", readSandboxClicks(productKey, DEFAULT_SANDBOX_ROOT));

  const femicoreAfter = snapshotFemicore();
  const femicorePreserved = femicoreBefore.hop === femicoreAfter.hop && femicoreBefore.catalog === femicoreAfter.catalog;
  writeJson("femicore-preservation.json", { before: femicoreBefore, after: femicoreAfter, preserved: femicorePreserved });

  const hopStatus = hop.format.ok ? (probe.status === "FAIL" ? "FAIL" : probe.status) : hop.format.issues.includes("PLACEHOLDER") || hopCandidates.some((item) => item.placeholder) ? "PLACEHOLDER_OBSERVED" : hop.authorization;
  const report = {
    EXECUTION_54F_STATUS:
      femicorePreserved &&
      !official.visible &&
      sandboxCta.visible &&
      bofuShot.desktop.officialCtas === 0 &&
      bofuShot.journey?.landed &&
      bofuShot.journey.event === "sandbox_offer_click"
        ? "PASS"
        : "PARTIAL",
    SANDBOX_END_TO_END: bofuShot.journey?.landed && bofuShot.journey.event === "sandbox_offer_click" ? "PASS" : "FAIL",
    REAL_HOPLINK_VALIDATION: hopStatus,
    HOPLINK_FORMAT_VALID: hop.format.ok,
    REDIRECT_VALIDATION_STATUS: probe.status,
    FINAL_DESTINATION_DOMAIN: "finalHost" in probe ? probe.finalHost : null,
    SANDBOX_CTA: sandboxCta.visible && bofuShot.desktop.sandboxCtas > 0 ? "FUNCTIONAL" : "BLOCKED",
    SANDBOX_CLICK_TRACKING: bofuShot.journey?.event === "sandbox_offer_click" ? "PASS" : "FAIL",
    PRODUCTION_CTA: official.visible ? "VISIBLE" : "BLOCKED",
    PRODUCTION_PUBLICATION: "BLOCKED",
    AFFILIATE_POLICY_STATUS: hop.authorization,
    FEMICORE_DATA_PRESERVED: femicorePreserved,
    QUALITY_GATE_RESULTS: {
      editorial: editorial.evaluated.labels,
      bofu: bofu.evaluated.labels,
    },
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    DISK_FREE_GB: diskFreeGb(),
    NEXT_RECOMMENDED_ACTION: "STOP. Do not promote the sandbox journey or authorize production.",
    EDITORIAL_PREVIEW_URL: editorialShot.url,
    BOFU_PREVIEW_URL: bofuShot.url,
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54f-prodentim-sandbox/screenshots/editorial-desktop-1440.jpg",
      "data/evidence/execution-54f-prodentim-sandbox/screenshots/editorial-mobile-390.jpg",
      "data/evidence/execution-54f-prodentim-sandbox/screenshots/bofu-desktop-1440.jpg",
      "data/evidence/execution-54f-prodentim-sandbox/screenshots/bofu-mobile-390.jpg",
      "data/evidence/execution-54f-prodentim-sandbox/screenshots/bofu-sandbox-destination.jpg",
    ],
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
