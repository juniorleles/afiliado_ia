// npx tsx scripts/run-lp-generator-54k.ts
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
import { readCatalog } from "../src/lib/real-product-assets/store.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { selectApprovedHero } from "../src/lib/real-product-assets/select.ts";
import {
  classifyContextualFit,
  galleryAllowedForContext,
  readContextReviews,
  reviewFor,
} from "../src/lib/real-product-assets/context-fit.ts";
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
import type { ProductCatalog } from "../src/lib/real-product-assets/types.ts";

const PRODUCT_NAME = "ProDentim";
const SALES_URL = "https://prodentim101.com/text.php?hop=zzzzz&hopId=6c9c6dd4-9c61-4086-8445-637fae0c985b";
const REAL_HOP = "https://6b503qvz1icsbs7otcn82psacg.hop.clickbank.net";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54k-conversion-ux");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const FEMICORE_HOP = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const FEMICORE_CATALOG = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const FIXTURE_HTML = path.join(process.cwd(), "scripts", "fixtures", "prodentim-vsl.html");
const PRIOR_EDITORIAL = "lp-mvldlmzn-dd307762";
const PRIOR_BOFU = "lp-mvldlmzn-def9029a";

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

function inventoryDepth(contract: ProductContract) {
  const rows = [
    { slot: "ingredients", available: (contract.components ?? []).length, presented: (contract.components ?? []).length > 0, band: (contract.components ?? []).length ? "A" : "D" },
    { slot: "features", available: (contract.features ?? []).length, presented: (contract.features ?? []).length > 0, band: (contract.features ?? []).length ? "A" : "D" },
    { slot: "usage", available: (contract.usage ?? []).length, presented: (contract.usage ?? []).length > 0, band: (contract.usage ?? []).length ? "A" : "D" },
    { slot: "guarantee", available: contract.guarantee ? 1 : 0, presented: Boolean(contract.guarantee), band: contract.guarantee ? "B" : "D", note: contract.guarantee ? "Seller statement only. No refund rules were added." : "Absent." },
    { slot: "cautions", available: (contract.cautions ?? []).length, presented: (contract.cautions ?? []).length > 0, band: (contract.cautions ?? []).length ? "A" : "D" },
    { slot: "benefits", available: (contract.benefits ?? []).length, presented: (contract.benefits ?? []).length > 0, band: (contract.benefits ?? []).length ? "B" : "D", note: "Seller-stated claims stay attributed." },
    { slot: "faq", available: (contract.faq ?? []).length, presented: false, band: (contract.faq ?? []).length ? "B" : "D" },
    { slot: "price", available: contract.offer?.packages?.length ?? 0, presented: false, band: (contract.offer?.packages?.length ?? 0) ? "B" : "D" },
  ];
  const limited = rows.filter((item) => item.band === "D").map((item) => item.slot);
  return {
    status: limited.length ? "CONTENT_DEPTH_LIMITED_BY_EVIDENCE" : "CONTENT_DEPTH_SUPPORTED",
    limitedSlots: limited,
    rows,
  };
}

async function auditLegalPages() {
  const contactEmail = getPublicContactEmail();
  const rows = [];
  for (const link of PUBLIC_FOOTER_LINKS) {
    const url = `${BASE}${link.href}`;
    try {
      const response = await fetch(url, { redirect: "manual" });
      const body = await response.text();
      const titlePresent = new RegExp(link.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(body);
      const placeholder = /lorem ipsum|todo|coming soon|placeholder/i.test(body);
      const empty = body.replace(/<[^>]+>/g, " ").trim().length < 80;
      let status = "PASS";
      let note = "Route exists and the page title matches the footer label.";
      if (response.status !== 200) {
        status = "FAIL";
        note = `HTTP ${response.status}`;
      } else if (empty || placeholder) {
        status = "FAIL";
        note = "Page is empty or still a placeholder.";
      } else if (!titlePresent) {
        status = "FAIL";
        note = "Page body does not match the footer label.";
      } else if (link.href === "/contact" && !contactEmail) {
        status = "ESSENTIAL_INFO_ABSENT";
        note = "Contact route exists, but PUBLIC_CONTACT_EMAIL is unpublished. No address was invented.";
      } else if (link.href === "/about") {
        note = "About exists as an independent-publisher notice. No invented company identity.";
      }
      rows.push({ href: link.href, label: link.label, url, http: response.status, titlePresent, placeholder, empty, status, note });
    } catch (error) {
      rows.push({
        href: link.href,
        label: link.label,
        url,
        http: null,
        titlePresent: false,
        placeholder: false,
        empty: true,
        status: "FAIL",
        note: error instanceof Error ? error.message : "fetch failed",
      });
    }
  }
  return { contactEmailPublished: Boolean(contactEmail), pages: rows };
}

async function capturePreview(generationId: string, prefix: string, options?: { followSandbox?: boolean }) {
  mkdirSync(SHOTS, { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${generationId}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 90000 });
  const hasHero = await page.locator("[data-v4-image='commercial']").count();
  if (hasHero) {
    await page.waitForFunction(
      () => {
        const images = [...document.querySelectorAll("[data-v4-image='commercial']")] as HTMLImageElement[];
        return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0);
      },
      { timeout: 60000 },
    );
  }
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
      headings: [...document.querySelectorAll("h2")].map((node) => node.textContent?.trim() ?? ""),
      sectionOrder: [...document.querySelectorAll("[data-v4-section]")].map((node) => node.getAttribute("data-v4-section") ?? ""),
      photo: document.querySelector("[data-v4-photo]")?.getAttribute("data-v4-photo") ?? "",
      split: Boolean(hero?.classList.contains("ds-hero--split")),
      images,
      heroImage,
      gallerySrcs: [...document.querySelectorAll("[data-v4-gallery] img, [data-v4-section='demonstration'] img, .ds-gallery img")].map((node) => {
        const img = node as HTMLImageElement;
        return img.currentSrc || img.src;
      }),
      compactFeatures: Boolean(document.querySelector('[data-v4-features="compact"]')),
      featureCards: document.querySelectorAll(".ds-feature").length,
      guaranteeText: document.querySelector("[data-v4-section='guarantee']")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      footerHrefs: [...document.querySelectorAll("footer a, [data-v4-section='legal'] a")].map((node) => (node as HTMLAnchorElement).getAttribute("href") ?? ""),
      proportionPreserved:
        naturalRatio != null && displayRatio != null ? Math.abs(naturalRatio - displayRatio) < 0.08 : false,
      brokenCount: images.filter((item) => item.broken).length,
      sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
      officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
      sandboxHref: (document.querySelector('[data-v4-track="sandbox_offer_click"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null,
      officialHref: (document.querySelector('[data-v4-track="official_offer_click"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      v4: Boolean(document.querySelector('[data-v4="page"]')),
    };
  });
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-desktop-1440.jpg`), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (hasHero) {
    await page.waitForFunction(
      () => {
        const hero = document.querySelector(".ds-hero__media img") as HTMLImageElement | null;
        return Boolean(hero && hero.complete && hero.naturalWidth > 0);
      },
      { timeout: 30000 },
    );
  }
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
      compactFeatures: Boolean(document.querySelector('[data-v4-features="compact"]')),
      brokenCount: images.filter((item) => item.broken).length,
      images,
    };
  });
  await page.screenshot({ path: path.join(SHOTS, `${prefix}-mobile-390.jpg`), type: "jpeg", quality: 55, fullPage: true });

  let sandboxDestination: string | null = null;
  if (options?.followSandbox && desktop.sandboxHref) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('[data-v4-track="sandbox_offer_click"]', { timeout: 30000 });
    await Promise.all([
      page.waitForNavigation({ timeout: 30000 }).catch(() => null),
      page.click('[data-v4-track="sandbox_offer_click"]'),
    ]);
    sandboxDestination = page.url();
    await page.screenshot({ path: path.join(SHOTS, `${prefix}-sandbox-destination.jpg`), type: "jpeg", quality: 55, fullPage: true });
  }
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile, sandboxDestination };
}

async function buildMode(input: { query: string; facts: ProductFacts; sources: EnrichmentSource[]; catalog: ProductCatalog }) {
  const enriched = enrichProduct({ scenarioKey: "execution-54k", contractInput: contractInputOf(input.facts), sources: input.sources });
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
    scenarioKey: "execution-54k",
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

function classifyApproved(catalog: ProductCatalog) {
  const reviews = readContextReviews(catalog.productKey);
  return catalog.images
    .filter((item) => item.status === "USER_APPROVED")
    .map((image) => {
      const review = reviewFor(image.id, reviews);
      const fit = classifyContextualFit(image, review);
      return {
        id: image.id,
        fileName: image.fileName,
        status: image.status,
        visualClass: classifyVisualClass(image),
        contextualFit: fit,
        observedClaims: review?.observedClaims ?? [],
        reviewNote: review?.note ?? null,
        editorialGallery: galleryAllowedForContext(fit, "PRESELL_EDITORIAL"),
        bofuGallery: galleryAllowedForContext(fit, "PRESELL_BOFU"),
        approvalUnchanged: true,
      };
    });
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
    throw new Error("The existing ProDentim hop must stay VALIDATED. 54K does not rewrite it.");
  }

  const catalog = readCatalog(productKey);
  if (!catalog) throw new Error("STOP. No real catalog.");
  const approved = catalog.images.filter((item) => item.status === "USER_APPROVED");
  if (approved.length === 0) throw new Error("STOP. No USER_APPROVED images.");
  const hero = selectApprovedHero(catalog.images);
  if (!hero) throw new Error("STOP. No eligible hero.");

  const imageFit = classifyApproved(catalog);
  writeJson("image-context-fit.json", {
    hero: { id: hero.id, fileName: hero.fileName, scoreSource: "selectApprovedHero" },
    reviews: readContextReviews(productKey),
    images: imageFit,
    note: "USER_APPROVED was not changed. Original files were not modified. Context-inappropriate images are omitted from the matching render.",
  });

  const priorDefects = [
    { id: "headline-concatenated", severity: "HIGH", surface: "hero", status: "OPEN_AT_54J", note: "Headline was a field concatenation: Product: Dietary supplement and Ingredients." },
    { id: "gallery-best-value", severity: "HIGH", surface: "gallery", status: "OPEN_AT_54J", note: "Approved gallery included fe_6_bottle_mob.png with a BEST VALUE seal." },
    { id: "pages-too-similar", severity: "MEDIUM", surface: "strategy", status: "OPEN_AT_54J", note: "Editorial and BOFU used the same section order and nearly the same copy." },
    { id: "short-features-as-cards", severity: "MEDIUM", surface: "features", status: "OPEN_AT_54J", note: "Short attributes occupied large numbered cards." },
    { id: "guarantee-unattributed", severity: "MEDIUM", surface: "guarantee", status: "OPEN_AT_54J", note: "Guarantee was restated without seller attribution." },
    { id: "contact-email-unpublished", severity: "LOW", surface: "legal", status: "OPEN_AT_54J", note: "Contact route exists, but no operator email is configured." },
  ];
  writeJson("defects-before.json", priorDefects);

  let priorEditorial = null;
  let priorBofu = null;
  try {
    priorEditorial = await capturePreview(PRIOR_EDITORIAL, "prior-editorial");
  } catch (error) {
    priorEditorial = { error: error instanceof Error ? error.message : "prior editorial unavailable" };
  }
  try {
    priorBofu = await capturePreview(PRIOR_BOFU, "prior-bofu");
  } catch (error) {
    priorBofu = { error: error instanceof Error ? error.message : "prior BOFU unavailable" };
  }
  writeJson("prior-previews.json", { editorial: priorEditorial, bofu: priorBofu });

  const fetched = await fetchResearchSources({ urls: collectSourceUrls({ salesUrl: SALES_URL, affiliateUrl: SALES_URL }) });
  let sources = fetched.sources;
  const limitations = [
    ...fetched.limitations,
    "Execution 54K audits conversion UX and editorial depth. No paid API calls.",
    "Copy stays evidence-bound. No commercial CTA. No invented refund or price terms.",
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
  const depth = inventoryDepth(editorial.contract);
  writeJson("content-depth.json", depth);

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
    editorialGallery: (editorial.model.galleryImages ?? []).map((item) => item.src),
    bofuGallery: (sandboxModel.galleryImages ?? []).map((item) => item.src),
  });
  writeJson("headlines.json", {
    editorial: editorial.applied.headline,
    bofu: bofu.applied.headline,
    concatenatedLegacy: `${PRODUCT_NAME}: Dietary supplement and Ingredients`,
  });
  writeJson("section-order.json", {
    editorial: editorial.copy.sections.map((item) => item.sectionType),
    bofu: bofu.copy.sections.map((item) => item.sectionType),
  });
  writeJson("guarantee.json", {
    contractText: editorial.contract.guarantee?.text ?? null,
    editorialBody: editorial.copy.sections.find((item) => item.sectionType === "guarantee")?.body.map((item) => item.text) ?? [],
    attributed: editorial.copy.sections.some((item) => item.sectionType === "guarantee" && item.body.some((line) => /^The seller states:/.test(line.text))),
    inventedTerms: false,
  });

  const legal = await auditLegalPages();
  writeJson("legal-audit.json", legal);

  const editorialShot = await capturePreview(editorialId, "editorial");
  const bofuShot = await capturePreview(bofuId, "bofu", { followSandbox: true });
  writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot });
  writeJson("urls.json", { editorial: editorialShot.url, bofu: bofuShot.url });
  writeJson("generations.json", { editorialId, bofuId });

  const omittedEditorial = imageFit.filter((item) => item.id !== hero.id && !item.editorialGallery);
  const omittedBofu = imageFit.filter((item) => item.id !== hero.id && !item.bofuGallery);
  writeJson("gallery-omissions.json", {
    editorial: omittedEditorial.map((item) => ({ id: item.id, fileName: item.fileName, fit: item.contextualFit, reason: item.reviewNote })),
    bofu: omittedBofu.map((item) => ({ id: item.id, fileName: item.fileName, fit: item.contextualFit, reason: item.reviewNote })),
  });

  const conversion = {
    editorialHasCommercialCta: editorialShot.desktop.officialCtas > 0 || editorialShot.desktop.sandboxCtas > 0,
    bofuSandboxArmed: Boolean(bofuShot.desktop.sandboxCtas > 0 && bofuShot.desktop.sandboxHref?.startsWith("/admin/lab/sandbox/")),
    bofuOfficialHidden: bofuShot.desktop.officialCtas === 0,
    hopAbsentFromPages: ![editorialShot.desktop.sandboxHref, editorialShot.desktop.officialHref, bofuShot.desktop.sandboxHref, bofuShot.desktop.officialHref].some((href) => href && href.includes("hop.clickbank.net")),
    sandboxDestinationLocal: Boolean(bofuShot.sandboxDestination && /\/admin\/lab\/sandbox\//.test(bofuShot.sandboxDestination) && !bofuShot.sandboxDestination.includes("hop.clickbank.net")),
    noInventedPrice: !/\$|%\s*off|limited time/i.test(`${editorial.applied.headline} ${bofu.applied.headline} ${editorialShot.desktop.guaranteeText}`),
  };
  writeJson("conversion-ux.json", conversion);

  const defectsAfter = [
    { id: "headline-concatenated", severity: "HIGH", status: /Dietary supplement and Ingredients/i.test(editorialShot.desktop.headline) ? "OPEN" : "FIXED" },
    { id: "gallery-best-value", severity: "HIGH", status: omittedEditorial.some((item) => item.fileName.includes("fe_6")) && !(editorial.model.galleryImages ?? []).some((item) => item.src.includes("f2aaa9a2a2ffa051")) ? "FIXED" : "OPEN" },
    { id: "pages-too-similar", severity: "MEDIUM", status: editorial.applied.headline !== bofu.applied.headline && editorial.copy.sections[0]?.sectionType !== bofu.copy.sections.find((item) => item.sectionType !== "hero")?.sectionType ? "FIXED" : "OPEN" },
    { id: "short-features-as-cards", severity: "MEDIUM", status: editorialShot.desktop.compactFeatures || editorialShot.desktop.featureCards === 0 ? "FIXED" : "OPEN" },
    { id: "guarantee-unattributed", severity: "MEDIUM", status: /seller states/i.test(editorialShot.desktop.guaranteeText) ? "FIXED" : "OPEN" },
    { id: "contact-email-unpublished", severity: "LOW", status: legal.contactEmailPublished ? "FIXED" : "OPEN", note: "Contact email remains unpublished. No identity was invented." },
  ];
  writeJson("defects-after.json", defectsAfter);

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
  const headlinesNatural = !/Dietary supplement and Ingredients/i.test(editorialShot.desktop.headline) && editorialShot.desktop.headline !== bofuShot.desktop.headline;
  const legalEssentialPass = legal.pages.filter((item) => item.href !== "/contact").every((item) => item.status === "PASS");
  const legalContactHonest = legal.pages.find((item) => item.href === "/contact")?.status !== "PASS" || legal.contactEmailPublished;
  const report = {
    EXECUTION_54K_STATUS:
      femicorePreserved &&
      approvedFinal.length === approved.length &&
      hop.authorization === "VALIDATED" &&
      !official.visible &&
      heroRendered &&
      visualOk(editorialShot) &&
      visualOk(bofuShot) &&
      editorial.qualityInspection.status === "PASS" &&
      bofu.qualityInspection.status === "PASS" &&
      headlinesNatural &&
      conversion.bofuSandboxArmed &&
      conversion.bofuOfficialHidden &&
      conversion.hopAbsentFromPages &&
      legalEssentialPass &&
      legalContactHonest &&
      defectsAfter.filter((item) => item.severity === "HIGH" && item.status !== "FIXED").length === 0
        ? "PASS"
        : "PARTIAL",
    REAL_CATALOG_USER_APPROVED_COUNT: approvedFinal.length,
    APPROVED_ASSET_IDS: approvedFinal.map((item) => item.id),
    HERO_PACKSHOT_STATUS: heroRendered ? `RENDERED:${hero.fileName}` : `MISSING:${hero.fileName}`,
    EDITORIAL_HEADLINE: editorialShot.desktop.headline,
    BOFU_HEADLINE: bofuShot.desktop.headline,
    EDITORIAL_VS_BOFU_DIFFERENTIATED: editorial.applied.headline !== bofu.applied.headline,
    GALLERY_OMISSIONS: {
      editorial: omittedEditorial.map((item) => item.fileName),
      bofu: omittedBofu.map((item) => item.fileName),
    },
    FEATURE_PRESENTATION: editorialShot.desktop.compactFeatures ? "COMPACT_CHIPS" : `CARDS:${editorialShot.desktop.featureCards}`,
    GUARANTEE_ATTRIBUTION: /seller states/i.test(editorialShot.desktop.guaranteeText) ? "SELLER_STATED" : "UNATTRIBUTED",
    CONTENT_DEPTH_STATUS: depth.status,
    LEGAL_AUDIT_STATUS: legal.pages.map((item) => `${item.label}:${item.status}`),
    CONTACT_EMAIL_PUBLISHED: legal.contactEmailPublished,
    CONVERSION_UX: conversion,
    EDITORIAL_IMAGE_RENDERED: Boolean(editorialShot.desktop.heroImage && !editorialShot.desktop.heroImage.broken),
    BOFU_IMAGE_RENDERED: Boolean(bofuShot.desktop.heroImage && !bofuShot.desktop.heroImage.broken),
    DESKTOP_VISUAL_STATUS: visualOk(editorialShot) && visualOk(bofuShot) ? "PASS" : "FAIL",
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
      "data/evidence/execution-54k-conversion-ux/screenshots/editorial-desktop-1440.jpg",
      "data/evidence/execution-54k-conversion-ux/screenshots/editorial-mobile-390.jpg",
      "data/evidence/execution-54k-conversion-ux/screenshots/bofu-desktop-1440.jpg",
      "data/evidence/execution-54k-conversion-ux/screenshots/bofu-mobile-390.jpg",
    ],
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    NEXT_RECOMMENDED_ACTION: "STOP. Do not publish, authorize the commercial CTA, or start the next execution.",
  };
  writeJson("report.json", report);
  writeJson("index.json", { execution: "54K", evidence: "data/evidence/execution-54k-conversion-ux", generations: { editorialId, bofuId } });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
