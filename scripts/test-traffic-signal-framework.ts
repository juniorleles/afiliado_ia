import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TRAFFIC_SIGNAL_CATEGORIES } from "../src/lib/traffic/traffic-types.ts";
import { TRAFFIC_SIGNAL_RESULT_STATUSES } from "../src/lib/traffic/traffic-signal-contract.ts";
import type { TrafficSignalModule, TrafficSignalOutput, TrafficSignalResult } from "../src/lib/traffic/traffic-signal-contract.ts";
import { createTrafficSignalContext, freezeDeepTraffic } from "../src/lib/traffic/traffic-signal-context.ts";
import type { TrafficSignalContext } from "../src/lib/traffic/traffic-signal-context.ts";
import { TrafficFrameworkError, createTrafficModuleRegistry } from "../src/lib/traffic/traffic-signal-registry.ts";
import { resolveTrafficSignalOrder } from "../src/lib/traffic/traffic-signal-resolver.ts";
import { executeTrafficSignal, skippedTrafficResult } from "../src/lib/traffic/traffic-signal-executor.ts";
import { createTrafficSignalPipeline } from "../src/lib/traffic/traffic-signal-pipeline.ts";
import {
  TRAFFIC_SIGNAL_PRIORITY_MAX,
  isFlatTrafficMetadata,
  isPlainTrafficData,
  isTrafficSignalCategory,
  isTrafficSignalVersion,
  validateNoDuplicateTrafficSignalId,
  validateTrafficDependencies,
  validateTrafficSignalContext,
  validateTrafficSignalModule,
  validateTrafficSignalOutput,
} from "../src/lib/traffic/traffic-signal-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const throwsFramework = (fn: () => unknown, text?: RegExp): boolean => {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof TrafficFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};
const rejectsFramework = async (fn: () => Promise<unknown>, text?: RegExp): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof TrafficFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const analysisFixture = { analysisId: "opp-1", candidateId: "cand-1", status: "COMPLETED", metadata: { a: 1 }, signalResults: [{ signalId: "x", metadata: { n: 1 } }] };
const explanationFixture = { analysisId: "opp-1", candidateId: "cand-1", summary: "s", sections: [] };

interface FakeOpts {
  priority?: number;
  requires?: string[];
  optional?: string[];
  conflicts?: string[];
  enabled?: boolean;
  supports?: boolean;
  category?: TrafficSignalModule["category"];
  output?: (context: TrafficSignalContext, upstream: Record<string, TrafficSignalResult>) => TrafficSignalOutput | Promise<TrafficSignalOutput>;
  validate?: Array<{ field: string; message: string }>;
}
let calls: string[] = [];
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
    validate: () => over.validate ?? [],
    analyze: (context, upstream) => {
      calls.push(id);
      return over.output ? over.output(context, upstream as Record<string, TrafficSignalResult>) : { ...OK, metadata: { ...OK.metadata } };
    },
  };
}
const entriesOf = (...modules: TrafficSignalModule[]) => {
  const registry = createTrafficModuleRegistry();
  for (const m of modules) registry.register(m);
  return registry.list();
};
const pipelineOf = (...modules: TrafficSignalModule[]) => {
  const pipeline = createTrafficSignalPipeline({ now: zero });
  for (const m of modules) pipeline.register(m);
  return pipeline;
};
const fullContext = (over: Record<string, unknown> = {}) =>
  createTrafficSignalContext({ candidate, opportunityAnalysis: analysisFixture, opportunityExplanation: explanationFixture, executionMetadata: { run: "r1" }, runtimeMetadata: { host: "h1" }, configuration: { mode: "m1" }, extensions: { ext: "e1" }, ...over } as never);

async function main() {
  // ---------- constants ----------
  check("eight signal categories", TRAFFIC_SIGNAL_CATEGORIES.length === 8);
  check("three signal result statuses", TRAFFIC_SIGNAL_RESULT_STATUSES.join() === "COMPLETED,FAILED,SKIPPED");
  check("category and version helpers", isTrafficSignalCategory("POLICY") && !isTrafficSignalCategory("policy") && !isTrafficSignalCategory("COMPETITION") && isTrafficSignalVersion("1.2.3") && !isTrafficSignalVersion("1.2") && !isTrafficSignalVersion(1));

  // ---------- the contract ----------
  const good = fake("alpha");
  check("a complete fixture satisfies the contract", validateTrafficSignalModule(good).length === 0);
  for (const [label, value] of [["null", null], ["undefined", undefined], ["a string", "x"]] as const) {
    check(`Missing Contract: ${label} is rejected`, has(validateTrafficSignalModule(value), /Signal contract is missing/));
  }
  const emptyIssues = validateTrafficSignalModule({});
  check("Missing Contract: an empty object lists every member and method", ["id", "name", "version", "category", "enabled", "priority", "dependencies", "supportsAnalysis", "analyze", "validate"].every((m) => has(emptyIssues, new RegExp(`"${m}" is missing`))));
  check("Missing Contract: a missing method is rejected", has(validateTrafficSignalModule({ ...good, analyze: undefined }), /method "analyze" is missing/) && has(validateTrafficSignalModule({ ...good, supportsAnalysis: undefined }), /"supportsAnalysis" is missing/));
  check("Missing Contract: a non-function method is rejected", has(validateTrafficSignalModule({ ...good, validate: "x" }), /method "validate" is missing/));
  check("Missing Contract: the Opportunity method name does not satisfy the contract", has(validateTrafficSignalModule({ ...good, supportsAnalysis: undefined, supportsCandidate: () => true }), /"supportsAnalysis" is missing/));
  check("Missing Contract: missing dependencies are rejected", has(validateTrafficSignalModule({ ...good, dependencies: undefined }), /"dependencies" is missing/));
  check("Invalid Category: an unknown, a lowercase, and an Opportunity-only category are rejected", has(validateTrafficSignalModule({ ...good, category: "NOPE" }), /Category is not supported/) && has(validateTrafficSignalModule({ ...good, category: "policy" }), /Category is not supported/) && has(validateTrafficSignalModule({ ...good, category: "COMPETITION" }), /Category is not supported/) && has(validateTrafficSignalModule({ ...good, category: 5 }), /Category is not supported/));
  check("every traffic category is accepted", TRAFFIC_SIGNAL_CATEGORIES.every((category) => validateTrafficSignalModule({ ...good, category }).length === 0));
  check("Invalid Version: a number, a short version, a prefixed version, and an empty one are rejected", ["1", "1.0", "v1.0.0", "", "1.0.0-beta", "01.0.0"].every((version) => has(validateTrafficSignalModule({ ...good, version }), /semantic version/)) && has(validateTrafficSignalModule({ ...good, version: 1 }), /semantic version/));
  check("valid versions are accepted", ["0.0.1", "1.0.0", "10.20.30"].every((version) => validateTrafficSignalModule({ ...good, version }).length === 0));
  check("an invalid id is rejected", ["", "Alpha", "1alpha", "al pha", "al_pha"].every((id) => has(validateTrafficSignalModule({ ...good, id }), /Id must be/)));
  check("an empty name is rejected", has(validateTrafficSignalModule({ ...good, name: "  " }), /Name must not be empty/) && has(validateTrafficSignalModule({ ...good, name: 5 }), /Name must not be empty/));
  check("a non-boolean enabled is rejected", has(validateTrafficSignalModule({ ...good, enabled: "yes" }), /enabled must be/));
  check("an out-of-range or fractional priority is rejected", [-1, 1001, 1.5, Number.NaN, "5"].every((priority) => has(validateTrafficSignalModule({ ...good, priority }), /Priority must be an integer/)) && [0, TRAFFIC_SIGNAL_PRIORITY_MAX].every((priority) => validateTrafficSignalModule({ ...good, priority }).length === 0));
  const withDeps = (dependencies: unknown) => validateTrafficSignalModule({ ...good, dependencies });
  check("a self dependency or self conflict is rejected", has(withDeps({ requires: ["alpha"], optional: [], conflicts: [] }), /cannot depend on or conflict with itself/) && has(withDeps({ requires: [], optional: [], conflicts: ["alpha"] }), /itself/));
  check("a dependency list that is not a list is rejected", has(withDeps({ requires: "beta", optional: [], conflicts: [] }), /"requires" must be a list/) && has(withDeps([]), /Dependencies must be an object/));
  check("an invalid dependency id and a repeated one are rejected", has(withDeps({ requires: ["Bad Id"], optional: [], conflicts: [] }), /only valid signal ids/) && has(withDeps({ requires: ["beta", "beta"], optional: [], conflicts: [] }), /must not repeat/));
  check("conflicting with a required or optional signal is rejected", has(withDeps({ requires: ["beta"], optional: [], conflicts: ["beta"] }), /both conflict with and depend on/) && has(withDeps({ requires: [], optional: ["beta"], conflicts: ["beta"] }), /both conflict with and depend on/));
  check("the same id as required and optional is rejected", has(withDeps({ requires: ["beta"], optional: ["beta"], conflicts: [] }), /required and optional/));
  check("duplicate id helper", validateNoDuplicateTrafficSignalId(["a", "b"], "b").length === 1 && validateNoDuplicateTrafficSignalId(["a"], "c").length === 0);

  // ---------- signal output ----------
  check("a valid output is accepted, and confidence may be a number or null", validateTrafficSignalOutput(OK).length === 0 && validateTrafficSignalOutput({ ...OK, confidence: null }).length === 0 && validateTrafficSignalOutput({ ...OK, confidence: 7 }).length === 0);
  check("an output with an unknown status or non-finite confidence is rejected", has(validateTrafficSignalOutput({ ...OK, status: "DONE" }), /Status is not supported/) && has(validateTrafficSignalOutput({ ...OK, confidence: Number.NaN }), /Confidence/) && has(validateTrafficSignalOutput({ ...OK, confidence: undefined }), /Confidence/));
  check("Invalid Metadata: nested, array, null, non-finite, and empty-key metadata in an output are rejected", [{ a: { b: 1 } }, [], null, { a: Number.NaN }, { "": 1 }, { a: undefined }, { a: () => 0 }].every((metadata) => has(validateTrafficSignalOutput({ ...OK, metadata }), /Metadata must be a flat object/)));
  check("an output with non-text warnings or errors is rejected", has(validateTrafficSignalOutput({ ...OK, warnings: [1] }), /"warnings" must be a list of text/) && has(validateTrafficSignalOutput({ ...OK, errors: "x" }), /"errors" must be a list of text/));
  check("a FAILED output requires an error, and a non-object output is rejected", has(validateTrafficSignalOutput({ ...OK, status: "FAILED", errors: [] }), /requires at least one error/) && validateTrafficSignalOutput({ ...OK, status: "FAILED", errors: ["x"] }).length === 0 && has(validateTrafficSignalOutput(null), /must be an object/) && has(validateTrafficSignalOutput("x"), /must be an object/));
  check("metadata helpers", isFlatTrafficMetadata({ a: 1, b: "x", c: true, d: null }) && !isFlatTrafficMetadata({ a: [] }) && isPlainTrafficData({ a: [1, { b: null }] }) && !isPlainTrafficData({ a: new Date() }) && !isPlainTrafficData({ a: undefined }) && !isPlainTrafficData((() => { const c: Record<string, unknown> = {}; c.self = c; return c; })()));

  // ---------- registry ----------
  const registry = createTrafficModuleRegistry();
  const entry = registry.register(good);
  check("register returns the entry, enabled by the module default", entry.id === "alpha" && entry.enabled === true && entry.module === good && registry.count() === 1);
  check("Duplicate Signal ID: a second registration is rejected and the first is kept", throwsFramework(() => registry.register(fake("alpha")), /already registered/) && registry.count() === 1 && registry.get("alpha")?.module === good);
  check("an invalid module is not registered", throwsFramework(() => registry.register({ ...good, id: "Bad", version: "x" } as never), /invalid/i) && registry.count() === 1 && registry.get("Bad") === null);
  check("a null module is not registered", throwsFramework(() => registry.register(null as never), /invalid/i) && registry.count() === 1);
  check("the error carries every issue found", (() => { try { registry.register({ ...good, id: "Bad", version: "x", category: "NO" } as never); } catch (e) { return e instanceof TrafficFrameworkError && e.issues.length === 3 && e.name === "TrafficFrameworkError"; } return false; })());
  const mixed = createTrafficModuleRegistry();
  mixed.register(fake("beta", { priority: 50, category: "POLICY" }));
  mixed.register(fake("alpha", { priority: 50, category: "AUDIENCE" }));
  mixed.register(fake("gamma", { priority: 90, category: "POLICY", enabled: false }));
  check("a module may start disabled", mixed.get("gamma")?.enabled === false);
  check("list orders by priority, then id", mixed.list().map((e) => e.id).join() === "gamma,alpha,beta");
  check("list filters by category and by enabled flag", mixed.list({ category: "POLICY" }).map((e) => e.id).join() === "gamma,beta" && mixed.list({ enabled: true }).map((e) => e.id).join() === "alpha,beta" && mixed.list({ category: "POLICY", enabled: true }).map((e) => e.id).join() === "beta");
  check("enable and disable switch the registry state and leave the module untouched", mixed.enable("gamma").enabled === true && mixed.get("gamma")?.module.enabled === false && mixed.disable("gamma").enabled === false && mixed.disable("gamma").enabled === false && mixed.enable("beta").enabled === true);
  check("enable and disable of an unknown signal are rejected", throwsFramework(() => mixed.enable("nope"), /not registered/) && throwsFramework(() => mixed.disable("nope"), /not registered/));
  check("remove returns the entry and forgets it; the id can be registered again", mixed.remove("alpha").id === "alpha" && mixed.get("alpha") === null && mixed.count() === 2 && mixed.register(fake("alpha")).id === "alpha" && throwsFramework(() => mixed.remove("nope"), /not registered/));
  check("get of an unknown signal is null, and validate reports without registering", mixed.get("zzz") === null && mixed.validate({}).length > 0 && mixed.validate(fake("fresh")).length === 0 && mixed.get("fresh") === null);

  // ---------- context ----------
  const empty = createTrafficSignalContext();
  check("a new context is empty: no candidate, no analysis, no explanation, and empty metadata", empty.candidate === null && empty.opportunityAnalysis === null && empty.opportunityExplanation === null && ["executionMetadata", "runtimeMetadata", "configuration", "extensions"].every((k) => Object.keys((empty as never)[k]).length === 0));
  check("a context has exactly the seven members", Object.keys(empty).join() === "candidate,opportunityAnalysis,opportunityExplanation,executionMetadata,runtimeMetadata,configuration,extensions" && Object.keys(fullContext()).join() === Object.keys(empty).join());
  check("creating a context from null or undefined is legal", createTrafficSignalContext(undefined).candidate === null && createTrafficSignalContext(null as never).candidate === null);
  const live = { candidate: { ...candidate }, opportunityAnalysis: JSON.parse(JSON.stringify(analysisFixture)), executionMetadata: { run: "r1" } };
  const made = createTrafficSignalContext(live as never);
  live.candidate.title = "changed";
  live.opportunityAnalysis.metadata.a = 99;
  live.opportunityAnalysis.signalResults[0].metadata.n = 99;
  live.executionMetadata.run = "changed";
  check("the context copies its inputs deeply, so later changes never reach it", made.candidate?.title === "Fictional item" && (made.opportunityAnalysis as never as typeof analysisFixture).metadata.a === 1 && (made.opportunityAnalysis as never as typeof analysisFixture).signalResults[0].metadata.n === 1 && made.executionMetadata.run === "r1");
  check("creating a context does not freeze or change the caller's objects", !Object.isFrozen(live.candidate) && !Object.isFrozen(live.opportunityAnalysis) && !Object.isFrozen(live.opportunityAnalysis.signalResults[0]) && !Object.isFrozen(live.executionMetadata));
  const ctx = fullContext();
  check("the context and everything inside it are frozen", Object.isFrozen(ctx) && Object.isFrozen(ctx.candidate) && Object.isFrozen(ctx.opportunityAnalysis) && Object.isFrozen((ctx.opportunityAnalysis as never as typeof analysisFixture).signalResults[0]) && Object.isFrozen(ctx.opportunityExplanation) && Object.isFrozen(ctx.extensions));
  let mutated = false;
  try { (ctx.executionMetadata as Record<string, unknown>).run = "x"; mutated = ctx.executionMetadata.run === "x"; } catch { mutated = false; }
  check("the context cannot be changed", !mutated && ctx.executionMetadata.run === "r1");
  check("the context carries exactly what was given, and nothing from outside", ctx.candidate?.id === "cand-1" && ctx.opportunityAnalysis?.analysisId === "opp-1" && ctx.opportunityExplanation?.analysisId === "opp-1" && ctx.runtimeMetadata.host === "h1" && ctx.configuration.mode === "m1" && ctx.extensions.ext === "e1" && Object.keys(createTrafficSignalContext({ candidate } as never).runtimeMetadata).length === 0);
  check("freezeDeepTraffic freezes nested objects and returns the same value", (() => { const v = { a: { b: [1, { c: 1 }] } }; return freezeDeepTraffic(v) === v && Object.isFrozen(v.a.b[1]); })());
  check("Invalid Metadata: a context with non-flat metadata is rejected, for every metadata member", ["executionMetadata", "runtimeMetadata", "configuration", "extensions"].every((k) => throwsFramework(() => createTrafficSignalContext({ [k]: { a: { b: 1 } } } as never), /Invalid metadata/) && throwsFramework(() => createTrafficSignalContext({ [k]: [] } as never), /Invalid metadata/) && throwsFramework(() => createTrafficSignalContext({ [k]: { a: Number.NaN } } as never), /Invalid metadata/)));
  check("a record that is not plain data is rejected", throwsFramework(() => createTrafficSignalContext({ candidate: { id: "c", when: new Date() } } as never), /plain data/) && throwsFramework(() => createTrafficSignalContext({ opportunityAnalysis: { analysisId: "a", f: () => 0 } } as never), /plain data/) && throwsFramework(() => createTrafficSignalContext({ candidate: "x" } as never), /plain data/));
  check("a record must name itself", throwsFramework(() => createTrafficSignalContext({ candidate: { title: "t" } } as never), /non-empty id/) && throwsFramework(() => createTrafficSignalContext({ opportunityAnalysis: { candidateId: "c" } } as never), /non-empty analysisId/) && throwsFramework(() => createTrafficSignalContext({ opportunityExplanation: { analysisId: "" } } as never), /non-empty analysisId/));
  check("the Opportunity records must refer to the same candidate and analysis", throwsFramework(() => fullContext({ opportunityAnalysis: { ...analysisFixture, candidateId: "other" } }), /different candidate/) && throwsFramework(() => fullContext({ opportunityExplanation: { ...explanationFixture, candidateId: "other" } }), /different candidate/) && throwsFramework(() => fullContext({ opportunityExplanation: { ...explanationFixture, analysisId: "opp-2" } }), /different analysis/));
  check("an unknown member is rejected and points to extensions", throwsFramework(() => createTrafficSignalContext({ facts: {} } as never), /extensions/) && throwsFramework(() => createTrafficSignalContext({ runtime: {} } as never), /unexpected member "runtime"/));
  check("a context that is not an object is rejected by the validator", has(validateTrafficSignalContext(5), /an object is required/) && has(validateTrafficSignalContext([]), /an object is required/) && has(validateTrafficSignalContext(null), /an object is required/));
  check("a complete check requires every member", validateTrafficSignalContext(ctx, true).length === 0 && has(validateTrafficSignalContext({ candidate: null }, true), /member "opportunityAnalysis" is missing/) && validateTrafficSignalContext({ candidate: null }).length === 0);

  // ---------- dependencies ----------
  check("no dependencies is valid", validateTrafficDependencies(entriesOf(fake("a"), fake("b"))).length === 0);
  check("a present required dependency is valid", validateTrafficDependencies(entriesOf(fake("a"), fake("b", { requires: ["a"] }))).length === 0);
  check("a missing required dependency is reported", has(validateTrafficDependencies(entriesOf(fake("b", { requires: ["a"] }))), /requires "a", which is not registered/));
  check("a disabled required dependency is reported", has(validateTrafficDependencies(entriesOf(fake("a", { enabled: false }), fake("b", { requires: ["a"] }))), /requires "a", which is disabled/));
  check("a missing or disabled optional dependency is fine", validateTrafficDependencies(entriesOf(fake("b", { optional: ["a"] }))).length === 0 && validateTrafficDependencies(entriesOf(fake("a", { enabled: false }), fake("b", { optional: ["a"] }))).length === 0);
  const conflict = validateTrafficDependencies(entriesOf(fake("a", { conflicts: ["b"] }), fake("b", { conflicts: ["a"] })));
  check("a conflict between enabled signals is reported once", conflict.length === 1 && /conflicts with/.test(conflict[0].message));
  check("a conflict with a disabled or unregistered signal is fine", validateTrafficDependencies(entriesOf(fake("a", { conflicts: ["b"] }), fake("b", { enabled: false }))).length === 0 && validateTrafficDependencies(entriesOf(fake("a", { conflicts: ["zz"] }))).length === 0);
  check("Circular Dependency: a two-signal cycle is rejected", has(validateTrafficDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] }))), /Circular dependency/));
  const three = validateTrafficDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["c"] }), fake("c", { requires: ["a"] })));
  check("Circular Dependency: a three-signal cycle is rejected and names its path", three.length === 1 && /a -> b -> c -> a|b -> c -> a -> b|c -> a -> b -> c/.test(three[0].message));
  check("Circular Dependency: a cycle through optional dependencies is rejected", has(validateTrafficDependencies(entriesOf(fake("a", { optional: ["b"] }), fake("b", { requires: ["a"] }))), /Circular dependency/));
  check("a cycle with a disabled member is not a cycle", validateTrafficDependencies(entriesOf(fake("a", { optional: ["b"] }), fake("b", { optional: ["a"], enabled: false }))).length === 0);
  const sample = createTrafficModuleRegistry();
  sample.register(fake("b", { requires: ["a"] }));
  validateTrafficDependencies(sample.list());
  check("Validate only: validation never registers, enables, or repairs anything", sample.count() === 1 && sample.get("a") === null && sample.get("b")?.enabled === true);

  // ---------- execution order ----------
  const order = (...modules: TrafficSignalModule[]) => resolveTrafficSignalOrder(entriesOf(...modules));
  check("dependencies run before their dependents regardless of priority", order(fake("a", { priority: 1 }), fake("b", { priority: 900, requires: ["a"] })).order.join() === "a,b");
  check("independent signals run by priority, then id", order(fake("c", { priority: 10 }), fake("b", { priority: 10 }), fake("a", { priority: 5 }), fake("z", { priority: 99 })).order.join() === "z,b,c,a");
  check("a present optional dependency runs first", order(fake("a", { priority: 1 }), fake("b", { priority: 900, optional: ["a"] })).order.join() === "a,b");
  check("disabled signals are not ordered", order(fake("a"), fake("b", { enabled: false })).order.join() === "a");
  const bad = order(fake("b", { requires: ["a"] }));
  check("invalid dependencies give no order and a list of issues", bad.order.length === 0 && bad.issues.length === 1);
  check("an empty registry has an empty order", resolveTrafficSignalOrder([]).order.length === 0 && resolveTrafficSignalOrder([]).issues.length === 0);
  check("the order is stable across repeated calls", order(fake("a"), fake("b", { requires: ["a"] }), fake("c")).order.join() === order(fake("c"), fake("b", { requires: ["a"] }), fake("a")).order.join());

  // ---------- pipeline ----------
  const p = createTrafficSignalPipeline({ now: zero });
  check("the pipeline registers, enables, disables, and removes", p.register(fake("a")).id === "a" && p.disable("a").enabled === false && p.enable("a").enabled === true && p.remove("a").id === "a" && p.registry.count() === 0);
  check("the pipeline exposes its registry and a registry can be supplied", p.registry.count() === 0 && (() => { const r = createTrafficModuleRegistry(); return createTrafficSignalPipeline({ registry: r }).registry === r; })());
  check("the pipeline validates dependencies and resolves an order", pipelineOf(fake("b", { requires: ["a"] })).validateDependencies().length === 1 && pipelineOf(fake("a"), fake("b", { requires: ["a"] })).resolveExecutionOrder().order.join() === "a,b");

  calls = [];
  const runPipe = pipelineOf(fake("a", { priority: 1 }), fake("b", { priority: 900, requires: ["a"] }), fake("c", { priority: 50 }), fake("off", { enabled: false }));
  const report = await runPipe.run(ctx);
  check("run executes the enabled signals in order and collects a result for each", report.order.join() === "c,a,b" && report.results.map((r) => r.signalId).join() === "c,a,b" && calls.join() === "c,a,b");
  check("disabled signals are not run and have no result", !calls.includes("off") && !report.results.some((r) => r.signalId === "off"));
  const r0 = report.results[0];
  check("a result carries status, confidence, metadata, warnings, errors, and executionTime", Object.keys(r0).sort().join() === "confidence,errors,executionTime,metadata,signalId,status,warnings" && r0.status === "COMPLETED" && r0.confidence === 0.5 && r0.metadata.k === 1 && r0.executionTime === 0);
  check("No score, no recommendation: a result carries neither", report.results.every((r) => !("score" in r) && !("recommendation" in r) && !("ranking" in r)));
  check("results are frozen and are copies of what the signal returned", report.results.every((r) => Object.isFrozen(r) && Object.isFrozen(r.metadata) && Object.isFrozen(r.warnings)));
  const shared = { k: 1 };
  const copyRun = await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: shared }) })).run(ctx);
  shared.k = 2;
  check("changing what a signal returned afterwards does not change its result", copyRun.results[0].metadata.k === 1);
  check("a run is repeatable", JSON.stringify((await runPipe.run(ctx)).results) === JSON.stringify(report.results));
  let active = 0;
  let overlap = false;
  const slow = (id: string, extra: Partial<FakeOpts> = {}) => fake(id, { ...extra, output: async () => { active += 1; overlap = overlap || active > 1; await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1; return { ...OK }; } });
  await pipelineOf(slow("a"), slow("b"), slow("c")).run(ctx);
  check("No parallel execution: signals run strictly one at a time", overlap === false);
  const gate = pipelineOf(slow("a"), slow("b"));
  const first = gate.run(ctx);
  check("an overlapping run is refused", await rejectsFramework(() => gate.run(ctx), /already in progress/));
  await first;
  check("a run can start again after the previous finished", (await gate.run(ctx)).results.length === 2);
  const seenContexts: TrafficSignalContext[] = [];
  await pipelineOf(fake("a", { output: (c) => (seenContexts.push(c), { ...OK }) }), fake("b", { priority: 1, output: (c) => (seenContexts.push(c), { ...OK }) })).run(ctx);
  check("every signal receives the same shared immutable context", seenContexts.length === 2 && seenContexts[0] === ctx && seenContexts[1] === ctx && Object.isFrozen(seenContexts[0]));
  let upstreamSeen: Record<string, TrafficSignalResult> | null = null;
  let stranger: Record<string, TrafficSignalResult> | null = null;
  await pipelineOf(
    fake("a", { priority: 900 }),
    fake("c", { priority: 800 }),
    fake("b", { priority: 1, requires: ["a"], output: (_c, u) => ((upstreamSeen = u), { ...OK }) }),
    fake("d", { priority: 1, output: (_c, u) => ((stranger = u), { ...OK }) }),
  ).run(ctx);
  check("a signal sees only the results it declared, and a required result is readable", upstreamSeen !== null && Object.keys(upstreamSeen).join() === "a" && (upstreamSeen as Record<string, TrafficSignalResult>).a.status === "COMPLETED" && Object.isFrozen(upstreamSeen) && stranger !== null && Object.keys(stranger).length === 0);
  const unsupported = await pipelineOf(fake("a", { supports: false })).run(ctx);
  check("an unsupported analysis is SKIPPED and analyze is not called", unsupported.results[0].status === "SKIPPED" && /does not support this analysis/.test(unsupported.results[0].warnings[0]) && unsupported.results[0].confidence === null);
  calls = [];
  const invalidInput = await pipelineOf(fake("a", { validate: [{ field: "candidate", message: "missing" }] })).run(ctx);
  check("a signal's validate() issues make it FAILED without running analyze", invalidInput.results[0].status === "FAILED" && invalidInput.results[0].errors[0] === "candidate: missing" && calls.length === 0);
  const thrown = await pipelineOf(fake("a", { output: () => { throw new Error("boom"); } })).run(ctx);
  check("a throwing signal is FAILED with its message", thrown.results[0].status === "FAILED" && thrown.results[0].errors[0] === "boom");
  const rejected = await pipelineOf(fake("a", { output: () => Promise.reject(new Error("async boom")) })).run(ctx);
  check("an async rejection is FAILED with its message", rejected.results[0].errors[0] === "async boom");
  const malformed = await pipelineOf(fake("a", { output: () => ({ status: "WEIRD" }) as never })).run(ctx);
  check("Invalid Metadata: a malformed output is FAILED", malformed.results[0].status === "FAILED" && /Invalid signal output/.test(malformed.results[0].errors[0]));
  const nested = await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { a: { b: 1 } } as never }) })).run(ctx);
  check("Invalid Metadata: an output with nested metadata is FAILED", nested.results[0].status === "FAILED" && /Metadata must be a flat object/.test(nested.results[0].errors[0]));
  const selfFailed = await pipelineOf(fake("a", { output: () => ({ status: "FAILED", confidence: null, metadata: {}, warnings: ["w"], errors: ["own failure"] }) })).run(ctx);
  check("a signal may report its own failure", selfFailed.results[0].status === "FAILED" && selfFailed.results[0].errors[0] === "own failure" && selfFailed.results[0].warnings[0] === "w");
  calls = [];
  const blockedRun = await pipelineOf(fake("a", { output: () => { throw new Error("x"); } }), fake("b", { requires: ["a"] })).run(ctx);
  check("a signal whose required signal failed is SKIPPED, not run", blockedRun.results[1].status === "SKIPPED" && /Required signal "a" did not complete/.test(blockedRun.results[1].warnings[0]) && !calls.includes("b"));
  const blockedSkip = await pipelineOf(fake("a", { supports: false }), fake("b", { requires: ["a"] })).run(ctx);
  check("a signal whose required signal was skipped is SKIPPED, not run", blockedSkip.results[1].status === "SKIPPED");
  const optionalFailed = await pipelineOf(fake("a", { output: () => { throw new Error("x"); } }), fake("b", { optional: ["a"], output: (_c, u) => ({ ...OK, metadata: { upstream: u.a.status } }) })).run(ctx);
  check("a failed optional dependency does not block, and its result is readable", optionalFailed.results[1].status === "COMPLETED" && optionalFailed.results[1].metadata.upstream === "FAILED");
  calls = [];
  const independent = await pipelineOf(fake("a", { priority: 100, output: () => { throw new Error("x"); } }), fake("b", { priority: 50 })).run(ctx);
  check("one failure does not stop later signals", independent.results[0].status === "FAILED" && independent.results[1].status === "COMPLETED" && calls.join() === "a,b");
  calls = [];
  const refused = pipelineOf(fake("a"), fake("b", { requires: ["missing"] }));
  check("a run with invalid dependencies is refused and runs nothing", await rejectsFramework(() => refused.run(ctx), /dependencies are invalid/) && calls.length === 0);
  check("Do not auto-resolve: the refusal does not register or enable anything", refused.registry.count() === 2 && refused.registry.get("missing") === null);
  refused.remove("b");
  check("after removing the offender the run succeeds", (await refused.run(ctx)).results.length === 1);
  check("a circular dependency refuses the run", await rejectsFramework(() => pipelineOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] })).run(ctx), /Circular dependency/));
  const toggled = pipelineOf(fake("a"), fake("b", { requires: ["a"] }));
  toggled.disable("a");
  check("disabling a required signal is reported, not repaired", await rejectsFramework(() => toggled.run(ctx), /disabled/) && toggled.registry.get("a")?.enabled === false);
  const emptyRun = await createTrafficSignalPipeline().run(ctx);
  check("an empty pipeline runs to an empty report", emptyRun.order.length === 0 && emptyRun.results.length === 0);
  check("a run with an invalid context is refused before anything executes", await rejectsFramework(() => pipelineOf(fake("a")).run({ candidate: null } as never), /Context is invalid/) && await rejectsFramework(() => pipelineOf(fake("a")).run(null as never), /Context is invalid/) && await rejectsFramework(() => pipelineOf(fake("a")).run({ ...ctx, executionMetadata: { a: { b: 1 } } } as never), /Invalid metadata/));
  check("a pipeline stays usable after a refused run", await (async () => { const pipe = pipelineOf(fake("a")); await rejectsFramework(() => pipe.run(null as never)); return (await pipe.run(ctx)).results.length === 1; })());
  check("the default clock gives a finite, non-negative executionTime", await (async () => { const r = await createTrafficSignalPipeline().register(fake("a")) && (await (async () => { const pipe = createTrafficSignalPipeline(); pipe.register(fake("a")); return pipe.run(ctx); })()); return r.results[0].executionTime >= 0 && Number.isFinite(r.results[0].executionTime); })());
  const tick = (() => { let t = 0; return () => (t += 5); })();
  const timed = createTrafficSignalPipeline({ now: tick });
  timed.register(fake("a"));
  check("executionTime comes from the injected clock", (await timed.run(ctx)).results[0].executionTime === 5);
  check("the executor and skippedTrafficResult are usable alone", (await executeTrafficSignal(fake("a"), ctx, Object.freeze({}), zero)).status === "COMPLETED" && skippedTrafficResult("a", "w").status === "SKIPPED" && Object.isFrozen(skippedTrafficResult("a", "w")));

  // ---------- independent execution and no mutation ----------
  const contextBefore = JSON.stringify(ctx);
  const sourceBefore = JSON.stringify([candidate, analysisFixture, explanationFixture]);
  const mutating = fake("a", { output: (c) => { try { (c.candidate as Record<string, unknown>).title = "hacked"; (c.opportunityAnalysis as Record<string, unknown>).status = "FAILED"; } catch { /* frozen */ } return { ...OK }; } });
  await pipelineOf(mutating, fake("b", { priority: 1 })).run(ctx);
  check("No mutation: a signal cannot change the context, and the source objects are untouched", JSON.stringify(ctx) === contextBefore && JSON.stringify([candidate, analysisFixture, explanationFixture]) === sourceBefore);
  const aloneA = (await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { v: "a" } }) })).run(ctx)).results[0];
  const togetherA = (await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { v: "a" } }) }), fake("b", { priority: 1, output: () => { throw new Error("b fails"); } }), fake("c", { priority: 2 })).run(ctx)).results.find((r) => r.signalId === "a")!;
  check("Independent execution: a signal's result is the same alone or beside others, even failing ones", JSON.stringify(aloneA) === JSON.stringify(togetherA));
  const byRegistration = (...ms: TrafficSignalModule[]) => pipelineOf(...ms).run(ctx).then((r) => JSON.stringify(r));
  check("Independent execution: registration order does not change the run", (await byRegistration(fake("a"), fake("b", { requires: ["a"] }), fake("c", { priority: 3 }))) === (await byRegistration(fake("c", { priority: 3 }), fake("b", { requires: ["a"] }), fake("a"))));
  const twoPipes = [pipelineOf(fake("a")), pipelineOf(fake("a"), fake("b"))];
  await Promise.all(twoPipes.map((pipe) => pipe.run(ctx)));
  check("pipelines are independent: another pipeline's registry and runs change nothing", twoPipes[0].registry.count() === 1 && twoPipes[1].registry.count() === 2);

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/traffic");
  const frameworkFiles = readdirSync(dir).filter((f) => /^traffic-signal-[a-z]+\.ts$/.test(f));
  check("seven framework modules exist: contract, context, registry, validator, resolver, executor, pipeline", frameworkFiles.sort().join() === "traffic-signal-contract.ts,traffic-signal-context.ts,traffic-signal-executor.ts,traffic-signal-pipeline.ts,traffic-signal-registry.ts,traffic-signal-resolver.ts,traffic-signal-validator.ts".split(",").sort().join());
  const lines = frameworkFiles.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, search volume, or campaign logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|campaign|adwords|\bbid\b|budget/i.test(l)));
  check("no policy analysis or audience analysis", !code.some((l) => /evaluat|analy[sz]e(Policy|Audience)|policyCheck|audienceSize/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const outside = imports.filter((i) => !/^\.\/traffic-[a-z-]+$/.test(i.from));
  check("imports were found", imports.length >= 20);
  check("the only imports from outside the traffic folder are three type-only shapes", outside.length === 3 && outside.every((i) => i.typeOnly) && outside.map((i) => i.from).sort().join() === "../discovery/discovery-types,../opportunity/opportunity-explanation-result,../opportunity/opportunity-resolver-analysis");
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|db/i.test(i.from)));
  check("no signal ships: the framework registers nothing of its own", !code.some((l) => /\bregister\(\s*\{|createTrafficModuleRegistry\(\)\.register|\.register\(\s*[a-z]+Signal/.test(l)) && code.filter((l) => /\.register\(/.test(l)).length === 1);
  check("no signal id is defined in the framework", !code.some((l) => /\bid:\s*["'][a-z]/.test(l)));
  const architecture = ["traffic-types.ts", "traffic-analysis.ts", "traffic-registry.ts", "traffic-validator.ts", "traffic-engine.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape: still types and contracts only, with no import of the framework", architecture.every((src) => !/traffic-signal-/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const others = ["src/lib/opportunity", "src/lib/discovery"].flatMap((d) => readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f)));
  check("no Opportunity or Discovery module imports the traffic framework", !others.some((f) => /traffic/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic signal framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
