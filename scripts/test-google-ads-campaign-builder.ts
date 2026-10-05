import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GOOGLE_ADS_CAMPAIGN_KEYS } from "../src/lib/providers/google-ads/google-ads-types.ts";
import { GOOGLE_ADS_CAMPAIGN_BUILD_STATUSES, createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { createGoogleAdsCampaignResolver } from "../src/lib/providers/google-ads/google-ads-campaign-resolver.ts";
import {
  GOOGLE_ADS_BUILT_CAMPAIGN_KEYS,
  GOOGLE_ADS_CAMPAIGN_MODEL_KEYS,
  GOOGLE_ADS_CAMPAIGN_SNAPSHOT_KEYS,
  createGoogleAdsCampaignSnapshot,
  freezeDeepGoogleAdsCampaign,
  type GoogleAdsCampaignSpec,
} from "../src/lib/providers/google-ads/google-ads-campaign-snapshot.ts";
import { computeGoogleAdsCampaignStatistics } from "../src/lib/providers/google-ads/google-ads-campaign-statistics.ts";
import { createGoogleAdsCampaignValidator } from "../src/lib/providers/google-ads/google-ads-campaign-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function specOf(id: string, over: Partial<GoogleAdsCampaignSpec> = {}): GoogleAdsCampaignSpec {
  return {
    id,
    name: over.name ?? "search",
    budgetId: over.budgetId ?? "b-1",
    settingsId: over.settingsId ?? "s-1",
    networkId: over.networkId ?? "net-1",
    locationIds: over.locationIds ?? ["loc-1"],
    languageIds: over.languageIds ?? ["lang-1"],
    scheduleId: over.scheduleId ?? "sch-1",
    bidStrategyId: over.bidStrategyId ?? "bs-1",
    metadata: over.metadata ?? { note: "x" },
    warnings: over.warnings ?? [],
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    campaigns: [specOf("c-1")],
    budgets: [{ id: "b-1", name: "daily", metadata: {} }],
    settings: [{ id: "s-1", campaignId: "c-1", metadata: {} }],
    networks: [{ id: "net-1", name: "search", metadata: {} }],
    locations: [{ id: "loc-1", name: "US", metadata: {} }],
    languages: [{ id: "lang-1", name: "en", metadata: {} }],
    schedules: [{ id: "sch-1", name: "all-day", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
    ...over,
  };
}

function builderOf() {
  let n = 0;
  return createGoogleAdsCampaignBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `model-${++n}`,
  });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(p));
    else if (name.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

async function main() {
  const validator = createGoogleAdsCampaignValidator();
  const resolver = createGoogleAdsCampaignResolver();
  check("build statuses are OK then REJECTED", GOOGLE_ADS_CAMPAIGN_BUILD_STATUSES.join() === "OK,REJECTED");
  check("snapshot keys are in the requested order", GOOGLE_ADS_CAMPAIGN_SNAPSHOT_KEYS.join() === "campaignModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,campaignIds,createdAt,metadata");
  check("built campaign keys name the campaign records", GOOGLE_ADS_BUILT_CAMPAIGN_KEYS.join() === "id,name,budget,settings,network,locations,languages,schedule,bidStrategy,metadata");
  check("campaign model keys are in the requested order", GOOGLE_ADS_CAMPAIGN_MODEL_KEYS.join() === "id,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,campaigns,warnings,metadata,executionTime,createdAt");
  check("architecture campaign keys remain id, name, budgetId, settingsId, metadata", GOOGLE_ADS_CAMPAIGN_KEYS.join() === "id,name,budgetId,settingsId,metadata");

  check("a well-formed campaign spec is accepted", validator.validateCampaign(specOf("c-1")).length === 0);
  check("Invalid Campaign: missing campaigns rejected", has(validator.validateInput({}), /campaigns are required/));
  check("Invalid Campaign: a non-object is rejected", has(validator.validateInput(null), /Invalid Campaign/));
  check("Duplicate Campaign: a second campaign id is rejected", has(validator.validateInput(inputOf({ campaigns: [specOf("c-1"), specOf("c-1")] })), /Duplicate Campaign/));
  check("Invalid Metadata: nested campaign metadata is rejected", has(validator.validateCampaign(specOf("c-1", { metadata: { a: { b: 1 } } as never })), /Invalid Metadata/));
  check("Invalid Metadata: nested context metadata is rejected", has(validator.validateInput(inputOf({ executionMetadata: { a: { b: 1 } } })), /Invalid Metadata/));
  check("Invalid Campaign: a well-formed campaign id is required", has(validator.validateCampaign(specOf("C-1")), /campaign id/));
  check("Invalid Settings: a missing campaign id is rejected", has(validator.validateSettings({ id: "s-1" }), /Invalid Settings/));
  check("a valid empty campaign list is accepted", validator.validateInput(inputOf({ campaigns: [] })).length === 0);

  const missingBudget = resolver.resolve({ campaigns: [specOf("c-1", { budgetId: "missing" })], budgets: [], settings: [{ id: "s-1", campaignId: "c-1" }], networks: [{ id: "net-1", name: "search" }], locations: [{ id: "loc-1", name: "US" }], languages: [{ id: "lang-1", name: "en" }], schedules: [{ id: "sch-1", name: "all-day" }], bidStrategies: [{ id: "bs-1", name: "manual" }] });
  check("Missing Budget is rejected by the resolver", missingBudget.campaigns.length === 0 && has(missingBudget.issues, /Missing Budget/));
  const missingBid = resolver.resolve({ campaigns: [specOf("c-1", { bidStrategyId: "missing" })], budgets: [{ id: "b-1", name: "daily" }], settings: [{ id: "s-1", campaignId: "c-1" }], networks: [{ id: "net-1", name: "search" }], locations: [{ id: "loc-1", name: "US" }], languages: [{ id: "lang-1", name: "en" }], schedules: [{ id: "sch-1", name: "all-day" }], bidStrategies: [] });
  check("Missing Bid Strategy is rejected by the resolver", missingBid.campaigns.length === 0 && has(missingBid.issues, /Missing Bid Strategy/));
  const badSettings = resolver.resolve({ campaigns: [specOf("c-1")], budgets: [{ id: "b-1", name: "daily" }], settings: [{ id: "s-1", campaignId: "other" }], networks: [{ id: "net-1", name: "search" }], locations: [{ id: "loc-1", name: "US" }], languages: [{ id: "lang-1", name: "en" }], schedules: [{ id: "sch-1", name: "all-day" }], bidStrategies: [{ id: "bs-1", name: "manual" }] });
  check("Invalid Settings is rejected by the resolver", badSettings.campaigns.length === 0 && has(badSettings.issues, /Invalid Settings/));
  check("Duplicate Campaign is rejected by the resolver", has(resolver.detectDuplicates([specOf("c-1"), specOf("c-1")]), /Duplicate Campaign/));
  const attached = resolver.resolve({
    campaigns: [specOf("c-2", { settingsId: "s-2" }), specOf("c-1")],
    budgets: [{ id: "b-1", name: "daily" }],
    settings: [
      { id: "s-1", campaignId: "c-1" },
      { id: "s-2", campaignId: "c-2" },
    ],
    networks: [{ id: "net-1", name: "search" }],
    locations: [{ id: "loc-1", name: "US" }],
    languages: [{ id: "lang-1", name: "en" }],
    schedules: [{ id: "sch-1", name: "all-day" }],
    bidStrategies: [{ id: "bs-1", name: "manual" }],
  });
  check("the resolver attaches records and lists campaigns by id", attached.issues.length === 0 && attached.campaigns.map((item) => item.spec.id).join() === "c-1,c-2" && attached.campaigns[0]?.budget?.id === "b-1");
  check("an empty campaign list has an empty resolution", resolver.resolve({ campaigns: [] }).campaigns.length === 0 && resolver.resolve({ campaigns: [] }).issues.length === 0);

  const snap = createGoogleAdsCampaignSnapshot({
    campaignModelId: "model-1",
    executionPlanId: "ep-1",
    executionContractIds: ["ec-1"],
    decisionAnalysisId: "d-1",
    workflowSnapshotId: "snap-1",
    campaignIds: ["c-1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_CAMPAIGN_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.campaignIds) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsCampaign never throws", freezeDeepGoogleAdsCampaign(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsCampaign({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const stats = computeGoogleAdsCampaignStatistics(
    [
      {
        id: "c-1",
        name: "search",
        budget: { id: "b-1", name: "daily", metadata: {} },
        settings: { id: "s-1", campaignId: "c-1", metadata: {} },
        network: { id: "net-1", name: "search", metadata: {} },
        locations: [{ id: "loc-1", name: "US", metadata: {} }],
        languages: [{ id: "lang-1", name: "en", metadata: {} }],
        schedule: { id: "sch-1", name: "all-day", metadata: {} },
        bidStrategy: { id: "bs-1", name: "manual", metadata: {} },
        metadata: {},
      },
    ],
    { warningCount: 2, contractCount: 1 },
  );
  check("Campaign Statistics count each named record", stats.campaignCount === 1 && stats.budgetCount === 1 && stats.locationCount === 1 && stats.warningCount === 2 && stats.contractCount === 1);

  const builder = builderOf();
  const built = builder.build(inputOf({ campaigns: [specOf("c-1", { warnings: ["restated"] })] }));
  check("the builder returns OK with a model, snapshot, statistics, warnings, metadata, and execution time", built.status === "OK" && built.model !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("the model carries campaign, budget, settings, network, locations, languages, schedule, and bid strategy", built.model!.campaigns[0]?.id === "c-1" && built.model!.campaigns[0]?.budget.id === "b-1" && built.model!.campaigns[0]?.settings.id === "s-1" && built.model!.campaigns[0]?.network.id === "net-1" && built.model!.campaigns[0]?.locations[0]?.id === "loc-1" && built.model!.campaigns[0]?.languages[0]?.id === "lang-1" && built.model!.campaigns[0]?.schedule.id === "sch-1" && built.model!.campaigns[0]?.bidStrategy.id === "bs-1");
  check("the model keeps execution, decision, and workflow as ids only", built.model!.id === "model-1" && built.model!.executionPlanId === "ep-1" && built.model!.executionContractIds.join() === "ec-1" && built.model!.decisionAnalysisId === "d-1" && built.model!.workflowSnapshotId === "snap-1" && built.model!.createdAt === "2026-01-01T00:00:00.000Z");
  check("the snapshot stores model, plan, contract, decision, and workflow ids", built.snapshot!.campaignModelId === "model-1" && built.snapshot!.executionPlanId === "ep-1" && built.snapshot!.campaignIds.join() === "c-1" && built.snapshot!.decisionAnalysisId === "d-1");
  check("warnings and metadata are restated on the result", built.warnings.join() === "restated" && built.metadata.run === "r1" && built.model!.warnings.join() === "restated");
  check("getSnapshot returns the stored snapshot", builder.getSnapshot("model-1") === built.snapshot && builder.getSnapshot("nope") === null);
  check("the model and snapshot are frozen", Object.isFrozen(built.model) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.model!.campaigns) && Object.isFrozen(built.statistics));
  check("validate agrees with a successful build", builder.validate(inputOf()).length === 0);
  check("a built campaign has exactly the requested fields", Object.keys(built.model!.campaigns[0] ?? {}).join() === GOOGLE_ADS_BUILT_CAMPAIGN_KEYS.join());
  check("a campaign model has exactly the requested fields", Object.keys(built.model!).join() === GOOGLE_ADS_CAMPAIGN_MODEL_KEYS.join());

  const empty = builderOf().build(inputOf({ campaigns: [] }));
  check("an empty campaign list builds an empty model", empty.status === "OK" && empty.model!.campaigns.length === 0 && empty.statistics!.campaignCount === 0);

  const duplicate = builderOf().build(inputOf({ campaigns: [specOf("c-1"), specOf("c-1")] }));
  check("Duplicate Campaign is refused and builds nothing", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Campaign/) && duplicate.model === null);
  const noBudget = builderOf().build(inputOf({ campaigns: [specOf("c-1", { budgetId: "missing" })] }));
  check("Missing Budget is refused", noBudget.status === "REJECTED" && has(noBudget.issues, /Missing Budget/));
  const noBid = builderOf().build(inputOf({ campaigns: [specOf("c-1", { bidStrategyId: "missing" })] }));
  check("Missing Bid Strategy is refused", noBid.status === "REJECTED" && has(noBid.issues, /Missing Bid Strategy/));
  const noSettings = builderOf().build(inputOf({ settings: [{ id: "s-1", campaignId: "other" }] }));
  check("Invalid Settings is refused", noSettings.status === "REJECTED" && has(noSettings.issues, /Invalid Settings/));
  const nestedMeta = builderOf().build(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nestedMeta.status === "REJECTED" && has(nestedMeta.issues, /Invalid Metadata/));
  const missingInput = builderOf().build(null);
  check("Invalid Campaign: a missing input is refused", missingInput.status === "REJECTED" && missingInput.model === null);
  check("a refused build stores no snapshot", builderOf().getSnapshot("model-1") === null);

  const source = inputOf();
  const once = builderOf().build(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.campaigns as GoogleAdsCampaignSpec[])[0].name = "changed";
  check("No mutation: changing the input after a build leaves the model unchanged", once.model!.metadata.run === "r1" && once.model!.campaigns[0]?.name === "search");
  try {
    (once.model!.campaigns[0] as { name: string }).name = "hacked";
    (once.snapshot!.campaignIds as unknown as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the built model and snapshot cannot be assigned into", once.model!.campaigns[0]?.name === "search" && once.snapshot!.campaignIds[0] === "c-1");

  const deterministic = () =>
    createGoogleAdsCampaignBuilder({
      now: () => 0,
      timestamp: () => "2026-01-01T00:00:00.000Z",
      idFactory: () => "model-fixed",
    });
  const first = deterministic().build(
    inputOf({
      campaigns: [specOf("c-2", { settingsId: "s-2" }), specOf("c-1")],
      settings: [
        { id: "s-1", campaignId: "c-1", metadata: {} },
        { id: "s-2", campaignId: "c-2", metadata: {} },
      ],
    }),
  );
  const second = deterministic().build(
    inputOf({
      campaigns: [specOf("c-1"), specOf("c-2", { settingsId: "s-2" })],
      settings: [
        { id: "s-2", campaignId: "c-2", metadata: {} },
        { id: "s-1", campaignId: "c-1", metadata: {} },
      ],
    }),
  );
  check("Deterministic campaign generation: the same records yield the same model and snapshot", first.status === "OK" && JSON.stringify(first.model) === JSON.stringify(second.model) && JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot));
  check("Deterministic campaign generation: input order does not change the assembled order", first.model!.campaigns.map((item) => item.id).join() === "c-1,c-2");

  const left = builderOf();
  const right = builderOf();
  left.build(inputOf());
  right.build(
    inputOf({
      campaigns: [specOf("c-1"), specOf("c-2", { settingsId: "s-2" })],
      settings: [
        { id: "s-1", campaignId: "c-1", metadata: {} },
        { id: "s-2", campaignId: "c-2", metadata: {} },
      ],
    }),
  );
  check("Independent builders do not share snapshots", left.getSnapshot("model-1")?.campaignIds.join() === "c-1" && right.getSnapshot("model-1")?.campaignIds.join() === "c-1,c-2" && left.getSnapshot("model-2") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-campaign-[a-z]+\.ts$/.test(f));
  check("five builder modules exist: builder, validator, resolver, snapshot, statistics", files.sort().join() === "google-ads-campaign-builder.ts,google-ads-campaign-resolver.ts,google-ads-campaign-snapshot.ts,google-ads-campaign-statistics.ts,google-ads-campaign-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, OAuth, token, or send path in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization|publish\(/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the builder", architecture.every((src) => !/google-ads-campaign-(builder|validator|resolver|snapshot|statistics)/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => {
    const name = f.replace(/\\/g, "/");
    return !name.includes("/providers/google-ads/") && !name.endsWith("/product-intelligence/product-analysis-runner.ts");
  });
  check("no other lib module imports the campaign builder", !others.some((f) => /google-ads-campaign-(builder|validator|resolver|snapshot|statistics)/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the campaign builder", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads campaign builder: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
