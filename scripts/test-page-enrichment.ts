import { enrichMarketResearch } from "../src/lib/market-research/page-enrichment.ts";
import { extractPage } from "../src/lib/market-research/page-extract.ts";
import type { LandingPageHttpClient } from "../src/lib/real-landing-page/landing-page-http-client.ts";
import type { MarketEvidence, MarketResearchReport } from "../src/lib/market-research/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const html = `<!doctype html><html><head><title>Northwind</title></head><body>
<header><a href="/buy">Buy Now</a></header>
<h1>Northwind Capsule</h1>
<p>A daily capsule for adults over 40.</p>
<h2>Benefits</h2>
<ul><li>Supports calm evenings</li><li>Supports calm evenings</li></ul>
<h2>Ingredients</h2>
<ul><li>Magnesium</li><li>Magnesium</li></ul>
<p>It helps maintain a routine.</p>
<details><summary>Does it ship?</summary><p>It ships in a bottle.</p></details>
<p>The price is $39. A 60-day money-back guarantee applies.</p>
<p>A clinical study is cited.</p>
<footer><a href="/more">Learn More</a></footer>
</body></html>`;

const extracted = extractPage(html);
assert(extracted.headline === "Northwind Capsule", "hero é o h1");
assert(extracted.heroText === "A daily capsule for adults over 40.", "hero text é o parágrafo");
assert(extracted.ctas.some((item) => item.text === "Buy Now" && item.position === "Cabeçalho"), "CTA no cabeçalho");
assert(extracted.ctas.some((item) => item.text === "Learn More" && item.position === "Rodapé"), "CTA no rodapé");
assert(extracted.benefits.filter((item) => item.toLowerCase().includes("calm evenings")).length === 1, "benefício duplicado é normalizado");
assert(extracted.ingredients.length === 1 && extracted.ingredients[0] === "Magnesium", "ingrediente duplicado sai");
assert(extracted.faq[0]?.question === "Does it ship?", "FAQ vem do details");
assert(extracted.pricing.some((item) => item.price === "$39" && item.currency === "USD"), "preço e moeda");
assert(extracted.guarantees.some((item) => item.days === "60"), "dias da garantia");
assert(extracted.claims.some((item) => /helps maintain/i.test(item)), "claim do parágrafo");
assert(extracted.audience.ages.some((item) => /over 40/i.test(item)), "idade explícita");
assert(extracted.structures.includes("Hero") && extracted.structures.includes("FAQ") && extracted.structures.includes("Footer"), "estrutura observada");
assert(extracted.scientificEvidence.some((item) => item.type === "Clinical Study"), "estudo só quando o texto existe");
assert(!extracted.scientificEvidence.some((item) => item.type === "PubMed"), "não inventa PubMed");

function source(url: string, domain: string, usable = true): MarketEvidence {
  return {
    url,
    title: "Northwind",
    retrievedAt: "2026-10-14T00:00:00.000Z",
    relevantEvidence: "snippet",
    classification: "EDITORIAL",
    classificationReason: "test",
    query: "northwind",
    queryFamily: "PRODUCT",
    domain,
    path: "/item",
    promotional: false,
    usable,
    discoveredByProvider: "DUCKDUCKGO_HTML",
  };
}

function report(sources: MarketEvidence[]): MarketResearchReport {
  return {
    productName: "Northwind Capsule",
    researchedAt: "2026-10-14T00:00:00.000Z",
    status: "FRESH",
    quality: "LOW",
    queriesUsed: ["northwind"],
    queryFamilies: [{ family: "PRODUCT", queries: ["northwind"] }],
    queryOutcomes: [],
    providerMix: { DDG_QUERY_SUCCESS: 1, BRAVE_FALLBACK_ATTEMPTS: 0, BRAVE_FALLBACK_SUCCESS: 0, BRAVE_FALLBACK_FAILED: 0 },
    sources,
    signals: {
      currentPositioning: [],
      categoryPositioning: [],
      commonQuestions: [],
      purchaseConsiderations: [],
      commonObjections: [],
      recurringTerminology: [],
      competitorMessaging: [],
      reviewOrientedResults: 0,
      educationalResults: 0,
      buyerGuideResults: 0,
      observedIntents: [],
    },
    diversity: {
      UNIQUE_DOMAINS: sources.length,
      SOURCE_CLASS_DIVERSITY: 1,
      SOURCE_CLASSES: ["EDITORIAL"],
      PROMOTIONAL_SOURCES: 0,
      PROMOTIONAL_SOURCE_RATIO: 0,
      PROMOTIONAL_PATTERN_DETECTED: false,
      SEARCH_RESULTS_TOTAL: sources.length,
      USABLE_SOURCES: sources.filter((item) => item.usable).length,
    },
    searchProvider: { name: "DUCKDUCKGO_HTML", configured: true, realWebSearchAvailable: true },
    maxAgeHours: 24,
    discardedFabrications: [],
  };
}

async function main() {
const calls: string[] = [];
const client: LandingPageHttpClient = {
  async request(url: string) {
    calls.push(url);
    if (url.endsWith(".pdf")) return { httpStatus: 200, headers: { "content-type": "application/pdf" }, bodyText: "%PDF", timedOut: false, tooLarge: false };
    if (url.includes("broken.example")) return { httpStatus: 500, headers: { "content-type": "text/html" }, bodyText: "<html></html>", timedOut: false, tooLarge: false };
    return { httpStatus: 200, headers: { "content-type": "text/html" }, bodyText: html, timedOut: false, tooLarge: false };
  },
};

const first = await enrichMarketResearch(report([
  source("https://notes.example.org/item", "notes.example.org"),
  source("https://files.example.org/guide.pdf", "files.example.org"),
  source("https://broken.example/item", "broken.example"),
  source("https://skip.example.org/item", "skip.example.org", false),
]), { client, allow: async () => true });

assert(first.pageInsights?.length === 3, "só abre páginas utilizáveis, no máximo as selecionadas");
assert(first.pageInsights?.some((item) => item.domain === "notes.example.org" && item.status === "ENRICHED"), "página html é enriquecida");
assert(first.pageInsights?.some((item) => item.domain === "files.example.org" && item.status === "SKIPPED" && item.reason === "Arquivo ou mídia"), "pdf não é aberto");
assert(!calls.some((url) => url.endsWith(".pdf")), "pdf não gera request");
assert(first.pageInsights?.some((item) => item.domain === "broken.example" && item.status === "ERROR"), "erro de uma página não interrompe");
assert((first.benefits ?? []).some((item) => /calm evenings/i.test(item.text)), "benefício agregado");
assert(!first.pageInsights?.some((item) => item.domain === "skip.example.org"), "usable false fica de fora");

calls.length = 0;
const second = await enrichMarketResearch(report([
  source("https://notes.example.org/item", "notes.example.org"),
]), { client, allow: async () => true, previous: first });
assert(second.pageInsights?.[0]?.status === "CACHED", "página já enriquecida não abre de novo");
assert(calls.length === 0, "cache não chama o cliente");
assert((second.benefits ?? []).length > 0, "cache continua no relatório");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
