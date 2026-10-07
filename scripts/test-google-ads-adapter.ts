import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { createGoogleAdsAdGroupBuilder } from "../src/lib/providers/google-ads/google-ads-ad-group-builder.ts";
import { createGoogleAdsRsaBuilder } from "../src/lib/providers/google-ads/google-ads-rsa-builder.ts";
import { GOOGLE_ADS_ADAPTER_STATUSES, createGoogleAdsAdapter } from "../src/lib/providers/google-ads/google-ads-adapter.ts";
import { createGoogleAdsMapper } from "../src/lib/providers/google-ads/google-ads-adapter-mapper.ts";
import { createGoogleAdsRequestBuilder } from "../src/lib/providers/google-ads/google-ads-adapter-request.ts";
import { createGoogleAdsValidationAdapter } from "../src/lib/providers/google-ads/google-ads-adapter-validator.ts";
import {
  GOOGLE_ADS_ADAPTER_CAPABILITIES,
  GOOGLE_ADS_ADAPTER_SNAPSHOT_KEYS,
  GOOGLE_ADS_REQUEST_PAYLOAD_KEYS,
  createGoogleAdsAdapterSnapshot,
  freezeDeepGoogleAdsAdapter,
} from "../src/lib/providers/google-ads/google-ads-adapter-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function campaignOf(over: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    name: "search",
    budget: { id: "b-1", name: "daily", metadata: {} },
    settings: { id: "s-1", campaignId: "c-1", metadata: {} },
    metadata: {},
    ...over,
  };
}

function adGroupOf(over: Record<string, unknown> = {}) {
  return {
    id: "g-1",
    name: "core",
    campaignId: "c-1",
    keywords: [{ id: "k-1", text: "alpha term", metadata: {} }],
    metadata: {},
    ...over,
  };
}

function rsaOf(over: Record<string, unknown> = {}) {
  return {
    id: "rsa-1",
    adGroupId: "g-1",
    headlines: [
      { id: "h-1", text: "line one", metadata: {} },
      { id: "h-2", text: "line two", metadata: {} },
    ],
    descriptions: [{ id: "d-1", text: "body one", metadata: {} }],
    finalUrl: { id: "u-1", url: "https://example.test/offer", metadata: {} },
    trackingTemplate: { id: "t-1", text: "{lpurl}?src=host", metadata: {} },
    metadata: {},
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    campaignModel: { id: "model-1", campaigns: [campaignOf()], metadata: {} },
    adGroupModel: { id: "adgroup-1", adGroups: [adGroupOf()], metadata: {} },
    responsiveSearchAds: { id: "rsamodel-1", responsiveSearchAds: [rsaOf()] },
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    ...over,
  };
}

function adapterOf() {
  let n = 0;
  return createGoogleAdsAdapter({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `payload-${++n}`,
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
  const validator = createGoogleAdsValidationAdapter();
  const mapper = createGoogleAdsMapper();
  const requestBuilder = createGoogleAdsRequestBuilder();
  check("adapter statuses are OK then REJECTED", GOOGLE_ADS_ADAPTER_STATUSES.join() === "OK,REJECTED");
  check("capabilities are MAP, VALIDATE, BUILD, FREEZE, SNAPSHOT", GOOGLE_ADS_ADAPTER_CAPABILITIES.join() === "MAP,VALIDATE,BUILD,FREEZE,SNAPSHOT");
  check("payload keys are in the requested order", GOOGLE_ADS_REQUEST_PAYLOAD_KEYS.join() === "id,campaignModelId,adGroupModelId,rsaModelId,executionPlanId,executionContractIds,campaignRequests,campaignBudgetRequests,campaignSettingsRequests,adGroupRequests,keywordRequests,responsiveSearchAdRequests,trackingRequests,metadata,executionTime,createdAt");
  check("snapshot keys are in the requested order", GOOGLE_ADS_ADAPTER_SNAPSHOT_KEYS.join() === "payloadId,campaignModelId,adGroupModelId,rsaModelId,executionPlanId,resourceIds,createdAt,metadata");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Invalid Mapping: a non-object is rejected", has(validator.validateInput(null), /Invalid Mapping/));
  check("Invalid Mapping: a missing campaign model is rejected", has(validator.validateInput({}), /Invalid Mapping/));
  check("Missing Required Fields: a campaign without a name is rejected", has(mapper.map({ campaignModel: { id: "model-1", campaigns: [campaignOf({ name: "" })] } }).issues, /Missing Required Fields/));
  check("Unsupported Capability: a send token is rejected", has(validator.validateCapabilities(inputOf({ configuration: { capability: "SEND" } })), /Unsupported Capability/));
  check("Unsupported Capability: a publish token is rejected", has(validator.validateCapabilities(inputOf({ configuration: { capability: "PUBLISH" } })), /Unsupported Capability/));
  check("a listed capability is accepted", validator.validateCapabilities(inputOf({ configuration: { capability: "MAP" } })).length === 0);
  check("Duplicate Resources: a second campaign id is rejected", has(validator.validateMapping({ campaignRequests: [{ resource: "campaign", id: "c-1", name: "search", budgetId: "b-1", settingsId: "s-1", metadata: {} }, { resource: "campaign", id: "c-1", name: "other", budgetId: "b-2", settingsId: "s-2", metadata: {} }] }), /Duplicate Resources/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Mapping: an ad group that names a missing campaign is rejected", has(mapper.map({ campaignModel: { id: "model-1", campaigns: [campaignOf()] }, adGroupModel: { id: "adgroup-1", adGroups: [adGroupOf({ campaignId: "missing" })] } }).issues, /Invalid Mapping/));

  const mapped = mapper.map({
    campaignModel: { id: "model-1", campaigns: [campaignOf()] },
    adGroupModel: { id: "adgroup-1", adGroups: [adGroupOf()] },
    responsiveSearchAds: { id: "rsamodel-1", responsiveSearchAds: [rsaOf()] },
  });
  check("the mapper emits campaign, budget, settings, ad group, keyword, RSA, and tracking requests", mapped.issues.length === 0 && mapped.mapping.campaignRequests[0]?.id === "c-1" && mapped.mapping.campaignBudgetRequests[0]?.id === "b-1" && mapped.mapping.campaignSettingsRequests[0]?.id === "s-1" && mapped.mapping.adGroupRequests[0]?.id === "g-1" && mapped.mapping.keywordRequests[0]?.text === "alpha term" && mapped.mapping.responsiveSearchAdRequests[0]?.headlines.join() === "line one,line two" && mapped.mapping.trackingRequests[0]?.text === "{lpurl}?src=host");

  const payload = requestBuilder.build({
    id: "payload-1",
    campaignModelId: "model-1",
    adGroupModelId: "adgroup-1",
    rsaModelId: "rsamodel-1",
    executionPlanId: "ep-1",
    executionContractIds: ["ec-1"],
    mapping: mapped.mapping,
    metadata: { run: "r1" },
    executionTime: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  check("the request builder assembles a frozen payload", payload.id === "payload-1" && payload.campaignRequests.length === 1 && Object.isFrozen(payload) && Object.isFrozen(payload.campaignRequests));
  check("a payload has exactly the requested fields", Object.keys(payload).join() === GOOGLE_ADS_REQUEST_PAYLOAD_KEYS.join());
  check("a well-formed payload validates", validator.validatePayload(payload).length === 0);

  const snap = createGoogleAdsAdapterSnapshot({
    payloadId: "payload-1",
    campaignModelId: "model-1",
    adGroupModelId: "adgroup-1",
    rsaModelId: "rsamodel-1",
    executionPlanId: "ep-1",
    resourceIds: ["c-1", "b-1", "s-1", "g-1", "k-1", "rsa-1", "t-1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_ADAPTER_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.resourceIds) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsAdapter never throws", freezeDeepGoogleAdsAdapter(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsAdapter({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const adapter = adapterOf();
  const built = adapter.adapt(inputOf());
  check("the adapter returns OK with a payload, snapshot, metadata, and execution time", built.status === "OK" && built.payload !== null && built.snapshot !== null && built.executionTime === 0 && built.issues.length === 0);
  check("the payload carries campaign, budget, settings, ad group, keyword, RSA, and tracking requests", built.payload!.campaignRequests[0]?.name === "search" && built.payload!.campaignBudgetRequests[0]?.id === "b-1" && built.payload!.campaignSettingsRequests[0]?.campaignId === "c-1" && built.payload!.adGroupRequests[0]?.name === "core" && built.payload!.keywordRequests[0]?.id === "k-1" && built.payload!.responsiveSearchAdRequests[0]?.finalUrl === "https://example.test/offer" && built.payload!.trackingRequests[0]?.rsaId === "rsa-1");
  check("the payload keeps campaign, ad group, RSA, execution plan, and contracts as ids only", built.payload!.id === "payload-1" && built.payload!.campaignModelId === "model-1" && built.payload!.adGroupModelId === "adgroup-1" && built.payload!.rsaModelId === "rsamodel-1" && built.payload!.executionPlanId === "ep-1" && built.payload!.executionContractIds.join() === "ec-1");
  check("the snapshot stores payload, campaign, ad group, RSA, and plan ids", built.snapshot!.payloadId === "payload-1" && built.snapshot!.campaignModelId === "model-1" && built.snapshot!.adGroupModelId === "adgroup-1" && built.snapshot!.rsaModelId === "rsamodel-1" && built.snapshot!.executionPlanId === "ep-1");
  check("getSnapshot returns the stored snapshot", adapter.getSnapshot("payload-1") === built.snapshot && adapter.getSnapshot("nope") === null);
  check("the payload and snapshot are frozen", Object.isFrozen(built.payload) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.payload!.campaignRequests) && Object.isFrozen(built.payload!.metadata));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const empty = adapterOf().adapt(inputOf({ campaignModel: { id: "model-1", campaigns: [] }, adGroupModel: { id: "adgroup-1", adGroups: [] }, responsiveSearchAds: { id: "rsamodel-1", responsiveSearchAds: [] } }));
  check("an empty model list builds an empty payload", empty.status === "OK" && empty.payload!.campaignRequests.length === 0 && empty.payload!.keywordRequests.length === 0 && empty.payload!.responsiveSearchAdRequests.length === 0);

  const missing = adapterOf().adapt(null);
  check("Invalid Mapping: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Mapping/) && missing.payload === null);
  const noName = adapterOf().adapt(inputOf({ campaignModel: { id: "model-1", campaigns: [campaignOf({ name: "" })] } }));
  check("Missing Required Fields is refused", noName.status === "REJECTED" && has(noName.issues, /Missing Required Fields/) && noName.payload === null);
  const unsupported = adapterOf().adapt(inputOf({ configuration: { capability: "SEND" } }));
  check("Unsupported Capability is refused", unsupported.status === "REJECTED" && has(unsupported.issues, /Unsupported Capability/));
  const dup = adapterOf().adapt(inputOf({ campaignModel: { id: "model-1", campaigns: [campaignOf(), campaignOf()] } }));
  check("Duplicate Resources is refused", dup.status === "REJECTED" && has(dup.issues, /Duplicate Resources/));
  const nested = adapterOf().adapt(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  const badMap = adapterOf().adapt(inputOf({ adGroupModel: { id: "adgroup-1", adGroups: [adGroupOf({ campaignId: "missing" })] } }));
  check("Invalid Mapping: an unknown campaign reference is refused", badMap.status === "REJECTED" && has(badMap.issues, /Invalid Mapping/));
  check("a refused adapt stores no snapshot", adapterOf().getSnapshot("payload-1") === null);

  const source = inputOf();
  const once = adapterOf().adapt(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.campaignModel as { id: string }).id = "changed";
  check("No mutation: changing the input after adapt leaves the payload unchanged", once.payload!.metadata.run === "r1" && once.snapshot!.campaignModelId === "model-1");
  try {
    (once.payload!.campaignRequests[0] as { name: string }).name = "hacked";
    (once.snapshot!.resourceIds as unknown as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable payloads: the payload and snapshot cannot be assigned into", once.payload!.campaignRequests[0]?.name === "search" && once.snapshot!.resourceIds[0] === "c-1");

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
    campaigns: [{ id: "c-1", name: "search", budgetId: "b-1", settingsId: "s-1", networkId: "net-1", locationIds: ["loc-1"], languageIds: ["lang-1"], scheduleId: "sch-1", bidStrategyId: "bs-1", metadata: {} }],
    budgets: [{ id: "b-1", name: "daily", metadata: {} }],
    settings: [{ id: "s-1", campaignId: "c-1", metadata: {} }],
    networks: [{ id: "net-1", name: "search", metadata: {} }],
    locations: [{ id: "loc-1", name: "US", metadata: {} }],
    languages: [{ id: "lang-1", name: "en", metadata: {} }],
    schedules: [{ id: "sch-1", name: "all-day", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
  });
  const adGroupBuilt = createGoogleAdsAdGroupBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "adgroup-1",
  }).build({
    campaignModel: campaignBuilt.model!,
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    adGroups: [{ id: "g-1", name: "core", campaignId: "c-1", defaultBidId: "db-1", bidStrategyId: "bs-1", keywordIds: ["k-1"], negativeKeywordIds: [], audienceIds: [], deviceIds: [], metadata: {} }],
    defaultBids: [{ id: "db-1", name: "manual-default", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
    keywords: [{ id: "k-1", adGroupId: "g-1", text: "alpha term", metadata: {} }],
  });
  const rsaBuilt = createGoogleAdsRsaBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "rsamodel-1",
  }).build({
    campaignModel: campaignBuilt.model!,
    adGroupModel: adGroupBuilt.model!,
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    responsiveSearchAds: [{ id: "rsa-1", adGroupId: "g-1", headlineIds: ["h-1", "h-2"], descriptionIds: ["d-1"], finalUrlId: "u-1", displayPathId: "p-1", trackingTemplateId: "t-1", urlSuffixId: "suf-1", pinnedAssetIds: ["pin-1"], metadata: {} }],
    headlines: [
      { id: "h-1", text: "line one", metadata: {} },
      { id: "h-2", text: "line two", metadata: {} },
    ],
    descriptions: [{ id: "d-1", text: "body one", metadata: {} }],
    finalUrls: [{ id: "u-1", url: "https://example.test/offer", metadata: {} }],
    displayPaths: [{ id: "p-1", text: "offer", metadata: {} }],
    trackingTemplates: [{ id: "t-1", text: "{lpurl}?src=host", metadata: {} }],
    urlSuffixes: [{ id: "suf-1", text: "utm=host", metadata: {} }],
    pinnedAssets: [{ id: "pin-1", name: "headline-pin", metadata: {} }],
  });
  check("prior builders still return immutable models", campaignBuilt.status === "OK" && adGroupBuilt.status === "OK" && rsaBuilt.status === "OK");
  const campaignBefore = JSON.stringify(campaignBuilt.model);
  const adGroupBefore = JSON.stringify(adGroupBuilt.model);
  const rsaBefore = JSON.stringify(rsaBuilt.model);
  const fromPrior = adapterOf().adapt({
    campaignModel: campaignBuilt.model!,
    adGroupModel: adGroupBuilt.model!,
    responsiveSearchAds: rsaBuilt.model!,
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    executionMetadata: { run: "r1" },
  });
  try {
    (campaignBuilt.model!.campaigns[0] as { name: string }).name = "hacked";
    (adGroupBuilt.model!.adGroups[0] as { name: string }).name = "hacked";
    (rsaBuilt.model!.responsiveSearchAds[0] as { adGroupId: string }).adGroupId = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable campaign, ad groups, and RSAs: prior models are unchanged after adapt", fromPrior.status === "OK" && fromPrior.payload!.campaignRequests[0]?.name === "search" && fromPrior.payload!.keywordRequests[0]?.text === "alpha term" && fromPrior.payload!.responsiveSearchAdRequests[0]?.finalUrl === "https://example.test/offer" && JSON.stringify(campaignBuilt.model) === campaignBefore && JSON.stringify(adGroupBuilt.model) === adGroupBefore && JSON.stringify(rsaBuilt.model) === rsaBefore);

  const left = adapterOf();
  const right = adapterOf();
  left.adapt(inputOf());
  right.adapt(null);
  check("Independent adapters do not share snapshots", left.getSnapshot("payload-1")?.campaignModelId === "model-1" && right.getSnapshot("payload-1") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-adapter(-[a-z]+)?\.ts$/.test(f));
  check("five adapter modules exist: adapter, mapper, request, snapshot, validator", files.sort().join() === "google-ads-adapter-mapper.ts,google-ads-adapter-request.ts,google-ads-adapter-snapshot.ts,google-ads-adapter-validator.ts,google-ads-adapter.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, OAuth, token, send, or retry path in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization|publish\(|upload\(|retry/i.test(l)));
  check("no scoring, ranking, weights, or formulas in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the adapter", architecture.every((src) => !/google-ads-adapter/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(campaign|ad-group|rsa|policy)-[a-z]+\.ts$/.test(f));
  check("campaign, ad group, RSA, and policy modules do not import the adapter", prior.every((f) => !/google-ads-adapter/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports the adapter", !others.some((f) => /google-ads-adapter/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the adapter", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads API adapter: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
