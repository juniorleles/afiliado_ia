// npx tsx scripts/run-lp-generator-54j.ts
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
import { classifyVisualClass } from "../src/lib/real-product-assets/visual-class.ts";
import { DEFAULT_STORE_ROOT, readCatalog, upsertImage, writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { storeApprovedFile } from "../src/lib/real-product-assets/persist.ts";
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
  getPublicSiteName,
  getPublicSiteUrl,
} from "../src/lib/public-site.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import type { DiscoveredImage, ProductCatalog } from "../src/lib/real-product-assets/types.ts";

const PRODUCT_NAME = "ProDentim";
const SALES_URL = "https://prodentim101.com/text.php?hop=zzzzz&hopId=6c9c6dd4-9c61-4086-8445-637fae0c985b";
const REAL_HOP = "https://6b503qvz1icsbs7otcn82psacg.hop.clickbank.net";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54j-approved-assets");
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

function inspectApproved(image: DiscoveredImage) {
  const visualClass = classifyVisualClass(image);
  const exists = Boolean(image.localFile && existsSync(image.localFile));
  const hash = exists && image.localFile ? fileHash(image.localFile) : null;
  const size = exists && image.localFile ? readFileSync(image.localFile).length : null;
  return {
    id: image.id,
    fileName: image.fileName,
    url: image.url,
    sourcePage: image.sourcePage,
    probableKind: image.probableKind,
    visualClass,
    promotional: visualClass === "PROMOTIONAL",
    status: image.status,
    match: image.match,
    width: image.width,
    height: image.height,
    format: image.format,
    byteLength: image.byteLength,
    localFile: image.localFile,
    sha256: image.sha256,
    fileExists: exists,
    hashMatches: Boolean(hash && image.sha256 && hash === image.sha256),
    sizeMatches: size != null && image.byteLength != null ? size === image.byteLength : false,
    integrity: exists && hash === image.sha256 && size === image.byteLength ? "INTACT" : exists ? "MISMATCH" : "MISSING",
  };
}

async function rematerializeApproved(catalog: ProductCatalog) {
  let next = catalog;
  const downloaded: string[] = [];
  const skipped: string[] = [];
  for (const image of catalog.images.filter((item) => item.status === "USER_APPROVED")) {
    const check = inspectApproved(image);
    if (check.integrity === "INTACT") {
      skipped.push(image.id);
      continue;
    }
    if (classifyVisualClass(image) === "PROMOTIONAL") {
      skipped.push(image.id);
      continue;
    }
    const stored = await storeApprovedFile(image, DEFAULT_STORE_ROOT);
    if (!stored.ok) {
      throw new Error(`Approved asset ${image.id} could not be materialized: ${stored.reason}`);
    }
    next = upsertImage(next, { ...stored.image, status: "USER_APPROVED" });
    downloaded.push(image.id);
  }
  if (downloaded.length) writeCatalog(next);
  return { catalog: downloaded.length ? readCatalog(catalog.productKey) ?? next : catalog, downloaded, skipped };
}

async function capturePreview(generationId: string, prefix: string) {
  mkdirSync(SHOTS, { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${generationId}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 90000 });
  await page.waitForSelector("[data-v4-image='commercial']", { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const images = [...document.querySelectorAll("[data-v4-image='commercial']")] as HTMLImageElement[];
      return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0);
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(300);
  const desktop = await page.evaluate(() => {
    const hero = document.querySelector(".ds-hero");
    const media = document.querySelector(".ds-hero__media img") as HTMLImageElement | null;
    const frame = document.querySelector(".ds-hero__frame") as HTMLElement | null;
    const images = [...document.querySelectorAll("[data-v4-image='commercial']")].map((node) => {
      const img = node as HTMLImageElement;
      return {
        src: img.currentSrc || img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        displayWidth: Math.round(img.getBoundingClientRect().width),
        displayHeight: Math.round(img.getBoundingClientRect().height),
        broken: img.complete && img.naturalWidth === 0,
        objectFit: getComputedStyle(img).objectFit,
      };
    });
    const heroImage = media
      ? {
          src: media.currentSrc || media.src,
          naturalWidth: media.naturalWidth,
          naturalHeight: media.naturalHeight,
          displayWidth: Math.round(media.getBoundingClientRect().width),
          displayHeight: Math.round(media.getBoundingClientRect().height),
          frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null,
          frameHeight: frame ? Math.round(frame.getBoundingClientRect().height) : null,
          objectFit: getComputedStyle(media).objectFit,
          broken: media.complete && media.naturalWidth === 0,
        }
      : null;
    const naturalRatio = heroImage && heroImage.naturalHeight ? heroImage.naturalWidth / heroImage.naturalHeight : null;
    const displayRatio = heroImage && heroImage.displayHeight ? heroImage.displayWidth / heroImage.displayHeight : null;
    return {
      headline: document.querySelector("h1")?.textContent?.trim() ?? "",
      photo: document.querySelector("[data-v4-photo]")?.getAttribute("data-v4-photo") ?? "",
      split: Boolean(hero?.classList.contains("ds-hero--split")),
      images,
      heroImage,
      proportionPreserved:
        naturalRatio != null && displayRatio != null ? Math.abs(naturalRatio - displayRatio) < 0.08 : false,
      brokenCount: images.filter((item) => item.broken).length,
      sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
      officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      v4: Boolean(document.querySelector('[data-v4="page"]')),
    };
  });
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-desktop-1440.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => {
      const hero = document.querySelector(".ds-hero__media img") as HTMLImageElement | null;
      return Boolean(hero && hero.complete && hero.naturalWidth > 0);
    },
    { timeout: 30000 },
  );
  await page.waitForTimeout(300);
  const mobile = await page.evaluate(() => {
    const media = document.querySelector(".ds-hero__media img") as HTMLImageElement | null;
    const images = [...document.querySelectorAll("[data-v4-image='commercial']")].map((node) => {
      const img = node as HTMLImageElement;
      return { src: img.currentSrc || img.src, broken: img.complete && img.naturalWidth === 0, naturalWidth: img.naturalWidth };
    });
    return {
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
      officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
      v4: Boolean(document.querySelector('[data-v4="page"]')),
      split: Boolean(document.querySelector(".ds-hero")?.classList.contains("ds-hero--split")),
      heroVisible: Boolean(media && media.naturalWidth > 0),
      brokenCount: images.filter((item) => item.broken).length,
      images,
    };
  });
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-mobile-390.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile };
}

async function buildMode(input: { query: string; facts: ProductFacts; sources: EnrichmentSource[]; catalog: ProductCatalog }) {
  const enriched = enrichProduct({ scenarioKey: "execution-54j", contractInput: contractInputOf(input.facts), sources: input.sources });
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
    scenarioKey: "execution-54j",
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
  });
  const model = overlayApprovedAssets(composed, input.catalog);
  const finalQuality = inspectContentQuality({ copy: model.copy, contract: afterContract, brief: afterBrief });
  const qualityStatus = finalQuality.length === 0 ? (repaired.repairs.length ? "REPAIRED" : "PASS") : "BLOCKED";
  const qualityInspection = persistQualityInspection({
    copy: model.copy,
    contract: afterContract,
    brief: afterBrief,
    repaired: { status: qualityStatus, defects: finalQuality, repairs: repaired.repairs, copy: model.copy },
    timestamp: new Date().toISOString(),
  });
  const replay = replayQualityInspection({
    copy: model.copy,
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
      model,
      catalog: input.catalog,
    }),
    ...finalQuality,
  ];
  const evaluated = evaluateGenerationGates({ defects, contentQuality: qualityStatus });
  return {
    contract: afterContract,
    brief: afterBrief,
    copy: repaired.copy,
    blueprint,
    model,
    applied,
    grounding: groundCopy(repaired.copy, afterContract),
    defects,
    evaluated,
    repaired,
    qualityInspection,
    replay,
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
    throw new Error("The existing ProDentim hop must stay VALIDATED. 54J does not rewrite it.");
  }

  const catalogBefore = readCatalog(productKey);
  if (!catalogBefore) {
    writeJson("approval-status.json", { found: false, reason: "The real ProDentim catalog is missing." });
    throw new Error("STOP. No real catalog. Integration was not started.");
  }
  const approved = catalogBefore.images.filter((item) => item.status === "USER_APPROVED");
  const approvalRows = approved.map(inspectApproved);
  writeJson("approval-status.json", {
    count: approved.length,
    images: approvalRows,
    events: catalogBefore.events.filter((item) => item.status === "USER_APPROVED"),
  });
  if (approved.length === 0) {
    throw new Error("STOP. No USER_APPROVED images are persisted. Integration was not started.");
  }

  const materialized = await rematerializeApproved(catalogBefore);
  const catalog = materialized.catalog;
  const hero = selectApprovedHero(catalog.images);
  writeJson("materialization.json", {
    downloaded: materialized.downloaded,
    skippedIntact: materialized.skipped,
    hero: hero
      ? { id: hero.id, fileName: hero.fileName, scoreSource: "selectApprovedHero", visualClass: classifyVisualClass(hero) }
      : null,
    note: "Existing catalog scoring selected the hero. No arbitrary choice and no sandbox promotional copy.",
  });
  if (!hero) {
    throw new Error("STOP. Approved images exist but none are eligible as a packshot/gallery hero.");
  }

  const fetched = await fetchResearchSources({ urls: collectSourceUrls({ salesUrl: SALES_URL, affiliateUrl: SALES_URL }) });
  let sources = fetched.sources;
  const limitations = [
    ...fetched.limitations,
    "Execution 54J overlays operator-approved real-catalog assets. No paid API calls.",
    "Copy was regenerated with the same deterministic pipeline. No commercial CTA.",
  ];
  if (sources.length === 0 && existsSync(FIXTURE_HTML)) {
    sources = [{
      url: SALES_URL,
      retrievedAt: new Date().toISOString(),
      pageCategory: "PRIMARY",
      html: readFileSync(FIXTURE_HTML, "utf8"),
    }];
    limitations.push("Live source fetch failed. Stored laboratory fixture HTML was used and labeled as fallback.");
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

  const editorial = await buildMode({ query: `what is ${PRODUCT_NAME}`, facts: structured.facts, sources, catalog });
  const bofu = await buildMode({ query: `buy ${PRODUCT_NAME}`, facts: structured.facts, sources, catalog });

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
  const sandboxModel = applySandboxToModel(bofu.model, { href: ctaPath });

  persistGeneration({
    id: editorialId,
    productKey,
    model: editorial.model,
    copy: editorial.copy,
    evaluated: editorial.evaluated,
    defects: editorial.defects,
    qualityInspection: editorial.qualityInspection,
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
    qualityInspection: bofu.qualityInspection,
    sources: fetched.records,
    limitations,
    sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true },
  });

  const official = prepareOfficialOfferCta(hop);
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
    hop: { href: hop.href, authorization: hop.authorization },
    promotion: { allowed: false, blocked: productionPublicationBlockedForSandbox({ sandbox: { enabled: true, sessionId, ctaPath, productionPromotionBlocked: true } }) },
  });
  writeJson("overlay.json", {
    heroId: hero.id,
    editorialSrc: editorial.model.commercialImage?.src ?? null,
    bofuSrc: sandboxModel.commercialImage?.src ?? null,
    gallery: (editorial.model.galleryImages ?? []).map((item) => item.src),
  });

  const editorialShot = await capturePreview(editorialId, "editorial");
  const bofuShot = await capturePreview(bofuId, "bofu");
  writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot });
  writeJson("urls.json", { editorial: editorialShot.url, bofu: bofuShot.url });
  writeJson("generations.json", { editorialId, bofuId });

  const femicoreAfter = snapshotFemicore();
  const femicorePreserved = femicoreBefore.hop === femicoreAfter.hop && femicoreBefore.catalog === femicoreAfter.catalog;
  writeJson("femicore-preservation.json", { before: femicoreBefore, after: femicoreAfter, preserved: femicorePreserved });

  const approvedFinal = (readCatalog(productKey)?.images ?? []).filter((item) => item.status === "USER_APPROVED");
  const heroRendered =
    editorialShot.desktop.split &&
    editorialShot.desktop.heroImage &&
    !editorialShot.desktop.heroImage.broken &&
    editorialShot.desktop.heroImage.src.includes(hero.id) &&
    editorialShot.desktop.proportionPreserved &&
    editorialShot.desktop.heroImage.objectFit === "contain";
  const visualOk = (shot: typeof editorialShot) =>
    shot.desktop.v4 &&
    shot.mobile.v4 &&
    !shot.desktop.overflowX &&
    !shot.mobile.overflowX &&
    shot.desktop.brokenCount === 0 &&
    shot.mobile.brokenCount === 0 &&
    shot.desktop.split &&
    shot.mobile.heroVisible;
  const report = {
    EXECUTION_54J_STATUS:
      femicorePreserved &&
      approvedFinal.length === approved.length &&
      hop.authorization === "VALIDATED" &&
      !official.visible &&
      heroRendered &&
      visualOk(editorialShot) &&
      visualOk(bofuShot) &&
      editorial.qualityInspection.status === "PASS" &&
      bofu.qualityInspection.status === "PASS"
        ? "PASS"
        : "PARTIAL",
    REAL_CATALOG_USER_APPROVED_COUNT: approvedFinal.length,
    APPROVED_ASSET_IDS: approvedFinal.map((item) => item.id),
    APPROVED_IMAGE_FILES: approvedFinal.map((item) => item.localFile),
    ASSETS_DOWNLOADED: materialized.downloaded.length,
    HERO_PACKSHOT_STATUS: heroRendered ? `RENDERED:${hero.fileName}` : `MISSING:${hero.fileName}`,
    EDITORIAL_IMAGE_RENDERED: Boolean(editorialShot.desktop.heroImage && !editorialShot.desktop.heroImage.broken),
    BOFU_IMAGE_RENDERED: Boolean(bofuShot.desktop.heroImage && !bofuShot.desktop.heroImage.broken),
    DESKTOP_VISUAL_STATUS: visualOk(editorialShot) && visualOk(bofuShot) && !editorialShot.desktop.overflowX ? "PASS" : "FAIL",
    MOBILE_VISUAL_STATUS: editorialShot.mobile.heroVisible && bofuShot.mobile.heroVisible && !editorialShot.mobile.overflowX && !bofuShot.mobile.overflowX ? "PASS" : "FAIL",
    CONTENT_QUALITY_STATUS: editorial.qualityInspection.status === "PASS" && bofu.qualityInspection.status === "PASS" ? "PASS" : `${editorial.qualityInspection.status}/${bofu.qualityInspection.status}`,
    SEMANTIC_GROUNDING_STATUS: editorial.grounding.every((item) => item.allowed) && bofu.grounding.every((item) => item.allowed) ? "PASS" : "BLOCKED",
    RENDERER_V4_PRESERVED: editorialShot.desktop.v4 && bofuShot.desktop.v4,
    FEMICORE_DATA_PRESERVED: femicorePreserved,
    SANDBOX_CTA_STATUS: sandboxCta.visible && bofuShot.desktop.sandboxCtas > 0 ? "ARMED_LOCAL" : "BLOCKED",
    PRODUCTION_CTA_STATUS: official.visible || bofuShot.desktop.officialCtas > 0 ? "VISIBLE" : "BLOCKED",
    EDITORIAL_PREVIEW_URL: editorialShot.url,
    BOFU_PREVIEW_URL: bofuShot.url,
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54j-approved-assets/screenshots/editorial-desktop-1440.jpg",
      "data/evidence/execution-54j-approved-assets/screenshots/editorial-mobile-390.jpg",
      "data/evidence/execution-54j-approved-assets/screenshots/bofu-desktop-1440.jpg",
      "data/evidence/execution-54j-approved-assets/screenshots/bofu-mobile-390.jpg",
    ],
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    NEXT_RECOMMENDED_ACTION: "STOP. Do not publish, authorize the commercial CTA, or start the next execution.",
  };
  writeJson("report.json", report);
  writeJson("index.json", { execution: "54J", evidence: "data/evidence/execution-54j-approved-assets", generations: { editorialId, bofuId } });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
