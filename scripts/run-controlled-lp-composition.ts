/**
 * First controlled LP composition run — diagnostic preview only.
 * Reuses the persisted second-real-generation Joint Genesis variant.
 * Does not call Anthropic, Import, Market Research, Web Anatomy, or publish.
 */
import fs from "node:fs";
import path from "node:path";
import {
  composePresellPage,
  consumerVisibleText,
  reconstructPageBody,
  serializePresellPage,
  validateComposedPage,
  type PresellPage,
  type PresellSection,
} from "../src/lib/presell-page.ts";
import { withImportQuality, type ProductFacts } from "../src/lib/product-facts.ts";
import { createCampaign, getCampaignBySlug, updateCampaignCreative, updateCampaignDesign } from "../src/lib/campaigns.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { serializeDesignPlan } from "../src/lib/design/plan.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { serializeCreativeCompositionPlan } from "../src/lib/creative/plan.ts";
import { VALIDATION_SAFE_AFFILIATE, VALIDATION_SAFE_HREF } from "../src/lib/validation/constants.ts";
import { collectLayoutSnapshot } from "../src/lib/visual-qa/collect-layout.ts";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE } from "../src/lib/analytics.ts";
import { INTERNAL_FRAME_HEADER, internalFrameSecret } from "../src/lib/admin-session.ts";
import { inspectRenderedPresell } from "../src/lib/visual-qa/browser.ts";

function loadLocalEnv() {
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function eligibleValue(audit: AuditFile, field: string): string {
  const row = audit.eligible.find((item) => item.field === field);
  if (!row) throw new Error(`Missing eligible field ${field} in audit snapshot`);
  return row.value;
}

type AuditFile = {
  factsConfidence: ProductFacts["confidence"];
  eligible: Array<{ field: string; confidence: string; value: string }>;
  strategy: string;
  variant: { approach: "BUYER_GUIDE"; headline: string; body: string; ctaLabel: string };
  gates: {
    GROUNDING_GATE: string;
    POLICY_GATE: string;
    CONTENT_GATE: string;
    UNSUPPORTED_CLAIMS: unknown[];
    POLICY_FINDINGS: unknown[];
  };
};

const RECOVERED_FEATURES = [
  "Nourishes and hydrates cartilage – Joint Genesis delivers essential nutrients that help keep cartilage healthy and well-hydrated, creating a protective cushion against daily wear and tear.",
  "Enhances bone strength and density – The formula supports stronger bones by improving mineral absorption and density, promoting long-term skeletal support.",
  "Promotes smooth, friction-free movement – By improving joint lubrication, Joint Genesis reduces stiffness and friction, allowing for easier, more comfortable movement.",
  "Improves flexibility and range of motion – Regular use helps increase joint flexibility, making everyday movements and physical activities feel more natural and less restricted.",
  "Supports a healthy inflammatory response – Joint Genesis helps maintain balanced inflammation levels, reducing swelling and discomfort in joints.",
];

function reconstructFacts(audit: AuditFile): ProductFacts {
  const truncatedFeatures = eligibleValue(audit, "features");
  const truncatedTail = truncatedFeatures.includes("By improv") && !truncatedFeatures.includes("By improving joint lubrication");
  if (!truncatedTail) {
    throw new Error("Audit features dump was expected to be truncated; refusing to guess a different snapshot");
  }
  const facts: ProductFacts = {
    productName: eligibleValue(audit, "productName"),
    sourceUrl: "https://jointgenesisofficial.com/",
    origin: "IMPORTED",
    description: eligibleValue(audit, "description"),
    features: RECOVERED_FEATURES,
    ingredientsOrComponents: eligibleValue(audit, "ingredientsOrComponents")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean),
    usageInformation: [eligibleValue(audit, "usageInformation")],
    cautions: [eligibleValue(audit, "cautions")],
    pricingInformation: undefined,
    guaranteeInformation: eligibleValue(audit, "guaranteeInformation"),
    manufacturer: undefined,
    sourceSnippets: [],
    importWarnings: [
      "CONTROLLED_RUN: full ProductFacts object was not in SQLite; rebuilt from data/second-real-generation-audit.json eligible snapshot.",
      "CONTROLLED_RUN: features string in the audit dump was truncated mid-word; completed from the same import restore recorded in the prior lab session. No new Import.",
    ],
    confidence: { ...audit.factsConfidence },
    importQuality: "SUFFICIENT",
    productImageProvenance: "NOT_FOUND",
  };
  return withImportQuality(facts);
}

function sectionText(section: PresellSection): string {
  return [
    ...section.paragraphs,
    ...section.bullets,
    ...section.cards.map((card) => `${card.title} ${card.body}`),
    ...section.faq.map((item) => `${item.question} ${item.answer}`),
  ].join("\n");
}

function classifySource(section: PresellSection, variantBody: string, facts: ProductFacts): string {
  const text = sectionText(section);
  if (!section.visible || !text.trim()) return "OMITTED";
  if (section.id === "ingredients" && facts.ingredientsOrComponents.some((item) => text.includes(item))) {
    return section.paragraphs.length ? "VARIANT+PRODUCT_FACTS" : "PRODUCT_FACTS";
  }
  if (section.id === "features" && facts.features.some((item) => text.includes(item)) && !variantBody.includes(text.slice(0, 40))) {
    return "PRODUCT_FACTS";
  }
  if (section.id === "usage" && facts.usageInformation.some((item) => text.includes(item))) {
    return variantBody.toLowerCase().includes("how to use") ? "VARIANT" : "PRODUCT_FACTS";
  }
  if (section.id === "guarantee" && facts.guaranteeInformation && text.includes(facts.guaranteeInformation)) {
    return "PRODUCT_FACTS";
  }
  if (section.id === "quickSummary") return "PRODUCT_FACTS";
  if (variantBody.includes(section.paragraphs[0] || section.bullets[0] || "")) return "VARIANT";
  return "VARIANT";
}

function scanForbiddenCopy(page: PresellPage): {
  heuristic: boolean;
  notFound: boolean;
  aiClass: boolean;
  hits: string[];
} {
  const visible = consumerVisibleText(page);
  const hits: string[] = [];
  const heuristic = /HEURISTIC_EXTRACTION/.test(visible);
  const notFound = /\bNOT_FOUND\b/.test(visible);
  const aiClass = /AI_SOURCE_CLASSIFICATION/.test(visible);
  if (heuristic) hits.push("HEURISTIC_EXTRACTION in consumer text");
  if (notFound) hits.push("NOT_FOUND in consumer text");
  if (aiClass) hits.push("AI_SOURCE_CLASSIFICATION in consumer text");
  return { heuristic, notFound, aiClass, hits };
}

function pageValueScan(page: PresellPage, facts: ProductFacts) {
  const text = JSON.stringify(page);
  const visible = consumerVisibleText(page);
  const guaranteeSection = page.sections.find((s) => s.id === "guarantee");
  return {
    "60_DAY_GUARANTEE": {
      PAGE_VALUE: /60-day/.test(visible) ? visible.match(/[^.]*60-day[^.]*\./i)?.[0] || "present in copy" : "ABSENT",
      SOURCE_FIELD: "guaranteeInformation / variant body",
      PROVENANCE: facts.confidence.guaranteeInformation,
      ALLOWED: facts.confidence.guaranteeInformation === "DIRECT_SOURCE" ? "YES_FOR_FACT_SURFACE" : "NO",
      IN_GUARANTEE_SECTION: Boolean(guaranteeSection?.visible && /60-day/.test(sectionText(guaranteeSection))),
    },
    "180_DAY_GUARANTEE": {
      PAGE_VALUE: /180-day/.test(visible) ? "PRESENT" : "ABSENT",
      SOURCE_FIELD: "none",
      PROVENANCE: "n/a",
      ALLOWED: "NO",
    },
    MANUFACTURER: {
      PAGE_VALUE: page.omitted.find((o) => o.component === "Manufacturer")?.reason || "see copy",
      SOURCE_FIELD: "manufacturer",
      PROVENANCE: facts.confidence.manufacturer,
      ALLOWED: "NO_FACT_SURFACE",
      COPY_MENTIONS_USA: /manufactured in the USA/i.test(visible),
    },
    USA_MANUFACTURE: {
      PAGE_VALUE: /manufactured in the USA/i.test(visible) ? "PRESENT_IN_VARIANT_COPY" : "ABSENT",
      SOURCE_FIELD: "variant body (not ProductFacts.manufacturer)",
      PROVENANCE: "VARIANT",
      ALLOWED: "NO",
    },
    GMP_FACILITY: {
      PAGE_VALUE: /GMP-certified/i.test(visible) ? "PRESENT_IN_VARIANT_COPY" : "ABSENT",
      SOURCE_FIELD: "variant body",
      PROVENANCE: "VARIANT",
      ALLOWED: "NO",
    },
    PRICING: {
      PAGE_VALUE: page.omitted.find((o) => o.component === "Pricing")?.reason || visible.match(/[^.]*pric[^.]*\./i)?.[0] || "ABSENT",
      SOURCE_FIELD: "pricingInformation",
      PROVENANCE: facts.confidence.pricingInformation,
      ALLOWED: "NO_FACT_SURFACE",
      COPY_MENTIONS_PRICING: /pricing/i.test(visible),
    },
    INGREDIENTS: {
      PAGE_VALUE: page.sections.find((s) => s.id === "ingredients")?.cards.map((c) => c.title) || [],
      SOURCE_FIELD: "ingredientsOrComponents",
      PROVENANCE: facts.confidence.ingredientsOrComponents,
      ALLOWED: "YES",
    },
    USAGE: {
      PAGE_VALUE: sectionText(page.sections.find((s) => s.id === "usage")!),
      SOURCE_FIELD: "usageInformation / variant How to Use",
      PROVENANCE: facts.confidence.usageInformation,
      ALLOWED: "YES",
    },
    CAUTIONS: {
      PAGE_VALUE: /consult your healthcare provider/i.test(visible) ? "PRESENT" : "ABSENT",
      SOURCE_FIELD: "cautions / variant",
      PROVENANCE: facts.confidence.cautions,
      ALLOWED: "YES",
    },
    JSON_HAS_HEURISTIC_KEY: /HEURISTIC_EXTRACTION/.test(text),
    JSON_HAS_NOT_FOUND_KEY: /NOT_FOUND/.test(text),
    JSON_HAS_AI_CLASS_KEY: /AI_SOURCE_CLASSIFICATION/.test(text),
  };
}

async function inspectPreview(slug: string, baseUrl: string, outDir: string) {
  const { chromium } = await import("playwright");
  fs.mkdirSync(outDir, { recursive: true });
  const url = `${baseUrl.replace(/\/$/, "")}/visual-frame/${encodeURIComponent(slug)}`;
  const consoleErrors: string[] = [];
  const jsErrors: string[] = [];
  const httpErrors: string[] = [];
  const failedRequests: string[] = [];

  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        [ANALYTICS_SKIP_HEADER]: ANALYTICS_SKIP_VALUE,
        ...(internalFrameSecret() ? { [INTERNAL_FRAME_HEADER]: internalFrameSecret() as string } : {}),
      },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => jsErrors.push(err.message));
    page.on("requestfailed", (req) => failedRequests.push(`${req.failure()?.errorText || "failed"} ${req.url()}`));
    page.on("response", (res) => {
      if (res.status() >= 400) httpErrors.push(`${res.status()} ${res.url()}`);
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const pageLoad = !response || response.status() >= 400 ? `FAIL HTTP ${response?.status() ?? "none"}` : "OK";
    await page.waitForSelector("article", { timeout: 30_000 });
    await page.waitForTimeout(400);

    const desktopPath = path.join(outDir, "desktop-1440x1000-full.jpg");
    await page.screenshot({ path: desktopPath, fullPage: true, type: "jpeg", quality: 52 });
    const desktopSnap = (await page.evaluate(`(${collectLayoutSnapshot.toString()})()`)) as ReturnType<typeof collectLayoutSnapshot>;

    const desktopCta = await page.evaluate(() => {
      const el = document.querySelector('[data-cta-position="hero"]') as HTMLAnchorElement | null;
      return {
        rendered: Boolean(el),
        label: (el?.textContent || "").trim(),
        href: el?.getAttribute("href") || "",
        disabled: el?.getAttribute("data-validation-cta") === "disabled",
      };
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(500);
    const sticky = await page.evaluate(() => {
      const bar = document.querySelector("[data-sticky-visible]");
      const styles = bar ? window.getComputedStyle(bar) : null;
      return {
        present: Boolean(bar),
        dataVisible: bar?.getAttribute("data-sticky-visible") || null,
        display: styles?.display || null,
        visibility: styles?.visibility || null,
        className: bar?.className || null,
      };
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const mobilePath = path.join(outDir, "mobile-390x844-full.jpg");
    await page.screenshot({ path: mobilePath, fullPage: true, type: "jpeg", quality: 52 });
    const mobileSnap = (await page.evaluate(`(${collectLayoutSnapshot.toString()})()`)) as ReturnType<typeof collectLayoutSnapshot>;

    const overflow: Record<number, boolean> = {};
    for (const width of [375, 768, 1024]) {
      await page.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
      await page.waitForTimeout(200);
      overflow[width] = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    }

    const imageAudit = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("article img")] as HTMLImageElement[];
      return imgs.map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt,
        naturalWidth: img.naturalWidth,
        complete: img.complete,
        broken: img.complete && img.naturalWidth === 0,
      }));
    });

    await context.close();
    return {
      url,
      pageLoad,
      consoleErrors,
      jsErrors,
      httpErrors,
      failedRequests,
      desktopPath,
      mobilePath,
      desktopSnap,
      mobileSnap,
      overflow,
      sticky,
      desktopCta,
      imageAudit,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  loadLocalEnv();
  const auditPath = path.join(process.cwd(), "data", "second-real-generation-audit.json");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditFile;
  const facts = reconstructFacts(audit);
  const variant = audit.variant;
  const template = "BUYER_GUIDE" as const;

  const page = composePresellPage({ variant, facts, template });
  const validation = validateComposedPage(page, facts, VALIDATION_SAFE_AFFILIATE);
  const forbidden = scanForbiddenCopy(page);
  const known = pageValueScan(page, facts);

  const design = createDesignPlan({
    page,
    productAssetStatus: "NEEDS_ASSET",
    productAssetProvenance: "NOT_FOUND",
    strategyHint: "BUYER_GUIDE",
  });
  const creative = createCreativeCompositionPlan({ page, design });

  const slug = "joint-genesis-controlled-lp-diagnostic";
  const existing = getCampaignBySlug(slug);
  if (existing && existing.publicationStatus !== "draft") {
    throw new Error(`Slug ${slug} exists and is not draft; refusing to overwrite a published campaign`);
  }

  const campaignInput = {
    name: "Joint Genesis controlled LP diagnostic (DO NOT PUBLISH)",
    slug,
    headline: page.hero.headline,
    body: reconstructPageBody(page),
    ctaLabel: page.ctaLabel,
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    pageTemplate: page.template,
    pageComposition: serializePresellPage(page),
    productImageSrc: page.hero.image.src || null,
    productImageProvenance: page.hero.image.provenance,
    subheadline: page.hero.subheadline,
    sourceFactsJson: JSON.stringify(facts),
    designPlanJson: serializeDesignPlan(design),
    visualTheme: design.visualTheme,
    designVersion: design.version,
    productAssetStatus: "NEEDS_ASSET",
  };

  let campaign = existing
    ? (await import("../src/lib/campaigns.ts")).updateCampaign(existing.id, campaignInput)
    : createCampaign(campaignInput);
  campaign = updateCampaignDesign(campaign.id, {
    designPlanJson: serializeDesignPlan(design),
    visualTheme: design.visualTheme,
    designVersion: design.version,
    productAssetStatus: "NEEDS_ASSET",
  });
  campaign = updateCampaignCreative(campaign.id, {
    creativeCompositionJson: serializeCreativeCompositionPlan(creative),
    creativeCompositionVersion: creative.version,
  });

  if (campaign.publicationStatus !== "draft") {
    throw new Error(`Expected draft, got ${campaign.publicationStatus}`);
  }

  const outDir = path.join(process.cwd(), "data", "visual-qa-tmp", "controlled-lp-run-joint-genesis");
  const baseUrl = process.env.PHASE1_BASE_URL || "http://localhost:3000";
  const inspect = await inspectPreview(slug, baseUrl, outDir);
  const official = await inspectRenderedPresell({
    slug,
    baseUrl,
    artifactKey: "controlled-lp-run-joint-genesis-official",
  });

  const report = {
    RUN_SOURCE: {
      PRODUCT: facts.productName,
      VARIANT_SOURCE: auditPath,
      INPUT_VARIANT_ID: "second-real-generation",
      EXISTING_VARIANT_REUSED: "YES",
      EXISTING_FACTS_REUSED: "YES",
      FACTS_OBJECT_IN_SQLITE_BEFORE_RUN: "NO",
      FACTS_REBUILT_FROM_AUDIT_ELIGIBLE: "YES",
      FEATURES_TAIL_RECOVERED_FROM_SAME_IMPORT_RESTORE: "YES",
      NEW_AI_CALL: "NO",
      NEW_IMPORT: "NO",
      NEW_MARKET_RESEARCH: "NO",
    },
    PRECONDITION: {
      STRATEGY_TYPE: audit.strategy,
      GROUNDING_GATE: audit.gates.GROUNDING_GATE,
      POLICY_GATE: audit.gates.POLICY_GATE,
      CONTENT_GATE: audit.gates.CONTENT_GATE,
      RUN_MODE: "DIAGNOSTIC_PREVIEW",
    },
    COMPOSITION: {
      TEMPLATE_SELECTED: page.template,
      INPUT_VARIANT_ID: "second-real-generation",
      PRODUCT: facts.productName,
      COMPOSITION_RESULT: "OK",
      CAMPAIGN_ID: campaign.id,
      SLUG: campaign.slug,
      PUBLICATION_STATUS: campaign.publicationStatus,
      PAGE_SECTIONS: page.sections.map((s) => ({ id: s.id, title: s.title, visible: s.visible })),
      OMITTED: page.omitted,
      HERO: page.hero,
      GUARANTEE_DAYS_DISPLAY: page.guaranteeDaysDisplay,
    },
    SECTION_PROVENANCE: [
      { SECTION: "Hero", SOURCE: "VARIANT", FACT_FIELDS: "productName", COPY_ELIGIBLE: "YES", RENDERED: true },
      {
        SECTION: "Quick Summary",
        SOURCE: "PRODUCT_FACTS",
        FACT_FIELDS: "features,guaranteeInformation",
        COPY_ELIGIBLE: "YES",
        RENDERED: page.hero.highlights.length > 0,
      },
      ...page.sections.map((section) => ({
        SECTION: section.id,
        SOURCE: classifySource(section, variant.body, facts),
        FACT_FIELDS:
          section.id === "ingredients"
            ? "ingredientsOrComponents"
            : section.id === "usage"
              ? "usageInformation"
              : section.id === "features"
                ? "features"
                : section.id === "guarantee"
                  ? "guaranteeInformation"
                  : section.id === "considerations"
                    ? "cautions"
                    : "",
        COPY_ELIGIBLE: section.visible ? "MIXED_VARIANT" : "n/a",
        RENDERED: section.visible,
        TITLE: section.title,
      })),
      { SECTION: "Trust/Disclosure", SOURCE: "STATIC_CHROME", FACT_FIELDS: "", COPY_ELIGIBLE: "n/a", RENDERED: true },
      { SECTION: "Health Disclaimer", SOURCE: "STATIC_CHROME", FACT_FIELDS: "", COPY_ELIGIBLE: "n/a", RENDERED: true },
      { SECTION: "CTA hero", SOURCE: "STRUCTURAL", FACT_FIELDS: "", COPY_ELIGIBLE: "n/a", RENDERED: design.ctaStrategy.hero },
      { SECTION: "CTA mid", SOURCE: "STRUCTURAL", FACT_FIELDS: "", COPY_ELIGIBLE: "n/a", RENDERED: design.ctaStrategy.afterPrimaryFacts },
      { SECTION: "CTA final", SOURCE: "STRUCTURAL", FACT_FIELDS: "", COPY_ELIGIBLE: "n/a", RENDERED: design.ctaStrategy.final },
      { SECTION: "Sticky mobile CTA", SOURCE: "STRUCTURAL", FACT_FIELDS: "", COPY_ELIGIBLE: "n/a", RENDERED: design.ctaStrategy.stickyMobile },
    ],
    FACT_SAFETY: {
      HEURISTIC_COPY_PRESENT: forbidden.heuristic ? "YES" : "NO",
      NOT_FOUND_COPY_PRESENT: forbidden.notFound ? "YES" : "NO",
      AI_SOURCE_CLASSIFICATION_COPY_PRESENT: forbidden.aiClass ? "YES" : "NO",
      HITS: forbidden.hits,
      OMITTED_REASONS_INCLUDE_NOT_FOUND: page.omitted.some((o) => o.reason === "NOT_FOUND"),
    },
    KNOWN_FACTS: known,
    COMPOSED_VALIDATION: {
      GROUNDING: validation.grounding.status,
      POLICY: validation.policy,
      CONTENT_GATE: validation.finalGate,
      FINDINGS: {
        unsupportedClaims: validation.grounding.unsupportedClaims,
        notes: validation.grounding.notes,
      },
    },
    RENDER: {
      AFFILIATE_NAVIGATION_DISABLED: inspect.desktopCta.disabled ? "YES" : "NO",
      CTA: inspect.desktopCta,
      EXPECTED_SAFE_HREF: VALIDATION_SAFE_HREF,
      URL: inspect.url,
    },
    DESKTOP: {
      VIEWPORT: "1440x1000",
      PAGE_LOAD: inspect.pageLoad,
      HTTP_ERRORS: inspect.httpErrors,
      CONSOLE_ERRORS: inspect.consoleErrors,
      JS_ERRORS: inspect.jsErrors,
      FAILED_REQUESTS: inspect.failedRequests,
      OVERFLOW_X: inspect.desktopSnap.overflowX,
      BROKEN_IMAGES: inspect.imageAudit.filter((img) => img.broken),
      MISSING_ASSETS: inspect.failedRequests,
      SCREENSHOT: inspect.desktopPath,
      SNAPSHOT: {
        h1: inspect.desktopSnap.h1,
        h2: inspect.desktopSnap.h2,
        overflowX: inspect.desktopSnap.overflowX,
        pageHeight: inspect.desktopSnap.pageHeight,
        disclosurePresent: inspect.desktopSnap.disclosurePresent,
        healthDisclaimerPresent: inspect.desktopSnap.healthDisclaimerPresent,
        ctas: inspect.desktopSnap.ctas,
      },
    },
    MOBILE: {
      VIEWPORT: "390x844",
      PAGE_LOAD: inspect.pageLoad,
      HTTP_ERRORS: inspect.httpErrors,
      CONSOLE_ERRORS: inspect.consoleErrors,
      JS_ERRORS: inspect.jsErrors,
      OVERFLOW_X: inspect.mobileSnap.overflowX,
      BROKEN_IMAGES: inspect.imageAudit.filter((img) => img.broken),
      MISSING_ASSETS: inspect.failedRequests,
      STICKY_CTA: inspect.sticky,
      SCREENSHOT: inspect.mobilePath,
      SNAPSHOT: {
        h1: inspect.mobileSnap.h1,
        h2: inspect.mobileSnap.h2,
        overflowX: inspect.mobileSnap.overflowX,
        pageHeight: inspect.mobileSnap.pageHeight,
        stickyDisplay: inspect.mobileSnap.stickyDisplay,
        ctas: inspect.mobileSnap.ctas,
      },
    },
    RESPONSIVE: inspect.overflow,
    OFFICIAL_INSPECT: {
      engine: official.engine,
      screenshotFiles: official.captures.flatMap((c) => c.screenshotFiles),
      overflows: official.captures.map((c) => ({
        viewport: `${c.viewport.width}x${c.viewport.height}`,
        overflowX: c.snapshot.overflowX,
        captureScreenshots: c.viewport.captureScreenshots,
      })),
    },
    SAFETY: {
      DIAGNOSTIC_PREVIEW: "YES",
      APPROVED_PAGE: "NO",
      PUBLISHABLE_PAGE: "NO",
      PUBLIC_ROUTE_CREATED: "NO",
      PUBLICATION_STATUS: campaign.publicationStatus,
    },
    WEB_ANATOMY: { EXECUTED: "NO", STATUS: "DEFERRED" },
    PAGE: page,
  };

  const reportPath = path.join(outDir, "REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, slug, campaignId: campaign.id, gate: validation.finalGate, screenshots: { desktop: inspect.desktopPath, mobile: inspect.mobilePath } }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
