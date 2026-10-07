import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REAL_PRODUCT_CONTEXT_MEMBERS } from "../src/lib/real-product/product-context.ts";
import {
  REAL_OBSERVED_PRODUCT_KEYS,
  REAL_PRODUCT_CONFIDENCE_KEYS,
  REAL_PRODUCT_EVIDENCE_KEYS,
  REAL_PRODUCT_EVIDENCE_METADATA_KEYS,
  REAL_PRODUCT_IDENTITY_KEYS,
  REAL_PRODUCT_ORIGINS,
  REAL_PRODUCT_PROVENANCE,
  REAL_PRODUCT_RESULT_KEYS,
  REAL_PRODUCT_SESSION_KEYS,
  REAL_PRODUCT_STATISTICS_KEYS,
  REAL_PRODUCT_STATUSES,
} from "../src/lib/real-product/product-evidence-builder.ts";
import { createRealProductSession } from "../src/lib/real-product/product-session.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: readonly { field: string; message: string }[], text: RegExp) => issues.some((item) => text.test(`${item.field} ${item.message}`));
const T0 = "2026-01-01T00:00:00.000Z";

const HTML = `<html lang="en"><head>
<title>Zebra Offer notes</title>
<meta name="title" content="Zebra meta">
<meta property="og:title" content="Zebra Offer">
<meta property="og:image" content="https://example.test/og.png">
<link rel="canonical" href="https://example.test/buy">
<script type="application/ld+json">
{"@graph":[{"@type":"Product","name":"Zebra Offer","brand":{"@type":"Brand","name":"North Brand"},"image":"https://example.test/zebra.png","offers":{"@type":"Offer","price":"47.00","priceCurrency":"USD","seller":{"@type":"Organization","name":"Vendor North"}}}]}
</script>
</head><body>
<h1>Zebra Offer</h1>
<h2>Desk notes</h2>
<a href="https://example.test/buy">Buy Zebra Offer</a>
<img src="https://example.test/zebra.png">
<p>$12.00</p>
</body></html>`;

function pageOf(id: string, html: string, finalUrl = "https://example.test/buy") {
  return { landingPageId: id, html, finalUrl };
}

function sessionFor(idFactory?: () => string) {
  let tick = 0;
  return createRealProductSession({ now: () => tick++, timestamp: () => T0, idFactory });
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

function main() {
  check("statuses are OK and REJECTED", REAL_PRODUCT_STATUSES.join() === "OK,REJECTED");
  check("origin is OBSERVED and provenance is DIRECT_SOURCE", REAL_PRODUCT_ORIGINS.join() === "OBSERVED" && REAL_PRODUCT_PROVENANCE.join() === "DIRECT_SOURCE");
  check("context members name the landing page snapshots", REAL_PRODUCT_CONTEXT_MEMBERS.join() === "landingPageSnapshots,executionMetadata,runtimeMetadata,configuration");

  const input = {
    landingPageSnapshots: [pageOf("page-1", HTML)],
    executionMetadata: { note: "kept" },
  };
  const session = sessionFor();
  const built = session.identify(input);
  const product = built.products?.[0];
  input.landingPageSnapshots[0].html = "<html><title>changed</title></html>";
  input.executionMetadata.note = "changed";
  check(
    "one page becomes an observed product with evidence",
    built.status === "OK" &&
      product !== undefined &&
      product.identity.productName === "Zebra Offer" &&
      product.identity.brand === "North Brand" &&
      product.identity.vendor === "Vendor North" &&
      product.identity.price === "47.00" &&
      product.identity.currency === "USD" &&
      product.identity.language === "en" &&
      product.identity.primaryDomain === "example.test" &&
      product.identity.primaryCta?.label === "Buy Zebra Offer" &&
      product.identity.primaryCta.url === "https://example.test/buy" &&
      product.evidence.pageTitle === "Zebra Offer notes" &&
      product.evidence.metaTitle === "Zebra meta" &&
      product.evidence.openGraphTitle === "Zebra Offer" &&
      product.evidence.h1 === "Zebra Offer" &&
      product.evidence.h2s.join() === "Desk notes" &&
      product.evidence.canonicalUrl === "https://example.test/buy" &&
      product.evidence.structuredData?.includes("North Brand") === true &&
      product.evidence.images.join() === "https://example.test/og.png,https://example.test/zebra.png" &&
      product.evidenceMetadata.productNameSource === "structured-data" &&
      product.confidenceInputs.productName === true &&
      product.confidenceInputs.currency === true &&
      product.confidenceInputs.primaryImages === true &&
      built.graph !== null &&
      built.graph.nodes.some((node) => node.kind === "ObservedProduct" && node.label === "Zebra Offer") &&
      built.graph.edges.length > 0 &&
      built.statistics.observedProductCount === 1 &&
      built.statistics.pageCount === 1,
  );
  check(
    "the snapshot is stored and later input changes leave it unchanged",
    built.snapshot !== null &&
      session.getSnapshot("product-session-1") === built.snapshot &&
      Object.isFrozen(built.snapshot) &&
      Object.isFrozen(product) &&
      Object.isFrozen(product?.evidence) &&
      built.snapshot?.metadata.note === "kept" &&
      built.snapshot?.products[0]?.identity.productName === "Zebra Offer" &&
      Object.keys(built).join() === REAL_PRODUCT_RESULT_KEYS.join() &&
      Object.keys(built.statistics).join() === REAL_PRODUCT_STATISTICS_KEYS.join() &&
      Object.keys(built.snapshot ?? {}).join() === REAL_PRODUCT_SESSION_KEYS.join() &&
      Object.keys(product ?? {}).join() === REAL_OBSERVED_PRODUCT_KEYS.join() &&
      Object.keys(product?.identity ?? {}).join() === REAL_PRODUCT_IDENTITY_KEYS.join() &&
      Object.keys(product?.evidence ?? {}).join() === REAL_PRODUCT_EVIDENCE_KEYS.join() &&
      Object.keys(product?.evidenceMetadata ?? {}).join() === REAL_PRODUCT_EVIDENCE_METADATA_KEYS.join() &&
      Object.keys(product?.confidenceInputs ?? {}).join() === REAL_PRODUCT_CONFIDENCE_KEYS.join(),
  );

  const again = sessionFor();
  const second = again.identify({ landingPageSnapshots: [pageOf("page-1", HTML)] });
  check("an independent identifier keeps its own snapshot", second.status === "OK" && second.products?.[0]?.identity.productName === "Zebra Offer" && second.snapshot !== built.snapshot && again.getSnapshot("product-session-1") !== session.getSnapshot("product-session-1"));

  const marked = sessionFor().identify({
    landingPageSnapshots: [pageOf("page-1", `<html><head><meta property="og:title" content="Other Title"></head><body><span data-field="productName">Zebra Offer</span></body></html>`)],
  });
  check("a marked product name is copied ahead of the open graph title", marked.status === "OK" && marked.products?.[0]?.identity.productName === "Zebra Offer" && marked.products[0].evidence.openGraphTitle === "Other Title" && marked.products[0].evidenceMetadata.productNameSource === "data-field");

  const priced = sessionFor().identify({
    landingPageSnapshots: [pageOf("page-1", `<html><body><h1>Zebra Offer</h1><p>$12.00</p></body></html>`)],
  });
  check("a price symbol does not become a currency", priced.status === "OK" && priced.products?.[0]?.identity.productName === "Zebra Offer" && priced.products[0].identity.price === null && priced.products[0].identity.currency === null && priced.products[0].evidenceMetadata.productNameSource === "h1");

  const missingHtml = sessionFor().identify({ landingPageSnapshots: [{ landingPageId: "page-1", finalUrl: "https://example.test/buy" }] });
  check("missing HTML stores nothing", missingHtml.status === "REJECTED" && has(missingHtml.issues, /Missing HTML/) && missingHtml.snapshot === null);

  const malformed = sessionFor().identify({ landingPageSnapshots: [{ landingPageId: "page-1", html: 12 }] });
  check("malformed HTML stores nothing", malformed.status === "REJECTED" && has(malformed.issues, /Malformed HTML/) && malformed.snapshot === null);

  const noName = sessionFor().identify({
    landingPageSnapshots: [pageOf("page-1", HTML), pageOf("page-2", "<html><head><title>Only a title</title></head><body><p>No heading</p></body></html>")],
  });
  check("missing product evidence stops the identification", noName.status === "REJECTED" && has(noName.issues, /Missing Product Evidence/) && noName.snapshot === null && noName.products === null);

  const nested = sessionFor().identify({ landingPageSnapshots: [pageOf("page-1", HTML)], configuration: { nested: { inner: true } } });
  check("nested metadata stores nothing", nested.status === "REJECTED" && has(nested.issues, /Missing Metadata/) && nested.snapshot === null);

  const badId = sessionFor(() => "BAD").identify({ landingPageSnapshots: [pageOf("page-1", HTML)] });
  check("a corrupted session id stores nothing", badId.status === "REJECTED" && has(badId.issues, /Missing Metadata/) && badId.snapshot === null);

  const dir = join(process.cwd(), "src/lib/real-product");
  const names = [
    "real-product-identifier.ts",
    "product-html-parser.ts",
    "product-evidence-builder.ts",
    "product-validator.ts",
    "product-context.ts",
    "product-session.ts",
  ];
  check("six product modules exist", names.every((name) => readdirSync(dir).includes(name)));
  const files = names.map((name) => join(dir, name));
  const bundled = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const isCode = (line: string) => !/^\s*(\/\/|\/\*|\*)/.test(line);
  const code = bundled.split(/\r?\n/).filter(isCode);
  check("no product names", !bundled.split(/\r?\n/).some((line) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(line)));
  check("the identifier does not retrieve a page or call a model", !code.some((line) => /fetch\(|searchapi\.io|process\.env|DOMParser|cheerio|anthropic|openai|clickbank|product-intelligence/i.test(line)));
  check("no ordering, model calls, or outside catalogs in code", !code.some((line) => /\brank\b|\bscor(?:e|es|ing)\b|\.sort\(|google-ads|campaign|recommend|\bdecision\b/i.test(line)));
  check("the context module stays contracts only", !/^\s*export\s+(async\s+)?(function|class)\b/m.test(readFileSync(join(dir, "product-context.ts"), "utf8")));
  const folders = ["discovery", "opportunity", "traffic", "decision", "workflow", "execution", "providers/google-ads", "platform", "product-intelligence", "market-discovery", "search-intelligence", "search-provider", "real-landing-page"];
  for (const folder of folders) {
    const sources = listTs(join(process.cwd(), "src/lib", folder));
    check(`${folder} modules do not import the real identifier`, !sources.some((file) => /real-product/.test(readFileSync(file, "utf8"))));
  }

  if (failures > 0) {
    console.log(`REAL_PRODUCT_IDENTIFIER_FAILURES=${failures}`);
    process.exit(1);
  }
  console.log("REAL_PRODUCT_IDENTIFIER_FAILURES=0");
}

main();
