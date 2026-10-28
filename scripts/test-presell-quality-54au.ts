import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { validatePersistedProductContract } from "../src/lib/presell-quality/contract-integrity.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import {
  MAX_DESIGN_ITERATIONS,
  PAID_AI_BUDGET_USD,
  PREMIUM_CTA_LABEL,
  PREMIUM_DISPLAY_THEME,
  PREMIUM_ENGINE_ID,
  QUALITY_SCORE_TARGET,
  QUALITY_TARGET,
  VISUAL_SCORE_TARGET,
  visualWeightsSumToOne,
  weightedVisualScore,
} from "../src/lib/presell-quality/index.ts";
import { QUALITY_DIMENSION_WEIGHTS } from "../src/lib/presell-quality/types.ts";
import { daysFromText, premiumSlotsFromModel } from "../src/lib/presell-quality/premium-slots.ts";
import { evaluateVisualGate, markupHasForbiddenChrome, paidAiBlockedFor54au } from "../src/lib/presell-quality/visual-gate.ts";
import { EXECUTION_54AU_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { FORBIDDEN_REFERENCE_CHROME } from "../src/lib/presell-quality/premium-design.ts";
import {
  loadPremiumPresellDesignStandard,
  persistPremiumDesignStandardRecord,
  PREMIUM_PRESELL_DESIGN_STANDARD_ID,
  PREMIUM_REFERENCE_EVALUATOR_PATH,
  PREMIUM_REFERENCE_RELATIVE_PATH,
  type PremiumDesignStandard,
} from "../src/lib/presell-quality/premium-standard.ts";
import {
  canApproveEditorialFinal,
  canEnterHumanReviewQueue,
  canPromoteApprovedVersion,
  requestPresellHumanReview,
  resolveGlobalPresellQualityGate,
  writeGlobalPresellQualityGate,
} from "../src/lib/presell-quality/global-quality-gate.ts";
import { planDesignImprovements } from "../src/lib/presell-quality/design-improve.ts";
import { humanReviewEligibilityOf } from "../src/lib/presell-quality/policy.ts";
import { existsSync } from "node:fs";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const lab = buildV4Model(labScenarioKeys()[0]!);
if (!lab) throw new Error("lab s1 missing");
const preview = disableCommercialCta(lab);
const markup = renderToStaticMarkup(createElement(V4Page, { model: preview }));
const slots = premiumSlotsFromModel(preview);
const engineSrc = [
  "src/lib/presell-quality/premium-design.ts",
  "src/lib/presell-quality/premium-slots.ts",
  "src/components/design-system/premium-blocks.tsx",
  "src/app/premium-design-engine.css",
  "src/components/product-showcase/v4/page.tsx",
].map((rel) => readFileSync(path.join(process.cwd(), rel), "utf8")).join("\n");

assert(slots.engineId === PREMIUM_ENGINE_ID && /premium-card|premium-guarantee|premium-faq/.test(markup), "1. Design Engine reutilizavel");
assert(/data-v4-section="hero"/.test(markup) && /ds-hero--split|ds-hero--product-image|ds-hero--editorial/.test(markup), "2. Hero premium");
assert(!preview.commercialImage || markup.includes(preview.commercialImage.src), "3. Packshot correto quando autorizado");
assert(markup.includes(PREMIUM_CTA_LABEL) && /data-v4-cta="preview-disabled"/.test(markup), "4. CTA destacado");
assert(preview.hopSlot === "none" && !preview.hopHref && !/official_offer_click/.test(markup), "5. CTA desabilitado");
assert(Array.isArray(slots.ingredients), "6. Cards de ingredientes");
assert(daysFromText("60 days from purchase") === 60 && slots.guarantee.days !== undefined, "7. Garantia");
assert(slots.fulfillment.every((item) => item.body.length > 0) || slots.fulfillment.length === 0, "8. Prazos de envio so com texto aprovado");
assert(/data-premium="faq"|ds-faq/.test(markup), "9. FAQ");
assert(/ds-footer/.test(markup), "10. Footer");
assert(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8").includes("max-width: 767px"), "11. Mobile");
assert(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8").includes("min-width: 640px"), "12. Tablet");
assert(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8").includes("min-width: 960px"), "13. Desktop");
assert(!/overflow-x:\s*scroll/.test(readFileSync(path.join(process.cwd(), "src/app/premium-design-engine.css"), "utf8")), "14. Sem overflow forçado");
assert(!/lab-fixtures\/synthetic/.test(markup), "15. Sem imagens quebradas de fixture no preview desabilitado");
assert(!/href="https:\/\/example\.invalid/.test(markup), "16. Sem links ficticios");
assert(!/★★|star review|verified buyer/.test(markup), "17. Sem avaliacoes inventadas");
assert(!/customer testimonial|i tried this/.test(markup), "18. Sem depoimentos inventados");
assert(!FORBIDDEN_REFERENCE_CHROME.test(markup) && !markupHasForbiddenChrome(markup), "19. Sem selos nao comprovados");

const snap = snapshotProductResearch(237);
const before = JSON.stringify(snap.latest?.proposals.map((item) => [item.field, item.status, item.suggestedValue]));
const integrity = validatePersistedProductContract(237, snap.latest);
assert(integrity.valid && integrity.contractVersion === 1, "20. Product Contract imutavel / valido");
const after = JSON.stringify(snapshotProductResearch(237).latest?.proposals.map((item) => [item.field, item.status, item.suggestedValue]));
assert(before === after, "20b. leitura do contrato nao reescreve propostas");
assert(integrity.blockedMedicalClaims >= 9, "21. Bloqueio medico preservado");
assert(integrity.commercialAuthorization === "BLOCKED" && integrity.publicationReadiness === "BLOCKED", "22. Seguranca comercial");
assert(readFileSync(path.join(process.cwd(), "src/lib/presell-quality/visual-gate.ts"), "utf8").includes("ViewportInspect"), "23. Screenshots reais exigem inspecao de viewport");
assert(evaluateVisualGate({
  visual: {
    scores: {
      HERO_FIRST_IMPRESSION: 90,
      COMPOSITION_HIERARCHY: 90,
      TYPOGRAPHY_LEGIBILITY: 90,
      CARDS_COMPONENTS: 90,
      IMAGE_USE: 90,
      CTA_EMPHASIS: 90,
      MOBILE: 90,
    },
    rationales: {
      HERO_FIRST_IMPRESSION: "n",
      COMPOSITION_HIERARCHY: "n",
      TYPOGRAPHY_LEGIBILITY: "n",
      CARDS_COMPONENTS: "n",
      IMAGE_USE: "n",
      CTA_EMPHASIS: "n",
      MOBILE: "n",
    },
    overall: 90,
    criticalDefects: [],
    noCriticalVisualDefects: true,
    target: 90,
    source: "NOT_EXECUTED",
    comparedToReference: false,
  },
  qualityScore: 90,
  qualityTargetReached: true,
  contentSafetyPass: true,
  mobilePass: true,
  tabletPass: true,
  desktopPass: true,
}).visualQualityGate === "FAIL", "24. Comparacao com referencia ausente nao aprova o gate");
assert(evaluateVisualGate({
  visual: {
    scores: {
      HERO_FIRST_IMPRESSION: 90,
      COMPOSITION_HIERARCHY: 90,
      TYPOGRAPHY_LEGIBILITY: 90,
      CARDS_COMPONENTS: 90,
      IMAGE_USE: 90,
      CTA_EMPHASIS: 90,
      MOBILE: 90,
    },
    rationales: {
      HERO_FIRST_IMPRESSION: "n",
      COMPOSITION_HIERARCHY: "n",
      TYPOGRAPHY_LEGIBILITY: "n",
      CARDS_COMPONENTS: "n",
      IMAGE_USE: "n",
      CTA_EMPHASIS: "n",
      MOBILE: "n",
    },
    overall: 90,
    criticalDefects: [],
    noCriticalVisualDefects: true,
    target: 90,
    source: "CURSOR_MULTIMODAL",
    comparedToReference: true,
  },
  qualityScore: 81,
  qualityTargetReached: false,
  contentSafetyPass: true,
  mobilePass: true,
  tabletPass: true,
  desktopPass: true,
}).visualQualityGate === "FAIL", "26. Gate visual 90 nao passa sem quality 85");
assert(QUALITY_SCORE_TARGET === 85 && QUALITY_TARGET === 85, "27. Gate de qualidade 85");
assert(visualWeightsSumToOne() && weightedVisualScore({
  HERO_FIRST_IMPRESSION: 100,
  COMPOSITION_HIERARCHY: 50,
  TYPOGRAPHY_LEGIBILITY: 0,
  CARDS_COMPONENTS: 0,
  IMAGE_USE: 0,
  CTA_EMPHASIS: 0,
  MOBILE: 0,
}) === 30, "28. Estabilidade da rubrica visual (pesos fixos)");
assert(MAX_DESIGN_ITERATIONS === 4, "29. Loop maximo de quatro iteracoes");
assert(integrity.publicationReadiness === "BLOCKED", "30. Ausencia de publicacao");
assert(PAID_AI_BUDGET_USD === 0 && EXECUTION_54AU_BUDGET.maxUsd === 0 && paidAiBlockedFor54au(), "budget. zero paid AI");
assert(PREMIUM_DISPLAY_THEME === "forest", "theme. forest is the premium display theme");
assert(!/sugardefender|campaign 237|237/.test(engineSrc.replace(/test-presell-quality-54au/g, "")), "generic. engine source has no campaign-specific branch");
assert(Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0) === 1, "quality rubric weights unchanged");

const standard = persistPremiumDesignStandardRecord();
assert(standard.id === PREMIUM_PRESELL_DESIGN_STANDARD_ID, "standard. id is PREMIUM_PRESELL_DESIGN_STANDARD_V1");
assert(standard.relativePath === PREMIUM_REFERENCE_RELATIVE_PATH, "standard. official png path");
assert(standard.evaluatorPath === PREMIUM_REFERENCE_EVALUATOR_PATH, "standard. evaluator HTTP path");
assert(standard.registered === (existsSync(standard.absolutePath) && Boolean(standard.dimensions)), "standard. registered only when a readable PNG exists");
assert(Boolean(standard.hash) === standard.registered, "standard. hash stored only for a readable PNG");
assert(standard.forbiddenCommercialCopy.length >= 3, "standard. reference chrome is not product fact");
assert(!/2,000|verified customer|fda|gmp certified|claim your discount/i.test(JSON.stringify(standard.visualTraits)), "standard. traits are visual, not commercial copy from the reference");

const desktopShot = path.join(process.cwd(), "data/evidence/execution-54au-premium-design/desktop-screenshot.png");
const mobileShot = path.join(process.cwd(), "data/evidence/execution-54au-premium-design/mobile-screenshot.png");

const campaign237 = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-mvs7mja3-0d690e7c",
  desktopScreenshotPath: desktopShot,
  mobileScreenshotPath: mobileShot,
  comparedToOfficialReference: standard.registered,
  evaluatorIndependentFromGenerator: true,
  visualScore: 86,
  desktopVisualScore: 86,
  mobileVisualScore: 84,
  editorialScore: 82,
  evaluatorStability: "NOT_ESTABLISHED",
  criticalVisualDefects: [],
  contentSafetyPass: true,
  paidEvaluationAvailable: false,
});
assert(campaign237.status !== "QUALITY_APPROVED", "gate. 237 is not QUALITY_APPROVED");
assert(campaign237.humanReviewUnlocked === false, "gate. human review stays locked");
assert(!canEnterHumanReviewQueue(campaign237), "gate. queue entry refused");
assert(!canApproveEditorialFinal(campaign237), "gate. editorial acceptance refused");
assert(!canPromoteApprovedVersion(campaign237), "gate. approved-version promotion refused");
assert(requestPresellHumanReview(campaign237).ok === false, "gate. backend refuses human review");
assert(humanReviewEligibilityOf("QUALITY_PASSED", campaign237) === "NOT_ELIGIBLE", "gate. QUALITY_PASSED alone does not unlock review");
assert(campaign237.publicationUnlocked === false, "gate. publication stays locked");
writeGlobalPresellQualityGate(campaign237);

const unavailable = resolveGlobalPresellQualityGate({
  campaignId: 237,
  generationId: "lp-missing-eval",
  desktopScreenshotPath: desktopShot,
  mobileScreenshotPath: mobileShot,
  comparedToOfficialReference: false,
  evaluatorIndependentFromGenerator: true,
  visualScore: 99,
  editorialScore: 99,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  paidEvaluationAvailable: false,
});
assert(unavailable.status === "EVALUATION_UNAVAILABLE", "gate. missing comparison is EVALUATION_UNAVAILABLE, not approval");
assert(!canEnterHumanReviewQueue(unavailable), "gate. absence of evaluation is not approval");

const fakeApproved = resolveGlobalPresellQualityGate({
  campaignId: 99,
  generationId: "gen-fake",
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 90,
  editorialScore: 85,
  evaluatorStability: "STABLE",
  contentSafetyPass: true,
  criticalVisualDefects: ["overflow"],
  desktopScreenshotPath: desktopShot,
  mobileScreenshotPath: mobileShot,
});
assert(fakeApproved.status !== "QUALITY_APPROVED", "gate. critical defects block approval");

const unstableHigh = resolveGlobalPresellQualityGate({
  campaignId: 99,
  generationId: "gen-unstable",
  comparedToOfficialReference: true,
  evaluatorIndependentFromGenerator: true,
  visualScore: 92,
  desktopVisualScore: 92,
  mobileVisualScore: 91,
  editorialScore: 88,
  evaluatorStability: "NOT_ESTABLISHED",
  contentSafetyPass: true,
  criticalVisualDefects: [],
  desktopScreenshotPath: desktopShot,
  mobileScreenshotPath: mobileShot,
});
assert(unstableHigh.status === "QUALITY_BLOCKED", "gate. an isolated high score does not unlock");

const registeredStandard: PremiumDesignStandard = {
  ...standard,
  registered: true,
  accessibleToEvaluator: true,
  hash: standard.hash ?? "test-hash",
  dimensions: standard.dimensions ?? { width: 1200, height: 1800 },
  reason: null,
};
const wouldApprove = resolveGlobalPresellQualityGate(
  {
    campaignId: 99,
    generationId: "gen-pass",
    comparedToOfficialReference: true,
    evaluatorIndependentFromGenerator: true,
    visualScore: 92,
    desktopVisualScore: 92,
    mobileVisualScore: 91,
    editorialScore: 88,
    evaluatorStability: "STABLE",
    contentSafetyPass: true,
    criticalVisualDefects: [],
    desktopScreenshotPath: desktopShot,
    mobileScreenshotPath: mobileShot,
  },
  registeredStandard,
);
assert(wouldApprove.status === "QUALITY_APPROVED" && wouldApprove.humanReviewUnlocked === true, "gate. all requirements unlock human review");
assert(wouldApprove.publicationUnlocked === false, "gate. QUALITY_APPROVED does not auto-publish");
assert(requestPresellHumanReview(wouldApprove).ok === true, "gate. QUALITY_APPROVED may request human review");

const stopped = planDesignImprovements({ iteration: 4, defects: ["hero weak"], visualScore: 80 });
assert(stopped.stop && stopped.actions.length === 0, "improve. fourth iteration stops");
assert(planDesignImprovements({ iteration: 1, defects: ["hero weak"], visualScore: 80 }).actions.every((item) => item.mutatesApprovedFacts === false), "improve. does not mutate facts");

function renderKey(key: string) {
  const model = disableCommercialCta(buildV4Model(key)!);
  return { model, markup: renderToStaticMarkup(createElement(V4Page, { model })), slots: premiumSlotsFromModel(model) };
}
const complete = renderKey("s1");
const sparse = renderKey("s4");
const noImage = renderKey("s5");
const incomplete = renderKey("s6");
assert(!/clinically proven|recommended by doctors|the best greens supplement/i.test(complete.markup), "generic. blocked claims are not fabricated into the page");
assert(!/★★|verified buyer|verified customer|over 2,000/i.test(complete.markup + sparse.markup), "generic. no invented reviews");
assert(!FORBIDDEN_REFERENCE_CHROME.test(sparse.markup + noImage.markup + incomplete.markup), "generic. no fabricated seals or testimonials");
assert(!incomplete.slots.cta.enabled && !incomplete.model.hopHref, "generic. incomplete commercial data does not invent a live CTA");
if (!sparse.slots.guarantee.statements.length) {
  assert(!/data-premium="guarantee"/.test(sparse.markup), "generic. no guarantee section when no guarantee fact");
}
if (!noImage.slots.packshot) {
  assert(!/data-v4-image="commercial"/.test(noImage.markup), "generic. no secondary or hero image invented");
}
if (!sparse.slots.ingredients.length) {
  assert(!/data-premium="ingredients"/.test(sparse.markup), "generic. ingredient band omitted without facts");
} else {
  assert(sparse.slots.ingredients.every((item) => sparse.markup.includes(item.name)), "generic. sparse cards only restate existing facts");
}

console.log(`PASS ${passed}`);
