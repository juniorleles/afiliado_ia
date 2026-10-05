import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createLandingPageIntelligence } from "../src/lib/product-intelligence/landing-page-intelligence.ts";
import { LANDING_PAGE_CONTEXT_MEMBERS } from "../src/lib/product-intelligence/landing-page-context.ts";
import { createLandingPageParser } from "../src/lib/product-intelligence/landing-page-parser.ts";
import { createLandingPageValidator } from "../src/lib/product-intelligence/landing-page-validator.ts";
import {
  LANDING_PAGE_EVIDENCE_KEYS,
  LANDING_PAGE_ORIGINS,
  LANDING_PAGE_PRESENCE,
  LANDING_PAGE_PROVENANCE,
  LANDING_PAGE_SNAPSHOT_KEYS,
  LANDING_PAGE_STATISTICS_KEYS,
  LANDING_PAGE_STATUSES,
  createLandingPageSnapshot,
  freezeDeepLandingPage,
} from "../src/lib/product-intelligence/landing-page-evidence.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function htmlOf() {
  return `<!doctype html>
<html lang="en">
<head>
  <title>Alpha Offer</title>
  <meta name="description" content="A restated destination page.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.test/offer">
  <script type="application/ld+json">{"@type":"WebPage","name":"Alpha Offer"}</script>
</head>
<body>
  <h1 data-field="headline">Alpha Offer</h1>
  <h2 data-field="subheadline">A restated subheadline</h2>
  <a data-field="primaryCta" class="cta" href="#buy">Get Alpha</a>
  <a data-field="secondaryCta" class="cta" href="#learn">Learn more</a>
  <p data-field="offerStructure">One bottle listed on the page.</p>
  <p data-field="price">$47.00</p>
  <p data-field="guarantee">60-day refund as stated on the page.</p>
  <blockquote data-field="testimonial">A restated testimonial.</blockquote>
  <p data-field="review">A restated review.</p>
  <p data-field="authority">A clinic named on the page.</p>
  <span data-field="trust">secure checkout badge</span>
  <p data-field="faq">What is the offer?</p>
  <details><summary>How does shipping work?</summary></details>
  <video src="https://example.test/clip.mp4"></video>
  <img src="https://example.test/hero.png" alt="">
  <a href="mailto:north@example.test">write us</a>
  <footer>
    <a href="https://example.test/privacy">Privacy Policy</a>
    <a href="https://example.test/terms">Terms of Service</a>
    <a href="https://example.test/refund">Refund Policy</a>
  </footer>
</body>
</html>`;
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    landingPageUrl: "https://example.test/offer",
    rawHtml: htmlOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function engineOf() {
  let n = 0;
  return createLandingPageIntelligence({
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
  const validator = createLandingPageValidator();
  const parser = createLandingPageParser();
  check("analysis statuses are OK then REJECTED", LANDING_PAGE_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED", LANDING_PAGE_ORIGINS.join() === "OBSERVED");
  check("provenance is DIRECT_SOURCE", LANDING_PAGE_PROVENANCE.join() === "DIRECT_SOURCE");
  check("presence tokens are PRESENT then ABSENT", LANDING_PAGE_PRESENCE.join() === "PRESENT,ABSENT");
  check("context members are in the requested order", LANDING_PAGE_CONTEXT_MEMBERS.join() === "landingPageUrl,rawHtml,domSnapshot,executionMetadata,runtimeMetadata,configuration");
  check("evidence keys are in the requested order", LANDING_PAGE_EVIDENCE_KEYS.join() === "headline,subheadline,primaryCta,secondaryCta,offerStructure,priceVisibility,guarantee,testimonials,reviews,authoritySignals,trustBadges,faq,videoPresence,images,contactInformation,footerLinks,privacyPolicy,termsOfService,refundPolicy,title,metaDescription,canonical,language,mobileFriendly,viewport,schemaOrg,pageSize,assetCount,origin,provenance,sourceUrl,sourceFacts,metadata");
  check("snapshot keys are in the requested order", LANDING_PAGE_SNAPSHOT_KEYS.join() === "evidenceId,sourceUrl,headline,createdAt,metadata");
  check("statistics keys are in the requested order", LANDING_PAGE_STATISTICS_KEYS.join() === "signalCount,assetCount,issueCount,executionTime");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Invalid URL: a missing landing page URL is rejected", has(validator.validateUrl("", "landingPageUrl"), /Invalid URL/));
  check("Invalid URL: a non-https address is rejected", has(validator.validateUrl("ftp://example.test", "landingPageUrl"), /Invalid URL/));
  check("Missing HTML: empty markup is rejected", has(validator.validateHtml({ landingPageUrl: "https://example.test/offer", rawHtml: "" }), /Missing HTML/));
  check("Malformed DOM: a non-record snapshot is rejected", has(validator.validateDom(1), /Malformed DOM/));
  check("Malformed DOM: children that are not a list are rejected", has(validator.validateDom({ children: "nope" }), /Malformed DOM/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));

  const snap = createLandingPageSnapshot({
    evidenceId: "evidence-1",
    sourceUrl: "https://example.test/offer",
    headline: "Alpha Offer",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === LANDING_PAGE_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepLandingPage never throws", freezeDeepLandingPage(1) === 1 && Object.isFrozen(freezeDeepLandingPage({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  const parsed = parser.parse(inputOf());
  check("the parser restates headline, CTAs, and technical fields", parsed.record.headline === "Alpha Offer" && parsed.record.primaryCta === "Get Alpha" && parsed.record.secondaryCta === "Learn more" && parsed.record.title === "Alpha Offer" && parsed.record.language === "en" && parsed.record.canonical === "https://example.test/offer");
  check("the parser restates presence tokens from observed constructs", parsed.record.priceVisibility === "PRESENT" && parsed.record.videoPresence === "PRESENT" && parsed.record.mobileFriendly === "PRESENT");

  const engine = engineOf();
  const built = engine.analyze(inputOf());
  check("the analyzer returns OK with evidence, statistics, snapshot, and metadata", built.status === "OK" && built.evidence !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("LandingPageEvidence restates copy, offer, guarantee, and policies", built.evidence!.headline === "Alpha Offer" && built.evidence!.subheadline === "A restated subheadline" && built.evidence!.offerStructure === "One bottle listed on the page." && built.evidence!.guarantee?.includes("60-day") === true && built.evidence!.privacyPolicy === "https://example.test/privacy" && built.evidence!.termsOfService === "https://example.test/terms" && built.evidence!.refundPolicy === "https://example.test/refund");
  check("LandingPageEvidence restates testimonials, reviews, FAQ, images, and contact", built.evidence!.testimonials[0] === "A restated testimonial." && built.evidence!.reviews[0] === "A restated review." && built.evidence!.faq.includes("What is the offer?") && built.evidence!.images[0] === "https://example.test/hero.png" && built.evidence!.contactInformation === "mailto:north@example.test" && built.evidence!.footerLinks.length === 3);
  check("technical analysis restates title, meta, canonical, language, viewport, schema, and sizes", built.evidence!.title === "Alpha Offer" && built.evidence!.metaDescription === "A restated destination page." && built.evidence!.canonical === "https://example.test/offer" && built.evidence!.language === "en" && built.evidence!.viewport?.includes("width=device-width") === true && built.evidence!.schemaOrg.length === 1 && built.evidence!.pageSize === htmlOf().length && built.evidence!.assetCount >= 4);
  check("evidence origin is OBSERVED and provenance is DIRECT_SOURCE", built.evidence!.origin === "OBSERVED" && built.evidence!.provenance === "DIRECT_SOURCE" && built.evidence!.sourceFacts.every((item) => item.confidence === "DIRECT_SOURCE"));
  check("an evidence record has exactly the requested fields", Object.keys(built.evidence!).join() === LANDING_PAGE_EVIDENCE_KEYS.join());
  check("statistics count observed signals and assets", built.statistics!.signalCount >= 20 && built.statistics!.assetCount === built.evidence!.assetCount && built.statistics!.issueCount === 0);
  check("the snapshot stores evidence id, source URL, and headline", built.snapshot!.evidenceId === "evidence-1" && built.snapshot!.sourceUrl === "https://example.test/offer" && built.snapshot!.headline === "Alpha Offer");
  check("getSnapshot returns the stored snapshot", engine.getSnapshot("evidence-1") === built.snapshot && engine.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.evidence) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.evidence!.sourceFacts) && Object.isFrozen(built.statistics));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const fromSnapshot = engineOf().analyze(inputOf({ rawHtml: undefined, domSnapshot: { html: htmlOf() } }));
  check("a DOM snapshot with markup is observed", fromSnapshot.status === "OK" && fromSnapshot.evidence?.headline === "Alpha Offer");

  const missing = engineOf().analyze(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.evidence === null);
  const badUrl = engineOf().analyze(inputOf({ landingPageUrl: "not-a-url" }));
  check("Invalid URL is refused", badUrl.status === "REJECTED" && has(badUrl.issues, /Invalid URL/));
  const noHtml = engineOf().analyze(inputOf({ rawHtml: "", domSnapshot: undefined }));
  check("Missing HTML is refused", noHtml.status === "REJECTED" && has(noHtml.issues, /Missing HTML/));
  const badDom = engineOf().analyze(inputOf({ rawHtml: htmlOf(), domSnapshot: [] }));
  check("Malformed DOM is refused", badDom.status === "REJECTED" && has(badDom.issues, /Malformed DOM/));
  const nested = engineOf().analyze(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  check("a refused analyze stores no snapshot", engineOf().getSnapshot("evidence-1") === null);

  const onceA = engineOf().analyze(inputOf());
  const onceB = engineOf().analyze(inputOf());
  check("Deterministic analysis: the same records yield the same evidence and snapshot", onceA.status === "OK" && JSON.stringify(onceA.evidence) === JSON.stringify(onceB.evidence) && JSON.stringify(onceA.snapshot) === JSON.stringify(onceB.snapshot));

  const source = inputOf();
  const observed = engineOf().analyze(source);
  (source.executionMetadata as { run: string }).run = "changed";
  source.rawHtml = "changed";
  (source as { landingPageUrl: string }).landingPageUrl = "https://example.test/changed";
  check("No mutation: changing the input after analyze leaves evidence unchanged", observed.evidence!.metadata.run === "r1" && observed.evidence!.headline === "Alpha Offer" && observed.snapshot!.sourceUrl === "https://example.test/offer");
  try {
    (observed.evidence!.headline as string) = "hacked";
    (observed.snapshot!.headline as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable evidence: the evidence and snapshot cannot be assigned into", observed.evidence!.headline === "Alpha Offer" && observed.snapshot!.headline === "Alpha Offer");

  const left = engineOf();
  const right = engineOf();
  left.analyze(inputOf());
  right.analyze(null);
  check("Independent analyzer: analyzers do not share snapshots", left.getSnapshot("evidence-1")?.headline === "Alpha Offer" && right.getSnapshot("evidence-1") === null);

  const dir = join(process.cwd(), "src/lib/product-intelligence");
  const files = readdirSync(dir).filter((f) => /^landing-page-[a-z]+\.ts$/.test(f));
  check("five landing page modules exist: context, evidence, intelligence, parser, validator", files.sort().join() === "landing-page-context.ts,landing-page-evidence.ts,landing-page-intelligence.ts,landing-page-parser.ts,landing-page-validator.ts");
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no HTTP, search, or live fetch in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
  check("no scoring, ranking, weights, formulas, recommendations, or optimization in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend|optimiz/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "clickbank-context.ts"), "utf8")) && !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "landing-page-context.ts"), "utf8")));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check("every import stays inside the product-intelligence folder", imports.every((i) => /^\.\/landing-page-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, Google Ads, ClickBank, the LP Builder, Web Anatomy, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|google-ads|clickbank|lp-builder|web-anatomy|import-product|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const clickbank = readdirSync(dir).filter((f) => /^clickbank-[a-z]+\.ts$/.test(f));
  check("ClickBank importer modules do not import landing page intelligence", clickbank.every((f) => !/landing-page-/.test(readFileSync(join(dir, f), "utf8"))));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/product-intelligence/"));
  check("no other lib module imports landing page intelligence", !others.some((f) => /landing-page-intelligence|product-intelligence\/landing-page/.test(readFileSync(f, "utf8"))));
  const opportunity = listTs(join(process.cwd(), "src/lib/opportunity"));
  check("Opportunity landing-page-potential modules are unchanged by this analyzer", !opportunity.some((f) => /product-intelligence|landing-page-intelligence/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nLanding page intelligence: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
