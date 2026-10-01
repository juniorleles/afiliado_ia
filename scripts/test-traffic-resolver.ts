import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createOpportunityExplanationEngine } from "../src/lib/opportunity/opportunity-explanation-engine.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import { aggregateTrafficSignalResults } from "../src/lib/traffic/traffic-resolver-aggregate.ts";
import { RESOLVED_TRAFFIC_ANALYSIS_KEYS } from "../src/lib/traffic/traffic-resolver-analysis.ts";
import { createTrafficExecutionContext, isDeepFrozenTraffic, toTrafficSignalContext } from "../src/lib/traffic/traffic-resolver-context.ts";
import { TRAFFIC_ANALYSIS_STATUSES, TRAFFIC_DECISION_SCOPE_NOTE, decideTraffic } from "../src/lib/traffic/traffic-resolver-decision.ts";
import { STAGE_STATUSES } from "../src/lib/traffic/traffic-resolver-pipeline.ts";
import { TRAFFIC_PIPELINE_STAGES, buildTrafficExecutionPlan } from "../src/lib/traffic/traffic-resolver-plan.ts";
import { createTrafficValidator } from "../src/lib/traffic/traffic-resolver-validator.ts";
import { createTrafficExecutionRecorder } from "../src/lib/traffic/traffic-resolver-recorder.ts";
import { createTrafficResolver } from "../src/lib/traffic/traffic-resolver.ts";
import { createTrafficSignalPipeline } from "../src/lib/traffic/traffic-signal-pipeline.ts";
import type { TrafficSignalModule, TrafficSignalOutput, TrafficSignalResult } from "../src/lib/traffic/traffic-signal-contract.ts";
import { createChannelSuitabilitySignal, registerChannelSuitabilitySignal } from "../src/lib/traffic/channel-suitability-signal.ts";
import { createPolicyRiskSignal, registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
import { createAudienceFitSignal, registerAudienceFitSignal } from "../src/lib/traffic/audience-fit-signal.ts";
import { createOfferStrategySignal, registerOfferStrategySignal } from "../src/lib/traffic/offer-strategy-signal.ts";
import { createCreativeReadinessSignal, registerCreativeReadinessSignal } from "../src/lib/traffic/creative-readiness-signal.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const candidateBefore = JSON.stringify(candidate);
const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));
const sameOutput = (a: { status: unknown; confidence: unknown; metadata: unknown; warnings: unknown; errors: unknown }, b: { status: unknown; confidence: unknown; metadata: unknown; warnings: unknown; errors: unknown }) =>
  stable({ status: a.status, confidence: a.confidence, metadata: a.metadata, warnings: a.warnings, errors: a.errors }) === stable({ status: b.status, confidence: b.confidence, metadata: b.metadata, warnings: b.warnings, errors: b.errors });

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

function stubOpportunity(over: Record<string, unknown> = {}) {
  return {
    analysisId: "opp-1",
    candidateId: "cand-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    status: "COMPLETED",
    registeredSignals: ["alpha-opp"],
    executedSignals: ["alpha-opp"],
    failedSignals: [],
    warnings: [],
    errors: [],
    metadata: {},
    executionTime: 1,
    resolvedSignals: [{ signalId: "alpha-opp", name: "Alpha", version: "1.0.0", category: "FUTURE", priority: 1, enabled: true, requires: [], optional: [], position: 0 }],
    executionOrder: ["alpha-opp"],
    signalResults: [{ signalId: "alpha-opp", status: "COMPLETED", confidence: 0.5, metadata: {}, warnings: [], errors: [], executionTime: 1 }],
    providerResults: [],
    executionMetadata: {},
    pipelineMetadata: {},
    ...over,
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
  category?: TrafficSignalModule["category"];
  output?: () => TrafficSignalOutput | Promise<TrafficSignalOutput>;
  capture?: (context: Parameters<TrafficSignalModule["analyze"]>[0]) => void;
}
const OK: TrafficSignalOutput = { status: "COMPLETED", confidence: 0.5, metadata: { k: 1, note: "fixture" }, warnings: [], errors: [] };
function fake(id: string, over: FakeOpts = {}): TrafficSignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category: over.category ?? "FUTURE",
    enabled: over.enabled ?? true,
    priority: over.priority ?? 100,
    dependencies: { requires: over.requires ?? [], optional: over.optional ?? [], conflicts: over.conflicts ?? [] },
    supportsAnalysis: () => over.supports ?? true,
    validate: () => [],
    analyze: (context) => {
      calls.push(id);
      over.capture?.(context);
      return over.output ? over.output() : { ...OK, metadata: { ...OK.metadata } };
    },
  };
}
const FAILED_OUTPUT = (): TrafficSignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: ["careful"], errors: ["boom"] });

function signalsWith(...modules: TrafficSignalModule[]) {
  const pipeline = createTrafficSignalPipeline({ now: zero });
  for (const module of modules) pipeline.register(module);
  return pipeline;
}
const goodContext = (over: Record<string, unknown> = {}) =>
  createTrafficExecutionContext({
    candidate,
    opportunityAnalysis: stubOpportunity() as never,
    opportunityExplanation: null,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  } as never);
function resolverOf(signals: ReturnType<typeof signalsWith>, extra: Record<string, unknown> = {}) {
  return createTrafficResolver({ signals, ...clocks(), ...extra } as never);
}

const CATEGORIES = ["EVIDENCE", "LANDING_PAGE", "COMPETITION", "COMMERCIAL_INTENT", "MARKET", "BRAND"] as const;
function fakeOpportunity(id: string, category: OpportunitySignalModule["category"], metadata: SignalOutput["metadata"]): OpportunitySignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category,
    enabled: true,
    priority: 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsCandidate: () => true,
    validate: () => [],
    analyze: () => ({ status: "COMPLETED", confidence: 0.8, metadata: { ...metadata }, warnings: [], errors: [] }),
  };
}
const OWNER: Record<string, string> = {
  FEATURES: "evid",
  PRICING: "evid",
  GUARANTEE: "evid",
  RETURNS: "evid",
  MANUFACTURER: "evid",
  FAQ: "evid",
  OFFER_COVERAGE: "lp",
  HERO_STRENGTH: "lp",
  FEATURE_COVERAGE: "lp",
  PRICING_COVERAGE: "lp",
  GUARANTEE_COVERAGE: "lp",
  FAQ_COVERAGE: "lp",
  INFORMATION_DENSITY: "lp",
  CTA_AVAILABILITY: "lp",
  PRESENTATION_READINESS: "lp",
  MEDIA_AVAILABILITY: "lp",
  OFFER_VISIBILITY: "intent",
  PRICE_VISIBILITY: "intent",
  UPSELL_POTENTIAL: "intent",
  BUYER_READINESS: "intent",
  CONSUMER_TRUST: "intent",
  RECURRING_PURCHASE_POTENTIAL: "intent",
};
const GOOD: Record<string, string> = Object.fromEntries(Object.keys(OWNER).map((d) => [d, "STRONG"]));

async function liveOpportunity() {
  const bySignal: Record<string, Record<string, string>> = { evid: {}, lp: {}, intent: {} };
  for (const [dimension, state] of Object.entries(GOOD)) bySignal[OWNER[dimension]][`dimension.${dimension}`] = state;
  const signals = createSignalPipeline({ now: zero });
  Object.entries(bySignal).forEach(([id, metadata], i) => signals.register(fakeOpportunity(id, CATEGORIES[i % CATEGORIES.length], metadata)));
  let t = 0;
  let s = 0;
  let n = 0;
  const opportunityContext = createOpportunityExecutionContext({
    candidate,
    evidenceContext: createEvidenceContext({ candidate, metadata: {}, extensions: {}, resolvedProductData: {} }),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: {},
  } as never);
  const runResolver = await createOpportunityResolver({
    signals,
    now: () => (t += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `opp-${(n += 1)}`,
  } as never).run(opportunityContext);
  const analysis = JSON.parse(JSON.stringify(runResolver.analysis));
  const explanation = createOpportunityExplanationEngine({ now: () => 0 }).explain(runResolver.analysis).explanation;
  return { analysis, explanation, opportunityContext };
}

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

async function main() {
  check("six stages, in the requested order", TRAFFIC_PIPELINE_STAGES.join() === "RESOLVE_CANDIDATE,RESOLVE_OPPORTUNITY_ANALYSIS,RESOLVE_TRAFFIC_SIGNALS,VALIDATE_RESULTS,AGGREGATE_RESULTS,BUILD_ANALYSIS");
  check("four analysis statuses and three stage statuses", TRAFFIC_ANALYSIS_STATUSES.join() === "COMPLETED,PARTIAL,FAILED,REFUSED" && STAGE_STATUSES.join() === "PASSED,FAILED,SKIPPED");
  check("the analysis has exactly the requested fields", RESOLVED_TRAFFIC_ANALYSIS_KEYS.join() === "analysisId,candidateId,status,startedAt,completedAt,registeredSignals,executedSignals,failedSignals,signalResults,warnings,errors,metadata,executionTime,resolvedSignals,executionOrder,executionMetadata,pipelineMetadata,opportunityAnalysisId");

  const empty = createTrafficExecutionContext();
  check("an empty context has every member, empty or null", empty.candidate === null && empty.opportunityAnalysis === null && empty.opportunityExplanation === null && Object.keys(empty).sort().join() === "candidate,configuration,executionMetadata,opportunityAnalysis,opportunityExplanation,runtimeMetadata" && Object.keys(empty.executionMetadata).length === 0);
  check("creating a context from null or undefined is legal", createTrafficExecutionContext(null).candidate === null && createTrafficExecutionContext(undefined).candidate === null);
  const liveCandidate = { ...candidate };
  const liveMeta = { run: "r1" };
  const made = createTrafficExecutionContext({ candidate: liveCandidate, opportunityAnalysis: stubOpportunity() as never, executionMetadata: liveMeta });
  liveCandidate.title = "changed";
  liveMeta.run = "changed";
  check("a context copies its inputs and is deeply frozen", made.candidate?.title === "Fictional item" && made.executionMetadata.run === "r1" && isDeepFrozenTraffic(made) && !Object.isFrozen(liveCandidate) && !Object.isFrozen(liveMeta));
  const sig = toTrafficSignalContext(goodContext());
  check("the signal context carries the candidate, Opportunity analysis, execution metadata, runtime, and configuration", sig.candidate?.id === "cand-1" && sig.opportunityAnalysis?.analysisId === "opp-1" && sig.executionMetadata.run === "r1" && sig.runtimeMetadata.host === "h1" && sig.configuration.mode === "m1" && Object.isFrozen(sig));

  const base = { refusals: [] as string[], runError: null, enabled: 3, completed: 3, failed: 0, skipped: 0 };
  check("every enabled signal completed: COMPLETED", decideTraffic(base).status === "COMPLETED");
  check("some completed: PARTIAL", decideTraffic({ ...base, completed: 2, failed: 1 }).status === "PARTIAL" && decideTraffic({ ...base, completed: 1, skipped: 2 }).status === "PARTIAL");
  check("none completed: FAILED", decideTraffic({ ...base, completed: 0, failed: 3 }).status === "FAILED" && decideTraffic({ ...base, completed: 0, skipped: 3 }).status === "FAILED");
  check("a run error: FAILED", decideTraffic({ ...base, runError: "down", completed: 0 }).status === "FAILED");
  check("refusals win over everything: REFUSED", decideTraffic({ ...base, refusals: ["x"] }).status === "REFUSED" && decideTraffic({ ...base, refusals: ["x"], runError: "y" }).status === "REFUSED");
  check("no enabled signal: REFUSED", decideTraffic({ ...base, enabled: 0, completed: 0 }).status === "REFUSED");
  const decided = decideTraffic({ ...base, completed: 2, failed: 1 });
  check("a decision carries counts and reasons, and no score or recommendation", decided.enabledCount === 3 && decided.completedCount === 2 && decided.failedCount === 1 && Object.keys(decided).sort().join() === "completedCount,enabledCount,failedCount,reasons,skippedCount,status");
  check("the scope note says a decision is not a judgement", /not a score, a ranking, or a recommendation/.test(TRAFFIC_DECISION_SCOPE_NOTE));

  calls = [];
  const planned = signalsWith(fake("alpha", { priority: 100 }), fake("beta", { priority: 50, requires: ["alpha"] }), fake("gamma", { priority: 10 }), fake("delta", { enabled: false }));
  const plan = buildTrafficExecutionPlan(planned.registry.list());
  check("the plan orders enabled signals by dependency, then priority", plan.order.join() === "alpha,beta,gamma" && plan.disabled.join() === "delta" && plan.issues.length === 0);
  check("the plan lists every registered signal with its contract members and position", plan.signals.length === 4 && plan.signals.find((s) => s.signalId === "beta")?.requires.join() === "alpha" && plan.signals.find((s) => s.signalId === "beta")?.position === 1 && plan.signals.find((s) => s.signalId === "delta")?.position === null && plan.signals.every((s) => s.name && s.version && s.category));
  check("the plan names the six stages and is frozen", plan.stages.join() === TRAFFIC_PIPELINE_STAGES.join() && isDeepFrozenTraffic(plan));
  check("planning runs no signal and changes no registry state", calls.length === 0 && planned.registry.count() === 4 && planned.registry.get("delta")?.enabled === false);
  const brokenPlan = buildTrafficExecutionPlan(signalsWith(fake("alpha", { requires: ["missing-one"] })).registry.list());
  check("a plan reports invalid dependencies and does not repair them", brokenPlan.issues.length === 1 && brokenPlan.order.length === 0);

  const validator = createTrafficValidator();
  const good = goodContext();
  check("a valid context passes", validator.validateInput(good).length === 0 && validator.validateOpportunityAnalysis(good).length === 0);
  check("Missing Candidate is rejected", has(validator.validateInput(createTrafficExecutionContext({ opportunityAnalysis: stubOpportunity() as never })), /Missing candidate/));
  check("Missing Context is rejected: no context at all", has(validator.validateInput(undefined), /Missing context/) && has(validator.validateInput(null), /Missing context/) && has(validator.validateInput("x"), /Missing context/));
  check("an invalid candidate is rejected", has(validator.validateInput({ ...good, candidate: { id: "", source: "s", url: "u", title: "t" } }), /Invalid candidate/) && has(validator.validateInput({ ...good, candidate: "x" }), /Invalid candidate/));
  check("Missing Opportunity Analysis is rejected", has(validator.validateOpportunityAnalysis(createTrafficExecutionContext({ candidate })), /Missing Opportunity analysis/));
  check("an Opportunity analysis that did not complete cannot be read", has(validator.validateOpportunityAnalysis({ ...good, opportunityAnalysis: stubOpportunity({ status: "FAILED" }) }), /only a COMPLETED or PARTIAL analysis can be read/));
  check("an Opportunity analysis for a different candidate is rejected", has(validator.validateOpportunityAnalysis({ ...good, opportunityAnalysis: stubOpportunity({ candidateId: "other" }) }), /different candidate/));
  for (const field of ["executionMetadata", "runtimeMetadata", "configuration"]) {
    for (const bad of [{ a: { b: 1 } }, { a: Number.NaN }, { "": 1 }, "text", [1], undefined]) {
      check(`Invalid Metadata: ${field} = ${JSON.stringify(bad) ?? "undefined"} is rejected`, has(validator.validateInput({ ...good, [field]: bad }), /Invalid metadata/));
    }
  }
  check("Missing Signal Registry is rejected: nothing, an empty object, a pipeline without a registry or run", [undefined, null, {}, { run: () => 0 }, { registry: {}, run: () => 0, resolveExecutionOrder: () => 0 }, { registry: { list: () => [] }, resolveExecutionOrder: () => 0 }].every((s) => has(validator.validateSignalSource(s), /Missing signal registry/)) && validator.validateSignalSource(planned).length === 0);

  check("Duplicate Signal is rejected in a plan", has(validator.validatePlan({ signals: [{ signalId: "a" }, { signalId: "a" }], order: ["a"], issues: [] }), /Duplicate signal "a"/) && has(validator.validatePlan({ signals: [{ signalId: "a" }], order: ["a", "a"], issues: [] }), /Duplicate signal "a" in the run order/));
  check("a plan with an unregistered ordered signal, no enabled signal, or dependency issues is rejected", has(validator.validatePlan({ signals: [], order: ["a"], issues: [] }), /not registered/) && has(validator.validatePlan({ signals: [{ signalId: "a" }], order: [], issues: [] }), /No signal is enabled/) && validator.validatePlan(brokenPlan).length >= 1 && has(validator.validatePlan(null), /malformed/));
  check("a real plan validates", validator.validatePlan(plan).length === 0);

  const okResult: TrafficSignalResult = { signalId: "alpha", status: "COMPLETED", confidence: 0.5, metadata: { k: 1 }, warnings: [], errors: [], executionTime: 1 };
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

  const checkPlan = buildTrafficExecutionPlan(signalsWith(fake("alpha"), fake("beta")).registry.list());
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
  check("TrafficValidator contract: validateSignal checks a signal module against the Signal Contract", validator.validateSignal(fake("alpha")).length === 0 && validator.validateSignal({}).length > 0);

  const aggPlan = buildTrafficExecutionPlan(signalsWith(fake("alpha"), fake("beta", { priority: 50 }), fake("gamma", { priority: 10 }), fake("delta", { priority: 5 }), fake("omega", { priority: 1, enabled: false })).registry.list());
  const agg = aggregateTrafficSignalResults(
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
  const aggRejected = aggregateTrafficSignalResults(aggPlan, [], [{ signalId: "alpha", errors: ["bad"] }, { signalId: "stray", errors: ["not planned"] }]);
  check("a rejected result counts as failed with its errors, and a stray one keeps its errors", aggRejected.failedSignals.join() === "alpha" && aggRejected.errors.join() === "alpha: bad,stray: not planned" && aggRejected.metadata["signal.alpha.confidence"] === null);

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
  check("the run returns an analysis with exactly the requested fields", Object.keys(a).join() === RESOLVED_TRAFFIC_ANALYSIS_KEYS.join());
  check("identity: injected id, candidate id, Opportunity analysis id, timestamps in order", a.analysisId === "analysis-1" && a.candidateId === "cand-1" && a.opportunityAnalysisId === "opp-1" && Date.parse(a.completedAt) > Date.parse(a.startedAt) && a.startedAt.endsWith("Z"));
  check("PARTIAL: some completed, one failed, one skipped", a.status === "PARTIAL" && run.decision.status === "PARTIAL");
  check("registered, executed, and failed signals are listed", a.registeredSignals.join() === "alpha,beta,gamma,delta,omega" && a.executedSignals.join() === "alpha,beta,gamma" && a.failedSignals.join() === "gamma");
  check("signals ran in plan order, a disabled one did not run, and a skipped one did not analyze", calls.join() === "alpha,beta,gamma");
  check("each enabled signal was recorded exactly once", run.executions.map((e) => e.signalId).join() === "alpha,beta,gamma,delta" && new Set(run.executions.map((e) => e.signalId)).size === run.executions.length);
  check("errors and warnings keep the signal id", a.errors.join() === "gamma: boom" && a.warnings.includes("gamma: careful") && a.warnings.some((w) => /^delta: /.test(w)));
  check("available and missing signals are reported", a.metadata.availableSignals === "alpha,beta" && a.metadata.missingSignals === "gamma,delta,omega" && a.metadata.skippedSignals === "delta" && a.metadata.disabledSignals === "omega");
  check("each signal's status, confidence, timing, and metadata are carried", a.metadata["signal.alpha.status"] === "COMPLETED" && a.metadata["signal.alpha.confidence"] === 0.5 && a.metadata["signal.alpha.metadata.note"] === "fixture" && a.metadata["signal.gamma.status"] === "FAILED" && typeof a.metadata["signal.beta.executionTime"] === "number");
  check("execution, runtime, and configuration are accounted for without echoing configuration", a.metadata["execution.run"] === "r1" && a.metadata["runtime.host"] === "h1" && a.metadata.configurationKeys === 1 && !("configuration.mode" in a.metadata) && a.metadata.candidateSource === "feed" && a.metadata.opportunityAnalysisId === "opp-1");
  check("every stage is recorded and all passed", TRAFFIC_PIPELINE_STAGES.every((s) => a.metadata[`stage.${s}`] === "PASSED") && run.stages.length === 6);
  check("the decision note says the run is not a judgement", a.metadata.decisionNote === TRAFFIC_DECISION_SCOPE_NOTE && /2 of 4 enabled signals completed; 1 failed and 1 were skipped/.test(String(a.metadata.decision)));
  check("the analysis is frozen and valid", isDeepFrozenTraffic(a) && validator.validateAnalysis(a).length === 0);
  check("the run also hands back the plan and the aggregate", run.plan?.order.join() === "alpha,beta,gamma,delta" && run.aggregate?.availableSignals.join() === "alpha,beta");
  check("there is no score, ranking, weight, or recommendation anywhere in the analysis", !JSON.stringify(Object.keys(a)).match(/score|rank|weight|recommend/i) && !Object.keys(a.metadata).some((k) => /^(score|rank|weight|recommend)/i.test(k)));
  check("resolve() returns the same analysis as run()", stable(await resolverOf(mixed).resolve(goodContext())) === stable(a));
  check("executionTime comes from the injected clock", a.executionTime >= 1 && Number.isFinite(a.executionTime));

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

  calls = [];
  const ok2 = signalsWith(fake("alpha"), fake("beta"));
  const r0 = resolverOf(ok2);
  const refusalCases: Array<[string, unknown, RegExp, string]> = [
    ["Missing Candidate", { opportunityAnalysis: stubOpportunity() }, /Missing candidate/, "FAILED,SKIPPED,SKIPPED,SKIPPED,SKIPPED,PASSED"],
    ["Missing Context (nothing)", undefined, /Missing candidate/, "FAILED,SKIPPED,SKIPPED,SKIPPED,SKIPPED,PASSED"],
    ["Missing Opportunity Analysis", { candidate }, /Missing Opportunity analysis/, "PASSED,FAILED,SKIPPED,SKIPPED,SKIPPED,PASSED"],
    ["Invalid Metadata", { ...goodContext(), executionMetadata: { a: { b: 1 } } }, /Invalid metadata/, "FAILED,SKIPPED,SKIPPED,SKIPPED,SKIPPED,PASSED"],
  ];
  for (const [name, input, pattern, stages] of refusalCases) {
    const refused = await r0.run(input as never);
    check(`${name}: the run is REFUSED, nothing executes, and the analysis explains`, refused.analysis.status === "REFUSED" && refused.analysis.errors.some((e) => pattern.test(e)) && refused.analysis.executedSignals.length === 0 && refused.analysis.failedSignals.length === 0 && validator.validateAnalysis(refused.analysis).length === 0);
    check(`${name}: later stages are skipped`, refused.stages.map((s) => s.status).join() === stages && refused.aggregate === null && refused.plan === null);
  }
  check("none of the refused runs analyzed a signal", calls.length === 0);
  const noCandidate = await r0.resolve({ opportunityAnalysis: stubOpportunity() } as never);
  check("a refused run with no candidate has a null candidate id and still lists the registered signals", noCandidate.candidateId === null && noCandidate.registeredSignals.join() === "alpha,beta");
  const refusedWithCandidate = await r0.resolve({ candidate } as never);
  check("a refused run keeps the candidate id it was given", refusedWithCandidate.candidateId === "cand-1" && refusedWithCandidate.opportunityAnalysisId === null);

  for (const [name, source] of [["undefined", undefined], ["an empty object", {}], ["a pipeline with no run", { registry: { list: () => [] }, resolveExecutionOrder: () => ({}) }]] as const) {
    const missingRegistry = await createTrafficResolver({ signals: source as never, ...clocks() }).run(goodContext());
    check(`Missing Signal Registry (${name}): REFUSED, with no signals listed`, missingRegistry.analysis.status === "REFUSED" && missingRegistry.analysis.errors.some((e) => /Missing signal registry/.test(e)) && missingRegistry.analysis.registeredSignals.length === 0);
  }
  check("plan() returns null when the registry is missing", createTrafficResolver({ signals: undefined as never }).plan() === null);

  const noneEnabled = await resolverOf(signalsWith(fake("alpha", { enabled: false }))).run(goodContext());
  check("no enabled signal: REFUSED, and the disabled one is not enabled to make the run succeed", noneEnabled.analysis.status === "REFUSED" && noneEnabled.analysis.errors.some((e) => /No signal is enabled/.test(e)) && noneEnabled.analysis.registeredSignals.join() === "alpha" && noneEnabled.stages[2].status === "FAILED");
  const emptyRegistry = await resolverOf(createTrafficSignalPipeline()).resolve(goodContext());
  check("an empty registry: REFUSED", emptyRegistry.status === "REFUSED" && emptyRegistry.registeredSignals.length === 0);
  calls = [];
  const brokenDeps = signalsWith(fake("alpha", { requires: ["missing-one"] }), fake("beta"));
  const refusedDeps = await resolverOf(brokenDeps).run(goodContext());
  check("invalid dependencies: REFUSED, nothing runs, and nothing is registered or enabled to repair it", refusedDeps.analysis.status === "REFUSED" && refusedDeps.analysis.errors.some((e) => /missing-one/.test(e)) && calls.length === 0 && brokenDeps.registry.count() === 2 && refusedDeps.analysis.registeredSignals.length === 2);

  const entryAlpha = ok2.registry.get("alpha")!;
  const duplicateSource = { ...ok2, registry: { ...ok2.registry, list: () => [entryAlpha, entryAlpha] } };
  const dupRun = await resolverOf(duplicateSource as never).run(goodContext());
  check("Duplicate Signal: a registry listing a signal twice is REFUSED", dupRun.analysis.status === "REFUSED" && dupRun.analysis.errors.some((e) => /Duplicate signal "alpha"/.test(e)));

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

  const failing = await resolverOf({ ...ok2, run: async () => { throw new Error("pipeline down"); } } as never).run(goodContext());
  check("a signal pipeline that throws gives FAILED, with the reason, and later stages skipped", failing.analysis.status === "FAILED" && failing.analysis.errors.includes("pipeline down") && failing.stages.map((s) => s.status).join() === "PASSED,PASSED,FAILED,SKIPPED,SKIPPED,PASSED" && failing.analysis.executedSignals.length === 0);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const slow = resolverOf(signalsWith(fake("alpha", { output: async () => { await gate; return { ...OK }; } })));
  const first = slow.run(goodContext());
  const second = await slow.resolve(goodContext());
  release();
  const firstDone = await first;
  check("a second run while one is in progress is FAILED, and the first is unaffected", second.status === "FAILED" && second.errors.some((e) => /already in progress/.test(e)) && firstDone.analysis.status === "COMPLETED");
  let neverThrows = true;
  for (const input of [null, undefined, 5, "x", [], {}, { candidate: 5 }, { opportunityAnalysis: 5 }, () => 0]) {
    try {
      const out = await r0.resolve(input as never);
      neverThrows = neverThrows && out.status === "REFUSED";
    } catch {
      neverThrows = false;
    }
  }
  check("the resolver never throws on odd input; it refuses", neverThrows);

  calls = [];
  check("validate() previews the refusal reasons and runs nothing", r0.validate(goodContext()).length === 0 && has(r0.validate(null), /Missing candidate/) && has(r0.validate(null), /Missing Opportunity analysis/) && calls.length === 0);
  check("plan() previews the order and runs nothing", r0.plan()?.order.join() === "alpha,beta" && calls.length === 0);

  let seen: Parameters<TrafficSignalModule["analyze"]>[0] | null = null;
  await resolverOf(signalsWith(fake("alpha", { capture: (c) => { seen = c; } }))).resolve(goodContext());
  check("a signal receives the candidate, Opportunity analysis, execution metadata, runtime, and configuration", seen !== null && seen.candidate?.id === "cand-1" && seen.opportunityAnalysis?.analysisId === "opp-1" && seen.executionMetadata.run === "r1" && seen.runtimeMetadata.host === "h1" && seen.configuration.mode === "m1" && Object.isFrozen(seen));

  const liveInput = { candidate: { ...candidate }, opportunityAnalysis: stubOpportunity() as never, executionMetadata: { run: "r1" } };
  const liveBefore = JSON.stringify(liveInput);
  await resolverOf(signalsWith(fake("alpha"))).resolve(liveInput);
  check("the input objects are neither changed nor frozen by a run", JSON.stringify(liveInput) === liveBefore && !Object.isFrozen(liveInput.candidate) && !Object.isFrozen(liveInput.executionMetadata));
  const before = signalsWith(fake("alpha"), fake("beta", { enabled: false }));
  await resolverOf(before).resolve(goodContext());
  check("the registry is untouched by a run: no registering, enabling, disabling, or removal", before.registry.count() === 2 && before.registry.get("alpha")?.enabled === true && before.registry.get("beta")?.enabled === false);
  const mk = () => signalsWith(fake("alpha", { priority: 100 }), fake("beta", { priority: 50, requires: ["alpha"] }), fake("gamma", { priority: 10, output: FAILED_OUTPUT }));
  check("a run is deterministic under injected clocks", stable(await resolverOf(mk()).resolve(goodContext())) === stable(await resolverOf(mk()).resolve(goodContext())));
  const renamed = () => signalsWith(fake("omicron", { priority: 100, category: "POLICY" }), fake("sigma", { priority: 50, requires: ["omicron"], category: "AUDIENCE" }), fake("kappa", { priority: 10, output: FAILED_OUTPUT, category: "OFFER" }));
  const original = stable(await resolverOf(mk()).resolve(goodContext()));
  const swapped = stable(await resolverOf(renamed()).resolve(goodContext())).replace(/omicron/g, "alpha").replace(/sigma/g, "beta").replace(/kappa/g, "gamma").replace(/"category":"(POLICY|AUDIENCE|OFFER)"/g, '"category":"FUTURE"');
  check("the resolver is signal-agnostic: renamed signals in other categories give the same analysis", original === swapped);

  const recorder = createTrafficExecutionRecorder();
  const recorded = await resolverOf(signalsWith(fake("alpha"), fake("beta")), { recorder }).run(goodContext());
  check("the recorder keeps one entry per enabled signal, in run order", recorded.executions.map((e) => e.signalId).join() === "alpha,beta" && recorded.executions.every((e) => e.status === "COMPLETED"));
  check("the recorder is emptied by a run and holds nothing afterwards", recorder.drain().length === 0);
  const rec2 = createTrafficExecutionRecorder();
  rec2.record(okResult);
  rec2.record(beta);
  const drained = rec2.drain();
  check("the recorder keeps frozen copies in order, and drain forgets them", drained.length === 2 && drained[0].signalId === "alpha" && isDeepFrozenTraffic(drained[0]) && rec2.drain().length === 0);

  const counts = { analyze: 0, supports: 0, validate: 0 };
  const spy: TrafficSignalModule = {
    ...fake("spy"),
    supportsAnalysis: () => { counts.supports += 1; return true; },
    validate: () => { counts.validate += 1; return []; },
    analyze: () => { counts.analyze += 1; return { ...OK, metadata: { ...OK.metadata } }; },
  };
  const spied = resolverOf(signalsWith(spy));
  const spyAnalysis = await spied.resolve(goodContext());
  const afterOne = { ...counts };
  check("a signal's analyze runs exactly once in one resolver run", afterOne.analyze === 1 && spyAnalysis.signalResults.length === 1 && spyAnalysis.executionOrder.join() === "spy");
  await spied.resolve(goodContext());
  check("a second run runs it once more, with the same number of supportsAnalysis and validate calls", counts.analyze === 2 && counts.supports - afterOne.supports === afterOne.supports && counts.validate - afterOne.validate === afterOne.validate);

  const leaked = { k: 1 };
  const leaking = await resolverOf(signalsWith(fake("alpha", { output: () => ({ ...OK, metadata: leaked }) }))).resolve(goodContext());
  leaked.k = 2;
  check("the snapshot is a copy: changing what a signal returned afterwards changes nothing", leaking.signalResults[0].metadata.k === 1 && leaking.metadata["signal.alpha.metadata.k"] === 1);
  let frozenOk = false;
  try { (a.signalResults as unknown as TrafficSignalResult[]).push({} as TrafficSignalResult); } catch { frozenOk = true; }
  check("the snapshot cannot be changed", frozenOk && Object.isFrozen(a.resolvedSignals) && Object.isFrozen(a.executionOrder));

  const refusedSnap = await resolverOf(signalsWith(fake("alpha"))).resolve(createTrafficExecutionContext({}));
  check("a refused run still has a valid snapshot: the signals are listed, nothing ran", refusedSnap.status === "REFUSED" && refusedSnap.resolvedSignals.length === 1 && refusedSnap.executionOrder.length === 0 && refusedSnap.signalResults.length === 0 && validator.validateAnalysis(refusedSnap).length === 0);
  const snapOk = { signalId: "alpha", status: "COMPLETED", confidence: 0.5, metadata: {}, warnings: [], errors: [], executionTime: 0 };
  const snapBad = { signalId: "beta", status: "BOGUS" };
  const stub = { ...signalsWith(fake("alpha"), fake("beta")), run: async () => ({ order: ["alpha", "beta"], results: [snapOk, snapBad] }) };
  const snapMixed = await resolverOf(stub as never).resolve(goodContext());
  check("a rejected result is not in the snapshot; its signal is failed, and the snapshot is valid", snapMixed.signalResults.map((r) => r.signalId).join() === "alpha" && snapMixed.failedSignals.join() === "beta" && snapMixed.executionOrder.join() === "alpha,beta" && snapMixed.resolvedSignals.length === 2 && validator.validateAnalysis(snapMixed).length === 0);
  const brokenRun = await resolverOf({ ...signalsWith(fake("alpha")), run: async () => { throw new Error("down"); } } as never).resolve(goodContext());
  check("a pipeline that threw leaves an empty execution order and no results", brokenRun.executionOrder.length === 0 && brokenRun.signalResults.length === 0 && brokenRun.resolvedSignals.length === 1);
  const disabledSnap = await resolverOf(signalsWith(fake("alpha"), fake("beta", { enabled: false }))).resolve(goodContext());
  check("a disabled signal is resolved but not ordered and has no result", disabledSnap.resolvedSignals.some((x) => x.signalId === "beta" && x.enabled === false) && disabledSnap.executionOrder.join() === "alpha" && disabledSnap.signalResults.length === 1);

  check("the validator accepts the snapshot and rejects a missing snapshot field", validator.validateAnalysis(a).length === 0 && has(validator.validateAnalysis(Object.fromEntries(Object.entries(a).filter(([k]) => k !== "signalResults"))), /signalResults/));
  check("the validator rejects resolvedSignals that disagree with registeredSignals", has(validator.validateAnalysis({ ...a, resolvedSignals: [] }), /do not match/));
  check("the validator rejects a result for a signal that is not registered or not ordered", has(validator.validateAnalysis({ ...a, signalResults: [{ ...a.signalResults[0], signalId: "ghost" }] }), /not registered/) && has(validator.validateAnalysis({ ...a, executionOrder: [] }), /not in the execution order/));
  check("the validator rejects an invalid stored result", has(validator.validateAnalysis({ ...a, signalResults: [{ ...a.signalResults[0], status: "BOGUS" }] }), /Invalid signal result/));
  check("the validator still rejects an extra field", has(validator.validateAnalysis({ ...a, score: 1 }), /Unexpected field/));

  const live = await liveOpportunity();
  const opportunityBefore = JSON.stringify(live.analysis);
  const liveCtx = createTrafficExecutionContext({
    candidate,
    opportunityAnalysis: live.analysis as never,
    opportunityExplanation: live.explanation as never,
    executionMetadata: { run: "t1" },
    runtimeMetadata: { host: "h1" },
    configuration: {},
  });
  const allTraffic = createTrafficSignalPipeline({ now: zero });
  registerChannelSuitabilitySignal(allTraffic, { now: zero });
  registerPolicyRiskSignal(allTraffic, { now: zero });
  registerAudienceFitSignal(allTraffic, { now: zero });
  registerOfferStrategySignal(allTraffic, { now: zero });
  registerCreativeReadinessSignal(allTraffic, { now: zero });
  const full = await resolverOf(allTraffic).run(liveCtx);
  const fa = full.analysis;
  const expectedOrder = "channel-suitability,policy-risk,audience-fit,offer-strategy,creative-readiness";
  check("the five concrete signals run through the Signal Contract and the analysis is COMPLETED", fa.status === "COMPLETED" && fa.executedSignals.length === 5 && fa.failedSignals.length === 0 && fa.registeredSignals.length === 5 && fa.executionOrder.join() === expectedOrder);
  check("each concrete signal ran exactly once", full.executions.map((e) => e.signalId).join() === expectedOrder && new Set(full.executions.map((e) => e.signalId)).size === 5);
  check("each concrete signal's own status is carried under its id", expectedOrder.split(",").every((id) => fa.metadata[`signal.${id}.status`] === "COMPLETED"));
  const alone = createTrafficSignalPipeline({ now: zero });
  registerChannelSuitabilitySignal(alone, { now: zero });
  registerPolicyRiskSignal(alone, { now: zero });
  registerAudienceFitSignal(alone, { now: zero });
  registerOfferStrategySignal(alone, { now: zero });
  registerCreativeReadinessSignal(alone, { now: zero });
  const aloneRun = await alone.run(toTrafficSignalContext(liveCtx));
  check("each signal's carried result is identical to running the same signals in the framework pipeline", expectedOrder.split(",").every((id) => {
    const fromResolver = fa.signalResults.find((r) => r.signalId === id)!;
    const fromAlone = aloneRun.results.find((r) => r.signalId === id)!;
    return sameOutput(fromResolver, fromAlone);
  }));
  const some = createTrafficSignalPipeline({ now: zero });
  registerChannelSuitabilitySignal(some, { now: zero });
  registerCreativeReadinessSignal(some, { now: zero });
  const partialRun = (await resolverOf(some).run(liveCtx)).analysis;
  check("independent execution: the same signals carry the same results whether or not others are registered", ["channel-suitability", "creative-readiness"].every((id) => Object.entries(fa.metadata).filter(([k]) => k.startsWith(`signal.${id}.metadata.`)).every(([k, v]) => partialRun.metadata[k] === v)) && partialRun.executedSignals.length === 2);
  allTraffic.disable("offer-strategy");
  const without = (await resolverOf(allTraffic).run(liveCtx)).analysis;
  check("disabling one signal removes only that signal: it is registered, missing, and the rest are unchanged", without.registeredSignals.length === 5 && without.executedSignals.length === 4 && without.metadata.missingSignals === "offer-strategy" && without.metadata.disabledSignals === "offer-strategy" && without.status === "COMPLETED");
  allTraffic.enable("offer-strategy");
  check("no Opportunity mutation and no Discovery mutation", JSON.stringify(live.analysis) === opportunityBefore && JSON.stringify(candidate) === candidateBefore && JSON.stringify(live.opportunityContext.candidate) === candidateBefore);
  check("running a signal alone matches running it through the Resolver", sameOutput(createChannelSuitabilitySignal({ now: zero }).analyze(toTrafficSignalContext(liveCtx), {} as never), fa.signalResults.find((r) => r.signalId === "channel-suitability")!) && sameOutput(createPolicyRiskSignal({ now: zero }).analyze(toTrafficSignalContext(liveCtx), {} as never), fa.signalResults.find((r) => r.signalId === "policy-risk")!) && sameOutput(createAudienceFitSignal({ now: zero }).analyze(toTrafficSignalContext(liveCtx), {} as never), fa.signalResults.find((r) => r.signalId === "audience-fit")!) && sameOutput(createOfferStrategySignal({ now: zero }).analyze(toTrafficSignalContext(liveCtx), {} as never), fa.signalResults.find((r) => r.signalId === "offer-strategy")!) && sameOutput(createCreativeReadinessSignal({ now: zero }).analyze(toTrafficSignalContext(liveCtx), {} as never), fa.signalResults.find((r) => r.signalId === "creative-readiness")!));

  const dir = join(process.cwd(), "src/lib/traffic");
  const names = walk(dir).filter((f) => /[\\/]traffic-resolver(-[a-z]+)?\.ts$/.test(f));
  check("nine modules exist: resolver, pipeline, plan, context, decision, validator, aggregate, analysis, recorder", names.map((f) => f.split(/[\\/]/).pop()).sort().join() === "traffic-resolver-aggregate.ts,traffic-resolver-analysis.ts,traffic-resolver-context.ts,traffic-resolver-decision.ts,traffic-resolver-pipeline.ts,traffic-resolver-plan.ts,traffic-resolver-recorder.ts,traffic-resolver-validator.ts,traffic-resolver.ts");
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no concrete signal or advertising platform is named anywhere, comments included", !lines.some((l) => /google|facebook|tiktok|\bseo\b|\bsearch\b|shopping|\bdisplay\b|\bvideo\b|channel-suitability|policy-risk|audience-fit|offer-strategy|creative-readiness|campaign|budget|\bcpc\b/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(traffic-resolver(-[a-z]+)?|traffic-signal-(context|contract|pipeline|resolver|validator)|traffic-types|traffic-validator)$|^\.\.\/(discovery\/discovery-types|opportunity\/opportunity-resolver-analysis|opportunity\/opportunity-explanation-result)$/;
  check("imports were found", imports.length >= 20);
  check("the resolver imports only the Signal Contract, the framework, and its own modules", imports.every((i) => allowed.test(i.from)));
  check("the Discovery and Opportunity imports are type-only", imports.filter((i) => /discovery|opportunity/.test(i.from)).every((i) => i.typeOnly));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|db/i.test(i.from.replace(/traffic-types|traffic-validator|opportunity-resolver-analysis|opportunity-explanation-result/, ""))));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const clockLines = code.filter((l) => /Date\.now|new Date\(|Math\.random|randomUUID/.test(l));
  check("the wall clock and the id generator are read in exactly two places, both injectable defaults in the pipeline", clockLines.length === 2 && clockLines.every((l) => /options\.(timestamp|idFactory)\s*\?\?/.test(l)));
  check("the resolver never registers, enables, disables, or removes a signal", !code.some((l) => /\.(register|enable|disable|remove)\(/.test(l)));
  check("the resolver never calls a signal's own members", !code.some((l) => /\.(analyze|supportsAnalysis)\(/.test(l)));
  check("nothing in the resolver assigns into its inputs", !code.some((l) => /\b(context|input|inputs|plan|results|candidate)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the resolver builds", code.some((l) => /freezeDeepTraffic\(/.test(l)));
  const others = readdirSync(dir).filter((f) => f.endsWith(".ts") && !/^traffic-resolver/.test(f) && !/^traffic-explanation-/.test(f) && !/^traffic-override-/.test(f) && !/^traffic-manual-/.test(f) && !/^traffic-effective-/.test(f) && !/^traffic-live-/.test(f) && !/^traffic-preview-/.test(f) && !/^traffic-comparison-/.test(f) && !/^traffic-version-/.test(f) && !/^traffic-snapshot/.test(f) && !/^traffic-history/.test(f) && !/^traffic-compare/.test(f) && !/^traffic-restore/.test(f)).map((f) => join(dir, f));
  check("no existing traffic module imports the resolver", !others.some((f) => /traffic-resolver/.test(readFileSync(f, "utf8"))));
  const outsiders = ["src/lib/opportunity", "src/lib/discovery"].flatMap((d) => readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f)));
  check("no Opportunity or Discovery module imports the Traffic Resolver", !outsiders.some((f) => /traffic-resolver/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic resolver: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
