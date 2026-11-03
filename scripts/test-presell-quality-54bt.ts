import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { mapPresellStandardV1 } from "../src/lib/presell-template/index.ts";
import { visualComparisonPromptV2 } from "../src/lib/presell-quality/visual-eval-v2.ts";
import { buildMultimodalEvaluatorPrompt } from "../src/lib/presell-quality/prompt.ts";
import {
  QUALITY_PROMPT_VERSION,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  EXECUTION_54BT_BUDGET,
  EXECUTION_54BT_MAX_AI_COST_USD,
  PREMIUM_VISUAL_EVALUATION_V2,
  VISUAL_EVAL_PROMPT_VERSION_V2,
  VISITOR_VISUAL_CAPTURE,
  evaluationIdentityOf,
  officialPromptVersionFields,
  compareEvaluationIdentities,
  conservativeMinPair,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  requestPresellHumanReview,
  methodologyThresholdsFrozen,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  FROZEN_IMPROVEMENT_EXECUTION_ID,
  readRendererCandidateSelection,
  readCommercialReuse,
  restoreProtectedPath,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BT_BUDGET as BT_LEDGER,
  EXECUTION_54BT_ID,
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
const evidence = path.join(ROOT, "data/evidence/execution-54bt-evaluator-alignment");
const bsEvidence = path.join(ROOT, "data/evidence/execution-54bs-official-v2-decision");
const brEvidence = path.join(ROOT, "data/evidence/execution-54br-editorial-visual-correction");
const biEvidence = path.join(ROOT, "data/evidence/execution-54bi-editorial-deduplication");
const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";
const BS_COMMIT = "7050029f6d7d7e6a385c9e71d252abd747768fde";
const BS_MESSAGE = "test(presell): preserve official V2 evaluation decision";
const BR_COMMIT = "f2aa4b1e3eec904e4c64c312bb3ddf1138901329";
const BI_COMMIT = "5f8d109b0b9ef358958f91431e3bb9dc78728543";
const VISUAL_PROMPT_HASH = "1a14704f4484d667a6bb272370f1a50f8b73100b75bf3b538fec64820af9c0e2";
const EDITORIAL_PROMPT_HASH = "2411d56f91ee2a55ebc014066f31b6918d9133820ba39234e7b35dfe773f3e11";

function readJson(dir: string, file: string): Record<string, unknown> | null {
  const absolute = path.join(dir, file);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
}

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

assert(execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim() === "feature/ai-presell-quality-gate", "1. branch is feature/ai-presell-quality-gate");
assert(execSync(`git cat-file -t ${BS_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "2. 54BS commit object remains recoverable");
assert(execSync(`git log -1 --format=%s ${BS_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === BS_MESSAGE, "3. 54BS commit message is preserved");
assert(execSync(`git cat-file -t ${BR_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "4. 54BR commit remains recoverable");
assert(execSync(`git cat-file -t ${BI_COMMIT}`, { cwd: ROOT, encoding: "utf8" }).trim() === "commit", "5. 54BI commit remains recoverable");

const checkpoint = JSON.parse(
  readFileSync(path.join(ROOT, "data/presell-quality/237/design-checkpoints/54bi-proven-baseline.json"), "utf8"),
) as { id?: string; sourceCommit?: string; createdAt?: string };
assert(
  checkpoint.id === "54bi-proven-baseline" && checkpoint.sourceCommit === BI_COMMIT && checkpoint.createdAt === "2026-10-30T15:07:59.506Z",
  "6. 54BI proven baseline checkpoint is not overwritten",
);

const liveBest = JSON.parse(readFileSync(path.join(ROOT, "data/presell-quality/237/best-candidate.json"), "utf8")) as {
  desktopVisualScore?: number;
  mobileVisualScore?: number;
  editorialScore?: number;
  identity?: { promptVersion?: string; rubricVersion?: string };
};
assert(liveBest.desktopVisualScore === 74 && liveBest.mobileVisualScore === 72 && liveBest.editorialScore === 74, "7. best-known scores remain 54BI 74/72/74");
assert(liveBest.identity?.promptVersion === "2" && liveBest.identity.rubricVersion === "2", "8. 54BI identity promptVersion 2 is the visual field, not QUALITY_PROMPT_VERSION");
assert(readRendererCandidateSelection(237).activeExecutionId === "54BI", "9. live store still selects 54BI");
assert(CONTROLLED_IMPROVEMENT_EXECUTION_ID === "54BR" && FROZEN_IMPROVEMENT_EXECUTION_ID === "54BI", "10. renderer ids stay 54BR experimental / 54BI frozen");

const versions = officialPromptVersionFields();
assert(
  QUALITY_PROMPT_VERSION === "4" &&
    VISUAL_EVAL_PROMPT_VERSION_V2 === "2" &&
    versions.editorialQualityPromptVersion === "4" &&
    versions.visualEvalPromptVersion === "2" &&
    versions.identityPromptVersion === "2" &&
    versions.fieldsAreDistinct === true &&
    versions.rootCause === "A",
  "11. versions 2 and 4 are distinct fields",
);

const visualPrompt = visualComparisonPromptV2();
const editorialPrompt = buildMultimodalEvaluatorPrompt({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  productContractVersion: 1,
  rendererVersion: "v4",
  screenshots: { desktop: null, mobile: null },
  pageStructure: {},
  renderedCopy: "",
  approvedFacts: [],
  evidenceReferences: [],
  approvedAssets: [],
  editorialConstraints: [],
  rubricVersion: "1",
  promptVersion: QUALITY_PROMPT_VERSION,
});
assert(sha(`${visualPrompt.system}\n${visualPrompt.userText}`) === VISUAL_PROMPT_HASH, "12. official visual prompt hash is unchanged");
assert(sha(`${editorialPrompt.system}\n${editorialPrompt.userText}`) === EDITORIAL_PROMPT_HASH, "13. official editorial prompt hash is unchanged");
assert(/Do not penalize the absence of those elements/.test(visualPrompt.system), "14. visual V2 prompt still forbids penalizing missing unapproved chrome");

const v2Identity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
  visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
  captureMode: VISITOR_VISUAL_CAPTURE,
});
assert(v2Identity.promptVersion === "2" && v2Identity.rubricVersion === "2", "15. V2 identity defaults to visual prompt/rubric 2, not editorial 4");

const comparable = compareEvaluationIdentities(
  evaluationIdentityOf({
    generationId: "lp-mvs7mja3-0d690e7c",
    promptVersion: "2",
    rubricVersion: "2",
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    captureMode: VISITOR_VISUAL_CAPTURE,
    referenceHash: EXPECTED_REFERENCE,
    model: "gpt-4o-mini",
    adminChromePresent: false,
  }),
  evaluationIdentityOf({
    generationId: "lp-mvs7mja3-0d690e7c",
    promptVersion: "2",
    rubricVersion: "2",
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    captureMode: VISITOR_VISUAL_CAPTURE,
    referenceHash: EXPECTED_REFERENCE,
    model: "gpt-4o-mini",
    adminChromePresent: false,
  }),
);
assert(comparable.status === "COMPARABLE", "16. 54BI and 54BR official V2 identities remain comparable");

assert(conservativeMinPair(74, 65) === 65, "17. official editorial score remains the lesser pair value");
assert(VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85 && methodologyThresholdsFrozen(), "18. official thresholds stay 90/90/85");

assert(
  EXECUTION_54BT_BUDGET.maxUsd === 0 &&
    EXECUTION_54BT_MAX_AI_COST_USD === 0 &&
    BT_LEDGER.maxUsd === 0 &&
    EXECUTION_54BT_ID === "execution-54bt" &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54bt", 0), { kind: "EVALUATION", reserveUsd: 0.01 }, BT_LEDGER).allowed,
  "19. exclusive 54BT budget is US$0.00 and blocks paid calls",
);

const lab = disableCommercialCta(buildV4Model("s1")!);
const br = renderToStaticMarkup(createElement(V4Page, { model: lab, candidate: "54BR" }));
assert(lab.hopSlot === "none" && /data-v4-cta="preview-disabled"/.test(br) && mapPresellStandardV1(lab).cta.enabled === false, "20. CTA stays blocked");
assert(restoreProtectedPath("src/components/presell/standard-v1-page.tsx"), "21. rollback cannot delete the template");

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(ROOT, "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 73,
  desktopVisualScore: 73,
  mobileVisualScore: 75,
  editorialScore: 65,
  evaluatorStability: "EVALUATOR_UNSTABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["below target"],
});
assert(blocked.status === "QUALITY_BLOCKED" && blocked.publicationUnlocked === false, "22. Global Quality Gate stays QUALITY_BLOCKED");
assert(!canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "23. ads and human review remain blocked");

const reuse = readCommercialReuse(237);
assert(Boolean(reuse?.approvedPackages.length === 3), "24. commercial reuse manifest still has three approved packages");
assert(
  Boolean(
    reuse &&
      reuse.approvedPackages.every((item) => ["$79", "$69", "$49"].includes(item.unitPrice)) &&
      reuse.items.some((item) => item.field === "rating" && item.reuse_status !== "APPROVED") &&
      reuse.items.some((item) => item.field === "testimonial" && item.reuse_status === "REJECTED") &&
      reuse.items.some((item) => item.field === "medical-claim" && item.reuse_status === "REJECTED"),
  ),
  "25. ratings stay unapproved; testimonials and medical claims stay rejected",
);

const bsOfficial = readJson(bsEvidence, "official-v2-results.json");
const biOfficial = readJson(biEvidence, "official-v2-results.json");
assert(existsSync(path.join(brEvidence, "execution-summary.md")), "26. 54BR evidence remains intact");
assert(bsOfficial?.finalDesktopVisualScore === 73 && bsOfficial.finalMobileVisualScore === 75 && bsOfficial.finalEditorialScore === 65, "27. 54BS official 73/75/65 remains");
assert(biOfficial?.finalDesktopVisualScore === 74 && biOfficial.finalMobileVisualScore === 72 && biOfficial.finalEditorialScore === 74, "28. 54BI official 74/72/74 remains");
assert(bsOfficial?.qualityPromptVersion === "4" && bsOfficial.visualPromptVersion === "2", "29. 54BS evidence already labeled both prompt versions");

const required = [
  "execution-summary.md",
  "git-audit.json",
  "prompt-version-audit.json",
  "editorial-variance-analysis.json",
  "historical-comparability.json",
  "premium-reference-gap-analysis.json",
  "commercial-content-status.json",
  "visual-readiness.json",
  "commercial-content-readiness.json",
  "quality-gate-preservation.json",
  "top-three-interventions.json",
  "execution-54bu-final-corrections.md",
  "regression-results.json",
  "remaining-blockers.json",
];
assert(required.every((file) => existsSync(path.join(evidence, file))), "30. 54BT evidence files exist");

const promptAudit = readJson(evidence, "prompt-version-audit.json");
assert(promptAudit?.classification === "A" && promptAudit.COMPARABILITY_STATUS === "COMPARABLE", "31. prompt audit classifies 2 vs 4 as distinct fields");
const variance = readJson(evidence, "editorial-variance-analysis.json");
assert(variance?.cause === "MODEL_OUTPUT_VARIATION", "32. editorial variance is classified as model output variation");
const visualReady = readJson(evidence, "visual-readiness.json");
const commercialReady = readJson(evidence, "commercial-content-readiness.json");
const gate = readJson(evidence, "quality-gate-preservation.json");
assert(visualReady?.VISUAL_REVIEW_READY === "YES" && commercialReady?.COMMERCIAL_CONTENT_READY === "YES" && gate?.GLOBAL_PRESELL_QUALITY_GATE === "QUALITY_BLOCKED", "33. visual/commercial readiness stay separate from the official gate");
assert(gate?.HUMAN_REVIEW_UNLOCKED === false && gate.ctaEnabled === false && gate.publicationUnlocked === false, "34. publication, ads, and checkout stay blocked");
const plan = readFileSync(path.join(evidence, "execution-54bu-final-corrections.md"), "utf8");
assert(/BT-01/.test(plan) && /BT-02/.test(plan) && /BT-03/.test(plan) && !/new agent/i.test(plan), "35. 54BU plan contains only the three confirmed corrections");

console.log(`PASS ${passed}`);
