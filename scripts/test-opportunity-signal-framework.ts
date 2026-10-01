import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createSignalContext } from "../src/lib/opportunity/opportunity-signal-context";
import { SIGNAL_RESULT_STATUSES, type OpportunitySignalModule, type SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline";
import { createSignalRegistry, SignalFrameworkError } from "../src/lib/opportunity/opportunity-signal-registry";
import { resolveSignalOrder } from "../src/lib/opportunity/opportunity-signal-resolver";
import {
  validateDependencies,
  validateNoDuplicateSignalId,
  validateSignalModule,
  validateSignalOutput,
} from "../src/lib/opportunity/opportunity-signal-validator";
import { OPPORTUNITY_SIGNAL_CATEGORIES } from "../src/lib/opportunity/opportunity-types";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

function throwsFramework(fn: () => unknown, field?: string): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof SignalFrameworkError && (field === undefined || error.issues.some((i) => i.field === field));
  }
}

async function rejectsFramework(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof SignalFrameworkError;
  }
}

const OK: SignalOutput = { status: "COMPLETED", confidence: null, metadata: {}, warnings: [], errors: [] };

/** Fictional test fixtures only: these are not signal implementations. */
function fake(id: string, over: Partial<{
  category: OpportunitySignalModule["category"];
  enabled: boolean;
  priority: number;
  requires: string[];
  optional: string[];
  conflicts: string[];
  supports: boolean;
  problems: { field: string; message: string }[];
  analyze: OpportunitySignalModule["analyze"];
  calls: string[];
}> = {}): OpportunitySignalModule {
  return {
    id,
    name: `Fixture ${id}`,
    version: "1.0.0",
    category: over.category ?? "FUTURE",
    enabled: over.enabled ?? true,
    priority: over.priority ?? 100,
    dependencies: { requires: over.requires ?? [], optional: over.optional ?? [], conflicts: over.conflicts ?? [] },
    supportsCandidate: () => over.supports ?? true,
    validate: () => over.problems ?? [],
    analyze:
      over.analyze ??
      ((_context, _upstream) => {
        over.calls?.push(id);
        return OK;
      }),
  };
}

function entries(...modules: OpportunitySignalModule[]) {
  const registry = createSignalRegistry();
  for (const m of modules) registry.register(m);
  return registry.list();
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

async function main() {
  // ---------- contract and categories ----------
  check("nine signal categories", OPPORTUNITY_SIGNAL_CATEGORIES.join(",") === "COMPETITION,COMMERCIAL_INTENT,EVIDENCE,LANDING_PAGE,MARKET,BRAND,OFFER,COMPLIANCE,FUTURE");
  check("three signal result statuses", SIGNAL_RESULT_STATUSES.join(",") === "COMPLETED,FAILED,SKIPPED");
  check("a complete fixture satisfies the contract", validateSignalModule(fake("alpha")).length === 0);

  // ---------- signal validation ----------
  check("missing contract (null) rejected", validateSignalModule(null).length === 1);
  check("missing contract (undefined) rejected", validateSignalModule(undefined).length === 1);
  check("missing contract (empty object) lists every member", validateSignalModule({}).length === 10);
  check("missing method rejected", validateSignalModule({ ...fake("alpha"), analyze: undefined }).some((i) => i.field === "analyze"));
  check("non-function method rejected", validateSignalModule({ ...fake("alpha"), validate: "yes" }).some((i) => i.field === "validate"));
  check("missing dependencies rejected", validateSignalModule({ ...fake("alpha"), dependencies: undefined }).some((i) => i.field === "dependencies"));
  check("invalid category rejected", validateSignalModule({ ...fake("alpha"), category: "SPORTS" }).some((i) => i.field === "category"));
  check("lowercase category rejected", validateSignalModule({ ...fake("alpha"), category: "market" }).some((i) => i.field === "category"));
  for (const bad of ["1.0", "v1.0.0", "", "1.0.0-beta", "01.0.0", "1.0.0.0"]) {
    check(`invalid version "${bad}" rejected`, validateSignalModule({ ...fake("alpha"), version: bad }).some((i) => i.field === "version"));
  }
  check("numeric version rejected", validateSignalModule({ ...fake("alpha"), version: 1 }).some((i) => i.field === "version"));
  check("valid versions accepted", ["0.0.1", "1.2.3", "10.20.30"].every((v) => validateSignalModule({ ...fake("alpha"), version: v }).length === 0));
  check("invalid id rejected", ["Alpha", "1alpha", "al pha", ""].every((id) => validateSignalModule({ ...fake("alpha"), id }).some((i) => i.field === "id")));
  check("empty name rejected", validateSignalModule({ ...fake("alpha"), name: "  " }).some((i) => i.field === "name"));
  check("non-boolean enabled rejected", validateSignalModule({ ...fake("alpha"), enabled: "yes" }).some((i) => i.field === "enabled"));
  check("out-of-range or fractional priority rejected", [-1, 1001, 1.5, "1"].every((priority) => validateSignalModule({ ...fake("alpha"), priority }).some((i) => i.field === "priority")));
  check("self dependency rejected", validateSignalModule(fake("alpha", { requires: ["alpha"] })).some((i) => i.field === "dependencies.requires"));
  check("dependency list that is not a list rejected", validateSignalModule({ ...fake("alpha"), dependencies: { requires: "beta", optional: [], conflicts: [] } }).some((i) => i.field === "dependencies.requires"));
  check("invalid dependency id rejected", validateSignalModule(fake("alpha", { optional: ["Bad Id"] })).some((i) => i.field === "dependencies.optional"));
  check("repeated dependency id rejected", validateSignalModule(fake("alpha", { requires: ["beta", "beta"] })).some((i) => i.field === "dependencies.requires"));
  check("conflicting with a required signal rejected", validateSignalModule(fake("alpha", { requires: ["beta"], conflicts: ["beta"] })).some((i) => i.field === "dependencies.conflicts"));
  check("required and optional overlap rejected", validateSignalModule(fake("alpha", { requires: ["beta"], optional: ["beta"] })).some((i) => i.field === "dependencies.optional"));
  check("duplicate id helper", validateNoDuplicateSignalId(["a", "b"], "b").length === 1 && validateNoDuplicateSignalId(["a"], "c").length === 0);

  // ---------- signal output validation ----------
  check("valid output accepted", validateSignalOutput(OK).length === 0);
  check("output confidence may be a number", validateSignalOutput({ ...OK, confidence: 0.5 }).length === 0);
  check("output with unknown status rejected", validateSignalOutput({ ...OK, status: "DONE" }).some((i) => i.field === "status"));
  check("output with non-finite confidence rejected", validateSignalOutput({ ...OK, confidence: Number.NaN }).some((i) => i.field === "confidence"));
  check("output with nested metadata rejected", validateSignalOutput({ ...OK, metadata: { a: { b: 1 } } }).some((i) => i.field === "metadata"));
  check("output with non-text warnings rejected", validateSignalOutput({ ...OK, warnings: [1] }).some((i) => i.field === "warnings"));
  check("FAILED output requires an error", validateSignalOutput({ ...OK, status: "FAILED" }).some((i) => i.field === "errors"));
  check("non-object output rejected", validateSignalOutput(null).length === 1);

  // ---------- registry ----------
  const registry = createSignalRegistry();
  const alpha = registry.register(fake("alpha", { priority: 10, category: "MARKET" }));
  check("register returns the entry, enabled by the module default", alpha.id === "alpha" && alpha.enabled === true && registry.count() === 1);
  check("duplicate signal id rejected", throwsFramework(() => registry.register(fake("alpha")), "id") && registry.count() === 1);
  check("invalid module is not registered", throwsFramework(() => registry.register({ ...fake("beta"), version: "x" } as OpportunitySignalModule), "version") && registry.count() === 1);
  check("null module is not registered", throwsFramework(() => registry.register(null as unknown as OpportunitySignalModule)) && registry.count() === 1);
  registry.register(fake("beta", { priority: 50, category: "BRAND", enabled: false }));
  registry.register(fake("gamma", { priority: 50, category: "MARKET" }));
  check("a module may start disabled", registry.get("beta")?.enabled === false);
  check("list orders by priority then id", registry.list().map((e) => e.id).join(",") === "beta,gamma,alpha");
  check("list filters by category", registry.list({ category: "MARKET" }).map((e) => e.id).join(",") === "gamma,alpha");
  check("list filters by enabled", registry.list({ enabled: false }).map((e) => e.id).join(",") === "beta");
  check("enable switches the registry state", registry.enable("beta").enabled === true && registry.get("beta")?.enabled === true);
  check("enable leaves the module untouched", registry.get("beta")?.module.enabled === false);
  check("disable switches the registry state", registry.disable("beta").enabled === false);
  check("enable and disable are idempotent", registry.disable("beta").enabled === false && registry.enable("beta").enabled === true && registry.enable("beta").enabled === true);
  check("enable of an unknown signal rejected", throwsFramework(() => registry.enable("nope")));
  check("disable of an unknown signal rejected", throwsFramework(() => registry.disable("nope")));
  check("remove returns the entry and forgets it", registry.remove("gamma").id === "gamma" && registry.get("gamma") === null && registry.count() === 2);
  check("remove of an unknown signal rejected", throwsFramework(() => registry.remove("gamma")));
  check("a removed id can be registered again", registry.register(fake("gamma")).id === "gamma");
  check("get of an unknown signal is null", registry.get("nope") === null);
  check("validate reports without registering", registry.validate({}).length > 0 && registry.validate(fake("delta")).length === 0 && registry.get("delta") === null);

  // ---------- context ----------
  const empty = createSignalContext();
  check("a new context is empty", empty.candidate === null && Object.keys(empty.importedMetadata).length === 0 && Object.keys(empty.executionMetadata).length === 0 && Object.keys(empty.configuration).length === 0 && Object.keys(empty.runtime).length === 0 && Object.keys(empty.extensions).length === 0);
  check("a context carries exactly the six sections", Object.keys(empty).sort().join(",") === "candidate,configuration,executionMetadata,extensions,importedMetadata,runtime");
  const source = { note: "x", count: 1 };
  const candidate = { id: "cand-1", source: "feed", url: "https://example.test/a", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
  const ctx = createSignalContext({ candidate, importedMetadata: source, configuration: { flag: true } });
  source.note = "changed";
  candidate.title = "changed";
  check("the context copies its inputs", ctx.importedMetadata.note === "x" && ctx.candidate?.title === "Fictional item");
  check("the context and its sections are frozen", Object.isFrozen(ctx) && Object.isFrozen(ctx.importedMetadata) && Object.isFrozen(ctx.configuration) && Object.isFrozen(ctx.candidate));
  try {
    (ctx.importedMetadata as Record<string, unknown>).note = "tampered";
  } catch {
    /* strict mode throws; sloppy mode ignores */
  }
  try {
    (ctx as unknown as Record<string, unknown>).candidate = null;
  } catch {
    /* ignored */
  }
  check("the context cannot be changed", ctx.importedMetadata.note === "x" && ctx.candidate?.id === "cand-1");

  // ---------- dependency validation ----------
  check("no dependencies is valid", validateDependencies(entries(fake("a"), fake("b"))).length === 0);
  check("a present required dependency is valid", validateDependencies(entries(fake("a", { requires: ["b"] }), fake("b"))).length === 0);
  check("a missing required dependency is reported", validateDependencies(entries(fake("a", { requires: ["zz"] }))).some((i) => /not registered/.test(i.message)));
  check("a disabled required dependency is reported", validateDependencies(entries(fake("a", { requires: ["b"] }), fake("b", { enabled: false }))).some((i) => /disabled/.test(i.message)));
  check("a missing optional dependency is fine", validateDependencies(entries(fake("a", { optional: ["zz"] }))).length === 0);
  check("a disabled optional dependency is fine", validateDependencies(entries(fake("a", { optional: ["b"] }), fake("b", { enabled: false }))).length === 0);
  check("a conflict between enabled signals is reported once", validateDependencies(entries(fake("a", { conflicts: ["b"] }), fake("b", { conflicts: ["a"] }))).filter((i) => i.field === "dependencies.conflicts").length === 1);
  check("a conflict with a disabled signal is fine", validateDependencies(entries(fake("a", { conflicts: ["b"] }), fake("b", { enabled: false }))).length === 0);
  check("a conflict with an unregistered signal is fine", validateDependencies(entries(fake("a", { conflicts: ["zz"] }))).length === 0);
  const cycle2 = validateDependencies(entries(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] })));
  check("a two-signal cycle is rejected", cycle2.some((i) => /Circular dependency/.test(i.message)));
  const cycle3 = validateDependencies(entries(fake("a", { requires: ["b"] }), fake("b", { requires: ["c"] }), fake("c", { requires: ["a"] }), fake("d")));
  check("a three-signal cycle is rejected and names its path", cycle3.some((i) => /a -> b -> c -> a/.test(i.message)) && cycle3.every((i) => !/\bd\b/.test(i.message)));
  check("a cycle through optional dependencies is rejected", validateDependencies(entries(fake("a", { optional: ["b"] }), fake("b", { requires: ["a"] }))).some((i) => /Circular dependency/.test(i.message)));
  check("a cycle with a disabled member is not a cycle", validateDependencies(entries(fake("a", { optional: ["b"] }), fake("b", { optional: ["a"], enabled: false }))).length === 0);
  const before = JSON.stringify(createSignalRegistry().list());
  const probe = createSignalRegistry();
  probe.register(fake("a", { requires: ["b"] }));
  probe.register(fake("b", { enabled: false }));
  const snapshot = JSON.stringify(probe.list().map((e) => [e.id, e.enabled]));
  validateDependencies(probe.list());
  check("validation never enables or registers anything", JSON.stringify(probe.list().map((e) => [e.id, e.enabled])) === snapshot && probe.count() === 2 && before === "[]");

  // ---------- execution order ----------
  const ordered = resolveSignalOrder(entries(fake("c", { requires: ["b"], priority: 900 }), fake("b", { requires: ["a"], priority: 500 }), fake("a", { priority: 1 })));
  check("dependencies run before their dependents regardless of priority", ordered.order.join(",") === "a,b,c" && ordered.issues.length === 0);
  check("independent signals run by priority then id", resolveSignalOrder(entries(fake("m", { priority: 5 }), fake("k", { priority: 5 }), fake("z", { priority: 50 }))).order.join(",") === "z,k,m");
  check("a present optional dependency runs first", resolveSignalOrder(entries(fake("a", { optional: ["b"], priority: 900 }), fake("b", { priority: 1 }))).order.join(",") === "b,a");
  check("disabled signals are not ordered", resolveSignalOrder(entries(fake("a"), fake("b", { enabled: false }))).order.join(",") === "a");
  const invalidOrder = resolveSignalOrder(entries(fake("a", { requires: ["b"] }), fake("b", { requires: ["a"] })));
  check("invalid dependencies give no order and a list of issues", invalidOrder.order.length === 0 && invalidOrder.issues.length > 0);
  check("an empty registry has an empty order", resolveSignalOrder([]).order.length === 0);

  // ---------- pipeline ----------
  const calls: string[] = [];
  let tick = 0;
  const clock = () => (tick += 5);
  const pipe = createSignalPipeline({ now: clock });
  pipe.register(fake("alpha", { calls, priority: 10 }));
  pipe.register(fake("beta", { calls, priority: 20 }));
  pipe.register(fake("gamma", { calls, priority: 30, enabled: false }));
  check("pipeline registers, enables, and disables", pipe.enable("gamma").enabled === true && pipe.disable("gamma").enabled === false);
  check("pipeline exposes its registry", pipe.registry.count() === 3);
  check("pipeline validates dependencies", pipe.validateDependencies().length === 0);
  check("pipeline resolves an order", pipe.resolveExecutionOrder().order.join(",") === "beta,alpha");
  const run1 = await pipe.run(ctx);
  check("run executes enabled signals in order and collects results", run1.order.join(",") === "beta,alpha" && run1.results.map((r) => r.signalId).join(",") === "beta,alpha" && calls.join(",") === "beta,alpha");
  check("disabled signals are not run", !calls.includes("gamma") && run1.results.length === 2);
  check("results carry status, confidence, metadata, warnings, errors, and executionTime", run1.results.every((r) => r.status === "COMPLETED" && r.confidence === null && typeof r.metadata === "object" && Array.isArray(r.warnings) && Array.isArray(r.errors) && r.executionTime === 5));
  check("a result has no score", run1.results.every((r) => Object.keys(r).sort().join(",") === "confidence,errors,executionTime,metadata,signalId,status,warnings" && !("score" in r)));
  check("results are frozen", run1.results.every((r) => Object.isFrozen(r) && Object.isFrozen(r.warnings)));
  check("a failed run is repeatable", (await pipe.run(ctx)).results.length === 2);

  // sequential execution, no overlap
  let active = 0;
  let maxActive = 0;
  const slow = (id: string) => fake(id, {
    analyze: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return OK;
    },
  });
  const seq = createSignalPipeline();
  for (const id of ["s1", "s2", "s3"]) seq.register(slow(id));
  await seq.run(ctx);
  check("signals run strictly one at a time", maxActive === 1);
  const overlap = createSignalPipeline();
  overlap.register(slow("s1"));
  const first = overlap.run(ctx);
  check("an overlapping run is refused", await rejectsFramework(() => overlap.run(ctx)));
  await first;
  check("a run can start again after the previous finished", (await overlap.run(ctx)).results.length === 1);

  // context identity and upstream
  const seen: unknown[] = [];
  const up: Record<string, string[]> = {};
  const wiring = createSignalPipeline();
  wiring.register(fake("one", { analyze: (c, u) => { seen.push(c); up.one = Object.keys(u); return { ...OK, metadata: { from: "one" } }; } }));
  wiring.register(fake("two", { requires: ["one"], analyze: (c, u) => { seen.push(c); up.two = Object.keys(u); seen.push(u.one?.metadata.from); return OK; } }));
  wiring.register(fake("three", { optional: ["one", "zz"], analyze: (c, u) => { seen.push(c); up.three = Object.keys(u); return OK; } }));
  wiring.register(fake("four", { analyze: (_c, u) => { up.four = Object.keys(u); return OK; } }));
  await wiring.run(ctx);
  check("every signal receives the same shared context", seen.filter((s) => s === ctx).length === 3);
  check("a signal sees only the results it declared", up.one.length === 0 && up.two.join() === "one" && up.three.join() === "one" && up.four.length === 0);
  check("a required result is readable upstream", seen.includes("one"));

  // skipping, failing
  const flow: string[] = [];
  const mixed = createSignalPipeline({ now: clock });
  mixed.register(fake("unsupported", { supports: false, priority: 90, analyze: () => { flow.push("unsupported"); return OK; } }));
  mixed.register(fake("invalid-ctx", { problems: [{ field: "importedMetadata", message: "Missing data." }], priority: 80, analyze: () => { flow.push("invalid-ctx"); return OK; } }));
  mixed.register(fake("thrower", { priority: 70, analyze: () => { throw new Error("boom"); } }));
  mixed.register(fake("async-thrower", { priority: 65, analyze: async () => { throw new Error("late boom"); } }));
  mixed.register(fake("malformed", { priority: 60, analyze: () => ({ status: "COMPLETED" } as unknown as SignalOutput) }));
  mixed.register(fake("reports-failure", { priority: 55, analyze: () => ({ ...OK, status: "FAILED", errors: ["reported"] }) }));
  mixed.register(fake("needs-failed", { requires: ["thrower"], priority: 50, analyze: () => { flow.push("needs-failed"); return OK; } }));
  mixed.register(fake("needs-skipped", { requires: ["unsupported"], priority: 45, analyze: () => { flow.push("needs-skipped"); return OK; } }));
  mixed.register(fake("wants-failed", { optional: ["thrower"], priority: 40, analyze: () => { flow.push("wants-failed"); return OK; } }));
  mixed.register(fake("last", { priority: 1, analyze: () => { flow.push("last"); return OK; } }));
  const report = await mixed.run(ctx);
  const by = Object.fromEntries(report.results.map((r) => [r.signalId, r]));
  check("an unsupported candidate is SKIPPED", by.unsupported.status === "SKIPPED" && by.unsupported.warnings.length === 1 && !flow.includes("unsupported"));
  check("a signal's validate() issues make it FAILED without running analyze", by["invalid-ctx"].status === "FAILED" && by["invalid-ctx"].errors[0].includes("Missing data") && !flow.includes("invalid-ctx"));
  check("a throwing signal is FAILED with its message", by.thrower.status === "FAILED" && by.thrower.errors[0] === "boom");
  check("an async rejection is FAILED with its message", by["async-thrower"].status === "FAILED" && by["async-thrower"].errors[0] === "late boom");
  check("a malformed output is FAILED", by.malformed.status === "FAILED" && by.malformed.errors[0].startsWith("Invalid signal output"));
  check("a signal may report its own failure", by["reports-failure"].status === "FAILED" && by["reports-failure"].errors[0] === "reported");
  check("a signal whose required signal failed is SKIPPED, not run", by["needs-failed"].status === "SKIPPED" && !flow.includes("needs-failed") && /thrower/.test(by["needs-failed"].warnings[0]));
  check("a signal whose required signal was skipped is SKIPPED, not run", by["needs-skipped"].status === "SKIPPED" && !flow.includes("needs-skipped"));
  check("a failed optional dependency does not block", by["wants-failed"].status === "COMPLETED" && flow.includes("wants-failed"));
  check("one failure does not stop later signals", by.last.status === "COMPLETED" && report.results.length === 10);

  // refusing invalid dependencies
  const bad = createSignalPipeline();
  const badCalls: string[] = [];
  bad.register(fake("a", { requires: ["missing"], calls: badCalls }));
  bad.register(fake("b", { calls: badCalls }));
  check("a run with invalid dependencies is refused and runs nothing", (await rejectsFramework(() => bad.run(ctx))) && badCalls.length === 0);
  check("the refusal does not repair the registry", bad.registry.count() === 2 && bad.registry.get("a")?.enabled === true && bad.registry.get("missing") === null);
  bad.remove("a");
  check("after removing the offender the run succeeds", (await bad.run(ctx)).results.length === 1 && badCalls.join() === "b");
  const cyc = createSignalPipeline();
  cyc.register(fake("a", { requires: ["b"] }));
  cyc.register(fake("b", { requires: ["a"] }));
  check("a circular dependency refuses the run", await rejectsFramework(() => cyc.run(ctx)));
  cyc.disable("b");
  check("disabling a required signal is reported, not repaired", cyc.validateDependencies().some((i) => /disabled/.test(i.message)) && cyc.registry.get("b")?.enabled === false);
  check("an empty pipeline runs to an empty report", (await createSignalPipeline().run(ctx)).results.length === 0);

  // ---------- genericity ----------
  const dir = join(process.cwd(), "src/lib/opportunity");
  const files = walk(dir).filter((f) => /opportunity-signal-/.test(f));
  check("seven framework modules exist", files.length === 7);
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const code = lines.filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome/i.test(l)));
  check("no campaign ids or marketplace names", !lines.some((l) => /campaign|clickbank|hotmart|amazon|shopify|ebay|aliexpress|walmart|digistore/i.test(l)));
  check("no Google Ads or keyword logic", !lines.some((l) => /google|adwords|gclid|keyword/i.test(l)));
  check("no scoring, weights, or recommendations in code", !code.some((l) => /\bscor(e|ing)\b|weight|recommend/i.test(l)));
  check("no AI, network, database, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|better-sqlite3|getDb|setTimeout|setInterval|Promise\.all|Promise\.race|new Worker|worker_threads|child_process/i.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("imports stay inside opportunity (and the Discovery candidate type)", code.filter((l) => /^\s*import\b.*\bfrom\s+["']/.test(l)).every((l) => /from\s+["']\.\//.test(l) || /import type \{ DiscoveryCandidate \} from "\.\.\/discovery\/discovery-types"/.test(l)));
  check("no concrete signal ships: the only register call is the pipeline's delegation", code.filter((l) => /\.register\(/.test(l)).every((l) => /register: \(module\) => registry\.register\(module\)/.test(l)));
  const all = walk(join(process.cwd(), "src/lib/opportunity")).filter((f) => f.endsWith(".ts"));
  check("no signal id is defined outside tests", !all.some((f) => /id:\s*["'](competition|commercial|evidence|landing|market|brand|offer|compliance)/i.test(readFileSync(f, "utf8"))));
  const discoveryFiles = walk(join(process.cwd(), "src/lib/discovery"));
  check("Discovery does not import the opportunity module", !discoveryFiles.some((f) => /opportunity\//.test(readFileSync(f, "utf8").split(/\r?\n/).filter((l) => /^\s*import\b/.test(l)).join("\n"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nOpportunity signal framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
