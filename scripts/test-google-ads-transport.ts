import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { createGoogleAdsAdGroupBuilder } from "../src/lib/providers/google-ads/google-ads-ad-group-builder.ts";
import { createGoogleAdsRsaBuilder } from "../src/lib/providers/google-ads/google-ads-rsa-builder.ts";
import { createGoogleAdsAdapter } from "../src/lib/providers/google-ads/google-ads-adapter.ts";
import { GOOGLE_ADS_TRANSPORT_STATUSES, createGoogleAdsTransport } from "../src/lib/providers/google-ads/google-ads-transport.ts";
import { createGoogleAdsRequestTransport } from "../src/lib/providers/google-ads/google-ads-transport-request.ts";
import { createGoogleAdsResponseTransport } from "../src/lib/providers/google-ads/google-ads-transport-response.ts";
import { createGoogleAdsTransportValidator } from "../src/lib/providers/google-ads/google-ads-transport-validator.ts";
import {
  GOOGLE_ADS_PREPARED_REQUEST_KEYS,
  GOOGLE_ADS_PREPARED_RESPONSE_KEYS,
  GOOGLE_ADS_TRANSPORT_HEALTH,
  GOOGLE_ADS_TRANSPORT_MODES,
  GOOGLE_ADS_TRANSPORT_REPORT_KEYS,
  GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS,
  GOOGLE_ADS_TRANSPORT_STATISTICS_KEYS,
  GOOGLE_ADS_TRANSPORT_VERSIONS,
  createGoogleAdsTransportSnapshot,
  freezeDeepGoogleAdsTransport,
} from "../src/lib/providers/google-ads/google-ads-transport-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function requestModelOf(over: Record<string, unknown> = {}) {
  return {
    id: "payload-1",
    campaignModelId: "model-1",
    adGroupModelId: "adgroup-1",
    rsaModelId: "rsamodel-1",
    executionPlanId: "ep-1",
    executionContractIds: ["ec-1"],
    campaignRequests: [{ resource: "campaign", id: "c-1", name: "search", budgetId: "b-1", settingsId: "s-1", metadata: {} }],
    campaignBudgetRequests: [{ resource: "campaignBudget", id: "b-1", name: "daily", metadata: {} }],
    campaignSettingsRequests: [{ resource: "campaignSettings", id: "s-1", campaignId: "c-1", metadata: {} }],
    adGroupRequests: [{ resource: "adGroup", id: "g-1", campaignId: "c-1", name: "core", metadata: {} }],
    keywordRequests: [{ resource: "keyword", id: "k-1", adGroupId: "g-1", text: "alpha term", metadata: {} }],
    responsiveSearchAdRequests: [{ resource: "responsiveSearchAd", id: "rsa-1", adGroupId: "g-1", headlines: ["line one"], descriptions: ["body one"], finalUrl: "https://example.test/offer", metadata: {} }],
    trackingRequests: [{ resource: "tracking", id: "t-1", rsaId: "rsa-1", text: "{lpurl}?src=host", metadata: {} }],
    metadata: { run: "r1" },
    executionTime: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    requestModel: requestModelOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE", version: "v1" },
    ...over,
  };
}

function transportOf() {
  let n = 0;
  return createGoogleAdsTransport({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `transport-${++n}`,
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
  const validator = createGoogleAdsTransportValidator();
  const requestTransport = createGoogleAdsRequestTransport();
  const responseTransport = createGoogleAdsResponseTransport();
  check("transport statuses are OK then REJECTED", GOOGLE_ADS_TRANSPORT_STATUSES.join() === "OK,REJECTED");
  check("the only mode is OFFLINE", GOOGLE_ADS_TRANSPORT_MODES.join() === "OFFLINE");
  check("health values are OFFLINE then UNAVAILABLE", GOOGLE_ADS_TRANSPORT_HEALTH.join() === "OFFLINE,UNAVAILABLE");
  check("the only version is v1", GOOGLE_ADS_TRANSPORT_VERSIONS.join() === "v1");
  check("prepared request keys are in the requested order", GOOGLE_ADS_PREPARED_REQUEST_KEYS.join() === "id,payloadId,version,mode,body,text,metadata,createdAt");
  check("prepared response keys are in the requested order", GOOGLE_ADS_PREPARED_RESPONSE_KEYS.join() === "id,requestId,version,mode,status,body,text,metadata,createdAt");
  check("report keys are in the requested order", GOOGLE_ADS_TRANSPORT_REPORT_KEYS.join() === "id,status,issues,mode,health,createdAt,metadata");
  check("statistics keys are in the requested order", GOOGLE_ADS_TRANSPORT_STATISTICS_KEYS.join() === "requestCount,responseCount,resourceCount,issueCount,executionTime");
  check("snapshot keys are in the requested order", GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS.join() === "transportId,payloadId,requestId,responseId,mode,health,createdAt,metadata");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Malformed Request: a non-object is rejected", has(validator.validateInput(null), /Malformed Request/));
  check("Malformed Request: a missing request model is rejected", has(validator.validateInput({}), /Malformed Request/));
  check("Invalid Payload: a non-list campaign request set is rejected", has(validator.validatePayload(requestModelOf({ campaignRequests: "nope" })), /Invalid Payload/));
  check("Unsupported Version: a later version is rejected", has(validator.validateVersion("v2"), /Unsupported Version/));
  check("a listed version is accepted", validator.validateVersion("v1").length === 0);
  check("Transport Configuration Errors: a live mode is rejected", has(validator.validateConfiguration({ mode: "LIVE" }), /Transport Configuration Errors/));
  check("an offline mode is accepted", validator.validateConfiguration({ mode: "OFFLINE", version: "v1" }).length === 0);
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));

  const serialized = requestTransport.serialize(requestModelOf());
  check("the request transport serializes a local body and text", serialized.body.id === "payload-1" && serialized.text.includes("payload-1") && Array.isArray(serialized.body.campaignRequests));
  const preparedRequest = requestTransport.prepare({
    id: "transport-1",
    requestModel: requestModelOf(),
    version: "v1",
    mode: "OFFLINE",
    metadata: { run: "r1" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  check("the request transport prepares a frozen offline request", preparedRequest.mode === "OFFLINE" && preparedRequest.payloadId === "payload-1" && Object.isFrozen(preparedRequest) && Object.isFrozen(preparedRequest.body));
  check("a prepared request has exactly the requested fields", Object.keys(preparedRequest).join() === GOOGLE_ADS_PREPARED_REQUEST_KEYS.join());
  check("a well-formed prepared request validates", validator.validatePreparedRequest(preparedRequest).length === 0);

  const preparedResponse = responseTransport.prepare({
    id: "transport-1",
    requestId: "transport-1",
    payloadId: "payload-1",
    version: "v1",
    mode: "OFFLINE",
    metadata: { run: "r1" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  check("the response transport prepares a frozen offline response", preparedResponse.mode === "OFFLINE" && preparedResponse.status === "OFFLINE" && preparedResponse.body.status === "OFFLINE" && Object.isFrozen(preparedResponse));
  check("the response transport deserializes a local record", responseTransport.deserialize(preparedResponse.text).status === "OFFLINE");
  check("a prepared response has exactly the requested fields", Object.keys(preparedResponse).join() === GOOGLE_ADS_PREPARED_RESPONSE_KEYS.join());
  check("a well-formed prepared response validates", validator.validatePreparedResponse(preparedResponse).length === 0);

  const snap = createGoogleAdsTransportSnapshot({
    transportId: "transport-1",
    payloadId: "payload-1",
    requestId: "transport-1",
    responseId: "transport-1",
    mode: "OFFLINE",
    health: "OFFLINE",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsTransport never throws", freezeDeepGoogleAdsTransport(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsTransport({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const transport = transportOf();
  const built = transport.prepare(inputOf());
  check("the transport returns OK with a prepared request, response, report, statistics, snapshot, and execution time", built.status === "OK" && built.preparedRequest !== null && built.preparedResponse !== null && built.report.status === "OK" && built.statistics !== null && built.snapshot !== null && built.executionTime === 0 && built.issues.length === 0);
  check("the prepared request stays offline and restates the payload id", built.preparedRequest!.mode === "OFFLINE" && built.preparedRequest!.payloadId === "payload-1" && built.preparedRequest!.version === "v1");
  check("the prepared response stays offline and points at the prepared request", built.preparedResponse!.status === "OFFLINE" && built.preparedResponse!.requestId === "transport-1" && built.preparedResponse!.mode === "OFFLINE");
  check("the report and statistics are frozen", Object.isFrozen(built.report) && Object.isFrozen(built.statistics) && Object.keys(built.report).join() === GOOGLE_ADS_TRANSPORT_REPORT_KEYS.join() && Object.keys(built.statistics!).join() === GOOGLE_ADS_TRANSPORT_STATISTICS_KEYS.join());
  check("statistics count the prepared records", built.statistics!.requestCount === 1 && built.statistics!.responseCount === 1 && built.statistics!.resourceCount === 7 && built.statistics!.issueCount === 0);
  check("the snapshot stores transport, payload, request, and response ids", built.snapshot!.transportId === "transport-1" && built.snapshot!.payloadId === "payload-1" && built.snapshot!.requestId === "transport-1" && built.snapshot!.health === "OFFLINE");
  check("getSnapshot returns the stored snapshot", transport.getSnapshot("transport-1") === built.snapshot && transport.getSnapshot("nope") === null);
  check("the prepared records are frozen", Object.isFrozen(built.preparedRequest) && Object.isFrozen(built.preparedResponse) && Object.isFrozen(built.preparedRequest!.body) && Object.isFrozen(built.snapshot));
  check("metadata is restated on the result", built.metadata.run === "r1");
  check("health check reports OFFLINE for a well-formed input", transport.healthCheck(inputOf()).status === "OFFLINE" && transport.healthCheck(inputOf()).mode === "OFFLINE");

  const missing = transportOf().prepare(null);
  check("Malformed Request: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Malformed Request/) && missing.preparedRequest === null && missing.health === "UNAVAILABLE");
  const badPayload = transportOf().prepare(inputOf({ requestModel: requestModelOf({ campaignRequests: "nope" }) }));
  check("Invalid Payload is refused", badPayload.status === "REJECTED" && has(badPayload.issues, /Invalid Payload/) && badPayload.preparedRequest === null);
  const badVersion = transportOf().prepare(inputOf({ configuration: { mode: "OFFLINE", version: "v2" } }));
  check("Unsupported Version is refused", badVersion.status === "REJECTED" && has(badVersion.issues, /Unsupported Version/));
  const live = transportOf().prepare(inputOf({ configuration: { mode: "LIVE", version: "v1" } }));
  check("Transport Configuration Errors is refused", live.status === "REJECTED" && has(live.issues, /Transport Configuration Errors/));
  const nested = transportOf().prepare(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  check("a refused prepare stores no snapshot", transportOf().getSnapshot("transport-1") === null);
  check("health check reports UNAVAILABLE for a live mode", transport.healthCheck(inputOf({ configuration: { mode: "LIVE" } })).status === "UNAVAILABLE");

  const source = inputOf();
  const once = transportOf().prepare(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.requestModel as { id: string }).id = "changed";
  check("No mutation: changing the input after prepare leaves the records unchanged", once.preparedRequest!.metadata.run === "r1" && once.snapshot!.payloadId === "payload-1" && once.preparedRequest!.payloadId === "payload-1");
  try {
    (once.preparedRequest!.body as { id: string }).id = "hacked";
    (once.preparedResponse!.body as { status: string }).status = "hacked";
    (once.snapshot!.requestId as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable requests and responses: the prepared records cannot be assigned into", once.preparedRequest!.payloadId === "payload-1" && once.preparedResponse!.status === "OFFLINE" && once.snapshot!.requestId === "transport-1");

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
  const adapted = createGoogleAdsAdapter({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "payload-1",
  }).adapt({
    campaignModel: campaignBuilt.model!,
    adGroupModel: adGroupBuilt.model!,
    responsiveSearchAds: rsaBuilt.model!,
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    executionMetadata: { run: "r1" },
  });
  check("prior builders and the adapter still return immutable records", campaignBuilt.status === "OK" && adGroupBuilt.status === "OK" && rsaBuilt.status === "OK" && adapted.status === "OK" && adapted.payload !== null);
  const payloadBefore = JSON.stringify(adapted.payload);
  const fromPrior = transportOf().prepare({
    requestModel: adapted.payload!,
    executionMetadata: { run: "r1" },
    configuration: { mode: "OFFLINE", version: "v1" },
  });
  try {
    (adapted.payload!.campaignRequests[0] as { name: string }).name = "hacked";
    (adapted.payload as { id: string }).id = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable adapter payload: the request model is unchanged after prepare", fromPrior.status === "OK" && fromPrior.preparedRequest!.payloadId === "payload-1" && fromPrior.preparedRequest!.body.campaignRequests instanceof Array && JSON.stringify(adapted.payload) === payloadBefore);

  const left = transportOf();
  const right = transportOf();
  left.prepare(inputOf());
  right.prepare(null);
  check("Independent transports do not share snapshots", left.getSnapshot("transport-1")?.health === "OFFLINE" && right.getSnapshot("transport-1") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-transport(-[a-z]+)?\.ts$/.test(f));
  check("five transport modules exist: transport, request, response, snapshot, validator", files.sort().join() === "google-ads-transport-request.ts,google-ads-transport-response.ts,google-ads-transport-snapshot.ts,google-ads-transport-validator.ts,google-ads-transport.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, OAuth, token, send, retry, or rate path in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization|publish\(|upload\(|retry|rate.?limit/i.test(l)));
  check("no scoring, ranking, weights, or formulas in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the transport does not import adapter, campaign, ad group, RSA, or policy factories", !imports.some((i) => /google-ads-(adapter|campaign|ad-group|rsa|policy)/.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the transport", architecture.every((src) => !/google-ads-transport/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(adapter|campaign|ad-group|rsa|policy)(-[a-z]+)?\.ts$/.test(f));
  check("adapter, campaign, ad group, RSA, and policy modules do not import the transport", prior.every((f) => !/google-ads-transport/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports the transport", !others.some((f) => /google-ads-transport/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the transport", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads transport: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
