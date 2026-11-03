// npx tsx scripts/run-lp-generator-54i.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
import { imageIdFor } from "../src/lib/real-product-assets/authorize.ts";
import { classifyProbableKind, isRelevantKind, matchDiscoveredProduct, policyBlockFor } from "../src/lib/real-product-assets/classify.ts";
import { imagesFromHtml } from "../src/lib/real-product-assets/discover.ts";
import { classifyVisualClass } from "../src/lib/real-product-assets/visual-class.ts";
import {
  DEFAULT_STORE_ROOT,
  emptyCatalog,
  mergeDiscoveredWithoutApproval,
  readCatalog,
  writeCatalog,
} from "../src/lib/real-product-assets/store.ts";
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
import type { DiscoveredImage } from "../src/lib/real-product-assets/types.ts";

const PRODUCT_NAME = "ProDentim";
const SALES_URL = "https://prodentim101.com/text.php?hop=zzzzz&hopId=6c9c6dd4-9c61-4086-8445-637fae0c985b";
const REAL_HOP = "https://6b503qvz1icsbs7otcn82psacg.hop.clickbank.net";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54i-visual-quality");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const FEMICORE_HOP = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const FEMICORE_CATALOG = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const E54F = path.join(process.cwd(), "data", "evidence", "execution-54f-prodentim-sandbox");
const E54G = path.join(process.cwd(), "data", "evidence", "execution-54g-product-readiness");
const E54H = path.join(process.cwd(), "data", "evidence", "execution-54h-content-quality-repair");
const FIXTURE_HTML = path.join(process.cwd(), "scripts", "fixtures", "prodentim-vsl.html");
const ISOLATED_PUBLIC = "/lab-fixtures/synthetic-packshot.jpg";

function writeJson(name: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
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

function fileNameFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    return name || url;
  } catch {
    return url.split("/").filter(Boolean).pop() ?? url;
  }
}

function formatFromName(fileName: string): string | null {
  const ext = path.extname(fileName).replace(".", "").toLowerCase();
  return ext || null;
}

function discoveredFromUrl(input: { url: string; sourcePage: string; productName: string; productKey: string; now: string }): DiscoveredImage {
  const fileName = fileNameFromUrl(input.url);
  const probableKind = classifyProbableKind({ url: input.url, fileName, alt: null });
  const policyBlock = policyBlockFor(`${fileName} ${input.url}`);
  return {
    id: imageIdFor(input.url),
    productKey: input.productKey,
    productName: input.productName,
    url: input.url,
    sourcePage: input.sourcePage,
    fileName,
    alt: null,
    width: null,
    height: null,
    format: formatFromName(fileName),
    byteLength: null,
    probableKind,
    relevant: isRelevantKind(probableKind) && !policyBlock,
    match: matchDiscoveredProduct(input.productName, input.url, fileName, null),
    policyBlock,
    status: policyBlock ? "BLOCKED_BY_POLICY" : "PENDING_USER_APPROVAL",
    visualRole: "UNASSIGNED",
    localFile: null,
    sha256: null,
    discoveredAt: input.now,
  };
}

function existingLocalFiles(productKey: string, imageId: string): string[] {
  const dirs = [
    path.join(DEFAULT_STORE_ROOT, productKey, "files"),
    path.join(DEFAULT_SANDBOX_ASSET_ROOT, productKey, "files"),
  ];
  const found: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(imageId)) continue;
      const full = path.join(dir, name);
      if (existsSync(full) && statSync(full).isFile()) found.push(full);
    }
  }
  return found;
}

function listDirFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => existsSync(file) && statSync(file).isFile());
}

function inventoryImages(productKey: string, productName: string, sources: EnrichmentSource[]) {
  const now = new Date().toISOString();
  const discovery54f = readJson(path.join(E54F, "image-discovery.json")) as { found?: Array<{ id: string; url: string; status: string; relevant: boolean; match: string }> } | null;
  const sandbox54f = readJson(path.join(E54F, "sandbox-assets.json")) as { approved?: unknown; skipped?: unknown; count?: number } | null;
  const real54f = readJson(path.join(E54F, "real-catalog-approvals.json"));
  const auth54h = readJson(path.join(E54H, "image-authorization.json"));
  const auth54g = readJson(path.join(E54G, "image-authorization.json"));
  const fromHtml = sources.flatMap((source) => (source.html ? imagesFromHtml({ productName, productKey, pageUrl: source.url, html: source.html }) : []));
  const from54f = (discovery54f?.found ?? []).map((row) =>
    discoveredFromUrl({ url: row.url, sourcePage: SALES_URL, productName, productKey, now }),
  );
  const byUrl = new Map<string, DiscoveredImage>();
  for (const image of [...from54f, ...fromHtml]) {
    if (!byUrl.has(image.url)) byUrl.set(image.url, image);
  }
  const discovered = [...byUrl.values()];
  const rows = discovered.map((image) => {
    const locals = existingLocalFiles(productKey, image.id);
    const visualClass = classifyVisualClass(image);
    return {
      id: image.id,
      fileName: image.fileName,
      url: image.url,
      sourcePage: image.sourcePage,
      probableKind: image.probableKind,
      visualClass,
      promotional: visualClass === "PROMOTIONAL",
      fixture: false,
      status: image.status,
      match: image.match,
      relevant: image.relevant,
      policyBlock: image.policyBlock,
      format: image.format,
      width: image.width,
      height: image.height,
      associatedContract: "Product Contract images.hero only after USER_APPROVED packshot",
      downloaded: locals.length > 0,
      localFiles: locals,
    };
  });
  const names = rows.map((item) => item.fileName.toLowerCase());
  const duplicates = rows.filter((item, index) => names.indexOf(item.fileName.toLowerCase()) !== index).map((item) => item.fileName);
  return {
    prior: {
      execution54f: {
        discoveryFile: existsSync(path.join(E54F, "image-discovery.json")) ? path.join(E54F, "image-discovery.json") : null,
        discoveredCount: discovery54f?.found?.length ?? 0,
        sandbox: sandbox54f,
        realCatalogApprovals: real54f,
      },
      execution54g: { imageAuthorization: auth54g },
      execution54h: { imageAuthorization: auth54h },
    },
    directoriesChecked: [
      path.join(DEFAULT_STORE_ROOT, productKey),
      path.join(DEFAULT_STORE_ROOT, productKey, "files"),
      path.join(DEFAULT_SANDBOX_ASSET_ROOT, productKey),
      path.join(DEFAULT_SANDBOX_ASSET_ROOT, productKey, "files"),
    ].map((dir) => ({ dir, exists: existsSync(dir), files: listDirFiles(dir) })),
    discovered: rows,
    downloaded: rows.filter((item) => item.downloaded),
    packshots: rows.filter((item) => item.visualClass === "PRODUCT_PACKSHOT"),
    promotional: rows.filter((item) => item.visualClass === "PROMOTIONAL"),
    duplicates,
    reconstructed: discovered,
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
  const desktop = await page.evaluate(() => {
    const hero = document.querySelector(".ds-hero");
    const band = document.querySelector(".ds-hero-band");
    const heroBox = hero?.getBoundingClientRect();
    const bandBox = band?.getBoundingClientRect();
    const leftGap = heroBox && bandBox ? heroBox.left - bandBox.left : null;
    const rightGap = heroBox && bandBox ? bandBox.right - heroBox.right : null;
    return {
      headline: document.querySelector("h1")?.textContent?.trim() ?? "",
      subheadline: document.querySelector(".ds-lead")?.textContent?.trim() ?? "",
      kicker: document.querySelector(".ds-kicker")?.textContent?.trim() ?? "",
      composition: document.querySelector("[data-v4-composition]")?.getAttribute("data-v4-composition") ?? "",
      photo: document.querySelector("[data-v4-photo]")?.getAttribute("data-v4-photo") ?? "",
      sections: [...document.querySelectorAll("[data-v4-section]")].map((item) => item.getAttribute("data-v4-section")),
      sectionTitles: [...document.querySelectorAll("[data-v4-section] h2")].map((item) => item.textContent?.trim() ?? ""),
      images: [...document.querySelectorAll("[data-v4-image='commercial']")].map((item) => (item as HTMLImageElement).src),
      split: Boolean(hero?.classList.contains("ds-hero--split")),
      editorial: Boolean(hero?.classList.contains("ds-hero--editorial") || hero?.classList.contains("ds-hero--info")),
      centered: leftGap != null && rightGap != null ? Math.abs(leftGap - rightGap) < 48 : false,
      leftGap,
      rightGap,
      sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
      officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      v4: Boolean(document.querySelector('[data-v4="page"]')),
    };
  });
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-desktop-1440.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
    officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
    v4: Boolean(document.querySelector('[data-v4="page"]')),
    split: Boolean(document.querySelector(".ds-hero")?.classList.contains("ds-hero--split")),
  }));
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-mobile-390.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile };
}

async function buildMode(input: { query: string; facts: ProductFacts; sources: EnrichmentSource[] }) {
  const enriched = enrichProduct({ scenarioKey: "execution-54i", contractInput: contractInputOf(input.facts), sources: input.sources });
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
    scenarioKey: "execution-54i",
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
    throw new Error("The existing ProDentim hop must stay VALIDATED. 54I does not rewrite it.");
  }

  const fetched = await fetchResearchSources({ urls: collectSourceUrls({ salesUrl: SALES_URL, affiliateUrl: SALES_URL }) });
  let sources = fetched.sources;
  const limitations = [
    ...fetched.limitations,
    "Execution 54I inventories discovered images and regenerates previews. No paid API calls.",
    "No image was marked USER_APPROVED. Promotional materials were not promoted to packshots.",
    "Sandbox CTA is local only. Production publication stays blocked.",
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
  writeJson("product-facts.json", {
    productName: structured.facts.productName,
    kind: structured.facts.productFormat?.value ?? null,
    ingredients: structured.facts.ingredientsOrComponents.map((item) => ({ text: item, class: classifyAttribute(item).class })),
    features: structured.facts.features,
    usage: structured.facts.usageInformation,
    guarantee: structured.facts.guaranteeInformation,
    cautions: structured.facts.cautions,
    description: structured.facts.description ?? null,
  });

  const inventory = inventoryImages(productKey, PRODUCT_NAME, sources);
  const approvedBefore = (readCatalog(productKey)?.images ?? []).filter((item) => item.status === "USER_APPROVED").length;
  const existingCatalog = readCatalog(productKey) ?? emptyCatalog(productKey, PRODUCT_NAME);
  const pendingCatalog = mergeDiscoveredWithoutApproval(existingCatalog, inventory.reconstructed);
  const approvedAfterMerge = pendingCatalog.images.filter((item) => item.status === "USER_APPROVED").length;
  if (approvedAfterMerge !== approvedBefore) {
    throw new Error("54I must not change USER_APPROVED counts on the real catalog.");
  }
  writeCatalog(pendingCatalog);
  const realCatalog = readCatalog(productKey);
  if ((realCatalog?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0) !== approvedBefore) {
    throw new Error("Writing the pending catalog changed USER_APPROVED.");
  }

  writeJson("image-inventory.json", {
    discoveredCount: inventory.discovered.length,
    downloadedCount: inventory.downloaded.length,
    packshotCount: inventory.packshots.length,
    promotionalCount: inventory.promotional.length,
    duplicates: inventory.duplicates,
    directoriesChecked: inventory.directoriesChecked,
    prior: inventory.prior,
    images: inventory.discovered,
  });

  const editorial = await buildMode({ query: `what is ${PRODUCT_NAME}`, facts: structured.facts, sources });
  const bofu = await buildMode({ query: `buy ${PRODUCT_NAME}`, facts: structured.facts, sources });

  const editorialId = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const bofuId = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const isolatedId = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
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

  const editorialModel = overlayApprovedAssets(editorial.model, realCatalog);
  const bofuApproved = overlayApprovedAssets(bofu.model, realCatalog);
  const sandboxModel = applySandboxToModel(bofuApproved, { href: ctaPath });
  const isolatedModel: V4Model = {
    ...editorialModel,
    commercialImage: { src: ISOLATED_PUBLIC, alt: "Isolated laboratory packshot. Not a catalog approval." },
  };

  persistGeneration({
    id: editorialId,
    productKey,
    model: editorialModel,
    copy: editorial.copy,
    evaluated: editorial.evaluated,
    defects: editorial.defects,
    qualityInspection: editorial.qualityInspection,
    sources: fetched.records,
    limitations: [...limitations, "Editorial preview. No sandbox CTA. Scenario A: no USER_APPROVED packshot."],
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
  persistGeneration({
    id: isolatedId,
    productKey,
    model: isolatedModel,
    copy: editorial.copy,
    evaluated: editorial.evaluated,
    defects: editorial.defects,
    qualityInspection: editorial.qualityInspection,
    sources: fetched.records,
    limitations: [
      ...limitations,
      "Scenario B isolated fixture preview. The public lab fixture is not a real-catalog USER_APPROVED asset.",
    ],
  });

  const official = prepareOfficialOfferCta(hop);
  writeJson("hero-diagnosis.json", {
    cause: "Without an approved packshot the V4 hero is editorial (max-width 46rem) and was left-aligned, leaving a large empty band on the right. The split column is applied only when commercialImage exists.",
    expected: {
      withApprovedPackshot: "ds-hero--split and product image on the right",
      withoutApprovedPackshot: "centered editorial hero, no empty image column",
    },
    scenarioACommercial: Boolean(editorialModel.commercialImage),
    scenarioBCommercial: Boolean(isolatedModel.commercialImage),
    realApprovedIds: realCatalog?.images.filter((item) => item.status === "USER_APPROVED").map((item) => item.id) ?? [],
  });
  writeJson("editorial-adjustments.json", {
    editorialHeadline: editorial.copy.headline.text,
    editorialSubheadline: editorial.copy.subheadline?.text ?? null,
    bofuHeadline: bofu.copy.headline.text,
    bofuSubheadline: bofu.copy.subheadline?.text ?? null,
    sectionTitles: {
      editorial: editorial.copy.sections.map((item) => ({ type: item.sectionType, title: item.headline.text, items: item.items.length, body: item.body.length })),
      bofu: bofu.copy.sections.map((item) => ({ type: item.sectionType, title: item.headline.text, items: item.items.length, body: item.body.length })),
    },
    notes: [
      "Headlines now prefer documented product kind and composition over generic overview/details lines.",
      "Natural Formula is treated as a generic kind and is not used as the headline or subheadline.",
      "Ingredient lists use Ingredients. Usage-only sections use Directions for Use. Cautions stand alone when shipping and returns are absent.",
    ],
  });
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

  const editorialShot = await capturePreview(editorialId, "editorial");
  const bofuShot = await capturePreview(bofuId, "bofu");
  const isolatedShot = await capturePreview(isolatedId, "isolated-approved");
  writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot, isolated: isolatedShot });
  writeJson("urls.json", {
    editorial: editorialShot.url,
    bofu: bofuShot.url,
    isolated: isolatedShot.url,
    gallery: `${BASE}/admin/lab/real-assets/${productKey}`,
  });
  writeJson("generations.json", { editorialId, bofuId, isolatedId });

  const femicoreAfter = snapshotFemicore();
  const femicorePreserved = femicoreBefore.hop === femicoreAfter.hop && femicoreBefore.catalog === femicoreAfter.catalog;
  writeJson("femicore-preservation.json", { before: femicoreBefore, after: femicoreAfter, preserved: femicorePreserved });

  const approvedFinal = (readCatalog(productKey)?.images ?? []).filter((item) => item.status === "USER_APPROVED").length;
  const heroEmptyFixed =
    !editorialShot.desktop.split &&
    editorialShot.desktop.editorial &&
    editorialShot.desktop.centered &&
    editorialShot.desktop.images.length === 0 &&
    isolatedShot.desktop.split &&
    isolatedShot.desktop.images.length === 1;
  const report = {
    EXECUTION_54I_STATUS:
      femicorePreserved &&
      approvedFinal === 0 &&
      hop.authorization === "VALIDATED" &&
      !official.visible &&
      editorialShot.desktop.v4 &&
      bofuShot.desktop.v4 &&
      !editorialShot.desktop.overflowX &&
      !bofuShot.mobile.overflowX &&
      heroEmptyFixed
        ? "PASS"
        : "PARTIAL",
    PRODENTIM_IMAGES_DISCOVERED: inventory.discovered.length,
    PRODENTIM_IMAGES_DOWNLOADED: inventory.downloaded.length,
    PRODUCT_PACKSHOTS_FOUND: inventory.packshots.length,
    PROMOTIONAL_IMAGES_FOUND: inventory.promotional.length,
    IMAGE_FILES_PATHS: inventory.downloaded.flatMap((item) => item.localFiles),
    ASSET_APPROVAL_GALLERY_URL: `${BASE}/admin/lab/real-assets/${productKey}`,
    REAL_CATALOG_USER_APPROVED_COUNT: approvedFinal,
    HERO_EMPTY_SPACE_FIXED: heroEmptyFixed,
    EDITORIAL_COPY_STATUS: editorial.copy.headline.text,
    BOFU_COPY_STATUS: bofu.copy.headline.text,
    CONTENT_QUALITY_STATUS: editorial.qualityInspection.status === "PASS" && bofu.qualityInspection.status === "PASS" ? "PASS" : `${editorial.qualityInspection.status}/${bofu.qualityInspection.status}`,
    SEMANTIC_GROUNDING_STATUS: editorial.grounding.every((item) => item.allowed) && bofu.grounding.every((item) => item.allowed) ? "PASS" : "BLOCKED",
    RENDERER_V4_PRESERVED: editorialShot.desktop.v4 && bofuShot.desktop.v4 && isolatedShot.desktop.v4,
    FEMICORE_DATA_PRESERVED: femicorePreserved,
    SANDBOX_CTA_STATUS: sandboxCta.visible && bofuShot.desktop.sandboxCtas > 0 ? "ARMED_LOCAL" : "BLOCKED",
    PRODUCTION_CTA_STATUS: official.visible || bofuShot.desktop.officialCtas > 0 ? "VISIBLE" : "BLOCKED",
    EDITORIAL_PREVIEW_URL: editorialShot.url,
    BOFU_PREVIEW_URL: bofuShot.url,
    PLAYWRIGHT_DESKTOP_MOBILE: editorialShot.desktop.v4 && editorialShot.mobile.v4 && bofuShot.desktop.v4 && bofuShot.mobile.v4 && isolatedShot.desktop.v4,
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    DISK_FREE_GB: diskFreeGb(),
    NEXT_RECOMMENDED_ACTION: "STOP. Review the asset gallery and approve packshots manually. Do not publish, authorize the commercial CTA, or start the next execution.",
    ISOLATED_PREVIEW_URL: isolatedShot.url,
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54i-visual-quality/screenshots/editorial-desktop-1440.jpg",
      "data/evidence/execution-54i-visual-quality/screenshots/editorial-mobile-390.jpg",
      "data/evidence/execution-54i-visual-quality/screenshots/bofu-desktop-1440.jpg",
      "data/evidence/execution-54i-visual-quality/screenshots/bofu-mobile-390.jpg",
      "data/evidence/execution-54i-visual-quality/screenshots/isolated-approved-desktop-1440.jpg",
      "data/evidence/execution-54i-visual-quality/screenshots/isolated-approved-mobile-390.jpg",
    ],
  };
  writeJson("report.json", report);
  writeJson("index.json", { execution: "54I", evidence: "data/evidence/execution-54i-visual-quality", generations: { editorialId, bofuId, isolatedId } });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
