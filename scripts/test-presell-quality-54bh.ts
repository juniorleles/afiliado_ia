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
  EXECUTION_54BH_BUDGET,
  EXECUTION_54BH_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  mapPresellStandardV1,
  runTemplateQualityPreflight,
  compactFact,
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
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  PRIOR_CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  parseRendererCandidateId,
  resolveRendererCandidate,
  restoreProtectedPath,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BH_BUDGET as BH_LEDGER,
  EXECUTION_54BH_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bh-content-density");
const planPath = path.join(ROOT, "data/evidence/execution-54bg-root-cause-analysis/execution-54bh-implementation-plan.md");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BG_COMMIT = "8d9a2b26331519a1fe4b5177dfffa27edac2d029";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const blocks = readFileSync(path.join(ROOT, "src/components/design-system/premium-blocks.tsx"), "utf8");
const v1Source = readFileSync(path.join(ROOT, "src/components/presell/standard-v1-page.tsx"), "utf8");
const azPage = readFileSync(path.join(ROOT, "src/components/product-showcase/v4/page.tsx"), "utf8");
const lab = disableCommercialCta(buildV4Model("s1")!);
const v1 = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: EXPERIMENTAL_CANDIDATE_ID }));
const az = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: BEST_KNOWN_CANDIDATE_ID }));
const via54bh = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: CONTROLLED_IMPROVEMENT_EXECUTION_ID }));
const via54bf = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BF" }));
const def = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const identity = readJson(evidence, "candidate-identity.json");
const log = execSync("git log -1 --format=%H", { cwd: ROOT, encoding: "utf8" }).trim();
const bgPresent = execSync(`git cat-file -t ${BG_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit";
const plan = existsSync(planPath) ? readFileSync(planPath, "utf8") : "";
const dispatchSample = "We strive to ship every order within 24 working hours. Tracking follows after dispatch.";
const returnsSample = "The seller states a 60-day refund. Empty bottles may be returned. Return shipping is not covered.";

assert(bgPresent, "1. 54BG commit object remains recoverable");
assert(
  parseRendererCandidateId("54BH") === EXPERIMENTAL_CANDIDATE_ID &&
    (identity == null || identity.candidateExecution === "54BH"),
  "1b. experimental candidate identity is PRESELL_STANDARD_V1 / execution 54BH",
);
assert(
  plan.includes("### BH-02 — Quiet the announcement without deleting the section") &&
    plan.includes("### BH-03 — Restage authorized logistics cards") &&
    plan.includes("src/app/premium-design-engine.css") &&
    plan.includes("src/components/design-system/premium-blocks.tsx"),
  "2. official BH-02 and BH-03 plan text is intact",
);
assert(
  !plan.includes("this execution implements BH-04") &&
    /factMode === "authorized"/.test(blocks) &&
    /factMode="authorized"/.test(v1Source) &&
    !/scale\(1\.14\)/.test(css) &&
    !/minmax\(28rem, 1\.5fr\)/.test(css),
  "3. only BH-02 and BH-03 were implemented; packshot scale stays frozen",
);
assert(/data-presell-candidate="54AZ"/.test(az) && !/data-presell-standard="PRESELL_STANDARD_V1"/.test(az), "4. 54AZ remains renderable without the V1 tag");
assert(
  resolveRendererCandidate({ requested: EXPERIMENTAL_CANDIDATE_ID }).id === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: BEST_KNOWN_CANDIDATE_ID }).id === BEST_KNOWN_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BH" }).id === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({ requested: "54BF" }).id === EXPERIMENTAL_CANDIDATE_ID &&
    parseRendererCandidateId("54BF") === EXPERIMENTAL_CANDIDATE_ID &&
    resolveRendererCandidate({}).id === BEST_KNOWN_CANDIDATE_ID,
  "5. renderer candidate switching remains explicit, including 54BH and the 54BF alias",
);
assert(
  /data-presell-standard="PRESELL_STANDARD_V1"/.test(v1) &&
    new RegExp(`data-presell-execution="${CONTROLLED_IMPROVEMENT_EXECUTION_ID}"`).test(v1) &&
    new RegExp(`data-presell-execution="${CONTROLLED_IMPROVEMENT_EXECUTION_ID}"`).test(via54bh) &&
    new RegExp(`data-presell-execution="${CONTROLLED_IMPROVEMENT_EXECUTION_ID}"`).test(via54bf) &&
    PRESELL_STANDARD_ID === "PRESELL_STANDARD_V1" &&
    PRESELL_STANDARD_VERSION === "1",
  "6. template V1 remains renderable and is tagged with the current experimental execution",
);
assert(
  /data-presell-section="ANNOUNCEMENT_BAR"/.test(v1) &&
    /@media \(min-width: 768px\)[\s\S]*\[data-presell-standard="PRESELL_STANDARD_V1"\] \.presell-announce[\s\S]*padding: 0\.32rem 1rem/.test(css) &&
    /@media \(max-width: 767px\)[\s\S]*\[data-presell-standard="PRESELL_STANDARD_V1"\] \.presell-announce[\s\S]*padding: 0\.45rem 1rem/.test(css),
  "7. announcement bar stays in markup, quieter on desktop, with mobile padding preserved",
);
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const stored = readGenerationModel(GENERATION_ID);
const record = readGeneration(GENERATION_ID);
const patch = readQualityPatch(GENERATION_ID);
const patchedBase = stored && patch ? applyQualityPatch(stored, patch) : stored;
const sandboxed = patchedBase && record?.sandbox?.enabled ? applySandboxToModel(patchedBase, { href: record.sandbox.ctaPath }) : patchedBase;
const patched = sandboxed ? disableCommercialCta(sandboxed) : null;
const campaignV1 = patched ? renderToStaticMarkup(createElement(V4Page, { model: patched, candidate: EXPERIMENTAL_CANDIDATE_ID })) : "";
const campaignFrozen = patched ? renderToStaticMarkup(createElement(V4Page, { model: patched, candidate: FROZEN_IMPROVEMENT_EXECUTION_ID })) : "";
const campaignAz = patched ? renderToStaticMarkup(createElement(V4Page, { model: patched, candidate: BEST_KNOWN_CANDIDATE_ID })) : "";
assert(
  /factMode="authorized"/.test(v1Source) &&
    !/factMode="authorized"/.test(azPage) &&
    /factMode = "compact"/.test(blocks) &&
    presentFulfillmentFact(dispatchSample, "DISPATCH").includes("ship") &&
    presentFulfillmentFact(dispatchSample, "DISPATCH").length > compactFact(dispatchSample, 48, "DISPATCH").length &&
    (!patched || (/data-fact-mode="authorized"/.test(campaignFrozen) && /data-fact-mode="compact"/.test(campaignAz))),
  "8. V1 logistics cards use authorized body strings; 54AZ stays compact",
);
const slots = premiumSlotsFromModel(lab);
assert(
  uniqueGuaranteeStatements(slots.guarantee.statements).length <= slots.guarantee.statements.length &&
    presentFulfillmentFact(returnsSample, "RETURNS").toLowerCase().includes("60-day") &&
    (!patched || /empty bottles|minus shipping|60/.test(campaignV1)),
  "9. guarantee statements stay unique and refund conditions remain in authorized copy",
);
assert(
  /data-presell-section="ANNOUNCEMENT_BAR"/.test(v1) &&
    /data-presell-section="ANNOUNCEMENT_BAR"/.test(campaignV1 || v1) &&
    /data-v4-section="guarantee"/.test(campaignV1 || v1) &&
    v1Source.includes("BH-04") === false,
  "10. BH-04 was not executed; announcement and guarantee sections both remain",
);
const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid, "11. Product Contract remains valid and unchanged by this execution");
assert(!/clinically proven|cure diabetes|fda approved|star rating|verified buyer/i.test(v1), "12. blocked claims and forbidden chrome are not added");
assert(/minmax\(26rem, 1\.32fr\)/.test(css) && !/scale\(1\.14\)/.test(css) && /object-fit:\s*contain/.test(css) && /transform:\s*none/.test(css), "13. packshot packing stays unclipped");
assert(/minmax\(26rem, 1\.32fr\)/.test(css) && /@media \(min-width: 768px\)/.test(css), "14. desktop layout keeps recovered 54AZ packing plus BH-02/03 scoped rules");
assert(/@media \(max-width: 959px\)[\s\S]*premium-hero-rail[\s\S]*display:\s*none/.test(css), "15. tablet/narrow layout still hides the hero rail in favor of chips");
assert(
  /max-width: 18\.5rem/.test(css) &&
    /premium-hero-chips li:nth-child\(n \+ 3\)/.test(css) &&
    /padding: 0\.45rem 1rem/.test(css),
  "16. mobile 54BE spacing, chip reduction, and announcement padding are preserved",
);
const v1Preflight = runTemplateQualityPreflight({ model: lab, markup: v1, contractValid: true });
assert(v1Preflight.status === "PREFLIGHT_PASSED" && v1Preflight.visualScoreAssigned === false, "17. V1 preflight passes without assigning a visual score");
assert(!FORBIDDEN_REFERENCE_CHROME.test(v1) && !FORBIDDEN_REFERENCE_CHROME.test(az), "18. content-safety chrome is not invented");

if (existsSync(path.join(evidence, "desktop-first-fold.png"))) {
  assert(SHOTS.every((name) => existsSync(path.join(evidence, name))), "19. real visitor captures exist");
  const capture = readJson(evidence, "capture-manifest.json");
  assert(capture?.mode === VISITOR_VISUAL_CAPTURE && String(capture?.previewPath ?? "").includes("candidate=PRESELL_STANDARD_V1"), "19b. captures used the experimental candidate preview");
}

assert(loadPremiumPresellDesignStandard().hash === EXPECTED_REFERENCE, "19c. official reference is unchanged");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && QUALITY_PROMPT_VERSION === "4" && methodologyThresholdsFrozen(), "19d. V2 rubric and prompt version 4 stay frozen");
assert(conservativeMinPair(80, 71) === 71, "20. official pair score stays the minimum of two valid runs");
assert(EXECUTION_54BH_MAX_AI_COST_USD === 0.3 && BH_LEDGER.maxUsd === 0.3 && EXECUTION_54BH_ID === "execution-54bh", "22. exclusive 54BH budget is US$0.30");
assert(
  budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bh", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BH_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bh", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BH_LEDGER).allowed,
  "22b. overspend is blocked before the call",
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
assert(!worse.updated, "23. a worse candidate is not selected as best known");

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
assert(blockedGate.status === "QUALITY_BLOCKED", "24. Global Quality Gate stays QUALITY_BLOCKED below 90/90/85");
assert(
  restoreProtectedPath("src/components/product-showcase/v4/page.tsx") &&
    restoreProtectedPath("src/components/presell/standard-v1-page.tsx") &&
    !restoreProtectedPath("src/app/premium-design-engine.css"),
  "25. rollback cannot delete the template implementation or the switcher",
);
assert(!canEnterHumanReviewQueue(blockedGate) && requestPresellHumanReview(blockedGate).ok === false, "26b. human review stays locked without QUALITY_APPROVED");
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(v1) && mapPresellStandardV1(lab).cta.enabled === false, "26. CTA stays blocked");
assert(integrity.publicationReadiness === "BLOCKED" && blockedGate.publicationUnlocked === false, "27. publication stays blocked");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && blockedGate.publicationUnlocked === false, "28. ads/publication remain blocked and thresholds stay 90/90/85");
assert(!/data-presell-standard="PRESELL_STANDARD_V1"/.test(def), "4b. data-presell-standard appears only when V1 is active");
assert(
  existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) && DESIGN_CHECKPOINT_FILES.length === 4,
  "4c. 54AZ checkpoint and file list remain",
);
assert(
  labScenarioKeys().every((key) => {
    const model = disableCommercialCta(buildV4Model(key)!);
    const html = renderToStaticMarkup(createElement(V4Page, { model, candidate: EXPERIMENTAL_CANDIDATE_ID }));
    return !FORBIDDEN_REFERENCE_CHROME.test(html) && mapPresellStandardV1(model).cta.enabled === false;
  }),
  "12b. multiproduct V1 stays generic",
);
assert(log.length === 40, "1c. HEAD is a real git commit");

const official = readJson(evidence, "official-v2-results.json");
if (official) {
  assert(official.finalDesktopVisualScore != null && official.finalMobileVisualScore != null && official.finalEditorialScore != null, "20b. independent evaluations produced official pair scores");
  const stability = readJson(evidence, "evaluator-stability.json");
  assert(Boolean(stability), "21. stability is recorded");
  const ledger = readJson(evidence, "budget-ledger.json");
  assert(Boolean(ledger) && Number(ledger?.spentUsd ?? 1) <= 0.3, "22c. recorded spend stays within the exclusive 54BH ledger");
  const gate = readJson(evidence, "quality-gate-decision.json");
  assert(gate?.publicationUnlocked === false && gate?.ctaEnabled === false && gate?.adsActivated === false, "28b. written gate never unlocks publication or ads");
  assert(gate?.humanReviewUnlocked === (gate?.status === "QUALITY_APPROVED"), "26c. human review unlock matches QUALITY_APPROVED only");
  if (gate?.status === "QUALITY_APPROVED") {
    assert(Number(gate.desktopVisualScore) >= 90 && Number(gate.mobileVisualScore) >= 90 && Number(gate.editorialScore) >= 85, "24b. QUALITY_APPROVED was not granted below 90/90/85");
  }
}

console.log(`PASS ${passed}`);
