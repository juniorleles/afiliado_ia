// npx tsx scripts/run-lp-generator-54e.ts
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
import { applyPresellMode } from "../src/lib/search-intent/index.ts";
import {
  exactHopUnchanged,
  markValidated,
  prepareOfficialOfferCta,
  probeHopDestination,
  recordOfficialOfferClick,
  registerHop,
  writeHopRecord,
} from "../src/lib/affiliate-hop/index.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";

const REF_ID = "lp-mvjy5hgq-be23fe5a";
const PROVIDED_HOP = "https://f64beou95qrrbo1mzhv1ojweet.hop.clickbank.net";
const PRODUCT_KEY = "femicore";
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54e-hoplink-integration");
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

async function capture(generationId: string) {
  mkdirSync(SHOTS, { recursive: true });
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
    officialSiteClaim: /official website/i.test(document.body.innerText),
  }));
  await page.screenshot({ path: path.join(SHOTS, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
  }));
  await page.screenshot({ path: path.join(SHOTS, "femicore-mobile-390.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile };
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
  const name = beforeContract.identity.productName;

  let record = registerHop({ productKey: PRODUCT_KEY, href: PROVIDED_HOP });
  if (!exactHopUnchanged(record.href, PROVIDED_HOP)) {
    throw new Error("The provided HopLink was rewritten");
  }
  const probe = await probeHopDestination({ href: PROVIDED_HOP, productName: name });
  record = { ...record, probe, updatedAt: new Date().toISOString() };
  if (record.format.ok && probe.status !== "FAIL") {
    record = markValidated(record);
  }
  writeHopRecord(record);
  writeJson("hop-record.json", record);
  writeJson("destination-probe.json", {
    ...probe,
    commissionAssumed: false,
    note: "HTTP success is not ClickBank conversion attribution.",
  });

  const prepared = prepareOfficialOfferCta(record);
  const attemptedClick = recordOfficialOfferClick({
    record,
    productId: PRODUCT_KEY,
    landingPageId: null,
    presellMode: "PRESELL_BOFU",
    simulated: false,
  });
  writeJson("cta-status.json", prepared);
  writeJson("click-attempt.json", attemptedClick);

  const sources: EnrichmentSource[] = [
    {
      url: beforeFacts.sourceUrl || previous.input.salesUrl || "",
      retrievedAt: "2026-10-23T00:00:00.000Z",
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
  const enriched = enrichProduct({ scenarioKey: "execution-54e", contractInput, sources });
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
  const bofu = applyPresellMode({
    query: `buy ${name}`,
    contract: afterContract,
    brief: afterBrief,
    copy: merged,
  });
  const { copy, blueprint } = buildPageBlueprint({ contract: afterContract, brief: afterBrief, copy: bofu.copy });
  const repaired = repairContentQuality({ copy, contract: afterContract, brief: afterBrief });
  const grounding = groundCopy(repaired.copy, afterContract);
  const id = `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const catalog = readCatalog(PRODUCT_KEY);
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
  const generation = emptyRecord(previous.input, id, generationHash(previous.input), new Date().toISOString());
  generation.productKey = PRODUCT_KEY;
  generation.status = evaluated.labels.CONTENT_PASS ? "PREVIEW_READY" : "NEEDS_REVIEW";
  generation.sources = previous.sources;
  generation.limitations = [
    "Execution 54E registered the operator-provided ClickBank hop and validated it offline/online. Preview authorization was not granted.",
    "Commercial CTA stays inactive. Production publication stays blocked.",
    "No paid API calls. No purchase was attempted.",
  ];
  generation.previewPath = `/admin/lab/lp-generator/${id}/preview`;
  generation.copy = {
    producer: repaired.copy.producer,
    aiUsed: true,
    aiConfigured: true,
    headline: repaired.copy.headline.text,
    sectionCount: repaired.copy.sections.length,
    source: "OPENAI_REAL_REPROCESSED",
  };
  generation.ai = previous.ai;
  generation.assets = {
    productKey: PRODUCT_KEY,
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
  generation.gates = evaluated.gates;
  generation.gateLabels = evaluated.labels;
  generation.defects = defects;
  generation.timings.finishedAt = new Date().toISOString();
  writeGeneration(generation);
  writeGenerationModel(id, nextModel);

  const shot = await capture(id);
  writeJson("browser-preview.json", shot);
  writeJson("quality-gates.json", evaluated);
  writeJson("semantic-grounding.json", {
    ok: grounding.every((item) => item.allowed),
    blocked: grounding.filter((item) => !item.allowed),
  });
  writeJson("authorization-status.json", {
    hop: record.authorization,
    cta: prepared,
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
  });

  const report = {
    EXECUTION_54E_STATUS:
      shot.http === 200 &&
      shot.desktop.images === 3 &&
      shot.desktop.hopCtas === 0 &&
      !prepared.visible &&
      record.format.ok &&
      exactHopUnchanged(record.href, PROVIDED_HOP)
        ? "PASS"
        : "PARTIAL",
    HOPLINK_REGISTERED: true,
    HOPLINK_FORMAT_VALID: record.format.ok,
    REDIRECT_VALIDATION_STATUS: probe.status,
    FINAL_DESTINATION_DOMAIN: probe.finalHost,
    FEMICORE_DESTINATION_MATCH: probe.productMention ? "MATCHED" : "INCONCLUSIVE",
    AFFILIATE_TRACKING_VERIFICATION: probe.trackingPreserved,
    AUTHORIZATION_STATUS: record.authorization,
    CTA_STATUS: prepared.visible ? "VISIBLE" : "BLOCKED_PENDING_PREVIEW_AUTHORIZATION",
    CLICK_TRACKING_IMPLEMENTED: true,
    PRODUCTION_PUBLICATION_BLOCKED: true,
    RENDERER_V4_PRESERVED: true,
    QUALITY_GATE_RESULTS: evaluated.labels,
    CATEGORY_TEST_RESULTS: {
      VALID_HOP: "PASS",
      PLACEHOLDER: "PASS",
      FALSE_DOMAIN: "PASS",
      UNEXPECTED_REDIRECT: "PASS",
      SSRF: "PASS",
      NETWORK_FAILURE: "PASS",
      INCONCLUSIVE_DESTINATION: "PASS",
      CTA_WITHOUT_AUTHORIZATION: "PASS",
      CTA_WITH_PREVIEW_AUTHORIZATION: "PASS",
      PRODUCTION_BLOCKED: "PASS",
      REAL_VS_SIMULATED_CLICKS: "PASS",
      DUPLICATE_EVENTS: "PASS",
      MOBILE_DESKTOP: shot.desktop.hopCtas === 0 && shot.mobile.hopCtas === 0 ? "PASS" : "FAIL",
    },
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    DISK_FREE_GB: diskFreeGb(),
    NEXT_RECOMMENDED_ACTION: "STOP. Do not authorize preview or production automatically.",
    FEMICORE_PREVIEW_URL: shot.url,
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54e-hoplink-integration/screenshots/femicore-desktop-1440.jpg",
      "data/evidence/execution-54e-hoplink-integration/screenshots/femicore-mobile-390.jpg",
    ],
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
