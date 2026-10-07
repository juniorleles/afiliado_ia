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
import { registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
import { registerAudienceFitSignal } from "../src/lib/traffic/audience-fit-signal.ts";
import { registerOfferStrategySignal } from "../src/lib/traffic/offer-strategy-signal.ts";
import { registerCreativeReadinessSignal } from "../src/lib/traffic/creative-readiness-signal.ts";
import { createTrafficExplanationEngine } from "../src/lib/traffic/traffic-explanation-engine.ts";
import { createTrafficManualEditor } from "../src/lib/traffic/traffic-manual-editor.ts";
import { TRAFFIC_OVERRIDE_FIELDS } from "../src/lib/traffic/traffic-effective-view.ts";
import { createTrafficPreviewResolver, TRAFFIC_PREVIEW_MODES } from "../src/lib/traffic/traffic-preview-resolver.ts";
import {
  TRAFFIC_PREVIEW_SECTIONS,
  TRAFFIC_PREVIEW_SECTION_TITLES,
  createTrafficEffectivePreview,
} from "../src/lib/traffic/traffic-effective-preview.ts";
import { createTrafficComparisonView } from "../src/lib/traffic/traffic-comparison-view.ts";
import { createTrafficLivePreview } from "../src/lib/traffic/traffic-live-preview.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value);

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

interface FakeOpts {
  category: TrafficSignalModule["category"];
  output?: TrafficSignalOutput;
}
const COMPLETED = (metadata: TrafficSignalOutput["metadata"]): TrafficSignalOutput => ({
  status: "COMPLETED",
  confidence: 0.8,
  metadata,
  warnings: [],
  errors: [],
});
function fake(id: string, over: FakeOpts): TrafficSignalModule {
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category: over.category,
    enabled: true,
    priority: 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsAnalysis: () => true,
    validate: () => [],
    analyze: () => {
      const output = over.output ?? COMPLETED({});
      return { ...output, metadata: { ...output.metadata }, warnings: [...output.warnings], errors: [...output.errors] };
    },
  };
}

function stubOpportunity() {
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

const ALPHA = COMPLETED({ supportedChannels: "alpha-feed,beta-feed", unsupportedChannels: "gamma-feed", secret: "TOPSECRET-123" });
const BETA = COMPLETED({ "need.CLAIM_LANGUAGE": "SATISFIED" });

async function fixture() {
  const signals = createTrafficSignalPipeline({ now: zero });
  signals.register(fake("alpha", { category: "TRAFFIC_CHANNEL", output: ALPHA }));
  signals.register(fake("beta", { category: "POLICY", output: BETA }));
  const run = await createTrafficResolver({ signals, ...clocks() } as never).run(goodContext());
  return { analysis: run.analysis };
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

function walk(dir: string): string[] {
  return readdirSync(dir).map((f) => join(dir, f));
}

async function main() {
  check("four preview modes, in the documented order", TRAFFIC_PREVIEW_MODES.join() === "GENERATED,MANUAL,EFFECTIVE,COMPARISON");
  check(
    "eight visualization sections, in the documented order",
    TRAFFIC_PREVIEW_SECTIONS.join() === "CHANNELS,POLICY,AUDIENCE,OFFER,CREATIVE,TRAFFIC_NOTES,OPERATOR_NOTES,EXECUTION_SUMMARY",
  );
  check(
    "section titles are the operator-facing names",
    TRAFFIC_PREVIEW_SECTION_TITLES.CHANNELS === "Channels" &&
      TRAFFIC_PREVIEW_SECTION_TITLES.POLICY === "Policy" &&
      TRAFFIC_PREVIEW_SECTION_TITLES.OPERATOR_NOTES === "Operator Notes" &&
      TRAFFIC_PREVIEW_SECTION_TITLES.EXECUTION_SUMMARY === "Execution Summary",
  );

  const { analysis } = await fixture();
  const analysisBefore = JSON.stringify(analysis);
  const explanation = createTrafficExplanationEngine({ now: () => 0 }).explain(analysis).explanation!;
  const editor = createTrafficManualEditor({ timestamp: () => "2026-01-02T00:00:01.000Z" });
  const editing = editor.open({ analysis, explanation, operator: "ada" });
  check("the editor opens the same snapshot the preview will read", editing.status === "OPEN");
  editing.session!.edit("preferredChannels", ["alpha-feed"]);
  editing.session!.edit("operatorNotes", "Keep the listing plain.");
  editing.session!.edit("priority", 8);
  const saved = editing.session!.save();
  check("an overlay is saved for the preview", saved.status === "OK" && saved.view !== null);
  const view = saved.view!;
  const preview = createTrafficLivePreview();
  const opened = preview.open({ analysis, explanation, overrides: view.overrides, effectiveView: view });
  check("opening with a snapshot and an effective view gives OPEN", opened.status === "OPEN" && opened.session !== null && opened.issues.length === 0);
  const session = opened.session!;
  check("the default layer is EFFECTIVE", session.mode() === "EFFECTIVE");
  check("eight sections are present and expanded by default", session.sections().sections.map((s) => s.kind).join() === TRAFFIC_PREVIEW_SECTIONS.join() && session.expanded().join() === TRAFFIC_PREVIEW_SECTIONS.join());

  const generatedLayer = (() => {
    session.toggleLayer("GENERATED");
    return session.layer();
  })();
  check(
    "Generated mode shows the snapshot values and no manual presence",
    generatedLayer.mode === "GENERATED" &&
      generatedLayer.values.preferredChannels.join() === "alpha-feed,beta-feed" &&
      generatedLayer.values.operatorNotes === "" &&
      generatedLayer.present.preferredChannels === false &&
      generatedLayer.sources.preferredChannels === "GENERATED",
  );
  session.toggleLayer("MANUAL");
  const manualLayer = session.layer();
  check(
    "Manual mode shows only the overridden fields",
    manualLayer.mode === "MANUAL" &&
      manualLayer.values.preferredChannels.join() === "alpha-feed" &&
      manualLayer.values.operatorNotes === "Keep the listing plain." &&
      manualLayer.present.preferredChannels === true &&
      manualLayer.present.blockedChannels === false &&
      manualLayer.values.blockedChannels.length === 0,
  );
  session.toggleLayer("EFFECTIVE");
  const effectiveLayer = session.layer();
  check(
    "Effective mode keeps generated blocked channels and replaced preferred channels",
    effectiveLayer.mode === "EFFECTIVE" &&
      effectiveLayer.values.preferredChannels.join() === "alpha-feed" &&
      effectiveLayer.values.blockedChannels.join() === "gamma-feed" &&
      effectiveLayer.values.priority === 8 &&
      effectiveLayer.present.preferredChannels === true &&
      effectiveLayer.present.blockedChannels === false,
  );

  session.compare();
  check("compare switches to the side-by-side mode", session.mode() === "COMPARISON");
  const comparison = session.comparison();
  check("the comparison is frozen and names the analysis", isDeepFrozenTraffic(comparison) && comparison.analysisId === analysis.analysisId);
  check(
    "changed fields are highlighted and unchanged fields are not",
    comparison.changedFields.join() === "preferredChannels,operatorNotes,priority" &&
      comparison.rows.find((r) => r.field === "preferredChannels")!.changed === true &&
      comparison.rows.find((r) => r.field === "blockedChannels")!.changed === false &&
      comparison.rows.find((r) => r.field === "blockedChannels")!.manual === "(not overridden)",
  );
  check(
    "generated, manual, and effective values are all present on a changed row",
    comparison.rows.find((r) => r.field === "preferredChannels")!.generated === "alpha-feed, beta-feed" &&
      comparison.rows.find((r) => r.field === "preferredChannels")!.manual === "alpha-feed" &&
      comparison.rows.find((r) => r.field === "preferredChannels")!.effective === "alpha-feed",
  );
  check(
    "warnings and missing information are restated and not treated as overrides",
    comparison.rows.some((r) => r.field === "warnings" && r.changed === false) &&
      comparison.rows.some((r) => r.field === "missingInformation" && r.changed === false) &&
      comparison.warnings.join("|") === explanation.warnings.map((i) => i.text).join("|") &&
      comparison.missingInformation.join("|") === explanation.missingInformation.map((i) => i.text).join("|"),
  );

  const effectivePreview = session.previewEffective();
  check(
    "preview effective is a frozen document of the effective overlay",
    effectivePreview.mode === "EFFECTIVE" &&
      isDeepFrozenTraffic(effectivePreview) &&
      effectivePreview.values.preferredChannels.join() === "alpha-feed" &&
      effectivePreview.warnings.join("|") === explanation.warnings.map((i) => i.text).join("|"),
  );
  check(
    "visualization sections cover channels, policy, audience, offer, creative, notes, and execution",
    effectivePreview.sections.every((s) => s.title === TRAFFIC_PREVIEW_SECTION_TITLES[s.kind]) &&
      effectivePreview.sections.find((s) => s.kind === "CHANNELS")!.fields.map((f) => f.field).join() === "preferredChannels,blockedChannels" &&
      effectivePreview.sections.find((s) => s.kind === "OPERATOR_NOTES")!.fields[0].effective === "Keep the listing plain." &&
      effectivePreview.sections.find((s) => s.kind === "EXECUTION_SUMMARY")!.items.length >= 1,
  );
  const summaryOf = (kind: string) => explanation.sectionBreakdown?.find((s) => s.kind === kind)?.summary ?? "";
  check(
    "policy, audience, offer, and creative sections restate explanation summaries",
    effectivePreview.sections.find((s) => s.kind === "POLICY")!.summary === summaryOf("POLICY_RISKS") &&
      effectivePreview.sections.find((s) => s.kind === "AUDIENCE")!.summary === summaryOf("AUDIENCE_FIT") &&
      effectivePreview.sections.find((s) => s.kind === "OFFER")!.summary === summaryOf("OFFER_READINESS") &&
      effectivePreview.sections.find((s) => s.kind === "CREATIVE")!.summary === summaryOf("CREATIVE_READINESS"),
  );

  const copiedGenerated = session.copyGenerated();
  const copiedEffective = session.copyEffective();
  check(
    "copy generated and copy effective return frozen clones, not the snapshot",
    copiedGenerated.preferredChannels.join() === "alpha-feed,beta-feed" &&
      copiedEffective.preferredChannels.join() === "alpha-feed" &&
      isDeepFrozenTraffic(copiedGenerated) &&
      isDeepFrozenTraffic(copiedEffective) &&
      copiedGenerated !== view.generated,
  );
  try {
    copiedGenerated.preferredChannels.push("ghost-feed");
  } catch {
    /* frozen copies reject mutation */
  }
  check("mutating a copy does not change the generated layer", session.copyGenerated().preferredChannels.join() === "alpha-feed,beta-feed");

  check("collapse section hides it from the expanded list", session.collapseSection("CHANNELS").status === "OK" && !session.expanded().includes("CHANNELS") && session.sections().sections.find((s) => s.kind === "CHANNELS")!.expanded === false);
  check("expand section restores it", session.expandSection("CHANNELS").status === "OK" && session.expanded().includes("CHANNELS"));
  check("an unknown section is rejected", session.collapseSection("BUDGET").status === "REJECTED" && session.toggleLayer("SCORE").status === "REJECTED");

  check("the generated analysis snapshot is unchanged after previewing", JSON.stringify(analysis) === analysisBefore && isDeepFrozenTraffic(analysis));
  check("secret signal metadata is not copied into the preview", !JSON.stringify(session.sections()).includes("TOPSECRET-123") && !JSON.stringify(comparison).includes("TOPSECRET-123"));
  check("the editor overlay is unchanged by the preview", stable(editor.store.patch(analysis.analysisId)) === stable(view.overrides));

  const resolver = createTrafficPreviewResolver();
  check("the preview resolver returns generated values for GENERATED", resolver.values(view, "GENERATED").preferredChannels.join() === view.generated.preferredChannels.join());
  check("the preview resolver returns effective values for EFFECTIVE", resolver.values(view, "EFFECTIVE").operatorNotes === "Keep the listing plain.");
  const standalone = createTrafficComparisonView(view, explanation);
  check("a standalone comparison matches the session comparison", stable(standalone.changedFields) === stable(comparison.changedFields) && standalone.rows.length === comparison.rows.length);
  const standaloneEffective = createTrafficEffectivePreview({ view, explanation, mode: "EFFECTIVE" });
  check("a standalone effective preview has eight sections", standaloneEffective.sections.length === 8 && isDeepFrozenTraffic(standaloneEffective));

  check("Missing Snapshot: no analysis at all", has(preview.open(null).issues, /Missing snapshot/) && has(preview.open({}).issues, /Missing snapshot/) && has(preview.open({ analysis: null, effectiveView: view }).issues, /Missing snapshot/));
  check("Missing Snapshot: snapshot lists missing", has(preview.open({ analysis: { ...analysis, signalResults: undefined }, effectiveView: view }).issues, /Missing snapshot/) && has(preview.open({ analysis: { ...analysis, resolvedSignals: "x" }, effectiveView: view }).issues, /Missing snapshot/));
  check("Missing Effective View", has(preview.open({ analysis }).issues, /Missing effective view/) && has(preview.open({ analysis, effectiveView: null }).issues, /Missing effective view/));
  check("Invalid Override: nested metadata", has(preview.open({ analysis, effectiveView: { ...view, overrides: { customMetadata: { a: { b: 1 } } }, overriddenFields: ["customMetadata"] } }).issues, /Invalid metadata|Invalid override/));
  check("Invalid Override: overrides that do not match the view", has(preview.open({ analysis, effectiveView: view, overrides: { operatorNotes: "other" } }).issues, /Invalid override/));
  check("Invalid Override: an effective view for another analysis", has(preview.open({ analysis, effectiveView: { ...view, analysisId: "other" } }).issues, /Invalid override/));

  let threw = false;
  const odd = [null, undefined, 5, "x", [], {}, { analysis: 5 }, { analysis, effectiveView: 5 }];
  const oddOutcomes = odd.map((v) => {
    try {
      return createTrafficLivePreview().open(v as never);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the preview never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.session === null && o.issues.length > 0));

  const detached = JSON.parse(JSON.stringify(analysis));
  const detachedView = JSON.parse(JSON.stringify(view));
  const fromJson = createTrafficLivePreview().open({ analysis: detached, explanation: JSON.parse(JSON.stringify(explanation)), effectiveView: detachedView });
  check("a JSON copy of the snapshot and view previews identically", fromJson.status === "OPEN" && fromJson.session!.copyEffective().preferredChannels.join() === "alpha-feed");

  const counts = { analyze: 0 };
  const spy: TrafficSignalModule = {
    ...fake("spy", { category: "TRAFFIC_CHANNEL", output: ALPHA }),
    analyze: () => {
      counts.analyze += 1;
      return { ...ALPHA, metadata: { ...ALPHA.metadata }, warnings: [], errors: [] };
    },
  };
  const spySignals = createTrafficSignalPipeline({ now: zero });
  spySignals.register(spy);
  const spyRun = await createTrafficResolver({ signals: spySignals, ...clocks() } as never).run(goodContext());
  const afterResolver = counts.analyze;
  const spyEditor = createTrafficManualEditor({ timestamp: () => "2026-01-02T00:00:02.000Z" });
  const spyEdit = spyEditor.open({ analysis: spyRun.analysis });
  spyEdit.session!.edit("operatorNotes", "note");
  spyEdit.session!.save();
  const spyPreview = createTrafficLivePreview().open({ analysis: spyRun.analysis, effectiveView: spyEdit.session!.view() });
  spyPreview.session!.toggleLayer("GENERATED");
  spyPreview.session!.compare();
  spyPreview.session!.previewEffective();
  check("previewing a snapshot executes no signal", counts.analyze === afterResolver && afterResolver === 1 && spyPreview.status === "OPEN");
  check("the spied analysis is unchanged", isDeepFrozenTraffic(spyRun.analysis));

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
  const liveBefore = JSON.stringify(realRun.analysis);
  const realExplained = createTrafficExplanationEngine({ now: () => 0 }).explain(realRun.analysis);
  const realEditor = createTrafficManualEditor({ timestamp: () => "2026-01-02T00:00:03.000Z" }).open({ analysis: realRun.analysis, explanation: realExplained.explanation });
  realEditor.session!.edit("operatorNotes", "live overlay");
  realEditor.session!.save();
  const realPreview = createTrafficLivePreview().open({
    analysis: realRun.analysis,
    explanation: realExplained.explanation,
    effectiveView: realEditor.session!.view(),
  });
  check("the five-signal snapshot previews without running signals again", realPreview.status === "OPEN" && realPreview.session!.previewEffective().values.operatorNotes === "live overlay");
  check("the five-signal analysis is unchanged by the preview", JSON.stringify(realRun.analysis) === liveBefore);
  const explainedAgain = createTrafficExplanationEngine({ now: () => 0 }).explain(realRun.analysis);
  check("explaining after preview still reads the same generated snapshot", explainedAgain.status === "EXPLAINED" && stable(explainedAgain.explanation) === stable(realExplained.explanation));

  const dir = join(process.cwd(), "src/lib/traffic");
  const names = walk(dir).filter((f) => /[\\/](traffic-live-preview|traffic-preview-resolver|traffic-comparison-view|traffic-effective-preview)\.ts$/.test(f));
  check(
    "four modules exist: live preview, preview resolver, comparison view, effective preview",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "traffic-comparison-view.ts,traffic-effective-preview.ts,traffic-live-preview.ts,traffic-preview-resolver.ts",
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
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed =
    /^\.\/(traffic-live-preview|traffic-preview-resolver|traffic-comparison-view|traffic-effective-preview|traffic-effective-view|traffic-override-(resolver|validator)|traffic-types|traffic-validator|traffic-signal-(context|validator)|traffic-resolver-(analysis|validator))$/;
  check("imports were found", imports.length >= 8);
  check("the preview imports only the overlay, the snapshot, and its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform module is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity/.test(i.from)));
  check("the preview imports no pipeline, registry, executor, editor session, or resolver entry", !imports.some((i) => /signal-(pipeline|registry|executor|resolver)|resolver-(pipeline|plan|recorder|context)|traffic-resolver$|traffic-engine|traffic-manual-editor|traffic-override-store/.test(i.from)));
  check("the preview calls no run or analyze member", !code.some((l) => /\.(run|analyze|supportsAnalysis|resolveExecutionOrder|edit|save)\(/.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const clockLines = code.filter((l) => /Date\.now|new Date\(|Math\.random|randomUUID|performance\.now/.test(l));
  check("the preview does not read a wall clock", clockLines.length === 0);
  check("nothing in the preview assigns into its inputs", !code.some((l) => /\b(input|analysis|explanation|effectiveView|overrides|view)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the preview builds", code.some((l) => /freezeDeepTraffic\(/.test(l)));
  void TRAFFIC_OVERRIDE_FIELDS;

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic live preview: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
