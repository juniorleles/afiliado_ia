import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEARCHAPI_ENDPOINT, createSearchApiClient, readSearchApiKey } from "../src/lib/search-provider/searchapi-client.ts";
import { SEARCHAPI_CONTEXT_MEMBERS } from "../src/lib/search-provider/searchapi-context.ts";
import { createSearchApiSnapshot } from "../src/lib/search-provider/searchapi-snapshot.ts";
import { PROVIDER_RESPONSE_KEYS, SEARCHAPI_DEVICES, SEARCHAPI_ORIGINS, SEARCHAPI_PROVENANCE, SEARCHAPI_PROVIDER_NAME, SEARCHAPI_SNAPSHOT_KEYS, SEARCHAPI_STATISTICS_KEYS, SEARCHAPI_STATUSES } from "../src/lib/search-provider/searchapi-types.ts";
import { createSearchApiValidator } from "../src/lib/search-provider/searchapi-validator.ts";
import { createSearchApiProvider } from "../src/lib/search-provider/providers/searchapi-provider.ts";
import { createSearchProviderRegistry } from "../src/lib/search-provider/search-provider-registry.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";
const body = JSON.stringify({
  search_metadata: { id: "search_test", status: "Success" },
  opaque: { marker: "opaque-search-marker" },
});

function requestOf(over: Record<string, unknown> = {}) {
  return {
    keyword: "zebra offer",
    country: "US",
    language: "en",
    device: "desktop",
    searchOptions: { location: "North", page: "1" },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function clocks() {
  return { now: () => 0, timestamp: () => T0 };
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

async function main() {
  const validator = createSearchApiValidator();
  check("statuses are OK and REJECTED", SEARCHAPI_STATUSES.join() === "OK,REJECTED");
  check("origin is COLLECTED and provenance is DIRECT_SOURCE", SEARCHAPI_ORIGINS.join() === "COLLECTED" && SEARCHAPI_PROVENANCE.join() === "DIRECT_SOURCE");
  check("devices are desktop, mobile, and tablet", SEARCHAPI_DEVICES.join() === "desktop,mobile,tablet");
  check("context members name the keyword, the locale, and the options", SEARCHAPI_CONTEXT_MEMBERS.join() === "keyword,country,language,device,searchOptions,executionMetadata,runtimeMetadata,configuration");
  check("the endpoint is the SearchApi search route", SEARCHAPI_ENDPOINT === "https://www.searchapi.io/api/v1/search");
  check("Empty Keyword: a blank keyword is rejected", has(validator.validateInput(requestOf({ keyword: "  " })), /Empty Keyword/));
  check("Invalid Locale: a lowercase country is rejected", has(validator.validateInput(requestOf({ country: "us" })), /Invalid Locale/));
  check("Invalid Device: an unknown device is rejected", has(validator.validateInput(requestOf({ device: "phone" })), /Invalid Device/));

  const keyFile = join(process.cwd(), "tmp-searchapi-key.env");
  writeFileSync(keyFile, 'OTHER=1\nSEARCHAPI_API_KEY="unit-test-key"\n');
  try {
    check("the key reader loads SEARCHAPI_API_KEY from a local env file", readSearchApiKey(keyFile) === "unit-test-key");
    check("a missing env file yields an empty key", readSearchApiKey(join(process.cwd(), "tmp-searchapi-missing.env")) === "");
  } finally {
    rmSync(keyFile, { force: true });
  }

  const calls: { url: string; headers: Record<string, string> }[] = [];
  const transport = async (url: string, headers: Record<string, string>) => {
    calls.push({ url, headers });
    return { httpStatus: 200, bodyText: body };
  };
  const provider = createSearchApiProvider({ ...clocks(), transport, keyReader: () => "unit-test-key" });
  const source = requestOf();
  const before = JSON.stringify(source);
  const built = await provider.search(source);
  if (built.status !== "OK") console.log(JSON.stringify(built.issues));
  check("one request stores the raw JSON", calls.length === 1 && built.status === "OK" && built.snapshot !== null && built.snapshot.provider === SEARCHAPI_PROVIDER_NAME && built.snapshot.keyword === "zebra offer" && built.snapshot.raw.opaque !== undefined && (built.snapshot.raw.opaque as { marker: string }).marker === "opaque-search-marker" && built.snapshot.collectedAt === T0 && built.metadata.run === "r1");
  const url = new URL(calls[0]?.url ?? "https://example.test/");
  check("the request carries the keyword, locale, device, and options", url.searchParams.get("engine") === "google" && url.searchParams.get("q") === "zebra offer" && url.searchParams.get("gl") === "US" && url.searchParams.get("hl") === "en" && url.searchParams.get("device") === "desktop" && url.searchParams.get("location") === "North" && url.searchParams.get("page") === "1" && url.searchParams.get("api_key") === null);
  check("the key travels in the header and not in the query", calls[0]?.headers.Authorization === "Bearer unit-test-key" && !calls[0]?.url.includes("unit-test-key"));
  check("statistics record one request and the payload size", built.statistics.requestCount === 1 && built.statistics.payloadBytes === body.length && built.statistics.issueCount === 0 && built.statistics.executionTime === 0);
  check("response and snapshot keys stay in order", built.snapshot !== null && Object.keys(built).join() === PROVIDER_RESPONSE_KEYS.join() && Object.keys(built.snapshot).join() === SEARCHAPI_SNAPSHOT_KEYS.join() && Object.keys(built.statistics).join() === SEARCHAPI_STATISTICS_KEYS.join());
  (source as { keyword: string }).keyword = "changed";
  (source.executionMetadata as { run: string }).run = "changed";
  try {
    if (built.snapshot) (built.snapshot.raw as { opaque: { marker: string } }).opaque.marker = "hacked";
    if (built.snapshot) (built.snapshot.keyword as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: changing the input leaves the snapshot", before !== JSON.stringify(source) && built.snapshot?.keyword === "zebra offer" && built.metadata.run === "r1" && (built.snapshot?.raw.opaque as { marker: string }).marker === "opaque-search-marker");
  check("Immutable snapshot: the snapshot cannot be assigned into", built.snapshot?.snapshotId === "searchapi-1" && Object.isFrozen(built) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.snapshot?.raw) && provider.getSnapshot("searchapi-1")?.keyword === "zebra offer");

  const again = await provider.search(requestOf({ device: "tablet", searchOptions: {} }));
  check("a second retrieval is a separate snapshot", calls.length === 2 && again.snapshot?.snapshotId === "searchapi-2" && again.snapshot.device === "tablet" && new URL(calls[1].url).searchParams.get("device") === "tablet");

  const left = createSearchApiProvider({ ...clocks(), transport, keyReader: () => "unit-test-key" });
  const right = createSearchApiProvider({ ...clocks(), transport: async () => ({ httpStatus: 200, bodyText: body }), keyReader: () => "unit-test-key" });
  await left.search(requestOf());
  check("Independent provider: providers do not share snapshots", left.getSnapshot("searchapi-1")?.keyword === "zebra offer" && right.getSnapshot("searchapi-1") === null);

  const missingKey = createSearchApiProvider({ ...clocks(), transport, keyReader: () => "  " });
  const missing = await missingKey.search(requestOf());
  check("Missing API Key stores nothing and does not request", missing.status === "REJECTED" && has(missing.issues, /Missing API Key/) && missing.snapshot === null && missing.statistics.requestCount === 0 && calls.length === 3);
  const blank = await createSearchApiProvider({ ...clocks(), transport, keyReader: () => "unit-test-key" }).search(requestOf({ keyword: "" }));
  check("Empty Keyword stores nothing and does not request", blank.status === "REJECTED" && has(blank.issues, /Empty Keyword/) && blank.snapshot === null && blank.statistics.requestCount === 0 && calls.length === 3);
  const locale = await createSearchApiProvider({ ...clocks(), transport, keyReader: () => "unit-test-key" }).search(requestOf({ language: "eng", country: "USA" }));
  check("Invalid Locale stores nothing and does not request", locale.status === "REJECTED" && has(locale.issues, /Invalid Locale/) && locale.snapshot === null && locale.statistics.requestCount === 0 && calls.length === 3);
  const device = await createSearchApiProvider({ ...clocks(), transport, keyReader: () => "unit-test-key" }).search(requestOf({ device: "phone" }));
  check("Invalid Device stores nothing and does not request", device.status === "REJECTED" && has(device.issues, /Invalid Device/) && device.snapshot === null && device.statistics.requestCount === 0 && calls.length === 3);
  const nested = await createSearchApiProvider({ ...clocks(), transport, keyReader: () => "unit-test-key" }).search(requestOf({ searchOptions: { page: { n: "1" } } }));
  check("nested search options store nothing and do not request", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null && nested.statistics.requestCount === 0 && calls.length === 3);
  const planted = await createSearchApiProvider({ ...clocks(), transport, keyReader: () => "unit-test-key" }).search(requestOf({ searchOptions: { api_key: "unit-test-key", page: "2" } }));
  check("a key planted in search options does not request", planted.status === "REJECTED" && has(planted.issues, /Invalid Metadata/) && planted.statistics.requestCount === 0 && calls.length === 3);

  const http = await createSearchApiProvider({
    ...clocks(),
    keyReader: () => "unit-test-key",
    transport: async () => ({ httpStatus: 400, bodyText: JSON.stringify({ error: "Unsupported value" }) }),
  }).search(requestOf());
  check("HTTP Errors store nothing", http.status === "REJECTED" && has(http.issues, /HTTP Errors/) && http.snapshot === null && http.statistics.requestCount === 1 && http.statistics.payloadBytes > 0);
  const malformed = await createSearchApiProvider({
    ...clocks(),
    keyReader: () => "unit-test-key",
    transport: async () => ({ httpStatus: 200, bodyText: "not-json" }),
  }).search(requestOf());
  check("Malformed Response stores nothing", malformed.status === "REJECTED" && has(malformed.issues, /Malformed Response/) && malformed.snapshot === null && malformed.statistics.requestCount === 1);
  const listed = await createSearchApiProvider({
    ...clocks(),
    keyReader: () => "unit-test-key",
    transport: async () => ({ httpStatus: 200, bodyText: "[]" }),
  }).search(requestOf());
  check("a JSON array is a malformed response", listed.status === "REJECTED" && has(listed.issues, /Malformed Response/) && listed.snapshot === null);
  const badId = await createSearchApiProvider({
    ...clocks(),
    keyReader: () => "unit-test-key",
    transport: async () => ({ httpStatus: 200, bodyText: body }),
    idFactory: () => "BAD",
  }).search(requestOf());
  check("a corrupted snapshot id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Metadata/) && badId.snapshot === null && badId.statistics.requestCount === 1);
  const thrown = await createSearchApiProvider({
    ...clocks(),
    keyReader: () => "unit-test-key",
    transport: async () => {
      throw new Error("stopped");
    },
  }).search(requestOf());
  check("a failed transport stores nothing", thrown.status === "REJECTED" && has(thrown.issues, /HTTP Errors/) && thrown.snapshot === null && thrown.statistics.requestCount === 1);

  const registry = createSearchProviderRegistry();
  check("the default registry remains the mock provider", registry.status === "OK" && registry.registry?.list().join() === "MOCK");
  const frozen = createSearchApiSnapshot({
    snapshotId: "searchapi-9",
    keyword: "zebra offer",
    country: "US",
    language: "en",
    device: "desktop",
    searchOptions: {},
    raw: { opaque: { marker: "opaque-search-marker" } },
    collectedAt: T0,
    metadata: { run: "r1" },
  });
  check("snapshot helper freezes the raw document", Object.isFrozen(frozen.raw) && frozen.origin === "COLLECTED" && frozen.provenance === "DIRECT_SOURCE");

  const dir = join(process.cwd(), "src/lib/search-provider");
  const names = ["searchapi-client.ts", "searchapi-validator.ts", "searchapi-types.ts", "searchapi-context.ts", "searchapi-snapshot.ts"];
  check("five SearchApi modules exist", names.every((name) => readdirSync(dir).includes(name)));
  check("the SearchApi provider module exists", readdirSync(join(dir, "providers")).includes("searchapi-provider.ts"));
  const files = listTs(dir).filter((file) => file.replace(/\\/g, "/").includes("searchapi-"));
  const client = readFileSync(join(dir, "searchapi-client.ts"), "utf8");
  const others = files.filter((file) => !file.replace(/\\/g, "/").endsWith("/searchapi-client.ts"));
  check("only the client performs the request", /fetch\(/.test(client) && others.every((file) => !/fetch\(/.test(readFileSync(file, "utf8"))));
  const loaded = readSearchApiKey();
  const bundled = files.map((file) => readFileSync(file, "utf8")).join("\n");
  check("the key reader loads SEARCHAPI_API_KEY from .env.local", loaded.length > 0);
  check("the loaded key is not hardcoded", loaded.length > 0 && !bundled.includes(loaded));
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  const bare = code.map((line) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``"));
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|product-intelligence|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
  check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "searchapi-context.ts"), "utf8")));
  check("the provider does not reshape listing blocks", !/\borganic_results\b|\bsponsored\b|\blanding page\b|\bproductName\b/i.test(bare.join("\n")));
  const market = listTs(join(process.cwd(), "src/lib/market-discovery"));
  check("Market Discovery does not import the SearchApi provider", !market.some((file) => /searchapi-/.test(readFileSync(file, "utf8"))));
  check("the SearchApi provider does not import Market Discovery", !files.some((file) => /market-discovery/.test(readFileSync(file, "utf8"))));
  const direct = createSearchApiClient({
    keyReader: () => "unit-test-key",
    transport: async (url, headers) => {
      check("the client keeps the key out of the query", !url.includes("unit-test-key") && headers.Authorization === "Bearer unit-test-key");
      return { httpStatus: 200, bodyText: body };
    },
  });
  await direct.request({ keyword: "zebra offer", country: "US", language: "en", device: "mobile", searchOptions: { page: "2" } });

  if (failures > 0) {
    console.log(`SEARCHAPI_PROVIDER_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("SEARCHAPI_PROVIDER_FAILURES=0");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "searchapi provider test failed");
  process.exit(1);
});
