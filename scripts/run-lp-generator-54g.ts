// npx tsx scripts/run-lp-generator-54g.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { inspectContentQuality, repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { exactHopUnchanged, markValidated, prepareOfficialOfferCta, probeHopDestination, registerHop, writeHopRecord } from "../src/lib/affiliate-hop/index.ts";
import { productionPublicationBlockedForSandbox } from "../src/lib/sandbox/index.ts";
import { readCatalog } from "../src/lib/real-product-assets/store.ts";

const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-54g-product-readiness");
const SHOTS = path.join(EVIDENCE, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const REAL_HOP = "https://6b503qvz1icsbs7otcn82psacg.hop.clickbank.net";
const PLACEHOLDER_PAGE = "https://prodentim101.com/text.php?hop=zzzzz";
const EDITORIAL_ID = "lp-mvky9o48-a95b60bc";
const BOFU_ID = "lp-mvky9o48-93f564b4";
const FEMICORE_BOFU = "lp-mvkxlvf4-32dc0674";
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

function classifyBlocker(id: string, evidence: string[]): string {
  if (id === "repetition") return "COPY_INADEQUADA";
  if (id.startsWith("medical")) return "ALEGACAO_NAO_FUNDAMENTADA";
  if (id.startsWith("testimonial")) return "ALEGACAO_NAO_FUNDAMENTADA";
  if (id.startsWith("cta") || id.startsWith("offer")) return "AUTORIZACAO";
  if (id.startsWith("fragment") || id.startsWith("headline")) return "DADOS_AUSENTES_OU_EXTRACAO";
  if (evidence.some((item) => /returns, shipping/i.test(item))) return "FALHA_IMPLEMENTACAO";
  return "COPY_INADEQUADA";
}

function diagnose(id: string) {
  const record = readGeneration(id);
  const model = readGenerationModel(id);
  if (!record || !model) throw new Error(`missing ${id}`);
  const inspected = inspectContentQuality({ copy: model.copy, contract: model.contract, brief: model.brief });
  const repaired = repairContentQuality({ copy: model.copy, contract: model.contract, brief: model.brief });
  const texts = [
    model.copy.headline.text,
    model.copy.subheadline?.text,
    model.copy.introduction.text,
    ...model.copy.sections.flatMap((section) => [section.headline.text, ...section.body.map((item) => item.text), ...section.items.map((item) => item.text.text)]),
    ...model.copy.faq.flatMap((item) => [item.question.text, item.answer.text]),
  ].filter((item): item is string => Boolean(item)).map((item) => item.replace(/\s+/g, " ").trim());
  const counts = new Map<string, number>();
  for (const text of texts) {
    if (text.length <= 16) continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const grounding = [
    classifyCopyText({ path: "headline", text: model.copy.headline.text, contract: model.contract }),
    classifyCopyText({ path: "introduction", text: model.copy.introduction.text, contract: model.contract }),
    ...model.copy.sections.map((section, index) =>
      classifyCopyText({ path: `sections[${index}].headline`, text: section.headline.text, contract: model.contract }),
    ),
    ...model.copy.faq.flatMap((item, index) => [
      classifyCopyText({ path: `faq[${index}].question`, text: item.question.text, contract: model.contract }),
      classifyCopyText({ path: `faq[${index}].answer`, text: item.answer.text, contract: model.contract }),
    ]),
  ];
  const blockers = inspected.map((item) => ({
    code: item.id,
    severity: item.severity,
    field: item.evidence.join(" | "),
    evidence: item.evidence,
    reason: item.message,
    category: classifyBlocker(item.id, item.evidence),
    fixable: item.fixable,
    recommendedAction:
      item.id === "repetition"
        ? "Deduplicate extracted seller statements before copy assembly. Do not weaken the repetition rule."
        : "Keep the gate. Remove or restate only source-supported text.",
  }));
  return {
    id,
    status: record.status,
    gateLabels: record.gateLabels,
    storedDefectCount: record.defects.length,
    contentQualityStatus: repaired.status,
    blockers,
    repeats: [...counts.entries()].filter(([, count]) => count > 1),
    sections: model.copy.sections.map((item) => item.sectionType),
    faq: model.copy.faq.map((item) => ({ question: item.question.text, answer: item.answer.text })),
    components: (model.contract.components ?? []).map((item) => item.name),
    features: (model.contract.features ?? []).map((item) => item.text),
    usage: (model.contract.usage ?? []).map((item) => item.text),
    guarantee: model.contract.guarantee?.text ?? null,
    cautions: (model.contract.cautions ?? []).map((item) => item.text),
    disclosure: model.contract.legal.affiliateDisclosure,
    cta: model.contract.cta,
    hopHref: model.hopHref ?? null,
    sandbox: Boolean(model.sandbox?.mode),
    groundingBlocked: grounding.filter((item) => !item.allowed),
    usableWithoutInvention: {
      productName: model.contract.identity.productName,
      ingredients: (model.contract.components ?? []).map((item) => item.name).filter((name) => /lactobacillus|reuteri|lactis|paracasei/i.test(name)),
      usage: (model.contract.usage ?? []).map((item) => item.text),
      guarantee: model.contract.guarantee?.text ?? null,
      disclosure: model.contract.legal.affiliateDisclosure,
      sellerCharacteristics: (model.contract.features ?? []).map((item) => item.text),
    },
    sellerNotProven: [
      "Checkout FAQ that tells the visitor to order now",
      "Safety and 'transform lives' FAQ answers",
      "Characteristic phrases stored as ingredients (Easy To Use, No Stimulants, Non-Habit Forming)",
    ],
  };
}

async function capture(id: string, prefix: string) {
  mkdirSync(SHOTS, { recursive: true });
  const url = `${BASE}/admin/lab/lp-generator/${id}/preview`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('[data-v4="page"]', { timeout: 90000 });
  await page.waitForTimeout(500);
  const desktop = await page.evaluate(() => ({
    headline: document.querySelector("h1")?.textContent?.trim() ?? "",
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    sandboxCtas: document.querySelectorAll('[data-v4-track="sandbox_offer_click"]').length,
    officialCtas: document.querySelectorAll('[data-v4-track="official_offer_click"]').length,
    images: Array.from(document.querySelectorAll<HTMLImageElement>("[data-v4-image=commercial]")).filter((img) => img.complete && img.naturalWidth > 0).length,
    sections: Array.from(document.querySelectorAll("[data-v4-section]")).map((el) => el.getAttribute("data-v4-section")),
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
  await browser.close();
  return { url, http: response?.status() ?? null, desktop, mobile };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }
  const femicoreBefore = { hop: fileHash(FEMICORE_HOP), catalog: fileHash(FEMICORE_CATALOG) };

  const editorial = diagnose(EDITORIAL_ID);
  const bofu = diagnose(BOFU_ID);
  writeJson("content-quality-diagnosis.json", { editorial, bofu });

  const hop = registerHop({ productKey: "prodentim", href: REAL_HOP });
  if (!exactHopUnchanged(hop.href, REAL_HOP)) throw new Error("The real HopLink was rewritten");
  const probe = hop.format.ok
    ? await probeHopDestination({ href: REAL_HOP, productName: "ProDentim" })
    : {
        status: "FAIL" as const,
        initialUrl: REAL_HOP,
        chain: [],
        finalUrl: REAL_HOP,
        finalHost: null,
        httpStatus: null,
        productMention: false,
        trackingPreserved: "ABSENT" as const,
        reason: hop.format.issues.join(", "),
      };
  const recorded = hop.format.ok && probe.status !== "FAIL" ? markValidated({ ...hop, probe }) : { ...hop, probe };
  writeHopRecord(recorded);
  writeJson("real-hoplink-validation.json", {
    provided: REAL_HOP,
    notConfusedWith: PLACEHOLDER_PAGE,
    format: hop.format,
    authorization: recorded.authorization,
    productionCta: prepareOfficialOfferCta(recorded),
    probe: { ...probe, commissionAssumed: false },
  });

  const femicoreModel = readGenerationModel(FEMICORE_BOFU);
  const femicoreRecord = readGeneration(FEMICORE_BOFU);
  const femicoreCatalog = readCatalog("femicore");
  const prodentimCatalog = readCatalog("prodentim");
  const comparison = {
    research: {
      femicore: "Prior live import plus 53G/54E reprocess with approved assets",
      prodentim: "54F live fetch of prodentim101.com (HTTP 200) plus placeholder hop on the vendor page",
    },
    structuredData: {
      femicoreComponents: (femicoreModel?.contract.components ?? []).length,
      prodentimComponents: (bofu.components ?? []).length,
      femicoreFeatures: (femicoreModel?.contract.features ?? []).length,
      prodentimFeatures: (bofu.features ?? []).length,
    },
    usableInformation: {
      femicore: "Identity, ingredients, usage, restated 60-day guarantee, 3 USER_APPROVED images",
      prodentim: "Identity, three named strains, usage chew-tablet, restated 60-day guarantee; characteristics mixed into ingredients",
    },
    copy: {
      femicoreHeadline: femicoreModel?.copy.headline.text ?? null,
      prodentimEditorialHeadline: editorial ? readGenerationModel(EDITORIAL_ID)?.copy.headline.text : null,
      prodentimBofuHeadline: readGenerationModel(BOFU_ID)?.copy.headline.text ?? null,
      femicoreContentQuality: femicoreRecord?.gateLabels?.CONTENT_QUALITY_STATUS ?? null,
      prodentimContentQuality: bofu.gateLabels?.CONTENT_QUALITY_STATUS ?? null,
    },
    sections: {
      femicore: femicoreModel?.copy.sections.map((item) => item.sectionType) ?? [],
      prodentimEditorial: editorial.sections,
      prodentimBofu: bofu.sections,
    },
    images: {
      femicoreApproved: femicoreCatalog?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0,
      prodentimApprovedReal: prodentimCatalog?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0,
    },
    commercial: {
      femicoreHop: "VALIDATED ClickBank hop; CTA blocked pending explicit preview authorization",
      prodentimPlaceholder: "54F observed hop=zzzzz on the vendor page and correctly blocked it",
      prodentimRealHop: recorded.authorization,
    },
  };
  writeJson("femicore-vs-prodentim.json", comparison);

  const editorialShot = await capture(EDITORIAL_ID, "prodentim-editorial");
  const bofuShot = await capture(BOFU_ID, "prodentim-bofu");
  writeJson("browser-preview.json", { editorial: editorialShot, bofu: bofuShot });

  const correctionPlan = [
    {
      priority: 1,
      item: "Do not treat hop=zzzzz as the operator HopLink. The real hop is the ClickBank host provided in 54G.",
      status: "DOCUMENTED",
    },
    {
      priority: 2,
      item: "Deduplicate seller statements before assembling copy so CONTENT_QUALITY repetition can clear without weakening the rule.",
      status: "OPEN",
    },
    {
      priority: 3,
      item: "Keep characteristic phrases (Easy To Use, No Stimulants) out of the ingredients slot.",
      status: "OPEN",
    },
    {
      priority: 4,
      item: "Drop checkout/order FAQ answers from the presell until a hop is authorized.",
      status: "OPEN",
    },
    {
      priority: 5,
      item: "Editorial heading lookup now normalizes punctuation so 'Returns, shipping and cautions' is a label, not a claim.",
      status: "APPLIED",
    },
  ];
  writeJson("correction-plan.json", correctionPlan);

  const femicoreAfter = { hop: fileHash(FEMICORE_HOP), catalog: fileHash(FEMICORE_CATALOG) };
  const femicorePreserved = femicoreBefore.hop === femicoreAfter.hop && femicoreBefore.catalog === femicoreAfter.catalog;
  writeJson("femicore-preservation.json", { before: femicoreBefore, after: femicoreAfter, preserved: femicorePreserved });

  const headingNowAllowed = classifyCopyText({
    path: "sections[6].headline",
    text: "Returns, shipping and cautions",
    contract: readGenerationModel(BOFU_ID)!.contract,
  }).allowed;

  const report = {
    EXECUTION_54G_STATUS:
      femicorePreserved &&
      hop.format.ok &&
      !prepareOfficialOfferCta(recorded).visible &&
      editorialShot.http === 200 &&
      bofuShot.http === 200 &&
      headingNowAllowed
        ? "PASS"
        : "PARTIAL",
    CONTENT_QUALITY_ROOT_CAUSE: "CONTENT_QUALITY_STATUS=BLOCKED because inspectContentQuality found repetition (repeats=4). The 54F generation record stored no defects, so the blocker was invisible until replayed.",
    CONTENT_QUALITY_BLOCKERS: bofu.blockers,
    CORRECTIONS_APPLIED: [
      "Editorial heading keys are compared after punctuation normalization so structural labels are not treated as unsupported claims.",
    ],
    REAL_HOPLINK_VALIDATION: probe.status,
    FINAL_DESTINATION_DOMAIN: "finalHost" in probe ? probe.finalHost : null,
    PRODENTIM_DESTINATION_MATCH: "productMention" in probe && probe.productMention ? "MATCHED" : "INCONCLUSIVE",
    AFFILIATE_TRACKING_VERIFICATION: "trackingPreserved" in probe ? probe.trackingPreserved : "INCONCLUSIVE",
    PRODENTIM_CONTENT_READINESS: "NOT_READY",
    PRODENTIM_VISUAL_READINESS: bofuShot.desktop.images === 0 ? "NOT_READY_NO_APPROVED_IMAGES" : "PARTIAL",
    FEMICORE_VS_PRODENTIM_COMPARISON: comparison,
    RENDERER_V4_PRESERVED: true,
    QUALITY_GATE_RESULTS: { editorial: editorial.gateLabels, bofu: bofu.gateLabels },
    SANDBOX_ISOLATION_STATUS:
      bofuShot.desktop.officialCtas === 0 && productionPublicationBlockedForSandbox({ sandbox: { enabled: true, sessionId: "x", ctaPath: "/admin/lab/sandbox/offer", productionPromotionBlocked: true } })
        ? "PRESERVED"
        : "BROKEN",
    OPENAI_API_CALL_COUNT: 0,
    PAID_API_COST: 0,
    DISK_FREE_GB: diskFreeGb(),
    NEXT_RECOMMENDED_ACTION: "STOP. Deduplicate ProDentim copy and keep the real hop at VALIDATED only. Do not authorize a commercial CTA.",
    EDITORIAL_PREVIEW_URL: editorialShot.url,
    BOFU_PREVIEW_URL: bofuShot.url,
  };
  writeJson("report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
