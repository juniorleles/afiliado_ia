import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleSearchClient, SEARCH_ENDPOINT } from "../src/lib/market-discovery/google-search-client.ts";
import { SEARCH_CONTEXT_MEMBERS } from "../src/lib/market-discovery/google-search-context.ts";
import { createGoogleSearchConnector } from "../src/lib/market-discovery/google-search-connector.ts";
import { SEARCH_SNAPSHOT_KEYS } from "../src/lib/market-discovery/google-search-snapshot.ts";
import { SEARCH_DEVICES, SEARCH_ORIGINS, SEARCH_PROVENANCE, SEARCH_STATISTICS_KEYS, SEARCH_STATUSES, freezeDeepSearch } from "../src/lib/market-discovery/google-search-types.ts";
import { createGoogleSearchValidator } from "../src/lib/market-discovery/google-search-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

function inputOf(over: Record<string, unknown> = {}) {
  return {
    keyword: "alpha offer",
    language: "en",
    country: "US",
    device: "desktop",
    market: "north",
    searchHtml: "<div>opaque page</div>",
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function connectorOf() {
  let n = 0;
  return createGoogleSearchConnector({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `snapshot-${++n}`,
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

const validator = createGoogleSearchValidator();
check("statuses are OK and REJECTED", SEARCH_STATUSES.join() === "OK,REJECTED");
check("origin is COLLECTED and provenance is DIRECT_SOURCE", SEARCH_ORIGINS.join() === "COLLECTED" && SEARCH_PROVENANCE.join() === "DIRECT_SOURCE");
check("devices are desktop, mobile, and tablet", SEARCH_DEVICES.join() === "desktop,mobile,tablet");
check("context members name the keyword, locale, device, market, and page", SEARCH_CONTEXT_MEMBERS.join() === "keyword,language,country,device,market,searchHtml,executionMetadata,runtimeMetadata,configuration");
check("snapshot keys keep the query, address, page, and collection time", SEARCH_SNAPSHOT_KEYS.join() === "snapshotId,query,language,country,device,market,searchUrl,html,collectedAt,origin,provenance,metadata");
check("statistics keys count the collection and the page length", SEARCH_STATISTICS_KEYS.join() === "collectionCount,htmlLength,issueCount,executionTime");
check("Empty Keyword: a blank keyword is rejected", has(validator.validateKeyword({ keyword: "   " }), /Empty Keyword/));
check("Invalid Locale: a bad language, country, or market is rejected", has(validator.validateLocale({ language: "EN", country: "US", market: "north" }), /Invalid Locale/) && has(validator.validateLocale({ language: "en", country: "usa", market: "north" }), /Invalid Locale/) && has(validator.validateLocale({ language: "en", country: "US", market: "North" }), /Invalid Locale/));
check("Invalid Device: an unknown device is rejected", has(validator.validateDevice({ device: "phone" }), /Invalid Device/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Metadata/));

const source = inputOf();
const before = JSON.stringify(source);
const connector = connectorOf();
const built = connector.collect(source);
const expectedUrl = `${SEARCH_ENDPOINT}?q=alpha+offer&hl=en&gl=us&device=desktop`;
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
check("a supplied page is collected", built.status === "OK" && built.snapshot !== null && built.statistics.collectionCount === 1);
check("the query, locale, device, and market are restated", built.snapshot?.query === "alpha offer" && built.snapshot.language === "en" && built.snapshot.country === "US" && built.snapshot.device === "desktop" && built.snapshot.market === "north");
check("the search address is normalized from the query", built.snapshot?.searchUrl === expectedUrl);
check("the page text is copied and not interpreted", built.snapshot?.html === "<div>opaque page</div>" && built.statistics.htmlLength === "<div>opaque page</div>".length);
check("metadata and the collection time are restated", built.metadata.run === "r1" && built.snapshot?.collectedAt === "2026-01-01T00:00:00.000Z" && built.snapshot.origin === "COLLECTED" && built.snapshot.provenance === "DIRECT_SOURCE");
check("the snapshot has exactly the requested fields", built.snapshot !== null && Object.keys(built.snapshot).join() === SEARCH_SNAPSHOT_KEYS.join());
check("getSnapshot returns the stored snapshot", connector.getSnapshot("snapshot-1") === built.snapshot && connector.getSnapshot("missing") === null);

const opaque = connectorOf().collect(inputOf({ searchHtml: "<section>sponsored result and organic result for a product</section>" }));
check("page text that names listings is stored whole", opaque.snapshot?.html === "<section>sponsored result and organic result for a product</section>" && !("listings" in (opaque.snapshot ?? {})));
check("an empty page is still a collection", connectorOf().collect(inputOf({ searchHtml: "" })).snapshot?.html === "");
check("mobile and tablet are accepted", connectorOf().collect(inputOf({ device: "mobile" })).snapshot?.device === "mobile" && connectorOf().collect(inputOf({ device: "tablet" })).snapshot?.searchUrl.endsWith("device=tablet") === true);
check("the client builds the same address", createGoogleSearchClient().collect(inputOf() as never, "2026-01-01T00:00:00.000Z").searchUrl === expectedUrl);

source.searchHtml = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.html as string) = "hacked";
  if (built.snapshot) (built.snapshot.query as string) = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the snapshot unchanged", before !== JSON.stringify(source) && built.snapshot?.html === "<div>opaque page</div>" && built.metadata.run === "r1" && built.snapshot.query === "alpha offer");
check("Immutable snapshot: the snapshot cannot be assigned into", built.snapshot?.html === "<div>opaque page</div>" && Object.isFrozen(built.snapshot) && Object.isFrozen(built.snapshot.metadata));
check("freeze helper returns the same value", freezeDeepSearch(built.snapshot) === built.snapshot);

const left = connectorOf();
const right = connectorOf();
left.collect(inputOf());
right.collect(null);
check("Independent connector: connectors do not share snapshots", left.getSnapshot("snapshot-1")?.query === "alpha offer" && right.getSnapshot("snapshot-1") === null);

const again = connectorOf().collect(inputOf());
check("deterministic collection: a second connector matches the snapshot", again.snapshot?.searchUrl === built.snapshot?.searchUrl && again.snapshot?.html === built.snapshot?.html && again.snapshot?.query === built.snapshot?.query);

const empty = connectorOf().collect(inputOf({ keyword: " " }));
check("an empty keyword stores no snapshot", empty.status === "REJECTED" && has(empty.issues, /Empty Keyword/) && empty.snapshot === null && empty.statistics.collectionCount === 0);
const locale = connectorOf().collect(inputOf({ country: "USA" }));
check("an invalid locale stores no snapshot", locale.status === "REJECTED" && has(locale.issues, /Invalid Locale/) && locale.snapshot === null);
const device = connectorOf().collect(inputOf({ device: "phone" }));
check("an invalid device stores no snapshot", device.status === "REJECTED" && has(device.issues, /Invalid Device/) && device.snapshot === null);
const nested = connectorOf().collect(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores no snapshot", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);
check("a missing envelope is invalid metadata", connectorOf().collect(null).status === "REJECTED" && has(connectorOf().collect(null).issues, /Invalid Metadata/));

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["google-search-connector.ts", "google-search-client.ts", "google-search-context.ts", "google-search-validator.ts", "google-search-types.ts", "google-search-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("six connector modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|querySelector|cheerio/i.test(line)));
check("no markup reading, listing detection, model calls, or ordering in code", !bare.some((line) => /\bparse\b|\borganic\b|\bsponsored\b|\bads?\b|\brank\b|\bscor(?:e|es|ing)\b|anthropic|openai|\bdecision\b/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "google-search-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the connector modules", imports.every((from) => /^\.\/google-search-(connector|client|context|validator|types|snapshot)$/.test(from)));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the search connector`, !sources.some((file) => /market-discovery/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`SEARCH_CONNECTOR_FAILURES=${failures}`);
  process.exit(1);
}
console.log("SEARCH_CONNECTOR_FAILURES=0");
