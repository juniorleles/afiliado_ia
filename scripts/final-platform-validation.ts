/**
 * Final platform validation runner.
 * Calls the existing hosts once. It does not publish and it does not change host behaviour.
 */
import { readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSearchApiProvider } from "../src/lib/search-provider/providers/searchapi-provider.ts";
import { createSearchApiNormalizer } from "../src/lib/search-intelligence/searchapi-normalizer.ts";
import { createRealLandingPageSession } from "../src/lib/real-landing-page/landing-page-session.ts";
import { createRealProductSession } from "../src/lib/real-product/product-session.ts";
import { createRealMarketReport } from "../src/lib/real-market-report/real-market-report.ts";
import { createOpportunityScoringEngine } from "../src/lib/opportunity-scoring/opportunity-scoring-engine.ts";
import { createOpportunityRankingEngine } from "../src/lib/opportunity-ranking/opportunity-ranking-engine.ts";
import { createOpportunityPortfolioBuilder } from "../src/lib/opportunity-portfolio/portfolio-builder.ts";
import { createOpportunityRecommendationEngine } from "../src/lib/opportunity-recommendation/recommendation-engine.ts";
import { createCampaignPublisher } from "../src/lib/google-ads-live/campaign-publisher.ts";
import { createAdGroupPublisher } from "../src/lib/google-ads-live/adgroup-publisher.ts";
import { createRsaPublisher } from "../src/lib/google-ads-live/rsa-publisher.ts";
import { createMetricsCollector } from "../src/lib/optimization-metrics/metrics-collector.ts";

const KEYWORD = "joint pain supplement";
const COUNTRY = "US";
const LANGUAGE = "en";
const DEVICE = "desktop";
const OPPORTUNITY_ID = "joint-pain-supplement";
const NOTE = { note: "final-validation" };
const CUSTOMER = "1111111111";
const CAMPAIGN = `customers/${CUSTOMER}/campaigns/999`;
const GROUP = `customers/${CUSTOMER}/adGroups/777`;

function presence(names: readonly string[]): Record<string, "SET" | "MISSING"> {
  let fileText = "";
  try {
    fileText = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    fileText = "";
  }
  const out: Record<string, "SET" | "MISSING"> = {};
  for (const name of names) {
    const line = fileText.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    const fromFile = line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
    const fromEnv = process.env[name]?.trim() ?? "";
    out[name] = fromFile !== "" || fromEnv !== "" ? "SET" : "MISSING";
  }
  return out;
}

function issuesOf(value: { issues?: readonly { message: string }[] } | null | undefined): string[] {
  return (value?.issues ?? []).map((item) => item.message);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function main() {
  const started = Date.now();
  const keys = presence([
    "SEARCHAPI_API_KEY",
    "DEMO_PUBLISH",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    "GOOGLE_ADS_TEST_CUSTOMER_ID",
  ]);
  const demoPublish = keys.DEMO_PUBLISH === "SET" && (process.env.DEMO_PUBLISH ?? "").trim() === "true";
  const googleReady = ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"].every((name) => keys[name] === "SET");

  const db: { name: string; size: number; mtime: string }[] = [];
  for (const name of ["presell-os.db", "presell-os.db-shm", "presell-os.db-wal"]) {
    const info = statSync(join(process.cwd(), "data", name));
    db.push({ name, size: info.size, mtime: info.mtime.toISOString() });
  }

  const provider = createSearchApiProvider();
  const searchStarted = Date.now();
  const searched = await provider.search({ keyword: KEYWORD, country: COUNTRY, language: LANGUAGE, device: DEVICE, executionMetadata: NOTE });
  const searchMs = Date.now() - searchStarted;
  const normalizer = createSearchApiNormalizer();
  const normalized = searched.status === "OK" ? normalizer.normalize(searched) : null;
  const snapshot = normalized?.snapshot ?? null;
  const organic = (snapshot?.serpRecords ?? []).filter((record) => record.sponsoredMarker === null);
  const sponsored = snapshot?.sponsoredResults ?? [];
  const httpsSponsored = sponsored.filter((item) => /^https:\/\/[^\s]+$/.test(item.url)).slice(0, 3);

  const pages = createRealLandingPageSession();
  const pageStarted = Date.now();
  const collected = httpsSponsored.length === 0
    ? null
    : await pages.collect({ sponsoredResults: httpsSponsored, maxPages: 3, executionMetadata: NOTE });
  const pageMs = Date.now() - pageStarted;

  const products = createRealProductSession();
  const identified = collected?.status === "OK" && collected.pages !== null
    ? products.identify({ landingPageSnapshots: collected.pages, executionMetadata: NOTE })
    : null;

  const market = createRealMarketReport();
  const reported = snapshot !== null && collected?.pages && identified?.products && identified.products.length > 0
    ? market.build({
      searchSnapshot: snapshot.searchSnapshot,
      serpRecords: snapshot.serpRecords,
      sponsoredResults: snapshot.sponsoredResults,
      landingPageSnapshots: collected.pages,
      observedProducts: identified.products,
      executionMetadata: NOTE,
    })
    : null;

  const scoring = createOpportunityScoringEngine();
  const scored = reported?.status === "OK"
    ? scoring.evaluate({ report: reported.report, graph: reported.graph, statistics: reported.statistics, executionMetadata: NOTE })
    : null;
  const ranking = createOpportunityRankingEngine();
  const ranked = scored?.status === "OK" && scored.metrics !== null
    ? ranking.rank({ opportunities: [{ opportunityId: OPPORTUNITY_ID, metrics: scored.metrics }], policy: "balanced", executionMetadata: NOTE })
    : null;
  const portfolio = createOpportunityPortfolioBuilder();
  const grouped = ranked?.status === "OK"
    ? portfolio.build({
      ranking: ranked.ranking,
      opportunities: [{ opportunityId: OPPORTUNITY_ID, language: LANGUAGE, country: COUNTRY }],
      executionMetadata: NOTE,
    })
    : null;
  const recommendations = createOpportunityRecommendationEngine();
  const recommended = grouped?.status === "OK" && scored?.metrics !== null
    ? recommendations.recommend({
      ranking: ranked?.ranking,
      portfolio: grouped.portfolio,
      metrics: [{ opportunityId: OPPORTUNITY_ID, metrics: scored.metrics }],
      policy: "balanced",
      executionMetadata: NOTE,
    })
    : null;

  const session = { sessionId: "session-1", authenticated: true as const, tokenType: "Bearer", expiresIn: 3600, accessToken: "not-sent" };
  const campaignDraft = {
    draftId: "paused-validation-draft",
    name: "Paused Validation Draft",
    budgetName: "Paused Validation Budget",
    status: "PAUSED" as const,
    channelType: "SEARCH" as const,
    amountMicros: 1000000,
    deliveryMethod: "STANDARD" as const,
    bidding: "MANUAL_CPC" as const,
    targetGoogleSearch: true,
    targetSearchNetwork: false,
    targetContentNetwork: false,
  };
  const publishedCampaign = {
    draftId: "paused-validation-draft",
    customerId: CUSTOMER,
    resourceName: CAMPAIGN,
    campaignId: "999",
    status: "PAUSED" as const,
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  const adGroupDraft = {
    draftId: "paused-validation-group",
    name: "Paused Validation Group",
    status: "PAUSED" as const,
    type: "SEARCH_STANDARD" as const,
    cpcBidMicros: 1000000,
  };
  const publishedAdGroup = {
    draftId: "paused-validation-group",
    customerId: CUSTOMER,
    campaignResourceName: CAMPAIGN,
    resourceName: GROUP,
    adGroupId: "777",
    status: "PAUSED" as const,
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  const rsaDraft = {
    draftId: "paused-validation-ad",
    status: "PAUSED" as const,
    headlines: [
      { text: "Review the page details", pinnedField: "HEADLINE_1" as const },
      { text: "See what the page says", pinnedField: "HEADLINE_2" as const },
      { text: "Read before you decide", pinnedField: null },
    ],
    descriptions: [
      { text: "The page states its own details. Read them before you continue.", pinnedField: "DESCRIPTION_1" as const },
      { text: "This draft stays paused and is not sent.", pinnedField: null },
    ],
    finalUrls: ["https://example.test/presell/validation"],
    path1: "review",
    path2: "details",
  };
  const campaignIssues = createCampaignPublisher().validator.validateInput({
    draft: campaignDraft,
    session,
    customerId: CUSTOMER,
    developerToken: "not-sent",
    executionMetadata: NOTE,
  });
  const adGroupIssues = createAdGroupPublisher().validator.validateAdGroupInput({
    session,
    publishedCampaign,
    adGroupDraft,
    developerToken: "not-sent",
    executionMetadata: NOTE,
  });
  const rsaIssues = createRsaPublisher().validator.validateRsaInput({
    session,
    publishedCampaign,
    publishedAdGroup,
    rsaDraft,
    developerToken: "not-sent",
    executionMetadata: NOTE,
  });

  let optimization = "Google Ads credentials are missing, and DEMO_PUBLISH is not true, so no campaign resource was available to read.";
  if (googleReady && !demoPublish) {
    optimization = "Credentials are present and DEMO_PUBLISH is not true, so metrics were not collected from a live campaign.";
  }
  if (demoPublish && googleReady) {
    optimization = "DEMO_PUBLISH is true, but this runner does not publish. Metrics were not collected.";
  }

  const observed = (identified?.products ?? []).map((product) => ({
    productName: product.identity.productName,
    brand: product.identity.brand,
    category: product.identity.category,
    price: product.identity.price,
  }));

  const summary = {
    packageVersion: JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version as string,
    node: process.version,
    startedAt: new Date(started).toISOString(),
    elapsedMs: Date.now() - started,
    keys,
    demoPublish,
    googleReady,
    db,
    search: {
      status: searched.status,
      issues: issuesOf(searched),
      ms: searchMs,
      requestCount: searched.statistics.requestCount,
      frozen: searched.snapshot !== null && Object.isFrozen(searched.snapshot),
    },
    normalizer: {
      status: normalized?.status ?? "SKIPPED",
      issues: issuesOf(normalized),
      serpCount: snapshot?.serpRecords.length ?? 0,
      organicCount: organic.length,
      sponsoredCount: sponsored.length,
      httpsSponsored: httpsSponsored.length,
      frozen: snapshot !== null && Object.isFrozen(snapshot),
    },
    landing: {
      status: collected?.status ?? "SKIPPED",
      issues: issuesOf(collected),
      ms: collected === null ? 0 : pageMs,
      pageCount: collected?.pages?.length ?? 0,
      pages: (collected?.pages ?? []).map((page) => ({
        id: page.landingPageId,
        httpStatus: page.httpStatus,
        finalUrl: page.finalUrl,
        redirectCount: page.redirectChain.length,
        html: page.html.length > 0,
        bytes: page.responseBytes,
      })),
      frozen: collected?.snapshot !== null && collected?.snapshot !== undefined && Object.isFrozen(collected.snapshot),
    },
    products: {
      status: identified?.status ?? "SKIPPED",
      issues: issuesOf(identified),
      count: identified?.products?.length ?? 0,
      observed,
      graphNodes: identified?.graph?.nodes.length ?? 0,
      frozen: identified?.snapshot !== null && identified?.snapshot !== undefined && Object.isFrozen(identified.snapshot),
    },
    market: {
      status: reported?.status ?? "SKIPPED",
      issues: issuesOf(reported),
      brands: reported?.report?.observedBrands.length ?? 0,
      categories: reported?.report?.observedCategories.length ?? 0,
      prices: reported?.report?.observedPrices.length ?? 0,
      frozen: reported?.snapshot !== null && reported?.snapshot !== undefined && Object.isFrozen(reported.snapshot),
    },
    opportunity: {
      score: scored?.status ?? "SKIPPED",
      scoreIssues: issuesOf(scored),
      rank: ranked?.status ?? "SKIPPED",
      rankIssues: issuesOf(ranked),
      ordered: ranked?.ranking?.ordered.map((item) => `${item.position}:${item.opportunityId}`) ?? [],
      portfolio: grouped?.status ?? "SKIPPED",
      portfolioIssues: issuesOf(grouped),
      recommendation: recommended?.status ?? "SKIPPED",
      recommendationIssues: issuesOf(recommended),
      kinds: recommended?.recommendations?.recommendations.map((item) => item.recommendationType) ?? [],
    },
    ads: {
      demoPublish,
      sent: false,
      campaignIssues: campaignIssues.map((item) => item.message),
      adGroupIssues: adGroupIssues.map((item) => item.message),
      rsaIssues: rsaIssues.map((item) => item.message),
    },
    optimization,
  };

  mkdirSync(join(process.cwd(), "reports"), { recursive: true });
  writeFileSync(join(process.cwd(), "reports", "final-validation-run.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    search: summary.search.status,
    normalizer: summary.normalizer.status,
    serp: summary.normalizer.serpCount,
    organic: summary.normalizer.organicCount,
    sponsored: summary.normalizer.sponsoredCount,
    landing: summary.landing.status,
    pages: summary.landing.pageCount,
    products: summary.products.status,
    productCount: summary.products.count,
    market: summary.market.status,
    score: summary.opportunity.score,
    rank: summary.opportunity.rank,
    portfolio: summary.opportunity.portfolio,
    recommendation: summary.opportunity.recommendation,
    campaignDraftIssues: summary.ads.campaignIssues.length,
    adGroupDraftIssues: summary.ads.adGroupIssues.length,
    rsaDraftIssues: summary.ads.rsaIssues.length,
    googleReady,
    demoPublish,
    searchKey: keys.SEARCHAPI_API_KEY,
  }));
  if (searched.status !== "OK") console.log(issuesOf(searched).join(" | "));
  if (normalized && normalized.status !== "OK") console.log(issuesOf(normalized).join(" | "));
  if (collected && collected.status !== "OK") console.log(issuesOf(collected).join(" | "));
  if (identified && identified.status !== "OK") console.log(issuesOf(identified).join(" | "));
  if (reported && reported.status !== "OK") console.log(issuesOf(reported).join(" | "));
  if (scored && scored.status !== "OK") console.log(issuesOf(scored).join(" | "));
  if (ranked && ranked.status !== "OK") console.log(issuesOf(ranked).join(" | "));
  if (grouped && grouped.status !== "OK") console.log(issuesOf(grouped).join(" | "));
  if (recommended && recommended.status !== "OK") console.log(issuesOf(recommended).join(" | "));
  void text;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "validation failed");
  process.exit(1);
});
