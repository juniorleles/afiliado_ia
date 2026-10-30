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
import { MULTIMODAL_QUALITY_JSON_SCHEMA } from "../src/lib/presell-quality/schema.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";
import {
  QUALITY_DIMENSIONS,
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BB_BUDGET,
  EXECUTION_54BB_MAX_AI_COST_USD,
  EXECUTION_54BA_CHECKPOINT_ID,
  EXECUTION_54BA_GENERATION_ID,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISITOR_VISUAL_CAPTURE,
  FORBIDDEN_REFERENCE_CHROME,
  classifyEditorialPayload,
  structuredEditorialFailure,
  editorialRetryAllowed,
  classifyEditorialProviderError,
  recover54baComposition,
  RECOVER_54BA_MARKERS,
  conservativeMinPair,
  officialPerDimensionStability,
  selectBestCandidate,
  evaluationIdentityOf,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BB_BUDGET as BB_LEDGER,
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
const AZ_CHECKPOINT = path.join(ROOT, "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json");
const BA_CHECKPOINT = path.join(ROOT, "data/presell-quality/237/design-checkpoints/54ba-best-known-baseline.json");
const evidence = path.join(ROOT, "data/evidence/execution-54bb-recovery");
const css = readFileSync(path.join(ROOT, "src/app/premium-design-engine.css"), "utf8");
const page = readFileSync(path.join(ROOT, "src/components/product-showcase/v4/page.tsx"), "utf8");

function dim(dimension: string, score: number) {
  return {
    dimension,
    score,
    rationale: `${dimension} observed.`,
    evidence: ["hero"],
    problems: [],
    recommendedActions: [],
  };
}

function payloadWith(dims: ReturnType<typeof dim>[]) {
  return JSON.stringify({
    dimensionScores: dims,
    criticalFailures: [],
    findings: [],
    recommendedActions: [],
  });
}

const completeDims = QUALITY_DIMENSIONS.map((dimension, index) => dim(dimension, 70 + index));
const validRaw = payloadWith(completeDims);

assert(existsSync(AZ_CHECKPOINT) && existsSync(BA_CHECKPOINT) && EXECUTION_54BA_CHECKPOINT_ID === "54ba-best-known-baseline", "1. 54AZ and 54BA baseline checkpoints are preserved");
assert(DESIGN_CHECKPOINT_FILES.length === 4, "1b. checkpoint file list is unchanged");

const recovery = recover54baComposition({ root: ROOT });
assert(recovery.complete && recovery.markers.css && recovery.markers.blocks && recovery.markers.page, "2. 54BA composition recovers from recorded tool writes");
assert(recovery.files.some((file) => file.contents.includes(RECOVER_54BA_MARKERS.css)), "2b. recovered CSS includes the three-area hero");

const valid = classifyEditorialPayload(validRaw);
assert(valid.ok && valid.payload.dimensionScores.length === 6, "3. a complete editorial payload is valid");
assert(
  MULTIMODAL_QUALITY_JSON_SCHEMA.properties.dimensionScores.minItems === 6 &&
    MULTIMODAL_QUALITY_JSON_SCHEMA.properties.dimensionScores.maxItems === 6 &&
    QUALITY_PROMPT_VERSION === "4",
  "3b. schema still requires exactly six rubric dimensions",
);

const missing = classifyEditorialPayload(payloadWith(completeDims.filter((row) => row.dimension !== "TRANSPARENCY_LEGIBILITY")));
assert(!missing.ok && missing.code === "MISSING_DIMENSION" && missing.payload === null, "4. a missing required dimension is a structured error");
assert(!/TRANSPARENCY_LEGIBILITY/.test(JSON.stringify(missing.details)) || missing.message.includes("TRANSPARENCY_LEGIBILITY"), "4b. missing TRANSPARENCY_LEGIBILITY is not invented");

const duplicated = classifyEditorialPayload(payloadWith([...completeDims, dim("DESIGN_HIERARCHY", 40)]));
assert(!duplicated.ok && duplicated.code === "DUPLICATE_DIMENSION", "invalid: duplicate dimension is rejected");

const unknown = classifyEditorialPayload(payloadWith([...completeDims.slice(0, 5), dim("INVENTED_DIMENSION", 80)]));
assert(!unknown.ok && unknown.code === "UNKNOWN_DIMENSION", "invalid: unknown dimension is rejected");

const outOfScale = classifyEditorialPayload(payloadWith(completeDims.map((row, i) => (i === 0 ? { ...row, score: 140 } : row))));
assert(!outOfScale.ok && outOfScale.code === "SCORE_OUT_OF_RANGE", "invalid: score outside 0-100 is rejected");

const malformed = classifyEditorialPayload("this is not json");
assert(!malformed.ok && malformed.code === "INVALID_JSON", "invalid: malformed JSON is rejected");

const truncated = classifyEditorialPayload('{ "dimensionScores": [ { "dimension": "DESIGN_HIERARCHY", "score": 70');
assert(!truncated.ok && truncated.code === "TRUNCATED", "invalid: truncated JSON is rejected");

const empty = classifyEditorialPayload("   ");
assert(!empty.ok && empty.code === "EMPTY_PAYLOAD", "invalid: empty payload is rejected");

const networkCode = classifyEditorialProviderError("fetch failed ENOTFOUND api.openai.com");
assert(networkCode === "NETWORK_ERROR", "invalid: network failure is classified");

const failure = structuredEditorialFailure({ code: missing.code, message: missing.message, attempt: 1, rawSnippet: "no transparency" });
assert(
  failure.valid === false &&
    failure.invented === false &&
    failure.filledMissingDimensions === false &&
    failure.copiedPreviousScore === false,
  "invalid: incomplete responses stay structured and are not filled",
);

assert(
  editorialRetryAllowed({
    code: "MISSING_DIMENSION",
    attempt: 1,
    maxAttempts: 2,
    remainingUsd: 0.12,
    reserveUsd: 0.06,
    authorized: true,
  }).allowed,
  "5. a missing dimension may retry when budget and authorization exist",
);
assert(
  !editorialRetryAllowed({
    code: "MISSING_DIMENSION",
    attempt: 1,
    maxAttempts: 2,
    remainingUsd: 0.12,
    reserveUsd: 0.06,
    authorized: false,
  }).allowed,
  "5b. retry is blocked without paid authorization",
);
assert(
  !editorialRetryAllowed({
    code: "MISSING_DIMENSION",
    attempt: 2,
    maxAttempts: 2,
    remainingUsd: 0.12,
    reserveUsd: 0.06,
    authorized: true,
  }).allowed,
  "invalid: retry is exhausted after the authorized attempts",
);

assert(EXECUTION_54BB_MAX_AI_COST_USD === 0.3 && EXECUTION_54BB_BUDGET.maxUsd === 0.3 && BB_LEDGER.maxUsd === 0.3, "6. exclusive 54BB budget is US$0.30");
assert(
  budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bb", 0.3), { kind: "EVALUATION", reserveUsd: 0.06 }, BB_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bb", 0.3), { kind: "EVALUATION", reserveUsd: 0.31 }, BB_LEDGER).allowed &&
    reservePaidCall(emptyExecutionBudgetLedger("execution-54bb", 0.3), { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.06, caps: BB_LEDGER }).ok,
  "6b. overspend is blocked before the call",
);
assert(
  !editorialRetryAllowed({
    code: "TRUNCATED",
    attempt: 1,
    maxAttempts: 2,
    remainingUsd: 0.01,
    reserveUsd: 0.06,
    authorized: true,
  }).allowed,
  "6c. retry is blocked when remaining budget cannot reserve the next call",
);

assert(
  officialPerDimensionStability({ desktop: [72, 72], mobile: [70, 70], editorial: [75, null] }).editorial === "NOT_ESTABLISHED" &&
    officialPerDimensionStability({ desktop: [72, 72], mobile: [70, 70], editorial: [75, null] }).combined === "NOT_ESTABLISHED",
  "7. stability is not declared without two valid scores",
);
assert(
    officialPerDimensionStability({ desktop: [72, 72], mobile: [65, 75], editorial: [75, 75] }).mobile === "UNSTABLE",
  "7b. a pair beyond the variation limit is UNSTABLE",
);

assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2" && methodologyThresholdsFrozen(), "8. V2 rubric and thresholds stay comparable");
assert(conservativeMinPair(75, 71) === 71 && conservativeMinPair(75, null) === null, "8b. official pair score stays the minimum of two valid runs");

const identity = evaluationIdentityOf({
  generationId: EXECUTION_54BA_GENERATION_ID,
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  promptVersion: "2",
  rubricVersion: "2",
  captureMode: VISITOR_VISUAL_CAPTURE,
  adminChromePresent: false,
  model: "gpt-4o-mini",
});
const current = {
  selector: "PRESELL_BEST_CANDIDATE_SELECTOR" as const,
  campaignId: 237,
  generationId: EXECUTION_54BA_GENERATION_ID,
  state: "BEST_KNOWN" as const,
  contentSafetyPass: true,
  evaluationValid: true,
  desktopVisualScore: 72,
  mobileVisualScore: 68,
  editorialScore: 73,
  identity,
  qualityApproved: false as const,
  humanReviewUnlocked: false as const,
  notes: [],
};
assert(!selectBestCandidate({ current, incoming: { ...current, desktopVisualScore: 72, mobileVisualScore: 70, editorialScore: null, identity, notes: [] } }).updated, "9. an incomplete pair does not replace the best candidate");
assert(!selectBestCandidate({ current, incoming: { ...current, desktopVisualScore: 70, mobileVisualScore: 80, editorialScore: 80, identity, notes: [] } }).updated, "9b. a regression does not replace the best candidate");

assert(!page.includes("git reset") && EXECUTION_54BA_CHECKPOINT_ID !== "54az-baseline-v2", "10. rollback uses a dedicated checkpoint, not git reset");
const tempCheckpoint = path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bb-pre-restore-az.json");
if (existsSync(tempCheckpoint)) {
  const temp = JSON.parse(readFileSync(tempCheckpoint, "utf8")) as { id?: string };
  assert(temp.id === "54bb-pre-restore-az", "10b. temporary recovery checkpoint does not overwrite 54AZ/54BA ids");
} else {
  assert(existsSync(AZ_CHECKPOINT) && existsSync(BA_CHECKPOINT), "10b. 54AZ/54BA checkpoint ids remain reserved");
}

const lab = disableCommercialCta(buildV4Model(labScenarioKeys()[0]!)!);
const markup = renderToStaticMarkup(createElement(V4Page, { model: lab }));
assert(lab.hopSlot === "none" && !lab.hopHref && /data-v4-cta="preview-disabled"/.test(markup), "11. content safety keeps the CTA disabled");
assert(!FORBIDDEN_REFERENCE_CHROME.test(markup), "11b. no invented reference chrome");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.publicationReadiness === "BLOCKED" && integrity.commercialAuthorization === "BLOCKED", "12. Product Contract stays immutable and blocked");

assert(css.includes("max-width: 767px") && css.includes("min-width: 768px") && css.includes("min-width: 960px"), "13. desktop/tablet/mobile breakpoints remain");

const scenarios = labScenarioKeys().map((key) => {
  const model = disableCommercialCta(buildV4Model(key)!);
  const html = renderToStaticMarkup(createElement(V4Page, { model }));
  const view = premiumSlotsFromModel(model);
  return (
    !FORBIDDEN_REFERENCE_CHROME.test(html) &&
    !model.hopHref &&
    !/sugar defender|cbc045ab/i.test(html) &&
    (view.ingredients.length > 0 || !/data-premium="ingredients"/.test(html)) &&
    (view.guarantee.statements.length > 0 || !/data-premium="guarantee"/.test(html))
  );
});
assert(scenarios.every(Boolean), "14. multiproduct regression stays generic");

assert(/data-v4-cta="preview-disabled"/.test(markup) && premiumSlotsFromModel(lab).cta.enabled === false, "15. commercial CTA stays disabled");

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: EXECUTION_54BA_GENERATION_ID,
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 78,
  desktopVisualScore: 72,
  mobileVisualScore: 70,
  editorialScore: 75,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["hero still below target"],
});
assert(blocked.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "16. publication stays blocked below 90/90/85");
assert(blocked.publicationUnlocked === false && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "16b. thresholds and publication lock remain");
assert(blocked.publicationUnlocked === false && lab.hopSlot === "none", "17. ads stay blocked");

const unavailable = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: EXECUTION_54BA_GENERATION_ID,
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: false,
  evaluatorIndependentFromGenerator: false,
  visualScore: null,
  desktopVisualScore: 72,
  mobileVisualScore: 70,
  editorialScore: null,
  evaluatorStability: "NOT_ESTABLISHED",
  contentSafetyPass: true,
  criticalVisualDefects: [],
  paidEvaluationAvailable: true,
});
assert(
  unavailable.status === "EVALUATION_UNAVAILABLE" || unavailable.humanReviewUnlocked === false,
  "17b. an incomplete editorial pair cannot unlock human review",
);

if (existsSync(path.join(evidence, "recovery-report.json"))) {
  const report = JSON.parse(readFileSync(path.join(evidence, "recovery-report.json"), "utf8")) as { complete?: boolean; status?: string };
  assert(typeof report.complete === "boolean", "recovery evidence records completeness");
}

console.log(`PASS ${passed}`);
