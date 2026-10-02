import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EXECUTION_CONTEXT_MEMBERS, type ExecutionContext } from "../src/lib/execution/execution-context.ts";
import { EXECUTION_PLAN_KEYS, type ExecutionPlan } from "../src/lib/execution/execution-plan.ts";
import type { ExecutionPlanner, ExecutionPlannerDependencies } from "../src/lib/execution/execution-planner.ts";
import type { ExecutionRegistry } from "../src/lib/execution/execution-registry.ts";
import { EXECUTION_TASK_KEYS, type ExecutionDependency, type ExecutionMetadata, type ExecutionPrecondition, type ExecutionStep, type ExecutionTask } from "../src/lib/execution/execution-types.ts";
import type { ExecutionIssue, ExecutionValidator } from "../src/lib/execution/execution-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const metadata: ExecutionMetadata = { note: "fixture", n: 1, flag: true, none: null };
const step: ExecutionStep = { id: "step-1", name: "prepare", metadata };
const task: ExecutionTask = { id: "task-1", name: "first", steps: [step], metadata };
const later: ExecutionTask = { id: "task-2", name: "second", steps: [], metadata };
const dependency: ExecutionDependency = { from: "task-1", to: "task-2" };
const precondition: ExecutionPrecondition = { id: "pre-1", metadata };
const plan: ExecutionPlan = {
  id: "plan-1",
  decisionAnalysisId: "d-1",
  workflowSnapshotId: "snap-1",
  tasks: [task, later],
  dependencies: [dependency],
  preconditions: [precondition],
  metadata,
  executionTime: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const context: ExecutionContext = {
  decisionAnalysis: { id: "d-1" },
  workflowSnapshot: { id: "snap-1" },
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
};

function keyOf(item: ExecutionDependency): string {
  return `${item.from}->${item.to}`;
}

function hasCycle(dependencies: ExecutionDependency[]): boolean {
  const edges = new Map<string, string[]>();
  for (const item of dependencies) {
    edges.set(item.from, [...(edges.get(item.from) ?? []), item.to]);
  }
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (seen.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) if (walk(next)) return true;
    visiting.delete(node);
    seen.add(node);
    return false;
  };
  return [...edges.keys()].some(walk);
}

function fakeRegistry(): ExecutionRegistry {
  const tasks = new Map<string, ExecutionTask>();
  const dependencies = new Map<string, ExecutionDependency>();
  const taskIssues = (input: unknown): ExecutionIssue[] => {
    if (typeof input !== "object" || input === null || !("id" in input)) {
      return [{ field: "task", message: "Duplicate Task: a task id is required." }];
    }
    return [];
  };
  const dependencyIssues = (input: unknown): ExecutionIssue[] => {
    if (typeof input !== "object" || input === null || !("from" in input) || !("to" in input)) {
      return [{ field: "dependency", message: "Missing Dependency: a from-to pair is required." }];
    }
    const item = input as ExecutionDependency;
    if (!tasks.has(item.from) || !tasks.has(item.to)) {
      return [{ field: "dependency", message: "Missing Dependency: both tasks must be registered." }];
    }
    return [];
  };
  return {
    registerTask: (item) => {
      if (tasks.has(item.id)) throw new Error("Duplicate Task");
      tasks.set(item.id, item);
      return item;
    },
    registerDependency: (item) => {
      const id = keyOf(item);
      if (dependencies.has(id)) throw new Error("Duplicate Task");
      dependencies.set(id, item);
      return item;
    },
    getTask: (id) => tasks.get(id) ?? null,
    getDependency: (from, to) => dependencies.get(`${from}->${to}`) ?? null,
    listTasks: () => [...tasks.values()],
    listDependencies: () => [...dependencies.values()],
    validateTask: taskIssues,
    validateDependency: dependencyIssues,
  };
}

const validator: ExecutionValidator = {
  validateTask: (input) => (typeof input === "object" && input !== null && "id" in input && typeof (input as ExecutionTask).id === "string" && (input as ExecutionTask).id.trim() !== "" ? [] : [{ field: "task", message: "Duplicate Task: a task id is required." }]),
  validateDependency: (input) => {
    if (typeof input !== "object" || input === null || !("from" in input) || !("to" in input)) {
      return [{ field: "dependency", message: "Missing Dependency: a from-to pair is required." }];
    }
    return [];
  },
  validatePlan: (input) => (input == null ? [{ field: "plan", message: "Missing plan: an execution plan is required." }] : []),
  validateContext: (input) => (input == null ? [{ field: "context", message: "Missing context: an execution context is required." }] : []),
  validateMetadata: (input) =>
    input !== null && typeof input === "object" && !Array.isArray(input) && Object.values(input as object).every((v) => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      ? []
      : [{ field: "metadata", message: "Invalid metadata: a flat record is required." }],
  validatePreconditions: (input) => (Array.isArray(input) ? [] : [{ field: "preconditions", message: "Invalid metadata: preconditions must be a list." }]),
  validateGraph: (tasks, dependencies) => {
    const issues: ExecutionIssue[] = [];
    const seen = new Set<string>();
    for (const item of tasks) {
      if (seen.has(item.id)) issues.push({ field: "tasks", message: "Duplicate Task: the same task id is already registered." });
      seen.add(item.id);
    }
    const ids = new Set(tasks.map((item) => item.id));
    for (const item of dependencies) {
      if (!ids.has(item.from) || !ids.has(item.to)) {
        issues.push({ field: "dependencies", message: "Missing Dependency: a named task is not registered." });
      }
    }
    if (hasCycle(dependencies)) issues.push({ field: "dependencies", message: "Circular Dependency: a cycle is not allowed." });
    return issues;
  },
};

async function main() {
  check("five context members, in the requested order", EXECUTION_CONTEXT_MEMBERS.join() === "decisionAnalysis,workflowSnapshot,executionMetadata,runtimeMetadata,configuration");
  check("a task has exactly the requested fields", EXECUTION_TASK_KEYS.join() === "id,name,steps,metadata" && Object.keys(task).join() === EXECUTION_TASK_KEYS.join());
  check("a plan has exactly the requested fields", EXECUTION_PLAN_KEYS.join() === "id,decisionAnalysisId,workflowSnapshotId,tasks,dependencies,preconditions,metadata,executionTime,createdAt" && Object.keys(plan).join() === EXECUTION_PLAN_KEYS.join());
  check("a step has exactly id, name, and metadata", Object.keys(step).join() === "id,name,metadata");
  check("a dependency has exactly from and to", Object.keys(dependency).join() === "from,to");
  check("a precondition has exactly id and metadata", Object.keys(precondition).join() === "id,metadata");
  check("a context has exactly the five members", Object.keys(context).join() === EXECUTION_CONTEXT_MEMBERS.join());
  check("the plan carries ordered tasks and no outside call", plan.tasks.map((item) => item.id).join() === "task-1,task-2" && !("http" in plan) && !("actions" in plan));

  const registry = fakeRegistry();
  const dependencies: ExecutionPlannerDependencies = { registry, validator };
  const planner: ExecutionPlanner = {
    plan: async (ctx) => ({
      ...plan,
      decisionAnalysisId: ctx.decisionAnalysis?.id ?? null,
      workflowSnapshotId: ctx.workflowSnapshot?.id ?? null,
      metadata: { ...ctx.configuration },
    }),
    getPlan: () => null,
  };

  registry.registerTask(task);
  registry.registerTask(later);
  registry.registerDependency(dependency);
  check("the registry registers, gets, and lists tasks", registry.getTask("task-1")?.name === "first" && registry.getTask("missing") === null && registry.listTasks().length === 2);
  check("the registry registers, gets, and lists dependencies", registry.getDependency("task-1", "task-2")?.to === "task-2" && registry.getDependency("task-2", "task-1") === null && registry.listDependencies().length === 1);
  check("the registry validates without registering", registry.validateTask(task).length === 0 && registry.validateTask(null).length === 1 && registry.getTask("task-3") === null);
  let duplicateTask = false;
  try {
    registry.registerTask(task);
  } catch {
    duplicateTask = true;
  }
  check("Duplicate Task: a second registration is rejected", duplicateTask && registry.listTasks().length === 2);
  check("Missing Dependency is rejected by the registry", registry.validateDependency({ from: "task-1", to: "task-3" }).some((i) => /Missing Dependency/.test(`${i.field} ${i.message}`)));
  check("Circular Dependency is rejected by the validator contract", validator.validateGraph([task, later], [dependency, { from: "task-2", to: "task-1" }]).some((i) => /Circular Dependency/.test(`${i.field} ${i.message}`)));
  check("Missing Dependency is rejected by the validator contract", validator.validateGraph([task], [dependency]).some((i) => /Missing Dependency/.test(`${i.field} ${i.message}`)));
  check("Duplicate Task is rejected by the validator contract", validator.validateGraph([task, task], []).some((i) => /Duplicate Task/.test(`${i.field} ${i.message}`)));
  check("Invalid Metadata is rejected by the validator contract", validator.validateMetadata({ a: { b: 1 } }).some((i) => /Invalid metadata/.test(`${i.field} ${i.message}`)) && validator.validateMetadata(metadata).length === 0);
  const produced = await planner.plan(context);
  check("the planner returns an immutable-shaped plan and does not look up a missing id", produced.decisionAnalysisId === "d-1" && produced.workflowSnapshotId === "snap-1" && produced.tasks.length === 2 && produced.executionTime === 0 && planner.getPlan("nope") === null);
  void dependencies;

  const dir = join(process.cwd(), "src/lib/execution");
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"];
  check("the six architecture modules are present", architecture.every((f) => readdirSync(dir).includes(f)));
  const files = readdirSync(dir).filter((f) => architecture.includes(f));
  check("exactly the six architecture modules exist", files.sort().join() === architecture.slice().sort().join());
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 6);
  check("every import is type-only and from inside the execution folder", imports.every((i) => i.typeOnly && /^\.\/execution-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, campaign, bid, or cost logic in code", !code.some((l) => /google|\bads?\b|keyword|campaign|\bcpc\b|\bcpa\b|\bbid\b|budget|adwords/i.test(l)));
  check("no AI, network, persistence, timers, or file access in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|node:fs|child_process|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  const runtime = code.filter((l) => /^\s*export\s+(async\s+)?(function|class)\b|=>\s*[^;]*;?\s*$/.test(l) && !/^\s*export\s+(type|interface)\b/.test(l));
  check("architecture only: no function or class is exported, and the only runtime values are constants", runtime.length === 0 && code.filter((l) => /^\s*export\s+const\b/.test(l)).length === 3);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, Decision, or Workflow module imports the execution planner", !others.some((f) => /\/execution\/|execution-(planner|types|plan|registry|validator|context)/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution architecture: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
