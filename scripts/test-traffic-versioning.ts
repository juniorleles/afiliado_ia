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
import { createTrafficLivePreview } from "../src/lib/traffic/traffic-live-preview.ts";
import { TRAFFIC_COMPARE_GROUPS, compareTrafficVersions } from "../src/lib/traffic/traffic-compare.ts";
import { createTrafficHistory } from "../src/lib/traffic/traffic-history.ts";
import { createTrafficRestore } from "../src/lib/traffic/traffic-restore.ts";
import { createTrafficVersionStore } from "../src/lib/traffic/traffic-version-store.ts";
import { createTrafficVersionValidator } from "../src/lib/traffic/traffic-version-validator.ts";
import { TRAFFIC_VERSION_ORIGINS, TRAFFIC_VERSION_STATUSES } from "../src/lib/traffic/traffic-snapshot.ts";

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

function storeOf() {
  let n = 0;
  let s = 0;
  return createTrafficVersionStore({
    timestamp: () => new Date(Date.UTC(2026, 0, 2, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `ver-${(n += 1)}`,
  });
}

async function main() {
  check("version statuses are draft and snapshot", TRAFFIC_VERSION_STATUSES.join() === "DRAFT,SNAPSHOT");
  check("version origins are create, duplicate, and restore", TRAFFIC_VERSION_ORIGINS.join() === "CREATE,DUPLICATE,RESTORE");
  check("compare groups cover channels, strategy, audience, risks, creative, notes, and metadata", TRAFFIC_COMPARE_GROUPS.join() === "CHANNELS,STRATEGY,AUDIENCE,RISKS,CREATIVE,NOTES,METADATA");

  const { analysis } = await fixture();
  const analysisBefore = JSON.stringify(analysis);
  const explanation = createTrafficExplanationEngine({ now: () => 0 }).explain(analysis).explanation!;
  const editor = createTrafficManualEditor({ timestamp: () => "2026-01-02T00:00:01.000Z" });
  const opened = editor.open({ analysis, explanation, operator: "ada" });
  check("the editor opens the snapshot versioning will name", opened.status === "OPEN");
  opened.session!.edit("preferredChannels", ["alpha-feed"]);
  opened.session!.edit("operatorNotes", "Keep the listing plain.");
  opened.session!.edit("priority", 8);
  const saved = opened.session!.save();
  check("an overlay is saved for the first snapshot", saved.status === "OK" && saved.view !== null);
  const view1 = saved.view!;
  const store = storeOf();
  const first = store.createSnapshot({ view: view1, operator: "ada", metadata: { note: "first", n: 1, flag: true, none: null } });
  check("create snapshot stores an immutable SNAPSHOT", first.status === "OK" && first.version !== null && first.version.status === "SNAPSHOT" && first.version.origin === "CREATE" && isDeepFrozenTraffic(first.version));
  check(
    "the version names the generated analysis and keeps an isolated override copy",
    first.version!.generatedReference.analysisId === analysis.analysisId &&
      first.version!.overrideReference.analysisId === analysis.analysisId &&
      first.version!.effectiveSnapshot.preferredChannels.join() === "alpha-feed" &&
      first.version!.overrides.preferredChannels!.join() === "alpha-feed" &&
      first.version!.generated.preferredChannels.join() === "alpha-feed,beta-feed",
  );

  opened.session!.edit("audienceNotes", "Buyers who already compared listings.");
  opened.session!.edit("riskNotes", "Restate the policy notes only.");
  opened.session!.edit("creativeNotes", "No extra claims.");
  opened.session!.edit("trafficStrategy", "single-product");
  opened.session!.edit("customMetadata", { note: "second" });
  const saved2 = opened.session!.save();
  const view2 = saved2.view!;
  const second = store.createSnapshot({ view: view2, operator: "ada", metadata: { note: "second" } });
  check("a second snapshot is stored without rewriting the first", second.status === "OK" && second.version!.parentVersionId === first.version!.versionId && store.get(first.version!.versionId)!.effectiveSnapshot.operatorNotes === "Keep the listing plain.");
  const listed = store.listVersions(analysis.analysisId);
  check("list versions returns history oldest first", listed.map((v) => v.versionId).join() === `${first.version!.versionId},${second.version!.versionId}`);

  const compared = store.compareVersions(first.version!.versionId, second.version!.versionId);
  check("compare versions is OK and frozen", compared.status === "OK" && compared.comparison !== null && compared.comparison !== undefined && isDeepFrozenTraffic(compared.comparison));
  const cmp = compared.comparison!;
  check(
    "compare highlights changed channels, strategy, audience, risks, creative, notes, and metadata",
    cmp.changedChannels === false &&
      cmp.changedStrategy === true &&
      cmp.changedAudience === true &&
      cmp.changedRisks === true &&
      cmp.changedCreative === true &&
      cmp.changedNotes === false &&
      cmp.changedMetadata === true &&
      cmp.changedFields.join() === "trafficStrategy,audienceNotes,riskNotes,creativeNotes,customMetadata",
  );
  const again = store.compareVersions(first.version!.versionId, second.version!.versionId);
  check("compare is deterministic", stable(again.comparison) === stable(cmp));
  const standalone = compareTrafficVersions(first.version!, second.version!);
  check("the compare engine matches the store comparison", stable(standalone.changedFields) === stable(cmp.changedFields) && standalone.fromVersionId === first.version!.versionId);

  const restored = store.restoreVersion(first.version!.versionId, "ada");
  check("restore creates a new SNAPSHOT and keeps earlier versions", restored.status === "OK" && restored.version !== null && restored.version.origin === "RESTORE" && restored.version.restoreSource === first.version!.versionId && restored.version.versionId !== first.version!.versionId);
  check(
    "the restored effective snapshot matches the source and the source is unchanged",
    stable(restored.version!.effectiveSnapshot) === stable(first.version!.effectiveSnapshot) &&
      stable(store.get(first.version!.versionId)!.effectiveSnapshot) === stable(first.version!.effectiveSnapshot) &&
      restored.version!.generatedReference.analysisId === analysis.analysisId,
  );
  const restoredAgain = store.restoreVersion(first.version!.versionId, "ada");
  check("restore is deterministic: the same source yields the same effective snapshot", stable(restoredAgain.version!.effectiveSnapshot) === stable(restored.version!.effectiveSnapshot) && restoredAgain.version!.versionId !== restored.version!.versionId);
  check("restore does not write the live overlay", opened.session!.view().effective.audienceNotes === "Buyers who already compared listings." && editor.store.patch(analysis.analysisId).audienceNotes === "Buyers who already compared listings.");
  check("the generated overlay inside a restored version is still the generated layer", restored.version!.generated.preferredChannels.join() === "alpha-feed,beta-feed" && restored.version!.effectiveSnapshot.preferredChannels.join() === "alpha-feed");

  const previewed = store.previewVersion(restored.version!.versionId);
  check("preview version returns a frozen copy of that snapshot", previewed.status === "OK" && previewed.version !== null && isDeepFrozenTraffic(previewed.version) && previewed.version.versionId === restored.version!.versionId);

  const duplicated = store.duplicateVersion(second.version!.versionId, "ada");
  check("duplicate version creates a DRAFT copy", duplicated.status === "OK" && duplicated.version !== null && duplicated.version.status === "DRAFT" && duplicated.version.origin === "DUPLICATE" && stable(duplicated.version.effectiveSnapshot) === stable(second.version!.effectiveSnapshot));
  const deleted = store.deleteDraftSnapshot(duplicated.version!.versionId, "ada");
  check("delete draft snapshot removes only the draft", deleted.status === "OK" && store.get(duplicated.version!.versionId) === null && store.get(second.version!.versionId) !== null);
  const blockedDelete = store.deleteDraftSnapshot(first.version!.versionId, "ada");
  check("a stored snapshot cannot be deleted", blockedDelete.status === "REJECTED" && has(blockedDelete.issues, /not a draft snapshot/) && store.get(first.version!.versionId) !== null);

  const draft = store.createSnapshot({ view: view2, operator: "ada", draft: true });
  check("create snapshot can store a draft", draft.status === "OK" && draft.version!.status === "DRAFT");
  check("the draft can be deleted", store.deleteDraftSnapshot(draft.version!.versionId, "ada").status === "OK" && store.get(draft.version!.versionId) === null);

  const log = store.audit(analysis.analysisId);
  check(
    "audit records operator, timestamp, previous version, new version, changed fields, and restore source",
    log.length >= 4 &&
      log.some((e) => e.action === "CREATE" && e.operator === "ada" && e.previousVersion === null) &&
      log.some((e) => e.action === "RESTORE" && e.restoreSource === first.version!.versionId && e.newVersion === restored.version!.versionId) &&
      log.every((e) => typeof e.timestamp === "string" && Array.isArray(e.changedFields)),
  );
  check("audit entries are frozen", log.every((entry) => isDeepFrozenTraffic(entry)));

  const livePreview = createTrafficLivePreview().open({ analysis, explanation, effectiveView: opened.session!.view() });
  check("live preview still reads the current overlay after versioning", livePreview.status === "OPEN" && livePreview.session!.copyEffective().audienceNotes === "Buyers who already compared listings.");

  check("Duplicate Version IDs", has(store.createSnapshot({ view: view1, operator: "ada", versionId: first.version!.versionId }).issues, /Duplicate version ids/));
  check("Missing Snapshot: no input", has(store.createSnapshot(null).issues, /Missing snapshot/) && has(store.createSnapshot({}).issues, /Missing snapshot/) && has(store.createSnapshot({ view: null, operator: "ada" }).issues, /Missing snapshot/));
  check("Missing Snapshot: effective values absent", has(store.createSnapshot({ view: { ...view1, effective: null }, operator: "ada" }).issues, /Missing snapshot/));
  check("Invalid Restore: unknown version", has(store.restoreVersion("ver-missing", "ada").issues, /Invalid restore/) && has(store.previewVersion("ver-missing").issues, /Invalid restore/));
  check("Invalid Restore: delete of a snapshot", has(blockedDelete.issues, /Invalid restore|not a draft/));
  check("Invalid Metadata", has(store.createSnapshot({ view: view1, operator: "ada", metadata: { a: { b: 1 } } }).issues, /Invalid metadata/));

  let threw = false;
  const odd = [null, undefined, 5, "x", [], {}, { view: 5 }, { view: view1 }];
  const oddOutcomes = odd.map((v) => {
    try {
      return storeOf().createSnapshot(v as never);
    } catch {
      threw = true;
      return null;
    }
  });
  check("the store never throws: odd input is rejected with reasons", !threw && oddOutcomes.every((o) => o !== null && o.status === "REJECTED" && o.version === null && o.issues.length > 0));

  const history = createTrafficHistory();
  check("history lists the same order as the store", history.list(listed, analysis.analysisId).map((v) => v.versionId).join() === listed.map((v) => v.versionId).join());
  const restorer = createTrafficRestore();
  const copied = restorer.restore({
    source: first.version!,
    versionId: "ver-copy",
    timestamp: "2026-01-02T00:00:09.000Z",
    operator: "ada",
    parentVersionId: first.version!.versionId,
  });
  check("the restore engine copies the effective snapshot into a new version id", copied.versionId === "ver-copy" && copied.origin === "RESTORE" && stable(copied.effectiveSnapshot) === stable(first.version!.effectiveSnapshot));
  const validator = createTrafficVersionValidator();
  check("the validator rejects a duplicate id against a known set", has(validator.validateVersionId(first.version!.versionId, new Set([first.version!.versionId])), /Duplicate version ids/));

  check("the generated analysis snapshot is unchanged after versioning", JSON.stringify(analysis) === analysisBefore && isDeepFrozenTraffic(analysis));
  check("secret signal metadata is not copied into a version", !JSON.stringify(first.version).includes("TOPSECRET-123"));

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
  const spyEditor = createTrafficManualEditor({ timestamp: () => "2026-01-02T00:00:02.000Z" }).open({ analysis: spyRun.analysis });
  spyEditor.session!.edit("operatorNotes", "note");
  spyEditor.session!.save();
  const spyStore = storeOf();
  spyStore.createSnapshot({ view: spyEditor.session!.view(), operator: "ada" });
  spyStore.restoreVersion(spyStore.listVersions(spyRun.analysis.analysisId)[0].versionId, "ada");
  check("versioning a snapshot executes no signal", counts.analyze === afterResolver && afterResolver === 1);

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
  const realStore = storeOf();
  const realSnap = realStore.createSnapshot({ view: realEditor.session!.view(), operator: "ada" });
  const realRestored = realStore.restoreVersion(realSnap.version!.versionId, "ada");
  check("the five-signal snapshot versions and restores", realSnap.status === "OK" && realRestored.status === "OK" && realRestored.version!.effectiveSnapshot.operatorNotes === "live overlay");
  check("the five-signal analysis is unchanged by versioning", JSON.stringify(realRun.analysis) === liveBefore);
  const explainedAgain = createTrafficExplanationEngine({ now: () => 0 }).explain(realRun.analysis);
  check("explaining after versioning still reads the same generated snapshot", explainedAgain.status === "EXPLAINED" && stable(explainedAgain.explanation) === stable(realExplained.explanation));

  const dir = join(process.cwd(), "src/lib/traffic");
  const names = walk(dir).filter((f) => /[\\/](traffic-version-store|traffic-snapshot|traffic-history|traffic-compare|traffic-restore|traffic-version-validator)\.ts$/.test(f));
  check(
    "six modules exist: version store, snapshot, history, compare, restore, validator",
    names.map((f) => f.split(/[\\/]/).pop()).sort().join() ===
      "traffic-compare.ts,traffic-history.ts,traffic-restore.ts,traffic-snapshot.ts,traffic-version-store.ts,traffic-version-validator.ts",
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
    /^\.\/(traffic-snapshot|traffic-history|traffic-compare|traffic-restore|traffic-version-(store|validator)|traffic-effective-view|traffic-override-(resolver|validator)|traffic-types|traffic-validator|traffic-signal-(context|validator))$/;
  check("imports were found", imports.length >= 8);
  check("versioning imports only the overlay snapshot helpers and its own modules", imports.every((i) => allowed.test(i.from)));
  check("no platform module is imported at all", !imports.some((i) => i.from.startsWith("@/") || /product-facts|lp-builder|discovery|opportunity/.test(i.from)));
  check("versioning imports no pipeline, registry, executor, editor, preview, or resolver entry", !imports.some((i) => /signal-(pipeline|registry|executor|resolver)|resolver-(pipeline|plan|recorder|context)|traffic-resolver$|traffic-engine|traffic-manual-editor|traffic-override-store|traffic-live-preview|traffic-preview|traffic-explanation/.test(i.from)));
  check("versioning calls no run or analyze member", !code.some((l) => /\.(run|analyze|supportsAnalysis|resolveExecutionOrder|edit|save)\(/.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, crawling, persistence, timers, or file access", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|robots|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel execution", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const clockLines = code.filter((l) => /Date\.now|new Date\(|Math\.random|randomUUID|performance\.now/.test(l));
  check("versioning reads the clock in exactly one place, an injectable timestamp default", clockLines.length === 1 && /options\.timestamp\s*\?\?/.test(clockLines[0]));
  check("nothing in versioning assigns into its inputs", !code.some((l) => /\b(input|analysis|view|source|from|to)\.[A-Za-z.[\]]+\s*=[^=>]/.test(l)));
  check("freezing is used on what versioning builds", code.some((l) => /freezeDeepTraffic\(/.test(l)));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic versioning: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
