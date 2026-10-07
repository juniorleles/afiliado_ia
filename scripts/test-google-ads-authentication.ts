import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GOOGLE_ADS_AUTHENTICATION_STATUSES, createGoogleAdsAuthentication } from "../src/lib/providers/google-ads/google-ads-authentication.ts";
import { createGoogleAdsOAuthConfiguration } from "../src/lib/providers/google-ads/google-ads-authentication-configuration.ts";
import { createGoogleAdsTokenStore } from "../src/lib/providers/google-ads/google-ads-authentication-store.ts";
import { createGoogleAdsTokenValidator } from "../src/lib/providers/google-ads/google-ads-authentication-validator.ts";
import {
  GOOGLE_ADS_AUTHENTICATION_CONTEXT_KEYS,
  GOOGLE_ADS_AUTHENTICATION_HEALTH,
  GOOGLE_ADS_AUTHENTICATION_MODES,
  GOOGLE_ADS_AUTHENTICATION_REPORT_KEYS,
  GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS,
  GOOGLE_ADS_CONFIGURATION_STATUSES,
  GOOGLE_ADS_OAUTH_CONFIGURATION_KEYS,
  GOOGLE_ADS_SESSION_METADATA_KEYS,
  createGoogleAdsAuthenticationSnapshot,
  freezeDeepGoogleAdsAuthentication,
} from "../src/lib/providers/google-ads/google-ads-authentication-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function configurationOf(over: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    clientSecret: "secret-1",
    developerToken: "dev-1",
    refreshToken: "refresh-1",
    accessToken: "access-1",
    customerId: "cust-1",
    loginCustomerId: "login-1",
    environment: "local",
    mode: "OFFLINE",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    configuration: configurationOf(),
    runtimeMetadata: { host: "h1" },
    executionMetadata: { run: "r1" },
    ...over,
  };
}

function authOf() {
  let n = 0;
  return createGoogleAdsAuthentication({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `auth-${++n}`,
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
  const validator = createGoogleAdsTokenValidator();
  const loader = createGoogleAdsOAuthConfiguration();
  const store = createGoogleAdsTokenStore();
  check("authentication statuses are OK then REJECTED", GOOGLE_ADS_AUTHENTICATION_STATUSES.join() === "OK,REJECTED");
  check("the only mode is OFFLINE", GOOGLE_ADS_AUTHENTICATION_MODES.join() === "OFFLINE");
  check("health values are OFFLINE then UNAVAILABLE", GOOGLE_ADS_AUTHENTICATION_HEALTH.join() === "OFFLINE,UNAVAILABLE");
  check("configuration statuses are LOADED then REJECTED", GOOGLE_ADS_CONFIGURATION_STATUSES.join() === "LOADED,REJECTED");
  check("configuration keys are in the requested order", GOOGLE_ADS_OAUTH_CONFIGURATION_KEYS.join() === "clientId,clientSecret,developerToken,refreshToken,accessToken,customerId,loginCustomerId,environment,mode");
  check("context keys are in the requested order", GOOGLE_ADS_AUTHENTICATION_CONTEXT_KEYS.join() === "id,clientId,customerId,loginCustomerId,environment,mode,sessionId,configurationStatus,metadata,createdAt");
  check("session keys are in the requested order", GOOGLE_ADS_SESSION_METADATA_KEYS.join() === "id,authenticationId,customerId,loginCustomerId,environment,mode,createdAt,metadata");
  check("report keys are in the requested order", GOOGLE_ADS_AUTHENTICATION_REPORT_KEYS.join() === "id,status,issues,configurationStatus,health,createdAt,metadata");
  check("snapshot keys are in the requested order", GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS.join() === "authenticationId,sessionId,clientId,customerId,mode,health,createdAt,metadata");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Invalid Metadata: a non-object is rejected", has(validator.validateInput(null), /Invalid Metadata/));
  check("Missing Client ID: an empty client id is rejected", has(validator.validateConfiguration(configurationOf({ clientId: "" })), /Missing Client ID/));
  check("Missing Client Secret: an empty client secret is rejected", has(validator.validateConfiguration(configurationOf({ clientSecret: "" })), /Missing Client Secret/));
  check("Missing Developer Token: an empty developer token is rejected", has(validator.validateConfiguration(configurationOf({ developerToken: "" })), /Missing Developer Token/));
  check("Missing Customer ID: an empty customer id is rejected", has(validator.validateConfiguration(configurationOf({ customerId: "" })), /Missing Customer ID/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: a live mode is rejected", has(validator.validateConfiguration(configurationOf({ mode: "LIVE" })), /Invalid Metadata/));
  check("optional tokens may be omitted", validator.validateConfiguration(configurationOf({ refreshToken: null, accessToken: null, loginCustomerId: null })).length === 0);

  const loaded = loader.load(configurationOf());
  check("the configuration loader loads a frozen offline record", loaded.issues.length === 0 && loaded.configuration?.clientId === "client-1" && loaded.configuration?.mode === "OFFLINE" && loaded.configuration?.environment === "local" && Object.isFrozen(loaded.configuration));
  check("a missing configuration does not load", loader.load({}).configuration === null && has(loader.load({}).issues, /Missing Client ID/));

  const tokenIssues = store.put({ sessionId: "session-1", accessToken: "access-1", refreshToken: "refresh-1", developerToken: "dev-1" });
  check("the token store stores, gets, and lists records", tokenIssues.length === 0 && store.get("session-1")?.developerToken === "dev-1" && store.get("missing") === null && store.list().length === 1);
  check("the stored token record is frozen", Object.isFrozen(store.get("session-1")));
  check("Missing Developer Token is rejected by the store", has(store.put({ sessionId: "session-2", accessToken: null, refreshToken: null, developerToken: "" }), /Missing Developer Token/) && store.get("session-2") === null);

  const snap = createGoogleAdsAuthenticationSnapshot({
    authenticationId: "auth-1",
    sessionId: "session-1",
    clientId: "client-1",
    customerId: "cust-1",
    mode: "OFFLINE",
    health: "OFFLINE",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsAuthentication never throws", freezeDeepGoogleAdsAuthentication(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsAuthentication({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const auth = authOf();
  const built = auth.authenticate(inputOf());
  check("the framework returns OK with a context, report, configuration status, session, snapshot, and execution time", built.status === "OK" && built.context !== null && built.session !== null && built.snapshot !== null && built.report.status === "OK" && built.configurationStatus === "LOADED" && built.executionTime === 0 && built.issues.length === 0);
  check("the context stays offline and restates client, customer, and environment", built.context!.mode === "OFFLINE" && built.context!.clientId === "client-1" && built.context!.customerId === "cust-1" && built.context!.loginCustomerId === "login-1" && built.context!.environment === "local" && built.context!.sessionId === "session-1");
  check("the context does not carry secrets", !("clientSecret" in built.context!) && !("developerToken" in built.context!) && !("accessToken" in built.context!) && !("refreshToken" in built.context!));
  check("the session stays offline and points at the authentication id", built.session!.mode === "OFFLINE" && built.session!.authenticationId === "auth-1" && built.session!.id === "session-1");
  check("the report and snapshot are frozen", Object.isFrozen(built.report) && Object.isFrozen(built.context) && Object.isFrozen(built.session) && Object.isFrozen(built.snapshot) && Object.keys(built.report).join() === GOOGLE_ADS_AUTHENTICATION_REPORT_KEYS.join());
  check("a context and session have exactly the requested fields", Object.keys(built.context!).join() === GOOGLE_ADS_AUTHENTICATION_CONTEXT_KEYS.join() && Object.keys(built.session!).join() === GOOGLE_ADS_SESSION_METADATA_KEYS.join());
  check("the snapshot stores authentication, session, client, and customer ids", built.snapshot!.authenticationId === "auth-1" && built.snapshot!.sessionId === "session-1" && built.snapshot!.clientId === "client-1" && built.snapshot!.customerId === "cust-1" && built.snapshot!.health === "OFFLINE");
  check("getSnapshot and getSession return the stored records", auth.getSnapshot("auth-1") === built.snapshot && auth.getSession("session-1") === built.session && auth.getSnapshot("nope") === null);
  check("metadata is restated on the result", built.metadata.run === "r1");
  check("the token store keeps the session tokens", auth.store.get("session-1")?.accessToken === "access-1" && auth.store.get("session-1")?.refreshToken === "refresh-1");
  check("health check reports OFFLINE for a well-formed input", auth.healthCheck(inputOf()).status === "OFFLINE" && auth.healthCheck(inputOf()).mode === "OFFLINE");

  const missing = authOf().authenticate(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.context === null && missing.health === "UNAVAILABLE");
  const noClient = authOf().authenticate(inputOf({ configuration: configurationOf({ clientId: "" }) }));
  check("Missing Client ID is refused", noClient.status === "REJECTED" && has(noClient.issues, /Missing Client ID/) && noClient.configurationStatus === "REJECTED");
  const noSecret = authOf().authenticate(inputOf({ configuration: configurationOf({ clientSecret: "" }) }));
  check("Missing Client Secret is refused", noSecret.status === "REJECTED" && has(noSecret.issues, /Missing Client Secret/));
  const noDev = authOf().authenticate(inputOf({ configuration: configurationOf({ developerToken: "" }) }));
  check("Missing Developer Token is refused", noDev.status === "REJECTED" && has(noDev.issues, /Missing Developer Token/));
  const noCustomer = authOf().authenticate(inputOf({ configuration: configurationOf({ customerId: "" }) }));
  check("Missing Customer ID is refused", noCustomer.status === "REJECTED" && has(noCustomer.issues, /Missing Customer ID/));
  const nested = authOf().authenticate(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  const live = authOf().authenticate(inputOf({ configuration: configurationOf({ mode: "LIVE" }) }));
  check("a live mode is refused", live.status === "REJECTED" && has(live.issues, /Invalid Metadata/) && live.session === null);
  check("a refused authenticate stores no snapshot", authOf().getSnapshot("auth-1") === null);
  check("health check reports UNAVAILABLE for a missing client id", auth.healthCheck(inputOf({ configuration: configurationOf({ clientId: "" }) })).status === "UNAVAILABLE");

  const optionalConfig = configurationOf({ refreshToken: null, accessToken: null, loginCustomerId: null });
  delete (optionalConfig as { environment?: string }).environment;
  const optional = authOf().authenticate(inputOf({ configuration: optionalConfig }));
  check("optional tokens and login customer may be omitted", optional.status === "OK" && optional.context!.loginCustomerId === null && optional.context!.environment === "local" && optional.session!.loginCustomerId === null);

  const source = inputOf();
  const once = authOf().authenticate(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.configuration as { clientId: string }).clientId = "changed";
  check("No mutation: changing the input after authenticate leaves the context unchanged", once.context!.metadata.run === "r1" && once.context!.clientId === "client-1" && once.snapshot!.customerId === "cust-1");
  try {
    (once.context!.clientId as string) = "hacked";
    (once.session!.customerId as string) = "hacked";
    (once.snapshot!.sessionId as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable authentication context: the context, session, and snapshot cannot be assigned into", once.context!.clientId === "client-1" && once.session!.customerId === "cust-1" && once.snapshot!.sessionId === "session-1");

  const left = authOf();
  const right = authOf();
  left.authenticate(inputOf());
  right.authenticate(null);
  check("Independent authentication does not share snapshots or sessions", left.getSnapshot("auth-1")?.health === "OFFLINE" && right.getSnapshot("auth-1") === null && left.getSession("session-1") !== null && right.getSession("session-1") === null && left.store.get("session-1") !== null && right.store.get("session-1") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-authentication(-[a-z]+)?\.ts$/.test(f));
  check("five authentication modules exist: authentication, configuration, snapshot, store, validator", files.sort().join() === "google-ads-authentication-configuration.ts,google-ads-authentication-snapshot.ts,google-ads-authentication-store.ts,google-ads-authentication-validator.ts,google-ads-authentication.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, token flow, retry, or rate path in code", !code.some((l) => /fetch\(|googleapis|access_token|node:http|node:https|Authorization|publish\(|upload\(|retry|rate.?limit|\.refresh\(|authorize\?/i.test(l)));
  check("no scoring, ranking, weights, or formulas in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the framework does not import adapter, campaign, ad group, RSA, policy, or transport factories", !imports.some((i) => /google-ads-(adapter|campaign|ad-group|rsa|policy|transport)/.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import authentication", architecture.every((src) => !/google-ads-authentication/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(adapter|campaign|ad-group|rsa|policy|transport)(-[a-z]+)?\.ts$/.test(f));
  check("adapter, campaign, ad group, RSA, policy, and transport modules do not import authentication", prior.every((f) => !/google-ads-authentication/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports authentication", !others.some((f) => /google-ads-authentication/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import authentication", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads authentication: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
