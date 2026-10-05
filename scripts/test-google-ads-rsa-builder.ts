import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleAdsCampaignBuilder } from "../src/lib/providers/google-ads/google-ads-campaign-builder.ts";
import { createGoogleAdsAdGroupBuilder } from "../src/lib/providers/google-ads/google-ads-ad-group-builder.ts";
import { GOOGLE_ADS_RSA_BUILD_STATUSES, createGoogleAdsRsaBuilder } from "../src/lib/providers/google-ads/google-ads-rsa-builder.ts";
import { createGoogleAdsRsaResolver } from "../src/lib/providers/google-ads/google-ads-rsa-resolver.ts";
import {
  GOOGLE_ADS_BUILT_RSA_KEYS,
  GOOGLE_ADS_RSA_MODEL_KEYS,
  GOOGLE_ADS_RSA_SNAPSHOT_KEYS,
  createGoogleAdsRsaSnapshot,
  freezeDeepGoogleAdsRsa,
  type GoogleAdsRsaSpec,
} from "../src/lib/providers/google-ads/google-ads-rsa-snapshot.ts";
import { computeGoogleAdsRsaStatistics } from "../src/lib/providers/google-ads/google-ads-rsa-statistics.ts";
import { createGoogleAdsRsaValidator } from "../src/lib/providers/google-ads/google-ads-rsa-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function campaignRefOf() {
  return { id: "model-1", campaignIds: ["c-1"], campaigns: [{ id: "c-1" }] };
}

function adGroupRefOf() {
  return { id: "adgroup-1", adGroupIds: ["g-1"], adGroups: [{ id: "g-1", campaignId: "c-1" }] };
}

function specOf(id: string, over: Partial<GoogleAdsRsaSpec> = {}): GoogleAdsRsaSpec {
  return {
    id,
    adGroupId: over.adGroupId ?? "g-1",
    headlineIds: over.headlineIds ?? ["h-1", "h-2"],
    descriptionIds: over.descriptionIds ?? ["d-1"],
    finalUrlId: over.finalUrlId ?? "u-1",
    displayPathId: over.displayPathId ?? "p-1",
    trackingTemplateId: over.trackingTemplateId ?? "t-1",
    urlSuffixId: over.urlSuffixId ?? "suf-1",
    pinnedAssetIds: over.pinnedAssetIds ?? ["pin-1"],
    metadata: over.metadata ?? { note: "x" },
    warnings: over.warnings ?? [],
  };
}

function catalogs() {
  return {
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
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    campaignModel: campaignRefOf(),
    adGroupModel: adGroupRefOf(),
    executionPlan: { id: "ep-1" },
    executionContracts: [{ id: "ec-1" }],
    decisionAnalysis: { id: "d-1" },
    workflowSnapshot: { id: "snap-1" },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
    responsiveSearchAds: [specOf("rsa-1")],
    ...catalogs(),
    ...over,
  };
}

function builderOf() {
  let n = 0;
  return createGoogleAdsRsaBuilder({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `rsa-${++n}`,
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
  const validator = createGoogleAdsRsaValidator();
  const resolver = createGoogleAdsRsaResolver();
  check("build statuses are OK then REJECTED", GOOGLE_ADS_RSA_BUILD_STATUSES.join() === "OK,REJECTED");
  check("snapshot keys are in the requested order", GOOGLE_ADS_RSA_SNAPSHOT_KEYS.join() === "rsaModelId,campaignModelId,adGroupModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,rsaIds,createdAt,metadata");
  check("built RSA keys name the RSA records", GOOGLE_ADS_BUILT_RSA_KEYS.join() === "id,adGroupId,headlines,descriptions,finalUrl,displayPath,trackingTemplate,urlSuffix,pinnedAssets,metadata");
  check("RSA model keys are in the requested order", GOOGLE_ADS_RSA_MODEL_KEYS.join() === "id,campaignModelId,adGroupModelId,executionPlanId,executionContractIds,decisionAnalysisId,workflowSnapshotId,responsiveSearchAds,warnings,metadata,executionTime,createdAt");

  check("a well-formed RSA spec is accepted", validator.validateRsa(specOf("rsa-1")).length === 0);
  check("Missing Headline: missing ads rejected", has(validator.validateInput({ campaignModel: campaignRefOf(), adGroupModel: adGroupRefOf() }), /responsive search ads are required/));
  check("Missing Headline: a non-object is rejected", has(validator.validateInput(null), /Missing Headline/));
  check("Missing Headline: an empty headline list is rejected", has(validator.validateRsa(specOf("rsa-1", { headlineIds: [] })), /Missing Headline/));
  check("Missing Description: an empty description list is rejected", has(validator.validateRsa(specOf("rsa-1", { descriptionIds: [] })), /Missing Description/));
  check("Invalid Final URL: a non-https address is rejected", has(validator.validateFinalUrl("ftp://example.test"), /Invalid Final URL/) && validator.validateFinalUrl("https://example.test/offer").length === 0);
  check("Duplicate Headlines: a second headline id is rejected", has(validator.validateHeadlineGraph(["h-1", "h-1"]), /Duplicate Headlines/));
  check("Duplicate Descriptions: a second description id is rejected", has(validator.validateDescriptionGraph(["d-1", "d-1"]), /Duplicate Descriptions/));
  check("Invalid Metadata: nested RSA metadata is rejected", has(validator.validateRsa(specOf("rsa-1", { metadata: { a: { b: 1 } } as never })), /Invalid Metadata/));
  check("Invalid Metadata: nested context metadata is rejected", has(validator.validateInput(inputOf({ executionMetadata: { a: { b: 1 } } })), /Invalid Metadata/));
  check("a valid empty RSA list is accepted", validator.validateInput(inputOf({ responsiveSearchAds: [] })).length === 0);

  const catalogsOnly = catalogs();
  const missingHeadline = resolver.resolve({ campaignModel: campaignRefOf(), adGroupModel: adGroupRefOf(), responsiveSearchAds: [specOf("rsa-1", { headlineIds: ["missing"] })], ...catalogsOnly });
  check("Missing Headline is rejected by the resolver", missingHeadline.ads.length === 0 && has(missingHeadline.issues, /Missing Headline/));
  const missingDescription = resolver.resolve({ campaignModel: campaignRefOf(), adGroupModel: adGroupRefOf(), responsiveSearchAds: [specOf("rsa-1", { descriptionIds: ["missing"] })], ...catalogsOnly });
  check("Missing Description is rejected by the resolver", missingDescription.ads.length === 0 && has(missingDescription.issues, /Missing Description/));
  const badUrl = resolver.resolve({
    campaignModel: campaignRefOf(),
    adGroupModel: adGroupRefOf(),
    responsiveSearchAds: [specOf("rsa-1")],
    ...catalogsOnly,
    finalUrls: [{ id: "u-1", url: "not-a-url" }],
  });
  check("Invalid Final URL is rejected by the resolver", badUrl.ads.length === 0 && has(badUrl.issues, /Invalid Final URL/));
  check("Duplicate Headlines is rejected by the resolver", has(resolver.detectDuplicates([specOf("rsa-1", { headlineIds: ["h-1", "h-1"] })]), /Duplicate Headlines/));
  check("Duplicate Descriptions is rejected by the resolver", has(resolver.detectDuplicates([specOf("rsa-1", { descriptionIds: ["d-1", "d-1"] })]), /Duplicate Descriptions/));
  const attached = resolver.resolve({
    campaignModel: campaignRefOf(),
    adGroupModel: { id: "adgroup-1", adGroupIds: ["g-1", "g-2"], adGroups: [{ id: "g-1" }, { id: "g-2" }] },
    responsiveSearchAds: [specOf("rsa-2", { adGroupId: "g-2", pinnedAssetIds: [] }), specOf("rsa-1")],
    ...catalogsOnly,
  });
  check("the resolver attaches records and lists RSAs by id", attached.issues.length === 0 && attached.ads.map((item) => item.spec.id).join() === "rsa-1,rsa-2" && attached.ads[0]?.finalUrl?.url === "https://example.test/offer");

  const snap = createGoogleAdsRsaSnapshot({
    rsaModelId: "rsa-1",
    campaignModelId: "model-1",
    adGroupModelId: "adgroup-1",
    executionPlanId: "ep-1",
    executionContractIds: ["ec-1"],
    decisionAnalysisId: "d-1",
    workflowSnapshotId: "snap-1",
    rsaIds: ["rsa-1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_ADS_RSA_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.rsaIds) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleAdsRsa never throws", freezeDeepGoogleAdsRsa(1) === 1 && Object.isFrozen(freezeDeepGoogleAdsRsa({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const stats = computeGoogleAdsRsaStatistics(
    [
      {
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
        urlSuffix: null,
        pinnedAssets: [{ id: "pin-1", name: "headline-pin", metadata: {} }],
        metadata: {},
      },
    ],
    { warningCount: 1, contractCount: 1 },
  );
  check("RSA Statistics count each named record", stats.rsaCount === 1 && stats.headlineCount === 2 && stats.descriptionCount === 1 && stats.urlSuffixCount === 0 && stats.pinnedAssetCount === 1 && stats.warningCount === 1);

  const builder = builderOf();
  const built = builder.build(inputOf({ responsiveSearchAds: [specOf("rsa-1", { warnings: ["restated"] })] }));
  check("the builder returns OK with a model, snapshot, statistics, warnings, and execution time", built.status === "OK" && built.model !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("the model carries headlines, descriptions, final URL, display path, tracking, suffix, and optional pinned assets", built.model!.responsiveSearchAds[0]?.headlines.map((item) => item.id).join() === "h-1,h-2" && built.model!.responsiveSearchAds[0]?.descriptions[0]?.id === "d-1" && built.model!.responsiveSearchAds[0]?.finalUrl.url === "https://example.test/offer" && built.model!.responsiveSearchAds[0]?.displayPath?.id === "p-1" && built.model!.responsiveSearchAds[0]?.trackingTemplate?.id === "t-1" && built.model!.responsiveSearchAds[0]?.urlSuffix?.id === "suf-1" && built.model!.responsiveSearchAds[0]?.pinnedAssets[0]?.id === "pin-1");
  check("optional pinned assets may be omitted", builderOf().build(inputOf({ responsiveSearchAds: [specOf("rsa-1", { pinnedAssetIds: [] })] })).model!.responsiveSearchAds[0]?.pinnedAssets.length === 0);
  check("the model keeps campaign, ad group, execution, decision, and workflow as ids only", built.model!.id === "rsa-1" && built.model!.campaignModelId === "model-1" && built.model!.adGroupModelId === "adgroup-1" && built.model!.executionPlanId === "ep-1" && built.model!.executionContractIds.join() === "ec-1");
  check("the snapshot stores model, campaign, ad group, and RSA ids", built.snapshot!.rsaModelId === "rsa-1" && built.snapshot!.campaignModelId === "model-1" && built.snapshot!.adGroupModelId === "adgroup-1" && built.snapshot!.rsaIds.join() === "rsa-1");
  check("warnings and metadata are restated on the result", built.warnings.join() === "restated" && built.metadata.run === "r1");
  check("getSnapshot returns the stored snapshot", builder.getSnapshot("rsa-1") === built.snapshot && builder.getSnapshot("nope") === null);
  check("the model and snapshot are frozen", Object.isFrozen(built.model) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.model!.responsiveSearchAds) && Object.isFrozen(built.statistics));
  check("validate agrees with a successful build", builder.validate(inputOf()).length === 0);
  check("a built RSA has exactly the requested fields", Object.keys(built.model!.responsiveSearchAds[0] ?? {}).join() === GOOGLE_ADS_BUILT_RSA_KEYS.join());
  check("an RSA model has exactly the requested fields", Object.keys(built.model!).join() === GOOGLE_ADS_RSA_MODEL_KEYS.join());

  const empty = builderOf().build(inputOf({ responsiveSearchAds: [] }));
  check("an empty RSA list builds an empty model", empty.status === "OK" && empty.model!.responsiveSearchAds.length === 0 && empty.statistics!.rsaCount === 0);

  const noHeadline = builderOf().build(inputOf({ responsiveSearchAds: [specOf("rsa-1", { headlineIds: [] })] }));
  check("Missing Headline is refused", noHeadline.status === "REJECTED" && has(noHeadline.issues, /Missing Headline/) && noHeadline.model === null);
  const noDescription = builderOf().build(inputOf({ responsiveSearchAds: [specOf("rsa-1", { descriptionIds: [] })] }));
  check("Missing Description is refused", noDescription.status === "REJECTED" && has(noDescription.issues, /Missing Description/));
  const noUrl = builderOf().build(inputOf({ finalUrls: [{ id: "u-1", url: "not-a-url" }] }));
  check("Invalid Final URL is refused", noUrl.status === "REJECTED" && has(noUrl.issues, /Invalid Final URL/));
  const dupHeadlines = builderOf().build(inputOf({ responsiveSearchAds: [specOf("rsa-1", { headlineIds: ["h-1", "h-1"] })] }));
  check("Duplicate Headlines is refused", dupHeadlines.status === "REJECTED" && has(dupHeadlines.issues, /Duplicate Headlines/));
  const dupDescriptions = builderOf().build(inputOf({ responsiveSearchAds: [specOf("rsa-1", { descriptionIds: ["d-1", "d-1"] })] }));
  check("Duplicate Descriptions is refused", dupDescriptions.status === "REJECTED" && has(dupDescriptions.issues, /Duplicate Descriptions/));
  const nestedMeta = builderOf().build(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nestedMeta.status === "REJECTED" && has(nestedMeta.issues, /Invalid Metadata/));
  const missingInput = builderOf().build(null);
  check("Missing Headline: a missing input is refused", missingInput.status === "REJECTED" && missingInput.model === null);
  check("a refused build stores no snapshot", builderOf().getSnapshot("rsa-1") === null);

  const source = inputOf();
  const once = builderOf().build(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.responsiveSearchAds as GoogleAdsRsaSpec[])[0].adGroupId = "changed";
  check("No mutation: changing the input after a build leaves the model unchanged", once.model!.metadata.run === "r1" && once.model!.responsiveSearchAds[0]?.adGroupId === "g-1");
  try {
    (once.model!.responsiveSearchAds[0] as { adGroupId: string }).adGroupId = "hacked";
    (once.snapshot!.rsaIds as unknown as string[])[0] = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the built model and snapshot cannot be assigned into", once.model!.responsiveSearchAds[0]?.adGroupId === "g-1" && once.snapshot!.rsaIds[0] === "rsa-1");

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
  check("campaign and ad group builders still return immutable models", campaignBuilt.status === "OK" && adGroupBuilt.status === "OK" && Object.isFrozen(campaignBuilt.model) && Object.isFrozen(adGroupBuilt.model));
  const campaignBefore = JSON.stringify(campaignBuilt.model);
  const adGroupBefore = JSON.stringify(adGroupBuilt.model);
  const fromPrior = builderOf().build(inputOf({ campaignModel: campaignBuilt.model!, adGroupModel: adGroupBuilt.model! }));
  try {
    (campaignBuilt.model!.campaigns[0] as { name: string }).name = "hacked";
    (adGroupBuilt.model!.adGroups[0] as { name: string }).name = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable campaign and ad groups: prior models are unchanged after an RSA build", fromPrior.status === "OK" && fromPrior.model!.campaignModelId === "model-1" && fromPrior.model!.adGroupModelId === "adgroup-1" && fromPrior.model!.responsiveSearchAds[0]?.adGroupId === "g-1" && JSON.stringify(campaignBuilt.model) === campaignBefore && JSON.stringify(adGroupBuilt.model) === adGroupBefore);

  const deterministic = () =>
    createGoogleAdsRsaBuilder({
      now: () => 0,
      timestamp: () => "2026-01-01T00:00:00.000Z",
      idFactory: () => "rsa-fixed",
    });
  const first = deterministic().build(inputOf({ responsiveSearchAds: [specOf("rsa-2", { pinnedAssetIds: [] }), specOf("rsa-1")] }));
  const second = deterministic().build(inputOf({ responsiveSearchAds: [specOf("rsa-1"), specOf("rsa-2", { pinnedAssetIds: [] })] }));
  check("Deterministic RSA generation: the same records yield the same model and snapshot", first.status === "OK" && JSON.stringify(first.model) === JSON.stringify(second.model) && JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot));
  check("Deterministic RSA generation: input order does not change the assembled order", first.model!.responsiveSearchAds.map((item) => item.id).join() === "rsa-1,rsa-2");

  const left = builderOf();
  const right = builderOf();
  left.build(inputOf());
  right.build(inputOf({ responsiveSearchAds: [specOf("rsa-1"), specOf("rsa-2", { pinnedAssetIds: [] })] }));
  check("Independent builders do not share snapshots", left.getSnapshot("rsa-1")?.rsaIds.join() === "rsa-1" && right.getSnapshot("rsa-1")?.rsaIds.join() === "rsa-1,rsa-2" && left.getSnapshot("rsa-2") === null);

  const dir = join(process.cwd(), "src/lib/providers/google-ads");
  const files = readdirSync(dir).filter((f) => /^google-ads-rsa-[a-z]+\.ts$/.test(f));
  check("five builder modules exist: builder, validator, resolver, snapshot, statistics", files.sort().join() === "google-ads-rsa-builder.ts,google-ads-rsa-resolver.ts,google-ads-rsa-snapshot.ts,google-ads-rsa-statistics.ts,google-ads-rsa-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, OAuth, token, send, or upload path in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization|publish\(|upload\(/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no parallel work", !code.some((l) => /Promise\.all|Promise\.race|worker_threads/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 8);
  check("every import stays inside the google-ads folder", imports.every((i) => /^\.\/google-ads-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  const architecture = ["google-ads-context.ts", "google-ads-provider.ts", "google-ads-registry.ts", "google-ads-types.ts", "google-ads-validator.ts"].map((f) => readFileSync(join(dir, f), "utf8"));
  check("the architecture modules are unchanged in shape and do not import the RSA builder", architecture.every((src) => !/google-ads-rsa-(builder|validator|resolver|snapshot|statistics)/.test(src)) && architecture.every((src) => !/^\s*export\s+(async\s+)?(function|class)\b/m.test(src)));
  const prior = readdirSync(dir).filter((f) => /^google-ads-(campaign|ad-group)-[a-z]+\.ts$/.test(f));
  check("campaign and ad group builders do not import the RSA builder", prior.every((f) => !/google-ads-rsa-(builder|validator|resolver|snapshot|statistics)/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/providers/google-ads/"));
  check("no other lib module imports the RSA builder", !others.some((f) => /google-ads-rsa-(builder|validator|resolver|snapshot|statistics)/.test(readFileSync(f, "utf8"))));
  const executionFiles = listTs(join(process.cwd(), "src/lib/execution"));
  check("the execution planner does not import the RSA builder", !executionFiles.some((f) => /google-ads|providers\//.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle Ads RSA builder: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
