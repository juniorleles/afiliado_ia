import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SEARCH_SNAPSHOT_KEYS } from "../src/lib/market-discovery/google-search-snapshot.ts";
import { createSerpValidator } from "../src/lib/market-discovery/serp-validator.ts";
import { SERP_RECORD_KEYS } from "../src/lib/market-discovery/serp-types.ts";
import { createSponsoredDetector } from "../src/lib/market-discovery/sponsored-detector.ts";
import { SPONSORED_RESULT_KEYS } from "../src/lib/market-discovery/sponsored-types.ts";
import { createSponsoredValidator } from "../src/lib/market-discovery/sponsored-validator.ts";
import { SEARCHAPI_NORMALIZER_CONTEXT_MEMBERS } from "../src/lib/search-intelligence/searchapi-context.ts";
import { createSearchApiNormalizer } from "../src/lib/search-intelligence/searchapi-normalizer.ts";
import { NORMALIZER_ORIGINS, NORMALIZER_PROVENANCE, NORMALIZER_RESPONSE_KEYS, NORMALIZER_SNAPSHOT_KEYS, NORMALIZER_STATISTICS_KEYS, NORMALIZER_STATUSES } from "../src/lib/search-intelligence/searchapi-types.ts";
import { createSearchApiProvider } from "../src/lib/search-provider/providers/searchapi-provider.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";

const raw = {
  search_metadata: {
    id: "search_test",
    status: "Success",
    created_at: T0,
    request_time_taken: 1.25,
    request_url: "https://www.google.com/search?q=zebra+offer&gl=US&hl=en",
    html_url: "https://example.test/html",
    json_url: "https://example.test/json",
  },
  search_parameters: { engine: "google", q: "zebra offer", device: "desktop", hl: "pt-br", gl: "us" },
  search_information: { query_displayed: "zebra offer", detected_location: "Unknown", has_no_results_for: false },
  organic_results: [
    {
      position: 1,
      title: "Zebra Offer notes",
      link: "https://example.test/notes",
      snippet: "A note about the offer.",
      source: "Example Notes",
      domain: "example.test",
      displayed_link: "https://example.test/notes",
      date: "Jan 2, 2026",
      opaque: "keep-organic",
    },
  ],
  ads: [
    {
      position: 1,
      block_position: "top",
      title: "Zebra Offer desk",
      link: "https://example.test/buy",
      snippet: "Desk copy.",
      source: "North Desk",
      domain: "example.test",
      displayed_link: "https://example.test/buy",
      tracking_link: "https://example.test/track",
      sitelinks: { expanded: [{ title: "Details", link: "https://example.test/details" }] },
      opaque: "keep-ad",
    },
  ],
  shopping_ads: [
    {
      position: 1,
      block_position: "top",
      title: "Zebra Offer tin",
      link: "https://example.test/tin",
      seller: "Example Shelf",
      price: "$12.00",
      extracted_price: 12,
      rating: 4.5,
      reviews: 3,
      extensions: ["Shelf note"],
      opaque: "keep-shopping",
    },
  ],
  inline_shopping: [
    {
      position: 2,
      title: "Zebra Offer case",
      link: "https://example.test/case",
      price: "$4.00",
      extracted_price: 4,
      product_id: "sku-1",
      opaque: "keep-inline",
    },
  ],
};

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(path));
    else if (name.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

function leaves(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) leaves(item, out);
    return out;
  }
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) leaves(inner, out);
    return out;
  }
  out.push(value);
  return out;
}

async function main() {
  check("statuses are OK and REJECTED", NORMALIZER_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", NORMALIZER_ORIGINS.join() === "OBSERVED" && NORMALIZER_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the provider response and metadata", SEARCHAPI_NORMALIZER_CONTEXT_MEMBERS.join() === "providerResponse,executionMetadata,runtimeMetadata,configuration");

  const provider = createSearchApiProvider({
    now: () => 0,
    timestamp: () => T0,
    keyReader: () => "unit-test-key",
    transport: async () => ({ httpStatus: 200, bodyText: JSON.stringify(raw) }),
  });
  const response = await provider.search({
    keyword: "zebra offer",
    country: "US",
    language: "en",
    device: "desktop",
    searchOptions: { location: "North", page: "1" },
    executionMetadata: { run: "r1" },
  });
  const normalizer = createSearchApiNormalizer({ now: () => 0, timestamp: () => T0 });
  const source = structuredClone(response);
  const built = normalizer.normalize(source);
  if (built.status !== "OK" || built.snapshot === null) {
    console.log(JSON.stringify(built.issues));
  }
  const snapshot = built.snapshot;
  check("a provider response becomes a search snapshot, SERP records, and sponsored results", built.status === "OK" && snapshot !== null && snapshot.searchSnapshot.query === "zebra offer" && snapshot.searchSnapshot.language === "en" && snapshot.searchSnapshot.country === "US" && snapshot.searchSnapshot.device === "desktop" && snapshot.searchSnapshot.market === "us" && snapshot.searchSnapshot.html === "" && snapshot.searchSnapshot.searchUrl === raw.search_metadata.request_url && snapshot.serpRecords.length === 4 && snapshot.sponsoredResults.length === 3);
  check("organic rows stay out of the sponsored results", snapshot !== null && snapshot.sponsoredResults.every((item) => item.url !== "https://example.test/notes") && snapshot.serpRecords[0]?.sponsoredMarker === null && snapshot.serpRecords[0]?.organicMarker === "organic");
  check("ad, shopping, and inline rows keep their markers and destinations", snapshot !== null && snapshot.sponsoredResults.map((item) => `${item.sponsoredMarker}|${item.url}`).join() === "top|https://example.test/buy,top|https://example.test/tin,inline|https://example.test/case");
  check("echoed language and search options stay on the search metadata", snapshot !== null && snapshot.searchMetadata.parameterLanguage === "pt-br" && snapshot.searchMetadata.informationHasNoResults === false && snapshot.searchMetadata.option_location === "North" && snapshot.searchMetadata.metadataHtmlUrl === "https://example.test/html" && snapshot.searchMetadata.metadataRequestTimeTaken === 1.25);
  const packed = JSON.stringify(snapshot);
  const missing = leaves(raw).filter((leaf) => typeof leaf === "string" && leaf !== "" && !packed.includes(leaf));
  check("every source text value remains available", missing.length === 0);
  check("prices and counts remain available", packed.includes("$12.00") && packed.includes("sku-1") && packed.includes("keep-organic") && packed.includes("keep-ad") && packed.includes("keep-shopping") && packed.includes("keep-inline") && packed.includes("https://example.test/track") && packed.includes("Shelf note"));
  check("record keys match the Market Discovery contracts", snapshot !== null && Object.keys(snapshot.searchSnapshot).join() === SEARCH_SNAPSHOT_KEYS.join() && Object.keys(snapshot.serpRecords[0] ?? {}).join() === SERP_RECORD_KEYS.join() && Object.keys(snapshot.sponsoredResults[0] ?? {}).join() === SPONSORED_RESULT_KEYS.join() && Object.keys(snapshot).join() === NORMALIZER_SNAPSHOT_KEYS.join() && Object.keys(built).join() === NORMALIZER_RESPONSE_KEYS.join() && Object.keys(built.statistics).join() === NORMALIZER_STATISTICS_KEYS.join());
  check("the search snapshot and SERP records satisfy the existing validators", snapshot !== null && createSerpValidator().validateSearchSnapshot(snapshot.searchSnapshot).length === 0 && createSponsoredValidator().validateRecords(snapshot.serpRecords).length === 0);
  const detected = snapshot === null ? [] : createSponsoredDetector().select(snapshot.serpRecords);
  check("sponsored results agree with the sponsored marker rule", snapshot !== null && detected.map((item) => item.url).join() === snapshot.sponsoredResults.map((item) => item.url).join());
  check("execution metadata stays separate from search metadata", built.metadata.run === "r1" && snapshot !== null && snapshot.metadata.run === "r1" && !("run" in snapshot.searchMetadata));
  check("statistics count the rows", built.statistics.serpCount === 4 && built.statistics.sponsoredCount === 3 && built.statistics.issueCount === 0 && built.statistics.executionTime === 0 && snapshot?.normalizationId === "normalization-1" && snapshot.origin === "OBSERVED" && snapshot.provenance === "DIRECT_SOURCE");

  const organic = source.snapshot && typeof source.snapshot === "object" && "raw" in source.snapshot ? (source.snapshot.raw as { organic_results: { title: string }[] }).organic_results[0] : null;
  if (organic) organic.title = "changed";
  (source.metadata as { run?: string }).run = "changed";
  try {
    if (snapshot) (snapshot.searchSnapshot.query as string) = "hacked";
    if (snapshot) (snapshot.serpRecords[0] as { title: string | null }).title = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: changing the provider response leaves the snapshot", snapshot?.searchSnapshot.query === "zebra offer" && snapshot.serpRecords[0]?.title === "Zebra Offer notes" && snapshot.metadata.run === "r1" && Object.isFrozen(snapshot) && Object.isFrozen(snapshot.searchSnapshot) && Object.isFrozen(snapshot.serpRecords) && Object.isFrozen(snapshot.sponsoredResults));

  const other = createSearchApiNormalizer({ now: () => 0, timestamp: () => T0 });
  check("Independent normalizer: normalizers do not share snapshots", normalizer.getSnapshot("normalization-1")?.searchSnapshot.query === "zebra offer" && other.getSnapshot("normalization-1") === null);
  const again = other.normalize(structuredClone(response));
  check("a second normalizer stores its own snapshot", again.snapshot?.normalizationId === "normalization-1" && again.snapshot.serpRecords.length === 4 && normalizer.getSnapshot("normalization-1") !== other.getSnapshot("normalization-1"));

  const blank = normalizer.normalize(null);
  check("Malformed Provider Response stores nothing", blank.status === "REJECTED" && has(blank.issues, /Malformed Provider Response/) && blank.snapshot === null && normalizer.getSnapshot("normalization-2") === null);
  const refused = normalizer.normalize({ status: "REJECTED", issues: [], snapshot: null, metadata: {}, statistics: { requestCount: 0, payloadBytes: 0, issueCount: 1, executionTime: 0 } });
  check("a refused provider response stores nothing", refused.status === "REJECTED" && has(refused.issues, /Malformed Provider Response/) && refused.snapshot === null);
  const withoutMeta = structuredClone(response) as { snapshot: { raw: Record<string, unknown> } };
  delete withoutMeta.snapshot.raw.search_metadata;
  const missingMeta = normalizer.normalize(withoutMeta);
  check("Missing Search Metadata stores nothing", missingMeta.status === "REJECTED" && has(missingMeta.issues, /Missing Search Metadata/) && missingMeta.snapshot === null);
  const badAds = structuredClone(response) as unknown as { snapshot: { raw: { ads: unknown } } };
  badAds.snapshot.raw.ads = { title: "Zebra Offer desk" };
  const malformedAds = normalizer.normalize(badAds);
  check("Malformed Ads stores nothing", malformedAds.status === "REJECTED" && has(malformedAds.issues, /Malformed Ads/) && malformedAds.snapshot === null);
  const badOrganic = structuredClone(response) as unknown as { snapshot: { raw: { organic_results: unknown } } };
  badOrganic.snapshot.raw.organic_results = "notes";
  const malformedOrganic = normalizer.normalize(badOrganic);
  check("Malformed Organic Results stores nothing", malformedOrganic.status === "REJECTED" && has(malformedOrganic.issues, /Malformed Organic Results/) && malformedOrganic.snapshot === null);
  const badSnapshot = structuredClone(response) as { snapshot: { snapshotId: string } };
  badSnapshot.snapshot.snapshotId = "BAD";
  const invalidSnapshot = normalizer.normalize(badSnapshot);
  check("Invalid Provider Snapshot stores nothing", invalidSnapshot.status === "REJECTED" && has(invalidSnapshot.issues, /Invalid Provider Snapshot/) && invalidSnapshot.snapshot === null);
  const badId = createSearchApiNormalizer({ now: () => 0, timestamp: () => T0, idFactory: () => "BAD" }).normalize(structuredClone(response));
  check("a corrupted normalization id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Invalid Provider Snapshot/) && badId.snapshot === null);

  const dir = join(process.cwd(), "src/lib/search-intelligence");
  const names = ["searchapi-normalizer.ts", "searchapi-mapper.ts", "searchapi-validator.ts", "searchapi-types.ts", "searchapi-context.ts", "searchapi-snapshot.ts"];
  check("six normalizer modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const files = listTs(dir);
  const bundled = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  const bare = code.map((line) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``"));
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("no live request in code", !code.some((line) => /fetch\(|serpapi|dataforseo|googleapis|oauth|node:http|node:https/i.test(line)));
  check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|clickbank|product-intelligence|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "searchapi-context.ts"), "utf8")));
  const market = listTs(join(process.cwd(), "src/lib/market-discovery"));
  check("Market Discovery does not import the normalizer", !market.some((file) => /search-intelligence|searchapi-normalizer/.test(readFileSync(file, "utf8"))));
  const providerDir = listTs(join(process.cwd(), "src/lib/search-provider"));
  check("the SearchApi provider does not import the normalizer", !providerDir.some((file) => /search-intelligence/.test(readFileSync(file, "utf8"))));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the normalizer`, !sources.some((file) => /search-intelligence\/|searchapi-normalizer/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`SEARCHAPI_NORMALIZER_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("SEARCHAPI_NORMALIZER_FAILURES=0");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "searchapi normalizer test failed");
  process.exit(1);
});
