// npx tsx scripts/run-lp-generator-54l.ts
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
import { inspectContentQuality, repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
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
import { selectApprovedHero } from "../src/lib/real-product-assets/select.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { extractSources } from "../src/lib/product-enrichment/extract.ts";
import { mergeExtracted } from "../src/lib/product-enrichment/merge.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { structureResearchFacts } from "../src/lib/lp-generator/structure.ts";
import { applyPresellMode } from "../src/lib/search-intent/index.ts";
import { prepareOfficialOfferCta, readHopRecord } from "../src/lib/affiliate-hop/index.ts";
import {
  applySandboxToModel,
  buildSandboxCtaPath,
  prepareSandboxCta,
  productionPublicationBlockedForSandbox,
  writeSandboxSession,
} from "../src/lib/sandbox/index.ts";
import { DEFAULT_SANDBOX_ROOT } from "../src/lib/sandbox/store.ts";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  getPublicContactEmail,
  getPublicSiteName,
  getPublicSiteUrl,
} from "../src/lib/public-site.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import { buildEvidenceRegistry } from "../src/lib/presell-enrichment/registry.ts";
import { fetchCoverageSources } from "../src/lib/research-coverage/run.ts";
import { buildSourceCoverageMatrix } from "../src/lib/research-coverage/matrix.ts";
import { classifySourceClass } from "../src/lib/research-coverage/classify-source.ts";
import { coverageEvidenceFromRegistry, usableNewEvidence } from "../src/lib/research-coverage/evidence.ts";
import { extractPriceCandidates, verifyPrices } from "../src/lib/research-coverage/price.ts";
import { scoreProductCoverage } from "../src/lib/research-coverage/score.ts";
import { RESEARCH_LIMITS } from "../src/lib/research-coverage/types.ts";
import type { SourceClass } from "../src/lib/research-coverage/types.ts";

const PRODUCT_NAME = "ProDentim";
const SALES_URL = "https://prodentim101.com/text.php?hop=zzzzz&hopId=6c9c6dd4-9c61-4086-8445-637fae0c985b";
const REAL_HOP = "https://6b503qvz1icsbs7otcn82psacg.hop.clickbank.net";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54l-research-coverage");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const FEMICORE_HOP = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const FEMICORE_CATALOG = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const FIXTURE_HTML = path.join(process.cwd(), "scripts", "fixtures", "prodentim-vsl.html");

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

function keyOf(field: string, text: string): string {
  return `${field}|${text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function buildFromSources(sources: EnrichmentSource[]) {
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
  const enriched = enrichProduct({ scenarioKey: "execution-54l", contractInput: contractInputOf(structured.facts), sources });
  const presell = enrichPresellContent({
    facts: enriched.afterFacts,
    sources,
    withheld: enriched.withheld,
    conflicts: enriched.conflicts,
    contract: enriched.afterContract,
  });
  const contract = buildProductContract({
    ...contractInputOf(presell.facts),
    benefitCandidates: presell.benefitCandidates,
  }).contract;
  const registry = buildEvidenceRegistry({
    sources,
    facts: presell.facts,
    withheld: enriched.withheld,
    conflicts: enriched.conflicts,
  });
  return { structured, enriched, presell, contract, registry };
}

function classMap(sources: EnrichmentSource[]): Map<string, SourceClass> {
  const map = new Map<string, SourceClass>();
  for (const source of sources) {
    map.set(source.url, classifySourceClass({ url: source.url, html: source.html, pageCategory: source.pageCategory }).sourceClass);
  }
  return map;
}

async function buildMode(input: { query: string; facts: ProductFacts; sources: EnrichmentSource[]; catalog: ReturnType<typeof readCatalog> }) {
  const afterContract = buildProductContract({
    ...contractInputOf(input.facts),
  }).contract;
  const afterBrief = buildConversionBrief(afterContract);
  const generated = buildPageBlueprint({ contract: afterContract, brief: afterBrief });
  const applied = applyPresellMode({ query: input.query, contract: afterContract, brief: afterBrief, copy: generated.copy });
  const { copy, blueprint } = buildPageBlueprint({ contract: afterContract, brief: afterBrief, copy: applied.copy });
  const repaired = repairContentQuality({ copy, contract: afterContract, brief: afterBrief });
  const composed = composeV4Model({
    scenarioKey: "execution-54l",
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
  });
  const model = overlayApprovedAssets(composed, input.catalog, { mode: applied.mode });
  const finalQuality = inspectContentQuality({ copy: model.copy, contract: afterContract, brief: afterBrief });
  const qualityStatus = finalQuality.length === 0 ? (repaired.repairs.length ? "REPAIRED" : "PASS") : "BLOCKED";
  const qualityInspection = persistQualityInspection({
    copy: model.copy,
    contract: afterContract,
    brief: afterBrief,
    repaired: { status: qualityStatus, defects: finalQuality, repairs: repaired.repairs, copy: model.copy },
    timestamp: new Date().toISOString(),
  });
  const replay = replayQualityInspection({ copy: model.copy, contract: afterContract, brief: afterBrief, stored: qualityInspection });
  const grounding = [
    classifyCopyText({ path: "headline", text: repaired.copy.headline.text, contract: afterContract }),
    classifyCopyText({ path: "introduction", text: repaired.copy.introduction.text, contract: afterContract }),
  ];
  const defects = [
    ...pipelineDefects({ contract: afterContract, brief: afterBrief, copy: repaired.copy, blueprint, model, catalog: input.catalog }),
    ...finalQuality,
  ];
  return {
    contract: afterContract,
    copy: repaired.copy,
    model,
    applied,
    qualityInspection,
    replay,
    grounding,
    defects,
    evaluated: evaluateGenerationGates({ defects, contentQuality: qualityStatus }),
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
  writeGeneration(generation);
  writeGenerationModel(input.id, input.model);
}

async function capturePreview(generationId: string, prefix: string) {
  mkdirSync(SHOTS, { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${generationId}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 90000 });
  const hasHero = await page.locator("[data-v4-image='commercial']").count();
  if (hasHero) {
    await page.waitForFunction(
      () => [...document.querySelectorAll("[data-v4-image='commercial']")].every((node) => {
        const img = node as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      }),
      { timeout: 60000 },
    );
  }
  const desktop = await page.evaluate(() => ({
    headline: document.querySelector("h1")?.textContent?.trim() ?? "",
    headings: [...document.querySelectorAll("h2")].map((node) => node.textContent?.trim() ?? ""),
    v4: Boolean(document.querySelector('[data-v4="page"]')),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    brokenCount: [...document.querySelectorAll("[data-v4-image='commercial']")].filter((node) => {
      const img = node as HTMLImageElement;
      return img.complete && img.naturalWidth === 0;
    }).length,
    sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
    officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
    split: Boolean(document.querySelector(".ds-hero")?.classList.contains("ds-hero--split")),
  }));
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-desktop-1440.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    v4: Boolean(document.querySelector('[data-v4="page"]')),
    heroVisible: Boolean((document.querySelector(".ds-hero__media img") as HTMLImageElement | null)?.naturalWidth),
    brokenCount: [...document.querySelectorAll("[data-v4-image='commercial']")].filter((node) => {
      const img = node as HTMLImageElement;
      return img.complete && img.naturalWidth === 0;
    }).length,
  }));
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-mobile-390.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  const femicoreBefore = snapshotFemicore();
  const productKey = productKeyFromName(PRODUCT_NAME);
  const hop = readHopRecord(productKey);
  if (!hop || hop.href !== REAL_HOP || hop.authorization !== "VALIDATED") {
    throw new Error("The existing hop must stay VALIDATED. 54L does not rewrite it.");
  }
  const catalog = readCatalog(productKey);
  if (!catalog) throw new Error("STOP. No real catalog.");
  const hero = selectApprovedHero(catalog.images);

  const seedUrls = collectSourceUrls({ salesUrl: SALES_URL, affiliateUrl: SALES_URL });
  const beforeFetch = await fetchResearchSources({ urls: seedUrls });
  let beforeSources = beforeFetch.sources;
  const limitations = [
    ...beforeFetch.limitations,
    "Execution 54L measures research coverage. No paid API calls.",
    `Controlled limits: ${RESEARCH_LIMITS.maxSeedUrls} seeds, ${RESEARCH_LIMITS.maxDiscoveredUrls} discovered, ${RESEARCH_LIMITS.maxFetchUrls} fetches, depth ${RESEARCH_LIMITS.maxDepth}, ${RESEARCH_LIMITS.maxElapsedMs} ms.`,
  ];
  if (beforeSources.length === 0 && existsSync(FIXTURE_HTML)) {
    beforeSources = [{ url: SALES_URL, retrievedAt: new Date().toISOString(), pageCategory: "PRIMARY", html: readFileSync(FIXTURE_HTML, "utf8") }];
    limitations.push("Live seed fetch failed. Stored laboratory fixture HTML was used and labeled as fallback.");
  }

  const afterFetch = await fetchCoverageSources({ urls: seedUrls, discoverAdditional: true });
  let afterSources = afterFetch.sources;
  limitations.push(...afterFetch.limitations);
  if (afterSources.length === 0 && beforeSources.length) afterSources = beforeSources;

  const before = buildFromSources(beforeSources);
  const after = buildFromSources(afterSources);
  const beforeMatrix = buildSourceCoverageMatrix(beforeFetch.records, beforeSources);
  const afterMatrix = buildSourceCoverageMatrix(afterFetch.records.length ? afterFetch.records : beforeFetch.records, afterSources);
  const beforeEvidence = coverageEvidenceFromRegistry({
    registry: before.registry,
    productId: productKey,
    sourceClassByUrl: classMap(beforeSources),
  });
  const afterEvidence = coverageEvidenceFromRegistry({
    registry: after.registry,
    productId: productKey,
    sourceClassByUrl: classMap(afterSources),
  });
  const newEvidence = usableNewEvidence({
    beforeIds: new Set(beforeEvidence.map((item) => keyOf(item.informationType, item.excerpt))),
    after: afterEvidence,
  });
  const prices = verifyPrices(
    afterSources.flatMap((source) =>
      extractPriceCandidates({
        html: source.html ?? "",
        url: source.url,
        retrievedAt: source.retrievedAt ?? null,
        sourceClass: classMap(afterSources).get(source.url) ?? "UNKNOWN",
      }),
    ),
  );
  const coverageBefore = scoreProductCoverage({
    contract: before.contract,
    priceStatus: "PRICE_ABSENT",
    provenancePresent: beforeEvidence.some((item) => Boolean(item.sourceUrl)),
  });
  const coverageAfter = scoreProductCoverage({
    contract: after.contract,
    priceStatus: prices.status,
    provenancePresent: afterEvidence.some((item) => Boolean(item.sourceUrl)),
  });

  writeJson("pipeline-audit.json", {
    stages: [
      { stage: "Product Input", status: "PRESENT", note: "Operator name, category, and sales URL." },
      { stage: "Source Discovery", status: "LIMITED_BEFORE", beforeUrls: seedUrls, afterDiscovered: afterFetch.discovered, skipped: afterFetch.skippedDiscoveries },
      { stage: "Source Classification", status: "IMPLEMENTED", classes: afterMatrix.map((item) => ({ url: item.url, class: item.sourceClass, confidence: item.identityConfidence })) },
      { stage: "Source Fetch", status: afterFetch.records.some((item) => !item.ok) ? "PARTIAL" : "FETCHED", records: afterFetch.records },
      { stage: "Content Extraction", status: "PRESENT", note: "HTML, JSON-LD, headings, and h3 FAQ pairs." },
      { stage: "Evidence Registry", status: "PRESENT", before: beforeEvidence.length, after: afterEvidence.length },
      { stage: "Product Contract", status: "PRESENT", faq: after.contract.faq?.length ?? 0, benefits: after.contract.benefits?.length ?? 0 },
      { stage: "Quality Gates", status: "UNCHANGED", note: "Coverage score is diagnostic and does not authorize commerce." },
    ],
    priorLimitation: "54K fetched only the sales URL. Absence on the presell was not proof of absence in the source.",
  });
  writeJson("source-coverage-matrix.json", { before: beforeMatrix, after: afterMatrix });
  writeJson("new-sources.json", { discovered: afterFetch.discovered, fetched: afterFetch.records.filter((item) => !seedUrls.includes(item.url) && !seedUrls.includes(item.requestedUrl)) });
  writeJson("new-evidence.json", newEvidence);
  writeJson("fields-used.json", afterMatrix.flatMap((row) => row.fieldsUsed.map((field) => ({ url: row.url, field }))));
  writeJson("fields-rejected.json", afterMatrix.flatMap((row) => row.fieldsRejected.map((item) => ({ url: row.url, ...item }))));
  writeJson("coverage-comparison.json", { before: coverageBefore, after: coverageAfter });
  writeJson("price-verification.json", prices);
  writeJson("research-limits.json", RESEARCH_LIMITS);

  const shouldRegenerate = newEvidence.length > 0;
  writeJson("regeneration-decision.json", {
    regenerate: shouldRegenerate,
    reason: shouldRegenerate
      ? "New publishable or attributed evidence was recovered from the sources."
      : "No new usable evidence. Existing previews were not forced.",
  });

  let editorialUrl: string | null = null;
  let bofuUrl: string | null = null;
  let contentQuality = "NOT_RERUN";
  let grounding = "NOT_RERUN";
  let visual = { desktop: "NOT_RERUN", mobile: "NOT_RERUN" };
  const official = prepareOfficialOfferCta(hop);

  if (shouldRegenerate && catalog) {
    const editorial = await buildMode({ query: `what is ${PRODUCT_NAME}`, facts: after.presell.facts, sources: afterSources, catalog });
    const bofu = await buildMode({ query: `buy ${PRODUCT_NAME}`, facts: after.presell.facts, sources: afterSources, catalog });
    const editorialId = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
    const bofuId = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
    const sessionId = `sbx-${randomBytes(8).toString("hex")}`;
    const ctaPath = buildSandboxCtaPath({ sessionId, productKey, landingPageId: bofuId, presellMode: "PRESELL_BOFU" });
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
    const sandboxModel = applySandboxToModel(bofu.model, { href: ctaPath });
    persistGeneration({
      id: editorialId,
      productKey,
      model: editorial.model,
      copy: editorial.copy,
      evaluated: editorial.evaluated,
      defects: editorial.defects,
      qualityInspection: editorial.qualityInspection,
      sources: afterFetch.records,
      limitations: [...limitations, "Editorial preview. No sandbox CTA."],
    });
    persistGeneration({
      id: bofuId,
      productKey,
      model: sandboxModel,
      copy: bofu.copy,
      evaluated: bofu.evaluated,
      defects: bofu.defects,
      qualityInspection: bofu.qualityInspection,
      sources: afterFetch.records,
      limitations,
      sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true },
    });
    writeJson("quality-gates.json", {
      editorial: { evaluated: editorial.evaluated, inspection: editorial.qualityInspection, replay: editorial.replay },
      bofu: { evaluated: bofu.evaluated, inspection: bofu.qualityInspection, replay: bofu.replay },
    });
    writeJson("cta-status.json", {
      production: official,
      sandbox: prepareSandboxCta({
        lab: true,
        href: ctaPath,
        session: { version: 1, sessionId, productKey, landingPageId: bofuId, presellMode: "PRESELL_BOFU", ctaPath, createdAt: new Date().toISOString(), productionPromotionBlocked: true },
      }),
      hop: { href: hop.href, authorization: hop.authorization },
      promotion: { allowed: false, blocked: productionPublicationBlockedForSandbox({ sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true } }) },
    });
    const editorialShot = await capturePreview(editorialId, "editorial");
    const bofuShot = await capturePreview(bofuId, "bofu");
    writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot });
    writeJson("generations.json", { editorialId, bofuId });
    editorialUrl = editorialShot.url;
    bofuUrl = bofuShot.url;
    contentQuality = editorial.qualityInspection.status === "PASS" && bofu.qualityInspection.status === "PASS" ? "PASS" : `${editorial.qualityInspection.status}/${bofu.qualityInspection.status}`;
    grounding = editorial.grounding.every((item) => item.allowed) && bofu.grounding.every((item) => item.allowed) ? "PASS" : "BLOCKED";
    visual = {
      desktop: editorialShot.desktop.v4 && bofuShot.desktop.v4 && !editorialShot.desktop.overflowX && editorialShot.desktop.brokenCount === 0 ? "PASS" : "FAIL",
      mobile: editorialShot.mobile.v4 && bofuShot.mobile.heroVisible && !editorialShot.mobile.overflowX ? "PASS" : "FAIL",
    };
  }

  const femicoreAfter = snapshotFemicore();
  const femicorePreserved = femicoreBefore.hop === femicoreAfter.hop && femicoreBefore.catalog === femicoreAfter.catalog;
  writeJson("femicore-preservation.json", { before: femicoreBefore, after: femicoreAfter, preserved: femicorePreserved });

  const approved = catalog.images.filter((item) => item.status === "USER_APPROVED");
  const report = {
    EXECUTION_54L_STATUS: femicorePreserved && hop.authorization === "VALIDATED" && !official.visible ? "PASS" : "PARTIAL",
    RESEARCH_PIPELINE_AUDIT: "data/evidence/execution-54l-research-coverage/pipeline-audit.json",
    SOURCES_BEFORE: beforeFetch.records.length || beforeSources.length,
    SOURCES_AFTER: afterFetch.records.length || afterSources.length,
    NEW_SOURCES_DISCOVERED: afterFetch.discovered.length,
    NEW_SOURCES_FETCHED: afterFetch.records.filter((item) => item.ok && !seedUrls.includes(item.requestedUrl) && !seedUrls.includes(item.url)).length,
    SOURCE_CLASSIFICATION_STATUS: afterMatrix.length ? "PASS" : "EMPTY",
    NEW_EVIDENCE_COUNT: newEvidence.length,
    EVIDENCE_REGISTRY_STATUS: afterEvidence.length ? "PRESENT" : "EMPTY",
    PRODUCT_COVERAGE_BEFORE: coverageBefore.total,
    PRODUCT_COVERAGE_AFTER: coverageAfter.total,
    FAQ_COVERAGE_STATUS: (after.contract.faq?.length ?? 0) > 0 ? "PRESENT" : "OMITTED",
    BENEFITS_EVIDENCE_STATUS: (after.contract.benefits?.length ?? 0) > 0 ? "ATTRIBUTED" : "ABSENT",
    PRICE_VERIFICATION_STATUS: prices.status,
    GUARANTEE_TERMS_STATUS: after.contract.guarantee ? "SELLER_STATED" : "ABSENT",
    UNRESOLVED_INFORMATION_GAPS: coverageAfter.unresolvedGaps,
    PRODUCT_CONTRACT_UPDATED: newEvidence.length > 0,
    CONTENT_REGENERATED: shouldRegenerate,
    CONTENT_QUALITY_STATUS: contentQuality,
    SEMANTIC_GROUNDING_STATUS: grounding,
    COMMERCIAL_AUTHORIZATION_STATUS: official.visible ? "VISIBLE" : "BLOCKED",
    CONTACT_EMAIL_STATUS: getPublicContactEmail() ? "CONFIGURED" : "NOT_CONFIGURED",
    RENDERER_V4_PRESERVED: true,
    APPROVED_ASSETS_PRESERVED: approved.length,
    HERO_PACKSHOT_STATUS: hero ? `PRESERVED:${hero.fileName}` : "NONE",
    HOPLINK_STATUS: hop.authorization,
    FEMICORE_DATA_PRESERVED: femicorePreserved,
    DESKTOP_VISUAL_STATUS: visual.desktop,
    MOBILE_VISUAL_STATUS: visual.mobile,
    EDITORIAL_PREVIEW_URL: editorialUrl,
    BOFU_PREVIEW_URL: bofuUrl,
    SANDBOX_CTA_STATUS: shouldRegenerate ? "ARMED_LOCAL" : "UNCHANGED",
    PRODUCTION_CTA_STATUS: "BLOCKED",
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    NEXT_RECOMMENDED_ACTION: "STOP. Do not publish, authorize the commercial CTA, invent a contact address, or start the next execution.",
  };
  writeJson("report.json", report);
  writeJson("index.json", { execution: "54L", evidence: "data/evidence/execution-54l-research-coverage" });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
