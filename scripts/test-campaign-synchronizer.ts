import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createCampaignSynchronizer } from "../src/lib/google-ads-live/campaign-synchronizer.ts";
import { CAMPAIGN_SYNC_CONTEXT_MEMBERS } from "../src/lib/google-ads-live/campaign-sync-context.ts";
import {
  CAMPAIGN_SYNC_ORIGINS,
  CAMPAIGN_SYNC_PROVENANCE,
  CAMPAIGN_SYNC_RESULT_KEYS,
  CAMPAIGN_SYNC_SNAPSHOT_KEYS,
  CAMPAIGN_SYNC_STATUSES,
  CAMPAIGN_STATE_KEYS,
  SYNC_REPORT_KEYS,
} from "../src/lib/google-ads-live/campaign-sync-snapshot.ts";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const CAMPAIGN = "customers/1111111111/campaigns/999";
const SECRETS = ["secret-marker", "refresh-marker", "developer-marker", "access-marker"];

function inputOf(over: Record<string, unknown> = {}) {
  return {
    session: { sessionId: "session-1", authenticated: true, tokenType: "Bearer", expiresIn: 3600, accessToken: "access-marker" },
    customerId: "1111111111",
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function campaignRow(status = "PAUSED") {
  return {
    campaign: { resourceName: CAMPAIGN, id: "999", name: "Paused Test Draft", status, servingStatus: "SERVING" },
    campaignBudget: { resourceName: "customers/1111111111/campaignBudgets/888", name: "Paused Test Draft Budget", amountMicros: "1000000", status: "ENABLED" },
  };
}

function rows(body: unknown) {
  return { httpStatus: 200, bodyText: JSON.stringify({ results: Array.isArray(body) ? body : [body] }) };
}

function scripted(mode: "ok" | "api" | "empty" | "enabled" | "no-group" | "no-change" = "ok") {
  const calls: GoogleAuthHttpRequest[] = [];
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    const query = request.body ?? "";
    if (query.includes("campaign_label")) return rows([{ campaign: { resourceName: CAMPAIGN }, label: { resourceName: "customers/1111111111/labels/5", id: "5", name: "North Label" } }]);
    if (query.includes("ad_group_ad")) {
      if (mode === "no-group") return { httpStatus: 200, bodyText: JSON.stringify({ results: [] }) };
      return rows([
        {
          campaign: { resourceName: CAMPAIGN },
          adGroup: { resourceName: "customers/1111111111/adGroups/777" },
          adGroupAd: {
            resourceName: "customers/1111111111/adGroupAds/777~555",
            status: "PAUSED",
            ad: { id: "555" },
            policySummary: { approvalStatus: "UNKNOWN", reviewStatus: "REVIEW_IN_PROGRESS" },
          },
        },
      ]);
    }
    if (query.includes("FROM ad_group")) {
      if (mode === "no-group") return { httpStatus: 200, bodyText: JSON.stringify({ results: [] }) };
      return rows([{ campaign: { resourceName: CAMPAIGN }, adGroup: { resourceName: "customers/1111111111/adGroups/777", id: "777", name: "Paused Test Group", status: "PAUSED" } }]);
    }
    if (query.includes("change_status")) {
      if (mode === "no-change") return { httpStatus: 400, bodyText: JSON.stringify({ error: { message: "unavailable" } }) };
      return rows([{ changeStatus: { campaign: CAMPAIGN, lastChangeDateTime: "2026-01-02 00:00:00", resourceType: "CAMPAIGN" } }]);
    }
    if (mode === "api") return { httpStatus: 400, bodyText: JSON.stringify({ error: { message: "refused" } }) };
    if (mode === "empty") return { httpStatus: 200, bodyText: JSON.stringify({ results: [] }) };
    return rows(campaignRow(mode === "enabled" ? "ENABLED" : "PAUSED"));
  };
  return { calls, transport };
}

function hostOf(transport: GoogleAuthTransport, idFactory?: () => string) {
  let tick = 0;
  return createCampaignSynchronizer({ now: () => tick++, timestamp: () => T0, idFactory, transport });
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
  check("statuses are OK and REJECTED", CAMPAIGN_SYNC_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", CAMPAIGN_SYNC_ORIGINS.join() === "OBSERVED" && CAMPAIGN_SYNC_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the session, the customer, and the campaign resources", CAMPAIGN_SYNC_CONTEXT_MEMBERS.join() === "session,customerId,developerToken,campaignResourceNames,localSnapshot,executionMetadata,runtimeMetadata");

  const live = scripted();
  const input = inputOf();
  const namesBefore = JSON.stringify(input.campaignResourceNames);
  const host = hostOf(live.transport);
  const synced = await host.synchronize(input);
  input.executionMetadata.note = "changed";
  input.campaignResourceNames.push("customers/1111111111/campaigns/1");
  const campaign = synced.campaignSnapshot?.campaigns[0];
  const bodies = live.calls.map((call) => call.body ?? "");
  check(
    "one campaign resource is read into a frozen snapshot",
    synced.status === "OK" &&
      campaign?.resourceName === CAMPAIGN &&
      campaign.campaignId === "999" &&
      campaign.status === "PAUSED" &&
      campaign.servingStatus === "SERVING" &&
      campaign.budgetResourceName === "customers/1111111111/campaignBudgets/888" &&
      campaign.budgetAmountMicros === "1000000" &&
      campaign.lastModifiedTime === "2026-01-02 00:00:00" &&
      campaign.labels[0]?.name === "North Label" &&
      campaign.adGroups[0]?.resourceName === "customers/1111111111/adGroups/777" &&
      campaign.adGroups[0]?.status === "PAUSED" &&
      campaign.adGroups[0]?.ads[0]?.resourceName === "customers/1111111111/adGroupAds/777~555" &&
      campaign.adGroups[0]?.ads[0]?.approvalStatus === "UNKNOWN" &&
      campaign.adGroups[0]?.ads[0]?.policyReviewStatus === "REVIEW_IN_PROGRESS" &&
      synced.report?.priorSnapshotPresent === false &&
      synced.report.differences.length === 0 &&
      synced.report.missingResources.length === 0 &&
      synced.report.stateChanges.length === 0 &&
      synced.statistics.requestCount === 5 &&
      synced.statistics.campaignCount === 1 &&
      synced.statistics.adGroupCount === 1 &&
      synced.statistics.adCount === 1 &&
      synced.statistics.labelCount === 1 &&
      synced.statistics.differenceCount === 0 &&
      live.calls.length === 5 &&
      live.calls.every((call) => call.url.endsWith("/customers/1111111111/googleAds:search") && call.method === "POST") &&
      bodies.every((body) => body.includes("SELECT") && body.includes(CAMPAIGN)) &&
      !bodies.some((body) => /mutate/i.test(body)) &&
      !live.calls.some((call) => /mutate/i.test(call.url)) &&
      Object.keys(synced).join() === CAMPAIGN_SYNC_RESULT_KEYS.join() &&
      Object.keys(synced.snapshot ?? {}).join() === CAMPAIGN_SYNC_SNAPSHOT_KEYS.join() &&
      Object.keys(campaign ?? {}).join() === CAMPAIGN_STATE_KEYS.join() &&
      Object.keys(synced.report ?? {}).join() === SYNC_REPORT_KEYS.join(),
  );
  check(
    "the request is unchanged and the snapshot is immutable",
    JSON.stringify(input.campaignResourceNames.slice(0, 1)) === namesBefore &&
      input.campaignResourceNames.length === 2 &&
      synced.snapshot !== null &&
      host.getSnapshot("campaign-sync-1") === synced.snapshot &&
      Object.isFrozen(synced.snapshot) &&
      Object.isFrozen(synced.campaignSnapshot) &&
      Object.isFrozen(synced.report) &&
      synced.snapshot?.metadata.note === "kept" &&
      synced.campaignSnapshot?.readAt === T0,
  );
  check("no secrets are stored on the snapshot", SECRETS.every((secret) => !JSON.stringify(synced).includes(secret)));

  const local = JSON.parse(JSON.stringify(synced.campaignSnapshot)) as { campaigns: { name: string; status: string }[] };
  const again = scripted();
  const second = await hostOf(again.transport).synchronize(inputOf({ localSnapshot: local }));
  local.campaigns[0]!.name = "changed";
  check(
    "a second read does not change the local snapshot and reports no differences",
    second.status === "OK" &&
      second.report?.priorSnapshotPresent === true &&
      second.report.differences.length === 0 &&
      second.report.stateChanges.length === 0 &&
      second.snapshot !== synced.snapshot &&
      local.campaigns[0]?.name === "changed" &&
      second.campaignSnapshot?.campaigns[0]?.name === "Paused Test Draft" &&
      again.calls.length === 5 &&
      !again.calls.some((call) => /mutate/i.test(call.url)),
  );

  const enabled = scripted("enabled");
  const changed = await hostOf(enabled.transport).synchronize(inputOf({ localSnapshot: JSON.parse(JSON.stringify(synced.campaignSnapshot)) }));
  check(
    "a status difference is reported and no write is sent",
    changed.status === "OK" &&
      changed.report?.stateChanges.some((item) => item.field === "status" && item.localValue === "PAUSED" && item.observedValue === "ENABLED") === true &&
      changed.campaignSnapshot?.campaigns[0]?.status === "ENABLED" &&
      enabled.calls.every((call) => call.url.endsWith("/googleAds:search")) &&
      !enabled.calls.some((call) => /mutate/i.test(`${call.url} ${call.body ?? ""}`)),
  );

  const missingGroup = scripted("no-group");
  const groupDiff = await hostOf(missingGroup.transport).synchronize(inputOf({ localSnapshot: JSON.parse(JSON.stringify(synced.campaignSnapshot)) }));
  check(
    "an ad group absent from the read is a missing resource",
    groupDiff.status === "OK" && groupDiff.report?.missingResources.some((item) => item.resourceName === "customers/1111111111/adGroups/777" && item.missingFrom === "GOOGLE") === true,
  );

  const noChange = scripted("no-change");
  const withoutTime = await hostOf(noChange.transport).synchronize(inputOf());
  check("a change feed that is unavailable leaves the last change time unset", withoutTime.status === "OK" && withoutTime.campaignSnapshot?.campaigns[0]?.lastModifiedTime === null && noChange.calls.length === 5);

  const missingSession = scripted();
  const noSession = await hostOf(missingSession.transport).synchronize({ ...inputOf(), session: null });
  check("missing authentication stores nothing and sends no request", noSession.status === "REJECTED" && has(noSession.issues, /Missing Authentication/) && noSession.snapshot === null && missingSession.calls.length === 0);

  const missingCustomer = scripted();
  const noCustomer = await hostOf(missingCustomer.transport).synchronize({ ...inputOf(), customerId: "  " });
  check("a missing customer stores nothing and sends no request", noCustomer.status === "REJECTED" && has(noCustomer.issues, /Missing Customer/) && noCustomer.snapshot === null && missingCustomer.calls.length === 0);

  const otherCustomer = scripted();
  const wrongName = await hostOf(otherCustomer.transport).synchronize(inputOf({ campaignResourceNames: ["customers/2222222222/campaigns/999"] }));
  check("a campaign resource for another customer sends no request", wrongName.status === "REJECTED" && has(wrongName.issues, /Unknown Campaign/) && wrongName.snapshot === null && otherCustomer.calls.length === 0);

  const repeated = scripted();
  const duplicate = await hostOf(repeated.transport).synchronize(inputOf({ campaignResourceNames: [CAMPAIGN, CAMPAIGN] }));
  check("a repeated campaign resource sends no request", duplicate.status === "REJECTED" && has(duplicate.issues, /Unknown Campaign/) && repeated.calls.length === 0);

  const emptyScript = scripted("empty");
  const unknown = await hostOf(emptyScript.transport).synchronize(inputOf());
  check("an unknown campaign stores nothing", unknown.status === "REJECTED" && has(unknown.issues, /Unknown Campaign/) && unknown.snapshot === null && emptyScript.calls.length === 1);

  const apiScript = scripted("api");
  const api = await hostOf(apiScript.transport).synchronize(inputOf());
  check("an API error stores nothing", api.status === "REJECTED" && has(api.issues, /API Errors/) && api.snapshot === null && api.campaignSnapshot === null && apiScript.calls.length === 1);

  const corruptScript = scripted();
  const corrupt = await hostOf(corruptScript.transport).synchronize(inputOf({ localSnapshot: { campaigns: [{ resourceName: "nope" }] } }));
  check("a corrupted local snapshot stores nothing and sends no request", corrupt.status === "REJECTED" && has(corrupt.issues, /Corrupted Snapshot/) && corrupt.snapshot === null && corruptScript.calls.length === 0);

  const badIdScript = scripted();
  const badId = await hostOf(badIdScript.transport, () => "BAD").synchronize(inputOf());
  check("a corrupted sync id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Corrupted Snapshot/) && badId.snapshot === null && host.getSnapshot("BAD") === null && badIdScript.calls.length === 5);

  const nestedScript = scripted();
  const nested = await hostOf(nestedScript.transport).synchronize(inputOf({ executionMetadata: { nested: { inner: true } } }));
  check("nested metadata stores nothing and sends no request", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null && nestedScript.calls.length === 0);

  const dir = join(process.cwd(), "src/lib/google-ads-live");
  const names = ["campaign-synchronizer.ts", "resource-reader.ts", "campaign-state-mapper.ts", "campaign-diff-engine.ts", "campaign-sync-validator.ts", "campaign-sync-context.ts", "campaign-sync-snapshot.ts"];
  check("seven synchronization modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the synchronizer does not retrieve or write by itself", !code.some((line) => /fetch\(|process\.env|node:fs|readFileSync|mutate|recommend|\bkeyword\b|biddingStrategy/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "campaign-sync-context.ts"), "utf8")));
  check("synchronizer imports stay inside this folder", !code.some((line) => /from\s+["']\.\.\//.test(line)));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the synchronizer`, !sources.some((file) => /campaign-synchronizer/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`CAMPAIGN_SYNC_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("CAMPAIGN_SYNC_FAILURES=0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
