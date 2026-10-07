import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REAL_LANDING_PAGE_CONTEXT_MEMBERS } from "../src/lib/real-landing-page/landing-page-context.ts";
import type { LandingPageHttpResult } from "../src/lib/real-landing-page/landing-page-http-client.ts";
import { createLandingPageHttpClient } from "../src/lib/real-landing-page/landing-page-http-client.ts";
import {
  REAL_LANDING_PAGE_KEYS,
  REAL_LANDING_PAGE_ORIGINS,
  REAL_LANDING_PAGE_PROVENANCE,
  REAL_LANDING_PAGE_RESULT_KEYS,
  REAL_LANDING_PAGE_SESSION_KEYS,
  REAL_LANDING_PAGE_STATISTICS_KEYS,
  REAL_LANDING_PAGE_STATUSES,
} from "../src/lib/real-landing-page/landing-page-response.ts";
import { createRealLandingPageSession } from "../src/lib/real-landing-page/landing-page-session.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const HTML = `<html><body><span data-field="productName">Zebra Offer</span>opaque-page-marker</body></html>`;

function sponsored(url: string) {
  return {
    title: "Listed block",
    url,
    description: "A listed page.",
    position: 1,
    sponsoredMarker: "top",
    resultMetadata: null,
    origin: "OBSERVED" as const,
    provenance: "DIRECT_SOURCE" as const,
  };
}

function httpResult(over: Partial<LandingPageHttpResult> = {}): LandingPageHttpResult {
  return {
    httpStatus: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    bodyText: HTML,
    timedOut: false,
    tooLarge: false,
    ...over,
  };
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

function sessionFor(handler: (url: string) => LandingPageHttpResult | Promise<LandingPageHttpResult>, calls: string[] = [], extra: { maxBytes?: number; maxRedirects?: number; idFactory?: () => string } = {}) {
  let tick = 0;
  const client = createLandingPageHttpClient({
    transport: async (url) => {
      calls.push(url);
      return handler(url);
    },
  });
  return createRealLandingPageSession({
    now: () => tick++,
    timestamp: () => T0,
    client,
    maxBytes: extra.maxBytes,
    maxRedirects: extra.maxRedirects,
    idFactory: extra.idFactory,
  });
}

async function main() {
  check("statuses are OK and REJECTED", REAL_LANDING_PAGE_STATUSES.join() === "OK,REJECTED");
  check("origin is COLLECTED and provenance is DIRECT_SOURCE", REAL_LANDING_PAGE_ORIGINS.join() === "COLLECTED" && REAL_LANDING_PAGE_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the sponsored results", REAL_LANDING_PAGE_CONTEXT_MEMBERS.join() === "sponsoredResults,maxPages,maxRequests,executionMetadata,runtimeMetadata,configuration");

  const calls: string[] = [];
  const input = {
    sponsoredResults: [sponsored("https://example.test/buy")],
    executionMetadata: { note: "kept" },
  };
  const session = sessionFor(() => httpResult(), calls);
  const built = await session.collect(input);
  const page = built.pages?.[0];
  input.sponsoredResults[0].url = "https://example.test/changed";
  input.executionMetadata.note = "changed";
  check(
    "one destination becomes a frozen landing page snapshot",
    built.status === "OK" &&
      page !== undefined &&
      page.originalUrl === "https://example.test/buy" &&
      page.finalUrl === "https://example.test/buy" &&
      page.redirectChain.join() === "https://example.test/buy" &&
      page.httpStatus === 200 &&
      page.headers["content-type"] === "text/html; charset=utf-8" &&
      page.html === HTML &&
      page.responseBytes === Buffer.byteLength(HTML) &&
      page.responseTime >= 0 &&
      built.statistics.requestCount === 1 &&
      built.statistics.pageCount === 1 &&
      calls.length === 1 &&
      !("productName" in page),
  );
  check(
    "the snapshot is stored and later input changes leave it unchanged",
    built.snapshot !== null &&
      session.getSnapshot("landing-session-1") === built.snapshot &&
      Object.isFrozen(built.snapshot) &&
      Object.isFrozen(page) &&
      built.snapshot?.context.urls[0] === "https://example.test/buy" &&
      built.snapshot?.metadata.note === "kept" &&
      Object.keys(built).join() === REAL_LANDING_PAGE_RESULT_KEYS.join() &&
      Object.keys(built.statistics).join() === REAL_LANDING_PAGE_STATISTICS_KEYS.join() &&
      Object.keys(built.snapshot ?? {}).join() === REAL_LANDING_PAGE_SESSION_KEYS.join() &&
      Object.keys(page ?? {}).join() === REAL_LANDING_PAGE_KEYS.join(),
  );

  const again = sessionFor(() => httpResult());
  const second = await again.collect({ sponsoredResults: [sponsored("https://example.test/buy")] });
  check("an independent collector keeps its own snapshot", second.status === "OK" && second.pages?.[0]?.html === HTML && second.snapshot !== built.snapshot && again.getSnapshot("landing-session-1") !== session.getSnapshot("landing-session-1"));

  const redirectCalls: string[] = [];
  const redirected = await sessionFor((url) => {
    if (url === "https://example.test/a") return httpResult({ httpStatus: 302, headers: { location: "/b" }, bodyText: "" });
    return httpResult();
  }, redirectCalls).collect({ sponsoredResults: [sponsored("https://example.test/a")] });
  check(
    "a redirect chain records the original address, the final address, and each hop",
    redirected.status === "OK" &&
      redirected.pages?.[0]?.originalUrl === "https://example.test/a" &&
      redirected.pages[0].finalUrl === "https://example.test/b" &&
      redirected.pages[0].redirectChain.join() === "https://example.test/a,https://example.test/b" &&
      redirected.statistics.requestCount === 2 &&
      redirectCalls.length === 2,
  );

  const invalidCalls: string[] = [];
  const invalid = await sessionFor(() => httpResult(), invalidCalls).collect({ sponsoredResults: [sponsored("http://example.test/buy")] });
  check("an invalid URL makes no request", invalid.status === "REJECTED" && has(invalid.issues, /Invalid URL/) && invalid.snapshot === null && invalidCalls.length === 0 && invalid.statistics.requestCount === 0);

  const timeoutCalls: string[] = [];
  const timedOut = await sessionFor(() => httpResult({ timedOut: true }), timeoutCalls).collect({
    sponsoredResults: [sponsored("https://example.test/slow"), sponsored("https://example.test/next")],
  });
  check("a timeout stops the collection", timedOut.status === "REJECTED" && has(timedOut.issues, /Timeout/) && timedOut.snapshot === null && timeoutCalls.length === 1);

  const loopCalls: string[] = [];
  const loop = await sessionFor((url) => {
    const location = url.endsWith("/a") ? "https://example.test/b" : "https://example.test/a";
    return httpResult({ httpStatus: 302, headers: { location }, bodyText: "" });
  }, loopCalls).collect({ sponsoredResults: [sponsored("https://example.test/a")] });
  check("a redirect loop stores nothing", loop.status === "REJECTED" && has(loop.issues, /Redirect Loop/) && loop.snapshot === null && loopCalls.length === 2);

  const typed = await sessionFor(() => httpResult({ headers: { "content-type": "application/json" }, bodyText: "{}" })).collect({
    sponsoredResults: [sponsored("https://example.test/buy")],
  });
  check("an unsupported content type stores nothing", typed.status === "REJECTED" && has(typed.issues, /Unsupported Content-Type/) && typed.snapshot === null && typed.pages === null);

  const oversized = await sessionFor(() => httpResult({ bodyText: "0123456789" }), [], { maxBytes: 8 }).collect({
    sponsoredResults: [sponsored("https://example.test/buy")],
  });
  check("a response that is too large stores nothing", oversized.status === "REJECTED" && has(oversized.issues, /Response Too Large/) && oversized.snapshot === null);

  const capped: string[] = [];
  const limited = await sessionFor(() => httpResult(), capped).collect({
    sponsoredResults: [sponsored("https://example.test/one"), sponsored("https://example.test/two")],
    maxPages: 1,
    maxRequests: 3,
  });
  check("maxPages retrieves only the requested number of destinations", limited.status === "OK" && limited.pages?.length === 1 && limited.statistics.requestCount === 1 && capped.length === 1 && capped[0] === "https://example.test/one");

  const budgetCalls: string[] = [];
  const budget = await sessionFor((url) => {
    if (url === "https://example.test/a") return httpResult({ httpStatus: 302, headers: { location: "https://example.test/b" }, bodyText: "" });
    return httpResult();
  }, budgetCalls).collect({ sponsoredResults: [sponsored("https://example.test/a")], maxRequests: 1 });
  check("the request limit stops before another HTTP request", budget.status === "REJECTED" && has(budget.issues, /request limit/) && budget.snapshot === null && budgetCalls.length === 1 && budget.statistics.requestCount === 1);

  const empty = await sessionFor(() => httpResult()).collect({ sponsoredResults: [] });
  check("an empty sponsored list stores an empty collection", empty.status === "OK" && empty.pages?.length === 0 && empty.statistics.requestCount === 0 && empty.snapshot !== null);

  const missing = await sessionFor(() => httpResult()).collect({ keyword: "zebra offer" });
  check("a missing sponsored list runs no request", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.snapshot === null);

  const nested = await sessionFor(() => httpResult()).collect({ sponsoredResults: [], configuration: { nested: { inner: true } } });
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

  const badCalls: string[] = [];
  const badId = await sessionFor(() => httpResult(), badCalls, { idFactory: () => "BAD" }).collect({ sponsoredResults: [sponsored("https://example.test/buy")] });
  check("a corrupted session id stores nothing after the retrieval", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && badCalls.length === 1);

  const dir = join(process.cwd(), "src/lib/real-landing-page");
  const names = [
    "landing-page-http-client.ts",
    "landing-page-fetcher.ts",
    "landing-page-validator.ts",
    "landing-page-response.ts",
    "landing-page-context.ts",
    "landing-page-session.ts",
  ];
  check("six landing page modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const files = names.map((name) => join(dir, name));
  const bundled = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  const client = readFileSync(join(dir, "landing-page-http-client.ts"), "utf8");
  const others = files.filter((file) => !file.endsWith("landing-page-http-client.ts")).map((file) => readFileSync(file, "utf8")).join("\n");
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("only the HTTP client opens a request", /fetch\(/.test(client) && /redirect:\s*"manual"/.test(client) && !/fetch\(/.test(others));
  check("the collector does not read markup or name a product", !/\bparse\b|DOMParser|cheerio|product-identifier|productName|organic_results|searchapi\.io|process\.env/i.test(code.join("\n")));
  check("no ordering, model calls, or outside catalogs in code", !code.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|product-intelligence|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "landing-page-context.ts"), "utf8")));
  const market = listTs(join(process.cwd(), "src/lib/market-discovery"));
  check("Market Discovery does not import the real collector", !market.some((file) => /real-landing-page/.test(readFileSync(file, "utf8"))));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "search-intelligence", "search-provider"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the real collector`, !sources.some((file) => /real-landing-page/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`REAL_LANDING_PAGE_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("REAL_LANDING_PAGE_FAILURES=0");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "real landing page collector test failed");
  process.exit(1);
});
