import type { ProductFacts } from "@/lib/product-facts";
import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import { classifyMarketSourceDetailed, pathnameFromUrl } from "@/lib/market-research/classify";
import { stripFabricatedMarketClaims } from "@/lib/market-research/forbidden";
import { marketResearchMaxAgeHours } from "@/lib/market-research/freshness";
import { decodeMarketHtml } from "@/lib/market-research/html";
import { flattenMarketQueries, marketResearchQueryFamilies } from "@/lib/market-research/queries";
import { extractMarketSignals, emptyMarketSignals } from "@/lib/market-research/signals";
import { emptyDiversity, familiesCovered, measureDiversity, scoreResearchQuality } from "@/lib/market-research/quality";
import { hostnameOf, isPromotionalTitle, promotionalPatternKey } from "@/lib/market-research/promotional";
import { createMarketResearchSearch, emptyProviderMix, searchMarketQuery, summarizeProviderMix } from "@/lib/market-research/search";
import type {
  MarketEvidence,
  MarketProviderAttempt,
  MarketProviderMix,
  MarketQueryOutcome,
  MarketQueryOutcomeStatus,
  MarketResearchReport,
  MarketSearchProvider,
  QueryFamilyId,
} from "@/lib/market-research/types";
import { mapLimit } from "@/lib/source-resolution/http";
import type { SearchFn } from "@/lib/source-resolution/types";

export const MAX_MARKET_SOURCES = 8;
export const MAX_MARKET_SEARCH_QUERIES = 10;
const SEARCH_CONCURRENCY = 2;

export type RunMarketResearchInput = {
  facts: ProductFacts;
  searchWeb?: SearchFn;
  fallbackSearch?: SearchFn;
  fallbackConfigured?: boolean;
  now?: Date;
  signal?: AbortSignal;
};

type QueryPass = {
  outcome: MarketQueryOutcome;
  hits: MarketEvidence[];
};

export async function runMarketResearch(input: RunMarketResearchInput): Promise<MarketResearchReport> {
  const now = (input.now || new Date()).toISOString();
  const composed = input.searchWeb
    ? null
    : createMarketResearchSearch(fetch, input.signal);
  const provider = composed?.status || {
    name: "DUCKDUCKGO_HTML",
    configured: true,
    realWebSearchAvailable: true,
    implemented: true,
    apiKeyPresent: false,
    missingConfig: [] as string[],
    message: "injected",
  };
  const families = marketResearchQueryFamilies(input.facts);
  const planned = flattenMarketQueries(input.facts, MAX_MARKET_SEARCH_QUERIES);
  const discardedFabrications: string[] = [];
  const fallbackConfigured = composed
    ? composed.fallbackConfigured
    : input.fallbackConfigured ?? Boolean(input.fallbackSearch);
  const primary = input.searchWeb || composed!.primary;
  const fallback = composed ? composed.fallback : input.fallbackSearch || null;
  const base = {
    productName: input.facts.productName,
    researchedAt: now,
    queriesUsed: planned.map((item) => item.query),
    queryFamilies: families,
    queryOutcomes: [] as MarketQueryOutcome[],
    providerMix: emptyProviderMix() as MarketProviderMix,
    searchProvider: {
      name: provider.name,
      configured: provider.configured || Boolean(input.searchWeb),
      realWebSearchAvailable: provider.realWebSearchAvailable || Boolean(input.searchWeb),
      fallbackConfigured,
    },
    maxAgeHours: marketResearchMaxAgeHours(),
    discardedFabrications,
  };

  if (!provider.realWebSearchAvailable && !input.searchWeb) {
    return {
      ...base,
      status: "UNAVAILABLE",
      quality: "INSUFFICIENT",
      sources: [],
      signals: emptyMarketSignals(),
      diversity: emptyDiversity(),
    };
  }

  let rejectNew = Boolean(input.signal?.aborted);

  const passes = await mapLimit(planned, SEARCH_CONCURRENCY, async (item): Promise<QueryPass> => {
    if (input.signal?.aborted || rejectNew) {
      return {
        outcome: queryOutcome(item.query, item.family, "ABORTED", 0, 0, 0, "DUCKDUCKGO_HTML", [
          { provider: "DUCKDUCKGO_HTML", status: "ABORTED", durationMs: 0 },
        ]),
        hits: [],
      };
    }

    const searched = await searchMarketQuery({
      query: item.query,
      primary,
      fallback,
      fallbackConfigured,
      signal: input.signal,
    });
    if (searched.status === "ABORTED") rejectNew = true;

    if (searched.status !== "SUCCESS") {
      return {
        outcome: queryOutcome(
          item.query,
          item.family,
          searched.status,
          searched.durationMs,
          0,
          0,
          searched.providerUsed,
          searched.providerAttempts,
        ),
        hits: [],
      };
    }

    const evidence: MarketEvidence[] = [];
    for (const hit of searched.hits.slice(0, 8)) {
      try {
        assertSafeOutboundUrl(hit.url);
      } catch {
        continue;
      }
      const titleText = decodeMarketHtml(hit.title || "");
      const snippetText = decodeMarketHtml(hit.snippet || "");
      const title = stripFabricatedMarketClaims(titleText);
      const snippet = stripFabricatedMarketClaims(snippetText);
      if (title.discarded) discardedFabrications.push(titleText);
      if (snippet.discarded) discardedFabrications.push(snippetText);
      const evidenceText = snippet.text || title.text;
      if (!evidenceText) continue;
      const storedTitle = title.text || hit.url;
      const classified = classifyMarketSourceDetailed({
        url: hit.url,
        productName: input.facts.productName,
        manufacturer: input.facts.manufacturer,
        title: title.text || storedTitle,
      });
      evidence.push({
        url: hit.url,
        title: title.text || hit.url,
        retrievedAt: now,
        relevantEvidence: evidenceText,
        classification: classified.classification,
        classificationReason: classified.reason,
        query: item.query,
        queryFamily: item.family,
        domain: hostnameOf(hit.url),
        path: pathnameFromUrl(hit.url),
        promotional: isPromotionalTitle(storedTitle),
        usable: false,
        discoveredByProvider: searched.providerUsed,
      });
    }

    return {
      outcome: queryOutcome(
        item.query,
        item.family,
        "SUCCESS",
        searched.durationMs,
        searched.hits.length,
        0,
        searched.providerUsed,
        searched.providerAttempts,
      ),
      hits: evidence,
    };
  });

  const queryOutcomes = passes.map((item) => item.outcome);
  const seenUrls = new Set<string>();
  const rawHits: MarketEvidence[] = [];
  for (const pass of passes) {
    for (const hit of pass.hits) {
      if (seenUrls.has(hit.url)) continue;
      seenUrls.add(hit.url);
      rawHits.push(hit);
    }
  }

  const { usable, promoPattern } = selectDiverseSources(rawHits, MAX_MARKET_SOURCES);
  for (const source of usable) {
    const row = queryOutcomes.find((item) => item.query === source.query && item.family === source.queryFamily);
    if (row) row.usableHits += 1;
  }

  const diversity = measureDiversity(rawHits, usable, promoPattern);
  const quality = scoreResearchQuality({
    usable: usable.length,
    uniqueDomains: diversity.UNIQUE_DOMAINS,
    classDiversity: diversity.SOURCE_CLASS_DIVERSITY,
    promotionalRatio: diversity.PROMOTIONAL_SOURCE_RATIO,
    promoPattern,
    familiesCovered: familiesCovered(usable),
  });

  return {
    ...base,
    queryOutcomes,
    providerMix: summarizeProviderMix(queryOutcomes),
    status: usable.length > 0 ? "FRESH" : "UNAVAILABLE",
    quality,
    sources: usable,
    signals: extractMarketSignals(usable),
    diversity,
    discardedFabrications,
  };
}

function queryOutcome(
  query: string,
  family: QueryFamilyId,
  status: MarketQueryOutcomeStatus,
  durationMs: number,
  rawHits: number,
  usableHits: number,
  providerUsed: MarketSearchProvider,
  providerAttempts: MarketProviderAttempt[],
): MarketQueryOutcome {
  return { query, family, status, durationMs, rawHits, usableHits, providerUsed, providerAttempts };
}

export function selectDiverseSources(
  candidates: MarketEvidence[],
  max: number,
): { usable: MarketEvidence[]; promoPattern: boolean } {
  const patternCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = promotionalPatternKey(candidate.title);
    if (key) patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
  }
  const promoPattern = [...patternCounts.values()].some((count) => count >= 2);

  const byClass = new Map<string, number>();
  const byDomain = new Map<string, number>();
  const byFamily = new Map<string, number>();
  const patternKept = new Map<string, number>();
  const usable: MarketEvidence[] = [];
  const taken = new Set<string>();

  const buckets = new Map<QueryFamilyId, MarketEvidence[]>();
  for (const candidate of [...candidates].sort((a, b) => diversityScore(b) - diversityScore(a))) {
    const list = buckets.get(candidate.queryFamily) || [];
    list.push(candidate);
    buckets.set(candidate.queryFamily, list);
  }
  const familyOrder = [...buckets.keys()];
  let added = true;
  while (usable.length < max && added) {
    added = false;
    for (const family of familyOrder) {
      if (usable.length >= max) break;
      const list = buckets.get(family) || [];
      while (list.length > 0) {
        const candidate = list.shift()!;
        if (taken.has(candidate.url)) continue;
        if (!acceptDiverseCandidate(candidate, { byClass, byDomain, byFamily, patternKept })) continue;
        taken.add(candidate.url);
        usable.push({ ...candidate, usable: true });
        added = true;
        break;
      }
    }
  }

  return { usable, promoPattern };
}

function acceptDiverseCandidate(
  candidate: MarketEvidence,
  state: {
    byClass: Map<string, number>;
    byDomain: Map<string, number>;
    byFamily: Map<string, number>;
    patternKept: Map<string, number>;
  },
): boolean {
  const domainCount = state.byDomain.get(candidate.domain) || 0;
  if (candidate.domain && domainCount >= 2) return false;
  const familyCount = state.byFamily.get(candidate.queryFamily) || 0;
  if (familyCount >= 3) return false;
  const pattern = promotionalPatternKey(candidate.title);
  if (pattern && candidate.promotional && (state.patternKept.get(pattern) || 0) >= 3) return false;
  const classCount = state.byClass.get(candidate.classification) || 0;
  if (candidate.promotional && classCount >= 4) return false;
  if (pattern) state.patternKept.set(pattern, (state.patternKept.get(pattern) || 0) + 1);
  state.byDomain.set(candidate.domain, domainCount + 1);
  state.byClass.set(candidate.classification, classCount + 1);
  state.byFamily.set(candidate.queryFamily, familyCount + 1);
  return true;
}

function diversityScore(item: MarketEvidence): number {
  let score = 0;
  if (item.classification === "EDITORIAL" || item.classification === "FORUM/COMMUNITY") score += 4;
  if (item.classification === "RETAILER") score += 3;
  if (item.queryFamily === "QUESTIONS_OBJECTIONS" || item.queryFamily === "CATEGORY_INTENT") score += 3;
  if (item.queryFamily === "PURCHASE_INTENT") score += 2;
  if (!item.promotional) score += 3;
  return score;
}

export function queryFamiliesUsed(sources: MarketEvidence[]): QueryFamilyId[] {
  return [...new Set(sources.map((item) => item.queryFamily))];
}
