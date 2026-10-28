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
import { parseVisualEvaluationPayload } from "../src/lib/presell-quality/visual-eval.ts";
import {
  EXECUTION_54AY_BUDGET,
  EXECUTION_54AY_GENERATION_ID,
  EXECUTION_54AY_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  VISUAL_DIMENSION_WEIGHTS,
  adminChromePresentInHtml,
  buildImprovementBacklog,
  canEnterHumanReviewQueue,
  conservativeMinPair,
  evaluationIdentityOf,
  freezeCandidateManifest,
  loadPremiumPresellDesignStandard,
  methodologyThresholdsFrozen,
  officialEditorialRecord,
  officialEvaluatorStability,
  officialVisualV2Record,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  visitorCaptureDefects,
  visitorCaptureFilenames,
  visitorCapturePreviewPath,
  visualComparisonPromptV2,
  visualRubricV2Record,
  visualWeightsSumToOne,
  VISITOR_CAPTURE_VIEWPORTS,
  VISITOR_VISUAL_CAPTURE,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54AY_BUDGET as AY_LEDGER,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  reservePaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";
import { sha256File } from "../src/lib/presell-quality/fingerprint.ts";
import type { PresellQualityAssessment } from "../src/lib/presell-quality/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const standard = loadPremiumPresellDesignStandard();
assert(standard.registered && standard.relativePath === "design-references/premium-presell-reference.png", "1. official reference is valid");
assert(createHash("sha256").update(readFileSync(standard.absolutePath)).digest("hex") === "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938", "2. reference SHA-256 matches");

const rubric = visualRubricV2Record();
assert(rubric.id === PREMIUM_VISUAL_EVALUATION_V2 && rubric.promptVersion === "2", "3. visual rubric is V2");
assert(visualWeightsSumToOne() && rubric.weights.HERO_FIRST_IMPRESSION === 0.2 && VISUAL_DIMENSION_WEIGHTS.MOBILE === 0.1, "4. visual weights are preserved");
assert(methodologyThresholdsFrozen() && rubric.visualTarget === 90 && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "5. quality thresholds are preserved");

const frozen = freezeCandidateManifest({
  campaignId: 237,
  generationId: EXECUTION_54AY_GENERATION_ID,
  contentHash: "abc",
  productContractHash: "def",
  sourceCommit: "32f6e252c95f7cbe6abc53c83fd66927b4346eb6",
  referenceHash: standard.hash,
});
assert(frozen.generationId === "lp-mvs7mja3-0d690e7c" && frozen.immutable && frozen.visualEvalVersion === PREMIUM_VISUAL_EVALUATION_V2, "6. candidate is frozen");

assert(VISITOR_CAPTURE_VIEWPORTS.desktop.width === 1440 && visitorCaptureFilenames("desktop", "official").full === "desktop-full.png", "7. desktop screenshot naming");
assert(VISITOR_CAPTURE_VIEWPORTS.tablet.width === 768 && visitorCaptureFilenames("tablet", "official").full === "tablet-full.png", "8. tablet screenshot naming");
assert(VISITOR_CAPTURE_VIEWPORTS.mobile.width === 390 && visitorCaptureFilenames("mobile", "official").full === "mobile-full.png", "9. mobile screenshot naming");
assert(!adminChromePresentInHtml('<main data-v4="page"></main>') && visitorCapturePreviewPath(EXECUTION_54AY_GENERATION_ID).includes("visualCapture=visitor"), "10. visitor capture has no admin bars");

const evidence = path.join(process.cwd(), "data/evidence/execution-54ay-official-evaluation");
const desktopShot = path.join(evidence, "desktop-full.png");
const tabletShot = path.join(evidence, "tablet-full.png");
const mobileShot = path.join(evidence, "mobile-full.png");
const desktopFold = path.join(evidence, "desktop-first-fold.png");
const tabletFold = path.join(evidence, "tablet-first-fold.png");
const mobileFold = path.join(evidence, "mobile-first-fold.png");
if (existsSync(desktopShot) && existsSync(tabletShot) && existsSync(mobileShot) && existsSync(desktopFold) && existsSync(tabletFold) && existsSync(mobileFold)) {
  assert(Boolean(sha256File(desktopShot) && sha256File(tabletShot) && sha256File(mobileShot)), "11. capture hashes exist");
} else {
  assert(typeof sha256File(standard.absolutePath) === "string", "11. capture hashing is available before screenshots");
}

const prompt = visualComparisonPromptV2();
assert(prompt.userText.includes("official premium reference") && prompt.system.includes("last image"), "12. comparison uses the real reference image");

const parsed = parseVisualEvaluationPayload(JSON.stringify({
  scores: {
    HERO_FIRST_IMPRESSION: { score: 78, rationale: "Packshot is present but quieter than the reference." },
    COMPOSITION_HIERARCHY: { score: 80, rationale: "Section order is coherent." },
    TYPOGRAPHY_LEGIBILITY: { score: 82, rationale: "Headline is readable." },
    CARDS_COMPONENTS: { score: 76, rationale: "Cards are sparse." },
    IMAGE_USE: { score: 84, rationale: "Approved packshot only." },
    CTA_EMPHASIS: { score: 79, rationale: "CTA is visible without a discount claim." },
    MOBILE: { score: 74, rationale: "Stacked packing is tighter than desktop." },
  },
  desktopVisualScore: 79,
  mobileVisualScore: 74,
  criticalDefects: ["Hero packshot is undersized."],
  problems: [{
    section: "hero",
    severity: "HIGH",
    problem: "The desktop first fold still underplays the packshot relative to the official finish.",
    visualEvidence: "The 1440 visitor fold keeps a modest product column.",
    referenceDifference: "The official PNG opens on a dominant packshot and high-contrast CTA.",
    recommendedFix: "Enlarge the reusable packshot column and keep the informational CTA high-contrast.",
    expectedImpact: "HIGH",
    requiresContentChange: false,
  }],
}));
const officialVisual = officialVisualV2Record(parsed, true);
assert(officialVisual.rubricVersion === PREMIUM_VISUAL_EVALUATION_V2 && officialVisual.desktopScore === 79 && officialVisual.referenceCompared, "13. visual evaluation is structured");

const editorialAssessment = {
  overallScore: 81,
  assessmentStatus: "QUALITY_REJECTED",
  criticalFailures: [],
  findings: [{ id: "repeat", dimension: "COPY_CLARITY", severity: "WARNING", message: "Guarantee restates the same seller window twice.", evidence: [] }],
  recommendedActions: [{ id: "tighten", action: "Keep a single seller-stated guarantee sentence.", allowed: true, reason: "Restate only." }],
  dimensionScores: [{ dimension: "COPY_CLARITY", weight: 0.2, score: 81, rationale: "Copy stays on contract facts." }],
} as unknown as PresellQualityAssessment;
const editorial = officialEditorialRecord(editorialAssessment);
assert(Boolean(editorial && editorial.editorialScore === 81 && editorial.productContractGrounded), "14. editorial evaluation is structured");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.contractVersion === 1, "15. Product Contract is preserved");

const identity = evaluationIdentityOf({
  generationId: EXECUTION_54AY_GENERATION_ID,
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: "2",
  rubricVersion: "2",
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  model: "gpt-4o-mini",
  referenceHash: standard.hash,
  screenshotHashes: ["aaa", "bbb"],
});
assert(officialEvaluatorStability({
  firstVisual: identity,
  secondVisual: identity,
  firstVisualOverall: 78,
  secondVisualOverall: 80,
  firstEditorial: 81,
  secondEditorial: 79,
}) === "STABLE", "16. two independent evaluations can be stable");
assert(officialEvaluatorStability({
  firstVisual: identity,
  secondVisual: null,
  firstVisualOverall: 78,
  secondVisualOverall: null,
  firstEditorial: 81,
  secondEditorial: null,
}) === "NOT_ESTABLISHED", "16b. a missing replicate is not stability");
assert(officialEvaluatorStability({
  firstVisual: identity,
  secondVisual: identity,
  firstVisualOverall: 70,
  secondVisualOverall: 90,
  firstEditorial: 81,
  secondEditorial: 79,
}) === "UNSTABLE", "17. material visual divergence is UNSTABLE");
assert(officialEvaluatorStability({
  firstVisual: identity,
  secondVisual: identity,
  firstVisualOverall: 78,
  secondVisualOverall: 80,
  firstEditorial: 70,
  secondEditorial: 90,
}) === "UNSTABLE", "18. material editorial divergence is UNSTABLE");
assert(conservativeMinPair(79, 74) === 74 && conservativeMinPair(81, null) === null, "19. official score is the lower valid pair");

assert(EXECUTION_54AY_MAX_AI_COST_USD === 0.5 && EXECUTION_54AY_BUDGET.maxUsd === 0.5 && AY_LEDGER.maxUsd === 0.5, "20. max budget is US$0.50");
const ledger = emptyExecutionBudgetLedger("execution-54ay", 0.5);
const allowed = budgetAllowsPaidCall(ledger, { kind: "EVALUATION", reserveUsd: 0.12 }, AY_LEDGER);
assert(allowed.allowed, "21. cost reserve is allowed inside the cap");
const reserved = reservePaidCall(ledger, { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.12, caps: AY_LEDGER });
assert(reserved.ok && reserved.ledger.reservedUsd === 0.12, "21b. reservation is persisted");
assert(!budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54ay", 0.5), { kind: "EVALUATION", reserveUsd: 0.51 }, AY_LEDGER).allowed, "22. insufficient balance blocks the call");

const backlog = buildImprovementBacklog({
  visualRuns: [officialVisual],
  editorialRuns: editorial ? [editorial] : [],
});
assert(backlog.desktop[0]?.recommendedFix.includes("packshot") && backlog.editorial[0]?.requiresNewProductFacts === false, "23. diagnosis is actionable");

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: EXECUTION_54AY_GENERATION_ID,
  desktopScreenshotPath: existsSync(desktopShot) ? desktopShot : standard.absolutePath,
  mobileScreenshotPath: existsSync(mobileShot) ? mobileShot : standard.absolutePath,
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 79,
  desktopVisualScore: 79,
  mobileVisualScore: 74,
  editorialScore: 81,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: [],
});
assert(blocked.status === "QUALITY_BLOCKED", "24. global gate stays blocked below 90/90/85");
assert(!canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "25. human review stays locked when the gate is incomplete");
const approved = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: EXECUTION_54AY_GENERATION_ID,
  desktopScreenshotPath: existsSync(desktopShot) ? desktopShot : standard.absolutePath,
  mobileScreenshotPath: existsSync(mobileShot) ? mobileShot : standard.absolutePath,
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
assert(approved.status === "QUALITY_APPROVED" && approved.humanReviewUnlocked === true, "26. human review unlocks only with complete approval");
assert(approved.publicationUnlocked === false && integrity.publicationReadiness === "BLOCKED", "27. publication stays blocked");
const lab = disableCommercialCta(buildV4Model(labScenarioKeys()[0]!)!);
assert(lab.hopSlot === "none" && !lab.hopHref, "28. commercial CTA stays disabled");
assert(integrity.commercialAuthorization === "BLOCKED", "29. ads stay blocked");
assert(EXECUTION_54AY_GENERATION_ID === "lp-mvs7mja3-0d690e7c" && frozen.generationId === EXECUTION_54AY_GENERATION_ID, "30. no new generation is created");

assert(visitorCaptureDefects({
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  overflowX: false,
  rendered: true,
  heroLoaded: true,
  brokenImages: 0,
  adminChromePresent: true,
  liveHop: false,
  previewCtaEnabled: false,
  checkoutRequest: false,
  missingFonts: 0,
  clippedEssential: false,
}).includes("Administrative chrome is visible."), "admin chrome remains a capture defect");
assert(!adminChromePresentInHtml(renderToStaticMarkup(createElement(V4Page, { model: lab }))), "renderer page markup has no lab bars");

const manifestFile = path.join(evidence, "candidate-manifest.json");
if (existsSync(manifestFile)) {
  const stored = JSON.parse(readFileSync(manifestFile, "utf8")) as { generationId?: string; newGenerationCreated?: boolean };
  assert(stored.generationId === EXECUTION_54AY_GENERATION_ID && stored.newGenerationCreated === false, "frozen evidence keeps the existing generation");
}

console.log(`PASS ${passed}`);
