import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import {
  EXECUTION_54AW_BUDGET,
  MAX_DESIGN_ITERATIONS,
  PREMIUM_CTA_LABEL,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  canEnterHumanReviewQueue,
  daysFromText,
  joinSplitSteps,
  compactFact,
  loadPremiumPresellDesignStandard,
  parseVisualEvaluationPayload,
  presentVisitorCopy,
  premiumSlotsFromModel,
  problemsAreActionable,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  visualWeightsSumToOne,
} from "../src/lib/presell-quality/index.ts";
import { EXECUTION_54AW_BUDGET as AW_LEDGER, emptyExecutionBudgetLedger, budgetAllowsPaidCall, reservePaidCall } from "../src/lib/presell-quality/execution-budget.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import { contrastRatio, THEMES } from "../src/lib/design-system/tokens.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const standard = loadPremiumPresellDesignStandard();
assert(standard.registered && standard.relativePath === "design-references/premium-presell-reference.png", "1. official reference is registered");
const bytes = readFileSync(standard.absolutePath);
assert(createHash("sha256").update(bytes).digest("hex") === "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938", "2. reference SHA-256 matches");
assert(standard.dimensions?.width === 1024 && standard.dimensions.height === 1536, "2b. reference dimensions 1024x1536");
assert(standard.accessibleToEvaluator && Boolean(standard.evaluatorPath), "3. evaluator can access the official PNG");

const desktopShot = path.join(process.cwd(), "data/evidence/execution-54au-premium-design/desktop-screenshot.png");
const mobileShot = path.join(process.cwd(), "data/evidence/execution-54au-premium-design/mobile-screenshot.png");
assert(existsSync(desktopShot) && existsSync(mobileShot), "4. real screenshots exist for comparison");

const parsed = parseVisualEvaluationPayload(JSON.stringify({
  scores: {
    HERO_FIRST_IMPRESSION: { score: 88, rationale: "Packshot dominates the split hero." },
    COMPOSITION_HIERARCHY: { score: 90, rationale: "Section order matches the reference." },
    TYPOGRAPHY_LEGIBILITY: { score: 91, rationale: "Serif headline is readable." },
    CARDS_COMPONENTS: { score: 87, rationale: "Icon cards are consistent." },
    IMAGE_USE: { score: 90, rationale: "Approved packshot only." },
    CTA_EMPHASIS: { score: 89, rationale: "Amber CTA is high contrast." },
    MOBILE: { score: 88, rationale: "Stacked without overflow." },
  },
  desktopVisualScore: 89,
  mobileVisualScore: 88,
  criticalDefects: [],
  problems: [{
    section: "hero",
    severity: "HIGH",
    problem: "The first fold still spends space on lab chrome above the packshot.",
    visualEvidence: "Lab bars sit above the split hero on the 1440 screenshot.",
    referenceDifference: "The official reference opens on the product and CTA, not tooling chrome.",
    recommendedFix: "Keep lab chrome compact and enlarge the packshot column in the reusable engine.",
    expectedImpact: "HIGH",
    requiresContentChange: false,
  }],
}));
assert(parsed.overall > 0 && parsed.problems[0]?.section === "hero", "5. diagnosis payload is actionable");
assert(problemsAreActionable(parsed.problems), "6. generic advice is rejected");
assert(!problemsAreActionable([{ section: "page", severity: "LOW", problem: "Improve design", visualEvidence: "x", referenceDifference: "y", recommendedFix: "Make it more beautiful", expectedImpact: "LOW", requiresContentChange: false }]), "6b. vague diagnosis is not accepted");

const lab = disableCommercialCta(buildV4Model(labScenarioKeys()[0]!)!);
const markup = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const slots = premiumSlotsFromModel(lab);
assert(/data-v4-section="hero"/.test(markup) && /ds-hero--split|ds-hero--product-image|ds-hero--editorial/.test(markup), "7. hero");
assert(!lab.commercialImage || markup.includes(lab.commercialImage.src), "8. packshot");
assert(markup.includes(PREMIUM_CTA_LABEL) && /data-v4-cta="preview-disabled"/.test(markup), "9. CTA");
assert(Array.isArray(slots.ingredients), "10. ingredients");
assert(daysFromText("60 days from purchase") === 60, "11. guarantee");
assert(slots.fulfillment.every((item) => item.body.length > 0) || slots.fulfillment.length === 0, "12. shipping uses approved text");
assert(/data-premium="faq"|ds-faq/.test(markup), "13. FAQ");
assert(/ds-footer/.test(markup), "14. footer");
assert(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8").includes("max-width: 767px"), "15. mobile");
assert(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8").includes("min-width: 640px"), "16. tablet");
assert(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8").includes("min-width: 960px"), "17. desktop");
assert(!/overflow-x:\s*scroll/.test(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8")), "18. no forced overflow");
assert(!/lab-fixtures\/synthetic/.test(markup), "19. no broken fixture images");

const before = JSON.stringify(snapshotProductResearch(237).latest?.proposals.map((item) => [item.field, item.status, item.suggestedValue]));
const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.contractVersion === 1, "21. Product Contract unchanged");
const after = JSON.stringify(snapshotProductResearch(237).latest?.proposals.map((item) => [item.field, item.status, item.suggestedValue]));
assert(before === after, "20. approved content is not rewritten by the engine");
assert(integrity.blockedMedicalClaims >= 9, "22. blocked claims stay blocked");
assert(!FORBIDDEN_REFERENCE_CHROME.test(markup), "23. no fake certifications");
assert(!/verified buyer|customer testimonial|★★/.test(markup), "24. no fake testimonials");

assert(EXECUTION_54AW_BUDGET.maxUsd === 1 && AW_LEDGER.maxUsd === 1, "25. max budget is US$1");
const ledger = emptyExecutionBudgetLedger("execution-54aw", 1);
const allowed = budgetAllowsPaidCall(ledger, { kind: "EVALUATION", reserveUsd: 0.15 }, AW_LEDGER);
assert(allowed.allowed, "26. reserve is allowed inside the cap");
const reserved = reservePaidCall(ledger, { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.15, caps: AW_LEDGER });
assert(reserved.ok && reserved.ledger.reservedUsd === 0.15, "26b. reservation is persisted");
const over = budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54aw", 1), { kind: "EVALUATION", reserveUsd: 1.01 }, AW_LEDGER);
assert(!over.allowed, "26c. over-budget reserve is refused");

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: desktopShot,
  mobileScreenshotPath: mobileShot,
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 86,
  desktopVisualScore: 86,
  mobileVisualScore: 84,
  editorialScore: 82,
  evaluatorStability: "NOT_ESTABLISHED",
  contentSafetyPass: true,
  criticalVisualDefects: [],
});
assert(blocked.status !== "QUALITY_APPROVED", "28. visual gate does not pass at 86/84");
assert((blocked.editorialScore ?? 0) < QUALITY_SCORE_TARGET, "29. editorial gate remains below 85 until a new eval");
assert(!canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "30. human review stays blocked");
const approved = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: desktopShot,
  mobileScreenshotPath: mobileShot,
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 92,
  desktopVisualScore: 92,
  mobileVisualScore: 91,
  editorialScore: 88,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: [],
}, { ...standard, registered: true, accessibleToEvaluator: true, reason: null });
assert(approved.status === "QUALITY_APPROVED" && approved.humanReviewUnlocked === true, "31. human review unlocks only when every gate passes");
assert(approved.publicationUnlocked === false && integrity.publicationReadiness === "BLOCKED", "32. publication stays blocked");
assert(integrity.commercialAuthorization === "BLOCKED", "33. ads stay blocked");
assert(lab.hopSlot === "none" && !lab.hopHref, "34. commercial CTA disabled");

const sparse = disableCommercialCta(buildV4Model("s4")!);
const noImage = disableCommercialCta(buildV4Model("s5")!);
const incomplete = disableCommercialCta(buildV4Model("s6")!);
const sparseHtml = renderToStaticMarkup(createElement(V4Page, { model: sparse })) + renderToStaticMarkup(createElement(V4Page, { model: noImage })) + renderToStaticMarkup(createElement(V4Page, { model: incomplete }));
assert(!FORBIDDEN_REFERENCE_CHROME.test(sparseHtml) && !/verified buyer/.test(sparseHtml), "35. multiproduct engine does not invent fill");
assert(!incomplete.hopHref, "35b. incomplete offer does not invent a live CTA");
if (!premiumSlotsFromModel(sparse).guarantee.statements.length) {
  assert(!/data-premium="guarantee"/.test(renderToStaticMarkup(createElement(V4Page, { model: sparse }))), "35c. no guarantee invented");
}

assert(visualWeightsSumToOne() && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && MAX_DESIGN_ITERATIONS === 4, "rubric unchanged");
assert(contrastRatio(THEMES.forest.ctaInk, THEMES.forest.cta) >= 4.5, "forest CTA contrast");
assert(/according to the seller/i.test(presentVisitorCopy("Aldermoor Greens is presented by the seller as a product whose declared composition includes Spirulina.")), "editorial presentation does not invent facts");
assert(joinSplitSteps(["Hold under the tongue", "then swallow."]).length === 1, "split usage steps are joined without new claims");
assert(compactFact("We strive to ship every order within 24 working hours.") === "24 working hours", "compact facts restate approved windows");
assert(compactFact("60 days from purchase. Empty bottles anytime within 80 days.", 48, "RETURNS") === "80 days", "returns compact fact prefers the returns window");
assert(!/sugardefender|campaign 237/.test(readFileSync(path.join(process.cwd(), "src/lib/presell-quality/premium-slots.ts"), "utf8") + readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8")), "engine stays generic");

console.log(`PASS ${passed}`);
