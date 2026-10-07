import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeImportCompleteness } from "../src/lib/completeness-engine.ts";
import { PRODUCT_CLASSES, STRUCTURAL_CLASSES, COMPARISON_CLASSES, type ContentSection } from "../src/lib/content-boundary.ts";
import { MARKET_RESEARCH_QUALITIES, MARKET_RESEARCH_STATUSES, type MarketResearchReport } from "../src/lib/market-research/types.ts";
import { PLAN_SECTIONS, planPresentation } from "../src/lib/presentation-plan.ts";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import {
  CONSUMER_COPY_ALLOWED_PROVENANCE,
  emptyProductFacts,
  type FactConfidence,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { analyzeEvidence, EVIDENCE_AUTHORITATIVE_PROVENANCES, EvidenceInputError } from "../src/lib/opportunity/evidence-analyzer.ts";
import { evidenceResultToSignalOutput, EVIDENCE_DIMENSIONS, type EvidenceInputs } from "../src/lib/opportunity/evidence-result.ts";
import { createEvidenceSignal, EVIDENCE_SIGNAL_ID, registerEvidenceSignal } from "../src/lib/opportunity/evidence-signal.ts";
import {
  EVIDENCE_BOUNDARY_CLASSES,
  EVIDENCE_COMPLETENESS_SECTIONS,
  EVIDENCE_FACT_FIELDS,
  EVIDENCE_PLAN_SECTIONS,
  validateEvidenceInputs,
} from "../src/lib/opportunity/evidence-validator.ts";
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

function base(): ProductFacts {
  return emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
}

function operationalFact(statement: string, provenance: FactConfidence = "DIRECT_SOURCE", extra: Record<string, unknown> = {}) {
  return {
    statement,
    kind: "OTHER" as const,
    provenance,
    copyEligibility: "YES" as const,
    policyFindings: [],
    sourceUrl: "https://example.test/ops",
    sourcePageCategory: "RETURNS" as const,
    ...extra,
  };
}

function rich(): ProductFacts {
  const facts = base();
  facts.features = ["Soft grip", "Steel body"];
  facts.ingredientsOrComponents = ["Leaf extract"];
  facts.usageInformation = ["Use once a day."];
  facts.cautions = ["Keep dry."];
  facts.description = "A fictional gizmo.";
  facts.pricingInformation = "$49 each";
  facts.guaranteeInformation = "Thirty-day guarantee.";
  facts.manufacturer = "Fictional Works";
  facts.returnsInformation = [operationalFact("Returns are accepted within thirty days.")];
  facts.shippingInformation = [operationalFact("Ships in three days.", "DIRECT_SOURCE", { sourcePageCategory: "SHIPPING" })];
  facts.sourceSnippets = [{ field: "faq", question: "How is it used?", text: "Once a day.", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" }];
  for (const field of ["features", "ingredientsOrComponents", "usageInformation", "cautions", "description", "pricingInformation", "guaranteeInformation", "manufacturer"] as const) {
    facts.confidence[field] = "DIRECT_SOURCE";
  }
  return facts;
}

function inputs(facts: ProductFacts, extra: Partial<EvidenceInputs> = {}): EvidenceInputs {
  return { facts, ...extra };
}

function run(facts: ProductFacts, extra: Partial<EvidenceInputs> = {}) {
  return analyzeEvidence(inputs(facts, extra), { now: clock });
}

function state(result: ReturnType<typeof run>, dimension: string) {
  return result.metadata[`dimension.${dimension}`];
}

function rejected(value: unknown, field: string): boolean {
  return validateEvidenceInputs(value).some((issue) => issue.field === field);
}

function researchReport(over: Partial<MarketResearchReport> = {}): MarketResearchReport {
  return {
    productName: "Gizmo Prime",
    researchedAt: "2026-01-01T00:00:00.000Z",
    status: "FRESH",
    quality: "MEDIUM",
    queriesUsed: [],
    queryFamilies: [],
    queryOutcomes: [],
    providerMix: { DDG_QUERY_SUCCESS: 0, BRAVE_FALLBACK_ATTEMPTS: 0, BRAVE_FALLBACK_SUCCESS: 0, BRAVE_FALLBACK_FAILED: 0 },
    sources: [],
    signals: {
      currentPositioning: [],
      categoryPositioning: [],
      commonQuestions: [],
      purchaseConsiderations: [],
      commonObjections: [],
      recurringTerminology: [],
      competitorMessaging: [],
      reviewOrientedResults: 0,
      educationalResults: 0,
      buyerGuideResults: 0,
      observedIntents: [],
    },
    diversity: {
      UNIQUE_DOMAINS: 0,
      SOURCE_CLASS_DIVERSITY: 0,
      SOURCE_CLASSES: [],
      PROMOTIONAL_SOURCES: 0,
      PROMOTIONAL_SOURCE_RATIO: 0,
      PROMOTIONAL_PATTERN_DETECTED: false,
      SEARCH_RESULTS_TOTAL: 0,
      USABLE_SOURCES: 0,
    },
    searchProvider: { name: "fixture", configured: false, realWebSearchAvailable: false },
    maxAgeHours: 24,
    discardedFabrications: [],
    ...over,
  };
}

function section(classification: ContentSection["classification"], confidence: ContentSection["confidence"] = "HIGH"): ContentSection {
  return { classification, confidence, origin: "HEADING_OWNERSHIP", start: 0, end: 1, labels: [] };
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

const comparable = (r: ReturnType<typeof run>) => JSON.stringify({ ...r, executionTime: 0 });

async function main() {
  // ---------- shape ----------
  check("eleven evidence dimensions", EVIDENCE_DIMENSIONS.join(",") === "INGREDIENTS,FEATURES,FAQ,GUARANTEE,PRICING,RETURNS,WARNINGS,SHIPPING,MANUFACTURER,SUPPORTING_CONTENT,EVIDENCE_SOURCES");

  // ---------- full evidence ----------
  const full = run(rich());
  check("a fully evidenced product has every dimension", full.availableDimensions.length === 11 && full.missingDimensions.length === 0);
  check("full evidence from direct sources gives confidence 1", full.confidence === 1 && full.status === "COMPLETED");
  check("a result has exactly the required fields", Object.keys(full).sort().join(",") === "availableDimensions,confidence,executionTime,metadata,missingDimensions,status,warnings");
  check("a result has no score or recommendation anywhere", !/score|recommend/i.test(JSON.stringify(Object.keys(full)) + JSON.stringify(Object.keys(full.metadata))));
  check("result metadata is flat", Object.values(full.metadata).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  check("metadata lists dimensions, counts, and the provenance note", full.metadata.availableDimensions === EVIDENCE_DIMENSIONS.join(",") && full.metadata.missingDimensions === "" && full.metadata.availableCount === 11 && /not independently verified/.test(String(full.metadata.provenanceNote)));
  check("full evidence produces no warnings", full.warnings.length === 0);
  check("per-dimension counts are reported", full.metadata["count.FEATURES"] === 2 && full.metadata["count.INGREDIENTS"] === 1 && full.metadata["count.GUARANTEE"] === 1);
  check("executionTime comes from the clock", run(rich()).executionTime === 0 && analyzeEvidence(inputs(rich()), { now: (() => { let t = 0; return () => (t += 7); })() }).executionTime === 7);

  // ---------- thin and empty evidence ----------
  const thin = run(base());
  check("only a recorded source is available on an otherwise empty import", thin.availableDimensions.join() === "EVIDENCE_SOURCES" && thin.missingDimensions.length === 10);
  const manual = emptyProductFacts("Gizmo Prime", "", "MANUAL");
  const none = run(manual);
  check("a manual product with nothing recorded has no available dimension", none.availableDimensions.length === 0 && none.missingDimensions.length === 11);
  check("no evidence gives null confidence, a warning, and still COMPLETED", none.confidence === null && none.status === "COMPLETED" && none.warnings.includes("No evidence dimension is available."));
  check("low evidence is reported, not padded", thin.metadata.availableCount === 1 && thin.metadata.missingCount === 10);

  // ---------- provenance quality ----------
  const mixed = rich();
  mixed.confidence.features = "HEURISTIC_EXTRACTION";
  mixed.confidence.manufacturer = "AI_SOURCE_CLASSIFICATION";
  const mixedResult = run(mixed);
  check("heuristic provenance is available but not authoritative", state(mixedResult, "FEATURES") === "AVAILABLE_OTHER" && state(mixedResult, "INGREDIENTS") === "AVAILABLE_AUTHORITATIVE");
  check("AI-classified provenance is available but not authoritative", state(mixedResult, "MANUFACTURER") === "AVAILABLE_OTHER");
  check("confidence is the authoritative share of available dimensions", mixedResult.confidence === Math.round((9 / 11) * 1000) / 1000 && mixedResult.metadata.authoritativeCount === 9);
  check("weak provenance is named in a warning", mixedResult.warnings.some((w) => w.startsWith("FEATURES:") && w.includes("HEURISTIC_EXTRACTION")) && mixedResult.warnings.some((w) => w.startsWith("MANUFACTURER:") && w.includes("AI_SOURCE_CLASSIFICATION")));
  const manualFacts = rich();
  manualFacts.confidence.features = "MANUAL";
  check("manual provenance counts as authoritative", state(run(manualFacts), "FEATURES") === "AVAILABLE_AUTHORITATIVE");
  const mixedReturns = rich();
  mixedReturns.returnsInformation = [operationalFact("Returns within thirty days."), operationalFact("Refund after inspection.", "HEURISTIC_EXTRACTION")];
  check("one weak item makes a whole operational dimension non-authoritative", state(run(mixedReturns), "RETURNS") === "AVAILABLE_OTHER" && run(mixedReturns).metadata["count.RETURNS"] === 2);
  const blocked = rich();
  blocked.returnsInformation = [operationalFact("Returns within thirty days.", "DIRECT_SOURCE", { copyEligibility: "NO" })];
  check("statements all marked not copy-eligible are flagged", run(blocked).warnings.some((w) => w.startsWith("RETURNS:") && /not eligible for copy/.test(w)));

  // ---------- NOT_FOUND is closed ----------
  const closed = rich();
  closed.confidence.features = "NOT_FOUND";
  const closedResult = run(closed);
  check("values under NOT_FOUND provenance are not evidence", state(closedResult, "FEATURES") === "MISSING" && closedResult.missingDimensions.includes("FEATURES"));
  check("the suppressed values are reported", closedResult.warnings.some((w) => w.startsWith("FEATURES:") && /NOT_FOUND/.test(w)));
  const resurrect = run(closed, {
    completeness: analyzeImportCompleteness({ facts: rich() }),
    presentationPlan: planPresentation(rich(), analyzeProductProfile(rich())),
    boundary: [section("FEATURE")],
  });
  check("no other input can bring NOT_FOUND evidence back", state(resurrect, "FEATURES") === "MISSING");

  // ---------- dimension rules ----------
  const offersOnly = base();
  offersOnly.offerFacts = [{ packageName: "Single", unitPrice: "$49", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" }];
  check("an offer with a price is pricing evidence", state(run(offersOnly), "PRICING") === "AVAILABLE_AUTHORITATIVE");
  const priceNotFound = base();
  priceNotFound.pricingInformation = "$10";
  check("pricing text under NOT_FOUND is not evidence", state(run(priceNotFound), "PRICING") === "MISSING");
  const priceAndOffer = base();
  priceAndOffer.pricingInformation = "$10";
  priceAndOffer.offerFacts = offersOnly.offerFacts;
  check("an offer still counts when the pricing text is NOT_FOUND", state(run(priceAndOffer), "PRICING") === "AVAILABLE_AUTHORITATIVE");
  const noPrice = base();
  noPrice.offerFacts = [{ packageName: "Single", unitPrice: "", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" }];
  check("an offer without a price is not pricing evidence", state(run(noPrice), "PRICING") === "MISSING");

  const faqFacts = base();
  faqFacts.sourceSnippets = [
    { field: "faq", question: "How?", text: "Like so.", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" },
    { field: "faq", question: "how?", text: "like so.", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" },
    { field: "faq", question: "Why?", text: "Because.", sourceUrl: URL_A, confidence: "NOT_FOUND" },
    { field: "features", question: "Other?", text: "Not faq.", sourceUrl: URL_A, confidence: "DIRECT_SOURCE" },
  ];
  const faqResult = run(faqFacts);
  check("FAQ counts distinct faq snippets only, and skips NOT_FOUND", faqResult.metadata["count.FAQ"] === 1 && state(faqResult, "FAQ") === "AVAILABLE_AUTHORITATIVE");
  const faqFromOps = base();
  faqFromOps.returnsInformation = [operationalFact("Returns within thirty days.", "DIRECT_SOURCE", { question: "Can I return it?" })];
  check("an answered question on an operational fact is FAQ evidence", state(run(faqFromOps), "FAQ") === "AVAILABLE_AUTHORITATIVE");

  const sources = base();
  sources.sourceUrl = "not a url";
  sources.sourceSnippets = [
    { field: "features", text: "x", sourceUrl: "https://example.test/a", confidence: "DIRECT_SOURCE" },
    { field: "features", text: "y", sourceUrl: "https://example.test/a", confidence: "DIRECT_SOURCE" },
    { field: "features", text: "z", sourceUrl: "ftp://example.test/b", confidence: "DIRECT_SOURCE" },
    { field: "features", text: "w", sourceUrl: "https://example.test/c", confidence: "DIRECT_SOURCE" },
  ];
  check("evidence sources count distinct http(s) locations", run(sources).metadata.sourceCount === 2 && state(run(sources), "EVIDENCE_SOURCES") === "AVAILABLE_AUTHORITATIVE");
  check("a manual product has no recorded source", state(none, "EVIDENCE_SOURCES") === "MISSING");

  const support = base();
  support.productFormat = { value: "Capsule", statement: "Sold as capsules.", provenance: "DIRECT_SOURCE", copyEligibility: "YES", policyFindings: [], sourceUrl: URL_A, sourcePageCategory: "PRIMARY" };
  check("product format is supporting content", state(run(support), "SUPPORTING_CONTENT") === "AVAILABLE_AUTHORITATIVE");
  const importWarn = rich();
  importWarn.importWarnings = ["Something was not extracted.", "Another gap."];
  const importWarnResult = run(importWarn);
  check("import warnings are counted and reported", importWarnResult.metadata.importWarningCount === 2 && importWarnResult.warnings.includes("Import reported 2 warnings."));
  const blankValues = base();
  blankValues.features = ["  ", "NOT_FOUND", ""];
  blankValues.confidence.features = "DIRECT_SOURCE";
  check("blank and NOT_FOUND text are not evidence", state(run(blankValues), "FEATURES") === "MISSING");

  // ---------- cross-checks ----------
  const facts = rich();
  const coherent = run(facts, {
    completeness: analyzeImportCompleteness({ facts }),
    presentationPlan: planPresentation(facts, analyzeProductProfile(facts)),
    boundary: [section("INGREDIENT"), section("FEATURE"), section("FAQ"), section("PAGE_STRUCTURE")],
  });
  check("coherent completeness, plan, and boundary add no warnings", coherent.warnings.length === 0);
  check("boundary sections that match evidence are counted", coherent.metadata.boundaryCorroborated === 3 && coherent.metadata.boundarySupplied === true && coherent.metadata.completenessSupplied === true && coherent.metadata.presentationPlanSupplied === true);

  const thinFacts = base();
  const completenessOfRich = analyzeImportCompleteness({ facts: rich() });
  const disagree = run(thinFacts, { completeness: completenessOfRich });
  check("completeness that reports evidence ProductFacts lacks is flagged", disagree.warnings.some((w) => w.startsWith("FEATURES:") && /completeness reports/.test(w)));
  const completenessOfThin = analyzeImportCompleteness({ facts: thinFacts });
  check("completeness that reports MISSING for held evidence is flagged", run(rich(), { completeness: completenessOfThin }).warnings.some((w) => w.startsWith("FEATURES:") && /completeness reports MISSING/.test(w)));
  const scoreA = run(rich(), { completeness: { ...completenessOfRich, score: 0 } });
  const scoreB = run(rich(), { completeness: { ...completenessOfRich, score: 99 } });
  check("the completeness score is never read", comparable(scoreA) === comparable(scoreB));

  const planOfRich = planPresentation(rich(), analyzeProductProfile(rich()));
  const planMismatch = run(thinFacts, { presentationPlan: planOfRich });
  check("a plan that shows a section without evidence is flagged", planMismatch.warnings.some((w) => w.startsWith("FEATURES:") && /presentation plan shows/.test(w)));
  const hiddenPlan = planPresentation(thinFacts, analyzeProductProfile(thinFacts));
  check("a plan that hides a section with evidence is not a warning", !run(rich(), { presentationPlan: hiddenPlan }).warnings.some((w) => /presentation plan/.test(w)));

  const gap = run(thinFacts, { boundary: [section("FAQ"), section("RETURN_POLICY", "MEDIUM"), section("SHIPPING", "LOW")] });
  check("a source-page section with no extracted evidence is flagged", gap.warnings.some((w) => w.startsWith("FAQ:")) && gap.warnings.some((w) => w.startsWith("RETURNS:")));
  check("a low-confidence boundary section is ignored", !gap.warnings.some((w) => w.startsWith("SHIPPING:")));
  check("structural boundary classes are ignored", run(thinFacts, { boundary: [section("FOOTER"), section("COOKIE"), section("COMPARISON_TABLE")] }).warnings.length === 0);

  const withResearch = run(rich(), { research: researchReport({ diversity: { ...researchReport().diversity, USABLE_SOURCES: 3 }, quality: "HIGH" }) });
  check("research is reported as context, not as evidence", withResearch.metadata.researchSupplied === true && withResearch.metadata.researchStatus === "FRESH" && withResearch.metadata.researchQuality === "HIGH" && withResearch.metadata.researchUsableSources === 3 && withResearch.warnings.length === 0);
  check("research never adds an evidence dimension", run(base(), { research: researchReport({ diversity: { ...researchReport().diversity, USABLE_SOURCES: 9 } }) }).availableDimensions.join() === "EVIDENCE_SOURCES");
  check("stale research is flagged", run(rich(), { research: researchReport({ status: "STALE" }) }).warnings.includes("Research is stale."));
  check("unavailable research is flagged", run(rich(), { research: researchReport({ status: "UNAVAILABLE" }) }).warnings.includes("Research is unavailable."));
  check("research for another product name is flagged", run(rich(), { research: researchReport({ productName: "Other Thing" }) }).warnings.includes("Research was run for a different product name than ProductFacts."));
  check("research names compare ignoring case and spacing", run(rich(), { research: researchReport({ productName: "  gizmo   PRIME " }) }).warnings.length === 0);
  check("absent and null optional inputs are the same", comparable(run(rich(), { completeness: null, research: null, presentationPlan: null, boundary: null })) === comparable(run(rich())));

  // ---------- validation ----------
  check("a valid input has no issues", validateEvidenceInputs(inputs(rich())).length === 0);
  check("missing inputs are rejected", rejected(null, "inputs") && rejected(undefined, "inputs") && rejected("facts", "inputs"));
  check("missing ProductFacts is rejected", rejected({}, "facts") && rejected({ facts: null }, "facts") && rejected({ facts: undefined }, "facts"));
  check("a non-object ProductFacts is rejected", rejected({ facts: "facts" }, "facts") && rejected({ facts: [] }, "facts"));
  const invalidFacts = (mutate: (f: Record<string, unknown>) => void) => {
    const copy = JSON.parse(JSON.stringify(rich())) as Record<string, unknown>;
    mutate(copy);
    return rejected({ facts: copy }, "facts");
  };
  check("ProductFacts without confidence is rejected", invalidFacts((f) => delete f.confidence));
  check("ProductFacts with an unknown provenance is rejected", invalidFacts((f) => ((f.confidence as Record<string, unknown>).features = "GUESSED")));
  check("ProductFacts with a missing field provenance is rejected", invalidFacts((f) => delete (f.confidence as Record<string, unknown>).manufacturer));
  check("ProductFacts with a non-list field is rejected", invalidFacts((f) => (f.features = "not a list")));
  check("ProductFacts with non-text list items is rejected", invalidFacts((f) => (f.cautions = [1])));
  check("ProductFacts with malformed snippets is rejected", invalidFacts((f) => (f.sourceSnippets = [{ field: "faq" }])));
  check("ProductFacts with malformed operational facts is rejected", invalidFacts((f) => (f.returnsInformation = [{ provenance: "DIRECT_SOURCE" }])));
  check("ProductFacts with a malformed product name is rejected", invalidFacts((f) => (f.productName = 5)));
  check("every required ProductFacts field is covered", EVIDENCE_FACT_FIELDS.length === 9);

  const bad = (extra: Record<string, unknown>) => ({ facts: rich(), ...extra });
  check("an invalid completeness report is rejected", rejected(bad({ completeness: "report" }), "completeness") && rejected(bad({ completeness: {} }), "completeness") && rejected(bad({ completeness: { sections: [{ id: "nope", status: "COMPLETE" }] } }), "completeness") && rejected(bad({ completeness: { sections: [{ id: "faq", status: "DONE" }] } }), "completeness") && rejected(bad({ completeness: { sections: [{ id: "faq", status: "COMPLETE" }, { id: "faq", status: "MISSING" }] } }), "completeness"));
  check("a partial completeness report is accepted", validateEvidenceInputs(bad({ completeness: { sections: [{ id: "faq", status: "COMPLETE" }] } })).length === 0);
  check("invalid research is rejected", rejected(bad({ research: "r" }), "research") && rejected(bad({ research: { ...researchReport(), status: "OLD" } }), "research") && rejected(bad({ research: { ...researchReport(), quality: "GREAT" } }), "research") && rejected(bad({ research: { ...researchReport(), productName: 3 } }), "research") && rejected(bad({ research: { ...researchReport(), sources: [{ url: "x" }] } }), "research") && rejected(bad({ research: { ...researchReport(), diversity: { USABLE_SOURCES: -1 } } }), "research") && rejected(bad({ research: { ...researchReport(), diversity: undefined } }), "research"));
  check("a presentation plan without full visibility is rejected", rejected(bad({ presentationPlan: {} }), "presentationPlan") && rejected(bad({ presentationPlan: { sectionVisibility: { hero: true } } }), "presentationPlan"));
  check("an invalid boundary classification is rejected", rejected(bad({ boundary: "x" }), "boundary") && rejected(bad({ boundary: [{ classification: "NOPE", confidence: "HIGH" }] }), "boundary") && rejected(bad({ boundary: [{ classification: "FAQ", confidence: "SURE" }] }), "boundary"));
  check("invalid metadata is rejected", rejected(bad({ metadata: "m" }), "metadata") && rejected(bad({ metadata: { a: { b: 1 } } }), "metadata") && rejected(bad({ metadata: { a: [1] } }), "metadata") && rejected(bad({ metadata: { a: Number.NaN } }), "metadata") && rejected(bad({ metadata: { " ": "x" } }), "metadata") && rejected(bad({ metadata: [] }), "metadata"));
  check("flat metadata is accepted", validateEvidenceInputs(bad({ metadata: { run: "r1", count: 2, flag: true, none: null } })).length === 0);
  let thrown: unknown = null;
  try {
    analyzeEvidence({ facts: null } as unknown as EvidenceInputs);
  } catch (error) {
    thrown = error;
  }
  check("the analyzer refuses invalid inputs with an EvidenceInputError", thrown instanceof EvidenceInputError && (thrown as EvidenceInputError).issues.length > 0);

  // ---------- read-only and deterministic ----------
  const frozen = freezeDeep(JSON.parse(JSON.stringify({ facts: rich(), completeness: completenessOfRich, presentationPlan: planOfRich, boundary: [section("FAQ")], research: researchReport(), metadata: { run: "r1" } }))) as EvidenceInputs;
  const before = JSON.stringify(frozen);
  const first = analyzeEvidence(frozen, { now: clock });
  check("analysis does not change frozen inputs", JSON.stringify(frozen) === before);
  check("analysis is deterministic", comparable(first) === comparable(analyzeEvidence(frozen, { now: clock })));
  check("input metadata is carried under input.", first.metadata["input.run"] === "r1");
  const signalOutput = evidenceResultToSignalOutput(first);
  check("the framework output carries status, confidence, metadata, warnings, and no errors", signalOutput.status === "COMPLETED" && signalOutput.confidence === first.confidence && signalOutput.errors.length === 0 && !("executionTime" in signalOutput) && !("score" in signalOutput));

  // ---------- the signal ----------
  const provider = (facts: ProductFacts | null) => () => (facts ? { facts } : null);
  const signal = createEvidenceSignal({ provider: provider(rich()) });
  check("the signal satisfies the framework contract", validateSignalModule(signal).length === 0);
  check("the signal identity", signal.id === EVIDENCE_SIGNAL_ID && signal.id === "evidence" && signal.name === "Evidence" && signal.category === "EVIDENCE" && signal.version === "1.0.0");
  check("the signal is independent", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  check("defaults: enabled and priority 100", signal.enabled === true && signal.priority === 100);
  check("options set enabled and priority", createEvidenceSignal({ provider: provider(null), enabled: false, priority: 7 }).enabled === false && createEvidenceSignal({ provider: provider(null), priority: 7 }).priority === 7);

  const candidate = { id: "cand-1", source: "feed", url: URL_A, title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
  const ctx = createSignalContext({ candidate });
  const emptyCtx = createSignalContext();
  check("the signal supports a context with a candidate only", signal.supportsCandidate(ctx) === true && signal.supportsCandidate(emptyCtx) === false);

  const registry = createSignalRegistry();
  const entry = registerEvidenceSignal(registry, { provider: provider(rich()) });
  check("the signal registers in a registry", entry.id === "evidence" && entry.enabled === true && registry.get("evidence")?.module.category === "EVIDENCE" && registry.list({ category: "EVIDENCE" }).length === 1);
  let duplicateRejected = false;
  try {
    registerEvidenceSignal(registry, { provider: provider(rich()) });
  } catch (error) {
    duplicateRejected = error instanceof SignalFrameworkError;
  }
  check("registering the signal twice is rejected", duplicateRejected && registry.count() === 1);
  const pipeline = createSignalPipeline();
  registerEvidenceSignal(pipeline, { provider: provider(rich()) });
  check("the signal registers in a pipeline with valid dependencies", pipeline.registry.count() === 1 && pipeline.validateDependencies().length === 0 && pipeline.resolveExecutionOrder().order.join() === "evidence");
  check("the signal can be disabled and enabled like any other", pipeline.disable("evidence").enabled === false && pipeline.enable("evidence").enabled === true);
  const disabledRegistry = createSignalRegistry();
  check("a signal registered disabled stays disabled", registerEvidenceSignal(disabledRegistry, { provider: provider(rich()), enabled: false }).enabled === false);

  const report = await pipeline.run(ctx);
  const evidence = report.results[0];
  check("the pipeline runs the signal and collects a result", report.results.length === 1 && evidence.signalId === "evidence" && evidence.status === "COMPLETED" && typeof evidence.executionTime === "number");
  check("the collected result carries the analysis", evidence.confidence === 1 && evidence.metadata.availableCount === 11 && evidence.errors.length === 0 && !("score" in evidence));
  check("the collected result matches the standalone analysis", JSON.stringify(evidence.metadata) === JSON.stringify(evidenceResultToSignalOutput(run(rich())).metadata));

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
  registerEvidenceSignal(together, { provider: provider(rich()) });
  together.register(other);
  const togetherReport = await together.run(ctx);
  const evidenceTogether = togetherReport.results.find((r) => r.signalId === "evidence")!;
  check("another signal failing does not change the Evidence result", togetherReport.results.find((r) => r.signalId === "other-fixture")?.status === "FAILED" && JSON.stringify({ ...evidenceTogether, executionTime: 0 }) === JSON.stringify({ ...evidence, executionTime: 0 }));
  together.disable("other-fixture");
  check("the Evidence Signal runs alone when others are disabled", (await together.run(ctx)).results.map((r) => r.signalId).join() === "evidence");
  const direct = await executeSignal(signal, ctx, {});
  check("the executor runs the signal with no pipeline", direct.status === "COMPLETED" && direct.metadata.availableCount === 11);
  check("the executor skips a context with no candidate", (await executeSignal(signal, emptyCtx, {})).status === "SKIPPED");

  const failing = async (label: string, p: () => unknown, pattern: RegExp) => {
    const result = await executeSignal(createEvidenceSignal({ provider: p as () => EvidenceInputs | null }), ctx, {});
    check(label, result.status === "FAILED" && pattern.test(result.errors.join(" ")));
  };
  await failing("a provider with no inputs is rejected as missing ProductFacts", () => null, /ProductFacts|inputs/);
  await failing("missing ProductFacts is rejected through the framework", () => ({ facts: null }), /ProductFacts is required/);
  await failing("invalid research is rejected through the framework", () => ({ facts: rich(), research: { status: "FRESH" } }), /Research is invalid/);
  await failing("invalid completeness is rejected through the framework", () => ({ facts: rich(), completeness: { sections: "x" } }), /Completeness is invalid/);
  await failing("invalid metadata is rejected through the framework", () => ({ facts: rich(), metadata: { a: {} } }), /Metadata is invalid/);
  await failing("a throwing provider becomes a FAILED result", () => { throw new Error("provider down"); }, /provider down/);
  let calls = 0;
  const seenContexts: unknown[] = [];
  const counting = createEvidenceSignal({ provider: (c) => { calls += 1; seenContexts.push(c); return { facts: rich() }; } });
  await executeSignal(counting, ctx, {});
  check("the provider receives the shared context and is only read", calls === 2 && seenContexts.every((c) => c === ctx));

  // ---------- drift against the platform ----------
  check("plan sections match the platform", JSON.stringify(EVIDENCE_PLAN_SECTIONS) === JSON.stringify([...PLAN_SECTIONS]));
  check("boundary classes match the platform", JSON.stringify(EVIDENCE_BOUNDARY_CLASSES) === JSON.stringify([...STRUCTURAL_CLASSES, ...PRODUCT_CLASSES, ...COMPARISON_CLASSES]));
  check("completeness sections match the platform", JSON.stringify(EVIDENCE_COMPLETENESS_SECTIONS) === JSON.stringify(analyzeImportCompleteness({ facts: rich() }).sections.map((s) => s.id)));
  check("authoritative provenances match the platform's copy-eligible provenances", JSON.stringify([...EVIDENCE_AUTHORITATIVE_PROVENANCES].sort()) === JSON.stringify([...CONSUMER_COPY_ALLOWED_PROVENANCE].sort()));
  check("research statuses and qualities are the platform's", researchReport().status === MARKET_RESEARCH_STATUSES[0] && MARKET_RESEARCH_QUALITIES.includes(researchReport().quality));

  // ---------- replay of stored products (read-only) ----------
  for (const label of ["Joint Genesis", "Prodentim", "Neuro Serge", "Audifort"]) {
    const stored = storedFactsFiles(label);
    check(`${label}: stored ProductFacts found`, stored.length > 0);
    const replays = stored.length > 0 ? stored : [{ file: "(none)", facts: emptyProductFacts(label, "https://example.test/replay", "IMPORTED") }];
    let ok = true;
    let sample = "";
    for (const { facts: stored1 } of replays) {
      const snapshot = JSON.stringify(stored1);
      const completeness = analyzeImportCompleteness({ facts: stored1 });
      const plan = planPresentation(stored1, analyzeProductProfile(stored1));
      const all = { facts: stored1, completeness, presentationPlan: plan };
      const valid = validateEvidenceInputs(all).length === 0;
      const a = analyzeEvidence(all, { now: clock });
      const b = analyzeEvidence(all, { now: clock });
      const partition = [...a.availableDimensions, ...a.missingDimensions].sort().join() === [...EVIDENCE_DIMENSIONS].sort().join() && a.availableDimensions.every((d) => !a.missingDimensions.includes(d));
      const auth = a.metadata.authoritativeCount as number;
      const ratio = a.availableDimensions.length === 0 ? null : Math.round((auth / a.availableDimensions.length) * 1000) / 1000;
      const c = stored1.confidence;
      const expectFeatures = stored1.features.some((f) => f.trim() && f.toUpperCase() !== "NOT_FOUND") && c.features !== "NOT_FOUND";
      const expectIngredients = stored1.ingredientsOrComponents.some((f) => f.trim() && f.toUpperCase() !== "NOT_FOUND") && c.ingredientsOrComponents !== "NOT_FOUND";
      const expectGuarantee = Boolean(stored1.guaranteeInformation?.trim()) && c.guaranteeInformation !== "NOT_FOUND";
      const derived = a.availableDimensions.includes("FEATURES") === expectFeatures && a.availableDimensions.includes("INGREDIENTS") === expectIngredients && a.availableDimensions.includes("GUARANTEE") === expectGuarantee;
      const scoreFree = comparable(analyzeEvidence({ ...all, completeness: { ...completeness, score: 0 } }, { now: clock })) === comparable(a);
      ok = ok && valid && comparable(a) === comparable(b) && JSON.stringify(stored1) === snapshot && partition && a.confidence === ratio && derived && scoreFree && a.status === "COMPLETED";
      if (!sample) sample = `${a.availableDimensions.length}/11 available, confidence ${a.confidence}, ${a.warnings.length} warning(s), missing: ${a.missingDimensions.join(",") || "none"}`;
    }
    check(`${label}: replay is valid, read-only, deterministic, and consistent with provenance (${replays.length} stored file${replays.length === 1 ? "" : "s"})`, ok);
    console.log(`  ${label} -> ${sample}`);
  }

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/opportunity");
  const files = walk(dir).filter((f) => /[\\/]evidence-[a-z]+\.ts$/.test(f));
  check("four evidence modules exist: signal, analyzer, result, validator", files.map((f) => f.split(/[\\/]/).pop()).sort().join() === "evidence-analyzer.ts,evidence-result.ts,evidence-signal.ts,evidence-validator.ts");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const code = lines.filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no campaign ids, marketplaces, or slugs", !lines.some((l) => /campaign|clickbank|hotmart|amazon|shopify|ebay|aliexpress|walmart|digistore|slug/i.test(l)));
  check("no Google Ads, competition, intent, or market analysis", !code.some((l) => /google|adwords|gclid|keyword|competit|commercial|marketAnaly/i.test(l)));
  check("no scoring or recommendations in code", !code.some((l) => /\bscor(e|ing)\b|recommend/i.test(l)));
  check("no AI, network, crawling, database, timers, or file writes", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots/i.test(l)));
  check("no randomness or wall-clock reads", !code.some((l) => /Math\.random|Date\.now|new Date\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 10);
  check("platform imports are type-only", imports.filter((i) => i.from.startsWith("@/")).every((i) => i.typeOnly) && imports.some((i) => i.from.startsWith("@/")));
  check("other imports stay inside opportunity", imports.filter((i) => !i.from.startsWith("@/")).every((i) => i.from.startsWith("./")));
  check("the code never assigns into inputs or facts", !code.some((l) => /\b(inputs|facts)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nEvidence signal: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
