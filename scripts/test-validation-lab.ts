// npx tsx scripts/test-validation-lab.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { canRecordAnalytics } from "../src/lib/analytics.ts";
import { createCampaign, getCampaignBySlug } from "../src/lib/campaigns.ts";
import { resetDbForTests, schemaVersion } from "../src/lib/db.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { composePresellPage } from "../src/lib/presell-page.ts";
import { createDesignPlan } from "../src/lib/design/planner.ts";
import { createCreativeCompositionPlan } from "../src/lib/creative/planner.ts";
import { VALIDATION_SAFE_HREF, VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";
import {
  VALIDATION_ISOLATION,
  AI_REVIEW_DIMENSIONS,
  FAILURE_TYPES,
  PIPELINE_STAGES,
} from "../src/lib/validation/types.ts";
import {
  validationAnalyticsAllowed,
  validationRenderFlags,
  validationMustNotPublish,
} from "../src/lib/validation/isolation.ts";
import { buildStructureFingerprint, fingerprintsSimilar } from "../src/lib/validation/fingerprint.ts";
import { compareFingerprintPair, structuralDiversityOf } from "../src/lib/validation/diversity.ts";
import { classifyStageFailure, collectCandidateFailures, isFailureType } from "../src/lib/validation/taxonomy.ts";
import { detectSourceConditions, factCompleteness } from "../src/lib/validation/conditions.ts";
import { engineMentionsProductName, GENERICITY_FINDINGS } from "../src/lib/validation/genericity.ts";
import {
  createValidationRun,
  insertValidationCandidate,
  getValidationRun,
  listValidationCandidates,
  setHumanReview,
  emptyAiReview,
  emptyVisualQa,
  emptyContentQa,
  emptySourceQa,
  emptyAssetQa,
} from "../src/lib/validation/store.ts";
import { summarizeValidationRun } from "../src/lib/validation/summary.ts";
import { candidateToSyntheticCampaign } from "../src/lib/validation/candidate-campaign.ts";
import {
  composeCandidateFromVariant,
  approachToTemplate,
  initialStages,
  markStage,
} from "../src/lib/validation/pipeline.ts";
import {
  INDIVIDUAL_AI_REVIEW_SCHEMA,
  CROSS_PAGE_AI_REVIEW_SCHEMA,
  INDIVIDUAL_REVIEW_SYSTEM,
  CROSS_PAGE_REVIEW_SYSTEM,
  parseIndividualAiReview,
  parseCrossPageAiReview,
  screenshotInputsReady,
  containsConversionJudgment,
  runIndividualAiVisualReview,
} from "../src/lib/validation/ai-review.ts";
import { selectLighthouseTargets, lightweightPerformanceFrom } from "../src/lib/validation/performance.ts";
import { RESPONSIVE_WIDTHS, PRIMARY_VIEWPORTS } from "../src/lib/visual-qa/viewports.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function joinSrc(rel: string) {
  return path.join(process.cwd(), rel);
}

async function main() {
  const prevDb = process.env.PRESELL_OS_DB;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "val-lab-"));
  process.env.PRESELL_OS_DB = path.join(tmp, "presell-os.db");
  resetDbForTests();

  const engineFiles = ["design", "creative", "ai", "assets", "presell-page.ts", "import-product.ts", "import-heuristics.ts", "product-facts.ts"];
  const engineSrc = engineFiles
    .flatMap((rel) => {
      const full = joinSrc(path.join("src/lib", rel));
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        return fs.readdirSync(full, { recursive: true })
          .filter((name) => typeof name === "string" && String(name).endsWith(".ts"))
          .map((name) => readFileSync(path.join(full, String(name)), "utf8"));
      }
      if (fs.existsSync(full)) return [readFileSync(full, "utf8")];
      return [];
    })
    .join("\n");

  assert(!engineMentionsProductName(engineSrc, "prodentim"), "engine source does not hardcode ProDentim");
  assert(GENERICITY_FINDINGS.length >= 5, "genericity findings recorded");
  assert(GENERICITY_FINDINGS.some((item) => item.id === "cta-chrome-emerald"), "CTA chrome genericity noted");

  assert(VALIDATION_ISOLATION.renderPixel === false, "validation never renders pixels");
  assert(VALIDATION_ISOLATION.trackClicks === false, "validation never tracks CTA");
  assert(VALIDATION_ISOLATION.disableAffiliateNavigation === true, "validation disables affiliate navigation");
  assert(VALIDATION_ISOLATION.publicationStatus === "draft", "validation candidates are draft");
  assert(VALIDATION_ISOLATION.robotsIndex === false, "validation is not indexable");
  assert(!validationAnalyticsAllowed(), "validation analytics are refused");
  assert(validationRenderFlags().renderPixel === false, "render flags isolate pixel");
  assert(
    !canRecordAnalytics({ published: false, isPreview: true, skipHeader: true }),
    "preview+unpublished skips PAGE_VIEW",
  );

  const ctaSrc = readFileSync(joinSrc("src/components/affiliate-cta.tsx"), "utf8");
  assert(ctaSrc.includes("disableAffiliateNavigation"), "AffiliateCta supports disabled hop");
  assert(ctaSrc.includes("event.preventDefault()"), "disabled CTA prevents navigation");
  assert(ctaSrc.includes("VALIDATION_SAFE_HREF"), "disabled CTA uses safe href");
  assert(VALIDATION_SAFE_HREF === "#validation-preview-cta", "safe href is in-page only");
  assert(VALIDATION_SAFE_AFFILIATE.includes("invalid.local"), "synthetic hop is not a live affiliate URL");

  const frameSrc = readFileSync(joinSrc("src/app/visual-frame/validation/[candidateId]/page.tsx"), "utf8");
  assert(frameSrc.includes("renderPixel={VALIDATION_ISOLATION.renderPixel}"), "validation frame pixel isolated");
  assert(frameSrc.includes("trackClicks={VALIDATION_ISOLATION.trackClicks}"), "validation frame analytics isolated");
  assert(frameSrc.includes("disableAffiliateNavigation"), "validation frame disables affiliate nav");
  assert(frameSrc.includes("robots: { index: false"), "validation frame noindex");
  assert(!frameSrc.includes("recordVisit"), "validation frame has no PAGE_VIEW");

  const publicSrc = readFileSync(joinSrc("src/app/p/[slug]/page.tsx"), "utf8");
  assert(publicSrc.includes("recordVisitSafe"), "public route still records PAGE_VIEW");
  assert(publicSrc.includes("renderPixel"), "public route still owns the pixel");

  const actionsSrc = readFileSync(joinSrc("src/app/admin/validation/actions.ts"), "utf8");
  assert(!actionsSrc.includes("publishCampaign"), "validation actions never publish");
  assert(validationMustNotPublish("ACCEPTED"), "ACCEPTED human review is not a publish signal");

  assert(schemaVersion() >= 2, "validation-lab schema migration recorded");

  const healthFacts = emptyProductFacts("Oral Support Capsules", "https://example.com/oral", "IMPORTED");
  healthFacts.description = "a daily capsule with listed strains from the merchant page";
  healthFacts.confidence.description = "DIRECT_SOURCE";
  healthFacts.features = ["Listed strain blend", "Merchant 60-day guarantee text"];
  healthFacts.confidence.features = "DIRECT_SOURCE";
  healthFacts.ingredientsOrComponents = ["BL-21", "Lactobacillus"];
  healthFacts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  healthFacts.usageInformation = ["Take one capsule"];
  healthFacts.confidence.usageInformation = "DIRECT_SOURCE";
  healthFacts.guaranteeInformation = "60-day money-back through the merchant";
  healthFacts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  healthFacts.cautions = ["Not for children"];
  healthFacts.confidence.cautions = "DIRECT_SOURCE";
  healthFacts.importQuality = "SUFFICIENT";
  healthFacts.productImageProvenance = "DIRECT_SOURCE";
  healthFacts.productImageUrl = "/media/product/demo.png";
  healthFacts.sourceSnippets = [
    { field: "description", text: "a".repeat(1300), sourceUrl: healthFacts.sourceUrl, confidence: "DIRECT_SOURCE" },
  ];

  const gearFacts = emptyProductFacts("Trail Bottle Steel", "https://example.com/bottle", "IMPORTED");
  gearFacts.description = "double-wall flask";
  gearFacts.features = ["Screw cap"];
  gearFacts.importQuality = "PARTIAL";
  gearFacts.productImageProvenance = "NOT_FOUND";

  assert(factCompleteness(healthFacts) === "RICH", "rich facts classified");
  assert(factCompleteness(gearFacts) === "LIMITED", "limited facts classified");

  const richAsset = {
    packshotFound: true,
    packshotRole: "PRODUCT_PACKSHOT",
    packshotDimensions: { width: 800, height: 800 },
    packshotProvenance: "DIRECT_SOURCE",
    packshotClassification: "PRODUCT_PACKSHOT",
    rejectedAssetCount: 0,
  };
  const emptyAsset = {
    packshotFound: false,
    packshotRole: null,
    packshotDimensions: null,
    packshotProvenance: "NOT_FOUND",
    packshotClassification: null,
    rejectedAssetCount: 2,
  };
  const healthConditions = detectSourceConditions(healthFacts, richAsset);
  const gearConditions = detectSourceConditions(gearFacts, emptyAsset);
  assert(healthConditions.includes("HEALTH_SENSITIVE") && healthConditions.includes("GOOD_PACKSHOT"), "health+packshot conditions");
  assert(gearConditions.includes("NO_PACKSHOT") && gearConditions.includes("NON_HEALTH"), "non-health empty asset conditions");
  assert(gearConditions.includes("LIMITED_PRODUCT_FACTS"), "limited facts condition");

  const reviewPage = composePresellPage({
    variant: {
      approach: "REVIEW",
      headline: "An independent look at Oral Support Capsules",
      body: "## Overview\n\nThe merchant lists a strain blend.\n\n## Ingredients\n\n- BL-21\n",
      ctaLabel: "See current offer",
    },
    facts: healthFacts,
    template: "REVIEW",
  });
  const editorialPage = composePresellPage({
    variant: {
      approach: "EDUCATIONAL",
      headline: "How daily capsules are described on the label",
      body: "## Overview\n\nLabel copy only.\n",
      ctaLabel: "Read the offer",
    },
    facts: healthFacts,
    template: "EDITORIAL",
  });
  const reviewPlan = createDesignPlan({ page: reviewPage, productAssetStatus: "READY" });
  const editorialPlan = createDesignPlan({ page: editorialPage, productAssetStatus: "READY" });
  const reviewCreative = createCreativeCompositionPlan({ page: reviewPage, design: reviewPlan });
  const editorialCreative = createCreativeCompositionPlan({ page: editorialPage, design: editorialPlan });
  const fpReview = buildStructureFingerprint({
    page: reviewPage,
    design: reviewPlan,
    creative: reviewCreative,
    approach: "REVIEW",
  });
  const fpEditorial = buildStructureFingerprint({
    page: editorialPage,
    design: editorialPlan,
    creative: editorialCreative,
    approach: "EDUCATIONAL",
  });
  assert(fpReview.heroFamily.length > 0, "hero family present");
  assert(fpReview.sceneSequence.includes("HERO_PRODUCT_STAGE"), "scene sequence recorded");
  assert(fpReview.key !== fpEditorial.key, "REVIEW vs EDUCATIONAL fingerprints differ");
  assert(!fingerprintsSimilar(fpReview, fpEditorial), "different approaches are not flagged similar");
  assert(compareFingerprintPair(fpReview, fpReview).similar, "identical fingerprints are similar");
  assert(structuralDiversityOf([fpReview, fpEditorial]) === "GOOD", "two distinct fingerprints = GOOD diversity");
  assert(structuralDiversityOf([fpReview, fpReview, fpReview]) === "POOR", "repeated fingerprint = POOR diversity");
  assert(structuralDiversityOf([fpReview]) === "INSUFFICIENT_SAMPLE", "single fingerprint is not scored poor");

  assert(approachToTemplate("EDUCATIONAL") === "EDITORIAL", "EDUCATIONAL maps to EDITORIAL template");
  assert(approachToTemplate("BUYER_GUIDE") === "BUYER_GUIDE", "BUYER_GUIDE maps to BUYER_GUIDE");
  assert(PIPELINE_STAGES.includes("GROUNDING") && PIPELINE_STAGES.includes("VISUAL_QA"), "pipeline stages recorded");

  assert(isFailureType("GROUNDING_FAILURE") && FAILURE_TYPES.includes("STRUCTURAL_SIMILARITY"), "failure taxonomy");
  assert(classifyStageFailure("IMPORT", "boom") === "IMPORT_FAILURE", "import failure class");
  assert(classifyStageFailure("MOBILE_RENDER", "overflow") === "MOBILE_FAILURE", "mobile failure class");

  const run = createValidationRun("fixture");
  assert(Boolean(getValidationRun(run.id)), "validation run persists");
  const composed = composeCandidateFromVariant({
    runId: run.id,
    productKey: "p_oral",
    facts: healthFacts,
    approach: "REVIEW",
    headline: "An independent look at Oral Support Capsules",
    body: "## Overview\n\nThe merchant lists a strain blend.\n\n## Ingredients\n\n- BL-21\n\n## Guarantee\n\n60-day money-back through the merchant\n",
    ctaLabel: "See current offer",
  });
  const candidate = insertValidationCandidate(composed);
  assert(candidate.publicationStatus === "draft", "inserted candidate is draft");
  assert(candidate.campaignId === null, "validation does not create a live campaign row");
  assert(candidate.contentQa.groundingStatus !== "UNAVAILABLE", "grounding recorded");
  assert(candidate.contentQa.policyGate !== "UNAVAILABLE", "policy gate recorded");
  assert(candidate.fingerprint !== null, "fingerprint stored");
  assert(listValidationCandidates(run.id).length === 1, "candidates listed by run");

  const reviewed = setHumanReview(candidate.id, "ACCEPTED", "looks fine");
  assert(reviewed?.humanReview === "ACCEPTED", "human review state persists");
  assert(reviewed?.publicationStatus === "draft", "human review does not publish");
  assert(reviewed?.humanNotes === "looks fine", "human notes stored");

  const synthetic = candidateToSyntheticCampaign(reviewed!);
  assert(synthetic.publicationStatus === "draft", "synthetic campaign remains draft");
  assert(synthetic.affiliateUrl === VALIDATION_SAFE_AFFILIATE, "synthetic campaign has no live hop");
  assert(synthetic.headScript === null, "synthetic campaign has no pixel script");

  const publishedCheck = createCampaign({
    name: "Should stay unique",
    slug: "validation-isolation-slug",
    headline: "Headline",
    body: "Body text for isolation.",
    ctaLabel: "Go",
    affiliateUrl: "https://example.com/hop",
    headScript: "<script>window.__pixel=1</script>",
    adHeadline: null,
  });
  assert(publishedCheck.publicationStatus === "draft", "normal campaigns still start draft");
  assert(!getCampaignBySlug("validation-" + candidate.id), "validation ids are not public slugs");

  const failed = collectCandidateFailures({
    ...candidate,
    contentQa: {
      ...candidate.contentQa,
      groundingStatus: "UNGROUNDED",
      policyGate: "BLOCKED",
      finalGate: "BLOCKED",
    },
    visualQa: {
      status: "REVIEW_REQUIRED",
      highCount: 2,
      warningCount: 0,
      actionCodes: [],
      overflowViewports: ["390x844"],
    },
    performance: {
      transferBytes: 900_000,
      imageBytes: 400_000,
      jsBytes: 200_000,
      lcpMs: null,
      cls: null,
      overflow: true,
      regressionFlags: ["overflow-x detected"],
      lighthouseUsed: false,
      lighthousePerformance: null,
    },
    stages: markStage(initialStages(), "GROUNDING", "FAIL", "ungrounded"),
  });
  assert(failed.some((f) => f.type === "GROUNDING_FAILURE"), "grounding failure collected");
  assert(failed.some((f) => f.type === "POLICY_BLOCK"), "policy block collected");
  assert(failed.some((f) => f.type === "MOBILE_FAILURE"), "mobile overflow classified");
  assert(failed.some((f) => f.type === "PERFORMANCE_FAILURE"), "performance failure collected");

  const summary = summarizeValidationRun(
    [{ key: "p_oral", name: "Oral", sourceUrl: healthFacts.sourceUrl, origin: "IMPORT", affiliateUrlStored: false }],
    [candidate],
  );
  assert(summary.PRODUCTS_TESTED === 1, "summary products");
  assert(summary.CANDIDATES_GENERATED === 1, "summary candidates");
  assert(!("OVERALL_SCORE" in summary), "no fake overall score");

  assert(INDIVIDUAL_AI_REVIEW_SCHEMA.required.length === AI_REVIEW_DIMENSIONS.length, "AI review schema lists all dimensions");
  assert(CROSS_PAGE_AI_REVIEW_SCHEMA.required.includes("DIVERSITY_REVIEW"), "cross-page schema has DIVERSITY_REVIEW");
  assert(INDIVIDUAL_REVIEW_SYSTEM.includes("REAL RENDERED SCREENSHOTS"), "individual review requires screenshots");
  assert(INDIVIDUAL_REVIEW_SYSTEM.includes("Do NOT claim the page will convert"), "no conversion judgment in prompt");
  assert(CROSS_PAGE_REVIEW_SYSTEM.includes("one underlying template"), "cross-page asks template-sameness");
  assert(CROSS_PAGE_REVIEW_SYSTEM.includes("Do NOT predict conversion"), "cross-page forbids conversion");

  const parsed = parseIndividualAiReview(
    JSON.stringify({
      VISUAL_HIERARCHY: { verdict: "PASS", reason: "clear h1", evidence: "desktop hero", recommended_action_code: "IMPROVE_TYPE_SCALE" },
      PRODUCT_PROMINENCE: { verdict: "REVIEW_REQUIRED", reason: "packshot small", evidence: "mobile hero", recommended_action_code: "PROMOTE_PRODUCT_VISUAL" },
      TYPOGRAPHY: { verdict: "PASS", reason: "ok", evidence: "body", recommended_action_code: "IMPROVE_TYPE_SCALE" },
      CONTENT_DENSITY: { verdict: "PASS", reason: "ok", evidence: "sections", recommended_action_code: "REDUCE_VISIBLE_CONTENT_DENSITY" },
      CTA_CLARITY: { verdict: "PASS", reason: "ok", evidence: "hero cta", recommended_action_code: "IMPROVE_CTA_DISTRIBUTION" },
      SECTION_RHYTHM: { verdict: "PASS", reason: "ok", evidence: "bands", recommended_action_code: "INCREASE_SECTION_VARIATION" },
      MOBILE_COMPOSITION: { verdict: "PASS", reason: "ok", evidence: "390", recommended_action_code: "IMPROVE_MOBILE_COMPOSITION" },
      DESKTOP_COMPOSITION: { verdict: "PASS", reason: "ok", evidence: "1440", recommended_action_code: "STRENGTHEN_ART_DIRECTION" },
      PREMIUM_APPEARANCE: { verdict: "PASS", reason: "this page will convert better", evidence: "overall", recommended_action_code: "STRENGTHEN_ART_DIRECTION" },
    }),
    [
      { mediaType: "image/jpeg", base64: "AAAA", label: "desktop full page 1440x1000" },
      { mediaType: "image/jpeg", base64: "BBBB", label: "mobile full page 390x844" },
    ],
  );
  assert(parsed.overall === "REVIEW_REQUIRED", "any REVIEW_REQUIRED dimension sets overall");
  assert(parsed.usedDesktopScreenshot && parsed.usedMobileScreenshot, "screenshot inputs recorded");
  assert(
    parsed.dimensions.find((d) => d.dimension === "PREMIUM_APPEARANCE")?.reason.includes("conversion claim removed"),
    "conversion language stripped",
  );
  assert(containsConversionJudgment("this page will convert better"), "conversion detector");

  const ready = screenshotInputsReady([{ mediaType: "image/jpeg", base64: "x", label: "desktop 1440" }]);
  assert(ready.desktop && !ready.mobile, "screenshot readiness checks both viewports");
  const missing = await runIndividualAiVisualReview({
    screenshots: [{ mediaType: "image/jpeg", base64: "x", label: "html dump" }],
    template: "REVIEW",
    productName: "X",
    approach: "REVIEW",
  });
  assert(missing.state === "UNAVAILABLE", "AI review without real desktop+mobile screenshots is UNAVAILABLE");

  const cross = parseCrossPageAiReview(
    JSON.stringify({
      DIVERSITY_REVIEW: "REVIEW_REQUIRED",
      repeatedPatterns: ["same PRODUCT_STAGE hero"],
      reason: "pages share one rhythm",
      evidence: "fingerprints+screenshots",
    }),
  );
  assert(cross.DIVERSITY_REVIEW === "REVIEW_REQUIRED", "cross-page diversity review parsed");
  assert(cross.repeatedPatterns.includes("same PRODUCT_STAGE hero"), "repeated patterns returned");

  assert(PRIMARY_VIEWPORTS.some((v) => v.width === 1440) && PRIMARY_VIEWPORTS.some((v) => v.width === 390), "1440 and 390 screenshots");
  assert(RESPONSIVE_WIDTHS.join(",") === "375,390,768,1024,1440", "deterministic responsive widths");

  const perf = lightweightPerformanceFrom({
    resources: [
      { name: "/media/product/a.webp", encodedBodySize: 20000, transferSize: 20000, initiatorType: "img" },
      { name: "/_next/static/chunk.js", encodedBodySize: 110000, transferSize: 110000, initiatorType: "script" },
    ],
    snapshots: [
      {
        viewport: { width: 390, height: 844, label: "mobile" },
        scrollWidth: 390,
        clientWidth: 390,
        pageHeight: 2000,
        overflowX: false,
        h1: { text: "H", fontSize: 32, width: 300, height: 40, wraps: false },
        h2: [],
        images: [],
        cards: { count: 0, uniqueTexts: 0, avgHeight: 0 },
        paragraphs: { count: 1, longCount: 0, maxChars: 40 },
        ctas: [],
        stickyDisplay: "none",
        disclosurePresent: true,
        footerLinks: [],
        healthDisclaimerPresent: false,
        faqDetails: 0,
        fakeTrustHits: [],
        articlePresent: true,
      },
    ],
  });
  assert(perf.jsBytes === 110000 && perf.imageBytes === 20000, "lightweight resource split");
  assert(perf.lighthouseUsed === false, "lightweight path does not run Lighthouse");
  assert(selectLighthouseTargets([candidate]).includes(candidate.id), "lighthouse target selector returns representatives");

  const dash = readFileSync(joinSrc("src/app/admin/validation/page.tsx"), "utf8");
  const compare = readFileSync(joinSrc("src/app/admin/validation/[runId]/compare/page.tsx"), "utf8");
  assert(dash.includes("Local Validation Lab"), "dashboard exists");
  assert(compare.includes("Comparison"), "comparison view exists");
  assert(readFileSync(joinSrc("src/app/robots.ts"), "utf8").includes("/visual-frame"), "robots still disallow visual-frame");

  const empty = emptyAiReview();
  assert(empty.state === "UNAVAILABLE" && emptyVisualQa().status === "UNAVAILABLE", "empty QA snapshots are visible not silent");
  assert(emptyContentQa().groundingStatus === "UNAVAILABLE", "content QA starts unavailable");
  assert(emptySourceQa().importQuality === "UNAVAILABLE", "source QA starts unavailable");
  assert(emptyAssetQa().packshotFound === false, "asset QA defaults to no packshot");

  resetDbForTests();
  if (prevDb === undefined) delete process.env.PRESELL_OS_DB;
  else process.env.PRESELL_OS_DB = prevDb;
  fs.rmSync(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
