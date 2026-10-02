import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EXECUTION_PLAN_KEYS } from "../src/lib/execution/execution-plan.ts";
import { EXECUTION_PLAN_BUILD_STATUSES, createExecutionPlanBuilder } from "../src/lib/execution/execution-plan-builder.ts";
import { createExecutionPlanResolver } from "../src/lib/execution/execution-plan-resolver.ts";
import {
  BUILT_EXECUTION_PLAN_KEYS,
  EXECUTION_PLAN_SNAPSHOT_KEYS,
  createExecutionPlanSnapshot,
  freezeDeepExecutionPlan,
} from "../src/lib/execution/execution-plan-snapshot.ts";
import { computeExecutionPlanStatistics } from "../src/lib/execution/execution-plan-statistics.ts";
import { createExecutionPlanValidator } from "../src/lib/execution/execution-plan-validator.ts";
import type { ExecutionTaskResult } from "../src/lib/execution/execution-task-contract.ts";
import type { ExecutionTaskModule } from "../src/lib/execution/execution-task-contract.ts";
import { createExecutionTaskPipeline } from "../src/lib/execution/execution-task-pipeline.ts";
import { createExecutionTaskContext } from "../src/lib/execution/execution-task-context.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

interface ResultOpts {
  status?: ExecutionTaskResult["status"];
  warnings?: string[];
  metadata?: ExecutionTaskResult["metadata"];
  estimatedDuration?: number | null;
  requires?: string[];
  optional?: string[];
  conflicts?: string[];
  executionOrder?: number;
}

function resultOf(id: string, over: ResultOpts = {}): ExecutionTaskResult {
  return {
    taskId: id,
    status: over.status ?? "READY",
    warnings: over.warnings ?? [],
    metadata: over.metadata ?? {},
    estimatedDuration: over.estimatedDuration === undefined ? 10 : over.estimatedDuration,
    dependencies: { requires: over.requires ?? [], optional: over.optional ?? [], conflicts: over.conflicts ?? [] },
    executionOrder: over.executionOrder ?? 0,
  };
}

function inputOf(results: ExecutionTaskResult[], over: Record<string, unknown> = {}) {
  return {
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    results,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

function builderOf() {
  let n = 0;
  return createExecutionPlanBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `plan-${++n}`,
  });
}

async function main() {
  const validator = createExecutionPlanValidator();
  const resolver = createExecutionPlanResolver();
  check("build statuses are OK then REJECTED", EXECUTION_PLAN_BUILD_STATUSES.join() === "OK,REJECTED");
  check("snapshot keys are in the requested order", EXECUTION_PLAN_SNAPSHOT_KEYS.join() === "planId,workflowId,decisionId,orderedTasks,dependencies,createdAt,metadata");
  check("built plan keys include the architecture fields plus stages and postconditions", BUILT_EXECUTION_PLAN_KEYS.join() === "id,decisionAnalysisId,workflowSnapshotId,tasks,dependencies,preconditions,postconditions,stages,metadata,executionTime,createdAt");
  check("architecture plan keys are a subset of the built plan", EXECUTION_PLAN_KEYS.every((key) => (BUILT_EXECUTION_PLAN_KEYS as readonly string[]).includes(key)));

  check("valid results accepted", validator.validateResults([resultOf("alpha"), resultOf("beta")]).length === 0);
  check("Invalid Plan: missing results rejected", has(validator.validateInput({}), /results are required/));
  check("Invalid Plan: a non-object is rejected", has(validator.validateInput(null), /Invalid Plan/));
  check("Duplicate Task: a second result id is rejected", has(validator.validateResults([resultOf("alpha"), resultOf("alpha")]), /Duplicate Task/));
  check("Invalid Metadata: nested result metadata is rejected", has(validator.validateResults([resultOf("alpha", { metadata: { a: { b: 1 } } as never })]), /Invalid metadata/));
  check("Invalid Metadata: nested context metadata is rejected", has(validator.validateInput(inputOf([resultOf("alpha")], { executionMetadata: { a: { b: 1 } } })), /Invalid metadata/));
  check("Invalid Plan: a well-formed task id is required", has(validator.validateResults([resultOf("Alpha")]), /task id/));
  check("preconditions with nested metadata are rejected", has(validator.validatePreconditions([{ id: "pre-1", metadata: { a: { b: 1 } } }]), /Invalid metadata/));
  check("postconditions with a missing id are rejected", has(validator.validatePostconditions([{ metadata: {} }]), /Invalid Plan/));
  check("a valid empty gate list is accepted", validator.validatePreconditions([]).length === 0 && validator.validatePostconditions([]).length === 0);

  const missing = resolver.resolveOrder([resultOf("alpha", { requires: ["zz"] })]);
  check("Missing Dependency is rejected by the resolver", missing.order.length === 0 && has(missing.issues, /Missing Dependency/));
  const cyclic = resolver.resolveOrder([resultOf("a", { requires: ["b"], executionOrder: 0 }), resultOf("b", { requires: ["a"], executionOrder: 1 })]);
  check("Circular Dependencies are rejected by the resolver", cyclic.order.length === 0 && has(cyclic.issues, /Circular dependency/));
  check("a two-task cycle names its path", has(cyclic.issues, /a -> b -> a/));
  const ordered = resolver.resolveOrder([
    resultOf("c", { requires: ["b"], executionOrder: 2 }),
    resultOf("b", { requires: ["a"], executionOrder: 1 }),
    resultOf("a", { executionOrder: 0 }),
  ]);
  check("Dependency Resolution lists required tasks first", ordered.order.join() === "a,b,c" && ordered.issues.length === 0);
  check("Execution Ordering among free tasks follows collect position then id", resolver.resolveOrder([resultOf("m", { executionOrder: 5 }), resultOf("k", { executionOrder: 5 }), resultOf("z", { executionOrder: 1 })]).order.join() === "z,k,m");
  check("a present optional dependency is listed first", resolver.resolveOrder([resultOf("a", { optional: ["b"], executionOrder: 9 }), resultOf("b", { executionOrder: 1 })]).order.join() === "b,a");
  check("Conflict Detection names two READY tasks that conflict", has(resolver.detectConflicts([resultOf("a", { conflicts: ["b"] }), resultOf("b")]), /conflicts with/));
  check("a conflict with a SKIPPED task is fine", resolver.detectConflicts([resultOf("a", { conflicts: ["b"] }), resultOf("b", { status: "SKIPPED", warnings: ["s"] })]).length === 0);
  check("an empty result list has an empty order", resolver.resolveOrder([]).order.length === 0);

  const snap = createExecutionPlanSnapshot({
    planId: "plan-1",
    workflowId: "snap-1",
    decisionId: "d-1",
    orderedTasks: ["alpha"],
    dependencies: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === EXECUTION_PLAN_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.orderedTasks) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepExecutionPlan never throws", freezeDeepExecutionPlan(1) === 1 && Object.isFrozen(freezeDeepExecutionPlan({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const stats = computeExecutionPlanStatistics(
    [resultOf("a"), resultOf("b", { status: "BLOCKED", warnings: ["x"], estimatedDuration: null }), resultOf("c", { status: "SKIPPED", warnings: ["s"] }), resultOf("d", { status: "FAILED", warnings: ["f"] })],
    { dependencyCount: 2, stageCount: 1, preconditionCount: 1, postconditionCount: 1, conflictCount: 0 },
  );
  check("Execution Statistics count each status and named duration", stats.total === 4 && stats.ready === 1 && stats.blocked === 1 && stats.skipped === 1 && stats.failed === 1 && stats.estimatedDuration === 10 && stats.dependencyCount === 2);

  const builder = builderOf();
  const built = builder.build(
    inputOf([resultOf("prep", { metadata: { category: "PREPARATION" }, executionOrder: 0 }), resultOf("review", { requires: ["prep"], metadata: { category: "REVIEW" }, executionOrder: 1 })], {
      preconditions: [{ id: "pre-1", metadata: { gate: "open" } }],
      postconditions: [{ id: "post-1", metadata: { gate: "closed" } }],
      tasks: [
        { id: "prep", name: "Prepare", category: "PREPARATION", steps: [{ id: "s1", name: "one", metadata: {} }] },
        { id: "review", name: "Review", category: "REVIEW" },
      ],
    }),
  );
  check("the builder returns OK with a plan, snapshot, statistics, and summary", built.status === "OK" && built.plan !== null && built.snapshot !== null && built.statistics !== null && built.summary !== null && built.issues.length === 0);
  check("the plan carries ordered tasks, stages, dependencies, preconditions, postconditions, and metadata", built.plan!.tasks.map((t) => t.id).join() === "prep,review" && built.plan!.stages.map((s) => s.category).join() === "PREPARATION,REVIEW" && built.plan!.dependencies[0]?.from === "prep" && built.plan!.preconditions[0]?.id === "pre-1" && built.plan!.postconditions[0]?.id === "post-1" && built.plan!.metadata.run === "r1");
  check("the plan keeps architecture fields", built.plan!.id === "plan-1" && built.plan!.decisionAnalysisId === "d-1" && built.plan!.workflowSnapshotId === "snap-1" && built.plan!.executionTime === 0 && built.plan!.createdAt === "2026-01-01T00:00:00.000Z");
  check("task specs supply names and steps without running work", built.plan!.tasks[0]?.name === "Prepare" && built.plan!.tasks[0]?.steps[0]?.id === "s1");
  check("the snapshot stores plan, workflow, and decision ids with ordered tasks", built.snapshot!.planId === "plan-1" && built.snapshot!.workflowId === "snap-1" && built.snapshot!.decisionId === "d-1" && built.snapshot!.orderedTasks.join() === "prep,review");
  check("Plan Summary counts tasks, ready tasks, stages, and dependencies", built.summary!.taskCount === 2 && built.summary!.readyCount === 2 && built.summary!.stageCount === 2 && built.summary!.dependencyCount === 1);
  check("getSnapshot returns the stored snapshot", builder.getSnapshot("plan-1") === built.snapshot && builder.getSnapshot("nope") === null);
  check("the plan and snapshot are frozen", Object.isFrozen(built.plan) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.plan!.tasks) && Object.isFrozen(built.statistics) && Object.isFrozen(built.summary));
  check("validate agrees with a successful build", builder.validate(inputOf([resultOf("alpha")])).length === 0);

  const empty = builderOf().build(inputOf([]));
  check("an empty result list builds an empty plan", empty.status === "OK" && empty.plan!.tasks.length === 0 && empty.statistics!.total === 0);

  check("Duplicate Task is refused and builds nothing", builderOf().build(inputOf([resultOf("alpha"), resultOf("alpha")])).status === "REJECTED" && has(builderOf().build(inputOf([resultOf("alpha"), resultOf("alpha")])).issues, /Duplicate Task/));
  check("Circular Dependencies are refused", builderOf().build(inputOf([resultOf("a", { requires: ["b"] }), resultOf("b", { requires: ["a"] })])).status === "REJECTED" && has(builderOf().build(inputOf([resultOf("a", { requires: ["b"] }), resultOf("b", { requires: ["a"] })])).issues, /Circular dependency/));
  check("Missing Dependency is refused", builderOf().build(inputOf([resultOf("a", { requires: ["zz"] })])).status === "REJECTED" && has(builderOf().build(inputOf([resultOf("a", { requires: ["zz"] })])).issues, /Missing Dependency/));
  check("Invalid Metadata is refused", builderOf().build(inputOf([resultOf("a")], { executionMetadata: { a: { b: 1 } } })).status === "REJECTED");
  check("Invalid Plan: a missing input is refused", builderOf().build(null).status === "REJECTED" && builderOf().build(null).plan === null);
  check("Conflict Detection refuses two READY tasks that conflict", builderOf().build(inputOf([resultOf("a", { conflicts: ["b"] }), resultOf("b")])).status === "REJECTED");
  check("a refused build stores no snapshot", builderOf().getSnapshot("plan-1") === null);

  const sourceResults = [resultOf("alpha", { metadata: { note: "x" } })];
  const sourceInput = inputOf(sourceResults);
  const once = builderOf().build(sourceInput);
  sourceResults[0].metadata.note = "changed";
  (sourceInput.executionMetadata as { run: string }).run = "changed";
  check("No mutation: changing the input after a build leaves the plan unchanged", once.plan!.tasks[0]?.metadata.note === "x" && once.plan!.metadata.run === "r1");
  try {
    once.plan!.tasks[0].name = "hacked";
    once.snapshot!.orderedTasks = ["hacked"] as never;
  } catch {
    /* frozen */
  }
  check("No mutation: the built plan and snapshot cannot be assigned into", once.plan!.tasks[0]?.name === "alpha" && once.snapshot!.orderedTasks[0] === "alpha");

  const stamp = { n: 0 };
  const deterministic = () =>
    createExecutionPlanBuilder({
      now: () => 0,
      timestamp: () => "2026-01-01T00:00:00.000Z",
      idFactory: () => "plan-fixed",
    });
  const first = deterministic().build(inputOf([resultOf("b", { requires: ["a"], executionOrder: 1 }), resultOf("a", { executionOrder: 0 })]));
  const second = deterministic().build(inputOf([resultOf("a", { executionOrder: 0 }), resultOf("b", { requires: ["a"], executionOrder: 1 })]));
  check("Deterministic plan generation: the same results yield the same plan and snapshot", first.status === "OK" && JSON.stringify(first.plan) === JSON.stringify(second.plan) && JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot));
  check("Deterministic plan generation: result list order does not change the assembled order", first.plan!.tasks.map((t) => t.id).join() === "a,b");
  void stamp;

  const left = builderOf();
  const right = builderOf();
  left.build(inputOf([resultOf("alpha")]));
  right.build(inputOf([resultOf("alpha"), resultOf("beta")]));
  check("Independent builders do not share snapshots", left.getSnapshot("plan-1")?.orderedTasks.join() === "alpha" && right.getSnapshot("plan-1")?.orderedTasks.join() === "alpha,beta" && left.getSnapshot("plan-2") === null);

  const fakeModule = (id: string, over: { requires?: string[]; priority?: number } = {}): ExecutionTaskModule => ({
    id,
    name: `Task ${id}`,
    version: "1.0.0",
    category: "FUTURE",
    enabled: true,
    priority: over.priority ?? 100,
    dependencies: { requires: over.requires ?? [], optional: [], conflicts: [] },
    supportsPlan: () => true,
    validate: () => [],
    build: () => ({ status: "READY", warnings: [], metadata: {}, estimatedDuration: 4 }),
  });
  const pipeline = createExecutionTaskPipeline();
  pipeline.register(fakeModule("alpha", { priority: 10 }));
  pipeline.register(fakeModule("beta", { priority: 20, requires: ["alpha"] }));
  const collected = await pipeline.collect(createExecutionTaskContext({ decisionAnalysis: { id: "d-1" }, workflowSnapshot: { id: "snap-1" } }));
  const fromPipeline = builderOf().build(inputOf(collected.results));
  check("task framework results assemble into a plan without running work", fromPipeline.status === "OK" && fromPipeline.plan!.tasks.map((t) => t.id).join() === "alpha,beta" && fromPipeline.plan!.dependencies[0]?.from === "alpha");

  const dir = join(process.cwd(), "src/lib/execution");
  const files = readdirSync(dir).filter((f) => /^execution-plan-[a-z]+\.ts$/.test(f));
  check("five builder modules exist: builder, validator, resolver, snapshot, statistics", files.sort().join() === "execution-plan-builder.ts,execution-plan-resolver.ts,execution-plan-snapshot.ts,execution-plan-statistics.ts,execution-plan-validator.ts");
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
  check("the builder never calls the task pipeline or a provider", !code.some((l) => /createExecutionTaskPipeline|\.collect\(|provider/i.test(l)));
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the builder", architecture.every((src) => !/execution-plan-(builder|validator|resolver|snapshot|statistics)/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const taskFiles = readdirSync(dir).filter((f) => /^execution-task-[a-z]+\.ts$/.test(f));
  check("the task framework does not import the plan builder", taskFiles.every((f) => !/execution-plan-(builder|validator|resolver|snapshot|statistics)/.test(readFileSync(join(dir, f), "utf8"))));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, Decision, or Workflow module imports the plan builder", !others.some((f) => /execution-plan-(builder|validator|resolver|snapshot|statistics)/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution plan builder: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
