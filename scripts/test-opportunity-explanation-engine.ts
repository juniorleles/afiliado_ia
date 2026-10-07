import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeImportCompleteness } from "../src/lib/completeness-engine.ts";
import { predictLpQuality } from "../src/lib/lp-quality-predictor.ts";
import { planPresentation } from "../src/lib/presentation-plan.ts";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { analyzeEvidence } from "../src/lib/opportunity/evidence-analyzer.ts";
import { registerEvidenceSignal } from "../src/lib/opportunity/evidence-signal.ts";
import { registerLandingPagePotentialSignal } from "../src/lib/opportunity/landing-page-potential-signal.ts";
import type { LandingPagePotentialInputs } from "../src/lib/opportunity/landing-page-potential-result.ts";
import { registerCompetitionSignal } from "../src/lib/opportunity/competition-signal.ts";
import { registerCommercialIntentSignal } from "../src/lib/opportunity/commercial-intent-signal.ts";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createEvidenceRecorder } from "../src/lib/opportunity/opportunity-resolver-recorder.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput, SignalResult } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext, isDeepFrozen } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import type { EvidenceKind, EvidenceProvider } from "../src/lib/opportunity/providers/evidence-provider-contract.ts";
import { createEvidenceResolver } from "../src/lib/opportunity/providers/evidence-provider-resolver.ts";
import {
  CATEGORY_SECTION_KINDS,
  COLLECTING_SECTION_KINDS,
  EXPLANATION_ITEM_KINDS,
  EXPLANATION_SECTION_KINDS,
  EXPLANATION_SECTION_STATES,
  EXPLANATION_SECTION_TITLES,
  STATE_VOCABULARY,
  createExplanationSection,
  describeState,
  sectionKindForCategory,
} from "../src/lib/opportunity/opportunity-explanation-section.ts";
import { EXPLANATION_KEYS, EXPLANATION_SCOPE_NOTE } from "../src/lib/opportunity/opportunity-explanation-result.ts";
import type { OpportunityExplanationInput } from "../src/lib/opportunity/opportunity-explanation-result.ts";
import { createExplanationValidator } from "../src/lib/opportunity/opportunity-explanation-validator.ts";
import { createExplanationBuilder } from "../src/lib/opportunity/opportunity-explanation-builder.ts";
import { EXPLANATION_SCHEMA_VERSION, createExplanationFormatter } from "../src/lib/opportunity/opportunity-explanation-formatter.ts";
import { createOpportunityExplanationEngine } from "../src/lib/opportunity/opportunity-explanation-engine.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const URL_A = "https://example.test/gizmo";
const SECRET_FACT = "SECRET-FACT-XYZ";
const candidate = { id: "cand-1", source: "feed", url: URL_A, title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function resolverClocks() {
  let t = 0;
  let s = 0;
  let n = 0;
  return {
    now: () => (t += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `analysis-${(n += 1)}`,
  };
}
const tick = () => {
  let t = 0;
  return () => (t += 1);
};

interface FakeOpts {
  category: OpportunitySignalModule["category"];
  priority?: number;
  enabled?: boolean;
  supports?: boolean;
  output?: SignalOutput;
}
const COMPLETED = (metadata: SignalOutput["metadata"], warnings: string[] = [], confidence: number | null = 0.8): SignalOutput => ({ status: "COMPLETED", confidence, metadata, warnings, errors: [] });
function fake(id: string, over: FakeOpts): OpportunitySignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category: over.category,
    enabled: over.enabled ?? true,
    priority: over.priority ?? 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsCandidate: () => over.supports ?? true,
    validate: () => [],
    analyze: () => {
      const output = over.output ?? COMPLETED({});
      return { ...output, metadata: { ...output.metadata }, warnings: [...output.warnings], errors: [...output.errors] };
    },
  };
}

const ALPHA = COMPLETED(
  {
    "dimension.PRICING": "AVAILABLE_AUTHORITATIVE",
    "count.PRICING": 2,
    "dimension.SHIPPING": "AVAILABLE_OTHER",
    "dimension.TRUST": "MISSING",
    "basis.TRUST": "Whether trust information exists.",
    availableDimensions: "PRICING,SHIPPING",
    missingDimensions: "TRUST",
    provenanceNote: "DIRECT_SOURCE means the source stated it.",
    secret: "TOPSECRET-123",
  },
  ["alpha warns"],
);
const BETA = COMPLETED({
  "dimension.HERO": "STRONG",
  "strength.HERO": "The hero names the product",
  "dimension.PROOF": "WEAK",
  "weakness.PROOF": "Proof is thin",
  "dimension.FAQ": "MISSING",
  "weakness.FAQ": "No FAQ",
  "dimension.TONE": "ADEQUATE",
  "dimension.LAYOUT": "EXOTIC",
});
const GAMMA_FAILED: SignalOutput = { status: "FAILED", confidence: null, metadata: { "dimension.LEFTOVER": "STRONG" }, warnings: ["gamma careful"], errors: ["boom"] };
const EPSILON = COMPLETED({ "dimension.SIZE": "AVAILABLE" });

function mainModules(): OpportunitySignalModule[] {
  return [
    fake("alpha", { category: "EVIDENCE", priority: 100, output: ALPHA }),
    fake("beta", { category: "LANDING_PAGE", priority: 90, output: BETA }),
    fake("gamma", { category: "COMPETITION", priority: 80, output: GAMMA_FAILED }),
    fake("delta", { category: "COMMERCIAL_INTENT", priority: 70, supports: false }),
    fake("epsilon", { category: "MARKET", priority: 60, output: EPSILON }),
    fake("omega", { category: "BRAND", priority: 1, enabled: false }),
  ];
}

const goodContext = () =>
  createOpportunityExecutionContext({
    candidate,
    evidenceContext: createEvidenceContext({ candidate, metadata: { imported: "i1" }, extensions: { ext: "e1" }, resolvedProductData: { fact: SECRET_FACT } }),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
  } as never);

async function fixture(modules: OpportunitySignalModule[], context = goodContext()) {
  const signals = createSignalPipeline({ now: zero });
  for (const module of modules) signals.register(module);
  const run = await createOpportunityResolver({ signals, ...resolverClocks() } as never).run(context);
  // The Resolver ran the signals once. Everything the engine needs is in the analysis it produced.
  const results = run.analysis.signalResults;
  const catalog = run.analysis.resolvedSignals;
  const input = (): OpportunityExplanationInput => run.analysis;
  return { signals, context, run, analysis: run.analysis, results, catalog, input };
}

const validator = createExplanationValidator();
const formatter = createExplanationFormatter();
const engineOf = () => createOpportunityExplanationEngine({ now: tick() });

function evProvider(id: string, kind: EvidenceKind, payload: unknown): EvidenceProvider {
  return {
    id,
    name: `Provider ${id}`,
    version: "1.0.0",
    kind,
    priority: 100,
    enabled: true,
    supports: () => true,
    collect: () => ({ payload, metadata: {}, warnings: [] }),
    validate: () => [],
  } as unknown as EvidenceProvider;
}

const blocks0 = (e: { sections: Parameters<typeof formatter.formatSection>[0][] }, index: number) => formatter.formatSection(e.sections[index]);

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

async function main() {
  // ---------- constants and section model ----------
  check("eight sections in a fixed order", EXPLANATION_SECTION_KINDS.join() === "EVIDENCE,LANDING_PAGE,COMPETITION,COMMERCIAL_INTENT,WARNINGS,MISSING_INFORMATION,STRENGTHS,WEAKNESSES");
  check("four describe a group of signals and four collect statements", CATEGORY_SECTION_KINDS.length === 4 && COLLECTING_SECTION_KINDS.length === 4 && [...CATEGORY_SECTION_KINDS, ...COLLECTING_SECTION_KINDS].every((k) => EXPLANATION_SECTION_KINDS.includes(k)));
  check("every section has a title", EXPLANATION_SECTION_KINDS.every((k) => EXPLANATION_SECTION_TITLES[k].length > 0) && EXPLANATION_SECTION_TITLES.LANDING_PAGE === "Landing Page" && EXPLANATION_SECTION_TITLES.MISSING_INFORMATION === "Missing Information");
  check("item kinds and section states are the documented ones", EXPLANATION_ITEM_KINDS.join() === "FINDING,STRENGTH,WEAKNESS,MISSING,WARNING,ERROR" && EXPLANATION_SECTION_STATES.join() === "COMPLETED,NOT_COMPLETED,NO_SIGNAL,REPORTED,NONE");
  check("the explanation has exactly the requested fields plus the traceability and section fields", EXPLANATION_KEYS.join() === "analysisId,candidateId,summary,strengths,weaknesses,warnings,errors,missingEvidence,signalBreakdown,sections,metadata,executionTime");
  check("sectionKindForCategory maps the four categories and nothing else", sectionKindForCategory("EVIDENCE") === "EVIDENCE" && sectionKindForCategory("LANDING_PAGE") === "LANDING_PAGE" && sectionKindForCategory("COMPETITION") === "COMPETITION" && sectionKindForCategory("COMMERCIAL_INTENT") === "COMMERCIAL_INTENT" && sectionKindForCategory("MARKET") === null && sectionKindForCategory(null) === null && sectionKindForCategory("WARNINGS") === null);
  const sourceItem = { kind: "FINDING" as const, text: "t", signalId: "alpha", category: "EVIDENCE", dimension: null };
  const section = createExplanationSection({ kind: "EVIDENCE", state: "COMPLETED", summary: "s", items: [sourceItem] });
  check("a section is frozen, takes its title from its kind, copies its items, and lists its signals", Object.isFrozen(section) && Object.isFrozen(section.items[0]) && section.title === "Evidence" && section.items[0] !== sourceItem && section.signalIds.join() === "alpha");
  check("vocabulary: known states are worded, unknown states are neutral and stated as reported", describeState("STRONG").class === "STRENGTH" && describeState("WEAK").class === "WEAKNESS" && describeState("MISSING").class === "MISSING" && describeState("ADEQUATE").class === "NEUTRAL" && describeState("WEIRD").phrase === "reported as WEIRD" && describeState("constructor").class === "NEUTRAL" && Object.isFrozen(STATE_VOCABULARY));
  check("a direct-source state says the source stated it and that it is not independently verified", /source stated it/.test(STATE_VOCABULARY.AVAILABLE_AUTHORITATIVE.phrase) && /not independently verified/.test(STATE_VOCABULARY.AVAILABLE_AUTHORITATIVE.phrase));

  // ---------- the main fixture ----------
  const main = await fixture(mainModules());
  const engine = engineOf();
  const outcome = engine.explain(main.input());
  const ex = outcome.explanation!;
  check("explaining a good input gives EXPLAINED, an explanation, and no issues", outcome.status === "EXPLAINED" && ex !== null && outcome.issues.length === 0);
  check("the fixture analysis is PARTIAL with a completed, failed, skipped, and not-run signal", main.analysis.status === "PARTIAL" && main.analysis.failedSignals.join() === "gamma" && main.analysis.metadata.skippedSignals === "delta" && main.analysis.metadata.disabledSignals === "omega");
  check("the explanation has exactly the documented fields", Object.keys(ex).join() === EXPLANATION_KEYS.join());
  check("analysis id and candidate id are carried", ex.analysisId === main.analysis.analysisId && ex.candidateId === "cand-1");
  check("the short summary states the outcome without judging it", /^Analysis PARTIAL for cand-1: 3 of 6 registered signals completed, 1 failed, 1 skipped, 1 not run\. Reported: 4 strengths, 2 weaknesses, 5 missing items, 3 warnings, 1 error\.$/.test(ex.summary));
  check("eight sections in the documented order", ex.sections.map((s) => s.kind).join() === EXPLANATION_SECTION_KINDS.join());
  check("section states follow the signals: completed, not completed, and collecting", ex.sections.map((s) => s.state).join() === "COMPLETED,COMPLETED,NOT_COMPLETED,NOT_COMPLETED,REPORTED,REPORTED,REPORTED,REPORTED");
  const sectionOf = (kind: string) => ex.sections.find((s) => s.kind === kind)!;
  check("each category section holds only the signals of that category, by the Signal Contract category", sectionOf("EVIDENCE").signalIds.join() === "alpha" && sectionOf("LANDING_PAGE").signalIds.join() === "beta" && sectionOf("COMPETITION").signalIds.join() === "gamma" && sectionOf("COMMERCIAL_INTENT").signalIds.join() === "delta");
  check("a signal in a category with no section is explained but sits in no category section", !ex.sections.some((s) => s.signalIds.includes("epsilon") && CATEGORY_SECTION_KINDS.includes(s.kind as never)) && ex.signalBreakdown.some((b) => b.signalId === "epsilon") && ex.strengths.some((i) => i.signalId === "epsilon") && ex.metadata.unsectionedSignals === "epsilon,omega");
  check("every item keeps its signal, category, and dimension", ex.strengths.every((i) => i.signalId !== null && i.category !== null && i.dimension !== null) && ex.strengths.find((i) => i.dimension === "PRICING")?.signalId === "alpha" && ex.strengths.find((i) => i.dimension === "PRICING")?.category === "EVIDENCE");

  const texts = (list: Array<{ text: string }>) => list.map((i) => i.text);
  check("strengths restate what signals reported, with counts and the signal's own detail", texts(ex.strengths).join("|") === [
    "PRICING: available from a direct source (the source stated it; not independently verified) (2 items).",
    "SHIPPING: available from other evidence.",
    "HERO: reported as strong by the signal. The hero names the product.",
    "SIZE: evidence is available.",
  ].join("|"));
  check("a weak dimension is a weakness with its detail, and a missing one the signal calls a weakness is restated as one", texts(ex.weaknesses).join("|") === "PROOF: reported as weak by the signal. Proof is thin.|FAQ: No FAQ.");
  check("missing information lists missing dimensions with what they cover and signals that gave nothing", texts(ex.missingEvidence).join("|") === [
    "TRUST: no evidence was found. Covers: Whether trust information exists.",
    "FAQ: no evidence was found.",
    "Signal gamma: it failed, so nothing is known from it.",
    "Signal delta: it was skipped, so nothing is known from it.",
    "Signal omega: it is disabled, so nothing is known from it.",
  ].join("|"));
  check("warnings and errors are kept apart and keep the signal that reported them", texts(ex.warnings).join("|") === "Signal alpha: alpha warns|Signal gamma: gamma careful|Signal delta: Signal does not support this candidate." && texts(ex.errors).join("|") === "Signal gamma: boom" && ex.errors[0].signalId === "gamma");
  check("a neutral or unknown state is stated as reported and is neither a strength nor a weakness", sectionOf("LANDING_PAGE").items.some((i) => i.kind === "FINDING" && i.text === "TONE: reported as adequate by the signal.") && sectionOf("LANDING_PAGE").items.some((i) => i.kind === "FINDING" && i.text === "LAYOUT: reported as EXOTIC.") && !ex.strengths.concat(ex.weaknesses).some((i) => i.dimension === "TONE" || i.dimension === "LAYOUT"));
  check("what a failed signal left in its metadata is not read", main.results.find((r) => r.signalId === "gamma")!.metadata["dimension.LEFTOVER"] === "STRONG" && !JSON.stringify(ex).includes("LEFTOVER"));
  check("a signal that was not run is NOT_RUN and says why", ex.signalBreakdown.find((b) => b.signalId === "omega")!.status === "NOT_RUN" && /disabled/.test(ex.signalBreakdown.find((b) => b.signalId === "omega")!.statement));
  check("metadata a signal attached that no convention names is never echoed", !JSON.stringify(ex).includes("TOPSECRET-123"));
  check("the signal breakdown covers every registered signal, in analysis order, with statuses", ex.signalBreakdown.map((b) => `${b.signalId}:${b.status}`).join() === "alpha:COMPLETED,beta:COMPLETED,gamma:FAILED,delta:SKIPPED,epsilon:COMPLETED,omega:NOT_RUN");
  const alphaBreakdown = ex.signalBreakdown[0];
  check("a breakdown entry carries the reported confidence, timing, counts, a statement, and the signal's own notes", alphaBreakdown.confidence === 0.8 && alphaBreakdown.executionTime === 0 && alphaBreakdown.strengthCount === 2 && alphaBreakdown.missingCount === 1 && alphaBreakdown.warningCount === 1 && alphaBreakdown.errorCount === 0 && /^Completed with 2 strengths, 0 weaknesses, 1 missing item, 1 warning\.$/.test(alphaBreakdown.statement) && alphaBreakdown.notes.join() === "DIRECT_SOURCE means the source stated it.");
  check("a failed signal reports no confidence and its error count", ex.signalBreakdown[2].confidence === null && ex.signalBreakdown[2].errorCount === 1 && /^Failed with 1 error/.test(ex.signalBreakdown[2].statement));
  check("the warnings section holds the warnings then the errors, and the others mirror the lists", sectionOf("WARNINGS").items.map((i) => i.text).join("|") === [...texts(ex.warnings), ...texts(ex.errors)].join("|") && sectionOf("STRENGTHS").items.length === 4 && sectionOf("WEAKNESSES").items.length === 2 && sectionOf("MISSING_INFORMATION").items.length === 5);
  check("a category section that did not complete says so and reports nothing as a finding about the category", /Signal gamma did not complete; nothing is reported for this category\./.test(sectionOf("COMPETITION").summary) && sectionOf("COMPETITION").items.every((i) => i.kind !== "STRENGTH" && i.kind !== "WEAKNESS"));
  check("metadata is flat, counts the lists, and carries the scope note and the execution metadata", validator.validateExplanation(ex).length === 0 && ex.metadata.strengthCount === 4 && ex.metadata.weaknessCount === 2 && ex.metadata.missingCount === 5 && ex.metadata.warningCount === 3 && ex.metadata.errorCount === 1 && ex.metadata.registeredCount === 6 && ex.metadata.completedCount === 3 && ex.metadata["execution.run"] === "r1" && ex.metadata.scopeNote === EXPLANATION_SCOPE_NOTE && ex.metadata.executionMetadataKeys === 1 && ex.metadata.executionOrder === main.analysis.executionOrder.join() && ex.metadata.providerResultCount === 0 && ex.metadata.pipelineMetadataKeys === Object.keys(main.analysis.pipelineMetadata).length);
  check("the explanation validates and is deeply frozen", validator.validateExplanation(ex).length === 0 && isDeepFrozen(ex));
  check("executionTime comes from the injected clock", ex.executionTime === 1);

  // ---------- no score, ranking, recommendation, or ProductFacts ----------
  const keys: string[] = [];
  (function collect(value: unknown) {
    if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === "object" && value !== null) for (const [k, v] of Object.entries(value)) (keys.push(k), collect(v));
  })(ex);
  check("no key anywhere in the explanation is a score, ranking, weight, or recommendation", !keys.some((k) => /score|rank|weight|recommend|priority/i.test(k)));
  const proseOf = (e: typeof ex) => [e.summary, ...e.sections.flatMap((s) => [s.summary, ...s.items.map((i) => i.text)]), ...e.signalBreakdown.map((b) => b.statement)].join("\n");
  check("no sentence scores, ranks, or recommends", !/\bscore|\brank|recommend|you should|we suggest|best|worst|promising|winner/i.test(proseOf(ex)));
  check("nothing from the Evidence Context's resolved product data reaches the explanation, because the analysis snapshot does not carry it", !JSON.stringify(ex).includes(SECRET_FACT) && !JSON.stringify(engine.render(main.input())).includes(SECRET_FACT));
  check("the input carries no ProductFacts member", !("facts" in main.input()) && !("productFacts" in main.input()));

  // ---------- read-only ----------
  const frozenInput = main.input();
  const before = JSON.stringify(frozenInput);
  const analysisBefore = JSON.stringify(main.analysis);
  engine.explain(frozenInput);
  engine.render(frozenInput);
  check("explaining and rendering leave the input, the analysis, the results, and the context untouched", JSON.stringify(frozenInput) === before && JSON.stringify(main.analysis) === analysisBefore);
  check("a deeply frozen analysis is explained without error", isDeepFrozen(main.analysis) && engineOf().explain(main.analysis).status === "EXPLAINED");
  // ---------- determinism and independent execution ----------
  const again = engineOf().explain(main.input()).explanation!;
  check("the same input always gives the same explanation", stable(again) === stable(ex) && formatter.formatDetailed(again) === formatter.formatDetailed(ex));
  const other = engineOf();
  other.explain((await fixture(mainModules())).input());
  check("engines are independent: another engine's runs change nothing", stable(other.explain(main.input()).explanation) === stable(ex));
  const concurrent = await Promise.all([1, 2, 3].map(async () => engineOf().explain(main.input())));
  check("concurrent explanations do not interfere", concurrent.every((o) => stable(o.explanation) === stable(ex)));
  const customEngine = createOpportunityExplanationEngine({ now: tick(), builderOptions: { vocabulary: { ...STATE_VOCABULARY, STRONG: { class: "STRENGTH", phrase: "stated as strong" } } } });
  check("a custom vocabulary changes the wording only", customEngine.explain(main.input()).explanation!.strengths.find((i) => i.dimension === "HERO")!.text.startsWith("HERO: stated as strong.") && customEngine.explain(main.input()).explanation!.strengths.length === 4);
  check("an analysis whose resolved signals do not match its registered signals is rejected, not guessed at", (() => {
    const input = copy(main.analysis);
    input.resolvedSignals = input.resolvedSignals.filter((s) => s.signalId !== "omega");
    const o = engineOf().explain(input);
    return o.status === "REJECTED" && has(o.issues, /do not match/);
  })());

  // ---------- fewer signals ----------
  const tiny = await fixture([fake("alpha", { category: "EVIDENCE", output: ALPHA })]);
  const tinyEx = engineOf().explain(tiny.input()).explanation!;
  check("categories with no registered signal are NO_SIGNAL, with no items", ["LANDING_PAGE", "COMPETITION", "COMMERCIAL_INTENT"].every((k) => { const s = tinyEx.sections.find((x) => x.kind === k)!; return s.state === "NO_SIGNAL" && s.items.length === 0 && s.signalIds.length === 0 && s.summary === "No signal of this category is registered."; }) && tinyEx.analysisId === tiny.analysis.analysisId && tinyEx.sections[0].state === "COMPLETED");
  const quiet = await fixture([fake("alpha", { category: "EVIDENCE", output: COMPLETED({}, [], null) })]);
  const quietEx = engineOf().explain(quiet.input()).explanation!;
  check("a signal with nothing to say gives NONE sections and says so", ["WARNINGS", "MISSING_INFORMATION", "STRENGTHS", "WEAKNESSES"].every((k) => quietEx.sections.find((s) => s.kind === k)!.state === "NONE" && quietEx.sections.find((s) => s.kind === k)!.items.length === 0) && /no confidence was reported/.test(quietEx.sections[0].items[0].text) && validator.validateExplanation(quietEx).length === 0);

  // ---------- a result the Resolver rejected ----------
  const clean = await fixture([fake("alpha", { category: "EVIDENCE", output: ALPHA }), fake("beta", { category: "LANDING_PAGE", output: BETA })]);
  const faulty = { ...clean.signals, run: async () => ({ order: ["alpha", "beta"], results: [clean.results[0], clean.results[0], clean.results[1]] }) };
  const rejectedRun = await createOpportunityResolver({ signals: faulty as never, ...resolverClocks() } as never).run(goodContext());
  const rejectedEx = engineOf().explain(rejectedRun.analysis);
  check("a signal whose result the Resolver rejected is explained as failed, from the analysis's own errors", rejectedEx.status === "EXPLAINED" && rejectedEx.explanation!.signalBreakdown[0].status === "FAILED" && rejectedEx.explanation!.errors.some((e) => e.signalId === "alpha" && /Duplicate signal/.test(e.text)) && rejectedEx.explanation!.missingEvidence.some((m) => m.signalId === "alpha" && /rejected as invalid/.test(m.text)) && rejectedEx.explanation!.strengths.every((s) => s.signalId !== "alpha"));

  // ---------- a refused run ----------
  const refusedSignals = createSignalPipeline({ now: zero });
  refusedSignals.register(fake("alpha", { category: "EVIDENCE" }));
  refusedSignals.register(fake("beta", { category: "LANDING_PAGE" }));
  const refusedRun = await createOpportunityResolver({ signals: refusedSignals, ...resolverClocks() } as never).run({} as never);
  const refusedEx = engineOf().explain(refusedRun.analysis);
  const rx = refusedEx.explanation!;
  check("a refused analysis is explained: nothing ran, the run's errors are run-level, and no candidate is named", refusedRun.analysis.status === "REFUSED" && refusedEx.status === "EXPLAINED" && /^Analysis REFUSED for no candidate: 0 of 2 registered signals completed, 2 not run\./.test(rx.summary) && rx.candidateId === null && rx.errors.length >= 1 && rx.errors.every((e) => e.signalId === null) && rx.signalBreakdown.every((b) => b.status === "NOT_RUN"));
  check("run-level statements have no signal and no category", rx.errors.every((e) => e.signalId === null && e.category === null && e.dimension === null));

  // ---------- input validation ----------
  const base = main.input();
  const issuesFor = (over: Record<string, unknown>) => validator.validateInput({ ...base, ...over });
  check("a good input has no issues", validator.validateInput(base).length === 0 && engine.validate(base).length === 0);
  check("Missing Analysis: no input at all", has(validator.validateInput(undefined), /Missing analysis/) && has(validator.validateInput(null), /Missing analysis/) && has(validator.validateInput(5), /Missing analysis/) && has(validator.validateInput([]), /Missing analysis/));
  check("the old wrapper shape is no longer an input: an analysis is the whole input", validator.validateInput({ analysis: main.analysis, signalResults: [], signals: [] }).length > 0 && engineOf().explain({ analysis: main.analysis, signalResults: main.results, signals: main.catalog }).status === "REJECTED");
  check("an analysis that is not an analysis is invalid, whatever it is", has(validator.validateInput({}), /Invalid analysis/) && has(issuesFor({ score: 0.9 }), /Invalid analysis: Unexpected field "score"/) && has(issuesFor({ status: "WEIRD" }), /Invalid analysis/) && has(issuesFor({ analysisId: "" }), /Invalid analysis/));
  check("Invalid Metadata: the metadata members of the analysis must be flat", has(issuesFor({ metadata: { a: { b: 1 } } }), /Invalid metadata/) && has(issuesFor({ executionMetadata: { a: { b: 1 } } }), /Invalid metadata/) && has(issuesFor({ pipelineMetadata: { a: { b: 1 } } }), /Invalid metadata/) && has(issuesFor({ executionMetadata: [] }), /Invalid metadata/) && has(issuesFor({ executionMetadata: "x" }), /Invalid metadata/) && has(issuesFor({ executionMetadata: null }), /Invalid metadata/) && has(issuesFor({ pipelineMetadata: { "": 1 } }), /Invalid metadata/));
  check("Missing Signals: the snapshot lists are missing or not lists", ["signalResults", "resolvedSignals"].every((field) => has(issuesFor({ [field]: undefined }), /Missing signals/) && has(issuesFor({ [field]: null }), /Missing signals/) && has(issuesFor({ [field]: "nope" }), /Missing signals/) && has(issuesFor({ [field]: { 0: {} } }), /Missing signals/)));
  check("Missing Signals: an executed signal has no result", has(issuesFor({ signalResults: base.signalResults.filter((r) => r.signalId !== "alpha") }), /Missing signals: the executed signal "alpha" has no result/) && has(issuesFor({ signalResults: [] }), /Missing signals: the executed signal/));
  check("a failed signal may have no result, because its result may have been rejected", !has(issuesFor({ signalResults: base.signalResults.filter((r) => r.signalId !== "gamma") }), /Missing signals/));
  check("an invalid resolved signal, a duplicate, or one that disagrees with the registered signals is rejected", has(issuesFor({ resolvedSignals: [{ ...base.resolvedSignals[0], name: "" }, ...base.resolvedSignals.slice(1)] }), /Invalid resolved signal: name must be non-empty text/) && has(issuesFor({ resolvedSignals: [...base.resolvedSignals, base.resolvedSignals[0]] }), /Duplicate signal "alpha"/) && has(issuesFor({ resolvedSignals: [5, ...base.resolvedSignals] }), /Invalid resolved signal/) && has(issuesFor({ resolvedSignals: base.resolvedSignals.slice(1) }), /do not match/));
  check("Invalid Signal Result: bad status, bad fields, and not an object", has(issuesFor({ signalResults: [{ ...base.signalResults[0], status: "WEIRD" }, ...base.signalResults.slice(1)] }), /Invalid signal result: status/) && has(issuesFor({ signalResults: [{ ...base.signalResults[0], metadata: { a: {} } }, ...base.signalResults.slice(1)] }), /Invalid signal result: metadata/) && has(issuesFor({ signalResults: [5, ...base.signalResults] }), /Invalid signal result/) && has(issuesFor({ signalResults: [{ ...base.signalResults[2], errors: [] }, ...base.signalResults.filter((r) => r.signalId !== "gamma")] }), /Invalid signal result: a FAILED result requires at least one error/));
  check("Duplicate Signal: two results for one signal", has(issuesFor({ signalResults: [...base.signalResults, base.signalResults[0]] }), /Duplicate signal "alpha"/));
  check("a result for a signal the analysis did not register is invalid", has(issuesFor({ signalResults: [...base.signalResults, { ...base.signalResults[0], signalId: "zeta" }] }), /"zeta", which is not registered/));
  check("a result that disagrees with the analysis is invalid", has(issuesFor({ signalResults: [{ ...base.signalResults[0], status: "SKIPPED" }, ...base.signalResults.slice(1)] }), /"alpha" is SKIPPED but the analysis says COMPLETED/));
  check("an invalid provider result in the snapshot is rejected", has(issuesFor({ providerResults: [{ providerId: "x" }] }), /Invalid provider result/));
  check("issues name their fields", validator.validateInput(null).every((i) => i.field.length > 0 && i.message.length > 0) && issuesFor({ signalResults: undefined }).every((i) => i.field.length > 0 && i.message.length > 0));
  check("validation reports and never throws on hostile input", (() => { try { for (const v of [null, undefined, 1, "x", [], {}, () => 0, { signalResults: [null, undefined, () => 0], resolvedSignals: [null] }, { ...main.analysis, signalResults: [{ signalId: 5 }], resolvedSignals: [{}], providerResults: [null] }]) validator.validateInput(v); return true; } catch { return false; } })());

  // ---------- section and explanation validation ----------
  const tamper = (fn: (c: any) => void) => {
    const c = copy(ex);
    fn(c);
    return validator.validateExplanation(c);
  };
  check("the untouched copy is valid", tamper(() => undefined).length === 0);
  check("Invalid Sections: not an object, an unknown kind, and a missing field", has(validator.validateSection(null), /Invalid sections/) && has(validator.validateSection({ ...section, kind: "SCORE" }), /not supported/) && has(validator.validateSection({ kind: "EVIDENCE" }), /must have "title"/));
  check("Invalid Sections: a wrong title, a state of the wrong family, and an empty summary", has(validator.validateSection({ ...section, title: "Evidence!" }), /title of EVIDENCE/) && has(validator.validateSection({ ...section, state: "REPORTED" }), /not valid for EVIDENCE/) && has(validator.validateSection({ ...section, summary: "" }), /needs a summary/));
  check("Invalid Sections: an item of the wrong category, an item whose signal is not listed, and an extra key", has(validator.validateSection({ ...section, items: [{ ...sourceItem, category: "COMPETITION" }] }), /has category COMPETITION/) && has(validator.validateSection({ ...section, signalIds: [] }), /does not list/) && has(validator.validateSection({ ...section, score: 1 }), /Unexpected field "score"/));
  check("Invalid Sections: a collecting section holding the wrong kind of item", has(validator.validateSection({ kind: "STRENGTHS", title: "Strengths", state: "REPORTED", summary: "s", signalIds: ["alpha"], items: [{ ...sourceItem, kind: "WEAKNESS" }] }), /not allowed here/));
  check("Invalid Sections: NO_SIGNAL and NONE and REPORTED must agree with their items", has(validator.validateSection({ ...section, state: "NO_SIGNAL" }), /NO_SIGNAL section has no signals/) && has(validator.validateSection({ kind: "WARNINGS", title: "Warnings", state: "NONE", summary: "s", signalIds: ["alpha"], items: [{ ...sourceItem, kind: "WARNING" }] }), /NONE section has no items/) && has(validator.validateSection({ kind: "WARNINGS", title: "Warnings", state: "REPORTED", summary: "s", signalIds: [], items: [] }), /REPORTED section has items/));
  check("Invalid Sections: a section with duplicate signal ids or a bad item", has(validator.validateSection({ ...section, signalIds: ["alpha", "alpha"] }), /distinct signal ids/) && has(validator.validateSection({ ...section, items: [{ ...sourceItem, text: "" }] }), /item text/) && has(validator.validateSection({ ...section, items: ["x"] }), /item must be an object/));
  check("Invalid Sections: the explanation must hold eight sections in order", has(tamper((c) => c.sections.pop()), /exactly 8 sections/) && has(tamper((c) => c.sections.reverse()), /in the order/) && has(tamper((c) => { c.sections = "x"; }), /sections must be a list/) && has(tamper((c) => { c.sections[0].title = "X"; }), /title of EVIDENCE/));
  check("Invalid Sections: a collecting section that disagrees with the explanation's lists", has(tamper((c) => c.sections[6].items.pop()), /STRENGTHS does not hold the same items/) && has(tamper((c) => c.sections[4].items.pop()), /WARNINGS does not hold the same items/) && has(tamper((c) => c.sections[5].items.reverse()), /MISSING_INFORMATION does not hold the same items/));
  check("Invalid Sections: a statement in a category section that is not in the lists", has(tamper((c) => c.sections[0].items.push({ kind: "STRENGTH", text: "Invented", signalId: "alpha", category: "EVIDENCE", dimension: null })), /not in the explanation's lists/));
  check("a score, a ranking, or a recommendation is rejected as an extra field, at every level", has(tamper((c) => { c.score = 1; }), /Unexpected field "score".*no score, ranking, or recommendation/) && has(tamper((c) => { c.ranking = 1; }), /Unexpected field "ranking"/) && has(tamper((c) => { c.recommendation = "x"; }), /Unexpected field "recommendation"/) && has(tamper((c) => { c.strengths[0].score = 1; }), /Unexpected field "score"/) && has(tamper((c) => { c.signalBreakdown[0].rank = 1; }), /Unexpected field "rank"/));
  check("Invalid Metadata: explanation metadata that is not flat", has(tamper((c) => { c.metadata.nested = {}; }), /Invalid metadata/) && has(tamper((c) => { c.metadata = []; }), /Invalid metadata/));
  check("missing fields, bad ids, and a bad execution time are rejected", has(tamper((c) => delete c.summary), /field "summary" is missing/) && has(tamper((c) => { c.analysisId = ""; }), /analysisId/) && has(tamper((c) => { c.executionTime = -1; }), /executionTime/) && has(tamper((c) => { c.summary = ""; }), /summary must be non-empty/) && has(validator.validateExplanation(null), /must be an object/));
  check("lists must hold their own kind of item", has(tamper((c) => { c.strengths[0].kind = "WEAKNESS"; }), /not allowed here/) && has(tamper((c) => { c.errors = {}; }), /"errors" must be a list/));
  check("a breakdown entry must agree with the lists", has(tamper((c) => { c.signalBreakdown[0].strengthCount = 99; }), /strengthCount is 99 but the lists hold 2/) && has(tamper((c) => { c.signalBreakdown[1].signalId = "alpha"; }), /Duplicate signal "alpha" in the breakdown/) && has(tamper((c) => { c.signalBreakdown[0].status = "WEIRD"; }), /status is not supported/) && has(tamper((c) => { c.signalBreakdown[0].notes = "x"; }), /notes must be a list/));

  // ---------- the engine ----------
  let threw = false;
  const odd: unknown[] = [null, undefined, 5, "x", [], {}, () => 0, { analysis: 5 }, { analysis: main.analysis }, { ...main.analysis, signalResults: [null], resolvedSignals: [undefined] }];
  const oddOutcomes = odd.map((v) => { try { return engineOf().explain(v); } catch { threw = true; return null; } });
  check("the engine never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.explanation === null && o.issues.length > 0));
  const renderedBad = engineOf().render(null);
  check("rendering a rejected input gives no views", renderedBad.outcome.status === "REJECTED" && renderedBad.short === null && renderedBad.detailed === null && renderedBad.machine === null && renderedBad.view === null && renderedBad.sections.length === 0);
  const thrower = createOpportunityExplanationEngine({ builder: { build: () => { throw new Error("builder exploded"); } }, now: tick() }).explain(main.input());
  check("a builder that throws is reported as a rejection, not thrown", thrower.status === "REJECTED" && has(thrower.issues, /builder exploded/));
  const brokenBuilder = createOpportunityExplanationEngine({ builder: { build: (input) => ({ ...createExplanationBuilder().build(input), score: 1 } as never) }, now: tick() }).explain(main.input());
  check("an explanation the engine built is checked, and one that fails is not handed out", brokenBuilder.status === "REJECTED" && has(brokenBuilder.issues, /Unexpected field "score"/));
  const badClock = createOpportunityExplanationEngine({ now: () => Number.NaN }).explain(main.input());
  const backwards = (() => { let t = 10; return createOpportunityExplanationEngine({ now: () => (t -= 1) }).explain(main.input()); })();
  check("a broken clock cannot make executionTime negative or not a number", badClock.explanation!.executionTime === 0 && backwards.explanation!.executionTime === 0);
  const realClock = createOpportunityExplanationEngine().explain(main.input()).explanation!;
  check("the default clock gives a finite, non-negative executionTime", Number.isFinite(realClock.executionTime) && realClock.executionTime >= 0);
  check("the engine exposes its parts and validates without explaining", engine.builder !== undefined && engine.formatter !== undefined && engine.validator !== undefined && engine.validate(null).length > 0);
  const builderAlone = createExplanationBuilder().build(main.input());
  check("the builder alone builds everything but the execution time", !("executionTime" in builderAlone) && builderAlone.summary === ex.summary);

  // ---------- formatting ----------
  const rendered = engine.render(main.input());
  check("render gives every view for a good input", rendered.outcome.status === "EXPLAINED" && rendered.short !== null && rendered.detailed !== null && rendered.sections.length === 8 && rendered.machine !== null && rendered.view !== null);
  check("short summary: the explanation's summary", formatter.formatShortSummary(ex) === ex.summary && rendered.short === ex.summary && !rendered.short!.includes("\n"));
  const detailed = formatter.formatDetailed(ex);
  check("detailed explanation: every section, signal, and statement, and the scope note", EXPLANATION_SECTION_KINDS.every((k) => detailed.includes(EXPLANATION_SECTION_TITLES[k])) && ex.signalBreakdown.every((b) => detailed.includes(b.name)) && ex.sections.every((s) => s.items.every((i) => detailed.includes(i.text))) && detailed.endsWith(EXPLANATION_SCOPE_NOTE) && detailed.includes(ex.summary));
  check("a collecting section names the signal behind each line, a category section does not repeat it", blocks0(ex, 6).includes("(from alpha)") && !blocks0(ex, 0).includes("(from "));
  check("detailed explanation: notes a signal attached are shown", detailed.includes("Note: DIRECT_SOURCE means the source stated it."));
  const blocks = formatter.formatSections(ex);
  check("section breakdown: one block per section in order, each with its title, state, summary, and items", blocks.length === 8 && ex.sections.every((s, i) => blocks[i].startsWith(`${s.title} (${s.state})`) && blocks[i].includes(s.summary) && s.items.every((item) => blocks[i].includes(`[${item.kind}] ${item.text}`))) && formatter.formatSection(ex.sections[0]) === blocks[0]);
  const machine = formatter.toMachineReadable(ex);
  check("machine-readable: a versioned envelope around a plain copy", machine.schemaVersion === EXPLANATION_SCHEMA_VERSION && machine.format === "opportunity-explanation" && machine.explanation !== ex && stable(machine.explanation) === stable(ex) && !Object.isFrozen(machine.explanation));
  const json = formatter.toJson(ex);
  check("machine-readable JSON round-trips to the same data and is stable", stable(JSON.parse(json).explanation) === stable(ex) && json === formatter.toJson(ex) && JSON.parse(json).schemaVersion === 1);
  check("machine-readable output can be changed without touching the explanation", (() => { const m = formatter.toMachineReadable(ex); (m.explanation.strengths as unknown[]).length = 0; return ex.strengths.length === 4; })());
  const view = formatter.toViewModel(ex);
  check("view model: eight sections keyed by kind, with stable unique item ids", view.sections.map((s) => s.id).join() === EXPLANATION_SECTION_KINDS.join() && new Set(view.sections.flatMap((s) => s.items.map((i) => i.id))).size === view.sections.reduce((n, s) => n + s.items.length, 0) && view.sections[0].items[0].id === "EVIDENCE-1");
  check("view model: tones, sources, signals, and the scope note", view.sections.flatMap((s) => s.items).every((i) => ["positive", "negative", "caution", "neutral"].includes(i.tone)) && view.sections[6].items.every((i) => i.tone === "positive") && view.sections[7].items.every((i) => i.tone === "negative") && view.sections[0].items[0].source.signalId === "alpha" && view.signals.length === 6 && view.signals[0].id === "alpha" && view.note === EXPLANATION_SCOPE_NOTE && view.schemaVersion === 1 && view.analysisId === ex.analysisId);
  check("view model is plain data: it survives a JSON round trip unchanged and holds no function", stable(JSON.parse(JSON.stringify(view))) === stable(view) && !JSON.stringify(view, (k, v) => (typeof v === "function" ? "FN" : v)).includes("FN"));
  check("formatting twice gives the same output", formatter.formatDetailed(ex) === detailed && stable(formatter.toViewModel(ex)) === stable(view));
  check("formatting does not change the explanation", isDeepFrozen(ex) && stable(ex) === stable(again));

  // ---------- the real signals, through the Signal Contract ----------
  const facts = emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
  const factsBefore = JSON.stringify(facts);
  const candidateBefore = JSON.stringify(candidate);
  const completeness = analyzeImportCompleteness({ facts });
  const plan = planPresentation(facts, analyzeProductProfile(facts));
  const lpInputs: LandingPagePotentialInputs = {
    facts,
    completeness,
    presentationPlan: plan,
    qualityPrediction: predictLpQuality({ facts, report: completeness }),
    evidence: analyzeEvidence({ facts, completeness, presentationPlan: plan }, { now: zero }),
    manualOverrides: [],
  };
  const minimalResearch = { productName: "Fictional", status: "FRESH", quality: "HIGH", sources: [], signals: { reviewOrientedResults: 0, educationalResults: 0, buyerGuideResults: 0, observedIntents: [] }, diversity: { USABLE_SOURCES: 0, PROMOTIONAL_SOURCES: 0 } };
  const realRecorder = createEvidenceRecorder();
  const shared = createEvidenceResolver({ now: zero, observer: realRecorder.observer });
  shared.registerProvider(evProvider("research-a", "RESEARCH", minimalResearch));
  shared.registerProvider(evProvider("intent-a", "COMMERCIAL_INTENT", { channel: "FUTURE", observations: [{ dimension: "MARKET_DEMAND", evidence: "A fictional observation" }] }));
  const real = createSignalPipeline({ now: zero });
  registerEvidenceSignal(real, { provider: () => ({ facts }) });
  registerLandingPagePotentialSignal(real, { provider: () => lpInputs });
  registerCompetitionSignal(real, { resolver: shared, now: zero });
  registerCommercialIntentSignal(real, { resolver: shared, now: zero });
  const realContext = goodContext();
  const realRun = await createOpportunityResolver({ signals: real, evidenceResolver: shared, evidenceRecorder: realRecorder, ...resolverClocks() } as never).run(realContext);
  const realInput: OpportunityExplanationInput = realRun.analysis;
  const realOutcome = engineOf().explain(realInput);
  const rex = realOutcome.explanation!;
  check("the four real signals are explained through the Signal Contract alone", realOutcome.status === "EXPLAINED" && rex.signalBreakdown.length === 4 && rex.signalBreakdown.every((b) => b.status === "COMPLETED"));
  check("each of the four category sections is COMPLETED and holds its own signal", rex.sections.slice(0, 4).every((s) => s.state === "COMPLETED" && s.signalIds.length === 1) && rex.sections[0].signalIds[0] === "evidence" && rex.sections[1].signalIds[0] === "landing-page-potential" && rex.sections[2].signalIds[0] === "competition" && rex.sections[3].signalIds[0] === "commercial-intent");
  const competitionMissing = rex.missingEvidence.filter((i) => i.signalId === "competition");
  check("competition: every dimension it found no evidence for is missing information, each with its dimension", competitionMissing.length === 10 && competitionMissing.every((i) => i.dimension !== null && i.category === "COMPETITION" && /no evidence was found/.test(i.text)) && realRun.analysis.metadata["signal.competition.metadata.missingCount"] === 10);
  check("commercial intent: the one observed dimension is a strength restated from the observation count, the rest are missing", rex.strengths.some((i) => i.signalId === "commercial-intent" && i.dimension === "MARKET_DEMAND" && /evidence is available \(1 item\)/.test(i.text)) && rex.missingEvidence.filter((i) => i.signalId === "commercial-intent").length >= 1);
  check("evidence and landing page dimensions appear with their signal and category", rex.missingEvidence.some((i) => i.signalId === "evidence" && i.category === "EVIDENCE" && i.dimension !== null) && rex.signalBreakdown.find((b) => b.signalId === "landing-page-potential")!.category === "LANDING_PAGE");
  check("a signal's own notes about provenance and absence survive into the breakdown", rex.signalBreakdown.find((b) => b.signalId === "competition")!.notes.length >= 1 && rex.signalBreakdown.find((b) => b.signalId === "evidence")!.notes.some((n) => /not independently verified/.test(n)));
  check("the real explanation validates, renders, and is frozen", validator.validateExplanation(rex).length === 0 && engineOf().render(realInput).detailed!.length > 0 && isDeepFrozen(rex));
  check("no ProductFacts mutation and no Discovery mutation", JSON.stringify(facts) === factsBefore && JSON.stringify(candidate) === candidateBefore);
  check("the real explanation restates the provider results the Resolver kept", realInput.providerResults.length > 0 && rex.metadata.providerResultCount === realInput.providerResults.length && rex.metadata.executionOrder === realInput.executionOrder.join());
  check("the real explanation carries no resolved product data", !JSON.stringify(rex).includes(SECRET_FACT));
  const realAlone = engineOf().explain({ ...realInput, signalResults: realInput.signalResults.filter((r) => r.signalId !== "competition"), executedSignals: realInput.executedSignals.filter((id) => id !== "competition"), failedSignals: [] } as never);
  check("independent execution: each signal's items depend only on that signal's result", realAlone.status === "EXPLAINED" && ["evidence", "landing-page-potential", "commercial-intent"].every((id) => stable(realAlone.explanation!.missingEvidence.filter((i) => i.signalId === id)) === stable(rex.missingEvidence.filter((i) => i.signalId === id))) && stable(realAlone.explanation!.strengths.filter((i) => i.signalId === "commercial-intent")) === stable(rex.strengths.filter((i) => i.signalId === "commercial-intent")));

  // ---------- the Resolver is the only execution authority ----------
  const counts = { analyze: 0, supports: 0, validate: 0, collect: 0 };
  const spyRecorder = createEvidenceRecorder();
  const spyProviders = createEvidenceResolver({ now: zero, observer: spyRecorder.observer });
  spyProviders.registerProvider({ ...evProvider("count-a", "RESEARCH", { x: 1 }), collect: () => { counts.collect += 1; return { payload: { x: 1 }, metadata: {}, warnings: [] }; } } as never);
  const spy: OpportunitySignalModule = {
    ...fake("spy", { category: "EVIDENCE", output: ALPHA }),
    supportsCandidate: () => { counts.supports += 1; return true; },
    validate: () => { counts.validate += 1; return []; },
    analyze: async () => {
      counts.analyze += 1;
      await spyProviders.run(createEvidenceContext({ candidate }));
      return { ...ALPHA, metadata: { ...ALPHA.metadata }, warnings: [...ALPHA.warnings], errors: [] };
    },
  };
  const spySignals = createSignalPipeline({ now: zero });
  spySignals.register(spy);
  const spyRun = await createOpportunityResolver({ signals: spySignals, evidenceResolver: spyProviders, evidenceRecorder: spyRecorder, ...resolverClocks() } as never).run(goodContext());
  const afterResolver = { ...counts };
  check("the Resolver executes the signal exactly once and collects from the provider exactly once", afterResolver.analyze === 1 && afterResolver.collect === 1 && spyRun.analysis.signalResults.length === 1 && spyRun.analysis.providerResults.length === 1);
  const spyBefore = JSON.stringify(spyRun.analysis);
  const spyEngine = engineOf();
  const outcomes = [spyEngine.explain(spyRun.analysis), spyEngine.explain(spyRun.analysis)];
  spyEngine.render(spyRun.analysis);
  spyEngine.validate(spyRun.analysis);
  createExplanationBuilder().build(spyRun.analysis);
  formatter.formatDetailed(outcomes[0].explanation!);
  check("explaining, rendering, validating, and building any number of times executes no signal and collects from no provider", counts.analyze === afterResolver.analyze && counts.supports === afterResolver.supports && counts.validate === afterResolver.validate && counts.collect === afterResolver.collect && outcomes.every((o) => o.status === "EXPLAINED"));
  check("the explanation of the spied run restates the provider result the Resolver kept, and the analysis is not mutated", outcomes[0].explanation!.metadata.providerResultCount === 1 && outcomes[0].explanation!.metadata.executionOrder === "spy" && JSON.stringify(spyRun.analysis) === spyBefore && isDeepFrozen(spyRun.analysis));
  const detached = JSON.parse(JSON.stringify(main.analysis));
  check("the explanation needs only the snapshot: a plain JSON copy of the analysis, with no pipeline behind it, explains identically", stable(engineOf().explain(detached).explanation) === stable(ex) && formatter.formatDetailed(engineOf().explain(detached).explanation!) === formatter.formatDetailed(ex));

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/opportunity");
  const names = walk(dir).filter((f) => /[\\/]opportunity-explanation-[a-z]+\.ts$/.test(f));
  check("six modules exist: engine, builder, section, formatter, validator, result", names.map((f) => f.split(/[\\/]/).pop()).sort().join() === "opportunity-explanation-builder.ts,opportunity-explanation-engine.ts,opportunity-explanation-formatter.ts,opportunity-explanation-result.ts,opportunity-explanation-section.ts,opportunity-explanation-validator.ts");
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no concrete signal, analyzer, channel, or marketplace is named anywhere, comments included", !lines.some((l) => /evidence-signal|competition-signal|commercial-intent-signal|landing-page-potential|-analyzer|google|\bseo\b|marketplace|affiliate|clickbank|hotmart|amazon|shopify|campaign|slug/i.test(l)));
  check("no concrete signal id is named in code", !code.some((l) => /["'](evidence|competition|commercial-intent|landing-page-potential)["']/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(opportunity-explanation-[a-z]+|opportunity-types|opportunity-validator|opportunity-signal-(contract|context)|opportunity-resolver-(analysis|validator))$/;
  check("imports were found", imports.length >= 18);
  check("the engine imports only the Signal Contract, the analysis and its validator, and its own modules; nothing from the provider framework", imports.every((i) => allowed.test(i.from)));
  check("no platform module is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery/.test(i.from)));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|db/i.test(i.from.replace(/\/opportunity-types|\/opportunity-signal-contract/, ""))));
  check("the engine imports no pipeline, registry, executor, or provider resolver, so it cannot execute a signal or resolve a provider", !imports.some((i) => /signal-(pipeline|registry|executor|resolver)|resolver-(pipeline|plan|recorder)|opportunity-resolver$|provider-(resolver|registry|contract|initial)|opportunity-engine/.test(i.from)));
  check("the engine calls no run, collect, resolve, or ordering member", !code.some((l) => /\.(run|collectEvidence|resolveProviders|mergeEvidence|resolveExecutionOrder|resolveSignals|resolve)\(/.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const clockLines = code.filter((l) => /Date\.now|new Date\(|Math\.random|randomUUID|performance\.now/.test(l));
  check("the engine reads the clock in exactly one place, an injectable default that only measures elapsed time", clockLines.length === 1 && /options\.now\s*\?\?/.test(clockLines[0]));
  check("the engine never registers, enables, disables, or removes a signal, and never calls a signal's own members", !code.some((l) => /\.(register|enable|disable|remove|analyze|supportsCandidate)\(/.test(l)));
  check("nothing in the engine assigns into its inputs", !code.some((l) => /\b(input|analysis|signalResults|result|results|evidenceContext)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the engine builds", code.some((l) => /freezeDeep\(/.test(l)));
  check("the evidence context's resolved product data is never read", !lines.some((l) => /resolvedProductData/.test(l.replace(/^\s*(\/\/|\/\*|\*).*$/, ""))));
  const others = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.startsWith("opportunity-explanation")).map((f) => join(dir, f));
  check("no existing module imports the explanation engine", !others.some((f) => /opportunity-explanation/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nOpportunity explanation engine: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
