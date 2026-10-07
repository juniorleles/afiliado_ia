import { createSearchApiProvider } from "@/lib/search-provider/providers/searchapi-provider";
import { createSearchApiNormalizer } from "@/lib/search-intelligence/searchapi-normalizer";
import { createRealLandingPageSession } from "@/lib/real-landing-page/landing-page-session";
import { createRealProductSession } from "@/lib/real-product/product-session";
import { createRealMarketReport } from "@/lib/real-market-report/real-market-report";
import { createOpportunityScoringEngine } from "@/lib/opportunity-scoring/opportunity-scoring-engine";
import { createOpportunityRankingEngine } from "@/lib/opportunity-ranking/opportunity-ranking-engine";
import { createOpportunityPortfolioBuilder } from "@/lib/opportunity-portfolio/portfolio-builder";
import { createOpportunityRecommendationEngine } from "@/lib/opportunity-recommendation/recommendation-engine";
import { createCampaignPublisher } from "@/lib/google-ads-live/campaign-publisher";
import { OPPORTUNITY_METRIC_KEYS } from "@/lib/opportunity-scoring/opportunity-score-types";
import { readIntegrationConfiguration } from "./configuration";
import type { ConsoleIssue, ConsoleLandingPage, ConsoleProduct, ConsoleSearchRecord } from "./types";

export type ConsoleSearchInput = {
  keyword: string;
  country: string;
  language: string;
  device: string;
  maxPages: number;
};

const NOTE = { note: "console-search" };

function issuesOf(value: { issues?: readonly { field?: string; message?: string }[] } | null | undefined): ConsoleIssue[] {
  return (value?.issues ?? []).flatMap((item) => {
    if (typeof item.message !== "string") return [];
    return [{ field: typeof item.field === "string" ? item.field : "request", message: item.message }];
  });
}

function titleOf(value: { title?: string | null }): string | null {
  return typeof value.title === "string" && value.title.trim() !== "" ? value.title.trim() : null;
}

function opportunityId(keyword: string): string {
  const slug = keyword.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "");
  return (slug === "" ? "keyword" : slug).slice(0, 64);
}

function searchId(keyword: string): string {
  const slug = opportunityId(keyword);
  return `s-${Date.now().toString(36)}-${slug}`.slice(0, 80);
}

function pageLimit(value: number): number {
  if (value === 1 || value === 5) return value;
  return 3;
}

export function operatorSearchMessage(issues: readonly ConsoleIssue[]): string {
  const text = issues.map((item) => item.message).join(" ");
  if (/Empty Keyword/i.test(text)) return "Informe uma Keyword.";
  if (/Missing API Key/i.test(text)) return "SearchApi não está configurado.";
  if (/Invalid Locale|Invalid Device/i.test(text)) return "País, idioma ou dispositivo não é aceito.";
  if (/HTTP Errors|Provider Failure|Malformed/i.test(text)) return "A busca não pôde ser concluída.";
  if (/timeout/i.test(text)) return "A busca excedeu o tempo.";
  if (/Missing Landing Pages/i.test(text)) return "A busca voltou, e nenhuma Landing Page foi coletada.";
  if (/Missing Product Evidence/i.test(text)) return "As páginas voltaram sem um Product observado.";
  return "Não foi possível concluir a busca.";
}

export async function runConsoleSearch(input: ConsoleSearchInput): Promise<{ record: ConsoleSearchRecord; pages: { id: string; html: string }[] }> {
  const started = Date.now();
  const configuration = readIntegrationConfiguration();
  const keyword = input.keyword.trim();
  const country = input.country.trim().toUpperCase();
  const language = input.language.trim().toLowerCase();
  const device = input.device.trim().toLowerCase();
  const id = searchId(keyword || "keyword");
  const blank = (status: "OK" | "REJECTED", issues: ConsoleIssue[], extra: Partial<ConsoleSearchRecord> = {}): ConsoleSearchRecord => ({
    id,
    keyword,
    country,
    language,
    device,
    createdAt: new Date().toISOString(),
    status,
    issues,
    elapsedMs: Date.now() - started,
    sponsoredCount: 0,
    organicCount: 0,
    sponsoredTitles: [],
    organicTitles: [],
    landingPages: [],
    products: [],
    brands: [],
    categories: [],
    prices: [],
    warnings: [],
    missingEvidence: [],
    metrics: {},
    recommendation: null,
    rank: null,
    score: null,
    googleAds: configuration.googleAds,
    ...extra,
  });

  try {
    const provider = createSearchApiProvider();
    const searched = await provider.search({ keyword, country, language, device, executionMetadata: NOTE });
    if (searched.status !== "OK") return { record: blank("REJECTED", issuesOf(searched)), pages: [] };

    const normalized = createSearchApiNormalizer().normalize(searched);
    const snapshot = normalized.status === "OK" ? normalized.snapshot : null;
    if (snapshot === null) return { record: blank("REJECTED", issuesOf(normalized)), pages: [] };

    const organic = snapshot.serpRecords.filter((record) => record.sponsoredMarker === null);
    const sponsored = snapshot.sponsoredResults;
    const httpsSponsored = sponsored.filter((item) => typeof item.url === "string" && /^https:\/\/[^\s]+$/.test(item.url)).slice(0, pageLimit(input.maxPages));
    const collected = httpsSponsored.length === 0
      ? null
      : await createRealLandingPageSession().collect({ sponsoredResults: httpsSponsored, maxPages: pageLimit(input.maxPages), executionMetadata: NOTE });
    const identified = collected?.status === "OK" && collected.pages !== null
      ? createRealProductSession().identify({ landingPageSnapshots: collected.pages, executionMetadata: NOTE })
      : null;
    const reported = collected?.pages && identified?.products && identified.products.length > 0
      ? createRealMarketReport().build({
        searchSnapshot: snapshot.searchSnapshot,
        serpRecords: snapshot.serpRecords,
        sponsoredResults: snapshot.sponsoredResults,
        landingPageSnapshots: collected.pages,
        observedProducts: identified.products,
        executionMetadata: NOTE,
      })
      : null;
    const scored = reported?.status === "OK"
      ? createOpportunityScoringEngine().evaluate({ report: reported.report, graph: reported.graph, statistics: reported.statistics, executionMetadata: NOTE })
      : null;
    const ranked = scored?.status === "OK" && scored.metrics !== null
      ? createOpportunityRankingEngine().rank({
        opportunities: [{ opportunityId: opportunityId(keyword), metrics: scored.metrics }],
        policy: "balanced",
        executionMetadata: NOTE,
      })
      : null;
    const grouped = ranked?.status === "OK"
      ? createOpportunityPortfolioBuilder().build({
        ranking: ranked.ranking,
        opportunities: [{ opportunityId: opportunityId(keyword), language, country }],
        executionMetadata: NOTE,
      })
      : null;
    const scoredMetrics = scored?.status === "OK" ? scored.metrics : null;
    const recommended = grouped?.status === "OK" && scoredMetrics !== null
      ? createOpportunityRecommendationEngine().recommend({
        ranking: ranked?.ranking,
        portfolio: grouped.portfolio,
        metrics: [{ opportunityId: opportunityId(keyword), metrics: scoredMetrics }],
        policy: "balanced",
        executionMetadata: NOTE,
      })
      : null;

    const landingPages: ConsoleLandingPage[] = (collected?.pages ?? []).map((page) => ({
      id: page.landingPageId,
      httpStatus: page.httpStatus,
      finalUrl: page.finalUrl,
      redirectCount: page.redirectChain.length,
      bytes: page.responseBytes,
    }));
    const products: ConsoleProduct[] = (identified?.products ?? []).map((product) => {
      const page = landingPages.find((item) => item.id === product.identity.landingPageId) ?? null;
      const price = product.identity.price;
      const currency = product.identity.currency;
      return {
        id: product.identity.landingPageId,
        name: product.identity.productName,
        brand: product.identity.brand,
        priceLabel: price === null ? null : currency ? `${currency} ${price}` : price,
        currency,
        domain: product.identity.primaryDomain,
        category: null,
        language: product.identity.language,
        landingPageId: product.identity.landingPageId,
        httpStatus: page?.httpStatus ?? null,
      };
    });
    const metrics: Record<string, number | null> = {};
    if (scoredMetrics) {
      for (const key of OPPORTUNITY_METRIC_KEYS) metrics[key] = scoredMetrics[key];
    }
    const kinds = recommended?.recommendations?.recommendations.map((item) => item.recommendationType) ?? [];
    const issues = [
      ...issuesOf(collected),
      ...issuesOf(identified),
      ...issuesOf(reported),
      ...issuesOf(scored),
      ...issuesOf(ranked),
      ...issuesOf(recommended),
    ];
    const record = blank(products.length > 0 || organic.length > 0 || sponsored.length > 0 ? "OK" : "REJECTED", issues, {
      elapsedMs: Date.now() - started,
      sponsoredCount: sponsored.length,
      organicCount: organic.length,
      sponsoredTitles: sponsored.map(titleOf).filter((item): item is string => item !== null).slice(0, 20),
      organicTitles: organic.map(titleOf).filter((item): item is string => item !== null).slice(0, 20),
      landingPages,
      products,
      brands: [...(reported?.report?.observedBrands ?? [])],
      categories: [...(reported?.report?.observedCategories ?? [])],
      prices: [...(reported?.report?.observedPrices ?? [])],
      warnings: [...(reported?.report?.warnings ?? [])],
      missingEvidence: [...(reported?.report?.missingEvidence ?? [])],
      metrics,
      recommendation: kinds[0] ?? null,
      rank: ranked?.status ?? null,
      score: scored?.status ?? null,
    });
    return {
      record,
      pages: (collected?.pages ?? []).map((page) => ({ id: page.landingPageId, html: page.html })),
    };
  } catch {
    return { record: blank("REJECTED", [{ field: "pipeline", message: "Provider Failure: the search could not be completed." }]), pages: [] };
  }
}

export function validatePausedDraft(name: string): { googleAds: "Not Connected" | "Connected"; issues: string[] } {
  const configuration = readIntegrationConfiguration();
  try {
    const issues = createCampaignPublisher().validator.validateInput({
      draft: {
        draftId: "paused-console-draft",
        name,
        budgetName: "Paused Console Budget",
        status: "PAUSED",
        channelType: "SEARCH",
        amountMicros: 1000000,
        deliveryMethod: "STANDARD",
        bidding: "MANUAL_CPC",
        targetGoogleSearch: true,
        targetSearchNetwork: false,
        targetContentNetwork: false,
      },
      customerId: "",
      developerToken: "",
      executionMetadata: NOTE,
    });
    return { googleAds: configuration.googleAds, issues: issues.map((item) => item.message) };
  } catch {
    return { googleAds: configuration.googleAds, issues: ["Missing Authentication: the draft was not sent."] };
  }
}
