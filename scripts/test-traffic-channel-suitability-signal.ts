import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createOpportunityExplanationEngine } from "../src/lib/opportunity/opportunity-explanation-engine.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import {
  CHANNEL_FAMILIES,
  CHANNEL_NEEDS,
  CHANNEL_NEED_KINDS,
  CHANNEL_STATUSES,
  DEFAULT_CHANNEL_DEFINITIONS,
  DEFAULT_NEED_SOURCES,
  NEED_KIND,
  REQUIREMENT_DIMENSIONS,
} from "../src/lib/traffic/channel-definitions.ts";
import type { ChannelDefinition } from "../src/lib/traffic/channel-definitions.ts";
import {
  CHANNEL_DIMENSIONS,
  CHANNEL_INPUT_KEYS,
  CHANNEL_RESULT_KEYS,
  CHANNEL_SUITABILITY_SCOPE_NOTE,
  CHANNEL_VERDICTS,
  channelSuitabilityToSignalOutput,
} from "../src/lib/traffic/channel-suitability-result.ts";
import {
  validateChannelConfiguration,
  validateChannelDefinitions,
  validateChannelSuitabilityContext,
  validateChannelSuitabilityInputs,
  validateChannelSuitabilityResult,
  validateNeedSources,
} from "../src/lib/traffic/channel-suitability-validator.ts";
import { analyzeChannelSuitability } from "../src/lib/traffic/channel-suitability-analyzer.ts";
import {
  CHANNEL_SUITABILITY_SIGNAL_ID,
  createChannelSuitabilitySignal,
  registerChannelSuitabilitySignal,
} from "../src/lib/traffic/channel-suitability-signal.ts";
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
const tick = () => {
  let t = 0;
  return () => (t += 1);
};

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const candidateBefore = JSON.stringify(candidate);

// ---------- fixtures built with the real Opportunity Resolver and Explanation Engine ----------
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

/** Which fictional signal reports which Opportunity dimension. Every dimension here is a real Opportunity dimension name. */
const OWNER: Record<string, string> = {
  PRICING: "evid",
  FEATURES: "evid",
  RETURNS: "evid",
  SUPPORTING_CONTENT: "evid",
  FAQ: "evid",
  MANUFACTURER: "evid",
  OFFER_COVERAGE: "lp",
  MEDIA_AVAILABILITY: "lp",
  PRESENTATION_READINESS: "lp",
  INFORMATION_DENSITY: "lp",
  PRICING_COVERAGE: "lp",
  PURCHASE_INTENT: "intent",
  MARKET_DEMAND: "intent",
  PROBLEM_AWARENESS: "intent",
  SOLUTION_AWARENESS: "intent",
  BUYER_READINESS: "intent",
};
const GOOD: Record<string, string> = Object.fromEntries(Object.entries(OWNER).filter(([d]) => d !== "PRICING_COVERAGE").map(([d]) => [d, "STRONG"]));

interface Scenario {
  states?: Record<string, string | null>;
  extra?: Record<string, Record<string, string>>;
  configuration?: Record<string, unknown>;
  explain?: boolean;
  mutate?: (analysis: Record<string, unknown>) => void;
}
async function scenario(options: Scenario = {}) {
  const states = { ...GOOD, ...(options.states ?? {}) };
  const bySignal: Record<string, Record<string, string>> = { evid: {}, lp: {}, intent: {} };
  for (const [dimension, state] of Object.entries(states)) if (state !== null) bySignal[OWNER[dimension]][`dimension.${dimension}`] = state;
  for (const [id, dims] of Object.entries(options.extra ?? {})) bySignal[id] = Object.fromEntries(Object.entries(dims).map(([d, s]) => [`dimension.${d}`, s]));
  const signals = createSignalPipeline({ now: zero });
  Object.entries(bySignal).forEach(([id, metadata], i) => signals.register(fakeOpportunity(id, CATEGORIES[i % CATEGORIES.length], metadata)));
  const opportunityContext = createOpportunityExecutionContext({
    candidate,
    evidenceContext: createEvidenceContext({ candidate, metadata: {}, extensions: {}, resolvedProductData: {} }),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: {},
  } as never);
  const run = await createOpportunityResolver({ signals, ...resolverClocks() } as never).run(opportunityContext);
  const analysis = JSON.parse(JSON.stringify(run.analysis)) as Record<string, unknown>;
  options.mutate?.(analysis);
  const explanation = options.explain === false ? null : createOpportunityExplanationEngine({ now: tick() }).explain(run.analysis).explanation;
  const context = createTrafficSignalContext({
    candidate,
    opportunityAnalysis: analysis as never,
    opportunityExplanation: explanation as never,
    executionMetadata: { run: "t1", attempt: 2 },
    runtimeMetadata: { host: "h1" },
    configuration: (options.configuration ?? {}) as never,
  });
  return { context, analysis, explanation, run };
}

const signal = createChannelSuitabilitySignal({ now: zero });
const analyzeWith = (context: TrafficSignalContext) => signal.analyze(context, {} as never);
const metaOf = (output: { metadata: Record<string, unknown> }) => output.metadata;
const listOf = (output: { metadata: Record<string, unknown> }, key: string) => String(output.metadata[key] ?? "").split(",").filter((part) => part !== "");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}
const stripCode = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/`(?:\\.|[^`\\])*`/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/\/\/.*$/gm, "");

async function main() {
  // ---------- definitions ----------
  check("ten analysis dimensions, in the specified order", same(CHANNEL_DIMENSIONS, ["CHANNEL_AVAILABILITY", "OFFER_COMPATIBILITY", "CONTENT_COMPATIBILITY", "CREATIVE_REQUIREMENTS", "LANDING_PAGE_READINESS", "BRAND_DEPENDENCY", "POLICY_SENSITIVITY", "AUDIENCE_MATCH", "FUNNEL_COMPATIBILITY", "TRAFFIC_INTENT"]));
  check("four verdicts", same(CHANNEL_VERDICTS, ["COMPATIBLE", "INCOMPATIBLE", "NOT_ASSESSED", "NOT_APPLICABLE"]));
  check("fourteen channel definitions, named as specified and in order", same(DEFAULT_CHANNEL_DEFINITIONS.map((d) => d.name), ["Google Search", "Google Shopping", "Performance Max", "Display", "YouTube", "Microsoft Ads", "Facebook", "Instagram", "TikTok", "Pinterest", "Native Ads", "SEO", "Email", "Future Channels"]));
  check("channel ids are unique and the definitions pass their validator", new Set(DEFAULT_CHANNEL_DEFINITIONS.map((d) => d.id)).size === 14 && validateChannelDefinitions(DEFAULT_CHANNEL_DEFINITIONS).length === 0);
  check("the definitions and the need sources are deep frozen", DEFAULT_CHANNEL_DEFINITIONS.every((d) => Object.isFrozen(d) && Object.isFrozen(d.requirements) && Object.isFrozen(d.requirements.OFFER_COMPATIBILITY)) && Object.isFrozen(DEFAULT_CHANNEL_DEFINITIONS) && Object.isFrozen(DEFAULT_NEED_SOURCES) && Object.isFrozen(DEFAULT_NEED_SOURCES.PRICE_INFORMATION));
  check("future channels are a placeholder and no other channel is", DEFAULT_CHANNEL_DEFINITIONS.filter((d) => d.status === "PLACEHOLDER").map((d) => d.id).join() === "future" && DEFAULT_CHANNEL_DEFINITIONS.find((d) => d.id === "future")!.reviewsContent === false);
  check("every need has a kind and a source list, and the default tables pass their validator", CHANNEL_NEEDS.every((n) => CHANNEL_NEED_KINDS.includes(NEED_KIND[n]) && DEFAULT_NEED_SOURCES[n].length > 0) && validateNeedSources(DEFAULT_NEED_SOURCES).length === 0);
  check("every requirement refers to a known need, and both need kinds are used", DEFAULT_CHANNEL_DEFINITIONS.every((d) => REQUIREMENT_DIMENSIONS.every((dim) => d.requirements[dim].every((n) => CHANNEL_NEEDS.includes(n)))) && CHANNEL_NEEDS.some((n) => NEED_KIND[n] === "STRUCTURAL") && CHANNEL_NEEDS.some((n) => NEED_KIND[n] === "CONTEXTUAL"));
  check("families and statuses are closed vocabularies that include FUTURE and PLACEHOLDER", CHANNEL_FAMILIES.includes("FUTURE") && CHANNEL_STATUSES.includes("PLACEHOLDER") && DEFAULT_CHANNEL_DEFINITIONS.every((d) => CHANNEL_FAMILIES.includes(d.family)));
  check("the result carries exactly the specified fields", same([...CHANNEL_RESULT_KEYS].sort(), ["confidence", "executionTime", "metadata", "status", "supportedChannels", "unsupportedChannels", "warnings"]));

  // ---------- the signal ----------
  check("signal identity and contract", signal.id === CHANNEL_SUITABILITY_SIGNAL_ID && signal.id === "channel-suitability" && signal.version === "1.0.0" && signal.category === "TRAFFIC_CHANNEL" && signal.enabled === true && signal.priority === 90 && validateTrafficSignalModule(signal).length === 0);
  check("the signal depends on no other signal", signal.dependencies.requires.length === 0 && signal.dependencies.optional.length === 0 && signal.dependencies.conflicts.length === 0);
  const tuned = createChannelSuitabilitySignal({ enabled: false, priority: 5 });
  check("enabled and priority can be set", tuned.enabled === false && tuned.priority === 5);

  // ---------- registration in the Traffic Signal Framework ----------
  const registry = createTrafficModuleRegistry();
  const entry = registerChannelSuitabilitySignal(registry, { now: zero });
  check("registration returns the entry, enabled, in the registry", entry.id === "channel-suitability" && entry.enabled === true && registry.count() === 1 && registry.get("channel-suitability")?.module.category === "TRAFFIC_CHANNEL");
  let duplicate = false;
  try {
    registerChannelSuitabilitySignal(registry, { now: zero });
  } catch (error) {
    duplicate = error instanceof TrafficFrameworkError && /already registered/.test(error.message + error.issues.map((i) => i.message).join());
  }
  check("registering it twice is rejected as a duplicate signal id", duplicate && registry.count() === 1);
  const pipelineHost = createTrafficSignalPipeline({ now: zero });
  registerChannelSuitabilitySignal(pipelineHost, { now: zero });
  check("registration works on a pipeline, and its dependencies are valid", pipelineHost.validateDependencies().length === 0 && pipelineHost.resolveExecutionOrder().order.join() === "channel-suitability");

  // ---------- a well-evidenced offer ----------
  const base = await scenario({ configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: false } });
  const out = analyzeWith(base.context);
  check("a well-evidenced offer COMPLETES", out.status === "COMPLETED" && out.errors.length === 0 && validateTrafficSignalOutput(out).length === 0);
  check("every defined channel is supported and only the placeholder is not", same(listOf(out, "supportedChannels"), DEFAULT_CHANNEL_DEFINITIONS.filter((d) => d.id !== "future").map((d) => d.id).sort()) && same(listOf(out, "unsupportedChannels"), ["future"]));
  check("the placeholder is unsupported because it is a placeholder", /CHANNEL_AVAILABILITY/.test(String(metaOf(out)["reason.future"])) && /placeholder/.test(String(metaOf(out)["unavailable.future"])));
  check("with every dimension established, confidence is 1", out.confidence === 1 && metaOf(out).assessedCount === metaOf(out).assessableCount);
  check("all ten dimensions have a verdict for the first channel", CHANNEL_DIMENSIONS.every((d) => CHANNEL_VERDICTS.includes(String(metaOf(out)[`verdict.google-search.${d}`]) as never)));
  check("a channel that needs nothing for a dimension is NOT_APPLICABLE", metaOf(out)["verdict.google-search.CREATIVE_REQUIREMENTS"] === "NOT_APPLICABLE" && metaOf(out)["verdict.seo.CREATIVE_REQUIREMENTS"] === "NOT_APPLICABLE");
  check("a channel that does not review content has NOT_APPLICABLE policy sensitivity", metaOf(out)["verdict.seo.POLICY_SENSITIVITY"] === "NOT_APPLICABLE" && metaOf(out)["verdict.email.POLICY_SENSITIVITY"] === "NOT_APPLICABLE" && metaOf(out)["verdict.google-search.POLICY_SENSITIVITY"] === "COMPATIBLE");
  check("the metadata holds counts, the scope note, and the Opportunity references", metaOf(out).channelCount === 14 && metaOf(out).supportedCount === 13 && metaOf(out).unsupportedCount === 1 && metaOf(out).scopeNote === CHANNEL_SUITABILITY_SCOPE_NOTE && metaOf(out).opportunityAnalysisId === (base.analysis as { analysisId: string }).analysisId && metaOf(out).candidateId === "cand-1" && metaOf(out).explanationSupplied === true && metaOf(out).dimensionsRead === 15);
  check("every need is restated in the metadata", CHANNEL_NEEDS.every((n) => typeof metaOf(out)[`need.${n}`] === "string") && metaOf(out)["need.PRICE_INFORMATION"] === "SATISFIED" && metaOf(out)["need.MEDIA_ASSETS"] === "SATISFIED");
  check("execution metadata is passed through under its own key", metaOf(out)["execution.run"] === "t1" && metaOf(out)["execution.attempt"] === 2);
  check("a well-evidenced offer carries no warnings", out.warnings.length === 0);
  check("the output metadata is flat", validateTrafficSignalOutput(out).length === 0 && Object.values(metaOf(out)).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  check("the scope note says it is no ranking, score, or recommendation", /not a ranking/i.test(CHANNEL_SUITABILITY_SCOPE_NOTE) && /score/i.test(CHANNEL_SUITABILITY_SCOPE_NOTE) && /recommend/i.test(CHANNEL_SUITABILITY_SCOPE_NOTE));

  // ---------- no declaration about policy sensitivity ----------
  const undeclared = analyzeWith((await scenario()).context);
  check("without a policy declaration, channels that review content are NOT_ASSESSED for it", metaOf(undeclared)["verdict.google-search.POLICY_SENSITIVITY"] === "NOT_ASSESSED" && metaOf(undeclared)["notAssessed.google-search"] === "POLICY_SENSITIVITY");
  check("confidence is the share of dimensions that could be established, below 1 when some could not", typeof undeclared.confidence === "number" && undeclared.confidence > 0 && undeclared.confidence < 1 && undeclared.confidence === Number(metaOf(undeclared).assessedCount) / Number(metaOf(undeclared).assessableCount));
  check("not assessing policy does not exclude any channel", same(listOf(undeclared, "supportedChannels"), listOf(out, "supportedChannels")));

  // ---------- policy sensitivity is a declaration, never an evaluation ----------
  const sensitive = analyzeWith((await scenario({ configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: true } })).context);
  check("declared policy-sensitive: reviewing channels are NOT_ASSESSED and a warning says no policy was evaluated", metaOf(sensitive)["verdict.facebook.POLICY_SENSITIVITY"] === "NOT_ASSESSED" && sensitive.warnings.some((w) => /policy-sensitive/.test(w) && /no policy was evaluated/.test(w)));
  check("declared policy-sensitive: channels that do not review content are NOT_APPLICABLE", metaOf(sensitive)["verdict.seo.POLICY_SENSITIVITY"] === "NOT_APPLICABLE" && metaOf(sensitive)["verdict.email.POLICY_SENSITIVITY"] === "NOT_APPLICABLE");
  check("declared policy-sensitive: no channel is excluded for it", same(listOf(sensitive, "supportedChannels"), listOf(out, "supportedChannels")));
  check("the warning counts the available reviewing channels", sensitive.warnings.some((w) => /11 available channels review content/.test(w)));

  // ---------- structural needs ----------
  const noMedia = analyzeWith((await scenario({ states: { MEDIA_AVAILABILITY: "MISSING" }, configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: false } })).context);
  const needMedia = DEFAULT_CHANNEL_DEFINITIONS.filter((d) => d.requirements.CREATIVE_REQUIREMENTS.includes("MEDIA_ASSETS")).map((d) => d.id);
  check("a structural need reported missing excludes exactly the channels that need it", same(listOf(noMedia, "unsupportedChannels"), [...needMedia, "future"].sort()) && needMedia.length === 9);
  check("channels that do not need creative media stay supported", same(listOf(noMedia, "supportedChannels"), ["email", "google-search", "microsoft-ads", "seo"]));
  check("the reason names the dimension and the need that was not met", noMedia.metadata["reason.facebook"] === "INCOMPATIBLE: CREATIVE_REQUIREMENTS" && noMedia.metadata["unmet.facebook.CREATIVE_REQUIREMENTS"] === "MEDIA_ASSETS" && metaOf(noMedia)["verdict.facebook.CREATIVE_REQUIREMENTS"] === "INCOMPATIBLE");
  check("a need reported missing is ABSENT in the metadata", metaOf(noMedia)["need.MEDIA_ASSETS"] === "ABSENT");
  const weakMedia = analyzeWith((await scenario({ states: { MEDIA_AVAILABILITY: "WEAK" }, configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: false } })).context);
  check("a need reported weak is only partly evidenced: it does not exclude, and a warning says so", metaOf(weakMedia)["need.MEDIA_ASSETS"] === "PARTIAL" && same(listOf(weakMedia, "supportedChannels"), listOf(out, "supportedChannels")) && weakMedia.warnings.some((w) => /partly evidenced/.test(w) && /MEDIA_ASSETS/.test(w)));
  const neutralMedia = analyzeWith((await scenario({ states: { MEDIA_AVAILABILITY: "ADEQUATE" }, configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: false } })).context);
  check("a need reported neutrally is also partial", metaOf(neutralMedia)["need.MEDIA_ASSETS"] === "PARTIAL");
  const noBrand = analyzeWith((await scenario({ states: { MANUFACTURER: "MISSING" } })).context);
  check("brand dependency excludes the channels that depend on a brand", ["seo", "email", "facebook", "instagram", "tiktok", "youtube", "pinterest"].every((id) => listOf(noBrand, "unsupportedChannels").includes(id)) && metaOf(noBrand)["verdict.seo.BRAND_DEPENDENCY"] === "INCOMPATIBLE" && !listOf(noBrand, "unsupportedChannels").includes("google-search"));
  const noPrice = analyzeWith((await scenario({ states: { PRICING: "MISSING" } })).context);
  check("a missing price excludes the channel that needs price information and no other", same(listOf(noPrice, "unsupportedChannels"), ["future", "google-shopping"]) && noPrice.metadata["unmet.google-shopping.OFFER_COMPATIBILITY"] === "PRICE_INFORMATION");
  const noPage = analyzeWith((await scenario({ states: { PRESENTATION_READINESS: "MISSING" } })).context);
  check("page readiness is reported missing only when both its sources are, otherwise the other source decides", metaOf(noPage)["need.PAGE_READINESS"] === "ABSENT" && listOf(noPage, "unsupportedChannels").length === 14);

  // ---------- contextual needs and unknown needs never exclude ----------
  const noAudience = analyzeWith((await scenario({ states: { MARKET_DEMAND: "MISSING", PROBLEM_AWARENESS: "MISSING" }, configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: false } })).context);
  check("a contextual need reported missing is NOT_ASSESSED and excludes nothing", metaOf(noAudience)["need.AUDIENCE_EVIDENCE"] === "ABSENT" && metaOf(noAudience)["verdict.facebook.AUDIENCE_MATCH"] === "NOT_ASSESSED" && same(listOf(noAudience, "unsupportedChannels"), ["future"]));
  check("not assessing something lowers confidence and lists it", (noAudience.confidence as number) < 1 && /AUDIENCE_MATCH/.test(String(metaOf(noAudience)["notAssessed.facebook"])));
  const noPricingAtAll = analyzeWith((await scenario({ states: { PRICING: null }, configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: false } })).context);
  check("a need nothing reported on is UNKNOWN, never ABSENT, and does not exclude", metaOf(noPricingAtAll)["need.PRICE_INFORMATION"] === "UNKNOWN" && metaOf(noPricingAtAll)["verdict.google-shopping.OFFER_COMPATIBILITY"] === "NOT_ASSESSED" && listOf(noPricingAtAll, "supportedChannels").includes("google-shopping"));
  check("an unknown need lowers confidence", (noPricingAtAll.confidence as number) < 1);

  // ---------- sources ----------
  const conflicting = analyzeWith((await scenario({ states: { PRICING: "MISSING", PRICING_COVERAGE: "STRONG" } })).context);
  check("any source reported strong satisfies the need, and the disagreement is a warning", metaOf(conflicting)["need.PRICE_INFORMATION"] === "SATISFIED" && listOf(conflicting, "supportedChannels").includes("google-shopping") && conflicting.warnings.some((w) => /sources of "PRICE_INFORMATION" disagree/.test(w)));
  const twoSignals = analyzeWith((await scenario({ states: { MARKET_DEMAND: "STRONG" }, extra: { other: { MARKET_DEMAND: "MISSING" } } })).context);
  check("two signals disagreeing about one dimension keep the stronger report and warn", metaOf(twoSignals)["need.AUDIENCE_EVIDENCE"] === "SATISFIED" && twoSignals.warnings.some((w) => /disagree about "MARKET_DEMAND"/.test(w)));
  const onlyMissingFromTwo = analyzeWith((await scenario({ states: { MARKET_DEMAND: "MISSING", PROBLEM_AWARENESS: null }, extra: { other: { MARKET_DEMAND: "MISSING" } } })).context);
  check("two signals agreeing it is missing do not warn", metaOf(onlyMissingFromTwo)["need.AUDIENCE_EVIDENCE"] === "ABSENT" && !onlyMissingFromTwo.warnings.some((w) => /disagree/.test(w)));

  // ---------- what a signal that did not complete left behind is never read ----------
  const failedLp = await scenario({ states: { MEDIA_AVAILABILITY: "MISSING" }, mutate: (analysis) => { (analysis.signalResults as Array<{ signalId: string; status: string }>).find((r) => r.signalId === "lp")!.status = "FAILED"; } });
  const failedOut = analyzeWith(failedLp.context);
  check("dimensions of a signal that did not complete are not read", metaOf(failedOut)["need.MEDIA_ASSETS"] === "UNKNOWN" && listOf(failedOut, "supportedChannels").includes("facebook") && (metaOf(failedOut).dimensionsRead as number) === 11);
  check("a signal's own result is the authority on whether it completed", (failedLp.explanation!.missingEvidence.some((i) => i.signalId === "lp" && i.dimension === "MEDIA_AVAILABILITY")) && metaOf(failedOut)["need.MEDIA_ASSETS"] !== "ABSENT");

  // ---------- no explanation, partial analysis ----------
  const noExplanation = await scenario({ explain: false });
  const noExOut = analyzeWith(noExplanation.context);
  check("without an explanation only availability is established, with a warning", noExOut.status === "COMPLETED" && metaOf(noExOut).explanationSupplied === false && metaOf(noExOut).dimensionsRead === 0 && noExOut.warnings.some((w) => /No Opportunity explanation/.test(w)));
  check("without an explanation nothing is excluded for evidence and confidence is below 1", same(listOf(noExOut, "unsupportedChannels"), ["future"]) && (noExOut.confidence as number) < 1 && (noExOut.confidence as number) > 0);
  const partial = analyzeWith((await scenario({ mutate: (analysis) => { analysis.status = "PARTIAL"; } })).context);
  check("a PARTIAL Opportunity analysis can be read, and says so", partial.status === "COMPLETED" && partial.warnings.some((w) => /PARTIAL/.test(w)) && metaOf(partial).opportunityStatus === "PARTIAL");
  const emptyExplanation = analyzeWith((await scenario({ states: Object.fromEntries(Object.keys(GOOD).map((d) => [d, null])) })).context);
  check("an explanation that reports no dimension is flagged", emptyExplanation.warnings.some((w) => /reports no dimension/.test(w)) && metaOf(emptyExplanation).dimensionsRead === 0);

  // ---------- availability from the configuration ----------
  const onlyTwo = analyzeWith((await scenario({ configuration: { [CHANNEL_INPUT_KEYS.enabled]: "google-search, email" } })).context);
  check("an enabled list makes every other channel unavailable", same(listOf(onlyTwo, "supportedChannels"), ["email", "google-search"]) && onlyTwo.metadata["unavailable.tiktok"] === "the configuration enables other channels only" && metaOf(onlyTwo)["verdict.tiktok.CHANNEL_AVAILABILITY"] === "INCOMPATIBLE");
  const disabledOne = analyzeWith((await scenario({ configuration: { [CHANNEL_INPUT_KEYS.disabled]: "tiktok" } })).context);
  check("a disabled list removes only the named channel", same(listOf(disabledOne, "unsupportedChannels"), ["future", "tiktok"]) && disabledOne.metadata["unavailable.tiktok"] === "the configuration disables it");
  const enableFuture = analyzeWith((await scenario({ configuration: { [CHANNEL_INPUT_KEYS.enabled]: "future,email" } })).context);
  check("enabling the placeholder does not make it available", listOf(enableFuture, "unsupportedChannels").includes("future") && /placeholder/.test(String(enableFuture.metadata["unavailable.future"])) && listOf(enableFuture, "supportedChannels").join() === "email");
  const unknownId = analyzeWith((await scenario({ configuration: { [CHANNEL_INPUT_KEYS.disabled]: "nonexistent-net" } })).context);
  check("a channel id with no definition is a warning, not a failure", unknownId.status === "COMPLETED" && unknownId.warnings.some((w) => /"nonexistent-net", which has no definition/.test(w)) && listOf(unknownId, "unsupportedChannels").join() === "future");
  check("availability is judged before evidence: an unavailable channel is still described by the other dimensions", metaOf(disabledOne)["verdict.tiktok.OFFER_COMPATIBILITY"] === "COMPATIBLE");

  // ---------- rejections ----------
  const noAnalysis = createTrafficSignalContext({ candidate });
  check("Missing Opportunity Analysis: the signal does not support the analysis", signal.supportsAnalysis(noAnalysis) === false);
  check("Missing Opportunity Analysis: the validator rejects it", has(signal.validate(noAnalysis), /Missing opportunity analysis/) && has(validateChannelSuitabilityContext({ ...base.context, opportunityAnalysis: null }), /Missing opportunity analysis/) && has(validateChannelSuitabilityContext({ ...base.context, opportunityAnalysis: undefined }), /Missing opportunity analysis/));
  const forcedNoAnalysis = analyzeWith(noAnalysis);
  check("Missing Opportunity Analysis: analyze FAILS with the reason and no channels", forcedNoAnalysis.status === "FAILED" && forcedNoAnalysis.errors.some((e) => /Missing opportunity analysis/.test(e)) && forcedNoAnalysis.confidence === null && Object.keys(forcedNoAnalysis.metadata).length === 0);
  check("Missing Opportunity Analysis: the analyzer inputs reject it too", has(validateChannelSuitabilityInputs({ opportunityAnalysis: null, opportunityExplanation: null, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }), /Missing opportunity analysis/));
  const skippedRun = await (async () => {
    const pipeline = createTrafficSignalPipeline({ now: zero });
    registerChannelSuitabilitySignal(pipeline, { now: zero });
    return pipeline.run(noAnalysis);
  })();
  check("Missing Opportunity Analysis: in a pipeline the signal is SKIPPED", skippedRun.results.length === 1 && skippedRun.results[0].status === "SKIPPED");

  check("Invalid Context: null, a string, and an array are rejected", [null, "x", [], 5].every((value) => has(validateChannelSuitabilityContext(value), /Invalid context/)));
  check("Invalid Context: an empty object is rejected", validateChannelSuitabilityContext({}).length > 0);
  check("Invalid Context: an analysis that failed or was refused cannot be read", ["FAILED", "REFUSED"].every((status) => has(validateChannelSuitabilityContext({ ...base.context, opportunityAnalysis: { ...base.context.opportunityAnalysis, status } }), /only a COMPLETED or PARTIAL analysis can be read/)));
  const failedAnalysis = await scenario({ mutate: (analysis) => { analysis.status = "FAILED"; } });
  const failedAnalysisOut = analyzeWith(failedAnalysis.context);
  check("Invalid Context: analyze FAILS for an analysis that did not complete", failedAnalysisOut.status === "FAILED" && failedAnalysisOut.errors.some((e) => /FAILED/.test(e)));
  check("Invalid Context: an analysis without its result list is rejected", has(validateChannelSuitabilityContext({ ...base.context, opportunityAnalysis: { ...base.context.opportunityAnalysis, signalResults: "x" } }), /signalResults/));
  check("Invalid Context: an explanation without its lists is rejected", has(validateChannelSuitabilityContext({ ...base.context, opportunityExplanation: { ...base.context.opportunityExplanation, strengths: undefined } }), /strengths/));
  check("Invalid Context: an explanation of another analysis is rejected", has(validateChannelSuitabilityInputs({ opportunityAnalysis: base.context.opportunityAnalysis, opportunityExplanation: { ...base.context.opportunityExplanation, analysisId: "other" }, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }), /different analysis/));
  check("Invalid Context: a conflicting candidate reference is rejected by the context itself", has(validateChannelSuitabilityContext({ ...base.context, candidate: { ...candidate, id: "cand-2" } }), /./));
  check("Invalid Context: a channel both enabled and disabled is rejected", has(validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.enabled]: "email,seo", [CHANNEL_INPUT_KEYS.disabled]: "seo" }), /both enabled and disabled/));
  const bothOut = analyzeWith((await scenario({ configuration: { [CHANNEL_INPUT_KEYS.enabled]: "email", [CHANNEL_INPUT_KEYS.disabled]: "email" } })).context);
  check("Invalid Context: analyze FAILS for a contradicting configuration", bothOut.status === "FAILED" && bothOut.errors.some((e) => /both enabled and disabled/.test(e)));
  check("Invalid Context: a malformed channel id or entry is rejected", has(validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.enabled]: "Bad Id" }), /only channel ids/) && has(validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.enabled]: "email,,seo" }), /no empty entry/) && has(validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.disabled]: 5 }), /comma-separated/));
  check("Invalid Context: the policy declaration must be true or false", has(validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.policySensitive]: "yes" }), /true or false/) && validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.policySensitive]: false }).length === 0 && validateChannelConfiguration({}).length === 0);

  check("Duplicate Channels: a channel listed twice in the enabled list is rejected", has(validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.enabled]: "email,seo,email" }), /Duplicate channel "email"/));
  check("Duplicate Channels: a channel listed twice in the disabled list is rejected", has(validateChannelConfiguration({ [CHANNEL_INPUT_KEYS.disabled]: "seo,seo" }), /Duplicate channel "seo"/));
  const dupOut = analyzeWith((await scenario({ configuration: { [CHANNEL_INPUT_KEYS.enabled]: "email,email" } })).context);
  check("Duplicate Channels: analyze FAILS for a duplicate in the configuration", dupOut.status === "FAILED" && dupOut.errors.some((e) => /Duplicate channel "email"/.test(e)));
  const alphaOnly: ChannelDefinition = { id: "alpha-net", name: "Alpha Net", family: "FUTURE", status: "DEFINED", reviewsContent: true, requirements: { OFFER_COMPATIBILITY: ["OFFER_DETAIL"], CONTENT_COMPATIBILITY: [], CREATIVE_REQUIREMENTS: [], LANDING_PAGE_READINESS: [], BRAND_DEPENDENCY: [], AUDIENCE_MATCH: [], FUNNEL_COMPATIBILITY: [], TRAFFIC_INTENT: [] } };
  check("Duplicate Channels: two definitions with one id are rejected", has(validateChannelDefinitions([alphaOnly, { ...alphaOnly, name: "Other" }]), /Duplicate channel "alpha-net"/));
  const dupDefinitions = createChannelSuitabilitySignal({ definitions: [alphaOnly, { ...alphaOnly, name: "Other" }], now: zero });
  const dupDefOut = dupDefinitions.analyze(base.context, {} as never);
  check("Duplicate Channels: analyze FAILS for duplicate definitions, and so does validate", dupDefOut.status === "FAILED" && dupDefOut.errors.some((e) => /Duplicate channel "alpha-net"/.test(e)) && has(dupDefinitions.validate(base.context), /Duplicate channel/));
  check("Duplicate Channels: a result that lists a channel twice is rejected", has(validateChannelSuitabilityResult({ ...out, supportedChannels: ["email", "email"], unsupportedChannels: [] }), /Duplicate channel "email"/) && has(validateChannelSuitabilityResult({ ...out, supportedChannels: ["email"], unsupportedChannels: ["email"] }), /both supported and unsupported/));

  check("Invalid Metadata: nested, array, and undefined values are rejected in the configuration", [{ a: { b: 1 } }, { a: [1] }, { a: undefined }, { "": 1 }].every((value) => has(validateChannelConfiguration(value), /Invalid metadata/)));
  const badInputs = (over: Record<string, unknown>) => validateChannelSuitabilityInputs({ opportunityAnalysis: base.context.opportunityAnalysis, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES, ...over });
  check("Invalid Metadata: nested execution metadata and configuration are rejected by the analyzer inputs", has(badInputs({ executionMetadata: { a: { b: 1 } } }), /Invalid metadata: "executionMetadata"/) && has(badInputs({ configuration: [] }), /Invalid metadata: "configuration"/) && badInputs({}).length === 0);
  check("Invalid Metadata: a context with nested configuration is rejected", has(validateChannelSuitabilityContext({ ...base.context, configuration: { a: [1] } }), /Invalid metadata/));
  check("Invalid Metadata: a result with nested metadata is rejected", has(validateChannelSuitabilityResult({ ...out, metadata: { a: { b: 1 } } }), /Invalid metadata/));
  const nonPlain = analyzeWith(createTrafficSignalContext({ candidate, opportunityAnalysis: base.analysis as never, opportunityExplanation: base.explanation as never, executionMetadata: { a: 1 } }));
  check("a context built without configuration reads as empty settings", nonPlain.status === "COMPLETED");

  // ---------- definition and need-source validation ----------
  const defs = (over: Record<string, unknown>) => validateChannelDefinitions([{ ...alphaOnly, ...over }]);
  check("Invalid definitions: a non-list is rejected", has(validateChannelDefinitions("x"), /must be a list/) && has(validateChannelDefinitions([null]), /must be an object/));
  check("Invalid definitions: id, name, family, status, and reviewsContent are checked", has(defs({ id: "Bad Id" }), /id must be/) && has(defs({ id: "" }), /id must be/) && has(defs({ name: "  " }), /name must be non-empty/) && has(defs({ family: "NOPE" }), /family is not supported/) && has(defs({ status: "NOPE" }), /status is not supported/) && has(defs({ reviewsContent: "yes" }), /reviewsContent/));
  check("Invalid definitions: requirements must be complete, known, and non-repeating", has(defs({ requirements: null }), /requirements must be an object/) && has(defs({ requirements: { ...alphaOnly.requirements, BRAND_DEPENDENCY: undefined } }), /BRAND_DEPENDENCY/) && has(defs({ requirements: { ...alphaOnly.requirements, BRAND_DEPENDENCY: ["NOPE"] } }), /supported needs/) && has(defs({ requirements: { ...alphaOnly.requirements, OFFER_COMPATIBILITY: ["OFFER_DETAIL", "OFFER_DETAIL"] } }), /must not repeat/) && has(defs({ requirements: { ...alphaOnly.requirements, EXTRA: [] } }), /not a requirement dimension/));
  check("Invalid need sources: missing, empty, repeated, and unknown entries are rejected", has(validateNeedSources(null), /must be an object/) && has(validateNeedSources({ ...DEFAULT_NEED_SOURCES, MEDIA_ASSETS: [] }), /MEDIA_ASSETS/) && has(validateNeedSources({ ...DEFAULT_NEED_SOURCES, MEDIA_ASSETS: ["A", "A"] }), /Duplicate dimension/) && has(validateNeedSources({ ...DEFAULT_NEED_SOURCES, EXTRA: ["A"] }), /not a supported need/) && has(validateNeedSources({ ...DEFAULT_NEED_SOURCES, MEDIA_ASSETS: undefined }), /MEDIA_ASSETS/));
  const badSources = createChannelSuitabilitySignal({ needSources: { ...DEFAULT_NEED_SOURCES, MEDIA_ASSETS: [] } as never, now: zero }).analyze(base.context, {} as never);
  check("analyze FAILS for invalid need sources", badSources.status === "FAILED" && badSources.errors.some((e) => /MEDIA_ASSETS/.test(e)));

  // ---------- custom channels ----------
  const betaOnly: ChannelDefinition = { ...alphaOnly, id: "beta-net", name: "Beta Net", reviewsContent: false, requirements: { ...alphaOnly.requirements, OFFER_COMPATIBILITY: [], CREATIVE_REQUIREMENTS: ["MEDIA_ASSETS"] } };
  const customSignal = createChannelSuitabilitySignal({ definitions: [betaOnly, alphaOnly], now: zero });
  const customOk = customSignal.analyze(base.context, {} as never);
  check("fictional channels are assessed by the same rules, with no change to the code", customOk.status === "COMPLETED" && metaOf(customOk).channelCount === 2 && same(listOf(customOk, "supportedChannels"), ["alpha-net", "beta-net"]));
  const customNoMedia = customSignal.analyze((await scenario({ states: { MEDIA_AVAILABILITY: "MISSING" } })).context, {} as never);
  check("a fictional channel is excluded only for what it declares it needs", same(listOf(customNoMedia, "unsupportedChannels"), ["beta-net"]) && same(listOf(customNoMedia, "supportedChannels"), ["alpha-net"]));
  const customSources = createChannelSuitabilitySignal({ definitions: [betaOnly], needSources: { ...DEFAULT_NEED_SOURCES, MEDIA_ASSETS: ["CUSTOM_DIMENSION"] }, now: zero });
  const customSourcesOut = customSources.analyze((await scenario({ extra: { other: { CUSTOM_DIMENSION: "MISSING" } } })).context, {} as never);
  check("the need sources are data: another dimension name can satisfy a need", customSourcesOut.status === "COMPLETED" && metaOf(customSourcesOut)["need.MEDIA_ASSETS"] === "ABSENT" && same(listOf(customSourcesOut, "unsupportedChannels"), ["beta-net"]));
  const emptySet = createChannelSuitabilitySignal({ definitions: [], now: zero }).analyze(base.context, {} as never);
  check("an empty channel set has nothing to assess: no channels and no confidence", emptySet.status === "COMPLETED" && emptySet.confidence === null && metaOf(emptySet).channelCount === 0 && listOf(emptySet, "supportedChannels").length === 0);

  // ---------- result shape: no score, no ranking, no recommendation ----------
  check("the result keys are exactly the specified ones", (() => {
    const result = analyzeChannelSuitability({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }, zero);
    return same(Object.keys(result).sort(), [...CHANNEL_RESULT_KEYS].sort()) && validateChannelSuitabilityResult(result, DEFAULT_CHANNEL_DEFINITIONS.map((d) => d.id)).length === 0;
  })());
  const goodResult = analyzeChannelSuitability({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: base.context.opportunityExplanation, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }, zero);
  check("a result with a score, a rank, a ranking, or a recommendation is rejected", ["score", "rank", "ranking", "recommendation", "recommendedChannel", "budget"].every((field) => has(validateChannelSuitabilityResult({ ...goodResult, [field]: 1 }), new RegExp(`unexpected field "${field}"`))));
  check("a result missing a field is rejected", CHANNEL_RESULT_KEYS.every((key) => { const { [key]: _removed, ...rest } = goodResult as unknown as Record<string, unknown>; return has(validateChannelSuitabilityResult(rest), new RegExp(`"${key}" is missing`)); }));
  check("result values are checked", has(validateChannelSuitabilityResult({ ...goodResult, status: "DONE" }), /status is not supported/) && has(validateChannelSuitabilityResult({ ...goodResult, confidence: 2 }), /confidence must be/) && has(validateChannelSuitabilityResult({ ...goodResult, confidence: Number.NaN }), /confidence must be/) && validateChannelSuitabilityResult({ ...goodResult, confidence: null }).length === 0 && has(validateChannelSuitabilityResult({ ...goodResult, executionTime: -1 }), /executionTime/) && has(validateChannelSuitabilityResult({ ...goodResult, warnings: [1] }), /warnings/) && has(validateChannelSuitabilityResult(null), /object is required/));
  check("an unsorted list is rejected, so that order cannot imply a ranking", has(validateChannelSuitabilityResult({ ...goodResult, supportedChannels: ["seo", "email"], unsupportedChannels: [] }), /must be sorted by id/));
  check("every channel must be listed exactly once when the channel ids are known", has(validateChannelSuitabilityResult({ ...goodResult, supportedChannels: ["email"], unsupportedChannels: [] }, DEFAULT_CHANNEL_DEFINITIONS.map((d) => d.id)), /either supported or unsupported/));
  check("both lists are sorted by id, whatever the order of the definitions", same(listOf(out, "supportedChannels"), [...listOf(out, "supportedChannels")].sort()) && same(listOf(noMedia, "unsupportedChannels"), [...listOf(noMedia, "unsupportedChannels")].sort()));
  const reversed = createChannelSuitabilitySignal({ definitions: [...DEFAULT_CHANNEL_DEFINITIONS].reverse(), now: zero }).analyze(base.context, {} as never);
  check("the order of the definitions changes nothing", stable(reversed) === stable(out));
  check("no metadata key names a score, a rank, a weight, or a recommendation", Object.keys(metaOf(noMedia)).every((key) => !/score|rank|weight|recommend|budget|priority/i.test(key)));
  check("the signal output is exactly status, confidence, metadata, warnings, and errors", same(Object.keys(channelSuitabilityToSignalOutput(goodResult)).sort(), ["confidence", "errors", "metadata", "status", "warnings"]) && channelSuitabilityToSignalOutput(goodResult).errors.length === 0);

  // ---------- determinism, time, independence ----------
  check("the same context gives the same output", stable(analyzeWith(base.context)) === stable(analyzeWith(base.context)) && stable(noMedia) === stable(analyzeWith((await scenario({ states: { MEDIA_AVAILABILITY: "MISSING" }, configuration: { [CHANNEL_INPUT_KEYS.policySensitive]: false } })).context)));
  check("executionTime comes from the injected clock", createChannelSuitabilitySignal({ now: tick() }).analyze(base.context, {} as never).status === "COMPLETED" && analyzeChannelSuitability({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }, tick()).executionTime === 1);
  check("a clock that gives a non-finite or backwards time reports zero", analyzeChannelSuitability({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }, () => Number.NaN).executionTime === 0 && (() => { let t = 10; return analyzeChannelSuitability({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }, () => (t -= 1)).executionTime === 0; })());
  check("the default clock gives a time of at least zero", createChannelSuitabilitySignal().analyze(base.context, {} as never).status === "COMPLETED" && analyzeChannelSuitability({ opportunityAnalysis: base.context.opportunityAnalysis!, opportunityExplanation: null, executionMetadata: {}, configuration: {}, definitions: DEFAULT_CHANNEL_DEFINITIONS, needSources: DEFAULT_NEED_SOURCES }).executionTime >= 0);
  const withUpstream = signal.analyze(base.context, { "other-signal": { signalId: "other-signal", status: "COMPLETED", confidence: 1, metadata: { x: 1 }, warnings: [], errors: [], executionTime: 0 } } as never);
  check("independent execution: the output does not depend on any other signal", stable(withUpstream) === stable(out));

  // ---------- run beside other signals, in the Traffic Signal Framework ----------
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
  together.register(sibling("broken-sibling", { analyze: () => { throw new Error("sibling exploded"); }, priority: 95 }));
  const togetherRun = await together.run(base.context);
  const togetherOwn = togetherRun.results.find((r) => r.signalId === "channel-suitability")!;
  check("it runs sequentially beside other signals, in priority order", togetherRun.order.join() === "zeta-sibling,broken-sibling,channel-suitability" && togetherRun.results.length === 3);
  check("a sibling that throws does not change this signal's output", togetherRun.results.find((r) => r.signalId === "broken-sibling")!.status === "FAILED" && togetherOwn.status === "COMPLETED" && stable({ ...togetherOwn, signalId: undefined }) === stable({ ...out, signalId: undefined, executionTime: 0 }));
  check("this signal does not run the other signals", calls.join() === "zeta-sibling");
  const aloneRun = await (async () => { const p = createTrafficSignalPipeline({ now: zero }); registerChannelSuitabilitySignal(p, { now: zero }); return p.run(base.context); })();
  check("it runs alone with the same output", aloneRun.results.length === 1 && stable(aloneRun.results[0].metadata) === stable(togetherOwn.metadata) && aloneRun.results[0].confidence === togetherOwn.confidence);
  const disabledPipeline = createTrafficSignalPipeline({ now: zero });
  registerChannelSuitabilitySignal(disabledPipeline, { enabled: false, now: zero });
  check("disabled, the pipeline does not run it", (await disabledPipeline.run(base.context)).results.length === 0);
  const invalidInPipeline = createTrafficSignalPipeline({ now: zero });
  registerChannelSuitabilitySignal(invalidInPipeline, { now: zero });
  const invalidRun = await invalidInPipeline.run(failedAnalysis.context);
  check("an unreadable context makes the pipeline report FAILED for this signal, with the reasons", invalidRun.results[0].status === "FAILED" && invalidRun.results[0].errors.some((e) => /only a COMPLETED or PARTIAL analysis/.test(e)));

  // ---------- nothing is mutated ----------
  const before = { context: JSON.stringify(base.context), analysis: JSON.stringify(base.context.opportunityAnalysis), explanation: JSON.stringify(base.context.opportunityExplanation), source: JSON.stringify(base.analysis), candidate: JSON.stringify(base.context.candidate) };
  const firstRun = analyzeWith(base.context);
  (firstRun.metadata as Record<string, unknown>).tampered = true;
  (firstRun.warnings as string[]).push("tampered");
  check("no Opportunity mutation: the analysis and the explanation are unchanged", JSON.stringify(base.context.opportunityAnalysis) === before.analysis && JSON.stringify(base.context.opportunityExplanation) === before.explanation && JSON.stringify(base.context) === before.context);
  check("no Discovery mutation: the candidate is unchanged", JSON.stringify(base.context.candidate) === before.candidate && JSON.stringify(candidate) === candidateBefore);
  check("the context stays deep frozen", Object.isFrozen(base.context) && Object.isFrozen(base.context.opportunityAnalysis) && Object.isFrozen(base.context.opportunityExplanation) && Object.isFrozen(base.context.configuration));
  check("the caller's analysis object was copied into the context, not shared", base.context.opportunityAnalysis !== (base.analysis as unknown) && stable(analyzeWith(base.context)) === stable(out));
  check("changing a returned result does not change a later one", !("tampered" in analyzeWith(base.context).metadata) && analyzeWith(base.context).warnings.length === out.warnings.length);

  // ---------- real LP Builder, ProductFacts, Discovery: untouched by construction ----------
  const trafficDir = join(process.cwd(), "src", "lib", "traffic");
  const channelFiles = readdirSync(trafficDir).filter((name) => name.startsWith("channel-") && name.endsWith(".ts"));
  check("the signal is five modules", channelFiles.length === 5 && ["channel-definitions.ts", "channel-suitability-analyzer.ts", "channel-suitability-result.ts", "channel-suitability-signal.ts", "channel-suitability-validator.ts"].every((name) => channelFiles.includes(name)));
  const sources = channelFiles.map((name) => ({ name, text: readFileSync(join(trafficDir, name), "utf8") }));
  const statements = (text: string) => text.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
  const importPath = (statement: string) => /from\s+"([^"]+)"/.exec(statement)![1];
  const allImports = sources.flatMap((s) => statements(s.text).map((statement) => ({ file: s.name, statement, path: importPath(statement) })));
  check("every import is local to the traffic module or a type-only import of an Opportunity or Discovery shape", allImports.every((i) => i.path.startsWith("./") || (/^\.\.\/(opportunity|discovery)\//.test(i.path) && /^import type /.test(i.statement))) && allImports.some((i) => i.path.startsWith("../opportunity/")));
  check("no import from ProductFacts, the LP Builder, the importer, grounding, policy, publication, tracking, analytics, a database, or the network", allImports.every((i) => !/product-facts|lp-|landing|import|grounding|policy|publication|tracking|analytics|sqlite|db|node:|http|openai|anthropic/i.test(i.path.replace(/^\.\.\/opportunity\//, "").replace(/opportunity-explanation-result|opportunity-resolver-analysis/, ""))));
  const code = sources.map((s) => ({ name: s.name, text: stripCode(s.text) }));
  check("no keyword, CPC, budget, campaign, ad-account, ranking, or score logic in the code", code.every((c) => !/\b(keyword|cpc|budget|campaign|adwords|rank|ranking|score|recommend)/i.test(c.text)));
  check("no HTTP, network, AI, database, file, or environment access in the code", code.every((c) => !/\b(fetch|XMLHttpRequest|WebSocket|require|readFile|writeFile|process\.env|Math\.random|new Date|Date\.now)\b/.test(c.text) && !/openai|anthropic|sqlite|google-ads/i.test(c.text)));
  check("the code never writes to its inputs", code.every((c) => !/\b(opportunityAnalysis|opportunityExplanation|candidate|configuration|executionMetadata)(\.[A-Za-z]+)*\s*(=[^=]|\.push\(|\.splice\(|\.sort\()/.test(c.text)));
  check("no product, slug, or source-path-specific logic", code.every((c) => !/gizmo|example\.test|https?:\/\/|\/products\/|slug/i.test(c.text)));
  const sourceTree = walk(join(process.cwd(), "src")).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const outsiders = sourceTree.filter((file) => !file.includes(join("src", "lib", "traffic")) && /channel-suitability|channel-definitions/.test(readFileSync(file, "utf8")));
  check("nothing outside the traffic module uses the signal: Opportunity, Discovery, and the LP Builder are untouched", outsiders.length === 0);
  const traffic = readdirSync(trafficDir).filter((name) => !name.startsWith("channel-"));
  check("the signal adds files only; it changes no existing traffic module's imports", traffic.every((name) => !/channel-/.test(readFileSync(join(trafficDir, name), "utf8"))));

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
