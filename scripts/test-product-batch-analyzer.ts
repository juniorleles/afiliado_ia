import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BATCH_CONTEXT_MEMBERS, BATCH_STAGES } from "../src/lib/product-intelligence/batch-context.ts";
import { createProductBatchAnalyzer } from "../src/lib/product-intelligence/product-batch-analyzer.ts";
import { BATCH_SNAPSHOT_KEYS, BATCH_STATISTICS_KEYS, BATCH_STATUSES, freezeDeepBatch } from "../src/lib/product-intelligence/batch-snapshot.ts";
import { createBatchValidator } from "../src/lib/product-intelligence/batch-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function marketplaceHtml(name: string) {
  return `
<dl>
  <dt>Product Name</dt><dd>${name}</dd>
  <dt>Vendor</dt><dd>Vendor North</dd>
  <dt>Vendor ID</dt><dd>vendor-north</dd>
  <dt>Category</dt><dd>Health &amp; Fitness</dd>
  <dt>Gravity</dt><dd>12.5</dd>
  <dt>Initial $/sale</dt><dd>$47.00</dd>
  <dt>Avg $/sale</dt><dd>$51.25</dd>
  <dt>Avg $/rebill</dt><dd>$19.00</dd>
  <dt>Commission Type</dt><dd>recurring</dd>
  <dt>Language</dt><dd>English</dd>
  <dt>Affiliate Page</dt><dd>https://example.test/offer/alpha</dd>
  <dt>Support URL</dt><dd>https://example.test/support</dd>
  <dt>Refund Policy</dt><dd>60-day refund window as stated by the vendor</dd>
  <dt>Description</dt><dd>A restated marketplace description.</dd>
  <dt>Disclaimer</dt><dd>Statements on the marketplace page are seller claims.</dd>
  <dt>Affiliate Resources</dt><dd>https://example.test/resources/one</dd>
</dl>`;
}

function landingHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <title>Alpha Offer</title>
  <meta name="description" content="A restated destination page.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.test/offer/alpha">
</head>
<body>
  <h1 data-field="headline">Alpha Offer</h1>
  <a data-field="primaryCta" class="cta" href="#buy">Get Alpha</a>
  <p data-field="price">$47.00</p>
</body>
</html>`;
}

function searchHtml() {
  return `<div>
  <a data-field="organic" href="https://example.test/offer/alpha">A restated organic result</a>
  <a data-field="officialWebsite" href="https://example.test/offer/alpha">Official site</a>
  <p data-field="faq">What is the offer?</p>
  <a data-field="sponsored" data-advertiser="official" href="https://example.test/offer/alpha">Official</a>
</div>`;
}

function productOf(name: string, id: string, over: Record<string, unknown> = {}) {
  return {
    marketplaceUrl: `https://example.test/marketplace/${id}`,
    marketplaceProductId: id,
    rawHtml: marketplaceHtml(name),
    landingHtml: landingHtml(),
    searchContext: searchHtml(),
    ...over,
  };
}

function analyzerOf() {
  return createProductBatchAnalyzer({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "batch-1",
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

const validator = createBatchValidator();
check("statuses are OK and REJECTED", BATCH_STATUSES.join() === "OK,REJECTED");
check(
  "stages follow the batch pipeline",
  BATCH_STAGES.join() === "ClickBankImporter,LandingPageIntelligence,GoogleSearchIntelligence,CompetitionIntelligence,CommercialIntelligence,ProductIntelligenceReport,RecommendationEngine",
);
check(
  "context members are the product list, the feed, the URL list, and metadata",
  BATCH_CONTEXT_MEMBERS.join() === "products,marketplaceFeed,productUrls,executionMetadata,runtimeMetadata,configuration",
);
check("snapshot keys are batch id, product count, ranked count, created at, and metadata", BATCH_SNAPSHOT_KEYS.join() === "batchId,productCount,rankedCount,createdAt,metadata");
check("statistics keys count products, successes, failures, and ranked products", BATCH_STATISTICS_KEYS.join() === "productCount,succeededCount,failedCount,rankedCount,executionTime");
check("Missing Product List: a missing envelope is rejected", has(validator.validateInput(null), /Missing Product List/));
check("Missing Product List: an empty list is rejected", has(validator.validateInput({ products: [] }), /Missing Product List/));
check("Invalid Metadata: a nested record is rejected", has(validator.validateInput({ products: [productOf("Alpha Tonic", "alpha-1")], executionMetadata: { nested: { a: 1 } } }), /Invalid Metadata/));
check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput({ products: [productOf("Alpha Tonic", "alpha-1")], extra: true }), /Invalid Metadata/));
check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(process.cwd(), "src/lib/product-intelligence/batch-context.ts"), "utf8")));

async function main() {
  const source = {
    products: [productOf("Alpha Tonic", "alpha-1"), productOf("Beta Capsule", "beta-1", { rawHtml: "<p>no labeled fields</p>" })],
    marketplaceFeed: [productOf("Gamma Drop", "gamma-1")],
    productUrls: ["https://example.test/marketplace/delta"],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
  };
  const built = await analyzerOf().analyze(source);
  if (built.status !== "OK") console.log(JSON.stringify(built.issues, null, 2));
  const rows = built.analysis?.products ?? [];
  const alpha = rows.find((row) => row.candidateId === "alpha-tonic");
  const gamma = rows.find((row) => row.candidateId === "gamma-drop");
  const beta = rows.find((row) => row.source === "products" && row.index === 1);
  const delta = rows.find((row) => row.source === "productUrls");
  if (alpha?.status !== "OK" || gamma?.status !== "OK") console.log(JSON.stringify(rows.map((row) => ({ source: row.source, index: row.index, status: row.status, issues: row.issues, candidateId: row.candidateId })), null, 2));
  check("a mixed batch returns OK", built.status === "OK" && built.snapshot !== null && built.analysis !== null);
  check("each product is recorded", rows.length === 4);
  check("a labeled product is analyzed", alpha?.status === "OK" && alpha?.productName === "Alpha Tonic" && alpha?.ranked === true);
  check("a feed product is analyzed independently", gamma?.status === "OK" && gamma?.productName === "Gamma Drop" && gamma?.source === "marketplaceFeed");
  check("a broken product fails and the others remain", beta?.status === "REJECTED" && has(beta?.issues ?? [], /Missing Product/) && alpha?.status === "OK" && gamma?.status === "OK");
  check("a URL without a product record fails and the others remain", delta?.status === "REJECTED" && has(delta?.issues ?? [], /Missing Product/) && rows.filter((row) => row.status === "OK").length === 2);
  const order = built.analysis?.rankedProducts.map((item) => `${item.candidateId}:${item.rankingPosition}`).join();
  check("ranked products follow the recommendation order", order === "alpha-tonic:1,gamma-drop:2" || order === "gamma-drop:1,alpha-tonic:2");
  check("ranking positions are contiguous", built.analysis?.rankedProducts.every((item, index) => item.rankingPosition === index + 1) === true);
  check(
    "statistics restate successes and failures",
    built.statistics?.productCount === 4 && built.statistics?.succeededCount === 2 && built.statistics?.failedCount === 2 && built.statistics?.rankedCount === 2,
  );
  check("the snapshot names the batch", built.snapshot?.batchId === "batch-1" && built.snapshot?.productCount === 4 && built.snapshot?.rankedCount === 2 && built.metadata.run === "r1");
  check("recommendations are present and do not approve a product", built.analysis?.recommendations !== null && !JSON.stringify(built.analysis?.recommendations).includes("APPROVED"));

  source.products[0].rawHtml = "changed";
  (source.executionMetadata as { run: string }).run = "changed";
  try {
    if (built.analysis) (built.analysis.rankedProducts as unknown as { candidateId: string }[])[0].candidateId = "hacked";
    if (built.snapshot) (built.snapshot.batchId as string) = "hacked";
  } catch {
    /* frozen */
  }
  check(
    "No mutation: changing the input leaves the batch unchanged",
    built.analysis?.products.find((row) => row.candidateId === "alpha-tonic")?.productName === "Alpha Tonic" && built.metadata.run === "r1" && built.snapshot?.batchId === "batch-1",
  );
  check("Immutable snapshot: the batch and snapshot cannot be assigned into", built.snapshot?.batchId === "batch-1" && built.analysis?.rankedProducts[0]?.candidateId !== "hacked");
  check("freeze helper returns the same value", freezeDeepBatch(built.analysis) === built.analysis);

  const left = analyzerOf();
  const right = analyzerOf();
  await left.analyze({ products: [productOf("Alpha Tonic", "alpha-1")] });
  await right.analyze(null);
  check("Independent analyzer: analyzers do not share snapshots", left.getSnapshot("batch-1")?.productCount === 1 && right.getSnapshot("batch-1") === null);

  const again = await analyzerOf().analyze({
    products: [productOf("Gamma Drop", "gamma-1"), productOf("Alpha Tonic", "alpha-1")],
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "m1" },
  });
  check(
    "deterministic batch: a second analyzer matches the ranking",
    again.analysis?.rankedProducts.map((item) => `${item.candidateId}:${item.rankingPosition}`).join() === order,
  );

  const missing = await analyzerOf().analyze(null);
  check("a missing list stores no snapshot", missing.status === "REJECTED" && has(missing.issues, /Missing Product List/) && missing.snapshot === null && missing.analysis === null);

  const dir = join(process.cwd(), "src/lib/product-intelligence");
  const names = ["product-batch-analyzer.ts", "batch-runner.ts", "batch-validator.ts", "batch-context.ts", "batch-snapshot.ts"];
  const files = readdirSync(dir).filter((f) => names.includes(f));
  check("five batch modules exist", files.sort().join() === names.slice().sort().join());
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no live fetch in code", !code.some((l) => /fetch\(|oauth|googleapis|access_token|node:http|node:https|Authorization:|upload\(|retry|rate.?limit|Promise\.all/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no campaign publisher or ad client in code", !code.some((l) => /google-ads-campaign-publisher|google-ads-publish|google-ads-transport|google-ads-authentication|google-ads-client|publish\(/i.test(l)));
  check("no automatic approval token in code", !bare.some((l) => /\bAPPROVED\b|\bapprove\(/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check(
    "imports stay inside the batch modules or the existing analysis and recommendation engines",
    imports.every((i) => /^\.\/(product-batch-analyzer|batch-runner|batch-validator|batch-context|batch-snapshot|product-analysis-pipeline|product-recommendation-engine)$/.test(i.from)),
  );
  const prefixes = ["clickbank", "landing-page", "google-search", "competition", "commercial", "product-report", "product-opportunity", "product-analysis", "product-recommendation", "recommendation", "ranking"];
  for (const prefix of prefixes) {
    const siblings = readdirSync(dir).filter((f) => new RegExp(`^${prefix}[a-z-]*\\.ts$`).test(f) && !f.startsWith("batch-") && f !== "product-batch-analyzer.ts");
    check(`${prefix} modules do not import the batch analyzer`, siblings.every((f) => !/product-batch-|batch-runner|batch-validator|batch-context|batch-snapshot/.test(readFileSync(join(dir, f), "utf8"))));
  }
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the batch analyzer`, !sources.some((f) => /product-batch-|batch-runner|batch-snapshot/.test(readFileSync(f, "utf8"))));
  }

  if (failures > 0) {
    console.log(`BATCH_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("BATCH_FAILURES=0");
}

main();
