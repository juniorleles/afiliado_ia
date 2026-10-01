import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeImportCompleteness, type ImportCompletenessReport } from "../src/lib/completeness-engine.ts";
import { DENSITY_LABELS, READINESS_LABELS, predictLpQuality } from "../src/lib/lp-quality-predictor.ts";
import { OVERRIDE_FIELDS } from "../src/lib/manual-overrides.ts";
import { HERO_STRATEGIES, PLAN_SECTIONS, planPresentation, type PlanSection, type PresentationPlan } from "../src/lib/presentation-plan.ts";
import { PRODUCT_DENSITIES, analyzeProductProfile } from "../src/lib/product-profile.ts";
import { CONSUMER_COPY_ALLOWED_PROVENANCE, emptyProductFacts, type FactConfidence, type ProductFacts } from "../src/lib/product-facts.ts";
import { analyzeEvidence } from "../src/lib/opportunity/evidence-analyzer.ts";
import { EVIDENCE_DIMENSIONS } from "../src/lib/opportunity/evidence-result.ts";
import { createEvidenceSignal, registerEvidenceSignal, EVIDENCE_SIGNAL_ID } from "../src/lib/opportunity/evidence-signal.ts";
import {
  LP_POTENTIAL_AUTHORITATIVE_PROVENANCES,
  LP_POTENTIAL_BALANCE_GROUPS,
  LP_POTENTIAL_THRESHOLDS,
  LandingPagePotentialInputError,
  analyzeLandingPagePotential,
} from "../src/lib/opportunity/landing-page-potential-analyzer.ts";
import {
  LP_POTENTIAL_DIMENSIONS,
  LP_POTENTIAL_RATINGS,
  landingPagePotentialToSignalOutput,
  type EffectiveManualOverride,
  type LandingPageDimension,
  type LandingPagePotentialInputs,
} from "../src/lib/opportunity/landing-page-potential-result.ts";
import {
  LANDING_PAGE_POTENTIAL_SIGNAL_ID,
  createLandingPagePotentialSignal,
  registerLandingPagePotentialSignal,
} from "../src/lib/opportunity/landing-page-potential-signal.ts";
import {
  LP_POTENTIAL_DENSITIES,
  LP_POTENTIAL_DENSITY_LABELS,
  LP_POTENTIAL_HERO_STRATEGIES,
  LP_POTENTIAL_OVERRIDE_FIELDS,
  LP_POTENTIAL_READINESS_LABELS,
  validateLandingPagePotentialInputs,
} from "../src/lib/opportunity/landing-page-potential-validator.ts";
import { createSignalContext, freezeDeep } from "../src/lib/opportunity/opportunity-signal-context.ts";
import { executeSignal } from "../src/lib/opportunity/opportunity-signal-executor.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import { createSignalRegistry, SignalFrameworkError } from "../src/lib/opportunity/opportunity-signal-registry.ts";
import { validateSignalModule } from "../src/lib/opportunity/opportunity-signal-validator.ts";
import type { OpportunitySignalModule } from "../src/lib/opportunity/opportunity-signal-contract.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const URL_A = "https://example.test/gizmo";
const clock = () => 0;
const HEADLINE = "A calm headline for the hero area of the page.";

function base(): ProductFacts {
  return emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
}

function words(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
}

function faqSnippets(n: number, confidence: FactConfidence = "DIRECT_SOURCE") {
  return Array.from({ length: n }, (_, i) => ({ field: "faq", question: `Question ${i + 1}?`, text: `Answer ${i + 1}.`, sourceUrl: URL_A, confidence }));
}

function rich(): ProductFacts {
  const facts = base();
  facts.description = "A fictional gizmo with a description long enough to be present on the page for the reader.";
  facts.features = words("Feature", 4);
  facts.ingredientsOrComponents = words("Part", 8);
  facts.usageInformation = ["Use once a day."];
  facts.cautions = ["Keep dry."];
  facts.pricingInformation = "$49 each";
  facts.guaranteeInformation = "Thirty-day guarantee.";
  facts.manufacturer = "Fictional Works";
  facts.offerFacts = [
    { packageName: "One unit", unitPrice: "$49", totalPrice: "$49", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" },
    { packageName: "Three units", unitPrice: "$39", totalPrice: "$117", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" },
  ];
  facts.sourceSnippets = faqSnippets(4);
  facts.productImageUrl = "https://example.test/gizmo.png";
  facts.productImageProvenance = "DIRECT_SOURCE";
  for (const field of ["features", "ingredientsOrComponents", "usageInformation", "cautions", "description", "pricingInformation", "guaranteeInformation", "manufacturer"] as const) {
    facts.confidence[field] = "DIRECT_SOURCE";
  }
  return facts;
}

const CTA_OVERRIDES: EffectiveManualOverride[] = [
  { field: "cta", value: "Check availability" },
  { field: "trackingUrl", value: "https://example.test/go" },
];

interface BuildOptions {
  assets?: number;
  headline?: string | null;
  overrides?: EffectiveManualOverride[] | null;
  withPrediction?: boolean;
  withEvidence?: boolean;
}

function build(facts: ProductFacts, options: BuildOptions = {}): LandingPagePotentialInputs {
  const headline = options.headline === undefined ? HEADLINE : options.headline;
  const completeness = analyzeImportCompleteness({ facts, headline, visualAssetCount: options.assets ?? 2 });
  const presentationPlan = planPresentation(facts, analyzeProductProfile(facts));
  const inputs: LandingPagePotentialInputs = { facts, completeness, presentationPlan };
  if (options.overrides !== undefined) inputs.manualOverrides = options.overrides;
  if (options.withPrediction) inputs.qualityPrediction = predictLpQuality({ facts, report: completeness });
  if (options.withEvidence) inputs.evidence = analyzeEvidence({ facts }, { now: clock });
  return inputs;
}

function run(inputs: LandingPagePotentialInputs) {
  return analyzeLandingPagePotential(inputs, { now: clock });
}

const rating = (result: ReturnType<typeof run>, dimension: LandingPageDimension) => result.metadata[`dimension.${dimension}`];
const comparable = (r: ReturnType<typeof run>) => JSON.stringify({ ...r, executionTime: 0 });

function planWith(plan: PresentationPlan, visible: PlanSection[], density: PresentationPlan["density"] = plan.density): PresentationPlan {
  const set = new Set<PlanSection>(["hero", ...visible]);
  const sectionVisibility = Object.fromEntries(PLAN_SECTIONS.map((s) => [s, set.has(s)])) as PresentationPlan["sectionVisibility"];
  return { ...plan, density, sectionVisibility, sectionOrder: PLAN_SECTIONS.filter((s) => set.has(s)) };
}

function withSection(report: ImportCompletenessReport, id: string, patch: Record<string, unknown>): ImportCompletenessReport {
  return { ...report, sections: report.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

function rejected(value: unknown, field: string): boolean {
  return validateLandingPagePotentialInputs(value).some((issue) => issue.field === field);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

function storedFactsFiles(label: string, limit = 6): Array<{ file: string; facts: ProductFacts }> {
  const found: Array<{ file: string; facts: ProductFacts }> = [];
  const visit = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name === ".next" || name === "visual-qa-tmp") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (/facts/i.test(name) && name.endsWith(".json") && found.length < limit) {
        try {
          const raw = JSON.parse(readFileSync(full, "utf8")) as { facts?: ProductFacts } & Partial<ProductFacts>;
          const facts = raw.facts?.productName ? raw.facts : raw.productName ? (raw as ProductFacts) : null;
          if (facts && facts.productName.toLowerCase().includes(label.toLowerCase())) found.push({ file: full, facts });
        } catch {
          /* not a facts file */
        }
      }
    }
  };
  visit("data");
  return found;
}

async function main() {
  // ---------- shape ----------
  check(
    "twelve landing page dimensions",
    LP_POTENTIAL_DIMENSIONS.join(",") ===
      "HERO_STRENGTH,FEATURE_COVERAGE,INGREDIENT_COVERAGE,OFFER_COVERAGE,PRICING_COVERAGE,FAQ_COVERAGE,GUARANTEE_COVERAGE,CTA_AVAILABILITY,MEDIA_AVAILABILITY,INFORMATION_DENSITY,SECTION_BALANCE,PRESENTATION_READINESS",
  );
  check("ratings are labels, not numbers", LP_POTENTIAL_RATINGS.join(",") === "STRONG,ADEQUATE,WEAK,MISSING,NOT_ASSESSED");

  // ---------- full material ----------
  const fullInputs = build(rich(), { overrides: CTA_OVERRIDES, withPrediction: true, withEvidence: true });
  const full = run(fullInputs);
  check("a fully supplied product validates", validateLandingPagePotentialInputs(fullInputs).length === 0);
  check("every dimension of a complete product is STRONG", LP_POTENTIAL_DIMENSIONS.every((d) => rating(full, d) === "STRONG"));
  check("strengths list every strong dimension with its detail", full.strengths.length === 12 && full.strengths.every((s, i) => s.startsWith(`${LP_POTENTIAL_DIMENSIONS[i]}: `)));
  check("a complete product has no weaknesses, no missing sections, and status COMPLETED", full.weaknesses.length === 0 && full.missingSections.length === 0 && full.status === "COMPLETED");
  check("complete material from direct sources gives confidence 1", full.confidence === 1);
  check("consistent inputs produce no warnings", full.warnings.length === 0);
  check(
    "a result has exactly the required fields",
    Object.keys(full).sort().join(",") === "confidence,executionTime,metadata,missingSections,status,strengths,warnings,weaknesses",
  );
  check("no score, rank, or recommendation anywhere in a result", !/score|rank|recommendation/i.test(JSON.stringify(Object.keys(full)) + JSON.stringify(Object.keys(full.metadata))));
  check("result metadata is flat", Object.values(full.metadata).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  check("metadata carries a rating for each dimension and the provenance note", LP_POTENTIAL_DIMENSIONS.every((d) => LP_POTENTIAL_RATINGS.includes(rating(full, d) as never)) && /not independently verified/.test(String(full.metadata.provenanceNote)));
  check("metadata names strong dimensions and counts", full.metadata.strongCount === 12 && full.metadata.strongDimensions === LP_POTENTIAL_DIMENSIONS.join(",") && full.metadata.weakCount === 0);
  check("executionTime comes from the clock", full.executionTime === 0 && analyzeLandingPagePotential(fullInputs, { now: (() => { let t = 0; return () => (t += 7); })() }).executionTime === 7);

  // ---------- thin and empty material ----------
  const bare = { headline: null, assets: 0 };
  const thin = run(build(base(), bare));
  check("a product with nothing but a name has a weak hero and no content", rating(thin, "HERO_STRENGTH") === "WEAK" && rating(thin, "FEATURE_COVERAGE") === "MISSING" && rating(thin, "INFORMATION_DENSITY") === "MISSING" && rating(thin, "SECTION_BALANCE") === "MISSING" && rating(thin, "PRESENTATION_READINESS") === "MISSING");
  check("missing sections name the sections with no material", thin.missingSections.join() === "features,ingredients,offers,pricing,faq,guarantee,media");
  check("thin material is reported, not padded", thin.strengths.length === 0 && thin.weaknesses.length === 11 && thin.status === "COMPLETED");
  check("no evidence-backed material gives null confidence", thin.confidence === null);
  check("an unsupplied call to action is NOT_ASSESSED, not MISSING, and it warns", rating(thin, "CTA_AVAILABILITY") === "NOT_ASSESSED" && thin.warnings.some((w) => w.startsWith("CTA_AVAILABILITY:")) && thin.metadata.notAssessedDimensions === "CTA_AVAILABILITY" && !thin.missingSections.includes("cta"));
  const thinWithEmptyOverrides = run(build(base(), { ...bare, overrides: [] }));
  check("an empty list of effective values makes the call to action MISSING", rating(thinWithEmptyOverrides, "CTA_AVAILABILITY") === "MISSING" && thinWithEmptyOverrides.missingSections.includes("cta") && thinWithEmptyOverrides.metadata.manualOverridesSupplied === true && thinWithEmptyOverrides.metadata.manualOverrideFieldCount === 0);
  const unnamed = run(build(emptyProductFacts("", "", "MANUAL")));
  check("a product with no name has no hero", rating(unnamed, "HERO_STRENGTH") === "MISSING" && unnamed.missingSections.includes("hero"));

  // ---------- coverage rules ----------
  const featuresOf = (n: number) => {
    const f = base();
    f.features = words("Feature", n);
    f.confidence.features = "DIRECT_SOURCE";
    return run(build(f));
  };
  check("one of four features is WEAK", rating(featuresOf(1), "FEATURE_COVERAGE") === "WEAK");
  check("two of four features is ADEQUATE", rating(featuresOf(2), "FEATURE_COVERAGE") === "ADEQUATE");
  check("four of four features is STRONG, and more stays STRONG", rating(featuresOf(4), "FEATURE_COVERAGE") === "STRONG" && rating(featuresOf(9), "FEATURE_COVERAGE") === "STRONG");
  check("the coverage target comes from the completeness report", LP_POTENTIAL_THRESHOLDS.adequateShare === 0.5 && featuresOf(1).weaknesses.some((w) => w.startsWith("FEATURE_COVERAGE:") && w.includes("4 recommended")));
  const lowTarget = build(rich());
  lowTarget.completeness = withSection(lowTarget.completeness, "features", { recommended: 2 });
  check("a different platform target changes the reading", rating(run(lowTarget), "FEATURE_COVERAGE") === "STRONG" && rating(run(build(rich())), "FEATURE_COVERAGE") === "STRONG");
  const noTarget = build(rich());
  noTarget.completeness = { ...noTarget.completeness, sections: noTarget.completeness.sections.filter((s) => s.id !== "features") };
  check("a section the report omits is ADEQUATE when material exists", rating(run(noTarget), "FEATURE_COVERAGE") === "ADEQUATE");

  const ingredientsOf = (n: number) => {
    const f = base();
    f.ingredientsOrComponents = words("Part", n);
    f.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
    return run(build(f));
  };
  check("ingredients: 3 of 8 WEAK, 4 of 8 ADEQUATE, 8 of 8 STRONG", rating(ingredientsOf(3), "INGREDIENT_COVERAGE") === "WEAK" && rating(ingredientsOf(4), "INGREDIENT_COVERAGE") === "ADEQUATE" && rating(ingredientsOf(8), "INGREDIENT_COVERAGE") === "STRONG");

  const faqOf = (snippets: ProductFacts["sourceSnippets"]) => {
    const f = base();
    f.sourceSnippets = snippets;
    return run(build(f));
  };
  check("FAQ entries are counted against their target", rating(faqOf(faqSnippets(1)), "FAQ_COVERAGE") === "WEAK" && rating(faqOf(faqSnippets(2)), "FAQ_COVERAGE") === "ADEQUATE" && rating(faqOf(faqSnippets(4)), "FAQ_COVERAGE") === "STRONG");
  check("duplicate FAQ entries count once", rating(faqOf([...faqSnippets(1), ...faqSnippets(1)]), "FAQ_COVERAGE") === "WEAK");
  check("non-FAQ snippets are not FAQ material", rating(faqOf([{ field: "features", text: "x", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" }]), "FAQ_COVERAGE") === "MISSING");

  const guaranteeOnly = base();
  guaranteeOnly.guaranteeInformation = "Thirty-day guarantee.";
  guaranteeOnly.confidence.guaranteeInformation = "DIRECT_SOURCE";
  check("a guarantee statement meets its one-item target", rating(run(build(guaranteeOnly)), "GUARANTEE_COVERAGE") === "STRONG");

  const pricingText = base();
  pricingText.pricingInformation = "$10";
  pricingText.confidence.pricingInformation = "DIRECT_SOURCE";
  const textResult = run(build(pricingText));
  check("a pricing statement meets the pricing target but is not an offer", rating(textResult, "PRICING_COVERAGE") === "STRONG" && rating(textResult, "OFFER_COVERAGE") === "MISSING");
  const offersOnly = base();
  offersOnly.offerFacts = [{ packageName: "Solo", unitPrice: "$10", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" }];
  const offerResult = run(build(offersOnly));
  check("one priced offer is ADEQUATE and also covers pricing", rating(offerResult, "OFFER_COVERAGE") === "ADEQUATE" && rating(offerResult, "PRICING_COVERAGE") === "STRONG");
  const twoOffers = base();
  twoOffers.offerFacts = [
    { packageName: "Solo", unitPrice: "$10", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" },
    { packageName: "Duo", unitPrice: "$8", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" },
  ];
  check("two priced offers allow a comparison and are STRONG", LP_POTENTIAL_THRESHOLDS.offersStrong === 2 && rating(run(build(twoOffers)), "OFFER_COVERAGE") === "STRONG");
  const unpriced = base();
  unpriced.offerFacts = [{ packageName: "Mystery", unitPrice: "", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" }];
  check("an offer with no price is not offer material", rating(run(build(unpriced)), "OFFER_COVERAGE") === "MISSING");

  // ---------- NOT_FOUND closure ----------
  const closed = base();
  closed.features = words("Feature", 4);
  closed.confidence.features = "NOT_FOUND";
  const closedInputs = build(closed);
  const closedResult = run(closedInputs);
  check("values marked NOT_FOUND are not material", rating(closedResult, "FEATURE_COVERAGE") === "MISSING" && closedResult.missingSections.includes("features"));
  check("NOT_FOUND values are reported as suppressed", closedResult.warnings.some((w) => w.startsWith("FEATURE_COVERAGE:") && w.includes("NOT_FOUND")));
  const forged = { ...closedInputs, completeness: withSection(closedInputs.completeness, "features", { found: 9, status: "COMPLETE", quality: "GOOD" }) };
  check("a completeness report cannot resurrect closed material", rating(run(forged), "FEATURE_COVERAGE") === "MISSING");
  const closedFaq = base();
  closedFaq.sourceSnippets = faqSnippets(3, "NOT_FOUND");
  check("FAQ entries marked NOT_FOUND are not material", rating(run(build(closedFaq)), "FAQ_COVERAGE") === "MISSING");
  const closedOps = base();
  closedOps.pricingInformation = "$10";
  closedOps.confidence.pricingInformation = "NOT_FOUND";
  check("pricing marked NOT_FOUND is not material", rating(run(build(closedOps)), "PRICING_COVERAGE") === "MISSING");
  const placeholderText = base();
  placeholderText.features = ["NOT_FOUND"];
  placeholderText.confidence.features = "DIRECT_SOURCE";
  check("the NOT_FOUND placeholder text is not material", rating(run(build(placeholderText)), "FEATURE_COVERAGE") === "MISSING");

  // ---------- provenance and confidence ----------
  const mixed = rich();
  mixed.confidence.features = "HEURISTIC_EXTRACTION";
  mixed.confidence.guaranteeInformation = "AI_SOURCE_CLASSIFICATION";
  const mixedResult = run(build(mixed, { overrides: CTA_OVERRIDES }));
  check("heuristic and AI-classified material stays rated by amount", rating(mixedResult, "FEATURE_COVERAGE") === "STRONG" && rating(mixedResult, "GUARANTEE_COVERAGE") === "STRONG");
  check("weak provenance is named in a warning", mixedResult.warnings.some((w) => w.startsWith("FEATURE_COVERAGE:") && w.includes("HEURISTIC_EXTRACTION")) && mixedResult.warnings.some((w) => w.startsWith("GUARANTEE_COVERAGE:") && w.includes("AI_SOURCE_CLASSIFICATION")));
  check("confidence is the authoritative share of evidence-backed material", mixedResult.metadata.evidenceBackedCount === 8 && mixedResult.metadata.authoritativeCount === 6 && mixedResult.confidence === 0.75);
  const manualFacts = rich();
  manualFacts.confidence.features = "MANUAL";
  check("MANUAL provenance counts as authoritative", run(build(manualFacts, { overrides: CTA_OVERRIDES })).confidence === 1);

  // ---------- hero ----------
  const richPlan = build(rich()).presentationPlan;
  check("a rich plan opens with an evidence-backed BENEFIT hero", richPlan.heroStrategy === "BENEFIT" && rating(full, "HERO_STRENGTH") === "STRONG");
  const unbacked = { ...build(base()), presentationPlan: richPlan };
  const unbackedResult = run(unbacked);
  check("a hero strategy that facts cannot carry is WEAK and warned", rating(unbackedResult, "HERO_STRENGTH") === "WEAK" && unbackedResult.warnings.some((w) => w.startsWith("HERO_STRENGTH:")));
  const identityHero = { ...build(base(), { headline: null }), presentationPlan: { ...richPlan, heroStrategy: "IDENTITY" as const } };
  check("an identity-only hero is WEAK", rating(run(identityHero), "HERO_STRENGTH") === "WEAK");
  const identityWithHeadline = build(base(), { headline: HEADLINE });
  check("an identity hero with a supplied headline is ADEQUATE", rating(run(identityWithHeadline), "HERO_STRENGTH") === "ADEQUATE");
  const valueHero = { ...build(rich()), presentationPlan: { ...richPlan, heroStrategy: "VALUE" as const } };
  check("a VALUE hero backed by facts is ADEQUATE", rating(run(valueHero), "HERO_STRENGTH") === "ADEQUATE");
  const hiddenHero = { ...build(rich()), presentationPlan: { ...richPlan, sectionVisibility: { ...richPlan.sectionVisibility, hero: false } } };
  check("a hidden hero is MISSING", rating(run(hiddenHero), "HERO_STRENGTH") === "MISSING");

  // ---------- call to action ----------
  const ctaOf = (overrides: EffectiveManualOverride[]) => run(build(rich(), { overrides }));
  check("label and destination give a STRONG call to action", rating(ctaOf(CTA_OVERRIDES), "CTA_AVAILABILITY") === "STRONG");
  check("a destination alone is ADEQUATE, a label alone is WEAK", rating(ctaOf([CTA_OVERRIDES[1]]), "CTA_AVAILABILITY") === "ADEQUATE" && rating(ctaOf([CTA_OVERRIDES[0]]), "CTA_AVAILABILITY") === "WEAK");
  check("a destination that is not http(s) does not count", rating(ctaOf([{ field: "trackingUrl", value: "javascript:void(0)" }]), "CTA_AVAILABILITY") === "MISSING");
  check("blank effective values do not count", rating(ctaOf([{ field: "cta", value: "  " }, { field: "trackingUrl", value: "" }]), "CTA_AVAILABILITY") === "MISSING");
  check("call-to-action material is MANUAL provenance", ctaOf(CTA_OVERRIDES).confidence === 1);

  // ---------- media ----------
  const mediaOf = (mutate: (f: ProductFacts) => void, assets: number) => {
    const f = rich();
    mutate(f);
    return run(build(f, { overrides: CTA_OVERRIDES, assets }));
  };
  check("an image and visual assets are STRONG", rating(mediaOf(() => undefined, 2), "MEDIA_AVAILABILITY") === "STRONG");
  check("an image alone is ADEQUATE", rating(mediaOf(() => undefined, 0), "MEDIA_AVAILABILITY") === "ADEQUATE");
  const noImage = (f: ProductFacts) => {
    f.productImageUrl = undefined;
    f.productImageProvenance = "NOT_FOUND";
  };
  check("visual assets without an image are WEAK, and nothing is MISSING", rating(mediaOf(noImage, 2), "MEDIA_AVAILABILITY") === "WEAK" && rating(mediaOf(noImage, 0), "MEDIA_AVAILABILITY") === "MISSING");
  const placeholder = (f: ProductFacts) => {
    f.productImageProvenance = "PLACEHOLDER";
  };
  check("a placeholder image is not media", rating(mediaOf(placeholder, 0), "MEDIA_AVAILABILITY") === "MISSING");
  const imageless = rich();
  noImage(imageless);
  const suppliedInputs = build(imageless, { overrides: CTA_OVERRIDES, assets: 0 });
  suppliedInputs.completeness = analyzeImportCompleteness({ facts: imageless, imageUrl: "https://example.test/other.png", imageProvenance: "MANUAL" });
  const supplied = run(suppliedInputs);
  check("an image the completeness report counts but facts do not hold is counted and warned", rating(supplied, "MEDIA_AVAILABILITY") === "ADEQUATE" && supplied.warnings.some((w) => w.startsWith("MEDIA_AVAILABILITY:")));

  // ---------- information density, balance, readiness ----------
  const rp = richPlan;
  const densityOf = (d: PresentationPlan["density"]) => rating(run({ ...build(rich()), presentationPlan: planWith(rp, ["description", "features", "ingredients", "usage", "pricing", "guarantee", "warnings", "manufacturer", "faq"], d) }), "INFORMATION_DENSITY");
  check("plan density maps LOW to WEAK, MEDIUM to ADEQUATE, HIGH and PREMIUM to STRONG", densityOf("LOW") === "WEAK" && densityOf("MEDIUM") === "ADEQUATE" && densityOf("HIGH") === "STRONG" && densityOf("PREMIUM") === "STRONG");
  const balanceOf = (visible: PlanSection[]) => run({ ...build(rich()), presentationPlan: planWith(rp, visible) });
  check("no planned content gives MISSING balance", rating(balanceOf([]), "SECTION_BALANCE") === "MISSING");
  check("one or two section groups is WEAK", rating(balanceOf(["features", "ingredients"]), "SECTION_BALANCE") === "WEAK" && rating(balanceOf(["features", "pricing"]), "SECTION_BALANCE") === "WEAK");
  check("three section groups is ADEQUATE", rating(balanceOf(["features", "pricing", "faq"]), "SECTION_BALANCE") === "ADEQUATE");
  check("all four section groups is STRONG", rating(balanceOf(["description", "features", "pricing", "faq"]), "SECTION_BALANCE") === "STRONG");
  check("the weak balance detail names the groups left out", balanceOf(["features", "ingredients"]).weaknesses.some((w) => w.startsWith("SECTION_BALANCE:") && w.includes("DESCRIBE") && w.includes("CONVERSION") && w.includes("REASSURANCE")));
  check("balance groups cover every content section and nothing else", JSON.stringify(Object.values(LP_POTENTIAL_BALANCE_GROUPS).flat().sort()) === JSON.stringify(PLAN_SECTIONS.filter((s) => s !== "hero" && s !== "closing").sort()));
  const readyOf = (visible: PlanSection[]) => run({ ...build(rich()), presentationPlan: planWith(rp, visible) });
  check("five supported content sections are STRONG readiness, three ADEQUATE, fewer WEAK", rating(readyOf(["description", "features", "ingredients", "pricing", "faq"]), "PRESENTATION_READINESS") === "STRONG" && rating(readyOf(["description", "features", "ingredients"]), "PRESENTATION_READINESS") === "ADEQUATE" && rating(readyOf(["description", "features"]), "PRESENTATION_READINESS") === "WEAK" && LP_POTENTIAL_THRESHOLDS.readinessStrongSections === 5 && LP_POTENTIAL_THRESHOLDS.readinessAdequateSections === 3);
  const unsupportedPlan = { ...build(base()), presentationPlan: planWith(rp, ["features", "faq", "pricing"]) };
  const unsupportedResult = run(unsupportedPlan);
  check("planned sections without material make readiness WEAK and are named", rating(unsupportedResult, "PRESENTATION_READINESS") === "WEAK" && ["features", "faq", "pricing"].every((s) => unsupportedResult.warnings.some((w) => w.startsWith("PRESENTATION_READINESS:") && w.includes(`shows ${s}`))));
  check("the rich plan shows features", rp.sectionVisibility.features === true);
  const mismatched = { ...build(rich()), presentationPlan: { ...rp, sectionOrder: rp.sectionOrder.filter((s) => s !== "features") } };
  const mismatchedResult = run(mismatched);
  check("a plan whose order and visibility disagree is WEAK and warned", rating(mismatchedResult, "PRESENTATION_READINESS") === "WEAK" && mismatchedResult.warnings.some((w) => w.includes("order and visibility disagree for features")));
  check("the platform plan hides FAQ that is not an authorized fact, so FAQ material alone never warns", rp.sectionVisibility.faq === false && rating(full, "FAQ_COVERAGE") === "STRONG" && full.warnings.length === 0);
  check("hidden sections that have material do not warn", run({ ...build(rich(), { overrides: CTA_OVERRIDES }), presentationPlan: planWith(rp, ["description", "features", "ingredients", "pricing", "faq"]) }).warnings.length === 0);

  // ---------- cross-checks ----------
  const lieAbsent = build(rich());
  lieAbsent.completeness = withSection(lieAbsent.completeness, "faq", { found: 0, status: "MISSING", quality: "MISSING" });
  check("completeness MISSING over held material warns and does not change the rating", rating(run(lieAbsent), "FAQ_COVERAGE") === "STRONG" && run(lieAbsent).warnings.some((w) => w.includes("completeness reports MISSING but ProductFacts holds material")));
  const lieHeld = build(base());
  lieHeld.completeness = withSection(lieHeld.completeness, "guarantee", { found: 1, status: "COMPLETE", quality: "GOOD" });
  check("completeness COMPLETE over absent material warns and does not change the rating", rating(run(lieHeld), "GUARANTEE_COVERAGE") === "MISSING" && run(lieHeld).warnings.some((w) => w.includes("completeness reports COMPLETE but ProductFacts holds no material")));

  const evidenceOfThin = analyzeEvidence({ facts: base() }, { now: clock });
  const disagree = { ...build(rich(), { overrides: CTA_OVERRIDES }), evidence: evidenceOfThin };
  const disagreeResult = run(disagree);
  check("an evidence result that disagrees warns and changes no rating", rating(disagreeResult, "FEATURE_COVERAGE") === "STRONG" && ["FEATURE_COVERAGE", "INGREDIENT_COVERAGE", "FAQ_COVERAGE", "GUARANTEE_COVERAGE", "PRICING_COVERAGE"].every((d) => disagreeResult.warnings.some((w) => w.startsWith(`${d}: ProductFacts holds material but the evidence result lists`))));
  const evidenceOfRich = analyzeEvidence({ facts: rich() }, { now: clock });
  const phantom = { ...build(base()), evidence: evidenceOfRich };
  check("an evidence result cannot add material", rating(run(phantom), "FEATURE_COVERAGE") === "MISSING" && run(phantom).warnings.some((w) => w.includes("evidence result lists FEATURES as available but ProductFacts holds no material")));
  const failedEvidence = { ...build(rich(), { overrides: CTA_OVERRIDES }), evidence: { ...evidenceOfRich, status: "FAILED" as const } };
  check("a failed evidence result is noted and not used", run(failedEvidence).warnings.includes("Evidence result is not COMPLETED and was not used.") && run(failedEvidence).warnings.length === 1);

  const pred = predictLpQuality({ facts: rich(), report: build(rich()).completeness });
  const predDisagree = { ...build(rich(), { overrides: CTA_OVERRIDES }), qualityPrediction: { ...pred, informationDensity: "Low" as const } };
  check("a quality prediction that disagrees on density warns and changes no rating", rating(run(predDisagree), "INFORMATION_DENSITY") === "STRONG" && run(predDisagree).warnings.some((w) => w.startsWith("INFORMATION_DENSITY:")));
  const predThin = { ...build(rich(), { overrides: CTA_OVERRIDES }), qualityPrediction: { ...pred, conversionReadiness: "Thin" as const, croReadiness: "Thin" as const } };
  check("a quality prediction that disagrees on readiness warns", run(predThin).warnings.some((w) => w.startsWith("PRESENTATION_READINESS:") && w.includes("Thin")));
  const predReady = { ...build(base()), qualityPrediction: { ...pred, conversionReadiness: "Ready" as const, croReadiness: "Ready" as const } };
  check("a ready prediction over a weak plan warns", run(predReady).warnings.some((w) => w.startsWith("PRESENTATION_READINESS:") && w.includes("Ready")));
  check("prediction labels are carried in metadata", run(predDisagree).metadata["predictor.informationDensity"] === "Low" && run(predDisagree).metadata.qualityPredictionSupplied === true);

  const overrideNotInFacts = build(base(), { overrides: [{ field: "features", value: ["Manual feature"] }, { field: "faq", value: [{ question: "Q?", answer: "A." }] }, { field: "description", value: "   " }] });
  const overrideResult = run(overrideNotInFacts);
  check("an effective manual value missing from the facts warns and adds no material", rating(overrideResult, "FEATURE_COVERAGE") === "MISSING" && overrideResult.warnings.some((w) => w.startsWith("features: an effective manual value exists")) && overrideResult.warnings.some((w) => w.startsWith("faq: an effective manual value exists")) && !overrideResult.warnings.some((w) => w.startsWith("description:")));
  check("only effective values with content are counted", overrideResult.metadata.manualOverrideFieldCount === 2);
  check("import warnings are carried", (() => { const f = rich(); f.importWarnings = ["one", "two"]; return run(build(f, { overrides: CTA_OVERRIDES })).warnings.includes("Import reported 2 warnings."); })());

  // ---------- validation ----------
  const good = build(rich());
  check("the three required inputs are enough", validateLandingPagePotentialInputs({ facts: good.facts, completeness: good.completeness, presentationPlan: good.presentationPlan }).length === 0);
  check("missing inputs are rejected", rejected(null, "inputs") && rejected(undefined, "inputs") && rejected("x", "inputs") && rejected([], "inputs"));
  check("missing ProductFacts is rejected", rejected({ ...good, facts: undefined }, "facts") && rejected({ ...good, facts: null }, "facts") && validateLandingPagePotentialInputs({ ...good, facts: null }).some((i) => i.message === "ProductFacts is required."));
  check("malformed ProductFacts is rejected", rejected({ ...good, facts: { productName: 5 } }, "facts") && rejected({ ...good, facts: { ...rich(), features: "x" } }, "facts") && rejected({ ...good, facts: { ...rich(), confidence: {} } }, "facts"));
  check("missing Presentation Plan is rejected", rejected({ ...good, presentationPlan: undefined }, "presentationPlan") && rejected({ ...good, presentationPlan: null }, "presentationPlan") && validateLandingPagePotentialInputs({ ...good, presentationPlan: null }).some((i) => i.message === "Presentation plan is required."));
  check("a malformed Presentation Plan is rejected", rejected({ ...good, presentationPlan: {} }, "presentationPlan") && rejected({ ...good, presentationPlan: { ...good.presentationPlan, sectionVisibility: { hero: true } } }, "presentationPlan") && rejected({ ...good, presentationPlan: { ...good.presentationPlan, sectionOrder: ["nope"] } }, "presentationPlan") && rejected({ ...good, presentationPlan: { ...good.presentationPlan, density: "HUGE" } }, "presentationPlan") && rejected({ ...good, presentationPlan: { ...good.presentationPlan, heroStrategy: "LOUD" } }, "presentationPlan"));
  check("missing Completeness Report is rejected", rejected({ ...good, completeness: undefined }, "completeness") && rejected({ ...good, completeness: null }, "completeness") && validateLandingPagePotentialInputs({ ...good, completeness: null }).some((i) => i.message === "Completeness report is required."));
  check("a malformed Completeness Report is rejected", rejected({ ...good, completeness: "report" }, "completeness") && rejected({ ...good, completeness: {} }, "completeness") && rejected({ ...good, completeness: { sections: [{ id: "nope", status: "COMPLETE", found: 1, recommended: 1 }] } }, "completeness") && rejected({ ...good, completeness: { sections: [{ id: "faq", status: "DONE", found: 1, recommended: 1 }] } }, "completeness") && rejected({ ...good, completeness: { sections: [{ id: "faq", status: "COMPLETE", found: -1, recommended: 1 }] } }, "completeness") && rejected({ ...good, completeness: { sections: [{ id: "faq", status: "COMPLETE", found: 1 }] } }, "completeness") && rejected({ ...good, completeness: { sections: [{ id: "faq", status: "COMPLETE", found: 1, recommended: 1 }, { id: "faq", status: "MISSING", found: 0, recommended: 1 }] } }, "completeness"));
  check("invalid metadata is rejected", rejected({ ...good, metadata: "m" }, "metadata") && rejected({ ...good, metadata: { a: { b: 1 } } }, "metadata") && rejected({ ...good, metadata: { a: [1] } }, "metadata") && rejected({ ...good, metadata: { a: Number.NaN } }, "metadata") && rejected({ ...good, metadata: { " ": "x" } }, "metadata") && rejected({ ...good, metadata: [] }, "metadata"));
  check("flat metadata is accepted", validateLandingPagePotentialInputs({ ...good, metadata: { run: "r1", count: 2, flag: true, none: null } }).length === 0);
  check("an invalid quality prediction is rejected", rejected({ ...good, qualityPrediction: "p" }, "qualityPrediction") && rejected({ ...good, qualityPrediction: { ...pred, informationDensity: "Huge" } }, "qualityPrediction") && rejected({ ...good, qualityPrediction: { ...pred, croReadiness: "Done" } }, "qualityPrediction"));
  check("an invalid evidence result is rejected", rejected({ ...good, evidence: "e" }, "evidence") && rejected({ ...good, evidence: { ...evidenceOfRich, status: "DONE" } }, "evidence") && rejected({ ...good, evidence: { ...evidenceOfRich, confidence: 2 } }, "evidence") && rejected({ ...good, evidence: { ...evidenceOfRich, availableDimensions: ["NOPE"] } }, "evidence") && rejected({ ...good, evidence: { ...evidenceOfRich, availableDimensions: ["FAQ"], missingDimensions: ["FAQ"] } }, "evidence"));
  check("invalid manual overrides are rejected", rejected({ ...good, manualOverrides: "o" }, "manualOverrides") && rejected({ ...good, manualOverrides: [{ field: "nope", value: "x" }] }, "manualOverrides") && rejected({ ...good, manualOverrides: [{ field: "cta" }] }, "manualOverrides") && rejected({ ...good, manualOverrides: [{ field: "cta", value: "a" }, { field: "cta", value: "b" }] }, "manualOverrides"));
  check("absent and null optional inputs are skipped", validateLandingPagePotentialInputs({ ...good, qualityPrediction: null, evidence: null, manualOverrides: null, metadata: undefined }).length === 0);
  let thrown: unknown = null;
  try {
    analyzeLandingPagePotential({ facts: null } as unknown as LandingPagePotentialInputs);
  } catch (error) {
    thrown = error;
  }
  check("the analyzer refuses invalid inputs with a LandingPagePotentialInputError", thrown instanceof LandingPagePotentialInputError && (thrown as LandingPagePotentialInputError).issues.length >= 3);

  // ---------- read-only, deterministic, score-free ----------
  const frozen = freezeDeep(JSON.parse(JSON.stringify({ ...build(rich(), { overrides: CTA_OVERRIDES, withPrediction: true, withEvidence: true }), metadata: { run: "r1" } }))) as LandingPagePotentialInputs;
  const before = JSON.stringify(frozen);
  const first = analyzeLandingPagePotential(frozen, { now: clock });
  check("analysis does not change frozen inputs, including ProductFacts", JSON.stringify(frozen) === before);
  check("analysis is deterministic", comparable(first) === comparable(analyzeLandingPagePotential(frozen, { now: clock })));
  check("input metadata is carried under input.", first.metadata["input.run"] === "r1");
  const noScores = {
    ...frozen,
    completeness: { ...frozen.completeness, score: 0, tone: "red" as const },
    qualityPrediction: { ...frozen.qualityPrediction!, score: 0, quality: "Poor" as const, confidence: 0 },
  };
  check("neither the completeness score nor the prediction score or quality is read", comparable(analyzeLandingPagePotential(noScores, { now: clock })) === comparable(first));
  const output = landingPagePotentialToSignalOutput(first);
  check("the framework output carries status, confidence, metadata, warnings, and no errors", output.status === "COMPLETED" && output.confidence === first.confidence && output.errors.length === 0 && !("executionTime" in output) && !("score" in output));
  check("strengths and weaknesses reach the framework through metadata", Object.keys(output.metadata).filter((k) => k.startsWith("strength.")).length === first.strengths.length);

  // ---------- the signal ----------
  const provider = (inputs: LandingPagePotentialInputs | null) => () => inputs;
  const signal = createLandingPagePotentialSignal({ provider: provider(build(rich())) });
  check("the signal satisfies the framework contract", validateSignalModule(signal).length === 0);
  check("the signal identity", signal.id === LANDING_PAGE_POTENTIAL_SIGNAL_ID && signal.id === "landing-page-potential" && signal.name === "Landing Page Potential" && signal.category === "LANDING_PAGE" && signal.version === "1.0.0");
  check("the signal requires nothing and conflicts with nothing", signal.dependencies.requires.length === 0 && signal.dependencies.conflicts.length === 0);
  check("the Evidence Signal is its only, optional, dependency", signal.dependencies.optional.join() === EVIDENCE_SIGNAL_ID);
  check("defaults: enabled and priority 90", signal.enabled === true && signal.priority === 90);
  check("options set enabled and priority", createLandingPagePotentialSignal({ provider: provider(null), enabled: false, priority: 7 }).enabled === false && createLandingPagePotentialSignal({ provider: provider(null), priority: 7 }).priority === 7);

  const candidate = { id: "cand-1", source: "feed", url: URL_A, title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
  const ctx = createSignalContext({ candidate });
  const emptyCtx = createSignalContext();
  check("the signal supports a context with a candidate only", signal.supportsCandidate(ctx) === true && signal.supportsCandidate(emptyCtx) === false);

  const richInputs = build(rich(), { overrides: CTA_OVERRIDES, withPrediction: true });
  const registry = createSignalRegistry();
  const entry = registerLandingPagePotentialSignal(registry, { provider: provider(richInputs) });
  check("the signal registers in a registry", entry.id === "landing-page-potential" && entry.enabled === true && registry.get("landing-page-potential")?.module.category === "LANDING_PAGE" && registry.list({ category: "LANDING_PAGE" }).length === 1);
  let duplicateRejected = false;
  try {
    registerLandingPagePotentialSignal(registry, { provider: provider(richInputs) });
  } catch (error) {
    duplicateRejected = error instanceof SignalFrameworkError;
  }
  check("registering the signal twice is rejected", duplicateRejected && registry.count() === 1);
  const pipeline = createSignalPipeline();
  registerLandingPagePotentialSignal(pipeline, { provider: provider(richInputs) });
  check("the signal registers in a pipeline with valid dependencies, the unregistered optional one being ignored", pipeline.registry.count() === 1 && pipeline.validateDependencies().length === 0 && pipeline.resolveExecutionOrder().order.join() === "landing-page-potential");
  check("the signal can be disabled and enabled like any other", pipeline.disable("landing-page-potential").enabled === false && pipeline.enable("landing-page-potential").enabled === true);
  check("a signal registered disabled stays disabled", registerLandingPagePotentialSignal(createSignalRegistry(), { provider: provider(richInputs), enabled: false }).enabled === false);

  const report = await pipeline.run(ctx);
  const lp = report.results[0];
  check("the pipeline runs the signal and collects a result", report.results.length === 1 && lp.signalId === "landing-page-potential" && lp.status === "COMPLETED" && typeof lp.executionTime === "number");
  check("the collected result carries the analysis", lp.confidence === 1 && lp.metadata.strongCount === 12 && lp.errors.length === 0 && !("score" in lp) && lp.metadata.evidenceSupplied === false);
  check("the collected result matches the standalone analysis", JSON.stringify(lp.metadata) === JSON.stringify(landingPagePotentialToSignalOutput(run(richInputs)).metadata));

  // independent execution
  const other: OpportunitySignalModule = {
    id: "other-fixture",
    name: "Other fixture",
    version: "1.0.0",
    category: "FUTURE",
    enabled: true,
    priority: 500,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsCandidate: () => true,
    validate: () => [],
    analyze: () => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors: ["fixture failure"] }),
  };
  const together = createSignalPipeline();
  registerLandingPagePotentialSignal(together, { provider: provider(richInputs) });
  together.register(other);
  const togetherReport = await together.run(ctx);
  const lpTogether = togetherReport.results.find((r) => r.signalId === "landing-page-potential")!;
  check("another signal failing does not change the Landing Page Potential result", togetherReport.results.find((r) => r.signalId === "other-fixture")?.status === "FAILED" && JSON.stringify({ ...lpTogether, executionTime: 0 }) === JSON.stringify({ ...lp, executionTime: 0 }));
  together.disable("other-fixture");
  check("the signal runs alone when others are disabled", (await together.run(ctx)).results.map((r) => r.signalId).join() === "landing-page-potential");
  const direct = await executeSignal(createLandingPagePotentialSignal({ provider: provider(richInputs) }), ctx, {});
  check("the executor runs the signal with no pipeline", direct.status === "COMPLETED" && direct.metadata.strongCount === 12);
  check("the executor skips a context with no candidate", (await executeSignal(signal, emptyCtx, {})).status === "SKIPPED");

  // alongside the Evidence Signal
  const evidenceProvider = (facts: ProductFacts) => () => ({ facts });
  const duo = createSignalPipeline();
  registerLandingPagePotentialSignal(duo, { provider: provider(build(rich(), { overrides: CTA_OVERRIDES })), priority: 1000 });
  registerEvidenceSignal(duo, { provider: evidenceProvider(rich()), priority: 1 });
  check("a registered Evidence Signal is ordered first whatever the priorities", duo.validateDependencies().length === 0 && duo.resolveExecutionOrder().order.join() === "evidence,landing-page-potential");
  const duoReport = await duo.run(ctx);
  const lpDuo = duoReport.results.find((r) => r.signalId === "landing-page-potential")!;
  check("both signals complete, each with its own result", duoReport.results.length === 2 && duoReport.results.every((r) => r.status === "COMPLETED"));
  check("the Evidence result is read from the pipeline and used as a cross-check", lpDuo.metadata.evidenceSupplied === true && lpDuo.metadata.evidenceSource === "upstream" && lpDuo.warnings.length === 0 && lpDuo.metadata.strongCount === 12);
  const evidenceAlone = createSignalPipeline();
  registerEvidenceSignal(evidenceAlone, { provider: evidenceProvider(rich()) });
  const evidenceAloneResult = (await evidenceAlone.run(ctx)).results[0];
  check("the Evidence Signal result is unchanged by the Landing Page Potential Signal", JSON.stringify({ ...duoReport.results.find((r) => r.signalId === "evidence")!, executionTime: 0 }) === JSON.stringify({ ...evidenceAloneResult, executionTime: 0 }));
  const suppliedEvidence = createSignalPipeline();
  registerLandingPagePotentialSignal(suppliedEvidence, { provider: provider({ ...build(rich(), { overrides: CTA_OVERRIDES }), evidence: analyzeEvidence({ facts: rich() }, { now: clock }) }) });
  registerEvidenceSignal(suppliedEvidence, { provider: evidenceProvider(base()) });
  const suppliedResult = (await suppliedEvidence.run(ctx)).results.find((r) => r.signalId === "landing-page-potential")!;
  check("an evidence result supplied by the provider wins over the pipeline's", suppliedResult.metadata.evidenceSource === "input" && suppliedResult.warnings.length === 0);
  const conflicting = createSignalPipeline();
  registerLandingPagePotentialSignal(conflicting, { provider: provider(build(rich(), { overrides: CTA_OVERRIDES })) });
  registerEvidenceSignal(conflicting, { provider: evidenceProvider(base()) });
  const conflictResult = (await conflicting.run(ctx)).results.find((r) => r.signalId === "landing-page-potential")!;
  check("an upstream Evidence result that disagrees raises warnings and changes no rating", conflictResult.metadata.evidenceSource === "upstream" && conflictResult.metadata.strongCount === 12 && conflictResult.warnings.some((w) => w.includes("the evidence result lists")));
  const brokenEvidence = createSignalPipeline();
  registerLandingPagePotentialSignal(brokenEvidence, { provider: provider(build(rich(), { overrides: CTA_OVERRIDES })) });
  registerEvidenceSignal(brokenEvidence, { provider: () => null });
  const brokenReport = await brokenEvidence.run(ctx);
  const brokenLp = brokenReport.results.find((r) => r.signalId === "landing-page-potential")!;
  check("a failed Evidence Signal does not stop or change the Landing Page Potential result", brokenReport.results.find((r) => r.signalId === "evidence")?.status === "FAILED" && brokenLp.status === "COMPLETED" && brokenLp.metadata.evidenceSupplied === false && brokenLp.metadata.strongCount === 12);
  const disabledEvidence = createSignalPipeline();
  registerLandingPagePotentialSignal(disabledEvidence, { provider: provider(build(rich(), { overrides: CTA_OVERRIDES })) });
  registerEvidenceSignal(disabledEvidence, { provider: evidenceProvider(rich()), enabled: false });
  const disabledReport = await disabledEvidence.run(ctx);
  check("a disabled Evidence Signal leaves the Landing Page Potential Signal running alone", disabledReport.results.map((r) => r.signalId).join() === "landing-page-potential" && disabledReport.results[0].metadata.evidenceSupplied === false);
  check("the Evidence Signal never depends on this one", createEvidenceSignal({ provider: () => null }).dependencies.optional.length === 0);

  const failing = async (label: string, p: () => unknown, pattern: RegExp) => {
    const result = await executeSignal(createLandingPagePotentialSignal({ provider: p as () => LandingPagePotentialInputs | null }), ctx, {});
    check(label, result.status === "FAILED" && pattern.test(result.errors.join(" ")));
  };
  await failing("a provider with no inputs is rejected", () => null, /inputs/);
  await failing("missing ProductFacts is rejected through the framework", () => ({ ...good, facts: null }), /ProductFacts is required/);
  await failing("a missing Presentation Plan is rejected through the framework", () => ({ ...good, presentationPlan: undefined }), /Presentation plan is required/);
  await failing("a missing Completeness Report is rejected through the framework", () => ({ ...good, completeness: undefined }), /Completeness report is required/);
  await failing("invalid metadata is rejected through the framework", () => ({ ...good, metadata: { a: {} } }), /Metadata is invalid/);
  await failing("an invalid evidence result is rejected through the framework", () => ({ ...good, evidence: { status: "DONE" } }), /Evidence result is invalid/);
  await failing("a throwing provider becomes a FAILED result", () => { throw new Error("provider down"); }, /provider down/);
  let calls = 0;
  const seenContexts: unknown[] = [];
  const counting = createLandingPagePotentialSignal({ provider: (c) => { calls += 1; seenContexts.push(c); return richInputs; } });
  await executeSignal(counting, ctx, {});
  check("the provider receives the shared context and is only read", calls === 2 && seenContexts.every((c) => c === ctx));

  // ---------- drift against the platform ----------
  check("densities match the platform", JSON.stringify(LP_POTENTIAL_DENSITIES) === JSON.stringify([...PRODUCT_DENSITIES]));
  check("hero strategies match the platform", JSON.stringify(LP_POTENTIAL_HERO_STRATEGIES) === JSON.stringify([...HERO_STRATEGIES]));
  check("predictor labels match the platform", JSON.stringify(LP_POTENTIAL_DENSITY_LABELS) === JSON.stringify([...DENSITY_LABELS]) && JSON.stringify(LP_POTENTIAL_READINESS_LABELS) === JSON.stringify([...READINESS_LABELS]));
  check("override fields match the platform", JSON.stringify(LP_POTENTIAL_OVERRIDE_FIELDS) === JSON.stringify([...OVERRIDE_FIELDS]));
  check("authoritative provenances match the platform's copy-eligible provenances", JSON.stringify([...LP_POTENTIAL_AUTHORITATIVE_PROVENANCES].sort()) === JSON.stringify([...CONSUMER_COPY_ALLOWED_PROVENANCE].sort()));
  check("the evidence dimensions this signal cross-checks exist", ["FEATURES", "INGREDIENTS", "FAQ", "GUARANTEE", "PRICING"].every((d) => (EVIDENCE_DIMENSIONS as readonly string[]).includes(d)));

  // ---------- replay of products (read-only) ----------
  for (const label of ["Joint Genesis", "Prodentim", "Neuro Serge", "Audifort", "Prime Biome"]) {
    const stored = storedFactsFiles(label);
    const fixture = stored.length === 0;
    if (!fixture) check(`${label}: stored ProductFacts found`, true);
    else console.log(`NOTE: ${label}: no stored ProductFacts exist in the repository; replaying the platform's own test fixture (a name and one feature), which is not stored evidence.`);
    const replays = fixture
      ? [{ file: "(platform test fixture)", facts: Object.assign(emptyProductFacts(label, "https://example.test/item", "IMPORTED"), { features: ["Daily capsule"] }) }]
      : stored;
    let ok = true;
    let sample = "";
    for (const { facts: stored1 } of replays) {
      const snapshot = JSON.stringify(stored1);
      const completeness = analyzeImportCompleteness({ facts: stored1 });
      const plan = planPresentation(stored1, analyzeProductProfile(stored1));
      const all: LandingPagePotentialInputs = {
        facts: stored1,
        completeness,
        presentationPlan: plan,
        qualityPrediction: predictLpQuality({ facts: stored1, report: completeness }),
        evidence: analyzeEvidence({ facts: stored1, completeness, presentationPlan: plan }, { now: clock }),
        manualOverrides: [],
      };
      const valid = validateLandingPagePotentialInputs(all).length === 0;
      const a = analyzeLandingPagePotential(all, { now: clock });
      const b = analyzeLandingPagePotential(all, { now: clock });
      const ratings = LP_POTENTIAL_DIMENSIONS.map((d) => rating(a, d) as string);
      const allowed = ratings.every((r) => LP_POTENTIAL_RATINGS.includes(r as never));
      const listed = a.strengths.length === ratings.filter((r) => r === "STRONG").length && a.weaknesses.length === ratings.filter((r) => r === "WEAK" || r === "MISSING").length;
      const c = stored1.confidence;
      const has = (items: string[], prov: string) => items.some((f) => f.trim() && f.toUpperCase() !== "NOT_FOUND") && prov !== "NOT_FOUND";
      const derived =
        (rating(a, "FEATURE_COVERAGE") !== "MISSING") === has(stored1.features, c.features) &&
        (rating(a, "INGREDIENT_COVERAGE") !== "MISSING") === has(stored1.ingredientsOrComponents, c.ingredientsOrComponents) &&
        (rating(a, "GUARANTEE_COVERAGE") !== "MISSING") === has([stored1.guaranteeInformation ?? ""], c.guaranteeInformation);
      const sections = a.missingSections.every((s) => ["hero", "features", "ingredients", "offers", "pricing", "faq", "guarantee", "cta", "media"].includes(s));
      const ctaMissing = rating(a, "CTA_AVAILABILITY") === "MISSING" && a.missingSections.includes("cta");
      const scoreFree = comparable(analyzeLandingPagePotential({ ...all, completeness: { ...completeness, score: 0 }, qualityPrediction: { ...all.qualityPrediction!, score: 0 } }, { now: clock })) === comparable(a);
      ok = ok && valid && comparable(a) === comparable(b) && JSON.stringify(stored1) === snapshot && allowed && listed && derived && sections && ctaMissing && scoreFree && a.status === "COMPLETED";
      if (!sample) sample = `${LP_POTENTIAL_DIMENSIONS.map((d, i) => `${d.split("_")[0]}=${ratings[i][0]}`).join(" ")} | confidence ${a.confidence} | ${a.warnings.length} warning(s) | missing: ${a.missingSections.join(",") || "none"}`;
    }
    check(`${label}: replay is valid, read-only, deterministic, and consistent with provenance (${replays.length} ${fixture ? "fixture" : `stored file${replays.length === 1 ? "" : "s"}`})`, ok);
    console.log(`  ${label} -> ${sample}`);
  }

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/opportunity");
  const files = walk(dir).filter((f) => /[\\/]landing-page-potential-[a-z]+\.ts$/.test(f));
  check("four modules exist: signal, analyzer, result, validator", files.map((f) => f.split(/[\\/]/).pop()).sort().join() === "landing-page-potential-analyzer.ts,landing-page-potential-result.ts,landing-page-potential-signal.ts,landing-page-potential-validator.ts");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const code = lines.filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no campaign ids, marketplaces, or slugs", !lines.some((l) => /campaign|clickbank|hotmart|amazon|shopify|ebay|aliexpress|walmart|digistore|slug/i.test(l)));
  check("no Google Ads, competition, intent, or market analysis", !code.some((l) => /google|adwords|gclid|keyword|competit|commercial|marketAnaly/i.test(l)));
  check("no scoring, ranking, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank|recommendation|\brecommend\b/i.test(l)));
  check("no AI, network, crawling, database, timers, or file writes", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots/i.test(l)));
  check("no randomness or wall-clock reads", !code.some((l) => /Math\.random|Date\.now|new Date\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 12);
  check("platform imports are type-only", imports.filter((i) => i.from.startsWith("@/")).every((i) => i.typeOnly) && imports.some((i) => i.from.startsWith("@/")));
  const platform = [...new Set(imports.filter((i) => i.from.startsWith("@/")).map((i) => i.from))].sort();
  check("platform imports are only the existing outputs the signal reads", platform.join() === "@/lib/completeness-engine,@/lib/lp-quality-predictor,@/lib/manual-overrides,@/lib/presentation-plan,@/lib/product-facts,@/lib/product-profile");
  check("nothing imports the LP Builder, Discovery, Importer, Grounding, Policy, Publication, Tracking, or Analytics", !imports.some((i) => /lp-builder|discovery|import|grounding|policy|publication|tracking|analytics|db/i.test(i.from.replace(/^@\/lib\/(completeness-engine|lp-quality-predictor|manual-overrides|presentation-plan|product-facts|product-profile)$/, ""))));
  check("other imports stay inside opportunity", imports.filter((i) => !i.from.startsWith("@/")).every((i) => i.from.startsWith("./")));
  check("the code never assigns into inputs or facts", !code.some((l) => /\b(inputs|facts|plan|completeness)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("no in-place array mutation of inputs", !code.some((l) => /\.(push|splice|sort|reverse)\(/.test(l) && /(facts|plan|completeness|inputs|overrides)\.[A-Za-z.]+\.(splice|sort|reverse)\(/.test(l)));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nLanding page potential signal: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
