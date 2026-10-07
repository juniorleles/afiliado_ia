import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createExecutionPlanBuilder } from "../src/lib/execution/execution-plan-builder.ts";
import {
  EXECUTION_DEPENDENCY_GRAPH_KEYS,
  EXECUTION_DEPENDENCY_KINDS,
  EXECUTION_TASK_ELIGIBILITIES,
  EXECUTION_TYPED_DEPENDENCY_KEYS,
  createExecutionDependencyGraph,
  freezeDeepExecutionDependency,
  type ExecutionTypedDependency,
} from "../src/lib/execution/execution-dependency-graph.ts";
import { ExecutionDependencyFrameworkError, createExecutionDependencyRegistry } from "../src/lib/execution/execution-dependency-registry.ts";
import { EXECUTION_DEPENDENCY_RESOLVE_STATUSES, createExecutionDependencyResolver } from "../src/lib/execution/execution-dependency-resolver.ts";
import { EXECUTION_DEPENDENCY_SNAPSHOT_KEYS, createExecutionDependencySnapshot } from "../src/lib/execution/execution-dependency-snapshot.ts";
import { createExecutionDependencyValidator } from "../src/lib/execution/execution-dependency-validator.ts";
import type { ExecutionTask } from "../src/lib/execution/execution-types.ts";
import type { ExecutionTaskResult } from "../src/lib/execution/execution-task-contract.ts";

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
    return error instanceof ExecutionDependencyFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};

function taskOf(id: string): ExecutionTask {
  return { id, name: id, steps: [], metadata: {} };
}

function depOf(id: string, from: string, to: string, kind: ExecutionTypedDependency["kind"], metadata: ExecutionTypedDependency["metadata"] = {}): ExecutionTypedDependency {
  return { id, from, to, kind, metadata };
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

function resolverOf() {
  let n = 0;
  return createExecutionDependencyResolver({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `graph-${++n}`,
  });
}

function inputOf(tasks: ExecutionTask[], dependencies: ExecutionTypedDependency[] = [], over: Record<string, unknown> = {}) {
  return {
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    tasks,
    dependencies,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

async function main() {
  const validator = createExecutionDependencyValidator();
  check("five dependency kinds, in the requested order", EXECUTION_DEPENDENCY_KINDS.join() === "REQUIRED,OPTIONAL,BLOCKING,CONFLICTING,FUTURE");
  check("three eligibilities, in the requested order", EXECUTION_TASK_ELIGIBILITIES.join() === "READY,BLOCKED,WAITING");
  check("resolve statuses are OK then REJECTED", EXECUTION_DEPENDENCY_RESOLVE_STATUSES.join() === "OK,REJECTED");
  check("a typed dependency has exactly the requested fields", EXECUTION_TYPED_DEPENDENCY_KEYS.join() === "id,from,to,kind,metadata" && Object.keys(depOf("dep-1", "a", "b", "REQUIRED")).join() === EXECUTION_TYPED_DEPENDENCY_KEYS.join());
  check("a graph has exactly nodes and edges", EXECUTION_DEPENDENCY_GRAPH_KEYS.join() === "nodes,edges");
  check("snapshot keys are in the requested order", EXECUTION_DEPENDENCY_SNAPSHOT_KEYS.join() === "graphId,planId,workflowId,decisionId,ready,blocked,waiting,graph,createdAt,metadata");

  check("a valid required wait is accepted", validator.validateDependency(depOf("dep-1", "alpha", "beta", "REQUIRED")).length === 0);
  check("Invalid Graph: a non-object dependency is rejected", has(validator.validateDependency(null), /Invalid Graph/));
  check("Invalid Graph: an unknown kind is rejected", has(validator.validateDependency(depOf("dep-1", "alpha", "beta", "NOPE" as never)), /kind/));
  check("Invalid Graph: a task cannot wait on itself", has(validator.validateDependency(depOf("dep-1", "alpha", "alpha", "REQUIRED")), /wait on itself/));
  check("Invalid Metadata: nested dependency metadata is rejected", has(validator.validateDependency(depOf("dep-1", "alpha", "beta", "REQUIRED", { a: { b: 1 } } as never)), /Invalid metadata/));
  check("Duplicate Dependency: the same from-to-kind pair is rejected", has(validator.validateGraph(["alpha", "beta"], [depOf("d1", "alpha", "beta", "REQUIRED"), depOf("d2", "alpha", "beta", "REQUIRED")]), /Duplicate Dependency/));
  check("Missing Dependency: a required from or to that names no task is rejected", has(validator.validateGraph(["alpha"], [depOf("d1", "alpha", "beta", "REQUIRED")]), /Missing Dependency/));
  check("an optional wait whose from is absent is accepted", validator.validateGraph(["beta"], [depOf("d1", "alpha", "beta", "OPTIONAL")]).length === 0);
  const cyclic = validator.validateGraph(["a", "b"], [depOf("d1", "a", "b", "REQUIRED"), depOf("d2", "b", "a", "REQUIRED")]);
  check("Circular Dependencies are rejected", has(cyclic, /Circular dependency/) && has(cyclic, /a -> b -> a/));
  check("Invalid Graph: tasks are required", has(validator.validateInput({}), /tasks are required/));
  check("Invalid Metadata: nested context metadata is rejected", has(validator.validateInput(inputOf([taskOf("alpha")], [], { executionMetadata: { a: { b: 1 } } })), /Invalid metadata/));

  const registry = createExecutionDependencyRegistry();
  const stored = registry.register(depOf("dep-1", "alpha", "beta", "REQUIRED", { note: "x" }));
  check("the registry registers, gets, and lists dependencies", stored.id === "dep-1" && registry.get("dep-1")?.to === "beta" && registry.getByKey("alpha", "beta", "REQUIRED")?.id === "dep-1" && registry.list().length === 1);
  check("Duplicate Dependency: a second registration is rejected", throwsFramework(() => registry.register(depOf("dep-1", "alpha", "gamma", "OPTIONAL")), /Duplicate Dependency/) && registry.count() === 1);
  check("Duplicate Dependency: a second from-to-kind pair is rejected", throwsFramework(() => registry.register(depOf("dep-2", "alpha", "beta", "REQUIRED")), /Duplicate Dependency/));
  check("an invalid record is not registered", throwsFramework(() => registry.register(depOf("Bad", "alpha", "beta", "REQUIRED") as never), /Invalid Graph/) && registry.count() === 1);
  registry.register(depOf("dep-2", "alpha", "gamma", "OPTIONAL"));
  check("list filters by kind", registry.list({ kind: "OPTIONAL" }).map((item) => item.id).join() === "dep-2");
  check("validate reports without registering", registry.validate({}).length > 0 && registry.get("dep-3") === null);
  check("remove forgets a dependency", registry.remove("dep-2").id === "dep-2" && registry.get("dep-2") === null && registry.count() === 1);
  check("remove of an unknown dependency is rejected", throwsFramework(() => registry.remove("dep-2")));

  const frozenGraph = createExecutionDependencyGraph(["alpha", "beta"], [depOf("dep-1", "alpha", "beta", "REQUIRED")]);
  check("a graph is frozen", Object.isFrozen(frozenGraph) && Object.isFrozen(frozenGraph.nodes) && Object.isFrozen(frozenGraph.edges[0]));
  const snap = createExecutionDependencySnapshot({
    graphId: "graph-1",
    planId: "plan-1",
    workflowId: "snap-1",
    decisionId: "d-1",
    ready: ["alpha"],
    blocked: [],
    waiting: ["beta"],
    graph: frozenGraph,
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === EXECUTION_DEPENDENCY_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.ready) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable graph snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepExecutionDependency never throws", freezeDeepExecutionDependency(1) === 1 && Object.isFrozen(freezeDeepExecutionDependency({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const resolver = resolverOf();
  const plain = resolver.resolve(inputOf([taskOf("alpha"), taskOf("beta")], [depOf("dep-1", "alpha", "beta", "REQUIRED")]));
  check("required waits that are present make every task READY", plain.status === "OK" && plain.ready.join() === "alpha,beta" && plain.blocked.length === 0 && plain.waiting.length === 0 && plain.executionTime === 0);
  check("the resolved graph carries typed edges and does not run work", plain.graph !== null && plain.graph.nodes.join() === "alpha,beta" && plain.graph.edges[0]?.kind === "REQUIRED" && !("http" in plain));

  const blocked = resolverOf().resolve(inputOf([taskOf("a"), taskOf("b"), taskOf("c")], [depOf("d1", "a", "b", "BLOCKING"), depOf("d2", "b", "c", "REQUIRED")]));
  check("Resolve Blocking Tasks: a blocking wait marks the target BLOCKED", blocked.blocked.join() === "b" && blocked.ready.join() === "a");
  check("Resolve Waiting Tasks: a required predecessor that is not READY leaves the dependent WAITING", blocked.waiting.join() === "c");

  const conflict = resolverOf().resolve(inputOf([taskOf("a"), taskOf("b")], [depOf("d1", "a", "b", "CONFLICTING")]));
  check("a conflicting pair keeps the earlier plan task READY and marks the later BLOCKED", conflict.ready.join() === "a" && conflict.blocked.join() === "b");

  const optionalMissing = resolverOf().resolve(inputOf([taskOf("beta")], [depOf("d1", "alpha", "beta", "OPTIONAL")]));
  check("an optional wait whose from is absent does not block", optionalMissing.status === "OK" && optionalMissing.ready.join() === "beta");
  const optionalBlocked = resolverOf().resolve(inputOf([taskOf("x"), taskOf("a"), taskOf("b")], [depOf("d1", "a", "b", "OPTIONAL"), depOf("d2", "x", "a", "BLOCKING")]));
  check("an optional wait whose from is not READY leaves the dependent WAITING", optionalBlocked.status === "OK" && optionalBlocked.waiting.includes("b") && optionalBlocked.blocked.includes("a"));

  const future = resolverOf().resolve(inputOf([taskOf("a"), taskOf("b")], [depOf("d1", "a", "b", "FUTURE")]));
  check("a FUTURE wait is stored and does not change eligibility", future.status === "OK" && future.ready.join() === "a,b" && future.graph!.edges[0]?.kind === "FUTURE");

  const fromPlan = resolverOf().resolve({
    plan: { id: "plan-1", tasks: [taskOf("a"), taskOf("b")], dependencies: [{ from: "a", to: "b" }] },
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
  });
  check("an architecture plan's from-to waits become REQUIRED", fromPlan.status === "OK" && fromPlan.graph!.edges[0]?.kind === "REQUIRED" && fromPlan.snapshot!.planId === "plan-1" && fromPlan.ready.join() === "a,b");

  check("getSnapshot returns the stored snapshot", resolver.getSnapshot("graph-1") === plain.snapshot && resolver.getSnapshot("nope") === null);
  check("the graph and snapshot are frozen", Object.isFrozen(plain.graph) && Object.isFrozen(plain.snapshot) && Object.isFrozen(plain.ready));
  check("validate agrees with a successful resolve", resolver.validate(inputOf([taskOf("alpha")])).length === 0);

  check("Circular Dependencies are refused", resolverOf().resolve(inputOf([taskOf("a"), taskOf("b")], [depOf("d1", "a", "b", "REQUIRED"), depOf("d2", "b", "a", "REQUIRED")])).status === "REJECTED" && has(resolverOf().resolve(inputOf([taskOf("a"), taskOf("b")], [depOf("d1", "a", "b", "REQUIRED"), depOf("d2", "b", "a", "REQUIRED")])).issues, /Circular dependency/));
  check("Missing Dependency is refused", resolverOf().resolve(inputOf([taskOf("a")], [depOf("d1", "a", "b", "REQUIRED")])).status === "REJECTED");
  check("Duplicate Dependency is refused", resolverOf().resolve(inputOf([taskOf("a"), taskOf("b")], [depOf("d1", "a", "b", "REQUIRED"), depOf("d2", "a", "b", "REQUIRED")])).status === "REJECTED");
  check("Invalid Metadata is refused", resolverOf().resolve(inputOf([taskOf("a")], [], { executionMetadata: { a: { b: 1 } } })).status === "REJECTED");
  check("Invalid Graph: a missing input is refused", resolverOf().resolve(null).status === "REJECTED" && resolverOf().resolve(null).graph === null);
  check("a refused resolve stores no snapshot", resolverOf().getSnapshot("graph-1") === null);

  const sourceTasks = [taskOf("alpha"), taskOf("beta")];
  const sourceInput = inputOf(sourceTasks, [depOf("dep-1", "alpha", "beta", "REQUIRED")]);
  const once = resolverOf().resolve(sourceInput);
  sourceTasks[0].id = "changed";
  (sourceInput.executionMetadata as { run: string }).run = "changed";
  check("No mutation: changing the input after a resolve leaves the graph unchanged", once.graph!.nodes[0] === "alpha" && once.metadata.run === "r1");
  try {
    (once.graph!.nodes as string[])[0] = "hacked";
    (once.ready as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the resolved graph cannot be assigned into", once.graph!.nodes[0] === "alpha" && once.ready[0] === "alpha");

  const deterministic = () =>
    createExecutionDependencyResolver({
      now: () => 0,
      timestamp: () => "2026-01-01T00:00:00.000Z",
      idFactory: () => "graph-fixed",
    });
  const first = deterministic().resolve(inputOf([taskOf("b"), taskOf("a")], [depOf("d1", "a", "b", "REQUIRED")]));
  const second = deterministic().resolve(inputOf([taskOf("a"), taskOf("b")], [depOf("d1", "a", "b", "REQUIRED")]));
  check("Deterministic dependency resolution: eligibility does not depend on a clock", first.status === "OK" && [...first.ready].sort().join() === [...second.ready].sort().join() && JSON.stringify(first.graph!.edges) === JSON.stringify(second.graph!.edges));
  check("Deterministic dependency resolution: node order follows the given task list", first.graph!.nodes.join() === "b,a" && second.graph!.nodes.join() === "a,b");

  const left = resolverOf();
  const right = resolverOf();
  left.resolve(inputOf([taskOf("alpha")]));
  right.resolve(inputOf([taskOf("alpha"), taskOf("beta")]));
  check("Independent resolvers do not share snapshots", left.getSnapshot("graph-1")?.graph.nodes.join() === "alpha" && right.getSnapshot("graph-1")?.graph.nodes.join() === "alpha,beta" && left.getSnapshot("graph-2") === null);

  const built = createExecutionPlanBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "plan-1",
  }).build({
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    results: [resultOf("alpha", { executionOrder: 0 }), resultOf("beta", { requires: ["alpha"], executionOrder: 1 })],
    executionMetadata: { run: "r1" },
  });
  const fromBuilder = resolverOf().resolve({
    plan: built.plan!,
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
  });
  check("a built plan resolves without running work", built.status === "OK" && fromBuilder.status === "OK" && fromBuilder.ready.join() === "alpha,beta" && fromBuilder.snapshot!.planId === "plan-1");

  const dir = join(process.cwd(), "src/lib/execution");
  const files = readdirSync(dir).filter((f) => /^execution-dependency-[a-z]+\.ts$/.test(f));
  check("five resolver modules exist: graph, registry, resolver, snapshot, validator", files.sort().join() === "execution-dependency-graph.ts,execution-dependency-registry.ts,execution-dependency-resolver.ts,execution-dependency-snapshot.ts,execution-dependency-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, or campaign logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|campaign|adwords|\bbid\b|budget/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the execution folder", imports.every((i) => /^\.\/execution-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the resolver never calls the task pipeline, plan builder, or a provider", !code.some((l) => /createExecutionTaskPipeline|createExecutionPlanBuilder|\.collect\(|\.build\(|provider/i.test(l)));
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the resolver", architecture.every((src) => !/execution-dependency-/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^(execution-task-|execution-plan-)/.test(f));
  check("the task framework and plan builder do not import the dependency resolver", prior.every((f) => !/execution-dependency-/.test(readFileSync(join(dir, f), "utf8"))));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, Decision, or Workflow module imports the dependency resolver", !others.some((f) => /execution-dependency-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution dependency resolver: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
