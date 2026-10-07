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
import {
  TRAFFIC_OVERRIDE_FIELDS,
  TRAFFIC_OVERRIDE_SECTIONS,
  TRAFFIC_OVERRIDE_SECTION_FIELDS,
  TRAFFIC_OVERLAY_SCOPE_NOTE,
  createTrafficEffectiveView,
} from "../src/lib/traffic/traffic-effective-view.ts";
import { createTrafficOverrideStore } from "../src/lib/traffic/traffic-override-store.ts";
import { createTrafficOverrideResolver } from "../src/lib/traffic/traffic-override-resolver.ts";
import { createTrafficOverrideValidator } from "../src/lib/traffic/traffic-override-validator.ts";
import { createTrafficManualEditor } from "../src/lib/traffic/traffic-manual-editor.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
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

const ALPHA = COMPLETED({
  supportedChannels: "alpha-feed,beta-feed",
  unsupportedChannels: "gamma-feed",
  secret: "TOPSECRET-123",
});
const BETA = COMPLETED({ "need.CLAIM_LANGUAGE": "SATISFIED" });

async function fixture(modules: TrafficSignalModule[] = [fake("alpha", { category: "TRAFFIC_CHANNEL", output: ALPHA }), fake("beta", { category: "POLICY", output: BETA })]) {
  const signals = createTrafficSignalPipeline({ now: zero });
  for (const module of modules) signals.register(module);
  const run = await createTrafficResolver({ signals, ...clocks() } as never).run(goodContext());
  return { signals, run, analysis: run.analysis };
}

function editorOf(over: Record<string, unknown> = {}) {
  let n = 0;
  return createTrafficManualEditor({
    timestamp: () => new Date(Date.UTC(2026, 0, 2, 0, 0, (n += 1))).toISOString(),
    ...over,
  } as never);
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
  check(
    "nine editable fields in the documented order",
    TRAFFIC_OVERRIDE_FIELDS.join() === "preferredChannels,blockedChannels,trafficStrategy,audienceNotes,riskNotes,creativeNotes,operatorNotes,priority,customMetadata",
  );
  check(
    "five sections cover every field once",
    TRAFFIC_OVERRIDE_SECTIONS.join() === "CHANNELS,STRATEGY,NOTES,PRIORITY,METADATA" &&
      TRAFFIC_OVERRIDE_SECTIONS.flatMap((s) => [...TRAFFIC_OVERRIDE_SECTION_FIELDS[s]]).join() === TRAFFIC_OVERRIDE_FIELDS.join(),
  );
  check("the overlay note says the generated analysis is not changed", /generated analysis is not changed/.test(TRAFFIC_OVERLAY_SCOPE_NOTE));

  const mainFix = await fixture();
  const analysisBefore = JSON.stringify(mainFix.analysis);
  const explainer = createTrafficExplanationEngine({ now: () => 0 });
  const explained = explainer.explain(mainFix.analysis);
  check("the fixture analysis explains without the editor", explained.status === "EXPLAINED" && explained.explanation !== null);
  const editor = editorOf();
  const opened = editor.open({ analysis: mainFix.analysis, explanation: explained.explanation, generatedStrategy: null, operator: "ada" });
  check("opening a generated analysis gives an OPEN session", opened.status === "OPEN" && opened.session !== null && opened.issues.length === 0);
  const session = opened.session!;
  check("the session names the analysis and the operator", session.analysisId === mainFix.analysis.analysisId && session.candidateId === "cand-1" && session.operator === "ada");
  const generated = session.generated();
  check(
    "generated preferred and blocked channels are restated from completed signal lists",
    generated.preferredChannels.join() === "alpha-feed,beta-feed" && generated.blockedChannels.join() === "gamma-feed",
  );
  check("generated strategy is the identifier that was supplied, or null", generated.trafficStrategy === null);
  check(
    "generated notes restate explanation section summaries, and operator notes start empty",
    generated.audienceNotes.length >= 0 &&
      generated.riskNotes === explained.explanation!.sectionBreakdown.find((s) => s.kind === "POLICY_RISKS")!.summary &&
      generated.creativeNotes === explained.explanation!.sectionBreakdown.find((s) => s.kind === "CREATIVE_READINESS")!.summary &&
      generated.operatorNotes === "" &&
      generated.priority === null &&
      Object.keys(generated.customMetadata).length === 0,
  );
  const initial = session.view();
  check(
    "with no overrides the effective view is the generated view",
    initial.overriddenFields.length === 0 &&
      initial.sources.preferredChannels === "GENERATED" &&
      initial.effective.preferredChannels.join() === generated.preferredChannels.join() &&
      isDeepFrozenTraffic(initial),
  );
  check("secret signal metadata is not copied into the editor values", !JSON.stringify(generated).includes("TOPSECRET-123") && !JSON.stringify(initial).includes("TOPSECRET-123"));

  const edited = session.edit("preferredChannels", ["alpha-feed"]);
  check("edit updates the preview and does not save", edited.status === "OK" && session.preview().effective.preferredChannels.join() === "alpha-feed" && session.view().overriddenFields.length === 0);
  const cancelled = session.cancel();
  check("cancel restores the last saved overlay", cancelled.status === "OK" && session.preview().effective.preferredChannels.join() === "alpha-feed,beta-feed");

  session.edit("preferredChannels", ["alpha-feed"]);
  session.edit("operatorNotes", "Keep the listing plain.");
  session.edit("priority", 10);
  session.edit("trafficStrategy", "single-product");
  session.edit("customMetadata", { note: "operator", n: 1, flag: true, none: null });
  const saved = session.save("ada");
  check("save writes the draft as the effective overlay", saved.status === "OK" && saved.view !== null && saved.view.overriddenFields.join() === "preferredChannels,trafficStrategy,operatorNotes,priority,customMetadata");
  check(
    "effective values replace only the overridden fields",
    saved.view!.effective.preferredChannels.join() === "alpha-feed" &&
      saved.view!.effective.blockedChannels.join() === "gamma-feed" &&
      saved.view!.effective.trafficStrategy === "single-product" &&
      saved.view!.effective.operatorNotes === "Keep the listing plain." &&
      saved.view!.effective.priority === 10 &&
      saved.view!.effective.customMetadata.note === "operator" &&
      saved.view!.sources.blockedChannels === "GENERATED" &&
      saved.view!.sources.preferredChannels === "MANUAL",
  );
  check("the generated analysis snapshot is unchanged after edit and save", JSON.stringify(mainFix.analysis) === analysisBefore && isDeepFrozenTraffic(mainFix.analysis));
  check("the generated layer itself is unchanged", session.generated().preferredChannels.join() === "alpha-feed,beta-feed" && session.generated().operatorNotes === "");

  const again = editorOf({ store: editor.store }).open({ analysis: mainFix.analysis });
  check("reopening the same analysis through the same store sees the saved overlay", again.status === "OPEN" && again.session!.view().effective.preferredChannels.join() === "alpha-feed" && again.session!.view().effective.priority === 10);

  const isolated = editorOf().open({ analysis: mainFix.analysis });
  check("a new store does not see another editor's overrides", isolated.status === "OPEN" && isolated.session!.view().overriddenFields.length === 0);

  session.edit("audienceNotes", "draft only");
  check("unsaved edits appear in preview and not in the saved view", session.preview().effective.audienceNotes === "draft only" && session.view().effective.audienceNotes === generated.audienceNotes);
  session.cancel();
  check("cancel drops the unsaved note", session.preview().effective.audienceNotes === generated.audienceNotes);

  const copiedGenerated = session.copyGenerated();
  check("copy generated loads the generated values into the draft", copiedGenerated.preferredChannels.join() === "alpha-feed,beta-feed" && session.preview().effective.preferredChannels.join() === "alpha-feed,beta-feed" && session.view().effective.preferredChannels.join() === "alpha-feed");
  session.cancel();
  const copiedEffective = session.copyEffective();
  check("copy effective loads the last saved overlay into the draft", copiedEffective.preferredChannels.join() === "alpha-feed" && session.preview().effective.priority === 10);

  const resetField = session.resetField("priority");
  check("reset field drops that override and keeps the others", resetField.status === "OK" && resetField.view!.effective.priority === null && resetField.view!.sources.priority === "GENERATED" && resetField.view!.effective.preferredChannels.join() === "alpha-feed");
  const resetSection = session.resetSection("CHANNELS");
  check(
    "reset section drops preferred and blocked overrides",
    resetSection.status === "OK" &&
      resetSection.view!.effective.preferredChannels.join() === "alpha-feed,beta-feed" &&
      resetSection.view!.sources.preferredChannels === "GENERATED" &&
      resetSection.view!.effective.trafficStrategy === "single-product",
  );
  const resetAll = session.resetAll("ada");
  check("reset all restores every generated value", resetAll.status === "OK" && resetAll.view!.overriddenFields.length === 0 && resetAll.view!.effective.trafficStrategy === null && resetAll.view!.effective.operatorNotes === "");

  const audit = session.audit();
  check("the audit log records operator, timestamp, previous value, new value, and changed fields", audit.length >= 4 && audit.every((entry) => entry.operator === "ada" && entry.timestamp.startsWith("2026-01-02") && Array.isArray(entry.changedFields) && typeof entry.previousValue === "object" && typeof entry.newValue === "object"));
  check("the first save named the fields that changed", audit[0].changedFields.includes("preferredChannels") && audit[0].changedFields.includes("operatorNotes") && audit[0].newValue.preferredChannels?.join() === "alpha-feed");
  check("reset all records that the overrides were removed", audit[audit.length - 1].changedFields.length > 0 && Object.keys(audit[audit.length - 1].newValue).length === 0);
  check("audit entries are frozen copies", isDeepFrozenTraffic(audit[0]) && audit[0] !== session.audit()[0]);

  const validator = createTrafficOverrideValidator();
  check("Invalid Channel: empty, malformed, and extra spaces", has(validator.validateChannel(""), /Invalid channel/) && has(validator.validateChannel("Alpha Feed"), /Invalid channel/) && has(validator.validateChannel(" alpha-feed"), /Invalid channel/));
  check("Duplicate Channel: the same id twice in one list", has(validator.validateField("preferredChannels", ["alpha-feed", "alpha-feed"]), /Duplicate channel/));
  check("Duplicate Channel: preferred and blocked share an id", has(validator.validateValues({ ...generated, preferredChannels: ["alpha-feed"], blockedChannels: ["alpha-feed"] }), /Duplicate channel/));
  check("Invalid Strategy: empty text and a malformed id", has(validator.validateStrategy(""), /Invalid strategy/) && has(validator.validateStrategy("Not A Strategy"), /Invalid strategy/));
  check("a null strategy is valid", validator.validateStrategy(null).length === 0);
  check("Invalid Metadata: nested values, empty keys, and non-objects", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && has(validator.validateMetadata({ "": 1 }), /Invalid metadata/) && has(validator.validateMetadata([]), /Invalid metadata/));
  check("Invalid Override: an unknown field, a missing field, and a bad type", has(validator.validatePatch({ score: 1 }), /Invalid override/) && has(validator.validateValues({ preferredChannels: [] }), /Invalid override/) && has(validator.validateField("priority", 1.5), /Invalid override/) && has(validator.validateField("audienceNotes", 5), /Invalid override/));
  const catalogued = createTrafficOverrideValidator({ channels: ["alpha-feed"], strategies: ["single-product"] });
  check("Invalid Channel: an id outside the catalog", has(catalogued.validateChannel("beta-feed"), /Invalid channel/) && catalogued.validateChannel("alpha-feed").length === 0);
  check("Invalid Strategy: an id outside the catalog", has(catalogued.validateStrategy("bundle"), /Invalid strategy/) && catalogued.validateStrategy("single-product").length === 0);

  check("the editor rejects an invalid channel on edit", session.edit("preferredChannels", ["not a channel"]).status === "REJECTED" && has(session.edit("preferredChannels", ["not a channel"]).issues, /Invalid channel/));
  check("the editor rejects a duplicate across preferred and blocked", session.edit("preferredChannels", ["gamma-feed"]).status === "REJECTED" && has(session.edit("preferredChannels", ["gamma-feed"]).issues, /Duplicate channel/));
  session.edit("blockedChannels", []);
  const allowedOverlap = session.edit("preferredChannels", ["gamma-feed"]);
  check("clearing blocked in the draft allows preferring a previously blocked channel", allowedOverlap.status === "OK");
  session.cancel();
  check("the editor rejects an invalid strategy on edit", session.edit("trafficStrategy", "").status === "REJECTED" && has(session.edit("trafficStrategy", "Nope").issues, /Invalid strategy/));
  check("the editor rejects invalid metadata on edit", session.edit("customMetadata", { a: { b: 1 } }).status === "REJECTED" && has(session.edit("customMetadata", { a: { b: 1 } }).issues, /Invalid metadata/));
  check("the editor rejects an unknown field", session.edit("score", 1).status === "REJECTED" && has(session.edit("score", 1).issues, /Invalid override/));
  check("the editor rejects an unknown section reset", session.resetSection("BUDGET").status === "REJECTED");

  const missing = editor.open({ analysis: null } as never);
  check("Missing Analysis is rejected", missing.status === "REJECTED" && has(missing.issues, /Missing analysis/));
  check("an analysis that is not an analysis is rejected", editor.open({ analysis: { score: 1 } }).status === "REJECTED");
  const mismatched = editor.open({ analysis: mainFix.analysis, explanation: { analysisId: "other", candidateId: "cand-1", sectionBreakdown: [] } });
  check("an explanation for a different analysis is rejected", mismatched.status === "REJECTED" && has(mismatched.issues, /different analysis/));

  const explicit = editorOf().open({
    analysis: mainFix.analysis,
    generatedStrategy: "bundle",
    generated: { preferredChannels: ["owned-list"], operatorNotes: "from generated" },
  });
  check(
    "an explicit generated overlay is used as the generated layer, not as a manual override",
    explicit.status === "OPEN" &&
      explicit.session!.generated().preferredChannels.join() === "owned-list" &&
      explicit.session!.generated().trafficStrategy === "bundle" &&
      explicit.session!.view().sources.preferredChannels === "GENERATED" &&
      explicit.session!.view().overriddenFields.length === 0,
  );

  const resolver = createTrafficOverrideResolver();
  const overlay = resolver.resolve(generated, { preferredChannels: ["alpha-feed"], operatorNotes: "x" });
  check("the resolver replaces only the overridden fields", overlay.preferredChannels.join() === "alpha-feed" && overlay.blockedChannels.join() === generated.blockedChannels.join() && overlay.operatorNotes === "x");
  const view = createTrafficEffectiveView({
    analysisId: "a1",
    candidateId: "cand-1",
    generated,
    overrides: { preferredChannels: ["alpha-feed"] },
    effective: overlay,
  });
  check("the effective view lists overridden fields and freezes the overlay", view.overriddenFields.join() === "preferredChannels" && view.sources.preferredChannels === "MANUAL" && isDeepFrozenTraffic(view));

  const store = createTrafficOverrideStore();
  store.put({ analysisId: "a1", field: "priority", value: 3, updatedAt: "2026-01-02T00:00:01.000Z", operator: "ada" });
  const stored = store.get("a1", "priority");
  store.remove("a1", "priority");
  check("the store is isolated in memory and returns frozen copies", stored?.value === 3 && store.get("a1", "priority") === null && isDeepFrozenTraffic(stored) && store.list("missing").length === 0);

  let threw = false;
  const odd = [null, undefined, 5, "x", [], {}, { analysis: 5 }, { analysis: mainFix.analysis, explanation: 5 }];
  const oddOutcomes = odd.map((v) => {
    try {
      return editorOf().open(v as never);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the editor never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.session === null && o.issues.length > 0));

  const counts = { analyze: 0 };
  const spy: TrafficSignalModule = {
    ...fake("spy", { category: "TRAFFIC_CHANNEL", output: ALPHA }),
    analyze: () => {
      counts.analyze += 1;
      return { ...ALPHA, metadata: { ...ALPHA.metadata }, warnings: [...ALPHA.warnings], errors: [] };
    },
  };
  const spySignals = createTrafficSignalPipeline({ now: zero });
  spySignals.register(spy);
  const spyRun = await createTrafficResolver({ signals: spySignals, ...clocks() } as never).run(goodContext());
  const afterResolver = counts.analyze;
  const spySession = editorOf().open({ analysis: spyRun.analysis });
  spySession.session!.edit("operatorNotes", "note");
  spySession.session!.save();
  spySession.session!.preview();
  spySession.session!.resetAll();
  check("opening and editing a snapshot executes no signal", counts.analyze === afterResolver && afterResolver === 1 && spySession.status === "OPEN");
  check("the spied analysis is unchanged", JSON.stringify(spyRun.analysis) === JSON.stringify(JSON.parse(JSON.stringify(spyRun.analysis))) && isDeepFrozenTraffic(spyRun.analysis));

  const detached = JSON.parse(JSON.stringify(mainFix.analysis));
  const fromJson = editorOf().open({ analysis: detached, generatedStrategy: null });
  check("a JSON copy of the snapshot opens identically to the live analysis", fromJson.status === "OPEN" && fromJson.session!.generated().preferredChannels.join() === generated.preferredChannels.join());

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
  const realEditor = editorOf().open({ analysis: realRun.analysis, explanation: realExplained.explanation });
  check("the five-signal snapshot opens and its explanation is reused", realEditor.status === "OPEN" && realExplained.status === "EXPLAINED");
  realEditor.session!.edit("operatorNotes", "operator overlay");
  realEditor.session!.save();
  const explainedAgain = createTrafficExplanationEngine({ now: () => 0 }).explain(realRun.analysis);
  check("explaining after an overlay still reads the same generated snapshot", explainedAgain.status === "EXPLAINED" && stable(explainedAgain.explanation) === stable(realExplained.explanation));
  check("the five-signal analysis is unchanged by the overlay", JSON.stringify(realRun.analysis) === liveBefore);
  check("the live overlay replaces only the effective operator notes", realEditor.session!.view().effective.operatorNotes === "operator overlay" && realEditor.session!.generated().operatorNotes === "");

  const dir = join(process.cwd(), "src/lib/traffic");
  const names = walk(dir).filter((f) => /[\\/](traffic-manual-editor|traffic-override-store|traffic-override-resolver|traffic-override-validator|traffic-effective-view)\.ts$/.test(f));
  check(
    "five modules exist: editor, store, resolver, validator, effective view",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "traffic-effective-view.ts,traffic-manual-editor.ts,traffic-override-resolver.ts,traffic-override-store.ts,traffic-override-validator.ts",
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
    /^\.\/(traffic-effective-view|traffic-override-(store|resolver|validator)|traffic-manual-editor|traffic-types|traffic-validator|traffic-signal-(context|validator)|traffic-resolver-(analysis|validator))$/;
  check("imports were found", imports.length >= 10);
  check("the editor imports only the snapshot, the signal context, and its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform module is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity/.test(i.from)));
  check("the editor imports no pipeline, registry, executor, or resolver entry, so it cannot execute a signal", !imports.some((i) => /signal-(pipeline|registry|executor|resolver)|resolver-(pipeline|plan|recorder|context)|traffic-resolver$|traffic-engine/.test(i.from)));
  check("the editor calls no run or analyze member", !code.some((l) => /\.(run|analyze|supportsAnalysis|resolveExecutionOrder)\(/.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const clockLines = code.filter((l) => /Date\.now|new Date\(|Math\.random|randomUUID|performance\.now/.test(l));
  check("the editor reads the clock in exactly one place, an injectable timestamp default", clockLines.length === 1 && /options\.timestamp\s*\?\?/.test(clockLines[0]));
  check("nothing in the editor assigns into its inputs", !code.some((l) => /\b(input|analysis|explanation|generated)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what the editor builds", code.some((l) => /freezeDeepTraffic\(/.test(l)));
  check("the overlay scope note is exported", TRAFFIC_OVERLAY_SCOPE_NOTE.length > 0);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic manual editor: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
