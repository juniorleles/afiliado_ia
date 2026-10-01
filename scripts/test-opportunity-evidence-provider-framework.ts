import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { SIGNAL_PRIORITY_MAX, SIGNAL_PRIORITY_MIN, isSignalVersion } from "../src/lib/opportunity/opportunity-signal-validator.ts";
import {
  cloneFrozenData,
  createEvidenceContext,
  describeNonPlainData,
  isDeepFrozen,
  isPlainObject,
  type EvidenceContext,
} from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import {
  EVIDENCE_KINDS,
  EVIDENCE_RESULT_STATUSES,
  type EvidenceCollectionResult,
  type EvidenceKind,
  type EvidenceProvider,
} from "../src/lib/opportunity/providers/evidence-provider-contract.ts";
import type {
  CommercialIntentProvider,
  CompletenessProvider,
  InitialEvidenceProviders,
  LpQualityProvider,
  ManualOverridesProvider,
  PresentationPlanProvider,
  ProductFactsProvider,
  ResearchProvider,
} from "../src/lib/opportunity/providers/evidence-provider-initial.ts";
import {
  EvidenceFrameworkError,
  createEvidenceRegistry,
} from "../src/lib/opportunity/providers/evidence-provider-registry.ts";
import { createEvidenceResolver, evidenceOf, mergeEvidence } from "../src/lib/opportunity/providers/evidence-provider-resolver.ts";
import {
  PROVIDER_PRIORITY_MAX,
  PROVIDER_PRIORITY_MIN,
  isEvidenceKind,
  isProviderVersion,
  validateEvidenceContext,
  validateEvidenceOutput,
  validateEvidenceProvider,
  validateEvidenceProviders,
  validateNoDuplicateProviderId,
} from "../src/lib/opportunity/providers/evidence-provider-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const URL_A = "https://example.test/gizmo";
const candidate = { id: "cand-1", source: "feed", url: URL_A, title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };

let log: string[] = [];

interface FakeOptions {
  id?: string;
  name?: unknown;
  version?: unknown;
  kind?: unknown;
  priority?: unknown;
  enabled?: unknown;
  supports?: (context: EvidenceContext) => boolean;
  collect?: (context: EvidenceContext) => unknown;
  validate?: (context: EvidenceContext) => Array<{ field: string; message: string }>;
  payload?: unknown;
}

function fake(over: FakeOptions = {}): EvidenceProvider {
  const id = over.id ?? "facts-a";
  return {
    id,
    name: over.name ?? `Provider ${id}`,
    version: over.version ?? "1.0.0",
    kind: over.kind ?? "PRODUCT_FACTS",
    priority: over.priority ?? 100,
    enabled: over.enabled ?? true,
    supports: over.supports ?? (() => true),
    collect:
      over.collect ??
      (() => {
        log.push(`collect:${id}`);
        return { payload: over.payload === undefined ? { from: id, list: ["x"], nested: { n: 1 } } : over.payload, metadata: { by: id }, warnings: [] };
      }),
    validate: over.validate ?? (() => []),
  } as unknown as EvidenceProvider;
}

const clock = () => 0;
const ctx = createEvidenceContext({ candidate, resolvedProductData: { sku: "gizmo", list: [1, 2], nested: { ok: true } }, metadata: { run: "r1" } });
const emptyCtx = createEvidenceContext();

const has = (issues: Array<{ field: string; message: string }>, field: string) => issues.some((i) => i.field === field);
const hasText = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

async function rejects(fn: () => unknown, pattern?: RegExp): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof EvidenceFrameworkError && (pattern ? pattern.test(error.message + JSON.stringify(error.issues)) : true);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

async function main() {
  // ---------- constants and contracts ----------
  check("seven evidence kinds", EVIDENCE_KINDS.join(",") === "PRODUCT_FACTS,RESEARCH,COMPLETENESS,LP_QUALITY,PRESENTATION_PLAN,MANUAL_OVERRIDES,COMMERCIAL_INTENT");
  check("four result statuses", EVIDENCE_RESULT_STATUSES.join(",") === "COLLECTED,EMPTY,FAILED,SKIPPED");
  check("kind guard", EVIDENCE_KINDS.every(isEvidenceKind) && !isEvidenceKind("NOPE") && !isEvidenceKind(3));

  // Compile-time: each initial contract is satisfiable and typed to its payload. Nothing here is a real provider.
  const base = { name: "Fixture", version: "1.0.0", priority: 1, enabled: true, supports: () => true, validate: () => [] };
  const facts: ProductFactsProvider = { ...base, id: "typed-facts", kind: "PRODUCT_FACTS", collect: () => ({ payload: emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED"), metadata: {}, warnings: [] }) };
  const research: ResearchProvider = { ...base, id: "typed-research", kind: "RESEARCH", collect: () => ({ payload: null, metadata: {}, warnings: [] }) };
  const completeness: CompletenessProvider = { ...base, id: "typed-completeness", kind: "COMPLETENESS", collect: async () => ({ payload: null, metadata: {}, warnings: [] }) };
  const lpQuality: LpQualityProvider = { ...base, id: "typed-lp-quality", kind: "LP_QUALITY", collect: () => ({ payload: null, metadata: {}, warnings: [] }) };
  const plan: PresentationPlanProvider = { ...base, id: "typed-plan", kind: "PRESENTATION_PLAN", collect: () => ({ payload: null, metadata: {}, warnings: [] }) };
  const overrides: ManualOverridesProvider = { ...base, id: "typed-overrides", kind: "MANUAL_OVERRIDES", collect: () => ({ payload: [{ field: "cta", value: "Go" }], metadata: {}, warnings: [] }) };
  const commercial: CommercialIntentProvider = { ...base, id: "typed-commercial", kind: "COMMERCIAL_INTENT", collect: () => ({ payload: { channel: "FUTURE", observations: [{ dimension: "MARKET_DEMAND", evidence: "Fixture observation" }] }, metadata: {}, warnings: [] }) };
  // @ts-expect-error a facts provider cannot return a number as its payload
  const wrongPayload: ProductFactsProvider = { ...base, id: "typed-wrong", kind: "PRODUCT_FACTS", collect: () => ({ payload: 5, metadata: {}, warnings: [] }) };
  const all: InitialEvidenceProviders = { PRODUCT_FACTS: facts, RESEARCH: research, COMPLETENESS: completeness, LP_QUALITY: lpQuality, PRESENTATION_PLAN: plan, MANUAL_OVERRIDES: overrides, COMMERCIAL_INTENT: commercial };
  check("every initial contract is satisfiable and keyed by kind", EVIDENCE_KINDS.every((k) => all[k].kind === k) && wrongPayload.id === "typed-wrong");
  check("each typed fixture meets the runtime contract", Object.values(all).every((p) => validateEvidenceProvider(p).length === 0));

  // ---------- context ----------
  check("an empty context has every member, empty", emptyCtx.candidate === null && Object.keys(emptyCtx).sort().join(",") === "candidate,configuration,extensions,metadata,resolvedProductData,runtime" && ["resolvedProductData", "metadata", "runtime", "configuration", "extensions"].every((k) => Object.keys((emptyCtx as unknown as Record<string, object>)[k]).length === 0));
  check("a context is deeply frozen", isDeepFrozen(ctx) && Object.isFrozen(ctx.resolvedProductData) && Object.isFrozen((ctx.resolvedProductData as { nested: object }).nested) && Object.isFrozen(ctx.candidate));
  check("a context rejects mutation", Reflect.set(ctx.metadata, "x", 1) === false && Reflect.set(ctx.resolvedProductData, "x", 1) === false);
  const source = { sku: "s", nested: { n: 1 }, list: [1] };
  const copyCtx = createEvidenceContext({ resolvedProductData: source });
  source.nested.n = 99;
  source.list.push(2);
  check("a context copies its inputs", (copyCtx.resolvedProductData as typeof source).nested.n === 1 && (copyCtx.resolvedProductData as typeof source).list.length === 1);
  check("a context never freezes the caller's own objects", !Object.isFrozen(source) && !Object.isFrozen(source.nested));
  class Box { v = 1; }
  const box = new Box();
  const keepRef = createEvidenceContext({ resolvedProductData: { box } });
  check("objects that are not plain data are kept by reference and left unfrozen", (keepRef.resolvedProductData as { box: Box }).box === box && !Object.isFrozen(box));
  check("a valid context validates", validateEvidenceContext(ctx).length === 0 && validateEvidenceContext(emptyCtx).length === 0);
  check("undefined object properties are accepted as absent", validateEvidenceContext(createEvidenceContext({ resolvedProductData: { a: undefined, b: 1 } })).length === 0 && !("a" in createEvidenceContext({ resolvedProductData: { a: undefined } }).resolvedProductData));
  const good = { candidate: null, resolvedProductData: {}, metadata: {}, runtime: {}, configuration: {}, extensions: {} };
  check("nested resolved product data is accepted", validateEvidenceContext({ ...good, resolvedProductData: { facts: emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED") } }).length === 0);
  check("a missing context is rejected", [null, undefined, "x", 5, [], true].every((v) => has(validateEvidenceContext(v), "context")));
  check("every missing member is reported", Object.keys(good).every((k) => has(validateEvidenceContext({ ...good, [k]: undefined }), `context.${k}`)) && validateEvidenceContext({}).length === 6);
  check("an invalid candidate is rejected", [{}, { id: "" }, { id: 5 }, [], "c"].every((c) => has(validateEvidenceContext({ ...good, candidate: c }), "context.candidate")) && has(validateEvidenceContext({ ...good, candidate: { id: "c", when: new Date() } }), "context.candidate"));
  const cyc: Record<string, unknown> = { a: 1 };
  cyc.self = cyc;
  let deep: Record<string, unknown> = { leaf: 1 };
  for (let i = 0; i < 100; i += 1) deep = { inner: deep };
  const badData: unknown[] = [[], "x", 5, null, { f: () => 1 }, { d: new Date() }, { b: new Box() }, { n: Number.NaN }, { n: Number.POSITIVE_INFINITY }, { l: [undefined] }, { big: BigInt(1) }, { s: Symbol("x") }, cyc, deep];
  check("product data that is not plain data is rejected", badData.every((d) => has(validateEvidenceContext({ ...good, resolvedProductData: d }), "context.resolvedProductData")));
  check("the rejection names the offending path", hasText(validateEvidenceContext({ ...good, resolvedProductData: { a: { b: [1, () => 1] } } }), /resolvedProductData\.a\.b\[1\]/) && hasText(validateEvidenceContext({ ...good, resolvedProductData: cyc }), /cycle/));
  check("a shared (non-cyclic) object is not mistaken for a cycle", describeNonPlainData({ a: cyc.a, b: cyc.a }) === null && describeNonPlainData((() => { const s = { v: 1 }; return { a: s, b: s }; })()) === null);
  check("invalid flat members are rejected", ["metadata", "runtime", "configuration", "extensions"].every((k) => has(validateEvidenceContext({ ...good, [k]: { a: { b: 1 } } }), `context.${k}`) && has(validateEvidenceContext({ ...good, [k]: { a: [1] } }), `context.${k}`) && has(validateEvidenceContext({ ...good, [k]: { a: Number.NaN } }), `context.${k}`) && has(validateEvidenceContext({ ...good, [k]: { " ": "x" } }), `context.${k}`) && has(validateEvidenceContext({ ...good, [k]: [] }), `context.${k}`)));
  check("flat members accept strings, numbers, booleans, and null", validateEvidenceContext({ ...good, configuration: { a: "s", b: 2, c: true, d: null } }).length === 0);
  check("plain data helpers", isPlainObject({}) && isPlainObject(Object.create(null)) && !isPlainObject([]) && !isPlainObject(new Box()) && !isPlainObject(null) && describeNonPlainData({ ok: [1, "a", null, { z: false }] }) === null);
  const clonedCycle = cloneFrozenData(cyc) as Record<string, unknown>;
  check("cloning keeps a cycle instead of following it forever", clonedCycle.self === clonedCycle && clonedCycle !== cyc && Object.isFrozen(clonedCycle));

  // ---------- provider contract validation ----------
  check("a valid provider validates", validateEvidenceProvider(fake()).length === 0);
  check("a missing contract is rejected", [null, undefined, "x", 5].every((v) => has(validateEvidenceProvider(v), "provider")));
  check("an empty object misses every member and method", validateEvidenceProvider({}).length === 9);
  for (const member of ["id", "name", "version", "kind", "priority", "enabled", "supports", "collect", "validate"]) {
    check(`a provider without "${member}" is rejected`, has(validateEvidenceProvider({ ...fake(), [member]: undefined }), member));
  }
  check("methods must be functions", ["supports", "collect", "validate"].every((m) => has(validateEvidenceProvider({ ...fake(), [m]: "fn" }), m)));
  check("invalid ids are rejected", ["", "Facts", "1facts", "facts_a", "facts a", "-a", 5].every((id) => has(validateEvidenceProvider({ ...fake(), id }), "id")));
  check("valid ids are accepted", ["a", "facts-a", "facts-2", "p1"].every((id) => !has(validateEvidenceProvider({ ...fake(), id }), "id")));
  check("invalid versions are rejected", ["1", "1.0", "v1.0.0", "01.0.0", "1.0.0-beta", "1.0.0.0", "", " 1.0.0", 1, true].every((version) => has(validateEvidenceProvider({ ...fake(), version }), "version")));
  check("valid versions are accepted", ["0.0.1", "1.0.0", "10.20.30"].every((version) => !has(validateEvidenceProvider({ ...fake(), version }), "version")));
  check("version rules match the signal framework's", ["1", "1.0", "v1.0.0", "01.0.0", "1.0.0-beta", "0.0.1", "1.0.0", "10.20.30", "", 1].every((v) => isProviderVersion(v) === isSignalVersion(v)));
  check("priority bounds match the signal framework's", PROVIDER_PRIORITY_MIN === SIGNAL_PRIORITY_MIN && PROVIDER_PRIORITY_MAX === SIGNAL_PRIORITY_MAX);
  check("invalid priorities are rejected", [-1, 1001, 1.5, "5", Number.NaN, Number.POSITIVE_INFINITY].every((priority) => has(validateEvidenceProvider({ ...fake(), priority }), "priority")));
  check("priorities 0 and 1000 are accepted", [0, 1000].every((priority) => !has(validateEvidenceProvider({ ...fake(), priority }), "priority")));
  check("a blank name, an unsupported kind, and a non-boolean enabled are rejected", has(validateEvidenceProvider({ ...fake(), name: "  " }), "name") && has(validateEvidenceProvider({ ...fake(), kind: "MARKET" }), "kind") && has(validateEvidenceProvider({ ...fake(), enabled: "yes" }), "enabled"));
  check("every problem is reported at once", validateEvidenceProvider({ id: "A", name: "", version: "x", kind: "NOPE", priority: -5, enabled: "y", supports() {}, collect: 1, validate: 2 }).length >= 7);
  check("a duplicate id is reported", validateNoDuplicateProviderId(["a", "b"], "b").length === 1 && validateNoDuplicateProviderId(["a", "b"], "c").length === 0 && validateNoDuplicateProviderId([], "a").length === 0);
  const listIssues = validateEvidenceProviders([fake({ id: "dup-a" }), fake({ id: "dup-a" }), fake({ id: "ok-b" }), fake({ id: "bad-c", version: "x" }), null]);
  check("a provider list reports duplicates, contract breaks, and positions", hasText(listIssues, /providers\[1\] \(dup-a\)\.id/) && hasText(listIssues, /appears more than once/) && hasText(listIssues, /providers\[3\] \(bad-c\)\.version/) && hasText(listIssues, /providers\[4\]\.provider/) && !hasText(listIssues, /ok-b/));
  check("a provider list that is not a list is rejected, and an empty one is fine", has(validateEvidenceProviders("x"), "providers") && validateEvidenceProviders([]).length === 0);

  // ---------- output validation ----------
  const out = (over: Record<string, unknown> = {}) => ({ payload: { a: 1 }, metadata: {}, warnings: [], ...over });
  check("valid output validates, with a payload or a null payload", validateEvidenceOutput(out()).length === 0 && validateEvidenceOutput(out({ payload: null })).length === 0 && validateEvidenceOutput(out({ payload: [1, 2] })).length === 0 && validateEvidenceOutput(out({ payload: "text" })).length === 0);
  check("malformed output is rejected", [null, undefined, "x", []].every((v) => has(validateEvidenceOutput(v), "output")) && has(validateEvidenceOutput(out({ payload: undefined })), "payload") && has(validateEvidenceOutput(out({ payload: () => 1 })), "payload") && has(validateEvidenceOutput(out({ payload: { n: Number.NaN } })), "payload") && has(validateEvidenceOutput(out({ metadata: { a: { b: 1 } } })), "metadata") && has(validateEvidenceOutput(out({ metadata: null })), "metadata") && has(validateEvidenceOutput(out({ warnings: "w" })), "warnings") && has(validateEvidenceOutput(out({ warnings: [1] })), "warnings"));

  // ---------- registry ----------
  const registry = createEvidenceRegistry();
  check("the registry starts empty: nothing is registered by default", registry.count() === 0 && registry.list().length === 0);
  const entry = registry.register(fake({ id: "facts-a" }));
  check("a provider registers", entry.id === "facts-a" && entry.enabled === true && registry.count() === 1 && registry.get("facts-a")?.provider.kind === "PRODUCT_FACTS");
  check("a duplicate id is rejected", await rejects(() => registry.register(fake({ id: "facts-a", kind: "RESEARCH" })), /already registered/) && registry.count() === 1);
  check("an invalid provider is rejected with every issue", await rejects(() => registry.register(fake({ id: "bad", version: "1" })), /version/) && await rejects(() => registry.register({} as never), /missing/) && registry.count() === 1);
  check("a missing contract is rejected", await rejects(() => registry.register(null as never)));
  check("registering a disabled provider keeps it disabled", registry.register(fake({ id: "off-b", enabled: false })).enabled === false);
  registry.register(fake({ id: "research-a", kind: "RESEARCH", priority: 50 }));
  registry.register(fake({ id: "facts-b", priority: 100 }));
  registry.register(fake({ id: "facts-c", priority: 200 }));
  check("providers list by priority then id", registry.list().map((e) => e.id).join() === "facts-c,facts-a,facts-b,off-b,research-a");
  check("providers filter by kind and enabled", registry.list({ kind: "RESEARCH" }).map((e) => e.id).join() === "research-a" && registry.list({ enabled: false }).map((e) => e.id).join() === "off-b" && registry.list({ kind: "PRODUCT_FACTS", enabled: true }).length === 3);
  check("a provider can be disabled and enabled", registry.disable("facts-a").enabled === false && registry.get("facts-a")?.enabled === false && registry.enable("facts-a").enabled === true);
  check("a provider can be removed", registry.remove("facts-b").id === "facts-b" && registry.get("facts-b") === null && registry.count() === 4);
  check("an unknown id is rejected", await rejects(() => registry.enable("nope"), /not registered/) && await rejects(() => registry.disable("nope")) && await rejects(() => registry.remove("nope")));
  check("validate reports without registering", registry.validate(fake({ id: "probe", version: "x" })).length > 0 && registry.validate(fake({ id: "probe" })).length === 0 && registry.get("probe") === null);

  // ---------- resolver: registration and selection ----------
  log = [];
  const resolver = createEvidenceResolver({ now: clock });
  check("a resolver starts with an empty registry", resolver.registry.count() === 0);
  resolver.registerProvider(fake({ id: "facts-low", priority: 10 }));
  resolver.registerProvider(fake({ id: "facts-high", priority: 90 }));
  resolver.registerProvider(fake({ id: "research-a", kind: "RESEARCH", priority: 50, supports: () => false }));
  resolver.registerProvider(fake({ id: "plan-a", kind: "PRESENTATION_PLAN", enabled: false }));
  check("providers register through the resolver", resolver.registry.count() === 4 && await rejects(() => resolver.registerProvider(fake({ id: "facts-low" })), /already registered/));
  const resolution = resolver.resolveProviders(ctx);
  check("resolution lists enabled, supporting providers in run order", resolution.providers.map((e) => e.id).join() === "facts-high,facts-low");
  check("resolution lists enabled providers that do not apply, and leaves disabled ones out", resolution.unsupported.map((u) => u.entry.id).join() === "research-a" && resolution.unsupported[0].error === null);
  check("resolution filters by kind", resolver.resolveProviders(ctx, { kind: "RESEARCH" }).providers.length === 0 && resolver.resolveProviders(ctx, { kind: "PRODUCT_FACTS" }).providers.length === 2);
  check("a provider can be disabled and enabled through the resolver", resolver.disableProvider("facts-low").enabled === false && resolver.resolveProviders(ctx).providers.map((e) => e.id).join() === "facts-high" && resolver.enableProvider("facts-low").enabled === true && resolver.enableProvider("plan-a").enabled === true && resolver.resolveProviders(ctx).providers.map((e) => e.id).join() === "plan-a,facts-high,facts-low");
  resolver.disableProvider("plan-a");
  const throwingSupport = createEvidenceResolver({ now: clock });
  throwingSupport.registerProvider(fake({ id: "facts-t", supports: () => { throw new Error("support down"); } }));
  const tr = throwingSupport.resolveProviders(ctx);
  check("a supports() that throws is reported, not thrown", tr.providers.length === 0 && tr.unsupported[0].error === "support down");
  check("resolving checks supports() without collecting", log.length === 0);
  check("an invalid context stops resolution", await rejects(() => resolver.resolveProviders({} as never), /context is invalid/) && await rejects(() => resolver.resolveProviders(null as never)));

  // ---------- resolver: validation of providers ----------
  const validating = createEvidenceResolver({ now: clock });
  const mutable = fake({ id: "facts-m" }) as { version: unknown };
  validating.registerProvider(mutable as never);
  validating.registerProvider(fake({ id: "research-v", kind: "RESEARCH", validate: () => [{ field: "resolvedProductData.sku", message: "SKU is required." }] }));
  validating.registerProvider(fake({ id: "plan-v", kind: "PRESENTATION_PLAN", supports: () => false, validate: () => [{ field: "x", message: "never asked" }] }));
  validating.registerProvider(fake({ id: "lp-v", kind: "LP_QUALITY", validate: () => { throw new Error("validate down"); } }));
  check("registered providers that meet the contract validate cleanly without a context", validating.validateProviders().length === 0);
  check("a context adds each applicable provider's own problems, prefixed with its id", hasText(validating.validateProviders(ctx), /research-v\.resolvedProductData\.sku SKU is required/) && hasText(validating.validateProviders(ctx), /lp-v validate down/) && !hasText(validating.validateProviders(ctx), /never asked/));
  mutable.version = "bad";
  check("a contract broken after registration is found", hasText(validating.validateProviders(), /facts-m\.version/));
  check("an invalid context is reported as issues, not thrown", hasText(validating.validateProviders({ nope: 1 } as never), /context\.candidate/));
  check("validating providers collects nothing", log.length === 0);

  // ---------- resolver: collection ----------
  log = [];
  const collecting = createEvidenceResolver({ now: clock });
  collecting.registerProvider(fake({ id: "facts-a", priority: 100 }));
  collecting.registerProvider(fake({ id: "research-a", kind: "RESEARCH", priority: 80, payload: null }));
  collecting.registerProvider(fake({ id: "plan-a", kind: "PRESENTATION_PLAN", priority: 60, supports: () => false }));
  collecting.registerProvider(fake({ id: "lp-a", kind: "LP_QUALITY", priority: 40, validate: () => [{ field: "resolvedProductData.sku", message: "SKU is required." }] }));
  collecting.registerProvider(fake({ id: "comp-a", kind: "COMPLETENESS", priority: 30, collect: () => { throw new Error("collect down"); } }));
  collecting.registerProvider(fake({ id: "over-a", kind: "MANUAL_OVERRIDES", priority: 20, collect: async () => ({ payload: [{ field: "cta", value: "Go" }], metadata: { async: true }, warnings: ["note"] }) }));
  collecting.registerProvider(fake({ id: "facts-off", enabled: false }));
  const results = await collecting.collectEvidence(ctx);
  const by = (id: string) => results.find((r) => r.providerId === id)!;
  check("every enabled provider yields one result, disabled ones none", results.length === 6 && !results.some((r) => r.providerId === "facts-off"));
  check("results come in run order", results.map((r) => r.providerId).join() === "facts-a,research-a,plan-a,lp-a,comp-a,over-a");
  check("a payload is COLLECTED", by("facts-a").status === "COLLECTED" && by("facts-a").errors.length === 0);
  check("a null payload is EMPTY", by("research-a").status === "EMPTY" && by("research-a").payload === null);
  check("an unsupported context is SKIPPED with a warning", by("plan-a").status === "SKIPPED" && by("plan-a").warnings.length === 1 && !log.includes("collect:plan-a"));
  check("a provider's own validation problems make it FAILED and stop collect()", by("lp-a").status === "FAILED" && /resolvedProductData\.sku: SKU is required/.test(by("lp-a").errors.join()) && !log.includes("collect:lp-a"));
  check("a throwing provider is FAILED, not thrown", by("comp-a").status === "FAILED" && by("comp-a").errors.join() === "collect down");
  check("an async provider is awaited, with its metadata and warnings", by("over-a").status === "COLLECTED" && by("over-a").metadata.async === true && by("over-a").warnings.join() === "note");
  check("one failure does not stop the others", by("over-a").status === "COLLECTED" && by("facts-a").status === "COLLECTED");
  check("each result carries the provider's identity", results.every((r) => r.providerVersion === "1.0.0" && EVIDENCE_KINDS.includes(r.kind) && Number.isInteger(r.priority)) && by("over-a").kind === "MANUAL_OVERRIDES" && by("facts-a").priority === 100);
  check("providers run one after another, highest priority first", log.join() === "collect:facts-a,collect:research-a");
  check("executionTime comes from the clock", results.every((r) => r.executionTime === 0));
  const ticking = createEvidenceResolver({ now: (() => { let t = 0; return () => (t += 5); })() });
  ticking.registerProvider(fake({ id: "facts-a" }));
  check("executionTime is measured per provider", (await ticking.collectEvidence(ctx))[0].executionTime === 5);
  const threwSupport = await throwingSupport.collectEvidence(ctx);
  check("a supports() that throws is FAILED", threwSupport.length === 1 && threwSupport[0].status === "FAILED" && threwSupport[0].errors.join() === "support down");

  const malformed: Array<[string, unknown]> = [
    ["an undefined payload", { payload: undefined, metadata: {}, warnings: [] }],
    ["a function in the payload", { payload: { f: () => 1 }, metadata: {}, warnings: [] }],
    ["a class instance in the payload", { payload: new Box(), metadata: {}, warnings: [] }],
    ["nested metadata", { payload: { a: 1 }, metadata: { a: { b: 1 } }, warnings: [] }],
    ["warnings that are not text", { payload: { a: 1 }, metadata: {}, warnings: [1] }],
    ["no output at all", undefined],
    ["a non-object output", "text"],
  ];
  const malformedResolver = createEvidenceResolver({ now: clock });
  malformed.forEach(([, value], i) => malformedResolver.registerProvider(fake({ id: `bad-${i}`, collect: () => value })));
  const malformedResults = await malformedResolver.collectEvidence(ctx);
  check("malformed provider output becomes FAILED", malformedResults.length === malformed.length && malformedResults.every((r) => r.status === "FAILED" && r.payload === null && /Invalid provider output/.test(r.errors.join())));
  check("a FAILED result never carries a payload", malformedResults.every((r) => r.payload === null));

  // payload isolation
  const original = { from: "orig", list: [1, 2], nested: { n: 1 } };
  const isolating = createEvidenceResolver({ now: clock });
  isolating.registerProvider(fake({ id: "facts-i", collect: () => ({ payload: original, metadata: {}, warnings: [] }) }));
  const [iso] = await isolating.collectEvidence(ctx);
  const isoPayload = iso.payload as typeof original;
  check("the payload handed on is a frozen copy", isoPayload !== original && JSON.stringify(isoPayload) === JSON.stringify(original) && isDeepFrozen(isoPayload));
  check("the provider's own object is left untouched and unfrozen", !Object.isFrozen(original) && !Object.isFrozen(original.nested));
  original.nested.n = 2;
  check("later changes to the provider's object do not reach the evidence", isoPayload.nested.n === 1);
  check("the result is frozen", Object.isFrozen(iso) && Object.isFrozen(iso.metadata) && Object.isFrozen(iso.warnings) && Object.isFrozen(iso.errors));

  // context handed to providers
  const seen: Array<{ context: EvidenceContext; frozen: boolean; blocked: boolean }> = [];
  const observing = createEvidenceResolver({ now: clock });
  observing.registerProvider(fake({ id: "facts-o", collect: (context) => {
    seen.push({ context, frozen: isDeepFrozen(context), blocked: Reflect.set(context.metadata, "x", 1) === false });
    return { payload: { ok: true }, metadata: {}, warnings: [] };
  } }));
  await observing.collectEvidence(ctx);
  check("a frozen context reaches providers as the same object", seen[0].context === ctx && seen[0].frozen && seen[0].blocked);
  const loose = { candidate: null, resolvedProductData: { a: { b: 1 } }, metadata: {}, runtime: {}, configuration: {}, extensions: {} } as unknown as EvidenceContext;
  await observing.collectEvidence(loose);
  check("an unfrozen context reaches providers as a frozen copy, and the caller's object is left alone", seen[1].context !== loose && seen[1].frozen && seen[1].blocked && !Object.isFrozen(loose) && !Object.isFrozen(loose.resolvedProductData));
  check("an invalid context stops collection before any provider runs", await rejects(() => observing.collectEvidence({} as never), /context is invalid/) && await rejects(() => observing.collectEvidence({ ...loose, resolvedProductData: { f: () => 1 } } as never), /resolvedProductData/) && seen.length === 2);

  // no caching
  log = [];
  const uncached = createEvidenceResolver({ now: clock });
  uncached.registerProvider(fake({ id: "facts-a" }));
  const first = await uncached.collectEvidence(ctx);
  const second = await uncached.collectEvidence(ctx);
  check("nothing is cached: every call asks the provider again", log.join() === "collect:facts-a,collect:facts-a" && first[0] !== second[0] && first[0].payload !== second[0].payload);
  check("repeated collection of an unchanged provider is deterministic", JSON.stringify({ ...first[0], executionTime: 0 }) === JSON.stringify({ ...second[0], executionTime: 0 }));
  let live = "one";
  uncached.registerProvider(fake({ id: "facts-live", priority: 150, collect: () => ({ payload: { value: live }, metadata: {}, warnings: [] }) }));
  const before = (await uncached.run(ctx)).merged;
  live = "two";
  const after = (await uncached.run(ctx)).merged;
  check("a changed source shows up on the next run", (evidenceOf(before, "PRODUCT_FACTS")!.payload as { value: string }).value === "one" && (evidenceOf(after, "PRODUCT_FACTS")!.payload as { value: string }).value === "two");

  // ---------- merge ----------
  const result = (over: Partial<EvidenceCollectionResult> & { providerId: string }): EvidenceCollectionResult => ({
    providerVersion: "1.0.0",
    kind: "PRODUCT_FACTS",
    priority: 100,
    status: "COLLECTED",
    payload: { from: over.providerId },
    metadata: {},
    warnings: [],
    errors: [],
    executionTime: 0,
    ...over,
  });
  const merged = mergeEvidence([
    result({ providerId: "facts-low", priority: 10 }),
    result({ providerId: "facts-high", priority: 90, warnings: ["thin"] }),
    result({ providerId: "research-a", kind: "RESEARCH", priority: 50, payload: { r: 1 } }),
    result({ providerId: "plan-a", kind: "PRESENTATION_PLAN", status: "EMPTY", payload: null }),
    result({ providerId: "lp-a", kind: "LP_QUALITY", status: "FAILED", payload: null, errors: ["lp down"] }),
    result({ providerId: "comp-a", kind: "COMPLETENESS", status: "SKIPPED", payload: null }),
  ]);
  check("merging keeps one item per kind", merged.collectedKinds.join() === "PRODUCT_FACTS,RESEARCH" && merged.missingKinds.join() === "COMPLETENESS,LP_QUALITY,PRESENTATION_PLAN,MANUAL_OVERRIDES,COMMERCIAL_INTENT");
  check("the higher priority wins whole and the other is recorded as superseded", evidenceOf(merged, "PRODUCT_FACTS")?.providerId === "facts-high" && merged.superseded.length === 1 && merged.superseded[0].providerId === "facts-low" && merged.superseded[0].supersededBy === "facts-high" && merged.superseded[0].kind === "PRODUCT_FACTS");
  check("payloads are never combined", JSON.stringify(evidenceOf(merged, "PRODUCT_FACTS")!.payload) === JSON.stringify({ from: "facts-high" }));
  check("an item names its provider, version, and priority", (() => { const item = evidenceOf(merged, "RESEARCH")!; return item.providerId === "research-a" && item.providerVersion === "1.0.0" && item.priority === 50 && item.kind === "RESEARCH"; })());
  check("only COLLECTED results contribute, and absence stays absence", evidenceOf(merged, "PRESENTATION_PLAN") === null && evidenceOf(merged, "LP_QUALITY") === null && evidenceOf(merged, "COMPLETENESS") === null && evidenceOf(merged, "MANUAL_OVERRIDES") === null);
  check("failures are listed with their errors and warned about", merged.failed.length === 1 && merged.failed[0].providerId === "lp-a" && merged.failed[0].errors.join() === "lp down" && merged.warnings.some((w) => w.startsWith("lp-a: collection failed")));
  check("provider warnings are prefixed, and superseding is warned", merged.warnings.includes("facts-high: thin") && merged.warnings.includes("PRODUCT_FACTS: facts-low was superseded by facts-high."));
  check("merge metadata is flat and counts every outcome", merged.metadata.collectedCount === 2 && merged.metadata.missingCount === 5 && merged.metadata.emptyCount === 1 && merged.metadata.failedCount === 1 && merged.metadata.skippedCount === 1 && merged.metadata.supersededCount === 1 && merged.metadata["provider.PRODUCT_FACTS"] === "facts-high" && merged.metadata["version.RESEARCH"] === "1.0.0" && Object.values(merged.metadata).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  check("merged evidence is frozen", Object.isFrozen(merged) && Object.isFrozen(merged.items) && Object.isFrozen(merged.items.PRODUCT_FACTS) && Object.isFrozen(merged.metadata));
  const tie = mergeEvidence([result({ providerId: "facts-z" }), result({ providerId: "facts-b" })]);
  check("equal priorities go to the lower id, whatever the input order", evidenceOf(tie, "PRODUCT_FACTS")?.providerId === "facts-b" && mergeEvidence([result({ providerId: "facts-b" }), result({ providerId: "facts-z" })]).items.PRODUCT_FACTS?.providerId === "facts-b");
  const emptyHigh = mergeEvidence([result({ providerId: "facts-high", priority: 200, status: "EMPTY", payload: null }), result({ providerId: "facts-low", priority: 10 })]);
  check("an EMPTY higher-priority provider does not block a lower one, and nothing is invented", evidenceOf(emptyHigh, "PRODUCT_FACTS")?.providerId === "facts-low" && mergeEvidence([result({ providerId: "facts-high", priority: 200, status: "EMPTY", payload: null })]).collectedKinds.length === 0);
  check("merging nothing gives an empty result", (() => { const m = mergeEvidence([]); return m.collectedKinds.length === 0 && m.missingKinds.length === EVIDENCE_KINDS.length && m.warnings.length === 0 && m.metadata.collectedKinds === ""; })());
  check("a repeated provider id in the results is rejected", await rejects(() => mergeEvidence([result({ providerId: "facts-a" }), result({ providerId: "facts-a", kind: "RESEARCH" })]), /more than once/));
  check("kinds come out in the framework's order whatever the input order", mergeEvidence([result({ providerId: "o", kind: "MANUAL_OVERRIDES" }), result({ providerId: "r", kind: "RESEARCH" }), result({ providerId: "f" })]).collectedKinds.join() === "PRODUCT_FACTS,RESEARCH,MANUAL_OVERRIDES");
  check("the resolver's merge is the standalone merge", JSON.stringify(resolver.mergeEvidence([result({ providerId: "facts-a" })])) === JSON.stringify(mergeEvidence([result({ providerId: "facts-a" })])));
  const inputResults = [result({ providerId: "facts-low", priority: 10 }), result({ providerId: "facts-high", priority: 90 })];
  const snapshot = JSON.stringify(inputResults);
  mergeEvidence(inputResults);
  check("merging does not change its input or its order", JSON.stringify(inputResults) === snapshot);

  // ---------- run ----------
  log = [];
  const runner = createEvidenceResolver({ now: clock });
  runner.registerProvider(fake({ id: "facts-a", priority: 100 }));
  runner.registerProvider(fake({ id: "facts-b", priority: 20 }));
  runner.registerProvider(fake({ id: "research-a", kind: "RESEARCH", payload: { quality: "HIGH" } }));
  const report = await runner.run(ctx);
  check("run collects, then merges", report.results.length === 3 && report.merged.collectedKinds.join() === "PRODUCT_FACTS,RESEARCH" && report.merged.superseded.length === 1);
  check("run honors a kind filter", (await runner.run(ctx, { kind: "RESEARCH" })).results.map((r) => r.providerId).join() === "research-a");
  check("run with no providers is empty", (await createEvidenceResolver().run(ctx)).merged.collectedKinds.length === 0);
  const shared = createEvidenceRegistry();
  shared.register(fake({ id: "facts-a" }));
  const viaShared = createEvidenceResolver({ registry: shared, now: clock });
  check("a resolver can work on a registry it is given", viaShared.registry === shared && (await viaShared.run(ctx)).merged.collectedKinds.join() === "PRODUCT_FACTS");
  const lone = createEvidenceResolver({ now: clock });
  lone.registerProvider(fake({ id: "facts-a", priority: 1 }));
  const loneReport = await lone.run(ctx);
  check("evidence reaches a consumer typed by kind", (() => { const item = evidenceOf(loneReport.merged, "PRODUCT_FACTS"); return item !== null && (item.payload as unknown as { from: string }).from === "facts-a"; })());

  // ---------- boundaries ----------
  const root = process.cwd();
  const dir = join(root, "src/lib/opportunity/providers");
  const files = walk(dir).filter((f) => f.endsWith(".ts"));
  check("six framework modules exist: context, contract, initial contracts, registry, resolver, validator", files.map((f) => f.split(/[\\/]/).pop()).sort().join() === "evidence-provider-context.ts,evidence-provider-contract.ts,evidence-provider-initial.ts,evidence-provider-registry.ts,evidence-provider-resolver.ts,evidence-provider-validator.ts");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const code = lines.filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no campaign ids, marketplaces, or slugs", !lines.some((l) => /campaign|clickbank|hotmart|amazon|shopify|ebay|aliexpress|walmart|digistore|slug/i.test(l)));
  // The COMMERCIAL_INTENT kind and its contract type are the only mentions of commercial intent the framework may carry.
  check("no Google Ads, competition, intent, or market analysis", !code.some((l) => /google|adwords|gclid|keyword|competit|commercial|marketAnaly/i.test(l.replace(/COMMERCIAL_INTENT|CommercialIntent[A-Za-z]*|commercial-intent-provider-contract/g, ""))));
  check("no scoring, ranking, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank(ing)?\b|recommend/i.test(l.replace(/\bbyRank\b/g, ""))));
  check("no AI, network, crawling, database, timers, or file writes", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|worker_threads|new Worker/i.test(l)));
  check("no caching or memoization in code", !code.some((l) => /\bcache|memoi[sz]|localStorage|sessionStorage/i.test(l)));
  check("providers run one at a time", !code.some((l) => /Promise\.(all|race|allSettled|any)/.test(l)));
  check("no randomness or wall-clock reads", !code.some((l) => /Math\.random|Date\.now|new Date\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 15);
  const platform = [...new Set(imports.filter((i) => i.from.startsWith("@/")).map((i) => i.from))].sort();
  check("platform imports are type-only", imports.filter((i) => i.from.startsWith("@/")).every((i) => i.typeOnly) && platform.length > 0);
  check("the platform is referenced only for the six payload types", platform.join() === "@/lib/completeness-engine,@/lib/lp-quality-predictor,@/lib/manual-overrides,@/lib/market-research/types,@/lib/presentation-plan,@/lib/product-facts");
  check("the Discovery candidate is the only other outside type", imports.filter((i) => i.from.includes("discovery")).every((i) => i.typeOnly && i.from === "../../discovery/discovery-types") && imports.filter((i) => i.from.includes("discovery")).length === 1);
  const local = imports.filter((i) => !i.from.startsWith("@/") && !i.from.includes("discovery")).map((i) => i.from);
  check("other imports stay inside the framework or use the shared opportunity types", local.every((f) => /^\.\/evidence-provider-[a-z]+$/.test(f) || f === "../opportunity-types" || f === "../opportunity-validator" || f === "../commercial-intent-provider-contract"));
  check("the framework does not depend on any signal", !imports.some((i) => /opportunity-signal|\/evidence-(analyzer|result|signal|validator)|landing-page-potential/.test(i.from)));
  check("nothing implements a provider: no ids or kinds are defined in code", !code.some((l) => /\bid:\s*["']/.test(l) || /\bkind:\s*["'][A-Z_]+["']/.test(l)));
  check("the initial contracts export types only", !readFileSync(join(dir, "evidence-provider-initial.ts"), "utf8").split(/\r?\n/).filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).some((l) => /^export\s+(const|let|var|function|class|enum|default)\b/.test(l)));
  check("no provider is registered by the framework itself", !code.some((l) => /\.register\(|registerProvider\(/.test(l) && !/register\(provider|registerProvider: \(provider\) => registry\.register\(provider\)|register\(provider:|registerProvider\(provider:/.test(l)));
  check("the code never assigns into inputs", !code.some((l) => /\b(inputs|input|context|payload|output)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));

  // existing modules are not wired to the framework and were not edited to know about it
  const opportunityDir = join(root, "src/lib/opportunity");
  // The Competition and Commercial Intent signals and the Opportunity Resolver are the consumers of the framework; the other modules, the Explanation Engine included, do not reference it.
  const others = readdirSync(opportunityDir).filter((f) => f.endsWith(".ts") && !f.startsWith("competition-") && !f.startsWith("commercial-intent-") && !f.startsWith("opportunity-resolver")).map((f) => join(opportunityDir, f));
  check("no opportunity module other than the competition, commercial intent, and resolver modules references the providers", !others.some((f) => /providers\/|evidence-provider/.test(readFileSync(f, "utf8"))));
  const discoveryFiles = walk(join(root, "src/lib/discovery"));
  check("Discovery does not import the opportunity module", !discoveryFiles.some((f) => /opportunity\//.test(readFileSync(f, "utf8").split(/\r?\n/).filter((l) => /^\s*import\b/.test(l)).join("\n"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nEvidence provider framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
