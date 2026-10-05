import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { createGoogleAdsAdGroupBuilder } from "../src/lib/providers/google-ads/google-ads-ad-group-builder.ts";
import { createGoogleAdsRsaBuilder } from "../src/lib/providers/google-ads/google-ads-rsa-builder.ts";
import { createGoogleAdsAdapter } from "../src/lib/providers/google-ads/google-ads-adapter.ts";
import { createGoogleAdsTransport } from "../src/lib/providers/google-ads/google-ads-transport.ts";
import { createGoogleAdsAuthentication } from "../src/lib/providers/google-ads/google-ads-authentication.ts";
import { GOOGLE_ADS_CLIENT_STATUSES, createGoogleAdsApiClient } from "../src/lib/providers/google-ads/google-ads-client.ts";
import { createGoogleAdsRequestExecutor } from "../src/lib/providers/google-ads/google-ads-client-executor.ts";
import { createGoogleAdsResponseParser } from "../src/lib/providers/google-ads/google-ads-client-parser.ts";
import { GOOGLE_ADS_CLIENT_ERROR_KINDS, createGoogleAdsErrorMapper } from "../src/lib/providers/google-ads/google-ads-client-errors.ts";
import {
  GOOGLE_ADS_CLIENT_HEALTH,
  GOOGLE_ADS_CLIENT_MODES,
  GOOGLE_ADS_CLIENT_SNAPSHOT_KEYS,
  GOOGLE_ADS_CLIENT_STATISTICS_KEYS,
  GOOGLE_ADS_CLIENT_VERSIONS,
  GOOGLE_ADS_EXECUTION_RESULT_KEYS,
  GOOGLE_ADS_PARSED_RESPONSE_KEYS,
  createGoogleAdsClientHealth,
  createGoogleAdsClientSnapshot,
  freezeDeepGoogleAdsClient,
} from "../src/lib/providers/google-ads/google-ads-client-health.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function sessionOf(over: Record<string, unknown> = {}) {
  return {
    id: "auth-1",
    clientId: "client-1",
    customerId: "cust-1",
    loginCustomerId: "login-1",
    environment: "local",
    mode: "OFFLINE",
    sessionId: "session-1",
    configurationStatus: "LOADED",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function requestOf(over: Record<string, unknown> = {}) {
  return {
    id: "transport-1",
    payloadId: "payload-1",
    version: "v1",
    mode: "OFFLINE",
    body: { id: "payload-1", campaignRequests: [{ id: "c-1" }] },
    text: "{\"id\":\"payload-1\"}",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    authenticationContext: sessionOf(),
    preparedRequest: requestOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { version: "v1", mode: "OFFLINE" },
    ...over,
  };
}

function clientOf() {
  let n = 0;
  return createGoogleAdsApiClient({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `client-${++n}`,
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
  const mapper = createGoogleAdsErrorMapper();
  const executor = createGoogleAdsRequestExecutor();
  const parser = createGoogleAdsResponseParser();
  const health = createGoogleAdsClientHealth();
  check("client statuses are OK then REJECTED", GOOGLE_ADS_CLIENT_STATUSES.join() === "OK,REJECTED");
  check("the only mode is OFFLINE", GOOGLE_ADS_CLIENT_MODES.join() === "OFFLINE");
  check("health values are OFFLINE then UNAVAILABLE", GOOGLE_ADS_CLIENT_HEALTH.join() === "OFFLINE,UNAVAILABLE");
  check("the only version is v1", GOOGLE_ADS_CLIENT_VERSIONS.join() === "v1");
  check("error kinds name the seven provider errors", GOOGLE_ADS_CLIENT_ERROR_KINDS.join() === "AUTHENTICATION,AUTHORIZATION,VALIDATION,TRANSPORT,RATE,TEMPORARY,PERMANENT");
  check("execution keys are in the requested order", GOOGLE_ADS_EXECUTION_RESULT_KEYS.join() === "id,requestId,sessionId,status,version,mode,body,createdAt,metadata");
  check("parsed response keys are in the requested order", GOOGLE_ADS_PARSED_RESPONSE_KEYS.join() === "id,requestId,status,version,body,metadata,createdAt");
  check("statistics keys are in the requested order", GOOGLE_ADS_CLIENT_STATISTICS_KEYS.join() === "requestCount,responseCount,errorCount,executionTime");
  check("snapshot keys are in the requested order", GOOGLE_ADS_CLIENT_SNAPSHOT_KEYS.join() === "clientId,sessionId,requestId,version,health,createdAt,metadata");

  check("error mapper: Authentication Error", mapper.kindOf({ field: "session", message: "Invalid Session: a session id is required." }) === "AUTHENTICATION");
  check("error mapper: Authorization Error", mapper.kindOf({ field: "customerId", message: "Authorization Error: a customer id is required." }) === "AUTHORIZATION");
  check("error mapper: Validation Error", mapper.kindOf({ field: "request", message: "Invalid Request: a body is required." }) === "VALIDATION");
  check("error mapper: Transport Error", mapper.kindOf({ field: "mode", message: "Transport Error: the prepared request must stay offline." }) === "TRANSPORT");
  check("error mapper: Rate Limit Error", mapper.kindOf({ field: "provider", message: "Rate Limit Error: the provider named a rate condition." }) === "RATE");
  check("error mapper: Temporary Error", mapper.kindOf({ field: "provider", message: "Temporary Error: the provider named a temporary condition." }) === "TEMPORARY");
  check("error mapper: Permanent Error", mapper.kindOf({ field: "response", message: "Malformed Response: a response body object is required." }) === "PERMANENT");

  const executed = executor.execute({
    id: "client-1",
    sessionId: "session-1",
    requestId: "transport-1",
    requestBody: { id: "payload-1" },
    version: "v1",
    metadata: { run: "r1" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  check("the executor records a frozen offline execution", executed.issues.length === 0 && executed.execution?.mode === "OFFLINE" && executed.execution?.status === "OK" && Object.isFrozen(executed.execution) && Object.keys(executed.execution!).join() === GOOGLE_ADS_EXECUTION_RESULT_KEYS.join());

  const parsed = parser.parse(executed.execution);
  check("the parser reads a frozen offline response", parsed.issues.length === 0 && parsed.response?.status === "OFFLINE" && parsed.response?.requestId === "transport-1" && Object.isFrozen(parsed.response) && Object.keys(parsed.response!).join() === GOOGLE_ADS_PARSED_RESPONSE_KEYS.join());
  check("Malformed Response: a non-object is rejected", has(parser.parse(null).issues, /Malformed Response/));

  check("version detection restates v1", health.detectVersion(inputOf()).version === "v1" && health.detectVersion(inputOf()).issues.length === 0);
  check("Unsupported API Version: a later version is rejected", has(health.detectVersion(inputOf({ configuration: { version: "v2" } })).issues, /Unsupported API Version/));
  check("health check reports OFFLINE for a well-formed input", health.check(inputOf()).status === "OFFLINE");
  check("health check reports UNAVAILABLE for a missing session", health.check({ preparedRequest: requestOf() }).status === "UNAVAILABLE");

  const snap = createGoogleAdsClientSnapshot({
    clientId: "client-1",
    sessionId: "session-1",
    requestId: "transport-1",
    version: "v1",
    health: "OFFLINE",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_CLIENT_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsClient never throws", freezeDeepGoogleAdsClient(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsClient({ n: 1 })));

  const client = clientOf();
  const built = client.execute(inputOf());
  check("the client returns OK with an execution, parsed response, error report, statistics, snapshot, and execution time", built.status === "OK" && built.execution !== null && built.parsedResponse !== null && built.snapshot !== null && built.statistics !== null && built.errors.errors.length === 0 && built.executionTime === 0 && built.issues.length === 0);
  check("the execution stays offline and restates the session and request", built.execution!.mode === "OFFLINE" && built.execution!.sessionId === "session-1" && built.execution!.requestId === "transport-1" && built.version === "v1");
  check("the parsed response stays offline", built.parsedResponse!.status === "OFFLINE" && built.parsedResponse!.requestId === "transport-1");
  check("statistics count the executed records", built.statistics!.requestCount === 1 && built.statistics!.responseCount === 1 && built.statistics!.errorCount === 0);
  check("the snapshot stores client, session, request, and version", built.snapshot!.clientId === "client-1" && built.snapshot!.sessionId === "session-1" && built.snapshot!.requestId === "transport-1" && built.snapshot!.version === "v1" && built.snapshot!.health === "OFFLINE");
  check("getSnapshot returns the stored snapshot", client.getSnapshot("client-1") === built.snapshot && client.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.execution) && Object.isFrozen(built.parsedResponse) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.errors));
  check("metadata is restated on the result", built.metadata.run === "r1");
  check("health check and version detection are available on the client", client.healthCheck(inputOf()).status === "OFFLINE" && client.detectVersion(inputOf()).version === "v1");

  const missing = clientOf().execute(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.execution === null && missing.health === "UNAVAILABLE");
  const noSession = clientOf().execute(inputOf({ authenticationContext: sessionOf({ sessionId: "" }) }));
  check("Invalid Session is refused", noSession.status === "REJECTED" && has(noSession.issues, /Invalid Session/) && noSession.errors.errors.some((item) => item.kind === "AUTHENTICATION"));
  const noCustomer = clientOf().execute(inputOf({ authenticationContext: sessionOf({ customerId: "" }) }));
  check("Authorization Error is refused", noCustomer.status === "REJECTED" && has(noCustomer.issues, /Authorization Error/) && noCustomer.errors.errors.some((item) => item.kind === "AUTHORIZATION"));
  const noRequest = clientOf().execute(inputOf({ preparedRequest: requestOf({ body: "nope" }) }));
  check("Invalid Request is refused", noRequest.status === "REJECTED" && has(noRequest.issues, /Invalid Request/) && noRequest.errors.errors.some((item) => item.kind === "VALIDATION"));
  const badVersion = clientOf().execute(inputOf({ configuration: { version: "v2" } }));
  check("Unsupported API Version is refused", badVersion.status === "REJECTED" && has(badVersion.issues, /Unsupported API Version/));
  const nested = clientOf().execute(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  check("a refused execute stores no snapshot", clientOf().getSnapshot("client-1") === null);

  const source = inputOf();
  const once = clientOf().execute(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.authenticationContext as { sessionId: string }).sessionId = "changed";
  (source.preparedRequest as { id: string }).id = "changed";
  check("No mutation: changing the input after execute leaves the records unchanged", once.execution!.metadata.run === "r1" && once.snapshot!.sessionId === "session-1" && once.execution!.requestId === "transport-1");
  try {
    (once.execution!.body as { id: string }).id = "hacked";
    (once.parsedResponse!.status as string) = "hacked";
    (once.snapshot!.requestId as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable responses: the execution, parsed response, and snapshot cannot be assigned into", once.parsedResponse!.status === "OFFLINE" && once.snapshot!.requestId === "transport-1" && (once.execution!.body as { id: string }).id === "payload-1");

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
  const transported = createGoogleAdsTransport({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "transport-1",
  }).prepare({
    requestModel: adapted.payload!,
    executionMetadata: { run: "r1" },
    configuration: { mode: "OFFLINE", version: "v1" },
  });
  const authenticated = createGoogleAdsAuthentication({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "auth-1",
  }).authenticate({
    configuration: {
      clientId: "client-1",
      clientSecret: "secret-1",
      developerToken: "dev-1",
      refreshToken: "refresh-1",
      accessToken: "access-1",
      customerId: "cust-1",
      loginCustomerId: "login-1",
      environment: "local",
      mode: "OFFLINE",
    },
    executionMetadata: { run: "r1" },
  });
  check("prior layers still return immutable records", campaignBuilt.status === "OK" && adapted.status === "OK" && transported.status === "OK" && authenticated.status === "OK");
  const requestBefore = JSON.stringify(transported.preparedRequest);
  const sessionBefore = JSON.stringify(authenticated.context);
  const fromPrior = clientOf().execute({
    authenticationContext: authenticated.context!,
    preparedRequest: transported.preparedRequest!,
    executionMetadata: { run: "r1" },
    configuration: { version: "v1", mode: "OFFLINE" },
  });
  try {
    (transported.preparedRequest!.body as { id: string }).id = "hacked";
    (authenticated.context as { sessionId: string }).sessionId = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable prior records: session and prepared request are unchanged after execute", fromPrior.status === "OK" && fromPrior.execution!.requestId === "transport-1" && fromPrior.execution!.sessionId === "session-1" && JSON.stringify(transported.preparedRequest) === requestBefore && JSON.stringify(authenticated.context) === sessionBefore);

  const left = clientOf();
  const right = clientOf();
  left.execute(inputOf());
  right.execute(null);
  check("Independent clients do not share snapshots", left.getSnapshot("client-1")?.health === "OFFLINE" && right.getSnapshot("client-1") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-client(-[a-z]+)?\.ts$/.test(f));
  check("five client modules exist: client, errors, executor, health, parser", files.sort().join() === "google-ads-client-errors.ts,google-ads-client-executor.ts,google-ads-client-health.ts,google-ads-client-parser.ts,google-ads-client.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, token flow, retry, batch, or rate path in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|publish\(|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
  check("no scoring, ranking, weights, formulas, or campaign optimization in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|optimiz/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the client does not import adapter, campaign, ad group, RSA, policy, transport, or authentication factories", !imports.some((i) => /google-ads-(adapter|campaign|ad-group|rsa|policy|transport|authentication)/.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the client", architecture.every((src) => !/google-ads-client/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(adapter|campaign|ad-group|rsa|policy|transport|authentication)(-[a-z]+)?\.ts$/.test(f));
  check("prior google-ads modules do not import the client", prior.every((f) => !/google-ads-client/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports the client", !others.some((f) => /google-ads-client/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the client", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads API client: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
