/**
 * Google Ads Live — RC1 acceptance audit.
 * Validation only. Does not add host behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createGoogleAuthProvider } from "../src/lib/google-ads-live/google-auth-provider.ts";
import { createCampaignPublisher } from "../src/lib/google-ads-live/campaign-publisher.ts";
import { createAdGroupPublisher } from "../src/lib/google-ads-live/adgroup-publisher.ts";
import { createRsaPublisher } from "../src/lib/google-ads-live/rsa-publisher.ts";
import { createCampaignSynchronizer } from "../src/lib/google-ads-live/campaign-synchronizer.ts";
import type { GoogleAuthHttpRequest, GoogleAuthTransport } from "../src/lib/google-ads-live/google-auth-client.ts";

const GATES = [
  "GOOGLE_AUTH",
  "ACCOUNT_MANAGER",
  "CAMPAIGN_PUBLISHER",
  "ADGROUP_PUBLISHER",
  "RSA_PUBLISHER",
  "CAMPAIGN_SYNCHRONIZATION",
  "NEGATIVE_TESTS",
  "REGRESSION",
  "PERFORMANCE",
  "GENERICITY",
] as const;
type Gate = (typeof GATES)[number];
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Stage = "auth" | "account" | "campaign" | "adGroup" | "rsa" | "sync";

const failed = new Map<Gate, string[]>();
const bugs: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
let productHardcoding = 0;
const T0 = "2026-01-01T00:00:00.000Z";
const CUSTOMER = "2222222222";
const CAMPAIGN = `customers/${CUSTOMER}/campaigns/999`;
const AD_GROUP = `customers/${CUSTOMER}/adGroups/777`;
const AD = `customers/${CUSTOMER}/adGroupAds/777~555`;
const SECRETS = ["secret-marker", "refresh-marker", "developer-marker", "access-marker"];

function check(gate: Gate, label: string, ok: boolean, severity: Severity = "HIGH") {
  if (!ok) {
    const list = failed.get(gate) ?? [];
    list.push(label);
    failed.set(gate, list);
    bugs[severity] += 1;
  }
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
function clocks(prefix: string) {
  let n = 0;
  return { now: () => 0, timestamp: () => T0, idFactory: () => `${prefix}-${(n += 1)}` };
}
async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function json(value: unknown): { httpStatus: number; bodyText: string } {
  return { httpStatus: 200, bodyText: JSON.stringify(value) };
}

type Mode = "ok" | "expired" | "developer" | "empty" | "denied" | "api" | "unknown";

function scripted(mode: Mode = "ok") {
  const calls: GoogleAuthHttpRequest[] = [];
  const transport: GoogleAuthTransport = async (request) => {
    calls.push({ url: request.url, method: request.method, headers: { ...request.headers }, body: request.body });
    const body = request.body ?? "";
    if (request.url.endsWith("/token")) {
      if (mode === "expired") return { httpStatus: 400, bodyText: JSON.stringify({ error: "invalid_grant" }) };
      return json({ access_token: "access-marker", expires_in: 3600, token_type: "Bearer" });
    }
    if (request.url.includes("listAccessibleCustomers")) {
      if (mode === "developer") {
        return { httpStatus: 401, bodyText: JSON.stringify({ error: { details: [{ errors: [{ errorCode: { authenticationError: "DEVELOPER_TOKEN_INVALID" } }] }] } }) };
      }
      if (mode === "empty") return json({ resourceNames: [] });
      if (mode === "denied") {
        return { httpStatus: 403, bodyText: JSON.stringify({ error: { details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" } }] }] } }) };
      }
      return json({ resourceNames: ["customers/1111111111", `customers/${CUSTOMER}`] });
    }
    if (body.includes("customer_client")) {
      return json({
        results: [{ customerClient: { clientCustomer: "customers/3333333333", level: "1", manager: false, descriptiveName: "Child Desk", currencyCode: "USD", timeZone: "America/New_York", status: "ENABLED", id: "3333333333" } }],
      });
    }
    if (body.includes("descriptive_name")) {
      if (request.url.includes("/customers/1111111111/")) {
        return json({ results: [{ customer: { id: "1111111111", descriptiveName: "Manager North", manager: true, currencyCode: "USD", timeZone: "America/New_York", status: "ENABLED" } }] });
      }
      return json({ results: [{ customer: { id: CUSTOMER, descriptiveName: "Plain Account", manager: false, currencyCode: "USD", timeZone: "America/Chicago", status: "ENABLED" } }] });
    }
    if (request.url.endsWith("/googleAds:mutate")) {
      if (mode === "api") return { httpStatus: 400, bodyText: JSON.stringify({ error: { message: "refused" } }) };
      if (body.includes("adGroupAdOperation")) return json({ mutateOperationResponses: [{ adGroupAdResult: { resourceName: AD } }] });
      if (body.includes("adGroupOperation")) return json({ mutateOperationResponses: [{ adGroupResult: { resourceName: AD_GROUP } }] });
      return json({
        mutateOperationResponses: [
          { campaignBudgetResult: { resourceName: `customers/${CUSTOMER}/campaignBudgets/888` } },
          { campaignResult: { resourceName: CAMPAIGN } },
        ],
      });
    }
    if (body.includes("change_status")) return json({ results: [{ changeStatus: { campaign: CAMPAIGN, lastChangeDateTime: "2026-01-02 00:00:00", resourceType: "CAMPAIGN" } }] });
    if (body.includes("campaign_label")) {
      return json({ results: [{ campaign: { resourceName: CAMPAIGN }, label: { resourceName: `customers/${CUSTOMER}/labels/5`, id: "5", name: "North Label" } }] });
    }
    if (body.includes("ad_group_ad.resource_name =")) {
      return json({ results: [{ adGroupAd: { resourceName: AD, status: "PAUSED", policySummary: { reviewStatus: "REVIEW_IN_PROGRESS", approvalStatus: "UNKNOWN" } } }] });
    }
    if (body.includes("FROM ad_group_ad")) {
      return json({
        results: [{ campaign: { resourceName: CAMPAIGN }, adGroup: { resourceName: AD_GROUP }, adGroupAd: { resourceName: AD, status: "PAUSED", ad: { id: "555" }, policySummary: { approvalStatus: "UNKNOWN", reviewStatus: "REVIEW_IN_PROGRESS" } } }],
      });
    }
    if (body.includes("ad_group.resource_name =")) return json({ results: [{ adGroup: { resourceName: AD_GROUP, id: "777", status: "PAUSED" } }] });
    if (body.includes("FROM ad_group")) {
      return json({ results: [{ campaign: { resourceName: CAMPAIGN }, adGroup: { resourceName: AD_GROUP, id: "777", name: "Paused Test Group", status: "PAUSED" } }] });
    }
    if (body.includes("serving_status")) {
      if (mode === "unknown") return json({ results: [] });
      return json({
        results: [{
          campaign: { resourceName: CAMPAIGN, id: "999", name: "Paused Test Draft", status: "PAUSED", servingStatus: "SERVING" },
          campaignBudget: { resourceName: `customers/${CUSTOMER}/campaignBudgets/888`, name: "Paused Test Draft Budget", amountMicros: "1000000", status: "ENABLED" },
        }],
      });
    }
    if (body.includes("FROM campaign")) return json({ results: [{ campaign: { resourceName: CAMPAIGN, id: "999", status: "PAUSED" } }] });
    return { httpStatus: 500, bodyText: "" };
  };
  return { calls, transport };
}

function configuration(over: Record<string, unknown> = {}) {
  return { clientId: "client-marker", clientSecret: "secret-marker", developerToken: "developer-marker", refreshToken: "refresh-marker", ...over };
}
function authInput(over: Record<string, unknown> = {}) {
  return { configuration: configuration(), executionMetadata: { note: "kept" }, ...over };
}
function campaignDraft(over: Record<string, unknown> = {}) {
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
function groupDraft(over: Record<string, unknown> = {}) {
  return { draftId: "paused-test-group", name: "Paused Test Group", status: "PAUSED", type: "SEARCH_STANDARD", cpcBidMicros: 1000000, ...over };
}
function rsaDraft(over: Record<string, unknown> = {}) {
  return {
    draftId: "paused-test-ad",
    status: "PAUSED",
    headlines: [
      { text: "North Offer Alpha", pinnedField: "HEADLINE_1" },
      { text: "North Offer Beta", pinnedField: null },
      { text: "North Offer Gamma", pinnedField: null },
    ],
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
function counts(): Record<Stage, number> {
  return { auth: 0, account: 0, campaign: 0, adGroup: 0, rsa: 0, sync: 0 };
}

async function main() {
  const executions = counts();
  const live = scripted();
  const authHost = createGoogleAuthProvider({ ...clocks("auth"), transport: live.transport });
  const authSource = authInput();
  const authBefore = JSON.stringify(authSource);
  executions.auth += 1;
  const authenticated = await authHost.authenticate(authSource);
  authSource.configuration.clientId = "changed";
  const testAccount = authenticated.registry?.accounts.find((account) => account.manager === false && account.customerId === CUSTOMER) ?? null;
  if (authenticated.status === "OK" && authenticated.registry !== null && authenticated.session !== null) executions.account += 1;
  check(
    "GOOGLE_AUTH",
    "Authentication: one grant reads the accessible accounts and stores no credential",
    authenticated.status === "OK" &&
      authenticated.session?.authenticated === true &&
      authenticated.session.tokenType === "Bearer" &&
      authenticated.session.expiresIn === 3600 &&
      authenticated.evidence?.grantType === "refresh_token" &&
      authenticated.snapshot !== null &&
      Object.isFrozen(authenticated.snapshot) &&
      authenticated.snapshot.metadata.note === "kept" &&
      authHost.getSnapshot("auth-1") === authenticated.snapshot &&
      !("accessToken" in authenticated.session) &&
      SECRETS.every((secret) => !JSON.stringify(authenticated).includes(secret)),
  );
  check(
    "ACCOUNT_MANAGER",
    "Account Discovery: the registry lists the manager, the plain account, and the child once",
    authenticated.registry?.managerAccounts.map((account) => account.customerId).join() === "1111111111" &&
      authenticated.registry.accessibleCustomerIds.join() === `1111111111,${CUSTOMER}` &&
      authenticated.accounts?.map((account) => account.customerId).join() === `1111111111,${CUSTOMER},3333333333` &&
      testAccount?.customerId === CUSTOMER &&
      testAccount.manager === false &&
      Object.isFrozen(authenticated.registry),
  );

  const session = {
    sessionId: authenticated.session?.sessionId ?? "",
    authenticated: true as const,
    tokenType: authenticated.session?.tokenType ?? "",
    expiresIn: authenticated.session?.expiresIn ?? 0,
    accessToken: "access-marker",
  };
  const campaignHost = createCampaignPublisher({ ...clocks("campaign"), transport: live.transport });
  const campaignSource = { draft: campaignDraft(), session, customerId: CUSTOMER, developerToken: "developer-marker", executionMetadata: { note: "kept" } };
  const draftBefore = JSON.stringify(campaignSource.draft);
  let published: Awaited<ReturnType<typeof campaignHost.publish>> | null = null;
  if (authenticated.status === "OK" && testAccount !== null) {
    executions.campaign += 1;
    published = await campaignHost.publish(campaignSource);
  }
  check(
    "CAMPAIGN_PUBLISHER",
    "Campaign Publication: one paused draft becomes one paused campaign resource",
    published?.status === "OK" &&
      published.publishedCampaign?.resourceName === CAMPAIGN &&
      published.publishedCampaign.status === "PAUSED" &&
      published.publishedCampaign.customerId === CUSTOMER &&
      published.snapshot !== null &&
      Object.isFrozen(published.snapshot) &&
      published.snapshot.metadata.note === "kept" &&
      JSON.stringify(campaignSource.draft) === draftBefore &&
      SECRETS.every((secret) => !JSON.stringify(published).includes(secret)) &&
      live.calls.filter((call) => call.url.endsWith("/googleAds:mutate")).length === 1 &&
      !live.calls.some((call) => (call.body ?? "").includes('"status":"ENABLED"')),
  );

  const groupHost = createAdGroupPublisher({ ...clocks("group"), transport: live.transport });
  let grouped: Awaited<ReturnType<typeof groupHost.publish>> | null = null;
  if (published?.status === "OK" && published.publishedCampaign !== null) {
    executions.adGroup += 1;
    grouped = await groupHost.publish({
      session,
      publishedCampaign: published.publishedCampaign,
      adGroupDraft: groupDraft(),
      developerToken: "developer-marker",
      executionMetadata: { note: "kept" },
    });
  }
  check(
    "ADGROUP_PUBLISHER",
    "Ad Group Publication: one paused ad group is created inside the paused campaign",
    grouped?.status === "OK" &&
      grouped.publishedAdGroup?.resourceName === AD_GROUP &&
      grouped.publishedAdGroup.status === "PAUSED" &&
      grouped.publishedAdGroup.campaignResourceName === CAMPAIGN &&
      grouped.snapshot !== null &&
      Object.isFrozen(grouped.snapshot) &&
      grouped.snapshot.metadata.note === "kept" &&
      SECRETS.every((secret) => !JSON.stringify(grouped).includes(secret)),
  );

  const rsaHost = createRsaPublisher({ ...clocks("rsa"), transport: live.transport });
  let advertised: Awaited<ReturnType<typeof rsaHost.publish>> | null = null;
  if (published?.status === "OK" && published.publishedCampaign !== null && grouped?.status === "OK" && grouped.publishedAdGroup !== null) {
    executions.rsa += 1;
    advertised = await rsaHost.publish({
      session,
      publishedCampaign: published.publishedCampaign,
      publishedAdGroup: grouped.publishedAdGroup,
      rsaDraft: rsaDraft(),
      developerToken: "developer-marker",
      executionMetadata: { note: "kept" },
    });
  }
  check(
    "RSA_PUBLISHER",
    "RSA Publication: one paused responsive search ad records the policy review status",
    advertised?.status === "OK" &&
      advertised.publishedRsa?.resourceName === AD &&
      advertised.publishedRsa.status === "PAUSED" &&
      advertised.publishedRsa.policyReviewStatus === "REVIEW_IN_PROGRESS" &&
      advertised.publishedRsa.approvalStatus === "UNKNOWN" &&
      advertised.snapshot !== null &&
      Object.isFrozen(advertised.snapshot) &&
      advertised.snapshot.metadata.note === "kept" &&
      SECRETS.every((secret) => !JSON.stringify(advertised).includes(secret)),
  );

  const syncHost = createCampaignSynchronizer({ ...clocks("sync"), transport: live.transport });
  let synced: Awaited<ReturnType<typeof syncHost.synchronize>> | null = null;
  if (advertised?.status === "OK" && published?.publishedCampaign !== null) {
    executions.sync += 1;
    synced = await syncHost.synchronize({
      session,
      customerId: CUSTOMER,
      developerToken: "developer-marker",
      campaignResourceNames: [published.publishedCampaign.resourceName],
      executionMetadata: { note: "kept" },
    });
  }
  const mutateCount = live.calls.filter((call) => call.url.endsWith("/googleAds:mutate")).length;
  check(
    "CAMPAIGN_SYNCHRONIZATION",
    "Campaign Synchronization: the published campaign is read back without another write",
    synced?.status === "OK" &&
      synced.campaignSnapshot?.campaigns[0]?.resourceName === CAMPAIGN &&
      synced.campaignSnapshot.campaigns[0]?.status === "PAUSED" &&
      synced.campaignSnapshot.campaigns[0]?.servingStatus === "SERVING" &&
      synced.report?.priorSnapshotPresent === false &&
      synced.snapshot !== null &&
      Object.isFrozen(synced.snapshot) &&
      Object.isFrozen(synced.report) &&
      synced.snapshot.metadata.note === "kept" &&
      mutateCount === 3 &&
      live.calls.every((call) => call.url.endsWith("/token") || call.url.includes("listAccessibleCustomers") || call.url.includes("/googleAds:search") || call.url.endsWith("/googleAds:mutate")) &&
      SECRETS.every((secret) => !JSON.stringify(synced).includes(secret)),
  );
  check(
    "GOOGLE_AUTH",
    "Execution Metadata and immutable snapshots survive the walk",
    authBefore.includes("client-marker") &&
      authenticated.snapshot?.metadata.note === "kept" &&
      published?.snapshot?.metadata.note === "kept" &&
      grouped?.snapshot?.metadata.note === "kept" &&
      advertised?.snapshot?.metadata.note === "kept" &&
      synced?.snapshot?.metadata.note === "kept",
  );
  check(
    "REGRESSION",
    "Every host executes exactly once",
    executions.auth === 1 && executions.account === 1 && executions.campaign === 1 && executions.adGroup === 1 && executions.rsa === 1 && executions.sync === 1,
  );
  const again = await campaignHost.publish(campaignSource);
  check(
    "NEGATIVE_TESTS",
    "Duplicate Publication: a second campaign publish sends no further write",
    again.status === "REJECTED" && has(again.issues, /Duplicate Campaign/) && again.snapshot === null && live.calls.filter((call) => call.url.endsWith("/googleAds:mutate")).length === mutateCount,
  );
  check(
    "GOOGLE_AUTH",
    "Independent execution context: a second authentication host does not see the first snapshot",
    createGoogleAuthProvider({ ...clocks("other"), transport: scripted().transport }).getSnapshot("auth-1") === null && authHost.getSnapshot("auth-1") === authenticated.snapshot,
  );

  const stopped = counts();
  const missingHost = createGoogleAuthProvider({ ...clocks("missing"), transport: scripted().transport });
  stopped.auth += 1;
  const missingCredentials = await missingHost.authenticate({ configuration: { clientId: "", clientSecret: "", developerToken: "", refreshToken: "" }, executionMetadata: { note: "kept" } });
  const stoppedCampaign = missingCredentials.status === "OK" ? 1 : 0;
  stopped.campaign += stoppedCampaign;
  check("NEGATIVE_TESTS", "Missing OAuth Credentials: authentication stores nothing and the walk stops", missingCredentials.status === "REJECTED" && has(missingCredentials.issues, /Missing Credentials/) && missingCredentials.snapshot === null && stopped.auth === 1 && stopped.campaign === 0);

  const expiredScript = scripted("expired");
  const expired = await createGoogleAuthProvider({ ...clocks("expired"), transport: expiredScript.transport }).authenticate(authInput());
  check("NEGATIVE_TESTS", "Expired Refresh Token: the grant is refused and nothing is stored", expired.status === "REJECTED" && has(expired.issues, /Expired Refresh Token/) && expired.snapshot === null && expired.registry === null && expiredScript.calls.length === 1);

  const developerScript = scripted("developer");
  const developer = await createGoogleAuthProvider({ ...clocks("developer"), transport: developerScript.transport }).authenticate(authInput());
  check("NEGATIVE_TESTS", "Invalid Developer Token: account discovery stores nothing and no campaign write follows", developer.status === "REJECTED" && has(developer.issues, /Invalid Developer Token/) && developer.registry === null && !developerScript.calls.some((call) => call.url.endsWith("/googleAds:mutate")));

  const emptyScript = scripted("empty");
  const emptyCustomers = await createGoogleAuthProvider({ ...clocks("empty"), transport: emptyScript.transport }).authenticate(authInput());
  check("NEGATIVE_TESTS", "Missing Customer Access: an empty customer list stores nothing", emptyCustomers.status === "REJECTED" && has(emptyCustomers.issues, /Missing Customer Access/) && emptyCustomers.snapshot === null);

  const deniedScript = scripted("denied");
  const denied = await createGoogleAuthProvider({ ...clocks("denied"), transport: deniedScript.transport }).authenticate(authInput());
  check("NEGATIVE_TESTS", "Missing Customer Access: a refused customer list stores nothing", denied.status === "REJECTED" && has(denied.issues, /Missing Customer Access/) && denied.accounts === null);

  const badCampaign = scripted();
  const invalidCampaign = await createCampaignPublisher({ ...clocks("bad-campaign"), transport: badCampaign.transport }).publish({ ...campaignSource, draft: campaignDraft({ status: "ENABLED" }) });
  check("NEGATIVE_TESTS", "Invalid Campaign Draft: an enabled draft stores nothing and sends no request", invalidCampaign.status === "REJECTED" && has(invalidCampaign.issues, /Invalid Campaign Draft/) && invalidCampaign.snapshot === null && badCampaign.calls.length === 0);

  const badGroup = scripted();
  const invalidGroup = await createAdGroupPublisher({ ...clocks("bad-group"), transport: badGroup.transport }).publish({
    session,
    publishedCampaign: published?.publishedCampaign,
    adGroupDraft: groupDraft({ status: "ENABLED" }),
    developerToken: "developer-marker",
    executionMetadata: { note: "kept" },
  });
  check("NEGATIVE_TESTS", "Invalid Ad Group Draft: an enabled ad group stores nothing and sends no request", invalidGroup.status === "REJECTED" && has(invalidGroup.issues, /Invalid Ad Group Draft/) && badGroup.calls.length === 0);

  const badRsa = scripted();
  const invalidRsa = await createRsaPublisher({ ...clocks("bad-rsa"), transport: badRsa.transport }).publish({
    session,
    publishedCampaign: published?.publishedCampaign,
    publishedAdGroup: grouped?.publishedAdGroup,
    rsaDraft: rsaDraft({ status: "ENABLED" }),
    developerToken: "developer-marker",
    executionMetadata: { note: "kept" },
  });
  check("NEGATIVE_TESTS", "Invalid RSA Draft: an enabled ad stores nothing and sends no request", invalidRsa.status === "REJECTED" && has(invalidRsa.issues, /Invalid RSA Draft/) && badRsa.calls.length === 0);

  const policyScript = scripted();
  const policy = await createRsaPublisher({ ...clocks("policy"), transport: policyScript.transport }).publish({
    session,
    publishedCampaign: published?.publishedCampaign,
    publishedAdGroup: grouped?.publishedAdGroup,
    rsaDraft: rsaDraft({ headlines: [{ text: "One", pinnedField: null }, { text: "Two", pinnedField: null }] }),
    developerToken: "developer-marker",
    executionMetadata: { note: "kept" },
  });
  check("NEGATIVE_TESTS", "Policy Violations: fewer than three headlines stores nothing and sends no request", policy.status === "REJECTED" && has(policy.issues, /Policy Violations/) && policy.snapshot === null && policyScript.calls.length === 0);

  const unknownScript = scripted("unknown");
  const unknown = await createCampaignSynchronizer({ ...clocks("unknown"), transport: unknownScript.transport }).synchronize({
    session,
    customerId: CUSTOMER,
    developerToken: "developer-marker",
    campaignResourceNames: [CAMPAIGN],
    executionMetadata: { note: "kept" },
  });
  check("NEGATIVE_TESTS", "Unknown Campaign: a missing campaign stores nothing", unknown.status === "REJECTED" && has(unknown.issues, /Unknown Campaign/) && unknown.snapshot === null && !unknownScript.calls.some((call) => call.url.endsWith("/googleAds:mutate")));

  const apiScript = scripted("api");
  const api = await createCampaignPublisher({ ...clocks("api"), transport: apiScript.transport }).publish(campaignSource);
  check("NEGATIVE_TESTS", "API Errors: a refused campaign write stores nothing", api.status === "REJECTED" && has(api.issues, /API Errors/) && api.snapshot === null && api.publishedCampaign === null);

  const metaScript = scripted();
  const invalidMeta = await createGoogleAuthProvider({ ...clocks("meta"), transport: metaScript.transport }).authenticate(authInput({ executionMetadata: { nested: { inner: true } } }));
  check("NEGATIVE_TESTS", "Invalid Metadata: nested metadata stores nothing and sends no request", invalidMeta.status === "REJECTED" && has(invalidMeta.issues, /Invalid Metadata/) && invalidMeta.snapshot === null && metaScript.calls.length === 0);

  const authTimed = await timed(() => createGoogleAuthProvider({ ...clocks("perf-auth"), transport: scripted().transport }).authenticate(authInput()));
  const campaignTimed = await timed(() => createCampaignPublisher({ ...clocks("perf-campaign"), transport: scripted().transport }).publish(campaignSource));
  const groupTimed = await timed(() =>
    createAdGroupPublisher({ ...clocks("perf-group"), transport: scripted().transport }).publish({
      session,
      publishedCampaign: published?.publishedCampaign,
      adGroupDraft: groupDraft(),
      developerToken: "developer-marker",
      executionMetadata: { note: "kept" },
    }),
  );
  const rsaTimed = await timed(() =>
    createRsaPublisher({ ...clocks("perf-rsa"), transport: scripted().transport }).publish({
      session,
      publishedCampaign: published?.publishedCampaign,
      publishedAdGroup: grouped?.publishedAdGroup,
      rsaDraft: rsaDraft(),
      developerToken: "developer-marker",
      executionMetadata: { note: "kept" },
    }),
  );
  const syncTimed = await timed(() =>
    createCampaignSynchronizer({ ...clocks("perf-sync"), transport: scripted().transport }).synchronize({
      session,
      customerId: CUSTOMER,
      developerToken: "developer-marker",
      campaignResourceNames: [CAMPAIGN],
      executionMetadata: { note: "kept" },
    }),
  );
  const perfRows: Array<[string, number, boolean]> = [
    ["Authentication", authTimed.ms, authTimed.value.status === "OK"],
    ["Campaign Publish", campaignTimed.ms, campaignTimed.value.status === "OK"],
    ["Ad Group Publish", groupTimed.ms, groupTimed.value.status === "OK"],
    ["RSA Publish", rsaTimed.ms, rsaTimed.value.status === "OK"],
    ["Synchronization", syncTimed.ms, syncTimed.value.status === "OK"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check("PERFORMANCE", `${name} completes in under 2000ms`, ok && ms < 2000, "MEDIUM");
  }

  const modules: Record<string, string[]> = {
    auth: ["google-auth-provider.ts", "google-auth-client.ts", "oauth-manager.ts", "customer-manager.ts", "account-registry.ts", "authentication-validator.ts", "authentication-context.ts", "authentication-session.ts"],
    campaign: ["campaign-publisher.ts", "campaign-operation-builder.ts", "campaign-publisher-client.ts", "campaign-publisher-validator.ts", "campaign-publisher-context.ts", "campaign-publisher-session.ts"],
    publishers: ["adgroup-publisher.ts", "rsa-publisher.ts", "asset-builder.ts", "headline-validator.ts", "description-validator.ts", "publisher-validator.ts", "publisher-context.ts"],
    sync: ["campaign-synchronizer.ts", "resource-reader.ts", "campaign-state-mapper.ts", "campaign-diff-engine.ts", "campaign-sync-validator.ts", "campaign-sync-context.ts", "campaign-sync-snapshot.ts"],
  };
  const liveDir = join(process.cwd(), "src/lib/google-ads-live");
  check("REGRESSION", "Backward compatibility: each Google Ads Live module set is still present", Object.values(modules).every((files) => files.every((file) => readdirSync(liveDir).includes(file))));
  const libLines = Object.values(modules).flat().flatMap((file) => readFileSync(join(liveDir, file), "utf8").split(/\r?\n/));
  const hardcodedProducts = libLines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line));
  if (hardcodedProducts) productHardcoding += 1;
  check("GENERICITY", "No Product Hardcoding: library source has no real product names", !hardcodedProducts);
  check("GENERICITY", "No Brand Hardcoding: library source has no fixed brand identity", !libLines.some((line) => /North Brand|Vendor North|Manager North|Plain Account|Child Desk/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Marketplace Hardcoding: library source does not name a marketplace", !libLines.some((line) => /clickbank|digistore|warriorplus|jvzoo|amazon|shopify/i.test(line)), "MEDIUM");
  check("GENERICITY", "No Campaign Template Hardcoding: library source has no fixed promotional copy", !libLines.some((line) => /Buy Now|Act Now|Limited Time|Click Here|Best Product/i.test(line)), "MEDIUM");
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "platform", "providers/google-ads", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page", "real-product", "real-market-report", "opportunity-scoring", "opportunity-ranking", "opportunity-portfolio", "opportunity-recommendation"];
  check(
    "REGRESSION",
    "Backward compatibility: upstream modules do not import Google Ads Live",
    !folders.some((folder) => walk(join(process.cwd(), "src/lib", folder)).filter((file) => file.endsWith(".ts")).some((file) => /google-ads-live/.test(readFileSync(file, "utf8")))),
  );
  check("REGRESSION", "No mutation: the authentication input can still be changed after the walk", authSource.configuration.clientId === "changed");

  const dbDir = join(process.cwd(), "data");
  for (const name of readdirSync(dbDir).filter((item) => item.startsWith("presell-os.db"))) {
    const info = statSync(join(dbDir, name));
    console.log(`DB: ${name} ${info.size} ${info.mtime.toISOString()}`);
  }

  console.log("");
  for (const gate of GATES) console.log(`${gate}=${failed.has(gate) ? "FAIL" : "PASS"}`);
  const ready = failed.size === 0 && productHardcoding === 0;
  console.log(`PRODUCT_HARDCODING=${productHardcoding === 0 ? "NONE" : "FOUND"}`);
  console.log(`CRITICAL_BUGS=${bugs.CRITICAL}`);
  console.log(`HIGH_BUGS=${bugs.HIGH}`);
  console.log(`MEDIUM_BUGS=${bugs.MEDIUM}`);
  console.log(`LOW_BUGS=${bugs.LOW}`);
  console.log(`READY_FOR_PHASE13=${ready ? "YES" : "NO"}`);
  if (!ready) {
    console.error(`\n${[...failed.values()].reduce((sum, list) => sum + list.length, 0)} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("RESULT=GOOGLE_ADS_LIVE_RC1_COMPLETE");
  console.log(`
Architecture Summary
Google Ads Live is four hosts in src/lib/google-ads-live. Authentication exchanges a supplied refresh token and reads accessible customers, manager children, and account text into one frozen registry. The account manager is that read: it does not choose an account. The campaign publisher copies one existing paused draft into one paused campaign write, then reads the resource back. The ad group publisher and the responsive search ad publisher do the same for one paused ad group and one paused ad inside that campaign. The synchronizer only searches campaign, budget, label, ad group, ad, policy, and change rows, then stores a new frozen snapshot and a difference report. A walk calls authentication once, uses that registry once, then publishes and synchronizes once each, and stops when a host refuses. Each host keeps its own snapshot map. Credentials stay on the request and are not stored.

Regression Summary
This audit replayed authentication, account discovery, paused campaign publication, paused ad group publication, paused responsive search ad publication, and a read-only synchronization of that campaign. Snapshots stayed frozen. A second authentication host did not see the first snapshot. Missing credentials stopped the walk before publication. A second campaign publish sent no further write. Upstream Discovery, Opportunity, Traffic, Decision, Workflow, Execution, Platform Kernel, the offline Google Ads provider, Product Intelligence, Market Discovery, Search Intelligence, and the Opportunity Engine do not import these hosts. The module file sets listed above are still present.

Known Limitations
The hosts do not read credentials from the environment. The authentication session does not keep the access token; a later publish call has to be given that grant again. Publication creates paused search resources only. The synchronizer does not change a campaign, a budget, a bid, or a serving status. Keywords, responsive-search-ad text, and budgets are copied from the draft or from the read; they are not chosen here. A refused call stores nothing. Snapshots live only inside the host that created them. This audit replays a scripted account service.

Operational Notes
Rejected inputs return REJECTED, a list of issues, and no snapshot. Clocks and id factories are injectable, and one call does not throw. A live test account still needs an OAuth client, a refresh token, and a customer id supplied on the call. Access follows the Cloud project that owns that client. Public pages still need publication approval. This audit does not publish, deploy, enable an ad, or commit.
`);
  console.log("PUBLISH=NO");
  console.log("DEPLOY=NO");
  console.log("ADS=TEST_ACCOUNT_ONLY");
  console.log("COMMIT=NO");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
