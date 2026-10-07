/**
 * Google Ads Provider — RC1 acceptance audit.
 * Validation only. Does not add engine behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { GOOGLE_ADS_CONTEXT_MEMBERS } from "../src/lib/providers/google-ads/google-ads-context.ts";
import { GOOGLE_ADS_CAMPAIGN_KEYS, GOOGLE_ADS_MODEL_KEYS } from "../src/lib/providers/google-ads/google-ads-types.ts";
import { createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { createGoogleAdsCampaignValidator } from "../src/lib/providers/google-ads/google-ads-campaign-validator.ts";
import { GOOGLE_ADS_CAMPAIGN_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-campaign-snapshot.ts";
import { createGoogleAdsAdGroupBuilder } from "../src/lib/providers/google-ads/google-ads-ad-group-builder.ts";
import { createGoogleAdsAdGroupValidator } from "../src/lib/providers/google-ads/google-ads-ad-group-validator.ts";
import { GOOGLE_ADS_AD_GROUP_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-ad-group-snapshot.ts";
import { createGoogleAdsRsaBuilder } from "../src/lib/providers/google-ads/google-ads-rsa-builder.ts";
import { createGoogleAdsRsaValidator } from "../src/lib/providers/google-ads/google-ads-rsa-validator.ts";
import { GOOGLE_ADS_RSA_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-rsa-snapshot.ts";
import { createGoogleAdsCampaignValidationEngine } from "../src/lib/providers/google-ads/google-ads-policy-engine.ts";
import { createGoogleAdsAdapter } from "../src/lib/providers/google-ads/google-ads-adapter.ts";
import { createGoogleAdsValidationAdapter } from "../src/lib/providers/google-ads/google-ads-adapter-validator.ts";
import { GOOGLE_ADS_ADAPTER_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-adapter-snapshot.ts";
import { createGoogleAdsTransport } from "../src/lib/providers/google-ads/google-ads-transport.ts";
import { createGoogleAdsTransportValidator } from "../src/lib/providers/google-ads/google-ads-transport-validator.ts";
import { GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-transport-snapshot.ts";
import { createGoogleAdsAuthentication } from "../src/lib/providers/google-ads/google-ads-authentication.ts";
import { GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-authentication-snapshot.ts";
import { createGoogleAdsApiClient } from "../src/lib/providers/google-ads/google-ads-client.ts";
import { GOOGLE_ADS_CLIENT_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-client-health.ts";
import { createGoogleAdsCampaignPublisher } from "../src/lib/providers/google-ads/google-ads-publish.ts";
import { GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-publish-snapshot.ts";
import { createGoogleAdsMonitor } from "../src/lib/providers/google-ads/google-ads-monitor.ts";
import { GOOGLE_ADS_SYNC_SNAPSHOT_KEYS } from "../src/lib/providers/google-ads/google-ads-monitor-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const clocks = (prefix: string) => {
  let n = 0;
  return { now: () => 0, timestamp: () => T0, idFactory: () => `${prefix}-${(n += 1)}` };
};
function timed<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function campaignSpec() {
  return {
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
  };
}
function campaignInput(over: Record<string, unknown> = {}) {
  return {
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    campaigns: [campaignSpec()],
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
function adGroupInput(campaignModel: unknown, over: Record<string, unknown> = {}) {
  return {
    campaignModel,
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    adGroups: [{ id: "g-1", name: "core", campaignId: "c-1", defaultBidId: "db-1", bidStrategyId: "bs-1", keywordIds: ["k-1"], negativeKeywordIds: [], audienceIds: [], deviceIds: [], metadata: {} }],
    defaultBids: [{ id: "db-1", name: "manual-default", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
    keywords: [{ id: "k-1", adGroupId: "g-1", text: "alpha term", metadata: {} }],
    ...over,
  };
}
function rsaInput(campaignModel: unknown, adGroupModel: unknown, over: Record<string, unknown> = {}) {
  return {
    campaignModel,
    adGroupModel,
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
    ...over,
  };
}
function authConfig() {
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
  };
}
function publishInput(authenticationContext: unknown, over: Record<string, unknown> = {}) {
  return {
    executionPlan: { id: "ep-1" },
    provider: { id: "prov-1" },
    authenticationContext,
    operation: "CREATE",
    campaignId: "c-1",
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE", version: "v1" },
    ...over,
  };
}

async function main() {
  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"];
  check("Google Ads Architecture: five contract modules remain", architecture.every((f) => readdirSync(dir).includes(f)));
  check("Google Ads Architecture: context members are unchanged", GOOGLE_ADS_CONTEXT_MEMBERS.join() === "executionContract,executionPlan,executionMetadata,runtimeMetadata");
  check("Google Ads Architecture: campaign keys are unchanged", GOOGLE_ADS_CAMPAIGN_KEYS.join() === "id,name,budgetId,settingsId,metadata");
  check(
    "Google Ads Architecture: model keys are unchanged",
    GOOGLE_ADS_MODEL_KEYS.join() ===
      "id,executionContractId,executionPlanId,campaigns,budgets,settings,adGroups,keywords,negativeKeywords,responsiveSearchAds,headlines,descriptions,finalUrls,trackingTemplates,audiences,locations,languages,bidStrategies,assets,extensions,conversionGoals,metadata",
  );
  check("Google Ads Architecture: architecture stays contracts only", architecture.every((f) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, f), "utf8"))));
  check("Campaign Snapshots: campaign snapshot keys are unchanged", GOOGLE_ADS_CAMPAIGN_SNAPSHOT_KEYS.join() === "campaignModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,campaignIds,createdAt,metadata");
  check("Ad Group Snapshots: ad group snapshot keys are unchanged", GOOGLE_ADS_AD_GROUP_SNAPSHOT_KEYS.join() === "adGroupModelId,campaignModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,adGroupIds,createdAt,metadata");
  check("RSA Snapshots: RSA snapshot keys are unchanged", GOOGLE_ADS_RSA_SNAPSHOT_KEYS.join() === "rsaModelId,campaignModelId,adGroupModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,rsaIds,createdAt,metadata");
  check("Adapter Snapshots: payload snapshot keys are unchanged", GOOGLE_ADS_ADAPTER_SNAPSHOT_KEYS.join() === "payloadId,campaignModelId,adGroupModelId,rsaModelId,executionPlanId,resourceIds,createdAt,metadata");
  check("Transport Snapshots: transport snapshot keys are unchanged", GOOGLE_ADS_TRANSPORT_SNAPSHOT_KEYS.join() === "transportId,payloadId,requestId,responseId,mode,health,createdAt,metadata");
  check("Authentication Snapshots: authentication snapshot keys are unchanged", GOOGLE_ADS_AUTHENTICATION_SNAPSHOT_KEYS.join() === "authenticationId,sessionId,clientId,customerId,mode,health,createdAt,metadata");
  check("API Client Snapshots: client snapshot keys are unchanged", GOOGLE_ADS_CLIENT_SNAPSHOT_KEYS.join() === "clientId,sessionId,requestId,version,health,createdAt,metadata");
  check("Publish Snapshots: publish snapshot keys are unchanged", GOOGLE_ADS_PUBLISH_SNAPSHOT_KEYS.join() === "publishId,planId,providerId,campaignId,operation,status,createdAt,metadata");
  check("Synchronization Snapshots: sync snapshot keys are unchanged", GOOGLE_ADS_SYNC_SNAPSHOT_KEYS.join() === "syncId,campaignId,campaignHealth,consistent,synchronizedAt,metadata");

  const campaignBuilder = createGoogleAdsCampaignBuilder(clocks("model"));
  const campaign = campaignBuilder.build(campaignInput());
  check("Campaign Builder: a well-formed campaign builds a frozen model", campaign.status === "OK" && campaign.model !== null && campaign.snapshot !== null && Object.isFrozen(campaign.model) && Object.isFrozen(campaign.snapshot) && campaign.model.campaigns[0]?.id === "c-1");
  check("Campaign Model: the model keeps execution, decision, and workflow as ids only", campaign.model!.executionPlanId === "ep-1" && campaign.model!.executionContractIds.join() === "ec-1" && campaign.model!.decisionAnalysisId === "d-1" && campaign.model!.workflowSnapshotId === "snap-1");

  const adGroupBuilder = createGoogleAdsAdGroupBuilder(clocks("adgroup"));
  const campaignBeforeAdGroup = JSON.stringify(campaign.model);
  const adGroup = adGroupBuilder.build(adGroupInput(campaign.model));
  check("Ad Group Builder: a well-formed ad group builds a frozen model", adGroup.status === "OK" && adGroup.model !== null && adGroup.snapshot !== null && Object.isFrozen(adGroup.model) && adGroup.model.adGroups[0]?.id === "g-1");
  check("Ad Group Model: the campaign model is unchanged after an ad group build", JSON.stringify(campaign.model) === campaignBeforeAdGroup && adGroup.model!.campaignModelId === campaign.model!.id);

  const rsaBuilder = createGoogleAdsRsaBuilder(clocks("rsa"));
  const campaignBeforeRsa = JSON.stringify(campaign.model);
  const adGroupBeforeRsa = JSON.stringify(adGroup.model);
  const rsa = rsaBuilder.build(rsaInput(campaign.model, adGroup.model));
  check("RSA Builder: a well-formed RSA builds a frozen model", rsa.status === "OK" && rsa.model !== null && rsa.snapshot !== null && Object.isFrozen(rsa.model) && rsa.model.responsiveSearchAds[0]?.id === "rsa-1" && rsa.model.responsiveSearchAds[0]?.finalUrl.url === "https://example.test/offer");
  check("Responsive Search Ads: prior models are unchanged after an RSA build", JSON.stringify(campaign.model) === campaignBeforeRsa && JSON.stringify(adGroup.model) === adGroupBeforeRsa);

  const policy = createGoogleAdsCampaignValidationEngine(clocks("validation")).validate({
    campaignModel: campaign.model,
    adGroupModel: adGroup.model,
    responsiveSearchAds: rsa.model,
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    executionMetadata: { run: "r1" },
  });
  check("Campaign Validation: a well-formed set is HEALTHY and frozen", policy.status === "OK" && policy.snapshot !== null && policy.health === "HEALTHY" && Object.isFrozen(policy.snapshot) && Object.isFrozen(policy.report));

  const campaignBeforeAdapt = JSON.stringify(campaign.model);
  const adGroupBeforeAdapt = JSON.stringify(adGroup.model);
  const rsaBeforeAdapt = JSON.stringify(rsa.model);
  const adapted = createGoogleAdsAdapter(clocks("payload")).adapt({
    campaignModel: campaign.model,
    adGroupModel: adGroup.model,
    responsiveSearchAds: rsa.model,
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    executionMetadata: { run: "r1" },
  });
  check("Payload Mapping: adapt returns a frozen local payload", adapted.status === "OK" && adapted.payload !== null && adapted.snapshot !== null && Object.isFrozen(adapted.payload) && adapted.payload.campaignRequests[0]?.id === "c-1" && adapted.payload.responsiveSearchAdRequests[0]?.finalUrl === "https://example.test/offer");
  check("Payload Mapping: prior models are unchanged after adapt", JSON.stringify(campaign.model) === campaignBeforeAdapt && JSON.stringify(adGroup.model) === adGroupBeforeAdapt && JSON.stringify(rsa.model) === rsaBeforeAdapt);

  const payloadBeforeTransport = JSON.stringify(adapted.payload);
  const transported = createGoogleAdsTransport(clocks("transport")).prepare({
    requestModel: adapted.payload,
    executionMetadata: { run: "r1" },
    configuration: { mode: "OFFLINE", version: "v1" },
  });
  check("Transport Layer: prepare stays OFFLINE with a frozen request", transported.status === "OK" && transported.preparedRequest !== null && transported.health === "OFFLINE" && transported.preparedRequest.mode === "OFFLINE" && Object.isFrozen(transported.preparedRequest) && Object.isFrozen(transported.snapshot));
  check("Transport Layer: the payload is unchanged after prepare", JSON.stringify(adapted.payload) === payloadBeforeTransport);

  const authenticated = createGoogleAdsAuthentication(clocks("auth")).authenticate({
    configuration: authConfig(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
  });
  check("Authentication Context: authenticate stays OFFLINE without secrets on the context", authenticated.status === "OK" && authenticated.context !== null && authenticated.context.mode === "OFFLINE" && authenticated.health === "OFFLINE" && !("clientSecret" in authenticated.context) && !("accessToken" in authenticated.context) && Object.isFrozen(authenticated.context));

  const requestBeforeClient = JSON.stringify(transported.preparedRequest);
  const sessionBeforeClient = JSON.stringify(authenticated.context);
  const executed = createGoogleAdsApiClient(clocks("client")).execute({
    authenticationContext: authenticated.context,
    preparedRequest: transported.preparedRequest,
    executionMetadata: { run: "r1" },
    configuration: { mode: "OFFLINE", version: "v1" },
  });
  check("API Client: execute stays OFFLINE with a frozen snapshot", executed.status === "OK" && executed.snapshot !== null && executed.health === "OFFLINE" && Object.isFrozen(executed.snapshot));
  check("API Client: session and prepared request are unchanged after execute", JSON.stringify(transported.preparedRequest) === requestBeforeClient && JSON.stringify(authenticated.context) === sessionBeforeClient);

  const published = createGoogleAdsCampaignPublisher(clocks("publish")).apply(publishInput(authenticated.context));
  check("Publish Operations: CREATE applies offline with a frozen result", published.status === "OK" && published.result !== null && published.snapshot !== null && published.result.operation === "CREATE" && published.result.campaignId === "c-1" && Object.isFrozen(published.result) && Object.isFrozen(published.snapshot));

  const publishedBeforeSync = JSON.stringify(published.result);
  const synced = createGoogleAdsMonitor(clocks("sync")).synchronize({
    publishedCampaign: published.result,
    providerState: { campaignId: published.result?.campaignId },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
  });
  check("Synchronization: observe-only sync restates UNKNOWN and does not treat CREATE as ACTIVE", synced.status === "OK" && synced.result !== null && synced.snapshot !== null && synced.result.campaignStatus === "UNKNOWN" && synced.campaignHealth === "ALIGNED" && synced.health === "OFFLINE" && Object.isFrozen(synced.result) && Object.isFrozen(synced.snapshot));
  const healthMonitor = createGoogleAdsMonitor(clocks("health"));
  check("Monitoring: healthCheck does not store a snapshot", healthMonitor.healthCheck({ publishedCampaign: published.result, providerState: { campaignId: "c-1" } }).status === "OFFLINE" && healthMonitor.getSnapshot("health-1") === null);
  check("Monitoring: the published result is unchanged after synchronize", JSON.stringify(published.result) === publishedBeforeSync);

  const campaignValidator = createGoogleAdsCampaignValidator();
  const adGroupValidator = createGoogleAdsAdGroupValidator();
  const rsaValidator = createGoogleAdsRsaValidator();
  const adapterValidator = createGoogleAdsValidationAdapter();
  const transportValidator = createGoogleAdsTransportValidator();
  check("Negative: Duplicate Campaign is refused", createGoogleAdsCampaignBuilder(clocks("dup-c")).build(campaignInput({ campaigns: [campaignSpec(), campaignSpec()] })).status === "REJECTED" && has(campaignValidator.validateInput(campaignInput({ campaigns: [campaignSpec(), campaignSpec()] })), /Duplicate Campaign/));
  check("Negative: Invalid Campaign is refused", createGoogleAdsCampaignBuilder(clocks("bad-c")).build(null).status === "REJECTED" && has(campaignValidator.validateInput(null), /Invalid Campaign/));
  check("Negative: Duplicate Ad Group is refused", createGoogleAdsAdGroupBuilder(clocks("dup-g")).build(adGroupInput(campaign.model, { adGroups: [{ id: "g-1", name: "core", campaignId: "c-1", defaultBidId: "db-1", metadata: {} }, { id: "g-1", name: "other", campaignId: "c-1", defaultBidId: "db-1", metadata: {} }] })).status === "REJECTED" && has(adGroupValidator.validateInput(adGroupInput(campaign.model, { adGroups: [{ id: "g-1", name: "core", campaignId: "c-1", defaultBidId: "db-1", metadata: {} }, { id: "g-1", name: "other", campaignId: "c-1", defaultBidId: "db-1", metadata: {} }] })), /Duplicate Ad Group/));
  check("Negative: Invalid Ad Group is refused", createGoogleAdsAdGroupBuilder(clocks("bad-g")).build(adGroupInput(campaign.model, { adGroups: [{ id: "g-1", name: "", campaignId: "c-1", defaultBidId: "db-1", metadata: {} }] })).status === "REJECTED" && has(adGroupValidator.validateAdGroup({ id: "g-1", name: "", campaignId: "c-1", defaultBidId: "db-1" }), /Missing Name/));
  const dupRsaMapping = adapterValidator.validateMapping({
    responsiveSearchAdRequests: [
      { resource: "responsiveSearchAd", id: "rsa-1", adGroupId: "g-1", headlines: ["a"], descriptions: ["b"], finalUrl: "https://example.test/offer", metadata: {} },
      { resource: "responsiveSearchAd", id: "rsa-1", adGroupId: "g-1", headlines: ["a"], descriptions: ["b"], finalUrl: "https://example.test/offer", metadata: {} },
    ],
  });
  check("Negative: Duplicate Responsive Search Ad is refused", has(dupRsaMapping, /Duplicate Resources/));
  check("Negative: Invalid URL is refused", createGoogleAdsRsaBuilder(clocks("bad-url")).build(rsaInput(campaign.model, adGroup.model, { finalUrls: [{ id: "u-1", url: "ftp://example.test" }] })).status === "REJECTED" && has(rsaValidator.validateFinalUrl("not-a-url"), /Invalid Final URL/));
  check("Negative: Invalid Authentication is refused", createGoogleAdsAuthentication(clocks("bad-auth")).authenticate({ configuration: { ...authConfig(), clientId: "" } }).status === "REJECTED" && createGoogleAdsCampaignPublisher(clocks("no-auth")).apply(publishInput(null)).status === "REJECTED");
  check("Negative: Invalid Payload is refused", createGoogleAdsTransport(clocks("bad-payload")).prepare({ requestModel: { id: "payload-1", campaignRequests: "nope" }, configuration: { mode: "OFFLINE", version: "v1" } }).status === "REJECTED" && has(transportValidator.validatePayload({ id: "payload-1", campaignRequests: "nope" }), /Invalid Payload/));
  check("Negative: Invalid Publish Operation is refused", createGoogleAdsCampaignPublisher(clocks("bad-op")).apply(publishInput(authenticated.context, { operation: "OPTIMIZE" })).status === "REJECTED");
  const malformed = createGoogleAdsCampaignPublisher({
    ...clocks("malformed"),
    client: { execute: () => ({ status: "OK", parsedResponse: { body: "nope" }, execution: null }) },
  }).apply(publishInput(authenticated.context));
  check("Negative: Malformed Provider Response is refused", malformed.status === "REJECTED" && has(malformed.issues, /Malformed Provider Response/));
  const duplicatePublisher = createGoogleAdsCampaignPublisher(clocks("dup-pub"));
  duplicatePublisher.apply(publishInput(authenticated.context));
  const duplicatePublish = duplicatePublisher.apply(publishInput(authenticated.context));
  check("Negative: Duplicate Publish is refused", duplicatePublish.status === "REJECTED" && has(duplicatePublish.issues, /Conflict/));
  check("Negative: Invalid Metadata is refused", createGoogleAdsCampaignBuilder(clocks("bad-meta")).build(campaignInput({ executionMetadata: { a: { b: 1 } } })).status === "REJECTED" && createGoogleAdsMonitor(clocks("bad-sync-meta")).synchronize({ publishedCampaign: { campaignId: "c-1" }, providerState: { campaignId: "c-1" }, executionMetadata: { a: { b: 1 } } }).status === "REJECTED");

  const left = createGoogleAdsMonitor(clocks("left"));
  const right = createGoogleAdsMonitor(clocks("right"));
  left.synchronize({ publishedCampaign: { campaignId: "c-1" }, providerState: { campaignId: "c-1" } });
  right.synchronize(null);
  check("Provider independence: monitors do not share snapshots", left.getSnapshot("left-1")?.campaignId === "c-1" && right.getSnapshot("right-1") === null);
  const first = createGoogleAdsCampaignBuilder({ now: () => 0, timestamp: () => T0, idFactory: () => "model-fixed" }).build(campaignInput());
  const second = createGoogleAdsCampaignBuilder({ now: () => 0, timestamp: () => T0, idFactory: () => "model-fixed" }).build(campaignInput());
  check("Deterministic campaign build: the same records yield the same model", first.status === "OK" && JSON.stringify(first.model) === JSON.stringify(second.model));

  try {
    (campaign.snapshot!.campaignIds as unknown as string[])[0] = "hacked";
    (adapted.snapshot!.payloadId as string) = "hacked";
    (synced.snapshot!.campaignHealth as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshots: campaign, payload, and sync snapshots cannot be assigned into", campaign.snapshot!.campaignIds[0] === "c-1" && adapted.snapshot!.payloadId.startsWith("payload-") && synced.snapshot!.campaignHealth === "ALIGNED");

  const campaignTimed = timed(() => createGoogleAdsCampaignBuilder(clocks("perf-c")).build(campaignInput()));
  const adGroupTimed = timed(() => createGoogleAdsAdGroupBuilder(clocks("perf-g")).build(adGroupInput(campaign.model)));
  const rsaTimed = timed(() => createGoogleAdsRsaBuilder(clocks("perf-rsa")).build(rsaInput(campaign.model, adGroup.model)));
  const mappingTimed = timed(() =>
    createGoogleAdsAdapter(clocks("perf-map")).adapt({
      campaignModel: campaign.model,
      adGroupModel: adGroup.model,
      responsiveSearchAds: rsa.model,
      executionPlan: { id: "ep-1" },
      executionMetadata: { run: "r1" },
    }),
  );
  const transportTimed = timed(() =>
    createGoogleAdsTransport(clocks("perf-t")).prepare({
      requestModel: adapted.payload,
      configuration: { mode: "OFFLINE", version: "v1" },
    }),
  );
  const authTimed = timed(() => createGoogleAdsAuthentication(clocks("perf-a")).authenticate({ configuration: authConfig(), executionMetadata: { run: "r1" } }));
  const publishTimed = timed(() => createGoogleAdsCampaignPublisher(clocks("perf-p")).apply(publishInput(authenticated.context)));
  const syncTimed = timed(() =>
    createGoogleAdsMonitor(clocks("perf-s")).synchronize({
      publishedCampaign: published.result,
      providerState: { campaignId: "c-1" },
      executionMetadata: { run: "r1" },
    }),
  );
  const perfRows: Array<[string, number, boolean]> = [
    ["Campaign Build", campaignTimed.ms, campaignTimed.value.status === "OK"],
    ["Ad Group Build", adGroupTimed.ms, adGroupTimed.value.status === "OK"],
    ["RSA Build", rsaTimed.ms, rsaTimed.value.status === "OK"],
    ["Payload Mapping", mappingTimed.ms, mappingTimed.value.status === "OK"],
    ["Transport Preparation", transportTimed.ms, transportTimed.value.status === "OK"],
    ["Authentication Validation", authTimed.ms, authTimed.value.status === "OK"],
    ["Publish Preparation", publishTimed.ms, publishTimed.value.status === "OK"],
    ["Synchronization", syncTimed.ms, syncTimed.value.status === "OK"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check(`${name} completes in under 2000ms`, ok && ms < 2000);
  }

  const files = walk(dir).filter((f) => f.endsWith(".ts"));
  const joined = files.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("No Product Hardcoding", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("No Campaign Hardcoding", !bare.some((l) => /customers\/\d{6,}|campaigns\/\d{6,}|\b\d{10,11}\b/.test(l)));
  check("No Customer Hardcoding", !bare.some((l) => /\b\d{3}-\d{3}-\d{4}\b|login-customer-id\s*[:=]\s*["']\d+/.test(l)));
  check("No Google Account Hardcoding", !bare.some((l) => /@[a-z0-9.-]+\.(com|org)|accounts\.google|googleapis\.com/i.test(l)));
  check("No Hidden Switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  const valueImports = [...joined.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  check("No Discovery, Opportunity, Traffic, Decision, Workflow, or Execution value imports", !valueImports.some((from) => /discovery|opportunity|traffic|decision|workflow|execution/.test(from)));
  check("No Discovery, Opportunity, Traffic, Decision, Workflow, or Execution mutation", !bare.some((l) => /\.(candidate|opportunityAnalysis|trafficAnalysis|decisionAnalysis|workflowSnapshot|executionPlan)\s*=(?!=)/.test(l)));
  check("No LP Builder, Platform, HTTP, database, or file writes", !code.some((l) => /fetch\(|node:http|better-sqlite3|getDb|writeFile|appendFile|node:fs/.test(l)) && !valueImports.some((from) => /lp-builder|platform/.test(from)));
  check("Backward compatibility: architecture remains five contract modules", architecture.every((f) => readdirSync(dir).includes(f)));
  check("Backward compatibility: campaign builder remains five modules", readdirSync(dir).filter((f) => /^google-ads-campaign-[a-z]+\.ts$/.test(f)).length === 5);
  check("Backward compatibility: ad group builder remains five modules", readdirSync(dir).filter((f) => /^google-ads-ad-group-[a-z]+\.ts$/.test(f)).length === 5);
  check("Backward compatibility: RSA builder remains five modules", readdirSync(dir).filter((f) => /^google-ads-rsa-[a-z]+\.ts$/.test(f)).length === 5);
  check("Backward compatibility: policy framework remains five modules", readdirSync(dir).filter((f) => /^google-ads-policy-[a-z]+\.ts$/.test(f)).length === 5);
  check("Backward compatibility: adapter remains five modules", readdirSync(dir).filter((f) => /^google-ads-adapter(-[a-z]+)?\.ts$/.test(f)).length === 5);
  check("Backward compatibility: transport remains five modules", readdirSync(dir).filter((f) => /^google-ads-transport(-[a-z]+)?\.ts$/.test(f)).length === 5);
  check("Backward compatibility: authentication remains five modules", readdirSync(dir).filter((f) => /^google-ads-authentication(-[a-z]+)?\.ts$/.test(f)).length === 5);
  check("Backward compatibility: API client remains five modules", readdirSync(dir).filter((f) => /^google-ads-client(-[a-z]+)?\.ts$/.test(f)).length === 5);
  check("Backward compatibility: publish remains five modules", readdirSync(dir).filter((f) => /^google-ads-publish(-[a-z]+)?\.ts$/.test(f)).length === 5);
  check("Backward compatibility: monitor remains five modules", readdirSync(dir).filter((f) => /^google-ads-monitor(-[a-z]+)?\.ts$/.test(f)).length === 5);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision", "src/lib/workflow", "src/lib/execution"].flatMap((d) => {
    try {
      return walk(join(process.cwd(), d)).filter((f) => f.endsWith(".ts"));
    } catch {
      return [];
    }
  });
  check("No Discovery, Opportunity, Traffic, Decision, Workflow, or Execution module imports the Google Ads Provider", !others.some((f) => /from ["'][^"']*google-ads|from ["'][^"']*providers\/google-ads/.test(readFileSync(f, "utf8"))));

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
  console.log("\nGoogle Ads Provider RC1 acceptance: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
