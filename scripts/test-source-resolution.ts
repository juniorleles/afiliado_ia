// npx tsx scripts/test-source-resolution.ts
import { importProductFromUrl, ImportBlockedError } from "../src/lib/import-product.ts";
import { classifyImportFailure, primaryUnavailableMessage, shouldTriggerNameDiscovery } from "../src/lib/source-resolution/block.ts";
import { isDomainReconstructionQuery, productNameFromUrlPath, productNameSearchQueries } from "../src/lib/source-resolution/queries.ts";
import { tokenCoverage, verifyProductIdentity } from "../src/lib/source-resolution/identity.ts";
import { parseDuckDuckGoHtml, sameUrl, unwrapDuckDuckGoUrl, executeDuckDuckGoSearch, SearchAbortedError, SearchHttpError, SearchParseError, SearchTimeoutError } from "../src/lib/source-resolution/search.ts";
import { executeBraveSearch } from "../src/lib/source-resolution/brave.ts";
import { withSearchFallback } from "../src/lib/source-resolution/fallback.ts";
import { createSourceResolutionSearch, createWebSearch } from "../src/lib/source-resolution/provider.ts";
import { runMarketResearch } from "../src/lib/market-research/research.ts";
import { mergeAcceptedFacts } from "../src/lib/source-resolution/merge.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { fetchWithTimeout, FetchTimeoutError } from "../src/lib/source-resolution/http.ts";
import { PER_ALTERNATIVE_SOURCE_TIMEOUT_MS } from "../src/lib/source-resolution/timeouts.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

const queries = productNameSearchQueries("Joint Support Pro");
assert(queries[0] === "Joint Support Pro", "primary fallback search is the product name");
assert(queries[1] === "Joint Support Pro ingredients", "expanded queries come after the product name");
assert(!queries.some((q) => q.startsWith("site:")), "domain reconstruction is not a search query");
assert(
  isDomainReconstructionQuery("site:example.com Joint Support Pro", "https://example.com/product/"),
  "site:host queries are classified as domain reconstruction",
);
assert(
  !isDomainReconstructionQuery("Joint Support Pro", "https://example.com/product/"),
  "bare product name is not domain reconstruction",
);
assert(productNameFromUrlPath("https://example.com/product/") === null, "generic /product/ path is not a name");

assert(classifyImportFailure({ status: 403 }) === "HTTP_403", "HTTP 403 is classified");
assert(classifyImportFailure({ status: 403, body: "Access Denied" }) === "ACCESS_DENIED", "access denied body classified");
assert(classifyImportFailure({ robotsDisallowed: true }) === "ROBOTS_BLOCKED", "robots classified");
assert(
  classifyImportFailure({ status: 200, body: "Just a moment... cloudflare checking your browser" }) === "ANTI_BOT_BLOCKED",
  "anti-bot wall classified",
);
assert(shouldTriggerNameDiscovery("HTTP_403"), "HTTP 403 triggers product-name discovery");
assert(
  primaryUnavailableMessage("Joint Support Pro") ===
    "Primary source unavailable. Searching the web for: Joint Support Pro",
  "operator message is product-name driven",
);

const same = verifyProductIdentity({
  productName: "Joint Support Pro",
  pageTitle: "Joint Support Pro Official",
  extractedName: "Joint Support Pro",
  pageText: "Joint Support Pro is a daily capsule with glucosamine sulfate.",
  ingredients: ["Glucosamine sulfate"],
});
assert(same.status === "ACCEPTED", "matching product name is ACCEPTED");

const other = verifyProductIdentity({
  productName: "Joint Support Pro",
  pageTitle: "Cardio Gummies Max",
  extractedName: "Cardio Gummies Max",
  pageText: "A candy for heart-themed marketing.",
});
assert(other.status !== "ACCEPTED", "different product is not ACCEPTED");
assert(tokenCoverage("Joint Support Pro", "Cardio Gummies Max") < 0.5, "unrelated title has low name coverage");

assert(unwrapDuckDuckGoUrl("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fmerchant.example%2Fjoint") === "https://merchant.example/joint", "ddg redirect unwraps");
const ddg = parseDuckDuckGoHtml(
  `<a class="result__a" href="https://merchant.example/joint-support-pro">Joint Support Pro</a><a class="result__snippet">Daily capsules</a>`,
);
assert(ddg[0]?.url === "https://merchant.example/joint-support-pro", "duckduckgo html parser extracts result url");
assert(sameUrl("https://www.example.com/p/", "https://example.com/p"), "www and trailing slash normalize");

const mergedEmpty = mergeAcceptedFacts({
  productName: "Joint Support Pro",
  originalUrl: "https://blocked.example/product/",
  pages: [],
  report: {
    triggered: true,
    originalUrl: "https://blocked.example/product/",
    primaryBlock: "HTTP_403",
    productName: "Joint Support Pro",
    message: primaryUnavailableMessage("Joint Support Pro"),
    queriesUsed: ["Joint Support Pro"],
    sources: [
      {
        url: "https://other.example/cardio",
        title: "Cardio",
        snippet: "",
        query: "Joint Support Pro",
        status: "IDENTITY_UNCERTAIN",
        identityReasons: ["incomplete identity evidence"],
      },
    ],
    acceptedCount: 0,
    uncertainCount: 1,
    phases: [{ phase: "PRIMARY_BLOCKED", detail: "HTTP_403" }],
    outcome: "NO_VERIFIED_SOURCES",
    operatorMessages: ["Primary source returned HTTP 403.", "Searching the web for: Joint Support Pro"],
    searchProvider: {
      implemented: true,
      configured: true,
      name: "TEST",
      apiKeyPresent: false,
      realWebSearchAvailable: true,
      missingConfig: [],
      message: "test",
    },
  },
});
assert(!mergedEmpty.ingredientsOrComponents.length, "uncertain sources do not contribute facts");
assert(mergedEmpty.webDiscovery?.acceptedCount === 0, "zero accepted sources recorded");

const altFacts = emptyProductFacts("Joint Support Pro", "https://merchant.example/joint", "IMPORTED");
altFacts.description = "A daily joint-support supplement with glucosamine.";
altFacts.features = ["Easy-to-swallow capsules"];
altFacts.ingredientsOrComponents = ["Glucosamine sulfate"];
altFacts.confidence.description = "DIRECT_SOURCE";
altFacts.confidence.features = "DIRECT_SOURCE";
altFacts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
const merged = mergeAcceptedFacts({
  productName: "Joint Support Pro",
  originalUrl: "https://blocked.example/product/",
  pages: [altFacts],
  report: {
    triggered: true,
    originalUrl: "https://blocked.example/product/",
    primaryBlock: "HTTP_403",
    productName: "Joint Support Pro",
    message: primaryUnavailableMessage("Joint Support Pro"),
    queriesUsed: ["Joint Support Pro"],
    sources: [
      {
        url: altFacts.sourceUrl,
        title: "Joint Support Pro",
        snippet: "",
        query: "Joint Support Pro",
        status: "ACCEPTED",
        identityReasons: ["product name match"],
      },
    ],
    acceptedCount: 1,
    uncertainCount: 0,
    phases: [{ phase: "SOURCE_RESOLUTION_COMPLETE", detail: "ALTERNATIVE_SOURCES_FOUND" }],
    outcome: "ALTERNATIVE_SOURCES_FOUND",
    operatorMessages: ["Primary source returned HTTP 403.", "Searching the web for: Joint Support Pro", "Alternative sources found."],
    searchProvider: {
      implemented: true,
      configured: true,
      name: "TEST",
      apiKeyPresent: false,
      realWebSearchAvailable: true,
      missingConfig: [],
      message: "test",
    },
  },
});
assert(merged.ingredientsOrComponents.includes("Glucosamine sulfate"), "accepted sources combine ingredients");
assert(merged.sourceUrl === "https://merchant.example/joint", "merged sourceUrl is the accepted page, not the blocked URL");

const original = "https://blocked.example/product/";
const alt = "https://merchant.example/joint-support-pro";
const fetched: string[] = [];
const searches: string[] = [];
const altHtml = `<html><head><meta property="og:title" content="Joint Support Pro" /></head>
<body>
<h1>Joint Support Pro</h1>
<p>Joint Support Pro is a daily joint-support supplement with glucosamine.</p>
<h2>What's Inside</h2>
<ul><li>Glucosamine sulfate</li><li>Chondroitin</li></ul>
<h2>How To Use</h2>
<ul><li>Take two capsules daily with food</li></ul>
</body></html>`;

async function fetchImpl(input: string): Promise<Response> {
  fetched.push(String(input));
  const url = String(input);
  if (url.endsWith("/robots.txt")) return htmlResponse(200, "User-agent: *\nAllow: /");
  if (url === original) return htmlResponse(403, "Forbidden");
  if (url === alt) return htmlResponse(200, altHtml);
  if (url.includes("duckduckgo.com")) return htmlResponse(500, "unused");
  return htmlResponse(404, "missing");
}

async function main() {
  const facts = await importProductFromUrl(
    original,
    { operatorProductName: "Joint Support Pro" },
    {
      fetchImpl,
      searchWeb: async (query) => {
        searches.push(query);
        return [{ url: alt, title: "Joint Support Pro", snippet: "Daily capsules with glucosamine" }];
      },
    },
  );
  assert(searches[0] === "Joint Support Pro", "HTTP 403 + known product name searches the product name first");
  assert(searches.every((q) => q.startsWith("Joint Support Pro")), "all search queries are product-name driven");
  assert(fetched.filter((u) => u === original).length === 1, "original HTTP 403 URL is not fetched again");
  assert(facts.webDiscovery?.triggered === true, "web discovery flagged on facts");
  assert(facts.webDiscovery?.primaryBlock === "HTTP_403", "primary block recorded as HTTP_403");
  assert(facts.webDiscovery?.message.includes("Searching the web for: Joint Support Pro"), "UI message uses product name");
  assert(facts.ingredientsOrComponents.includes("Glucosamine sulfate"), "accepted alternative source populates ingredients");
  assert(facts.webDiscovery?.sources.some((s) => s.status === "ACCEPTED"), "matching source is ACCEPTED");
  assert(facts.origin === "IMPORTED", "discovered facts remain IMPORTED, not MANUAL");

  let needName = false;
  try {
    await importProductFromUrl(original, {}, { fetchImpl, searchWeb: async () => [] });
  } catch (err) {
    needName = err instanceof ImportBlockedError && err.needsProductName;
  }
  assert(needName, "HTTP 403 without a product name asks for the name instead of inventing one");

  const uncertainFetch: string[] = [];
  const cardioHtml = `<html><body><h1>Cardio Gummies Max</h1><p>A candy product unrelated to joints.</p></body></html>`;
  const uncertain = await importProductFromUrl(
    original,
    { operatorProductName: "Joint Support Pro" },
    {
      fetchImpl: async (input) => {
        uncertainFetch.push(String(input));
        const url = String(input);
        if (url.endsWith("/robots.txt")) return htmlResponse(200, "User-agent: *\nAllow: /");
        if (url === original) return htmlResponse(403, "Forbidden");
        return htmlResponse(200, cardioHtml);
      },
      searchWeb: async () => [{ url: "https://other.example/cardio", title: "Cardio Gummies Max", snippet: "candy" }],
    },
  );
  assert(uncertain.webDiscovery?.sources[0]?.status !== "ACCEPTED", "mismatched product is not ACCEPTED");
  assert(uncertain.ingredientsOrComponents.length === 0, "IDENTITY_UNCERTAIN sources are not used for grounded facts");

  const generateSrc = readFileSync(path.join(process.cwd(), "src/app/admin/generate/generate-client.tsx"), "utf8");
  assert(
    generateSrc.includes("Checking primary source..."),
    "generate UI shows primary source stage",
  );
  assert(generateSrc.includes("Cancel"), "import UI has Cancel");
  assert(generateSrc.includes("Retry source discovery"), "timeout UI can retry source discovery");
  assert(
    generateSrc.includes("operatorProductName: operatorName"),
    "Import facts passes the Product name field into the import action",
  );
  assert(generateSrc.includes("importProductAction({"), "Import facts calls importProductAction with a payload object");
  assert(generateSrc.includes("last resort"), "manual facts remain last resort");
  assert(!/setAllowManualLastResort\(true\);\s*return/.test(generateSrc.replace(/\n/g, " ")), "failed import does not immediately force manual facts");
  const labSrc = readFileSync(path.join(process.cwd(), "src/app/admin/validation/run-forms.tsx"), "utf8");
  assert(
    labSrc.includes("Searching the web for:"),
    "validation lab UI shows product-name search message",
  );
  const actionSrc = readFileSync(path.join(process.cwd(), "src/app/admin/generate/actions.ts"), "utf8");
  assert(actionSrc.includes("executeGenerateImport"), "import server action delegates to executeGenerateImport");
  assert(actionSrc.includes("operatorProductName"), "import server action reads operator product name");

  const timeoutStarted = Date.now();
  let timed = false;
  try {
    await fetchWithTimeout(async () => new Promise(() => {}), "https://slow.example/", {}, 80);
  } catch (err) {
    timed = err instanceof FetchTimeoutError;
  }
  assert(timed, "hanging fetch raises FETCH_TIMEOUT");
  assert(Date.now() - timeoutStarted < 1500, "per-request timeout is bounded");

  const hangStarted = Date.now();
  const hung = await importProductFromUrl(
    original,
    { operatorProductName: "Joint Support Pro" },
    {
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) return htmlResponse(200, "User-agent: *\nAllow: /");
        if (url === original) return htmlResponse(403, "Forbidden");
        return new Promise(() => {});
      },
      searchWeb: async () => [{ url: "https://hang.example/joint", title: "Joint Support Pro", snippet: "hang" }],
    },
  );
  assert(Date.now() - hangStarted < 20_000, "hanging alternative source does not stall import for minutes");
  assert(
    Boolean(hung.webDiscovery?.sources.some((source) => source.identityReasons.includes("FETCH_TIMEOUT"))),
    "slow candidate is recorded as FETCH_TIMEOUT",
  );
  assert((hung.webDiscovery?.timings?.TOTAL_IMPORT_MS || 0) < 20_000, "TOTAL_IMPORT_MS stays under 20s for a hanging candidate");
  void PER_ALTERNATIVE_SOURCE_TIMEOUT_MS;

  const queriesA: string[] = [];
  const startedA = Date.now();
  const timeoutFast = await importProductFromUrl(
    original,
    { operatorProductName: "Joint Support Pro" },
    {
      fetchImpl,
      searchWeb: async (query) => {
        queriesA.push(query);
        throw new SearchTimeoutError(query, 10_000);
      },
    },
  );
  assert(queriesA.length === 1, "TEST A: SEARCH_TIMEOUT fail-fast does not run remaining queries");
  assert(timeoutFast.webDiscovery?.outcome === "SEARCH_TIMEOUT", "TEST A: timeout is SEARCH_TIMEOUT not EMPTY_RESULTS");
  assert(
    timeoutFast.webDiscovery?.phases.some((phase) => phase.phase === "SEARCH_TIMEOUT") === true,
    "TEST A: SEARCH_TIMEOUT is recorded in phases",
  );
  assert(Date.now() - startedA < 5_000, "TEST A: fail-fast does not consume the global budget");

  const queriesB: string[] = [];
  const emptySearch = await importProductFromUrl(
    original,
    { operatorProductName: "Joint Support Pro" },
    {
      fetchImpl,
      searchWeb: async (query) => {
        queriesB.push(query);
        return [];
      },
    },
  );
  assert(queriesB.length >= 2, "TEST B: SUCCESS_EMPTY continues to the next query family");
  assert(emptySearch.webDiscovery?.outcome !== "SEARCH_TIMEOUT", "TEST B: empty results are not SEARCH_TIMEOUT");

  const queriesC: string[] = [];
  const partial = await importProductFromUrl(
    original,
    { operatorProductName: "Joint Support Pro" },
    {
      fetchImpl,
      searchWeb: async (query) => {
        queriesC.push(query);
        if (queriesC.length === 1) {
          return [{ url: alt, title: "Joint Support Pro", snippet: "Daily capsules with glucosamine" }];
        }
        throw new SearchTimeoutError(query, 10_000);
      },
    },
  );
  assert(queriesC.length === 1, "TEST C: first successful hits stop further query families");
  assert(
    partial.webDiscovery?.sources.some((source) => source.url === alt) === true,
    "TEST C: candidates from query 1 survive later SEARCH_TIMEOUT",
  );
  assert(
    partial.ingredientsOrComponents.includes("Glucosamine sulfate"),
    "TEST C: identity verification still runs on earlier candidates",
  );

  let innerSignal: AbortSignal | undefined;
  let fetchCalls = 0;
  const abortStarted = Date.now();
  const abortOutcome = await executeDuckDuckGoSearch({
    query: "Joint Genesis",
    timeoutMs: 80,
    fetchImpl: async (_url, init) => {
      fetchCalls += 1;
      innerSignal = init?.signal;
      return new Promise(() => {});
    },
  });
  assert(abortOutcome.status === "SEARCH_TIMEOUT", "TEST D: hanging provider is SEARCH_TIMEOUT");
  assert(innerSignal?.aborted === true, "TEST D: inner fetch AbortSignal is aborted");
  assert(Date.now() - abortStarted < 1500, "TEST D: provider timeout is bounded");
  const callsAfterTimeout = fetchCalls;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(fetchCalls === callsAfterTimeout, "TEST D: no orphan HTTP after SEARCH_TIMEOUT");

  const queriesE: string[] = [];
  const globalAbort = new AbortController();
  const globalPromise = importProductFromUrl(
    original,
    { operatorProductName: "Joint Support Pro" },
    {
      fetchImpl,
      signal: globalAbort.signal,
      searchWeb: async (query, signal) => {
        queriesE.push(query);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 30_000);
          const onAbort = () => {
            clearTimeout(timer);
            reject(new SearchAbortedError(query));
          };
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener("abort", onAbort, { once: true });
        });
        return [];
      },
    },
  );
  setTimeout(() => globalAbort.abort(), 80);
  const aborted = await globalPromise;
  assert(aborted.webDiscovery?.outcome === "CANCELLED", "TEST E: global abort is CANCELLED not EMPTY_RESULTS");
  assert(queriesE.length <= 1, "TEST E: global abort does not run remaining queries");

  const validHit = [{ url: alt, title: "Joint Support Pro", snippet: "Daily capsules with glucosamine" }];

  let ddgA = 0;
  let braveA = 0;
  const fallbackA = withSearchFallback({
    primary: async (query) => {
      ddgA += 1;
      throw new SearchTimeoutError(query, 10_000);
    },
    secondary: async () => {
      braveA += 1;
      return validHit;
    },
  });
  const factsA = await importProductFromUrl(original, { operatorProductName: "Joint Support Pro" }, { fetchImpl, searchWeb: fallbackA });
  assert(ddgA === 1, "FALLBACK A: DDG called once");
  assert(braveA === 1, "FALLBACK A: Brave called once after DDG timeout");
  assert(factsA.ingredientsOrComponents.includes("Glucosamine sulfate"), "FALLBACK A: Brave hits go through identity");

  let braveB = 0;
  const fallbackB = withSearchFallback({
    primary: async (query) => {
      throw new SearchHttpError(query, 403);
    },
    secondary: async () => {
      braveB += 1;
      return validHit;
    },
  });
  await importProductFromUrl(original, { operatorProductName: "Joint Support Pro" }, { fetchImpl, searchWeb: fallbackB });
  assert(braveB === 1, "FALLBACK B: Brave called once after DDG HTTP_ERROR");

  let braveC = 0;
  const fallbackC = withSearchFallback({
    primary: async (query) => {
      throw new SearchParseError(query);
    },
    secondary: async () => {
      braveC += 1;
      return validHit;
    },
  });
  await importProductFromUrl(original, { operatorProductName: "Joint Support Pro" }, { fetchImpl, searchWeb: fallbackC });
  assert(braveC === 1, "FALLBACK C: Brave called once after DDG PARSE_ERROR");

  let braveD = 0;
  const fallbackD = withSearchFallback({
    primary: async () => validHit,
    secondary: async () => {
      braveD += 1;
      return validHit;
    },
  });
  await importProductFromUrl(original, { operatorProductName: "Joint Support Pro" }, { fetchImpl, searchWeb: fallbackD });
  assert(braveD === 0, "FALLBACK D: Brave is not called on DDG SUCCESS");

  let braveE = 0;
  let ddgE = 0;
  const fallbackE = withSearchFallback({
    primary: async () => {
      ddgE += 1;
      return [];
    },
    secondary: async () => {
      braveE += 1;
      return validHit;
    },
  });
  await importProductFromUrl(original, { operatorProductName: "Joint Support Pro" }, { fetchImpl, searchWeb: fallbackE });
  assert(ddgE >= 2, "FALLBACK E: SUCCESS_EMPTY continues query families");
  assert(braveE === 0, "FALLBACK E: Brave is not called on DDG SUCCESS_EMPTY");

  let braveF = 0;
  const abortF = new AbortController();
  const fallbackF = withSearchFallback({
    primary: async (query, signal) => {
      await new Promise<void>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new SearchAbortedError(query)), 30_000);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new SearchAbortedError(query));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      return [];
    },
    secondary: async () => {
      braveF += 1;
      return validHit;
    },
  });
  const promiseF = importProductFromUrl(original, { operatorProductName: "Joint Support Pro" }, {
    fetchImpl,
    signal: abortF.signal,
    searchWeb: fallbackF,
  });
  setTimeout(() => abortF.abort(), 80);
  const factsF = await promiseF;
  assert(factsF.webDiscovery?.outcome === "CANCELLED", "FALLBACK F: global abort stays CANCELLED");
  assert(braveF === 0, "FALLBACK F: Brave is not called on GLOBAL_ABORT");

  let braveG = 0;
  const startedG = Date.now();
  const fallbackG = withSearchFallback({
    primary: async (query) => {
      throw new SearchTimeoutError(query, 10_000);
    },
    secondary: async (query) => {
      braveG += 1;
      throw new SearchTimeoutError(query, 10_000);
    },
  });
  const factsG = await importProductFromUrl(original, { operatorProductName: "Joint Support Pro" }, { fetchImpl, searchWeb: fallbackG });
  assert(braveG === 1, "FALLBACK G: Brave is tried only once");
  assert(factsG.webDiscovery?.outcome === "SEARCH_TIMEOUT", "FALLBACK G: dual timeout is SEARCH_TIMEOUT");
  assert(Date.now() - startedG < 5_000, "FALLBACK G: dual timeout does not consume the global budget");

  let braveSignal: AbortSignal | undefined;
  let braveFetchCalls = 0;
  const braveAbortStarted = Date.now();
  const braveOutcome = await executeBraveSearch({
    query: "Joint Genesis",
    apiKey: "test-key",
    timeoutMs: 80,
    fetchImpl: async (_url, init) => {
      braveFetchCalls += 1;
      braveSignal = init?.signal;
      return new Promise(() => {});
    },
  });
  assert(braveOutcome.status === "SEARCH_TIMEOUT", "FALLBACK H: hanging Brave is SEARCH_TIMEOUT");
  assert(braveSignal?.aborted === true, "FALLBACK H: Brave fetch AbortSignal is aborted");
  assert(Date.now() - braveAbortStarted < 1500, "FALLBACK H: Brave timeout is bounded");
  const braveCallsAfter = braveFetchCalls;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(braveFetchCalls === braveCallsAfter, "FALLBACK H: no orphan Brave HTTP after timeout");

  const kept: Array<{ url: string }> = [];
  let braveI = 0;
  const fallbackI = withSearchFallback({
    primary: async (query) => {
      if (query === "Joint Support Pro") return validHit;
      throw new SearchTimeoutError(query, 10_000);
    },
    secondary: async (query) => {
      braveI += 1;
      throw new SearchTimeoutError(query, 10_000);
    },
  });
  for (const query of ["Joint Support Pro", "Joint Support Pro ingredients"]) {
    try {
      kept.push(...(await fallbackI(query)));
    } catch {
      break;
    }
  }
  assert(kept.some((hit) => hit.url === alt), "FALLBACK I: earlier candidates survive later DDG+Brave timeout");
  assert(braveI === 1, "FALLBACK I: later query tries Brave once");

  const marketSrc = readFileSync(path.join(process.cwd(), "src/lib/market-research/research.ts"), "utf8");
  const marketSearchSrc = readFileSync(path.join(process.cwd(), "src/lib/market-research/search.ts"), "utf8");
  const importSrc = readFileSync(path.join(process.cwd(), "src/lib/import-product.ts"), "utf8");
  assert(marketSearchSrc.includes("createWebSearch"), "FALLBACK J: Market Research DDG primary still uses createWebSearch");
  assert(marketSearchSrc.includes("createBraveWebSearch"), "FALLBACK J: Market Research owns Brave fallback composition");
  assert(!marketSrc.includes("createSourceResolutionSearch") && !marketSearchSrc.includes("createSourceResolutionSearch"), "FALLBACK J: Market Research does not use source-resolution fallback");
  assert(!marketSrc.includes("withSearchFallback") && !marketSearchSrc.includes("withSearchFallback"), "FALLBACK J: Market Research does not import Source Resolution withSearchFallback");
  assert(importSrc.includes("createSourceResolutionSearch"), "FALLBACK J: Import Facts uses source-resolution fallback");
  const seenUrls: string[] = [];
  const isolated = createWebSearch(async (url) => {
    seenUrls.push(String(url));
    throw new FetchTimeoutError(String(url), 10);
  });
  try {
    await isolated.search("Joint Genesis");
  } catch {
    /* expected */
  }
  assert(seenUrls.some((url) => url.includes("duckduckgo.com")), "FALLBACK J: createWebSearch still uses DuckDuckGo");
  assert(!seenUrls.some((url) => url.includes("api.search.brave.com")), "FALLBACK J: createWebSearch does not call Brave");
  const research = await runMarketResearch({
    facts: emptyProductFacts("Joint Support Pro", "https://example.com/p", "IMPORTED"),
    searchWeb: async () => [],
  });
  assert(research.searchProvider.name !== "DUCKDUCKGO_HTML → BRAVE", "FALLBACK J: Market Research provider is not the fallback composite");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
