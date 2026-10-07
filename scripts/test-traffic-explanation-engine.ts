import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createOpportunityExecutionContext } from "../src/lib/opportunity/opportunity-resolver-context.ts";
import { createOpportunityResolver } from "../src/lib/opportunity/opportunity-resolver.ts";
import { createSignalPipeline } from "../src/lib/opportunity/opportunity-signal-pipeline.ts";
import type { OpportunitySignalModule, SignalOutput } from "../src/lib/opportunity/opportunity-signal-contract.ts";
import { createEvidenceContext } from "../src/lib/opportunity/providers/evidence-provider-context.ts";
import { createTrafficExecutionContext, isDeepFrozenTraffic } from "../src/lib/traffic/traffic-resolver-context.ts";
import { createTrafficResolver } from "../src/lib/traffic/traffic-resolver.ts";
import { createTrafficSignalPipeline } from "../src/lib/traffic/traffic-signal-pipeline.ts";
import type { TrafficSignalModule, TrafficSignalOutput } from "../src/lib/traffic/traffic-signal-contract.ts";
import { registerChannelSuitabilitySignal } from "../src/lib/traffic/channel-suitability-signal.ts";
import { createPolicyRiskSignal, registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
import { createAudienceFitSignal, registerAudienceFitSignal } from "../src/lib/traffic/audience-fit-signal.ts";
import { createOfferStrategySignal, registerOfferStrategySignal } from "../src/lib/traffic/offer-strategy-signal.ts";
import { createCreativeReadinessSignal, registerCreativeReadinessSignal } from "../src/lib/traffic/creative-readiness-signal.ts";
import {
  TRAFFIC_CATEGORY_SECTION_KINDS,
  TRAFFIC_COLLECTING_SECTION_KINDS,
  TRAFFIC_EXPLANATION_ITEM_KINDS,
  TRAFFIC_EXPLANATION_SECTION_KINDS,
  TRAFFIC_EXPLANATION_SECTION_STATES,
  TRAFFIC_EXPLANATION_SECTION_TITLES,
  TRAFFIC_STATE_VOCABULARY,
  createTrafficExplanationSection,
  createTrafficSectionBuilder,
  describeTrafficState,
  trafficSectionKindForCategory,
} from "../src/lib/traffic/traffic-explanation-section.ts";
import { TRAFFIC_EXPLANATION_KEYS, TRAFFIC_EXPLANATION_SCOPE_NOTE } from "../src/lib/traffic/traffic-explanation-result.ts";
import type { TrafficExplanationInput } from "../src/lib/traffic/traffic-explanation-result.ts";
import { createTrafficExplanationValidator } from "../src/lib/traffic/traffic-explanation-validator.ts";
import { createTrafficExplanationBuilder } from "../src/lib/traffic/traffic-explanation-builder.ts";
import { TRAFFIC_EXPLANATION_SCHEMA_VERSION, createTrafficExplanationFormatter } from "../src/lib/traffic/traffic-explanation-formatter.ts";
import { createTrafficExplanationEngine } from "../src/lib/traffic/traffic-explanation-engine.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function clocks() {
  let t = 0;
  let s = 0;
  let n = 0;
  return {
    now: () => (t += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `analysis-${(n += 1)}`,
  };
}
const tick = () => {
  let t = 0;
  return () => (t += 1);
};

interface FakeOpts {
  category: TrafficSignalModule["category"];
  priority?: number;
  enabled?: boolean;
  supports?: boolean;
  output?: TrafficSignalOutput;
}
const COMPLETED = (metadata: TrafficSignalOutput["metadata"], warnings: string[] = [], confidence: number | null = 0.8): TrafficSignalOutput => ({
  status: "COMPLETED",
  confidence,
  metadata,
  warnings,
  errors: [],
});
function fake(id: string, over: FakeOpts): TrafficSignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category: over.category,
    enabled: over.enabled ?? true,
    priority: over.priority ?? 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsAnalysis: () => over.supports ?? true,
    validate: () => [],
    analyze: () => {
      const output = over.output ?? COMPLETED({});
      return { ...output, metadata: { ...output.metadata }, warnings: [...output.warnings], errors: [...output.errors] };
    },
  };
}

const ALPHA = COMPLETED(
  {
    "need.CHANNEL_AVAILABILITY": "SATISFIED",
    "count.CHANNEL_AVAILABILITY": 2,
    "need.OFFER_COMPATIBILITY": "PARTIAL",
    "need.CONTENT_COMPATIBILITY": "ABSENT",
    "basis.CONTENT_COMPATIBILITY": "Whether content structure exists.",
    supportedChannels: "alpha-feed,beta-feed",
    unsupportedChannels: "gamma-feed",
    provenanceNote: "DIRECT_SOURCE means the source stated it.",
    secret: "TOPSECRET-123",
  },
  ["alpha warns"],
);
const BETA = COMPLETED({
  "need.CLAIM_LANGUAGE": "SATISFIED",
  "strength.CLAIM_LANGUAGE": "The claims rest on stated facts",
  "need.SAFEGUARD": "ABSENT",
  "weakness.SAFEGUARD": "No safeguard listed",
  "dimension.TONE": "ADEQUATE",
  "dimension.LAYOUT": "EXOTIC",
});
const GAMMA_FAILED: TrafficSignalOutput = {
  status: "FAILED",
  confidence: null,
  metadata: { "need.DEMOGRAPHIC": "SATISFIED" },
  warnings: ["gamma careful"],
  errors: ["boom"],
};
const EPSILON = COMPLETED({ "need.SIZE": "SATISFIED" });

function mainModules(): TrafficSignalModule[] {
  return [
    fake("alpha", { category: "TRAFFIC_CHANNEL", priority: 100, output: ALPHA }),
    fake("beta", { category: "POLICY", priority: 90, output: BETA }),
    fake("gamma", { category: "AUDIENCE", priority: 80, output: GAMMA_FAILED }),
    fake("delta", { category: "OFFER", priority: 70, supports: false }),
    fake("epsilon", { category: "FUTURE", priority: 60, output: EPSILON }),
    fake("omega", { category: "CREATIVE", priority: 1, enabled: false }),
  ];
}

function stubOpportunity(over: Record<string, unknown> = {}) {
  return {
    analysisId: "opp-1",
    candidateId: "cand-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    status: "COMPLETED",
    registeredSignals: ["alpha-opp"],
    executedSignals: ["alpha-opp"],
    failedSignals: [],
    warnings: [],
    errors: [],
    metadata: {},
    executionTime: 1,
    resolvedSignals: [{ signalId: "alpha-opp", name: "Alpha", version: "1.0.0", category: "FUTURE", priority: 1, enabled: true, requires: [], optional: [], position: 0 }],
    executionOrder: ["alpha-opp"],
    signalResults: [{ signalId: "alpha-opp", status: "COMPLETED", confidence: 0.5, metadata: {}, warnings: [], errors: [], executionTime: 1 }],
    providerResults: [],
    executionMetadata: {},
    pipelineMetadata: {},
    ...over,
  };
}

const goodContext = () =>
  createTrafficExecutionContext({
    candidate,
    opportunityAnalysis: stubOpportunity() as never,
    opportunityExplanation: null,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
  } as never);

async function fixture(modules: TrafficSignalModule[], context = goodContext()) {
  const signals = createTrafficSignalPipeline({ now: zero });
  for (const module of modules) signals.register(module);
  const run = await createTrafficResolver({ signals, ...clocks() } as never).run(context);
  const results = run.analysis.signalResults;
  const catalog = run.analysis.resolvedSignals;
  const input = (): TrafficExplanationInput => run.analysis;
  return { signals, context, run, analysis: run.analysis, results, catalog, input };
}

const validator = createTrafficExplanationValidator();
const formatter = createTrafficExplanationFormatter();
const engineOf = () => createTrafficExplanationEngine({ now: tick() });

const blocks0 = (e: { sectionBreakdown: Parameters<typeof formatter.formatSection>[0][] }, index: number) => formatter.formatSection(e.sectionBreakdown[index]);

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

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
  MEDIA_AVAILABILITY: "lp",
  OFFER_VISIBILITY: "intent",
  PRICE_VISIBILITY: "intent",
  UPSELL_POTENTIAL: "intent",
  BUYER_READINESS: "intent",
  CONSUMER_TRUST: "intent",
  RECURRING_PURCHASE_POTENTIAL: "intent",
};
const GOOD: Record<string, string> = Object.fromEntries(Object.keys(OWNER).map((d) => [d, "STRONG"]));

async function liveOpportunity() {
  const bySignal: Record<string, Record<string, string>> = { evid: {}, lp: {}, intent: {} };
  for (const [dimension, state] of Object.entries(GOOD)) bySignal[OWNER[dimension]][`dimension.${dimension}`] = state;
  const signals = createSignalPipeline({ now: zero });
  Object.entries(bySignal).forEach(([id, metadata], i) => signals.register(fakeOpportunity(id, CATEGORIES[i % CATEGORIES.length], metadata)));
  let t = 0;
  let s = 0;
  let n = 0;
  const opportunityContext = createOpportunityExecutionContext({
    candidate,
    evidenceContext: createEvidenceContext({ candidate, metadata: {}, extensions: {}, resolvedProductData: {} }),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: {},
  } as never);
  const runResolver = await createOpportunityResolver({
    signals,
    now: () => (t += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `opp-${(n += 1)}`,
  } as never).run(opportunityContext);
  return JSON.parse(JSON.stringify(runResolver.analysis));
}

async function main() {
  check(
    "eight sections in a fixed order",
    TRAFFIC_EXPLANATION_SECTION_KINDS.join() ===
      "CHANNEL_COMPATIBILITY,POLICY_RISKS,AUDIENCE_FIT,OFFER_READINESS,CREATIVE_READINESS,WARNINGS,MISSING_INFORMATION,EXECUTION_SUMMARY",
  );
  check(
    "five describe a group of signals and three collect statements",
    TRAFFIC_CATEGORY_SECTION_KINDS.length === 5 &&
      TRAFFIC_COLLECTING_SECTION_KINDS.length === 3 &&
      [...TRAFFIC_CATEGORY_SECTION_KINDS, ...TRAFFIC_COLLECTING_SECTION_KINDS].every((k) => TRAFFIC_EXPLANATION_SECTION_KINDS.includes(k)),
  );
  check(
    "every section has a title",
    TRAFFIC_EXPLANATION_SECTION_KINDS.every((k) => TRAFFIC_EXPLANATION_SECTION_TITLES[k].length > 0) &&
      TRAFFIC_EXPLANATION_SECTION_TITLES.CHANNEL_COMPATIBILITY === "Channel Compatibility" &&
      TRAFFIC_EXPLANATION_SECTION_TITLES.MISSING_INFORMATION === "Missing Information" &&
      TRAFFIC_EXPLANATION_SECTION_TITLES.EXECUTION_SUMMARY === "Execution Summary",
  );
  check(
    "item kinds and section states are the documented ones",
    TRAFFIC_EXPLANATION_ITEM_KINDS.join() === "FINDING,STRENGTH,WEAKNESS,MISSING,WARNING,ERROR" &&
      TRAFFIC_EXPLANATION_SECTION_STATES.join() === "COMPLETED,NOT_COMPLETED,NO_SIGNAL,REPORTED,NONE",
  );
  check(
    "the explanation has exactly the requested fields plus the traceability fields",
    TRAFFIC_EXPLANATION_KEYS.join() ===
      "analysisId,candidateId,summary,sectionBreakdown,strengths,weaknesses,warnings,missingInformation,errors,signalBreakdown,metadata,executionTime",
  );
  check(
    "trafficSectionKindForCategory maps the five categories and nothing else",
    trafficSectionKindForCategory("TRAFFIC_CHANNEL") === "CHANNEL_COMPATIBILITY" &&
      trafficSectionKindForCategory("POLICY") === "POLICY_RISKS" &&
      trafficSectionKindForCategory("AUDIENCE") === "AUDIENCE_FIT" &&
      trafficSectionKindForCategory("OFFER") === "OFFER_READINESS" &&
      trafficSectionKindForCategory("CREATIVE") === "CREATIVE_READINESS" &&
      trafficSectionKindForCategory("FUTURE") === null &&
      trafficSectionKindForCategory("TRAFFIC_RISK") === null &&
      trafficSectionKindForCategory("TRAFFIC_STRATEGY") === null &&
      trafficSectionKindForCategory(null) === null,
  );
  const sourceItem = { kind: "FINDING" as const, text: "t", signalId: "alpha", category: "TRAFFIC_CHANNEL", dimension: null };
  const section = createTrafficExplanationSection({ kind: "CHANNEL_COMPATIBILITY", state: "COMPLETED", summary: "s", items: [sourceItem] });
  check(
    "a section is frozen, takes its title from its kind, copies its items, and lists its signals",
    Object.isFrozen(section) &&
      Object.isFrozen(section.items[0]) &&
      section.title === "Channel Compatibility" &&
      section.items[0] !== sourceItem &&
      section.signalIds.join() === "alpha",
  );
  check(
    "vocabulary: known states are worded, unknown states are neutral and stated as reported",
    describeTrafficState("SATISFIED").class === "STRENGTH" &&
      describeTrafficState("PARTIAL").class === "STRENGTH" &&
      describeTrafficState("ABSENT").class === "MISSING" &&
      describeTrafficState("WEAK").class === "WEAKNESS" &&
      describeTrafficState("ADEQUATE").class === "NEUTRAL" &&
      describeTrafficState("WEIRD").phrase === "reported as WEIRD" &&
      describeTrafficState("constructor").class === "NEUTRAL" &&
      Object.isFrozen(TRAFFIC_STATE_VOCABULARY),
  );
  check("the section builder is exposed", typeof createTrafficSectionBuilder === "function" && typeof createTrafficSectionBuilder().build === "function");

  const mainFix = await fixture(mainModules());
  const engine = engineOf();
  const outcome = engine.explain(mainFix.input());
  const ex = outcome.explanation!;
  check("explaining a good input gives EXPLAINED, an explanation, and no issues", outcome.status === "EXPLAINED" && ex !== null && outcome.issues.length === 0);
  check(
    "the fixture analysis is PARTIAL with a completed, failed, skipped, and not-run signal",
    mainFix.analysis.status === "PARTIAL" &&
      mainFix.analysis.failedSignals.join() === "gamma" &&
      mainFix.analysis.metadata.skippedSignals === "delta" &&
      mainFix.analysis.metadata.disabledSignals === "omega",
  );
  check("the explanation has exactly the documented fields", Object.keys(ex).join() === TRAFFIC_EXPLANATION_KEYS.join());
  check("analysis id and candidate id are carried", ex.analysisId === mainFix.analysis.analysisId && ex.candidateId === "cand-1");
  check(
    "the short summary states the outcome without judging it",
    /^Analysis PARTIAL for cand-1: 3 of 6 registered signals completed, 1 failed, 1 skipped, 1 not run\. Reported: 5 strengths, 2 weaknesses, 5 missing items, 3 warnings, 1 error\.$/.test(
      ex.summary,
    ),
  );
  check("eight sections in the documented order", ex.sectionBreakdown.map((s) => s.kind).join() === TRAFFIC_EXPLANATION_SECTION_KINDS.join());
  check(
    "section states follow the signals: completed, not completed, collecting, and the run",
    ex.sectionBreakdown.map((s) => s.state).join() === "COMPLETED,COMPLETED,NOT_COMPLETED,NOT_COMPLETED,NOT_COMPLETED,REPORTED,REPORTED,REPORTED",
  );
  const sectionOf = (kind: string) => ex.sectionBreakdown.find((s) => s.kind === kind)!;
  check(
    "each category section holds only the signals of that category, by the Signal Contract category",
    sectionOf("CHANNEL_COMPATIBILITY").signalIds.join() === "alpha" &&
      sectionOf("POLICY_RISKS").signalIds.join() === "beta" &&
      sectionOf("AUDIENCE_FIT").signalIds.join() === "gamma" &&
      sectionOf("OFFER_READINESS").signalIds.join() === "delta" &&
      sectionOf("CREATIVE_READINESS").signalIds.join() === "omega",
  );
  check(
    "a signal in a category with no section is explained but sits in no category section",
    !ex.sectionBreakdown.some((s) => s.signalIds.includes("epsilon") && TRAFFIC_CATEGORY_SECTION_KINDS.includes(s.kind as never)) &&
      ex.signalBreakdown.some((b) => b.signalId === "epsilon") &&
      ex.strengths.some((i) => i.signalId === "epsilon") &&
      ex.metadata.unsectionedSignals === "epsilon",
  );
  check(
    "every strength keeps its signal, category, and dimension",
    ex.strengths.every((i) => i.signalId !== null && i.category !== null && i.dimension !== null) &&
      ex.strengths.find((i) => i.dimension === "CHANNEL_AVAILABILITY")?.signalId === "alpha" &&
      ex.strengths.find((i) => i.dimension === "CHANNEL_AVAILABILITY")?.category === "TRAFFIC_CHANNEL",
  );

  const texts = (list: Array<{ text: string }>) => list.map((i) => i.text);
  check(
    "strengths restate what signals reported, with counts, lists, and the signal's own detail",
    texts(ex.strengths).join("|") ===
      [
        "CHANNEL_AVAILABILITY: established as present (2 items).",
        "OFFER_COMPATIBILITY: only partly evidenced.",
        "CHANNELS: reported as supported: alpha-feed, beta-feed.",
        "CLAIM_LANGUAGE: established as present. The claims rest on stated facts.",
        "SIZE: established as present.",
      ].join("|"),
  );
  check(
    "an unsupported list is a weakness, and a missing dimension the signal calls a weakness is restated as one",
    texts(ex.weaknesses).join("|") === "CHANNELS: reported as unsupported: gamma-feed.|SAFEGUARD: No safeguard listed.",
  );
  check(
    "missing information lists missing dimensions with what they cover and signals that gave nothing",
    texts(ex.missingInformation).join("|") ===
      [
        "CONTENT_COMPATIBILITY: reported missing. Covers: Whether content structure exists.",
        "SAFEGUARD: reported missing.",
        "Signal gamma: it failed, so nothing is known from it.",
        "Signal delta: it was skipped, so nothing is known from it.",
        "Signal omega: it is disabled, so nothing is known from it.",
      ].join("|"),
  );
  check(
    "warnings and errors are kept apart and keep the signal that reported them",
    texts(ex.warnings).join("|") === "Signal alpha: alpha warns|Signal gamma: gamma careful|Signal delta: Signal does not support this analysis." &&
      texts(ex.errors).join("|") === "Signal gamma: boom" &&
      ex.errors[0].signalId === "gamma",
  );
  check(
    "a neutral or unknown state is stated as reported and is neither a strength nor a weakness",
    sectionOf("POLICY_RISKS").items.some((i) => i.kind === "FINDING" && i.text === "TONE: reported as adequate by the signal.") &&
      sectionOf("POLICY_RISKS").items.some((i) => i.kind === "FINDING" && i.text === "LAYOUT: reported as EXOTIC.") &&
      !ex.strengths.concat(ex.weaknesses).some((i) => i.dimension === "TONE" || i.dimension === "LAYOUT"),
  );
  check(
    "what a failed signal left in its metadata is not read",
    mainFix.results.find((r) => r.signalId === "gamma")!.metadata["need.DEMOGRAPHIC"] === "SATISFIED" && !JSON.stringify(ex).includes("DEMOGRAPHIC"),
  );
  check(
    "a signal that was not run is NOT_RUN and says why",
    ex.signalBreakdown.find((b) => b.signalId === "omega")!.status === "NOT_RUN" && /disabled/.test(ex.signalBreakdown.find((b) => b.signalId === "omega")!.statement),
  );
  check("metadata a signal attached that no convention names is never echoed", !JSON.stringify(ex).includes("TOPSECRET-123"));
  check(
    "the signal breakdown covers every registered signal, in analysis order, with statuses",
    ex.signalBreakdown.map((b) => `${b.signalId}:${b.status}`).join() === "alpha:COMPLETED,beta:COMPLETED,gamma:FAILED,delta:SKIPPED,epsilon:COMPLETED,omega:NOT_RUN",
  );
  const alphaBreakdown = ex.signalBreakdown[0];
  check(
    "a breakdown entry carries the reported confidence, timing, counts, a statement, and the signal's own notes",
    alphaBreakdown.confidence === 0.8 &&
      alphaBreakdown.executionTime === 0 &&
      alphaBreakdown.strengthCount === 3 &&
      alphaBreakdown.missingCount === 1 &&
      alphaBreakdown.warningCount === 1 &&
      alphaBreakdown.errorCount === 0 &&
      /^Completed with 3 strengths, 1 weakness, 1 missing item, 1 warning\.$/.test(alphaBreakdown.statement) &&
      alphaBreakdown.notes.join() === "DIRECT_SOURCE means the source stated it.",
  );
  check(
    "a failed signal reports no confidence and its error count",
    ex.signalBreakdown[2].confidence === null && ex.signalBreakdown[2].errorCount === 1 && /^Failed with 1 error/.test(ex.signalBreakdown[2].statement),
  );
  check(
    "the warnings section holds the warnings then the errors, and missing information mirrors the list",
    sectionOf("WARNINGS").items.map((i) => i.text).join("|") === [...texts(ex.warnings), ...texts(ex.errors)].join("|") &&
      sectionOf("MISSING_INFORMATION").items.length === 5,
  );
  check(
    "a category section that did not complete says so and reports nothing as a finding about the category",
    /Signal gamma did not complete; nothing is reported for this category\./.test(sectionOf("AUDIENCE_FIT").summary) &&
      sectionOf("AUDIENCE_FIT").items.every((i) => i.kind !== "STRENGTH" && i.kind !== "WEAKNESS"),
  );
  check(
    "the execution summary restates the run without recommending anything",
    sectionOf("EXECUTION_SUMMARY").state === "REPORTED" &&
      sectionOf("EXECUTION_SUMMARY").items.every((i) => i.kind === "FINDING" && i.signalId === null) &&
      sectionOf("EXECUTION_SUMMARY").items.some((i) => i.text === "The analysis ended PARTIAL.") &&
      sectionOf("EXECUTION_SUMMARY").items.some((i) => i.text === "Opportunity analysis: opp-1.") &&
      sectionOf("EXECUTION_SUMMARY").items.some((i) => /Execution order:/.test(i.text)) &&
      sectionOf("EXECUTION_SUMMARY").signalIds.length === 0,
  );
  check(
    "metadata is flat, counts the lists, and carries the scope note and the execution metadata",
    validator.validateExplanation(ex).length === 0 &&
      ex.metadata.strengthCount === 5 &&
      ex.metadata.weaknessCount === 2 &&
      ex.metadata.missingCount === 5 &&
      ex.metadata.warningCount === 3 &&
      ex.metadata.errorCount === 1 &&
      ex.metadata.registeredCount === 6 &&
      ex.metadata.completedCount === 3 &&
      ex.metadata["execution.run"] === "r1" &&
      ex.metadata.scopeNote === TRAFFIC_EXPLANATION_SCOPE_NOTE &&
      ex.metadata.executionMetadataKeys === 1 &&
      ex.metadata.executionOrder === mainFix.analysis.executionOrder.join() &&
      ex.metadata.opportunityAnalysisId === "opp-1" &&
      ex.metadata.pipelineMetadataKeys === Object.keys(mainFix.analysis.pipelineMetadata).length,
  );
  check("the explanation validates and is deeply frozen", validator.validateExplanation(ex).length === 0 && isDeepFrozenTraffic(ex));
  check("executionTime comes from the injected clock", ex.executionTime === 1);

  const keys: string[] = [];
  (function collect(value: unknown) {
    if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === "object" && value !== null) for (const [k, v] of Object.entries(value)) (keys.push(k), collect(v));
  })(ex);
  check("no key anywhere in the explanation is a score, ranking, weight, or recommendation", !keys.some((k) => /score|rank|weight|recommend|priority/i.test(k)));
  const proseOf = (e: typeof ex) =>
    [e.summary, ...e.sectionBreakdown.flatMap((s) => [s.summary, ...s.items.map((i) => i.text)]), ...e.signalBreakdown.map((b) => b.statement)].join("\n");
  check("no sentence scores, ranks, or recommends", !/\bscore|\brank|recommend|you should|we suggest|best|worst|promising|winner/i.test(proseOf(ex)));
  check("the input carries no ProductFacts member", !("facts" in mainFix.input()) && !("productFacts" in mainFix.input()));

  const frozenInput = mainFix.input();
  const before = JSON.stringify(frozenInput);
  const analysisBefore = JSON.stringify(mainFix.analysis);
  engine.explain(frozenInput);
  engine.render(frozenInput);
  check(
    "explaining and rendering leave the input, the analysis, the results, and the context untouched",
    JSON.stringify(frozenInput) === before && JSON.stringify(mainFix.analysis) === analysisBefore,
  );
  check("a deeply frozen analysis is explained without error", isDeepFrozenTraffic(mainFix.analysis) && engineOf().explain(mainFix.analysis).status === "EXPLAINED");
  const again = engineOf().explain(mainFix.input()).explanation!;
  check("the same input always gives the same explanation", stable(again) === stable(ex) && formatter.formatDetailed(again) === formatter.formatDetailed(ex));
  const other = engineOf();
  other.explain((await fixture(mainModules())).input());
  check("engines are independent: another engine's runs change nothing", stable(other.explain(mainFix.input()).explanation) === stable(ex));
  const concurrent = await Promise.all([1, 2, 3].map(async () => engineOf().explain(mainFix.input())));
  check("concurrent explanations do not interfere", concurrent.every((o) => stable(o.explanation) === stable(ex)));
  const customEngine = createTrafficExplanationEngine({
    now: tick(),
    builderOptions: { vocabulary: { ...TRAFFIC_STATE_VOCABULARY, SATISFIED: { class: "STRENGTH", phrase: "stated as present" } } },
  });
  check(
    "a custom vocabulary changes the wording only",
    customEngine.explain(mainFix.input()).explanation!.strengths.find((i) => i.dimension === "CHANNEL_AVAILABILITY")!.text.startsWith("CHANNEL_AVAILABILITY: stated as present") &&
      customEngine.explain(mainFix.input()).explanation!.strengths.length === 5,
  );
  check(
    "an analysis whose resolved signals do not match its registered signals is rejected, not guessed at",
    (() => {
      const input = copy(mainFix.analysis);
      input.resolvedSignals = input.resolvedSignals.filter((s) => s.signalId !== "omega");
      const o = engineOf().explain(input);
      return o.status === "REJECTED" && has(o.issues, /do not match/);
    })(),
  );

  const tiny = await fixture([fake("alpha", { category: "TRAFFIC_CHANNEL", output: ALPHA })]);
  const tinyEx = engineOf().explain(tiny.input()).explanation!;
  check(
    "categories with no registered signal are NO_SIGNAL, with no items",
    ["POLICY_RISKS", "AUDIENCE_FIT", "OFFER_READINESS", "CREATIVE_READINESS"].every((k) => {
      const s = tinyEx.sectionBreakdown.find((x) => x.kind === k)!;
      return s.state === "NO_SIGNAL" && s.items.length === 0 && s.signalIds.length === 0 && s.summary === "No signal of this category is registered.";
    }) &&
      tinyEx.analysisId === tiny.analysis.analysisId &&
      tinyEx.sectionBreakdown[0].state === "COMPLETED",
  );
  const quiet = await fixture([fake("alpha", { category: "TRAFFIC_CHANNEL", output: COMPLETED({}, [], null) })]);
  const quietEx = engineOf().explain(quiet.input()).explanation!;
  check(
    "a signal with nothing to say gives NONE collecting sections for warnings and missing information, and says so",
    ["WARNINGS", "MISSING_INFORMATION"].every((k) => quietEx.sectionBreakdown.find((s) => s.kind === k)!.state === "NONE" && quietEx.sectionBreakdown.find((s) => s.kind === k)!.items.length === 0) &&
      quietEx.sectionBreakdown.find((s) => s.kind === "EXECUTION_SUMMARY")!.state === "REPORTED" &&
      /no confidence was reported/.test(quietEx.sectionBreakdown[0].items[0].text) &&
      validator.validateExplanation(quietEx).length === 0,
  );

  const clean = await fixture([fake("alpha", { category: "TRAFFIC_CHANNEL", output: ALPHA }), fake("beta", { category: "POLICY", output: BETA })]);
  const faulty = { ...clean.signals, run: async () => ({ order: ["alpha", "beta"], results: [clean.results[0], clean.results[0], clean.results[1]] }) };
  const rejectedRun = await createTrafficResolver({ signals: faulty as never, ...clocks() } as never).run(goodContext());
  const rejectedEx = engineOf().explain(rejectedRun.analysis);
  check(
    "a signal whose result the Resolver rejected is explained as failed, from the analysis's own errors",
    rejectedEx.status === "EXPLAINED" &&
      rejectedEx.explanation!.signalBreakdown[0].status === "FAILED" &&
      rejectedEx.explanation!.errors.some((e) => e.signalId === "alpha" && /Duplicate signal/.test(e.text)) &&
      rejectedEx.explanation!.missingInformation.some((m) => m.signalId === "alpha" && /rejected as invalid/.test(m.text)) &&
      rejectedEx.explanation!.strengths.every((s) => s.signalId !== "alpha"),
  );

  const refusedSignals = createTrafficSignalPipeline({ now: zero });
  refusedSignals.register(fake("alpha", { category: "TRAFFIC_CHANNEL" }));
  refusedSignals.register(fake("beta", { category: "POLICY" }));
  const refusedRun = await createTrafficResolver({ signals: refusedSignals, ...clocks() } as never).run({} as never);
  const refusedEx = engineOf().explain(refusedRun.analysis);
  const rx = refusedEx.explanation!;
  check(
    "a refused analysis is explained: nothing ran, the run's errors are run-level, and no candidate is named",
    refusedRun.analysis.status === "REFUSED" &&
      refusedEx.status === "EXPLAINED" &&
      /^Analysis REFUSED for no candidate: 0 of 2 registered signals completed, 2 not run\./.test(rx.summary) &&
      rx.candidateId === null &&
      rx.errors.length >= 1 &&
      rx.errors.every((e) => e.signalId === null) &&
      rx.signalBreakdown.every((b) => b.status === "NOT_RUN") &&
      rx.sectionBreakdown.find((s) => s.kind === "EXECUTION_SUMMARY")!.items.some((i) => i.text === "The analysis ended REFUSED."),
  );
  check("run-level statements have no signal and no category", rx.errors.every((e) => e.signalId === null && e.category === null && e.dimension === null));

  const base = mainFix.input();
  const issuesFor = (over: Record<string, unknown>) => validator.validateInput({ ...base, ...over });
  check("a good input has no issues", validator.validateInput(base).length === 0 && engine.validate(base).length === 0);
  check(
    "Missing Analysis: no input at all",
    has(validator.validateInput(undefined), /Missing analysis/) &&
      has(validator.validateInput(null), /Missing analysis/) &&
      has(validator.validateInput(5), /Missing analysis/) &&
      has(validator.validateInput([]), /Missing analysis/),
  );
  check(
    "the old wrapper shape is no longer an input: an analysis is the whole input",
    validator.validateInput({ analysis: mainFix.analysis, signalResults: [], signals: [] }).length > 0 &&
      engineOf().explain({ analysis: mainFix.analysis, signalResults: mainFix.results, signals: mainFix.catalog }).status === "REJECTED",
  );
  check(
    "an analysis that is not an analysis is invalid, whatever it is",
    has(validator.validateInput({}), /Invalid analysis/) &&
      has(issuesFor({ score: 0.9 }), /Invalid analysis: Unexpected field "score"/) &&
      has(issuesFor({ status: "WEIRD" }), /Invalid analysis/) &&
      has(issuesFor({ analysisId: "" }), /Invalid analysis/),
  );
  check(
    "Invalid Metadata: the metadata members of the analysis must be flat",
    has(issuesFor({ metadata: { a: { b: 1 } } }), /Invalid metadata/) &&
      has(issuesFor({ executionMetadata: { a: { b: 1 } } }), /Invalid metadata/) &&
      has(issuesFor({ pipelineMetadata: { a: { b: 1 } } }), /Invalid metadata/) &&
      has(issuesFor({ executionMetadata: [] }), /Invalid metadata/) &&
      has(issuesFor({ executionMetadata: "x" }), /Invalid metadata/) &&
      has(issuesFor({ executionMetadata: null }), /Invalid metadata/) &&
      has(issuesFor({ pipelineMetadata: { "": 1 } }), /Invalid metadata/),
  );
  check(
    "Missing Snapshot: the snapshot lists are missing or not lists",
    ["signalResults", "resolvedSignals"].every(
      (field) =>
        has(issuesFor({ [field]: undefined }), /Missing snapshot/) &&
        has(issuesFor({ [field]: null }), /Missing snapshot/) &&
        has(issuesFor({ [field]: "nope" }), /Missing snapshot/) &&
        has(issuesFor({ [field]: { 0: {} } }), /Missing snapshot/),
    ),
  );
  check(
    "Missing Snapshot: an executed signal has no result",
    has(issuesFor({ signalResults: base.signalResults.filter((r) => r.signalId !== "alpha") }), /Missing snapshot: the executed signal "alpha" has no result/) &&
      has(issuesFor({ signalResults: [] }), /Missing snapshot: the executed signal/),
  );
  check(
    "a failed signal may have no result, because its result may have been rejected",
    !has(issuesFor({ signalResults: base.signalResults.filter((r) => r.signalId !== "gamma") }), /Missing snapshot/),
  );
  check(
    "an invalid resolved signal, a duplicate, or one that disagrees with the registered signals is rejected",
    has(issuesFor({ resolvedSignals: [{ ...base.resolvedSignals[0], name: "" }, ...base.resolvedSignals.slice(1)] }), /Invalid resolved signal: name must be non-empty text/) &&
      has(issuesFor({ resolvedSignals: [...base.resolvedSignals, base.resolvedSignals[0]] }), /Duplicate signal "alpha"/) &&
      has(issuesFor({ resolvedSignals: [5, ...base.resolvedSignals] }), /Invalid resolved signal/) &&
      has(issuesFor({ resolvedSignals: base.resolvedSignals.slice(1) }), /do not match/),
  );
  check(
    "Invalid Signal Result: bad status, bad fields, and not an object",
    has(issuesFor({ signalResults: [{ ...base.signalResults[0], status: "WEIRD" }, ...base.signalResults.slice(1)] }), /Invalid signal result: status/) &&
      has(issuesFor({ signalResults: [{ ...base.signalResults[0], metadata: { a: {} } }, ...base.signalResults.slice(1)] }), /Invalid signal result: metadata/) &&
      has(issuesFor({ signalResults: [5, ...base.signalResults] }), /Invalid signal result/) &&
      has(
        issuesFor({ signalResults: [{ ...base.signalResults[2], errors: [] }, ...base.signalResults.filter((r) => r.signalId !== "gamma")] }),
        /Invalid signal result: a FAILED result requires at least one error/,
      ),
  );
  check("Duplicate Signal: two results for one signal", has(issuesFor({ signalResults: [...base.signalResults, base.signalResults[0]] }), /Duplicate signal "alpha"/));
  check(
    "a result for a signal the analysis did not register is invalid",
    has(issuesFor({ signalResults: [...base.signalResults, { ...base.signalResults[0], signalId: "zeta" }] }), /"zeta", which is not registered/),
  );
  check(
    "a result that disagrees with the analysis is invalid",
    has(issuesFor({ signalResults: [{ ...base.signalResults[0], status: "SKIPPED" }, ...base.signalResults.slice(1)] }), /"alpha" is SKIPPED but the analysis says COMPLETED/),
  );
  check(
    "issues name their fields",
    validator.validateInput(null).every((i) => i.field.length > 0 && i.message.length > 0) && issuesFor({ signalResults: undefined }).every((i) => i.field.length > 0 && i.message.length > 0),
  );
  check(
    "validation reports and never throws on hostile input",
    (() => {
      try {
        for (const v of [
          null,
          undefined,
          1,
          "x",
          [],
          {},
          () => 0,
          { signalResults: [null, undefined, () => 0], resolvedSignals: [null] },
          { ...mainFix.analysis, signalResults: [{ signalId: 5 }], resolvedSignals: [{}] },
        ])
          validator.validateInput(v);
        return true;
      } catch {
        return false;
      }
    })(),
  );

  const tamper = (fn: (c: any) => void) => {
    const c = copy(ex);
    fn(c);
    return validator.validateExplanation(c);
  };
  check("the untouched copy is valid", tamper(() => undefined).length === 0);
  check(
    "Invalid Sections: not an object, an unknown kind, and a missing field",
    has(validator.validateSection(null), /Invalid sections/) &&
      has(validator.validateSection({ ...section, kind: "SCORE" }), /not supported/) &&
      has(validator.validateSection({ kind: "CHANNEL_COMPATIBILITY" }), /must have "title"/),
  );
  check(
    "Invalid Sections: a wrong title, a state of the wrong family, and an empty summary",
    has(validator.validateSection({ ...section, title: "Channel Compatibility!" }), /title of CHANNEL_COMPATIBILITY/) &&
      has(validator.validateSection({ ...section, state: "REPORTED" }), /not valid for CHANNEL_COMPATIBILITY/) &&
      has(validator.validateSection({ ...section, summary: "" }), /needs a summary/),
  );
  check(
    "Invalid Sections: an item of the wrong category, an item whose signal is not listed, and an extra key",
    has(validator.validateSection({ ...section, items: [{ ...sourceItem, category: "POLICY" }] }), /has category POLICY/) &&
      has(validator.validateSection({ ...section, signalIds: [] }), /does not list/) &&
      has(validator.validateSection({ ...section, score: 1 }), /Unexpected field "score"/),
  );
  check(
    "Invalid Sections: a collecting section holding the wrong kind of item",
    has(
      validator.validateSection({
        kind: "EXECUTION_SUMMARY",
        title: "Execution Summary",
        state: "REPORTED",
        summary: "s",
        signalIds: [],
        items: [{ ...sourceItem, kind: "STRENGTH", signalId: null, category: null }],
      }),
      /not allowed here/,
    ),
  );
  check(
    "Invalid Sections: NO_SIGNAL and NONE and REPORTED must agree with their items",
    has(validator.validateSection({ ...section, state: "NO_SIGNAL" }), /NO_SIGNAL section has no signals/) &&
      has(
        validator.validateSection({
          kind: "WARNINGS",
          title: "Warnings",
          state: "NONE",
          summary: "s",
          signalIds: ["alpha"],
          items: [{ ...sourceItem, kind: "WARNING" }],
        }),
        /NONE section has no items/,
      ) &&
      has(validator.validateSection({ kind: "WARNINGS", title: "Warnings", state: "REPORTED", summary: "s", signalIds: [], items: [] }), /REPORTED section has items/),
  );
  check(
    "Invalid Sections: a section with duplicate signal ids or a bad item",
    has(validator.validateSection({ ...section, signalIds: ["alpha", "alpha"] }), /distinct signal ids/) &&
      has(validator.validateSection({ ...section, items: [{ ...sourceItem, text: "" }] }), /item text/) &&
      has(validator.validateSection({ ...section, items: ["x"] }), /item must be an object/),
  );
  check(
    "Invalid Sections: the explanation must hold eight sections in order",
    has(tamper((c) => c.sectionBreakdown.pop()), /exactly 8 sections/) &&
      has(tamper((c) => c.sectionBreakdown.reverse()), /in the order/) &&
      has(tamper((c) => { c.sectionBreakdown = "x"; }), /sections must be a list/) &&
      has(tamper((c) => { c.sectionBreakdown[0].title = "X"; }), /title of CHANNEL_COMPATIBILITY/),
  );
  check(
    "Invalid Sections: a collecting section that disagrees with the explanation's lists",
    has(tamper((c) => c.sectionBreakdown[5].items.pop()), /WARNINGS does not hold the same items/) &&
      has(tamper((c) => c.sectionBreakdown[6].items.reverse()), /MISSING_INFORMATION does not hold the same items/),
  );
  check(
    "Invalid Sections: a statement in a category section that is not in the lists",
    has(
      tamper((c) => c.sectionBreakdown[0].items.push({ kind: "STRENGTH", text: "Invented", signalId: "alpha", category: "TRAFFIC_CHANNEL", dimension: null })),
      /not in the explanation's lists/,
    ),
  );
  check(
    "a score, a ranking, or a recommendation is rejected as an extra field, at every level",
    has(tamper((c) => { c.score = 1; }), /Unexpected field "score".*no score, ranking, or recommendation/) &&
      has(tamper((c) => { c.ranking = 1; }), /Unexpected field "ranking"/) &&
      has(tamper((c) => { c.recommendation = "x"; }), /Unexpected field "recommendation"/) &&
      has(tamper((c) => { c.strengths[0].score = 1; }), /Unexpected field "score"/) &&
      has(tamper((c) => { c.signalBreakdown[0].rank = 1; }), /Unexpected field "rank"/),
  );
  check("Invalid Metadata: explanation metadata that is not flat", has(tamper((c) => { c.metadata.nested = {}; }), /Invalid metadata/) && has(tamper((c) => { c.metadata = []; }), /Invalid metadata/));
  check(
    "missing fields, bad ids, and a bad execution time are rejected",
    has(tamper((c) => delete c.summary), /field "summary" is missing/) &&
      has(tamper((c) => { c.analysisId = ""; }), /analysisId/) &&
      has(tamper((c) => { c.executionTime = -1; }), /executionTime/) &&
      has(tamper((c) => { c.summary = ""; }), /summary must be non-empty/) &&
      has(validator.validateExplanation(null), /must be an object/),
  );
  check("lists must hold their own kind of item", has(tamper((c) => { c.strengths[0].kind = "WEAKNESS"; }), /not allowed here/) && has(tamper((c) => { c.errors = {}; }), /"errors" must be a list/));
  check(
    "a breakdown entry must agree with the lists",
    has(tamper((c) => { c.signalBreakdown[0].strengthCount = 99; }), /strengthCount is 99 but the lists hold 3/) &&
      has(tamper((c) => { c.signalBreakdown[1].signalId = "alpha"; }), /Duplicate signal "alpha" in the breakdown/) &&
      has(tamper((c) => { c.signalBreakdown[0].status = "WEIRD"; }), /status is not supported/) &&
      has(tamper((c) => { c.signalBreakdown[0].notes = "x"; }), /notes must be a list/),
  );

  let threw = false;
  const odd: unknown[] = [null, undefined, 5, "x", [], {}, () => 0, { analysis: 5 }, { analysis: mainFix.analysis }, { ...mainFix.analysis, signalResults: [null], resolvedSignals: [undefined] }];
  const oddOutcomes = odd.map((v) => {
    try {
      return engineOf().explain(v);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the engine never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.explanation === null && o.issues.length > 0));
  const renderedBad = engineOf().render(null);
  check(
    "rendering a rejected input gives no views",
    renderedBad.outcome.status === "REJECTED" &&
      renderedBad.short === null &&
      renderedBad.compact === null &&
      renderedBad.detailed === null &&
      renderedBad.json === null &&
      renderedBad.machine === null &&
      renderedBad.view === null &&
      renderedBad.sections.length === 0,
  );
  const thrower = createTrafficExplanationEngine({ builder: { build: () => { throw new Error("builder exploded"); } }, now: tick() }).explain(mainFix.input());
  check("a builder that throws is reported as a rejection, not thrown", thrower.status === "REJECTED" && has(thrower.issues, /builder exploded/));
  const brokenBuilder = createTrafficExplanationEngine({
    builder: { build: (input) => ({ ...createTrafficExplanationBuilder().build(input), score: 1 } as never) },
    now: tick(),
  }).explain(mainFix.input());
  check("an explanation the engine built is checked, and one that fails is not handed out", brokenBuilder.status === "REJECTED" && has(brokenBuilder.issues, /Unexpected field "score"/));
  const badClock = createTrafficExplanationEngine({ now: () => Number.NaN }).explain(mainFix.input());
  const backwards = (() => {
    let t = 10;
    return createTrafficExplanationEngine({ now: () => (t -= 1) }).explain(mainFix.input());
  })();
  check("a broken clock cannot make executionTime negative or not a number", badClock.explanation!.executionTime === 0 && backwards.explanation!.executionTime === 0);
  const realClock = createTrafficExplanationEngine().explain(mainFix.input()).explanation!;
  check("the default clock gives a finite, non-negative executionTime", Number.isFinite(realClock.executionTime) && realClock.executionTime >= 0);
  check("the engine exposes its parts and validates without explaining", engine.builder !== undefined && engine.formatter !== undefined && engine.validator !== undefined && engine.validate(null).length > 0);
  const builderAlone = createTrafficExplanationBuilder().build(mainFix.input());
  check("the builder alone builds everything but the execution time", !("executionTime" in builderAlone) && builderAlone.summary === ex.summary);

  const rendered = engine.render(mainFix.input());
  check(
    "render gives every view for a good input",
    rendered.outcome.status === "EXPLAINED" &&
      rendered.short !== null &&
      rendered.compact !== null &&
      rendered.detailed !== null &&
      rendered.sections.length === 8 &&
      rendered.json !== null &&
      rendered.machine !== null &&
      rendered.view !== null,
  );
  check("short summary: the explanation's summary", formatter.formatShortSummary(ex) === ex.summary && rendered.short === ex.summary && !rendered.short!.includes("\n"));
  const compact = formatter.formatCompact(ex);
  check(
    "compact report: titles and summaries, no item lines, and the scope note",
    TRAFFIC_EXPLANATION_SECTION_KINDS.every((k) => compact.includes(TRAFFIC_EXPLANATION_SECTION_TITLES[k])) &&
      compact.includes(ex.summary) &&
      !/\[STRENGTH\]|\[WEAKNESS\]|\[MISSING\]|\[WARNING\]|\[ERROR\]/.test(compact) &&
      compact.endsWith(TRAFFIC_EXPLANATION_SCOPE_NOTE) &&
      compact.startsWith("Traffic explanation"),
  );
  const detailed = formatter.formatDetailed(ex);
  check(
    "detailed report: every section, signal, and statement, and the scope note",
    TRAFFIC_EXPLANATION_SECTION_KINDS.every((k) => detailed.includes(TRAFFIC_EXPLANATION_SECTION_TITLES[k])) &&
      ex.signalBreakdown.every((b) => detailed.includes(b.name)) &&
      ex.sectionBreakdown.every((s) => s.items.every((i) => detailed.includes(i.text))) &&
      detailed.endsWith(TRAFFIC_EXPLANATION_SCOPE_NOTE) &&
      detailed.includes(ex.summary),
  );
  check(
    "a collecting section names the signal behind each line, a category section does not repeat it",
    blocks0(ex, 5).includes("(from alpha)") && !blocks0(ex, 0).includes("(from "),
  );
  check("detailed report: notes a signal attached are shown", detailed.includes("Note: DIRECT_SOURCE means the source stated it."));
  const blocks = formatter.formatSections(ex);
  check(
    "section breakdown: one block per section in order, each with its title, state, summary, and items",
    blocks.length === 8 &&
      ex.sectionBreakdown.every((s, i) => blocks[i].startsWith(`${s.title} (${s.state})`) && blocks[i].includes(s.summary) && s.items.every((item) => blocks[i].includes(`[${item.kind}] ${item.text}`))) &&
      formatter.formatSection(ex.sectionBreakdown[0]) === blocks[0],
  );
  const machine = formatter.toMachineReadable(ex);
  check(
    "machine-readable: a versioned envelope around a plain copy",
    machine.schemaVersion === TRAFFIC_EXPLANATION_SCHEMA_VERSION &&
      machine.format === "traffic-explanation" &&
      machine.explanation !== ex &&
      stable(machine.explanation) === stable(ex) &&
      !Object.isFrozen(machine.explanation),
  );
  const json = formatter.toJson(ex);
  check(
    "JSON round-trips to the same data and is stable",
    stable(JSON.parse(json).explanation) === stable(ex) && json === formatter.toJson(ex) && JSON.parse(json).schemaVersion === 1 && JSON.parse(json).format === "traffic-explanation" && rendered.json === json,
  );
  check(
    "machine-readable output can be changed without touching the explanation",
    (() => {
      const m = formatter.toMachineReadable(ex);
      (m.explanation.strengths as unknown[]).length = 0;
      return ex.strengths.length === 5;
    })(),
  );
  const view = formatter.toViewModel(ex);
  check(
    "view model: eight sections keyed by kind, with stable unique item ids",
    view.sections.map((s) => s.id).join() === TRAFFIC_EXPLANATION_SECTION_KINDS.join() &&
      new Set(view.sections.flatMap((s) => s.items.map((i) => i.id))).size === view.sections.reduce((n, s) => n + s.items.length, 0) &&
      view.sections[0].items[0].id === "CHANNEL_COMPATIBILITY-1" &&
      view.title === "Traffic explanation",
  );
  check(
    "view model: tones, sources, signals, and the scope note",
    view.sections.flatMap((s) => s.items).every((i) => ["positive", "negative", "caution", "neutral"].includes(i.tone)) &&
      view.sections[7].items.every((i) => i.tone === "neutral") &&
      view.sections[0].items[0].source.signalId === "alpha" &&
      view.signals.length === 6 &&
      view.signals[0].id === "alpha" &&
      view.note === TRAFFIC_EXPLANATION_SCOPE_NOTE &&
      view.schemaVersion === 1 &&
      view.analysisId === ex.analysisId,
  );
  check("view model is plain data: it survives a JSON round trip unchanged and holds no function", stable(JSON.parse(JSON.stringify(view))) === stable(view) && !JSON.stringify(view, (k, v) => (typeof v === "function" ? "FN" : v)).includes("FN"));
  check("formatting twice gives the same output", formatter.formatDetailed(ex) === detailed && formatter.formatCompact(ex) === compact && stable(formatter.toViewModel(ex)) === stable(view));
  check("formatting does not change the explanation", isDeepFrozenTraffic(ex) && stable(ex) === stable(again));

  const live = await liveOpportunity();
  const liveCtx = createTrafficExecutionContext({
    candidate,
    opportunityAnalysis: live as never,
    opportunityExplanation: null,
    executionMetadata: { run: "t1" },
    runtimeMetadata: { host: "h1" },
    configuration: {},
  });
  const allTraffic = createTrafficSignalPipeline({ now: zero });
  registerChannelSuitabilitySignal(allTraffic, { now: zero });
  registerPolicyRiskSignal(allTraffic, { now: zero });
  registerAudienceFitSignal(allTraffic, { now: zero });
  registerOfferStrategySignal(allTraffic, { now: zero });
  registerCreativeReadinessSignal(allTraffic, { now: zero });
  const realRun = await createTrafficResolver({ signals: allTraffic, ...clocks() } as never).run(liveCtx);
  const realInput: TrafficExplanationInput = realRun.analysis;
  const realOutcome = engineOf().explain(realInput);
  const rex = realOutcome.explanation!;
  const expectedOrder = "channel-suitability,policy-risk,audience-fit,offer-strategy,creative-readiness";
  check("the five concrete signals are explained through the Signal Contract alone", realOutcome.status === "EXPLAINED" && rex.signalBreakdown.length === 5 && rex.signalBreakdown.every((b) => b.status === "COMPLETED"));
  check(
    "each of the five category sections is COMPLETED and holds its own signal",
    rex.sectionBreakdown.slice(0, 5).every((s) => s.state === "COMPLETED" && s.signalIds.length === 1) &&
      rex.sectionBreakdown[0].signalIds[0] === "channel-suitability" &&
      rex.sectionBreakdown[1].signalIds[0] === "policy-risk" &&
      rex.sectionBreakdown[2].signalIds[0] === "audience-fit" &&
      rex.sectionBreakdown[3].signalIds[0] === "offer-strategy" &&
      rex.sectionBreakdown[4].signalIds[0] === "creative-readiness",
  );
  check("the real explanation validates, renders, and is frozen", validator.validateExplanation(rex).length === 0 && engineOf().render(realInput).detailed!.length > 0 && isDeepFrozenTraffic(rex));
  check("the real explanation restates the execution order the Resolver kept", rex.metadata.executionOrder === expectedOrder && realInput.executionOrder.join() === expectedOrder);
  check("the execution summary names the Opportunity analysis the run followed", rex.sectionBreakdown.find((s) => s.kind === "EXECUTION_SUMMARY")!.items.some((i) => i.text === `Opportunity analysis: ${live.analysisId}.`));
  const realAlone = engineOf().explain({
    ...realInput,
    signalResults: realInput.signalResults.filter((r) => r.signalId !== "policy-risk"),
    executedSignals: realInput.executedSignals.filter((id) => id !== "policy-risk"),
    failedSignals: [],
  } as never);
  check(
    "independent execution: each signal's items depend only on that signal's result",
    realAlone.status === "EXPLAINED" &&
      ["channel-suitability", "audience-fit", "offer-strategy", "creative-readiness"].every(
        (id) => stable(realAlone.explanation!.missingInformation.filter((i) => i.signalId === id)) === stable(rex.missingInformation.filter((i) => i.signalId === id)),
      ),
  );

  const counts = { analyze: 0, supports: 0, validate: 0 };
  const spy: TrafficSignalModule = {
    ...fake("spy", { category: "TRAFFIC_CHANNEL", output: ALPHA }),
    supportsAnalysis: () => {
      counts.supports += 1;
      return true;
    },
    validate: () => {
      counts.validate += 1;
      return [];
    },
    analyze: () => {
      counts.analyze += 1;
      return { ...ALPHA, metadata: { ...ALPHA.metadata }, warnings: [...ALPHA.warnings], errors: [] };
    },
  };
  const spySignals = createTrafficSignalPipeline({ now: zero });
  spySignals.register(spy);
  const spyRun = await createTrafficResolver({ signals: spySignals, ...clocks() } as never).run(goodContext());
  const afterResolver = { ...counts };
  check("the Resolver executes the signal exactly once", afterResolver.analyze === 1 && spyRun.analysis.signalResults.length === 1 && spyRun.analysis.executionOrder.join() === "spy");
  const spyBefore = JSON.stringify(spyRun.analysis);
  const spyEngine = engineOf();
  const outcomes = [spyEngine.explain(spyRun.analysis), spyEngine.explain(spyRun.analysis)];
  spyEngine.render(spyRun.analysis);
  spyEngine.validate(spyRun.analysis);
  createTrafficExplanationBuilder().build(spyRun.analysis);
  formatter.formatDetailed(outcomes[0].explanation!);
  check(
    "explaining, rendering, validating, and building any number of times executes no signal",
    counts.analyze === afterResolver.analyze &&
      counts.supports === afterResolver.supports &&
      counts.validate === afterResolver.validate &&
      outcomes.every((o) => o.status === "EXPLAINED"),
  );
  check(
    "the explanation of the spied run restates the snapshot the Resolver kept, and the analysis is not mutated",
    outcomes[0].explanation!.metadata.executionOrder === "spy" && JSON.stringify(spyRun.analysis) === spyBefore && isDeepFrozenTraffic(spyRun.analysis),
  );
  check("snapshot reuse: explaining the five-signal analysis does not run those signals again", counts.analyze === afterResolver.analyze);

  const detached = JSON.parse(JSON.stringify(mainFix.analysis));
  check(
    "the explanation needs only the snapshot: a plain JSON copy of the analysis, with no pipeline behind it, explains identically",
    stable(engineOf().explain(detached).explanation) === stable(ex) && formatter.formatDetailed(engineOf().explain(detached).explanation!) === formatter.formatDetailed(ex),
  );
  const liveDetached = JSON.parse(JSON.stringify(realInput));
  check(
    "a JSON copy of the five-signal snapshot explains identically to the live analysis",
    stable(engineOf().explain(liveDetached).explanation) === stable(rex),
  );

  const dir = join(process.cwd(), "src/lib/traffic");
  const names = walk(dir).filter((f) => /[\\/]traffic-explanation-[a-z]+\.ts$/.test(f));
  check(
    "six modules exist: engine, builder, section, formatter, validator, result",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "traffic-explanation-builder.ts,traffic-explanation-engine.ts,traffic-explanation-formatter.ts,traffic-explanation-result.ts,traffic-explanation-section.ts,traffic-explanation-validator.ts",
  );
  const lines = names.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check(
    "no concrete signal, analyzer, or ad platform is named anywhere, comments included",
    !lines.some((l) => /channel-suitability|policy-risk|audience-fit|offer-strategy|creative-readiness|-analyzer|google|facebook|tiktok|\bseo\b|campaign|budget|slug/i.test(l)),
  );
  check("no concrete signal id is named in code", !code.some((l) => /["'](channel-suitability|policy-risk|audience-fit|offer-strategy|creative-readiness)["']/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(traffic-explanation-[a-z]+|traffic-types|traffic-validator|traffic-signal-(contract|context)|traffic-resolver-(analysis|validator))$/;
  check("imports were found", imports.length >= 18);
  check("the engine imports only the Signal Contract, the analysis and its validator, and its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform module is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity/.test(i.from)));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|db/i.test(i.from.replace(/\/traffic-types|\/traffic-signal-contract|\/traffic-explanation-/, ""))));
  check(
    "the engine imports no pipeline, registry, executor, or resolver entry, so it cannot execute a signal",
    !imports.some((i) => /signal-(pipeline|registry|executor|resolver)|resolver-(pipeline|plan|recorder|context)|traffic-resolver$|traffic-engine/.test(i.from)),
  );
  check("the engine calls no run, collect, resolve, or ordering member", !code.some((l) => /\.(run|collectEvidence|resolveProviders|mergeEvidence|resolveExecutionOrder|resolveSignals|resolve)\(/.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const clockLines = code.filter((l) => /Date\.now|new Date\(|Math\.random|randomUUID|performance\.now/.test(l));
  check("the engine reads the clock in exactly one place, an injectable default that only measures elapsed time", clockLines.length === 1 && /options\.now\s*\?\?/.test(clockLines[0]));
  check("the engine never registers, enables, disables, or removes a signal, and never calls a signal's own members", !code.some((l) => /\.(register|enable|disable|remove|analyze|supportsAnalysis)\(/.test(l)));
  check("nothing in the engine assigns into its inputs", !code.some((l) => /\b(input|analysis|signalResults|result|results)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the engine builds", code.some((l) => /freezeDeepTraffic\(/.test(l)));
  const others = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.startsWith("traffic-explanation") && !f.startsWith("traffic-override") && !f.startsWith("traffic-manual") && !f.startsWith("traffic-effective") && !f.startsWith("traffic-live") && !f.startsWith("traffic-preview") && !f.startsWith("traffic-comparison") && !f.startsWith("traffic-version") && !f.startsWith("traffic-snapshot") && !f.startsWith("traffic-history") && !f.startsWith("traffic-compare") && !f.startsWith("traffic-restore")).map((f) => join(dir, f));
  check("no existing module imports the explanation engine", !others.some((f) => /traffic-explanation/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic explanation engine: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
