import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createOpportunityExplanationEngine } from "../src/lib/opportunity/opportunity-explanation-engine.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import {
  OFFER_DIMENSIONS,
  OFFER_INPUT_KEYS,
  OFFER_REQUIREMENT_KINDS,
  OFFER_RESULT_KEYS,
  OFFER_STRATEGY_FAMILIES,
  OFFER_STRATEGY_KEYS,
  OFFER_STRATEGY_SCOPE_NOTE,
  OFFER_STRATEGY_STATUSES,
  OFFER_VERDICTS,
  offerStrategyToSignalOutput,
} from "../src/lib/traffic/offer-strategy-result.ts";
import type { OfferStrategyContent } from "../src/lib/traffic/offer-strategy-result.ts";
import type { OfferStrategy } from "../src/lib/traffic/offer-strategy-definitions.ts";
import { DEFAULT_OFFER_SOURCES, DEFAULT_OFFER_STRATEGIES } from "../src/lib/traffic/offer-strategy-definitions.ts";
import { OfferStrategyError, createOfferStrategyRegistry } from "../src/lib/traffic/offer-strategy-registry.ts";
import {
  validateOfferConfiguration,
  validateOfferDimensionSources,
  validateOfferStrategies,
  validateOfferStrategy,
  validateOfferStrategyContent,
  validateOfferStrategyContext,
  validateOfferStrategyInputs,
  validateOfferStrategyResult,
} from "../src/lib/traffic/offer-strategy-validator.ts";
import { analyzeOfferStrategy } from "../src/lib/traffic/offer-strategy-analyzer.ts";
import {
  OFFER_STRATEGY_SIGNAL_ID,
  createDefaultOfferStrategyRegistry,
  createOfferStrategySignal,
  registerOfferStrategySignal,
} from "../src/lib/traffic/offer-strategy-signal.ts";
import type { OfferStrategySignalOptions } from "../src/lib/traffic/offer-strategy-signal.ts";
import { createChannelSuitabilitySignal, registerChannelSuitabilitySignal } from "../src/lib/traffic/channel-suitability-signal.ts";
import { createPolicyRiskSignal, registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
import { createAudienceFitSignal, registerAudienceFitSignal } from "../src/lib/traffic/audience-fit-signal.ts";
import { createTrafficSignalContext } from "../src/lib/traffic/traffic-signal-context.ts";
import type { TrafficSignalContext } from "../src/lib/traffic/traffic-signal-context.ts";
import type { TrafficSignalModule } from "../src/lib/traffic/traffic-signal-contract.ts";
import { TrafficFrameworkError, createTrafficModuleRegistry } from "../src/lib/traffic/traffic-signal-registry.ts";
import { createTrafficSignalPipeline } from "../src/lib/traffic/traffic-signal-pipeline.ts";
import { validateTrafficSignalModule, validateTrafficSignalOutput } from "../src/lib/traffic/traffic-signal-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const sameOutput = (a: { status: unknown; confidence: unknown; metadata: unknown; warnings: unknown; errors: unknown }, b: { status: unknown; confidence: unknown; metadata: unknown; warnings: unknown; errors: unknown }) =>
  stable({ status: a.status, confidence: a.confidence, metadata: a.metadata, warnings: a.warnings, errors: a.errors }) === stable({ status: b.status, confidence: b.confidence, metadata: b.metadata, warnings: b.warnings, errors: b.errors });
const tick = () => {
  let t = 0;
  return () => (t += 1);
};

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const candidateBefore = JSON.stringify(candidate);

const CATEGORIES = ["EVIDENCE", "LANDING_PAGE", "COMPETITION", "COMMERCIAL_INTENT", "MARKET", "BRAND"] as const;
function fakeOpportunity(id: string, category: OpportunitySignalModule["category"], metadata: SignalOutput["metadata"]): OpportunitySignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category,
    enabled: true,
    priority: 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsCandidate: () => true,
    validate: () => [],
    analyze: () => ({ status: "COMPLETED", confidence: 0.8, metadata: { ...metadata }, warnings: [], errors: [] }),
  };
}
function resolverClocks() {
  let t = 0;
  let s = 0;
  let n = 0;
  return { now: () => (t += 1), timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(), idFactory: () => `analysis-${(n += 1)}` };
}

const OWNER: Record<string, string> = {
  FEATURES: "evid",
  PRICING: "evid",
  GUARANTEE: "evid",
  RETURNS: "evid",
  MANUFACTURER: "evid",
  FAQ: "evid",
  OFFER_COVERAGE: "lp",
  HERO_STRENGTH: "lp",
  FEATURE_COVERAGE: "lp",
  PRICING_COVERAGE: "lp",
  GUARANTEE_COVERAGE: "lp",
  FAQ_COVERAGE: "lp",
  INFORMATION_DENSITY: "lp",
  CTA_AVAILABILITY: "lp",
  PRESENTATION_READINESS: "lp",
  OFFER_VISIBILITY: "intent",
  PRICE_VISIBILITY: "intent",
  UPSELL_POTENTIAL: "intent",
  BUYER_READINESS: "intent",
  CONSUMER_TRUST: "intent",
  RECURRING_PURCHASE_POTENTIAL: "intent",
  CUSTOM_DIMENSION: "evid",
};
const GOOD: Record<string, string> = Object.fromEntries(Object.keys(OWNER).filter((d) => d !== "CUSTOM_DIMENSION").map((d) => [d, "STRONG"]));

interface Scenario {
  states?: Record<string, string | null>;
  explain?: boolean;
  configuration?: Record<string, unknown>;
  mutate?: (analysis: Record<string, unknown>) => void;
}
async function scenario(options: Scenario = {}) {
  const states = { ...GOOD, ...(options.states ?? {}) };
  const bySignal: Record<string, Record<string, string>> = { evid: {}, lp: {}, intent: {} };
  for (const [dimension, state] of Object.entries(states)) if (state !== null) bySignal[OWNER[dimension]][`dimension.${dimension}`] = state;
  const signals = createSignalPipeline({ now: zero });
  Object.entries(bySignal).forEach(([id, metadata], i) => signals.register(fakeOpportunity(id, CATEGORIES[i % CATEGORIES.length], metadata)));
  const opportunityContext = createOpportunityExecutionContext({
    candidate,
    evidenceContext: createEvidenceContext({ candidate, metadata: {}, extensions: {}, resolvedProductData: {} }),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: {},
  } as never);
  const runResolver = await createOpportunityResolver({ signals, ...resolverClocks() } as never).run(opportunityContext);
  const analysis = JSON.parse(JSON.stringify(runResolver.analysis)) as Record<string, unknown>;
  options.mutate?.(analysis);
  const explanation = options.explain === false ? null : createOpportunityExplanationEngine({ now: tick() }).explain(runResolver.analysis).explanation;
  const context = createTrafficSignalContext({
    candidate,
    opportunityAnalysis: analysis as never,
    opportunityExplanation: explanation as never,
    executionMetadata: { run: "t1", attempt: 2 },
    runtimeMetadata: { host: "h1" },
    configuration: (options.configuration ?? {}) as never,
  });
  return { context, analysis, explanation };
}

const evidenceItem = (id: string, text: string, over: Record<string, unknown> = {}) => ({ id, text, sourceUrl: "https://seller.example/item", pageCategory: "PRODUCT", field: null, ...over });
const section = (id: string, kind: string, texts: string[], over: Record<string, unknown> = {}) => ({ id, kind, visible: true, texts, ...over });
const content = (over: Partial<OfferStrategyContent> = {}): OfferStrategyContent => ({ evidenceContext: null, landingPage: null, manualOverrides: null, ...over }) as OfferStrategyContent;
const PAGE = (): OfferStrategyContent =>
  content({
    evidenceContext: { items: [evidenceItem("e1", "A desk lamp with a metal arm.")] },
    landingPage: {
      sections: [
        section("hero", "hero", ["A durable blue desk lamp."]),
        section("feat", "features", ["Adjustable arm."]),
        section("price", "pricing", ["One size."]),
        section("act", "cta", ["See the offer."]),
        section("faq", "faq", ["How tall is it?"]),
        section("by", "manufacturer", ["A fictional maker."]),
        section("terms", "guarantee", ["Return terms."]),
      ],
    },
    manualOverrides: [],
  });

const signal = createOfferStrategySignal({ now: zero });
const withContent = (value: OfferStrategyContent | null, options: OfferStrategySignalOptions = {}) => createOfferStrategySignal({ now: zero, content: () => value, ...options });
const run = (module: TrafficSignalModule, context: TrafficSignalContext) => module.analyze(context, {} as never);
const metaOf = (output: { metadata: Record<string, unknown> }) => output.metadata;
const listOf = (output: { metadata: Record<string, unknown> }, key: string) => String(output.metadata[key] ?? "").split(",").filter((part) => part !== "");
const zetaStrategy = (over: Record<string, unknown> = {}): OfferStrategy =>
  ({
    id: "zeta-offer",
    name: "Zeta Offer",
    description: "A fictional strategy for tests.",
    family: "PRODUCT",
    status: "DEFINED",
    enabled: true,
    requirements: Object.fromEntries(OFFER_DIMENSIONS.map((d) => [d, d === "PRICE_TRANSPARENCY" ? "STRUCTURAL" : "NOT_APPLICABLE"])),
    metadata: {},
    ...over,
  }) as OfferStrategy;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}
const stripCode = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/`(?:\\.|[^`\\])*`/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, '""').replace(/\/\/.*$/gm, "");

async function main() {
  const base = await scenario();
  const definedIds = DEFAULT_OFFER_STRATEGIES.filter((s) => s.id !== "future").map((s) => s.id).sort();

  check("twelve offer dimensions, in the specified order", same(OFFER_DIMENSIONS, ["OFFER_CLARITY", "VALUE_PROPOSITION", "PRICE_TRANSPARENCY", "GUARANTEE_PRESENCE", "BONUS_AVAILABILITY", "URGENCY_ELEMENTS", "SCARCITY_ELEMENTS", "OFFER_SIMPLICITY", "OFFER_COMPLEXITY", "TRUST_ELEMENTS", "CALL_TO_ACTION_READINESS", "RECURRING_REVENUE_POTENTIAL"]));
  check("four verdicts, none of them a classification", same(OFFER_VERDICTS, ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"]) && same(OFFER_REQUIREMENT_KINDS, ["STRUCTURAL", "CONTEXTUAL", "NOT_APPLICABLE"]));
  check("the result carries exactly the specified fields", same([...OFFER_RESULT_KEYS].sort(), ["confidence", "executionTime", "metadata", "status", "supportedStrategies", "unsupportedStrategies", "warnings"]));
  check("strategy families, statuses, and keys", OFFER_STRATEGY_FAMILIES.includes("FUTURE") && OFFER_STRATEGY_STATUSES.includes("PLACEHOLDER") && !OFFER_STRATEGY_KEYS.some((k) => /score|budget|classif|campaign|conversion/i.test(k)));
  check("the scope note says it is no classification, ranking, score, recommendation, or conversion prediction", /not a classification, a ranking, a score, or a recommendation/.test(OFFER_STRATEGY_SCOPE_NOTE) && /predicted conversion|predicts conversion/.test(OFFER_STRATEGY_SCOPE_NOTE));

  check("six built-in strategies, named as specified", same(DEFAULT_OFFER_STRATEGIES.map((s) => s.name), ["Single Product", "Bundle", "Subscription", "Trial", "Lead Magnet", "Future Types"]));
  check("strategy ids are unique and the definitions pass their validator", new Set(DEFAULT_OFFER_STRATEGIES.map((s) => s.id)).size === 6 && validateOfferStrategies(DEFAULT_OFFER_STRATEGIES).length === 0);
  check("the strategies and the dimension sources are deep frozen", DEFAULT_OFFER_STRATEGIES.every((s) => Object.isFrozen(s) && Object.isFrozen(s.requirements)) && Object.isFrozen(DEFAULT_OFFER_SOURCES) && Object.isFrozen(DEFAULT_OFFER_SOURCES.PRICE_TRANSPARENCY.sectionKinds));
  check("future types are a placeholder and no other strategy is", DEFAULT_OFFER_STRATEGIES.filter((s) => s.status === "PLACEHOLDER").map((s) => s.id).join() === "future");
  check("every dimension has sources, and both requirement kinds are used", validateOfferDimensionSources(DEFAULT_OFFER_SOURCES).length === 0 && DEFAULT_OFFER_STRATEGIES.some((s) => OFFER_DIMENSIONS.some((d) => s.requirements[d] === "STRUCTURAL")) && DEFAULT_OFFER_STRATEGIES.some((s) => OFFER_DIMENSIONS.some((d) => s.requirements[d] === "CONTEXTUAL")));
  check("the built-in strategies cite no advertising platform or campaign type", !/google|facebook|\bads\b|campaign type|lookalike|conversion/i.test(JSON.stringify(DEFAULT_OFFER_STRATEGIES)));
  check("a default registry holds the six strategies, all enabled", (() => { const r = createDefaultOfferStrategyRegistry(); return r.count() === 6 && r.list().every((e) => e.enabled); })());

  check("Invalid Offer Definition: a non-object is rejected", [null, undefined, "x", 5, []].every((v) => has(validateOfferStrategy(v), /a strategy must be an object/)));
  check("a valid strategy passes", validateOfferStrategy(zetaStrategy()).length === 0);
  check("Invalid Offer Definition: id, name, description, family, status, and enabled are checked", has(validateOfferStrategy(zetaStrategy({ id: "Bad Id" })), /id must be/) && has(validateOfferStrategy(zetaStrategy({ name: " " })), /name must be/) && has(validateOfferStrategy(zetaStrategy({ description: 5 })), /description must be/) && has(validateOfferStrategy(zetaStrategy({ family: "NOPE" })), /family is not supported/) && has(validateOfferStrategy(zetaStrategy({ status: "NOPE" })), /status is not supported/) && has(validateOfferStrategy(zetaStrategy({ enabled: "yes" })), /enabled must be/));
  check("Invalid Offer Definition: requirements must cover every dimension", has(validateOfferStrategy(zetaStrategy({ requirements: null })), /requirements must be an object/) && has(validateOfferStrategy(zetaStrategy({ requirements: { ...zetaStrategy().requirements, EXTRA: "STRUCTURAL" } })), /not an offer dimension/) && has(validateOfferStrategy(zetaStrategy({ requirements: { ...zetaStrategy().requirements, PRICE_TRANSPARENCY: "NOPE" } })), /STRUCTURAL, CONTEXTUAL, or NOT_APPLICABLE/));
  check("Invalid Offer Definition: a strategy is metadata only, so a score, budget, or classification field is rejected", ["score", "budget", "classification", "campaign", "conversion"].every((field) => has(validateOfferStrategy(zetaStrategy({ [field]: 1 })), new RegExp(`unexpected field "${field}"`))));
  check("Invalid Metadata: nested strategy metadata is rejected", [{ a: { b: 1 } }, { a: [1] }, null].every((metadata) => has(validateOfferStrategy(zetaStrategy({ metadata })), /Invalid metadata/)));
  check("Duplicate Strategy: a repeated id in a list is rejected", has(validateOfferStrategies([zetaStrategy(), zetaStrategy()]), /Duplicate strategy "zeta-offer"/) && validateOfferStrategies([zetaStrategy(), zetaStrategy({ id: "omega-offer" })]).length === 0);
  check("dimension sources: missing, malformed, and unknown entries are rejected", has(validateOfferDimensionSources(null), /must be an object/) && has(validateOfferDimensionSources({ ...DEFAULT_OFFER_SOURCES, PRICE_TRANSPARENCY: undefined }), /"PRICE_TRANSPARENCY" needs its sources/) && has(validateOfferDimensionSources({ ...DEFAULT_OFFER_SOURCES, EXTRA: { opportunityDimensions: [], sectionKinds: [], evidenceFields: [] } }), /not an offer dimension/));

  const registry = createOfferStrategyRegistry();
  const original = zetaStrategy();
  const entry = registry.register(original);
  check("Register Strategy: returns a frozen entry, enabled by the strategy's own flag", entry.id === "zeta-offer" && entry.enabled === true && Object.isFrozen(entry) && Object.isFrozen(entry.strategy) && registry.count() === 1);
  (original as { name: string }).name = "tampered";
  check("Register Strategy: the registry holds a copy", registry.get("zeta-offer")!.strategy.name === "Zeta Offer");
  check("Duplicate Strategy: a second registration is rejected", (() => { try { registry.register(zetaStrategy()); return false; } catch (e) { return e instanceof OfferStrategyError && /Duplicate strategy/.test(e.issues.map((i) => i.message).join()); } })() && registry.count() === 1);
  check("Invalid Offer Definition: an invalid strategy is not registered", (() => { try { registry.register(zetaStrategy({ id: "Bad", family: "NO" })); return false; } catch (e) { return e instanceof OfferStrategyError && e.issues.length === 2 && e.name === "OfferStrategyError"; } })());
  check("Validate Strategy: reports problems and a duplicate id, and changes nothing", registry.validate(zetaStrategy()).length === 1 && has(registry.validate(zetaStrategy()), /Duplicate strategy/) && registry.validate(zetaStrategy({ id: "other-offer" })).length === 0 && registry.count() === 1);
  check("Disable Strategy and Enable Strategy change only the enabled state", registry.disable("zeta-offer").enabled === false && registry.enable("zeta-offer").enabled === true);
  check("enabling an unknown strategy is rejected", (() => { try { registry.enable("nope"); return false; } catch (e) { return e instanceof OfferStrategyError && /Unknown strategy/.test(e.message); } })());
  registry.register(zetaStrategy({ id: "alpha-offer", name: "Alpha" }));
  check("List Strategies is sorted by id", registry.list().map((e) => e.id).join() === "alpha-offer,zeta-offer");
  check("a registry started from a duplicate list is rejected", (() => { try { createOfferStrategyRegistry([zetaStrategy(), zetaStrategy()]); return false; } catch (e) { return e instanceof OfferStrategyError; } })());

  check("signal identity and contract", signal.id === OFFER_STRATEGY_SIGNAL_ID && signal.id === "offer-strategy" && signal.version === "1.0.0" && signal.category === "OFFER" && signal.enabled === true && signal.priority === 60 && validateTrafficSignalModule(signal).length === 0);
  check("the signal depends on no other signal", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  check("enabled and priority can be set", createOfferStrategySignal({ enabled: false, priority: 5 }).enabled === false && createOfferStrategySignal({ priority: 5 }).priority === 5);

  const host = createTrafficModuleRegistry();
  const hostEntry = registerOfferStrategySignal(host, { now: zero });
  check("registration returns the entry, enabled, in the registry", hostEntry.id === "offer-strategy" && hostEntry.enabled && host.count() === 1 && host.get("offer-strategy")?.module.category === "OFFER");
  check("registering it twice is rejected as a duplicate signal id", (() => { try { registerOfferStrategySignal(host, { now: zero }); return false; } catch (e) { return e instanceof TrafficFrameworkError && /already registered/.test(e.message + e.issues.map((i) => i.message).join()); } })());
  const hostPipeline = createTrafficSignalPipeline({ now: zero });
  registerOfferStrategySignal(hostPipeline, { now: zero });
  check("registration works on a pipeline", hostPipeline.validateDependencies().length === 0 && hostPipeline.resolveExecutionOrder().order.join() === "offer-strategy");

  const out = run(signal, base.context);
  check("a well-evidenced offer COMPLETES", out.status === "COMPLETED" && out.errors.length === 0 && validateTrafficSignalOutput(out).length === 0);
  check("every defined strategy is supported and only the placeholder is not", same(listOf(out, "supportedStrategies"), definedIds) && same(listOf(out, "unsupportedStrategies"), ["future"]));
  check("the placeholder is unsupported because it is a placeholder", /placeholder/.test(String(metaOf(out)["unavailable.future"])) && /UNAVAILABLE/.test(String(metaOf(out)["reason.future"])));
  check("with every required dimension established, confidence is 1", out.confidence === 1 && metaOf(out).assessedCount === metaOf(out).assessableCount);
  check("all twelve dimensions have a verdict for single-product", OFFER_DIMENSIONS.every((d) => OFFER_VERDICTS.includes(String(metaOf(out)[`verdict.single-product.${d}`]) as never)));
  check("a dimension the strategy does not need is NOT_APPLICABLE", metaOf(out)["verdict.single-product.RECURRING_REVENUE_POTENTIAL"] === "NOT_APPLICABLE" && metaOf(out)["verdict.lead-magnet.PRICE_TRANSPARENCY"] === "NOT_APPLICABLE" && metaOf(out)["verdict.subscription.OFFER_SIMPLICITY"] === "NOT_APPLICABLE");
  check("the metadata holds counts, the scope note, and the Opportunity references", metaOf(out).strategyCount === 6 && metaOf(out).supportedCount === 5 && metaOf(out).unsupportedCount === 1 && metaOf(out).scopeNote === OFFER_STRATEGY_SCOPE_NOTE && metaOf(out).opportunityAnalysisId === (base.analysis as { analysisId: string }).analysisId && metaOf(out).candidateId === "cand-1");
  check("every offer dimension is restated in the metadata", OFFER_DIMENSIONS.every((d) => typeof metaOf(out)[`need.${d}`] === "string") && metaOf(out)["need.PRICE_TRANSPARENCY"] === "SATISFIED" && metaOf(out)["need.RECURRING_REVENUE_POTENTIAL"] === "SATISFIED");
  check("execution metadata is passed through under its own key", metaOf(out)["execution.run"] === "t1" && metaOf(out)["execution.attempt"] === 2);
  check("a well-evidenced offer without content warns only that content was not supplied", out.warnings.length === 1 && /No content was supplied/.test(out.warnings[0]));
  check("the output metadata is flat", Object.values(metaOf(out)).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));

  const noPrice = run(signal, (await scenario({ states: { PRICING: "MISSING", PRICING_COVERAGE: "MISSING", PRICE_VISIBILITY: "MISSING" } })).context);
  check("a structural price need reported missing excludes the strategies that need it", ["single-product", "bundle", "subscription"].every((id) => listOf(noPrice, "unsupportedStrategies").includes(id)) && listOf(noPrice, "supportedStrategies").includes("lead-magnet") && listOf(noPrice, "supportedStrategies").includes("trial") && metaOf(noPrice)["need.PRICE_TRANSPARENCY"] === "ABSENT");
  check("lead magnet does not require a price, so missing price does not exclude it", metaOf(noPrice)["verdict.lead-magnet.PRICE_TRANSPARENCY"] === "NOT_APPLICABLE");
  check("a contextual price need reported missing is NOT_ASSESSED and excludes nothing", metaOf(noPrice)["verdict.trial.PRICE_TRANSPARENCY"] === "NOT_ASSESSED" && listOf(noPrice, "supportedStrategies").includes("trial"));
  const noRecurring = run(signal, (await scenario({ states: { RECURRING_PURCHASE_POTENTIAL: "MISSING" } })).context);
  check("a missing recurring potential excludes only subscription", same(listOf(noRecurring, "unsupportedStrategies"), ["future", "subscription"]) && metaOf(noRecurring)["verdict.subscription.RECURRING_REVENUE_POTENTIAL"] === "INCOMPATIBLE");
  const noCta = run(signal, (await scenario({ states: { CTA_AVAILABILITY: "MISSING", PRESENTATION_READINESS: "MISSING" } })).context);
  check("missing call-to-action readiness excludes strategies that need it structurally", ["single-product", "subscription", "trial", "lead-magnet"].every((id) => listOf(noCta, "unsupportedStrategies").includes(id)) && listOf(noCta, "supportedStrategies").includes("bundle"));
  const weakPrice = run(signal, (await scenario({ states: { PRICING: "WEAK", PRICING_COVERAGE: "MISSING", PRICE_VISIBILITY: "MISSING" } })).context);
  check("a need reported weak is only partly evidenced: it does not exclude, and a warning says so", metaOf(weakPrice)["need.PRICE_TRANSPARENCY"] === "PARTIAL" && listOf(weakPrice, "supportedStrategies").includes("single-product") && weakPrice.warnings.some((w) => /partly evidenced/.test(w) && /PRICE_TRANSPARENCY/.test(w)));
  const unknownRecurring = run(signal, (await scenario({ states: { RECURRING_PURCHASE_POTENTIAL: null } })).context);
  check("a need nothing reported on is UNKNOWN, never ABSENT, and does not exclude", metaOf(unknownRecurring)["need.RECURRING_REVENUE_POTENTIAL"] === "UNKNOWN" && listOf(unknownRecurring, "supportedStrategies").includes("subscription") && metaOf(unknownRecurring)["verdict.subscription.RECURRING_REVENUE_POTENTIAL"] === "NOT_ASSESSED" && (unknownRecurring.confidence as number) < 1);

  const SECRET = "ZETA-PHRASE-77";
  const noPricePage = await scenario({ states: { PRICING: "MISSING", PRICING_COVERAGE: "MISSING", PRICE_VISIBILITY: "MISSING" } });
  const pageRestores = run(withContent(PAGE()), noPricePage.context);
  check("a visible mapped landing-page section establishes the dimension without reading the words", metaOf(pageRestores)["need.PRICE_TRANSPARENCY"] === "SATISFIED" && listOf(pageRestores, "supportedStrategies").includes("single-product") && /PRICE_TRANSPARENCY/.test(String(metaOf(pageRestores).structureEstablished)));
  check("the supplied text is never copied into the result", !JSON.stringify(pageRestores).includes("desk lamp") && !JSON.stringify(run(withContent(content({ landingPage: { sections: [section("price", "pricing", [SECRET])] } })), noPricePage.context)).includes(SECRET));
  const hiddenPrice = run(withContent(content({ landingPage: { sections: [section("price", "pricing", ["One size."], { visible: false })] } })), noPricePage.context);
  check("a hidden section is not on the page and establishes nothing", metaOf(hiddenPrice)["need.PRICE_TRANSPARENCY"] === "ABSENT" && listOf(hiddenPrice, "unsupportedStrategies").includes("single-product"));
  const priceField = run(withContent(content({ evidenceContext: { items: [evidenceItem("e9", "whatever words", { field: "price" })] } })), noPricePage.context);
  check("non-empty text on a mapped field establishes the dimension; the words are not classified", metaOf(priceField)["need.PRICE_TRANSPARENCY"] === "SATISFIED");
  const overridden = run(withContent(content({ evidenceContext: { items: [evidenceItem("e3", "a price", { field: "price" })] }, manualOverrides: [{ field: "price", value: "   " }] })), noPricePage.context);
  check("an effective override supersedes the item that states the same field", metaOf(overridden)["need.PRICE_TRANSPARENCY"] === "ABSENT" && metaOf(overridden).supersededCount === 1);
  const overrideRestores = run(withContent(content({ evidenceContext: { items: [evidenceItem("e3", "", { field: "price" })] }, manualOverrides: [{ field: "price", value: "restored" }] })), noPricePage.context);
  check("an override's effective text establishes the mapped dimension", metaOf(overrideRestores)["need.PRICE_TRANSPARENCY"] === "SATISFIED");

  const onlyTwo = run(signal, (await scenario({ configuration: { [OFFER_INPUT_KEYS.enabled]: "single-product, trial" } })).context);
  check("an enabled list makes every other strategy unavailable", same(listOf(onlyTwo, "supportedStrategies"), ["single-product", "trial"]) && onlyTwo.metadata["unavailable.bundle"] === "the configuration enables other strategies only");
  const disabledOne = run(signal, (await scenario({ configuration: { [OFFER_INPUT_KEYS.disabled]: "bundle" } })).context);
  check("a disabled list removes only the named strategy", same(listOf(disabledOne, "unsupportedStrategies"), ["bundle", "future"]) && disabledOne.metadata["unavailable.bundle"] === "the configuration disables it");
  const enableFuture = run(signal, (await scenario({ configuration: { [OFFER_INPUT_KEYS.enabled]: "future,trial" } })).context);
  check("enabling the placeholder does not make it available", listOf(enableFuture, "unsupportedStrategies").includes("future") && listOf(enableFuture, "supportedStrategies").join() === "trial");
  const unknownId = run(signal, (await scenario({ configuration: { [OFFER_INPUT_KEYS.disabled]: "nonexistent-net" } })).context);
  check("a strategy id with no definition is a warning, not a failure", unknownId.status === "COMPLETED" && unknownId.warnings.some((w) => /"nonexistent-net", which has no definition/.test(w)));

  const live = createDefaultOfferStrategyRegistry();
  const liveSignal = createOfferStrategySignal({ now: zero, registry: live });
  const liveBefore = run(liveSignal, base.context);
  live.disable("bundle");
  const liveDisabled = run(liveSignal, base.context);
  check("Disable Strategy: a disabled strategy is omitted from both lists and a warning says so", !listOf(liveDisabled, "supportedStrategies").includes("bundle") && !listOf(liveDisabled, "unsupportedStrategies").includes("bundle") && liveDisabled.warnings.some((w) => /Disabled in the registry and not assessed: bundle/.test(w)) && metaOf(liveDisabled).strategyCount === 5);
  live.enable("bundle");
  check("Enable Strategy: the same signal assesses the strategy again", stable(run(liveSignal, base.context)) === stable(liveBefore));
  const customOut = run(createOfferStrategySignal({ now: zero, registry: createOfferStrategyRegistry([zetaStrategy()]) }), base.context);
  check("a fictional strategy works through the same engine", customOut.status === "COMPLETED" && same(listOf(customOut, "supportedStrategies"), ["zeta-offer"]) && metaOf(customOut)["verdict.zeta-offer.PRICE_TRANSPARENCY"] === "COMPATIBLE");
  const customScenario = await scenario({ states: { PRICING: "MISSING", PRICING_COVERAGE: "MISSING", PRICE_VISIBILITY: "MISSING", CUSTOM_DIMENSION: "STRONG" } });
  const defaultCustom = run(createOfferStrategySignal({ now: zero, registry: createOfferStrategyRegistry([zetaStrategy()]) }), customScenario.context);
  const customSourcesOut = run(createOfferStrategySignal({ now: zero, registry: createOfferStrategyRegistry([zetaStrategy()]), dimensionSources: { ...DEFAULT_OFFER_SOURCES, PRICE_TRANSPARENCY: { opportunityDimensions: ["CUSTOM_DIMENSION"], sectionKinds: [], evidenceFields: [] } } }), customScenario.context);
  check("the dimension sources are data: another dimension name can establish a need", metaOf(defaultCustom)["need.PRICE_TRANSPARENCY"] === "ABSENT" && customSourcesOut.status === "COMPLETED" && metaOf(customSourcesOut)["need.PRICE_TRANSPARENCY"] === "SATISFIED");
  const emptySet = run(createOfferStrategySignal({ now: zero, registry: createOfferStrategyRegistry() }), base.context);
  check("an empty strategy set has nothing to assess", emptySet.status === "COMPLETED" && emptySet.confidence === null && metaOf(emptySet).strategyCount === 0);

  const noExplanation = await scenario({ explain: false });
  const noExOut = run(signal, noExplanation.context);
  check("without an explanation only availability is established, with a warning", noExOut.status === "COMPLETED" && metaOf(noExOut).explanationSupplied === false && metaOf(noExOut).dimensionsRead === 0 && noExOut.warnings.some((w) => /No Opportunity explanation/.test(w)));
  check("without an explanation nothing is excluded for evidence except the placeholder", same(listOf(noExOut, "unsupportedStrategies"), ["future"]) && (noExOut.confidence as number) < 1);
  const partial = run(signal, (await scenario({ mutate: (analysis) => { analysis.status = "PARTIAL"; } })).context);
  check("a PARTIAL Opportunity analysis can be read, and says so", partial.status === "COMPLETED" && partial.warnings.some((w) => /PARTIAL/.test(w)));
  const failedLp = await scenario({ mutate: (analysis) => { (analysis.signalResults as Array<{ signalId: string; status: string }>).find((r) => r.signalId === "lp")!.status = "FAILED"; } });
  const failedLpOut = run(signal, failedLp.context);
  check("dimensions of a signal that did not complete are not read", (failedLpOut.metadata.dimensionsRead as number) === 12 && metaOf(failedLpOut)["need.PRICE_TRANSPARENCY"] === "SATISFIED");

  const noAnalysis = createTrafficSignalContext({ candidate });
  check("Missing Context: the signal does not support the analysis", signal.supportsAnalysis(noAnalysis) === false);
  check("Missing Context: the validator rejects it", has(signal.validate(noAnalysis), /Missing context/) && has(validateOfferStrategyContext(null), /Missing context/) && has(validateOfferStrategyContext({ ...base.context, opportunityAnalysis: null }), /Missing context: an Opportunity analysis/));
  const forced = run(signal, noAnalysis);
  check("Missing Context: analyze FAILS with the reason and no strategies", forced.status === "FAILED" && forced.errors.some((e) => /Missing context/.test(e)) && forced.confidence === null && Object.keys(forced.metadata).length === 0);
  const skipped = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerOfferStrategySignal(p, { now: zero }); return p.run(noAnalysis); })();
  check("Missing Context: in a pipeline the signal is SKIPPED", skipped.results.length === 1 && skipped.results[0].status === "SKIPPED");
  check("Invalid Context: an analysis that failed or was refused cannot be read", ["FAILED", "REFUSED"].every((status) => has(validateOfferStrategyContext({ ...base.context, opportunityAnalysis: { ...base.context.opportunityAnalysis, status } }), /only a COMPLETED or PARTIAL analysis can be read/)));
  const failedAnalysis = await scenario({ mutate: (analysis) => { analysis.status = "FAILED"; } });
  check("Invalid Context: analyze FAILS for an analysis that did not complete", run(signal, failedAnalysis.context).status === "FAILED");
  check("Invalid Context: a strategy both enabled and disabled is rejected", has(validateOfferConfiguration({ [OFFER_INPUT_KEYS.enabled]: "trial,bundle", [OFFER_INPUT_KEYS.disabled]: "bundle" }), /both enabled and disabled/));
  const bothOut = run(signal, (await scenario({ configuration: { [OFFER_INPUT_KEYS.enabled]: "trial", [OFFER_INPUT_KEYS.disabled]: "trial" } })).context);
  check("Invalid Context: analyze FAILS for a contradicting configuration", bothOut.status === "FAILED" && bothOut.errors.some((e) => /both enabled and disabled/.test(e)));
  check("Duplicate Strategy: a strategy listed twice in the enabled list is rejected", has(validateOfferConfiguration({ [OFFER_INPUT_KEYS.enabled]: "trial,bundle,trial" }), /Duplicate strategy "trial"/));
  const dupOut = run(signal, (await scenario({ configuration: { [OFFER_INPUT_KEYS.enabled]: "trial,trial" } })).context);
  check("Duplicate Strategy: analyze FAILS for a duplicate in the configuration", dupOut.status === "FAILED" && dupOut.errors.some((e) => /Duplicate strategy "trial"/.test(e)));
  const dupRegistry = { ...createDefaultOfferStrategyRegistry(), list: () => { const e = { id: "trial", strategy: DEFAULT_OFFER_STRATEGIES[3], enabled: true }; return [e, e]; } } as never;
  check("Duplicate Strategy: the signal FAILS if its registry lists a strategy twice", run(createOfferStrategySignal({ now: zero, registry: dupRegistry }), base.context).status === "FAILED");
  const badRegistry = { ...createDefaultOfferStrategyRegistry(), list: () => [{ id: "trial", strategy: { ...DEFAULT_OFFER_STRATEGIES[3], family: "NOPE" }, enabled: true }] } as never;
  check("Invalid Offer Definition: the signal FAILS if its registry holds an invalid strategy", run(createOfferStrategySignal({ now: zero, registry: badRegistry }), base.context).status === "FAILED");
  check("Invalid Metadata: nested configuration is rejected", has(validateOfferConfiguration({ a: { b: 1 } }), /Invalid metadata/));
  const badInputs = (over: Record<string, unknown>) => validateOfferStrategyInputs({ opportunityAnalysis: base.context.opportunityAnalysis, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, strategies: DEFAULT_OFFER_STRATEGIES, dimensionSources: DEFAULT_OFFER_SOURCES, content: null, ...over });
  check("Invalid Metadata: nested execution metadata is rejected", has(badInputs({ executionMetadata: { a: { b: 1 } } }), /Invalid metadata: "executionMetadata"/) && badInputs({}).length === 0);
  check("content: none is valid, and a complete one is valid", validateOfferStrategyContent(null).length === 0 && validateOfferStrategyContent(PAGE()).length === 0);
  check("content: overrides carry effective values only", has(validateOfferStrategyContent({ evidenceContext: null, landingPage: null, manualOverrides: [{ field: "a", value: "x", id: 7 }] }), /unexpected field "id"/));
  const throwingProvider = run(createOfferStrategySignal({ now: zero, content: () => { throw new Error("provider exploded"); } }), base.context);
  check("a provider that throws makes the signal FAIL, never a guess", throwingProvider.status === "FAILED" && throwingProvider.errors.some((e) => /provider exploded/.test(e)));

  const goodResult = analyzeOfferStrategy({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, strategies: DEFAULT_OFFER_STRATEGIES, dimensionSources: DEFAULT_OFFER_SOURCES, content: null }, zero);
  check("a real result passes its validator", validateOfferStrategyResult(goodResult, DEFAULT_OFFER_STRATEGIES.map((s) => s.id)).length === 0);
  check("the result keys are exactly the specified ones", same(Object.keys(goodResult).sort(), [...OFFER_RESULT_KEYS].sort()));
  check("a result with a score, ranking, classification, recommendation, budget, or conversion is rejected", ["score", "rank", "ranking", "classification", "recommendation", "budget", "conversion"].every((field) => has(validateOfferStrategyResult({ ...goodResult, [field]: 1 }), new RegExp(`unexpected field "${field}"`))));
  check("Duplicate Strategy: a result that lists a strategy twice is rejected", has(validateOfferStrategyResult({ ...goodResult, supportedStrategies: ["trial", "trial"], unsupportedStrategies: [] }), /Duplicate strategy "trial"/));
  check("an unsorted list is rejected, so that order cannot imply a ranking", has(validateOfferStrategyResult({ ...goodResult, supportedStrategies: ["trial", "bundle"], unsupportedStrategies: [] }), /must be sorted by id/));
  check("both lists are sorted by id", same(listOf(out, "supportedStrategies"), [...listOf(out, "supportedStrategies")].sort()));
  const reversed = createOfferStrategySignal({ now: zero, registry: createOfferStrategyRegistry([...DEFAULT_OFFER_STRATEGIES].reverse()) }).analyze(base.context, {} as never);
  check("the order of the strategies changes nothing", stable(reversed) === stable(out));
  check("no metadata key names a score, rank, budget, recommendation, or conversion", Object.keys(metaOf(out)).every((k) => !/score|rank|budget|recommend|conversion|classif/i.test(k)));
  check("the signal output is exactly status, confidence, metadata, warnings, and errors", same(Object.keys(offerStrategyToSignalOutput(goodResult)).sort(), ["confidence", "errors", "metadata", "status", "warnings"]));

  check("the same context gives the same output", stable(run(signal, base.context)) === stable(run(signal, base.context)));
  const clockInputs = { opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, configuration: {}, strategies: DEFAULT_OFFER_STRATEGIES, dimensionSources: DEFAULT_OFFER_SOURCES, content: null };
  check("executionTime comes from the injected clock", analyzeOfferStrategy(clockInputs, tick()).executionTime === 1 && analyzeOfferStrategy(clockInputs, () => Number.NaN).executionTime === 0);
  check("independent execution: the output does not depend on any other signal", stable(signal.analyze(base.context, { "other-signal": { signalId: "other-signal", status: "COMPLETED", confidence: 1, metadata: { x: 1 }, warnings: [], errors: [], executionTime: 0 } } as never)) === stable(out));

  const calls: string[] = [];
  const sibling = (id: string, over: Partial<TrafficSignalModule> = {}): TrafficSignalModule => ({
    id,
    name: `Sibling ${id}`,
    version: "1.0.0",
    category: "FUTURE",
    enabled: true,
    priority: 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsAnalysis: () => true,
    validate: () => [],
    analyze: () => {
      calls.push(id);
      return { status: "COMPLETED", confidence: null, metadata: { sibling: id }, warnings: [], errors: [] };
    },
    ...over,
  });
  const together = createTrafficSignalPipeline({ now: zero });
  together.register(sibling("zeta-sibling"));
  registerChannelSuitabilitySignal(together, { now: zero });
  registerPolicyRiskSignal(together, { now: zero });
  registerAudienceFitSignal(together, { now: zero });
  registerOfferStrategySignal(together, { now: zero });
  together.register(sibling("broken-sibling", { analyze: () => { throw new Error("sibling exploded"); }, priority: 65 }));
  const togetherRun = await together.run(base.context);
  const own = togetherRun.results.find((r) => r.signalId === "offer-strategy")!;
  const channel = togetherRun.results.find((r) => r.signalId === "channel-suitability")!;
  const policy = togetherRun.results.find((r) => r.signalId === "policy-risk")!;
  const audience = togetherRun.results.find((r) => r.signalId === "audience-fit")!;
  check("it runs sequentially beside Channel Suitability, Policy Risk, and Audience Fit, in priority order", togetherRun.order.join() === "zeta-sibling,channel-suitability,policy-risk,audience-fit,broken-sibling,offer-strategy" && togetherRun.results.length === 6);
  check("prior traffic signals regression: all four COMPLETE and none changes the others' output", own.status === "COMPLETED" && channel.status === "COMPLETED" && policy.status === "COMPLETED" && audience.status === "COMPLETED" && sameOutput(channel, run(createChannelSuitabilitySignal({ now: zero }), base.context)) && sameOutput(policy, run(createPolicyRiskSignal({ now: zero }), base.context)) && sameOutput(audience, run(createAudienceFitSignal({ now: zero }), base.context)) && sameOutput(own, out));
  check("a sibling that throws does not change this signal's output", togetherRun.results.find((r) => r.signalId === "broken-sibling")!.status === "FAILED" && own.status === "COMPLETED");
  check("this signal does not run the other signals", calls.join() === "zeta-sibling");
  const alone = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerOfferStrategySignal(p, { now: zero }); return p.run(base.context); })();
  check("it runs alone with the same output", alone.results.length === 1 && stable(alone.results[0].metadata) === stable(own.metadata));
  const disabledPipeline = createTrafficSignalPipeline({ now: zero });
  registerOfferStrategySignal(disabledPipeline, { enabled: false, now: zero });
  check("disabled, the pipeline does not run it", (await disabledPipeline.run(base.context)).results.length === 0);
  const unreadable = createTrafficSignalPipeline({ now: zero });
  registerOfferStrategySignal(unreadable, { now: zero });
  check("an unreadable context makes the pipeline report FAILED for this signal", (await unreadable.run(failedAnalysis.context)).results[0].status === "FAILED");

  const contentObject = PAGE();
  const contentBefore = JSON.stringify(contentObject);
  const before = { context: JSON.stringify(base.context), analysis: JSON.stringify(base.context.opportunityAnalysis), explanation: JSON.stringify(base.context.opportunityExplanation), candidate: JSON.stringify(base.context.candidate) };
  const reg = createDefaultOfferStrategyRegistry();
  const regBefore = JSON.stringify(reg.list());
  const first = run(withContent(contentObject, { registry: reg }), base.context);
  (first.metadata as Record<string, unknown>).tampered = true;
  check("no Opportunity mutation", JSON.stringify(base.context.opportunityAnalysis) === before.analysis && JSON.stringify(base.context.opportunityExplanation) === before.explanation && JSON.stringify(base.context) === before.context);
  check("no Discovery mutation", JSON.stringify(base.context.candidate) === before.candidate && JSON.stringify(candidate) === candidateBefore);
  check("no mutation of the supplied content or the strategies", JSON.stringify(contentObject) === contentBefore && JSON.stringify(reg.list()) === regBefore);
  check("the context stays deep frozen", Object.isFrozen(base.context) && Object.isFrozen(base.context.opportunityAnalysis));
  check("changing a returned result does not change a later one", !("tampered" in run(withContent(contentObject, { registry: reg }), base.context).metadata));
  check("the strategy entries are frozen", reg.list().every((e) => Object.isFrozen(e) && Object.isFrozen(e.strategy)) && (() => { const p = reg.get("trial")!.strategy; const n = p.name; try { (p as { name: string }).name = "x"; } catch { /* frozen */ } return p.name === n; })());

  const trafficDir = join(process.cwd(), "src", "lib", "traffic");
  const offerFiles = readdirSync(trafficDir).filter((name) => name.startsWith("offer-") && name.endsWith(".ts"));
  check("the signal is six modules", offerFiles.length === 6 && ["offer-strategy-analyzer.ts", "offer-strategy-definitions.ts", "offer-strategy-registry.ts", "offer-strategy-result.ts", "offer-strategy-signal.ts", "offer-strategy-validator.ts"].every((name) => offerFiles.includes(name)));
  const sources = offerFiles.map((name) => ({ name, text: readFileSync(join(trafficDir, name), "utf8") }));
  const statements = (text: string) => text.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
  const importPath = (statement: string) => /from\s+"([^"]+)"/.exec(statement)![1];
  const allImports = sources.flatMap((s) => statements(s.text).map((statement) => ({ file: s.name, statement, path: importPath(statement) })));
  check("every import is local to the traffic module or a type-only import of an Opportunity or Discovery shape", allImports.every((i) => i.path.startsWith("./") || (/^\.\.\/(opportunity|discovery)\//.test(i.path) && /^import type /.test(i.statement))) && allImports.some((i) => i.path.startsWith("../opportunity/")));
  check("no import from ProductFacts, the LP Builder, the importer, grounding, publication, tracking, analytics, a database, or the network", allImports.every((i) => !/product-facts|lp-|landing|importer|grounding|publication|tracking|analytics|sqlite|\/db|node:|http|openai|anthropic/i.test(i.path.replace(/^\.\.\/opportunity\//, "").replace(/opportunity-explanation-result|opportunity-resolver-analysis/, ""))));
  const code = sources.map((s) => ({ name: s.name, text: stripCode(s.text) }));
  check("no score, ranking, classification, budget, campaign, conversion, keyword, or CPC logic in the code", code.every((c) => !/\b(score|rank|ranking|classif\w*|budget|campaign|conversion|keyword|cpc|adwords)\b/i.test(c.text)));
  check("no HTTP, network, AI, database, file, or environment access in the code", code.every((c) => !/\b(fetch|XMLHttpRequest|WebSocket|require|readFile|writeFile|process\.env|Math\.random|new Date|Date\.now)\b/.test(c.text) && !/openai|anthropic|sqlite|google-ads/i.test(c.text)));
  check("no advertising platform is named anywhere in the modules, comments included", sources.every((s) => !/google ads|facebook ads|lookalike/i.test(s.text)));
  check("no product, slug, or source-path-specific logic", code.every((c) => !/gizmo|example\.test|https?:\/\/|\/products\/|slug/i.test(c.text)));
  check("the code never writes to its inputs", code.every((c) => !/\b(opportunityAnalysis|opportunityExplanation|candidate|executionMetadata|inputs)(\.[A-Za-z]+)*\s*(=[^=]|\.push\(|\.splice\(|\.sort\()/.test(c.text)));
  const sourceTree = walk(join(process.cwd(), "src")).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const outsiders = sourceTree.filter((file) => !file.includes(join("src", "lib", "traffic")) && /offer-strategy/.test(readFileSync(file, "utf8")));
  check("nothing outside the traffic module uses the signal", outsiders.length === 0);
  const prior = ["channel-", "policy-", "audience-"].flatMap((prefix) => readdirSync(trafficDir).filter((n) => n.startsWith(prefix)).map((n) => readFileSync(join(trafficDir, n), "utf8")).join("\n"));
  check("Channel Suitability, Policy Risk, and Audience Fit do not depend on Offer Strategy", !/offer-strategy/.test(prior));
  const others = readdirSync(trafficDir).filter((n) => !n.startsWith("offer-") && !n.startsWith("channel-") && !n.startsWith("policy-") && !n.startsWith("audience-") && n !== "traffic-dimension-reader.ts");
  check("the signal adds files only; no framework or architecture module imports it", others.every((n) => !/offer-strategy/.test(readFileSync(join(trafficDir, n), "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
