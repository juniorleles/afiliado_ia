import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createExecutionPlanBuilder } from "../src/lib/execution/execution-plan-builder.ts";
import {
  EXECUTION_CONTRACT_CATEGORIES,
  EXECUTION_CONTRACT_KEYS,
  EXECUTION_CONTRACT_REQUIREMENT_KEYS,
  createExecutionContract,
  freezeDeepExecutionContract,
  type ExecutionContract,
  type ExecutionContractCategory,
} from "../src/lib/execution/execution-contract.ts";
import { ExecutionContractFrameworkError, createExecutionContractRegistry } from "../src/lib/execution/execution-contract-registry.ts";
import { EXECUTION_CONTRACT_RESOLVE_STATUSES, createExecutionContractResolver } from "../src/lib/execution/execution-contract-resolver.ts";
import { EXECUTION_CONTRACT_SNAPSHOT_KEYS, createExecutionContractSnapshot } from "../src/lib/execution/execution-contract-snapshot.ts";
import { createExecutionContractValidator } from "../src/lib/execution/execution-contract-validator.ts";
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
    return error instanceof ExecutionContractFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};

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

function contractOf(
  id: string,
  category: ExecutionContractCategory,
  over: Partial<ExecutionContract> = {},
): ExecutionContract {
  return {
    id,
    name: over.name ?? id,
    version: over.version ?? "1.0.0",
    category,
    capabilities: over.capabilities ?? ["declare"],
    requirements: over.requirements ?? ["plan"],
    inputs: over.inputs ?? ["plan"],
    outputs: over.outputs ?? ["record"],
    metadata: over.metadata ?? {},
  };
}

function resolverOf(registry = createExecutionContractRegistry()) {
  let n = 0;
  return createExecutionContractResolver({
    registry,
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `snapshot-${++n}`,
  });
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    plan: { id: "plan-1", tasks: [taskOf("alpha")] },
    tasks: [taskOf("alpha")],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

async function main() {
  const validator = createExecutionContractValidator();
  check(
    "seven contract groups, in the requested order",
    EXECUTION_CONTRACT_CATEGORIES.join() === "LANDING_PAGE,CAMPAIGN,CREATIVE,TRACKING,MONITORING,NOTIFICATION,FUTURE",
  );
  check(
    "requirement keys follow the resolver input",
    EXECUTION_CONTRACT_REQUIREMENT_KEYS.join() === "plan,tasks,decisionAnalysis,workflowSnapshot,executionMetadata,runtimeMetadata,configuration",
  );
  check("resolve statuses are OK then REJECTED", EXECUTION_CONTRACT_RESOLVE_STATUSES.join() === "OK,REJECTED");
  check(
    "a contract has exactly the requested fields",
    EXECUTION_CONTRACT_KEYS.join() === "id,name,version,category,capabilities,requirements,inputs,outputs,metadata" &&
      Object.keys(contractOf("page-one", "LANDING_PAGE")).join() === EXECUTION_CONTRACT_KEYS.join(),
  );
  check("snapshot keys are in the requested order", EXECUTION_CONTRACT_SNAPSHOT_KEYS.join() === "snapshotId,planId,workflowId,decisionId,resolvedIds,contracts,createdAt,metadata");

  check("a valid contract is accepted", validator.validateContract(contractOf("page-one", "LANDING_PAGE")).length === 0);
  check("Invalid Contract: a non-object is rejected", has(validator.validateContract(null), /Invalid Contract/));
  check("Invalid Contract: an unknown group is rejected", has(validator.validateContract(contractOf("page-one", "NOPE" as never)), /category/));
  check("Invalid version: a non-semantic version is rejected", has(validator.validateContract(contractOf("page-one", "LANDING_PAGE", { version: "1" })), /Invalid version/));
  check("Missing Requirements: an empty requirement list is rejected", has(validator.validateContract(contractOf("page-one", "LANDING_PAGE", { requirements: [] })), /Missing Requirements/));
  check("Missing Requirements: an unknown requirement is rejected", has(validator.validateContract(contractOf("page-one", "LANDING_PAGE", { requirements: ["nope" as never] })), /Missing Requirements/));
  check("Invalid metadata: nested contract metadata is rejected", has(validator.validateContract(contractOf("page-one", "LANDING_PAGE", { metadata: { a: { b: 1 } } as never })), /Invalid metadata/));
  check("Invalid Contract: a missing member is rejected", has(validator.validateContract({ id: "page-one" }), /Invalid Contract/));
  check("Invalid metadata: nested context metadata is rejected", has(validator.validateInput(inputOf({ executionMetadata: { a: { b: 1 } } })), /Invalid metadata/));
  check(
    "Missing Requirements: a named contract without its input is rejected",
    has(validator.validateRequirements(contractOf("page-one", "LANDING_PAGE"), {}), /Missing Requirements/) &&
      has(validator.validateRequirements(contractOf("page-one", "LANDING_PAGE"), {}), /plan/),
  );

  const registry = createExecutionContractRegistry();
  const stored = registry.register(contractOf("page-one", "LANDING_PAGE", { metadata: { note: "x" } }));
  check("the registry registers, gets, inspects, and lists contracts", stored.id === "page-one" && registry.get("page-one")?.category === "LANDING_PAGE" && registry.inspect("page-one")?.id === "page-one" && registry.list().length === 1);
  check("Duplicate Contract: a second registration is rejected", throwsFramework(() => registry.register(contractOf("page-one", "CREATIVE")), /Duplicate Contract/) && registry.count() === 1);
  check("an invalid record is not registered", throwsFramework(() => registry.register(contractOf("Bad", "LANDING_PAGE") as never), /Invalid Contract/) && registry.count() === 1);
  registry.register(contractOf("notice-one", "NOTIFICATION"));
  check("list filters by group", registry.list({ category: "NOTIFICATION" }).map((item) => item.id).join() === "notice-one");
  check("validate reports without registering", registry.validate({}).length > 0 && registry.get("watch-one") === null);
  check("remove forgets a contract", registry.remove("notice-one").id === "notice-one" && registry.get("notice-one") === null && registry.count() === 1);
  check("remove of an unknown contract is rejected", throwsFramework(() => registry.remove("notice-one")));
  const source = contractOf("watch-one", "MONITORING", { metadata: { note: "live" } });
  registry.register(source);
  source.metadata.note = "changed";
  check("No mutation: changing the source after register leaves the stored contract unchanged", registry.get("watch-one")?.metadata.note === "live");

  const frozen = createExecutionContract(contractOf("page-one", "LANDING_PAGE", { metadata: { run: "r1" } }));
  check("a created contract is frozen", Object.isFrozen(frozen) && Object.isFrozen(frozen.capabilities) && Object.isFrozen(frozen.metadata));
  const snap = createExecutionContractSnapshot({
    snapshotId: "snapshot-1",
    planId: "plan-1",
    workflowId: "snap-1",
    decisionId: "d-1",
    resolvedIds: ["page-one"],
    contracts: [frozen],
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === EXECUTION_CONTRACT_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.resolvedIds) && Object.isFrozen(snap.contracts[0]) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable contracts: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepExecutionContract never throws", freezeDeepExecutionContract(1) === 1 && Object.isFrozen(freezeDeepExecutionContract({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const kinds = createExecutionContractRegistry();
  for (const category of EXECUTION_CONTRACT_CATEGORIES) {
    kinds.register(contractOf(`${category.toLowerCase().replace("_", "-")}-one`, category));
  }
  check("every supported group can be registered", kinds.count() === EXECUTION_CONTRACT_CATEGORIES.length);

  const readyRegistry = createExecutionContractRegistry();
  readyRegistry.register(contractOf("page-one", "LANDING_PAGE"));
  readyRegistry.register(contractOf("notice-one", "NOTIFICATION", { requirements: ["configuration"] }));
  const resolver = resolverOf(readyRegistry);
  const plain = resolver.resolve(inputOf());
  check("Resolve: contracts whose requirements are present become eligible", plain.status === "OK" && plain.contracts.map((item) => item.id).join() === "notice-one,page-one" && plain.executionTime === 0);
  check("the resolved snapshot carries contracts and does not run work", plain.snapshot !== null && plain.snapshot.resolvedIds.join() === "notice-one,page-one" && !("http" in plain));
  check("inspect returns a registered contract without resolving", resolver.inspect("page-one")?.category === "LANDING_PAGE" && resolver.inspect("nope") === null);
  check("getSnapshot returns the stored snapshot", resolver.getSnapshot("snapshot-1") === plain.snapshot && resolver.getSnapshot("nope") === null);
  check("the contracts and snapshot are frozen", Object.isFrozen(plain.contracts) && Object.isFrozen(plain.snapshot) && Object.isFrozen(plain.contracts[0]));
  check("validate agrees with a successful resolve", resolver.validate(inputOf()).length === 0);

  const onlyConfig = resolverOf(readyRegistry).resolve({ configuration: { mode: "m1" } });
  check("a contract whose requirements are absent is omitted, not run", onlyConfig.status === "OK" && onlyConfig.contracts.map((item) => item.id).join() === "notice-one");

  const namedMissing = resolverOf(readyRegistry).resolve({ contractIds: ["page-one"], configuration: { mode: "m1" } });
  check("Missing Requirements: a named contract without its input is refused", namedMissing.status === "REJECTED" && has(namedMissing.issues, /Missing Requirements/) && namedMissing.snapshot === null);

  const unknownNamed = resolverOf(readyRegistry).resolve(inputOf({ contractIds: ["nope-one"] }));
  check("Invalid Contract: a named id that is not registered is refused", unknownNamed.status === "REJECTED" && has(unknownNamed.issues, /Invalid Contract/));

  const future = createExecutionContractRegistry();
  future.register(contractOf("later-one", "FUTURE", { requirements: ["plan"] }));
  const futureResult = resolverOf(future).resolve(inputOf());
  check("a FUTURE contract is stored and can resolve", futureResult.status === "OK" && futureResult.contracts[0]?.category === "FUTURE");

  const inline = resolverOf().resolve(
    inputOf({
      contracts: [contractOf("page-one", "LANDING_PAGE"), contractOf("creative-one", "CREATIVE")],
    }),
  );
  check("inline contracts resolve without a prior register", inline.status === "OK" && inline.contracts.map((item) => item.id).join() === "creative-one,page-one");

  check("Duplicate Contract is refused", resolverOf().resolve(inputOf({ contracts: [contractOf("page-one", "LANDING_PAGE"), contractOf("page-one", "CREATIVE")] })).status === "REJECTED" && has(resolverOf().resolve(inputOf({ contracts: [contractOf("page-one", "LANDING_PAGE"), contractOf("page-one", "CREATIVE")] })).issues, /Duplicate Contract/));
  check("Invalid version is refused", resolverOf().resolve(inputOf({ contracts: [contractOf("page-one", "LANDING_PAGE", { version: "v1" })] })).status === "REJECTED" && has(resolverOf().resolve(inputOf({ contracts: [contractOf("page-one", "LANDING_PAGE", { version: "v1" })] })).issues, /Invalid version/));
  check("Invalid metadata is refused", resolverOf().resolve(inputOf({ executionMetadata: { a: { b: 1 } } })).status === "REJECTED");
  check("Invalid Contract: a missing input is refused", resolverOf().resolve(null).status === "REJECTED" && resolverOf().resolve(null).snapshot === null);
  check("a refused resolve stores no snapshot", resolverOf().getSnapshot("snapshot-1") === null);

  const sourceInput = inputOf({ contracts: [contractOf("page-one", "LANDING_PAGE", { metadata: { run: "r1" } })] });
  const once = resolverOf().resolve(sourceInput);
  (sourceInput.executionMetadata as { run: string }).run = "changed";
  (sourceInput.contracts as ExecutionContract[])[0].id = "changed";
  check("No mutation: changing the input after a resolve leaves the contracts unchanged", once.contracts[0]?.id === "page-one" && once.metadata.run === "r1");
  try {
    (once.contracts as ExecutionContract[])[0] = contractOf("hacked", "FUTURE");
    (once.snapshot!.resolvedIds as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the resolved contracts cannot be assigned into", once.contracts[0]?.id === "page-one" && once.snapshot!.resolvedIds[0] === "page-one");

  const deterministic = () =>
    createExecutionContractResolver({
      now: () => 0,
      timestamp: () => "2026-01-01T00:00:00.000Z",
      idFactory: () => "snapshot-fixed",
    });
  const first = deterministic().resolve(inputOf({ contracts: [contractOf("beta-one", "CREATIVE"), contractOf("alpha-one", "LANDING_PAGE")] }));
  const second = deterministic().resolve(inputOf({ contracts: [contractOf("alpha-one", "LANDING_PAGE"), contractOf("beta-one", "CREATIVE")] }));
  check(
    "Deterministic contract resolution: eligibility does not depend on a clock or list order",
    first.status === "OK" && first.contracts.map((item) => item.id).join() === second.contracts.map((item) => item.id).join() && first.contracts.map((item) => item.id).join() === "alpha-one,beta-one",
  );

  const left = resolverOf();
  const right = resolverOf();
  left.registry.register(contractOf("page-one", "LANDING_PAGE"));
  right.registry.register(contractOf("page-one", "LANDING_PAGE"));
  right.registry.register(contractOf("notice-one", "NOTIFICATION"));
  left.resolve(inputOf());
  right.resolve(inputOf());
  check("Independent execution: resolvers do not share snapshots or registries", left.getSnapshot("snapshot-1")?.resolvedIds.join() === "page-one" && right.getSnapshot("snapshot-1")?.resolvedIds.join() === "notice-one,page-one" && left.registry.count() === 1 && right.registry.count() === 2 && left.getSnapshot("snapshot-2") === null);

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
  const fromBuilder = resolverOf(readyRegistry).resolve({
    plan: built.plan!,
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    configuration: { mode: "m1" },
  });
  check("a built plan resolves contracts without running work", built.status === "OK" && fromBuilder.status === "OK" && fromBuilder.snapshot!.planId === "plan-1" && fromBuilder.contracts.map((item) => item.id).join() === "notice-one,page-one");

  const dir = join(process.cwd(), "src/lib/execution");
  const files = readdirSync(dir).filter((f) => /^execution-contract(-[a-z]+)?\.ts$/.test(f));
  check(
    "five contract modules exist: contract, registry, resolver, snapshot, validator",
    files.sort().join() === "execution-contract-registry.ts,execution-contract-resolver.ts,execution-contract-snapshot.ts,execution-contract-validator.ts,execution-contract.ts",
  );
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, or bid logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|adwords|\bbid\b|budget/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the execution folder", imports.every((i) => /^\.\/execution-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the resolver never calls the task pipeline, plan builder, or a host", !code.some((l) => /createExecutionTaskPipeline|createExecutionPlanBuilder|\.collect\(|\.build\(|provider/i.test(l)));
  check("no contract ships: the framework registers nothing of its own", !code.some((l) => /\bregister\(\s*\{|\.register\(\s*[a-z]+Contract/.test(l)));
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the contract framework", architecture.every((src) => !/execution-contract/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^(execution-task-|execution-plan-|execution-dependency-)/.test(f));
  check("the task framework, plan builder, and dependency resolver do not import the contract framework", prior.every((f) => !/execution-contract/.test(readFileSync(join(dir, f), "utf8"))));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, Decision, or Workflow module imports the contract framework", !others.some((f) => /execution-contract/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution contract framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
