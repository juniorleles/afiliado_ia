import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import { createBraveWebSearch } from "@/lib/source-resolution/brave";
import { withSearchFallback } from "@/lib/source-resolution/fallback";
import { SEARCH_NOT_CONFIGURED_MESSAGE } from "@/lib/source-resolution/block";
import { fetchWithTimeout } from "@/lib/source-resolution/http";
import { defaultWebSearch } from "@/lib/source-resolution/search";
import { SEARCH_PROVIDER_TIMEOUT_MS } from "@/lib/source-resolution/timeouts";
import type { FetchImpl, SearchFn, SearchHit, SearchProviderStatus } from "@/lib/source-resolution/types";

export class SearchNotConfiguredError extends Error {
  constructor(message = SEARCH_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = "SearchNotConfiguredError";
  }
}

function trimEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function unavailable(name: string, missingConfig: string[]): SearchProviderStatus {
  return {
    implemented: true,
    configured: false,
    name,
    apiKeyPresent: false,
    realWebSearchAvailable: false,
    missingConfig,
    message: SEARCH_NOT_CONFIGURED_MESSAGE,
  };
}

function available(name: string, apiKeyPresent: boolean, message: string): SearchProviderStatus {
  return {
    implemented: true,
    configured: true,
    name,
    apiKeyPresent,
    realWebSearchAvailable: true,
    missingConfig: [],
    message,
  };
}

export function getSearchProviderStatus(): SearchProviderStatus {
  const explicit = trimEnv("WEB_SEARCH_PROVIDER").toLowerCase();
  const brave = trimEnv("BRAVE_SEARCH_API_KEY");
  const tavily = trimEnv("TAVILY_API_KEY");
  const serpapi = trimEnv("SERPAPI_API_KEY");

  if (explicit === "none") {
    return unavailable("NONE", ["WEB_SEARCH_PROVIDER=none"]);
  }
  if (explicit === "brave") {
    return brave
      ? available("BRAVE", true, "Brave Search API")
      : unavailable("BRAVE", ["BRAVE_SEARCH_API_KEY"]);
  }
  if (explicit === "tavily") {
    return tavily
      ? available("TAVILY", true, "Tavily Search API")
      : unavailable("TAVILY", ["TAVILY_API_KEY"]);
  }
  if (explicit === "serpapi") {
    return serpapi
      ? available("SERPAPI", true, "SerpAPI")
      : unavailable("SERPAPI", ["SERPAPI_API_KEY"]);
  }
  if (explicit === "duckduckgo") {
    return available("DUCKDUCKGO_HTML", false, "DuckDuckGo HTML search (no API key)");
  }
  if (brave) return available("BRAVE", true, "Brave Search API");
  if (tavily) return available("TAVILY", true, "Tavily Search API");
  if (serpapi) return available("SERPAPI", true, "SerpAPI");
  return available("DUCKDUCKGO_HTML", false, "DuckDuckGo HTML search (no API key)");
}

export function getBraveApiKey(): string {
  return trimEnv("BRAVE_API_KEY") || trimEnv("BRAVE_SEARCH_API_KEY");
}

export function createWebSearch(
  fetchImpl: FetchImpl,
  signal?: AbortSignal,
): { search: SearchFn; status: SearchProviderStatus } {
  const status = getSearchProviderStatus();
  if (!status.realWebSearchAvailable) {
    return {
      status,
      search: async () => {
        throw new SearchNotConfiguredError(status.message);
      },
    };
  }
  if (status.name === "BRAVE") {
    return { status, search: createBraveWebSearch(fetchImpl, trimEnv("BRAVE_SEARCH_API_KEY") || trimEnv("BRAVE_API_KEY"), signal) };
  }
  if (status.name === "TAVILY") {
    return { status, search: tavilySearch(fetchImpl, trimEnv("TAVILY_API_KEY"), signal) };
  }
  if (status.name === "SERPAPI") {
    return { status, search: serpApiSearch(fetchImpl, trimEnv("SERPAPI_API_KEY"), signal) };
  }
  return { status, search: defaultWebSearch(fetchImpl, signal) };
}

export function createSourceResolutionSearch(
  fetchImpl: FetchImpl,
  signal?: AbortSignal,
): { search: SearchFn; status: SearchProviderStatus } {
  const created = createWebSearch(fetchImpl, signal);
  const braveKey = getBraveApiKey();
  if (!created.status.realWebSearchAvailable || created.status.name === "BRAVE" || !braveKey) {
    return created;
  }
  return {
    status: {
      ...created.status,
      name: `${created.status.name} → BRAVE`,
      message: `${created.status.message}; Brave fallback on infrastructure failure`,
    },
    search: withSearchFallback({
      primary: created.search,
      secondary: createBraveWebSearch(fetchImpl, braveKey, signal),
      primaryName: created.status.name,
      secondaryName: "BRAVE",
    }),
  };
}

function tavilySearch(fetchImpl: FetchImpl, apiKey: string, signal?: AbortSignal): SearchFn {
  return async (query: string) => {
    const endpoint = "https://api.tavily.com/search";
    assertSafeOutboundUrl(endpoint);
    const response = await fetchWithTimeout(
      fetchImpl,
      endpoint,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ api_key: apiKey, query, max_results: 8, search_depth: "basic" }),
      },
      SEARCH_PROVIDER_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{ url?: string; title?: string; content?: string }>;
    };
    return toHits((data.results || []).map((row) => ({ url: row.url, title: row.title, snippet: row.content })));
  };
}

function serpApiSearch(fetchImpl: FetchImpl, apiKey: string, signal?: AbortSignal): SearchFn {
  return async (query: string) => {
    const endpoint = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`;
    assertSafeOutboundUrl(endpoint);
    const response = await fetchWithTimeout(
      fetchImpl,
      endpoint,
      { headers: { accept: "application/json" } },
      SEARCH_PROVIDER_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      organic_results?: Array<{ link?: string; title?: string; snippet?: string }>;
    };
    return toHits(
      (data.organic_results || []).map((row) => ({ url: row.link, title: row.title, snippet: row.snippet })),
    );
  };
}

function toHits(rows: Array<{ url?: string; title?: string; snippet?: string }>): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const url = (row.url || "").trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    hits.push({
      url,
      title: (row.title || "").trim(),
      snippet: (row.snippet || "").trim(),
    });
  }
  return hits;
}
