import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { createGoogleAdsAdGroupBuilder } from "../src/lib/providers/google-ads/google-ads-ad-group-builder.ts";
import { createGoogleAdsRsaBuilder } from "../src/lib/providers/google-ads/google-ads-rsa-builder.ts";
import { GOOGLE_ADS_POLICY_STATUSES, createGoogleAdsCampaignValidationEngine } from "../src/lib/providers/google-ads/google-ads-policy-engine.ts";
import { createGoogleAdsCampaignIssueRegistry } from "../src/lib/providers/google-ads/google-ads-policy-registry.ts";
import {
  GOOGLE_ADS_CAMPAIGN_HEALTH,
  GOOGLE_ADS_POLICY_AREAS,
  GOOGLE_ADS_POLICY_ISSUE_KINDS,
  GOOGLE_ADS_POLICY_ISSUE_KEYS,
  GOOGLE_ADS_POLICY_REPORT_KEYS,
  GOOGLE_ADS_POLICY_SNAPSHOT_KEYS,
  createGoogleAdsCampaignPolicySnapshot,
  freezeDeepGoogleAdsPolicy,
  type GoogleAdsPolicyIssue,
} from "../src/lib/providers/google-ads/google-ads-policy-snapshot.ts";
import { computeGoogleAdsCampaignValidationStatistics } from "../src/lib/providers/google-ads/google-ads-policy-statistics.ts";
import { createGoogleAdsCampaignPolicyValidator } from "../src/lib/providers/google-ads/google-ads-policy-validator.ts";

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
    network: { id: "net-1", name: "search", metadata: {} },
    locations: [{ id: "loc-1", name: "US", metadata: {} }],
    languages: [{ id: "lang-1", name: "en", metadata: {} }],
    schedule: { id: "sch-1", name: "all-day", metadata: {} },
    bidStrategy: { id: "bs-1", name: "manual", metadata: {} },
    metadata: {},
    ...over,
  };
}

function adGroupOf(over: Record<string, unknown> = {}) {
  return {
    id: "g-1",
    name: "core",
    campaignId: "c-1",
    defaultBid: { id: "db-1", name: "manual-default", metadata: {} },
    targetCpa: null,
    targetRoas: null,
    keywords: [],
    negativeKeywords: [],
    audiences: [],
    devices: [],
    bidStrategy: { id: "bs-1", name: "manual", metadata: {} },
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
    displayPath: { id: "p-1", text: "offer", metadata: {} },
    trackingTemplate: { id: "t-1", text: "{lpurl}?src=host", metadata: {} },
    urlSuffix: { id: "suf-1", text: "utm=host", metadata: {} },
    pinnedAssets: [{ id: "pin-1", name: "headline-pin", metadata: {} }],
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

function engineOf() {
  let n = 0;
  return createGoogleAdsCampaignValidationEngine({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `validation-${++n}`,
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
  const validator = createGoogleAdsCampaignPolicyValidator();
  check("issue kinds are Error, Warning, Recommendation, Information", GOOGLE_ADS_POLICY_ISSUE_KINDS.join() === "ERROR,WARNING,RECOMMENDATION,INFORMATION");
  check("campaign health values are HEALTHY, ATTENTION, UNHEALTHY", GOOGLE_ADS_CAMPAIGN_HEALTH.join() === "HEALTHY,ATTENTION,UNHEALTHY");
  check("validation areas are in the requested order", GOOGLE_ADS_POLICY_AREAS.join() === "campaignStructure,adGroups,responsiveSearchAds,requiredFields,urls,trackingTemplates,duplicateAssets,metadata");
  check("issue keys are in the requested order", GOOGLE_ADS_POLICY_ISSUE_KEYS.join() === "id,kind,area,field,message");
  check("snapshot keys are in the requested order", GOOGLE_ADS_POLICY_SNAPSHOT_KEYS.join() === "validationId,campaignModelId,adGroupModelId,rsaModelId,executionPlanId,issueIds,health,createdAt,metadata");
  check("report keys are in the requested order", GOOGLE_ADS_POLICY_REPORT_KEYS.join() === "id,status,health,issues,warnings,metadata,executionTime,createdAt");
  check("engine statuses are OK then REJECTED", GOOGLE_ADS_POLICY_STATUSES.join() === "OK,REJECTED");

  check("a well-formed campaign model is accepted", validator.validateCampaignStructure(inputOf()).every((i) => i.kind !== "ERROR"));
  check("Corrupted Campaign Model: a non-object is rejected", has(validator.validateInput(null), /Corrupted Campaign Model/));
  check("Corrupted Campaign Model: a missing campaign model is rejected", has(validator.validateInput({}), /Corrupted Campaign Model/));
  check("Missing Required Fields: a campaign without a name is rejected", has(validator.validateRequiredFields(inputOf({ campaignModel: { id: "model-1", campaigns: [campaignOf({ name: "" })] } })), /Missing Required Fields/));
  check("Invalid URLs: a non-https final URL is rejected", has(validator.validateUrls(inputOf({ responsiveSearchAds: { id: "rsamodel-1", responsiveSearchAds: [rsaOf({ finalUrl: { id: "u-1", url: "not-a-url", metadata: {} } })] } })), /Invalid URLs/));
  check("Duplicate Assets: a second campaign id is rejected", has(validator.validateDuplicateAssets(inputOf({ campaignModel: { id: "model-1", campaigns: [campaignOf(), campaignOf()] } })), /Duplicate Assets/));
  check("Invalid Metadata: nested campaign metadata is rejected", has(validator.validateMetadata(inputOf({ executionMetadata: { a: { b: 1 } } })), /Invalid Metadata/));
  check("a missing tracking template is a recommendation", validator.validateTrackingTemplates(inputOf({ responsiveSearchAds: { id: "rsamodel-1", responsiveSearchAds: [rsaOf({ trackingTemplate: null })] } })).some((i) => i.kind === "RECOMMENDATION"));

  const snap = createGoogleAdsCampaignPolicySnapshot({
    validationId: "validation-1",
    campaignModelId: "model-1",
    adGroupModelId: "adgroup-1",
    rsaModelId: "rsamodel-1",
    executionPlanId: "ep-1",
    issueIds: ["corrupt-1"],
    health: "HEALTHY",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_POLICY_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.issueIds) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsPolicy never throws", freezeDeepGoogleAdsPolicy(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsPolicy({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const sampleIssue: GoogleAdsPolicyIssue = { id: "issue-1", kind: "ERROR", area: "urls", field: "finalUrl", message: "Invalid URLs: a well-formed https address is required." };
  const stats = computeGoogleAdsCampaignValidationStatistics(
    [sampleIssue, { id: "issue-2", kind: "WARNING", area: "adGroups", field: "adGroups", message: "No ad groups are listed." }, { id: "issue-3", kind: "RECOMMENDATION", area: "trackingTemplates", field: "trackingTemplate", message: "A tracking template is not listed." }, { id: "issue-4", kind: "INFORMATION", area: "adGroups", field: "adGroupModel", message: "An ad group model was not given." }],
    { campaignCount: 1, adGroupCount: 1, rsaCount: 1 },
  );
  check("Validation Statistics count each issue kind", stats.issueCount === 4 && stats.errorCount === 1 && stats.warningCount === 1 && stats.recommendationCount === 1 && stats.informationCount === 1 && stats.campaignCount === 1);

  const registry = createGoogleAdsCampaignIssueRegistry();
  registry.register(sampleIssue);
  check("the registry registers, gets, and lists issues", registry.get("issue-1")?.kind === "ERROR" && registry.get("missing") === null && registry.list().length === 1 && registry.listByKind("ERROR").length === 1);
  check("the registry validates without registering", registry.validate(sampleIssue).length === 0 && registry.validate(null).length === 1 && registry.get("issue-2") === null);
  let duplicateIssue = false;
  try {
    registry.register(sampleIssue);
  } catch (error) {
    duplicateIssue = error instanceof Error && /Duplicate Assets/.test(error.message);
  }
  check("Duplicate Assets: a second issue id is rejected by the registry", duplicateIssue && registry.list().length === 1);

  const engine = engineOf();
  const built = engine.validate(inputOf());
  check("the engine returns OK with a report, issues, health, warnings, statistics, snapshot, and execution time", built.status === "OK" && built.report !== null && built.snapshot !== null && built.statistics !== null && built.health === "HEALTHY" && built.executionTime === 0);
  check("the report carries campaign health and an issue list", built.report!.health === "HEALTHY" && built.report!.status === "OK" && Array.isArray(built.issues) && built.report!.id === "validation-1");
  check("the snapshot stores validation, campaign, ad group, RSA, and plan ids", built.snapshot!.validationId === "validation-1" && built.snapshot!.campaignModelId === "model-1" && built.snapshot!.adGroupModelId === "adgroup-1" && built.snapshot!.rsaModelId === "rsamodel-1" && built.snapshot!.executionPlanId === "ep-1");
  check("getSnapshot returns the stored snapshot", engine.getSnapshot("validation-1") === built.snapshot && engine.getSnapshot("nope") === null);
  check("the report and snapshot are frozen", Object.isFrozen(built.report) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.issues) && Object.isFrozen(built.statistics));
  check("a report has exactly the requested fields", Object.keys(built.report!).join() === GOOGLE_ADS_POLICY_REPORT_KEYS.join());

  const corrupt = engineOf().validate(null);
  check("Corrupted Campaign Model is refused", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Campaign Model/) && corrupt.health === "UNHEALTHY");
  const missingName = engineOf().validate(inputOf({ campaignModel: { id: "model-1", campaigns: [campaignOf({ name: "" })] } }));
  check("Missing Required Fields is refused", missingName.status === "REJECTED" && has(missingName.issues, /Missing Required Fields/));
  const badUrl = engineOf().validate(inputOf({ responsiveSearchAds: { id: "rsamodel-1", responsiveSearchAds: [rsaOf({ finalUrl: { id: "u-1", url: "ftp://example.test", metadata: {} } })] } }));
  check("Invalid URLs is refused", badUrl.status === "REJECTED" && has(badUrl.issues, /Invalid URLs/));
  const dup = engineOf().validate(inputOf({ campaignModel: { id: "model-1", campaigns: [campaignOf(), campaignOf()] } }));
  check("Duplicate Assets is refused", dup.status === "REJECTED" && has(dup.issues, /Duplicate Assets/));
  const nested = engineOf().validate(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  const rec = engineOf().validate(inputOf({ responsiveSearchAds: { id: "rsamodel-1", responsiveSearchAds: [rsaOf({ trackingTemplate: null })] } }));
  check("a recommendation does not refuse the run", rec.status === "OK" && rec.health === "ATTENTION" && rec.issues.some((i) => i.kind === "RECOMMENDATION"));

  const source = inputOf();
  const once = engineOf().validate(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.campaignModel as { id: string }).id = "changed";
  check("No mutation: changing the input after validate leaves the report unchanged", once.report!.metadata.run === "r1" && once.snapshot!.campaignModelId === "model-1");
  try {
    (once.report!.health as string) = "UNHEALTHY";
    (once.snapshot!.issueIds as unknown as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable validation: the report and snapshot cannot be assigned into", once.report!.health === "HEALTHY" && once.snapshot!.campaignModelId === "model-1");

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
    adGroups: [{ id: "g-1", name: "core", campaignId: "c-1", defaultBidId: "db-1", bidStrategyId: "bs-1", keywordIds: [], negativeKeywordIds: [], audienceIds: [], deviceIds: [], metadata: {} }],
    defaultBids: [{ id: "db-1", name: "manual-default", metadata: {} }],
    bidStrategies: [{ id: "bs-1", name: "manual", metadata: {} }],
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
  const fromPrior = engineOf().validate({
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
  check("Immutable campaign, ad groups, and RSAs: prior models are unchanged after validation", fromPrior.status === "OK" && fromPrior.health === "HEALTHY" && JSON.stringify(campaignBuilt.model) === campaignBefore && JSON.stringify(adGroupBuilt.model) === adGroupBefore && JSON.stringify(rsaBuilt.model) === rsaBefore);

  const left = engineOf();
  const right = engineOf();
  left.validate(inputOf());
  right.validate(null);
  check("Independent engines do not share snapshots", left.getSnapshot("validation-1")?.health === "HEALTHY" && right.getSnapshot("validation-1")?.health === "UNHEALTHY" && left.getSnapshot("validation-2") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-policy-[a-z]+\.ts$/.test(f));
  check("five framework modules exist: engine, registry, snapshot, statistics, validator", files.sort().join() === "google-ads-policy-engine.ts,google-ads-policy-registry.ts,google-ads-policy-snapshot.ts,google-ads-policy-statistics.ts,google-ads-policy-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, OAuth, token, send, or policy-host path in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization|publish\(|upload\(/i.test(l)));
  check("no scoring, ranking, weights, or formulas in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the policy framework", architecture.every((src) => !/google-ads-policy-(engine|registry|snapshot|statistics|validator)/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(campaign|ad-group|rsa)-[a-z]+\.ts$/.test(f));
  check("campaign, ad group, and RSA builders do not import the policy framework", prior.every((f) => !/google-ads-policy-(engine|registry|snapshot|statistics|validator)/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports the policy framework", !others.some((f) => /google-ads-policy-(engine|registry|snapshot|statistics|validator)/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the policy framework", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads campaign validation framework: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
