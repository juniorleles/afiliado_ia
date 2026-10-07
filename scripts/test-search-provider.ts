import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createSearchProviderFactory } from "../src/lib/search-provider/search-provider-factory.ts";
import { SEARCH_PROVIDER_CONTEXT_MEMBERS } from "../src/lib/search-provider/search-provider-context.ts";
import { createSearchProviderRegistry } from "../src/lib/search-provider/search-provider-registry.ts";
import { PROVIDER_CONFIGURATION_KEYS, SEARCH_PROVIDER_DEVICES, SEARCH_PROVIDER_PROVENANCE, SEARCH_PROVIDER_STATUSES, SEARCH_REQUEST_KEYS, SEARCH_RESPONSE_KEYS, SEARCH_SNAPSHOT_KEYS, SEARCH_SNAPSHOT_ORIGINS, freezeDeepSearchProvider } from "../src/lib/search-provider/search-provider-types.ts";
import { createSearchProviderValidator } from "../src/lib/search-provider/search-provider-validator.ts";
import { MOCK_PROVIDER, createMockSearchProvider } from "../src/lib/search-provider/providers/mock-search-provider.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const html = "<section>opaque-search-marker</section>";

function requestOf(over: Record<string, unknown> = {}) {
  return {
    provider: MOCK_PROVIDER,
    keyword: "zebra offer",
    language: "en",
    country: "US",
    device: "desktop",
    market: "north",
    searchHtml: html,
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function clocks() {
  let n = 0;
  return { now: () => 0, timestamp: () => T0, idFactory: () => `snapshot-${++n}` };
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

const validator = createSearchProviderValidator();
check("statuses are OK and REJECTED", SEARCH_PROVIDER_STATUSES.join() === "OK,REJECTED");
check("snapshot origin is COLLECTED and provenance is DIRECT_SOURCE", SEARCH_SNAPSHOT_ORIGINS.join() === "COLLECTED" && SEARCH_PROVIDER_PROVENANCE.join() === "DIRECT_SOURCE");
check("devices are desktop, mobile, and tablet", SEARCH_PROVIDER_DEVICES.join() === "desktop,mobile,tablet");
check("context members name the provider, the keyword, and metadata", SEARCH_PROVIDER_CONTEXT_MEMBERS.join() === "provider,keyword,language,country,device,market,searchHtml,executionMetadata,runtimeMetadata,configuration");
check("request keys keep the provider and the supplied page", SEARCH_REQUEST_KEYS.join() === "provider,keyword,language,country,device,market,searchHtml");
check("snapshot keys keep the provider, the query, and the page text", SEARCH_SNAPSHOT_KEYS.join() === "snapshotId,provider,query,language,country,device,market,html,collectedAt,origin,provenance,metadata");
check("response keys keep the status, the snapshot, and the time", SEARCH_RESPONSE_KEYS.join() === "status,issues,snapshot,metadata,executionTime");
check("configuration keys keep the provider names", PROVIDER_CONFIGURATION_KEYS.join() === "providers,origin,provenance");
check("Missing Provider: a missing envelope is rejected", has(validator.validateInput(null), /Missing Provider/));
check("Invalid Provider Contract: an adapter without a search method is rejected", has(validator.validateContract({ provider: "FUTURE" }), /Invalid Provider Contract/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(requestOf({ extra: true })), /Invalid Metadata/));

const created = createSearchProviderRegistry();
check("the registry registers the mock provider", created.status === "OK" && created.registry?.list().join() === MOCK_PROVIDER && created.configuration?.providers.join() === MOCK_PROVIDER && created.configuration.origin === "REGISTERED" && created.configuration.provenance === "DIRECT_SOURCE");
const duplicated = createSearchProviderRegistry([createMockSearchProvider(), createMockSearchProvider()]);
check("Duplicate Provider: a repeated name stores no registry", duplicated.status === "REJECTED" && has(duplicated.issues, /Duplicate Provider/) && duplicated.registry === null && duplicated.configuration === null);
const invalid = createSearchProviderRegistry([{ provider: "FUTURE" }]);
check("Invalid Provider Contract: a partial adapter stores no registry", invalid.status === "REJECTED" && has(invalid.issues, /Invalid Provider Contract/) && invalid.registry === null);

const names = [createMockSearchProvider(clocks())];
const registered = createSearchProviderRegistry(names);
names.push({ provider: "FUTURE", search: () => ({ status: "OK", issues: [], snapshot: null, metadata: {}, executionTime: 0 }) } as never);
check("Immutable configuration: changing the input list leaves the registry", registered.registry?.list().join() === MOCK_PROVIDER && Object.isFrozen(registered.configuration) && registered.configuration?.providers.join() === MOCK_PROVIDER);
try {
  if (registered.configuration) (registered.configuration.providers as string[]).push("FUTURE");
} catch {
  /* frozen */
}
check("the configuration cannot be assigned into", registered.configuration?.providers.join() === MOCK_PROVIDER);
const again = registered.registry?.register(createMockSearchProvider());
check("a later duplicate is refused and the list stays unchanged", again !== undefined && has(again, /Duplicate Provider/) && registered.registry?.list().join() === MOCK_PROVIDER);
const future = {
  provider: "FUTURE",
  search(input: unknown) {
    return { status: "REJECTED" as const, issues: [{ field: "provider", message: "Invalid Provider Contract: future provider." }], snapshot: null, metadata: {}, executionTime: 0, echo: input };
  },
};
check("a future provider is appended in registration order", registered.registry?.register(future).length === 0 && registered.registry?.list().join() === `${MOCK_PROVIDER},FUTURE`);

const source = requestOf();
const before = JSON.stringify(source);
const factory = createSearchProviderFactory(clocks());
const built = factory.search(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
check("the factory searches through the mock provider", built.status === "OK" && built.snapshot !== null && built.snapshot.provider === MOCK_PROVIDER && built.snapshot.query === "zebra offer" && built.snapshot.html === html && built.snapshot.collectedAt === T0 && built.metadata.run === "r1" && built.snapshot.origin === "COLLECTED" && built.snapshot.provenance === "DIRECT_SOURCE");
check("the factory configuration names the mock provider", factory.configuration().providers.join() === MOCK_PROVIDER && Object.isFrozen(factory.configuration()));
(source as { searchHtml: string }).searchHtml = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.html as string) = "hacked";
  if (built.snapshot) (built.snapshot.snapshotId as string) = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the snapshot", before !== JSON.stringify(source) && built.snapshot?.html === html && built.metadata.run === "r1" && built.snapshot.query === "zebra offer");
check("Immutable snapshot: the snapshot cannot be assigned into", built.snapshot?.snapshotId === "snapshot-1" && Object.isFrozen(built.snapshot) && Object.isFrozen(built));
check("freeze helper returns the same value", freezeDeepSearchProvider(built.snapshot) === built.snapshot);
check("each snapshot has exactly the requested fields", built.snapshot !== null && Object.keys(built.snapshot).join() === SEARCH_SNAPSHOT_KEYS.join() && Object.keys(built).join() === SEARCH_RESPONSE_KEYS.join());

const left = createMockSearchProvider(clocks());
const right = createMockSearchProvider(clocks());
left.search(requestOf());
check("Independent providers: providers do not share snapshots", left.getSnapshot("snapshot-1")?.html === html && right.getSnapshot("snapshot-1") === null);
check("deterministic search: a second factory matches the query", createSearchProviderFactory(clocks()).search(requestOf()).snapshot?.query === "zebra offer");

const missing = factory.search(requestOf({ provider: "UNKNOWN" }));
check("an unknown provider stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing Provider/) && missing.snapshot === null);
const blank = factory.search(requestOf({ provider: "" }));
check("a blank provider stores nothing", blank.status === "REJECTED" && has(blank.issues, /Missing Provider/) && blank.snapshot === null);
const nested = factory.search(requestOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);
const badId = createSearchProviderFactory({ ...clocks(), idFactory: () => "BAD" }).search(requestOf());
check("a corrupted snapshot id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null);
const broken = createSearchProviderFactory({
  ...clocks(),
  registry: createSearchProviderRegistry([
    createMockSearchProvider(clocks()),
    { provider: "FUTURE", search: () => ({ status: "OK" }) },
  ]).registry ?? undefined,
});
const brokenRun = broken.search(requestOf({ provider: "FUTURE" }));
check("a provider response that misses the contract stores nothing", brokenRun.status === "REJECTED" && has(brokenRun.issues, /Invalid Provider Contract/) && brokenRun.snapshot === null);
const thrown = createSearchProviderFactory({
  ...clocks(),
  registry: createSearchProviderRegistry([
    { provider: "FUTURE", search() { throw new Error("stopped"); } },
  ]).registry ?? undefined,
});
const thrownRun = thrown.search(requestOf({ provider: "FUTURE" }));
check("a provider that fails the call stores nothing", thrownRun.status === "REJECTED" && has(thrownRun.issues, /Invalid Provider Contract/) && thrownRun.snapshot === null);

const dir = join(process.cwd(), "src/lib/search-provider");
const rootNames = ["search-provider.ts", "search-provider-registry.ts", "search-provider-factory.ts", "search-provider-types.ts", "search-provider-validator.ts", "search-provider-context.ts"];
const rootFiles = readdirSync(dir).filter((file) => rootNames.includes(file));
check("six provider modules exist", rootFiles.sort().join() === rootNames.slice().sort().join());
check("the mock provider module exists", readdirSync(join(dir, "providers")).includes("mock-search-provider.ts"));
const files = listTs(dir);
const offlineFiles = files.filter((file) => !file.replace(/\\/g, "/").includes("searchapi-"));
const lines = files.flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/));
const offlineLines = offlineFiles.flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const offlineCode = offlineLines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("the abstraction modules do not request a page", !offlineCode.some((line) => /fetch\(|serpapi|dataforseo|googleapis|oauth|node:http|node:https|https?:\/\//i.test(line)));
check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|product-intelligence|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "search-provider-context.ts"), "utf8")));
check("the provider contract stays a contract", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "search-provider.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the search provider", imports.every((from) => /^(?:node:fs|node:path|(?:\.\/|\.\.\/)(?:search-provider|search-provider-registry|search-provider-factory|search-provider-types|search-provider-validator|search-provider-context|searchapi-types|searchapi-context|searchapi-validator|searchapi-snapshot|searchapi-client|providers\/mock-search-provider|providers\/searchapi-provider))$/.test(from)));
const market = listTs(join(process.cwd(), "src/lib/market-discovery"));
check("Market Discovery does not import the search provider", !market.some((file) => /search-provider/.test(readFileSync(file, "utf8"))));
check("the search provider does not import Market Discovery", !files.some((file) => /market-discovery/.test(readFileSync(file, "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the search provider`, !sources.some((file) => /search-provider/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`SEARCH_PROVIDER_FAILURES=${failures}`);
  process.exit(1);
}
console.log("SEARCH_PROVIDER_FAILURES=0");
