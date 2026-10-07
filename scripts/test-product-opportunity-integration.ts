import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createProductOpportunityAdapter } from "../src/lib/product-intelligence/product-opportunity-adapter.ts";
import { PRODUCT_OPPORTUNITY_CONTEXT_MEMBERS, PRODUCT_OPPORTUNITY_GRAPH_KINDS } from "../src/lib/product-intelligence/product-opportunity-context.ts";
import { createProductOpportunityMapper } from "../src/lib/product-intelligence/product-opportunity-mapper.ts";
import { createProductOpportunityValidator } from "../src/lib/product-intelligence/product-opportunity-validator.ts";
import {
  PRODUCT_OPPORTUNITY_EVIDENCE_MAPPING_KEYS,
  PRODUCT_OPPORTUNITY_ORIGINS,
  PRODUCT_OPPORTUNITY_PROVENANCE,
  PRODUCT_OPPORTUNITY_SNAPSHOT_KEYS,
  PRODUCT_OPPORTUNITY_STAGES,
  PRODUCT_OPPORTUNITY_STATUSES,
  createProductOpportunitySnapshot,
  freezeDeepProductOpportunity,
} from "../src/lib/product-intelligence/product-opportunity-snapshot.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function factsOf(over: Record<string, unknown> = {}) {
  return {
    productName: "Alpha Tonic",
    vendor: "Vendor North",
    category: "Health & Fitness",
    landingPage: "https://example.test/offer",
    ...over,
  };
}

function pageOf() {
  return { headline: "Alpha Offer", primaryCta: "Get Alpha", priceVisibility: "PRESENT" };
}

function searchOf() {
  return {
    searchResultPresence: "PRESENT",
    officialWebsite: "https://example.test/offer",
    faqResults: ["What is the offer?"],
    reviewWebsites: ["https://reviews.example.test/alpha"],
  };
}

function competitionOf() {
  return { numberOfAdvertisers: 3, brandPresence: "PRESENT" };
}

function commercialOf() {
  return {
    directPurchaseIntent: "PRESENT",
    priceVisibility: "PRESENT",
    vendorReputation: "PRESENT",
    checkoutPresence: "PRESENT",
    recurringBilling: "PRESENT",
    upsellPresence: "PRESENT",
  };
}

function graphOf(presence: Record<string, "PRESENT" | "ABSENT"> = {}) {
  return {
    nodes: PRODUCT_OPPORTUNITY_GRAPH_KINDS.map((kind) => ({ id: kind, kind, present: presence[kind] ?? "PRESENT" })),
    edges: [
      { from: "productFacts", to: "landingPageEvidence" },
      { from: "productFacts", to: "searchEvidence" },
      { from: "searchEvidence", to: "competitionEvidence" },
      { from: "competitionEvidence", to: "commercialEvidence" },
    ],
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    productIntelligenceReport: { importedProduct: { productName: "Alpha Tonic" } },
    evidenceGraph: graphOf(),
    productFacts: factsOf(),
    landingPageEvidence: pageOf(),
    searchEvidence: searchOf(),
    competitionEvidence: competitionOf(),
    commercialEvidence: commercialOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function adapterOf() {
  let n = 0;
  return createProductOpportunityAdapter({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `mapping-${++n}`,
  });
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTs(p));
    else if (name.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

async function main() {
  const validator = createProductOpportunityValidator();
  const mapper = createProductOpportunityMapper();
  check("analysis statuses are OK then REJECTED", PRODUCT_OPPORTUNITY_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED", PRODUCT_OPPORTUNITY_ORIGINS.join() === "OBSERVED");
  check("provenance is DIRECT_SOURCE", PRODUCT_OPPORTUNITY_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members are in the requested order", PRODUCT_OPPORTUNITY_CONTEXT_MEMBERS.join() === "productIntelligenceReport,evidenceGraph,productFacts,landingPageEvidence,searchEvidence,competitionEvidence,commercialEvidence,executionMetadata,runtimeMetadata,configuration");
  check("pipeline stages are in the requested order", PRODUCT_OPPORTUNITY_STAGES.join() === "ProductIntelligence,DiscoveryContext,OpportunityContext,EvidenceProvider,SignalPipeline");
  check("mapping keys are stages, entries, origin, provenance", PRODUCT_OPPORTUNITY_EVIDENCE_MAPPING_KEYS.join() === "stages,entries,origin,provenance");
  check("snapshot keys are in the requested order", PRODUCT_OPPORTUNITY_SNAPSHOT_KEYS.join() === "mappingId,productName,landingPage,createdAt,metadata");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Missing ProductFacts: a missing facts record is rejected", has(validator.validateProductFacts({ evidenceGraph: graphOf() }), /Missing ProductFacts/));
  check("Missing ProductFacts: an empty product name is rejected", has(validator.validateProductFacts({ productFacts: { vendor: "Vendor North" } }), /Missing ProductFacts/));
  check("Missing Evidence Graph: a missing graph is rejected", has(validator.validateEvidenceGraph({ productFacts: factsOf() }), /Missing Evidence Graph/));
  check("Invalid Mapping: a non-record graph is rejected", has(validator.validateEvidenceGraph({ productFacts: factsOf(), evidenceGraph: [] }), /Invalid Mapping/));
  check("Invalid Mapping: a present bundle without a record is rejected", has(validator.validateEvidenceGraph({ productFacts: factsOf(), evidenceGraph: graphOf(), landingPageEvidence: undefined }), /Invalid Mapping/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));

  const snap = createProductOpportunitySnapshot({
    mappingId: "mapping-1",
    productName: "Alpha Tonic",
    landingPage: "https://example.test/offer",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === PRODUCT_OPPORTUNITY_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepProductOpportunity never throws", freezeDeepProductOpportunity(1) === 1 && Object.isFrozen(freezeDeepProductOpportunity({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const mapped = mapper.map(inputOf(), "2026-01-01T00:00:00.000Z", { run: "r1" });
  check("the mapper restates a discovery candidate", mapped.mapped?.discoveryContext.id === "alpha-tonic" && mapped.mapped?.discoveryContext.source === "product-intelligence" && mapped.mapped?.discoveryContext.url === "https://example.test/offer" && mapped.mapped?.discoveryContext.title === "Alpha Tonic" && mapped.mapped?.discoveryContext.status === "NEW");
  check("the mapper restates an opportunity context", mapped.mapped?.opportunityContext.candidate?.title === "Alpha Tonic" && mapped.mapped?.opportunityContext.importedMetadata.productName === "Alpha Tonic" && mapped.mapped?.opportunityContext.runtime.host === "h1");

  const adapter = adapterOf();
  const built = adapter.adapt(inputOf());
  check("the adapter returns OK with discovery, opportunity, evidence provider, mapping, snapshot, and metadata", built.status === "OK" && built.discoveryContext !== null && built.opportunityContext !== null && built.evidenceProvider !== null && built.evidenceMapping !== null && built.snapshot !== null && built.issues.length === 0 && built.executionTime === 0);
  check("Discovery Ready Context matches the discovery candidate fields", built.discoveryContext!.id === "alpha-tonic" && built.discoveryContext!.url === "https://example.test/offer" && built.discoveryContext!.status === "NEW" && built.discoveryContext!.createdAt === "2026-01-01T00:00:00.000Z");
  check("Opportunity Ready Context carries the candidate and flat imported metadata", built.opportunityContext!.candidate?.id === "alpha-tonic" && built.opportunityContext!.importedMetadata.vendor === "Vendor North" && built.opportunityContext!.executionMetadata.run === "r1" && built.opportunityContext!.configuration.mode === "OFFLINE" && Object.keys(built.opportunityContext!.extensions).length === 0);
  check("Evidence Provider context carries the resolved bundles", built.evidenceProvider!.resolvedProductData.productFacts !== undefined && built.evidenceProvider!.resolvedProductData.evidenceGraph !== undefined && built.evidenceProvider!.candidate?.url === "https://example.test/offer");
  check("evidence mapping follows the pipeline and restates signal fields", built.evidenceMapping!.stages.join() === PRODUCT_OPPORTUNITY_STAGES.join() && built.evidenceMapping!.origin === "OBSERVED" && built.evidenceMapping!.provenance === "DIRECT_SOURCE" && built.evidenceMapping!.entries.some((entry) => entry.to === "SignalPipeline.PURCHASE_INTENT" && entry.text === "PRESENT") && built.evidenceMapping!.entries.some((entry) => entry.to === "SignalPipeline.OFFER_VISIBILITY" && entry.text === "Get Alpha") && built.evidenceMapping!.entries.some((entry) => entry.to === "DiscoveryContext.title"));
  check("a mapping record has exactly the requested fields", Object.keys(built.evidenceMapping!).join() === PRODUCT_OPPORTUNITY_EVIDENCE_MAPPING_KEYS.join());
  check("the mapping validates", validator.validateMapping(built.evidenceMapping).length === 0);
  check("the snapshot stores mapping id, product name, and landing page", built.snapshot!.mappingId === "mapping-1" && built.snapshot!.productName === "Alpha Tonic" && built.snapshot!.landingPage === "https://example.test/offer");
  check("getSnapshot returns the stored snapshot", adapter.getSnapshot("mapping-1") === built.snapshot && adapter.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.discoveryContext) && Object.isFrozen(built.opportunityContext) && Object.isFrozen(built.evidenceMapping) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.evidenceProvider!.resolvedProductData));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const partial = adapterOf().adapt(inputOf({
    evidenceGraph: graphOf({ LandingPageEvidence: "ABSENT", CommercialEvidence: "ABSENT" }),
    landingPageEvidence: undefined,
    commercialEvidence: undefined,
  }));
  check("absent bundles stay out of the evidence provider and the signal mapping", partial.status === "OK" && partial.evidenceProvider!.resolvedProductData.landingPageEvidence === undefined && partial.evidenceProvider!.resolvedProductData.searchEvidence !== undefined && !partial.evidenceMapping!.entries.some((entry) => entry.to === "SignalPipeline.PURCHASE_INTENT") && partial.evidenceMapping!.entries.some((entry) => entry.to === "SignalPipeline.MARKET_DEMAND"));

  const missing = adapterOf().adapt(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.discoveryContext === null);
  const noFacts = adapterOf().adapt(inputOf({ productFacts: undefined }));
  check("Missing ProductFacts is refused", noFacts.status === "REJECTED" && has(noFacts.issues, /Missing ProductFacts/));
  const noGraph = adapterOf().adapt(inputOf({ evidenceGraph: undefined }));
  check("Missing Evidence Graph is refused", noGraph.status === "REJECTED" && has(noGraph.issues, /Missing Evidence Graph/));
  const badMap = adapterOf().adapt(inputOf({ landingPageEvidence: undefined }));
  check("Invalid Mapping is refused", badMap.status === "REJECTED" && has(badMap.issues, /Invalid Mapping/));
  const nested = adapterOf().adapt(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  check("a refused adapt stores no snapshot", adapterOf().getSnapshot("mapping-1") === null);

  const onceA = adapterOf().adapt(inputOf());
  const onceB = adapterOf().adapt(inputOf());
  check("Deterministic mapping: the same records yield the same contexts and snapshot", onceA.status === "OK" && JSON.stringify(onceA.discoveryContext) === JSON.stringify(onceB.discoveryContext) && JSON.stringify(onceA.evidenceMapping) === JSON.stringify(onceB.evidenceMapping) && JSON.stringify(onceA.snapshot) === JSON.stringify(onceB.snapshot));

  const source = inputOf();
  const observed = adapterOf().adapt(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.productFacts as { productName: string }).productName = "changed";
  (source.commercialEvidence as { directPurchaseIntent: string }).directPurchaseIntent = "ABSENT";
  check("No mutation: changing the input after adapt leaves the mapping unchanged", observed.discoveryContext!.title === "Alpha Tonic" && observed.metadata.run === "r1" && observed.evidenceMapping!.entries.some((entry) => entry.to === "SignalPipeline.PURCHASE_INTENT"));
  try {
    (observed.discoveryContext!.title as string) = "hacked";
    (observed.snapshot!.productName as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable mapping: the contexts and snapshot cannot be assigned into", observed.discoveryContext!.title === "Alpha Tonic" && observed.snapshot!.productName === "Alpha Tonic");

  const left = adapterOf();
  const right = adapterOf();
  left.adapt(inputOf());
  right.adapt(null);
  check("Independent adapter: adapters do not share snapshots", left.getSnapshot("mapping-1")?.productName === "Alpha Tonic" && right.getSnapshot("mapping-1") === null);

  const dir = join(process.cwd(), "src/lib/product-intelligence");
  const files = readdirSync(dir).filter((f) => /^product-opportunity-[a-z]+\.ts$/.test(f));
  check("five product opportunity modules exist: adapter, context, mapper, snapshot, validator", files.sort().join() === "product-opportunity-adapter.ts,product-opportunity-context.ts,product-opportunity-mapper.ts,product-opportunity-snapshot.ts,product-opportunity-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP or live fetch in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
  check("no scoring, ranking, weights, formulas, recommendations, or optimization in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend|optimiz/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "product-opportunity-context.ts"), "utf8")));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check("every value import stays inside the product-opportunity modules", imports.filter((i) => !i.typeOnly).every((i) => /^\.\/product-opportunity-[a-z]+$/.test(i.from)));
  check("type imports connect Discovery and Opportunity contracts only", imports.filter((i) => i.typeOnly && !i.from.startsWith("./")).every((i) => i.from === "../discovery/discovery-types" || i.from === "../opportunity/opportunity-signal-context" || i.from === "../opportunity/providers/evidence-provider-context"));
  const prefixes = ["clickbank", "landing-page", "google-search", "competition", "commercial", "product-report"];
  for (const prefix of prefixes) {
    const siblings = readdirSync(dir).filter((f) => new RegExp(`^${prefix}[a-z-]*\\.ts$`).test(f) && !f.startsWith("product-opportunity-"));
    check(`${prefix} modules do not import the product opportunity adapter`, siblings.every((f) => !/product-opportunity-/.test(readFileSync(join(dir, f), "utf8"))));
  }
  const opportunity = listTs(join(process.cwd(), "src/lib/opportunity"));
  const discovery = listTs(join(process.cwd(), "src/lib/discovery"));
  check("Opportunity modules are unchanged by this adapter", !opportunity.some((f) => /product-opportunity-|product-intelligence/.test(readFileSync(f, "utf8"))));
  check("Discovery modules are unchanged by this adapter", !discovery.some((f) => /product-opportunity-|product-intelligence/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nProduct opportunity integration: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
