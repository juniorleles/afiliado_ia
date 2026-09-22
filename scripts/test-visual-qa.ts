// npx tsx scripts/test-visual-qa.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { ANALYTICS_SKIP_HEADER, ANALYTICS_SKIP_VALUE, analyticsSkipHeaders, canRecordAnalytics } from "../src/lib/analytics.ts";
import { createCampaign, type CampaignInput } from "../src/lib/campaigns.ts";
import { resetDbForTests } from "../src/lib/db.ts";
import { analyzeLayoutSnapshot, uniqueRecommendedFixes } from "../src/lib/visual-qa/deterministic.ts";
import { composeVisualQaGate } from "../src/lib/visual-qa/gate.ts";
import { parseVisualQaAiText, buildVisualReviewPrompt, VISUAL_QA_JSON_SCHEMA, VISUAL_QA_MODEL } from "../src/lib/visual-qa/multimodal.ts";
import { composeVisualQaReport } from "../src/lib/visual-qa/run.ts";
import { saveVisualQaReport, getLatestVisualQaReport } from "../src/lib/visual-qa/store.ts";
import {
  FINDING_SEVERITIES,
  TARGET_VISUAL_STANDARD,
  VISUAL_QA_ACTION_CODES,
  VISUAL_QA_STATUSES,
  type LayoutSnapshot,
  type VisualQaFinding,
} from "../src/lib/visual-qa/types.ts";
import { inspectionViewports, PRIMARY_VIEWPORTS, shouldSegmentScreenshot } from "../src/lib/visual-qa/viewports.ts";
import { JsonExtractError } from "../src/lib/ai/parse-ai-json.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string) {
  return path.join(process.cwd(), rel);
}

function snapshot(partial: Partial<LayoutSnapshot> & { viewport: LayoutSnapshot["viewport"] }): LayoutSnapshot {
  return {
    scrollWidth: partial.viewport.width,
    clientWidth: partial.viewport.width,
    pageHeight: 2400,
    overflowX: false,
    h1: { text: "A clear product headline", fontSize: 40, width: 700, height: 48, wraps: false },
    h2: ["Key ingredients", "How to use"],
    images: [
      {
        alt: "Product packshot",
        width: 360,
        height: 360,
        naturalWidth: 800,
        naturalHeight: 800,
        role: "img",
        placeholder: false,
      },
    ],
    cards: { count: 4, uniqueTexts: 4, avgHeight: 90 },
    paragraphs: { count: 6, longCount: 0, maxChars: 140 },
    ctas: [
      { position: "hero", width: 220, height: 48, visible: true, top: 520 },
      { position: "final", width: 220, height: 48, visible: true, top: 1800 },
    ],
    stickyDisplay: "none",
    disclosurePresent: true,
    footerLinks: ["About", "Contact", "Privacy Policy", "Terms", "Affiliate Disclosure"],
    healthDisclaimerPresent: true,
    faqDetails: 2,
    fakeTrustHits: [],
    articlePresent: true,
    ...partial,
  };
}

const mobileVp = { width: 390, height: 844, label: "mobile" };
const desktopVp = { width: 1440, height: 1000, label: "desktop" };

assert(TARGET_VISUAL_STANDARD === "PREMIUM_INTERNATIONAL", "target visual standard is PREMIUM_INTERNATIONAL");
assert(VISUAL_QA_STATUSES.join(",") === "PASS,REVIEW_REQUIRED", "visual QA statuses");
assert(FINDING_SEVERITIES.join(",") === "INFO,WARNING,HIGH", "finding severities");
assert(VISUAL_QA_ACTION_CODES.includes("REDUCE_VISIBLE_CONTENT_DENSITY"), "density action code");
assert(VISUAL_QA_ACTION_CODES.includes("PROMOTE_PRODUCT_VISUAL"), "product visual action code");
assert(VISUAL_QA_ACTION_CODES.includes("COLLAPSE_SECONDARY_DETAILS"), "collapse action code");
assert(VISUAL_QA_JSON_SCHEMA.properties.findings.items.properties.actionCode.enum.length === VISUAL_QA_ACTION_CODES.length, "schema action codes match");
assert(VISUAL_QA_MODEL.includes("claude"), "multimodal model is Anthropic Claude");

const docs = readFileSync(joinSrc("docs/VISUAL_STANDARD.md"), "utf8");
assert(docs.includes("TARGET_VISUAL_STANDARD = PREMIUM_INTERNATIONAL"), "visual standard documented");
assert(docs.includes("wall of cards"), "negative quality bar documented");
assert(!/copy this landing page from/i.test(docs), "standard is not a clone brief");

assert(PRIMARY_VIEWPORTS.some((v) => v.width === 390 && v.height === 844), "mobile 390x844");
assert(PRIMARY_VIEWPORTS.some((v) => v.width === 1440 && v.height === 1000), "desktop 1440x1000");
const widths = inspectionViewports().map((v) => v.width);
for (const w of [375, 390, 768, 1024, 1440]) {
  assert(widths.includes(w), `responsive width ${w}`);
}
assert(shouldSegmentScreenshot({ pageHeight: 12000, jpegBytes: 1000 }), "tall pages segment screenshots");
assert(shouldSegmentScreenshot({ pageHeight: 2000, jpegBytes: 4_000_000 }), "large JPEGs segment screenshots");
assert(!shouldSegmentScreenshot({ pageHeight: 2000, jpegBytes: 200_000 }), "small full-page JPEG stays whole");

const negative = snapshot({
  viewport: desktopVp,
  pageHeight: 14000,
  images: [
    {
      alt: "Product image not available",
      width: 320,
      height: 320,
      naturalWidth: 0,
      naturalHeight: 0,
      role: "img",
      placeholder: true,
    },
  ],
  cards: { count: 28, uniqueTexts: 20, avgHeight: 88 },
  paragraphs: { count: 18, longCount: 6, maxChars: 820 },
  h2: ["Overview", "Things to consider", "Key ingredients", "How to use", "FAQ", "Final thoughts"],
  faqDetails: 0,
});
const negativeFindings = analyzeLayoutSnapshot(negative, "REVIEW");
const negativeCodes = new Set(negativeFindings.map((f) => f.actionCode));
assert(
  negativeFindings.some((f) => f.actionCode === "ACQUIRE_PRODUCT_IMAGE" && f.severity === "HIGH"),
  "negative baseline: placeholder product visual",
);
assert(negativeCodes.has("PROMOTE_PRODUCT_VISUAL"), "negative baseline: weak product presentation");
assert(negativeCodes.has("REDUCE_CARD_REPETITION"), "negative baseline: repetitive cards");
assert(negativeCodes.has("REDUCE_VISIBLE_CONTENT_DENSITY"), "negative baseline: high content density");
assert(negativeCodes.has("COLLAPSE_SECONDARY_DETAILS"), "negative baseline: long page");
assert(negativeCodes.has("INCREASE_SECTION_VARIATION"), "negative baseline: weak visual rhythm / imagery");
assert(negativeCodes.has("IMPROVE_PROGRESSIVE_DISCLOSURE"), "negative baseline: weak progressive disclosure");
assert(
  !negativeFindings.some((f) => /prodentim/i.test(f.description)),
  "negative heuristics are not ProDentim-hardcoded",
);

const positive = snapshot({ viewport: desktopVp });
const positiveFindings = analyzeLayoutSnapshot(positive, "EDITORIAL");
assert(
  !positiveFindings.some((f) => f.severity === "HIGH" || f.severity === "WARNING"),
  "positive fixture has no HIGH/WARNING deterministic findings",
);
assert(
  composeVisualQaGate({ findings: positiveFindings, aiVisualReview: "OK" }) === "PASS",
  "positive fixture + AI OK => PASS",
);

assert(
  composeVisualQaGate({ findings: [], aiVisualReview: "UNAVAILABLE" }) === "REVIEW_REQUIRED",
  "AI unavailable is never PASS",
);
assert(
  composeVisualQaGate({ findings: [], aiVisualReview: "PARSE_FAILED" }) === "REVIEW_REQUIRED",
  "AI parse failure is never PASS",
);
assert(
  composeVisualQaGate({ findings: negativeFindings, aiVisualReview: "OK" }) === "REVIEW_REQUIRED",
  "HIGH/WARNING findings keep REVIEW_REQUIRED even when AI ran",
);

const buyerPrompt = buildVisualReviewPrompt({ template: "BUYER_GUIDE", snapshots: [positive] });
const reviewPrompt = buildVisualReviewPrompt({ template: "REVIEW", snapshots: [positive] });
const editorialPrompt = buildVisualReviewPrompt({ template: "EDITORIAL", snapshots: [positive] });
assert(buyerPrompt.system.includes("decision-support"), "BUYER_GUIDE template rubric");
assert(reviewPrompt.system.includes("editorial/product evaluation"), "REVIEW template rubric");
assert(editorialPrompt.system.includes("wellness editorial"), "EDITORIAL template rubric");
assert(buyerPrompt.system.includes("Do NOT rewrite factual product claims"), "AI must not rewrite claims");
assert(!buyerPrompt.system.includes("87/100"), "prompt does not ask for numeric scores");

const parsed = parseVisualQaAiText(
  '```json\n{"findings":[{"category":"hero","severity":"HIGH","viewport":"390x844","description":"Placeholder dominates the hero.","evidence":"empty packshot box","suggestedPresentationFix":"Acquire a real packshot.","actionCode":"PROMOTE_PRODUCT_VISUAL"}]}\n```',
);
assert(parsed.length === 1 && parsed[0]?.source === "multimodal", "structured AI parse from markdown fence");
assert(parsed[0]?.actionCode === "PROMOTE_PRODUCT_VISUAL", "parsed action code preserved");

try {
  parseVisualQaAiText('{"findings":[');
  assert(false, "truncated AI JSON should throw");
} catch (err) {
  assert(err instanceof JsonExtractError, "truncated AI JSON is a parse failure");
}

const mobileFindings = analyzeLayoutSnapshot(
  snapshot({
    viewport: mobileVp,
    stickyDisplay: "none",
    ctas: [{ position: "sticky", width: 390, height: 48, visible: false, top: 800 }],
    images: negative.images,
    cards: { count: 4, uniqueTexts: 4, avgHeight: 80 },
    pageHeight: 4000,
    h2: ["Ingredients"],
  }),
  "REVIEW",
);
assert(
  mobileFindings.some((f) => f.viewport === "390x844"),
  "mobile findings tagged 390x844",
);
assert(
  negativeFindings.some((f) => f.viewport === "1440x1000"),
  "desktop findings tagged 1440x1000",
);

assert(canRecordAnalytics({ published: true, isPreview: true, skipHeader: false }) === false, "preview analytics excluded");
assert(canRecordAnalytics({ published: true, isPreview: false, skipHeader: true }) === false, "skip header excludes analytics");
assert(ANALYTICS_SKIP_HEADER === "x-aia-analytics" && ANALYTICS_SKIP_VALUE === "skip", "skip header contract");

const frameSrc = readFileSync(joinSrc("src/app/visual-frame/[slug]/page.tsx"), "utf8");
assert(frameSrc.includes("renderPixel={false}"), "visual frame disables pixel");
assert(frameSrc.includes("trackClicks={false}"), "visual frame disables CTA tracking");
assert(frameSrc.includes("getCampaignBySlug"), "visual frame can load drafts");
assert(frameSrc.includes("index: false"), "visual frame is noindex");
assert(!frameSrc.includes("recordVisit"), "visual frame does not record PAGE_VIEW");

const browserSrc = readFileSync(joinSrc("src/lib/visual-qa/browser.ts"), "utf8");
assert(browserSrc.includes("ANALYTICS_SKIP_HEADER"), "Playwright sends analytics skip header");
assert(browserSrc.includes("visual-frame"), "Playwright inspects visual-frame, not /p/");
assert(!browserSrc.includes("click(") || browserSrc.includes("details summary"), "QA does not click CTAs");

const runSrc = readFileSync(joinSrc("src/lib/visual-qa/run.ts"), "utf8");
assert(!runSrc.includes("publishCampaign"), "Visual QA does not auto-publish");
assert(runSrc.includes("snapshotContentGate"), "content gate is snapshotted, not rewritten");

const ctaRoute = readFileSync(joinSrc("src/app/api/track/cta/route.ts"), "utf8");
assert(ctaRoute.includes("ANALYTICS_SKIP_VALUE"), "CTA route still honors skip header");
assert(ctaRoute.includes("campaignIsPublished"), "CTA route still refuses unpublished campaigns");

const publicSrc = readFileSync(joinSrc("src/app/p/[slug]/page.tsx"), "utf8");
assert(publicSrc.includes("renderPixel"), "public route still owns the pixel");

const robotsSrc = readFileSync(joinSrc("src/app/robots.ts"), "utf8");
assert(robotsSrc.includes("/visual-frame"), "robots disallows visual-frame");
assert(robotsSrc.includes("/admin"), "robots still disallows admin");

const panelSrc = readFileSync(joinSrc("src/components/admin/visual-qa-panel.tsx"), "utf8");
assert(panelSrc.includes("Run Visual QA"), "admin Visual QA button");
assert(panelSrc.includes("High priority findings"), "admin high priority section");
assert(panelSrc.includes("Recommended visual fixes"), "admin recommended fixes");

const dbSrc = readFileSync(joinSrc("src/lib/db.ts"), "utf8");
assert(dbSrc.includes("visual_qa_reports"), "visual QA table migrated");
assert(!dbSrc.includes("screenshotBlob"), "screenshots are not stored in SQLite");

const tmp = path.join(os.tmpdir(), `afiliado-ia-visual-qa-${process.pid}.db`);
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
process.env.PRESELL_OS_DB = tmp;
resetDbForTests();

const campaign = createCampaign({
  name: "Visual QA fixture",
  slug: `visual-qa-fixture-${Date.now()}`,
  headline: "A clear product headline",
  body: "## Overview\n\nShort.\n",
  ctaLabel: "See offer",
  affiliateUrl: "https://example.com/hop",
  headScript: null,
  adHeadline: null,
  pageTemplate: "REVIEW",
} satisfies CampaignInput);

const extra: VisualQaFinding = {
  category: "hero",
  severity: "HIGH",
  viewport: "1440x1000",
  description: "Hero lacks a product focal point.",
  evidence: "placeholder",
  suggestedPresentationFix: "Promote the product visual.",
  actionCode: "CREATE_HERO_FOCAL_POINT",
  source: "multimodal",
};

const report = composeVisualQaReport({
  campaign,
  viewportReports: [
    {
      viewport: "1440x1000",
      width: 1440,
      height: 1000,
      snapshot: negative,
      deterministicFindings: negativeFindings,
      screenshotFiles: [],
    },
    {
      viewport: "390x844",
      width: 390,
      height: 844,
      snapshot: snapshot({ viewport: mobileVp, images: negative.images, pageHeight: 12000, cards: negative.cards }),
      deterministicFindings: analyzeLayoutSnapshot(
        snapshot({ viewport: mobileVp, images: negative.images, pageHeight: 12000, cards: negative.cards }),
        "REVIEW",
      ),
      screenshotFiles: [],
    },
  ],
  visualFindings: [extra],
  aiVisualReview: "OK",
  technical: {
    engine: "playwright-deterministic",
    lighthouseUsed: false,
    headingOrderOk: true,
    missingAlts: 0,
    smallTapTargets: 0,
    faqKeyboard: true,
    domNodes: 40,
    notes: ["Lighthouse was not invoked"],
  },
});

assert(report.version === 1, "report schema version 1");
assert(report.status === "REVIEW_REQUIRED", "composed report is REVIEW_REQUIRED");
assert(
  report.contentGate === "READY" || report.contentGate === "REVIEW_REQUIRED" || report.contentGate === "BLOCKED",
  "content gate is a publication gate snapshot",
);
assert(report.publicationStatus === "draft", "fixture remains draft in the report");
assert(report.highPriority.length > 0, "high priority findings collected");
assert(uniqueRecommendedFixes(report.deterministicFindings.concat(report.visualFindings)).length > 0, "actionable recommended fixes");
assert(report.viewportReports.length === 2, "mobile and desktop viewport reports");

const id = saveVisualQaReport(report);
assert(id > 0, "visual QA report persisted");
const loaded = getLatestVisualQaReport(campaign.id);
assert(loaded?.status === "REVIEW_REQUIRED", "persisted report reloads");
assert(!JSON.stringify(loaded).includes("data:image"), "persisted JSON has no screenshot blobs");

const unavailable = composeVisualQaReport({
  campaign,
  viewportReports: report.viewportReports,
  visualFindings: [],
  aiVisualReview: "UNAVAILABLE",
  technical: report.technical,
});
assert(unavailable.status === "REVIEW_REQUIRED", "deterministic fallback still REVIEW_REQUIRED when AI is down");
assert(unavailable.deterministicFindings.length > 0, "deterministic findings preserved when AI is down");

resetDbForTests();
delete process.env.PRESELL_OS_DB;
try {
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

const skip = analyticsSkipHeaders() as Record<string, string>;
assert(skip[ANALYTICS_SKIP_HEADER] === ANALYTICS_SKIP_VALUE, "analyticsSkipHeaders helper");

console.log("\nTodos os testes da Fase 7 (Visual QA) passaram.");
