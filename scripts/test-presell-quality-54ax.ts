import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import {
  EXECUTION_54AX_BUDGET,
  FORBIDDEN_REFERENCE_CHROME,
  PREMIUM_VISUAL_EVALUATION_V2,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  VISUAL_DIMENSION_WEIGHTS,
  adminChromePresentInHtml,
  canEnterHumanReviewQueue,
  compareEvaluationIdentities,
  createDesignCheckpoint,
  evaluationIdentityOf,
  historicalComparabilityMatrix,
  historicalEvaluationRows,
  loadPremiumPresellDesignStandard,
  methodologyThresholdsFrozen,
  paidAiBlockedFor54ax,
  requestPresellHumanReview,
  restoreDesignCheckpoint,
  selectBestCandidate,
  stabilityFromIndependentPair,
  visitorCaptureDefects,
  visitorCapturePreviewPath,
  visualComparisonPromptV2,
  visualRubricV2Record,
  visualWeightsSumToOne,
  VISITOR_CAPTURE_VIEWPORTS,
  VISITOR_VISUAL_CAPTURE,
  LAB_PREVIEW_CAPTURE,
} from "../src/lib/presell-quality/index.ts";
import { EXECUTION_54AX_BUDGET as AX_LEDGER, emptyExecutionBudgetLedger, budgetAllowsPaidCall } from "../src/lib/presell-quality/execution-budget.ts";
import { sha256File } from "../src/lib/presell-quality/fingerprint.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const standard = loadPremiumPresellDesignStandard();
assert(standard.registered && standard.relativePath === "design-references/premium-presell-reference.png", "1. official reference is registered");
assert(createHash("sha256").update(readFileSync(standard.absolutePath)).digest("hex") === "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938", "2. reference SHA-256 matches");

const rubric = visualRubricV2Record();
assert(rubric.id === PREMIUM_VISUAL_EVALUATION_V2 && rubric.promptVersion === "2", "3. visual rubric is versioned as V2");
assert(visualWeightsSumToOne() && rubric.weights.HERO_FIRST_IMPRESSION === 0.2 && VISUAL_DIMENSION_WEIGHTS.MOBILE === 0.1, "4. visual weights are preserved");
assert(methodologyThresholdsFrozen() && rubric.visualTarget === 90 && rubric.editorialTarget === 85 && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "5. quality thresholds are preserved");

assert(!adminChromePresentInHtml('<main data-v4="page"><h1>Product</h1></main>'), "6. visitor markup has no admin bars");
assert(adminChromePresentInHtml('<div class="ds-labbar">Lab · SANDBOX</div>'), "6b. lab bars are detected");
assert(VISITOR_CAPTURE_VIEWPORTS.desktop.width === 1440 && VISITOR_CAPTURE_VIEWPORTS.desktop.height === 900, "7. desktop capture 1440x900");
assert(VISITOR_CAPTURE_VIEWPORTS.tablet.width === 768 && VISITOR_CAPTURE_VIEWPORTS.tablet.height === 1024, "8. tablet capture 768x1024");
assert(VISITOR_CAPTURE_VIEWPORTS.mobile.width === 390 && VISITOR_CAPTURE_VIEWPORTS.mobile.height === 844, "9. mobile capture 390x844");

const evidence = path.join(process.cwd(), "data/evidence/execution-54ax-visual-calibration");
const desktopShot = path.join(evidence, "desktop-visitor.png");
const tabletShot = path.join(evidence, "tablet-visitor.png");
const mobileShot = path.join(evidence, "mobile-visitor.png");
if (existsSync(desktopShot) && existsSync(tabletShot) && existsSync(mobileShot)) {
  assert(Boolean(sha256File(desktopShot) && sha256File(tabletShot) && sha256File(mobileShot)), "10. real visitor screenshots exist");
  assert(visitorCapturePreviewPath("lp-mvs7mja3-0d690e7c").includes("visualCapture=visitor"), "11. renderer identity uses visitor capture path");
} else {
  assert(visitorCapturePreviewPath("lp-mvs7mja3-0d690e7c").includes("visualCapture=visitor"), "10. visitor capture path is defined before screenshots");
  assert(VISITOR_CAPTURE_VIEWPORTS.desktop.width === 1440, "11. capture protocol keeps renderer viewports");
}

assert(visitorCapturePreviewPath("lp-mvs7mja3-0d690e7c").includes("lp-mvs7mja3-0d690e7c"), "12. generation id is part of capture identity");
assert(typeof sha256File(standard.absolutePath) === "string", "13. screenshot/reference hashing is available");

const comparableA = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: "2",
  rubricVersion: "2",
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  model: "gpt-4o-mini",
  referenceHash: standard.hash,
  screenshotHashes: ["aaa", "bbb"],
});
const comparableB = { ...comparableA };
assert(compareEvaluationIdentities(comparableA, comparableB).status === "COMPARABLE", "14. matching identities are comparable");
const incompatible = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  visualEvalVersion: null,
  promptVersion: "cursor-multimodal",
  captureMode: LAB_PREVIEW_CAPTURE,
  adminChromePresent: true,
  model: "CURSOR_MULTIMODAL",
});
assert(compareEvaluationIdentities(comparableA, incompatible).status === "NOT_COMPARABLE", "15. lab-chrome Cursor scores are not comparable to V2 visitor scores");
assert(stabilityFromIndependentPair({ first: comparableA, second: comparableB, firstOverall: 88, secondOverall: 90 }) === "STABLE", "16. independent pair on the same screenshots can be stable");
assert(stabilityFromIndependentPair({ first: comparableA, second: { ...comparableA, screenshotHashes: ["other"] }, firstOverall: 88, secondOverall: 90 }) === "NOT_ESTABLISHED", "17. different screenshots are not stability replicates");
assert(!visualComparisonPromptV2().system.includes("QUALITY_APPROVED") && visualComparisonPromptV2().system.includes("Do not raise scores to force approval"), "18. V2 prompt does not invent an approval score");

const lab = disableCommercialCta(buildV4Model(labScenarioKeys()[0]!)!);
const markup = renderToStaticMarkup(createElement(V4Page, { model: lab }));
assert(!FORBIDDEN_REFERENCE_CHROME.test(markup) && !/verified buyer/.test(markup), "19. engine does not invent commercial chrome");

const incoming = {
  campaignId: 237,
  generationId: "lp-next",
  contentSafetyPass: true,
  evaluationValid: true,
  desktopVisualScore: 91,
  mobileVisualScore: 91,
  editorialScore: 86,
  identity: comparableA,
  notes: [],
};
const currentBest = {
  selector: "PRESELL_BEST_CANDIDATE_SELECTOR" as const,
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  state: "BEST_KNOWN" as const,
  contentSafetyPass: true,
  evaluationValid: true,
  desktopVisualScore: 88,
  mobileVisualScore: 88,
  editorialScore: 85,
  identity: comparableA,
  qualityApproved: false as const,
  humanReviewUnlocked: false as const,
  notes: [],
};
const improved = selectBestCandidate({ current: currentBest, incoming: { ...incoming, identity: comparableB } });
assert(improved.updated && improved.best.generationId === "lp-next", "20. best candidate selector updates on proven comparable improvement");
assert(improved.best.qualityApproved === false && improved.best.humanReviewUnlocked === false, "20b. BEST_KNOWN is not QUALITY_APPROVED");

const kept = selectBestCandidate({
  current: currentBest,
  incoming: { ...incoming, desktopVisualScore: 70, mobileVisualScore: 70, editorialScore: 70, identity: comparableB },
});
assert(!kept.updated && kept.best.generationId === currentBest.generationId, "21. previous best is preserved when the new scores are worse");
assert(!selectBestCandidate({
  current: currentBest,
  incoming: { ...incoming, desktopVisualScore: 70, mobileVisualScore: 70, editorialScore: 70, identity: comparableB },
}).updated, "22. regression is rejected");

const inconclusive = selectBestCandidate({
  current: currentBest,
  incoming: { ...incoming, identity: incompatible },
});
assert(!inconclusive.updated && inconclusive.comparisonStatus === "NOT_COMPARABLE", "23. incompatible methodology does not replace the best candidate");

const tmp = mkdtempSync(path.join(os.tmpdir(), "54ax-chk-"));
const sample = path.join(tmp, "src/app/premium-design-engine.css");
mkdirSync(path.dirname(sample), { recursive: true });
writeFileSync(sample, "/* checkpoint-a */");
const checkpoint = createDesignCheckpoint({
  campaignId: 99,
  generationId: "lp-chk",
  root: tmp,
  id: "chk-test",
  notes: ["isolated"],
});
assert(checkpoint.files.length === 4, "24. design checkpoint records engine files");
writeFileSync(sample, "/* mutated */");
const restored = restoreDesignCheckpoint(checkpoint, { root: tmp, confirm: true });
assert(restored.restored.includes("src/app/premium-design-engine.css") && readFileSync(sample, "utf8") === "/* checkpoint-a */", "25. safe restore writes the checkpoint files without git reset");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.contractVersion === 1, "26. Product Contract unchanged");
assert(integrity.publicationReadiness === "BLOCKED" && integrity.commercialAuthorization === "BLOCKED", "27. content safety / commercial gates remain blocked");

const rows = historicalEvaluationRows();
assert(rows.length === 3 && historicalComparabilityMatrix(rows).every((item) => item.status !== "COMPARABLE"), "historical 54AT/AU/AW pairs are not V2-comparable");

assert(paidAiBlockedFor54ax() && EXECUTION_54AX_BUDGET.maxUsd === 0 && AX_LEDGER.maxUsd === 0, "32. paid AI is blocked for 54AX");
assert(!budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54ax", 0), { kind: "EVALUATION", reserveUsd: 0.15 }, AX_LEDGER).allowed, "32b. paid reserve is refused at US$0");

const blockedGate = { status: "QUALITY_BLOCKED" as const };
assert(!canEnterHumanReviewQueue(blockedGate) && requestPresellHumanReview({
  id: "GLOBAL_PRESELL_QUALITY_GATE",
  status: "QUALITY_BLOCKED",
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  humanReviewUnlocked: false,
  publicationUnlocked: false,
  reasons: ["V2 evaluation pending"],
  visualScore: null,
  desktopVisualScore: null,
  mobileVisualScore: null,
  editorialScore: null,
  evaluatorStability: "NOT_ESTABLISHED",
  criticalVisualDefects: [],
  contentSafetyPass: true,
  referenceRegistered: true,
  comparedToOfficialReference: false,
}).ok === false, "28. global gate still blocks human review");
assert(integrity.publicationReadiness === "BLOCKED", "30. publication stays blocked");
assert(lab.hopSlot === "none" && !lab.hopHref, "31. commercial CTA disabled");
assert(requestPresellHumanReview({
  id: "GLOBAL_PRESELL_QUALITY_GATE",
  status: "QUALITY_BLOCKED",
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  humanReviewUnlocked: false,
  publicationUnlocked: false,
  reasons: [],
  visualScore: null,
  desktopVisualScore: null,
  mobileVisualScore: null,
  editorialScore: null,
  evaluatorStability: null,
  criticalVisualDefects: [],
  contentSafetyPass: true,
  referenceRegistered: true,
  comparedToOfficialReference: false,
}).ok === false, "29. human review stays locked without QUALITY_APPROVED");

const sparse = disableCommercialCta(buildV4Model("s4")!);
const incomplete = disableCommercialCta(buildV4Model("s6")!);
const html = renderToStaticMarkup(createElement(V4Page, { model: sparse })) + renderToStaticMarkup(createElement(V4Page, { model: incomplete }));
assert(!FORBIDDEN_REFERENCE_CHROME.test(html) && !incomplete.hopHref, "multiproduct engine stays generic");
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
}).includes("Administrative chrome is visible."), "admin chrome is a capture defect");

console.log(`PASS ${passed}`);
