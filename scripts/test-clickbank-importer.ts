import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClickBankImporter } from "../src/lib/product-intelligence/clickbank-importer.ts";
import { CLICKBANK_CONTEXT_MEMBERS } from "../src/lib/product-intelligence/clickbank-context.ts";
import { createClickBankParser } from "../src/lib/product-intelligence/clickbank-parser.ts";
import { createClickBankValidator } from "../src/lib/product-intelligence/clickbank-validator.ts";
import { createClickBankNormalizer } from "../src/lib/product-intelligence/clickbank-normalizer.ts";
import {
  CLICKBANK_FACT_ORIGINS,
  CLICKBANK_FACT_PROVENANCE,
  CLICKBANK_IMPORT_STATUSES,
  CLICKBANK_PRODUCT_FACTS_KEYS,
  CLICKBANK_SNAPSHOT_KEYS,
  CLICKBANK_STATISTICS_KEYS,
  createClickBankImportSnapshot,
  freezeDeepClickBank,
} from "../src/lib/product-intelligence/clickbank-types.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function htmlOf() {
  return `
<dl>
  <dt>Product Name</dt><dd>Alpha Tonic</dd>
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
  <dt>Affiliate Resources</dt><dd>https://example.test/resources/one, https://example.test/resources/two</dd>
</dl>`;
}

function inputOf(over: Record<string, unknown> = {}) {
  return {
    marketplaceUrl: "https://example.test/marketplace/alpha-1",
    marketplaceProductId: "alpha-1",
    rawHtml: htmlOf(),
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    configuration: { mode: "OFFLINE" },
    ...over,
  };
}

function importerOf() {
  let n = 0;
  return createClickBankImporter({
    now: () => 0,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => `import-${++n}`,
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
  const validator = createClickBankValidator();
  const parser = createClickBankParser();
  const normalizer = createClickBankNormalizer();
  check("import statuses are OK then REJECTED", CLICKBANK_IMPORT_STATUSES.join() === "OK,REJECTED");
  check("origin is IMPORTED", CLICKBANK_FACT_ORIGINS.join() === "IMPORTED");
  check("provenance is DIRECT_SOURCE", CLICKBANK_FACT_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members are in the requested order", CLICKBANK_CONTEXT_MEMBERS.join() === "marketplaceUrl,marketplaceProductId,rawHtml,executionMetadata,runtimeMetadata,configuration");
  check("product facts keys are in the requested order", CLICKBANK_PRODUCT_FACTS_KEYS.join() === "productName,vendor,vendorId,category,gravity,initialSale,averageSale,averageRebill,commissionType,language,marketplaceUrl,affiliatePage,supportUrl,refundPolicy,affiliateResources,description,disclaimer,origin,provenance,sourceUrl,sourceFacts,metadata");
  check("snapshot keys are in the requested order", CLICKBANK_SNAPSHOT_KEYS.join() === "importId,productId,productName,vendorId,marketplaceUrl,createdAt,metadata");
  check("statistics keys are in the requested order", CLICKBANK_STATISTICS_KEYS.join() === "importCount,fieldCount,issueCount,executionTime");

  check("a well-formed input is accepted", validator.validateInput(inputOf()).length === 0);
  check("Malformed URL: a missing marketplace URL is rejected", has(validator.validateUrl("", "marketplaceUrl"), /Malformed URL/));
  check("Malformed URL: a non-https address is rejected", has(validator.validateUrl("ftp://example.test", "marketplaceUrl"), /Malformed URL/));
  check("Missing Product: a missing product name is rejected", has(validator.validateProduct({ marketplaceProductId: "alpha-1" }), /Missing Product/));
  check("Missing Vendor: a missing vendor name is rejected", has(validator.validateVendor({ productName: "Alpha Tonic" }), /Missing Vendor/));
  check("Invalid Metadata: nested metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid Metadata/));
  check("Invalid Metadata: an unexpected member is rejected", has(validator.validateInput(inputOf({ extra: 1 })), /Invalid Metadata/));
  check("Duplicate Import: a second id is detected", has(validator.detectDuplicate("alpha-1", new Set(["alpha-1"])), /Duplicate Import/));

  const snap = createClickBankImportSnapshot({
    importId: "import-1",
    productId: "alpha-1",
    productName: "Alpha Tonic",
    vendorId: "vendor-north",
    marketplaceUrl: "https://example.test/marketplace/alpha-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { run: "r1" },
  });
  check("a snapshot has exactly the requested fields", Object.keys(snap).join() === CLICKBANK_SNAPSHOT_KEYS.join());
  check("a snapshot is frozen", Object.isFrozen(snap) && Object.isFrozen(snap.metadata));
  try {
    (snap.metadata as Record<string, unknown>).run = "tampered";
  } catch {
    /* frozen */
  }
  check("Immutable Snapshot: the snapshot cannot be changed", snap.metadata.run === "r1");
  check("freezeDeepClickBank never throws", freezeDeepClickBank(1) === 1 && Object.isFrozen(freezeDeepClickBank({ n: 1 })));
  check("a well-formed snapshot validates", validator.validateSnapshot(snap).length === 0);

  check("the parser restates labeled marketplace fields", parser.parse(inputOf()).record.productName === "Alpha Tonic" && parser.parse(inputOf()).record.vendor === "Vendor North" && parser.parse(inputOf()).record.gravity === "12.5");
  const jsonParsed = parser.parse({
    marketplaceUrl: "https://example.test/marketplace/alpha-1",
    marketplaceProductId: "alpha-1",
    rawHtml: JSON.stringify({
      productName: "Alpha Tonic",
      vendor: "Vendor North",
      vendorId: "vendor-north",
      gravity: 12.5,
      initialSale: "$47.00",
    }),
  });
  check("the parser restates a JSON marketplace record", jsonParsed.record.productName === "Alpha Tonic" && jsonParsed.record.vendorId === "vendor-north");

  check("currency is normalized", normalizer.normalizeMoney("$47.00")?.amount === 47 && normalizer.normalizeMoney("$47.00")?.currency === "USD");
  check("numbers are normalized", normalizer.normalizeNumber("1,234.50") === 1234.5);
  check("percentages are normalized", normalizer.normalizePercent("75%") === 75);
  check("categories are normalized", normalizer.normalizeCategory("  Health   & Fitness ") === "Health & Fitness");
  check("languages are normalized", normalizer.normalizeLanguage("English") === "en" && normalizer.normalizeLanguage("pt-BR") === "pt");
  check("URLs are normalized", normalizer.normalizeUrl("https://example.test/offer/") === "https://example.test/offer");

  const importer = importerOf();
  const built = importer.import(inputOf());
  check("the importer returns OK with ProductFacts, statistics, snapshot, and metadata", built.status === "OK" && built.facts !== null && built.snapshot !== null && built.statistics !== null && built.issues.length === 0 && built.executionTime === 0);
  check("ProductFacts restate name, vendor, category, gravity, sales, and commission type", built.facts!.productName === "Alpha Tonic" && built.facts!.vendor === "Vendor North" && built.facts!.vendorId === "vendor-north" && built.facts!.category === "Health & Fitness" && built.facts!.gravity === 12.5 && built.facts!.initialSale?.amount === 47 && built.facts!.initialSale?.currency === "USD" && built.facts!.averageSale?.amount === 51.25 && built.facts!.averageRebill?.amount === 19 && built.facts!.commissionType === "recurring");
  check("ProductFacts restate language, URLs, refund policy, description, and disclaimer", built.facts!.language === "en" && built.facts!.marketplaceUrl === "https://example.test/marketplace/alpha-1" && built.facts!.affiliatePage === "https://example.test/offer/alpha" && built.facts!.supportUrl === "https://example.test/support" && built.facts!.refundPolicy?.includes("60-day") === true && built.facts!.description === "A restated marketplace description." && built.facts!.disclaimer?.includes("seller claims") === true && built.facts!.affiliateResources.length === 2);
  check("ProductFacts origin is IMPORTED and provenance is DIRECT_SOURCE", built.facts!.origin === "IMPORTED" && built.facts!.provenance === "DIRECT_SOURCE" && built.facts!.sourceFacts.every((item) => item.confidence === "DIRECT_SOURCE"));
  check("a ProductFacts record has exactly the requested fields", Object.keys(built.facts!).join() === CLICKBANK_PRODUCT_FACTS_KEYS.join());
  check("statistics count one import and restated fields", built.statistics!.importCount === 1 && built.statistics!.fieldCount >= 16 && built.statistics!.issueCount === 0);
  check("the snapshot stores import, product, vendor, and marketplace URL", built.snapshot!.importId === "import-1" && built.snapshot!.productId === "alpha-1" && built.snapshot!.productName === "Alpha Tonic" && built.snapshot!.vendorId === "vendor-north");
  check("getSnapshot returns the stored snapshot", importer.getSnapshot("import-1") === built.snapshot && importer.getSnapshot("nope") === null);
  check("the records are frozen", Object.isFrozen(built.facts) && Object.isFrozen(built.snapshot) && Object.isFrozen(built.facts!.sourceFacts) && Object.isFrozen(built.statistics));
  check("metadata is restated on the result", built.metadata.run === "r1");

  const missing = importerOf().import(null);
  check("Invalid Metadata: a missing input is refused", missing.status === "REJECTED" && has(missing.issues, /Invalid Metadata/) && missing.facts === null);
  const badUrl = importerOf().import(inputOf({ marketplaceUrl: "not-a-url" }));
  check("Malformed URL is refused", badUrl.status === "REJECTED" && has(badUrl.issues, /Malformed URL/));
  const noProduct = importerOf().import(inputOf({ rawHtml: "<p>no labeled fields</p>" }));
  check("Missing Product is refused", noProduct.status === "REJECTED" && has(noProduct.issues, /Missing Product/));
  const noVendor = importerOf().import(inputOf({ rawHtml: "<dl><dt>Product Name</dt><dd>Alpha Tonic</dd></dl>" }));
  check("Missing Vendor is refused", noVendor.status === "REJECTED" && has(noVendor.issues, /Missing Vendor/));
  const nested = importerOf().import(inputOf({ executionMetadata: { a: { b: 1 } } }));
  check("Invalid Metadata is refused", nested.status === "REJECTED" && has(nested.issues, /Invalid Metadata/));
  const first = importerOf();
  first.import(inputOf());
  const duplicate = first.import(inputOf());
  check("Duplicate Import is refused", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Import/) && duplicate.facts === null);
  check("a refused import stores no snapshot", importerOf().getSnapshot("import-1") === null);

  const onceA = importerOf().import(inputOf());
  const onceB = importerOf().import(inputOf());
  check("Deterministic import: the same records yield the same ProductFacts and snapshot", onceA.status === "OK" && JSON.stringify(onceA.facts) === JSON.stringify(onceB.facts) && JSON.stringify(onceA.snapshot) === JSON.stringify(onceB.snapshot));

  const source = inputOf();
  const imported = importerOf().import(source);
  (source.executionMetadata as { run: string }).run = "changed";
  (source as { marketplaceProductId: string }).marketplaceProductId = "changed";
  source.rawHtml = "changed";
  check("No mutation: changing the input after import leaves ProductFacts unchanged", imported.facts!.metadata.run === "r1" && imported.facts!.productName === "Alpha Tonic" && imported.snapshot!.productId === "alpha-1");
  try {
    (imported.facts!.productName as string) = "hacked";
    (imported.snapshot!.productId as string) = "hacked";
  } catch {
    /* frozen */
  }
  check("Immutable ProductFacts: the facts and snapshot cannot be assigned into", imported.facts!.productName === "Alpha Tonic" && imported.snapshot!.productId === "alpha-1");

  const left = importerOf();
  const right = importerOf();
  left.import(inputOf());
  right.import(null);
  check("Independent importer: importers do not share snapshots", left.getSnapshot("import-1")?.productId === "alpha-1" && right.getSnapshot("import-1") === null);

  const dir = join(process.cwd(), "src/lib/product-intelligence");
  const files = readdirSync(dir).filter((f) => /^clickbank-[a-z]+\.ts$/.test(f));
  check("six importer modules exist: context, importer, normalizer, parser, types, validator", files.sort().join() === "clickbank-context.ts,clickbank-importer.ts,clickbank-normalizer.ts,clickbank-parser.ts,clickbank-types.ts,clickbank-validator.ts");
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
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "clickbank-context.ts"), "utf8")));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 4);
  check("every import stays inside the product-intelligence folder", imports.every((i) => /^\.\/clickbank-[a-z]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, Workflow, Execution, Google Ads, the LP Builder, Grounding, Publication, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|workflow|execution|google-ads|lp-builder|import-product|grounding|publication|analytics|product-facts|traffic|db/i.test(i.from)));
  const others = listTs(join(process.cwd(), "src/lib")).filter((f) => !f.replace(/\\/g, "/").includes("/product-intelligence/"));
  check("no other lib module imports the ClickBank importer", !others.some((f) => /product-intelligence|clickbank-importer/.test(readFileSync(f, "utf8"))));
  const productFactsSrc = readFileSync(join(process.cwd(), "src/lib/product-facts.ts"), "utf8");
  check("existing ProductFacts internals are unchanged by this importer", !/product-intelligence|clickbank-importer/.test(productFactsSrc));
  const existingImporter = readFileSync(join(process.cwd(), "src/lib/import-product.ts"), "utf8");
  check("existing importer internals are unchanged", !/product-intelligence|clickbank-importer/.test(existingImporter));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nClickBank product importer: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
