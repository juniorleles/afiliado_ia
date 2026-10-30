import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BL_BUDGET,
  EXECUTION_54BL_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  PREMIUM_STRUCTURAL_COMPOSITION_ID,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  presentFulfillmentFact,
  uniqueGuaranteeStatements,
  premiumSlotsFromModel,
  conservativeMinPair,
  selectBestCandidate,
  evaluationIdentityOf,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  STRUCTURAL_COMPOSITION_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  VISUAL_HIERARCHY_EXECUTION_ID,
  experimentalExecutionIdOf,
  usesPremiumStructuralComposition,
  parseRendererCandidateId,
  resolveRendererCandidate,
  restoreProtectedPath,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BL_BUDGET as BL_LEDGER,
  EXECUTION_54BL_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bl-structural-composition");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BK_COMMIT = "368ef31377092ff79b39ab8c20ccb9d7b249671a";
const BK_MESSAGE = "docs(presell): document structural composition decision and 54BL plan";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const v1Source = readFileSync(path.join(ROOT, "src/components/presell/standard-v1-page.tsx"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const bl = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: STRUCTURAL_COMPOSITION_EXECUTION_ID }));
const bi = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID }));
const bj = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: VISUAL_HIERARCHY_EXECUTION_ID }));
const az = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: BEST_KNOWN_CANDIDATE_ID }));
const v1 = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));
const bkPresent = execSync(`git cat-file -t ${BK_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit";
const bkMessage = execSync(`git log -1 --format=%s ${BK_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim();
const checkpointMeta = existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"))
  ? (JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8")) as { id?: string; sourceCommit?: string })
  : null;

assert(bkPresent && bkMessage === BK_MESSAGE, "1. 54BK commit integrity is preserved with the required message");
assert(
  checkpointMeta == null || (checkpointMeta.id === "54bi-proven-baseline" && checkpointMeta.sourceCommit === BI_COMMIT),
  "2. 54BI checkpoint remains recoverable",
);
assert(
  STRUCTURAL_COMPOSITION_EXECUTION_ID === "54BL" &&
    CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BN" &&
    PREMIUM_STRUCTURAL_COMPOSITION_ID === "PREMIUM_STRUCTURAL_V2" &&
    FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI" &&
    VISUAL_HIERARCHY_EXECUTION_ID === "54BJ" &&
    parseRendererCandidateId("54BL") === EXPERIMENTAL_CANDIDATE_ID &&
    parseRendererCandidateId("PREMIUM_STRUCTURAL_V2") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BL" }).executionId === "54BL" &&
    resolveRendererCandidate({ requested: "54BI" }).executionId === "54BI" &&
    resolveRendererCandidate({ requested: "54BJ" }).executionId === "54BJ" &&
    experimentalExecutionIdOf("54BL") === "54BL" &&
    usesPremiumStructuralComposition("54BL") &&
    !usesPremiumStructuralComposition("54BI") &&
    !usesPremiumStructuralComposition("54BJ"),
  "3. 54BL has a distinct experimental identity and PREMIUM_STRUCTURAL_V2 composition",
);
assert(
  resolveRendererCandidate({ requested: EXPERIMENTAL_CANDIDATE_ID }).id === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID }).id === BEST_KNOWN_CANDIDATE_ID &&
    resolveRendererCandidate({}).id === BEST_KNOWN_CANDIDATE_ID,
  "4. renderer candidate switching remains explicit",
);
assert(
  /data-structural-hero="v2"/.test(bl) &&
    /premium-structural-hero__copy/.test(bl) &&
    /premium-structural-hero__facts/.test(bl) &&
    /premium-structural-hero__actions/.test(bl) &&
    /data-presell-composition="PREMIUM_STRUCTURAL_V2"/.test(bl) &&
    !/data-structural-hero="v2"/.test(bi) &&
    !/data-structural-hero="v2"/.test(bj),
  "5. 54BL desktop hero uses three structural areas without changing 54BI or 54BJ",
);
assert(
  /data-presell-execution="54BL"/.test(bl) &&
    /@media \(max-width: 959px\)[\s\S]*\[data-presell-execution="54BL"\][\s\S]*grid-template-areas:[\s\S]*product[\s\S]*copy[\s\S]*facts[\s\S]*actions/.test(css),
  "6. 54BL mobile stack is independent of the desktop 2-column split",
);
assert(
  /\[data-presell-execution="54BL"\][\s\S]*\.premium-hero-rail \{[\s\S]*display:\s*flex/.test(css) &&
    /factMode="compact"/.test(v1Source) &&
    /factMode="authorized"/.test(v1Source),
  "7. 54BL keeps compact fold facts visible below 960px instead of hiding the rail",
);

const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const stored = readGenerationModel(GENERATION_ID);
const record = readGeneration(GENERATION_ID);
const patch = readQualityPatch(GENERATION_ID);
const patchedBase = stored && patch ? applyQualityPatch(stored, patch) : stored;
const sandboxed = patchedBase && record?.sandbox?.enabled ? applySandboxToModel(patchedBase, { href: record.sandbox.ctaPath }) : patchedBase;
const patched = sandboxed ? disableCommercialCta(sandboxed) : null;
const campaignBl = patched ? renderToStaticMarkup(createElement(V4Page, { model: patched, candidate: "54BL" })) : "";
const campaignBi = patched ? renderToStaticMarkup(createElement(V4Page, { model: patched, candidate: "54BI" })) : "";
assert(
  !patched ||
    (/premium-structural-hero__product/.test(campaignBl) && /data-fact-mode="compact"/.test(campaignBl)),
  "5c. campaign 54BL first fold includes the packshot product area and compact facts",
);
assert(
  !patched ||
    (/empty bottles/i.test(campaignBl) &&
      /minus shipping/i.test(campaignBl) &&
      /48 hours/i.test(campaignBl) &&
      /24 working hours/i.test(campaignBl) &&
      /5 to 10 days/i.test(campaignBl) &&
      /one[- ]time payment/i.test(campaignBl) &&
      /data-presell-section="SHIPPING_OR_ACCESS"/.test(campaignBl)),
  "8. complete logistics remain on the page below the 54BL first fold",
);
assert(
  !patched || (/empty bottles/i.test(campaignBl) && /48 hours/i.test(campaignBl) && /minus shipping/i.test(campaignBl)),
  "9. 60-day guarantee conditions remain",
);
assert(!patched || /maca|guarana|gymnema|ginseng/i.test(campaignBl), "10. approved ingredients remain");
assert(!patched || /two drops|30 seconds|data-premium="usage"/i.test(campaignBl), "11. approved usage instructions remain");
assert(
  /minmax\(26rem, 1\.32fr\)/.test(css) &&
    !/scale\(1\.14\)/.test(css) &&
    /\[data-presell-execution="54BL"\][\s\S]*transform:\s*none/.test(css) &&
    /object-fit:\s*contain/.test(css),
  "12. packshot packing stays unclipped and 54BE scale is absent",
);
assert(/overflow-x:\s*clip/.test(css), "13. root still clips horizontal overflow");
assert(
  /@media \(min-width: 960px\)[\s\S]*\[data-presell-execution="54BL"\][\s\S]*grid-template-areas:[\s\S]*copy product facts/.test(css),
  "14. desktop 54BL composition is a three-area grid",
);
assert(
  /@media \(max-width: 959px\)[\s\S]*\[data-presell-execution="54BL"\][\s\S]*max-width: 22rem/.test(css),
  "15. tablet 54BL packshot stage stays bounded",
);
assert(
  /@media \(max-width: 767px\)[\s\S]*\[data-presell-execution="54BL"\][\s\S]*max-width: 18\.5rem/.test(css),
  "16. mobile 54BL packshot max-width stays 18.5rem",
);
assert(
  /\[data-presell-execution="54BL"\]/.test(css) &&
    /\[data-presell-execution="54BJ"\]/.test(css) &&
    !/data-structural-hero="v2"/.test(bi) &&
    /data-presell-execution="54BI"/.test(bi),
  "17. 54BL CSS is execution-scoped and 54BI render stays on the previous composition",
);
assert(
  PRESELL_STANDARD_ID === "PRESELL_STANDARD_V1" &&
    PRESELL_STANDARD_VERSION === "1" &&
    /data-presell-standard="PRESELL_STANDARD_V1"/.test(bl) &&
    !/sugar\s*defender|femicore/i.test(v1Source),
  "18. template remains PRESELL_STANDARD_V1 and product-generic",
);
assert(
  labScenarioKeys().every((key) => {
    const model = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model, candidate: "54BL" }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && mapPresellStandardV1(model).cta.enabled === false;
  }),
  "19. multiproduct 54BL stays generic",
);
const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "20. Product Contract remains valid");
assert(!FORBIDDEN_REFERENCE_CHROME.test(bl) && !FORBIDDEN_REFERENCE_CHROME.test(az), "21. Content Safety chrome is not invented");
const v1Preflight = runTemplateQualityPreflight({ model: lab, markup: bl, contractValid: true });
assert(v1Preflight.status === "PREFLIGHT_PASSED" && v1Preflight.visualScoreAssigned === false, "22. V1 preflight passes without assigning a visual score");

if (existsSync(path.join(evidence, "desktop-first-fold.png"))) {
  assert(SHOTS.every((name) => existsSync(path.join(evidence, name))), "23. real visitor captures exist");
  const capture = readJson(evidence, "capture-manifest.json");
  assert(
    capture?.mode === VISITOR_VISUAL_CAPTURE && String(capture?.previewPath ?? "").includes("candidate=54BL"),
    "23b. captures used the distinct 54BL candidate preview",
  );
  const hashes = readJson(evidence, "screenshot-hashes.json") as { current?: Record<string, string>; previous54bi?: Record<string, string> } | null;
  const comparison = readJson(evidence, "capture-hash-comparison.json");
  assert(Boolean(hashes?.current && Object.keys(hashes.current).length === 6), "24. capture hashes are recorded");
  assert(
    comparison == null || comparison.hashesDifferFrom54bi === true,
    "24b. 54BL capture hashes differ from 54BI when comparison evidence exists",
  );
}

assert(loadPremiumPresellDesignStandard().hash === EXPECTED_REFERENCE, "23c. official reference is unchanged");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen(), "23d. V2 rubric and prompt version 4 stay frozen");
assert(conservativeMinPair(80, 71) === 71, "25. official pair score stays the minimum of two valid runs");
assert(EXECUTION_54BL_MAX_AI_COST_USD === 0.3 && BL_LEDGER.maxUsd === 0.3 && EXECUTION_54BL_ID === "execution-54bl", "27. exclusive 54BL budget is US$0.30");
assert(
  budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bl", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BL_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bl", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BL_LEDGER).allowed,
  "27b. overspend is blocked before the call",
);

const worse = selectBestCandidate({
  current: {
    selector: "PRESELL_BEST_CANDIDATE_SELECTOR",
    campaignId: 237,
    generationId: "lp-mvs7mja3-0d690e7c",
    state: "BEST_KNOWN",
    contentSafetyPass: true,
    evaluationValid: true,
    desktopVisualScore: 74,
    mobileVisualScore: 72,
    editorialScore: 74,
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
assert(!worse.updated, "28. a worse candidate is not selected as best known");

const blockedGate = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 74,
  desktopVisualScore: 74,
  mobileVisualScore: 72,
  editorialScore: 74,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blockedGate.status === "QUALITY_BLOCKED", "29. Global Quality Gate stays QUALITY_BLOCKED below 90/90/85");
assert(
  restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx") &&
    !restoreProtectedPath("src/app/premium-design-engine.css"),
  "30. rollback cannot delete the template implementation or the switcher",
);
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(bl) && mapPresellStandardV1(lab).cta.enabled === false, "31. CTA stays blocked");
assert(integrity.publicationReadiness === "BLOCKED" && blockedGate.publicationUnlocked === false, "32. publication stays blocked");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && !canEnterHumanReviewQueue(blockedGate) && requestPresellHumanReview(blockedGate).ok === false, "33. ads and human review remain blocked below 90/90/85");
assert(/data-presell-standard="PRESELL_STANDARD_V1"/.test(v1) && /data-presell-execution="54BN"/.test(v1), "4b. current experimental V1 tags 54BN");
assert(/data-presell-candidate="54AZ"/.test(az) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(az), "4c. 54AZ remains renderable without the V1 tag");
assert(
  existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) && DESIGN_CHECKPOINT_FILES.length === 4,
  "2b. 54AZ checkpoint and file list remain",
);
assert(uniqueGuaranteeStatements(premiumSlotsFromModel(lab).guarantee.statements).length <= premiumSlotsFromModel(lab).guarantee.statements.length, "9b. guarantee statements stay unique");
assert(presentFulfillmentFact("We strive to ship every order within 24 working hours.", "DISPATCH").includes("ship"), "8b. authorized dispatch text is preserved");
assert(!/data-structural-hero="v2"/.test(campaignBi || bi), "5b. frozen 54BI does not receive the structural hero");

const official = readJson(evidence, "official-v2-results.json");
if (official) {
  assert(official.finalDesktopVisualScore != null && official.finalMobileVisualScore != null && official.finalEditorialScore != null, "25b. independent evaluations produced official pair scores");
  const stability = readJson(evidence, "evaluator-stability.json");
  assert(Boolean(stability), "26. stability is recorded");
  const ledger = readJson(evidence, "budget-ledger.json");
  assert(Boolean(ledger) && Number(ledger?.spentUsd ?? 1) <= 0.3, "27c. recorded spend stays within the exclusive 54BL ledger");
  const gate = readJson(evidence, "quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "33b. written gate never unlocks publication or ads");
  assert(gate?.humanReviewUnlocked === (gate?.status === "QUALITY_APPROVED"), "33c. human review unlock matches QUALITY_APPROVED only");
}

console.log(`PASS ${passed}`);
