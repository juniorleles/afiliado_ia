import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createAffiliateNetworkResolver } from "../src/lib/market-discovery/affiliate-network-resolver.ts";
import type { AffiliateProvider } from "../src/lib/market-discovery/affiliate-provider.ts";
import { AFFILIATE_CONTEXT_MEMBERS } from "../src/lib/market-discovery/affiliate-provider-context.ts";
import { createAffiliateProviderRegistry } from "../src/lib/market-discovery/affiliate-provider-registry.ts";
import { AFFILIATE_SNAPSHOT_KEYS } from "../src/lib/market-discovery/affiliate-provider-snapshot.ts";
import {
  AFFILIATE_ORIGINS,
  AFFILIATE_PROVENANCE,
  AFFILIATE_RECORD_KEYS,
  AFFILIATE_STATISTICS_KEYS,
  AFFILIATE_STATUSES,
  MATCH_METHODS,
  RESOLUTION_EVIDENCE_KEYS,
  RESOLVED_AFFILIATE_PRODUCT_KEYS,
  freezeDeepAffiliate,
} from "../src/lib/market-discovery/affiliate-provider-types.ts";
import { createAffiliateProviderValidator } from "../src/lib/market-discovery/affiliate-provider-validator.ts";
import { CLICKBANK_NETWORK, createClickBankProvider } from "../src/lib/market-discovery/providers/clickbank-provider.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));

function recordOf(name: string, vendor: string, gravity: number, over: Record<string, unknown> = {}) {
  return {
    productName: name,
    vendor,
    category: "Garden",
    affiliateUrl: "https://example.test/hop",
    commission: "50%",
    gravity,
    marketplaceMetadata: { listing: "supplied" },
    affiliateResources: ["https://example.test/assets/two", "https://example.test/assets/one"],
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
    marketReport: { reportId: "market-report-1", report: { observedProductSummary: { productNames: ["Other Name"] } } },
    providers: [CLICKBANK_NETWORK],
    catalogs: { [CLICKBANK_NETWORK]: [recordOf("Plain Offer", "Vendor North", 99), recordOf("Zebra Offer", "Vendor North", 12.5)] },
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function resolverOf() {
  let n = 0;
  return createAffiliateNetworkResolver({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `affiliate-resolution-${++n}`,
  });
}

function northProvider(): AffiliateProvider {
  return {
    network: "NORTH",
    resolve(observed) {
      return {
        issues: [],
        product: {
          observedProductName: observed.productName,
          observedVendor: observed.vendor,
          network: "NORTH",
          vendor: "Vendor North",
          productName: "North Listing",
          category: null,
          affiliateUrl: null,
          commission: null,
          gravity: null,
          marketplaceMetadata: {},
          affiliateResources: [],
          origin: "RESOLVED",
          provenance: "DIRECT_SOURCE",
        },
        evidence: {
          network: "NORTH",
          matchedProductName: "North Listing",
          matchedVendor: "Vendor North",
          matchMethod: "EXACT_PRODUCT_AND_VENDOR",
          marketplaceSource: "NORTH",
          evidenceMetadata: {},
          origin: "RESOLVED",
          provenance: "DIRECT_SOURCE",
        },
      };
    },
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

const validator = createAffiliateProviderValidator();
check("statuses are OK and REJECTED", AFFILIATE_STATUSES.join() === "OK,REJECTED");
check("origin is RESOLVED and provenance is DIRECT_SOURCE", AFFILIATE_ORIGINS.join() === "RESOLVED" && AFFILIATE_PROVENANCE.join() === "DIRECT_SOURCE");
check("match methods name an agreement or no agreement", MATCH_METHODS.join() === "EXACT_PRODUCT_AND_VENDOR,EXACT_PRODUCT,UNMATCHED");
check("context members name the product, report, providers, and catalogs", AFFILIATE_CONTEXT_MEMBERS.join() === "observedProduct,marketReport,providers,catalogs,executionMetadata,runtimeMetadata,configuration");
check("resolved product keys keep the affiliate fields", RESOLVED_AFFILIATE_PRODUCT_KEYS.join() === "observedProductName,observedVendor,network,vendor,productName,category,affiliateUrl,commission,gravity,marketplaceMetadata,affiliateResources,origin,provenance");
check("evidence keys keep the match fields", RESOLUTION_EVIDENCE_KEYS.join() === "network,matchedProductName,matchedVendor,matchMethod,marketplaceSource,evidenceMetadata,origin,provenance");
check("snapshot keys keep the products, evidence, report id, and time", AFFILIATE_SNAPSHOT_KEYS.join() === "resolutionId,products,evidence,marketReportId,createdAt,origin,provenance,metadata");
check("listing keys keep the supplied affiliate fields", AFFILIATE_RECORD_KEYS.join() === "productName,vendor,category,affiliateUrl,commission,gravity,marketplaceMetadata,affiliateResources");
check("statistics keys count providers and resolutions", AFFILIATE_STATISTICS_KEYS.join() === "providerCount,resolutionCount,issueCount,executionTime");
check("the ClickBank provider names its network", createClickBankProvider().network === CLICKBANK_NETWORK && createAffiliateProviderRegistry().list().join() === CLICKBANK_NETWORK);
check("Missing Observed Product: a missing envelope is rejected", has(validator.validateInput(null), /Missing Observed Product/));
check("Missing Provider: a missing provider list is rejected", has(validator.validateInput({ observedProduct: observedOf() }), /Missing Provider/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateMetadata({ nested: { a: 1 } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: true })), /Invalid Metadata/));

const source = inputOf();
const before = JSON.stringify(source);
const host = resolverOf();
const built = host.resolve(source);
if (built.status !== "OK") console.log(JSON.stringify(built.issues));
const product = built.products?.[0];
const evidence = built.evidence?.[0];
check("an observed product is resolved through the provider", built.status === "OK" && built.snapshot !== null && product !== null && evidence !== null && built.statistics.providerCount === 1 && built.statistics.resolutionCount === 1);
check("the agreeing listing is copied and a higher gravity listing is left aside", product?.network === CLICKBANK_NETWORK && product.productName === "Zebra Offer" && product.vendor === "Vendor North" && product.gravity === 12.5 && product.affiliateUrl === "https://example.test/hop" && product.commission === "50%" && product.category === "Garden" && product.affiliateResources.join("|") === "https://example.test/assets/two|https://example.test/assets/one");
check("the observed name stays with the resolution and the report name is not used", product?.observedProductName === "Zebra Offer" && product.observedVendor === "Vendor North" && product.marketplaceMetadata.listing === "supplied" && built.snapshot?.marketReportId === "market-report-1");
check("match evidence names the listing, the method, and the network", evidence?.matchedProductName === "Zebra Offer" && evidence.matchedVendor === "Vendor North" && evidence.matchMethod === "EXACT_PRODUCT_AND_VENDOR" && evidence.marketplaceSource === CLICKBANK_NETWORK && evidence.evidenceMetadata.listing === "supplied");
check("the page category is not written over the listing category", product?.category === "Garden");
check("the snapshot names the resolution and the run", built.snapshot?.resolutionId === "affiliate-resolution-1" && built.snapshot.createdAt === "2026-01-01T00:00:00.000Z" && built.metadata.run === "r1" && built.snapshot.origin === "RESOLVED");
check("the resolved product and evidence have exactly the requested fields", product !== undefined && evidence !== undefined && Object.keys(product).join() === RESOLVED_AFFILIATE_PRODUCT_KEYS.join() && Object.keys(evidence).join() === RESOLUTION_EVIDENCE_KEYS.join());
check("getSnapshot returns the stored resolution", host.getSnapshot("affiliate-resolution-1") === built.snapshot && host.getSnapshot("missing") === null);
check("a name agreement is used when the observation has no vendor", resolverOf().resolve({ observedProduct: observedOf({ vendor: null }), providers: [CLICKBANK_NETWORK], catalogs: { [CLICKBANK_NETWORK]: [recordOf("Zebra Offer", "Vendor North", 12.5)] } }).evidence?.[0]?.matchMethod === "EXACT_PRODUCT");
check("a different vendor leaves the listing fields empty", resolverOf().resolve({ observedProduct: observedOf(), providers: [CLICKBANK_NETWORK], catalogs: { [CLICKBANK_NETWORK]: [recordOf("Zebra Offer", "Vendor South", 80)] } }).products?.[0]?.productName === null && resolverOf().resolve({ observedProduct: observedOf(), providers: [CLICKBANK_NETWORK], catalogs: { [CLICKBANK_NETWORK]: [recordOf("Zebra Offer", "Vendor South", 80)] } }).products?.[0]?.gravity === null);
check("spacing and letter case still agree", resolverOf().resolve({ observedProduct: observedOf({ productName: "  zebra   offer ", vendor: " vendor north " }), providers: [CLICKBANK_NETWORK], catalogs: { [CLICKBANK_NETWORK]: [recordOf("Zebra Offer", "Vendor North", 12.5)] } }).products?.[0]?.productName === "Zebra Offer");
check("an empty catalog stores an unmatched resolution", resolverOf().resolve({ observedProduct: observedOf(), providers: [CLICKBANK_NETWORK], catalogs: { [CLICKBANK_NETWORK]: [] } }).evidence?.[0]?.matchMethod === "UNMATCHED");

const ordered = createAffiliateNetworkResolver({
  now: () => 0,
  timestamp: () => "2026-01-01T00:00:00.000Z",
  idFactory: () => "affiliate-resolution-1",
  registry: createAffiliateProviderRegistry([northProvider(), createClickBankProvider()]),
}).resolve({
  observedProduct: observedOf(),
  providers: ["NORTH", CLICKBANK_NETWORK],
  catalogs: { [CLICKBANK_NETWORK]: [recordOf("Zebra Offer", "Vendor North", 12.5)] },
});
check("providers stay in the requested order", ordered.products?.map((item) => item.network).join("|") === `NORTH|${CLICKBANK_NETWORK}` && ordered.products?.map((item) => item.productName).join("|") === "North Listing|Zebra Offer");

(source.catalogs[CLICKBANK_NETWORK][1] as { gravity: number }).gravity = 1;
(source.observedProduct as { productName: string }).productName = "changed";
(source.executionMetadata as { run: string }).run = "changed";
try {
  if (built.snapshot) (built.snapshot.resolutionId as string) = "hacked";
  if (product) (product as { gravity: number }).gravity = 0;
  if (product?.affiliateResources) (product.affiliateResources as string[])[0] = "hacked";
} catch {
  /* frozen */
}
check("No mutation: changing the input leaves the resolution unchanged", before !== JSON.stringify(source) && product?.productName === "Zebra Offer" && product.gravity === 12.5 && built.metadata.run === "r1" && product.affiliateResources[0] === "https://example.test/assets/two");
check("Immutable snapshot: the resolution and listing fields cannot be assigned into", built.snapshot?.resolutionId === "affiliate-resolution-1" && Object.isFrozen(built.snapshot) && Object.isFrozen(product) && Object.isFrozen(product?.affiliateResources) && Object.isFrozen(evidence) && Object.isFrozen(built.products));
check("freeze helper returns the same value", freezeDeepAffiliate(built.snapshot) === built.snapshot);

const left = resolverOf();
const right = resolverOf();
left.resolve(inputOf());
right.resolve(null);
check("Independent resolver: resolvers do not share snapshots", left.getSnapshot("affiliate-resolution-1")?.products[0]?.productName === "Zebra Offer" && right.getSnapshot("affiliate-resolution-1") === null);
check("deterministic resolution: a second resolver matches the same listing", resolverOf().resolve(inputOf()).products?.[0]?.gravity === 12.5 && resolverOf().resolve(inputOf()).evidence?.[0]?.matchMethod === "EXACT_PRODUCT_AND_VENDOR");

const missing = resolverOf().resolve(null);
check("a missing observed product stores nothing", missing.status === "REJECTED" && has(missing.issues, /Missing Observed Product/) && missing.snapshot === null && missing.products === null && missing.evidence === null);
const unnamed = resolverOf().resolve({ observedProduct: observedOf({ productName: " " }), providers: [CLICKBANK_NETWORK] });
check("a blank product name stores nothing", unnamed.status === "REJECTED" && has(unnamed.issues, /Missing Observed Product/) && unnamed.snapshot === null);
const absent = resolverOf().resolve(inputOf({ providers: ["UNKNOWN"], catalogs: {} }));
check("an unknown provider stores nothing", absent.status === "REJECTED" && has(absent.issues, /Missing Provider/) && absent.snapshot === null);
const badGravity = resolverOf().resolve(inputOf({ catalogs: { [CLICKBANK_NETWORK]: [recordOf("Zebra Offer", "Vendor North", 12.5, { gravity: "12.5" })] } }));
check("listing gravity that is not a number stores nothing", badGravity.status === "REJECTED" && has(badGravity.issues, /Invalid Metadata/) && badGravity.snapshot === null);
const nested = resolverOf().resolve(inputOf({ configuration: { nested: { a: 1 } } }));
check("invalid metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/) && nested.snapshot === null);
const ambiguous = resolverOf().resolve(inputOf({ catalogs: { [CLICKBANK_NETWORK]: [recordOf("Zebra Offer", "Vendor North", 1), recordOf("Zebra Offer", "Vendor North", 99)] } }));
check("an ambiguous match stores nothing", ambiguous.status === "REJECTED" && has(ambiguous.issues, /Ambiguous Match/) && ambiguous.snapshot === null && ambiguous.products === null);
const reportOnly = resolverOf().resolve({ marketReport: { reportId: "market-report-1" }, providers: [CLICKBANK_NETWORK] });
check("a market report without an observed product stores nothing", reportOnly.status === "REJECTED" && has(reportOnly.issues, /Missing Observed Product/) && reportOnly.snapshot === null);
const corrupted = createAffiliateNetworkResolver({ now: () => 0, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "BAD" }).resolve(inputOf());
check("a corrupted resolution id stores nothing", corrupted.status === "REJECTED" && has(corrupted.issues, /Invalid Metadata/) && corrupted.snapshot === null);

const dir = join(process.cwd(), "src/lib/market-discovery");
const names = ["affiliate-network-resolver.ts", "affiliate-provider-registry.ts", "affiliate-provider.ts", "affiliate-provider-context.ts", "affiliate-provider-validator.ts", "affiliate-provider-types.ts", "affiliate-provider-snapshot.ts"];
const files = readdirSync(dir).filter((file) => names.includes(file));
check("seven resolver modules exist", files.sort().join() === names.slice().sort().join());
check("the ClickBank provider module exists", readFileSync(join(dir, "providers/clickbank-provider.ts"), "utf8").includes("CLICKBANK_NETWORK"));
const paths = [...names.map((file) => join(dir, file)), join(dir, "providers/clickbank-provider.ts")];
const lines = paths.flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/));
const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
const code = lines.filter(isCode);
const stripStrings = (line: string) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
const bare = code.map(stripStrings);
check("no product names", !lines.some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
check("no live request in code", !code.some((line) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|DOMParser|cheerio/i.test(line)));
check("no ordering, model calls, or outside catalogs in code", !bare.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|anthropic|openai|product-intelligence|clickbank-importer|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
check("no environment switches", !code.some((line) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(line)));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "affiliate-provider-context.ts"), "utf8")));
check("the provider contract stays a contract", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "affiliate-provider.ts"), "utf8")));
const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[2]);
check("imports were found", imports.length >= 4);
check("every import stays inside the resolver or the ClickBank provider", imports.every((from) => /^\.\/(affiliate-network-resolver|affiliate-provider-registry|affiliate-provider|affiliate-provider-context|affiliate-provider-validator|affiliate-provider-types|affiliate-provider-snapshot|providers\/clickbank-provider)$/.test(from) || /^\.\.\/(affiliate-provider|affiliate-provider-validator|affiliate-provider-types)$/.test(from)));
const earlier = readdirSync(dir).filter((file) => /^(google-search|google-serp|serp|sponsored|landing-page|product|clickbank|market)-[a-z]+\.ts$/.test(file));
check("earlier market discovery modules do not import the affiliate resolver", earlier.every((file) => !/from ["']\.\/affiliate-/.test(readFileSync(join(dir, file), "utf8"))));
const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence"];
for (const folder of folders) {
  const sources = listTs(join(process.cwd(), "src/lib", folder));
  check(`${folder} modules do not import the affiliate resolver`, !sources.some((file) => /market-discovery|affiliate-network-resolver/.test(readFileSync(file, "utf8"))));
}

if (failures > 0) {
  console.log(`AFFILIATE_NETWORK_RESOLVER_FAILURES=${failures}`);
  process.exit(1);
}
console.log("AFFILIATE_NETWORK_RESOLVER_FAILURES=0");
