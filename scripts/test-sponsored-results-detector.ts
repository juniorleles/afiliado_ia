import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createSponsoredDetector } from "../src/lib/market-discovery/sponsored-detector.ts";
import { SPONSORED_CONTEXT_MEMBERS } from "../src/lib/market-discovery/sponsored-context.ts";
import { createSponsoredResultsDetector } from "../src/lib/market-discovery/sponsored-results-detector.ts";
import { SPONSORED_SNAPSHOT_KEYS } from "../src/lib/market-discovery/sponsored-snapshot.ts";
import { SPONSORED_ORIGINS, SPONSORED_PROVENANCE, SPONSORED_RESULT_KEYS, SPONSORED_STATISTICS_KEYS, SPONSORED_STATUSES, freezeDeepSponsored } from "../src/lib/market-discovery/sponsored-types.ts";
import { createSponsoredValidator } from "../src/lib/market-discovery/sponsored-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

function recordOf(over: Record<string, unknown> = {}) {
  return {
    title: "Plain block",
    url: "https://example.test/plain",
    description: "A restated line.",
    position: 1,
    resultType: "web",
    sponsoredMarker: null,
    organicMarker: "marked",
    resultMetadata: "block-a",
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    ...over,
  };
}

function inputOf(records: Record<string, unknown>[], over: Record<string, unknown> = {}) {
  return {
    serpRecords: records,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function detectorOf() {
  let n = 0;
  return createSponsoredResultsDetector({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `sponsored-${++n}`,
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

const records = [
  recordOf({ title: "Later marker", url: "https://example.test/two", description: "Second block.", position: 2, sponsoredMarker: "marked", organicMarker: null, resultMetadata: "block-b" }),
  recordOf({ title: "Sponsored wording", url: "https://example.test/wording", position: 3, resultType: "sponsored", sponsoredMarker: null }),
  recordOf({ title: "Earlier marker", url: "https://example.test/one", description: "First block.", position: 1, sponsoredMarker: "marked", organicMarker: null, resultMetadata: "block-a" }),
];

const validator = createSponsoredValidator();
check("statuses are OK and REJECTED", SPONSORED_STATUSES.join() === "OK,REJECTED");
check("origin is OBSERVED and provenance is DIRECT_SOURCE", SPONSORED_ORIGINS.join() === "OBSERVED" && SPONSORED_PROVENANCE.join() === "DIRECT_SOURCE");
check("context members name the SERP records and metadata", SPONSORED_CONTEXT_MEMBERS.join() === "serpRecords,executionMetadata,runtimeMetadata,configuration");
check("result keys keep title, url, description, position, marker, and metadata", SPONSORED_RESULT_KEYS.join() === "title,url,description,position,sponsoredMarker,resultMetadata,origin,provenance");
check("snapshot keys keep the id, the source count, and the results", SPONSORED_SNAPSHOT_KEYS.join() === "sponsoredId,sourceCount,results,createdAt,origin,provenance,metadata");
check("statistics keys count the source list and the sponsored group", SPONSORED_STATISTICS_KEYS.join() === "sourceCount,sponsoredCount,issueCount,executionTime");
check("Missing SERPRecords: a missing envelope is rejected", has(validator.validateInput(null), /Missing SERPRecords/));
check("Malformed Records: a record that is not a plain record is rejected", has(validator.validateRecords(["nope"]), /Malformed Records/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf(records, { extra: true })), /Invalid Metadata/));

const source = inputOf(records);
const before = JSON.stringify(source);
const host = detectorOf();
const built = host.detect(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const rows = built.results?.map((item) => `${item.position}:${item.title}`).join("|");
check("sponsored records are grouped", built.status === "OK" && built.snapshot !== null && built.results !== null && built.statistics.sponsoredCount === 2 && built.statistics.sourceCount === 3);
check("the group stays in the given order", rows === "2:Later marker|1:Earlier marker");
check("title, url, description, position, marker, and metadata are copied", built.results?.[0]?.url === "https://example.test/two" && built.results[0].description === "Second block." && built.results[0].sponsoredMarker === "marked" && built.results[0].resultMetadata === "block-b");
check("wording and a result type do not create a sponsored record", built.results?.every((item) => item.title !== "Sponsored wording") === true);
check("the snapshot and metadata are restated", built.snapshot?.sponsoredId === "sponsored-1" && built.snapshot.sourceCount === 3 && built.metadata.run === "r1" && built.snapshot.origin === "OBSERVED" && built.snapshot.provenance === "DIRECT_SOURCE");
check("each sponsored result has exactly the requested fields", built.results !== null && built.results.every((item) => Object.keys(item).join() === SPONSORED_RESULT_KEYS.join()));
check("getSnapshot returns the stored snapshot", host.getSnapshot("sponsored-1") === built.snapshot && host.getSnapshot("missing") === null);
check("an empty list stores an empty group", detectorOf().detect(inputOf([])).results?.length === 0 && detectorOf().detect(inputOf([])).statistics.sponsoredCount === 0);
check("a bare record list is accepted", detectorOf().detect(records).results?.length === 2);
check("the selector is callable", createSponsoredDetector().select(records as never).length === 2);

source.serpRecords[0].title = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.sponsoredId as string) = "hacked";
  if (built.results) (built.results[0] as { title: string | null }).title = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the group unchanged", before !== JSON.stringify(source) && built.results?.[0]?.title === "Later marker" && built.metadata.run === "r1");
check("Immutable snapshot: the snapshot and results cannot be assigned into", built.snapshot?.sponsoredId === "sponsored-1" && built.results?.[0]?.title === "Later marker" && Object.isFrozen(built.snapshot) && Object.isFrozen(built.results));
check("freeze helper returns the same value", freezeDeepSponsored(built.snapshot) === built.snapshot);

const left = detectorOf();
const right = detectorOf();
left.detect(inputOf(records));
right.detect(null);
check("Independent detector: detectors do not share snapshots", left.getSnapshot("sponsored-1")?.sourceCount === 3 && right.getSnapshot("sponsored-1") === null);
check("deterministic group: a second detector matches the results", detectorOf().detect(inputOf([
  recordOf({ title: "Later marker", url: "https://example.test/two", description: "Second block.", position: 2, sponsoredMarker: "marked", organicMarker: null, resultMetadata: "block-b" }),
  recordOf({ title: "Sponsored wording", url: "https://example.test/wording", position: 3, resultType: "sponsored", sponsoredMarker: null }),
  recordOf({ title: "Earlier marker", url: "https://example.test/one", description: "First block.", position: 1, sponsoredMarker: "marked", organicMarker: null, resultMetadata: "block-a" }),
])).results?.map((item) => `${item.position}:${item.title}`).join("|") === rows);

const missing = detectorOf().detect(null);
check("a missing list stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing SERPRecords/) && missing.snapshot === null && missing.results === null);
const malformed = detectorOf().detect({ serpRecords: [{ title: "Only a title" }] });
check("malformed records store nothing", malformed.status === "REJECTED" && has(malformed.issues, /Malformed Records/) && malformed.snapshot === null);
const nested = detectorOf().detect(inputOf(records, { configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["sponsored-results-detector.ts", "sponsored-detector.ts", "sponsored-validator.ts", "sponsored-types.ts", "sponsored-context.ts", "sponsored-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("six detector modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no ordering or model calls in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "sponsored-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the detector or the SERP record contract", imports.every((from) => /^\.\/(sponsored-results-detector|sponsored-detector|sponsored-validator|sponsored-types|sponsored-context|sponsored-snapshot|serp-types)$/.test(from)));
const earlier = readdirSync(dir).filter((file) => /^(google-search|google-serp|serp)-[a-z]+\.ts$/.test(file));
check("earlier market discovery modules do not import the detector", earlier.every((file) => !/from ["']\.\/sponsored-/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the sponsored detector`, !sources.some((file) => /market-discovery|sponsored-results-detector|sponsored-detector/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`SPONSORED_DETECTOR_FAILURES=${failures}`);
  process.exit(1);
}
console.log("SPONSORED_DETECTOR_FAILURES=0");
