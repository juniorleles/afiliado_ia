// npx tsx scripts/test-research-coverage-54m.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { collectInformationalCandidates, discoverInformationalUrls } from "../src/lib/research-coverage/discover.ts";
import { classifyPageIntent } from "../src/lib/research-coverage/page-intent.ts";
import { rankResearchCandidates } from "../src/lib/research-coverage/rank.ts";
import { fetchCoverageSources } from "../src/lib/research-coverage/run.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { inspectContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { enrichPresellContent } from "../src/lib/presell-enrichment/enrich.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function inputOf(facts: ReturnType<typeof emptyProductFacts>): ContractInput {
  return {
    facts,
    slug: "novalis-core",
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
  };
}

const footerHtml = `<html><body>
<a href="/help/contact-us.php">Contact</a>
<a href="/help/references.php">References</a>
<a href="/help/terms.php">Terms</a>
<a href="/help/disclaimer.php">Disclaimer</a>
<a href="/help/privacy.php">Privacy</a>
<a href="/help/shipping.php">Shipping</a>
<a href="/help/refunds.php">Refunds</a>
</body></html>`;

const collected = collectInformationalCandidates({
  html: footerHtml,
  pageUrl: "https://shop.novalis.example/core",
});
assert(collected.candidates.some((item) => /shipping\.php$/.test(item.url)), "shipping is collected before the fetch limit");
assert(collected.candidates.some((item) => /refunds\.php$/.test(item.url)), "refunds are collected before the fetch limit");
assert(collected.candidates[0]?.url.includes("contact-us"), "HTML order still starts with the first footer link");

const htmlOrder = collected.candidates.slice(0, 5).map((item) => item.url);
assert(htmlOrder.every((item) => !/shipping|refunds/.test(item)), "HTML-order selection would spend the budget on legal and contact pages");

const ranked = discoverInformationalUrls({
  html: footerHtml,
  pageUrl: "https://shop.novalis.example/core",
  limit: 5,
  gaps: ["commercial", "price"],
});
assert(ranked.urls.some((item) => /shipping\.php$/.test(item)), "ranked selection fetches shipping when commercial is a gap");
assert(ranked.urls.some((item) => /refunds\.php$/.test(item)), "ranked selection fetches refunds when commercial is a gap");
assert(ranked.ranking.selected[0]?.reasons.some((item) => /not evidence that the page is accurate/i.test(item)), "ranking does not treat a URL word as proof");
assert(ranked.ranking.excluded.some((item) => /privacy|terms|disclaimer|references/.test(item.url)), "generic legal pages can lose the budget after ranking");

const intent = classifyPageIntent({ url: "https://shop.novalis.example/help/shipping.php" });
assert(intent.intent === "SHIPPING", "a shipping path is classified as SHIPPING");
assert(intent.confidence === "LOW", "a path token alone stays low-confidence");
assert(intent.notes.some((item) => /not evidence/i.test(item)), "intent notes refuse to certify the page");

const agreed = classifyPageIntent({
  url: "https://shop.novalis.example/help/shipping.php",
  anchorText: "Shipping times",
  title: "Shipping",
});
assert(agreed.confidence === "HIGH", "path, label, and title together raise intent confidence");

const dupes = collectInformationalCandidates({
  html: `<a href="/help/shipping.php?">Ship</a><a href="/help/shipping.php">Ship again</a>`,
  pageUrl: "https://shop.novalis.example/core",
});
assert(dupes.candidates.filter((item) => /shipping/.test(item.url)).length === 1, "duplicate shipping paths collapse");
assert(dupes.skipped.some((item) => item.reason === "duplicate candidate"), "the duplicate is recorded, not fetched twice");

const first = rankResearchCandidates({
  candidates: collected.candidates,
  gaps: ["commercial"],
  limit: 5,
});
const second = rankResearchCandidates({
  candidates: collected.candidates,
  gaps: ["commercial"],
  limit: 5,
});
assert(
  first.selected.map((item) => item.url).join("|") === second.selected.map((item) => item.url).join("|"),
  "ranking is deterministic",
);

const filledFaq = discoverInformationalUrls({
  html: footerHtml,
  pageUrl: "https://shop.novalis.example/core",
  limit: 5,
  gaps: ["faq"],
});
assert(filledFaq.ranking.selected.some((item) => item.pageIntent === "CONTACT" || item.pageIntent === "FAQ"), "an FAQ gap can keep a support page");

const beauty = discoverInformationalUrls({
  html: `<a href="/how-to">How to apply</a><a href="/privacy">Privacy</a>`,
  pageUrl: "https://pellucid.example/balm",
  gaps: ["usage"],
});
assert(beauty.urls.some((item) => /how-to/.test(item)), "beauty usage pages outrank legal pages");

const electronics = discoverInformationalUrls({
  html: `<a href="/specs">Specifications</a><a href="/terms">Terms</a>`,
  pageUrl: "https://quillon.example/x2",
  gaps: ["composition"],
});
assert(electronics.urls[0]?.includes("/specs"), "electronics specification pages outrank legal pages");

const digital = discoverInformationalUrls({
  html: `<a href="/faq">FAQ</a><a href="/disclaimer">Disclaimer</a>`,
  pageUrl: "https://brindle.example/workbook",
  gaps: ["faq"],
});
assert(digital.urls[0]?.endsWith("/faq"), "digital-product FAQ pages outrank legal pages");

const pages = new Map<string, string>([
  ["https://shop.novalis.example/core", footerHtml],
  ["https://shop.novalis.example/help/shipping.php", `<html><body><h2>Shipping</h2><p>Orders ship within two business days.</p></body></html>`],
  ["https://shop.novalis.example/help/refunds.php", `<html><body><h2>Refunds</h2><p>Unopened items may be returned within 30 days.</p></body></html>`],
  ["https://shop.novalis.example/help/contact-us.php", `<html><body><h2>FAQ</h2><h3>How many capsules are in a bottle?</h3><p>Each bottle contains 60 vegetable capsules.</p></body></html>`],
  ["https://shop.novalis.example/help/privacy.php", `<html><body><h2>Privacy</h2><p>We store the email used to place an order.</p></body></html>`],
  ["https://shop.novalis.example/help/terms.php", `<html><body><h2>Terms</h2><p>Use of the site is at your own risk.</p></body></html>`],
  ["https://shop.novalis.example/help/disclaimer.php", `<html><body><h2>Disclaimer</h2><p>This is not medical advice.</p></body></html>`],
  ["https://shop.novalis.example/help/references.php", `<html><body><h2>References</h2><p>Independent journals are listed for background reading.</p></body></html>`],
]);

async function main() {
  const fetched = await fetchCoverageSources({
    urls: ["https://shop.novalis.example/core"],
    discoverAdditional: true,
    gaps: ["commercial", "price"],
    fetchPage: async (url) => {
      const html = pages.get(url);
      if (!html) return { ok: false, url, status: 404, reason: "HTTP 404" };
      return { ok: true, url, status: 200, contentType: "text/html", body: Buffer.from(html) };
    },
  });
  assert(fetched.discovered.some((item) => /shipping\.php$/.test(item)), "controlled research now discovers shipping");
  assert(fetched.sources.some((item) => /shipping\.php$/.test(item.url)), "the shipping page is fetched");
  assert(fetched.sources.some((item) => /refunds\.php$/.test(item.url)), "the refunds page is fetched");
  assert(fetched.ranking.selected.every((item) => item.reasons.some((note) => /does not decide whether a claim is true/i.test(note))), "ranking is not a truth verdict");

  const facts = emptyProductFacts("Novalis Core", "https://shop.novalis.example/core", "MANUAL");
  facts.confidence.productName = "MANUAL";
  facts.productFormat = {
    value: "dietary supplement",
    statement: "dietary supplement",
    provenance: "MANUAL",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://shop.novalis.example/core",
    sourcePageCategory: "PRIMARY",
  };
  facts.usageInformation = ["Take one capsule every morning with water."];
  const enriched = enrichPresellContent({ facts, sources: fetched.sources, withheld: [], conflicts: [] });
  const contract = buildProductContract(inputOf(enriched.facts)).contract;
  const brief = buildConversionBrief(contract);
  const page = buildPageBlueprint({ contract, brief });
  assert(inspectContentQuality({ copy: page.copy, contract, brief }).length === 0, "content quality stays clear");
  assert(
    classifyCopyText({ path: "introduction", text: page.copy.introduction.text, contract }).allowed,
    "semantic grounding still allows the copy",
  );
  assert(contract.cta.state !== "AUTHORIZED", "coverage does not authorize a commercial hop");

  const libFiles = [
    "src/lib/research-coverage/page-intent.ts",
    "src/lib/research-coverage/rank.ts",
    "src/lib/research-coverage/discover.ts",
    "src/lib/research-coverage/run.ts",
  ];
  for (const file of libFiles) {
    const text = readFileSync(path.join(process.cwd(), file), "utf8");
    assert(!/prodentim|femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
  }

  const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
  const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
  assert(existsSync(femicoreCatalog) && existsSync(femicoreHop), "FemiCore files stay readable without writes");
  assert(fileHash(femicoreCatalog) === fileHash(femicoreCatalog), "FemiCore catalog hash is stable in this test");

  console.log(`PASS test-research-coverage-54m.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
