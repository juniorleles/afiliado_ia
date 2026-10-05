import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createGoogleSearchIntelligence } from "../src/lib/product-intelligence/google-search-intelligence.ts";
import { GOOGLE_SEARCH_CONTEXT_MEMBERS } from "../src/lib/product-intelligence/google-search-context.ts";
import { createGoogleSearchParser } from "../src/lib/product-intelligence/google-search-parser.ts";
import { createGoogleSearchValidator } from "../src/lib/product-intelligence/google-search-validator.ts";
import {
  GOOGLE_SEARCH_EVIDENCE_KEYS,
  GOOGLE_SEARCH_ORIGINS,
  GOOGLE_SEARCH_PRESENCE,
  GOOGLE_SEARCH_PROVENANCE,
  GOOGLE_SEARCH_SNAPSHOT_KEYS,
  GOOGLE_SEARCH_STATISTICS_KEYS,
  GOOGLE_SEARCH_STATUSES,
  createGoogleSearchSnapshot,
  freezeDeepGoogleSearch,
} from "../src/lib/product-intelligence/google-search-evidence.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function htmlOf() {
  return `<!doctype html>
<div>
  <a data-field="organic" href="https://example.test/offer">A restated organic result</a>
  <a data-field="officialWebsite" href="https://example.test/offer">Official site</a>
  <a data-field="marketplace" href="https://example.test/marketplace/alpha">Marketplace listing</a>
  <a data-field="review" href="https://reviews.example.test/alpha">Review site</a>
  <a data-field="comparison" href="https://compare.example.test/alpha">Comparison site</a>
  <p data-field="faq">What is the offer?</p>
  <a data-field="relatedSearch">alpha tonic reviews</a>
  <span data-field="suggestion">alpha tonic official</span>
  <div data-field="peopleAlsoAsk">How is it used?</div>
  <div data-field="knowledgePanel">A restated panel.</div>
  <a data-field="sponsored" data-advertiser="official" href="https://example.test/offer">Official</a>
  <a data-field="sponsored" data-advertiser="affiliate" href="https://hops.example.test/a">Affiliate</a>
  <a data-field="sponsored" data-advertiser="marketplace" href="https://example.test/marketplace/alpha">Market</a>
</div>`;
}

function factsOf(over: Record<string, unknown> = {}) {
  return {
    productName: "Alpha Tonic",
    vendor: "Vendor North",
    category: "Health & Fitness",
    landingPage: "https://example.test/offer",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    productFacts: factsOf(),
    productName: "Alpha Tonic",
    vendor: "Vendor North",
    category: "Health & Fitness",
    landingPage: "https://example.test/offer",
    searchContext: htmlOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function engineOf() {
  let n = 0;
  return createGoogleSearchIntelligence({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `evidence-${++n}`,
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
  const validator = createGoogleSearchValidator();
  const parser = createGoogleSearchParser();
  check("analysis statuses are OK then REJECTED", GOOGLE_SEARCH_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED", GOOGLE_SEARCH_ORIGINS.join() === "OBSERVED");
  check("provenance is DIRECT_SOURCE", GOOGLE_SEARCH_PROVENANCE.join() === "DIRECT_SOURCE");
  check("presence tokens are PRESENT then ABSENT", GOOGLE_SEARCH_PRESENCE.join() === "PRESENT,ABSENT");
  check("context members are in the requested order", GOOGLE_SEARCH_CONTEXT_MEMBERS.join() === "productFacts,productName,vendor,category,landingPage,searchContext,executionMetadata,runtimeMetadata,configuration");
  check("evidence keys are in the requested order", GOOGLE_SEARCH_EVIDENCE_KEYS.join() === "searchResultPresence,officialWebsite,marketplacePresence,reviewWebsites,comparisonWebsites,faqResults,relatedSearches,searchSuggestions,peopleAlsoAskPresence,knowledgePanelPresence,sponsoredResultPresence,sponsoredResultCount,officialAdvertiser,affiliateAdvertisers,marketplaceAdvertisers,productName,vendor,category,landingPage,origin,provenance,sourceUrl,sourceFacts,metadata");
  check("snapshot keys are in the requested order", GOOGLE_SEARCH_SNAPSHOT_KEYS.join() === "evidenceId,productName,landingPage,createdAt,metadata");
  check("statistics keys are in the requested order", GOOGLE_SEARCH_STATISTICS_KEYS.join() === "signalCount,sponsoredResultCount,issueCount,executionTime");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Missing ProductFacts: a missing facts record is rejected", has(validator.validateProductFacts({ productName: "Alpha Tonic" }), /Missing ProductFacts/));
  check("Missing ProductFacts: a non-record facts value is rejected", has(validator.validateProductFacts({ productFacts: [] }), /Missing ProductFacts/));
  check("Missing Product Name: an empty name is rejected", has(validator.validateProductName({ productFacts: {}, productName: "" }), /Missing Product Name/));
  check("Invalid Search Context: missing markup is rejected", has(validator.validateSearchContext({ searchContext: "" }), /Invalid Search Context/));
  check("Invalid Search Context: a non-record snapshot is rejected", has(validator.validateSearchContext({ searchContext: 1 }), /Invalid Search Context/));
  check("Invalid Search Context: children that are not a list are rejected", has(validator.validateSearchContext({ searchContext: { html: "<div></div>", children: "nope" } }), /Invalid Search Context/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));

  const snap = createGoogleSearchSnapshot({
    evidenceId: "evidence-1",
    productName: "Alpha Tonic",
    landingPage: "https://example.test/offer",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === GOOGLE_SEARCH_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepGoogleSearch never throws", freezeDeepGoogleSearch(1) === 1 && Object.isFrozen(freezeDeepGoogleSearch({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const parsed = parser.parse(inputOf());
  check("the parser restates official website, FAQ, related searches, and suggestions", parsed.record.officialWebsite === "https://example.test/offer" && parsed.record.faqResults[0] === "What is the offer?" && parsed.record.relatedSearches[0] === "alpha tonic reviews" && parsed.record.searchSuggestions[0] === "alpha tonic official");
  check("the parser restates presence tokens from observed constructs", parsed.record.searchResultPresence === "PRESENT" && parsed.record.marketplacePresence === "PRESENT" && parsed.record.peopleAlsoAskPresence === "PRESENT" && parsed.record.knowledgePanelPresence === "PRESENT" && parsed.record.sponsoredResultPresence === "PRESENT");
  check("the parser restates advertisement counts and advertisers", parsed.record.sponsoredResultCount === 3 && parsed.record.officialAdvertiser === "https://example.test/offer" && parsed.record.affiliateAdvertisers[0] === "https://hops.example.test/a" && parsed.record.marketplaceAdvertisers[0] === "https://example.test/marketplace/alpha");

  const engine = engineOf();
  const built = engine.analyze(inputOf());
  check("the analyzer returns OK with evidence, statistics, snapshot, and metadata", built.status === "OK" && built.evidence !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("SearchEvidence restates search results, official site, marketplace, reviews, and comparison sites", built.evidence!.searchResultPresence === "PRESENT" && built.evidence!.officialWebsite === "https://example.test/offer" && built.evidence!.marketplacePresence === "PRESENT" && built.evidence!.reviewWebsites[0] === "https://reviews.example.test/alpha" && built.evidence!.comparisonWebsites[0] === "https://compare.example.test/alpha");
  check("SearchEvidence restates FAQ, related searches, suggestions, People Also Ask, and knowledge panel", built.evidence!.faqResults[0] === "What is the offer?" && built.evidence!.relatedSearches[0] === "alpha tonic reviews" && built.evidence!.searchSuggestions[0] === "alpha tonic official" && built.evidence!.peopleAlsoAskPresence === "PRESENT" && built.evidence!.knowledgePanelPresence === "PRESENT");
  check("advertisement evidence restates sponsored presence, count, official advertiser, affiliate advertisers, and marketplace advertisers", built.evidence!.sponsoredResultPresence === "PRESENT" && built.evidence!.sponsoredResultCount === 3 && built.evidence!.officialAdvertiser === "https://example.test/offer" && built.evidence!.affiliateAdvertisers[0] === "https://hops.example.test/a" && built.evidence!.marketplaceAdvertisers[0] === "https://example.test/marketplace/alpha");
  check("ProductFacts identity is restated on the evidence", built.evidence!.productName === "Alpha Tonic" && built.evidence!.vendor === "Vendor North" && built.evidence!.category === "Health & Fitness" && built.evidence!.landingPage === "https://example.test/offer");
  check("evidence origin is OBSERVED and provenance is DIRECT_SOURCE", built.evidence!.origin === "OBSERVED" && built.evidence!.provenance === "DIRECT_SOURCE" && built.evidence!.sourceFacts.every((item) => item.confidence === "DIRECT_SOURCE"));
  check("an evidence record has exactly the requested fields", Object.keys(built.evidence!).join() === GOOGLE_SEARCH_EVIDENCE_KEYS.join());
  check("statistics count observed signals and sponsored results", built.statistics!.signalCount >= 14 && built.statistics!.sponsoredResultCount === 3 && built.statistics!.issueCount === 0);
  check("the snapshot stores evidence id, product name, and landing page", built.snapshot!.evidenceId === "evidence-1" && built.snapshot!.productName === "Alpha Tonic" && built.snapshot!.landingPage === "https://example.test/offer");
  check("getSnapshot returns the stored snapshot", engine.getSnapshot("evidence-1") === built.snapshot && engine.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.evidence) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.evidence!.sourceFacts) && Object.isFrozen(built.statistics));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const fromFacts = engineOf().analyze(inputOf({ productName: undefined, vendor: undefined, category: undefined, landingPage: undefined }));
  check("identity can be restated from ProductFacts alone", fromFacts.status === "OK" && fromFacts.evidence?.productName === "Alpha Tonic" && fromFacts.evidence?.vendor === "Vendor North" && fromFacts.evidence?.landingPage === "https://example.test/offer");

  const fromSnapshot = engineOf().analyze(inputOf({ searchContext: { html: htmlOf() } }));
  check("a search context record with markup is observed", fromSnapshot.status === "OK" && fromSnapshot.evidence?.officialWebsite === "https://example.test/offer");

  const absent = engineOf().analyze(inputOf({ searchContext: "<div></div>" }));
  check("an empty search context restates ABSENT presence tokens", absent.status === "OK" && absent.evidence?.searchResultPresence === "ABSENT" && absent.evidence?.sponsoredResultPresence === "ABSENT" && absent.evidence?.sponsoredResultCount === 0 && absent.evidence?.peopleAlsoAskPresence === "ABSENT" && absent.evidence?.knowledgePanelPresence === "ABSENT");

  const missing = engineOf().analyze(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.evidence === null);
  const noFacts = engineOf().analyze(inputOf({ productFacts: undefined }));
  check("Missing ProductFacts is refused", noFacts.status === "REJECTED" && has(noFacts.issues, /Missing ProductFacts/));
  const noName = engineOf().analyze(inputOf({ productFacts: { vendor: "Vendor North" }, productName: undefined }));
  check("Missing Product Name is refused", noName.status === "REJECTED" && has(noName.issues, /Missing Product Name/));
  const noContext = engineOf().analyze(inputOf({ searchContext: "" }));
  check("Invalid Search Context is refused", noContext.status === "REJECTED" && has(noContext.issues, /Invalid Search Context/));
  const nested = engineOf().analyze(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  check("a refused analyze stores no snapshot", engineOf().getSnapshot("evidence-1") === null);

  const onceA = engineOf().analyze(inputOf());
  const onceB = engineOf().analyze(inputOf());
  check("Deterministic analysis: the same records yield the same evidence and snapshot", onceA.status === "OK" && JSON.stringify(onceA.evidence) === JSON.stringify(onceB.evidence) && JSON.stringify(onceA.snapshot) === JSON.stringify(onceB.snapshot));

  const source = inputOf();
  const observed = engineOf().analyze(source);
  (source.executionMetadata as { run: string }).run = "changed";
  source.searchContext = "changed";
  (source as { productName: string }).productName = "changed";
  (source.productFacts as { productName: string }).productName = "changed";
  check("No mutation: changing the input after analyze leaves evidence unchanged", observed.evidence!.metadata.run === "r1" && observed.evidence!.productName === "Alpha Tonic" && observed.evidence!.officialWebsite === "https://example.test/offer");
  try {
    (observed.evidence!.productName as string) = "hacked";
    (observed.snapshot!.productName as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable evidence: the evidence and snapshot cannot be assigned into", observed.evidence!.productName === "Alpha Tonic" && observed.snapshot!.productName === "Alpha Tonic");

  const left = engineOf();
  const right = engineOf();
  left.analyze(inputOf());
  right.analyze(null);
  check("Independent analyzer: analyzers do not share snapshots", left.getSnapshot("evidence-1")?.productName === "Alpha Tonic" && right.getSnapshot("evidence-1") === null);

  const dir = join(process.cwd(), "src/lib/product-intelligence");
  const files = readdirSync(dir).filter((f) => /^google-search-[a-z]+\.ts$/.test(f));
  check("five google search modules exist: context, evidence, intelligence, parser, validator", files.sort().join() === "google-search-context.ts,google-search-evidence.ts,google-search-intelligence.ts,google-search-parser.ts,google-search-validator.ts");
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
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "google-search-context.ts"), "utf8")));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check("every import stays inside the product-intelligence folder", imports.every((i) => /^\.\/google-search-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, Google Ads, ClickBank, Landing Page Intelligence, the LP Builder, Web Anatomy, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|google-ads|clickbank|landing-page|lp-builder|web-anatomy|import-product|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const clickbank = readdirSync(dir).filter((f) => /^clickbank-[a-z]+\.ts$/.test(f));
  const landing = readdirSync(dir).filter((f) => /^landing-page-[a-z]+\.ts$/.test(f));
  check("ClickBank importer modules do not import google search intelligence", clickbank.every((f) => !/google-search-/.test(readFileSync(join(dir, f), "utf8"))));
  check("Landing page intelligence modules do not import google search intelligence", landing.every((f) => !/google-search-/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/product-intelligence/"));
  check("no other lib module imports google search intelligence", !others.some((f) => /google-search-intelligence|product-intelligence\/google-search/.test(readFileSync(f, "utf8"))));
  const productFactsSrc = readFileSync(join(process.cwd(), "src/lib/product-facts.ts"), "utf8");
  check("existing ProductFacts internals are unchanged by this analyzer", !/product-intelligence|google-search/.test(productFactsSrc));
  const opportunity = listTs(join(process.cwd(), "src/lib/opportunity"));
  check("Opportunity competition modules are unchanged by this analyzer", !opportunity.some((f) => /product-intelligence|google-search/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nGoogle search intelligence: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
