import { logEvent } from "@/lib/logger";
import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import type { ProductFacts } from "@/lib/product-facts";
import {
  ALTERNATIVE_SOURCES_FOUND_MESSAGE,
  NO_VERIFIED_SOURCES_MESSAGE,
  SEARCH_NOT_CONFIGURED_MESSAGE,
  SEARCH_PROVIDER_TIMED_OUT_MESSAGE,
  SOURCE_DISCOVERY_TIMED_OUT_MESSAGE,
  classifyImportFailure,
  primaryBlockedMessage,
  searchingWebMessage,
  searchingWebStage,
} from "@/lib/source-resolution/block";
import { FetchTimeoutError, combineAbortSignals, fetchWithTimeout, isAbortLike, mapLimit, withTimeout } from "@/lib/source-resolution/http";
import { verifyProductIdentity } from "@/lib/source-resolution/identity";
import { mergeAcceptedFacts, summarizeSources } from "@/lib/source-resolution/merge";
import { setImportStage } from "@/lib/source-resolution/progress";
import { SearchNotConfiguredError } from "@/lib/source-resolution/provider";
import { productNameSearchQueries } from "@/lib/source-resolution/queries";
import { SearchAbortedError, SearchHttpError, SearchParseError, SearchTimeoutError, sameUrl } from "@/lib/source-resolution/search";
import {
  ALTERNATIVE_FETCH_CONCURRENCY,
  GLOBAL_SOURCE_RESOLUTION_TIMEOUT_MS,
  MAX_ALTERNATIVE_SOURCE_FETCHES,
  PER_ALTERNATIVE_SOURCE_TIMEOUT_MS,
  ROBOTS_CHECK_TIMEOUT_MS,
  SEARCH_PROVIDER_TIMEOUT_MS,
} from "@/lib/source-resolution/timeouts";
import type {
  DiscoveryOutcome,
  DiscoveredSource,
  FetchImpl,
  PrimaryBlockReason,
  SearchFn,
  SearchHit,
  SearchProviderStatus,
  SourceResolutionPhase,
  WebDiscoveryReport,
} from "@/lib/source-resolution/types";

const USER_AGENT = "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)";

export type DiscoverByNameInput = {
  productName: string;
  originalUrl: string;
  blockReason: PrimaryBlockReason;
  fetchImpl: FetchImpl;
  searchWeb: SearchFn;
  searchProvider: SearchProviderStatus;
  isAllowedByRobots: (url: string, signal?: AbortSignal) => Promise<boolean>;
  extractFacts: (html: string, url: string) => ProductFacts;
  signal?: AbortSignal;
  importId?: string;
  startedAt?: number;
  primaryFetchMs?: number;
};

export async function discoverByProductName(input: DiscoverByNameInput): Promise<ProductFacts> {
  const productName = input.productName.trim();
  const startedAt = input.startedAt || Date.now();
  const timings = {
    PRIMARY_FETCH_MS: input.primaryFetchMs || 0,
    SEARCH_MS: 0,
    ALTERNATIVE_FETCH_MS: 0,
    IDENTITY_MS: 0,
    EXTRACTION_MS: 0,
    ROBOTS_CHECK_MS: 0,
    TOTAL_IMPORT_MS: 0,
  };
  const phases: Array<{ phase: SourceResolutionPhase; detail?: string }> = [
    { phase: "PRIMARY_BLOCKED", detail: input.blockReason },
    { phase: "SOURCE_RESOLUTION_STARTED", detail: productName },
  ];
  const operatorMessages = [primaryBlockedMessage(input.blockReason), searchingWebMessage(productName)];
  const sources: DiscoveredSource[] = [];
  const acceptedPages: ProductFacts[] = [];
  const queriesUsed: string[] = [];
  let searchHitCount = 0;
  let timedOut = false;
  let cancelled = false;

  const finishNow = (outcome: DiscoveryOutcome, message: string) => {
    timings.TOTAL_IMPORT_MS = Date.now() - startedAt;
    return finish({
      input,
      productName,
      phases,
      operatorMessages,
      queriesUsed,
      sources,
      acceptedPages,
      outcome,
      message,
      timings,
      searchHitCount,
    });
  };

  if (!input.searchProvider.realWebSearchAvailable) {
    phases.push({ phase: "SEARCH_NOT_CONFIGURED", detail: input.searchProvider.name });
    operatorMessages.push(SEARCH_NOT_CONFIGURED_MESSAGE);
    setImportStage(input.importId, SEARCH_NOT_CONFIGURED_MESSAGE);
    return finishNow("SEARCH_NOT_CONFIGURED", SEARCH_NOT_CONFIGURED_MESSAGE);
  }

  const remaining = () => GLOBAL_SOURCE_RESOLUTION_TIMEOUT_MS - (Date.now() - startedAt);
  const expired = () => remaining() <= 0 || Boolean(input.signal?.aborted);
  const globalAbort = new AbortController();
  const globalTimer = setTimeout(() => globalAbort.abort(), Math.max(1, remaining()));
  const signal = combineAbortSignals(input.signal, globalAbort.signal);

  try {
    setImportStage(input.importId, searchingWebStage(productName));
    const queries = productNameSearchQueries(productName);
    const candidates: Array<SearchHit & { query: string }> = [];
    const seen = new Set<string>();
    const searchStarted = Date.now();
    let providerFailed: "SEARCH_TIMEOUT" | "HTTP_ERROR" | "PARSE_ERROR" | "GLOBAL_ABORT" | null = null;

    for (const query of queries) {
      if (expired()) break;
      if (candidates.length >= MAX_ALTERNATIVE_SOURCE_FETCHES) break;
      queriesUsed.push(query);
      phases.push({ phase: "SEARCH_QUERY", detail: query });
      const queryStarted = Date.now();
      const queryTimeoutMs = Math.min(SEARCH_PROVIDER_TIMEOUT_MS, Math.max(1, remaining()));
      logEvent("INFO", "IMPORT", "SEARCH_START", {
        query,
        timeoutMs: queryTimeoutMs,
      });
      let hits: SearchHit[] = [];
      let searchStatus:
        | "SUCCESS"
        | "SUCCESS_EMPTY"
        | "SEARCH_TIMEOUT"
        | "HTTP_ERROR"
        | "PARSE_ERROR"
        | "GLOBAL_ABORT"
        | "ERROR" = "SUCCESS_EMPTY";
      try {
        hits = await input.searchWeb(query, signal);
        searchStatus = hits.length > 0 ? "SUCCESS" : "SUCCESS_EMPTY";
      } catch (err) {
        if (err instanceof SearchNotConfiguredError) {
          logEvent("INFO", "IMPORT", "SEARCH_END", {
            query,
            status: "ERROR",
            errorType: "SEARCH_NOT_CONFIGURED",
            hits: 0,
            durationMs: Date.now() - queryStarted,
          });
          phases.push({ phase: "SEARCH_NOT_CONFIGURED", detail: err.message });
          operatorMessages.push(SEARCH_NOT_CONFIGURED_MESSAGE);
          return finishNow("SEARCH_NOT_CONFIGURED", SEARCH_NOT_CONFIGURED_MESSAGE);
        }
        const message = err instanceof Error ? err.message : "unknown";
        if (input.signal?.aborted || globalAbort.signal.aborted || err instanceof SearchAbortedError) {
          searchStatus = "GLOBAL_ABORT";
          providerFailed = "GLOBAL_ABORT";
        } else if (err instanceof SearchTimeoutError || err instanceof FetchTimeoutError || isAbortLike(err)) {
          searchStatus = "SEARCH_TIMEOUT";
          providerFailed = "SEARCH_TIMEOUT";
        } else if (err instanceof SearchHttpError) {
          searchStatus = "HTTP_ERROR";
          providerFailed = "HTTP_ERROR";
        } else if (err instanceof SearchParseError) {
          searchStatus = "PARSE_ERROR";
          providerFailed = "PARSE_ERROR";
        } else {
          searchStatus = "ERROR";
        }
        logEvent("WARN", "IMPORT", "web search failed", { query, error: message, status: searchStatus });
        logEvent("INFO", "IMPORT", "SEARCH_END", {
          query,
          status: searchStatus,
          hits: 0,
          durationMs: Date.now() - queryStarted,
        });
        if (searchStatus === "SEARCH_TIMEOUT") phases.push({ phase: "SEARCH_TIMEOUT", detail: query });
        if (searchStatus === "GLOBAL_ABORT" || searchStatus === "SEARCH_TIMEOUT" || searchStatus === "HTTP_ERROR" || searchStatus === "PARSE_ERROR") {
          break;
        }
        continue;
      }
      logEvent("INFO", "IMPORT", "SEARCH_END", {
        query,
        status: searchStatus,
        hits: hits.length,
        durationMs: Date.now() - queryStarted,
      });
      phases.push({ phase: "SEARCH_RESULTS", detail: `${hits.length} hits for ${query}` });
      for (const hit of hits) {
        if (candidates.length >= MAX_ALTERNATIVE_SOURCE_FETCHES) break;
        if (sameUrl(hit.url, input.originalUrl)) continue;
        try {
          assertSafeOutboundUrl(hit.url);
        } catch {
          continue;
        }
        if (seen.has(hit.url)) continue;
        seen.add(hit.url);
        candidates.push({ ...hit, query });
      }
      if (candidates.length > 0) break;
    }
    timings.SEARCH_MS = Date.now() - searchStarted;
    searchHitCount = candidates.length;

    if (providerFailed === "GLOBAL_ABORT" || input.signal?.aborted) {
      cancelled = true;
      operatorMessages.push(SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
      setImportStage(input.importId, SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
      return finishNow("CANCELLED", SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
    }

    if ((providerFailed === "SEARCH_TIMEOUT" || providerFailed === "HTTP_ERROR" || providerFailed === "PARSE_ERROR") && candidates.length === 0) {
      operatorMessages.push(SEARCH_PROVIDER_TIMED_OUT_MESSAGE);
      setImportStage(input.importId, SEARCH_PROVIDER_TIMED_OUT_MESSAGE);
      return finishNow(providerFailed === "SEARCH_TIMEOUT" ? "SEARCH_TIMEOUT" : "SEARCH_TIMEOUT", SEARCH_PROVIDER_TIMED_OUT_MESSAGE);
    }

    if (candidates.length === 0 && expired()) {
      timedOut = true;
      operatorMessages.push(SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
      setImportStage(input.importId, SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
      return finishNow("TIMED_OUT", SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
    }
    setImportStage(input.importId, `Found ${candidates.length} candidate sources.`);
    operatorMessages.push(`Found ${candidates.length} candidate sources.`);

    const altStarted = Date.now();
    await mapLimit(candidates, ALTERNATIVE_FETCH_CONCURRENCY, async (hit, index) => {
      if (expired()) return;
      setImportStage(input.importId, `Checking alternative sources ${index + 1}/${candidates.length}...`);
      const inspected = await inspectCandidate({ ...input, signal }, hit, productName, timings);
      sources.push(inspected.source);
      if (inspected.accepted) {
        acceptedPages.push(inspected.accepted);
        phases.push({ phase: "IDENTITY_CHECK", detail: hit.url });
      }
      if (inspected.source.identityReasons.includes("FETCH_TIMEOUT")) {
        phases.push({ phase: "FETCH_TIMEOUT", detail: hit.url });
      }
    });
    timings.ALTERNATIVE_FETCH_MS = Date.now() - altStarted;

    if (input.signal?.aborted) {
      cancelled = true;
      operatorMessages.push(SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
      setImportStage(input.importId, SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
      return finishNow("CANCELLED", SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
    }
    if (Date.now() - startedAt >= GLOBAL_SOURCE_RESOLUTION_TIMEOUT_MS || globalAbort.signal.aborted) {
      timedOut = true;
      phases.push({ phase: "GLOBAL_TIMEOUT" });
      operatorMessages.push(SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
      setImportStage(input.importId, SOURCE_DISCOVERY_TIMED_OUT_MESSAGE);
    }

    const outcome: DiscoveryOutcome = timedOut
      ? "TIMED_OUT"
      : acceptedPages.length > 0
        ? "ALTERNATIVE_SOURCES_FOUND"
        : "NO_VERIFIED_SOURCES";
    if (outcome === "ALTERNATIVE_SOURCES_FOUND") {
      setImportStage(input.importId, "Validating product identity...");
      operatorMessages.push(ALTERNATIVE_SOURCES_FOUND_MESSAGE);
      setImportStage(input.importId, "Building ProductFacts...");
    } else if (outcome === "NO_VERIFIED_SOURCES") {
      operatorMessages.push(NO_VERIFIED_SOURCES_MESSAGE);
    }
    return finishNow(outcome, outcome === "TIMED_OUT" ? SOURCE_DISCOVERY_TIMED_OUT_MESSAGE : searchingWebMessage(productName));
  } finally {
    clearTimeout(globalTimer);
  }
}

async function inspectCandidate(
  input: DiscoverByNameInput,
  hit: SearchHit & { query: string },
  productName: string,
  timings: NonNullable<WebDiscoveryReport["timings"]>,
): Promise<{ source: DiscoveredSource; accepted?: ProductFacts }> {
  const base = {
    url: hit.url,
    title: hit.title,
    snippet: hit.snippet,
    query: hit.query,
  };
  try {
    if (input.signal?.aborted) {
      return { source: { ...base, status: "REJECTED", identityReasons: ["FETCH_TIMEOUT"] } };
    }
    const robotsStarted = Date.now();
    const allowed = await withTimeout(
      input.isAllowedByRobots(hit.url, input.signal),
      ROBOTS_CHECK_TIMEOUT_MS,
      hit.url,
    );
    timings.ROBOTS_CHECK_MS += Date.now() - robotsStarted;
    if (!allowed) {
      return {
        source: { ...base, status: "REJECTED", identityReasons: ["robots.txt disallows this path"] },
      };
    }
  } catch (err) {
    if (isAbortLike(err) || err instanceof FetchTimeoutError) {
      return { source: { ...base, status: "REJECTED", identityReasons: ["FETCH_TIMEOUT"] } };
    }
    return { source: { ...base, status: "REJECTED", identityReasons: ["robots check failed"] } };
  }

  let page: { status: number; body: string } | null = null;
  try {
    page = await fetchDiscoveredPage(input.fetchImpl, hit.url, input.signal);
  } catch (err) {
    if (isAbortLike(err) || err instanceof FetchTimeoutError) {
      return { source: { ...base, status: "REJECTED", identityReasons: ["FETCH_TIMEOUT"] } };
    }
    return { source: { ...base, status: "REJECTED", identityReasons: ["could not fetch discovered page"] } };
  }
  if (!page) {
    return { source: { ...base, status: "REJECTED", identityReasons: ["could not fetch discovered page"] } };
  }
  const block = classifyImportFailure({ status: page.status, body: page.body });
  if (block) {
    return { source: { ...base, status: "REJECTED", identityReasons: [`discovered page blocked (${block})`] } };
  }
  if (page.status >= 400) {
    return { source: { ...base, status: "REJECTED", identityReasons: [`HTTP ${page.status}`] } };
  }

  setImportStage(input.importId, "Validating product identity...");
  const extractStarted = Date.now();
  const facts = input.extractFacts(page.body, hit.url);
  timings.EXTRACTION_MS += Date.now() - extractStarted;
  const identityStarted = Date.now();
  const identity = verifyProductIdentity({
    productName,
    pageTitle: hit.title,
    extractedName: facts.productName,
    pageText: page.body.replace(/<[^>]+>/g, " "),
    manufacturer: facts.manufacturer,
    ingredients: facts.ingredientsOrComponents,
  });
  timings.IDENTITY_MS += Date.now() - identityStarted;
  const source: DiscoveredSource = {
    ...base,
    title: hit.title || facts.productName,
    status: identity.status,
    identityReasons: identity.reasons,
  };
  if (identity.status === "ACCEPTED") {
    return { source, accepted: { ...facts, productName, sourceUrl: hit.url } };
  }
  return { source };
}

function finish(args: {
  input: DiscoverByNameInput;
  productName: string;
  phases: Array<{ phase: SourceResolutionPhase; detail?: string }>;
  operatorMessages: string[];
  queriesUsed: string[];
  sources: DiscoveredSource[];
  acceptedPages: ProductFacts[];
  outcome: DiscoveryOutcome;
  message: string;
  timings: NonNullable<WebDiscoveryReport["timings"]>;
  searchHitCount?: number;
}): ProductFacts {
  args.phases.push({ phase: "SOURCE_RESOLUTION_COMPLETE", detail: args.outcome });
  logEvent("INFO", "IMPORT", "SOURCE_RESOLUTION_END", {
    outcome: args.outcome,
    accepted: args.acceptedPages.length,
    identityUncertain: args.sources.filter((s) => s.status === "IDENTITY_UNCERTAIN").length,
    durationMs: args.timings.TOTAL_IMPORT_MS,
    searchHits: args.searchHitCount || 0,
    queriesUsed: args.queriesUsed.length,
  });
  logEvent("INFO", "IMPORT", "SOURCE_RESOLUTION_COMPLETE", {
    runId: args.input.importId,
    outcome: args.outcome,
    accepted: args.acceptedPages.length,
    identityUncertain: args.sources.filter((s) => s.status === "IDENTITY_UNCERTAIN").length,
    durationMs: args.timings.TOTAL_IMPORT_MS,
    productName: args.productName,
    timings: args.timings,
  });
  const counts = summarizeSources(args.sources);
  const timeouts = args.sources.filter((source) => source.identityReasons.includes("FETCH_TIMEOUT")).length;
  const report: WebDiscoveryReport = {
    triggered: true,
    originalUrl: args.input.originalUrl,
    primaryBlock: args.input.blockReason,
    productName: args.productName,
    message: args.message,
    queriesUsed: args.queriesUsed,
    sources: args.sources,
    acceptedCount: counts.acceptedCount,
    uncertainCount: counts.uncertainCount,
    phases: args.phases,
    outcome: args.outcome,
    operatorMessages: args.operatorMessages,
    searchProvider: args.input.searchProvider,
    timings: args.timings,
    counts: {
      SEARCH_RESULTS: args.searchHitCount || 0,
      SOURCES_ATTEMPTED: args.sources.length,
      SOURCES_TIMEOUT: timeouts,
      SOURCES_ACCEPTED: counts.acceptedCount,
      SOURCES_REJECTED: args.sources.filter((source) => source.status === "REJECTED").length,
    },
  };
  return mergeAcceptedFacts({
    productName: args.productName,
    originalUrl: args.input.originalUrl,
    pages: args.acceptedPages,
    report,
  });
}

async function fetchDiscoveredPage(
  fetchImpl: FetchImpl,
  url: string,
  signal?: AbortSignal,
): Promise<{ status: number; body: string } | null> {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      { headers: { "user-agent": USER_AGENT }, cache: "no-store" },
      PER_ALTERNATIVE_SOURCE_TIMEOUT_MS,
      signal,
    );
    const body = await response.text();
    return { status: response.status, body };
  } catch (err) {
    if (err instanceof FetchTimeoutError) throw err;
    if (isAbortLike(err)) throw err;
    return null;
  }
}
