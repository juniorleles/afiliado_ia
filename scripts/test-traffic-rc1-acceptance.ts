/**
 * Traffic Intelligence Engine — RC1 acceptance audit.
 * Validation only. Does not add engine behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createTrafficExecutionContext, isDeepFrozenTraffic } from "../src/lib/traffic/traffic-resolver-context.ts";
import { createTrafficResolver } from "../src/lib/traffic/traffic-resolver.ts";
import { createTrafficSignalPipeline } from "../src/lib/traffic/traffic-signal-pipeline.ts";
import { createTrafficModuleRegistry } from "../src/lib/traffic/traffic-signal-registry.ts";
import { createTrafficValidator } from "../src/lib/traffic/traffic-resolver-validator.ts";
import { validateTrafficDependencies, validateTrafficSignalModule } from "../src/lib/traffic/traffic-signal-validator.ts";
import { DEFAULT_CHANNEL_DEFINITIONS } from "../src/lib/traffic/channel-definitions.ts";
import { validateChannelDefinitions } from "../src/lib/traffic/channel-suitability-validator.ts";
import { DEFAULT_OFFER_STRATEGIES } from "../src/lib/traffic/offer-strategy-definitions.ts";
import { validateOfferStrategies } from "../src/lib/traffic/offer-strategy-validator.ts";
import type { TrafficSignalModule, TrafficSignalOutput } from "../src/lib/traffic/traffic-signal-contract.ts";
import { registerChannelSuitabilitySignal } from "../src/lib/traffic/channel-suitability-signal.ts";
import { registerPolicyRiskSignal } from "../src/lib/traffic/policy-risk-signal.ts";
import { registerAudienceFitSignal } from "../src/lib/traffic/audience-fit-signal.ts";
import { registerOfferStrategySignal } from "../src/lib/traffic/offer-strategy-signal.ts";
import { registerCreativeReadinessSignal } from "../src/lib/traffic/creative-readiness-signal.ts";
import { createTrafficExplanationEngine } from "../src/lib/traffic/traffic-explanation-engine.ts";
import { createTrafficManualEditor } from "../src/lib/traffic/traffic-manual-editor.ts";
import { createTrafficOverrideStore } from "../src/lib/traffic/traffic-override-store.ts";
import { createTrafficOverrideResolver } from "../src/lib/traffic/traffic-override-resolver.ts";
import { createTrafficOverrideValidator } from "../src/lib/traffic/traffic-override-validator.ts";
import { emptyTrafficEditorValues } from "../src/lib/traffic/traffic-effective-view.ts";
import { createTrafficLivePreview } from "../src/lib/traffic/traffic-live-preview.ts";
import { createTrafficPreviewResolver } from "../src/lib/traffic/traffic-preview-resolver.ts";
import { createTrafficVersionStore } from "../src/lib/traffic/traffic-version-store.ts";
import { createTrafficVersionValidator } from "../src/lib/traffic/traffic-version-validator.ts";
import { createTrafficCompare } from "../src/lib/traffic/traffic-compare.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value);
const zero = () => 0;

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const COMPLETED = (metadata: TrafficSignalOutput["metadata"]): TrafficSignalOutput => ({
  status: "COMPLETED",
  confidence: 0.8,
  metadata,
  warnings: [],
  errors: [],
});
function fake(id: string, over: { category: TrafficSignalModule["category"]; requires?: string[]; output?: TrafficSignalOutput }): TrafficSignalModule {
  const output = over.output ?? COMPLETED({ supportedChannels: "alpha-feed", unsupportedChannels: "gamma-feed" });
  return {
    id,
    name: `Signal ${id}`,
    version: "1.0.0",
    category: over.category,
    enabled: true,
    priority: 100,
    dependencies: { requires: over.requires ?? [], optional: [], conflicts: [] },
    supportsAnalysis: () => true,
    validate: () => [],
    analyze: () => ({ ...output, metadata: { ...output.metadata }, warnings: [...output.warnings], errors: [...output.errors] }),
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

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function timed<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}
async function timedAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}

async function main() {
  const validator = createTrafficValidator();
  const registry = createTrafficModuleRegistry();
  const alpha = fake("alpha", { category: "TRAFFIC_CHANNEL" });
  registry.register(alpha);
  let duplicateSignal = false;
  try {
    registry.register(alpha);
  } catch {
    duplicateSignal = true;
  }
  check("Duplicate Signal: a second registration is rejected", duplicateSignal && registry.count() === 1);

  const firstStrategy = DEFAULT_OFFER_STRATEGIES[0];
  check(
    "Duplicate Strategy: a repeated strategy id is rejected",
    has(validateOfferStrategies([firstStrategy, firstStrategy]), /Duplicate strategy/) && validateOfferStrategies([firstStrategy]).length === 0,
  );

  const overrideValidator = createTrafficOverrideValidator();
  const firstChannel = DEFAULT_CHANNEL_DEFINITIONS[0];
  check(
    "Duplicate Channel: a repeated channel id in definitions, in a preferred list, or across preferred and blocked is rejected",
    has(validateChannelDefinitions([firstChannel, firstChannel]), /Duplicate channel/) &&
      has(overrideValidator.validateField("preferredChannels", ["alpha-feed", "alpha-feed"]), /Duplicate channel/) &&
      has(overrideValidator.validateValues({ ...emptyTrafficEditorValues(), preferredChannels: ["alpha-feed"], blockedChannels: ["alpha-feed"] }), /Duplicate channel/),
  );

  const store = createTrafficOverrideStore();
  store.put({ analysisId: "a1", field: "priority", value: 3, updatedAt: "2026-01-02T00:00:01.000Z", operator: "ada" });
  store.put({ analysisId: "a1", field: "priority", value: 5, updatedAt: "2026-01-02T00:00:02.000Z", operator: "ada" });
  check(
    "Duplicate Override: a second write of the same field replaces the record, and an unknown field is rejected",
    store.list("a1").length === 1 && store.get("a1", "priority")?.value === 5 && has(overrideValidator.validatePatch({ score: 1 }), /Invalid override/),
  );

  check("Missing Candidate is rejected", has(validator.validateInput(createTrafficExecutionContext({ opportunityAnalysis: stubOpportunity() as never })), /Missing candidate/));
  check("Missing Opportunity Analysis is rejected", has(validator.validateOpportunityAnalysis(createTrafficExecutionContext({ candidate })), /Missing Opportunity analysis/));
  check("Missing Traffic Context is rejected", has(validator.validateInput(undefined), /Missing context/) && has(validator.validateInput(null), /Missing context/));

  const signals = createTrafficSignalPipeline({ now: zero });
  signals.register(fake("alpha", { category: "TRAFFIC_CHANNEL" }));
  const run = await createTrafficResolver({ signals, ...clocks() } as never).run(goodContext());
  const analysis = run.analysis;
  const analysisBefore = JSON.stringify(analysis);
  const explanation = createTrafficExplanationEngine({ now: () => 0 }).explain(analysis);
  check("the fixture analysis explains", explanation.status === "EXPLAINED" && explanation.explanation !== null);
  const editor = createTrafficManualEditor({ timestamp: () => "2026-01-02T00:00:01.000Z" }).open({ analysis, explanation: explanation.explanation, operator: "ada" });
  check("the editor opens", editor.status === "OPEN");
  editor.session!.edit("operatorNotes", "Keep the listing plain.");
  editor.session!.save();
  const view = editor.session!.view();

  const preview = createTrafficLivePreview();
  check("Missing Snapshot: preview without an analysis", has(preview.open(null).issues, /Missing snapshot/) && has(preview.open({ effectiveView: view }).issues, /Missing snapshot/));
  check("Missing Effective Layer: preview without an effective view", has(preview.open({ analysis }).issues, /Missing effective view/));
  check("Invalid Metadata: nested preview metadata", has(preview.open({ analysis, effectiveView: { ...view, overrides: { customMetadata: { a: { b: 1 } } }, overriddenFields: ["customMetadata"] } }).issues, /Invalid metadata|Invalid override/));

  const versions = createTrafficVersionStore({
    timestamp: () => "2026-01-02T00:00:03.000Z",
    idFactory: () => "ver-1",
  });
  const created = versions.createSnapshot({ view, operator: "ada" });
  check("a version snapshot is stored", created.status === "OK" && created.version !== null);
  check("Invalid Version: a duplicate id and a malformed id are rejected", has(versions.createSnapshot({ view, operator: "ada", versionId: "ver-1" }).issues, /Duplicate version ids/) && has(createTrafficVersionValidator().validateVersionId("Nope"), /Invalid restore|well-formed version id|Missing snapshot/));
  check("Invalid Restore: an unknown version is rejected", has(versions.restoreVersion("ver-missing", "ada").issues, /Invalid restore/));

  const cycleRegistry = createTrafficModuleRegistry();
  cycleRegistry.register(fake("a", { category: "TRAFFIC_CHANNEL", requires: ["b"] }));
  cycleRegistry.register(fake("b", { category: "POLICY", requires: ["a"] }));
  check("Circular Dependencies: a two-signal cycle is rejected", has(validateTrafficDependencies(cycleRegistry.list()), /Circular dependency/));

  const spyCounts = { analyze: 0 };
  const spy: TrafficSignalModule = {
    ...fake("spy", { category: "TRAFFIC_CHANNEL" }),
    analyze: () => {
      spyCounts.analyze += 1;
      return COMPLETED({ supportedChannels: "alpha-feed" });
    },
  };
  const spySignals = createTrafficSignalPipeline({ now: zero });
  spySignals.register(spy);
  const spyRun = await createTrafficResolver({ signals: spySignals, ...clocks() } as never).run(goodContext());
  const afterResolver = spyCounts.analyze;
  createTrafficExplanationEngine({ now: () => 0 }).explain(spyRun.analysis);
  const spyEditor = createTrafficManualEditor({ timestamp: () => "2026-01-02T00:00:04.000Z" }).open({ analysis: spyRun.analysis });
  spyEditor.session!.edit("operatorNotes", "note");
  spyEditor.session!.save();
  createTrafficLivePreview().open({ analysis: spyRun.analysis, effectiveView: spyEditor.session!.view() });
  const spyVersions = createTrafficVersionStore({ timestamp: () => "2026-01-02T00:00:05.000Z", idFactory: () => "ver-spy" });
  spyVersions.createSnapshot({ view: spyEditor.session!.view(), operator: "ada" });
  spyVersions.restoreVersion("ver-spy", "ada");
  check("Duplicate Execution: explaining, editing, previewing, and restoring do not run signals again", spyCounts.analyze === afterResolver && afterResolver === 1);
  check("each enabled signal was recorded exactly once on the resolver run", spyRun.executions.filter((e) => e.signalId === "spy").length === 1);

  check("Invalid Metadata: nested execution metadata is rejected by the resolver", has(validator.validateInput({ ...goodContext(), executionMetadata: { a: { b: 1 } } }), /Invalid metadata/));
  check("Invalid Version: a non-semantic signal version is rejected", has(validateTrafficSignalModule({ ...alpha, version: "v1" }), /semantic version/));

  const allTraffic = createTrafficSignalPipeline({ now: zero });
  const registerTimed = timed(() => {
    registerChannelSuitabilitySignal(allTraffic, { now: zero });
    registerPolicyRiskSignal(allTraffic, { now: zero });
    registerAudienceFitSignal(allTraffic, { now: zero });
    registerOfferStrategySignal(allTraffic, { now: zero });
    registerCreativeReadinessSignal(allTraffic, { now: zero });
  });
  const resolveTimed = timed(() => allTraffic.resolveExecutionOrder());
  const resolverTimed = await timedAsync(() => createTrafficResolver({ signals: allTraffic, ...clocks() } as never).run(goodContext()));
  const explainedTimed = timed(() => createTrafficExplanationEngine({ now: () => 0 }).explain(resolverTimed.value.analysis));
  const generated = emptyTrafficEditorValues();
  generated.preferredChannels = ["alpha-feed"];
  const overrideTimed = timed(() => createTrafficOverrideResolver().resolve(generated, { operatorNotes: "note", priority: 4 }));
  const previewResolver = createTrafficPreviewResolver();
  const previewTimed = timed(() => previewResolver.layer(view, "EFFECTIVE"));
  const liveTimed = timed(() => createTrafficLivePreview().open({ analysis, explanation: explanation.explanation, effectiveView: view }));
  const vStore = createTrafficVersionStore({
    timestamp: () => "2026-01-02T00:00:06.000Z",
    idFactory: (() => {
      let n = 0;
      return () => `ver-p${(n += 1)}`;
    })(),
  });
  const snapA = vStore.createSnapshot({ view, operator: "ada" });
  editor.session!.edit("priority", 9);
  editor.session!.save();
  const snapB = vStore.createSnapshot({ view: editor.session!.view(), operator: "ada" });
  const restoreTimed = timed(() => vStore.restoreVersion(snapA.version!.versionId, "ada"));
  const compareTimed = timed(() => createTrafficCompare().compare(snapA.version!, snapB.version!));
  const againCompare = createTrafficCompare().compare(snapA.version!, snapB.version!);

  const perfRows: Array<[string, number]> = [
    ["Signal Registration", registerTimed.ms],
    ["Signal Resolution", resolveTimed.ms],
    ["Traffic Resolver", resolverTimed.ms],
    ["Explanation Engine", explainedTimed.ms],
    ["Override Resolution", overrideTimed.ms],
    ["Preview Resolution", previewTimed.ms + liveTimed.ms],
    ["Version Restore", restoreTimed.ms],
    ["Version Compare", compareTimed.ms],
  ];
  for (const [name, ms] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check(`${name} completes in under 2000ms`, ms < 2000);
  }
  check("Version Compare is deterministic", stable(compareTimed.value) === stable(againCompare));
  check("Version Restore yields the source effective snapshot", restoreTimed.value.status === "OK" && stable(restoreTimed.value.version!.effectiveSnapshot) === stable(snapA.version!.effectiveSnapshot));
  check("the generated analysis is unchanged by the audit", JSON.stringify(analysis) === analysisBefore && isDeepFrozenTraffic(analysis));

  const dir = join(process.cwd(), "src/lib/traffic");
  const files = walk(dir).filter((f) => f.endsWith(".ts"));
  const joined = files.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("No Product Names in the Traffic engine", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("No Campaign IDs (numeric campaignId / campaigns table) in the Traffic engine", !bare.some((l) => /campaignId|campaigns\b|lp_page_versions/.test(l)));
  check("No Google Ads logic (API, bids, keywords, adwords)", !bare.some((l) => /googleads|adwords|\bcpc\b|\bcpa\b|\bbid\b|keyword planner|ads api/i.test(l)));
  check("No SEO logic (ranking, backlinks, keyword targeting)", !bare.some((l) => /backlink|keyword target|search ranking|serp\b/i.test(l)));
  check("No Marketplace logic (ClickBank hop, Amazon SP-API)", !bare.some((l) => /clickbank|sp-api|amazon marketplace|hop\.click/i.test(l)));
  check("No Hidden Switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("No ProductFacts import", !joined.includes("product-facts"));
  const valueImports = [...joined.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  check("No Opportunity or Discovery value imports (type-only references only)", !valueImports.some((from) => /opportunity|discovery/.test(from)));
  check("No HTTP, database, or file writes in the Traffic engine", !code.some((l) => /fetch\(|node:http|better-sqlite3|getDb|writeFile|appendFile|node:fs/.test(l)));

  const dbDir = join(process.cwd(), "data");
  const dbFiles = readdirSync(dbDir).filter((n) => n.startsWith("presell-os.db"));
  for (const name of dbFiles) {
    const info = statSync(join(dbDir, name));
    console.log(`DB: ${name} ${info.size} ${info.mtime.toISOString()}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTraffic RC1 acceptance: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
