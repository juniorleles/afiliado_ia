import { emptyProductFacts } from "../src/lib/product-facts.ts";
import {
  classifyMarketSource,
  classifyMarketSourceDetailed,
} from "../src/lib/market-research/classify.ts";
import { decodeMarketHtml } from "../src/lib/market-research/html.ts";
import { flattenMarketQueries, takeBalancedQueries } from "../src/lib/market-research/queries.ts";
import { familyCoverageFromOutcomes } from "../src/lib/market-research/quality.ts";
import { runMarketResearch } from "../src/lib/market-research/research.ts";
import { SearchAbortedError, SearchHttpError, SearchParseError, SearchTimeoutError } from "../src/lib/source-resolution/search.ts";
import type { QueryFamilyId } from "../src/lib/market-research/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function sampleFacts() {
  const facts = emptyProductFacts("Sample Formula Plus", "https://merchant.example/sfp", "IMPORTED");
  facts.description = "Glucosamine joint supplement.";
  facts.features = ["Supports joint flexibility"];
  facts.ingredientsOrComponents = ["Glucosamine"];
  facts.confidence.description = "DIRECT_SOURCE";
  facts.confidence.features = "DIRECT_SOURCE";
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  return facts;
}

function hit(url: string, title: string, snippet = "Observable discussion") {
  return { url, title, snippet };
}

async function main() {
  const facts = sampleFacts();

  const success = await runMarketResearch({
    facts,
    now: new Date("2026-09-20T18:00:00.000Z"),
    searchWeb: async () => [hit("https://www.healthline.com/sample-formula-plus", "Sample Formula Plus buying guide", "ingredients worth it")],
  });
  const successRow = success.queryOutcomes[0];
  assert(successRow?.status === "SUCCESS", "TEST A: STATUS=SUCCESS");
  assert(typeof successRow?.durationMs === "number" && successRow.durationMs >= 0, "TEST A: durationMs registered");
  assert((successRow?.rawHits || 0) >= 1, "TEST A: rawHits registered");
  assert(success.queryOutcomes.every((row) => row.status !== ("UNKNOWN_NOT_RECORDED" as string)), "TEST A: no UNKNOWN_NOT_RECORDED");
  assert(success.queryOutcomes.some((row) => row.usableHits >= 1), "TEST A: usableHits registered");

  const empty = await runMarketResearch({
    facts,
    searchWeb: async () => [],
  });
  assert(empty.queryOutcomes.length > 0, "TEST B: every executed query has an outcome");
  assert(
    empty.queryOutcomes.every((row) => row.status === "SUCCESS_EMPTY"),
    "TEST B: empty search is SUCCESS_EMPTY",
  );
  assert(
    empty.queryOutcomes.every((row) => row.rawHits === 0 && row.usableHits === 0),
    "TEST B: empty search has zero hits",
  );

  const timeout = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchTimeoutError(query, 10_000);
    },
  });
  assert(
    timeout.queryOutcomes.every((row) => row.status === "SEARCH_TIMEOUT"),
    "TEST C: provider timeout is SEARCH_TIMEOUT",
  );
  assert(
    !timeout.queryOutcomes.some((row) => row.status === "SUCCESS_EMPTY"),
    "TEST C: timeout is never SUCCESS_EMPTY",
  );

  const httpErr = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchHttpError(query, 403);
    },
  });
  assert(httpErr.queryOutcomes.every((row) => row.status === "HTTP_ERROR"), "TEST D: HTTP_ERROR");

  const parseErr = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchParseError(query);
    },
  });
  assert(parseErr.queryOutcomes.every((row) => row.status === "PARSE_ERROR"), "TEST E: PARSE_ERROR");

  const preAbort = new AbortController();
  preAbort.abort();
  let preCalls = 0;
  const aborted = await runMarketResearch({
    facts,
    signal: preAbort.signal,
    searchWeb: async () => {
      preCalls += 1;
      return [];
    },
  });
  assert(preCalls === 0, "TEST F: no query search started after global abort");
  assert(aborted.queryOutcomes.every((row) => row.status === "ABORTED"), "TEST F: ABORTED");
  assert(aborted.queryOutcomes.length === flattenMarketQueries(facts).length, "TEST F: aborted queries still recorded");

  const midAbort = new AbortController();
  let midCalls = 0;
  const mid = await runMarketResearch({
    facts,
    signal: midAbort.signal,
    searchWeb: async (query) => {
      midCalls += 1;
      midAbort.abort();
      throw new SearchAbortedError(query);
    },
  });
  assert(midCalls < flattenMarketQueries(facts).length, "TEST F: in-flight abort does not start remaining queries");
  assert(mid.queryOutcomes.some((row) => row.status === "ABORTED"), "TEST F: mid-run abort records ABORTED");

  assert(
    classifyMarketSource({
      url: "https://example.com/shop/sample-product",
      productName: "Sample Product",
      title: "Sample Product",
    }) === "SELLER",
    "TEST G: /shop/ path without brand identity is SELLER",
  );
  assert(
    classifyMarketSource({
      url: "https://example.com/store/sample-product",
      productName: "Sample Product",
    }) === "SELLER",
    "TEST G: /store/ path is SELLER",
  );
  assert(
    classifyMarketSourceDetailed({
      url: "https://news.example.org/articles/guide?ref=/product/sample",
      productName: "Sample Product",
      title: "Honest analysis: is Sample Product worth it?",
    }).classification !== "SELLER",
    "TEST G: /product/ in query string is not seller evidence",
  );

  assert(
    classifyMarketSource({
      url: "https://random-host.example/offer",
      productName: "Sample Product",
      title: "Sample Product | Official Website",
    }) === "SELLER",
    "TEST H: Official Website without brand identity is SELLER",
  );
  assert(
    classifyMarketSource({
      url: "https://random-host.example/offer",
      productName: "Sample Product",
      title: "Sample Product | Official Website",
    }) !== "BRAND",
    "TEST H: Official Website is never BRAND",
  );

  assert(
    classifyMarketSource({
      url: "https://news.example.org/articles/sample-formula-review",
      productName: "Sample Formula Plus",
      title: "Honest analysis: is Sample Formula Plus worth it?",
    }) === "EDITORIAL",
    "TEST I: article/review page with editorial signals is EDITORIAL",
  );

  assert(
    classifyMarketSource({
      url: "https://merchant.example/shop/sample-product",
      productName: "Sample Product",
      title: "Our Product Review | Official Website",
    }) === "SELLER",
    "TEST J: seller page containing review stays SELLER",
  );
  assert(
    classifyMarketSource({
      url: "https://merchant.example/",
      productName: "Sample Product",
      title: "Sample Product Review",
    }) !== "EDITORIAL",
    "TEST J: the word review alone is not EDITORIAL",
  );

  assert(decodeMarketHtml("Brand&#x27;s Product Review") === "Brand's Product Review", "TEST K: numeric hex entity decoded");
  assert(decodeMarketHtml("Brand&apos;s Product Review") === "Brand's Product Review", "TEST K: named entity decoded");
  assert(decodeMarketHtml("A &quot;quoted&quot; title") === 'A "quoted" title', "TEST K: named quot decoded");
  const encoded = await runMarketResearch({
    facts,
    searchWeb: async () => [
      hit("https://www.healthline.com/encoded", "Brand&#x27;s Product Review", "snippet"),
    ],
  });
  assert(
    encoded.sources.every((source) => !/&#/.test(source.title) && source.title.includes("Brand's")),
    "TEST K: decoded title reaches research output",
  );

  const synthetic: Array<{ family: QueryFamilyId; queries: string[] }> = [
    { family: "PRODUCT", queries: ["p1", "p2", "p3"] },
    { family: "PURCHASE_INTENT", queries: ["u1", "u2", "u3"] },
    { family: "CATEGORY_INTENT", queries: ["c1", "c2", "c3"] },
    { family: "QUESTIONS_OBJECTIONS", queries: ["q1", "q2", "q3"] },
  ];
  const four = takeBalancedQueries(synthetic, 4);
  assert(four.length === 4, "TEST L: maxQueries=4 returns 4 queries");
  assert(new Set(four.map((item) => item.family)).size === 4, "TEST L: at least one query from each family");

  const ten = takeBalancedQueries(synthetic, 10);
  assert(ten.length === 10, "TEST M: maxQueries=10 returns 10 queries");
  assert(
    ten.slice(0, 4).map((item) => item.family).join(",") ===
      "PRODUCT,PURCHASE_INTENT,CATEGORY_INTENT,QUESTIONS_OBJECTIONS",
    "TEST M: first slots are distributed across families before extras",
  );
  const liveTen = flattenMarketQueries(facts, 10);
  assert(new Set(liveTen.map((item) => item.family)).size === 4, "TEST M: live ProductFacts flatten covers four families");

  const before = JSON.stringify(facts);
  await runMarketResearch({
    facts,
    searchWeb: async () => [hit("https://www.webmd.com/x", "Sample Formula Plus review", "worth it")],
  });
  assert(JSON.stringify(facts) === before, "TEST N: ProductFacts before === after");

  const mixed = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      if (query === facts.productName) throw new SearchTimeoutError(query, 5);
      if (/worth it/i.test(query)) return [];
      return [hit(`https://www.healthline.com/${encodeURIComponent(query)}`, `${query} buying guide`, "worth it")];
    },
  });
  const timeoutRow = mixed.queryOutcomes.find((row) => row.query === facts.productName);
  const emptyRow = mixed.queryOutcomes.find((row) => /worth it/i.test(row.query));
  assert(timeoutRow?.status === "SEARCH_TIMEOUT", "mixed run preserves SEARCH_TIMEOUT on one query");
  assert(emptyRow?.status === "SUCCESS_EMPTY", "mixed run preserves SUCCESS_EMPTY on another query");
  assert(mixed.queryOutcomes.some((row) => row.status === "SUCCESS"), "mixed run continues after a failed query");
  const coverage = familyCoverageFromOutcomes(mixed.queryOutcomes);
  assert(coverage.PRODUCT === "FAILED" || coverage.PRODUCT === "COVERED" || coverage.PRODUCT === "EXECUTED_NO_USABLE", "family coverage is explicit");

  let braveCalls = 0;
  const ddgHit = hit("https://www.healthline.com/ddg-success", "Sample Formula Plus buying guide", "worth it");
  const braveHit = hit("https://www.webmd.com/brave-success", "Honest analysis: is Sample Formula Plus worth it?", "review");

  const testO = await runMarketResearch({
    facts,
    searchWeb: async () => [ddgHit],
    fallbackSearch: async () => {
      braveCalls += 1;
      return [braveHit];
    },
  });
  assert(
    testO.queryOutcomes.every((row) => !row.providerAttempts.some((item) => item.provider === "BRAVE" && item.status !== "BRAVE_NOT_CONFIGURED")),
    "TEST O: BRAVE_CALLS=0 on DDG SUCCESS",
  );
  assert(braveCalls === 0, "TEST O: fallback function not invoked");
  assert(testO.queryOutcomes.every((row) => row.providerUsed === "DUCKDUCKGO_HTML"), "TEST O: FINAL_PROVIDER=DDG");
  assert(testO.queryOutcomes.every((row) => row.status === "SUCCESS"), "TEST O: FINAL_STATUS=SUCCESS");

  braveCalls = 0;
  const testP = await runMarketResearch({
    facts,
    searchWeb: async () => [],
    fallbackSearch: async () => {
      braveCalls += 1;
      return [braveHit];
    },
  });
  assert(braveCalls === 0, "TEST P: SUCCESS_EMPTY does not call Brave");
  assert(testP.queryOutcomes.every((row) => row.status === "SUCCESS_EMPTY"), "TEST P: FINAL_STATUS=SUCCESS_EMPTY");
  assert(testP.queryOutcomes.every((row) => row.providerUsed === "DUCKDUCKGO_HTML"), "TEST P: empty stays on DDG");

  braveCalls = 0;
  const testQ = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchTimeoutError(query, 10_000);
    },
    fallbackSearch: async () => {
      braveCalls += 1;
      return [braveHit];
    },
  });
  const qRow = testQ.queryOutcomes[0]!;
  assert(qRow.providerAttempts[0]?.status === "SEARCH_TIMEOUT", "TEST Q: DDG attempt=SEARCH_TIMEOUT");
  assert(qRow.providerAttempts[1]?.provider === "BRAVE" && qRow.providerAttempts[1]?.status === "SUCCESS", "TEST Q: BRAVE attempt=SUCCESS");
  assert(qRow.providerUsed === "BRAVE", "TEST Q: FINAL_PROVIDER=BRAVE");
  assert(qRow.status === "SUCCESS", "TEST Q: FINAL_STATUS=SUCCESS");
  assert(braveCalls === flattenMarketQueries(facts).length, "TEST Q: one Brave call per executed query");

  braveCalls = 0;
  const testR = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchHttpError(query, 403);
    },
    fallbackSearch: async () => {
      braveCalls += 1;
      return [braveHit];
    },
  });
  assert(braveCalls === flattenMarketQueries(facts).length, "TEST R: BRAVE_CALLS=1 per query");
  assert(testR.queryOutcomes.every((row) => row.providerUsed === "BRAVE"), "TEST R: FINAL_PROVIDER=BRAVE");
  assert(testR.queryOutcomes.every((row) => row.status === "SUCCESS"), "TEST R: FINAL_STATUS=SUCCESS");

  braveCalls = 0;
  await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchParseError(query);
    },
    fallbackSearch: async () => {
      braveCalls += 1;
      return [braveHit];
    },
  });
  assert(braveCalls === flattenMarketQueries(facts).length, "TEST S: PARSE_ERROR calls Brave once per query");

  braveCalls = 0;
  const abort = new AbortController();
  abort.abort();
  const testT = await runMarketResearch({
    facts,
    signal: abort.signal,
    searchWeb: async () => [ddgHit],
    fallbackSearch: async () => {
      braveCalls += 1;
      return [braveHit];
    },
  });
  assert(braveCalls === 0, "TEST T: ABORT does not call Brave");
  assert(testT.queryOutcomes.every((row) => row.status === "ABORTED"), "TEST T: FINAL_STATUS=ABORTED");

  braveCalls = 0;
  const testU = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchHttpError(query, 500);
    },
    fallbackSearch: async (query) => {
      braveCalls += 1;
      throw new SearchHttpError(query, 502);
    },
  });
  const uRow = testU.queryOutcomes[0]!;
  assert(uRow.providerAttempts.some((item) => item.provider === "DUCKDUCKGO_HTML" && item.status === "HTTP_ERROR"), "TEST U: DDG HTTP_ERROR preserved");
  assert(uRow.providerAttempts.some((item) => item.provider === "BRAVE" && item.status === "HTTP_ERROR"), "TEST U: Brave HTTP_ERROR recorded");
  assert(uRow.status === "HTTP_ERROR", "TEST U: FINAL_STATUS=HTTP_ERROR");
  assert(braveCalls === flattenMarketQueries(facts).length, "TEST U: Brave called once per query");

  braveCalls = 0;
  const testV = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchHttpError(query, 403);
    },
    fallbackSearch: async () => {
      braveCalls += 1;
      return [];
    },
  });
  assert(testV.queryOutcomes.every((row) => row.status === "SUCCESS_EMPTY"), "TEST V: FINAL_STATUS=SUCCESS_EMPTY");
  assert(braveCalls === flattenMarketQueries(facts).length, "TEST V: BRAVE_CALLS=1");

  const testW = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchHttpError(query, 403);
    },
    fallbackConfigured: false,
  });
  assert(testW.queryOutcomes.every((row) => row.status === "HTTP_ERROR"), "TEST W: no crash; final HTTP_ERROR");
  assert(
    testW.queryOutcomes.every((row) => row.providerAttempts.some((item) => item.status === "BRAVE_NOT_CONFIGURED")),
    "TEST W: BRAVE_NOT_CONFIGURED is observable",
  );

  braveCalls = 0;
  const testX = await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      if (query === facts.productName) return [ddgHit];
      throw new SearchHttpError(query, 403);
    },
    fallbackSearch: async () => {
      braveCalls += 1;
      return [hit("https://www.webmd.com/" + Math.random().toString(16).slice(2), "Honest analysis: is Sample Formula Plus worth it?", "review")];
    },
  });
  assert(testX.queryOutcomes.some((row) => row.providerUsed === "DUCKDUCKGO_HTML" && row.status === "SUCCESS"), "TEST X: some queries stay on DDG");
  assert(testX.queryOutcomes.some((row) => row.providerUsed === "BRAVE" && row.status === "SUCCESS"), "TEST X: failed DDG queries use Brave");
  assert(testX.sources.some((source) => source.discoveredByProvider === "DUCKDUCKGO_HTML"), "TEST X: DDG hits enter the same pipeline");
  assert(testX.sources.some((source) => source.discoveredByProvider === "BRAVE"), "TEST X: Brave hits enter the same pipeline");
  assert(braveCalls >= 1, "TEST X: Brave used only after DDG failure");

  const beforeY = JSON.stringify(facts);
  await runMarketResearch({
    facts,
    searchWeb: async (query) => {
      throw new SearchHttpError(query, 403);
    },
    fallbackSearch: async () => [braveHit],
  });
  assert(JSON.stringify(facts) === beforeY, "TEST Y: ProductFacts before === after with Brave fallback");

  const forumPath = classifyMarketSourceDetailed({
    url: "https://example.com/forum/threads/product-review",
    productName: "Sample Product",
    title: "Sample Product Review",
  });
  assert(forumPath.classification === "FORUM/COMMUNITY", "TEST AA: /forum/threads/ is FORUM/COMMUNITY");
  assert(forumPath.reason === "forum-path", "TEST AA: forum structure is the reason");

  const editorialForum = classifyMarketSourceDetailed({
    url: "https://www.healthline.com/forum/threads/sample-product-review",
    productName: "Sample Product",
    title: "Sample Product Review | Honest Review",
  });
  assert(editorialForum.classification === "FORUM/COMMUNITY", "TEST AB: editorial host with forum path is FORUM/COMMUNITY");
  assert(editorialForum.reason === "forum-path", "TEST AB: forum path overrides editorial host");

  const pressGeneric = classifyMarketSourceDetailed({
    url: "https://news-example.com/press-release/product-launch",
    productName: "Sample Product",
    title: "Sample Product Launch",
  });
  assert(pressGeneric.classification !== "EDITORIAL", "TEST AC: press-release path is not EDITORIAL from host");
  assert(pressGeneric.classification === "OTHER", "TEST AC: press-release path is OTHER");
  const pressOnPublisher = classifyMarketSourceDetailed({
    url: "https://www.nytimes.com/press-release/product-launch",
    productName: "Sample Product",
    title: "Sample Product Reviews: Does It Actually Work?",
  });
  assert(pressOnPublisher.classification === "OTHER", "TEST AC: publisher host press-release is OTHER");
  assert(pressOnPublisher.reason === "press-release-path", "TEST AC: press-release structure is the reason");

  assert(
    classifyMarketSource({
      url: "https://www.healthline.com/health/joint-supplements",
      productName: "Sample Product",
      title: "Joint Supplements: 9 Options for Joint Pain",
    }) === "EDITORIAL",
    "TEST AD: genuine editorial article path stays EDITORIAL",
  );

  assert(
    classifyMarketSource({
      url: "https://merchant.example/shop/product",
      productName: "Sample Product",
      title: "Sample Product",
    }) === "SELLER",
    "TEST AE: /shop/product stays SELLER",
  );

  assert(
    classifyMarketSource({
      url: "https://random-host.example/home",
      productName: "Sample Product",
      title: "Sample Product | Official Website",
    }) === "SELLER",
    "TEST AF: Official Website without brand identity is SELLER",
  );
  assert(
    classifyMarketSource({
      url: "https://random-host.example/home",
      productName: "Sample Product",
      title: "Sample Product | Official Website",
    }) !== "BRAND",
    "TEST AF: Official Website is never BRAND",
  );

  console.log("\nMarket research quality/observability tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
