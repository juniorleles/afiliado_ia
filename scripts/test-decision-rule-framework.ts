import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DECISION_RULE_CATEGORIES, DECISION_RULE_RESULT_STATUSES } from "../src/lib/decision/decision-rule-contract.ts";
import type { DecisionRuleModule, DecisionRuleOutput, DecisionRuleRunResult } from "../src/lib/decision/decision-rule-contract.ts";
import { createDecisionRuleContext, freezeDeepDecisionRule } from "../src/lib/decision/decision-rule-context.ts";
import type { DecisionRuleContext } from "../src/lib/decision/decision-rule-context.ts";
import { DecisionFrameworkError, createDecisionRuleModuleRegistry } from "../src/lib/decision/decision-rule-registry.ts";
import { resolveDecisionRuleOrder } from "../src/lib/decision/decision-rule-resolver.ts";
import { executeDecisionRule, skippedDecisionRuleResult } from "../src/lib/decision/decision-rule-executor.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import {
  DECISION_RULE_PRIORITY_MAX,
  isDecisionRuleCategory,
  isDecisionRuleVersion,
  isFlatDecisionMetadata,
  isPlainDecisionData,
  validateDecisionRuleContext,
  validateDecisionRuleDependencies,
  validateDecisionRuleModule,
  validateDecisionRuleOutput,
  validateNoDuplicateDecisionRuleId,
} from "../src/lib/decision/decision-rule-validator.ts";

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
    return error instanceof DecisionFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};
const rejectsFramework = async (fn: () => Promise<unknown>, text?: RegExp): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof DecisionFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const opportunityAnalysis = { id: "opp-1", candidateId: "cand-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const trafficAnalysis = { id: "traf-1", candidateId: "cand-1", opportunityAnalysisId: "opp-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const pageAnalysis = { id: "page-1" };

interface FakeOpts {
  priority?: number;
  requires?: string[];
  optional?: string[];
  conflicts?: string[];
  enabled?: boolean;
  supports?: boolean;
  category?: DecisionRuleModule["category"];
  output?: (context: DecisionRuleContext, upstream: Record<string, DecisionRuleRunResult>) => DecisionRuleOutput | Promise<DecisionRuleOutput>;
  validate?: Array<{ field: string; message: string }>;
}
let calls: string[] = [];
const OK: DecisionRuleOutput = { status: "PASS", confidence: 0.5, metadata: { k: 1, note: "fixture" }, warnings: [], errors: [] };
function fake(id: string, over: FakeOpts = {}): DecisionRuleModule {
  return {
    id,
    name: `Rule ${id}`,
    version: "1.0.0",
    category: over.category ?? "FUTURE",
    enabled: over.enabled ?? true,
    priority: over.priority ?? 100,
    dependencies: { requires: over.requires ?? [], optional: over.optional ?? [], conflicts: over.conflicts ?? [] },
    supportsDecision: () => over.supports ?? true,
    validate: () => over.validate ?? [],
    evaluate: (context, upstream) => {
      calls.push(id);
      return over.output ? over.output(context, upstream as Record<string, DecisionRuleRunResult>) : { ...OK, metadata: { ...OK.metadata } };
    },
  };
}
const entriesOf = (...modules: DecisionRuleModule[]) => {
  const registry = createDecisionRuleModuleRegistry();
  for (const m of modules) registry.register(m);
  return registry.list();
};
const pipelineOf = (...modules: DecisionRuleModule[]) => {
  const pipeline = createDecisionRulePipeline({ now: zero });
  for (const m of modules) pipeline.register(m);
  return pipeline;
};
const fullContext = (over: Record<string, unknown> = {}) =>
  createDecisionRuleContext({
    candidate,
    opportunityAnalysis,
    trafficAnalysis,
    pageAnalysis,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    extensions: { ext: "e1" },
    ...over,
  } as never);

async function main() {
  check("five rule categories, in the requested order", DECISION_RULE_CATEGORIES.join() === "READINESS,QUALITY,PRIORITY,ACTION,FUTURE");
  check("four rule result statuses, in the requested order", DECISION_RULE_RESULT_STATUSES.join() === "PASS,FAIL,WARNING,SKIPPED");
  check("category and version helpers", isDecisionRuleCategory("READINESS") && !isDecisionRuleCategory("readiness") && !isDecisionRuleCategory("COMPETITION") && isDecisionRuleVersion("1.2.3") && !isDecisionRuleVersion("1.2") && !isDecisionRuleVersion(1));

  const good = fake("alpha");
  check("a complete fixture satisfies the contract", validateDecisionRuleModule(good).length === 0);
  for (const [label, value] of [["null", null], ["undefined", undefined], ["a string", "x"]] as const) {
    check(`Missing Contract: ${label} is rejected`, has(validateDecisionRuleModule(value), /Rule contract is missing/));
  }
  const emptyIssues = validateDecisionRuleModule({});
  check("Missing Contract: an empty object lists every member and method", ["id", "name", "version", "category", "enabled", "priority", "dependencies", "supportsDecision", "evaluate", "validate"].every((m) => has(emptyIssues, new RegExp(`"${m}" is missing`))));
  check("Missing Contract: a missing method is rejected", has(validateDecisionRuleModule({ ...good, evaluate: undefined }), /method "evaluate" is missing/) && has(validateDecisionRuleModule({ ...good, supportsDecision: undefined }), /"supportsDecision" is missing/));
  check("Missing Contract: a non-function method is rejected", has(validateDecisionRuleModule({ ...good, validate: "x" }), /method "validate" is missing/));
  check("Missing Contract: the Traffic method name does not satisfy the contract", has(validateDecisionRuleModule({ ...good, supportsDecision: undefined, supportsAnalysis: () => true }), /"supportsDecision" is missing/));
  check("Missing Contract: missing dependencies are rejected", has(validateDecisionRuleModule({ ...good, dependencies: undefined }), /"dependencies" is missing/));
  check("Invalid Category: an unknown, a lowercase, and a Traffic-only category are rejected", has(validateDecisionRuleModule({ ...good, category: "NOPE" }), /Category is not supported/) && has(validateDecisionRuleModule({ ...good, category: "readiness" }), /Category is not supported/) && has(validateDecisionRuleModule({ ...good, category: "POLICY" }), /Category is not supported/) && has(validateDecisionRuleModule({ ...good, category: 5 }), /Category is not supported/));
  check("every decision rule category is accepted", DECISION_RULE_CATEGORIES.every((category) => validateDecisionRuleModule({ ...good, category }).length === 0));
  check("Invalid Version: a number, a short version, a prefixed version, and an empty one are rejected", ["1", "1.0", "v1.0.0", "", "1.0.0-beta", "01.0.0"].every((version) => has(validateDecisionRuleModule({ ...good, version }), /semantic version/)) && has(validateDecisionRuleModule({ ...good, version: 1 }), /semantic version/));
  check("valid versions are accepted", ["0.0.1", "1.0.0", "10.20.30"].every((version) => validateDecisionRuleModule({ ...good, version }).length === 0));
  check("an invalid id is rejected", ["", "Alpha", "1alpha", "al pha", "al_pha"].every((id) => has(validateDecisionRuleModule({ ...good, id }), /Id must be/)));
  check("an empty name is rejected", has(validateDecisionRuleModule({ ...good, name: "  " }), /Name must not be empty/) && has(validateDecisionRuleModule({ ...good, name: 5 }), /Name must not be empty/));
  check("a non-boolean enabled is rejected", has(validateDecisionRuleModule({ ...good, enabled: "yes" }), /enabled must be/));
  check("an out-of-range or fractional priority is rejected", [-1, 1001, 1.5, Number.NaN, "5"].every((priority) => has(validateDecisionRuleModule({ ...good, priority }), /Priority must be an integer/)) && [0, DECISION_RULE_PRIORITY_MAX].every((priority) => validateDecisionRuleModule({ ...good, priority }).length === 0));
  const withDeps = (dependencies: unknown) => validateDecisionRuleModule({ ...good, dependencies });
  check("a self dependency or self conflict is rejected", has(withDeps({ requires: ["alpha"], optional: [], conflicts: [] }), /cannot depend on or conflict with itself/) && has(withDeps({ requires: [], optional: [], conflicts: ["alpha"] }), /itself/));
  check("a dependency list that is not a list is rejected", has(withDeps({ requires: "beta", optional: [], conflicts: [] }), /"requires" must be a list/) && has(withDeps([]), /Dependencies must be an object/));
  check("an invalid dependency id and a repeated one are rejected", has(withDeps({ requires: ["Bad Id"], optional: [], conflicts: [] }), /only valid rule ids/) && has(withDeps({ requires: ["beta", "beta"], optional: [], conflicts: [] }), /must not repeat/));
  check("conflicting with a required or optional rule is rejected", has(withDeps({ requires: ["beta"], optional: [], conflicts: ["beta"] }), /both conflict with and depend on/) && has(withDeps({ requires: [], optional: ["beta"], conflicts: ["beta"] }), /both conflict with and depend on/));
  check("the same id as required and optional is rejected", has(withDeps({ requires: ["beta"], optional: ["beta"], conflicts: [] }), /required and optional/));
  check("duplicate id helper", validateNoDuplicateDecisionRuleId(["a", "b"], "b").length === 1 && validateNoDuplicateDecisionRuleId(["a"], "c").length === 0);

  check("a valid output is accepted, and confidence may be a number or null", validateDecisionRuleOutput(OK).length === 0 && validateDecisionRuleOutput({ ...OK, confidence: null }).length === 0 && validateDecisionRuleOutput({ ...OK, confidence: 7 }).length === 0);
  check("an output with an unknown status or non-finite confidence is rejected", has(validateDecisionRuleOutput({ ...OK, status: "DONE" }), /Status is not supported/) && has(validateDecisionRuleOutput({ ...OK, confidence: Number.NaN }), /Confidence/) && has(validateDecisionRuleOutput({ ...OK, confidence: undefined }), /Confidence/));
  check("Invalid Metadata: nested, array, null, non-finite, and empty-key metadata in an output are rejected", [{ a: { b: 1 } }, [], null, { a: Number.NaN }, { "": 1 }, { a: undefined }, { a: () => 0 }].every((metadata) => has(validateDecisionRuleOutput({ ...OK, metadata }), /Invalid metadata/)));
  check("an output with non-text warnings or errors is rejected", has(validateDecisionRuleOutput({ ...OK, warnings: [1] }), /"warnings" must be a list of text/) && has(validateDecisionRuleOutput({ ...OK, errors: "x" }), /"errors" must be a list of text/));
  check("a FAIL output requires an error, and a WARNING output requires a warning", has(validateDecisionRuleOutput({ ...OK, status: "FAIL", errors: [] }), /requires at least one error/) && validateDecisionRuleOutput({ ...OK, status: "FAIL", errors: ["x"] }).length === 0 && has(validateDecisionRuleOutput({ ...OK, status: "WARNING", warnings: [] }), /requires at least one warning/) && validateDecisionRuleOutput({ ...OK, status: "WARNING", warnings: ["w"] }).length === 0);
  check("a non-object output is rejected", has(validateDecisionRuleOutput(null), /must be an object/) && has(validateDecisionRuleOutput("x"), /must be an object/));
  check("metadata helpers", isFlatDecisionMetadata({ a: 1, b: "x", c: true, d: null }) && !isFlatDecisionMetadata({ a: [] }) && isPlainDecisionData({ a: [1, { b: null }] }) && !isPlainDecisionData({ a: new Date() }) && !isPlainDecisionData({ a: undefined }) && !isPlainDecisionData((() => { const c: Record<string, unknown> = {}; c.self = c; return c; })()));

  const registry = createDecisionRuleModuleRegistry();
  const entry = registry.register(good);
  check("register returns the entry, enabled by the module default", entry.id === "alpha" && entry.enabled === true && entry.module === good && registry.count() === 1);
  check("Duplicate Rule IDs: a second registration is rejected and the first is kept", throwsFramework(() => registry.register(fake("alpha")), /already registered/) && registry.count() === 1 && registry.get("alpha")?.module === good);
  check("an invalid module is not registered", throwsFramework(() => registry.register({ ...good, id: "Bad", version: "x" } as never), /invalid/i) && registry.count() === 1 && registry.get("Bad") === null);
  check("a null module is not registered", throwsFramework(() => registry.register(null as never), /invalid/i) && registry.count() === 1);
  check("the error carries every issue found", (() => { try { registry.register({ ...good, id: "Bad", version: "x", category: "NO" } as never); } catch (e) { return e instanceof DecisionFrameworkError && e.issues.length === 3 && e.name === "DecisionFrameworkError"; } return false; })());
  const mixed = createDecisionRuleModuleRegistry();
  mixed.register(fake("beta", { priority: 50, category: "QUALITY" }));
  mixed.register(fake("alpha", { priority: 50, category: "READINESS" }));
  mixed.register(fake("gamma", { priority: 90, category: "QUALITY", enabled: false }));
  check("a module may start disabled", mixed.get("gamma")?.enabled === false);
  check("list orders by priority, then id", mixed.list().map((e) => e.id).join() === "gamma,alpha,beta");
  check("list filters by category and by enabled flag", mixed.list({ category: "QUALITY" }).map((e) => e.id).join() === "gamma,beta" && mixed.list({ enabled: true }).map((e) => e.id).join() === "alpha,beta" && mixed.list({ category: "QUALITY", enabled: true }).map((e) => e.id).join() === "beta");
  check("enable and disable switch the registry state and leave the module untouched", mixed.enable("gamma").enabled === true && mixed.get("gamma")?.module.enabled === false && mixed.disable("gamma").enabled === false && mixed.disable("gamma").enabled === false && mixed.enable("beta").enabled === true);
  check("enable and disable of an unknown rule are rejected", throwsFramework(() => mixed.enable("nope"), /not registered/) && throwsFramework(() => mixed.disable("nope"), /not registered/));
  check("remove returns the entry and forgets it; the id can be registered again", mixed.remove("alpha").id === "alpha" && mixed.get("alpha") === null && mixed.count() === 2 && mixed.register(fake("alpha")).id === "alpha" && throwsFramework(() => mixed.remove("nope"), /not registered/));
  check("get of an unknown rule is null, and validate reports without registering", mixed.get("zzz") === null && mixed.validate({}).length > 0 && mixed.validate(fake("fresh")).length === 0 && mixed.get("fresh") === null);

  const empty = createDecisionRuleContext();
  check("a new context is empty: no candidate, no analyses, and empty metadata", empty.candidate === null && empty.opportunityAnalysis === null && empty.trafficAnalysis === null && empty.pageAnalysis === null && ["executionMetadata", "runtimeMetadata", "configuration", "extensions"].every((k) => Object.keys((empty as never)[k]).length === 0));
  check("a context has exactly the eight members", Object.keys(empty).join() === "candidate,opportunityAnalysis,trafficAnalysis,pageAnalysis,executionMetadata,runtimeMetadata,configuration,extensions" && Object.keys(fullContext()).join() === Object.keys(empty).join());
  check("creating a context from null or undefined is legal", createDecisionRuleContext(undefined).candidate === null && createDecisionRuleContext(null as never).candidate === null);
  const live = { candidate: { ...candidate }, opportunityAnalysis: { ...opportunityAnalysis }, trafficAnalysis: { ...trafficAnalysis }, executionMetadata: { run: "r1" } };
  const made = createDecisionRuleContext(live as never);
  live.candidate.title = "changed";
  live.opportunityAnalysis.status = "FAILED";
  live.trafficAnalysis.status = "FAILED";
  live.executionMetadata.run = "changed";
  check("the context copies its inputs deeply, so later changes never reach it", made.candidate?.title === "Fictional item" && made.opportunityAnalysis?.status === "COMPLETED" && made.trafficAnalysis?.status === "COMPLETED" && made.executionMetadata.run === "r1");
  check("creating a context does not freeze or change the caller's objects", !Object.isFrozen(live.candidate) && !Object.isFrozen(live.opportunityAnalysis) && !Object.isFrozen(live.trafficAnalysis) && !Object.isFrozen(live.executionMetadata));
  const ctx = fullContext();
  check("the context and everything inside it are frozen", Object.isFrozen(ctx) && Object.isFrozen(ctx.candidate) && Object.isFrozen(ctx.opportunityAnalysis) && Object.isFrozen(ctx.trafficAnalysis) && Object.isFrozen(ctx.pageAnalysis) && Object.isFrozen(ctx.extensions));
  let mutated = false;
  try { (ctx.executionMetadata as Record<string, unknown>).run = "x"; mutated = ctx.executionMetadata.run === "x"; } catch { mutated = false; }
  check("the context cannot be changed", !mutated && ctx.executionMetadata.run === "r1");
  check("the context carries exactly what was given, and nothing from outside", ctx.candidate?.id === "cand-1" && ctx.opportunityAnalysis?.id === "opp-1" && ctx.trafficAnalysis?.id === "traf-1" && ctx.pageAnalysis?.id === "page-1" && ctx.runtimeMetadata.host === "h1" && ctx.configuration.mode === "m1" && ctx.extensions.ext === "e1" && Object.keys(createDecisionRuleContext({ candidate } as never).runtimeMetadata).length === 0);
  check("freezeDeepDecisionRule freezes nested objects and returns the same value", (() => { const v = { a: { b: [1, { c: 1 }] } }; return freezeDeepDecisionRule(v) === v && Object.isFrozen(v.a.b[1]); })());
  check("Invalid Metadata: a context with non-flat metadata is rejected, for every metadata member", ["executionMetadata", "runtimeMetadata", "configuration", "extensions"].every((k) => throwsFramework(() => createDecisionRuleContext({ [k]: { a: { b: 1 } } } as never), /Invalid metadata/) && throwsFramework(() => createDecisionRuleContext({ [k]: [] } as never), /Invalid metadata/) && throwsFramework(() => createDecisionRuleContext({ [k]: { a: Number.NaN } } as never), /Invalid metadata/)));
  check("a record that is not plain data is rejected", throwsFramework(() => createDecisionRuleContext({ candidate: { id: "c", when: new Date() } } as never), /plain data/) && throwsFramework(() => createDecisionRuleContext({ opportunityAnalysis: { id: "a", f: () => 0 } } as never), /plain data/) && throwsFramework(() => createDecisionRuleContext({ candidate: "x" } as never), /plain data/));
  check("a record must name itself", throwsFramework(() => createDecisionRuleContext({ candidate: { title: "t" } } as never), /non-empty id/) && throwsFramework(() => createDecisionRuleContext({ opportunityAnalysis: { candidateId: "c" } } as never), /non-empty id/) && throwsFramework(() => createDecisionRuleContext({ pageAnalysis: { id: "" } } as never), /non-empty id/));
  check("the Opportunity and Traffic records must refer to the same candidate and analysis", throwsFramework(() => fullContext({ opportunityAnalysis: { ...opportunityAnalysis, candidateId: "other" } }), /different candidate/) && throwsFramework(() => fullContext({ trafficAnalysis: { ...trafficAnalysis, candidateId: "other" } }), /different candidate/) && throwsFramework(() => fullContext({ trafficAnalysis: { ...trafficAnalysis, opportunityAnalysisId: "opp-2" } }), /different Opportunity analysis/));
  check("an unknown member is rejected and points to extensions", throwsFramework(() => createDecisionRuleContext({ facts: {} } as never), /extensions/) && throwsFramework(() => createDecisionRuleContext({ runtime: {} } as never), /unexpected member "runtime"/));
  check("a context that is not an object is rejected by the validator", has(validateDecisionRuleContext(5), /an object is required/) && has(validateDecisionRuleContext([]), /an object is required/) && has(validateDecisionRuleContext(null), /an object is required/));
  check("a complete check requires every member", validateDecisionRuleContext(ctx, true).length === 0 && has(validateDecisionRuleContext({ candidate: null }, true), /member "opportunityAnalysis" is missing/) && validateDecisionRuleContext({ candidate: null }).length === 0);

  check("no dependencies is valid", validateDecisionRuleDependencies(entriesOf(fake("a"), fake("b"))).length === 0);
  check("a present required dependency is valid", validateDecisionRuleDependencies(entriesOf(fake("a"), fake("b", { requires: ["a"] }))).length === 0);
  check("a missing required dependency is reported", has(validateDecisionRuleDependencies(entriesOf(fake("b", { requires: ["a"] }))), /requires "a", which is not registered/));
  check("a disabled required dependency is reported", has(validateDecisionRuleDependencies(entriesOf(fake("a", { enabled: false }), fake("b", { requires: ["a"] }))), /requires "a", which is disabled/));
  check("a missing or disabled optional dependency is fine", validateDecisionRuleDependencies(entriesOf(fake("b", { optional: ["a"] }))).length === 0 && validateDecisionRuleDependencies(entriesOf(fake("a", { enabled: false }), fake("b", { optional: ["a"] }))).length === 0);
  const conflict = validateDecisionRuleDependencies(entriesOf(fake("a", { conflicts: ["b"] }), fake("b", { conflicts: ["a"] })));
  check("a conflict between enabled rules is reported once", conflict.length === 1 && /conflicts with/.test(conflict[0].message));
  check("a conflict with a disabled or unregistered rule is fine", validateDecisionRuleDependencies(entriesOf(fake("a", { conflicts: ["b"] }), fake("b", { enabled: false }))).length === 0 && validateDecisionRuleDependencies(entriesOf(fake("a", { conflicts: ["zz"] }))).length === 0);
  check("Circular Dependencies: a two-rule cycle is rejected", has(validateDecisionRuleDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] }))), /Circular dependency/));
  const three = validateDecisionRuleDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["c"] }), fake("c", { requires: ["a"] })));
  check("Circular Dependencies: a three-rule cycle is rejected and names its path", three.length === 1 && /a -> b -> c -> a|b -> c -> a -> b|c -> a -> b -> c/.test(three[0].message));
  check("Circular Dependencies: a cycle through optional dependencies is rejected", has(validateDecisionRuleDependencies(entriesOf(fake("a", { optional: ["b"] }), fake("b", { requires: ["a"] }))), /Circular dependency/));
  check("a cycle with a disabled member is not a cycle", validateDecisionRuleDependencies(entriesOf(fake("a", { optional: ["b"] }), fake("b", { optional: ["a"], enabled: false }))).length === 0);
  const sample = createDecisionRuleModuleRegistry();
  sample.register(fake("b", { requires: ["a"] }));
  validateDecisionRuleDependencies(sample.list());
  check("Validate only: validation never registers, enables, or repairs anything", sample.count() === 1 && sample.get("a") === null && sample.get("b")?.enabled === true);

  const order = (...modules: DecisionRuleModule[]) => resolveDecisionRuleOrder(entriesOf(...modules));
  check("dependencies run before their dependents regardless of priority", order(fake("a", { priority: 1 }), fake("b", { priority: 900, requires: ["a"] })).order.join() === "a,b");
  check("independent rules run by priority, then id", order(fake("c", { priority: 10 }), fake("b", { priority: 10 }), fake("a", { priority: 5 }), fake("z", { priority: 99 })).order.join() === "z,b,c,a");
  check("a present optional dependency runs first", order(fake("a", { priority: 1 }), fake("b", { priority: 900, optional: ["a"] })).order.join() === "a,b");
  check("disabled rules are not ordered", order(fake("a"), fake("b", { enabled: false })).order.join() === "a");
  const bad = order(fake("b", { requires: ["a"] }));
  check("invalid dependencies give no order and a list of issues", bad.order.length === 0 && bad.issues.length === 1);
  check("an empty registry has an empty order", resolveDecisionRuleOrder([]).order.length === 0 && resolveDecisionRuleOrder([]).issues.length === 0);
  check("the order is stable across repeated calls", order(fake("a"), fake("b", { requires: ["a"] }), fake("c")).order.join() === order(fake("c"), fake("b", { requires: ["a"] }), fake("a")).order.join());

  const p = createDecisionRulePipeline({ now: zero });
  check("the pipeline registers, enables, disables, and removes", p.register(fake("a")).id === "a" && p.disable("a").enabled === false && p.enable("a").enabled === true && p.remove("a").id === "a" && p.registry.count() === 0);
  check("the pipeline exposes its registry and a registry can be supplied", p.registry.count() === 0 && (() => { const r = createDecisionRuleModuleRegistry(); return createDecisionRulePipeline({ registry: r }).registry === r; })());
  check("the pipeline validates dependencies and resolves an order", pipelineOf(fake("b", { requires: ["a"] })).validateDependencies().length === 1 && pipelineOf(fake("a"), fake("b", { requires: ["a"] })).resolveExecutionOrder().order.join() === "a,b");

  calls = [];
  const runPipe = pipelineOf(fake("a", { priority: 1 }), fake("b", { priority: 900, requires: ["a"] }), fake("c", { priority: 50 }), fake("off", { enabled: false }));
  const report = await runPipe.run(ctx);
  check("run executes the enabled rules in order and collects a result for each", report.order.join() === "c,a,b" && report.results.map((r) => r.ruleId).join() === "c,a,b" && calls.join() === "c,a,b");
  check("disabled rules are not run and have no result", !calls.includes("off") && !report.results.some((r) => r.ruleId === "off"));
  const r0 = report.results[0];
  check("a result carries status, confidence, warnings, errors, metadata, and executionTime", Object.keys(r0).sort().join() === "confidence,errors,executionTime,metadata,ruleId,status,warnings" && r0.status === "PASS" && r0.confidence === 0.5 && r0.metadata.k === 1 && r0.executionTime === 0);
  check("No score, no recommendation: a result carries neither", report.results.every((r) => !("score" in r) && !("recommendation" in r) && !("ranking" in r)));
  check("results are frozen and are copies of what the rule returned", report.results.every((r) => Object.isFrozen(r) && Object.isFrozen(r.metadata) && Object.isFrozen(r.warnings)));
  const shared = { k: 1 };
  const copyRun = await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: shared }) })).run(ctx);
  shared.k = 2;
  check("changing what a rule returned afterwards does not change its result", copyRun.results[0].metadata.k === 1);
  check("a run is repeatable", JSON.stringify((await runPipe.run(ctx)).results) === JSON.stringify(report.results));
  let active = 0;
  let overlap = false;
  const slow = (id: string, extra: Partial<FakeOpts> = {}) => fake(id, { ...extra, output: async () => { active += 1; overlap = overlap || active > 1; await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1; return { ...OK }; } });
  await pipelineOf(slow("a"), slow("b"), slow("c")).run(ctx);
  check("No parallel execution: rules run strictly one at a time", overlap === false);
  const gate = pipelineOf(slow("a"), slow("b"));
  const first = gate.run(ctx);
  check("an overlapping run is refused", await rejectsFramework(() => gate.run(ctx), /already in progress/));
  await first;
  check("a run can start again after the previous finished", (await gate.run(ctx)).results.length === 2);
  const seenContexts: DecisionRuleContext[] = [];
  await pipelineOf(fake("a", { output: (c) => (seenContexts.push(c), { ...OK }) }), fake("b", { priority: 1, output: (c) => (seenContexts.push(c), { ...OK }) })).run(ctx);
  check("every rule receives the same shared immutable context", seenContexts.length === 2 && seenContexts[0] === ctx && seenContexts[1] === ctx && Object.isFrozen(seenContexts[0]));
  let upstreamSeen: Record<string, DecisionRuleRunResult> | null = null;
  let stranger: Record<string, DecisionRuleRunResult> | null = null;
  await pipelineOf(
    fake("a", { priority: 900 }),
    fake("c", { priority: 800 }),
    fake("b", { priority: 1, requires: ["a"], output: (_c, u) => ((upstreamSeen = u), { ...OK }) }),
    fake("d", { priority: 1, output: (_c, u) => ((stranger = u), { ...OK }) }),
  ).run(ctx);
  check("a rule sees only the results it declared, and a required result is readable", upstreamSeen !== null && Object.keys(upstreamSeen).join() === "a" && (upstreamSeen as Record<string, DecisionRuleRunResult>).a.status === "PASS" && Object.isFrozen(upstreamSeen) && stranger !== null && Object.keys(stranger).length === 0);
  const unsupported = await pipelineOf(fake("a", { supports: false })).run(ctx);
  check("an unsupported decision is SKIPPED and evaluate is not called", unsupported.results[0].status === "SKIPPED" && /does not support this decision/.test(unsupported.results[0].warnings[0]) && unsupported.results[0].confidence === null);
  calls = [];
  const invalidInput = await pipelineOf(fake("a", { validate: [{ field: "candidate", message: "missing" }] })).run(ctx);
  check("a rule's validate() issues make it FAIL without running evaluate", invalidInput.results[0].status === "FAIL" && invalidInput.results[0].errors[0] === "candidate: missing" && calls.length === 0);
  const thrown = await pipelineOf(fake("a", { output: () => { throw new Error("boom"); } })).run(ctx);
  check("a throwing rule is FAIL with its message", thrown.results[0].status === "FAIL" && thrown.results[0].errors[0] === "boom");
  const rejected = await pipelineOf(fake("a", { output: () => Promise.reject(new Error("async boom")) })).run(ctx);
  check("an async rejection is FAIL with its message", rejected.results[0].errors[0] === "async boom");
  const malformed = await pipelineOf(fake("a", { output: () => ({ status: "WEIRD" }) as never })).run(ctx);
  check("Invalid Metadata: a malformed output is FAIL", malformed.results[0].status === "FAIL" && /Invalid rule output/.test(malformed.results[0].errors[0]));
  const nested = await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { a: { b: 1 } } as never }) })).run(ctx);
  check("Invalid Metadata: an output with nested metadata is FAIL", nested.results[0].status === "FAIL" && /Invalid metadata/.test(nested.results[0].errors[0]));
  const selfFailed = await pipelineOf(fake("a", { output: () => ({ status: "FAIL", confidence: null, metadata: {}, warnings: ["w"], errors: ["own failure"] }) })).run(ctx);
  check("a rule may report its own failure", selfFailed.results[0].status === "FAIL" && selfFailed.results[0].errors[0] === "own failure" && selfFailed.results[0].warnings[0] === "w");
  const warned = await pipelineOf(fake("a", { output: () => ({ status: "WARNING", confidence: null, metadata: {}, warnings: ["watch"], errors: [] }) })).run(ctx);
  check("a rule may report a warning and still complete", warned.results[0].status === "WARNING" && warned.results[0].warnings[0] === "watch");
  calls = [];
  const blockedRun = await pipelineOf(fake("a", { output: () => { throw new Error("x"); } }), fake("b", { requires: ["a"] })).run(ctx);
  check("a rule whose required rule failed is SKIPPED, not run", blockedRun.results[1].status === "SKIPPED" && /Required rule "a" did not complete/.test(blockedRun.results[1].warnings[0]) && !calls.includes("b"));
  const blockedSkip = await pipelineOf(fake("a", { supports: false }), fake("b", { requires: ["a"] })).run(ctx);
  check("a rule whose required rule was skipped is SKIPPED, not run", blockedSkip.results[1].status === "SKIPPED");
  const warningOk = await pipelineOf(fake("a", { output: () => ({ status: "WARNING", confidence: null, metadata: {}, warnings: ["w"], errors: [] }) }), fake("b", { requires: ["a"] })).run(ctx);
  check("a required rule that warned still unblocks its dependent", warningOk.results[0].status === "WARNING" && warningOk.results[1].status === "PASS" && warningOk.results[1].ruleId === "b");
  const optionalFailed = await pipelineOf(fake("a", { output: () => { throw new Error("x"); } }), fake("b", { optional: ["a"], output: (_c, u) => ({ ...OK, metadata: { upstream: u.a.status } }) })).run(ctx);
  check("a failed optional dependency does not block, and its result is readable", optionalFailed.results[1].status === "PASS" && optionalFailed.results[1].metadata.upstream === "FAIL");
  calls = [];
  const independent = await pipelineOf(fake("a", { priority: 100, output: () => { throw new Error("x"); } }), fake("b", { priority: 50 })).run(ctx);
  check("one failure does not stop later rules", independent.results[0].status === "FAIL" && independent.results[1].status === "PASS" && calls.join() === "a,b");
  calls = [];
  const refused = pipelineOf(fake("a"), fake("b", { requires: ["missing"] }));
  check("a run with invalid dependencies is refused and runs nothing", await rejectsFramework(() => refused.run(ctx), /dependencies are invalid/) && calls.length === 0);
  check("Do not auto-resolve: the refusal does not register or enable anything", refused.registry.count() === 2 && refused.registry.get("missing") === null);
  refused.remove("b");
  check("after removing the offender the run succeeds", (await refused.run(ctx)).results.length === 1);
  check("a circular dependency refuses the run", await rejectsFramework(() => pipelineOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] })).run(ctx), /Circular dependency/));
  const toggled = pipelineOf(fake("a"), fake("b", { requires: ["a"] }));
  toggled.disable("a");
  check("disabling a required rule is reported, not repaired", await rejectsFramework(() => toggled.run(ctx), /disabled/) && toggled.registry.get("a")?.enabled === false);
  const emptyRun = await createDecisionRulePipeline().run(ctx);
  check("an empty pipeline runs to an empty report", emptyRun.order.length === 0 && emptyRun.results.length === 0);
  check("a run with an invalid context is refused before anything executes", await rejectsFramework(() => pipelineOf(fake("a")).run({ candidate: null } as never), /Context is invalid/) && await rejectsFramework(() => pipelineOf(fake("a")).run(null as never), /Context is invalid/) && await rejectsFramework(() => pipelineOf(fake("a")).run({ ...ctx, executionMetadata: { a: { b: 1 } } } as never), /Invalid metadata/));
  check("a pipeline stays usable after a refused run", await (async () => { const pipe = pipelineOf(fake("a")); await rejectsFramework(() => pipe.run(null as never)); return (await pipe.run(ctx)).results.length === 1; })());
  check("the default clock gives a finite, non-negative executionTime", await (async () => { const pipe = createDecisionRulePipeline(); pipe.register(fake("a")); const r = await pipe.run(ctx); return r.results[0].executionTime >= 0 && Number.isFinite(r.results[0].executionTime); })());
  const tick = (() => { let t = 0; return () => (t += 5); })();
  const timed = createDecisionRulePipeline({ now: tick });
  timed.register(fake("a"));
  check("executionTime comes from the injected clock", (await timed.run(ctx)).results[0].executionTime === 5);
  check("the executor and skippedDecisionRuleResult are usable alone", (await executeDecisionRule(fake("a"), ctx, Object.freeze({}), zero)).status === "PASS" && skippedDecisionRuleResult("a", "w").status === "SKIPPED" && Object.isFrozen(skippedDecisionRuleResult("a", "w")));

  const contextBefore = JSON.stringify(ctx);
  const sourceBefore = JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]);
  const mutating = fake("a", { output: (c) => { try { (c.candidate as Record<string, unknown>).title = "hacked"; (c.opportunityAnalysis as Record<string, unknown>).status = "FAILED"; (c.trafficAnalysis as Record<string, unknown>).status = "FAILED"; (c.pageAnalysis as Record<string, unknown>).id = "hacked"; } catch { /* frozen */ } return { ...OK }; } });
  await pipelineOf(mutating, fake("b", { priority: 1 })).run(ctx);
  check("No mutation: a rule cannot change the context, and the source objects are untouched", JSON.stringify(ctx) === contextBefore && JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]) === sourceBefore);
  const aloneA = (await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { v: "a" } }) })).run(ctx)).results[0];
  const togetherA = (await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { v: "a" } }) }), fake("b", { priority: 1, output: () => { throw new Error("b fails"); } }), fake("c", { priority: 2 })).run(ctx)).results.find((r) => r.ruleId === "a")!;
  check("Independent execution: a rule's result is the same alone or beside others, even failing ones", JSON.stringify(aloneA) === JSON.stringify(togetherA));
  const byRegistration = (...ms: DecisionRuleModule[]) => pipelineOf(...ms).run(ctx).then((r) => JSON.stringify(r));
  check("Independent execution: registration order does not change the run", (await byRegistration(fake("a"), fake("b", { requires: ["a"] }), fake("c", { priority: 3 }))) === (await byRegistration(fake("c", { priority: 3 }), fake("b", { requires: ["a"] }), fake("a"))));
  const twoPipes = [pipelineOf(fake("a")), pipelineOf(fake("a"), fake("b"))];
  await Promise.all(twoPipes.map((pipe) => pipe.run(ctx)));
  check("pipelines are independent: another pipeline's registry and runs change nothing", twoPipes[0].registry.count() === 1 && twoPipes[1].registry.count() === 2);

  const dir = join(process.cwd(), "src/lib/decision");
  const frameworkFiles = readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f));
  check("seven framework modules exist: contract, context, registry, validator, resolver, executor, pipeline", frameworkFiles.sort().join() === "decision-rule-contract.ts,decision-rule-context.ts,decision-rule-executor.ts,decision-rule-pipeline.ts,decision-rule-registry.ts,decision-rule-resolver.ts,decision-rule-validator.ts".split(",").sort().join());
  const lines = frameworkFiles.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, or campaign logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|campaign|adwords|\bbid\b|budget/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const outside = imports.filter((i) => !/^\.\/decision-[a-z-]+$/.test(i.from));
  check("imports were found", imports.length >= 20);
  check("the only imports from outside the decision folder are three type-only shapes", outside.length === 3 && outside.every((i) => i.typeOnly) && outside.map((i) => i.from).sort().join() === "../discovery/discovery-types,../opportunity/opportunity-types,../traffic/traffic-types");
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|db/i.test(i.from)));
  check("no rule ships: the framework registers nothing of its own", !code.some((l) => /\bregister\(\s*\{|createDecisionRuleModuleRegistry\(\)\.register|\.register\(\s*[a-z]+Rule/.test(l)) && code.filter((l) => /\.register\(/.test(l)).length === 1);
  check("no rule id is defined in the framework", !code.some((l) => /\bid:\s*["'][a-z]/.test(l)));
  const architecture = ["decision-types.ts", "decision-analysis.ts", "decision-registry.ts", "decision-validator.ts", "decision-engine.ts", "decision-resolver.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape: still types and contracts only, with no import of the framework", architecture.every((src) => !/decision-rule-/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  check("the Decision Resolver remains unimplemented", !/export\s+(async\s+)?function|export\s+class|createDecisionResolver/.test(readFileSync(join(dir, "decision-resolver.ts"), "utf8")));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision rule framework", !others.some((f) => /decision-rule-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision rule framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
