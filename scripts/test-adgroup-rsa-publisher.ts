import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createAdGroupPublisher } from "../src/lib/google-ads-live/adgroup-publisher.ts";
import { HEADLINE_MAX_LENGTH, HEADLINE_MIN_COUNT } from "../src/lib/google-ads-live/headline-validator.ts";
import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_COUNT } from "../src/lib/google-ads-live/description-validator.ts";
import {
  AD_GROUP_PUBLISH_CONTEXT_MEMBERS,
  AD_GROUP_PUBLISH_RESULT_KEYS,
  AD_GROUP_PUBLISH_SNAPSHOT_KEYS,
  PUBLISHED_AD_GROUP_KEYS,
  PUBLISHED_RSA_KEYS,
  RSA_PUBLISH_CONTEXT_MEMBERS,
  RSA_PUBLISH_RESULT_KEYS,
  RSA_PUBLISH_SNAPSHOT_KEYS,
} from "../src/lib/google-ads-live/publisher-context.ts";
import { createRsaPublisher } from "../src/lib/google-ads-live/rsa-publisher.ts";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const SECRETS = ["secret-marker", "refresh-marker", "developer-marker", "access-marker"];

function campaignOf() {
  return {
    draftId: "paused-test-draft",
    customerId: "1111111111",
    resourceName: "customers/1111111111/campaigns/999",
    campaignId: "999",
    status: "PAUSED",
    publishedAt: T0,
  };
}

function adGroupDraftOf(over: Record<string, unknown> = {}) {
  return {
    draftId: "paused-test-group",
    name: "Paused Test Group",
    status: "PAUSED",
    type: "SEARCH_STANDARD",
    cpcBidMicros: 1000000,
    ...over,
  };
}

function headline(text: string, pinnedField: string | null = null) {
  return { text, pinnedField };
}

function rsaDraftOf(over: Record<string, unknown> = {}) {
  return {
    draftId: "paused-test-ad",
    status: "PAUSED",
    headlines: [headline("North Offer Alpha", "HEADLINE_1"), headline("North Offer Beta"), headline("North Offer Gamma")],
    descriptions: [
      { text: "Plain offer details for the paused test.", pinnedField: "DESCRIPTION_1" },
      { text: "Second plain offer detail for the test.", pinnedField: null },
    ],
    finalUrls: ["https://example.test/offer"],
    path1: "offer",
    path2: "page",
    ...over,
  };
}

function publishedGroupOf(over: Record<string, unknown> = {}) {
  return {
    draftId: "paused-test-group",
    customerId: "1111111111",
    campaignResourceName: "customers/1111111111/campaigns/999",
    resourceName: "customers/1111111111/adGroups/777",
    adGroupId: "777",
    status: "PAUSED",
    publishedAt: T0,
    ...over,
  };
}

function sessionOf() {
  return { sessionId: "session-1", authenticated: true, tokenType: "Bearer", expiresIn: 3600, accessToken: "access-marker" };
}

function groupInput(over: Record<string, unknown> = {}) {
  return {
    session: sessionOf(),
    publishedCampaign: campaignOf(),
    adGroupDraft: adGroupDraftOf(),
    developerToken: "developer-marker",
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function rsaInput(over: Record<string, unknown> = {}) {
  return {
    session: sessionOf(),
    publishedCampaign: campaignOf(),
    publishedAdGroup: publishedGroupOf(),
    rsaDraft: rsaDraftOf(),
    developerToken: "developer-marker",
    executionMetadata: { note: "kept" },
    ...over,
  };
}

function groupScript(mode: "ok" | "api" | "enabled" = "ok") {
  const calls: GoogleAuthHttpRequest[] = [];
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    if (request.url.endsWith("/googleAds:mutate")) {
      if (mode === "api") return { httpStatus: 400, bodyText: JSON.stringify({ error: { details: [{ errors: [{ errorCode: { adGroupError: "DUPLICATE_ADGROUP_NAME" } }] }] } }) };
      return { httpStatus: 200, bodyText: JSON.stringify({ mutateOperationResponses: [{ adGroupResult: { resourceName: "customers/1111111111/adGroups/777" } }] }) };
    }
    return {
      httpStatus: 200,
      bodyText: JSON.stringify({
        results: [{ adGroup: { resourceName: "customers/1111111111/adGroups/777", id: "777", status: mode === "enabled" ? "ENABLED" : "PAUSED" } }],
      }),
    };
  };
  return { calls, transport };
}

function rsaScript(mode: "ok" | "api" | "enabled" | "unreviewed" = "ok") {
  const calls: GoogleAuthHttpRequest[] = [];
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    if (request.url.endsWith("/googleAds:mutate")) {
      if (mode === "api") return { httpStatus: 400, bodyText: JSON.stringify({ error: { message: "refused" } }) };
      return {
        httpStatus: 200,
        bodyText: JSON.stringify({ mutateOperationResponses: [{ adGroupAdResult: { resourceName: "customers/1111111111/adGroupAds/777~555" } }] }),
      };
    }
    return {
      httpStatus: 200,
      bodyText: JSON.stringify({
        results: [
          {
            adGroupAd: {
              resourceName: "customers/1111111111/adGroupAds/777~555",
              status: mode === "enabled" ? "ENABLED" : "PAUSED",
              policySummary: mode === "unreviewed" ? { reviewStatus: "PENDING", approvalStatus: "UNKNOWN" } : { reviewStatus: "REVIEW_IN_PROGRESS", approvalStatus: "UNKNOWN" },
            },
          },
        ],
      }),
    };
  };
  return { calls, transport };
}

function groupHost(transport: GoogleAuthTransport, idFactory?: () => string) {
  let tick = 0;
  return createAdGroupPublisher({ now: () => tick++, timestamp: () => T0, idFactory, transport });
}

function rsaHost(transport: GoogleAuthTransport, idFactory?: () => string) {
  let tick = 0;
  return createRsaPublisher({ now: () => tick++, timestamp: () => T0, idFactory, transport });
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
  check("ad group context names the session, the campaign, and the draft", AD_GROUP_PUBLISH_CONTEXT_MEMBERS.join() === "session,publishedCampaign,adGroupDraft,developerToken,executionMetadata,runtimeMetadata");
  check("rsa context names the session, the campaign, the ad group, and the draft", RSA_PUBLISH_CONTEXT_MEMBERS.join() === "session,publishedCampaign,publishedAdGroup,rsaDraft,developerToken,executionMetadata,runtimeMetadata");
  check("headline and description limits are the responsive search ad limits", HEADLINE_MIN_COUNT === 3 && HEADLINE_MAX_LENGTH === 30 && DESCRIPTION_MIN_COUNT === 2 && DESCRIPTION_MAX_LENGTH === 90);

  const live = groupScript();
  const input = groupInput();
  const draftBefore = JSON.stringify(input.adGroupDraft);
  const campaignBefore = JSON.stringify(input.publishedCampaign);
  const host = groupHost(live.transport);
  const published = await host.publish(input);
  input.adGroupDraft.name = "changed";
  input.executionMetadata.note = "changed";
  const mutateBody = live.calls[0]?.body ?? "";
  check(
    "one paused ad group draft becomes one paused ad group resource",
    published.status === "OK" &&
      published.publishedAdGroup?.resourceName === "customers/1111111111/adGroups/777" &&
      published.publishedAdGroup.adGroupId === "777" &&
      published.publishedAdGroup.status === "PAUSED" &&
      published.publishedAdGroup.publishedAt === T0 &&
      published.publishedAdGroup.campaignResourceName === "customers/1111111111/campaigns/999" &&
      published.apiResponse?.httpStatus === 200 &&
      published.apiResponse.observedStatus === "PAUSED" &&
      published.statistics.requestCount === 2 &&
      published.statistics.operationCount === 1 &&
      published.statistics.publishedCount === 1 &&
      live.calls.length === 2 &&
      live.calls.every((call) => call.url.includes("/customers/1111111111/googleAds:")) &&
      mutateBody.includes('"status":"PAUSED"') &&
      mutateBody.includes('"cpcBidMicros":"1000000"') &&
      mutateBody.includes("Paused Test Group") &&
      mutateBody.includes("customers/1111111111/campaigns/999") &&
      !mutateBody.includes('"status":"ENABLED"') &&
      !mutateBody.includes("biddingStrategy") &&
      !/budget|keyword/i.test(mutateBody) &&
      !("developer-token" in (live.calls[0]?.headers ?? {})) &&
      live.calls[0]?.headers.Authorization === "Bearer access-marker" &&
      Object.keys(published).join() === AD_GROUP_PUBLISH_RESULT_KEYS.join() &&
      Object.keys(published.publishedAdGroup ?? {}).join() === PUBLISHED_AD_GROUP_KEYS.join() &&
      Object.keys(published.snapshot ?? {}).join() === AD_GROUP_PUBLISH_SNAPSHOT_KEYS.join(),
  );
  check(
    "the ad group draft is unchanged and the published resource is immutable",
    JSON.stringify({ ...input.adGroupDraft, name: "Paused Test Group" }) === draftBefore &&
      JSON.stringify(input.publishedCampaign) === campaignBefore &&
      published.snapshot !== null &&
      host.getSnapshot("adgroup-publish-1") === published.snapshot &&
      Object.isFrozen(published.snapshot) &&
      Object.isFrozen(published.publishedAdGroup) &&
      published.snapshot?.metadata.note === "kept",
  );
  check("no secrets are stored on the published ad group", SECRETS.every((secret) => !JSON.stringify(published).includes(secret)));

  const duplicate = await host.publish(groupInput());
  check("a second ad group publish sends no further request", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Assets/) && duplicate.snapshot === null && live.calls.length === 2);

  const again = groupScript();
  const second = await groupHost(again.transport).publish(groupInput());
  check("a second ad group publisher reproduces the resource and keeps its own snapshot", second.status === "OK" && second.snapshot !== published.snapshot && JSON.stringify(second.publishedAdGroup) === JSON.stringify(published.publishedAdGroup));

  const missingSession = groupScript();
  const noSession = await groupHost(missingSession.transport).publish({ ...groupInput(), session: null });
  check("missing authentication stores nothing and sends no ad group request", noSession.status === "REJECTED" && has(noSession.issues, /Missing Authentication/) && noSession.snapshot === null && missingSession.calls.length === 0);

  const missingCampaign = groupScript();
  const noCampaign = await groupHost(missingCampaign.transport).publish({ ...groupInput(), publishedCampaign: null });
  check("a missing campaign stores nothing and sends no ad group request", noCampaign.status === "REJECTED" && has(noCampaign.issues, /Missing Campaign/) && noCampaign.snapshot === null && missingCampaign.calls.length === 0);

  const enabledCampaign = groupScript();
  const openCampaign = await groupHost(enabledCampaign.transport).publish({ ...groupInput(), publishedCampaign: { ...campaignOf(), status: "ENABLED" } });
  check("an enabled campaign is refused before any ad group request", openCampaign.status === "REJECTED" && has(openCampaign.issues, /Missing Campaign/) && enabledCampaign.calls.length === 0);

  const invalidDraft = groupScript();
  const enabled = await groupHost(invalidDraft.transport).publish(groupInput({ adGroupDraft: adGroupDraftOf({ status: "ENABLED" }) }));
  check("an enabled ad group draft stores nothing and sends no request", enabled.status === "REJECTED" && has(enabled.issues, /Invalid Ad Group Draft/) && invalidDraft.calls.length === 0);

  const apiScript = groupScript("api");
  const api = await groupHost(apiScript.transport).publish(groupInput());
  check("a duplicate ad group name from the account service stores nothing", api.status === "REJECTED" && has(api.issues, /Duplicate Assets/) && api.snapshot === null && apiScript.calls.length === 1);

  const enabledScript = groupScript("enabled");
  const enabledHost = groupHost(enabledScript.transport);
  const observed = await enabledHost.publish(groupInput());
  const observedAgain = await enabledHost.publish(groupInput());
  check(
    "an ad group that is not paused is refused and is not sent again",
    observed.status === "REJECTED" && has(observed.issues, /API Errors/) && observed.snapshot === null && enabledScript.calls.length === 2 && observedAgain.status === "REJECTED" && has(observedAgain.issues, /Duplicate Assets/) && enabledScript.calls.length === 2,
  );

  const badIdScript = groupScript();
  const badId = await groupHost(badIdScript.transport, () => "BAD").publish(groupInput());
  check("a corrupted ad group publish id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && badIdScript.calls.length === 2);

  const rsaLive = rsaScript();
  const rsaSource = rsaInput();
  const rsaBefore = JSON.stringify(rsaSource.rsaDraft);
  const groupBefore = JSON.stringify(rsaSource.publishedAdGroup);
  const ads = rsaHost(rsaLive.transport);
  const rsaPublished = await ads.publish(rsaSource);
  rsaSource.rsaDraft.headlines[0]!.text = "changed";
  rsaSource.executionMetadata.note = "changed";
  const rsaBody = rsaLive.calls[0]?.body ?? "";
  check(
    "one paused responsive search ad draft becomes one paused ad resource",
    rsaPublished.status === "OK" &&
      rsaPublished.publishedRsa?.resourceName === "customers/1111111111/adGroupAds/777~555" &&
      rsaPublished.publishedRsa.adId === "555" &&
      rsaPublished.publishedRsa.status === "PAUSED" &&
      rsaPublished.publishedRsa.policyReviewStatus === "REVIEW_IN_PROGRESS" &&
      rsaPublished.publishedRsa.approvalStatus === "UNKNOWN" &&
      rsaPublished.publishedRsa.publishedAt === T0 &&
      rsaPublished.apiResponse?.observedStatus === "PAUSED" &&
      rsaPublished.statistics.requestCount === 2 &&
      rsaPublished.statistics.operationCount === 1 &&
      rsaLive.calls.length === 2 &&
      rsaBody.includes('"status":"PAUSED"') &&
      rsaBody.includes("North Offer Alpha") &&
      rsaBody.includes('"pinnedField":"HEADLINE_1"') &&
      rsaBody.includes('"pinnedField":"DESCRIPTION_1"') &&
      rsaBody.includes("https://example.test/offer") &&
      rsaBody.includes('"path1":"offer"') &&
      rsaBody.includes('"path2":"page"') &&
      rsaBody.includes("customers/1111111111/adGroups/777") &&
      !rsaBody.includes('"status":"ENABLED"') &&
      !rsaBody.includes("biddingStrategy") &&
      !/budget|keyword/i.test(rsaBody) &&
      Object.keys(rsaPublished).join() === RSA_PUBLISH_RESULT_KEYS.join() &&
      Object.keys(rsaPublished.publishedRsa ?? {}).join() === PUBLISHED_RSA_KEYS.join() &&
      Object.keys(rsaPublished.snapshot ?? {}).join() === RSA_PUBLISH_SNAPSHOT_KEYS.join(),
  );
  check(
    "the responsive search ad draft is unchanged and the published ad is immutable",
    JSON.stringify(rsaSource.publishedAdGroup) === groupBefore &&
      rsaSource.rsaDraft.headlines[0]?.text === "changed" &&
      rsaPublished.snapshot !== null &&
      ads.getSnapshot("rsa-publish-1") === rsaPublished.snapshot &&
      Object.isFrozen(rsaPublished.snapshot) &&
      Object.isFrozen(rsaPublished.publishedRsa) &&
      rsaPublished.snapshot?.metadata.note === "kept" &&
      rsaPublished.publishedRsa?.policyReviewStatus === "REVIEW_IN_PROGRESS",
  );
  check("the draft text is still the text that was sent", rsaBefore.includes("North Offer Alpha"));
  check("no secrets are stored on the published ad", SECRETS.every((secret) => !JSON.stringify(rsaPublished).includes(secret)));

  const rsaDuplicate = await ads.publish(rsaInput());
  check("a second responsive search ad publish sends no further request", rsaDuplicate.status === "REJECTED" && has(rsaDuplicate.issues, /Duplicate Assets/) && rsaDuplicate.snapshot === null && rsaLive.calls.length === 2);

  const rsaAgain = rsaScript();
  const rsaSecond = await rsaHost(rsaAgain.transport).publish(rsaInput());
  check("a second ad publisher reproduces the resource and keeps its own snapshot", rsaSecond.status === "OK" && rsaSecond.snapshot !== rsaPublished.snapshot && JSON.stringify(rsaSecond.publishedRsa) === JSON.stringify(rsaPublished.publishedRsa));

  const shortHeadlines = rsaScript();
  const tooFew = await rsaHost(shortHeadlines.transport).publish(rsaInput({ rsaDraft: rsaDraftOf({ headlines: [headline("One"), headline("Two")] }) }));
  check("fewer than three headlines is a policy violation and sends no request", tooFew.status === "REJECTED" && has(tooFew.issues, /Policy Violations/) && shortHeadlines.calls.length === 0);

  const longHeadline = rsaScript();
  const tooLong = await rsaHost(longHeadline.transport).publish(rsaInput({ rsaDraft: rsaDraftOf({ headlines: [headline("A".repeat(31)), headline("North Offer Beta"), headline("North Offer Gamma")] }) }));
  check("a headline over 30 characters is a policy violation and sends no request", tooLong.status === "REJECTED" && has(tooLong.issues, /Policy Violations/) && longHeadline.calls.length === 0);

  const longDescription = rsaScript();
  const descriptionOver = await rsaHost(longDescription.transport).publish(
    rsaInput({
      rsaDraft: rsaDraftOf({
        descriptions: [
          { text: "D".repeat(91), pinnedField: null },
          { text: "Second plain offer detail for the test.", pinnedField: null },
        ],
      }),
    }),
  );
  check("a description over 90 characters is a policy violation and sends no request", descriptionOver.status === "REJECTED" && has(descriptionOver.issues, /Policy Violations/) && longDescription.calls.length === 0);

  const repeated = rsaScript();
  const sameHeadline = await rsaHost(repeated.transport).publish(rsaInput({ rsaDraft: rsaDraftOf({ headlines: [headline("North Offer Alpha"), headline("North Offer Alpha"), headline("North Offer Gamma")] }) }));
  check("a repeated headline is a duplicate asset and sends no request", sameHeadline.status === "REJECTED" && has(sameHeadline.issues, /Duplicate Assets/) && repeated.calls.length === 0);

  const repeatedPin = rsaScript();
  const samePin = await rsaHost(repeatedPin.transport).publish(
    rsaInput({ rsaDraft: rsaDraftOf({ headlines: [headline("North Offer Alpha", "HEADLINE_1"), headline("North Offer Beta", "HEADLINE_1"), headline("North Offer Gamma")] }) }),
  );
  check("a repeated headline pin is a duplicate asset and sends no request", samePin.status === "REJECTED" && has(samePin.issues, /Duplicate Assets/) && repeatedPin.calls.length === 0);

  const insecure = rsaScript();
  const httpUrl = await rsaHost(insecure.transport).publish(rsaInput({ rsaDraft: rsaDraftOf({ finalUrls: ["http://example.test/offer"] }) }));
  check("a non-https final URL is a policy violation and sends no request", httpUrl.status === "REJECTED" && has(httpUrl.issues, /Policy Violations/) && insecure.calls.length === 0);

  const longPath = rsaScript();
  const pathOver = await rsaHost(longPath.transport).publish(rsaInput({ rsaDraft: rsaDraftOf({ path1: "abcdefghijklmnop" }) }));
  check("a display path over 15 characters is a policy violation and sends no request", pathOver.status === "REJECTED" && has(pathOver.issues, /Policy Violations/) && longPath.calls.length === 0);

  const missingPath = rsaScript();
  const pathOrder = await rsaHost(missingPath.transport).publish(rsaInput({ rsaDraft: rsaDraftOf({ path1: "", path2: "page" }) }));
  check("a second display path without the first is a policy violation and sends no request", pathOrder.status === "REJECTED" && has(pathOrder.issues, /Policy Violations/) && missingPath.calls.length === 0);

  const enabledAd = rsaScript();
  const serving = await rsaHost(enabledAd.transport).publish(rsaInput({ rsaDraft: rsaDraftOf({ status: "ENABLED" }) }));
  check("an enabled ad draft stores nothing and sends no request", serving.status === "REJECTED" && has(serving.issues, /Invalid RSA Draft/) && enabledAd.calls.length === 0);

  const otherGroup = rsaScript();
  const outside = await rsaHost(otherGroup.transport).publish(rsaInput({ publishedAdGroup: publishedGroupOf({ campaignResourceName: "customers/1111111111/campaigns/1", resourceName: "customers/1111111111/adGroups/1", adGroupId: "1" }) }));
  check("an ad group outside the published campaign sends no request", outside.status === "REJECTED" && has(outside.issues, /Missing Campaign/) && otherGroup.calls.length === 0);

  const rsaApi = rsaScript("api");
  const rsaRefused = await rsaHost(rsaApi.transport).publish(rsaInput());
  check("an ad API error stores nothing", rsaRefused.status === "REJECTED" && has(rsaRefused.issues, /API Errors/) && rsaRefused.snapshot === null && rsaApi.calls.length === 1);

  const rsaEnabled = rsaScript("enabled");
  const rsaEnabledHost = rsaHost(rsaEnabled.transport);
  const rsaObserved = await rsaEnabledHost.publish(rsaInput());
  const rsaObservedAgain = await rsaEnabledHost.publish(rsaInput());
  check(
    "an ad that is not paused is refused and is not sent again",
    rsaObserved.status === "REJECTED" && has(rsaObserved.issues, /API Errors/) && rsaObserved.snapshot === null && rsaEnabled.calls.length === 2 && rsaObservedAgain.status === "REJECTED" && has(rsaObservedAgain.issues, /Duplicate Assets/) && rsaEnabled.calls.length === 2,
  );

  const unreviewed = rsaScript("unreviewed");
  const missingPolicy = await rsaHost(unreviewed.transport).publish(rsaInput());
  check("a missing policy review status stores nothing", missingPolicy.status === "REJECTED" && has(missingPolicy.issues, /API Errors/) && missingPolicy.snapshot === null && unreviewed.calls.length === 2);

  const rsaBad = rsaScript();
  const rsaBadId = await rsaHost(rsaBad.transport, () => "BAD").publish(rsaInput());
  check("a corrupted ad publish id stores nothing", rsaBadId.status === "REJECTED" && has(rsaBadId.issues, /Invalid Metadata/) && rsaBadId.snapshot === null && rsaBad.calls.length === 2);

  const dir = join(process.cwd(), "src/lib/google-ads-live");
  const names = ["adgroup-publisher.ts", "rsa-publisher.ts", "asset-builder.ts", "headline-validator.ts", "description-validator.ts", "publisher-validator.ts", "publisher-context.ts"];
  check("seven publisher modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const bundled = names.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the publishers do not retrieve by themselves", !code.some((line) => /fetch\(|process\.env|node:fs|readFileSync/.test(line)));
  check("no keyword, budget change, or serving status is built", !code.some((line) => /\bkeyword\b|\bbudget\b|biddingStrategy|recommend/i.test(line)) && !code.some((line) => /status:\s*"ENABLED"/.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "publisher-context.ts"), "utf8")));
  check("publisher imports stay inside this folder", !code.some((line) => /from\s+["']\.\.\//.test(line)));
  const campaignFiles = ["campaign-publisher.ts", "campaign-operation-builder.ts", "campaign-publisher-client.ts", "campaign-publisher-validator.ts", "campaign-publisher-context.ts", "campaign-publisher-session.ts"];
  check("the campaign publisher does not import the ad group or ad publisher", campaignFiles.every((name) => !/adgroup-publisher|rsa-publisher/.test(readFileSync(join(dir, name), "utf8"))));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the ad publishers`, !sources.some((file) => /adgroup-publisher|rsa-publisher/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`ADGROUP_RSA_PUBLISHER_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("ADGROUP_RSA_PUBLISHER_FAILURES=0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
