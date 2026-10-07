import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createExecutionContract } from "../src/lib/execution/execution-contract.ts";
import {
  EXECUTION_PROVIDER_HEALTH_STATUSES,
  EXECUTION_PROVIDER_KEYS,
  EXECUTION_PROVIDER_METHODS,
  freezeDeepExecutionProvider,
  type ExecutionProvider,
} from "../src/lib/execution/execution-provider.ts";
import {
  EXECUTION_PROVIDER_CAPABILITIES,
  EXECUTION_PROVIDER_CAPABILITY_KEYS,
  ExecutionProviderCapabilityError,
  createExecutionProviderCapabilityRegistry,
} from "../src/lib/execution/execution-provider-capabilities.ts";
import { ExecutionProviderFrameworkError, createExecutionProviderRegistry } from "../src/lib/execution/execution-provider-registry.ts";
import { EXECUTION_PROVIDER_RESOLVE_STATUSES, createExecutionProviderResolver } from "../src/lib/execution/execution-provider-resolver.ts";
import { EXECUTION_PROVIDER_SNAPSHOT_KEYS, createExecutionProviderSnapshot } from "../src/lib/execution/execution-provider-snapshot.ts";
import { createExecutionProviderValidator } from "../src/lib/execution/execution-provider-validator.ts";

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
    return error instanceof ExecutionProviderFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};
const throwsCapability = (fn: () => unknown, text?: RegExp): boolean => {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof ExecutionProviderCapabilityError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};

function hostOf(id: string, over: Partial<Pick<ExecutionProvider, "name" | "version" | "supportedContracts" | "capabilities" | "metadata">> = {}): ExecutionProvider {
  return {
    id,
    name: over.name ?? id,
    version: over.version ?? "1.0.0",
    supportedContracts: over.supportedContracts ?? ["page-one"],
    capabilities: over.capabilities ?? ["GENERATE"],
    health: () => ({ status: "OK", issues: [] }),
    validate: () => [],
    supports: () => true,
    metadata: over.metadata ?? {},
  };
}

function resolverOf(registry = createExecutionProviderRegistry()) {
  let n = 0;
  return createExecutionProviderResolver({
    registry,
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `snapshot-${++n}`,
  });
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    plan: { id: "plan-1" },
    contracts: [{ id: "page-one" }],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

async function main() {
  const validator = createExecutionProviderValidator();
  check(
    "ten capabilities, in the requested order",
    EXECUTION_PROVIDER_CAPABILITIES.join() === "GENERATE,CREATE,UPDATE,DELETE,PAUSE,RESUME,PUBLISH,ARCHIVE,MONITOR,FUTURE",
  );
  check("health statuses are OK then UNAVAILABLE", EXECUTION_PROVIDER_HEALTH_STATUSES.join() === "OK,UNAVAILABLE");
  check("resolve statuses are OK then REJECTED", EXECUTION_PROVIDER_RESOLVE_STATUSES.join() === "OK,REJECTED");
  check("host methods are health, validate, then supports", EXECUTION_PROVIDER_METHODS.join() === "health,validate,supports");
  check(
    "a host has exactly the requested fields",
    EXECUTION_PROVIDER_KEYS.join() === "id,name,version,supportedContracts,capabilities,health,validate,supports,metadata" &&
      Object.keys(hostOf("host-one")).join() === EXECUTION_PROVIDER_KEYS.join(),
  );
  check("snapshot keys are in the requested order", EXECUTION_PROVIDER_SNAPSHOT_KEYS.join() === "snapshotId,planId,providerIds,contractIds,capabilities,providers,createdAt,metadata");
  check("capability record keys are in the requested order", EXECUTION_PROVIDER_CAPABILITY_KEYS.join() === "id,name,metadata");

  check("a valid host is accepted", validator.validateProvider(hostOf("host-one")).length === 0);
  check("a non-object host is rejected", has(validator.validateProvider(null), /host record is required/));
  check("Invalid version: a non-semantic version is rejected", has(validator.validateProvider(hostOf("host-one", { version: "1" })), /Invalid version/));
  check("Invalid metadata: nested host metadata is rejected", has(validator.validateProvider(hostOf("host-one", { metadata: { a: { b: 1 } } as never })), /Invalid metadata/));
  check("Duplicate Capability: a repeated host capability is rejected", has(validator.validateProvider(hostOf("host-one", { capabilities: ["GENERATE", "GENERATE"] })), /Duplicate Capability/));
  check("Unsupported Capability: an unknown host capability is rejected", has(validator.validateProvider(hostOf("host-one", { capabilities: ["NOPE" as never] })), /Unsupported Capability/));
  check("Unsupported Contract: a host that names an unknown contract is rejected", has(validator.validateProvider(hostOf("host-one", { supportedContracts: ["nope-one"] }), ["page-one"]), /Unsupported Contract/));
  check("a missing method is rejected", has(validator.validateProvider({ ...hostOf("host-one"), health: undefined as never }), /health/));
  check("Invalid metadata: nested context metadata is rejected", has(validator.validateInput(inputOf({ executionMetadata: { a: { b: 1 } } })), /Invalid metadata/));

  const capabilities = createExecutionProviderCapabilityRegistry();
  const storedCap = capabilities.register({ id: "GENERATE", name: "Generate", metadata: { note: "x" } });
  check("the capability registry registers, gets, inspects, and lists", storedCap.id === "GENERATE" && capabilities.get("GENERATE")?.name === "Generate" && capabilities.inspect("GENERATE")?.id === "GENERATE" && capabilities.list().length === 1);
  check("Duplicate Capability: a second capability registration is rejected", throwsCapability(() => capabilities.register({ id: "GENERATE", name: "Generate", metadata: {} }), /Duplicate Capability/) && capabilities.count() === 1);
  check("an invalid capability is not registered", throwsCapability(() => capabilities.register({ id: "NOPE" as never, name: "Nope", metadata: {} }), /Unsupported Capability/) && capabilities.count() === 1);
  check("capability validate reports without registering", capabilities.validate({}).length > 0 && capabilities.get("CREATE") === null);
  check("remove forgets a capability", capabilities.remove("GENERATE").id === "GENERATE" && capabilities.get("GENERATE") === null && capabilities.count() === 0);

  const registry = createExecutionProviderRegistry();
  const stored = registry.register(hostOf("host-one", { metadata: { note: "x" } }));
  check("the registry registers, gets, inspects, and lists hosts", stored.id === "host-one" && registry.get("host-one")?.version === "1.0.0" && registry.inspect("host-one")?.id === "host-one" && registry.list().length === 1);
  check("Duplicate Provider: a second registration is rejected", throwsFramework(() => registry.register(hostOf("host-one")), /Duplicate Provider/) && registry.count() === 1);
  check("an invalid record is not registered", throwsFramework(() => registry.register(hostOf("Bad") as never), /well-formed/) && registry.count() === 1);
  registry.register(hostOf("host-two", { supportedContracts: ["notice-one"], capabilities: ["MONITOR"] }));
  check("list filters by contract", registry.list({ contractId: "notice-one" }).map((item) => item.id).join() === "host-two");
  check("list filters by capability", registry.list({ capability: "MONITOR" }).map((item) => item.id).join() === "host-two");
  check("validate reports without registering", registry.validate({}).length > 0 && registry.get("host-three") === null);
  check("remove forgets a host", registry.remove("host-two").id === "host-two" && registry.get("host-two") === null && registry.count() === 1);
  check("remove of an unknown host is rejected", throwsFramework(() => registry.remove("host-two"), /Missing Provider/));
  const source = hostOf("host-watch", { metadata: { note: "live" }, supportedContracts: ["watch-one"] });
  registry.register(source);
  source.metadata.note = "changed";
  (source.supportedContracts as string[])[0] = "changed";
  check("No mutation: changing the source after register leaves the stored record unchanged", registry.get("host-watch")?.metadata.note === "live" && registry.get("host-watch")?.supportedContracts[0] === "watch-one");
  registry.disable("host-watch");
  check("disable leaves the host registered and resolve skips it", registry.get("host-watch")?.enabled === false && registry.resolve("host-watch") === null && registry.inspect("host-watch")?.id === "host-watch");
  registry.enable("host-watch");
  check("enable restores resolve", registry.resolve("host-watch")?.enabled === true);
  registry.remove("host-watch");

  const frozenRecord = {
    id: "host-one",
    name: "host-one",
    version: "1.0.0",
    supportedContracts: ["page-one"],
    capabilities: ["GENERATE" as const],
    enabled: true,
    metadata: { run: "r1" },
  };
  const snap = createExecutionProviderSnapshot({
    snapshotId: "snapshot-1",
    planId: "plan-1",
    providerIds: ["host-one"],
    contractIds: ["page-one"],
    capabilities: ["GENERATE"],
    providers: [frozenRecord],
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === EXECUTION_PROVIDER_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.providerIds) && Object.isFrozen(snap.providers[0]) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepExecutionProvider never throws", freezeDeepExecutionProvider(1) === 1 && Object.isFrozen(freezeDeepExecutionProvider({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const kinds = createExecutionProviderRegistry();
  EXECUTION_PROVIDER_CAPABILITIES.forEach((capability, index) => {
    kinds.register(hostOf(`host-${index + 1}`, { capabilities: [capability], supportedContracts: [`item-${index + 1}`] }));
  });
  check("every supported capability can be registered", kinds.count() === EXECUTION_PROVIDER_CAPABILITIES.length);

  const ready = createExecutionProviderRegistry();
  ready.register(hostOf("host-one", { supportedContracts: ["page-one"], capabilities: ["GENERATE", "CREATE"] }));
  ready.register(hostOf("host-two", { supportedContracts: ["notice-one"], capabilities: ["MONITOR"] }));
  const resolver = resolverOf(ready);
  const plain = resolver.resolve(inputOf());
  check("Resolve Contract: a host whose declared contracts match becomes compatible", plain.status === "OK" && plain.providers.map((item) => item.id).join() === "host-one" && plain.executionTime === 0);
  check("the resolved snapshot carries hosts and does not run work", plain.snapshot !== null && plain.snapshot.providerIds.join() === "host-one" && !("http" in plain));
  check("inspect returns a registered host without invoking it", resolver.inspect("host-one")?.id === "host-one" && resolver.inspect("nope") === null);
  check("getSnapshot returns the stored snapshot", resolver.getSnapshot("snapshot-1") === plain.snapshot && resolver.getSnapshot("nope") === null);
  check("the hosts and snapshot are frozen", Object.isFrozen(plain.providers) && Object.isFrozen(plain.snapshot) && Object.isFrozen(plain.providers[0]));
  check("validate agrees with a successful resolve", resolver.validate(inputOf()).length === 0);

  const byContract = resolver.resolveContract("notice-one");
  check("resolveContract returns compatible hosts", byContract.status === "OK" && byContract.providers.map((item) => item.id).join() === "host-two");
  const byCapability = resolver.resolveCapability("MONITOR");
  check("Resolve Capability: hosts that declare the verb become compatible", byCapability.status === "OK" && byCapability.providers.map((item) => item.id).join() === "host-two");
  const missingContract = resolver.resolveContract("nope-one");
  check("Detect Missing Provider: a contract with no host is refused", missingContract.status === "REJECTED" && has(missingContract.issues, /Missing Provider/) && missingContract.snapshot === null);
  const missingCapability = resolver.resolveCapability("ARCHIVE");
  check("Detect Unsupported Capability: a verb no host declares is refused", missingCapability.status === "REJECTED" && has(missingCapability.issues, /Unsupported Capability/));

  const namedUnsupported = resolver.resolve(inputOf({ providerIds: ["host-two"] }));
  check("Unsupported Contract: a named host that does not list the contract is refused", namedUnsupported.status === "REJECTED" && has(namedUnsupported.issues, /Unsupported Contract/));

  const future = createExecutionProviderRegistry();
  future.register(hostOf("host-later", { capabilities: ["FUTURE"], supportedContracts: ["page-one"] }));
  const futureResult = resolverOf(future).resolve(inputOf());
  check("a FUTURE capability is stored and can resolve", futureResult.status === "OK" && futureResult.providers[0]?.capabilities[0] === "FUTURE");

  check("Duplicate Provider is refused at register", throwsFramework(() => ready.register(hostOf("host-one")), /Duplicate Provider/));
  check("Invalid version is refused", throwsFramework(() => createExecutionProviderRegistry().register(hostOf("host-one", { version: "v1" })), /Invalid version/));
  check("Invalid metadata is refused", resolverOf(ready).resolve(inputOf({ executionMetadata: { a: { b: 1 } } })).status === "REJECTED");
  check("a missing input is refused", resolverOf().resolve(null).status === "REJECTED" && resolverOf().resolve(null).snapshot === null);
  check("a refused resolve stores no snapshot", resolverOf().getSnapshot("snapshot-1") === null);

  ready.disable("host-one");
  const disabled = resolverOf(ready).resolve(inputOf());
  check("a disabled host is not compatible", disabled.status === "REJECTED" && has(disabled.issues, /Missing Provider/));
  ready.enable("host-one");

  const sourceInput = inputOf();
  const once = resolverOf(ready).resolve(sourceInput);
  (sourceInput.executionMetadata as { run: string }).run = "changed";
  (sourceInput.contracts as Array<{ id: string }>)[0].id = "changed";
  check("No mutation: changing the input after a resolve leaves the hosts unchanged", once.providers[0]?.id === "host-one" && once.metadata.run === "r1" && once.snapshot!.contractIds[0] === "page-one");
  try {
    (once.providers as Array<{ id: string }>)[0] = { id: "hacked" } as never;
    (once.snapshot!.providerIds as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the resolved hosts cannot be assigned into", once.providers[0]?.id === "host-one" && once.snapshot!.providerIds[0] === "host-one");

  const deterministic = () =>
    createExecutionProviderResolver({
      now: () => 0,
      timestamp: () => "2026-01-01T00:00:00.000Z",
      idFactory: () => "snapshot-fixed",
    });
  const leftReg = createExecutionProviderRegistry();
  leftReg.register(hostOf("host-b", { supportedContracts: ["page-one"] }));
  leftReg.register(hostOf("host-a", { supportedContracts: ["page-one"] }));
  const rightReg = createExecutionProviderRegistry();
  rightReg.register(hostOf("host-a", { supportedContracts: ["page-one"] }));
  rightReg.register(hostOf("host-b", { supportedContracts: ["page-one"] }));
  const first = deterministic();
  first.registry.register(hostOf("host-b", { supportedContracts: ["page-one"] }));
  first.registry.register(hostOf("host-a", { supportedContracts: ["page-one"] }));
  const second = deterministic();
  second.registry.register(hostOf("host-a", { supportedContracts: ["page-one"] }));
  second.registry.register(hostOf("host-b", { supportedContracts: ["page-one"] }));
  const firstResult = first.resolve(inputOf());
  const secondResult = second.resolve(inputOf());
  check(
    "Deterministic resolution: compatible hosts do not depend on a clock or register order",
    firstResult.status === "OK" && firstResult.providers.map((item) => item.id).join() === secondResult.providers.map((item) => item.id).join() && firstResult.providers.map((item) => item.id).join() === "host-a,host-b",
  );

  const left = resolverOf();
  const right = resolverOf();
  left.registry.register(hostOf("host-one"));
  right.registry.register(hostOf("host-one"));
  right.registry.register(hostOf("host-two", { supportedContracts: ["page-one"], capabilities: ["CREATE"] }));
  left.resolve(inputOf());
  right.resolve(inputOf());
  check(
    "Provider independence: resolvers do not share snapshots or registries",
    left.getSnapshot("snapshot-1")?.providerIds.join() === "host-one" &&
      right.getSnapshot("snapshot-1")?.providerIds.join() === "host-one,host-two" &&
      left.registry.count() === 1 &&
      right.registry.count() === 2 &&
      left.getSnapshot("snapshot-2") === null,
  );

  const contract = createExecutionContract({
    id: "page-one",
    name: "page-one",
    version: "1.0.0",
    category: "LANDING_PAGE",
    capabilities: ["declare"],
    requirements: ["plan"],
    inputs: ["plan"],
    outputs: ["record"],
    metadata: {},
  });
  const fromContract = resolverOf(ready).resolve(inputOf({ contracts: [contract] }));
  check("a contract record resolves hosts without invoking them", fromContract.status === "OK" && fromContract.providers[0]?.id === "host-one" && fromContract.snapshot!.planId === "plan-1");

  const calls = { health: 0, validate: 0, supports: 0 };
  const watched = hostOf("host-watch");
  const original = { health: watched.health, validate: watched.validate, supports: watched.supports };
  watched.health = () => {
    calls.health += 1;
    return original.health();
  };
  watched.validate = () => {
    calls.validate += 1;
    return original.validate();
  };
  watched.supports = (...args) => {
    calls.supports += 1;
    return original.supports(...args);
  };
  const watchRegistry = createExecutionProviderRegistry();
  watchRegistry.register(watched);
  resolverOf(watchRegistry).resolve(inputOf());
  watchRegistry.enable("host-watch");
  watchRegistry.disable("host-watch");
  watchRegistry.inspect("host-watch");
  check("No execution: register, resolve, enable, disable, and inspect never invoke host methods", calls.health === 0 && calls.validate === 0 && calls.supports === 0);

  const dir = join(process.cwd(), "src/lib/execution");
  const files = readdirSync(dir).filter((f) => /^execution-provider(-[a-z]+)?\.ts$/.test(f));
  check(
    "six provider modules exist: provider, capabilities, registry, resolver, snapshot, validator",
    files.sort().join() === "execution-provider-capabilities.ts,execution-provider-registry.ts,execution-provider-resolver.ts,execution-provider-snapshot.ts,execution-provider-validator.ts,execution-provider.ts",
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
  check("the framework never calls the task pipeline, plan builder, or host methods", !code.some((l) => /createExecutionTaskPipeline|createExecutionPlanBuilder|\.collect\(|\.build\(|\.health\(|\.supports\(/i.test(l)));
  check("no host ships: the framework registers nothing of its own", !code.some((l) => /\bregister\(\s*\{|\.register\(\s*[a-z]+Provider/.test(l)));
  const architecture = ["execution-context.ts", "execution-plan.ts", "execution-planner.ts", "execution-registry.ts", "execution-types.ts", "execution-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the provider framework", architecture.every((src) => !/execution-provider/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^(execution-task-|execution-plan-|execution-dependency-|execution-contract)/.test(f));
  check("prior execution modules do not import the provider framework", prior.every((f) => !/execution-provider/.test(readFileSync(join(dir, f), "utf8"))));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, Decision, or Workflow module imports the provider framework", !others.some((f) => /execution-provider/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nExecution provider framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
