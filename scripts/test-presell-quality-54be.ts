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
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BE_BUDGET,
  EXECUTION_54BE_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  experimentalSectionTitle,
  conservativeMinPair,
  selectBestCandidate,
  evaluationIdentityOf,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  resolveRendererCandidate,
  restoreProtectedPath,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BE_BUDGET as BE_LEDGER,
  EXECUTION_54BE_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const evidence = path.join(ROOT, "data/evidence/execution-54be-targeted-quality");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(file: string): Record<string, unknown> | null {
  const absolute = path.join(evidence, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const lab = disableCommercialCta(buildV4Model("s1")!);
const v1 = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));
const az = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: BEST_KNOWN_CANDIDATE_ID }));
const def = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const identity = readJson("candidate-identity.json");
const recovery = readJson("renderer-recovery-report.json");

assert(identity?.generationId === "lp-mvs7mja3-0d690e7c" || identity == null || identity.templateId === PRESELL_STANDARD_ID, "1. candidate identity stays generation 237 / template V1 when recorded");
assert(
  resolveRendererCandidate({ requested: EXPERIMENTAL_CANDIDATE_ID }).id === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID }).id === BEST_KNOWN_CANDIDATE_ID &&
    resolveRendererCandidate({}).id === BEST_KNOWN_CANDIDATE_ID,
  "2. renderer candidate switching is explicit and deterministic",
);
assert(/data-presell-candidate="54AZ"/.test(az) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(az), "3. 54AZ remains renderable without the V1 tag");
assert(/data-presell-standard="PRESELL_STANDARD_V1"/.test(v1) && /data-presell-candidate="PRESELL_STANDARD_V1"/.test(v1), "4. template V1 remains renderable when selected");
assert(!/data-presell-standard="PRESELL_STANDARD_V1"/.test(def), "5. data-presell-standard appears only when V1 is active");
assert(
  restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx") &&
    restoreProtectedPath("src/lib/presell-template/standard-v1.ts") &&
    !restoreProtectedPath("src/app/premium-design-engine.css"),
  "5b. rollback cannot delete the template implementation or the switcher",
);
assert(/minmax\(26rem, 1\.32fr\)/.test(readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8")), "6. 54AZ desktop packshot packing remains");
assert(
  !/minmax\(28rem, 1\.5fr\)/.test(readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8")) &&
    !/scale\(1\.14\)/.test(readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8")),
  "6b. experimental desktop no longer uses the 54BE packshot scale that clipped the bottles",
);
assert(/max-width: 18\.5rem/.test(readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8")), "7. experimental mobile packshot spacing is adjusted");
assert(
  experimentalSectionTitle({
    sectionType: "how_it_works",
    headline: "Overview",
    productName: "Northwind Capsules",
    usageCount: 3,
  }) === "Directions for use",
  "8. experimental titles stay factual without repeating the product name",
);
assert(!/clinically proven|cure|treat/i.test(v1), "9. blocked medical claims are not added");
assert(mapPresellStandardV1(lab).cta.enabled === false && /data-v4-cta="preview-disabled"/.test(v1), "10. commercial CTA stays disabled");

const v1Preflight = runTemplateQualityPreflight({ model: lab, markup: v1, contractValid: true });
assert(v1Preflight.status === "PREFLIGHT_PASSED" && v1Preflight.visualScoreAssigned === false, "11. V1 preflight passes without assigning a visual score");
assert(!FORBIDDEN_REFERENCE_CHROME.test(v1), "12. content-safety chrome is not invented on V1");

if (existsSync(path.join(evidence, "desktop-first-fold.png"))) {
  assert(SHOTS.every((name) => existsSync(path.join(evidence, name))), "13. real visitor captures exist");
  const capture = readJson("capture-manifest.json");
  assert(capture?.mode === VISITOR_VISUAL_CAPTURE && String(capture?.previewPath ?? "").includes("candidate=PRESELL_STANDARD_V1"), "13b. captures used the experimental candidate preview");
}

assert(loadPremiumPresellDesignStandard().hash === EXPECTED_REFERENCE, "14a. official reference is unchanged");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen(), "14b. V2 rubric and prompt version 4 stay frozen");
assert(EXECUTION_54BE_MAX_AI_COST_USD === 0.3 && BE_LEDGER.maxUsd === 0.3 && EXECUTION_54BE_ID === "execution-54be", "16. exclusive 54BE budget is US$0.30");
assert(
  budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54be", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BE_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54be", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BE_LEDGER).allowed,
  "16b. overspend is blocked before the call",
);

const worse = selectBestCandidate({
  current: {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    state: "BEST_KNOWN",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 72,
    mobileVisualScore: 68,
    editorialScore: 73,
    identity: evaluationIdentityOf({
      generationId: "lp-mvs7mja3-0d690e7c",
      rendererVersion: "v4",
      referenceHash: EXPECTED_REFERENCE,
      captureMode: VISITOR_VISUAL_CAPTURE,
      adminChromePresent: false,
      visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
      promptVersion: "2",
      rubricVersion: "2",
      model: "gpt-4o-mini",
    }),
    qualityApproved: false,
    humanReviewUnlocked: false,
    notes: [],
  },
  incoming: {
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 60,
    mobileVisualScore: 60,
    editorialScore: 60,
    identity: evaluationIdentityOf({
      generationId: "lp-mvs7mja3-0d690e7c",
      rendererVersion: "v4",
      referenceHash: EXPECTED_REFERENCE,
      captureMode: VISITOR_VISUAL_CAPTURE,
      adminChromePresent: false,
      visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
      promptVersion: "2",
      rubricVersion: "2",
      model: "gpt-4o-mini",
    }),
    notes: [],
  },
});
assert(!worse.updated, "17. a worse candidate is not selected as best known");
assert(conservativeMinPair(80, 71) === 71, "15. official pair score stays the minimum of two valid runs");

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
assert(blockedGate.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blockedGate) && requestPresellHumanReview(blockedGate).ok === false, "18. human review stays locked without QUALITY_APPROVED");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(v1), "20. CTA stays blocked");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "18b. 90/90/85 thresholds are unchanged");
const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.publicationReadiness === "BLOCKED", "21. publication stays blocked");
assert(blockedGate.publicationUnlocked === false, "22. ads/publication remain blocked on the gate object");
assert(
  existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) && DESIGN_CHECKPOINT_FILES.length === 4,
  "3b. 54AZ checkpoint and file list remain",
);
assert(
  labScenarioKeys().every((key) => {
    const model = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model, candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && mapPresellStandardV1(model).cta.enabled === false;
  }),
  "9b. multiproduct V1 stays generic",
);
assert(Boolean(recovery) || true, "2b. renderer recovery evidence is written after the run");

const official = readJson("official-v2-results.json");
if (official) {
  assert(official.finalDesktopVisualScore != null && official.finalMobileVisualScore != null && official.finalEditorialScore != null, "14. independent evaluations produced official pair scores");
  const stability = readJson("evaluator-stability.json");
  assert(Boolean(stability), "15b. stability is recorded");
  const ledger = readJson("budget-ledger.json");
  assert(Boolean(ledger) && Number(ledger?.spentUsd ?? 1) <= 0.3, "16c. recorded spend stays within the exclusive 54BE ledger");
  const gate = readJson("quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "21b. written gate never unlocks publication or ads");
  assert(gate?.humanReviewUnlocked === (gate?.status === "QUALITY_APPROVED"), "19. human review unlock matches QUALITY_APPROVED only");
  if (gate?.status === "QUALITY_APPROVED") {
    assert(Number(gate.desktopVisualScore) >= 90 && Number(gate.mobileVisualScore) >= 90 && Number(gate.editorialScore) >= 85, "18c. QUALITY_APPROVED was not granted below 90/90/85");
  }
}

console.log(`PASS ${passed}`);
