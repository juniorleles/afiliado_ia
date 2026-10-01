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
import { aggregateSignalResults } from "../src/lib/opportunity/opportunity-resolver-aggregate.ts";
import { RESOLVED_ANALYSIS_KEYS } from "../src/lib/opportunity/opportunity-resolver-analysis.ts";
import { createOpportunityExecutionContext, toSignalContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { DECISION_SCOPE_NOTE, OPPORTUNITY_ANALYSIS_STATUSES, decideOpportunity } from "../src/lib/opportunity/opportunity-resolver-decision.ts";
import { createOpportunityPipeline, STAGE_STATUSES } from "../src/lib/opportunity/opportunity-resolver-pipeline.ts";
import { OPPORTUNITY_PIPELINE_STAGES, buildExecutionPlan } from "../src/lib/opportunity/opportunity-resolver-plan.ts";
import { createOpportunityValidator } from "../src/lib/opportunity/opportunity-resolver-validator.ts";
import { createEvidenceRecorder } from "../src/lib/opportunity/opportunity-resolver-recorder.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import type { createSignalContext } from "../src/lib/opportunity/opportunity-signal-context.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput, SignalResult } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext, isDeepFrozen } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import type { EvidenceKind, EvidenceProvider } from "../src/lib/opportunity/providers/evidence-provider-contract.ts";
import { createEvidenceResolver } from "../src/lib/opportunity/providers/evidence-provider-resolver.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const URL_A = "https://example.test/gizmo";
const candidate = { id: "cand-1", source: "feed", url: URL_A, title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));

/** Deterministic time, ids, and timestamps. */
function clocks() {
  let t = 0;
  let s = 0;
  let n = 0;
  return {
    now: () => (t += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `analysis-${(n += 1)}`,
  };
}

let calls: string[] = [];
interface FakeOpts {
  priority?: number;
  requires?: string[];
  optional?: string[];
  conflicts?: string[];
  enabled?: boolean;
  supports?: boolean;
  category?: OpportunitySignalModule["category"];
  output?: () => SignalOutput | Promise<SignalOutput>;
  capture?: (context: Parameters<OpportunitySignalModule["analyze"]>[0]) => void;
}
const OK: SignalOutput = { status: "COMPLETED", confidence: 0.5, metadata: { k: 1, note: "fixture" }, warnings: [], errors: [] };
function fake(id: string, over: FakeOpts = {}): OpportunitySignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category: over.category ?? "FUTURE",
    enabled: over.enabled ?? true,
    priority: over.priority ?? 100,
    dependencies: { requires: over.requires ?? [], optional: over.optional ?? [], conflicts: over.conflicts ?? [] },
    supportsCandidate: () => over.supports ?? true,
    validate: () => [],
    analyze: (context) => {
      calls.push(id);
      over.capture?.(context);
      return over.output ? over.output() : { ...OK, metadata: { ...OK.metadata } };
    },
  };
}
const FAILED_OUTPUT = (): SignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: ["careful"], errors: ["boom"] });

function signalsWith(...modules: OpportunitySignalModule[]) {
  const pipeline = createSignalPipeline({ now: zero });
  for (const module of modules) pipeline.register(module);
  return pipeline;
}
const goodContext = (over: Record<string, unknown> = {}) =>
  createOpportunityExecutionContext({
    candidate,
    evidenceContext: createEvidenceContext({ candidate, metadata: { imported: "i1" }, extensions: { ext: "e1" } }),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  } as never);
function resolverOf(signals: ReturnType<typeof signalsWith>, extra: Record<string, unknown> = {}) {
  return createOpportunityResolver({ signals, ...clocks(), ...extra } as never);
}

interface FakeEvOpts { id?: string; kind?: EvidenceKind; supports?: boolean; validate?: Array<{ field: string; message: string }>; payload?: unknown; priority?: number }
function evProvider(over: FakeEvOpts = {}): EvidenceProvider {
  const id = over.id ?? "ev-a";
  return {
    id,
    name: `Provider ${id}`,
    version: "1.0.0",
    kind: over.kind ?? "RESEARCH",
    priority: over.priority ?? 100,
    enabled: true,
    supports: () => over.supports ?? true,
    collect: () => {
      calls.push(`collect:${id}`);
      return { payload: over.payload ?? { x: 1 }, metadata: {}, warnings: [] };
    },
    validate: () => over.validate ?? [],
  } as unknown as EvidenceProvider;
}

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

async function main() {
  // ---------- constants ----------
  check("six stages, in the requested order", OPPORTUNITY_PIPELINE_STAGES.join() === "RESOLVE_CANDIDATE,RESOLVE_EVIDENCE_PROVIDERS,RESOLVE_SIGNALS,VALIDATE_RESULTS,AGGREGATE_RESULTS,BUILD_ANALYSIS");
  check("four analysis statuses and three stage statuses", OPPORTUNITY_ANALYSIS_STATUSES.join() === "COMPLETED,PARTIAL,FAILED,REFUSED" && STAGE_STATUSES.join() === "PASSED,FAILED,SKIPPED");
  check("the analysis has exactly the requested fields", RESOLVED_ANALYSIS_KEYS.join() === "analysisId,candidateId,startedAt,completedAt,status,registeredSignals,executedSignals,failedSignals,warnings,errors,metadata,executionTime,resolvedSignals,executionOrder,signalResults,providerResults,executionMetadata,pipelineMetadata");

  // ---------- execution context ----------
  const empty = createOpportunityExecutionContext();
  check("an empty context has every member, empty or null", empty.candidate === null && empty.evidenceContext === null && Object.keys(empty).sort().join() === "candidate,configuration,evidenceContext,executionMetadata,runtimeMetadata" && Object.keys(empty.executionMetadata).length === 0);
  check("creating a context from null or undefined is legal", createOpportunityExecutionContext(null).candidate === null && createOpportunityExecutionContext(undefined).candidate === null);
  const liveCandidate = { ...candidate };
  const liveMeta = { run: "r1" };
  const made = createOpportunityExecutionContext({ candidate: liveCandidate, evidenceContext: createEvidenceContext({ candidate }), executionMetadata: liveMeta });
  liveCandidate.title = "changed";
  liveMeta.run = "changed";
  check("a context copies its inputs and is deeply frozen", made.candidate?.title === "Fictional item" && made.executionMetadata.run === "r1" && isDeepFrozen(made) && !Object.isFrozen(liveCandidate) && !Object.isFrozen(liveMeta));
  const sig = toSignalContext(goodContext());
  check("the signal context carries the candidate, evidence metadata and extensions, execution metadata, runtime, and configuration", sig.candidate?.id === "cand-1" && sig.importedMetadata.imported === "i1" && sig.extensions.ext === "e1" && sig.executionMetadata.run === "r1" && sig.runtime.host === "h1" && sig.configuration.mode === "m1" && Object.isFrozen(sig));
  check("a context with no evidence context still maps", toSignalContext(createOpportunityExecutionContext({ candidate })).candidate?.id === "cand-1");

  // ---------- decision ----------
  const base = { refusals: [] as string[], runError: null, enabled: 3, completed: 3, failed: 0, skipped: 0 };
  check("every enabled signal completed: COMPLETED", decideOpportunity(base).status === "COMPLETED");
  check("some completed: PARTIAL", decideOpportunity({ ...base, completed: 2, failed: 1 }).status === "PARTIAL" && decideOpportunity({ ...base, completed: 1, skipped: 2 }).status === "PARTIAL");
  check("none completed: FAILED", decideOpportunity({ ...base, completed: 0, failed: 3 }).status === "FAILED" && decideOpportunity({ ...base, completed: 0, skipped: 3 }).status === "FAILED");
  check("a run error: FAILED", decideOpportunity({ ...base, runError: "down", completed: 0 }).status === "FAILED");
  check("refusals win over everything: REFUSED", decideOpportunity({ ...base, refusals: ["x"] }).status === "REFUSED" && decideOpportunity({ ...base, refusals: ["x"], runError: "y" }).status === "REFUSED");
  check("no enabled signal: REFUSED", decideOpportunity({ ...base, enabled: 0, completed: 0 }).status === "REFUSED");
  const decided = decideOpportunity({ ...base, completed: 2, failed: 1 });
  check("a decision carries counts and reasons, and no score or recommendation", decided.enabledCount === 3 && decided.completedCount === 2 && decided.failedCount === 1 && decided.reasons.length === 1 && Object.keys(decided).sort().join() === "completedCount,enabledCount,failedCount,reasons,skippedCount,status");
  check("the scope note says a decision is not a judgement of the candidate", /not a score, a ranking, or a recommendation/.test(DECISION_SCOPE_NOTE));

  // ---------- execution plan ----------
  calls = [];
  const planned = signalsWith(fake("alpha", { priority: 100 }), fake("beta", { priority: 50, requires: ["alpha"] }), fake("gamma", { priority: 10 }), fake("delta", { enabled: false }));
  const plan = buildExecutionPlan(planned.registry.list());
  check("the plan orders enabled signals by dependency, then priority", plan.order.join() === "alpha,beta,gamma" && plan.disabled.join() === "delta" && plan.issues.length === 0);
  check("the plan lists every registered signal with its contract members and position", plan.signals.length === 4 && plan.signals.find((s) => s.signalId === "beta")?.requires.join() === "alpha" && plan.signals.find((s) => s.signalId === "beta")?.position === 1 && plan.signals.find((s) => s.signalId === "delta")?.position === null && plan.signals.every((s) => s.name && s.version && s.category));
  check("the plan names the six stages and is frozen", plan.stages.join() === OPPORTUNITY_PIPELINE_STAGES.join() && isDeepFrozen(plan));
  check("planning runs no signal and changes no registry state", calls.length === 0 && planned.registry.count() === 4 && planned.registry.get("delta")?.enabled === false);
  const brokenPlan = buildExecutionPlan(signalsWith(fake("alpha", { requires: ["missing-one"] })).registry.list());
  check("a plan reports invalid dependencies and does not repair them", brokenPlan.issues.length === 1 && brokenPlan.order.length === 0);

  // ---------- validator ----------
  const validator = createOpportunityValidator();
  const good = goodContext();
  check("a valid context passes", validator.validateInput(good).length === 0);
  check("Missing Candidate is rejected", has(validator.validateInput(createOpportunityExecutionContext({ evidenceContext: createEvidenceContext() })), /Missing candidate/));
  check("Missing Context is rejected: no context at all, or no evidence context", has(validator.validateInput(undefined), /Missing context/) && has(validator.validateInput(null), /Missing context/) && has(validator.validateInput("x"), /Missing context/) && has(validator.validateInput(createOpportunityExecutionContext({ candidate })), /Missing context: an evidence context/));
  check("an invalid candidate is rejected", has(validator.validateInput({ ...good, candidate: { id: "", source: "s", url: "u", title: "t" } }), /Invalid candidate/) && has(validator.validateInput({ ...good, candidate: "x" }), /Invalid candidate/));
  check("an invalid evidence context is rejected", has(validator.validateInput({ ...good, evidenceContext: { candidate: 5 } }), /Invalid evidence context/) && has(validator.validateInput({ ...good, evidenceContext: createEvidenceContext({ candidate, metadata: { a: { b: 1 } } as never }) }), /Invalid evidence context/));
  check("an evidence context for a different candidate is rejected", has(validator.validateInput({ ...good, evidenceContext: createEvidenceContext({ candidate: { ...candidate, id: "other" } }) }), /different candidate/));
  for (const field of ["executionMetadata", "runtimeMetadata", "configuration"]) {
    for (const bad of [{ a: { b: 1 } }, { a: Number.NaN }, { "": 1 }, "text", [1], undefined]) {
      check(`Invalid Metadata: ${field} = ${JSON.stringify(bad) ?? "undefined"} is rejected`, has(validator.validateInput({ ...good, [field]: bad }), /Invalid metadata/));
    }
  }
  check("Missing Signal Registry is rejected: nothing, an empty object, a pipeline without a registry or run", [undefined, null, {}, { run: () => 0 }, { registry: {}, run: () => 0, resolveExecutionOrder: () => 0 }, { registry: { list: () => [] }, resolveExecutionOrder: () => 0 }].every((s) => has(validator.validateSignalSource(s), /Missing signal registry/)) && validator.validateSignalSource(planned).length === 0);

  check("Duplicate Signal is rejected in a plan", has(validator.validatePlan({ signals: [{ signalId: "a" }, { signalId: "a" }], order: ["a"], issues: [] }), /Duplicate signal "a"/) && has(validator.validatePlan({ signals: [{ signalId: "a" }], order: ["a", "a"], issues: [] }), /Duplicate signal "a" in the run order/));
  check("a plan with an unregistered ordered signal, no enabled signal, or dependency issues is rejected", has(validator.validatePlan({ signals: [], order: ["a"], issues: [] }), /not registered/) && has(validator.validatePlan({ signals: [{ signalId: "a" }], order: [], issues: [] }), /No signal is enabled/) && validator.validatePlan(brokenPlan).length >= 1 && has(validator.validatePlan(null), /malformed/));
  check("a real plan validates", validator.validatePlan(plan).length === 0);

  const okResult: SignalResult = { signalId: "alpha", status: "COMPLETED", confidence: 0.5, metadata: { k: 1 }, warnings: [], errors: [], executionTime: 1 };
  check("a valid signal result passes", validator.validateResult(okResult).length === 0);
  const badResults: Array<[string, unknown]> = [
    ["a non-object", 5],
    ["no signalId", { ...okResult, signalId: "" }],
    ["an unsupported status", { ...okResult, status: "WEIRD" }],
    ["a bad confidence", { ...okResult, confidence: "high" }],
    ["nested metadata", { ...okResult, metadata: { a: { b: 1 } } }],
    ["warnings that are not text", { ...okResult, warnings: [1] }],
    ["errors that are not a list", { ...okResult, errors: "x" }],
    ["a FAILED status without an error", { ...okResult, status: "FAILED" }],
    ["a negative execution time", { ...okResult, executionTime: -1 }],
    ["a NaN execution time", { ...okResult, executionTime: Number.NaN }],
  ];
  for (const [name, value] of badResults) check(`Invalid Signal Result: ${name} is rejected`, has(validator.validateResult(value), /Invalid signal result/));

  const checkPlan = buildExecutionPlan(signalsWith(fake("alpha"), fake("beta")).registry.list());
  const beta = { ...okResult, signalId: "beta" };
  const checked = validator.checkSignalResults([okResult, beta], checkPlan);
  check("matching results are all valid", checked.valid.length === 2 && checked.rejected.length === 0 && checked.issues.length === 0);
  const dup = validator.checkSignalResults([okResult, okResult, beta], checkPlan);
  check("Duplicate Signal: both copies of a duplicated result are dropped and the signal rejected", dup.valid.map((r) => r.signalId).join() === "beta" && dup.rejected.length === 1 && dup.rejected[0].signalId === "alpha" && /Duplicate signal/.test(dup.rejected[0].errors[0]));
  const missingOne = validator.checkSignalResults([okResult], checkPlan);
  check("an enabled signal with no result is rejected", missingOne.rejected.length === 1 && missingOne.rejected[0].signalId === "beta" && /No result/.test(missingOne.rejected[0].errors[0]));
  const unplanned = validator.checkSignalResults([okResult, beta, { ...okResult, signalId: "zeta" }], checkPlan);
  check("a result for a signal that is not in the plan is rejected", unplanned.valid.length === 2 && unplanned.rejected.map((r) => r.signalId).join() === "zeta");
  const invalid = validator.checkSignalResults([{ ...okResult, status: "WEIRD" }, beta], checkPlan);
  check("an invalid result rejects its signal and keeps the others", invalid.valid.length === 1 && invalid.rejected[0].signalId === "alpha");
  check("results that are not a list reject every enabled signal", validator.checkSignalResults("nope", checkPlan).rejected.length === 2 && validator.checkSignalResults("nope", checkPlan).issues.length >= 1);
  check("a result with no usable signal id is reported", validator.checkSignalResults([5, beta], checkPlan).issues.length >= 1);

  check("OpportunityValidator contract: validateSignal checks a signal module against the Signal Contract", validator.validateSignal(fake("alpha")).length === 0 && validator.validateSignal({}).length > 0);

  // ---------- aggregation ----------
  const aggPlan = buildExecutionPlan(signalsWith(fake("alpha"), fake("beta", { priority: 50 }), fake("gamma", { priority: 10 }), fake("delta", { priority: 5 }), fake("omega", { priority: 1, enabled: false })).registry.list());
  const agg = aggregateSignalResults(
    aggPlan,
    [
      { signalId: "alpha", status: "COMPLETED", confidence: 0.4, metadata: { k: 1 }, warnings: ["w1"], errors: [], executionTime: 3 },
      { signalId: "beta", status: "COMPLETED", confidence: null, metadata: {}, warnings: [], errors: [], executionTime: 4 },
      { signalId: "gamma", status: "FAILED", confidence: null, metadata: {}, warnings: [], errors: ["e1"], executionTime: 5 },
      { signalId: "delta", status: "SKIPPED", confidence: null, metadata: {}, warnings: ["s1"], errors: [], executionTime: 0 },
    ],
  );
  check("signals are available, missing, executed, failed, and skipped as they reported", agg.availableSignals.join() === "alpha,beta" && agg.missingSignals.join() === "gamma,delta,omega" && agg.executedSignals.join() === "alpha,beta,gamma" && agg.failedSignals.join() === "gamma" && agg.skippedSignals.join() === "delta");
  check("status, confidence, and timing are carried per signal, uninterpreted", agg.metadata["signal.alpha.status"] === "COMPLETED" && agg.metadata["signal.alpha.confidence"] === 0.4 && agg.metadata["signal.beta.confidence"] === null && agg.metadata["signal.gamma.executionTime"] === 5 && agg.metadata["signal.alpha.metadata.k"] === 1);
  check("warnings and errors keep the signal id, and execution time is the sum", agg.warnings.join() === "alpha: w1,delta: s1" && agg.errors.join() === "gamma: e1" && agg.executionTime === 12 && agg.metadata.signalsExecutionTime === 12);
  check("disabled signals are listed and counts are recorded", agg.metadata.disabledSignals === "omega" && agg.metadata.completedCount === 2 && agg.metadata.failedCount === 1 && agg.metadata.skippedCount === 1);
  check("there is no combined confidence, weight, score, or ranking", !Object.keys(agg).some((k) => /confidence|score|rank|weight/i.test(k)) && !Object.keys(agg.metadata).some((k) => /^(confidence|score|rank|weight)/i.test(k)) && Object.values(agg.metadata).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  const aggRejected = aggregateSignalResults(aggPlan, [], [{ signalId: "alpha", errors: ["bad"] }, { signalId: "stray", errors: ["not planned"] }]);
  check("a rejected result counts as failed with its errors, and a stray one keeps its errors", aggRejected.failedSignals.join() === "alpha" && aggRejected.errors.join() === "alpha: bad,stray: not planned" && aggRejected.metadata["signal.alpha.confidence"] === null);
  check("signals that neither returned nor were rejected are only missing", aggRejected.missingSignals.includes("beta") && !aggRejected.signals.some((s) => s.signalId === "beta"));

  // ---------- a run: partial ----------
  calls = [];
  const mixed = signalsWith(
    fake("alpha", { priority: 100 }),
    fake("beta", { priority: 50, requires: ["alpha"] }),
    fake("gamma", { priority: 10, output: FAILED_OUTPUT }),
    fake("delta", { priority: 5, supports: false }),
    fake("omega", { priority: 1, enabled: false }),
  );
  const resolver = resolverOf(mixed);
  const run = await resolver.run(goodContext());
  const a = run.analysis;
  check("the run returns an analysis with exactly the requested fields", Object.keys(a).join() === RESOLVED_ANALYSIS_KEYS.join());
  check("identity: injected id, candidate id, timestamps in order", a.analysisId === "analysis-1" && a.candidateId === "cand-1" && Date.parse(a.completedAt) > Date.parse(a.startedAt) && a.startedAt.endsWith("Z"));
  check("PARTIAL: some completed, one failed, one skipped", a.status === "PARTIAL" && run.decision.status === "PARTIAL");
  check("registered, executed, and failed signals are listed", a.registeredSignals.join() === "alpha,beta,gamma,delta,omega" && a.executedSignals.join() === "alpha,beta,gamma" && a.failedSignals.join() === "gamma");
  check("signals ran in plan order, a disabled one did not run, and a skipped one did not analyze", calls.join() === "alpha,beta,gamma");
  check("errors and warnings keep the signal id", a.errors.join() === "gamma: boom" && a.warnings.includes("gamma: careful") && a.warnings.some((w) => /^delta: /.test(w)));
  check("available and missing signals are reported", a.metadata.availableSignals === "alpha,beta" && a.metadata.missingSignals === "gamma,delta,omega" && a.metadata.skippedSignals === "delta" && a.metadata.disabledSignals === "omega");
  check("each signal's status, confidence, timing, and metadata are carried", a.metadata["signal.alpha.status"] === "COMPLETED" && a.metadata["signal.alpha.confidence"] === 0.5 && a.metadata["signal.alpha.metadata.note"] === "fixture" && a.metadata["signal.gamma.status"] === "FAILED" && typeof a.metadata["signal.beta.executionTime"] === "number");
  check("execution, runtime, and configuration are accounted for without echoing configuration", a.metadata["execution.run"] === "r1" && a.metadata["runtime.host"] === "h1" && a.metadata.configurationKeys === 1 && !("configuration.mode" in a.metadata) && a.metadata.candidateSource === "feed");
  check("every stage is recorded; all passed except the evidence stage, which had no resolver", OPPORTUNITY_PIPELINE_STAGES.every((s) => a.metadata[`stage.${s}`] === (s === "RESOLVE_EVIDENCE_PROVIDERS" ? "SKIPPED" : "PASSED")) && run.stages.length === 6);
  check("the evidence stage is skipped, and says so, when no evidence resolver is supplied", run.stages[1].status === "SKIPPED" && a.metadata.evidenceProvidersInspected === false && !Object.keys(a.metadata).some((k) => k.startsWith("evidence.providers")));
  check("the decision note says the run is not a judgement", a.metadata.decisionNote === DECISION_SCOPE_NOTE && /2 of 4 enabled signals completed; 1 failed and 1 were skipped/.test(String(a.metadata.decision)));
  check("the analysis is frozen and valid", isDeepFrozen(a) && validator.validateAnalysis(a).length === 0);
  check("the run also hands back the plan and the aggregate", run.plan?.order.join() === "alpha,beta,gamma,delta" && run.aggregate?.availableSignals.join() === "alpha,beta");
  check("there is no score, ranking, weight, or recommendation anywhere in the analysis", !JSON.stringify(Object.keys(a)).match(/score|rank|weight|recommend/i) && !Object.keys(a.metadata).some((k) => /^(score|rank|weight|recommend)/i.test(k)));
  check("resolve() returns the same analysis as run()", stable(await resolverOf(mixed).resolve(goodContext())) === stable(a));
  check("executionTime comes from the injected clock", a.executionTime >= 1 && Number.isFinite(a.executionTime));

  // ---------- completed, failed, skipped ----------
  const allOk = await resolverOf(signalsWith(fake("alpha"), fake("beta"))).resolve(goodContext());
  check("every enabled signal completed: COMPLETED with no errors", allOk.status === "COMPLETED" && allOk.errors.length === 0 && allOk.failedSignals.length === 0);
  const noneOk = await resolverOf(signalsWith(fake("alpha", { output: FAILED_OUTPUT }), fake("beta", { output: FAILED_OUTPUT }))).resolve(goodContext());
  check("no signal completed: FAILED, naming every failure", noneOk.status === "FAILED" && noneOk.failedSignals.join() === "alpha,beta" && noneOk.errors.length === 2);
  const allSkipped = await resolverOf(signalsWith(fake("alpha", { supports: false }))).resolve(goodContext());
  check("every signal skipped: FAILED, with nothing executed", allSkipped.status === "FAILED" && allSkipped.executedSignals.length === 0 && allSkipped.metadata.skippedSignals === "alpha");
  const thrower = await resolverOf(signalsWith(fake("alpha"), fake("beta", { output: () => { throw new Error("kaput"); } }))).resolve(goodContext());
  check("a signal that throws is a failed signal, and the others still report", thrower.status === "PARTIAL" && thrower.failedSignals.join() === "beta" && thrower.errors.some((e) => /beta: kaput/.test(e)) && thrower.metadata["signal.alpha.status"] === "COMPLETED");
  const malformedOut = await resolverOf(signalsWith(fake("alpha"), fake("beta", { output: () => ({ status: "COMPLETED", confidence: "x", metadata: {}, warnings: [], errors: [] }) as never }))).resolve(goodContext());
  check("a signal that returns a malformed output is a failed signal", malformedOut.status === "PARTIAL" && malformedOut.failedSignals.join() === "beta");

  // ---------- refusals ----------
  calls = [];
  const ok2 = signalsWith(fake("alpha"), fake("beta"));
  const r0 = resolverOf(ok2);
  const refusalCases: Array<[string, unknown, RegExp]> = [
    ["Missing Candidate", { evidenceContext: createEvidenceContext() }, /Missing candidate/],
    ["Missing Context (nothing)", undefined, /Missing context/],
    ["Missing Context (no evidence context)", { candidate }, /Missing context: an evidence context/],
    ["Invalid Metadata", { ...goodContext(), executionMetadata: { a: { b: 1 } } }, /Invalid metadata/],
    ["Invalid Evidence Context", { ...goodContext(), evidenceContext: createEvidenceContext({ candidate, runtime: { a: Number.NaN } }) }, /Invalid evidence context/],
  ];
  for (const [name, input, pattern] of refusalCases) {
    const refused = await r0.run(input as never);
    check(`${name}: the run is REFUSED, nothing executes, and the analysis explains`, refused.analysis.status === "REFUSED" && refused.analysis.errors.some((e) => pattern.test(e)) && refused.analysis.executedSignals.length === 0 && refused.analysis.failedSignals.length === 0 && validator.validateAnalysis(refused.analysis).length === 0);
    check(`${name}: later stages are skipped`, refused.stages.map((s) => s.status).join() === "FAILED,SKIPPED,SKIPPED,SKIPPED,SKIPPED,PASSED" && refused.aggregate === null && refused.plan === null);
  }
  check("none of the refused runs analyzed a signal", calls.length === 0);
  const noCandidate = await r0.resolve({ evidenceContext: createEvidenceContext() } as never);
  check("a refused run with no candidate has a null candidate id and still lists the registered signals", noCandidate.candidateId === null && noCandidate.registeredSignals.join() === "alpha,beta");
  const refusedWithCandidate = await r0.resolve({ candidate } as never);
  check("a refused run keeps the candidate id it was given", refusedWithCandidate.candidateId === "cand-1");

  for (const [name, source] of [["undefined", undefined], ["an empty object", {}], ["a pipeline with no run", { registry: { list: () => [] }, resolveExecutionOrder: () => ({}) }]] as const) {
    const missingRegistry = await createOpportunityResolver({ signals: source as never, ...clocks() }).run(goodContext());
    check(`Missing Signal Registry (${name}): REFUSED, with no signals listed`, missingRegistry.analysis.status === "REFUSED" && missingRegistry.analysis.errors.some((e) => /Missing signal registry/.test(e)) && missingRegistry.analysis.registeredSignals.length === 0);
  }
  check("plan() returns null when the registry is missing", createOpportunityResolver({ signals: undefined as never }).plan() === null);

  const noneEnabled = await resolverOf(signalsWith(fake("alpha", { enabled: false }))).run(goodContext());
  check("no enabled signal: REFUSED, and the disabled one is not enabled to make the run succeed", noneEnabled.analysis.status === "REFUSED" && noneEnabled.analysis.errors.some((e) => /No signal is enabled/.test(e)) && noneEnabled.analysis.registeredSignals.join() === "alpha" && noneEnabled.stages[2].status === "FAILED");
  const emptyRegistry = await resolverOf(createSignalPipeline()).resolve(goodContext());
  check("an empty registry: REFUSED", emptyRegistry.status === "REFUSED" && emptyRegistry.registeredSignals.length === 0);
  calls = [];
  const brokenDeps = signalsWith(fake("alpha", { requires: ["missing-one"] }), fake("beta"));
  const refusedDeps = await resolverOf(brokenDeps).run(goodContext());
  check("invalid dependencies: REFUSED, nothing runs, and nothing is registered or enabled to repair it", refusedDeps.analysis.status === "REFUSED" && refusedDeps.analysis.errors.some((e) => /missing-one/.test(e)) && calls.length === 0 && brokenDeps.registry.count() === 2 && refusedDeps.analysis.registeredSignals.length === 2);

  const entryAlpha = ok2.registry.get("alpha")!;
  const duplicateSource = { ...ok2, registry: { ...ok2.registry, list: () => [entryAlpha, entryAlpha] } };
  const dupRun = await resolverOf(duplicateSource as never).run(goodContext());
  check("Duplicate Signal: a registry listing a signal twice is REFUSED", dupRun.analysis.status === "REFUSED" && dupRun.analysis.errors.some((e) => /Duplicate signal "alpha"/.test(e)));

  // ---------- invalid results from a faulty signal pipeline ----------
  const faultyOf = (results: unknown) => ({ ...ok2, run: async () => ({ order: ["alpha", "beta"], results }) });
  const goodAlpha = { signalId: "alpha", status: "COMPLETED", confidence: 0.5, metadata: { k: 1 }, warnings: [], errors: [], executionTime: 1 };
  const goodBeta = { ...goodAlpha, signalId: "beta" };
  const f1 = await resolverOf(faultyOf([{ ...goodAlpha, status: "WEIRD" }, goodBeta]) as never).run(goodContext());
  check("Invalid Signal Result: that signal counts as failed, the other still reports", f1.analysis.status === "PARTIAL" && f1.analysis.failedSignals.join() === "alpha" && f1.analysis.errors.some((e) => /alpha: Invalid signal result/.test(e)) && f1.analysis.metadata["signal.beta.status"] === "COMPLETED" && f1.stages[3].status === "FAILED");
  check("a rejected result is not read at all", f1.analysis.metadata["signal.alpha.confidence"] === null && !("signal.alpha.metadata.k" in f1.analysis.metadata));
  const f2 = await resolverOf(faultyOf([goodAlpha, goodAlpha, goodBeta]) as never).run(goodContext());
  check("Duplicate Signal: a signal with two results counts as failed", f2.analysis.failedSignals.join() === "alpha" && f2.analysis.errors.some((e) => /alpha: Duplicate signal/.test(e)));
  const f3 = await resolverOf(faultyOf([goodAlpha]) as never).run(goodContext());
  check("an enabled signal that returned nothing counts as failed", f3.analysis.failedSignals.join() === "beta" && f3.analysis.errors.some((e) => /beta: No result/.test(e)));
  const f4 = await resolverOf(faultyOf([goodAlpha, goodBeta, { ...goodAlpha, signalId: "zeta" }]) as never).run(goodContext());
  check("a stray result is reported as an error and never aggregated", f4.analysis.status === "COMPLETED" && f4.analysis.errors.some((e) => /zeta: Unplanned/.test(e)) && !("signal.zeta.status" in f4.analysis.metadata));
  const f5 = await resolverOf(faultyOf("not a list") as never).run(goodContext());
  check("results that are not a list fail every enabled signal", f5.analysis.status === "FAILED" && f5.analysis.failedSignals.join() === "alpha,beta");

  // ---------- run errors, concurrency, never throwing ----------
  const failing = await resolverOf({ ...ok2, run: async () => { throw new Error("pipeline down"); } } as never).run(goodContext());
  check("a signal pipeline that throws gives FAILED, with the reason, and later stages skipped", failing.analysis.status === "FAILED" && failing.analysis.errors.includes("pipeline down") && failing.stages.map((s) => s.status).join() === "PASSED,SKIPPED,FAILED,SKIPPED,SKIPPED,PASSED" && failing.analysis.executedSignals.length === 0 && failing.analysis.metadata.missingSignals === undefined);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const slow = resolverOf(signalsWith(fake("alpha", { output: async () => { await gate; return { ...OK }; } })));
  const first = slow.run(goodContext());
  const second = await slow.resolve(goodContext());
  release();
  const firstDone = await first;
  check("a second run while one is in progress is FAILED, and the first is unaffected", second.status === "FAILED" && second.errors.some((e) => /already in progress/.test(e)) && firstDone.analysis.status === "COMPLETED");
  let neverThrows = true;
  for (const input of [null, undefined, 5, "x", [], {}, { candidate: 5 }, { evidenceContext: 5 }, () => 0]) {
    try {
      const out = await r0.resolve(input as never);
      neverThrows = neverThrows && out.status === "REFUSED";
    } catch {
      neverThrows = false;
    }
  }
  check("the resolver never throws on odd input; it refuses", neverThrows);

  // ---------- previews ----------
  calls = [];
  check("validate() previews the refusal reasons and runs nothing", r0.validate(goodContext()).length === 0 && has(r0.validate(null), /Missing candidate/) && has(r0.validate(null), /Missing context/) && calls.length === 0);
  check("plan() previews the order and runs nothing", r0.plan()?.order.join() === "alpha,beta" && calls.length === 0);

  // ---------- inputs reach the signals ----------
  let seen: Parameters<OpportunitySignalModule["analyze"]>[0] | null = null;
  await resolverOf(signalsWith(fake("alpha", { capture: (c) => { seen = c; } }))).resolve(goodContext());
  const s = seen as unknown as ReturnType<typeof createSignalContext>;
  check("a signal receives the candidate, imported metadata, execution metadata, runtime, configuration, and extensions", s !== null && s.candidate?.id === "cand-1" && s.importedMetadata.imported === "i1" && s.executionMetadata.run === "r1" && s.runtime.host === "h1" && s.configuration.mode === "m1" && s.extensions.ext === "e1" && Object.isFrozen(s));

  // ---------- read-only, determinism, agnosticism ----------
  const liveInput = { candidate: { ...candidate }, evidenceContext: createEvidenceContext({ candidate }), executionMetadata: { run: "r1" } };
  const liveBefore = JSON.stringify(liveInput);
  await resolverOf(signalsWith(fake("alpha"))).resolve(liveInput);
  check("the input objects are neither changed nor frozen by a run", JSON.stringify(liveInput) === liveBefore && !Object.isFrozen(liveInput.candidate) && !Object.isFrozen(liveInput.executionMetadata));
  const before = signalsWith(fake("alpha"), fake("beta", { enabled: false }));
  await resolverOf(before).resolve(goodContext());
  check("the registry is untouched by a run: no registering, enabling, disabling, or removal", before.registry.count() === 2 && before.registry.get("alpha")?.enabled === true && before.registry.get("beta")?.enabled === false);
  const mk = () => signalsWith(fake("alpha", { priority: 100 }), fake("beta", { priority: 50, requires: ["alpha"] }), fake("gamma", { priority: 10, output: FAILED_OUTPUT }));
  check("a run is deterministic under injected clocks", stable(await resolverOf(mk()).resolve(goodContext())) === stable(await resolverOf(mk()).resolve(goodContext())));
  const renamed = () => signalsWith(fake("omicron", { priority: 100, category: "MARKET" }), fake("sigma", { priority: 50, requires: ["omicron"], category: "BRAND" }), fake("kappa", { priority: 10, output: FAILED_OUTPUT, category: "OFFER" }));
  const original = stable(await resolverOf(mk()).resolve(goodContext()));
  const swapped = stable(await resolverOf(renamed()).resolve(goodContext())).replace(/omicron/g, "alpha").replace(/sigma/g, "beta").replace(/kappa/g, "gamma").replace(/"category":"(MARKET|BRAND|OFFER)"/g, '"category":"FUTURE"');
  check("the resolver is signal-agnostic: renamed signals in other categories give the same analysis", original === swapped);

  // ---------- evidence providers stage ----------
  calls = [];
  const evidenceResolver = createEvidenceResolver({ now: zero });
  evidenceResolver.registerProvider(evProvider({ id: "ev-research", kind: "RESEARCH" }));
  evidenceResolver.registerProvider(evProvider({ id: "ev-intent", kind: "COMMERCIAL_INTENT" }));
  evidenceResolver.registerProvider(evProvider({ id: "ev-skip", kind: "LP_QUALITY", supports: false }));
  const withEvidence = await resolverOf(signalsWith(fake("alpha")), { evidenceResolver }).run(goodContext());
  const wa = withEvidence.analysis;
  check("the evidence stage lists the applicable providers per kind and the unsupported ones", withEvidence.stages[1].status === "PASSED" && wa.metadata["evidence.providers.RESEARCH"] === 1 && wa.metadata["evidence.providers.COMMERCIAL_INTENT"] === 1 && wa.metadata["evidence.providers.PRODUCT_FACTS"] === 0 && wa.metadata.evidenceProvidersApplicable === 2 && wa.metadata.evidenceProvidersUnsupported === 1 && wa.metadata.evidenceProvidersInspected === true);
  check("the evidence stage collects nothing", !calls.some((c) => c.startsWith("collect:")));
  const problem = createEvidenceResolver({ now: zero });
  problem.registerProvider(evProvider({ id: "ev-bad", validate: [{ field: "x", message: "not ready" }] }));
  const withProblem = await resolverOf(signalsWith(fake("alpha")), { evidenceResolver: problem }).resolve(goodContext());
  check("a provider's own problems become warnings and do not stop the signals", withProblem.status === "COMPLETED" && withProblem.warnings.some((w) => /Evidence provider problem.*not ready/.test(w)));
  const unusable = { resolveProviders: () => { throw new Error("registry offline"); }, validateProviders: () => [] };
  const withBroken = await resolverOf(signalsWith(fake("alpha")), { evidenceResolver: unusable }).run(goodContext());
  check("evidence providers that cannot be inspected give a warning and a FAILED stage, and the signals still run", withBroken.analysis.status === "COMPLETED" && withBroken.stages[1].status === "FAILED" && withBroken.analysis.warnings.some((w) => /registry offline/.test(w)) && withBroken.analysis.metadata.evidenceProvidersInspected === false);

  // ---------- concrete signals through the contract ----------
  const facts = emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
  const factsBefore = JSON.stringify(facts);
  const candidateBefore = JSON.stringify(candidate);
  const completeness = analyzeImportCompleteness({ facts });
  const plan2 = planPresentation(facts, analyzeProductProfile(facts));
  const lpInputs: LandingPagePotentialInputs = {
    facts,
    completeness,
    presentationPlan: plan2,
    qualityPrediction: predictLpQuality({ facts, report: completeness }),
    evidence: analyzeEvidence({ facts, completeness, presentationPlan: plan2 }, { now: zero }),
    manualOverrides: [],
  };
  const minimalResearch = { productName: "Fictional", status: "FRESH", quality: "HIGH", sources: [], signals: { reviewOrientedResults: 0, educationalResults: 0, buyerGuideResults: 0, observedIntents: [] }, diversity: { USABLE_SOURCES: 0, PROMOTIONAL_SOURCES: 0 } };
  const shared = createEvidenceResolver({ now: zero });
  shared.registerProvider(evProvider({ id: "research-a", kind: "RESEARCH", payload: minimalResearch }));
  shared.registerProvider(evProvider({ id: "intent-a", kind: "COMMERCIAL_INTENT", payload: { channel: "FUTURE", observations: [{ dimension: "MARKET_DEMAND", evidence: "A fictional observation" }] } }));
  const register = (pipeline: ReturnType<typeof createSignalPipeline>, only?: string[]) => {
    const want = (id: string) => only === undefined || only.includes(id);
    if (want("evidence")) registerEvidenceSignal(pipeline, { provider: () => ({ facts }) });
    if (want("landing-page-potential")) registerLandingPagePotentialSignal(pipeline, { provider: () => lpInputs });
    if (want("competition")) registerCompetitionSignal(pipeline, { resolver: shared, now: zero });
    if (want("commercial-intent")) registerCommercialIntentSignal(pipeline, { resolver: shared, now: zero });
  };
  const all = createSignalPipeline({ now: zero });
  register(all);
  const full = await resolverOf(all, { evidenceResolver: shared }).run(goodContext());
  const fa = full.analysis;
  check("the four concrete signals run through the Signal Contract and the analysis is COMPLETED", fa.status === "COMPLETED" && fa.executedSignals.length === 4 && fa.failedSignals.length === 0 && fa.registeredSignals.length === 4);
  check("each concrete signal's own status, confidence, and metadata are carried under its id", ["evidence", "landing-page-potential", "competition", "commercial-intent"].every((id) => fa.metadata[`signal.${id}.status`] === "COMPLETED") && fa.metadata["signal.competition.metadata.missingCount"] === 10 && fa.metadata["signal.commercial-intent.metadata.availableCount"] === 1);
  const sigCtx = toSignalContext(goodContext());
  let identical = true;
  for (const id of ["evidence", "landing-page-potential", "competition", "commercial-intent"]) {
    const alone = createSignalPipeline({ now: zero });
    // The Landing Page signal optionally reads the Evidence signal's result, so it is run beside it.
    register(alone, id === "landing-page-potential" ? ["evidence", id] : [id]);
    const aloneResult = (await alone.run(sigCtx)).results.find((r) => r.signalId === id)!;
    const prefix = `signal.${id}.metadata.`;
    const carried = Object.fromEntries(Object.entries(fa.metadata).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
    identical = identical && stable(carried) === stable(aloneResult.metadata) && fa.metadata[`signal.${id}.confidence`] === aloneResult.confidence;
  }
  check("each signal's carried result is identical to running that signal alone", identical);
  check("the evidence stage saw the shared providers", full.stages[1].status === "PASSED" && fa.metadata["evidence.providers.RESEARCH"] === 1 && fa.metadata["evidence.providers.COMMERCIAL_INTENT"] === 1);
  const some = createSignalPipeline({ now: zero });
  register(some, ["evidence", "commercial-intent"]);
  const partialRun = (await resolverOf(some, { evidenceResolver: shared }).run(goodContext())).analysis;
  check("independent execution: the same signals carry the same results whether or not others are registered", ["evidence", "commercial-intent"].every((id) => Object.entries(fa.metadata).filter(([k]) => k.startsWith(`signal.${id}.metadata.`)).every(([k, v]) => partialRun.metadata[k] === v)) && partialRun.executedSignals.length === 2);
  all.disable("competition");
  const without = (await resolverOf(all, { evidenceResolver: shared }).run(goodContext())).analysis;
  check("disabling one signal removes only that signal: it is registered, missing, and the rest are unchanged", without.registeredSignals.length === 4 && without.executedSignals.length === 3 && without.metadata.missingSignals === "competition" && without.metadata.disabledSignals === "competition" && without.metadata["signal.evidence.metadata.dimension.FEATURES"] === fa.metadata["signal.evidence.metadata.dimension.FEATURES"] && without.status === "COMPLETED");
  all.enable("competition");
  const failingOne = createSignalPipeline({ now: zero });
  register(failingOne, ["evidence", "landing-page-potential"]);
  registerCommercialIntentSignal(failingOne, { resolver: createEvidenceResolver({ now: zero }), now: zero });
  const failingRun = (await resolverOf(failingOne).run(goodContext())).analysis;
  check("one concrete signal failing leaves the others' results unchanged: PARTIAL", failingRun.status === "PARTIAL" && failingRun.failedSignals.join() === "commercial-intent" && failingRun.metadata["signal.evidence.status"] === "COMPLETED" && failingRun.errors.some((e) => /commercial-intent: .*Missing provider/.test(e)) && stable(failingRun.metadata["signal.evidence.metadata.dimension.FEATURES"]) === stable(fa.metadata["signal.evidence.metadata.dimension.FEATURES"]));
  check("no ProductFacts mutation and no Discovery mutation", JSON.stringify(facts) === factsBefore && JSON.stringify(candidate) === candidateBefore);

  // ---------- the analysis snapshot ----------
  const recorder = createEvidenceRecorder();
  const watched = createEvidenceResolver({ now: zero, observer: recorder.observer });
  watched.registerProvider(evProvider({ id: "research-a", kind: "RESEARCH", payload: minimalResearch }));
  watched.registerProvider(evProvider({ id: "intent-a", kind: "COMMERCIAL_INTENT", payload: { channel: "FUTURE", observations: [{ dimension: "MARKET_DEMAND", evidence: "A fictional observation" }] } }));
  const buildWatched = (resolverForSignals: typeof watched) => {
    const p = createSignalPipeline({ now: zero });
    registerEvidenceSignal(p, { provider: () => ({ facts }) });
    registerCompetitionSignal(p, { resolver: resolverForSignals, now: zero });
    registerCommercialIntentSignal(p, { resolver: resolverForSignals, now: zero });
    return p;
  };
  // A collection that happens before the run is heard by the recorder but is not part of the run.
  await watched.run(createEvidenceContext({ candidate }));
  calls = [];
  const snapRun = await resolverOf(buildWatched(watched), { evidenceResolver: watched, evidenceRecorder: recorder }).run(goodContext());
  const sn = snapRun.analysis;
  const collects = calls.filter((c) => c.startsWith("collect:"));
  check("the analysis has all eighteen fields, in order, and is frozen and valid", Object.keys(sn).join() === RESOLVED_ANALYSIS_KEYS.join() && isDeepFrozen(sn) && validator.validateAnalysis(sn).length === 0 && sn.status === "COMPLETED");
  check("resolvedSignals lists every registered signal with its name, version, category, priority, and dependencies", sn.resolvedSignals.map((x) => x.signalId).join() === sn.registeredSignals.join() && sn.resolvedSignals.length === 3 && sn.resolvedSignals.every((x) => x.name !== "" && x.version !== "" && x.category !== "" && Number.isFinite(x.priority) && Array.isArray(x.requires) && Array.isArray(x.optional)));
  check("executionOrder is the order the pipeline ran the signals in", sn.executionOrder.length === 3 && sn.executionOrder.join() === snapRun.plan!.order.join());
  check("signalResults holds one accepted result per executed signal", sn.signalResults.length === 3 && [...sn.signalResults.map((r) => r.signalId)].sort().join() === [...sn.executedSignals].sort().join() && sn.signalResults.every((r) => r.status === "COMPLETED"));
  check("each stored result agrees with the metadata carried for it", sn.signalResults.every((r) => sn.metadata[`signal.${r.signalId}.status`] === r.status && sn.metadata[`signal.${r.signalId}.confidence`] === r.confidence && Object.entries(r.metadata).every(([k, v]) => sn.metadata[`signal.${r.signalId}.metadata.${k}`] === v)));
  check("providerResults holds exactly what the providers returned during the run: one entry per collection, none from before it", sn.providerResults.length > 0 && collects.length === sn.providerResults.length && sn.providerResults.every((r) => ["research-a", "intent-a"].includes(r.providerId) && r.providerVersion === "1.0.0" && ["RESEARCH", "COMMERCIAL_INTENT"].includes(r.kind) && r.status === "COLLECTED"));
  check("provider provenance and payloads survive in the snapshot", sn.providerResults.some((r) => r.providerId === "research-a" && (r.payload as { productName?: string }).productName === "Fictional") && sn.providerResults.every((r) => r.executionTime >= 0 && Array.isArray(r.warnings) && Array.isArray(r.errors)));
  check("executionMetadata is the metadata the run was given", stable(sn.executionMetadata) === stable({ run: "r1" }));
  check("pipelineMetadata holds the stage outcomes, the decision, and the counts, and none of the signals' entries", sn.pipelineMetadata["stage.RESOLVE_SIGNALS"] === "PASSED" && sn.pipelineMetadata["stage.BUILD_ANALYSIS"] === "PASSED" && typeof sn.pipelineMetadata.decision === "string" && sn.pipelineMetadata.registeredCount === 3 && !Object.keys(sn.pipelineMetadata).some((k) => /^(signal\.|execution\.|runtime\.)/.test(k)) && Object.entries(sn.pipelineMetadata).every(([k, v]) => sn.metadata[k] === v));

  const unwatched = createEvidenceResolver({ now: zero });
  unwatched.registerProvider(evProvider({ id: "research-a", kind: "RESEARCH", payload: minimalResearch }));
  unwatched.registerProvider(evProvider({ id: "intent-a", kind: "COMMERCIAL_INTENT", payload: { channel: "FUTURE", observations: [{ dimension: "MARKET_DEMAND", evidence: "A fictional observation" }] } }));
  const plain = (await resolverOf(buildWatched(unwatched), { evidenceResolver: unwatched }).run(goodContext())).analysis;
  check("without a recorder the provider results are empty and every other field is identical", plain.providerResults.length === 0 && stable({ ...plain, providerResults: [] }) === stable({ ...sn, providerResults: [] }));
  check("the recorder is emptied by a run and holds nothing afterwards", recorder.drain().length === 0);

  const counts = { analyze: 0, supports: 0, validate: 0 };
  const spy: OpportunitySignalModule = {
    ...fake("spy"),
    supportsCandidate: () => { counts.supports += 1; return true; },
    validate: () => { counts.validate += 1; return []; },
    analyze: () => { counts.analyze += 1; return { ...OK, metadata: { ...OK.metadata } }; },
  };
  const spied = resolverOf(signalsWith(spy));
  const spyAnalysis = await spied.resolve(goodContext());
  const afterOne = { ...counts };
  check("a signal's analyze runs exactly once in one resolver run", afterOne.analyze === 1 && spyAnalysis.signalResults.length === 1);
  await spied.resolve(goodContext());
  check("a second run runs it once more, with the same number of supportsCandidate and validate calls", counts.analyze === 2 && counts.supports - afterOne.supports === afterOne.supports && counts.validate - afterOne.validate === afterOne.validate);

  const leaked = { k: 1 };
  const leaking = await resolverOf(signalsWith(fake("alpha", { output: () => ({ ...OK, metadata: leaked }) }))).resolve(goodContext());
  leaked.k = 2;
  check("the snapshot is a copy: changing what a signal returned afterwards changes nothing", leaking.signalResults[0].metadata.k === 1 && leaking.metadata["signal.alpha.metadata.k"] === 1);
  let frozenOk = false;
  try { (sn.signalResults as unknown as SignalResult[]).push({} as SignalResult); } catch { frozenOk = true; }
  check("the snapshot cannot be changed", frozenOk && Object.isFrozen(sn.providerResults) && Object.isFrozen(sn.resolvedSignals));

  const refusedSnap = await resolverOf(signalsWith(fake("alpha"))).resolve(createOpportunityExecutionContext({}));
  check("a refused run still has a valid snapshot: the signals are listed, nothing ran", refusedSnap.status === "REFUSED" && refusedSnap.resolvedSignals.length === 1 && refusedSnap.executionOrder.length === 0 && refusedSnap.signalResults.length === 0 && refusedSnap.providerResults.length === 0 && validator.validateAnalysis(refusedSnap).length === 0);
  const snapOk = { signalId: "alpha", status: "COMPLETED", confidence: 0.5, metadata: {}, warnings: [], errors: [], executionTime: 0 };
  const snapBad = { signalId: "beta", status: "BOGUS" };
  const stub = { ...signalsWith(fake("alpha"), fake("beta")), run: async () => ({ order: ["alpha", "beta"], results: [snapOk, snapBad] }) };
  const snapMixed = await resolverOf(stub as never).resolve(goodContext());
  check("a rejected result is not in the snapshot; its signal is failed, and the snapshot is valid", snapMixed.signalResults.map((r) => r.signalId).join() === "alpha" && snapMixed.failedSignals.join() === "beta" && snapMixed.executionOrder.join() === "alpha,beta" && snapMixed.resolvedSignals.length === 2 && validator.validateAnalysis(snapMixed).length === 0);
  const brokenRun = await resolverOf({ ...signalsWith(fake("alpha")), run: async () => { throw new Error("down"); } } as never).resolve(goodContext());
  check("a pipeline that threw leaves an empty execution order and no results", brokenRun.executionOrder.length === 0 && brokenRun.signalResults.length === 0 && brokenRun.resolvedSignals.length === 1);
  const disabledSnap = await resolverOf(signalsWith(fake("alpha"), fake("beta", { enabled: false }))).resolve(goodContext());
  check("a disabled signal is resolved but not ordered and has no result", disabledSnap.resolvedSignals.some((x) => x.signalId === "beta" && x.enabled === false) && disabledSnap.executionOrder.join() === "alpha" && disabledSnap.signalResults.length === 1);

  const throwing = createEvidenceResolver({ now: zero, observer: () => { throw new Error("observer down"); } });
  throwing.registerProvider(evProvider({ id: "ev-a" }));
  const heard = await throwing.run(createEvidenceContext({ candidate }));
  check("an observer that throws does not change a collection", heard.results.length === 1 && heard.results[0].status === "COLLECTED");
  const rec2 = createEvidenceRecorder();
  const live = createEvidenceResolver({ now: zero, observer: rec2.observer });
  live.registerProvider(evProvider({ id: "ev-a" }));
  await live.run(createEvidenceContext({ candidate }));
  const drained = rec2.drain();
  check("the recorder keeps frozen copies in order, and drain forgets them", drained.length === 1 && drained[0].providerId === "ev-a" && isDeepFrozen(drained[0]) && rec2.drain().length === 0);

  const tamper = (over: Record<string, unknown>) => validator.validateAnalysis({ ...sn, ...over });
  check("the validator accepts the snapshot and rejects a missing snapshot field", tamper({}).length === 0 && has(validator.validateAnalysis(Object.fromEntries(Object.entries(sn).filter(([k]) => k !== "signalResults"))), /signalResults/));
  check("the validator rejects resolvedSignals that disagree with registeredSignals", has(tamper({ resolvedSignals: [] }), /do not match/));
  check("the validator rejects a result for a signal that is not registered or not ordered", has(tamper({ signalResults: [{ ...sn.signalResults[0], signalId: "ghost" }] }), /not registered/) && has(tamper({ executionOrder: [] }), /not in the execution order/));
  check("the validator rejects an invalid stored result", has(tamper({ signalResults: [{ ...sn.signalResults[0], status: "BOGUS" }] }), /Invalid signal result/));
  check("the validator rejects a result that disagrees with the executed list", has(tamper({ executedSignals: [] }), /not listed as executed/));
  check("the validator rejects an invalid provider result and non-flat metadata", has(tamper({ providerResults: [{ ...sn.providerResults[0], status: "BOGUS" }] }), /Invalid provider result/) && has(tamper({ pipelineMetadata: { nested: { a: 1 } } }), /Invalid metadata/) && has(tamper({ executionMetadata: { nested: [1] } }), /Invalid metadata/));
  check("the validator still rejects an extra field", has(tamper({ score: 1 }), /Unexpected field/));

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/opportunity");
  const names = walk(dir).filter((f) => /[\\/]opportunity-resolver(-[a-z]+)?\.ts$/.test(f));
  check("nine modules exist: resolver, pipeline, plan, context, decision, validator, aggregate, analysis, recorder", names.map((f) => f.split(/[\\/]/).pop()).sort().join() === "opportunity-resolver-aggregate.ts,opportunity-resolver-analysis.ts,opportunity-resolver-context.ts,opportunity-resolver-decision.ts,opportunity-resolver-pipeline.ts,opportunity-resolver-plan.ts,opportunity-resolver-recorder.ts,opportunity-resolver-validator.ts,opportunity-resolver.ts");
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no concrete signal, channel, or marketplace is named anywhere, comments included", !lines.some((l) => /competition|commercial|landing|google|\bseo\b|marketplace|affiliate|clickbank|hotmart|amazon|shopify|campaign|slug/i.test(l)));
  check("no concrete signal id or signal category is named in code", !code.some((l) => /["']evidence["']|evidence-signal|EVIDENCE_SIGNAL|["'](COMPETITION|COMMERCIAL_INTENT|EVIDENCE|LANDING_PAGE|MARKET|BRAND|OFFER|COMPLIANCE)["']|OPPORTUNITY_SIGNAL_CATEGORIES/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(opportunity-resolver(-[a-z]+)?|opportunity-signal-(context|contract|pipeline|resolver|validator)|opportunity-types|opportunity-validator)$|^\.\/providers\/evidence-provider-(context|contract|resolver|validator)$|^\.\.\/discovery\/discovery-types$/;
  check("imports were found", imports.length >= 25);
  check("the resolver imports only the Signal Contract, the framework, the evidence provider framework, and its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform module is imported at all", !imports.some((i) => i.from.startsWith("@/")));
  check("the Discovery import is type-only", imports.filter((i) => /discovery/.test(i.from)).every((i) => i.typeOnly));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|db/i.test(i.from.replace(/\/opportunity-types|\/opportunity-signal-contract/, ""))));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const clockLines = code.filter((l) => /Date\.now|new Date\(|Math\.random|randomUUID/.test(l));
  check("the wall clock and the id generator are read in exactly two places, both injectable defaults in the pipeline", clockLines.length === 2 && clockLines.every((l) => /options\.(timestamp|idFactory)\s*\?\?/.test(l)));
  check("the resolver never registers, enables, disables, or removes a signal", !code.some((l) => /\.(register|enable|disable|remove)\(/.test(l)));
  check("the resolver never calls a signal's own members", !code.some((l) => /\.(analyze|supportsCandidate)\(/.test(l)));
  check("nothing in the resolver assigns into its inputs", !code.some((l) => /\b(context|input|inputs|plan|results|candidate)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the resolver builds", code.some((l) => /freezeDeep\(/.test(l)));
  const frameworkFiles = readdirSync(dir).filter((f) => /^(opportunity-signal-|competition-|commercial-intent-|evidence-|landing-page-)/.test(f)).map((f) => join(dir, f));
  check("no existing module imports the resolver", !frameworkFiles.some((f) => /opportunity-resolver/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nOpportunity resolver: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
