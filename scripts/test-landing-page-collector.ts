import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createLandingPageClient } from "../src/lib/market-discovery/landing-page-client.ts";
import { createLandingPageCollector } from "../src/lib/market-discovery/landing-page-collector.ts";
import { LANDING_PAGE_CONTEXT_MEMBERS } from "../src/lib/market-discovery/landing-page-context.ts";
import { LANDING_PAGE_COLLECTION_KEYS, LANDING_PAGE_SNAPSHOT_KEYS } from "../src/lib/market-discovery/landing-page-snapshot.ts";
import { LANDING_PAGE_ORIGINS, LANDING_PAGE_PROVENANCE, LANDING_PAGE_STATISTICS_KEYS, LANDING_PAGE_STATUSES, freezeDeepLandingPage } from "../src/lib/market-discovery/landing-page-types.ts";
import { createLandingPageValidator } from "../src/lib/market-discovery/landing-page-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

function resultOf(url: string, title: string, position: number) {
  return {
    title,
    url,
    description: `${title} line.`,
    position,
    sponsoredMarker: "marked",
    resultMetadata: "block",
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

function pageOf(url: string, html: string, over: Record<string, unknown> = {}) {
  return {
    destinationUrl: url,
    finalUrl: `${url}/final`,
    httpStatus: 200,
    headers: { "content-type": "text/html" },
    html,
    ...over,
  };
}

const two = "https://example.test/two";
const one = "https://example.test/one";
const htmlTwo = "<div>opaque page two</div>";
const htmlOne = "<section>opaque page one</section>";

function inputOf(over: Record<string, unknown> = {}) {
  return {
    sponsoredResults: [resultOf(two, "Later page", 2), resultOf(one, "Earlier page", 1)],
    pages: [pageOf(one, htmlOne), pageOf(two, htmlTwo)],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function collectorOf() {
  let n = 0;
  return createLandingPageCollector({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `collection-${++n}`,
  });
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

const validator = createLandingPageValidator();
check("statuses are OK and REJECTED", LANDING_PAGE_STATUSES.join() === "OK,REJECTED");
check("origin is COLLECTED and provenance is DIRECT_SOURCE", LANDING_PAGE_ORIGINS.join() === "COLLECTED" && LANDING_PAGE_PROVENANCE.join() === "DIRECT_SOURCE");
check("context members name sponsored results, pages, and metadata", LANDING_PAGE_CONTEXT_MEMBERS.join() === "sponsoredResults,pages,executionMetadata,runtimeMetadata,configuration");
check("page snapshot keys keep the addresses, status, headers, page text, and time", LANDING_PAGE_SNAPSHOT_KEYS.join() === "landingPageId,destinationUrl,finalUrl,httpStatus,headers,html,retrievedAt,origin,provenance,metadata");
check("collection keys keep the id, the page count, and the pages", LANDING_PAGE_COLLECTION_KEYS.join() === "collectionId,pageCount,pages,createdAt,origin,provenance,metadata");
check("statistics keys count pages and page text length", LANDING_PAGE_STATISTICS_KEYS.join() === "pageCount,htmlLength,issueCount,executionTime");
check("Missing Sponsored Results: a missing envelope is rejected", has(validator.validateInput(null), /Missing Sponsored Results/));
check("Invalid URL: a non-https destination is rejected", has(validator.validateUrl("ftp://example.test/two", "url"), /Invalid URL/));
check("Timeout: a timed out response is rejected", has(validator.validateInput(inputOf({ pages: [pageOf(one, htmlOne), pageOf(two, htmlTwo, { timedOut: true })] })), /Timeout/));
check("Redirect Loop: a repeated address is rejected", has(validator.validateInput(inputOf({ pages: [pageOf(one, htmlOne), pageOf(two, htmlTwo, { redirects: [`${two}/mid`, two], finalUrl: two })] })), /Redirect Loop/));
check("Empty Response: a blank page is rejected", has(validator.validateInput(inputOf({ pages: [pageOf(one, htmlOne), pageOf(two, " ")] })), /Empty Response/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Metadata/));

const source = inputOf();
const before = JSON.stringify(source);
const host = collectorOf();
const built = host.collect(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const rows = built.pages?.map((page) => page.destinationUrl).join("|");
check("sponsored destinations are collected", built.status === "OK" && built.snapshot !== null && built.pages !== null && built.statistics.pageCount === 2);
check("pages stay in the sponsored result order", rows === `${two}|${one}`);
check("final address, status, headers, and page text are copied", built.pages?.[0]?.finalUrl === `${two}/final` && built.pages[0].httpStatus === 200 && built.pages[0].headers["content-type"] === "text/html" && built.pages[0].html === htmlTwo);
check("page text is not interpreted", built.pages?.[0] !== undefined && !("title" in built.pages[0]) && built.statistics.htmlLength === htmlTwo.length + htmlOne.length);
check("the collection names the retrieval time and the run", built.snapshot?.collectionId === "collection-1" && built.snapshot.pageCount === 2 && built.pages?.[0]?.landingPageId === "collection-1-page-1" && built.pages[0].retrievedAt === "2026-01-01T00:00:00.000Z" && built.metadata.run === "r1" && built.snapshot.origin === "COLLECTED");
check("each stored page has exactly the requested fields", built.pages !== null && built.pages.every((page) => Object.keys(page).join() === LANDING_PAGE_SNAPSHOT_KEYS.join()));
check("getSnapshot returns the stored collection", host.getSnapshot("collection-1") === built.snapshot && host.getSnapshot("missing") === null);
check("an empty result list stores an empty collection", collectorOf().collect({ sponsoredResults: [], executionMetadata: { run: "r1" } }).pages?.length === 0);
check("the client copies the supplied response", createLandingPageClient().collect(resultOf(two, "Later page", 2) as never, pageOf(two, htmlTwo) as never, "2026-01-01T00:00:00.000Z").html === htmlTwo);
check("the client resolves a redirect chain to its last address", createLandingPageClient().collect(resultOf(two, "Later page", 2) as never, pageOf(two, htmlTwo, { redirects: [`${two}/mid`, `${two}/final`] }) as never, "2026-01-01T00:00:00.000Z").finalUrl === `${two}/final` && createLandingPageClient().collect(resultOf(two, "Later page", 2) as never, pageOf(two, htmlTwo, { redirects: [`${two}/mid`, `${two}/final`] }) as never, "2026-01-01T00:00:00.000Z").destinationUrl === two);

(source.pages[1] as { html: string }).html = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.collectionId as string) = "hacked";
  if (built.pages) (built.pages[0] as { html: string }).html = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the pages unchanged", before !== JSON.stringify(source) && built.pages?.[0]?.html === htmlTwo && built.metadata.run === "r1");
check("Immutable snapshot: the collection and pages cannot be assigned into", built.snapshot?.collectionId === "collection-1" && built.pages?.[0]?.html === htmlTwo && Object.isFrozen(built.snapshot) && Object.isFrozen(built.pages) && Object.isFrozen(built.pages?.[0]?.headers));
check("freeze helper returns the same value", freezeDeepLandingPage(built.snapshot) === built.snapshot);

const left = collectorOf();
const right = collectorOf();
left.collect(inputOf());
right.collect(null);
check("Independent collector: collectors do not share snapshots", left.getSnapshot("collection-1")?.pageCount === 2 && right.getSnapshot("collection-1") === null);
check("deterministic collection: a second collector matches the pages", collectorOf().collect(inputOf()).pages?.map((page) => `${page.destinationUrl}:${page.html}`).join("|") === built.pages?.map((page) => `${page.destinationUrl}:${page.html}`).join("|"));

const missing = collectorOf().collect(null);
check("a missing result list stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing Sponsored Results/) && missing.snapshot === null && missing.pages === null);
const badUrl = collectorOf().collect(inputOf({ sponsoredResults: [resultOf("ftp://example.test/two", "Later page", 2)] }));
check("an invalid url stores nothing", badUrl.status === "REJECTED" && has(badUrl.issues, /Invalid URL/) && badUrl.snapshot === null);
const timedOut = collectorOf().collect(inputOf({ pages: [pageOf(one, htmlOne), pageOf(two, htmlTwo, { timedOut: true })] }));
check("a timeout stores nothing", timedOut.status === "REJECTED" && has(timedOut.issues, /Timeout/) && timedOut.snapshot === null);
const looped = collectorOf().collect(inputOf({ pages: [pageOf(one, htmlOne), pageOf(two, htmlTwo, { redirects: [`${two}/mid`, two], finalUrl: two })] }));
check("a redirect loop stores nothing", looped.status === "REJECTED" && has(looped.issues, /Redirect Loop/) && looped.snapshot === null && looped.pages === null);
const empty = collectorOf().collect(inputOf({ pages: [pageOf(one, htmlOne), pageOf(two, " ")] }));
check("an empty response stores nothing", empty.status === "REJECTED" && has(empty.issues, /Empty Response/) && empty.snapshot === null && empty.pages === null);
const redirected = collectorOf().collect(inputOf({ pages: [pageOf(one, htmlOne), pageOf(two, htmlTwo, { redirects: [`${two}/mid`, `${two}/final`] })] }));
check("a redirect chain keeps the original address and the last address", redirected.status === "OK" && redirected.pages?.[0]?.destinationUrl === two && redirected.pages[0].finalUrl === `${two}/final` && redirected.pages[0].html === htmlTwo);
const nested = collectorOf().collect(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["landing-page-collector.ts", "landing-page-client.ts", "landing-page-validator.ts", "landing-page-types.ts", "landing-page-context.ts", "landing-page-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("six collector modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no markup reading, ordering, or model calls in code", !bare.some((line) => /\bparse\b|\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "landing-page-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the collector or the sponsored result contract", imports.every((from) => /^\.\/(landing-page-collector|landing-page-client|landing-page-validator|landing-page-types|landing-page-context|landing-page-snapshot|sponsored-types)$/.test(from)));
const earlier = readdirSync(dir).filter((file) => /^(google-search|google-serp|serp|sponsored)-[a-z]+\.ts$/.test(file));
check("earlier market discovery modules do not import the collector", earlier.every((file) => !/from ["']\.\/landing-page-/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the landing page collector`, !sources.some((file) => /market-discovery|landing-page-collector/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`LANDING_PAGE_COLLECTOR_FAILURES=${failures}`);
  process.exit(1);
}
console.log("LANDING_PAGE_COLLECTOR_FAILURES=0");
