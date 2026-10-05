import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createCompetitionIntelligence } from "../src/lib/product-intelligence/competition-intelligence.ts";
import { COMPETITION_CONTEXT_MEMBERS } from "../src/lib/product-intelligence/competition-context.ts";
import { createCompetitionParser } from "../src/lib/product-intelligence/competition-parser.ts";
import { createCompetitionValidator } from "../src/lib/product-intelligence/competition-validator.ts";
import {
  COMPETITION_EVIDENCE_KEYS,
  COMPETITION_ORIGINS,
  COMPETITION_PRESENCE,
  COMPETITION_PROVENANCE,
  COMPETITION_SNAPSHOT_KEYS,
  COMPETITION_STATISTICS_KEYS,
  COMPETITION_STATUSES,
  createCompetitionSnapshot,
  freezeDeepCompetition,
} from "../src/lib/product-intelligence/competition-evidence.ts";

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

function searchOf(over: Record<string, unknown> = {}) {
  return {
    searchResultPresence: "PRESENT",
    officialWebsite: "https://example.test/offer",
    marketplacePresence: "PRESENT",
    reviewWebsites: ["https://reviews.example.test/alpha"],
    comparisonWebsites: ["https://compare.example.test/alpha"],
    knowledgePanelPresence: "PRESENT",
    sponsoredResultPresence: "PRESENT",
    sponsoredResultCount: 3,
    officialAdvertiser: "https://example.test/offer",
    affiliateAdvertisers: ["https://hops.example.test/a"],
    marketplaceAdvertisers: ["https://example.test/marketplace/alpha"],
    productName: "Alpha Tonic",
    vendor: "Vendor North",
    landingPage: "https://example.test/offer",
    shoppingAds: "PRESENT",
    videoAdsPresence: "PRESENT",
    largePublishers: ["https://publisher.example.test"],
    independentPublishers: ["https://indie.example.test"],
    authorityDomains: ["https://clinic.example.test"],
    ...over,
  };
}

function pageOf(over: Record<string, unknown> = {}) {
  return {
    authoritySignals: ["A clinic named on the page."],
    videoPresence: "PRESENT",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    productFacts: factsOf(),
    landingPageEvidence: pageOf(),
    searchEvidence: searchOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function engineOf() {
  let n = 0;
  return createCompetitionIntelligence({
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
  const validator = createCompetitionValidator();
  const parser = createCompetitionParser();
  check("analysis statuses are OK then REJECTED", COMPETITION_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED", COMPETITION_ORIGINS.join() === "OBSERVED");
  check("provenance is DIRECT_SOURCE", COMPETITION_PROVENANCE.join() === "DIRECT_SOURCE");
  check("presence tokens are PRESENT then ABSENT", COMPETITION_PRESENCE.join() === "PRESENT,ABSENT");
  check("context members are in the requested order", COMPETITION_CONTEXT_MEMBERS.join() === "productFacts,landingPageEvidence,searchEvidence,executionMetadata,runtimeMetadata,configuration");
  check("evidence keys are in the requested order", COMPETITION_EVIDENCE_KEYS.join() === "numberOfAdvertisers,officialAdvertisers,affiliateAdvertisers,marketplaceAdvertisers,reviewSites,comparisonSites,brandPresence,organicCompetition,sponsoredCompetition,brandStrength,affiliateDensity,authorityDomains,largePublishers,independentPublishers,marketplacePresence,searchAdsPresent,officialAds,affiliateAds,shoppingAds,videoAdsPresence,productName,vendor,category,landingPage,origin,provenance,sourceUrl,sourceFacts,metadata");
  check("snapshot keys are in the requested order", COMPETITION_SNAPSHOT_KEYS.join() === "evidenceId,productName,landingPage,createdAt,metadata");
  check("statistics keys are in the requested order", COMPETITION_STATISTICS_KEYS.join() === "signalCount,advertiserCount,issueCount,executionTime");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Missing ProductFacts: a missing facts record is rejected", has(validator.validateProductFacts({ searchEvidence: searchOf() }), /Missing ProductFacts/));
  check("Missing ProductFacts: a non-record facts value is rejected", has(validator.validateProductFacts({ productFacts: [] }), /Missing ProductFacts/));
  check("Missing SearchEvidence: a missing search record is rejected", has(validator.validateSearchEvidence({ productFacts: factsOf() }), /Missing SearchEvidence/));
  check("Invalid Context: a non-record search record is rejected", has(validator.validateSearchEvidence({ searchEvidence: [] }), /Invalid Context/));
  check("Invalid Context: affiliate advertisers that are not a list are rejected", has(validator.validateContext(inputOf({ searchEvidence: searchOf({ affiliateAdvertisers: "nope" }) })), /Invalid Context/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));

  const snap = createCompetitionSnapshot({
    evidenceId: "evidence-1",
    productName: "Alpha Tonic",
    landingPage: "https://example.test/offer",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === COMPETITION_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepCompetition never throws", freezeDeepCompetition(1) === 1 && Object.isFrozen(freezeDeepCompetition({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const parsed = parser.parse(inputOf());
  check("the parser restates advertiser lists and counts", parsed.record.numberOfAdvertisers === 3 && parsed.record.officialAdvertisers[0] === "https://example.test/offer" && parsed.record.affiliateAdvertisers[0] === "https://hops.example.test/a" && parsed.record.marketplaceAdvertisers[0] === "https://example.test/marketplace/alpha");
  check("the parser restates review sites, comparison sites, and presence tokens", parsed.record.reviewSites[0] === "https://reviews.example.test/alpha" && parsed.record.comparisonSites[0] === "https://compare.example.test/alpha" && parsed.record.brandPresence === "PRESENT" && parsed.record.organicCompetition === "PRESENT" && parsed.record.sponsoredCompetition === "PRESENT");

  const engine = engineOf();
  const built = engine.analyze(inputOf());
  check("the analyzer returns OK with evidence, statistics, snapshot, and metadata", built.status === "OK" && built.evidence !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("CompetitionEvidence restates advertisers, review sites, comparison sites, and brand presence", built.evidence!.numberOfAdvertisers === 3 && built.evidence!.officialAdvertisers[0] === "https://example.test/offer" && built.evidence!.reviewSites[0] === "https://reviews.example.test/alpha" && built.evidence!.comparisonSites[0] === "https://compare.example.test/alpha" && built.evidence!.brandPresence === "PRESENT");
  check("market structure restates brand constructs, affiliate count, authority domains, publishers, and marketplace presence", built.evidence!.brandStrength === "PRESENT" && built.evidence!.affiliateDensity === 1 && built.evidence!.authorityDomains.includes("https://clinic.example.test") && built.evidence!.authorityDomains.includes("A clinic named on the page.") && built.evidence!.largePublishers[0] === "https://publisher.example.test" && built.evidence!.independentPublishers[0] === "https://indie.example.test" && built.evidence!.marketplacePresence === "PRESENT");
  check("advertisement structure restates search ads, official ads, affiliate ads, shopping ads, and video ads presence", built.evidence!.searchAdsPresent === "PRESENT" && built.evidence!.officialAds === "PRESENT" && built.evidence!.affiliateAds === "PRESENT" && built.evidence!.shoppingAds === "PRESENT" && built.evidence!.videoAdsPresence === "PRESENT");
  check("organic and sponsored constructs are restated as presence tokens", built.evidence!.organicCompetition === "PRESENT" && built.evidence!.sponsoredCompetition === "PRESENT");
  check("ProductFacts identity is restated on the evidence", built.evidence!.productName === "Alpha Tonic" && built.evidence!.vendor === "Vendor North" && built.evidence!.category === "Health & Fitness" && built.evidence!.landingPage === "https://example.test/offer");
  check("evidence origin is OBSERVED and provenance is DIRECT_SOURCE", built.evidence!.origin === "OBSERVED" && built.evidence!.provenance === "DIRECT_SOURCE" && built.evidence!.sourceFacts.every((item) => item.confidence === "DIRECT_SOURCE"));
  check("an evidence record has exactly the requested fields", Object.keys(built.evidence!).join() === COMPETITION_EVIDENCE_KEYS.join());
  check("statistics count observed signals and advertisers", built.statistics!.signalCount >= 18 && built.statistics!.advertiserCount === 3 && built.statistics!.issueCount === 0);
  check("the snapshot stores evidence id, product name, and landing page", built.snapshot!.evidenceId === "evidence-1" && built.snapshot!.productName === "Alpha Tonic" && built.snapshot!.landingPage === "https://example.test/offer");
  check("getSnapshot returns the stored snapshot", engine.getSnapshot("evidence-1") === built.snapshot && engine.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.evidence) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.evidence!.sourceFacts) && Object.isFrozen(built.statistics));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const withoutPage = engineOf().analyze(inputOf({ landingPageEvidence: undefined }));
  check("landing page evidence is optional", withoutPage.status === "OK" && withoutPage.evidence?.authorityDomains[0] === "https://clinic.example.test");

  const absent = engineOf().analyze(inputOf({
    searchEvidence: { productName: "Alpha Tonic" },
    landingPageEvidence: undefined,
  }));
  check("empty SearchEvidence restates ABSENT presence tokens and zero advertisers", absent.status === "OK" && absent.evidence?.numberOfAdvertisers === 0 && absent.evidence?.brandPresence === "ABSENT" && absent.evidence?.searchAdsPresent === "ABSENT" && absent.evidence?.shoppingAds === "ABSENT" && absent.evidence?.videoAdsPresence === "ABSENT" && absent.evidence?.affiliateDensity === 0);

  const missing = engineOf().analyze(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.evidence === null);
  const noFacts = engineOf().analyze(inputOf({ productFacts: undefined }));
  check("Missing ProductFacts is refused", noFacts.status === "REJECTED" && has(noFacts.issues, /Missing ProductFacts/));
  const noSearch = engineOf().analyze(inputOf({ searchEvidence: undefined }));
  check("Missing SearchEvidence is refused", noSearch.status === "REJECTED" && has(noSearch.issues, /Missing SearchEvidence/));
  const badContext = engineOf().analyze(inputOf({ searchEvidence: [] }));
  check("Invalid Context is refused", badContext.status === "REJECTED" && has(badContext.issues, /Invalid Context/));
  const nested = engineOf().analyze(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  check("a refused analyze stores no snapshot", engineOf().getSnapshot("evidence-1") === null);

  const onceA = engineOf().analyze(inputOf());
  const onceB = engineOf().analyze(inputOf());
  check("Deterministic analysis: the same records yield the same evidence and snapshot", onceA.status === "OK" && JSON.stringify(onceA.evidence) === JSON.stringify(onceB.evidence) && JSON.stringify(onceA.snapshot) === JSON.stringify(onceB.snapshot));

  const source = inputOf();
  const observed = engineOf().analyze(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source.productFacts as { productName: string }).productName = "changed";
  (source.searchEvidence as { officialAdvertiser: string }).officialAdvertiser = "changed";
  check("No mutation: changing the input after analyze leaves evidence unchanged", observed.evidence!.metadata.run === "r1" && observed.evidence!.productName === "Alpha Tonic" && observed.evidence!.officialAdvertisers[0] === "https://example.test/offer");
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
  const files = readdirSync(dir).filter((f) => /^competition-[a-z]+\.ts$/.test(f));
  check("five competition modules exist: context, evidence, intelligence, parser, validator", files.sort().join() === "competition-context.ts,competition-evidence.ts,competition-intelligence.ts,competition-parser.ts,competition-validator.ts");
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
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "competition-context.ts"), "utf8")));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check("every import stays inside the product-intelligence folder", imports.every((i) => /^\.\/competition-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, Google Ads, ClickBank, Landing Page Intelligence, Google Search Intelligence, the LP Builder, Web Anatomy, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|google-ads|google-search|clickbank|landing-page|lp-builder|web-anatomy|import-product|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const clickbank = readdirSync(dir).filter((f) => /^clickbank-[a-z]+\.ts$/.test(f));
  const landing = readdirSync(dir).filter((f) => /^landing-page-[a-z]+\.ts$/.test(f));
  const search = readdirSync(dir).filter((f) => /^google-search-[a-z]+\.ts$/.test(f));
  check("ClickBank importer modules do not import competition intelligence", clickbank.every((f) => !/competition-/.test(readFileSync(join(dir, f), "utf8"))));
  check("Landing page intelligence modules do not import competition intelligence", landing.every((f) => !/competition-/.test(readFileSync(join(dir, f), "utf8"))));
  check("Google search intelligence modules do not import competition intelligence", search.every((f) => !/competition-/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/product-intelligence/"));
  check("no other lib module imports competition intelligence", !others.some((f) => /competition-intelligence|product-intelligence\/competition/.test(readFileSync(f, "utf8"))));
  const productFactsSrc = readFileSync(join(process.cwd(), "src/lib/product-facts.ts"), "utf8");
  check("existing ProductFacts internals are unchanged by this analyzer", !/product-intelligence|competition-intelligence/.test(productFactsSrc));
  const opportunity = listTs(join(process.cwd(), "src/lib/opportunity"));
  check("Opportunity competition modules are unchanged by this analyzer", !opportunity.some((f) => /product-intelligence|competition-intelligence/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nCompetition intelligence: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
