import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createExecutionContract, type ExecutionContract } from "../src/lib/execution/execution-contract.ts";
import { createExecutionDependencyResolver } from "../src/lib/execution/execution-dependency-resolver.ts";
import { createExecutionContractResolver } from "../src/lib/execution/execution-contract-resolver.ts";
import type { ExecutionProvider } from "../src/lib/execution/execution-provider.ts";
import { createExecutionProviderResolver } from "../src/lib/execution/execution-provider-resolver.ts";
import {
  EXECUTION_GRAPH_KEYS,
  EXECUTION_RESOLVER_SNAPSHOT_KEYS,
  EXECUTION_RESOLVER_STATISTICS_KEYS,
  RESOLVED_EXECUTION_PLAN_KEYS,
  freezeDeepExecutionResolver,
} from "../src/lib/execution/execution-resolver-plan.ts";
import { EXECUTION_PIPELINE_STEPS } from "../src/lib/execution/execution-resolver-recorder.ts";
import { createExecutionResolverValidator } from "../src/lib/execution/execution-resolver-validator.ts";
import { EXECUTION_RESOLVE_STATUSES, createExecutionResolver } from "../src/lib/execution/execution-resolver.ts";
import type { ExecutionTask } from "../src/lib/execution/execution-types.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function taskOf(id: string): ExecutionTask {
  return { id, name: id, steps: [], metadata: {} };
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

function planOf(over: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    decisionAnalysisId: "d-1",
    workflowSnapshotId: "snap-1",
    tasks: [taskOf("alpha"), taskOf("beta")],
    dependencies: [{ from: "alpha", to: "beta" }],
    metadata: { run: "r1" },
    executionTime: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
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

function harness() {
  const timestamp = () => "2026-01-01T00:00:00.000Z";
  const depCalls = { n: 0 };
  const contractCalls = { n: 0 };
  const providerCalls = { n: 0 };
  const dependencyResolver = wrapResolve(createExecutionDependencyResolver({ now: () => 0, timestamp, idFactory: () => "dep-1" }), depCalls);
  const contractResolver = wrapResolve(createExecutionContractResolver({ now: () => 0, timestamp, idFactory: () => "contract-1" }), contractCalls);
  const providerResolver = wrapResolve(createExecutionProviderResolver({ now: () => 0, timestamp, idFactory: () => "host-snap-1" }), providerCalls);
  providerResolver.registry.register(hostOf("host-one"));
  const resolver = createExecutionResolver({
    now: () => 0,
    timestamp,
    idFactory: () => "graph-1",
    dependencyResolver,
    contractResolver,
    providerResolver,
  });
  return { resolver, depCalls, contractCalls, providerCalls };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    plan: planOf(),
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
  const validator = createExecutionResolverValidator();
  check(
    "eight pipeline steps, in flow order",
    EXECUTION_PIPELINE_STEPS.join() ===
      "LOAD_WORKFLOW_SNAPSHOT,LOAD_DECISION_ANALYSIS,RESOLVE_TASKS,RESOLVE_DEPENDENCIES,RESOLVE_CONTRACTS,RESOLVE_PROVIDERS,VALIDATE_PLAN,FREEZE_EXECUTION_GRAPH",
  );
  check("resolve statuses are OK then REJECTED", EXECUTION_RESOLVE_STATUSES.join() === "OK,REJECTED");
  check("graph keys are in the requested order", EXECUTION_GRAPH_KEYS.join() === "nodes,edges,contractIds,providerIds");
  check("snapshot keys are in the requested order", EXECUTION_RESOLVER_SNAPSHOT_KEYS.join() === "snapshotId,planId,workflowId,decisionId,orderedTasks,contractIds,providerIds,createdAt,metadata");
  check("statistics keys are in the requested order", EXECUTION_RESOLVER_STATISTICS_KEYS.join() === "taskCount,readyCount,blockedCount,waitingCount,contractCount,providerCount,dependencyCount");
  check(
    "a resolved plan has exactly the requested fields",
    RESOLVED_EXECUTION_PLAN_KEYS.join() ===
      "id,decisionAnalysisId,workflowSnapshotId,tasks,dependencies,contracts,providers,metadata,statistics,graph,executionTime,createdAt",
  );

  check("Missing Task: tasks are required", has(validator.validateInput({}), /Missing Task/));
  check("Duplicate Task: a second task id is rejected", has(validator.validateInput(inputOf({ plan: planOf({ tasks: [taskOf("alpha"), taskOf("alpha")] }) })), /Duplicate Task/));
  check("Missing Task: a wait that names no listed task is rejected", has(validator.validateGraph(["alpha"], [{ from: "alpha", to: "beta" }]), /Missing Task/));
  check("Circular Dependency is rejected", has(validator.validateGraph(["alpha", "beta"], [{ from: "alpha", to: "beta" }, { from: "beta", to: "alpha" }]), /Circular Dependency/));
  check("Invalid metadata: nested context metadata is rejected", has(validator.validateInput(inputOf({ executionMetadata: { a: { b: 1 } } })), /Invalid metadata/));

  const { resolver, depCalls, contractCalls, providerCalls } = harness();
  const plain = resolver.resolve(inputOf());
  check("a valid plan prepares an execution graph without running work", plain.status === "OK" && plain.graph !== null && plain.plan !== null && plain.executionTime === 0);
  check("ordered tasks follow the waits", plain.orderedTasks.join() === "alpha,beta");
  check("resolved contracts are returned", plain.contracts.map((item) => item.id).join() === "page-one");
  check("resolved hosts are returned", plain.providers.map((item) => item.id).join() === "host-one");
  check("statistics count tasks, contracts, and hosts", plain.statistics?.taskCount === 2 && plain.statistics.contractCount === 1 && plain.statistics.providerCount === 1 && plain.statistics.readyCount === 2);
  check("the snapshot is frozen", Object.isFrozen(plain.snapshot) && Object.isFrozen(plain.graph) && Object.isFrozen(plain.plan) && Object.isFrozen(plain.orderedTasks));
  check("getSnapshot returns the stored snapshot", resolver.getSnapshot("graph-1") === plain.snapshot && resolver.getSnapshot("nope") === null);
  check("validate agrees with a successful resolve", resolver.validate(inputOf()).length === 0);
  check("id holders are loaded onto the resolved plan", plain.plan?.decisionAnalysisId === "d-1" && plain.plan?.workflowSnapshotId === "snap-1" && plain.snapshot?.planId === "plan-1");

  check("Tasks resolved once", resolver.recorder.count("RESOLVE_TASKS") === 1);
  check("Dependencies resolved once", depCalls.n === 1 && resolver.recorder.count("RESOLVE_DEPENDENCIES") === 1);
  check("Contracts resolved once", contractCalls.n === 1 && resolver.recorder.count("RESOLVE_CONTRACTS") === 1);
  check("Providers resolved once", providerCalls.n === 1 && resolver.recorder.count("RESOLVE_PROVIDERS") === 1);
  check("every pipeline step ran once, in order", resolver.recorder.list().map((item) => item.step).join() === EXECUTION_PIPELINE_STEPS.join() && EXECUTION_PIPELINE_STEPS.every((step) => resolver.recorder.count(step) === 1));

  const missingTask = createExecutionResolver({ now: () => 0, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "graph-1" }).resolve(null);
  check("Missing Task: a missing input is refused", missingTask.status === "REJECTED" && has(missingTask.issues, /required/) && missingTask.graph === null);

  const duplicate = harness().resolver.resolve(inputOf({ plan: planOf({ tasks: [taskOf("alpha"), taskOf("alpha")] }) }));
  check("Duplicate Task is refused", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Task/) && duplicate.snapshot === null);

  const missingNamed = harness().resolver.resolve(inputOf({ plan: planOf({ dependencies: [{ from: "alpha", to: "gamma" }] }) }));
  check("Missing Task is refused", missingNamed.status === "REJECTED" && has(missingNamed.issues, /Missing Task/));

  const cyclic = harness().resolver.resolve(
    inputOf({
      plan: planOf({
        dependencies: [
          { from: "alpha", to: "beta" },
          { from: "beta", to: "alpha" },
        ],
      }),
    }),
  );
  check("Circular Dependency is refused", cyclic.status === "REJECTED" && has(cyclic.issues, /Circular Dependency/));

  const noContract = harness().resolver.resolve(inputOf({ contracts: [] }));
  check("Missing Contract is refused", noContract.status === "REJECTED" && has(noContract.issues, /Missing Contract/) && noContract.snapshot === null);

  const noHost = createExecutionResolver({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "graph-1",
  }).resolve(inputOf());
  check("Missing Provider is refused", noHost.status === "REJECTED" && has(noHost.issues, /Missing Provider/));

  const invalidMeta = harness().resolver.resolve(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid metadata is refused", invalidMeta.status === "REJECTED" && has(invalidMeta.issues, /Invalid metadata/));
  check("a refused resolve stores no snapshot", createExecutionResolver({ now: () => 0, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "graph-1" }).getSnapshot("graph-1") === null);

  const sourceInput = inputOf();
  const once = harness().resolver.resolve(sourceInput);
  (sourceInput.executionMetadata as { run: string }).run = "changed";
  (sourceInput.plan as { tasks: ExecutionTask[] }).tasks[0].id = "changed";
  check("No mutation: changing the input after a resolve leaves the graph unchanged", once.graph!.nodes[0] === "alpha" && once.metadata.run === "r1" && once.orderedTasks[0] === "alpha");
  try {
    (once.graph!.nodes as string[])[0] = "hacked";
    (once.orderedTasks as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the graph cannot be assigned into", once.graph!.nodes[0] === "alpha" && once.orderedTasks[0] === "alpha");
  check("freezeDeepExecutionResolver never throws", freezeDeepExecutionResolver(1) === 1 && Object.isFrozen(freezeDeepExecutionResolver({ n: 1 })));

  const left = harness();
  const right = harness();
  right.resolver.pipeline.providerResolver.registry.register(hostOf("host-two", { supportedContracts: ["page-one"], capabilities: ["CREATE"] }));
  left.resolver.resolve(inputOf());
  right.resolver.resolve(inputOf());
  check(
    "Independent resolvers do not share snapshots or hosts",
    left.resolver.getSnapshot("graph-1")?.providerIds.join() === "host-one" &&
      right.resolver.getSnapshot("graph-1")?.providerIds.join() === "host-one,host-two" &&
      left.resolver.getSnapshot("graph-2") === null,
  );

  const second = harness();
  second.resolver.resolve(inputOf());
  second.resolver.resolve(inputOf());
  check("a second resolve records each prepare step once for that run", second.resolver.recorder.count("RESOLVE_TASKS") === 1 && second.depCalls.n === 2);

  const dir = join(process.cwd(), "src/lib/execution");
  const files = readdirSync(dir).filter((f) => f === "execution-pipeline.ts" || /^execution-resolver(-[a-z]+)?\.ts$/.test(f));
  check(
    "five resolver modules exist: pipeline, plan, recorder, validator, resolver",
    files.sort().join() === "execution-pipeline.ts,execution-resolver-plan.ts,execution-resolver-recorder.ts,execution-resolver-validator.ts,execution-resolver.ts",
  );
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, or bid logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|adwords|\bbid\b|budget|\bmeta\b/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(|axios|node:net/i.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the execution folder", imports.every((i) => /^\.\/execution-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the resolver never calls the task pipeline, plan builder, or host methods", !code.some((l) => /createExecutionTaskPipeline|createExecutionPlanBuilder|\.collect\(|\.build\(|\.health\(|\.supports\(/i.test(l)));
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the resolver", architecture.every((src) => !/execution-resolver|execution-pipeline/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^(execution-task-|execution-plan-|execution-dependency-|execution-contract|execution-provider)/.test(f));
  check("prior execution modules do not import the execution resolver", prior.every((f) => !/execution-resolver|execution-pipeline/.test(readFileSync(join(dir, f), "utf8"))));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, Decision, or Workflow module imports the execution resolver", !others.some((f) => /execution-resolver|execution-pipeline/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution resolver: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
