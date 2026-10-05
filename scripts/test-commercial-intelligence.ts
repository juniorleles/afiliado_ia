import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createCommercialIntelligence } from "../src/lib/product-intelligence/commercial-intelligence.ts";
import { COMMERCIAL_CONTEXT_MEMBERS } from "../src/lib/product-intelligence/commercial-context.ts";
import { createCommercialParser } from "../src/lib/product-intelligence/commercial-parser.ts";
import { createCommercialValidator } from "../src/lib/product-intelligence/commercial-validator.ts";
import {
  COMMERCIAL_EVIDENCE_KEYS,
  COMMERCIAL_ORIGINS,
  COMMERCIAL_PRESENCE,
  COMMERCIAL_PROVENANCE,
  COMMERCIAL_SNAPSHOT_KEYS,
  COMMERCIAL_STATISTICS_KEYS,
  COMMERCIAL_STATUSES,
  createCommercialSnapshot,
  freezeDeepCommercial,
} from "../src/lib/product-intelligence/commercial-evidence.ts";

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
    commissionType: "recurring",
    refundPolicy: "60-day refund window as stated by the vendor",
    supportUrl: "https://example.test/support",
    language: "English",
    affiliateResources: ["https://example.test/resources/one"],
    ...over,
  };
}

function pageOf(over: Record<string, unknown> = {}) {
  return {
    priceVisibility: "PRESENT",
    primaryCta: "Get Alpha",
    offerStructure: "One bottle listed on the page.",
    guarantee: "60-day refund as stated on the page.",
    refundPolicy: "https://example.test/refund",
    contactInformation: "mailto:north@example.test",
    trustBadges: ["secure checkout badge"],
    authoritySignals: ["A clinic named on the page."],
    reviews: ["A restated review."],
    checkoutPresence: "PRESENT",
    upsellPresence: "PRESENT",
    downsellPresence: "PRESENT",
    leadCapture: "PRESENT",
    emailCapture: "PRESENT",
    language: "en",
    ...over,
  };
}

function searchOf(over: Record<string, unknown> = {}) {
  return {
    searchResultPresence: "PRESENT",
    officialWebsite: "https://example.test/offer",
    reviewWebsites: ["https://reviews.example.test/alpha"],
    comparisonWebsites: ["https://compare.example.test/alpha"],
    knowledgePanelPresence: "PRESENT",
    sponsoredResultPresence: "PRESENT",
    affiliateAdvertisers: ["https://hops.example.test/a"],
    productName: "Alpha Tonic",
    landingPage: "https://example.test/offer",
    ...over,
  };
}

function competitionOf(over: Record<string, unknown> = {}) {
  return {
    brandPresence: "PRESENT",
    organicCompetition: "PRESENT",
    sponsoredCompetition: "PRESENT",
    searchAdsPresent: "PRESENT",
    affiliateAds: "PRESENT",
    officialAdvertisers: ["https://example.test/offer"],
    affiliateAdvertisers: ["https://hops.example.test/a"],
    reviewSites: ["https://reviews.example.test/alpha"],
    comparisonSites: ["https://compare.example.test/alpha"],
    authorityDomains: ["https://clinic.example.test"],
    productName: "Alpha Tonic",
    vendor: "Vendor North",
    landingPage: "https://example.test/offer",
    ...over,
  };
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    productFacts: factsOf(),
    landingPageEvidence: pageOf(),
    searchEvidence: searchOf(),
    competitionEvidence: competitionOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function engineOf() {
  let n = 0;
  return createCommercialIntelligence({
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
  const validator = createCommercialValidator();
  const parser = createCommercialParser();
  check("analysis statuses are OK then REJECTED", COMMERCIAL_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED", COMMERCIAL_ORIGINS.join() === "OBSERVED");
  check("provenance is DIRECT_SOURCE", COMMERCIAL_PROVENANCE.join() === "DIRECT_SOURCE");
  check("presence tokens are PRESENT then ABSENT", COMMERCIAL_PRESENCE.join() === "PRESENT,ABSENT");
  check("context members are in the requested order", COMMERCIAL_CONTEXT_MEMBERS.join() === "productFacts,landingPageEvidence,searchEvidence,competitionEvidence,executionMetadata,runtimeMetadata,configuration");
  check("evidence keys are in the requested order", COMMERCIAL_EVIDENCE_KEYS.join() === "directPurchaseIntent,priceVisibility,strongCallToAction,salesFunnelPresence,checkoutPresence,guarantee,refundPolicy,recurringBilling,upsellPresence,downsellPresence,leadCapture,emailCapture,affiliateResources,commercialSearchPresence,brandSearchPresence,reviewSearchPresence,comparisonSearchPresence,affiliateSearchPresence,sponsoredSearchPresence,vendorReputation,productMaturity,offerStability,supportAvailability,localization,languageCoverage,productName,vendor,category,landingPage,origin,provenance,sourceUrl,sourceFacts,metadata");
  check("snapshot keys are in the requested order", COMMERCIAL_SNAPSHOT_KEYS.join() === "evidenceId,productName,landingPage,createdAt,metadata");
  check("statistics keys are in the requested order", COMMERCIAL_STATISTICS_KEYS.join() === "signalCount,marketSignalCount,issueCount,executionTime");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Missing ProductFacts: a missing facts record is rejected", has(validator.validateProductFacts({ competitionEvidence: competitionOf() }), /Missing ProductFacts/));
  check("Missing ProductFacts: a non-record facts value is rejected", has(validator.validateProductFacts({ productFacts: [] }), /Missing ProductFacts/));
  check("Missing CompetitionEvidence: a missing competition record is rejected", has(validator.validateCompetitionEvidence({ productFacts: factsOf() }), /Missing CompetitionEvidence/));
  check("Invalid Context: a non-record competition record is rejected", has(validator.validateCompetitionEvidence({ competitionEvidence: [] }), /Invalid Context/));
  check("Invalid Context: affiliate advertisers that are not a list are rejected", has(validator.validateContext(inputOf({ competitionEvidence: competitionOf({ affiliateAdvertisers: "nope" }) })), /Invalid Context/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));

  const snap = createCommercialSnapshot({
    evidenceId: "evidence-1",
    productName: "Alpha Tonic",
    landingPage: "https://example.test/offer",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === COMMERCIAL_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepCommercial never throws", freezeDeepCommercial(1) === 1 && Object.isFrozen(freezeDeepCommercial({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const parsed = parser.parse(inputOf());
  check("the parser restates purchase constructs", parsed.record.directPurchaseIntent === "PRESENT" && parsed.record.priceVisibility === "PRESENT" && parsed.record.strongCallToAction === "PRESENT" && parsed.record.checkoutPresence === "PRESENT" && parsed.record.salesFunnelPresence === "PRESENT");
  check("the parser restates guarantee, refund, recurring billing, and affiliate resources", parsed.record.guarantee?.includes("60-day") === true && parsed.record.refundPolicy === "https://example.test/refund" && parsed.record.recurringBilling === "PRESENT" && parsed.record.affiliateResources[0] === "https://example.test/resources/one");

  const engine = engineOf();
  const built = engine.analyze(inputOf());
  check("the analyzer returns OK with evidence, statistics, snapshot, and metadata", built.status === "OK" && built.evidence !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("CommercialEvidence restates purchase intent, CTA, funnel, checkout, upsell, downsell, and capture", built.evidence!.directPurchaseIntent === "PRESENT" && built.evidence!.strongCallToAction === "PRESENT" && built.evidence!.salesFunnelPresence === "PRESENT" && built.evidence!.checkoutPresence === "PRESENT" && built.evidence!.upsellPresence === "PRESENT" && built.evidence!.downsellPresence === "PRESENT" && built.evidence!.leadCapture === "PRESENT" && built.evidence!.emailCapture === "PRESENT");
  check("market signals restate commercial, brand, review, comparison, affiliate, and sponsored search presence", built.evidence!.commercialSearchPresence === "PRESENT" && built.evidence!.brandSearchPresence === "PRESENT" && built.evidence!.reviewSearchPresence === "PRESENT" && built.evidence!.comparisonSearchPresence === "PRESENT" && built.evidence!.affiliateSearchPresence === "PRESENT" && built.evidence!.sponsoredSearchPresence === "PRESENT");
  check("business signals restate vendor, maturity, offer, support, localization, and language coverage", built.evidence!.vendorReputation === "PRESENT" && built.evidence!.productMaturity === "PRESENT" && built.evidence!.offerStability === "PRESENT" && built.evidence!.supportAvailability === "PRESENT" && built.evidence!.localization === "PRESENT" && built.evidence!.languageCoverage === "English");
  check("ProductFacts identity is restated on the evidence", built.evidence!.productName === "Alpha Tonic" && built.evidence!.vendor === "Vendor North" && built.evidence!.category === "Health & Fitness" && built.evidence!.landingPage === "https://example.test/offer");
  check("evidence origin is OBSERVED and provenance is DIRECT_SOURCE", built.evidence!.origin === "OBSERVED" && built.evidence!.provenance === "DIRECT_SOURCE" && built.evidence!.sourceFacts.every((item) => item.confidence === "DIRECT_SOURCE"));
  check("an evidence record has exactly the requested fields", Object.keys(built.evidence!).join() === COMMERCIAL_EVIDENCE_KEYS.join());
  check("statistics count observed signals and market signals", built.statistics!.signalCount >= 20 && built.statistics!.marketSignalCount === 6 && built.statistics!.issueCount === 0);
  check("the snapshot stores evidence id, product name, and landing page", built.snapshot!.evidenceId === "evidence-1" && built.snapshot!.productName === "Alpha Tonic" && built.snapshot!.landingPage === "https://example.test/offer");
  check("getSnapshot returns the stored snapshot", engine.getSnapshot("evidence-1") === built.snapshot && engine.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.evidence) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.evidence!.sourceFacts) && Object.isFrozen(built.statistics));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const withoutOptional = engineOf().analyze(inputOf({ landingPageEvidence: undefined, searchEvidence: undefined }));
  check("landing page evidence and SearchEvidence are optional", withoutOptional.status === "OK" && withoutOptional.evidence?.productName === "Alpha Tonic" && withoutOptional.evidence?.brandSearchPresence === "PRESENT");

  const absent = engineOf().analyze(inputOf({
    productFacts: { productName: "Alpha Tonic" },
    landingPageEvidence: undefined,
    searchEvidence: undefined,
    competitionEvidence: { productName: "Alpha Tonic" },
  }));
  check("empty records restate ABSENT presence tokens", absent.status === "OK" && absent.evidence?.directPurchaseIntent === "ABSENT" && absent.evidence?.commercialSearchPresence === "ABSENT" && absent.evidence?.vendorReputation === "ABSENT" && absent.evidence?.affiliateResources.length === 0 && absent.evidence?.languageCoverage === null);

  const missing = engineOf().analyze(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.evidence === null);
  const noFacts = engineOf().analyze(inputOf({ productFacts: undefined }));
  check("Missing ProductFacts is refused", noFacts.status === "REJECTED" && has(noFacts.issues, /Missing ProductFacts/));
  const noCompetition = engineOf().analyze(inputOf({ competitionEvidence: undefined }));
  check("Missing CompetitionEvidence is refused", noCompetition.status === "REJECTED" && has(noCompetition.issues, /Missing CompetitionEvidence/));
  const badContext = engineOf().analyze(inputOf({ competitionEvidence: [] }));
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
  (source.competitionEvidence as { brandPresence: string }).brandPresence = "ABSENT";
  check("No mutation: changing the input after analyze leaves evidence unchanged", observed.evidence!.metadata.run === "r1" && observed.evidence!.productName === "Alpha Tonic" && observed.evidence!.brandSearchPresence === "PRESENT");
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
  const files = readdirSync(dir).filter((f) => /^commercial-[a-z]+\.ts$/.test(f));
  check("five commercial modules exist: context, evidence, intelligence, parser, validator", files.sort().join() === "commercial-context.ts,commercial-evidence.ts,commercial-intelligence.ts,commercial-parser.ts,commercial-validator.ts");
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
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "commercial-context.ts"), "utf8")));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check("every import stays inside the product-intelligence folder", imports.every((i) => /^\.\/commercial-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, Google Ads, ClickBank, Landing Page Intelligence, Google Search Intelligence, Competition Intelligence, the LP Builder, Web Anatomy, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|google-ads|google-search|clickbank|landing-page|competition-|lp-builder|web-anatomy|import-product|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const prefixes = ["clickbank", "landing-page", "google-search", "competition"];
  for (const prefix of prefixes) {
    const siblings = readdirSync(dir).filter((f) => new RegExp(`^${prefix}-[a-z]+\\.ts$`).test(f));
    check(`${prefix} modules do not import commercial intelligence`, siblings.every((f) => !/commercial-/.test(readFileSync(join(dir, f), "utf8"))));
  }
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/product-intelligence/"));
  check("no other lib module imports commercial intelligence", !others.some((f) => /commercial-intelligence|product-intelligence\/commercial/.test(readFileSync(f, "utf8"))));
  const productFactsSrc = readFileSync(join(process.cwd(), "src/lib/product-facts.ts"), "utf8");
  check("existing ProductFacts internals are unchanged by this analyzer", !/product-intelligence|commercial-intelligence/.test(productFactsSrc));
  const opportunity = listTs(join(process.cwd(), "src/lib/opportunity"));
  check("Opportunity commercial-intent modules are unchanged by this analyzer", !opportunity.some((f) => /product-intelligence|commercial-intelligence/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nCommercial intelligence: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
