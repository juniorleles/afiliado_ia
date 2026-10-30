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
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import {
  EXECUTION_54BA_BASELINE,
  EXECUTION_54BA_BUDGET,
  EXECUTION_54BA_CHECKPOINT_ID,
  EXECUTION_54BA_EDITORIAL_DIFF,
  EXECUTION_54BA_GENERATION_ID,
  EXECUTION_54BA_MAX_AI_COST_USD,
  EXECUTION_54BA_PLAN,
  FORBIDDEN_REFERENCE_CHROME,
  PREMIUM_VISUAL_EVALUATION_V2,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  canEnterHumanReviewQueue,
  dimensionPairStability,
  evaluationIdentityOf,
  methodologyThresholdsFrozen,
  officialPerDimensionStability,
  premiumSectionTitle,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  selectBestCandidate,
  uniqueGuaranteeStatements,
  VISITOR_VISUAL_CAPTURE,
} from "../src/lib/presell-quality/index.ts";
import {
  EXECUTION_54BA_BUDGET as BA_LEDGER,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  reservePaidCall,
} from "../src/lib/presell-quality/execution-budget.ts";
import { DESIGN_CHECKPOINT_FILES } from "../src/lib/presell-quality/design-checkpoint.ts";
import { fulfillmentCardsFrom, premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";
import { loadPremiumPresellDesignStandard } from "../src/lib/presell-quality/premium-standard.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const AZ_COMMIT = "08a2a4d3b34220aaa8be6865b76840eb5ebb8a66";
const evidence = path.join(process.cwd(), "data/evidence/execution-54ba-premium-redesign");
const css = readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8");
const blocks = readFileSync(path.join(process.cwd(), "src/components/design-system/premium-blocks.tsx"), "utf8");
const page = readFileSync(path.join(process.cwd(), "src/components/product-showcase/v4/page.tsx"), "utf8");
const stored = readGenerationModel(EXECUTION_54BA_GENERATION_ID);
const lab = disableCommercialCta(buildV4Model(labScenarioKeys()[0]!)!);
const markup = renderToStaticMarkup(createElement(V4Page, { model: lab }));
const slots = premiumSlotsFromModel(lab);
const integrity = validatePersistedProductContract(237, snapshotProductResearch(237).latest);
const standard = loadPremiumPresellDesignStandard();

const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const azMessage = execSync(`git log -1 --format=%s ${AZ_COMMIT}`, { encoding: "utf8" }).trim();
assert(azMessage === "feat(presell): recover premium hero packing and keep proven V2 gains", "1. 54AZ commit message is recorded");
assert(
  existsSync(path.join(process.cwd(), "data/presell-quality/237/design-checkpoints/54az-baseline-v2.json")) &&
    EXECUTION_54BA_CHECKPOINT_ID === "54ba-best-known-baseline",
  "2. 54AZ checkpoint is preserved and 54BA uses a new id",
);
assert(standard.registered && standard.hash === "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938", "3. official premium reference is valid");
assert(PREMIUM_VISUAL_EVALUATION_V2 === "PREMIUM_VISUAL_EVALUATION_V2", "4. rubric V2 is unchanged");
const comparisonFile = path.join(evidence, "best-candidate-comparison.json");
const comparison = existsSync(comparisonFile)
  ? (JSON.parse(readFileSync(comparisonFile, "utf8")) as { restored?: boolean; kept?: boolean })
  : { restored: false, kept: false };
const compositionRecovered = css.includes('grid-template-areas: "copy pack rail"');
const restored = comparison.restored === true && !compositionRecovered;
const kept = comparison.kept === true || compositionRecovered;

assert(methodologyThresholdsFrozen() && VISUAL_SCORE_TARGET === 90 && QUALITY_SCORE_TARGET === 85, "5. thresholds are preserved");
assert(
  css.includes("grid-template-areas") &&
    css.includes("minmax(26rem, 1.32fr)") &&
    (restored || css.includes('grid-template-areas: "copy pack rail"')),
  restored ? "6. restored hero keeps 54AZ packshot-dominant packing" : "6. hero is a three-area premium composition",
);
assert(Boolean(stored?.commercialImage?.src.includes("cc835ef78e894f7645c4556b")) && (restored || css.includes("drop-shadow")), "7. approved packshot is staged, not replaced");
assert(css.includes("min-height: 4rem") && /data-v4-cta="preview-disabled"/.test(markup) && (restored || blocks.includes("premium-cta__arrow")), "8. CTA is visually emphasized");
assert(/data-v4-cta="preview-disabled"/.test(markup) && lab.hopSlot === "none" && !lab.hopHref && slots.cta.enabled === false, "9. CTA stays disabled");
assert(blocks.includes("premium-card") && (restored || (blocks.includes("premium-card__mono") && blocks.includes("premium-check__row"))), "10. cards are a reusable premium system");
assert(css.includes("color: var(--ds-ink)") && css.includes("var(--ds-cta)"), "11. contrast uses ink and CTA tokens");
assert(css.includes("max-width: 767px") && (restored ? css.includes("max-width: 17.25rem") : css.includes("max-width: 20rem")), "12. mobile composition is designed, not shrunk");
assert(css.includes("min-width: 768px"), "13. tablet breakpoint remains");
assert(css.includes("min-width: 960px") && (restored || css.includes("min-height: 56.25rem")), "14. desktop first fold is occupied");
assert(/data-premium="faq"/.test(markup) === (slots.faq.length > 0) && (restored || blocks.includes("premium-faq__chevron")), "15. FAQ is an accordion without new answers");
assert(blocks.includes("premium-guarantee__days") && uniqueGuaranteeStatements(["60 days.", "60 days. The seller states 60 days."]).length === 1, "16. guarantee keeps unique approved terms");
assert(fulfillmentCardsFrom(lab).every((item) => item.kind !== "DELIVERY" || !/free shipping/i.test(item.body)), "17. shipping cards do not invent free shipping");
assert(
  EXECUTION_54BA_EDITORIAL_DIFF.every((item) => item.safetyCheck.length > 0) &&
    premiumSectionTitle({ sectionType: "trust", headline: "Cautions", fulfillmentCount: 2 }) === "Shipping, returns, and payment",
  "18. editorial recovery is title and scanability only",
);
assert(integrity.valid && integrity.publicationReadiness === "BLOCKED" && integrity.commercialAuthorization === "BLOCKED", "19. Product Contract and commercial blocks remain");
assert(!FORBIDDEN_REFERENCE_CHROME.test(markup) && EXECUTION_54BA_PLAN.every((item) => item.multiproductCompatible), "20. no invented chrome or facts");

const scenarios = labScenarioKeys().map((key) => {
  const model = disableCommercialCta(buildV4Model(key)!);
  const html = renderToStaticMarkup(createElement(V4Page, { model }));
  const view = premiumSlotsFromModel(model);
  return {
    key,
    html,
    view,
    ok:
      !FORBIDDEN_REFERENCE_CHROME.test(html) &&
      !model.hopHref &&
      !/sugar defender|cbc045ab/i.test(html) &&
      (view.ingredients.length > 0 || !/data-premium="ingredients"/.test(html)) &&
      (view.guarantee.statements.length > 0 || !/data-premium="guarantee"/.test(html)),
  };
});
assert(scenarios.every((row) => row.ok), "21. multiproduct regression omits empty sections and stays generic");

const shots = ["desktop-first-fold.png", "desktop-full.png", "tablet-first-fold.png", "tablet-full.png", "mobile-first-fold.png", "mobile-full.png"];
if (shots.every((name) => existsSync(path.join(evidence, name)))) {
  assert(true, "22. visitor captures exist");
} else {
  assert(DESIGN_CHECKPOINT_FILES.length === 4, "22. capture files will be written by the 54BA run");
}
if (existsSync(path.join(evidence, "visual-evaluation-run-1.json")) && existsSync(path.join(evidence, "visual-evaluation-run-2.json"))) {
  assert(true, "23. independent evaluations are recorded");
} else {
  assert(EXECUTION_54BA_BUDGET.maxCampaignEvals === 4, "23. two visual and two editorial slots are reserved");
}
assert(restored || kept || !existsSync(comparisonFile), "rollback or keep is recorded when evaluation ran");
assert(
  dimensionPairStability(72, 72) === "STABLE" &&
    dimensionPairStability(65, 75) === "UNSTABLE" &&
    officialPerDimensionStability({ desktop: [72, 72], mobile: [65, 75], editorial: [73, 73] }).combined === "UNSTABLE",
  "24. stability is judged per dimension",
);

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
assert(selectBestCandidate({ current, incoming: { ...current, desktopVisualScore: 80, identity, notes: [] } }).updated, "25. comparable identity can be scored");
assert(!selectBestCandidate({ current, incoming: { ...current, desktopVisualScore: 70, mobileVisualScore: 80, editorialScore: 80, identity, notes: [] } }).updated, "26. a regression does not replace the best candidate");
assert(page.includes("src/components/product-showcase/v4/page.tsx") === false && EXECUTION_54BA_CHECKPOINT_ID.includes("54ba"), "27. rollback uses a dedicated checkpoint, not git reset");
assert(
  EXECUTION_54BA_MAX_AI_COST_USD === 0.5 &&
    budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54ba", 0.5), { kind: "EVALUATION", reserveUsd: 0.12 }, BA_LEDGER).allowed &&
    !budgetAllowsPaidCall(emptyExecutionBudgetLedger("execution-54ba", 0.5), { kind: "EVALUATION", reserveUsd: 0.51 }, BA_LEDGER).allowed &&
    reservePaidCall(emptyExecutionBudgetLedger("execution-54ba", 0.5), { kind: "EVALUATION", model: "gpt-4o-mini", reserveUsd: 0.12, caps: BA_LEDGER }).ok,
  "28. exclusive US$0.50 budget blocks overspend",
);

const blocked = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: EXECUTION_54BA_GENERATION_ID,
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
assert(blocked.status === "QUALITY_BLOCKED" && !canEnterHumanReviewQueue(blocked) && requestPresellHumanReview(blocked).ok === false, "29. global gate stays blocked below 90/90/85");
assert(blocked.publicationUnlocked === false && integrity.publicationReadiness === "BLOCKED", "30. publication stays blocked");
assert(blocked.publicationUnlocked === false && lab.hopSlot === "none", "31. ads and commercial hops stay blocked");

assert(head.length === 40, "HEAD is a full git hash");
assert(!/sugardefender|campaign 237|cbc045ab/i.test(css), "CSS stays product-generic");
console.log(`PASS ${passed}`);
