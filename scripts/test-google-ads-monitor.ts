import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsCampaignPublisher } from "../src/lib/providers/google-ads/google-ads-publish.ts";
import { createGoogleAdsMonitor } from "../src/lib/providers/google-ads/google-ads-monitor.ts";
import { createGoogleAdsProviderHealthMonitor } from "../src/lib/providers/google-ads/google-ads-monitor-health.ts";
import {
  GOOGLE_ADS_AD_GROUP_STATUSES,
  GOOGLE_ADS_AD_STATUSES,
  GOOGLE_ADS_APPROVAL_STATUSES,
  GOOGLE_ADS_BUDGET_STATUSES,
  GOOGLE_ADS_CAMPAIGN_HEALTH,
  GOOGLE_ADS_CAMPAIGN_STATUSES,
  GOOGLE_ADS_MONITOR_STATUSES,
  GOOGLE_ADS_POLICY_STATUSES,
  GOOGLE_ADS_PROVIDER_HEALTH,
  GOOGLE_ADS_PROVIDER_STATUS_KEYS,
  GOOGLE_ADS_SYNC_METRICS_KEYS,
  GOOGLE_ADS_SYNC_REPORT_KEYS,
  GOOGLE_ADS_SYNC_RESULT_KEYS,
  GOOGLE_ADS_SYNC_SNAPSHOT_KEYS,
  createGoogleAdsSynchronizationSnapshot,
  freezeDeepGoogleAdsMonitor,
} from "../src/lib/providers/google-ads/google-ads-monitor-snapshot.ts";
import { createGoogleAdsSynchronizationValidator } from "../src/lib/providers/google-ads/google-ads-monitor-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function publishedOf(over: Record<string, unknown> = {}) {
  return {
    campaignId: "c-1",
    campaignStatus: "ACTIVE",
    budgetStatus: "PRESENT",
    approvalStatus: "APPROVED",
    policyStatus: "CLEAR",
    adGroupStatus: "ACTIVE",
    adStatus: "ACTIVE",
    ...over,
  };
}

function providerOf(over: Record<string, unknown> = {}) {
  return {
    campaignId: "c-1",
    campaignStatus: "ACTIVE",
    budgetStatus: "PRESENT",
    approvalStatus: "APPROVED",
    policyStatus: "CLEAR",
    adGroupStatus: "ACTIVE",
    adStatus: "ACTIVE",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    publishedCampaign: publishedOf(),
    providerState: providerOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE", version: "v1" },
    ...over,
  };
}

function monitorOf() {
  let n = 0;
  return createGoogleAdsMonitor({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `sync-${++n}`,
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
  const validator = createGoogleAdsSynchronizationValidator();
  const health = createGoogleAdsProviderHealthMonitor();
  check("monitor statuses are OK then REJECTED", GOOGLE_ADS_MONITOR_STATUSES.join() === "OK,REJECTED");
  check("campaign statuses are ACTIVE, PAUSED, ARCHIVED, UNKNOWN", GOOGLE_ADS_CAMPAIGN_STATUSES.join() === "ACTIVE,PAUSED,ARCHIVED,UNKNOWN");
  check("budget statuses are PRESENT, MISSING, UNKNOWN", GOOGLE_ADS_BUDGET_STATUSES.join() === "PRESENT,MISSING,UNKNOWN");
  check("approval statuses are APPROVED, PENDING, DISAPPROVED, UNKNOWN", GOOGLE_ADS_APPROVAL_STATUSES.join() === "APPROVED,PENDING,DISAPPROVED,UNKNOWN");
  check("policy statuses are CLEAR, FLAGGED, UNKNOWN", GOOGLE_ADS_POLICY_STATUSES.join() === "CLEAR,FLAGGED,UNKNOWN");
  check("ad group statuses are ACTIVE, PAUSED, UNKNOWN", GOOGLE_ADS_AD_GROUP_STATUSES.join() === "ACTIVE,PAUSED,UNKNOWN");
  check("ad statuses are ACTIVE, PAUSED, UNKNOWN", GOOGLE_ADS_AD_STATUSES.join() === "ACTIVE,PAUSED,UNKNOWN");
  check("campaign health is ALIGNED, DRIFT, MISSING, UNAVAILABLE", GOOGLE_ADS_CAMPAIGN_HEALTH.join() === "ALIGNED,DRIFT,MISSING,UNAVAILABLE");
  check("provider health is OFFLINE then UNAVAILABLE", GOOGLE_ADS_PROVIDER_HEALTH.join() === "OFFLINE,UNAVAILABLE");
  check("provider status keys are in the requested order", GOOGLE_ADS_PROVIDER_STATUS_KEYS.join() === "campaignId,campaignStatus,budgetStatus,approvalStatus,policyStatus,adGroupStatus,adStatus");
  check("result keys are in the requested order", GOOGLE_ADS_SYNC_RESULT_KEYS.join() === "id,campaignId,campaignStatus,budgetStatus,approvalStatus,policyStatus,adGroupStatus,adStatus,synchronizedAt,metadata");
  check("report keys are in the requested order", GOOGLE_ADS_SYNC_REPORT_KEYS.join() === "id,status,consistent,campaignHealth,issues,createdAt,metadata");
  check("snapshot keys are in the requested order", GOOGLE_ADS_SYNC_SNAPSHOT_KEYS.join() === "syncId,campaignId,campaignHealth,consistent,synchronizedAt,metadata");
  check("metrics keys are in the requested order", GOOGLE_ADS_SYNC_METRICS_KEYS.join() === "campaignCount,conflictCount,issueCount,executionTime");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Missing Campaign: a missing published campaign is rejected", has(validator.validateCampaign(null), /Missing Campaign/));
  check("Missing Campaign: a campaign without an id is rejected", has(validator.validateCampaign({}), /Missing Campaign/));
  check("Invalid Synchronization: a non-object input is rejected", has(validator.validateInput(null), /Invalid Synchronization/));
  check("Invalid Synchronization: an unknown campaign status is rejected", has(validator.validateState({ campaignStatus: "LIVE" }), /Invalid Synchronization/));
  check("State Conflict: mismatched campaign ids are rejected", has(validator.validateConsistency(publishedOf(), providerOf({ campaignId: "c-2" })), /State Conflict/));
  check("State Conflict: mismatched campaign status is rejected", has(validator.validateConsistency(publishedOf({ campaignStatus: "PAUSED" }), providerOf()), /State Conflict/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));

  const snap = createGoogleAdsSynchronizationSnapshot({
    syncId: "sync-1",
    campaignId: "c-1",
    campaignHealth: "ALIGNED",
    consistent: true,
    synchronizedAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_SYNC_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsMonitor never throws", freezeDeepGoogleAdsMonitor(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsMonitor({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const monitor = monitorOf();
  const built = monitor.synchronize(inputOf());
  check("the monitor returns OK with a result, provider status, report, metrics, and snapshot", built.status === "OK" && built.result !== null && built.providerStatus !== null && built.snapshot !== null && built.metrics !== null && built.errors.length === 0 && built.executionTime === 0 && built.issues.length === 0);
  check("the result restates campaign, budget, approval, policy, ad group, and ad status", built.result!.campaignId === "c-1" && built.result!.campaignStatus === "ACTIVE" && built.result!.budgetStatus === "PRESENT" && built.result!.approvalStatus === "APPROVED" && built.result!.policyStatus === "CLEAR" && built.result!.adGroupStatus === "ACTIVE" && built.result!.adStatus === "ACTIVE" && built.result!.synchronizedAt === "2026-01-01T00:00:00.000Z");
  check("a result has exactly the requested fields", Object.keys(built.result!).join() === GOOGLE_ADS_SYNC_RESULT_KEYS.join());
  check("provider status restates the same tokens", built.providerStatus!.campaignId === "c-1" && built.providerStatus!.campaignStatus === "ACTIVE" && built.providerStatus!.budgetStatus === "PRESENT");
  check("campaign health is ALIGNED when the records match", built.campaignHealth === "ALIGNED" && built.report.consistent === true && built.report.campaignHealth === "ALIGNED");
  check("provider health is OFFLINE when the records can be observed", built.health === "OFFLINE");
  check("metrics count one campaign and no conflicts", built.metrics!.campaignCount === 1 && built.metrics!.conflictCount === 0 && built.metrics!.issueCount === 0);
  check("the snapshot stores sync, campaign, and health", built.snapshot!.syncId === "sync-1" && built.snapshot!.campaignId === "c-1" && built.snapshot!.campaignHealth === "ALIGNED" && built.snapshot!.consistent === true);
  check("getSnapshot returns the stored snapshot", monitor.getSnapshot("sync-1") === built.snapshot && monitor.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.result) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.report) && Object.isFrozen(built.providerStatus));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const missingStatuses = monitorOf().synchronize(
    inputOf({
      publishedCampaign: { campaignId: "c-1" },
      providerState: { campaignId: "c-1" },
    }),
  );
  check("missing status tokens are restated as UNKNOWN", missingStatuses.status === "OK" && missingStatuses.result?.campaignStatus === "UNKNOWN" && missingStatuses.result?.budgetStatus === "UNKNOWN" && missingStatuses.result?.approvalStatus === "UNKNOWN" && missingStatuses.result?.policyStatus === "UNKNOWN" && missingStatuses.result?.adGroupStatus === "UNKNOWN" && missingStatuses.result?.adStatus === "UNKNOWN");

  const createOnly = monitorOf().synchronize(
    inputOf({
      publishedCampaign: { campaignId: "c-1", operation: "CREATE" },
      providerState: { campaignId: "c-1" },
    }),
  );
  check("CREATE is not restated as ACTIVE", createOnly.status === "OK" && createOnly.result?.campaignStatus === "UNKNOWN");

  const missing = monitorOf().synchronize(null);
  check("Invalid Synchronization: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Synchronization/) && missing.result === null && missing.campaignHealth === "UNAVAILABLE" && missing.health === "UNAVAILABLE");
  const noCampaign = monitorOf().synchronize(inputOf({ publishedCampaign: null }));
  check("Missing Campaign is refused", noCampaign.status === "REJECTED" && has(noCampaign.issues, /Missing Campaign/) && noCampaign.campaignHealth === "MISSING");
  const conflict = monitorOf().synchronize(inputOf({ providerState: providerOf({ campaignId: "c-2" }) }));
  check("State Conflict is refused", conflict.status === "REJECTED" && has(conflict.issues, /State Conflict/) && conflict.campaignHealth === "DRIFT" && conflict.metrics?.conflictCount === 1);
  const nested = monitorOf().synchronize(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.campaignHealth === "UNAVAILABLE");
  check("a refused synchronize stores no snapshot", monitorOf().getSnapshot("sync-1") === null);
  check("the error report restates the issues", conflict.errors.length === conflict.issues.length && conflict.report.status === "REJECTED" && conflict.report.consistent === false);

  const first = monitorOf().synchronize(inputOf());
  const second = monitorOf().synchronize(inputOf());
  check("Deterministic synchronization: the same records yield the same result and snapshot", first.status === "OK" && JSON.stringify(first.result) === JSON.stringify(second.result) && JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot));

  const source = inputOf();
  const once = monitorOf().synchronize(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.publishedCampaign as { campaignId: string }).campaignId = "changed";
  (source.providerState as { campaignStatus: string }).campaignStatus = "PAUSED";
  check("No mutation: changing the input after synchronize leaves the result unchanged", once.result!.metadata.run === "r1" && once.result!.campaignId === "c-1" && once.result!.campaignStatus === "ACTIVE");
  try {
    (once.result!.campaignId as string) = "hacked";
    (once.snapshot!.campaignHealth as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable synchronization: the result and snapshot cannot be assigned into", once.result!.campaignId === "c-1" && once.snapshot!.campaignHealth === "ALIGNED");

  const published = publishedOf();
  const provider = providerOf();
  const publishedBefore = JSON.stringify(published);
  const providerBefore = JSON.stringify(provider);
  const observed = monitorOf().synchronize(inputOf({ publishedCampaign: published, providerState: provider }));
  check("the monitor observes the published campaign and provider state", observed.status === "OK" && observed.result?.campaignId === "c-1");
  check("No upstream mutation: published campaign and provider state are unchanged after synchronize", JSON.stringify(published) === publishedBefore && JSON.stringify(provider) === providerBefore);
  try {
    (published as { campaignId: string }).campaignId = "hacked";
    (provider as { campaignStatus: string }).campaignStatus = "hacked";
  } catch {
    /* may be frozen by the caller, not by the monitor */
  }
  check("the observed result still restates the original tokens after the caller tampers later", observed.result!.campaignId === "c-1" && observed.result!.campaignStatus === "ACTIVE");

  const healthOk = health.check(inputOf());
  const healthMissing = health.check(inputOf({ publishedCampaign: null }));
  check("Health Check: an aligned pair is OFFLINE and ALIGNED", healthOk.status === "OFFLINE" && healthOk.campaignHealth === "ALIGNED" && healthOk.consistent === true);
  check("Health Check: a missing campaign is UNAVAILABLE and MISSING", healthMissing.status === "UNAVAILABLE" && healthMissing.campaignHealth === "MISSING" && healthMissing.consistent === false);
  const healthOnly = monitorOf();
  const checked = healthOnly.healthCheck(inputOf());
  check("Independent monitoring: healthCheck does not store a snapshot", checked.status === "OFFLINE" && healthOnly.getSnapshot("sync-1") === null);

  const left = monitorOf();
  const right = monitorOf();
  left.synchronize(inputOf());
  right.synchronize(null);
  check("Independent monitoring: monitors do not share snapshots", left.getSnapshot("sync-1")?.campaignId === "c-1" && right.getSnapshot("sync-1") === null);

  const publishedFromPublisher = createGoogleAdsCampaignPublisher({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "publish-1",
  }).apply({
    executionPlan: { id: "ep-1" },
    provider: { id: "prov-1" },
    authenticationContext: {
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
    },
    operation: "CREATE",
    campaignId: "c-1",
    executionMetadata: { run: "r1" },
    configuration: { mode: "OFFLINE", version: "v1" },
  });
  const fromPublish = monitorOf().synchronize(
    inputOf({
      publishedCampaign: publishedFromPublisher.result,
      providerState: { campaignId: publishedFromPublisher.result?.campaignId },
    }),
  );
  check("a published campaign record can be observed without changing it", fromPublish.status === "OK" && fromPublish.result?.campaignId === "c-1" && fromPublish.result?.campaignStatus === "UNKNOWN" && publishedFromPublisher.result?.operation === "CREATE");

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-monitor(-[a-z]+)?\.ts$/.test(f));
  check("five monitor modules exist: monitor, health, snapshot, synchronizer, validator", files.sort().join() === "google-ads-monitor-health.ts,google-ads-monitor-snapshot.ts,google-ads-monitor-synchronizer.ts,google-ads-monitor-validator.ts,google-ads-monitor.ts");
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
  check("imports were found", imports.length >= 6);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  check("the monitor does not import adapter, campaign, ad group, RSA, policy, transport, authentication, client, or publish factories", !imports.some((i) => /google-ads-(adapter|campaign|ad-group|rsa|policy|transport|authentication|client|publish)/.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import monitor", architecture.every((src) => !/google-ads-monitor/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(adapter|campaign|ad-group|rsa|policy|transport|authentication|client|publish)(-[a-z]+)?\.ts$/.test(f));
  check("prior google-ads modules do not import monitor", prior.every((f) => !/google-ads-monitor/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports monitor", !others.some((f) => /google-ads-monitor/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import monitor", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads monitoring and synchronization: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
