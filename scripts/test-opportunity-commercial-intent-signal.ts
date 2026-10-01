import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeImportCompleteness } from "../src/lib/completeness-engine.ts";
import { predictLpQuality } from "../src/lib/lp-quality-predictor.ts";
import { planPresentation } from "../src/lib/presentation-plan.ts";
import { analyzeProductProfile } from "../src/lib/product-profile.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { analyzeEvidence } from "../src/lib/opportunity/evidence-analyzer.ts";
import { registerEvidenceSignal } from "../src/lib/opportunity/evidence-signal.ts";
import { registerLandingPagePotentialSignal } from "../src/lib/opportunity/landing-page-potential-signal.ts";
import type { LandingPagePotentialInputs } from "../src/lib/opportunity/landing-page-potential-result.ts";
import { registerCompetitionSignal } from "../src/lib/opportunity/competition-signal.ts";
import { CommercialIntentInputError, analyzeCommercialIntent } from "../src/lib/opportunity/commercial-intent-analyzer.ts";
import {
  COMMERCIAL_INTENT_CHANNELS,
  COMMERCIAL_INTENT_OBSERVATION_KEYS,
  COMMERCIAL_INTENT_PAYLOAD_KEYS,
  type CommercialIntentEvidence,
  type CommercialIntentProviderContract,
} from "../src/lib/opportunity/commercial-intent-provider-contract.ts";
import {
  COMMERCIAL_INTENT_DIMENSIONS,
  COMMERCIAL_INTENT_DIMENSION_MEANINGS,
  commercialIntentResultToSignalOutput,
  type CommercialIntentDimension,
} from "../src/lib/opportunity/commercial-intent-result.ts";
import {
  COMMERCIAL_INTENT_SIGNAL_ID,
  createCommercialIntentSignal,
  defaultCommercialIntentContextFactory,
  registerCommercialIntentSignal,
} from "../src/lib/opportunity/commercial-intent-signal.ts";
import {
  validateCommercialIntentContext,
  validateCommercialIntentDimensions,
  validateCommercialIntentEvidence,
  validateCommercialIntentInputs,
  validateCommercialIntentProviders,
  validateCommercialIntentResult,
} from "../src/lib/opportunity/commercial-intent-validator.ts";
import { createSignalContext } from "../src/lib/opportunity/opportunity-signal-context.ts";
import { executeSignal } from "../src/lib/opportunity/opportunity-signal-executor.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import { createSignalRegistry, SignalFrameworkError } from "../src/lib/opportunity/opportunity-signal-registry.ts";
import { validateSignalModule } from "../src/lib/opportunity/opportunity-signal-validator.ts";
import type { OpportunitySignalModule } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext, isDeepFrozen } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import { EVIDENCE_KINDS, type EvidenceKind, type EvidenceProvider } from "../src/lib/opportunity/providers/evidence-provider-contract.ts";
import { createEvidenceResolver } from "../src/lib/opportunity/providers/evidence-provider-resolver.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const clock = () => 0;
const URL_A = "https://example.test/gizmo";
const candidate = { id: "cand-1", source: "feed", url: URL_A, title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const ectx = createEvidenceContext({ candidate });
const sctx = createSignalContext({ candidate });
const emptySctx = createSignalContext();

type Dim = CommercialIntentDimension;
const obs = (dimension: string, evidence = "A fictional observation", sourceUrl?: string) => ({ dimension, evidence, ...(sourceUrl === undefined ? {} : { sourceUrl }) });
const ev = (channel: string, observations: unknown[] = []): CommercialIntentEvidence => ({ channel, observations }) as unknown as CommercialIntentEvidence;
const allObservations = () => COMMERCIAL_INTENT_DIMENSIONS.map((d) => obs(d));

let log: string[] = [];
interface FakeOpts {
  id?: string;
  kind?: EvidenceKind;
  priority?: number;
  enabled?: boolean;
  supports?: boolean;
  validate?: Array<{ field: string; message: string }>;
  collect?: () => unknown;
  warnings?: string[];
  version?: string;
}
function provider(payload: unknown, over: FakeOpts = {}): EvidenceProvider {
  const id = over.id ?? "intent-a";
  return {
    id,
    name: `Provider ${id}`,
    version: over.version ?? "1.0.0",
    kind: over.kind ?? "COMMERCIAL_INTENT",
    priority: over.priority ?? 100,
    enabled: over.enabled ?? true,
    supports: () => {
      log.push(`supports:${id}`);
      return over.supports ?? true;
    },
    collect:
      over.collect ??
      (() => {
        log.push(`collect:${id}`);
        return { payload, metadata: { by: id }, warnings: over.warnings ?? [] };
      }),
    validate: () => {
      log.push(`validate:${id}`);
      return over.validate ?? [];
    },
  } as unknown as EvidenceProvider;
}
function resolverWith(...providers: EvidenceProvider[]) {
  const resolver = createEvidenceResolver({ now: clock });
  for (const p of providers) resolver.registerProvider(p);
  return resolver;
}
const source = (providerId: string, payload: CommercialIntentEvidence, providerVersion = "1.0.0") => ({ providerId, providerVersion, payload });
const run = (sources: ReturnType<typeof source>[], over: Record<string, unknown> = {}) => analyzeCommercialIntent({ candidate, sources, ...over } as never, clock);

const sameSet = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));
const stableNoChannel = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" || /^channels/.test(k) ? 0 : v));

async function main() {
  // ---------- constants and the provider contract ----------
  check("ten dimensions, in the requested order", COMMERCIAL_INTENT_DIMENSIONS.join() === "PURCHASE_INTENT,PROBLEM_AWARENESS,SOLUTION_AWARENESS,OFFER_VISIBILITY,PRICE_VISIBILITY,CONSUMER_TRUST,MARKET_DEMAND,BUYER_READINESS,RECURRING_PURCHASE_POTENTIAL,UPSELL_POTENTIAL");
  check("every dimension says what it is evidence about", COMMERCIAL_INTENT_DIMENSIONS.every((d) => COMMERCIAL_INTENT_DIMENSION_MEANINGS[d].length > 10) && Object.keys(COMMERCIAL_INTENT_DIMENSION_MEANINGS).length === 10);
  check("seven channels are named for future providers", COMMERCIAL_INTENT_CHANNELS.join() === "GOOGLE,SEO,MARKETPLACE,AFFILIATE,SOCIAL,EMAIL,FUTURE");
  check("an observation and a payload have fixed keys, with no strength, score, or rating", COMMERCIAL_INTENT_OBSERVATION_KEYS.join() === "dimension,evidence,sourceUrl" && COMMERCIAL_INTENT_PAYLOAD_KEYS.join() === "channel,observations");
  check("COMMERCIAL_INTENT is a kind of the Evidence Provider Framework", (EVIDENCE_KINDS as readonly string[]).includes("COMMERCIAL_INTENT") && EVIDENCE_KINDS.length === 7);

  // Compile-time: a provider of the contract is satisfiable for every channel and typed to its payload. Nothing here is a real provider.
  const base = { name: "Fixture", version: "1.0.0", priority: 1, enabled: true, supports: () => true, validate: () => [] };
  const typed: CommercialIntentProviderContract[] = COMMERCIAL_INTENT_CHANNELS.map((channel) => ({
    ...base,
    id: `typed-${channel.toLowerCase()}`,
    kind: "COMMERCIAL_INTENT" as const,
    collect: () => ({ payload: { channel, observations: [{ dimension: "MARKET_DEMAND" as const, evidence: "Fixture observation", sourceUrl: URL_A }] }, metadata: {}, warnings: [] }),
  }));
  // @ts-expect-error a channel that is not in the contract cannot be a payload
  const wrongChannel: CommercialIntentProviderContract = { ...base, id: "typed-wrong", kind: "COMMERCIAL_INTENT", collect: () => ({ payload: { channel: "NOPE", observations: [] }, metadata: {}, warnings: [] }) };
  check("a provider contract is satisfiable for each channel", typed.length === 7 && typed.every((p) => p.kind === "COMMERCIAL_INTENT") && wrongChannel.id === "typed-wrong");
  const registered = resolverWith(...(typed as unknown as EvidenceProvider[]));
  check("providers for every channel register in one resolver", registered.registry.count() === 7);

  // ---------- analyzer ----------
  const none = run([]);
  check("no sources: everything missing, confidence null, still COMPLETED, with a warning", none.status === "COMPLETED" && none.availableDimensions.length === 0 && none.missingDimensions.length === 10 && none.confidence === null && none.warnings.length === 1);
  const emptyList = run([source("p", ev("FUTURE"))]);
  check("a provider that reported no observations: everything missing, with its own warning", emptyList.availableDimensions.length === 0 && emptyList.confidence === null && /no observations/.test(emptyList.warnings[0]) && emptyList.metadata.sourceCount === 1);
  for (const dimension of COMMERCIAL_INTENT_DIMENSIONS) {
    const one = run([source("p", ev("FUTURE", [obs(dimension)]))]);
    check(`one ${dimension} observation covers ${dimension} and nothing else`, one.availableDimensions.join() === dimension && one.missingDimensions.length === 9 && one.confidence === 0.1 && one.metadata[`count.${dimension}`] === 1);
  }
  const full = run([source("a", ev("GOOGLE", allObservations().slice(0, 5))), source("b", ev("EMAIL", allObservations().slice(5)))]);
  check("two providers together cover all ten, confidence 1", full.availableDimensions.length === 10 && full.missingDimensions.length === 0 && full.confidence === 1 && full.metadata.channels === "EMAIL,GOOGLE" && full.metadata.providers === "a,b");
  check("the channels behind each dimension are listed as provenance", full.metadata["channels.PURCHASE_INTENT"] === "GOOGLE" && full.metadata["channels.UPSELL_POTENTIAL"] === "EMAIL");
  const repeated = run([source("a", ev("SEO", [obs("MARKET_DEMAND", "one"), obs("MARKET_DEMAND", "two")])), source("b", ev("SOCIAL", [obs("MARKET_DEMAND", "three")]))]);
  check("observations are counted, and providers agree on one dimension without conflict", repeated.metadata["count.MARKET_DEMAND"] === 3 && repeated.metadata["channels.MARKET_DEMAND"] === "SEO,SOCIAL" && repeated.availableDimensions.join() === "MARKET_DEMAND");

  // channel-agnostic: the same observations give the same analysis whatever the channel says
  const reference = run([source("p", ev("FUTURE", [obs("PURCHASE_INTENT"), obs("PRICE_VISIBILITY"), obs("UPSELL_POTENTIAL")]))]);
  const perChannel = COMMERCIAL_INTENT_CHANNELS.map((channel) => run([source("p", ev(channel, [obs("PURCHASE_INTENT"), obs("PRICE_VISIBILITY"), obs("UPSELL_POTENTIAL")]))]));
  check("every channel yields the same availability, confidence, and warnings", perChannel.every((r) => sameSet(r.availableDimensions, reference.availableDimensions) && r.confidence === reference.confidence && r.warnings.join() === reference.warnings.join()));
  check("only the channel provenance differs between channels", perChannel.every((r) => stableNoChannel(r) === stableNoChannel(reference)) && new Set(perChannel.map((r) => r.metadata.channels)).size === 7);
  const swapped = run([source("a", ev("GOOGLE", [obs("PURCHASE_INTENT")])), source("b", ev("EMAIL", [obs("PRICE_VISIBILITY")]))]);
  const swappedBack = run([source("a", ev("EMAIL", [obs("PURCHASE_INTENT")])), source("b", ev("GOOGLE", [obs("PRICE_VISIBILITY")]))]);
  check("swapping which channel supplied which observation changes nothing in the analysis", swapped.availableDimensions.join() === swappedBack.availableDimensions.join() && swapped.confidence === swappedBack.confidence);

  // dimension subsets
  const subset = run([source("p", ev("SEO", [obs("PURCHASE_INTENT"), obs("UPSELL_POTENTIAL")]))], { dimensions: ["UPSELL_POTENTIAL", "MARKET_DEMAND", "PURCHASE_INTENT"] });
  check("a subset keeps canonical order, says what it left out, and scales confidence to it", subset.availableDimensions.join() === "PURCHASE_INTENT,UPSELL_POTENTIAL" && subset.missingDimensions.join() === "MARKET_DEMAND" && subset.confidence === 0.667 && String(subset.metadata.notEvaluated).split(",").length === 7 && subset.metadata.evaluatedCount === 3);
  const ignored = run([source("p", ev("SEO", [obs("PRICE_VISIBILITY")]))], { dimensions: ["PURCHASE_INTENT"] });
  check("an observation for a dimension that is not checked is ignored, and that dimension has no entry", ignored.availableDimensions.length === 0 && !("dimension.PRICE_VISIBILITY" in ignored.metadata) && ignored.metadata.observationCount === 1);

  // shape
  check("available and missing never overlap, together cover what was checked, in canonical order", [reference.availableDimensions, reference.missingDimensions].every((l) => l.join() === COMMERCIAL_INTENT_DIMENSIONS.filter((d) => l.includes(d)).join()) && reference.availableDimensions.length + reference.missingDimensions.length === 10 && !reference.availableDimensions.some((d) => reference.missingDimensions.includes(d)));
  check("the result carries exactly the requested fields", Object.keys(reference).sort().join() === "availableDimensions,confidence,executionTime,metadata,missingDimensions,status,warnings");
  check("no score, ranking, or recommendation anywhere", !/score|rank|recommend|strength|rating/i.test(JSON.stringify(Object.keys(full.metadata)) + Object.keys(full).join()));
  check("metadata is flat", Object.values(full.metadata).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  check("provenance survives: candidate, providers with versions, channels, counts", full.metadata.candidateId === "cand-1" && full.metadata.candidateSource === "feed" && full.metadata.providerVersions === "a@1.0.0,b@1.0.0" && full.metadata.sourceCount === 2 && full.metadata.observationCount === 10);
  check("the absence and provenance notes are stated", /does not mean there is no commercial intent/.test(String(none.metadata.absenceNote)) && /not independently verified/.test(String(none.metadata.provenanceNote)));
  check("every dimension records its meaning as the basis", COMMERCIAL_INTENT_DIMENSIONS.every((d) => full.metadata[`basis.${d}`] === COMMERCIAL_INTENT_DIMENSION_MEANINGS[d]));
  const passthrough = run([], { metadata: { run: "r1", flag: true }, warnings: ["collected with care"] });
  check("input metadata passes through as input.<key> and collection warnings travel with the result", passthrough.metadata["input.run"] === "r1" && passthrough.metadata["input.flag"] === true && passthrough.warnings.includes("collected with care"));
  let tick = 0;
  check("execution time comes from the injected clock", analyzeCommercialIntent({ candidate, sources: [] }, () => (tick += 5)).executionTime >= 5);
  check("the analysis is deterministic", stable(run([source("a", ev("GOOGLE", allObservations()))])) === stable(run([source("a", ev("GOOGLE", allObservations()))])));
  const out = commercialIntentResultToSignalOutput(full);
  check("the framework output has no errors and no execution time", out.errors.length === 0 && !("executionTime" in out) && out.status === "COMPLETED" && out.confidence === 1);

  // read-only
  const frozenSources = [source("a", ev("GOOGLE", [obs("MARKET_DEMAND", "x", URL_A)]))];
  const deepFrozen = JSON.parse(JSON.stringify(frozenSources));
  const freeze = (v: unknown): void => {
    if (typeof v !== "object" || v === null) return;
    Object.freeze(v);
    for (const inner of Object.values(v)) freeze(inner);
  };
  freeze(deepFrozen);
  const before = JSON.stringify(deepFrozen);
  analyzeCommercialIntent({ candidate: Object.freeze({ ...candidate }), sources: deepFrozen }, clock);
  check("the analysis leaves frozen evidence and candidate unchanged", JSON.stringify(deepFrozen) === before);

  // ---------- validator ----------
  check("duplicate dimensions are rejected", has(validateCommercialIntentDimensions(["MARKET_DEMAND", "MARKET_DEMAND"]), /Duplicate dimension/));
  check("unknown, empty, and non-list dimensions are rejected", has(validateCommercialIntentDimensions(["NOPE"]), /not supported/) && validateCommercialIntentDimensions([]).length === 1 && validateCommercialIntentDimensions("MARKET_DEMAND").length === 1);
  check("all dimensions are valid", validateCommercialIntentDimensions([...COMMERCIAL_INTENT_DIMENSIONS]).length === 0);
  const good = { candidate, sources: [source("a", ev("GOOGLE", [obs("MARKET_DEMAND", "x", URL_A)]))] };
  check("valid inputs pass; dimensions, warnings, and metadata are optional", validateCommercialIntentInputs(good).length === 0 && validateCommercialIntentInputs({ ...good, dimensions: null, metadata: null, warnings: null }).length === 0 && validateCommercialIntentInputs({ candidate, sources: [] }).length === 0);
  check("missing inputs are rejected", validateCommercialIntentInputs(null).length === 1 && validateCommercialIntentInputs(undefined).length === 1);
  check("a missing or malformed candidate is rejected", has(validateCommercialIntentInputs({ sources: [] }), /Candidate is required/) && has(validateCommercialIntentInputs({ ...good, candidate: { id: "", source: "s", url: "u", title: "t" } }), /Candidate is invalid/) && has(validateCommercialIntentInputs({ ...good, candidate: "x" }), /Candidate is invalid/));
  check("sources that are not a list, or not objects, are rejected", has(validateCommercialIntentInputs({ candidate }), /Sources must be a list/) && has(validateCommercialIntentInputs({ candidate, sources: [5] }), /must be an object/) && has(validateCommercialIntentInputs({ candidate, sources: [{ payload: ev("SEO") }] }), /name its provider/));
  check("the same provider twice is rejected", has(validateCommercialIntentInputs({ candidate, sources: [source("a", ev("SEO")), source("a", ev("EMAIL"))] }), /Duplicate provider/));
  check("a source without its provider's version is rejected", has(validateCommercialIntentInputs({ candidate, sources: [source("a", ev("SEO"), "one")] }), /version/));
  check("a duplicate dimension in the inputs is rejected", has(validateCommercialIntentInputs({ ...good, dimensions: ["MARKET_DEMAND", "MARKET_DEMAND"] }), /Duplicate dimension/));
  for (const metadata of [{ a: { b: 1 } }, { a: Number.NaN }, { "": 1 }, { a: [1] }, "text", []]) {
    check(`invalid metadata ${JSON.stringify(metadata)} is rejected`, has(validateCommercialIntentInputs({ ...good, metadata }), /Metadata is invalid/));
  }
  check("warnings that are not text are rejected", has(validateCommercialIntentInputs({ ...good, warnings: [1] }), /Warnings must be/));

  check("a well-formed payload passes, with or without a sourceUrl", validateCommercialIntentEvidence(ev("SEO", [obs("MARKET_DEMAND", "x", URL_A), obs("PRICE_VISIBILITY")])).length === 0 && validateCommercialIntentEvidence(ev("SEO")).length === 0);
  const badPayloads: Array<[string, unknown]> = [
    ["a non-object", 5],
    ["an unknown channel", ev("RADIO")],
    ["no channel", { observations: [] }],
    ["a score key", { channel: "SEO", observations: [], score: 9 }],
    ["observations that are not a list", { channel: "SEO", observations: "none" }],
    ["an observation that is not an object", ev("SEO", ["x"])],
    ["an unknown dimension", ev("SEO", [obs("HUNGER")])],
    ["an empty observation text", ev("SEO", [obs("MARKET_DEMAND", "   ")])],
    ["a missing observation text", ev("SEO", [{ dimension: "MARKET_DEMAND" }])],
    ["an empty sourceUrl", ev("SEO", [obs("MARKET_DEMAND", "x", "")])],
    ["a strength on an observation", ev("SEO", [{ ...obs("MARKET_DEMAND"), strength: "HIGH" }])],
    ["a rating on an observation", ev("SEO", [{ ...obs("MARKET_DEMAND"), rating: 5 }])],
  ];
  for (const [name, payload] of badPayloads) {
    check(`a payload with ${name} is rejected`, has(validateCommercialIntentEvidence(payload), /Evidence from payload is invalid/) && has(validateCommercialIntentInputs({ candidate, sources: [source("a", payload as never)] }), /Evidence from provider "a" is invalid/));
  }
  check("the analyzer throws on invalid inputs and says why", (() => { try { analyzeCommercialIntent({ candidate, sources: "x" } as never, clock); return false; } catch (error) { return error instanceof CommercialIntentInputError && error.issues.length > 0; } })());
  check("an invalid evidence context is rejected", has(validateCommercialIntentContext({ candidate: 5 }), /Invalid evidence context/) && has(validateCommercialIntentContext(createEvidenceContext({ metadata: { a: { b: 1 } } as never })), /context\.metadata/) && validateCommercialIntentContext(ectx).length === 0);
  check("a missing provider is rejected", has(validateCommercialIntentProviders(0), /Missing provider/) && validateCommercialIntentProviders(1).length === 0);
  const goodResult = { status: "COMPLETED", confidence: 0.5, availableDimensions: ["MARKET_DEMAND"], missingDimensions: ["PRICE_VISIBILITY"], warnings: [], metadata: {}, executionTime: 0 };
  check("a valid result passes", validateCommercialIntentResult(goodResult).length === 0 && validateCommercialIntentResult(full).length === 0);
  check("a result with a dimension listed twice or on both sides is rejected", has(validateCommercialIntentResult({ ...goodResult, missingDimensions: ["MARKET_DEMAND"] }), /Duplicate dimension/) && has(validateCommercialIntentResult({ ...goodResult, availableDimensions: ["MARKET_DEMAND", "MARKET_DEMAND"] }), /Duplicate dimension/));
  check("a result with a bad status, confidence, warning list, or metadata is rejected", has(validateCommercialIntentResult({ ...goodResult, status: "DONE" }), /Status/) && has(validateCommercialIntentResult({ ...goodResult, confidence: 2 }), /Confidence/) && has(validateCommercialIntentResult({ ...goodResult, warnings: [1] }), /warnings/) && has(validateCommercialIntentResult({ ...goodResult, metadata: { a: {} } }), /Metadata is invalid/) && validateCommercialIntentResult(null).length === 1);

  // ---------- the signal contract ----------
  const resolver = resolverWith(provider(ev("GOOGLE", [obs("MARKET_DEMAND", "x", URL_A), obs("PURCHASE_INTENT")])));
  const signal = createCommercialIntentSignal({ resolver, now: clock });
  check("the signal meets the framework's module contract", validateSignalModule(signal).length === 0);
  check("identity: id, name, version, category, enabled, priority", signal.id === COMMERCIAL_INTENT_SIGNAL_ID && COMMERCIAL_INTENT_SIGNAL_ID === "commercial-intent" && signal.name === "Commercial Intent" && signal.version === "1.0.0" && signal.category === "COMMERCIAL_INTENT" && signal.enabled === true && signal.priority === 70);
  check("the signal is independent: no dependencies of any kind", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  check("the signal supports a context with a candidate only", signal.supportsCandidate(sctx) === true && signal.supportsCandidate(emptySctx) === false);
  check("options set enabled and priority", createCommercialIntentSignal({ resolver, enabled: false, priority: 7 }).enabled === false && createCommercialIntentSignal({ resolver, priority: 7 }).priority === 7);

  const registry = createSignalRegistry();
  const entry = registerCommercialIntentSignal(registry, { resolver, now: clock });
  check("the signal registers in a registry as a COMMERCIAL_INTENT signal", entry.id === "commercial-intent" && entry.enabled === true && registry.get("commercial-intent")?.module.category === "COMMERCIAL_INTENT" && registry.list({ category: "COMMERCIAL_INTENT" }).length === 1);
  let duplicateRejected = false;
  try {
    registerCommercialIntentSignal(registry, { resolver });
  } catch (error) {
    duplicateRejected = error instanceof SignalFrameworkError;
  }
  check("registering the signal twice is rejected", duplicateRejected && registry.count() === 1);
  const pipeline = createSignalPipeline();
  registerCommercialIntentSignal(pipeline, { resolver, now: clock });
  check("the pipeline accepts it with valid dependencies and an order of one", pipeline.validateDependencies().length === 0 && pipeline.resolveExecutionOrder().order.join() === "commercial-intent");
  check("it can be disabled and enabled like any other", pipeline.disable("commercial-intent").enabled === false && pipeline.enable("commercial-intent").enabled === true);

  // ---------- the signal run ----------
  const report = await pipeline.run(sctx);
  const result = report.results[0];
  check("the pipeline runs it and collects a COMPLETED result", report.results.length === 1 && result.signalId === "commercial-intent" && result.status === "COMPLETED" && typeof result.executionTime === "number" && result.errors.length === 0);
  const standalone = analyzeCommercialIntent({ candidate, sources: [source("intent-a", ev("GOOGLE", [obs("MARKET_DEMAND", "x", URL_A), obs("PURCHASE_INTENT")]))], warnings: [], dimensions: COMMERCIAL_INTENT_DIMENSIONS }, clock);
  check("the result matches the standalone analysis", stable(result.metadata) === stable(standalone.metadata) && result.confidence === 0.2 && result.metadata.availableDimensions === "PURCHASE_INTENT,MARKET_DEMAND");
  check("the collected result has no score", !("score" in result) && !("ranking" in result) && !("recommendation" in result));
  const direct = await executeSignal(signal, sctx, {}, clock);
  check("the executor runs it with no pipeline, and skips a context with no candidate", direct.status === "COMPLETED" && (await executeSignal(signal, emptySctx, {}, clock)).status === "SKIPPED");
  check("a second run gives the same result: nothing is cached or kept", stable(await executeSignal(signal, sctx, {}, clock)) === stable(direct));

  // ---------- evidence provider integration ----------
  log = [];
  const everyKind = resolverWith(
    provider(ev("SEO", [obs("MARKET_DEMAND")]), { id: "intent-spy" }),
    provider({ x: 1 }, { id: "facts-spy", kind: "PRODUCT_FACTS" }),
    provider({ x: 1 }, { id: "research-spy", kind: "RESEARCH" }),
    provider({ x: 1 }, { id: "completeness-spy", kind: "COMPLETENESS" }),
    provider({ x: 1 }, { id: "lp-spy", kind: "LP_QUALITY" }),
    provider({ x: 1 }, { id: "plan-spy", kind: "PRESENTATION_PLAN" }),
    provider([{ x: 1 }], { id: "overrides-spy", kind: "MANUAL_OVERRIDES" }),
  );
  const spied = await executeSignal(createCommercialIntentSignal({ resolver: everyKind, now: clock }), sctx, {}, clock);
  check("only COMMERCIAL_INTENT evidence is requested: no other provider is asked to support, validate, or collect", spied.status === "COMPLETED" && log.length > 0 && log.every((line) => line.endsWith(":intent-spy")) && log.includes("collect:intent-spy"));

  log = [];
  const channels = resolverWith(
    provider(ev("GOOGLE", [obs("PURCHASE_INTENT")]), { id: "chan-high", priority: 900 }),
    provider(ev("EMAIL", [obs("RECURRING_PURCHASE_POTENTIAL")]), { id: "chan-mid", priority: 500 }),
    provider(ev("FUTURE", [obs("UPSELL_POTENTIAL", "A bundle was offered")]), { id: "chan-low", priority: 1 }),
  );
  const multi = await executeSignal(createCommercialIntentSignal({ resolver: channels, now: clock }), sctx, {}, clock);
  check("every channel's provider contributes: a lower-priority provider is not hidden by a higher one", multi.status === "COMPLETED" && multi.metadata.availableDimensions === "PURCHASE_INTENT,RECURRING_PURCHASE_POTENTIAL,UPSELL_POTENTIAL" && multi.metadata.sourceCount === 3);
  check("each provider and channel is named in the result, in the framework's run order", multi.metadata.providers === "chan-high,chan-mid,chan-low" && multi.metadata.channels === "EMAIL,FUTURE,GOOGLE");
  const merged = (await channels.run(ectx, { kind: "COMMERCIAL_INTENT" })).merged;
  check("the framework's own merge keeps only the top provider, which is why the signal collects from all", merged.superseded.length === 2 && merged.items.COMMERCIAL_INTENT?.providerId === "chan-high");

  const mapped = defaultCommercialIntentContextFactory(createSignalContext({ candidate, importedMetadata: { a: 1 }, runtime: { r: "x" }, configuration: { c: true }, extensions: { e: null }, executionMetadata: { skipped: 1 } }));
  check("the default factory builds a frozen evidence context from the signal context", isDeepFrozen(mapped) && mapped.candidate?.id === "cand-1" && mapped.metadata.a === 1 && mapped.runtime.r === "x" && mapped.configuration.c === true && mapped.extensions.e === null && Object.keys(mapped.resolvedProductData).length === 0);
  let factoryCalls = 0;
  const custom = await executeSignal(createCommercialIntentSignal({ resolver, now: clock, contextFactory: (c) => { factoryCalls++; return defaultCommercialIntentContextFactory(c); } }), sctx, {}, clock);
  check("a custom context factory is used", custom.status === "COMPLETED" && factoryCalls >= 2);
  const withWarnings = await executeSignal(createCommercialIntentSignal({ resolver: resolverWith(provider(ev("SEO", [obs("MARKET_DEMAND")]), { warnings: ["provider says hello"] })), now: clock }), sctx, {}, clock);
  check("provider warnings travel with the result, naming the provider", withWarnings.warnings.some((w) => w === "intent-a: provider says hello"));

  // ---------- rejections through the signal ----------
  const failedOf = (module: OpportunitySignalModule) => executeSignal(module, sctx, {}, clock);
  const badContext = await failedOf(createCommercialIntentSignal({ resolver, now: clock, contextFactory: () => createEvidenceContext({ candidate, metadata: { a: { b: 1 } } as never }) }));
  check("Invalid Evidence Context: rejected before any provider is asked", badContext.status === "FAILED" && badContext.errors.some((e) => /Invalid evidence context/.test(e)) && badContext.metadata.availableDimensions === undefined);
  const throwing = await failedOf(createCommercialIntentSignal({ resolver, now: clock, contextFactory: () => { throw new Error("boom"); } }));
  check("Invalid Evidence Context: a factory that throws is rejected", throwing.status === "FAILED" && throwing.errors.some((e) => /Invalid evidence context.*boom/.test(e)));
  const notObject = await failedOf(createCommercialIntentSignal({ resolver, now: clock, contextFactory: () => null as never }));
  check("Invalid Evidence Context: a factory that returns nothing is rejected", notObject.status === "FAILED" && notObject.errors.some((e) => /Invalid evidence context/.test(e)));
  const noCandidate = await failedOf(createCommercialIntentSignal({ resolver, now: clock, contextFactory: () => createEvidenceContext() }));
  check("a context that carries no candidate is rejected", noCandidate.status === "FAILED" && noCandidate.errors.some((e) => /Candidate is required/.test(e)));
  const noProviders = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(), now: clock }));
  check("Missing Provider: no providers at all", noProviders.status === "FAILED" && noProviders.errors.some((e) => /Missing provider/.test(e)));
  log = [];
  const wrongKind = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider({ x: 1 }, { kind: "RESEARCH", id: "research-only" })), now: clock }));
  check("Missing Provider: only providers of other kinds, none of which is asked to collect", wrongKind.status === "FAILED" && wrongKind.errors.some((e) => /Missing provider/.test(e)) && !log.includes("collect:research-only"));
  const disabledProvider = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(ev("SEO"), { enabled: false })), now: clock }));
  const unsupported = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(ev("SEO"), { supports: false })), now: clock }));
  check("Missing Provider: a disabled provider, or one that does not support the context", [disabledProvider, unsupported].every((r) => r.status === "FAILED" && r.errors.some((e) => /Missing provider/.test(e))));
  const dup = await failedOf(createCommercialIntentSignal({ resolver, now: clock, dimensions: ["PURCHASE_INTENT", "PURCHASE_INTENT"] }));
  check("Duplicate Dimension: rejected", dup.status === "FAILED" && dup.errors.some((e) => /Duplicate dimension/.test(e)));
  const unknownDimension = await failedOf(createCommercialIntentSignal({ resolver, now: clock, dimensions: ["NOPE" as Dim] }));
  check("an unknown dimension is rejected", unknownDimension.status === "FAILED" && unknownDimension.errors.some((e) => /not supported/.test(e)));
  const badMetadata = await failedOf(createCommercialIntentSignal({ resolver, now: clock, contextFactory: () => createEvidenceContext({ candidate, runtime: { a: Number.NaN } }) }));
  check("Invalid Metadata: rejected with the field named", badMetadata.status === "FAILED" && badMetadata.errors.some((e) => /context\.runtime/.test(e)));
  check("a signal validate() reports the same problems before analyze", createCommercialIntentSignal({ resolver: resolverWith(), now: clock }).validate(sctx).some((i) => /Missing provider/.test(i.message)) && createCommercialIntentSignal({ resolver, dimensions: ["PURCHASE_INTENT", "PURCHASE_INTENT"] }).validate(sctx).some((i) => /Duplicate/.test(i.message)) && signal.validate(sctx).length === 0);

  // ---------- failed versus empty versus malformed ----------
  const throwingProvider = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(null, { collect: () => { throw new Error("upstream down"); } })), now: clock }));
  check("a provider that throws gives FAILED, never an all-missing COMPLETED", throwingProvider.status === "FAILED" && throwingProvider.errors.some((e) => /intent-a/.test(e) && /upstream down/.test(e)));
  const allFailed = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(null, { id: "x1", collect: () => { throw new Error("one"); } }), provider(null, { id: "x2", validate: [{ field: "f", message: "not ready" }] })), now: clock }));
  check("when every provider that ran failed, the result is FAILED and names each", allFailed.status === "FAILED" && allFailed.errors.some((e) => /x1/.test(e)) && allFailed.errors.some((e) => /x2/.test(e)));
  const emptyProvider = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(null)), now: clock }));
  check("a provider that collected nothing gives COMPLETED, everything missing, with a warning", emptyProvider.status === "COMPLETED" && emptyProvider.metadata.missingCount === 10 && emptyProvider.confidence === null && emptyProvider.warnings.some((w) => /found no commercial intent evidence/.test(w)));
  const partial = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(null, { id: "broken", priority: 500, collect: () => { throw new Error("x"); } }), provider(ev("SEO", [obs("MARKET_DEMAND")]), { id: "working", priority: 100 })), now: clock }));
  check("a failing provider does not hide a working one, and the failure is warned about", partial.status === "COMPLETED" && partial.metadata.providers === "working" && partial.warnings.some((w) => /Provider broken failed/.test(w)));
  const malformed = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider({ channel: "SEO", observations: [obs("MARKET_DEMAND")], score: 9 })), now: clock }));
  check("a payload that smuggles in a score gives FAILED", malformed.status === "FAILED" && malformed.errors.some((e) => /unexpected key "score"/.test(e)));
  const wrongChannelRun = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(ev("RADIO", [obs("MARKET_DEMAND")]))), now: clock }));
  check("a payload for a channel that is not in the contract gives FAILED", wrongChannelRun.status === "FAILED" && wrongChannelRun.errors.some((e) => /channel is not supported/.test(e)));
  const oneBadOfTwo = await failedOf(createCommercialIntentSignal({ resolver: resolverWith(provider(ev("SEO", [obs("MARKET_DEMAND")]), { id: "ok" }), provider(ev("SEO", [obs("HUNGER")]), { id: "bad" })), now: clock }));
  check("one provider with a malformed payload fails the signal rather than being silently dropped", oneBadOfTwo.status === "FAILED" && oneBadOfTwo.errors.some((e) => /provider "bad"/.test(e)));

  // ---------- read-only ----------
  const frozenCtx = createSignalContext({ candidate });
  const snapshot = JSON.stringify(frozenCtx);
  await executeSignal(signal, frozenCtx, {}, clock);
  check("the signal context and the candidate are unchanged by a run", JSON.stringify(frozenCtx) === snapshot && Object.isFrozen(frozenCtx.candidate));
  const liveFacts = emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
  const factsBefore = JSON.stringify(liveFacts);
  await executeSignal(createCommercialIntentSignal({ resolver, now: clock, contextFactory: (c) => createEvidenceContext({ candidate: c.candidate, resolvedProductData: { facts: liveFacts } }) }), sctx, {}, clock);
  check("ProductFacts handed to the context are not mutated", JSON.stringify(liveFacts) === factsBefore);
  const sourcePayload = ev("SEO", [obs("MARKET_DEMAND", "x", URL_A)]);
  const sourceBefore = JSON.stringify(sourcePayload);
  await executeSignal(createCommercialIntentSignal({ resolver: resolverWith(provider(sourcePayload)), now: clock }), sctx, {}, clock);
  check("a provider's own payload object is not mutated or frozen by the run", JSON.stringify(sourcePayload) === sourceBefore && !Object.isFrozen(sourcePayload));

  // ---------- independent execution next to the other signals ----------
  const facts = emptyProductFacts("Gizmo Prime", URL_A, "IMPORTED");
  const completeness = analyzeImportCompleteness({ facts });
  const plan = planPresentation(facts, analyzeProductProfile(facts));
  const lpInputs: LandingPagePotentialInputs = {
    facts,
    completeness,
    presentationPlan: plan,
    qualityPrediction: predictLpQuality({ facts, report: completeness }),
    evidence: analyzeEvidence({ facts, completeness, presentationPlan: plan }, { now: clock }),
    manualOverrides: [],
  };
  const minimalResearch = { productName: "Fictional", status: "FRESH", quality: "HIGH", sources: [], signals: { reviewOrientedResults: 0, educationalResults: 0, buyerGuideResults: 0, observedIntents: [] }, diversity: { USABLE_SOURCES: 0, PROMOTIONAL_SOURCES: 0 } };
  const shared = resolverWith(provider(minimalResearch, { id: "research-a", kind: "RESEARCH" }), provider(ev("GOOGLE", allObservations().slice(0, 4)), { id: "intent-g" }), provider(ev("EMAIL", [obs("UPSELL_POTENTIAL")]), { id: "intent-e", priority: 10 }));
  const lone = createSignalPipeline();
  registerCommercialIntentSignal(lone, { resolver: shared, now: clock });
  const loneResult = (await lone.run(sctx)).results[0];
  const quad = createSignalPipeline();
  registerEvidenceSignal(quad, { provider: () => ({ facts }) });
  registerLandingPagePotentialSignal(quad, { provider: () => lpInputs });
  registerCompetitionSignal(quad, { resolver: shared, now: clock });
  registerCommercialIntentSignal(quad, { resolver: shared, now: clock });
  const quadReport = await quad.run(sctx);
  const byId = (id: string) => quadReport.results.find((r) => r.signalId === id)!;
  check("all four signals run and complete, each with its own result", quadReport.results.length === 4 && quadReport.results.every((r) => r.status === "COMPLETED"));
  check("the Commercial Intent result is the same alone or beside the others", stable(byId("commercial-intent")) === stable(loneResult) && byId("commercial-intent").metadata.availableCount === 5);
  const competitionAlone = createSignalPipeline();
  registerCompetitionSignal(competitionAlone, { resolver: shared, now: clock });
  const evidenceAlone = createSignalPipeline();
  registerEvidenceSignal(evidenceAlone, { provider: () => ({ facts }) });
  const lpAlone = createSignalPipeline();
  registerLandingPagePotentialSignal(lpAlone, { provider: () => lpInputs });
  check("the Evidence, Landing Page Potential, and Competition results are unchanged by Commercial Intent", stable(byId("evidence")) === stable((await evidenceAlone.run(sctx)).results[0]) && stable(byId("landing-page-potential")) === stable((await lpAlone.run(sctx)).results[0]) && stable(byId("competition")) === stable((await competitionAlone.run(sctx)).results[0]));
  check("Commercial Intent adds no ordering constraint: it needs nothing and nothing needs it", quad.validateDependencies().length === 0 && quad.resolveExecutionOrder().order.length === 4);
  const failing = createSignalPipeline();
  registerEvidenceSignal(failing, { provider: () => ({ facts }) });
  registerCompetitionSignal(failing, { resolver: shared, now: clock });
  registerCommercialIntentSignal(failing, { resolver: resolverWith(), now: clock });
  const failingReport = await failing.run(sctx);
  check("a failing Commercial Intent Signal does not change another signal's result", failingReport.results.find((r) => r.signalId === "commercial-intent")?.status === "FAILED" && stable(failingReport.results.find((r) => r.signalId === "evidence")) === stable(byId("evidence")) && stable(failingReport.results.find((r) => r.signalId === "competition")) === stable(byId("competition")));
  quad.disable("evidence");
  quad.disable("landing-page-potential");
  quad.disable("competition");
  check("Commercial Intent runs alone when the others are disabled", (await quad.run(sctx)).results.map((r) => r.signalId).join() === "commercial-intent");

  // ---------- replay ----------
  console.log("NOTE: no stored commercial intent evidence exists in the repository, and no provider for it is implemented; the replay below uses fictional provider fixtures for every channel.");
  let replayOk = true;
  for (const channel of COMMERCIAL_INTENT_CHANNELS) {
    const payload = ev(channel, allObservations().slice(0, 6));
    const payloadBefore = JSON.stringify(payload);
    const replayResolver = resolverWith(provider(payload, { id: `replay-${channel.toLowerCase()}` }));
    const a = await executeSignal(createCommercialIntentSignal({ resolver: replayResolver, now: clock }), sctx, {}, clock);
    const b = await executeSignal(createCommercialIntentSignal({ resolver: replayResolver, now: clock }), sctx, {}, clock);
    replayOk = replayOk && a.status === "COMPLETED" && stable(a) === stable(b) && a.metadata.availableCount === 6 && a.metadata.channels === channel && JSON.stringify(payload) === payloadBefore;
  }
  check("replay across all seven channels is valid, deterministic, read-only, and channel-agnostic", replayOk);

  // ---------- genericity and boundaries ----------
  const dir = join(process.cwd(), "src/lib/opportunity");
  const names = readdirSync(dir).filter((f) => /^commercial-intent-[a-z-]+\.ts$/.test(f));
  check("five modules exist: signal, analyzer, result, validator, provider contract", names.sort().join() === "commercial-intent-analyzer.ts,commercial-intent-provider-contract.ts,commercial-intent-result.ts,commercial-intent-signal.ts,commercial-intent-validator.ts");
  const read = (name: string) => readFileSync(join(dir, name), "utf8").split(/\r?\n/);
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const lines = names.flatMap(read);
  const code = lines.filter(isCode);
  const logic = names.filter((n) => n !== "commercial-intent-provider-contract.ts").flatMap(read).filter(isCode);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no campaign ids, named marketplaces or sellers, or slugs", !lines.some((l) => /campaign|clickbank|hotmart|amazon|shopify|ebay|aliexpress|walmart|digistore|gumroad|slug/i.test(l)));
  check("no Google Ads, SEO, keyword, or CPC logic anywhere", !code.some((l) => /adwords|gclid|\bcpc\b|keyword|serp|backlink|search volume|impression/i.test(l)));
  check("channels are named once, in the contract's list, and nowhere in the logic", !logic.some((l) => /\b(GOOGLE|SEO|MARKETPLACE|AFFILIATE|SOCIAL|EMAIL|FUTURE)\b|google|\bseo\b/i.test(l)) && code.filter((l) => /google/i.test(l)).length === 1);
  check("the logic never compares, switches, or indexes on a channel", !logic.some((l) => /channel\s*(===|!==|==|!=)|switch\s*\(|case\s+["']|\[\s*[a-z.]*channel\s*\]/.test(l)));
  check("no scoring, ranking, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank|recommendation|\brecommend\b/i.test(l)));
  check("no AI, network, crawling, database, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap/i.test(l)));
  check("no randomness or wall-clock reads", !code.some((l) => /Math\.random|Date\.now|new Date\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no ProductFacts access of any kind", !code.some((l) => /ProductFacts|product-facts|PRODUCT_FACTS|resolvedProductData|\bfacts\b/.test(l)));
  check("no provider kind other than COMMERCIAL_INTENT is named", !code.some((l) => /"RESEARCH"|COMPLETENESS|LP_QUALITY|PRESENTATION_PLAN|MANUAL_OVERRIDES/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 10);
  check("no platform module is imported at all", !imports.some((i) => i.from.startsWith("@/")));
  check("nothing imports the LP Builder, Discovery runtime, Importer, Grounding, Policy, Publication, Tracking, Analytics, or the database", !imports.some((i) => !i.typeOnly && /lp-builder|discovery|import|grounding|policy|publication|tracking|analytics|db/i.test(i.from.replace(/providers\/evidence-provider-/, ""))));
  check("other imports stay inside opportunity and its providers folder", imports.every((i) => i.from.startsWith("./") || i.from.startsWith("../discovery/discovery-types")));
  check("the Discovery import is type-only", imports.filter((i) => /discovery/.test(i.from)).every((i) => i.typeOnly));
  check("the code never assigns into its inputs or evidence", !code.some((l) => /\b(inputs|evidence|sources|source|candidate|payload|observations)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("no in-place array mutation of inputs", !code.some((l) => /(inputs|evidence|sources|source|candidate|payload|observations)\.[A-Za-z.]*\.?(splice|sort|reverse|push|pop|shift)\(/.test(l)));
  const signalText = readFileSync(join(dir, "commercial-intent-signal.ts"), "utf8");
  check("the signal asks for COMMERCIAL_INTENT evidence only", (signalText.match(/kind: "COMMERCIAL_INTENT"/g) ?? []).length === 2 && !/kind: "(?!COMMERCIAL_INTENT)/.test(signalText));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nCommercial intent signal: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
