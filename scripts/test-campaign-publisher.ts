import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CAMPAIGN_PUBLISH_CONTEXT_MEMBERS } from "../src/lib/google-ads-live/campaign-publisher-context.ts";
import { createCampaignPublisher } from "../src/lib/google-ads-live/campaign-publisher.ts";
import {
  CAMPAIGN_PUBLISH_ORIGINS,
  CAMPAIGN_PUBLISH_PROVENANCE,
  CAMPAIGN_PUBLISH_RESULT_KEYS,
  CAMPAIGN_PUBLISH_SNAPSHOT_KEYS,
  CAMPAIGN_PUBLISH_STATISTICS_KEYS,
  CAMPAIGN_PUBLISH_STATUSES,
  PUBLISHED_CAMPAIGN_KEYS,
} from "../src/lib/google-ads-live/campaign-publisher-session.ts";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const SECRETS = ["secret-marker", "refresh-marker", "developer-marker", "access-marker"];

function draftOf(over: Record<string, unknown> = {}) {
  return {
    draftId: "paused-test-draft",
    name: "Paused Test Draft",
    budgetName: "Paused Test Draft Budget",
    status: "PAUSED",
    channelType: "SEARCH",
    amountMicros: 1000000,
    deliveryMethod: "STANDARD",
    bidding: "MANUAL_CPC",
    targetGoogleSearch: true,
    targetSearchNetwork: false,
    targetContentNetwork: false,
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    draft: draftOf(),
    session: { sessionId: "session-1", authenticated: true, tokenType: "Bearer", expiresIn: 3600, accessToken: "access-marker" },
    customerId: "1111111111",
    developerToken: "developer-marker",
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function scripted(mode: "ok" | "api" | "enabled" = "ok") {
  const calls: GoogleAuthHttpRequest[] = [];
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    if (request.url.endsWith("/googleAds:mutate")) {
      if (mode === "api") return { httpStatus: 400, bodyText: JSON.stringify({ error: { message: "refused" } }) };
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({
          mutateOperationResponses: [
            { campaignBudgetResult: { resourceName: "customers/1111111111/campaignBudgets/888" } },
            { campaignResult: { resourceName: "customers/1111111111/campaigns/999" } },
          ],
        }),
      };
    }
    return {
      httpStatus: 200,
      bodyText: JSON.stringify({
        results: [{ campaign: { resourceName: "customers/1111111111/campaigns/999", id: "999", status: mode === "enabled" ? "ENABLED" : "PAUSED" } }],
      }),
    };
  };
  return { calls, transport };
}

function publisher(transport: GoogleAuthTransport, idFactory?: () => string) {
  let tick = 0;
  return createCampaignPublisher({ now: () => tick++, timestamp: () => T0, idFactory, transport });
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
  check("statuses are OK and REJECTED", CAMPAIGN_PUBLISH_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", CAMPAIGN_PUBLISH_ORIGINS.join() === "OBSERVED" && CAMPAIGN_PUBLISH_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the draft, the session, and the customer", CAMPAIGN_PUBLISH_CONTEXT_MEMBERS.join() === "draft,session,customerId,developerToken,executionMetadata,runtimeMetadata");

  const live = scripted();
  const input = inputOf();
  const draftBefore = JSON.stringify(input.draft);
  const host = publisher(live.transport);
  const published = await host.publish(input);
  input.draft.name = "changed";
  input.executionMetadata.note = "changed";
  const stored = JSON.stringify(published);
  const mutateBody = live.calls[0]?.body ?? "";
  check(
    "one paused draft becomes one campaign resource",
    published.status === "OK" &&
      published.publishedCampaign?.resourceName === "customers/1111111111/campaigns/999" &&
      published.publishedCampaign.campaignId === "999" &&
      published.publishedCampaign.status === "PAUSED" &&
      published.publishedCampaign.publishedAt === T0 &&
      published.apiResponse?.httpStatus === 200 &&
      published.apiResponse.budgetResourceName === "customers/1111111111/campaignBudgets/888" &&
      published.apiResponse.observedStatus === "PAUSED" &&
      published.statistics.requestCount === 2 &&
      published.statistics.operationCount === 2 &&
      published.statistics.publishedCount === 1 &&
      published.statistics.issueCount === 0 &&
      live.calls.length === 2 &&
      mutateBody.includes('"status":"PAUSED"') &&
      mutateBody.includes('"amountMicros":"1000000"') &&
      mutateBody.includes("Paused Test Draft") &&
      !mutateBody.includes("ENABLED") &&
      !mutateBody.includes("adGroup") &&
      live.calls[0]?.headers["developer-token"] === "developer-marker" &&
      live.calls[0]?.headers.Authorization === "Bearer access-marker" &&
      Object.keys(published).join() === CAMPAIGN_PUBLISH_RESULT_KEYS.join() &&
      Object.keys(published.publishedCampaign ?? {}).join() === PUBLISHED_CAMPAIGN_KEYS.join() &&
      Object.keys(published.statistics).join() === CAMPAIGN_PUBLISH_STATISTICS_KEYS.join() &&
      Object.keys(published.snapshot ?? {}).join() === CAMPAIGN_PUBLISH_SNAPSHOT_KEYS.join(),
  );
  check(
    "the draft is unchanged and the published resource is immutable",
    JSON.stringify({ ...input.draft, name: "Paused Test Draft" }) === draftBefore &&
      input.draft.name === "changed" &&
      published.snapshot !== null &&
      host.getSnapshot("campaign-publish-1") === published.snapshot &&
      Object.isFrozen(published.snapshot) &&
      Object.isFrozen(published.publishedCampaign) &&
      published.snapshot?.metadata.note === "kept" &&
      published.snapshot.publishedCampaign.resourceName === "customers/1111111111/campaigns/999" &&
      !("name" in published.snapshot.publishedCampaign),
  );
  check("no secrets are stored on the published campaign or the snapshot", SECRETS.every((secret) => !stored.includes(secret)));

  const duplicate = await host.publish(inputOf());
  check("a second publish of the same draft sends no further request", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Campaign/) && duplicate.snapshot === null && live.calls.length === 2);

  const again = scripted();
  const second = await publisher(again.transport).publish(inputOf());
  check(
    "a second publisher reproduces the resource and keeps its own snapshot",
    second.status === "OK" &&
      second.snapshot !== published.snapshot &&
      JSON.stringify(second.publishedCampaign) === JSON.stringify(published.publishedCampaign) &&
      publisher(scripted().transport).getSnapshot("campaign-publish-1") === null,
  );

  const missingSession = scripted();
  const noSession = await publisher(missingSession.transport).publish({ ...inputOf(), session: null });
  check("missing authentication stores nothing and sends no request", noSession.status === "REJECTED" && has(noSession.issues, /Missing Authentication/) && noSession.snapshot === null && missingSession.calls.length === 0);

  const missingCustomer = scripted();
  const noCustomer = await publisher(missingCustomer.transport).publish({ ...inputOf(), customerId: "  " });
  check("a missing customer stores nothing and sends no request", noCustomer.status === "REJECTED" && has(noCustomer.issues, /Missing Customer/) && noCustomer.snapshot === null && missingCustomer.calls.length === 0);

  const invalidDraft = scripted();
  const enabled = await publisher(invalidDraft.transport).publish(inputOf({ draft: draftOf({ status: "ENABLED" }) }));
  check("an enabled draft stores nothing and sends no request", enabled.status === "REJECTED" && has(enabled.issues, /Invalid Campaign Draft/) && enabled.snapshot === null && invalidDraft.calls.length === 0);

  const apiScript = scripted("api");
  const api = await publisher(apiScript.transport).publish(inputOf());
  check("an API error stores nothing", api.status === "REJECTED" && has(api.issues, /API Errors/) && api.snapshot === null && api.publishedCampaign === null && apiScript.calls.length === 1);

  const enabledScript = scripted("enabled");
  const enabledHost = publisher(enabledScript.transport);
  const observed = await enabledHost.publish(inputOf());
  const observedAgain = await enabledHost.publish(inputOf());
  check(
    "a resource that is not paused is refused and is not sent again by that publisher",
    observed.status === "REJECTED" &&
      has(observed.issues, /API Errors/) &&
      observed.snapshot === null &&
      enabledScript.calls.length === 2 &&
      observedAgain.status === "REJECTED" &&
      has(observedAgain.issues, /Duplicate Campaign/) &&
      enabledScript.calls.length === 2,
  );

  const badIdScript = scripted();
  const badId = await publisher(badIdScript.transport, () => "BAD").publish(inputOf());
  check("a corrupted publish id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && badIdScript.calls.length === 2);

  const dir = join(process.cwd(), "src/lib/google-ads-live");
  const names = [
    "campaign-publisher.ts",
    "campaign-operation-builder.ts",
    "campaign-publisher-client.ts",
    "campaign-publisher-validator.ts",
    "campaign-publisher-context.ts",
    "campaign-publisher-session.ts",
  ];
  check("six publisher modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the publisher does not retrieve by itself", !code.some((line) => /fetch\(|process\.env|node:fs|readFileSync/.test(line)));
  check("no group, keyword, or rsa operation is built", !code.some((line) => /adGroup|keyword|rsa/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "campaign-publisher-context.ts"), "utf8")));
  check("publisher imports stay inside this folder", !code.some((line) => /from\s+["']\.\.\//.test(line)));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the campaign publisher`, !sources.some((file) => /campaign-publisher/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`CAMPAIGN_PUBLISHER_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("CAMPAIGN_PUBLISHER_FAILURES=0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
