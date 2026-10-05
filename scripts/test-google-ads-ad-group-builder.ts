import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { GOOGLE_ADS_AD_GROUP_BUILD_STATUSES, createGoogleAdsAdGroupBuilder } from "../src/lib/providers/google-ads/google-ads-ad-group-builder.ts";
import { createGoogleAdsAdGroupResolver } from "../src/lib/providers/google-ads/google-ads-ad-group-resolver.ts";
import {
  GOOGLE_ADS_AD_GROUP_MODEL_KEYS,
  GOOGLE_ADS_AD_GROUP_SNAPSHOT_KEYS,
  GOOGLE_ADS_BUILT_AD_GROUP_KEYS,
  createGoogleAdsAdGroupSnapshot,
  freezeDeepGoogleAdsAdGroup,
  type GoogleAdsAdGroupSpec,
} from "../src/lib/providers/google-ads/google-ads-ad-group-snapshot.ts";
import { computeGoogleAdsAdGroupStatistics } from "../src/lib/providers/google-ads/google-ads-ad-group-statistics.ts";
import { createGoogleAdsAdGroupValidator } from "../src/lib/providers/google-ads/google-ads-ad-group-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function campaignRefOf() {
  return {
    id: "model-1",
    campaignIds: ["c-1"],
    campaigns: [{ id: "c-1", bidStrategy: { id: "bs-1", name: "manual", metadata: {} } }],
  };
}

function specOf(id: string, over: Partial<GoogleAdsAdGroupSpec> = {}): GoogleAdsAdGroupSpec {
  return {
    id,
    name: over.name ?? "core",
    campaignId: over.campaignId ?? "c-1",
    defaultBidId: over.defaultBidId ?? "db-1",
    bidStrategyId: over.bidStrategyId ?? "bs-1",
    targetCpaId: over.targetCpaId,
    targetRoasId: over.targetRoasId,
    keywordIds: over.keywordIds ?? ["k-1"],
    negativeKeywordIds: over.negativeKeywordIds ?? ["n-1"],
    audienceIds: over.audienceIds ?? ["aud-1"],
    deviceIds: over.deviceIds ?? ["dev-1"],
    metadata: over.metadata ?? { note: "x" },
    warnings: over.warnings ?? [],
  };
}

function catalogs() {
  return {
    defaultBids: [{ id: "db-1", name: "manual-default", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
    targetCpas: [{ id: "cpa-1", name: "purchase", metadata: {} }],
    targetRoas: [{ id: "roas-1", name: "value", metadata: {} }],
    keywords: [{ id: "k-1", adGroupId: "g-1", text: "alpha term", metadata: {} }],
    negativeKeywords: [{ id: "n-1", text: "beta term", metadata: {} }],
    audiences: [{ id: "aud-1", name: "in-market", metadata: {} }],
    devices: [{ id: "dev-1", name: "mobile", metadata: {} }],
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    campaignModel: campaignRefOf(),
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    adGroups: [specOf("g-1")],
    ...catalogs(),
    ...over,
  };
}

function builderOf() {
  let n = 0;
  return createGoogleAdsAdGroupBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `adgroup-${++n}`,
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
  const validator = createGoogleAdsAdGroupValidator();
  const resolver = createGoogleAdsAdGroupResolver();
  check("build statuses are OK then REJECTED", GOOGLE_ADS_AD_GROUP_BUILD_STATUSES.join() === "OK,REJECTED");
  check("snapshot keys are in the requested order", GOOGLE_ADS_AD_GROUP_SNAPSHOT_KEYS.join() === "adGroupModelId,campaignModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,adGroupIds,createdAt,metadata");
  check("built ad group keys name the ad group records", GOOGLE_ADS_BUILT_AD_GROUP_KEYS.join() === "id,name,campaignId,defaultBid,targetCpa,targetRoas,keywords,negativeKeywords,audiences,devices,bidStrategy,metadata");
  check("ad group model keys are in the requested order", GOOGLE_ADS_AD_GROUP_MODEL_KEYS.join() === "id,campaignModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,adGroups,warnings,metadata,executionTime,createdAt");

  check("a well-formed ad group spec is accepted", validator.validateAdGroup(specOf("g-1")).length === 0);
  check("Duplicate Ad Group: missing ad groups rejected", has(validator.validateInput({ campaignModel: campaignRefOf() }), /ad groups are required/));
  check("Duplicate Ad Group: a non-object is rejected", has(validator.validateInput(null), /Duplicate Ad Group/));
  check("Duplicate Ad Group: a second ad group id is rejected", has(validator.validateInput(inputOf({ adGroups: [specOf("g-1"), specOf("g-1")] })), /Duplicate Ad Group/));
  check("Missing Name: an empty name is rejected", has(validator.validateAdGroup(specOf("g-1", { name: "" })), /Missing Name/));
  check("Missing Name: a missing name is rejected", has(validator.validateAdGroup({ id: "g-1", campaignId: "c-1", defaultBidId: "db-1" }), /Missing Name/));
  check("Invalid Metadata: nested ad group metadata is rejected", has(validator.validateAdGroup(specOf("g-1", { metadata: { a: { b: 1 } } as never })), /Invalid Metadata/));
  check("Invalid Metadata: nested context metadata is rejected", has(validator.validateInput(inputOf({ executionMetadata: { a: { b: 1 } } })), /Invalid Metadata/));
  check("Duplicate Keyword: a second keyword id is rejected", has(validator.validateKeywordGraph(["k-1", "k-1"]), /Duplicate Keyword/));
  check("a valid empty ad group list is accepted", validator.validateInput(inputOf({ adGroups: [] })).length === 0);

  const catalogsOnly = catalogs();
  const missingBid = resolver.resolve({ campaignModel: campaignRefOf(), adGroups: [specOf("g-1", { defaultBidId: "missing" })], ...catalogsOnly });
  check("Invalid Bid Strategy is rejected by the resolver", missingBid.adGroups.length === 0 && has(missingBid.issues, /Invalid Bid Strategy/));
  const duplicateKeyword = resolver.resolve({
    campaignModel: campaignRefOf(),
    adGroups: [specOf("g-1")],
    ...catalogsOnly,
    keywords: [
      { id: "k-1", adGroupId: "g-1", text: "alpha term" },
      { id: "k-1", adGroupId: "g-1", text: "alpha term" },
    ],
  });
  check("Duplicate Keyword is rejected by the resolver", duplicateKeyword.adGroups.length === 0 && has(duplicateKeyword.issues, /Duplicate Keyword/));
  check("Duplicate Ad Group is rejected by the resolver", has(resolver.detectDuplicates([specOf("g-1"), specOf("g-1")]), /Duplicate Ad Group/));
  const attached = resolver.resolve({
    campaignModel: campaignRefOf(),
    adGroups: [specOf("g-2", { keywordIds: [], negativeKeywordIds: [], audienceIds: [], deviceIds: [] }), specOf("g-1")],
    ...catalogsOnly,
    keywords: [
      { id: "k-1", adGroupId: "g-1", text: "alpha term" },
      { id: "k-2", adGroupId: "g-2", text: "gamma term" },
    ],
  });
  check("the resolver attaches records and lists ad groups by id", attached.issues.length === 0 && attached.adGroups.map((item) => item.spec.id).join() === "g-1,g-2" && attached.adGroups[0]?.defaultBid?.id === "db-1");
  check("an empty ad group list has an empty resolution", resolver.resolve({ campaignModel: campaignRefOf(), adGroups: [] }).adGroups.length === 0 && resolver.resolve({ campaignModel: campaignRefOf(), adGroups: [] }).issues.length === 0);

  const snap = createGoogleAdsAdGroupSnapshot({
    adGroupModelId: "adgroup-1",
    campaignModelId: "model-1",
    executionPlanId: "ep-1",
    executionContractIds: ["ec-1"],
    decisionAnalysisId: "d-1",
    workflowSnapshotId: "snap-1",
    adGroupIds: ["g-1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_AD_GROUP_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.adGroupIds) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsAdGroup never throws", freezeDeepGoogleAdsAdGroup(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsAdGroup({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const stats = computeGoogleAdsAdGroupStatistics(
    [
      {
        id: "g-1",
        name: "core",
        campaignId: "c-1",
        defaultBid: { id: "db-1", name: "manual-default", metadata: {} },
        targetCpa: { id: "cpa-1", name: "purchase", metadata: {} },
        targetRoas: null,
        keywords: [{ id: "k-1", adGroupId: "g-1", text: "alpha term", metadata: {} }],
        negativeKeywords: [{ id: "n-1", text: "beta term", metadata: {} }],
        audiences: [{ id: "aud-1", name: "in-market", metadata: {} }],
        devices: [{ id: "dev-1", name: "mobile", metadata: {} }],
        bidStrategy: { id: "bs-1", name: "manual", metadata: {} },
        metadata: {},
      },
    ],
    { warningCount: 1, contractCount: 1 },
  );
  check("Ad Group Statistics count each named record", stats.adGroupCount === 1 && stats.keywordCount === 1 && stats.targetCpaCount === 1 && stats.targetRoasCount === 0 && stats.warningCount === 1);

  const builder = builderOf();
  const built = builder.build(inputOf({ adGroups: [specOf("g-1", { targetCpaId: "cpa-1", targetRoasId: "roas-1", warnings: ["restated"] })] }));
  check("the builder returns OK with a model, snapshot, statistics, warnings, and execution time", built.status === "OK" && built.model !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("the model carries ad group, default bid, optional targets, keywords, negatives, audience, and devices", built.model!.adGroups[0]?.id === "g-1" && built.model!.adGroups[0]?.defaultBid.id === "db-1" && built.model!.adGroups[0]?.targetCpa?.id === "cpa-1" && built.model!.adGroups[0]?.targetRoas?.id === "roas-1" && built.model!.adGroups[0]?.keywords[0]?.id === "k-1" && built.model!.adGroups[0]?.negativeKeywords[0]?.id === "n-1" && built.model!.adGroups[0]?.audiences[0]?.id === "aud-1" && built.model!.adGroups[0]?.devices[0]?.id === "dev-1");
  check("optional targets may be omitted", builderOf().build(inputOf()).model!.adGroups[0]?.targetCpa === null && builderOf().build(inputOf()).model!.adGroups[0]?.targetRoas === null);
  check("the model keeps campaign, execution, decision, and workflow as ids only", built.model!.id === "adgroup-1" && built.model!.campaignModelId === "model-1" && built.model!.executionPlanId === "ep-1" && built.model!.executionContractIds.join() === "ec-1" && built.model!.decisionAnalysisId === "d-1" && built.model!.workflowSnapshotId === "snap-1");
  check("the snapshot stores model, campaign, plan, and ad group ids", built.snapshot!.adGroupModelId === "adgroup-1" && built.snapshot!.campaignModelId === "model-1" && built.snapshot!.adGroupIds.join() === "g-1");
  check("warnings and metadata are restated on the result", built.warnings.join() === "restated" && built.metadata.run === "r1");
  check("getSnapshot returns the stored snapshot", builder.getSnapshot("adgroup-1") === built.snapshot && builder.getSnapshot("nope") === null);
  check("the model and snapshot are frozen", Object.isFrozen(built.model) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.model!.adGroups) && Object.isFrozen(built.statistics));
  check("validate agrees with a successful build", builder.validate(inputOf()).length === 0);
  check("a built ad group has exactly the requested fields", Object.keys(built.model!.adGroups[0] ?? {}).join() === GOOGLE_ADS_BUILT_AD_GROUP_KEYS.join());
  check("an ad group model has exactly the requested fields", Object.keys(built.model!).join() === GOOGLE_ADS_AD_GROUP_MODEL_KEYS.join());

  const empty = builderOf().build(inputOf({ adGroups: [] }));
  check("an empty ad group list builds an empty model", empty.status === "OK" && empty.model!.adGroups.length === 0 && empty.statistics!.adGroupCount === 0);

  const duplicate = builderOf().build(inputOf({ adGroups: [specOf("g-1"), specOf("g-1")] }));
  check("Duplicate Ad Group is refused and builds nothing", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Ad Group/) && duplicate.model === null);
  const noName = builderOf().build(inputOf({ adGroups: [specOf("g-1", { name: " " })] }));
  check("Missing Name is refused", noName.status === "REJECTED" && has(noName.issues, /Missing Name/));
  const dupKeyword = builderOf().build(inputOf({ adGroups: [specOf("g-1", { keywordIds: ["k-1", "k-1"] })] }));
  check("Duplicate Keyword is refused", dupKeyword.status === "REJECTED" && has(dupKeyword.issues, /Duplicate Keyword/));
  const noBid = builderOf().build(inputOf({ adGroups: [specOf("g-1", { defaultBidId: "missing" })] }));
  check("Invalid Bid Strategy is refused", noBid.status === "REJECTED" && has(noBid.issues, /Invalid Bid Strategy/));
  const nestedMeta = builderOf().build(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nestedMeta.status === "REJECTED" && has(nestedMeta.issues, /Invalid Metadata/));
  const missingInput = builderOf().build(null);
  check("Duplicate Ad Group: a missing input is refused", missingInput.status === "REJECTED" && missingInput.model === null);
  check("a refused build stores no snapshot", builderOf().getSnapshot("adgroup-1") === null);

  const source = inputOf();
  const once = builderOf().build(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.adGroups as GoogleAdsAdGroupSpec[])[0].name = "changed";
  check("No mutation: changing the input after a build leaves the model unchanged", once.model!.metadata.run === "r1" && once.model!.adGroups[0]?.name === "core");
  try {
    (once.model!.adGroups[0] as { name: string }).name = "hacked";
    (once.snapshot!.adGroupIds as unknown as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the built model and snapshot cannot be assigned into", once.model!.adGroups[0]?.name === "core" && once.snapshot!.adGroupIds[0] === "g-1");

  const campaignBuilt = createGoogleAdsCampaignBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "model-1",
  }).build({
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    campaigns: [
      {
        id: "c-1",
        name: "search",
        budgetId: "b-1",
        settingsId: "s-1",
        networkId: "net-1",
        locationIds: ["loc-1"],
        languageIds: ["lang-1"],
        scheduleId: "sch-1",
        bidStrategyId: "bs-1",
        metadata: {},
      },
    ],
    budgets: [{ id: "b-1", name: "daily", metadata: {} }],
    settings: [{ id: "s-1", campaignId: "c-1", metadata: {} }],
    networks: [{ id: "net-1", name: "search", metadata: {} }],
    locations: [{ id: "loc-1", name: "US", metadata: {} }],
    languages: [{ id: "lang-1", name: "en", metadata: {} }],
    schedules: [{ id: "sch-1", name: "all-day", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
  });
  check("campaign builder still returns an immutable campaign model", campaignBuilt.status === "OK" && campaignBuilt.model !== null && Object.isFrozen(campaignBuilt.model));
  const campaignBefore = JSON.stringify(campaignBuilt.model);
  const fromCampaign = builderOf().build(inputOf({ campaignModel: campaignBuilt.model! }));
  try {
    (campaignBuilt.model!.campaigns[0] as { name: string }).name = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable campaign: the campaign model is unchanged after an ad group build", fromCampaign.status === "OK" && fromCampaign.model!.campaignModelId === "model-1" && fromCampaign.model!.adGroups[0]?.campaignId === "c-1" && JSON.stringify(campaignBuilt.model) === campaignBefore && campaignBuilt.model!.campaigns[0]?.name === "search");

  const deterministic = () =>
    createGoogleAdsAdGroupBuilder({
      now: () => 0,
      timestamp: () => "2026-01-01T00:00:00.000Z",
      idFactory: () => "adgroup-fixed",
    });
  const first = deterministic().build(
    inputOf({
      adGroups: [specOf("g-2", { keywordIds: [], negativeKeywordIds: [], audienceIds: [], deviceIds: [] }), specOf("g-1")],
    }),
  );
  const second = deterministic().build(
    inputOf({
      adGroups: [specOf("g-1"), specOf("g-2", { keywordIds: [], negativeKeywordIds: [], audienceIds: [], deviceIds: [] })],
    }),
  );
  check("Deterministic ad group generation: the same records yield the same model and snapshot", first.status === "OK" && JSON.stringify(first.model) === JSON.stringify(second.model) && JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot));
  check("Deterministic ad group generation: input order does not change the assembled order", first.model!.adGroups.map((item) => item.id).join() === "g-1,g-2");

  const left = builderOf();
  const right = builderOf();
  left.build(inputOf());
  right.build(inputOf({ adGroups: [specOf("g-1"), specOf("g-2", { keywordIds: [], negativeKeywordIds: [], audienceIds: [], deviceIds: [] })] }));
  check("Independent builders do not share snapshots", left.getSnapshot("adgroup-1")?.adGroupIds.join() === "g-1" && right.getSnapshot("adgroup-1")?.adGroupIds.join() === "g-1,g-2" && left.getSnapshot("adgroup-2") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-ad-group-[a-z]+\.ts$/.test(f));
  check("five builder modules exist: builder, validator, resolver, snapshot, statistics", files.sort().join() === "google-ads-ad-group-builder.ts,google-ads-ad-group-resolver.ts,google-ads-ad-group-snapshot.ts,google-ads-ad-group-statistics.ts,google-ads-ad-group-validator.ts");
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
  check("the architecture modules are unchanged in shape and do not import the ad group builder", architecture.every((src) => !/google-ads-ad-group-(builder|validator|resolver|snapshot|statistics)/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const campaignFiles = readdirSync(dir).filter((f) => /^google-ads-campaign-[a-z]+\.ts$/.test(f));
  check("the campaign builder does not import the ad group builder", campaignFiles.every((f) => !/google-ads-ad-group-(builder|validator|resolver|snapshot|statistics)/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports the ad group builder", !others.some((f) => /google-ads-ad-group-(builder|validator|resolver|snapshot|statistics)/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the ad group builder", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads ad group builder: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
