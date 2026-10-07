import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EXECUTION_TASK_CATEGORIES, EXECUTION_TASK_RESULT_STATUSES } from "../src/lib/execution/execution-task-contract.ts";
import type { ExecutionTaskModule, ExecutionTaskOutput, ExecutionTaskResult } from "../src/lib/execution/execution-task-contract.ts";
import { createExecutionTaskContext, freezeDeepExecutionTask } from "../src/lib/execution/execution-task-context.ts";
import type { ExecutionTaskContext } from "../src/lib/execution/execution-task-context.ts";
import { ExecutionTaskFrameworkError, createExecutionTaskRegistry } from "../src/lib/execution/execution-task-registry.ts";
import { resolveExecutionTaskOrder } from "../src/lib/execution/execution-task-resolver.ts";
import { blockedExecutionTaskResult, buildExecutionTask, skippedExecutionTaskResult } from "../src/lib/execution/execution-task-builder.ts";
import { createExecutionTaskPipeline } from "../src/lib/execution/execution-task-pipeline.ts";
import {
  EXECUTION_TASK_PRIORITY_MAX,
  isExecutionTaskCategory,
  isExecutionTaskVersion,
  isFlatExecutionMetadata,
  validateExecutionTaskContext,
  validateExecutionTaskDependencies,
  validateExecutionTaskModule,
  validateExecutionTaskOutput,
  validateExecutionTaskPlan,
  validateNoDuplicateExecutionTaskId,
} from "../src/lib/execution/execution-task-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const throwsFramework = (fn: () => unknown, text?: RegExp): boolean => {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof ExecutionTaskFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};
const rejectsFramework = async (fn: () => Promise<unknown>, text?: RegExp): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof ExecutionTaskFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};

interface FakeOpts {
  priority?: number;
  requires?: string[];
  optional?: string[];
  conflicts?: string[];
  enabled?: boolean;
  supports?: boolean;
  category?: ExecutionTaskModule["category"];
  output?: (context: ExecutionTaskContext, upstream: Record<string, ExecutionTaskResult>) => ExecutionTaskOutput | Promise<ExecutionTaskOutput>;
  validate?: Array<{ field: string; message: string }>;
}
let calls: string[] = [];
const OK: ExecutionTaskOutput = { status: "READY", warnings: [], metadata: { k: 1, note: "fixture" }, estimatedDuration: 10 };
function fake(id: string, over: FakeOpts = {}): ExecutionTaskModule {
  return {
    id,
    name: `Task ${id}`,
    version: "1.0.0",
    category: over.category ?? "FUTURE",
    enabled: over.enabled ?? true,
    priority: over.priority ?? 100,
    dependencies: { requires: over.requires ?? [], optional: over.optional ?? [], conflicts: over.conflicts ?? [] },
    supportsPlan: () => over.supports ?? true,
    validate: () => over.validate ?? [],
    build: (context, upstream) => {
      calls.push(id);
      return over.output ? over.output(context, upstream as Record<string, ExecutionTaskResult>) : { ...OK, metadata: { ...OK.metadata } };
    },
  };
}
const entriesOf = (...modules: ExecutionTaskModule[]) => {
  const registry = createExecutionTaskRegistry();
  for (const m of modules) registry.register(m);
  return registry.list();
};
const pipelineOf = (...modules: ExecutionTaskModule[]) => {
  const pipeline = createExecutionTaskPipeline();
  for (const m of modules) pipeline.register(m);
  return pipeline;
};
const emptyContext = () => createExecutionTaskContext();
const fullContext = (over: ExecutionTaskContextInitExtra = {}) =>
  createExecutionTaskContext({
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  });
type ExecutionTaskContextInitExtra = Parameters<typeof createExecutionTaskContext>[0];

async function main() {
  check("seven task categories, in the requested order", EXECUTION_TASK_CATEGORIES.join() === "PREPARATION,VALIDATION,GENERATION,REVIEW,PUBLICATION,MONITORING,FUTURE");
  check("four task result statuses, in the requested order", EXECUTION_TASK_RESULT_STATUSES.join() === "READY,BLOCKED,SKIPPED,FAILED");
  check("every category and status is distinct", new Set(EXECUTION_TASK_CATEGORIES).size === 7 && new Set(EXECUTION_TASK_RESULT_STATUSES).size === 4);
  check("a complete fixture satisfies the contract", validateExecutionTaskModule(fake("alpha")).length === 0);
  check("category and version helpers", isExecutionTaskCategory("PREPARATION") && isExecutionTaskCategory("FUTURE") && !isExecutionTaskCategory("SPORTS") && isExecutionTaskVersion("1.0.0") && !isExecutionTaskVersion("1.0") && isFlatExecutionMetadata({ a: 1, b: null }) && !isFlatExecutionMetadata({ a: { b: 1 } }));

  check("missing contract (null) rejected", validateExecutionTaskModule(null).length === 1);
  check("missing contract (undefined) rejected", validateExecutionTaskModule(undefined).length === 1);
  check("missing contract (empty object) lists every member", validateExecutionTaskModule({}).length === 10);
  check("missing method rejected", validateExecutionTaskModule({ ...fake("alpha"), build: undefined }).some((i) => i.field === "build"));
  check("non-function method rejected", validateExecutionTaskModule({ ...fake("alpha"), validate: "yes" }).some((i) => i.field === "validate"));
  check("missing dependencies rejected", validateExecutionTaskModule({ ...fake("alpha"), dependencies: undefined }).some((i) => i.field === "dependencies"));
  check("invalid category rejected", validateExecutionTaskModule({ ...fake("alpha"), category: "SPORTS" }).some((i) => i.field === "category"));
  check("lowercase category rejected", validateExecutionTaskModule({ ...fake("alpha"), category: "preparation" }).some((i) => i.field === "category"));
  for (const bad of ["1.0", "v1.0.0", "", "1.0.0-beta", "01.0.0", "1.0.0.0"]) {
    check(`invalid version "${bad}" rejected`, validateExecutionTaskModule({ ...fake("alpha"), version: bad }).some((i) => i.field === "version" && /Invalid version/.test(i.message)));
  }
  check("numeric version rejected", validateExecutionTaskModule({ ...fake("alpha"), version: 1 }).some((i) => i.field === "version"));
  check("valid versions accepted", ["0.0.1", "1.2.3", "10.20.30"].every((v) => validateExecutionTaskModule({ ...fake("alpha"), version: v }).length === 0));
  check("invalid id rejected", ["Alpha", "1alpha", "al pha", ""].every((id) => validateExecutionTaskModule({ ...fake("alpha"), id }).some((i) => i.field === "id")));
  check("empty name rejected", validateExecutionTaskModule({ ...fake("alpha"), name: "  " }).some((i) => i.field === "name"));
  check("non-boolean enabled rejected", validateExecutionTaskModule({ ...fake("alpha"), enabled: "yes" }).some((i) => i.field === "enabled"));
  check("out-of-range or fractional priority rejected", [-1, EXECUTION_TASK_PRIORITY_MAX + 1, 1.5, "1"].every((priority) => validateExecutionTaskModule({ ...fake("alpha"), priority }).some((i) => i.field === "priority")));
  check("self dependency rejected", validateExecutionTaskModule(fake("alpha", { requires: ["alpha"] })).some((i) => i.field === "dependencies.requires"));
  check("dependency list that is not a list rejected", validateExecutionTaskModule({ ...fake("alpha"), dependencies: { requires: "beta", optional: [], conflicts: [] } }).some((i) => i.field === "dependencies.requires"));
  check("invalid dependency id rejected", validateExecutionTaskModule(fake("alpha", { optional: ["Bad Id"] })).some((i) => i.field === "dependencies.optional"));
  check("repeated dependency id rejected", validateExecutionTaskModule(fake("alpha", { requires: ["beta", "beta"] })).some((i) => i.field === "dependencies.requires"));
  check("conflicting with a required task rejected", validateExecutionTaskModule(fake("alpha", { requires: ["beta"], conflicts: ["beta"] })).some((i) => i.field === "dependencies.conflicts"));
  check("required and optional overlap rejected", validateExecutionTaskModule(fake("alpha", { requires: ["beta"], optional: ["beta"] })).some((i) => i.field === "dependencies.optional"));
  check("duplicate id helper", validateNoDuplicateExecutionTaskId(["a", "b"], "b").some((i) => /Duplicate Task/.test(i.message)) && validateNoDuplicateExecutionTaskId(["a"], "c").length === 0);

  check("valid output accepted", validateExecutionTaskOutput(OK).length === 0);
  check("output duration may be null", validateExecutionTaskOutput({ ...OK, estimatedDuration: null }).length === 0);
  check("output with unknown status rejected", validateExecutionTaskOutput({ ...OK, status: "DONE" }).some((i) => i.field === "status"));
  check("output with negative duration rejected", validateExecutionTaskOutput({ ...OK, estimatedDuration: -1 }).some((i) => i.field === "estimatedDuration"));
  check("Invalid Metadata: nested metadata rejected", validateExecutionTaskOutput({ ...OK, metadata: { a: { b: 1 } } }).some((i) => /Invalid metadata/.test(`${i.field} ${i.message}`)));
  check("output with non-text warnings rejected", validateExecutionTaskOutput({ ...OK, warnings: [1] }).some((i) => i.field === "warnings"));
  check("FAILED output requires a warning", validateExecutionTaskOutput({ ...OK, status: "FAILED" }).some((i) => i.field === "warnings"));
  check("non-object output rejected", validateExecutionTaskOutput(null).length === 1);

  const registry = createExecutionTaskRegistry();
  const alpha = registry.register(fake("alpha", { priority: 10, category: "PREPARATION" }));
  check("register returns the entry, enabled by the module default", alpha.id === "alpha" && alpha.enabled === true && registry.count() === 1);
  check("Duplicate Task IDs rejected", throwsFramework(() => registry.register(fake("alpha")), /Duplicate Task/) && registry.count() === 1);
  check("invalid module is not registered", throwsFramework(() => registry.register({ ...fake("beta"), version: "x" } as ExecutionTaskModule), /Invalid version/) && registry.count() === 1);
  check("null module is not registered", throwsFramework(() => registry.register(null as unknown as ExecutionTaskModule), /Missing contract/) && registry.count() === 1);
  registry.register(fake("beta", { priority: 50, category: "REVIEW", enabled: false }));
  registry.register(fake("gamma", { priority: 50, category: "PREPARATION" }));
  check("a module may start disabled", registry.get("beta")?.enabled === false);
  check("list orders by priority then id", registry.list().map((e) => e.id).join() === "beta,gamma,alpha");
  check("list filters by category", registry.list({ category: "PREPARATION" }).map((e) => e.id).join() === "gamma,alpha");
  check("list filters by enabled", registry.list({ enabled: false }).map((e) => e.id).join() === "beta");
  check("enable switches the registry state", registry.enable("beta").enabled === true && registry.get("beta")?.enabled === true);
  check("enable leaves the module untouched", registry.get("beta")?.module.enabled === false);
  check("disable switches the registry state", registry.disable("beta").enabled === false);
  check("enable and disable are idempotent", registry.disable("beta").enabled === false && registry.enable("beta").enabled === true && registry.enable("beta").enabled === true);
  check("enable of an unknown task rejected", throwsFramework(() => registry.enable("nope")));
  check("disable of an unknown task rejected", throwsFramework(() => registry.disable("nope")));
  check("remove returns the entry and forgets it", registry.remove("gamma").id === "gamma" && registry.get("gamma") === null && registry.count() === 2);
  check("remove of an unknown task rejected", throwsFramework(() => registry.remove("gamma")));
  check("a removed id can be registered again", registry.register(fake("gamma")).id === "gamma");
  check("get of an unknown task is null", registry.get("nope") === null);
  check("validate reports without registering", registry.validate({}).length > 0 && registry.validate(fake("delta")).length === 0 && registry.get("delta") === null);

  const empty = emptyContext();
  check("a new context is empty", empty.decisionAnalysis === null && empty.workflowSnapshot === null && Object.keys(empty.executionMetadata).length === 0 && Object.keys(empty.runtimeMetadata).length === 0 && Object.keys(empty.configuration).length === 0);
  check("a context carries exactly the five members", Object.keys(empty).join() === "decisionAnalysis,workflowSnapshot,executionMetadata,runtimeMetadata,configuration");
  const source = { note: "x", count: 1 };
  const analysis = { id: "d-1", extra: "drop-me" };
  const snapshot = { id: "snap-1", extra: "drop-me" };
  const ctx = createExecutionTaskContext({ decisionAnalysis: analysis, workflowSnapshot: snapshot, executionMetadata: source, configuration: { flag: true } });
  source.note = "changed";
  analysis.id = "changed";
  snapshot.id = "changed";
  check("the context copies its inputs and keeps only the id of each holder", ctx.executionMetadata.note === "x" && ctx.decisionAnalysis?.id === "d-1" && ctx.workflowSnapshot?.id === "snap-1" && !("extra" in (ctx.decisionAnalysis as object)));
  check("the context and its sections are frozen", Object.isFrozen(ctx) && Object.isFrozen(ctx.executionMetadata) && Object.isFrozen(ctx.configuration) && Object.isFrozen(ctx.decisionAnalysis));
  try {
    (ctx.executionMetadata as Record<string, unknown>).note = "tampered";
  } catch {
    /* strict mode throws; sloppy mode ignores */
  }
  try {
    (ctx as unknown as Record<string, unknown>).decisionAnalysis = null;
  } catch {
    /* ignored */
  }
  check("the context cannot be changed", ctx.executionMetadata.note === "x" && ctx.decisionAnalysis?.id === "d-1");
  check("Invalid Metadata: nested context metadata is rejected", throwsFramework(() => createExecutionTaskContext({ executionMetadata: { a: { b: 1 } } as never }), /Invalid metadata/));
  check("freezeDeepExecutionTask never throws", freezeDeepExecutionTask(1) === 1 && Object.isFrozen(freezeDeepExecutionTask({ n: 1 })));

  check("no dependencies is valid", validateExecutionTaskDependencies(entriesOf(fake("a"), fake("b"))).length === 0);
  check("a present required dependency is valid", validateExecutionTaskDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b"))).length === 0);
  check("a missing required dependency is reported", validateExecutionTaskDependencies(entriesOf(fake("a", { requires: ["zz"] }))).some((i) => /not registered/.test(i.message)));
  check("a disabled required dependency is reported", validateExecutionTaskDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b", { enabled: false }))).some((i) => /disabled/.test(i.message)));
  check("a missing optional dependency is fine", validateExecutionTaskDependencies(entriesOf(fake("a", { optional: ["zz"] }))).length === 0);
  check("a disabled optional dependency is fine", validateExecutionTaskDependencies(entriesOf(fake("a", { optional: ["b"] }), fake("b", { enabled: false }))).length === 0);
  check("a conflict between enabled tasks is reported once", validateExecutionTaskDependencies(entriesOf(fake("a", { conflicts: ["b"] }), fake("b", { conflicts: ["a"] }))).filter((i) => i.field === "dependencies.conflicts").length === 1);
  check("a conflict with a disabled task is fine", validateExecutionTaskDependencies(entriesOf(fake("a", { conflicts: ["b"] }), fake("b", { enabled: false }))).length === 0);
  check("a conflict with an unregistered task is fine", validateExecutionTaskDependencies(entriesOf(fake("a", { conflicts: ["zz"] }))).length === 0);
  const cycle2 = validateExecutionTaskDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] })));
  check("a two-task cycle is rejected", cycle2.some((i) => /Circular dependency/.test(i.message)));
  const cycle3 = validateExecutionTaskDependencies(entriesOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["c"] }), fake("c", { requires: ["a"] }), fake("d")));
  check("a three-task cycle is rejected and names its path", cycle3.some((i) => /a -> b -> c -> a/.test(i.message)) && cycle3.every((i) => !/\bd\b/.test(i.message)));
  check("a cycle through optional dependencies is rejected", validateExecutionTaskDependencies(entriesOf(fake("a", { optional: ["b"] }), fake("b", { requires: ["a"] }))).some((i) => /Circular dependency/.test(i.message)));
  check("a cycle with a disabled member is not a cycle", validateExecutionTaskDependencies(entriesOf(fake("a", { optional: ["b"] }), fake("b", { optional: ["a"], enabled: false }))).length === 0);
  const probe = createExecutionTaskRegistry();
  probe.register(fake("a", { requires: ["b"] }));
  probe.register(fake("b", { enabled: false }));
  const snapshotEnabled = JSON.stringify(probe.list().map((e) => [e.id, e.enabled]));
  validateExecutionTaskDependencies(probe.list());
  check("validation never enables or registers anything", JSON.stringify(probe.list().map((e) => [e.id, e.enabled])) === snapshotEnabled && probe.count() === 2);
  check("validateExecutionTaskPlan reports graph issues without collecting", has(validateExecutionTaskPlan(entriesOf(fake("a", { requires: ["zz"] })), fullContext()), /not registered/) && validateExecutionTaskContext({}, true).some((i) => i.field === "decisionAnalysis"));

  const ordered = resolveExecutionTaskOrder(entriesOf(fake("c", { requires: ["b"], priority: 900 }), fake("b", { requires: ["a"], priority: 500 }), fake("a", { priority: 1 })));
  check("dependencies are collected before their dependents regardless of priority", ordered.order.join() === "a,b,c" && ordered.issues.length === 0);
  check("independent tasks are collected by priority then id", resolveExecutionTaskOrder(entriesOf(fake("m", { priority: 5 }), fake("k", { priority: 5 }), fake("z", { priority: 50 }))).order.join() === "z,k,m");
  check("a present optional dependency is collected first", resolveExecutionTaskOrder(entriesOf(fake("a", { optional: ["b"], priority: 900 }), fake("b", { priority: 1 }))).order.join() === "b,a");
  check("disabled tasks are not ordered", resolveExecutionTaskOrder(entriesOf(fake("a"), fake("b", { enabled: false }))).order.join() === "a");
  const invalidOrder = resolveExecutionTaskOrder(entriesOf(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] })));
  check("invalid dependencies give no order and a list of issues", invalidOrder.order.length === 0 && invalidOrder.issues.length > 0);
  check("an empty registry has an empty order", resolveExecutionTaskOrder([]).order.length === 0);

  const full = fullContext();
  const pipe = createExecutionTaskPipeline();
  pipe.register(fake("alpha", { priority: 10 }));
  pipe.register(fake("beta", { priority: 20 }));
  pipe.register(fake("gamma", { priority: 30, enabled: false }));
  check("pipeline registers, enables, and disables", pipe.enable("gamma").enabled === true && pipe.disable("gamma").enabled === false);
  check("pipeline exposes its registry", pipe.registry.count() === 3);
  check("pipeline validates dependencies", pipe.validateDependencies().length === 0);
  check("pipeline resolves an order", pipe.resolveOrder().order.join() === "beta,alpha");
  check("pipeline validates a plan without collecting", pipe.validatePlan(full).length === 0 && pipe.validatePlan().length === 0);
  calls = [];
  const run1 = await pipe.collect(full);
  check("collect gathers enabled tasks in order and collects results", run1.order.join() === "beta,alpha" && run1.results.map((r) => r.taskId).join() === "beta,alpha" && calls.join() === "beta,alpha");
  check("disabled tasks are not collected", !calls.includes("gamma") && run1.results.length === 2);
  check("results carry status, dependencies, warnings, metadata, estimatedDuration, and executionOrder", run1.results.every((r) => r.status === "READY" && typeof r.metadata === "object" && Array.isArray(r.warnings) && r.estimatedDuration === 10 && typeof r.executionOrder === "number" && Array.isArray(r.dependencies.requires)));
  check("a result has no score and only the requested fields", run1.results.every((r) => Object.keys(r).sort().join() === "dependencies,estimatedDuration,executionOrder,metadata,status,taskId,warnings" && !("score" in r) && !("http" in r)));
  check("executionOrder follows collect order", run1.results[0].executionOrder === 0 && run1.results[1].executionOrder === 1 && run1.results[0].taskId === "beta");
  check("results are frozen", run1.results.every((r) => Object.isFrozen(r) && Object.isFrozen(r.warnings) && Object.isFrozen(r.dependencies)));
  check("a collect is repeatable", (await pipe.collect(full)).results.length === 2);

  let active = 0;
  let maxActive = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = (id: string, wait = false) =>
    fake(id, {
      output: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (wait) await gate;
        else await Promise.resolve();
        active -= 1;
        return OK;
      },
    });
  const seq = createExecutionTaskPipeline();
  for (const id of ["s1", "s2", "s3"]) seq.register(slow(id));
  await seq.collect(full);
  check("tasks are collected strictly one at a time", maxActive === 1);
  const overlap = createExecutionTaskPipeline();
  overlap.register(slow("s1", true));
  const first = overlap.collect(full);
  check("an overlapping collect is refused", await rejectsFramework(() => overlap.collect(full)));
  release();
  await first;
  check("a collect can start again after the previous finished", (await overlap.collect(full)).results.length === 1);

  const seen: unknown[] = [];
  const up: Record<string, string[]> = {};
  const wiring = createExecutionTaskPipeline();
  wiring.register(fake("one", { output: (c, u) => { seen.push(c); up.one = Object.keys(u); return { ...OK, metadata: { from: "one" } }; } }));
  wiring.register(fake("two", { requires: ["one"], output: (c, u) => { seen.push(c); up.two = Object.keys(u); seen.push(u.one?.metadata.from); return OK; } }));
  wiring.register(fake("three", { optional: ["one", "zz"], output: (c, u) => { seen.push(c); up.three = Object.keys(u); return OK; } }));
  wiring.register(fake("four", { output: (_c, u) => { up.four = Object.keys(u); return OK; } }));
  await wiring.collect(full);
  check("every task receives the same shared context", seen.filter((s) => s === full).length === 3);
  check("a task sees only the results it declared", up.one.length === 0 && up.two.join() === "one" && up.three.join() === "one" && up.four.length === 0);
  check("a required result is readable upstream", seen.includes("one"));

  calls = [];
  const mixed = createExecutionTaskPipeline();
  mixed.register(fake("unsupported", { supports: false, priority: 90, output: () => { calls.push("unsupported"); return OK; } }));
  mixed.register(fake("invalid-ctx", { validate: [{ field: "configuration", message: "Missing data." }], priority: 80, output: () => { calls.push("invalid-ctx"); return OK; } }));
  mixed.register(fake("thrower", { priority: 70, output: () => { throw new Error("boom"); } }));
  mixed.register(fake("async-thrower", { priority: 65, output: async () => { throw new Error("late boom"); } }));
  mixed.register(fake("malformed", { priority: 60, output: () => ({ status: "READY" } as unknown as ExecutionTaskOutput) }));
  mixed.register(fake("reports-failure", { priority: 55, output: () => ({ ...OK, status: "FAILED", warnings: ["reported"] }) }));
  mixed.register(fake("needs-failed", { requires: ["thrower"], priority: 50, output: () => { calls.push("needs-failed"); return OK; } }));
  mixed.register(fake("needs-skipped", { requires: ["unsupported"], priority: 45, output: () => { calls.push("needs-skipped"); return OK; } }));
  mixed.register(fake("wants-failed", { optional: ["thrower"], priority: 40, output: () => { calls.push("wants-failed"); return OK; } }));
  mixed.register(fake("last", { priority: 1, output: () => { calls.push("last"); return OK; } }));
  const report = await mixed.collect(full);
  const by = Object.fromEntries(report.results.map((r) => [r.taskId, r]));
  check("an unsupported plan is SKIPPED", by.unsupported.status === "SKIPPED" && by.unsupported.warnings.length === 1 && !calls.includes("unsupported"));
  check("a task's validate() issues make it FAILED without running build", by["invalid-ctx"].status === "FAILED" && by["invalid-ctx"].warnings[0].includes("Missing data") && !calls.includes("invalid-ctx"));
  check("a throwing task is FAILED with its message", by.thrower.status === "FAILED" && by.thrower.warnings[0] === "boom");
  check("an async rejection is FAILED with its message", by["async-thrower"].status === "FAILED" && by["async-thrower"].warnings[0] === "late boom");
  check("a malformed output is FAILED", by.malformed.status === "FAILED" && by.malformed.warnings[0].startsWith("Invalid task output"));
  check("a task may report its own failure", by["reports-failure"].status === "FAILED" && by["reports-failure"].warnings[0] === "reported");
  check("a task whose required task failed is BLOCKED, not built", by["needs-failed"].status === "BLOCKED" && !calls.includes("needs-failed") && /thrower/.test(by["needs-failed"].warnings[0]));
  check("a task whose required task was skipped is BLOCKED, not built", by["needs-skipped"].status === "BLOCKED" && !calls.includes("needs-skipped"));
  check("a failed optional dependency does not block", by["wants-failed"].status === "READY" && calls.includes("wants-failed"));
  check("one failure does not stop later tasks", by.last.status === "READY" && report.results.length === 10);

  calls = [];
  const bad = createExecutionTaskPipeline();
  bad.register(fake("a", { requires: ["missing"] }));
  bad.register(fake("b"));
  check("a collect with invalid dependencies is refused and builds nothing", (await rejectsFramework(() => bad.collect(full), /dependencies are invalid/)) && calls.length === 0);
  check("the refusal does not repair the registry", bad.registry.count() === 2 && bad.registry.get("a")?.enabled === true && bad.registry.get("missing") === null);
  check("validatePlan reports the missing required task", has(bad.validatePlan(full), /not registered/));
  bad.remove("a");
  check("after removing the offender the collect succeeds", (await bad.collect(full)).results.length === 1 && calls.join() === "b");
  const cyc = createExecutionTaskPipeline();
  cyc.register(fake("a", { requires: ["b"] }));
  cyc.register(fake("b", { requires: ["a"] }));
  check("a circular dependency refuses the collect", await rejectsFramework(() => cyc.collect(full), /Circular dependency/));
  cyc.disable("b");
  check("disabling a required task is reported, not repaired", cyc.validateDependencies().some((i) => /disabled/.test(i.message)) && cyc.registry.get("b")?.enabled === false);
  check("an empty pipeline collects an empty report", (await createExecutionTaskPipeline().collect(full)).results.length === 0);
  check("a collect with an invalid context is refused before anything is built", await rejectsFramework(() => pipelineOf(fake("a")).collect({ decisionAnalysis: null } as never), /Context is invalid/) && await rejectsFramework(() => pipelineOf(fake("a")).collect(null as never), /Context is invalid/) && await rejectsFramework(() => pipelineOf(fake("a")).collect({ ...full, executionMetadata: { a: { b: 1 } } } as never), /Invalid metadata/));
  check("a pipeline stays usable after a refused collect", await (async () => { const p = pipelineOf(fake("a")); await rejectsFramework(() => p.collect(null as never)); return (await p.collect(full)).results.length === 1; })());
  const emptyDeps = { requires: [] as string[], optional: [] as string[], conflicts: [] as string[] };
  check("the builder and skipped/blocked helpers are usable alone", (await buildExecutionTask(fake("a"), full, Object.freeze({}), 0)).status === "READY" && skippedExecutionTaskResult("a", "w", emptyDeps, 0).status === "SKIPPED" && blockedExecutionTaskResult("a", "w", emptyDeps, 1).status === "BLOCKED" && Object.isFrozen(skippedExecutionTaskResult("a", "w", emptyDeps, 0)));

  const contextBefore = JSON.stringify(full);
  const mutating = fake("a", { output: (c) => { try { (c.decisionAnalysis as Record<string, unknown>).id = "hacked"; (c.workflowSnapshot as Record<string, unknown>).id = "hacked"; (c.configuration as Record<string, unknown>).mode = "hacked"; } catch { /* frozen */ } return { ...OK }; } });
  await pipelineOf(mutating, fake("b", { priority: 1 })).collect(full);
  check("No mutation: a task cannot change the context", JSON.stringify(full) === contextBefore);
  const aloneA = (await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { v: "a" } }) })).collect(full)).results[0];
  const togetherA = (await pipelineOf(fake("a", { output: () => ({ ...OK, metadata: { v: "a" } }) }), fake("b", { priority: 1, output: () => { throw new Error("b fails"); } }), fake("c", { priority: 2 })).collect(full)).results.find((r) => r.taskId === "a")!;
  check("Independent execution: a task's result is the same alone or beside others, even failing ones", JSON.stringify({ ...aloneA, executionOrder: 0 }) === JSON.stringify({ ...togetherA, executionOrder: 0 }));
  const byRegistration = (...ms: ExecutionTaskModule[]) => pipelineOf(...ms).collect(full).then((r) => JSON.stringify(r.results.map((x) => x.taskId)));
  check("Independent execution: registration order does not change the collect", (await byRegistration(fake("a"), fake("b", { requires: ["a"] }), fake("c", { priority: 3 }))) === (await byRegistration(fake("c", { priority: 3 }), fake("b", { requires: ["a"] }), fake("a"))));
  const twoPipes = [pipelineOf(fake("a")), pipelineOf(fake("a"), fake("b"))];
  await twoPipes[0].collect(full);
  await twoPipes[1].collect(full);
  check("Independent execution: another pipeline's registry and collects change nothing", twoPipes[0].registry.count() === 1 && twoPipes[1].registry.count() === 2);

  const dir = join(process.cwd(), "src/lib/execution");
  const frameworkFiles = readdirSync(dir).filter((f) => /^execution-task-[a-z]+\.ts$/.test(f));
  check("seven framework modules exist: contract, context, registry, validator, resolver, builder, pipeline", frameworkFiles.sort().join() === "execution-task-builder.ts,execution-task-context.ts,execution-task-contract.ts,execution-task-pipeline.ts,execution-task-registry.ts,execution-task-resolver.ts,execution-task-validator.ts");
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
  check("no parallel collect", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 12);
  check("every import stays inside the execution folder", imports.every((i) => /^\.\/execution-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("no task ships: the framework registers nothing of its own", !code.some((l) => /\bregister\(\s*\{|createExecutionTaskRegistry\(\)\.register|\.register\(\s*[a-z]+Task/.test(l)) && code.filter((l) => /\.register\(/.test(l)).length === 1);
  check("no task id is defined in the framework", !code.some((l) => /\bid:\s*["'][a-z]/.test(l)));
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape: still types and contracts only, with no import of the framework", architecture.every((src) => !/execution-task-/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, Decision, or Workflow module imports the execution task framework", !others.some((f) => /execution-task-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution task framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
