import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClickBankClient } from "../src/lib/market-discovery/clickbank-client.ts";
import { CLICKBANK_CONTEXT_MEMBERS } from "../src/lib/market-discovery/clickbank-context.ts";
import { createClickBankMatcher } from "../src/lib/market-discovery/clickbank-matcher.ts";
import { createClickBankResolver } from "../src/lib/market-discovery/clickbank-resolver.ts";
import { RESOLUTION_SNAPSHOT_KEYS } from "../src/lib/market-discovery/clickbank-snapshot.ts";
import {
  CLICKBANK_ORIGINS,
  CLICKBANK_PROVENANCE,
  CLICKBANK_STATISTICS_KEYS,
  CLICKBANK_STATUSES,
  MARKETPLACE_RECORD_KEYS,
  MATCH_CONFIDENCE,
  MATCH_METHODS,
  RESOLUTION_EVIDENCE_KEYS,
  RESOLVED_PRODUCT_KEYS,
  freezeDeepClickBank,
} from "../src/lib/market-discovery/clickbank-types.ts";
import { createClickBankValidator } from "../src/lib/market-discovery/clickbank-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

function money(amount: number, text: string) {
  return { amount, currency: "USD", text };
}

function recordOf(name: string, vendor: string, gravity: number, over: Record<string, unknown> = {}) {
  return {
    productName: name,
    vendor,
    marketplaceUrl: "https://example.test/market/zebra",
    gravity,
    initialSale: money(47, "$47.00"),
    averageSale: money(52, "$52.00"),
    averageRebill: money(19, "$19.00"),
    commissionType: "percentage",
    category: "Garden",
    language: "en-US",
    affiliateResources: ["https://example.test/assets/two", "https://example.test/assets/one"],
    marketplaceMetadata: { listing: "supplied" },
    ...over,
  };
}

function observedOf(over: Record<string, unknown> = {}) {
  return {
    landingPageId: "page-1",
    productName: "Zebra Offer",
    brand: "North Brand",
    vendor: "Vendor North",
    primaryOffer: "One bottle listed on the page.",
    primaryDomain: "offers.example.test",
    offerUrl: "https://example.test/buy",
    category: "Outdoor",
    language: "en",
    visiblePrice: "$47.00",
    currency: "USD",
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    observedProduct: observedOf(),
    marketplaceRecords: [recordOf("Plain Offer", "Vendor North", 99), recordOf("Zebra Offer", "Vendor North", 12.5)],
    marketplaceSource: "supplied-catalog",
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function resolverOf() {
  let n = 0;
  return createClickBankResolver({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `resolution-${++n}`,
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

const validator = createClickBankValidator();
check("statuses are OK and REJECTED", CLICKBANK_STATUSES.join() === "OK,REJECTED");
check("origin is RESOLVED and provenance is DIRECT_SOURCE", CLICKBANK_ORIGINS.join() === "RESOLVED" && CLICKBANK_PROVENANCE.join() === "DIRECT_SOURCE");
check("match methods name an agreement or no agreement", MATCH_METHODS.join() === "EXACT_PRODUCT_AND_VENDOR,EXACT_PRODUCT,UNMATCHED");
check("match confidence names the fields that agreed", MATCH_CONFIDENCE.join() === "CONFIRMED,NAME_ONLY,UNMATCHED");
check("context members name the observed product, listings, and metadata", CLICKBANK_CONTEXT_MEMBERS.join() === "observedProduct,marketplaceRecords,marketplaceSource,executionMetadata,runtimeMetadata,configuration");
check("resolved product keys keep the listing fields", RESOLVED_PRODUCT_KEYS.join() === "observedProductName,observedVendor,vendor,product,marketplaceUrl,gravity,initialSale,averageSale,averageRebill,commissionType,category,language,affiliateResources,marketplaceMetadata,origin,provenance");
check("evidence keys keep the match fields", RESOLUTION_EVIDENCE_KEYS.join() === "matchedProductName,matchedVendor,matchMethod,matchConfidence,marketplaceSource,evidenceMetadata,origin,provenance");
check("snapshot keys keep the id, product, evidence, and time", RESOLUTION_SNAPSHOT_KEYS.join() === "resolutionId,product,evidence,createdAt,origin,provenance,metadata");
check("listing keys keep the supplied marketplace fields", MARKETPLACE_RECORD_KEYS.join() === "productName,vendor,marketplaceUrl,gravity,initialSale,averageSale,averageRebill,commissionType,category,language,affiliateResources,marketplaceMetadata");
check("statistics keys count listings and issues", CLICKBANK_STATISTICS_KEYS.join() === "catalogCount,issueCount,executionTime");
check("Missing ObservedProduct: a missing envelope is rejected", has(validator.validateInput(null), /Missing ObservedProduct/));
check("Invalid Marketplace Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Marketplace Metadata/));
check("Invalid Marketplace Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Marketplace Metadata/));
check("Ambiguous Match: two agreeing listings are rejected", has(createClickBankMatcher().match(observedOf() as never, [recordOf("Zebra Offer", "Vendor North", 1) as never, recordOf("Zebra Offer", "Vendor North", 99) as never]).issues, /Ambiguous Match/));
check("Corrupted Resolution: a missing snapshot is rejected", has(validator.validateResolution(null), /Corrupted Resolution/));

const source = inputOf();
const before = JSON.stringify(source);
const host = resolverOf();
const built = host.resolve(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const product = built.product;
const evidence = built.evidence;
check("an observed product is resolved", built.status === "OK" && built.snapshot !== null && product !== null && evidence !== null && built.statistics.catalogCount === 2);
check("the agreeing listing is copied and a higher gravity listing is left aside", product?.product === "Zebra Offer" && product.vendor === "Vendor North" && product.gravity === 12.5 && product.marketplaceUrl === "https://example.test/market/zebra" && product.initialSale?.amount === 47 && product.initialSale.currency === "USD" && product.initialSale.text === "$47.00" && product.averageSale?.text === "$52.00" && product.averageRebill?.text === "$19.00" && product.commissionType === "percentage" && product.category === "Garden" && product.language === "en-US" && product.affiliateResources.join("|") === "https://example.test/assets/two|https://example.test/assets/one");
check("the observed name stays with the resolution", product?.observedProductName === "Zebra Offer" && product.observedVendor === "Vendor North" && product.marketplaceMetadata.listing === "supplied" && product.origin === "RESOLVED" && product.provenance === "DIRECT_SOURCE");
check("match evidence names the listing, the method, and the source", evidence?.matchedProductName === "Zebra Offer" && evidence.matchedVendor === "Vendor North" && evidence.matchMethod === "EXACT_PRODUCT_AND_VENDOR" && evidence.matchConfidence === "CONFIRMED" && evidence.marketplaceSource === "supplied-catalog" && evidence.evidenceMetadata.listing === "supplied");
check("the page category is not written over the listing category", product?.category === "Garden");
check("the snapshot names the resolution and the run", built.snapshot?.resolutionId === "resolution-1" && built.snapshot.createdAt === "2026-01-01T00:00:00.000Z" && built.metadata.run === "r1" && built.snapshot.origin === "RESOLVED");
check("the resolved product and evidence have exactly the requested fields", product !== null && evidence !== null && Object.keys(product).join() === RESOLVED_PRODUCT_KEYS.join() && Object.keys(evidence).join() === RESOLUTION_EVIDENCE_KEYS.join() && Object.keys(product.initialSale ?? {}).join() === "amount,currency,text");
check("getSnapshot returns the stored resolution", host.getSnapshot("resolution-1") === built.snapshot && host.getSnapshot("missing") === null);
check("a name agreement is used when the observation has no vendor", resolverOf().resolve({ observedProduct: observedOf({ vendor: null }), marketplaceRecords: [recordOf("Zebra Offer", "Vendor North", 12.5)] }).evidence?.matchConfidence === "NAME_ONLY");
check("a different vendor leaves the listing fields empty", resolverOf().resolve({ observedProduct: observedOf(), marketplaceRecords: [recordOf("Zebra Offer", "Vendor South", 80)] }).product?.product === null && resolverOf().resolve({ observedProduct: observedOf(), marketplaceRecords: [recordOf("Zebra Offer", "Vendor South", 80)] }).product?.gravity === null);
check("spacing and letter case still agree", resolverOf().resolve({ observedProduct: observedOf({ productName: "  zebra   offer ", vendor: " vendor north " }), marketplaceRecords: [recordOf("Zebra Offer", "Vendor North", 12.5)] }).product?.product === "Zebra Offer");
check("an empty catalog stores an unmatched resolution", resolverOf().resolve({ observedProduct: observedOf(), marketplaceRecords: [] }).evidence?.matchMethod === "UNMATCHED");
check("a bare observed product stores an unmatched resolution", resolverOf().resolve(observedOf()).evidence?.marketplaceSource === "CLICKBANK" && resolverOf().resolve(observedOf()).product?.gravity === null);
check("the client copies the supplied listing", createClickBankClient().read(recordOf("Zebra Offer", "Vendor North", 12.5)).record?.gravity === 12.5);

(source.marketplaceRecords[1] as { gravity: number }).gravity = 1;
(source.observedProduct as { productName: string }).productName = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.resolutionId as string) = "hacked";
  if (product) (product as { gravity: number }).gravity = 0;
  if (product?.affiliateResources) (product.affiliateResources as string[])[0] = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the resolution unchanged", before !== JSON.stringify(source) && product?.product === "Zebra Offer" && product.gravity === 12.5 && built.metadata.run === "r1" && product.affiliateResources[0] === "https://example.test/assets/two");
check("Immutable snapshot: the resolution and listing fields cannot be assigned into", built.snapshot?.resolutionId === "resolution-1" && Object.isFrozen(built.snapshot) && Object.isFrozen(product) && Object.isFrozen(product?.initialSale) && Object.isFrozen(product?.affiliateResources) && Object.isFrozen(evidence));
check("freeze helper returns the same value", freezeDeepClickBank(built.snapshot) === built.snapshot);

const left = resolverOf();
const right = resolverOf();
left.resolve(inputOf());
right.resolve(null);
check("Independent resolver: resolvers do not share snapshots", left.getSnapshot("resolution-1")?.product.product === "Zebra Offer" && right.getSnapshot("resolution-1") === null);
check("deterministic resolution: a second resolver matches the same listing", resolverOf().resolve(inputOf()).product?.gravity === 12.5 && resolverOf().resolve(inputOf()).evidence?.matchMethod === "EXACT_PRODUCT_AND_VENDOR");

const missing = resolverOf().resolve(null);
check("a missing observed product stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing ObservedProduct/) && missing.snapshot === null && missing.product === null && missing.evidence === null);
const unnamed = resolverOf().resolve({ observedProduct: observedOf({ productName: " " }) });
check("a blank product name stores nothing", unnamed.status === "REJECTED" && has(unnamed.issues, /Missing ObservedProduct/) && unnamed.snapshot === null);
const badGravity = resolverOf().resolve(inputOf({ marketplaceRecords: [recordOf("Zebra Offer", "Vendor North", 12.5, { gravity: "12.5" })] }));
check("listing gravity that is not a number stores nothing", badGravity.status === "REJECTED" && has(badGravity.issues, /Invalid Marketplace Metadata/) && badGravity.snapshot === null);
const nested = resolverOf().resolve(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Marketplace Metadata/) && nested.snapshot === null);
const ambiguous = resolverOf().resolve(inputOf({ marketplaceRecords: [recordOf("Zebra Offer", "Vendor North", 1), recordOf("Zebra Offer", "Vendor North", 99)] }));
check("an ambiguous match stores nothing", ambiguous.status === "REJECTED" && has(ambiguous.issues, /Ambiguous Match/) && ambiguous.snapshot === null && ambiguous.product === null);
const corrupted = createClickBankResolver({ now: () => 0, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "BAD" }).resolve(inputOf());
check("a corrupted resolution stores nothing", corrupted.status === "REJECTED" && has(corrupted.issues, /Corrupted Resolution/) && corrupted.snapshot === null);

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["clickbank-resolver.ts", "clickbank-client.ts", "clickbank-matcher.ts", "clickbank-validator.ts", "clickbank-types.ts", "clickbank-context.ts", "clickbank-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("seven resolver modules exist", files.sort().join() === names.slice().sort().join());
const lines = files.flatMap((file) => readFileSync(join(dir, file), "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|product-intelligence|clickbank-importer|google-search|google-ads|campaign/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "clickbank-context.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the resolver", imports.every((from) => /^\.\/clickbank-(resolver|client|matcher|validator|types|context|snapshot)$/.test(from)));
const earlier = readdirSync(dir).filter((file) => /^(google-search|google-serp|serp|sponsored|landing-page|product)-[a-z]+\.ts$/.test(file));
check("earlier market discovery modules do not import the resolver", earlier.every((file) => !/from ["']\.\/clickbank-/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the marketplace resolver`, !sources.some((file) => /market-discovery|clickbank-resolver/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`CLICKBANK_RESOLVER_FAILURES=${failures}`);
  process.exit(1);
}
console.log("CLICKBANK_RESOLVER_FAILURES=0");
