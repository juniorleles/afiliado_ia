/**
 * Safe Google Ads publisher.
 * Uses a temporary database and a fake Google transport. Does not call Google.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Campaign } from "../src/lib/campaigns";
import type { GoogleAuthHttpRequest, GoogleAuthHttpResponse } from "../src/lib/google-ads-live/google-auth-client";
import type { SafePlan } from "../src/lib/integrations/google-ads-publish/plan";

const root = mkdtempSync(path.join(tmpdir(), "gads-safe-"));
process.env.PRESELL_OS_DB = path.join(root, "safe.db");
process.env.ADMIN_SESSION_SECRET = "test-session-secret-value";
process.env.GOOGLE_ADS_CLIENT_ID = "client-safe-example";
process.env.GOOGLE_ADS_CLIENT_SECRET = "secret-safe-example";
delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
process.env.GOOGLE_ADS_REDIRECT_URI = "http://127.0.0.1:3000/configuracoes/integracoes/google-ads/retorno";
process.env.PUBLIC_SITE_URL = "https://reviews.example";
process.env.AIA_ENV = "test";

const CUSTOMER = "3333333333";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

function plan(bidding: SafePlan["bidding"]): SafePlan {
  return {
    localCampaignId: 77,
    draftId: `safe-77-${CUSTOMER}`,
    name: "Northwind Notebook",
    budgetName: "Northwind Notebook orçamento",
    customerId: CUSTOMER,
    accountName: "Conta padrão",
    finalUrl: "https://reviews.example/p/northwind-notebook",
    amountMicros: 10_000_000,
    languageConstant: "1000",
    languageLabel: "Inglês",
    countryConstant: "2840",
    countryLabel: "Estados Unidos",
    searchPartners: false,
    bidding,
    headlines: ["Northwind notes", "Paper notebook", "Blue cover"],
    descriptions: ["A paper notebook for daily notes.", "The cover is blue."],
    keywords: [
      { text: "paper notebook", matchType: "BROAD", negative: false },
      { text: "blue notebook", matchType: "PHRASE", negative: false },
      { text: "northwind notebook", matchType: "EXACT", negative: false },
      { text: "free notebook", matchType: "EXACT", negative: true },
    ],
    sitelinks: [{ text: "See notes" }],
    callouts: [{ text: "Paper cover" }],
    snippets: [{ header: "Types", values: ["Paper"] }],
  };
}

function transport(request: GoogleAuthHttpRequest): Promise<GoogleAuthHttpResponse> {
  assert(!request.url.includes("PERFORMANCE_MAX"), "no performance max request");
  if (request.url.startsWith("https://oauth2.googleapis.com/token")) {
    return Promise.resolve({
      httpStatus: 200,
      bodyText: JSON.stringify({ access_token: "access-safe-example", expires_in: 3600, token_type: "Bearer" }),
    });
  }
  if (request.url.endsWith(":mutate")) {
    const body = request.body ?? "";
    assert(!body.includes('"status":"ENABLED"'), "mutate body has no enabled status");
    assert(body.includes('"status":"PAUSED"'), "mutate body is paused");
    assert(body.includes('"advertisingChannelType":"SEARCH"'), "mutate body is a search campaign");
    assert(!body.includes("PERFORMANCE_MAX") && !body.includes("SHOPPING"), "mutate body is not performance max or shopping");
    assert(body.includes('"targetContentNetwork":false'), "content network stays off");
    assert(body.includes("paper notebook") && body.includes("PHRASE") && body.includes("EXACT") && body.includes('"negative":true'), "keywords are copied into the mutate");
    assert(body.includes("SITELINK") && body.includes("CALLOUT") && body.includes("STRUCTURED_SNIPPET"), "assets are included");
    assert(body.includes('"maximizeClicks":{}'), "maximize clicks is selectable");
    assert(!body.includes("manualCpc"), "maximize clicks does not also set manual cpc");
    return Promise.resolve({
      httpStatus: 200,
      bodyText: JSON.stringify({
        mutateOperationResponses: [
          { campaignBudgetResult: { resourceName: `customers/${CUSTOMER}/campaignBudgets/11` } },
          { campaignResult: { resourceName: `customers/${CUSTOMER}/campaigns/22` } },
          { adGroupResult: { resourceName: `customers/${CUSTOMER}/adGroups/33` } },
          { adGroupAdResult: { resourceName: `customers/${CUSTOMER}/adGroupAds/33~44` } },
          { adGroupCriterionResult: { resourceName: `customers/${CUSTOMER}/adGroupCriteria/33~55` } },
          { assetResult: { resourceName: `customers/${CUSTOMER}/assets/66` } },
          { campaignAssetResult: { resourceName: `customers/${CUSTOMER}/campaignAssets/22~66~SITELINK` } },
        ],
      }),
    });
  }
  return Promise.resolve({
    httpStatus: 200,
    bodyText: JSON.stringify({
      results: [{ campaign: { id: "22", status: "PAUSED" }, metrics: { impressions: 0, clicks: 0, costMicros: 0 } }],
    }),
  });
}

async function main(): Promise<void> {
  const operations = await import("../src/lib/integrations/google-ads-publish/operations.ts");
  assert(operations.pausedPayload({ advertisingChannelType: "SEARCH", status: "PAUSED" }), "a paused search payload is accepted");
  assert(!operations.pausedPayload({ advertisingChannelType: "PERFORMANCE_MAX", status: "ENABLED" }), "performance max and enabled payloads are refused");
  const manual = operations.buildPausedSearchMutate(plan("MANUAL_CPC"));
  const manualText = JSON.stringify(manual);
  assert(manual !== null && manualText.includes('"manualCpc":{}') && manualText.includes("cpcBidMicros"), "manual cpc keeps a bid");
  assert(manualText.includes("campaigns/-2") && manualText.includes("adGroups/-3"), "temporary resource names link the paused resources");
  assert(!manualText.includes('"status":"ENABLED"') && manualText.includes('"targetContentNetwork":false'), "manual cpc stays paused with the content network off");
  const oauth = await import("../src/lib/integrations/google-ads-oauth/store.ts");
  const publisher = await import("../src/lib/integrations/google-ads-publish/publish.ts");
  const planner = await import("../src/lib/integrations/google-ads-publish/plan.ts");
  const db = await import("../src/lib/db.ts");
  const before = db.getDb().prepare("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number };
  assert(oauth.saveGoogleAdsClientCredentials("client-safe-example", "secret-safe-example", "test"), "client credentials are stored for the refresh grant");
  assert(oauth.saveGoogleAdsRefreshToken("refresh-safe-example"), "refresh token is stored");
  const published = await publisher.publishPausedSearchCampaign(plan("MAXIMIZE_CLICKS"), transport);
  assert(published.ok, "paused search campaign is created");
  if (!published.ok) return;
  assert(published.publication.googleCampaignId === "22", "campaign id is stored");
  assert(published.publication.adGroupId === "33", "ad group id is stored");
  assert(published.publication.adIds[0] === "44", "ad id is stored");
  assert(published.publication.status === "PAUSED" && published.publication.campaignType === "SEARCH", "stored status stays paused search");
  assert(published.publication.impressions === 0 && published.publication.clicks === 0 && published.publication.costMicros === 0, "observed delivery is zero");
  assert(published.publication.keywordResourceNames.length === 1 && published.publication.assetResourceNames.length === 2, "keyword and asset names are stored");
  const again = await publisher.publishPausedSearchCampaign(plan("MAXIMIZE_CLICKS"), transport);
  assert(!again.ok, "the same campaign is not published twice");
  const blocked = planner.validateSafePlan({
    campaign: {
      id: 78,
      name: "Empty",
      slug: "empty",
      headline: "This headline is far too long for a search ad",
      body: "Short.",
      ctaLabel: "Go",
      affiliateUrl: "https://example.test",
      headScript: null,
      adHeadline: null,
      publicationStatus: "draft",
      publishedAt: null,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    } as Campaign,
    account: null,
    budget: 0,
    languageId: "1000",
    countryId: "2840",
    searchPartners: false,
    bidding: "MANUAL_CPC",
  });
  assert(blocked.plan === null && blocked.issues.length > 0, "incomplete copy blocks the plan");
  const after = db.getDb().prepare("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number };
  assert(before.n === after.n, "local campaign rows are unchanged");
  console.log("GOOGLE_ADS_SAFE_PUBLISHER_TEST=PASS");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "safe publisher test failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = await import("../src/lib/db.ts");
    db.resetDbForTests();
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows can keep the temporary database locked after close.
    }
  });
