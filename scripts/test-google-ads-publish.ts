import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsAuthentication } from "../src/lib/providers/google-ads/google-ads-authentication.ts";
import { createGoogleAdsApiClient } from "../src/lib/providers/google-ads/google-ads-client.ts";
import { createGoogleAdsCampaignPublisher } from "../src/lib/providers/google-ads/google-ads-publish.ts";
import {
  createGoogleAdsCampaignArchiveOperation,
  createGoogleAdsCampaignCreateOperation,
  createGoogleAdsCampaignPauseOperation,
  createGoogleAdsCampaignResumeOperation,
  createGoogleAdsCampaignUpdateOperation,
} from "../src/lib/providers/google-ads/google-ads-publish-operations.ts";
import { GOOGLE_ADS_PUBLISH_ERROR_KINDS, createGoogleAdsPublishErrorMapper } from "../src/lib/providers/google-ads/google-ads-publish-errors.ts";
import { createGoogleAdsPublishValidator } from "../src/lib/providers/google-ads/google-ads-publish-validator.ts";
import {
  GOOGLE_ADS_PUBLISH_OPERATIONS,
  GOOGLE_ADS_PUBLISH_RESULT_KEYS,
  GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS,
  GOOGLE_ADS_PUBLISH_STATISTICS_KEYS,
  GOOGLE_ADS_PUBLISH_STATUSES,
  createGoogleAdsPublishSnapshot,
  freezeDeepGoogleAdsPublish,
} from "../src/lib/providers/google-ads/google-ads-publish-snapshot.ts";

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

function inputOf(over: Record<string, unknown> = {}) {
  return {
    executionPlan: { id: "ep-1" },
    provider: { id: "prov-1" },
    authenticationContext: sessionOf(),
    operation: "CREATE",
    campaignId: "c-1",
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE", version: "v1" },
    ...over,
  };
}

function publisherOf(over: { client?: { execute: (input: unknown) => { status: string; issues?: readonly { field: string; message: string }[]; parsedResponse?: { body?: unknown } | null; execution?: { body?: unknown } | null } } } = {}) {
  let n = 0;
  return createGoogleAdsCampaignPublisher({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `publish-${++n}`,
    ...over,
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
  const validator = createGoogleAdsPublishValidator();
  const mapper = createGoogleAdsPublishErrorMapper();
  check("publish statuses are OK then REJECTED", GOOGLE_ADS_PUBLISH_STATUSES.join() === "OK,REJECTED");
  check("operations are CREATE, UPDATE, PAUSE, RESUME, ARCHIVE", GOOGLE_ADS_PUBLISH_OPERATIONS.join() === "CREATE,UPDATE,PAUSE,RESUME,ARCHIVE");
  check("error kinds name the seven publish errors", GOOGLE_ADS_PUBLISH_ERROR_KINDS.join() === "AUTHENTICATION,VALIDATION,PROVIDER,TRANSPORT,RATE,CONFLICT,UNKNOWN");
  check("result keys are in the requested order", GOOGLE_ADS_PUBLISH_RESULT_KEYS.join() === "id,operation,status,planId,providerId,campaignId,sessionId,response,metadata,createdAt,executionTime");
  check("snapshot keys are in the requested order", GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS.join() === "publishId,planId,providerId,campaignId,operation,status,createdAt,metadata");
  check("statistics keys are in the requested order", GOOGLE_ADS_PUBLISH_STATISTICS_KEYS.join() === "operationCount,successCount,errorCount,executionTime");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Invalid Execution Plan: a missing plan is rejected", has(validator.validatePlan(null), /Invalid Execution Plan/));
  check("Missing Authentication: a missing session is rejected", has(validator.validateAuthentication(null), /Missing Authentication/));
  check("Unsupported Operation: an unknown operation is rejected", has(validator.validateOperation("OPTIMIZE"), /Unsupported Operation/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("a campaign id is required for update", has(validator.validateInput(inputOf({ operation: "UPDATE", campaignId: "" })), /Invalid Execution Plan/));

  check("error mapper: Authentication Failure", mapper.kindOf({ field: "authenticationContext", message: "Missing Authentication: a session is required." }) === "AUTHENTICATION");
  check("error mapper: Validation Failure", mapper.kindOf({ field: "executionPlan", message: "Invalid Execution Plan: a plan id is required." }) === "VALIDATION");
  check("error mapper: Provider Failure", mapper.kindOf({ field: "provider", message: "Provider Failure: the provider did not complete the operation." }) === "PROVIDER");
  check("error mapper: Transport Failure", mapper.kindOf({ field: "transport", message: "Transport Failure: the request was not prepared." }) === "TRANSPORT");
  check("error mapper: Rate Limit", mapper.kindOf({ field: "provider", message: "Rate Limit: the provider named a rate condition." }) === "RATE");
  check("error mapper: Conflict", mapper.kindOf({ field: "campaignId", message: "Conflict: campaign \"c-1\" was already created." }) === "CONFLICT");
  check("error mapper: Unknown Error", mapper.kindOf({ field: "publish", message: "Unknown Error: the publisher could not apply the operation." }) === "UNKNOWN");

  const created = createGoogleAdsCampaignCreateOperation().apply({ planId: "ep-1", providerId: "prov-1", campaignId: "c-1", sessionId: "session-1" });
  check("create operation restates the campaign id", created.issues.length === 0 && created.record.operation === "CREATE" && created.record.campaignId === "c-1" && Object.isFrozen(created.record));
  check("update operation is explicit", createGoogleAdsCampaignUpdateOperation().apply({ planId: "ep-1", providerId: "prov-1", campaignId: "c-1", sessionId: "session-1" }).record.operation === "UPDATE");
  check("pause operation is explicit", createGoogleAdsCampaignPauseOperation().apply({ planId: "ep-1", providerId: "prov-1", campaignId: "c-1", sessionId: "session-1" }).record.operation === "PAUSE");
  check("resume operation is explicit", createGoogleAdsCampaignResumeOperation().apply({ planId: "ep-1", providerId: "prov-1", campaignId: "c-1", sessionId: "session-1" }).record.operation === "RESUME");
  check("archive operation is explicit", createGoogleAdsCampaignArchiveOperation().apply({ planId: "ep-1", providerId: "prov-1", campaignId: "c-1", sessionId: "session-1" }).record.operation === "ARCHIVE");

  const snap = createGoogleAdsPublishSnapshot({
    publishId: "publish-1",
    planId: "ep-1",
    providerId: "prov-1",
    campaignId: "c-1",
    operation: "CREATE",
    status: "OK",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsPublish never throws", freezeDeepGoogleAdsPublish(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsPublish({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const publisher = publisherOf();
  const built = publisher.apply(inputOf());
  check("the publisher returns OK with a result, errors, statistics, snapshot, and execution time", built.status === "OK" && built.result !== null && built.snapshot !== null && built.statistics !== null && built.errors.errors.length === 0 && built.executionTime === 0 && built.issues.length === 0);
  check("the result restates create, plan, provider, campaign, and session", built.result!.operation === "CREATE" && built.result!.planId === "ep-1" && built.result!.providerId === "prov-1" && built.result!.campaignId === "c-1" && built.result!.sessionId === "session-1" && built.result!.status === "OK");
  check("a result has exactly the requested fields", Object.keys(built.result!).join() === GOOGLE_ADS_PUBLISH_RESULT_KEYS.join());
  check("statistics count the applied operation", built.statistics!.operationCount === 1 && built.statistics!.successCount === 1 && built.statistics!.errorCount === 0);
  check("the snapshot stores publish, plan, provider, campaign, and operation", built.snapshot!.publishId === "publish-1" && built.snapshot!.planId === "ep-1" && built.snapshot!.campaignId === "c-1" && built.snapshot!.operation === "CREATE");
  check("getSnapshot returns the stored snapshot", publisher.getSnapshot("publish-1") === built.snapshot && publisher.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.result) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.result!.response));
  check("metadata is restated on the result", built.metadata.run === "r1");

  check("update applies when a campaign id is listed", publisherOf().apply(inputOf({ operation: "UPDATE" })).result?.operation === "UPDATE");
  check("pause applies when a campaign id is listed", publisherOf().apply(inputOf({ operation: "PAUSE" })).result?.operation === "PAUSE");
  check("resume applies when a campaign id is listed", publisherOf().apply(inputOf({ operation: "RESUME" })).result?.operation === "RESUME");
  check("archive applies when a campaign id is listed", publisherOf().apply(inputOf({ operation: "ARCHIVE" })).result?.operation === "ARCHIVE");

  const missing = publisherOf().apply(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.result === null);
  const noPlan = publisherOf().apply(inputOf({ executionPlan: {} }));
  check("Invalid Execution Plan is refused", noPlan.status === "REJECTED" && has(noPlan.issues, /Invalid Execution Plan/));
  const noAuth = publisherOf().apply(inputOf({ authenticationContext: null }));
  check("Missing Authentication is refused", noAuth.status === "REJECTED" && has(noAuth.issues, /Missing Authentication/) && noAuth.errors.errors.some((item) => item.kind === "AUTHENTICATION"));
  const unsupported = publisherOf().apply(inputOf({ operation: "OPTIMIZE" }));
  check("Unsupported Operation is refused", unsupported.status === "REJECTED" && has(unsupported.issues, /Unsupported Operation/));
  const nested = publisherOf().apply(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  const duplicate = publisherOf();
  duplicate.apply(inputOf());
  const conflict = duplicate.apply(inputOf());
  check("Conflict: a second create of the same campaign is refused", conflict.status === "REJECTED" && has(conflict.issues, /Conflict/) && conflict.errors.errors.some((item) => item.kind === "CONFLICT"));
  const malformed = publisherOf({
    client: { execute: () => ({ status: "OK", parsedResponse: { body: "nope" }, execution: null }) },
  }).apply(inputOf());
  check("Malformed Provider Response is refused", malformed.status === "REJECTED" && has(malformed.issues, /Malformed Provider Response/) && malformed.errors.errors.some((item) => item.kind === "PROVIDER"));
  check("a refused apply stores no snapshot", publisherOf().getSnapshot("publish-1") === null);

  const first = publisherOf().apply(inputOf());
  const second = publisherOf().apply(inputOf());
  check("Deterministic publishing: the same records yield the same result and snapshot", first.status === "OK" && JSON.stringify(first.result) === JSON.stringify(second.result) && JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot));

  const source = inputOf();
  const once = publisherOf().apply(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.executionPlan as { id: string }).id = "changed";
  (source.authenticationContext as { sessionId: string }).sessionId = "changed";
  check("No mutation: changing the input after apply leaves the result unchanged", once.result!.metadata.run === "r1" && once.result!.planId === "ep-1" && once.snapshot!.campaignId === "c-1");
  try {
    (once.result!.campaignId as string) = "hacked";
    (once.snapshot!.operation as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable publish snapshots: the result and snapshot cannot be assigned into", once.result!.campaignId === "c-1" && once.snapshot!.operation === "CREATE");

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
  const client = createGoogleAdsApiClient({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "client-1",
  });
  const plan = { id: "ep-1" };
  const provider = { id: "prov-1" };
  const planBefore = JSON.stringify(plan);
  const providerBefore = JSON.stringify(provider);
  const sessionBefore = JSON.stringify(authenticated.context);
  const fromClient = publisherOf({ client }).apply({
    executionPlan: plan,
    provider,
    authenticationContext: authenticated.context!,
    operation: "CREATE",
    campaignId: "c-1",
    executionMetadata: { run: "r1" },
    configuration: { mode: "OFFLINE", version: "v1" },
  });
  check("the publisher executes through the API client", fromClient.status === "OK" && fromClient.result?.response.status === "OFFLINE" && fromClient.result?.operation === "CREATE");
  check("No upstream mutation: plan, provider, and session are unchanged after apply", JSON.stringify(plan) === planBefore && JSON.stringify(provider) === providerBefore && JSON.stringify(authenticated.context) === sessionBefore);
  try {
    (authenticated.context as { sessionId: string }).sessionId = "hacked";
  } catch {
    /* frozen */
  }
  check("the authentication context stays frozen after apply", authenticated.context!.sessionId === "session-1");

  const left = publisherOf();
  const right = publisherOf();
  left.apply(inputOf());
  right.apply(null);
  check("Independent provider execution: publishers do not share snapshots", left.getSnapshot("publish-1")?.operation === "CREATE" && right.getSnapshot("publish-1") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-publish(-[a-z]+)?\.ts$/.test(f));
  check("five publish modules exist: publish, errors, operations, snapshot, validator", files.sort().join() === "google-ads-publish-errors.ts,google-ads-publish-operations.ts,google-ads-publish-snapshot.ts,google-ads-publish-validator.ts,google-ads-publish.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, retry, rate path, or live send in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
  check("no scoring, ranking, weights, formulas, recommendations, or optimization in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend|optimiz/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the publisher does not import adapter, campaign, ad group, RSA, policy, transport, authentication, or client factories", !imports.some((i) => /google-ads-(adapter|campaign|ad-group|rsa|policy|transport|authentication|client)/.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import publish", architecture.every((src) => !/google-ads-publish/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(adapter|campaign|ad-group|rsa|policy|transport|authentication|client)(-[a-z]+)?\.ts$/.test(f));
  check("prior google-ads modules do not import publish", prior.every((f) => !/google-ads-publish/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports publish", !others.some((f) => /google-ads-publish/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import publish", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads publish operations: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
