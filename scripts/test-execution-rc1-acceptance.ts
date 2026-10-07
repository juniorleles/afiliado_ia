/**
 * Execution Planner — RC1 acceptance audit.
 * Validation only. Does not add engine behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { EXECUTION_CONTEXT_MEMBERS } from "../src/lib/execution/execution-context.ts";
import { EXECUTION_PLAN_KEYS } from "../src/lib/execution/execution-plan.ts";
import { EXECUTION_TASK_KEYS, type ExecutionTask } from "../src/lib/execution/execution-types.ts";
import { EXECUTION_TASK_CATEGORIES, type ExecutionTaskModule, type ExecutionTaskResult } from "../src/lib/execution/execution-task-contract.ts";
import { createExecutionTaskContext } from "../src/lib/execution/execution-task-context.ts";
import { createExecutionTaskPipeline } from "../src/lib/execution/execution-task-pipeline.ts";
import { ExecutionTaskFrameworkError } from "../src/lib/execution/execution-task-registry.ts";
import { createExecutionPlanBuilder } from "../src/lib/execution/execution-plan-builder.ts";
import { createExecutionPlanValidator } from "../src/lib/execution/execution-plan-validator.ts";
import { createExecutionPlanSnapshot, EXECUTION_PLAN_SNAPSHOT_KEYS } from "../src/lib/execution/execution-plan-snapshot.ts";
import {
  EXECUTION_DEPENDENCY_KINDS,
  createExecutionDependencyGraph,
  type ExecutionTypedDependency,
} from "../src/lib/execution/execution-dependency-graph.ts";
import { ExecutionDependencyFrameworkError, createExecutionDependencyRegistry } from "../src/lib/execution/execution-dependency-registry.ts";
import { createExecutionDependencyResolver } from "../src/lib/execution/execution-dependency-resolver.ts";
import { createExecutionDependencySnapshot, EXECUTION_DEPENDENCY_SNAPSHOT_KEYS } from "../src/lib/execution/execution-dependency-snapshot.ts";
import { createExecutionDependencyValidator } from "../src/lib/execution/execution-dependency-validator.ts";
import { createExecutionContract, EXECUTION_CONTRACT_CATEGORIES, type ExecutionContract } from "../src/lib/execution/execution-contract.ts";
import { ExecutionContractFrameworkError, createExecutionContractRegistry } from "../src/lib/execution/execution-contract-registry.ts";
import { createExecutionContractResolver } from "../src/lib/execution/execution-contract-resolver.ts";
import { createExecutionContractSnapshot, EXECUTION_CONTRACT_SNAPSHOT_KEYS } from "../src/lib/execution/execution-contract-snapshot.ts";
import { createExecutionContractValidator } from "../src/lib/execution/execution-contract-validator.ts";
import { EXECUTION_PROVIDER_CAPABILITIES, ExecutionProviderCapabilityError, createExecutionProviderCapabilityRegistry } from "../src/lib/execution/execution-provider-capabilities.ts";
import type { ExecutionProvider } from "../src/lib/execution/execution-provider.ts";
import { ExecutionProviderFrameworkError, createExecutionProviderRegistry } from "../src/lib/execution/execution-provider-registry.ts";
import { createExecutionProviderResolver } from "../src/lib/execution/execution-provider-resolver.ts";
import { createExecutionProviderSnapshot, EXECUTION_PROVIDER_SNAPSHOT_KEYS } from "../src/lib/execution/execution-provider-snapshot.ts";
import { createExecutionProviderValidator } from "../src/lib/execution/execution-provider-validator.ts";
import { EXECUTION_PIPELINE_STEPS } from "../src/lib/execution/execution-resolver-recorder.ts";
import { EXECUTION_GRAPH_KEYS, EXECUTION_RESOLVER_SNAPSHOT_KEYS, createExecutionResolverSnapshot } from "../src/lib/execution/execution-resolver-plan.ts";
import { createExecutionResolver } from "../src/lib/execution/execution-resolver.ts";
import { createExecutionResolverValidator } from "../src/lib/execution/execution-resolver-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const clocks = (prefix: string) => {
  let n = 0;
  return { now: () => 0, timestamp: () => T0, idFactory: () => `${prefix}-${(n += 1)}` };
};
function timed<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}
async function timedAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function taskOf(id: string): ExecutionTask {
  return { id, name: id, steps: [], metadata: {} };
}
function resultOf(id: string, over: { requires?: string[]; executionOrder?: number } = {}): ExecutionTaskResult {
  return {
    taskId: id,
    status: "READY",
    warnings: [],
    metadata: {},
    estimatedDuration: 1,
    dependencies: { requires: over.requires ?? [], optional: [], conflicts: [] },
    executionOrder: over.executionOrder ?? 0,
  };
}
function fakeTask(id: string, over: { requires?: string[]; build?: ExecutionTaskModule["build"] } = {}): ExecutionTaskModule {
  return {
    id,
    name: id,
    version: "1.0.0",
    category: "FUTURE",
    enabled: true,
    priority: 100,
    dependencies: { requires: over.requires ?? [], optional: [], conflicts: [] },
    supportsPlan: () => true,
    validate: () => [],
    build: over.build ?? (() => ({ status: "READY", warnings: [], metadata: {}, estimatedDuration: 1 })),
  };
}
function depOf(id: string, from: string, to: string, kind: ExecutionTypedDependency["kind"] = "REQUIRED"): ExecutionTypedDependency {
  return { id, from, to, kind, metadata: {} };
}
function contractOf(id = "page-one"): ExecutionContract {
  return createExecutionContract({
    id,
    name: id,
    version: "1.0.0",
    category: "LANDING_PAGE",
    capabilities: ["declare"],
    requirements: ["plan"],
    inputs: ["plan"],
    outputs: ["record"],
    metadata: {},
  });
}
function hostOf(id: string, over: Partial<Pick<ExecutionProvider, "supportedContracts" | "capabilities">> = {}): ExecutionProvider {
  return {
    id,
    name: id,
    version: "1.0.0",
    supportedContracts: over.supportedContracts ?? ["page-one"],
    capabilities: over.capabilities ?? ["GENERATE"],
    health: () => ({ status: "OK", issues: [] }),
    validate: () => [],
    supports: () => true,
    metadata: {},
  };
}
function wrapResolve<T extends { resolve: (input: unknown) => unknown }>(inner: T, counter: { n: number }): T {
  const resolve = inner.resolve.bind(inner);
  return Object.assign(inner, {
    resolve(input: unknown) {
      counter.n += 1;
      return resolve(input);
    },
  });
}
function planInput(over: Record<string, unknown> = {}) {
  return {
    plan: {
      id: "plan-1",
      decisionAnalysisId: "d-1",
      workflowSnapshotId: "snap-1",
      tasks: [taskOf("alpha"), taskOf("beta")],
      dependencies: [{ from: "alpha", to: "beta" }],
      metadata: { run: "r1" },
      executionTime: 0,
      createdAt: T0,
    },
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    contracts: [contractOf()],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

async function main() {
  const dir = join(process.cwd(), "src/lib/execution");
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"];
  check("Execution Architecture: six contract modules remain", architecture.every((f) => readdirSync(dir).includes(f)));
  check("Execution Architecture: context members are unchanged", EXECUTION_CONTEXT_MEMBERS.join() === "decisionAnalysis,workflowSnapshot,executionMetadata,runtimeMetadata,configuration");
  check("Execution Architecture: plan keys are unchanged", EXECUTION_PLAN_KEYS.join() === "id,decisionAnalysisId,workflowSnapshotId,tasks,dependencies,preconditions,metadata,executionTime,createdAt");
  check("Execution Architecture: task keys are unchanged", EXECUTION_TASK_KEYS.join() === "id,name,steps,metadata");
  check("Execution Architecture: architecture stays contracts only", architecture.every((f) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, f), "utf8"))));

  const pipeline = createExecutionTaskPipeline();
  pipeline.register(fakeTask("alpha"));
  check("Execution Registry: task registry registers and lists", pipeline.registry.get("alpha")?.id === "alpha" && pipeline.registry.count() === 1);
  let duplicateTask = false;
  try {
    pipeline.register(fakeTask("alpha"));
  } catch (error) {
    duplicateTask = error instanceof ExecutionTaskFrameworkError && has(error.issues, /Duplicate Task/);
  }
  check("Execution Validation: Duplicate Task is rejected by the task registry", duplicateTask);

  const ctx = createExecutionTaskContext({ decisionAnalysis: { id: "d-1" }, workflowSnapshot: { id: "snap-1" } });
  let builds = 0;
  const collecting = createExecutionTaskPipeline();
  collecting.register(fakeTask("alpha", { build: () => { builds += 1; return { status: "READY", warnings: [], metadata: {}, estimatedDuration: 1 }; } }));
  collecting.register(fakeTask("beta", { requires: ["alpha"], build: () => { builds += 1; return { status: "READY", warnings: [], metadata: {}, estimatedDuration: 1 }; } }));
  const collected = await collecting.collect(ctx);
  check("Execution Tasks: collect orders required waits first", collected.order.join() === "alpha,beta" && collected.results.length === 2);
  check("Execution Pipeline: tasks are collected sequentially and fragments are frozen", collected.results.every((item) => Object.isFrozen(item)) && builds === 2);
  check("Execution Tasks: seven groups remain", EXECUTION_TASK_CATEGORIES.join() === "PREPARATION,VALIDATION,GENERATION,REVIEW,PUBLICATION,MONITORING,FUTURE");

  const built = createExecutionPlanBuilder(clocks("plan")).build({
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    results: [resultOf("alpha", { executionOrder: 0 }), resultOf("beta", { requires: ["alpha"], executionOrder: 1 })],
    executionMetadata: { run: "r1" },
  });
  check("Execution Plans: a built plan is frozen and ordered", built.status === "OK" && built.plan !== null && Object.isFrozen(built.plan) && built.plan.tasks.map((item) => item.id).join() === "alpha,beta");
  check("Execution Snapshots: plan snapshot keys are unchanged", EXECUTION_PLAN_SNAPSHOT_KEYS.join() === "planId,workflowId,decisionId,orderedTasks,dependencies,createdAt,metadata");
  check("Execution Snapshots: a plan snapshot is frozen", built.snapshot !== null && Object.isFrozen(built.snapshot) && Object.isFrozen(built.snapshot.orderedTasks));

  const depValidator = createExecutionDependencyValidator();
  const depRegistry = createExecutionDependencyRegistry();
  depRegistry.register(depOf("dep-1", "alpha", "beta"));
  check("Execution Dependency Graph: five kinds remain", EXECUTION_DEPENDENCY_KINDS.join() === "REQUIRED,OPTIONAL,BLOCKING,CONFLICTING,FUTURE");
  const depResolved = createExecutionDependencyResolver(clocks("graph")).resolve({
    tasks: [taskOf("alpha"), taskOf("beta")],
    dependencies: [depOf("dep-1", "alpha", "beta")],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
  });
  check("Execution Dependency Graph: required waits resolve READY", depResolved.status === "OK" && depResolved.ready.join() === "alpha,beta" && depResolved.graph !== null && Object.isFrozen(depResolved.graph));
  check("Execution Snapshots: dependency snapshot keys are unchanged", EXECUTION_DEPENDENCY_SNAPSHOT_KEYS.join() === "graphId,planId,workflowId,decisionId,ready,blocked,waiting,graph,createdAt,metadata");

  const contractRegistry = createExecutionContractRegistry();
  contractRegistry.register(contractOf());
  check("Execution Contracts: seven groups remain", EXECUTION_CONTRACT_CATEGORIES.join() === "LANDING_PAGE,CAMPAIGN,CREATIVE,TRACKING,MONITORING,NOTIFICATION,FUTURE");
  const contractResolved = createExecutionContractResolver({ ...clocks("contract"), registry: contractRegistry }).resolve({
    plan: built.plan!,
    tasks: built.plan!.tasks,
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    configuration: { mode: "m1" },
  });
  check("Execution Contracts: a matching contract resolves without running work", contractResolved.status === "OK" && contractResolved.contracts.map((item) => item.id).join() === "page-one" && Object.isFrozen(contractResolved.snapshot));
  check("Execution Snapshots: contract snapshot keys are unchanged", EXECUTION_CONTRACT_SNAPSHOT_KEYS.join() === "snapshotId,planId,workflowId,decisionId,resolvedIds,contracts,createdAt,metadata");

  const hostRegistry = createExecutionProviderRegistry();
  hostRegistry.register(hostOf("host-one"));
  check("Execution Provider Registry: ten verbs remain", EXECUTION_PROVIDER_CAPABILITIES.join() === "GENERATE,CREATE,UPDATE,DELETE,PAUSE,RESUME,PUBLISH,ARCHIVE,MONITOR,FUTURE");
  const hostResolved = createExecutionProviderResolver({ ...clocks("host"), registry: hostRegistry }).resolve({
    plan: { id: "plan-1" },
    contracts: [contractOf()],
    executionMetadata: { run: "r1" },
  });
  check("Execution Provider Registry: a compatible host resolves without being invoked", hostResolved.status === "OK" && hostResolved.providers.map((item) => item.id).join() === "host-one" && Object.isFrozen(hostResolved.snapshot));
  check("Execution Snapshots: host snapshot keys are unchanged", EXECUTION_PROVIDER_SNAPSHOT_KEYS.join() === "snapshotId,planId,providerIds,contractIds,capabilities,providers,createdAt,metadata");

  const depCalls = { n: 0 };
  const contractCalls = { n: 0 };
  const providerCalls = { n: 0 };
  const dependencyResolver = wrapResolve(createExecutionDependencyResolver(clocks("dep")), depCalls);
  const contractResolver = wrapResolve(createExecutionContractResolver(clocks("con")), contractCalls);
  const providerResolver = wrapResolve(createExecutionProviderResolver(clocks("prov")), providerCalls);
  providerResolver.registry.register(hostOf("host-one"));
  const resolver = createExecutionResolver({ ...clocks("graph"), dependencyResolver, contractResolver, providerResolver });
  const prepared = resolver.resolve(planInput());
  check("Execution Resolver: eight prepare steps remain", EXECUTION_PIPELINE_STEPS.join() === "LOAD_WORKFLOW_SNAPSHOT,LOAD_DECISION_ANALYSIS,RESOLVE_TASKS,RESOLVE_DEPENDENCIES,RESOLVE_CONTRACTS,RESOLVE_PROVIDERS,VALIDATE_PLAN,FREEZE_EXECUTION_GRAPH");
  check("Execution Resolver: a valid plan freezes a graph", prepared.status === "OK" && prepared.graph !== null && Object.isFrozen(prepared.graph) && Object.isFrozen(prepared.snapshot) && prepared.orderedTasks.join() === "alpha,beta");
  check("Execution Snapshots: resolver snapshot keys are unchanged", EXECUTION_RESOLVER_SNAPSHOT_KEYS.join() === "snapshotId,planId,workflowId,decisionId,orderedTasks,contractIds,providerIds,createdAt,metadata");
  check("Execution Graph keys are unchanged", EXECUTION_GRAPH_KEYS.join() === "nodes,edges,contractIds,providerIds");
  check("Tasks execute exactly once", resolver.recorder.count("RESOLVE_TASKS") === 1 && builds === 2);
  check("Dependencies resolved once", depCalls.n === 1 && resolver.recorder.count("RESOLVE_DEPENDENCIES") === 1);
  check("Contracts resolved once", contractCalls.n === 1 && resolver.recorder.count("RESOLVE_CONTRACTS") === 1);
  check("Providers resolved once", providerCalls.n === 1 && resolver.recorder.count("RESOLVE_PROVIDERS") === 1);
  const afterResolve = { dep: depCalls.n, contract: contractCalls.n, provider: providerCalls.n };
  resolver.getSnapshot("graph-1");
  check("Duplicate Execution: reading the snapshot does not resolve again", depCalls.n === afterResolve.dep && contractCalls.n === afterResolve.contract && providerCalls.n === afterResolve.provider && afterResolve.dep === 1);

  const overlap = createExecutionTaskPipeline();
  overlap.register(fakeTask("alpha", { build: () => new Promise((resolve) => setTimeout(() => resolve({ status: "READY", warnings: [], metadata: {}, estimatedDuration: 1 }), 20)) }));
  let overlapRefused = false;
  const first = overlap.collect(ctx);
  try {
    await overlap.collect(ctx);
  } catch (error) {
    overlapRefused = error instanceof ExecutionTaskFrameworkError;
  }
  await first;
  check("Negative: Duplicate Execution: an overlapping collect is refused", overlapRefused);

  check("Negative: Duplicate Task", duplicateTask);
  let duplicateContract = false;
  try {
    contractRegistry.register(contractOf());
  } catch (error) {
    duplicateContract = error instanceof ExecutionContractFrameworkError && has(error.issues, /Duplicate Contract/);
  }
  check("Negative: Duplicate Contract", duplicateContract);
  let duplicateProvider = false;
  try {
    hostRegistry.register(hostOf("host-one"));
  } catch (error) {
    duplicateProvider = error instanceof ExecutionProviderFrameworkError && has(error.issues, /Duplicate Provider/);
  }
  check("Negative: Duplicate Provider", duplicateProvider);
  let duplicateDependency = false;
  try {
    depRegistry.register(depOf("dep-2", "alpha", "beta"));
  } catch (error) {
    duplicateDependency = error instanceof ExecutionDependencyFrameworkError && has(error.issues, /Duplicate Dependency/);
  }
  check("Negative: Duplicate Dependency", duplicateDependency);
  let duplicateCapability = false;
  const caps = createExecutionProviderCapabilityRegistry();
  caps.register({ id: "GENERATE", name: "Generate", metadata: {} });
  try {
    caps.register({ id: "GENERATE", name: "Generate", metadata: {} });
  } catch (error) {
    duplicateCapability = error instanceof ExecutionProviderCapabilityError && has(error.issues, /Duplicate Capability/);
  }
  check("Negative: Duplicate Capability", duplicateCapability);
  check("Negative: Missing Task", has(createExecutionResolverValidator().validateInput({}), /Missing Task/) && resolver.resolve(planInput({ plan: { ...(planInput().plan as object), dependencies: [{ from: "alpha", to: "gamma" }] } })).status === "REJECTED");
  check("Negative: Missing Contract", resolver.resolve(planInput({ contracts: [] })).status === "REJECTED" && has(resolver.resolve(planInput({ contracts: [] })).issues, /Missing Contract/));
  check("Negative: Missing Provider", createExecutionResolver(clocks("miss")).resolve(planInput()).status === "REJECTED");
  check("Negative: Circular Dependency", has(createExecutionResolverValidator().validateGraph(["alpha", "beta"], [{ from: "alpha", to: "beta" }, { from: "beta", to: "alpha" }]), /Circular Dependency/) && has(depValidator.validateGraph(["a", "b"], [depOf("d1", "a", "b"), depOf("d2", "b", "a")]), /Circular dependency/));
  check("Negative: Invalid Metadata", has(createExecutionResolverValidator().validateInput(planInput({ executionMetadata: { a: { b: 1 } } })), /Invalid metadata/) && has(createExecutionContractValidator().validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(createExecutionProviderValidator().validateMetadata({ a: { b: 1 } }), /Invalid metadata/));
  check("Negative: Invalid Execution Graph", has(depValidator.validateDependency(null), /Invalid Graph/) && has(depValidator.validateInput({}), /tasks are required/) && createExecutionDependencyResolver(clocks("bad")).resolve(null).status === "REJECTED");
  check("Negative: Invalid Plan", has(createExecutionPlanValidator().validateInput(null), /Invalid Plan/) && createExecutionPlanBuilder(clocks("bad")).build(null).status === "REJECTED");

  const contextBefore = JSON.stringify(ctx);
  await collecting.collect(ctx);
  createExecutionPlanBuilder(clocks("mut")).build({ decisionAnalysis: { id: "d-1" }, workflowSnapshot: { id: "snap-1" }, results: collected.results, executionMetadata: { run: "r1" } });
  resolver.resolve(planInput());
  check("No mutation: collect, build, and resolve do not change the task context", JSON.stringify(ctx) === contextBefore);
  const snapBefore = JSON.stringify(prepared.snapshot);
  try {
    (prepared.snapshot as { planId: string }).planId = "hacked";
    (prepared.graph!.nodes as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("Snapshots immutable: assignment does not change the frozen graph", JSON.stringify(prepared.snapshot) === snapBefore && prepared.graph!.nodes[0] === "alpha" && prepared.snapshot!.planId === "plan-1");

  const left = createExecutionResolver({ ...clocks("graph"), providerResolver: createExecutionProviderResolver(clocks("p1")) });
  const right = createExecutionResolver({ ...clocks("graph"), providerResolver: createExecutionProviderResolver(clocks("p2")) });
  left.pipeline.providerResolver.registry.register(hostOf("host-one"));
  right.pipeline.providerResolver.registry.register(hostOf("host-one"));
  right.pipeline.providerResolver.registry.register(hostOf("host-two", { capabilities: ["CREATE"] }));
  left.resolve(planInput());
  right.resolve(planInput());
  check("Independent execution: resolvers do not share snapshots", left.getSnapshot("graph-1")?.providerIds.join() === "host-one" && right.getSnapshot("graph-1")?.providerIds.join() === "host-one,host-two");

  const registerTimed = timed(() => {
    const fresh = createExecutionTaskPipeline();
    fresh.register(fakeTask("alpha"));
    fresh.register(fakeTask("beta", { requires: ["alpha"] }));
    return fresh.registry.count();
  });
  const planTimed = timed(() =>
    createExecutionPlanBuilder(clocks("perf-plan")).build({
      decisionAnalysis: { id: "d-1" },
      workflowSnapshot: { id: "snap-1" },
      results: [resultOf("alpha"), resultOf("beta", { requires: ["alpha"], executionOrder: 1 })],
      executionMetadata: { run: "r1" },
    }),
  );
  const depTimed = timed(() =>
    createExecutionDependencyResolver(clocks("perf-dep")).resolve({
      tasks: [taskOf("alpha"), taskOf("beta")],
      dependencies: [depOf("dep-1", "alpha", "beta")],
      executionMetadata: { run: "r1" },
    }),
  );
  const contractTimed = timed(() =>
    createExecutionContractResolver(clocks("perf-con")).resolve({
      plan: { id: "plan-1", tasks: [taskOf("alpha")] },
      contracts: [contractOf()],
      configuration: { mode: "m1" },
      executionMetadata: { run: "r1" },
    }),
  );
  const providerTimed = timed(() => {
    const inner = createExecutionProviderResolver(clocks("perf-host"));
    inner.registry.register(hostOf("host-one"));
    return inner.resolve({ plan: { id: "plan-1" }, contracts: [contractOf()], executionMetadata: { run: "r1" } });
  });
  const resolverTimed = timed(() => {
    const inner = createExecutionProviderResolver(clocks("perf-res-host"));
    inner.registry.register(hostOf("host-one"));
    return createExecutionResolver({ ...clocks("perf-res"), providerResolver: inner }).resolve(planInput());
  });
  const snapshotTimed = timed(() =>
    createExecutionResolverSnapshot({
      snapshotId: "graph-perf",
      planId: "plan-1",
      workflowId: "snap-1",
      decisionId: "d-1",
      orderedTasks: ["alpha", "beta"],
      contractIds: ["page-one"],
      providerIds: ["host-one"],
      createdAt: T0,
      metadata: { run: "r1" },
    }),
  );
  const collectTimed = await timedAsync(() => createExecutionTaskPipeline().collect(ctx));
  const planSnapTimed = timed(() =>
    createExecutionPlanSnapshot({
      planId: "plan-1",
      workflowId: "snap-1",
      decisionId: "d-1",
      orderedTasks: ["alpha"],
      dependencies: [],
      createdAt: T0,
      metadata: {},
    }),
  );
  const depSnapTimed = timed(() =>
    createExecutionDependencySnapshot({
      graphId: "graph-1",
      planId: "plan-1",
      workflowId: "snap-1",
      decisionId: "d-1",
      ready: ["alpha"],
      blocked: [],
      waiting: [],
      graph: createExecutionDependencyGraph(["alpha"], []),
      createdAt: T0,
      metadata: {},
    }),
  );
  const contractSnapTimed = timed(() =>
    createExecutionContractSnapshot({
      snapshotId: "snapshot-1",
      planId: "plan-1",
      workflowId: "snap-1",
      decisionId: "d-1",
      resolvedIds: ["page-one"],
      contracts: [contractOf()],
      createdAt: T0,
      metadata: {},
    }),
  );
  const hostSnapTimed = timed(() =>
    createExecutionProviderSnapshot({
      snapshotId: "snapshot-1",
      planId: "plan-1",
      providerIds: ["host-one"],
      contractIds: ["page-one"],
      capabilities: ["GENERATE"],
      providers: [{ id: "host-one", name: "host-one", version: "1.0.0", supportedContracts: ["page-one"], capabilities: ["GENERATE"], enabled: true, metadata: {} }],
      createdAt: T0,
      metadata: {},
    }),
  );
  void collectTimed;
  void planSnapTimed;
  void depSnapTimed;
  void contractSnapTimed;
  void hostSnapTimed;
  const perfRows: Array<[string, number, boolean]> = [
    ["Task Registration", registerTimed.ms, registerTimed.value === 2],
    ["Plan Generation", planTimed.ms, planTimed.value.status === "OK"],
    ["Dependency Resolution", depTimed.ms, depTimed.value.status === "OK"],
    ["Contract Resolution", contractTimed.ms, contractTimed.value.status === "OK"],
    ["Provider Resolution", providerTimed.ms, providerTimed.value.status === "OK"],
    ["Execution Resolver", resolverTimed.ms, resolverTimed.value.status === "OK"],
    ["Snapshot Creation", snapshotTimed.ms, snapshotTimed.value.snapshotId === "graph-perf"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check(`${name} completes in under 2000ms`, ok && ms < 2000);
  }

  const files = walk(dir).filter((f) => f.endsWith(".ts"));
  const joined = files.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("No Product Names in the Execution planner", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("No Campaign IDs in the Execution planner", !bare.some((l) => /campaignId|campaigns\b|lp_page_versions/.test(l)));
  check("No Google Ads logic (API, bids, keywords, adwords)", !bare.some((l) => /googleads|adwords|\bcpc\b|\bcpa\b|\bbid\b|keyword planner|ads api/i.test(l)));
  check("No LP logic", !bare.some((l) => /lp-builder|cloaking|composePresell|presell-page/.test(l)));
  check("No business-specific rules (score, rank, weight, formula, recommend)", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("No Hidden Switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("No ProductFacts import or mutation", !joined.includes("product-facts") && !bare.some((l) => /ProductFacts|productFacts/.test(l)));
  const valueImports = [...joined.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  check("No Discovery, Opportunity, Traffic, Decision, or Workflow value imports", !valueImports.some((from) => /discovery|opportunity|traffic|decision|workflow/.test(from)));
  check("No Discovery, Opportunity, Traffic, Decision, or Workflow mutation", !bare.some((l) => /\.(candidate|opportunityAnalysis|trafficAnalysis|decisionAnalysis|workflowSnapshot)\s*=(?!=)/.test(l)));
  check("No LP Builder, Platform, HTTP, database, or file writes in the Execution planner", !code.some((l) => /fetch\(|node:http|better-sqlite3|getDb|writeFile|appendFile|node:fs/.test(l)) && !valueImports.some((from) => /lp-builder|platform/.test(from)));
  check("Backward compatibility: architecture remains six contract modules", architecture.every((f) => readdirSync(dir).includes(f)));
  check("Backward compatibility: task framework remains seven modules", readdirSync(dir).filter((f) => /^execution-task-[a-z]+\.ts$/.test(f)).length === 7);
  check("Backward compatibility: plan builder remains five modules", readdirSync(dir).filter((f) => /^execution-plan-[a-z]+\.ts$/.test(f)).length === 5);
  check("Backward compatibility: dependency resolver remains five modules", readdirSync(dir).filter((f) => /^execution-dependency-[a-z]+\.ts$/.test(f)).length === 5);
  check("Backward compatibility: contracts remain five modules", readdirSync(dir).filter((f) => /^execution-contract(-[a-z]+)?\.ts$/.test(f)).length === 5);
  check("Backward compatibility: provider framework remains six modules", readdirSync(dir).filter((f) => /^execution-provider(-[a-z]+)?\.ts$/.test(f)).length === 6);
  check("Backward compatibility: architecture Planner stays a contract", !/export\s+(async\s+)?function|export\s+class|createExecutionPlanner/.test(readFileSync(join(dir, "execution-planner.ts"), "utf8")));
  check("Backward compatibility: architecture Registry stays a contract", !/export\s+(async\s+)?function|export\s+class|createExecutionRegistry/.test(readFileSync(join(dir, "execution-registry.ts"), "utf8")));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("No Discovery, Opportunity, Traffic, LP Builder, Platform, Decision, or Workflow module imports the execution planner", !others.some((f) => /from ["'][^"']*execution/.test(readFileSync(f, "utf8"))));

  const dbDir = join(process.cwd(), "data");
  const dbFiles = readdirSync(dbDir).filter((n) => n.startsWith("presell-os.db"));
  for (const name of dbFiles) {
    const info = statSync(join(dbDir, name));
    console.log(`DB: ${name} ${info.size} ${info.mtime.toISOString()}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution Planner RC1 acceptance: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
