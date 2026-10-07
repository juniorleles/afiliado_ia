import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";
import { createGoogleMetricsClient } from "../src/lib/optimization-metrics/google-metrics-client.ts";
import { METRICS_CONTEXT_MEMBERS } from "../src/lib/optimization-metrics/metrics-context.ts";
import { createMetricsCollector } from "../src/lib/optimization-metrics/metrics-collector.ts";
import {
  METRICS_DATE_RANGE,
  METRICS_ORIGINS,
  METRICS_PROVENANCE,
  METRICS_RESULT_KEYS,
  METRICS_SNAPSHOT_KEYS,
  METRICS_STATUSES,
} from "../src/lib/optimization-metrics/metrics-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const CUSTOMER = "1111111111";
const CAMPAIGN = `customers/${CUSTOMER}/campaigns/999`;
const GROUP = `customers/${CUSTOMER}/adGroups/777`;
const AD = `customers/${CUSTOMER}/adGroupAds/777~555`;
const SECRETS = ["secret-marker", "refresh-marker", "developer-marker", "access-marker"];

type Mode = "ok" | "api" | "empty" | "malformed" | "negative" | "pages" | "sparse" | "empty-children";

function inputOf(over: Record<string, unknown> = {}) {
  return {
    session: { sessionId: "session-1", authenticated: true, tokenType: "Bearer", expiresIn: 3600, accessToken: "access-marker" },
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function metricBlock(over: Record<string, unknown> = {}) {
  return {
    impressions: 10,
    clicks: 1,
    ctr: 0.5,
    averageCpc: 1500000,
    costMicros: "2500000",
    conversions: 0,
    conversionsValue: 0,
    averageCpm: 1000000,
    searchImpressionShare: 0.4,
    searchTopImpressionShare: 0.2,
    searchAbsoluteTopImpressionShare: 0.1,
    ...over,
  };
}

function campaignRow(mode: Mode) {
  if (mode === "sparse") return { campaign: { resourceName: CAMPAIGN, id: "999", status: "PAUSED" } };
  const metrics = mode === "malformed" ? metricBlock({ ctr: "nope" }) : mode === "negative" ? metricBlock({ impressions: -1 }) : metricBlock();
  return { campaign: { resourceName: CAMPAIGN, id: "999", status: "PAUSED" }, metrics };
}

function groupRow() {
  return {
    campaign: { resourceName: CAMPAIGN },
    adGroup: { resourceName: GROUP, id: "777" },
    metrics: metricBlock({ impressions: 4, clicks: 3, ctr: 0.25 }),
  };
}

function adRow() {
  return {
    campaign: { resourceName: CAMPAIGN },
    adGroup: { resourceName: GROUP },
    adGroupAd: {
      resourceName: AD,
      status: "PAUSED",
      ad: { id: "555" },
      policySummary: { approvalStatus: "UNKNOWN", reviewStatus: "REVIEW_IN_PROGRESS" },
    },
    metrics: {
      impressions: 2,
      clicks: 2,
      ctr: 0.1,
      averageCpc: 900000,
      costMicros: 1800000,
      conversions: 0,
      conversionsValue: 0,
      averageCpm: 500000,
    },
  };
}

function rows(body: unknown) {
  return { httpStatus: 200, bodyText: JSON.stringify({ results: Array.isArray(body) ? body : [body] }) };
}

function scripted(mode: Mode = "ok") {
  const calls: GoogleAuthHttpRequest[] = [];
  let campaignPages = 0;
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    const query = request.body ?? "";
    if (mode === "api" && query.includes("FROM campaign")) return { httpStatus: 400, bodyText: JSON.stringify({ error: { message: "refused" } }) };
    if (query.includes("FROM ad_group_ad")) {
      if (mode === "empty-children") return { httpStatus: 200, bodyText: JSON.stringify({ results: [] }) };
      return rows(adRow());
    }
    if (query.includes("FROM ad_group")) {
      if (mode === "empty-children") return { httpStatus: 200, bodyText: JSON.stringify({ results: [] }) };
      return rows(groupRow());
    }
    if (mode === "empty") return { httpStatus: 200, bodyText: JSON.stringify({ results: [] }) };
    if (mode === "pages") {
      campaignPages += 1;
      if (campaignPages === 1) return { httpStatus: 200, bodyText: JSON.stringify({ results: [campaignRow("ok")], nextPageToken: "page-2" }) };
      return rows(campaignRow("ok"));
    }
    return rows(campaignRow(mode));
  };
  return { calls, transport };
}

function hostOf(transport: GoogleAuthTransport, idFactory?: () => string) {
  let tick = 0;
  return createMetricsCollector({ now: () => tick++, timestamp: () => T0, idFactory, transport });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(path));
    else if (name.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

async function main() {
  check("statuses are OK and REJECTED", METRICS_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", METRICS_ORIGINS.join() === "OBSERVED" && METRICS_PROVENANCE.join() === "DIRECT_SOURCE");
  check("the date window is the collected window", METRICS_DATE_RANGE === "LAST_30_DAYS");
  check(
    "context members name the session, the customer, and the campaign resources",
    METRICS_CONTEXT_MEMBERS.join() === "session,customerId,developerToken,campaignResourceNames,executionMetadata,runtimeMetadata",
  );

  const live = scripted();
  const input = inputOf();
  const namesBefore = JSON.stringify(input.campaignResourceNames);
  const host = hostOf(live.transport);
  const collected = await host.collect(input);
  input.executionMetadata.note = "changed";
  input.campaignResourceNames.push(`customers/${CUSTOMER}/campaigns/1`);
  const campaign = collected.campaignMetrics?.[0];
  const group = collected.adGroupMetrics?.[0];
  const ad = collected.rsaMetrics?.[0];
  const bodies = live.calls.map((call) => call.body ?? "");
  const urls = live.calls.map((call) => call.url);
  check(
    "one paused campaign is read into frozen campaign, ad group, and RSA metrics",
    collected.status === "OK" &&
      campaign?.resourceName === CAMPAIGN &&
      campaign.campaignId === "999" &&
      campaign.status === "PAUSED" &&
      campaign.impressions === 10 &&
      campaign.clicks === 1 &&
      campaign.ctr === 0.5 &&
      campaign.averageCpc === 1500000 &&
      campaign.costMicros === 2500000 &&
      campaign.conversions === 0 &&
      campaign.conversionValue === 0 &&
      campaign.averageCpm === 1000000 &&
      campaign.searchImpressionShare === 0.4 &&
      campaign.searchTopImpressionShare === 0.2 &&
      campaign.searchAbsoluteTopImpressionShare === 0.1 &&
      group?.resourceName === GROUP &&
      group.adGroupId === "777" &&
      group.campaignResourceName === CAMPAIGN &&
      group.impressions === 4 &&
      group.clicks === 3 &&
      group.ctr === 0.25 &&
      ad?.resourceName === AD &&
      ad.adId === "555" &&
      ad.adGroupResourceName === GROUP &&
      ad.campaignResourceName === CAMPAIGN &&
      ad.status === "PAUSED" &&
      ad.approvalStatus === "UNKNOWN" &&
      ad.policyReviewStatus === "REVIEW_IN_PROGRESS" &&
      ad.impressions === 2 &&
      ad.clicks === 2 &&
      ad.ctr === 0.1 &&
      ad.costMicros === 1800000 &&
      ad.searchImpressionShare === null &&
      ad.searchTopImpressionShare === null &&
      ad.searchAbsoluteTopImpressionShare === null &&
      collected.statistics.requestCount === 3 &&
      collected.statistics.campaignCount === 1 &&
      collected.statistics.adGroupCount === 1 &&
      collected.statistics.adCount === 1 &&
      collected.statistics.issueCount === 0 &&
      collected.snapshot?.collectionId === "metrics-collect-1" &&
      collected.snapshot.context.customerId === CUSTOMER &&
      collected.snapshot.context.dateRange === "LAST_30_DAYS" &&
      collected.snapshot.context.campaignResourceNames.join() === CAMPAIGN &&
      collected.snapshot.origin === "OBSERVED" &&
      collected.snapshot.provenance === "DIRECT_SOURCE" &&
      collected.snapshot.createdAt === T0 &&
      collected.metadata.note === "kept" &&
      host.getSnapshot("metrics-collect-1") === collected.snapshot &&
      Object.isFrozen(collected.snapshot) &&
      Object.keys(collected).join() === METRICS_RESULT_KEYS.join() &&
      Object.keys(collected.snapshot).join() === METRICS_SNAPSHOT_KEYS.join() &&
      namesBefore === JSON.stringify([CAMPAIGN]),
  );
  check(
    "every request is a search and the returned CTR is copied",
    live.calls.length === 3 &&
      urls.every((url) => url.endsWith(`/customers/${CUSTOMER}/googleAds:search`)) &&
      live.calls.every((call) => call.method === "POST") &&
      bodies.every((body) => body.includes("SELECT") && body.includes("DURING LAST_30_DAYS") && !body.includes("mutate")) &&
      urls.every((url) => !url.includes("mutate")) &&
      bodies[0]?.includes("FROM campaign") === true &&
      bodies[0]?.includes("metrics.search_impression_share") === true &&
      bodies[1]?.includes("FROM ad_group") === true &&
      bodies[2]?.includes("FROM ad_group_ad") === true &&
      bodies[2]?.includes("RESPONSIVE_SEARCH_AD") === true &&
      bodies[2]?.includes("search_impression_share") === false &&
      campaign?.ctr === 0.5 &&
      campaign.clicks / campaign.impressions !== campaign.ctr,
  );
  const serialized = JSON.stringify(collected);
  check("credentials stay off the snapshot", SECRETS.every((secret) => !serialized.includes(secret)));

  const other = hostOf(scripted().transport);
  check("a second collector does not see the first snapshot", other.getSnapshot("metrics-collect-1") === null);

  const again = await hostOf(scripted().transport).collect(inputOf());
  check(
    "a second collection copies the same figures",
    again.status === "OK" && again.campaignMetrics?.[0]?.ctr === 0.5 && again.campaignMetrics[0].costMicros === 2500000 && again.rsaMetrics?.[0]?.approvalStatus === "UNKNOWN",
  );

  const sparse = await hostOf(scripted("sparse").transport).collect(inputOf());
  check(
    "an absent metric stays null",
    sparse.status === "OK" && sparse.campaignMetrics?.[0]?.impressions === null && sparse.campaignMetrics[0].ctr === null && sparse.campaignMetrics[0].costMicros === null,
  );

  const children = await hostOf(scripted("empty-children").transport).collect(inputOf());
  check(
    "a campaign with no ad groups and no ads is still a collection",
    children.status === "OK" && children.statistics.adGroupCount === 0 && children.statistics.adCount === 0 && children.adGroupMetrics?.length === 0 && children.rsaMetrics?.length === 0,
  );

  const missingSession = scripted();
  const unauthenticated = await hostOf(missingSession.transport).collect(inputOf({ session: null }));
  check("a missing session stores nothing and sends no request", unauthenticated.status === "REJECTED" && has(unauthenticated.issues, /Missing Authentication/) && unauthenticated.snapshot === null && missingSession.calls.length === 0);

  const missingCustomer = scripted();
  const customer = await hostOf(missingCustomer.transport).collect(inputOf({ customerId: " " }));
  check("a missing customer stores nothing and sends no request", customer.status === "REJECTED" && has(customer.issues, /Missing Customer/) && customer.snapshot === null && missingCustomer.calls.length === 0);

  const unknownScript = scripted();
  const unknown = await hostOf(unknownScript.transport).collect(inputOf({ campaignResourceNames: ["customers/2222222222/campaigns/999"] }));
  check("a campaign from another customer stores nothing and sends no request", unknown.status === "REJECTED" && has(unknown.issues, /Unknown Campaign/) && unknown.snapshot === null && unknownScript.calls.length === 0);

  const repeatedScript = scripted();
  const repeated = await hostOf(repeatedScript.transport).collect(inputOf({ campaignResourceNames: [CAMPAIGN, CAMPAIGN] }));
  check("a repeated campaign resource stores nothing and sends no request", repeated.status === "REJECTED" && has(repeated.issues, /Unknown Campaign/) && repeated.snapshot === null && repeatedScript.calls.length === 0);

  const emptyScript = scripted("empty");
  const empty = await hostOf(emptyScript.transport).collect(inputOf());
  check("an unknown campaign stores nothing", empty.status === "REJECTED" && has(empty.issues, /Unknown Campaign/) && empty.snapshot === null && emptyScript.calls.length === 1);

  const apiScript = scripted("api");
  const api = await hostOf(apiScript.transport).collect(inputOf());
  check("a Google API error stores nothing", api.status === "REJECTED" && has(api.issues, /Google API Errors/) && api.snapshot === null && apiScript.calls.length === 1 && api.statistics.requestCount === 0);

  const malformedScript = scripted("malformed");
  const malformed = await hostOf(malformedScript.transport).collect(inputOf());
  check("a malformed metric stores nothing", malformed.status === "REJECTED" && has(malformed.issues, /Malformed Metrics/) && malformed.snapshot === null && malformedScript.calls.length === 1);

  const negativeScript = scripted("negative");
  const negative = await hostOf(negativeScript.transport).collect(inputOf());
  check("a negative metric stores nothing", negative.status === "REJECTED" && has(negative.issues, /Malformed Metrics/) && negative.snapshot === null);

  const pageScript = scripted("pages");
  const paged = await hostOf(pageScript.transport).collect(inputOf());
  check("two campaign rows are not added together", paged.status === "REJECTED" && has(paged.issues, /Malformed Metrics/) && paged.snapshot === null && pageScript.calls.length === 2);

  const nestedScript = scripted();
  const nested = await hostOf(nestedScript.transport).collect(inputOf({ executionMetadata: { nested: { inner: true } } }));
  check("nested metadata stores nothing and sends no request", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null && nestedScript.calls.length === 0);

  const badIdScript = scripted();
  const badHost = hostOf(badIdScript.transport, () => "BAD");
  const badId = await badHost.collect(inputOf());
  check("a corrupted collection id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && badHost.getSnapshot("BAD") === null && badIdScript.calls.length === 3);

  const client = createGoogleMetricsClient(scripted().transport);
  const direct = await client.readCampaign("v21", CUSTOMER, "developer-marker", "access-marker", CAMPAIGN);
  check("the metrics client reads one campaign search", direct.ok && direct.read.rows.length === 1 && direct.read.requestCount === 1);

  const dir = join(process.cwd(), "src/lib/optimization-metrics");
  const names = ["metrics-collector.ts", "google-metrics-client.ts", "metrics-mapper.ts", "metrics-validator.ts", "metrics-context.ts", "metrics-snapshot.ts"];
  check("six metrics modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check(
    "the collector does not retrieve, write, or derive a figure",
    !code.some((line) => /fetch\(|process\.env|node:fs|readFileSync|mutate|recommend|\bkeyword\b|biddingStrategy|\.sort\(|Promise\.all|clicks\s*\/\s*impressions|costMicros\s*\/|\/\s*1_?000_?000/.test(line)),
  );
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "metrics-context.ts"), "utf8")));
  const outside = [...code.join("\n").matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)].map((match) => match[1]);
  check("the only outside import is the Google auth client", outside.length === 3 && outside.every((from) => from === "../google-ads-live/google-auth-client.ts"));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation", "google-ads-live"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the metrics collector`, !sources.some((file) => /optimization-metrics|metrics-collector/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`METRICS_COLLECTOR_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("METRICS_COLLECTOR_FAILURES=0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
