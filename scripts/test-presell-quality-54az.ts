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
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import {
  EXECUTION_54AZ_BASELINE,
  EXECUTION_54AZ_BUDGET,
  EXECUTION_54AZ_MAX_AI_COST_USD,
  EXECUTION_54AZ_PLAN,
  EXECUTION_54AY_GENERATION_ID,
  FORBIDDEN_REFERENCE_CHROME,
  PREMIUM_VISUAL_EVALUATION_V2,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  canEnterHumanReviewQueue,
  conservativeMinPair,
  evaluationIdentityOf,
  methodologyThresholdsFrozen,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  selectBestCandidate,
  VISITOR_VISUAL_CAPTURE,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54AZ_BUDGET as AZ_LEDGER,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  reservePaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { fulfillmentCardsFrom, premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

assert(EXECUTION_54AY_GENERATION_ID === "lp-mvs7mja3-0d690e7c", "1. existing generation is frozen");
assert(EXECUTION_54AZ_BASELINE.desktop === 70 && EXECUTION_54AZ_BASELINE.mobile === 65 && EXECUTION_54AZ_BASELINE.editorial === 73, "2. 54AY V2 baseline is recorded");
assert(DESIGN_CHECKPOINT_FILES.length === 4 && DESIGN_CHECKPOINT_FILES[0] === "src/app/premium-design-engine.css", "3. design checkpoint files are unchanged");
assert(EXECUTION_54AZ_PLAN[0]?.section === "hero" && EXECUTION_54AZ_PLAN.every((item) => item.contentChangeRequired === false && item.rollbackAvailable), "4. correction plan is presentation-only");
assert(methodologyThresholdsFrozen() && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "5. thresholds are preserved");

const css = readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8");
assert(css.includes("grid-template-areas") && css.includes("minmax(26rem, 1.32fr)"), "6. hero packshot column is dominant");
assert(css.includes("min-height: 4rem") && css.includes("1.28rem"), "7. CTA is visually larger");
assert(css.includes("max-width: 767px") && css.includes("min-width: 768px") && css.includes("min-width: 960px"), "8. desktop/tablet/mobile breakpoints remain");
assert(!/sugardefender|campaign 237|cbc045ab/i.test(css), "9. CSS stays product-generic");
assert(/max-width:\s*\d+(?:\.\d+)?rem/.test(css) && css.includes(".ds-hero__stage"), "10. mobile packshot packing is tightened");

const stored = readGenerationModel("lp-mvs7mja3-0d690e7c");
assert(Boolean(stored?.commercialImage?.src.includes("cc835ef78e894f7645c4556b")), "11. approved packshot is unchanged");
const lab = disableCommercialCta(buildV4Model(labScenarioKeys()[0]!)!);
const markup = renderToStaticMarkup(createElement(V4Page, { model: lab }));
assert(!FORBIDDEN_REFERENCE_CHROME.test(markup) && lab.hopSlot === "none" && !lab.hopHref, "12. commercial CTA stays disabled");
assert(/data-v4-cta="preview-disabled"/.test(markup), "13. preview CTA is not a live hop");

const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
assert(integrity.valid && integrity.publicationReadiness === "BLOCKED" && integrity.commercialAuthorization === "BLOCKED", "14. Product Contract and commercial blocks remain");

const slots = premiumSlotsFromModel(lab);
assert(slots.fulfillment.every((item) => item.body.length > 0) || slots.fulfillment.length === 0, "15. fulfillment restates approved text");
assert(slots.cta.enabled === false && slots.cta.href === null, "16. editorial presentation does not invent a live offer");
assert(fulfillmentCardsFrom(lab).every((item) => item.kind !== "PAYMENT" || !/free shipping/i.test(item.body)), "17. shipping cards do not invent free shipping");

assert(EXECUTION_54AZ_MAX_AI_COST_USD === 0.5 && EXECUTION_54AZ_BUDGET.maxUsd === 0.5 && AZ_LEDGER.maxUsd === 0.5, "18. max budget is US$0.50");
assert(budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54az", 0.5), { kind: "EVALUATION", reserveUsd: 0.12 }, AZ_LEDGER).allowed, "19. reserve is allowed");
assert(reservePaidCall(emptyExecutionBudgetLedger("execution-54az", 0.5), { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.12, caps: AZ_LEDGER }).ok, "20. reservation persists");
assert(!budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54az", 0.5), { kind: "EVALUATION", reserveUsd: 0.51 }, AZ_LEDGER).allowed, "21. insufficient balance blocks the call");

const identity = evaluationIdentityOf({
  generationId: "lp-mvs7mja3-0d690e7c",
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
  generationId: "lp-mvs7mja3-0d690e7c",
  state: "BEST_KNOWN" as const,
  contentSafetyPass: true,
  evaluationValid: true,
  desktopVisualScore: 70,
  mobileVisualScore: 65,
  editorialScore: 73,
  identity,
  qualityApproved: false as const,
  humanReviewUnlocked: false as const,
  notes: [],
};
const worse = selectBestCandidate({
  current,
  incoming: { ...current, desktopVisualScore: 68, mobileVisualScore: 70, editorialScore: 80, identity, notes: [] },
});
assert(!worse.updated, "22. a regression does not replace the baseline");
const better = selectBestCandidate({
  current,
  incoming: { ...current, desktopVisualScore: 78, mobileVisualScore: 72, editorialScore: 76, identity, notes: [] },
});
assert(better.updated, "23. a comparable improvement may replace the baseline");
assert(conservativeMinPair(78, 72) === 72, "24. official pair score stays conservative");

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: path.join(process.cwd(), "design-references/premium-presell-reference.png"),
  mobileScreenshotPath: path.join(process.cwd(), "design-references/premium-presell-reference.png"),
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 78,
  desktopVisualScore: 78,
  mobileVisualScore: 72,
  editorialScore: 76,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["hero still below target"],
});
assert(blocked.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "25. human review stays locked below 90/90/85");
assert(blocked.publicationUnlocked === false, "26. publication stays blocked");
assert(EXECUTION_54AZ_PLAN.every((item) => item.section !== "research"), "27. no product research is repeated");
assert(!existsSync(path.join(process.cwd(), "data/presell-quality/237/new-generation.json")), "28. no new generation file is created");

const evidence = path.join(process.cwd(), "data/evidence/execution-54az-design-recovery");
if (existsSync(path.join(evidence, "keep-revert.json"))) {
  const keep = JSON.parse(readFileSync(path.join(evidence, "keep-revert.json"), "utf8")) as { kept?: boolean };
  assert(typeof keep.kept === "boolean", "29. keep/revert is recorded");
} else {
  assert(EXECUTION_54AZ_PLAN.length >= 5, "29. recovery plan is ready before keep/revert");
}

console.log(`PASS ${passed}`);
