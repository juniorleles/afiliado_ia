import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import {
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  PRESELL_STANDARD_SECTION_IDS,
  PRESELL_REQUIRED_SECTIONS,
  EXECUTION_54BC_PAID_AI_BUDGET_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  QUALITY_PROMPT_VERSION,
  VISUAL_SCORE_TARGET,
  QUALITY_SCORE_TARGET,
  FORBIDDEN_REFERENCE_CHROME,
  mapPresellStandardV1,
  validatePresellTemplateDocument,
  runTemplateQualityPreflight,
  producerEvidenceLibraryFromRun,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  readBestCandidate,
  methodologyThresholdsFrozen,
} from "../src/lib/presell-quality/index.ts";
import { PRESELL_SECTION_REGISTRY } from "../src/lib/presell-template/section-registry.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const lab = disableCommercialCta(buildV4Model("s1")!);
const markup = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: PRESELL_STANDARD_ID }));
const bestKnownMarkup = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const document = mapPresellStandardV1(lab);
const validation = validatePresellTemplateDocument(document);
const preflight = runTemplateQualityPreflight({ model: lab, markup, contractValid: true });

assert(PRESELL_STANDARD_ID === "PRESELL_STANDARD_V1" && PRESELL_STANDARD_VERSION === "1", "1. template V1 is registered");
assert(
  PRESELL_STANDARD_SECTION_IDS.join(">") ===
    "ANNOUNCEMENT_BAR>PREMIUM_HERO>TRUST_INFORMATION>PRODUCT_OVERVIEW>HOW_IT_WORKS>INGREDIENTS_OR_MODULES>GUARANTEE>COMMERCIAL_CTA>SHIPPING_OR_ACCESS>VERIFIED_TESTIMONIALS>PREMIUM_FAQ>LEGAL_FOOTER",
  "2. official section order is frozen",
);
assert(PRESELL_SECTION_REGISTRY.every((item, index) => item.order === index && item.mayInventContent === false), "2b. registry does not invent content");
assert(document.productName === lab.contract.identity.productName, "3. mapper uses Product Contract identity");

const library = producerEvidenceLibraryFromRun({ campaignId: 237, run: snapshotProductResearch(237).latest });
assert(library.storage === "EXISTING_INVENTORY_AND_LEDGER" && library.newTablesCreated === false, "4. producer evidence reuses existing stores");
assert(library.records.every((row) => row.publication_eligibility !== "YES" || row.review_status === "APPROVED_FOR_USE"), "4b. collected evidence is not auto-published");
assert(
  !markup.includes("Clinically proven to boost energy") && !markup.includes("Recommended by doctors worldwide"),
  "5. blocked medical traps are not rendered",
);
assert(document.sections.find((item) => item.id === "GUARANTEE")?.present === Boolean(document.sections.find((item) => item.id === "GUARANTEE")?.claims.length), "6. guarantee renders only with approved terms");

const thin = disableCommercialCta(buildV4Model("s4")!);
const thinDoc = mapPresellStandardV1(thin);
assert(!thinDoc.sections.find((item) => item.id === "GUARANTEE")?.present, "6b. missing guarantee is omitted");
assert(!thinDoc.sections.find((item) => item.id === "SHIPPING_OR_ACCESS")?.present, "7. incomplete shipping is omitted");

const digital = disableCommercialCta({
  ...lab,
  contract: { ...lab.contract, identity: { ...lab.contract.identity, productKind: "online course" } },
});
assert(mapPresellStandardV1(digital).productFormat === "DIGITAL", "8. digital products are classified without product-specific names");

assert(document.testimonials.status === "SECTION_OMITTED" && !markup.includes("verified buyer"), "9. testimonials stay omitted without authorization");
assert(document.sections.find((item) => item.id === "PREMIUM_FAQ")?.present === (lab.copy.faq.length > 0 || document.sections.find((item) => item.id === "PREMIUM_FAQ")!.claims.length > 0), "10. FAQ uses approved Q&A only");
assert(document.disclosure && document.legalLinks.every((item) => item.href.startsWith("/") || item.href.startsWith("https://")), "11. legal footer uses real links");
assert(!lab.commercialImage || lab.commercialImage.src.startsWith("/"), "12. approved images stay local or omitted");
assert(document.cta.enabled === false && lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(markup), "13. commercial CTA stays disabled");
assert(/max-width: 767px/.test(readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8")), "14. mobile breakpoint remains");
assert(preflight.status === "PREFLIGHT_PASSED" && preflight.visualScoreAssigned === false && preflight.paidEvaluationAuthorized === false, "15. preflight passes without assigning a visual score");
assert(validation.ok, "15b. template document validates");

const blockedGate = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 72,
  desktopVisualScore: 72,
  mobileVisualScore: 68,
  editorialScore: 73,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blockedGate.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blockedGate) && requestPresellHumanReview(blockedGate).ok === false, "16. quality gate stays blocked below 90/90/85");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen(), "17. V2 rubric and prompt version 4 are unchanged");
assert(
  existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) &&
    existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54ba-best-known-baseline.json")) &&
    DESIGN_CHECKPOINT_FILES.length === 4,
  "18. 54AZ/54BA checkpoints remain",
);

assert(
  /data-presell-candidate="54AZ"/.test(bestKnownMarkup) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(bestKnownMarkup),
  "2c. default renderer is the 54AZ best-known candidate",
);

const scenarios = labScenarioKeys().map((key) => {
  const model = disableCommercialCta(buildV4Model(key)!);
  const html = renderToStaticMarkup(createElement(V4Page, { model, candidate: PRESELL_STANDARD_ID }));
  const mapped = mapPresellStandardV1(model);
  return (
    mapped.cta.enabled === false &&
    mapped.testimonials.status === "SECTION_OMITTED" &&
    !FORBIDDEN_REFERENCE_CHROME.test(html) &&
    !model.hopHref &&
    !/sugar defender|cbc045ab/i.test(html) &&
    mapped.sections.filter((item) => PRESELL_REQUIRED_SECTIONS.includes(item.id)).every((item) => item.present || item.id !== "PREMIUM_HERO")
  );
});
assert(scenarios.every(Boolean), "19. multiproduct regression stays generic and omits empty optional sections");

const best = readBestCandidate(237);
assert(
  !best || (best.desktopVisualScore === 72 && best.mobileVisualScore === 68 && best.editorialScore === 73 && best.humanReviewUnlocked === false),
  "20. best known 54AZ scores are preserved",
);
assert(EXECUTION_54BC_PAID_AI_BUDGET_USD === 0, "21. this execution authorizes no paid AI");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "21b. thresholds are unchanged");
assert(/data-presell-standard="PRESELL_STANDARD_V1"/.test(markup), "22. renderer is tagged with the standard");
assert(!markup.includes("lorem ipsum"), "23. no placeholders");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.publicationReadiness === "BLOCKED" && integrity.commercialAuthorization === "BLOCKED", "24. Product Contract stays immutable and blocked");

const noImage = disableCommercialCta(buildV4Model("s2")!);
const noImageDoc = mapPresellStandardV1(noImage);
assert(!noImage.commercialImage, "25. missing secondary/hero image does not invent a packshot");
assert(noImageDoc.sections.find((item) => item.id === "VERIFIED_TESTIMONIALS")?.present === false, "25b. no ratings or testimonials are invented");

console.log(`PASS ${passed}`);
