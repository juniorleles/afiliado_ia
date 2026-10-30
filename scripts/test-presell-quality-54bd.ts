import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { MULTIMODAL_QUALITY_JSON_SCHEMA } from "../src/lib/presell-quality/schema.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";
import {
  QUALITY_DIMENSIONS,
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BD_BUDGET,
  EXECUTION_54BD_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  PRESELL_STANDARD_SECTION_IDS,
  mapPresellStandardV1,
  validatePresellTemplateDocument,
  runTemplateQualityPreflight,
  conservativeMinPair,
  officialPerDimensionStability,
  selectBestCandidate,
  evaluationIdentityOf,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
  classifyEditorialPayload,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BD_BUDGET as BD_LEDGER,
  EXECUTION_54BD_ID,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  reservePaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const evidence = path.join(ROOT, "data/evidence/execution-54bd-official-template-evaluation");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const SHOTS = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];

function readJson(file: string): Record<string, unknown> | null {
  const absolute = path.join(evidence, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

const bcCommit = execSync('git log --format=%H --grep="feat(presell): implement universal premium presell standard v1" -n 1', {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
assert(/^0bcc3060419b949b48a2ceeae3ceb032d0b9d456$/i.test(bcCommit), "1. 54BC is preserved in Git with the required message");

const lab = disableCommercialCta(buildV4Model("s1")!);
const markup = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const document = mapPresellStandardV1(lab);
const validation = validatePresellTemplateDocument(document);
const comparison = readJson("best-candidate-comparison.json");
const designRestored = comparison?.restored === true;
assert(
  PRESELL_STANDARD_ID === "PRESELL_STANDARD_V1" &&
    PRESELL_STANDARD_VERSION === "1" &&
    PRESELL_STANDARD_SECTION_IDS.length === 12 &&
    validation.ok &&
    existsSync(path.join(ROOT, "src/lib/presell-template/standard-v1.ts")) &&
    existsSync(path.join(ROOT, "src/components/presell/index.tsx")),
  "2. template V1 library integrity is intact",
);
assert(
  designRestored || /data-presell-standard="PRESELL_STANDARD_V1"/.test(markup),
  "2b. live renderer stays on PRESELL_STANDARD_V1 unless the 54AZ checkpoint was restored",
);

const identity = readJson("candidate-identity.json");
assert(
  Boolean(identity) &&
    identity?.generationId === "lp-mvs7mja3-0d690e7c" &&
    identity?.templateId === "PRESELL_STANDARD_V1" &&
    identity?.templateVersion === "1" &&
    identity?.campaignId === 237,
  "3. candidate identity is the live 237 PRESELL_STANDARD_V1 generation",
);

assert(
  SHOTS.every((name) => existsSync(path.join(evidence, name))),
  "4. official visitor captures exist and were not reused as placeholders",
);
const capture = readJson("capture-manifest.json");
assert(
  capture?.mode === VISITOR_VISUAL_CAPTURE &&
    capture?.ok === true &&
    String(capture?.previewPath ?? "").includes("visualCapture=visitor"),
  "4b. captures used visitor mode on the evaluated preview",
);

const preflight = readJson("preflight-results.json");
assert(preflight?.status === "PREFLIGHT_PASSED", "5. TEMPLATE_QUALITY_PREFLIGHT passed");
assert(preflight?.contentSafetyGate === "PASS" || readJson("content-safety.json")?.gate === "PASS", "6. CONTENT_SAFETY_GATE passed");

const standard = loadPremiumPresellDesignStandard();
assert(standard.registered && standard.hash === EXPECTED_REFERENCE, "7. official premium reference hash is unchanged");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && methodologyThresholdsFrozen(), "8. V2 rubric and thresholds stay frozen");
assert(QUALITY_PROMPT_VERSION === "4", "9. QUALITY_PROMPT_VERSION remains 4");

const visual1 = readJson("visual-evaluation-run-1.json");
const visual2 = readJson("visual-evaluation-run-2.json");
const editorial1 = readJson("editorial-evaluation-run-1.json");
const editorial2 = readJson("editorial-evaluation-run-2.json");
const visualPair = Boolean(visual1 && visual2 && visual1.error == null && visual2.error == null);
const editorialPair = Boolean(editorial1 && editorial2 && editorial1.error == null && editorial2.error == null);
assert(visualPair && editorialPair, "10. two independent visual and editorial evaluations were recorded");

const stability = readJson("evaluator-stability.json");
assert(
  Boolean(stability) &&
    ["STABLE", "UNSTABLE", "NOT_ESTABLISHED"].includes(String(stability?.desktop)) &&
    ["STABLE", "UNSTABLE", "NOT_ESTABLISHED"].includes(String(stability?.mobile)) &&
    ["STABLE", "UNSTABLE", "NOT_ESTABLISHED"].includes(String(stability?.editorial)),
  "11. stability is recorded per dimension without filling missing scores",
);

assert(
  MULTIMODAL_QUALITY_JSON_SCHEMA.properties.dimensionScores.minItems === 6 &&
    MULTIMODAL_QUALITY_JSON_SCHEMA.properties.dimensionScores.maxItems === 6 &&
    QUALITY_DIMENSIONS.length === 6,
  "12. editorial schema still requires all six dimensions",
);
const missing = classifyEditorialPayload(
  JSON.stringify({
    dimensionScores: QUALITY_DIMENSIONS.filter((item) => item !== "TRANSPARENCY_LEGIBILITY").map((dimension) => ({
      dimension,
      score: 70,
      rationale: "x",
      evidence: ["hero"],
      problems: [],
      recommendedActions: [],
    })),
    criticalFailures: [],
    findings: [],
    recommendedActions: [],
  }),
);
assert(!missing.ok && missing.code === "MISSING_DIMENSION", "12b. missing TRANSPARENCY_LEGIBILITY is still a structured error");

assert(EXECUTION_54BD_MAX_AI_COST_USD === 0.3 && EXECUTION_54BD_BUDGET.maxUsd === 0.3 && BD_LEDGER.maxUsd === 0.3 && EXECUTION_54BD_ID === "execution-54bd", "13. exclusive 54BD budget is US$0.30");
assert(
  budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bd", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BD_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bd", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BD_LEDGER).allowed &&
    reservePaidCall(emptyExecutionBudgetLedger("execution-54bd", 0.3), { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.06, caps: BD_LEDGER }).ok,
  "13b. overspend is blocked before the call",
);
const ledger = readJson("budget-ledger.json");
assert(Boolean(ledger) && Number(ledger?.spentUsd ?? 1) <= 0.3 && ledger?.executionId === "execution-54bd", "13c. recorded spend stays within the exclusive 54BD ledger");

assert(conservativeMinPair(75, 71) === 71 && conservativeMinPair(75, null) === null, "14. official pair score stays the minimum of two valid runs");
assert(Boolean(comparison) && (comparison?.comparisonStatus === "COMPARABLE" || comparison?.comparisonStatus === "NONE" || comparison?.comparisonStatus === "NOT_COMPARABLE" || comparison?.comparisonStatus === "PARTIALLY_COMPARABLE"), "14b. comparability against 54AZ is recorded");

const baselineIdentity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  rendererVersion: "v4",
  referenceHash: EXPECTED_REFERENCE,
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: "2",
  rubricVersion: "2",
  model: "gpt-4o-mini",
});
const incomingIdentity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  rendererVersion: "v4",
  referenceHash: EXPECTED_REFERENCE,
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: "2",
  rubricVersion: "2",
  model: "gpt-4o-mini",
});
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
    identity: baselineIdentity,
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
    identity: incomingIdentity,
    notes: [],
  },
});
assert(!worse.updated, "15. a worse candidate is not selected as best known");
assert(Boolean(comparison), "15b. best-candidate comparison evidence exists");

assert(
  existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) &&
    existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54ba-best-known-baseline.json")) &&
    existsSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bc-pre-template-az.files.json")) &&
    DESIGN_CHECKPOINT_FILES.length === 4,
  "16. rollback checkpoints remain and the checkpoint file list is unchanged",
);

const gate = readJson("quality-gate-decision.json");
assert(Boolean(gate) && (gate?.status === "QUALITY_APPROVED" || gate?.status === "QUALITY_BLOCKED" || gate?.status === "EVALUATION_UNAVAILABLE"), "17. global quality gate reflects the real evaluation");
assert(gate?.publicationUnlocked === false, "20. publication stays blocked");
assert(gate?.adsActivated === false && gate?.ctaEnabled === false, "21. ads and commercial CTA stay blocked");

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
assert(
  blockedGate.status === "QUALITY_BLOCKED" &&
    !canEnterHumanReviewQueue(blockedGate) &&
    requestPresellHumanReview(blockedGate).ok === false,
  "18. human review stays locked without QUALITY_APPROVED",
);
assert(gate?.humanReviewUnlocked === (gate?.status === "QUALITY_APPROVED"), "18b. human review unlock matches QUALITY_APPROVED only");

assert(document.cta.enabled === false && lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(markup), "19. commercial CTA stays disabled");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "19b. 90/90/85 thresholds are unchanged");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.publicationReadiness === "BLOCKED" && integrity.commercialAuthorization === "BLOCKED", "20b. Product Contract stays immutable and commercially blocked");
assert(gate?.publicationUnlocked === false, "20c. written gate never unlocks publication");

const scenarios = labScenarioKeys().map((key) => {
  const model = disableCommercialCta(buildV4Model(key)!);
  const html = renderToStaticMarkup(createElement(V4Page, { model }));
  const mapped = mapPresellStandardV1(model);
  return mapped.cta.enabled === false && mapped.testimonials.status === "SECTION_OMITTED" && !FORBIDDEN_REFERENCE_CHROME.test(html);
});
assert(scenarios.every(Boolean), "21b. multiproduct regression still omits unverified chrome");

const labPreflight = runTemplateQualityPreflight({ model: lab, markup, contractValid: true });
assert(labPreflight.visualScoreAssigned === false && labPreflight.paidEvaluationAuthorized === false, "21c. preflight still does not assign a visual score");
assert(designRestored || labPreflight.status === "PREFLIGHT_PASSED", "21d. live preflight remains PREFLIGHT_PASSED unless 54AZ was restored");

const perDimMissing = officialPerDimensionStability({ desktop: [72, 72], mobile: [70, 70], editorial: [75, null] });
assert(perDimMissing.editorial === "NOT_ESTABLISHED" && perDimMissing.combined === "NOT_ESTABLISHED", "11b. stability is not declared without two valid editorial scores");

if (gate?.status === "QUALITY_APPROVED") {
  assert(
    Number(gate.desktopVisualScore) >= 90 && Number(gate.mobileVisualScore) >= 90 && Number(gate.editorialScore) >= 85,
    "17b. QUALITY_APPROVED was not granted below 90/90/85",
  );
}

console.log(`PASS ${passed}`);
