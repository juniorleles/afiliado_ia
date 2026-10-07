import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleSearchConnector } from "../src/lib/market-discovery/google-search-connector.ts";
import { createGoogleSerpParser } from "../src/lib/market-discovery/google-serp-parser.ts";
import { createSerpParser } from "../src/lib/market-discovery/serp-parser.ts";
import { SERP_CONTEXT_MEMBERS } from "../src/lib/market-discovery/serp-context.ts";
import { SERP_SNAPSHOT_KEYS } from "../src/lib/market-discovery/serp-snapshot.ts";
import { SERP_ORIGINS, SERP_PROVENANCE, SERP_RECORD_KEYS, SERP_STATISTICS_KEYS, SERP_STATUSES, freezeDeepSerp } from "../src/lib/market-discovery/serp-types.ts";
import { createSerpValidator } from "../src/lib/market-discovery/serp-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

function pageOf() {
  return `<div>
  <article data-serp="result" data-position="2" data-result-type="web" data-sponsored-marker="marked" data-result-metadata="block-b">
    <a data-field="title" href="https://example.test/two">Second block</a>
    <p data-field="description">A later block in the page.</p>
    <p>Sponsored text is not a marker.</p>
  </article>
  <article data-serp="result" data-position="1" data-result-type="web" data-organic-marker="marked" data-result-metadata="block-a">
    <a data-field="title" href="https://example.test/one">First block</a>
    <p data-field="description">An earlier stated position.</p>
  </article>
  <p>A loose link is not a result block.</p>
  <a href="https://example.test/loose">Loose link</a>
</div>`;
}

function snapshotOf(html = pageOf(), over: Record<string, unknown> = {}) {
  return {
    snapshotId: "snapshot-1",
    query: "alpha offer",
    language: "en",
    country: "US",
    device: "desktop",
    market: "north",
    searchUrl: "https://www.google.com/search?q=alpha+offer",
    html,
    collectedAt: "2026-01-01T00:00:00.000Z",
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: { run: "r1" },
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    searchSnapshot: snapshotOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function parserOf() {
  let n = 0;
  return createGoogleSerpParser({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `serp-${++n}`,
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

const validator = createSerpValidator();
check("statuses are OK and REJECTED", SERP_STATUSES.join() === "OK,REJECTED");
check("origin is OBSERVED and provenance is DIRECT_SOURCE", SERP_ORIGINS.join() === "OBSERVED" && SERP_PROVENANCE.join() === "DIRECT_SOURCE");
check("context members name the search snapshot and metadata", SERP_CONTEXT_MEMBERS.join() === "searchSnapshot,executionMetadata,runtimeMetadata,configuration");
check("record keys keep title, url, description, position, type, markers, and metadata", SERP_RECORD_KEYS.join() === "title,url,description,position,resultType,sponsoredMarker,organicMarker,resultMetadata,origin,provenance");
check("snapshot keys keep the serp id, the search snapshot id, and the records", SERP_SNAPSHOT_KEYS.join() === "serpId,searchSnapshotId,query,records,createdAt,origin,provenance,metadata");
check("statistics keys count records", SERP_STATISTICS_KEYS.join() === "recordCount,issueCount,executionTime");
check("Missing SearchSnapshot: a missing envelope is rejected", has(validator.validateInput(null), /Missing SearchSnapshot/));
check("Malformed Snapshot: a snapshot without page text is rejected", has(validator.validateSearchSnapshot(snapshotOf(pageOf(), { html: 1 })), /Malformed Snapshot/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Metadata/));

const source = inputOf();
const before = JSON.stringify(source);
const host = parserOf();
const built = host.parse(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const rows = built.records?.map((item) => `${item.position}:${item.title}:${item.sponsoredMarker ?? ""}:${item.organicMarker ?? ""}`).join("|");
check("a search snapshot parses", built.status === "OK" && built.snapshot !== null && built.records !== null && built.statistics.recordCount === 2);
check("records stay in page order and keep the stated positions", rows === "2:Second block:marked:|1:First block::marked");
check("title, url, description, result type, and result metadata are copied", built.records?.[0]?.url === "https://example.test/two" && built.records[0].description === "A later block in the page." && built.records[0].resultType === "web" && built.records[0].resultMetadata === "block-b");
check("visible sponsored text does not create a marker", built.records?.[1]?.sponsoredMarker === null && built.records[0].organicMarker === null);
check("a loose link is not a record", built.records?.every((item) => item.title !== "Loose link") === true);
check("the snapshot names the source search snapshot", built.snapshot?.serpId === "serp-1" && built.snapshot.searchSnapshotId === "snapshot-1" && built.snapshot.query === "alpha offer" && built.metadata.run === "r1" && built.snapshot.origin === "OBSERVED");
check("each record has exactly the requested fields", built.records !== null && built.records.every((item) => Object.keys(item).join() === SERP_RECORD_KEYS.join()));
check("getSnapshot returns the stored snapshot", host.getSnapshot("serp-1") === built.snapshot && host.getSnapshot("missing") === null);
check("an empty page stores an empty record list", parserOf().parse(inputOf({ searchSnapshot: snapshotOf("<div>no blocks</div>") })).records?.length === 0);
check("a bare search snapshot is accepted", parserOf().parse(snapshotOf()).status === "OK");
check("the structure reader is callable", createSerpParser().parse(pageOf()).length === 2);

const collected = createGoogleSearchConnector({
  now: () => 0,
  timestamp: () => "2026-01-01T00:00:00.000Z",
  idFactory: () => "snapshot-1",
}).collect({
  keyword: "alpha offer",
  language: "en",
  country: "US",
  device: "desktop",
  market: "north",
  searchHtml: pageOf(),
  executionMetadata: { run: "r1" },
});
const fromConnector = parserOf().parse({ searchSnapshot: collected.snapshot, executionMetadata: { run: "r1" } });
check("a connector snapshot can be parsed", fromConnector.status === "OK" && fromConnector.records?.length === 2 && fromConnector.snapshot?.searchSnapshotId === "snapshot-1");

source.searchSnapshot.html = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.query as string) = "hacked";
  if (built.records) (built.records[0] as { title: string | null }).title = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the records unchanged", before !== JSON.stringify(source) && built.records?.[0]?.title === "Second block" && built.metadata.run === "r1" && built.snapshot?.query === "alpha offer");
check("Immutable snapshot: the snapshot and records cannot be assigned into", built.snapshot?.query === "alpha offer" && built.records?.[0]?.title === "Second block" && Object.isFrozen(built.snapshot) && Object.isFrozen(built.records));
check("freeze helper returns the same value", freezeDeepSerp(built.snapshot) === built.snapshot);

const left = parserOf();
const right = parserOf();
left.parse(inputOf());
right.parse(null);
check("Independent parser: parsers do not share snapshots", left.getSnapshot("serp-1")?.query === "alpha offer" && right.getSnapshot("serp-1") === null);

const again = parserOf().parse(inputOf());
check("deterministic parse: a second parser matches the records", again.records?.map((item) => `${item.position}:${item.title}`).join() === built.records?.map((item) => `${item.position}:${item.title}`).join());

const missing = parserOf().parse(null);
check("a missing snapshot stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing SearchSnapshot/) && missing.snapshot === null && missing.records === null);
const malformed = parserOf().parse({ searchSnapshot: snapshotOf(pageOf(), { html: null }) });
check("a malformed snapshot stores nothing", malformed.status === "REJECTED" && has(malformed.issues, /Malformed Snapshot/) && malformed.snapshot === null);
const nested = parserOf().parse(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["google-serp-parser.ts", "serp-parser.ts", "serp-validator.ts", "serp-types.ts", "serp-context.ts", "serp-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("six parser modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no ordering, model calls, or listing judgment in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|\bdetect\b|\bclassif/i.test(line)));
check("markers are attribute copies", code.some((line) => line.includes("data-sponsored-marker")) && code.some((line) => line.includes("data-organic-marker")) && !code.some((line) => /Sponsored|Organic/.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "serp-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check(
  "every import stays inside the parser or the search snapshot contract",
  imports.every((from) => /^\.\/(google-serp-parser|serp-parser|serp-validator|serp-types|serp-context|serp-snapshot|google-search-snapshot|google-search-types)$/.test(from)),
);
const connectorFiles = readdirSync(dir).filter((file) => /^google-search-[a-z]+\.ts$/.test(file));
check("the search connector modules do not import the parser", connectorFiles.every((file) => !/serp-parser|google-serp-parser|serp-validator|serp-snapshot|serp-context|serp-types/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the serp parser`, !sources.some((file) => /market-discovery|google-serp-parser|serp-parser/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`SERP_PARSER_FAILURES=${failures}`);
  process.exit(1);
}
console.log("SERP_PARSER_FAILURES=0");
