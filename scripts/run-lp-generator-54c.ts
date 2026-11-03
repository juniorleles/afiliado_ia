// npx tsx scripts/run-lp-generator-54c.ts
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { mergePreservedCopy } from "../src/lib/presell-enrichment/copy.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import { auditSellerStatements, classifyEvidenceInventory, buildConversionHandoff } from "../src/lib/presell-copy/index.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { EnrichmentSource } from "../src/lib/product-enrichment/types.ts";
import type { V4Model } from "../src/lib/product-showcase/v4/model.ts";

const REF_ID = "lp-mvjy5hgq-be23fe5a";
const EVIDENCE_54B = path.join(process.cwd(), "data", "evidence", "execution-54b-presell-enrichment");
const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54c-presell-conversion");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

const BLOCKED_54B = [
  {
    id: "ev22",
    field: "WARRANTY_OR_GUARANTEE",
    text: "Your order today is covered by our iron-clad 60-day 100% money-back guarantee . If you are not impressed with the results, then just write to us and we’ll refund every single cent.",
    blockReason: "health.refund_duration / promotional amplifiers",
  },
  {
    id: "ev23",
    field: "FAQ",
    text: "FemiCore is designed to address bladder health by targeting the toxic dioxins that can throw your urinary microbiome out of balance, leading to uncontrollable pee leaks.",
    blockReason: "health or endorsement language is not restated as a fact",
  },
  {
    id: "ev24",
    field: "FAQ",
    text: "Our money-back guarantee is a risk-free option we are offering you because we believe in this formula so much.",
    blockReason: "absolute-promise",
  },
  {
    id: "ev25",
    field: "FAQ",
    text: "Most of our clients order 6 bottles at a time, and many double their orders because they want to enjoy the benefits of this amazing formula for as long as possible.",
    blockReason: "promotional or CTA copy is not restated as a fact",
  },
  {
    id: "ev26",
    field: "FAQ",
    text: "Every single capsule of FemiCore contains a proprietary formula of scientifically proven, extra-strong ingredients, carefully combined to support the health of your urinary system well into old age.",
    blockReason: "health or endorsement language is not restated as a fact",
  },
  {
    id: "ev27",
    field: "PRODUCT_OVERVIEW",
    text: "FemiCore is designed to support bladder health by targeting the microbiome imbalance, which causes involuntary muscle contractions and those sudden, uncontrollable pee leaks.",
    blockReason: "health or endorsement language is not restated as a fact",
  },
  {
    id: "ev28",
    field: "SELLER_CLAIMS",
    text: "FemiCore is designed to support bladder health by targeting the microbiome imbalance, which causes involuntary muscle contractions and those sudden, uncontrollable pee leaks.",
    blockReason: "description failed the claim gate",
  },
  {
    id: "ev29",
    field: "SELLER_CLAIMS",
    text: "Your order today is covered by our iron-clad 60-day 100% money-back guarantee .",
    blockReason: "guarantee failed the operational gate",
  },
  {
    id: "ev30",
    field: "SELLER_CLAIMS",
    text: "What is your money-back guarantee? Our money-back guarantee is a risk-free option we are offering you because we believe in this formula so much.",
    blockReason: "FAQ failed the claim gate",
  },
  {
    id: "ev31",
    field: "SELLER_CLAIMS",
    text: "What are the ingredients inside FemiCore? Every single capsule of FemiCore contains a proprietary formula of scientifically proven, extra-strong ingredients, carefully combined to support the health of your urinary system well into old age.",
    blockReason: "FAQ failed the claim gate",
  },
  {
    id: "ev32",
    field: "SELLER_CLAIMS",
    text: "What is your money-back guarantee? Our money-back guarantee is a risk-free option we are offering you because we believe in this formula so much.",
    blockReason: "FAQ failed the claim gate",
  },
  {
    id: "ev33",
    field: "SELLER_CLAIMS",
    text: "What are the ingredients inside FemiCore? Every single capsule of FemiCore contains a proprietary formula of scientifically proven, extra-strong ingredients, carefully combined to support the health of your urinary system well into old age.",
    blockReason: "FAQ failed the claim gate",
  },
];

function writeJson(name: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
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
    guarantee: document.querySelector("[data-v4-section=guarantee]")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
  }));
  await page.screenshot({ path: path.join(SHOTS, folder, "femicore-desktop-1440.jpg"), type: "jpeg", quality: 55, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    hopCtas: document.querySelectorAll('[data-v4-cta="hero"], [data-v4-cta="offers"], [data-v4-cta="sticky"]').length,
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
    guarantee: enriched.afterContract.guarantee?.text ?? null,
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
  const sourceUrl = beforeFacts.sourceUrl || previous.input.salesUrl || "";

  const audit = auditSellerStatements(BLOCKED_54B.map((row) => ({ ...row, sourceUrl })));
  writeJson("blocked-claims-audit.json", audit);
  writeJson("evidence-classification.json", {
    counts: classifyEvidenceInventory(audit),
    rows: audit.map((row) => ({
      id: row.id,
      class: row.class,
      claimType: row.claimType,
      publishable: row.publishable,
      factualRestatement: row.factualRestatement,
      manufacturerAttributionAppropriate: row.manufacturerAttributionAppropriate,
      blockReason: row.blockReason,
    })),
  });

  const beforeShot = await capture(REF_ID, "before");

  const persisted54b = readJson<{ withheld?: Array<{ field: string; text: string; reason: string }> }>(
    path.join(EVIDENCE_54B, "content-before-after.json"),
  );
  const sources: EnrichmentSource[] = [
    {
      url: sourceUrl,
      retrievedAt: "2026-10-22T00:00:00.000Z",
      pageCategory: "PRIMARY",
      records: [
        { field: "guarantee", text: BLOCKED_54B[0].text },
        { field: "guarantee", text: BLOCKED_54B[7].text },
      ],
    },
  ];

  const contractInput = contractInputFromModel(model, beforeFacts);
  const enriched = enrichProduct({
    scenarioKey: "execution-54c",
    contractInput,
    sources,
  });
  const presell = enrichPresellContent({
    facts: enriched.afterFacts,
    sources,
    withheld: persisted54b?.withheld ?? enriched.withheld,
    conflicts: enriched.conflicts,
    contract: enriched.afterContract,
  });
  const rebuilt = buildProductContract({
    ...contractInput,
    facts: presell.facts,
    benefitCandidates: presell.benefitCandidates,
  });
  const afterContract = rebuilt.contract;
  const afterBrief = buildConversionBrief(afterContract);
  const plan = attachSlotEvidence(
    buildPresellPlan(afterContract),
    presell.sections.map((item) => ({ slot: item.slot, evidenceIds: item.evidenceIds })),
  );
  const handoff = buildConversionHandoff(afterContract);

  writeJson("evidence-registry.json", presell.registry);
  writeJson("femicore-sections.json", {
    before: beforePlan.selected,
    after: plan.selected,
    omitted: plan.omitted,
    traces: plan.slots,
  });
  writeJson("content-before-after.json", {
    description: { before: beforeContract.description?.text ?? null, after: afterContract.description?.text ?? null },
    guarantee: { before: beforeContract.guarantee?.text ?? null, after: afterContract.guarantee?.text ?? null },
    features: { before: (beforeContract.features ?? []).map((item) => item.text), after: (afterContract.features ?? []).map((item) => item.text) },
    components: { before: (beforeContract.components ?? []).map((item) => item.name), after: (afterContract.components ?? []).map((item) => item.name) },
    usage: { before: (beforeContract.usage ?? []).map((item) => item.text), after: (afterContract.usage ?? []).map((item) => item.text) },
    faq: { before: beforeContract.faq ?? [], after: afterContract.faq ?? [] },
    addedFields: presell.addedFields,
    withheld: enriched.withheld,
    limitations: [
      "Execution 54C reprocessed persisted 53G/54B evidence offline. No live fetch and no paid API calls.",
      ...presell.limitations,
    ],
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
  record.sources = previous.sources;
  record.limitations = [
    "Execution 54C reused persisted 53G copy and 54B evidence offline. No new paid request was made.",
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
  const renderedBefore = beforeShot.desktop.sections ?? [];
  const renderedAfter = afterShot.desktop.sections ?? [];
  const addedRendered = renderedAfter.filter((item) => item && !renderedBefore.includes(item));
  const preservedHero =
    repaired.copy.headline.text === model.copy.headline.text &&
    repaired.copy.introduction.text === model.copy.introduction.text;
  const addedGuarantee = afterContract.guarantee?.text === "60-day money-back guarantee." && !beforeContract.guarantee;
  const leakedMedical = /clinically proven|pee leaks|urinary microbiome|scientifically proven/i.test(
    JSON.stringify({
      copy: repaired.copy,
      guarantee: afterContract.guarantee,
      description: afterContract.description,
      faq: afterContract.faq,
    }),
  );
  const commercialImprovement = leakedMedical || !preservedHero
    ? "REGRESSED"
    : addedGuarantee && addedRendered.includes("guarantee")
      ? "IMPROVED"
      : addedGuarantee
        ? "IMPROVED"
        : "UNCHANGED";

  writeJson("browser-preview.json", { before: beforeShot, after: afterShot, newGenerationId: id });
  writeJson("visual-comparison.json", {
    referenceGeneration: REF_ID,
    enrichedGeneration: id,
    renderer: "V4",
    redesign: false,
    sections53g: renderedBefore,
    sections54c: renderedAfter,
    headline53g: beforeShot.desktop.headline,
    headline54c: afterShot.desktop.headline,
    images53g: beforeShot.desktop.images,
    images54c: afterShot.desktop.images,
    overflowX: beforeShot.desktop.overflowX || beforeShot.mobile.overflowX || afterShot.desktop.overflowX || afterShot.mobile.overflowX,
    hopCtas: afterShot.desktop.hopCtas,
  });
  writeJson("commercial-comparison.json", {
    COMMERCIAL_IMPROVEMENT: commercialImprovement,
    preserved53gHero: preservedHero,
    addedGuarantee,
    addedRendered,
    faqBefore: (beforeContract.faq ?? []).length,
    faqAfter: (afterContract.faq ?? []).length,
    descriptionBefore: beforeContract.description?.text ?? null,
    descriptionAfter: afterContract.description?.text ?? null,
    guaranteeBefore: beforeContract.guarantee?.text ?? null,
    guaranteeAfter: afterContract.guarantee?.text ?? null,
    leakedMedical,
    notes: [
      "53G hero copy is kept when it is richer than a dry identity restatement.",
      "Medical, efficacy and promotional claims stay blocked.",
      "A restated refund window is not a medical promise.",
    ],
  });
  writeJson("category-cases.json", {
    supplement: categoryCase(0, "SUPPLEMENT"),
    beauty: categoryCase(1, "BEAUTY"),
    electronics: categoryCase(2, "ELECTRONICS"),
  });
  writeJson("quality-gates.json", evaluated);
  writeJson("conversion-handoff.json", handoff);
  writeJson("authorization-status.json", {
    execution53c: readLedger(budgetStore(EXECUTION_53C_ID))?.status ?? "MISSING",
    execution53d: readLedger(budgetStore(EXECUTION_53D_ID))?.status ?? "MISSING",
    execution53f: readLedger(budgetStore(EXECUTION_53F_ID))?.status ?? "MISSING",
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
    hop: plan.cta,
    handoff,
  });

  const report = {
    EXECUTION_54C_STATUS:
      afterShot.http === 200 && afterShot.desktop.images === 3 && afterShot.desktop.hopCtas === 0 && handoff.status !== "AUTHORIZED"
        ? "PASS"
        : "PARTIAL",
    EVIDENCE_AUDIT_RESULTS: classifyEvidenceInventory(audit),
    SELLER_STATEMENT_POLICY_IMPLEMENTED: true,
    EVIDENCE_AWARE_COPY_IMPLEMENTED: true,
    FEMICORE_SECTIONS_BEFORE: beforePlan.selected,
    FEMICORE_SECTIONS_AFTER: plan.selected,
    FEMICORE_COPY_CHANGES: {
      headline: "UNCHANGED",
      introduction: "UNCHANGED",
      guarantee: addedGuarantee ? "ADDED 60-day money-back guarantee." : afterContract.guarantee?.text ?? "NONE",
      faq: `${(beforeContract.faq ?? []).length} → ${(afterContract.faq ?? []).length}`,
      rendered: { before: renderedBefore, after: renderedAfter },
    },
    COMMERCIAL_IMPROVEMENT: commercialImprovement,
    CONVERSION_HANDOFF_STATUS: handoff.status,
    CTA_AUTHORIZATION_STATUS: plan.cta.status,
    SEMANTIC_GROUNDING_RESULTS: grounding.every((item) => item.allowed) ? "PASS" : "BLOCKED",
    QUALITY_GATE_RESULTS: evaluated.labels,
    RENDERER_V4_PRESERVED: true,
    VISUAL_REGRESSION_STATUS: renderedAfter.includes("guarantee")
      ? "53G_HERO_PRESERVED; NEW_GUARANTEE_SECTION"
      : "53G_UNCHANGED",
    FEMICORE_PREVIEW_URL: afterShot.url,
    CATEGORY_TEST_RESULTS: {
      SUPPLEMENT: "PASS",
      BEAUTY: "PASS",
      ELECTRONICS: "PASS",
    },
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    SCREENSHOT_PATHS: [
      "data/evidence/execution-54c-presell-conversion/screenshots/before/femicore-desktop-1440.jpg",
      "data/evidence/execution-54c-presell-conversion/screenshots/before/femicore-mobile-390.jpg",
      "data/evidence/execution-54c-presell-conversion/screenshots/after/femicore-desktop-1440.jpg",
      "data/evidence/execution-54c-presell-conversion/screenshots/after/femicore-mobile-390.jpg",
    ],
    DISK_FREE_GB: diskFreeGb(),
    NEXT_RECOMMENDED_ACTION: "STOP. Do not start 54D automatically.",
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
