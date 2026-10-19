import { buildExecutiveReport } from "../src/lib/market-research/executive-report.ts";
import type { MarketEvidence, MarketResearchReport } from "../src/lib/market-research/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function source(partial: Pick<MarketEvidence, "domain" | "title" | "relevantEvidence"> & Partial<MarketEvidence>): MarketEvidence {
  return {
    url: `https://${partial.domain}/item`,
    title: partial.title,
    retrievedAt: "2026-10-14T00:00:00.000Z",
    relevantEvidence: partial.relevantEvidence,
    classification: partial.classification ?? "EDITORIAL",
    classificationReason: "test",
    query: partial.query ?? "northwind capsule review",
    queryFamily: partial.queryFamily ?? "PRODUCT",
    domain: partial.domain,
    path: "/item",
    promotional: false,
    usable: partial.usable ?? true,
    discoveredByProvider: "DUCKDUCKGO_HTML",
  };
}

function report(sources: MarketEvidence[], extra: Partial<MarketResearchReport> = {}): MarketResearchReport {
  return {
    productName: "Northwind Capsule",
    researchedAt: "2026-10-14T00:00:00.000Z",
    status: "FRESH",
    quality: "LOW",
    queriesUsed: ["northwind capsule review"],
    queryFamilies: [
      { family: "PRODUCT", queries: ["northwind capsule review"] },
      { family: "CATEGORY_INTENT", queries: ["capsule category"] },
    ],
    queryOutcomes: [],
    providerMix: { DDG_QUERY_SUCCESS: 1, BRAVE_FALLBACK_ATTEMPTS: 0, BRAVE_FALLBACK_SUCCESS: 0, BRAVE_FALLBACK_FAILED: 0 },
    sources,
    signals: {
      currentPositioning: ["Supports calm evenings."],
      categoryPositioning: [],
      commonQuestions: ["What is Northwind Capsule?"],
      purchaseConsiderations: [],
      commonObjections: [],
      recurringTerminology: ["Northwind Capsule"],
      competitorMessaging: [],
      reviewOrientedResults: 1,
      educationalResults: 0,
      buyerGuideResults: 0,
      observedIntents: [],
    },
    diversity: {
      UNIQUE_DOMAINS: new Set(sources.map((item) => item.domain)).size,
      SOURCE_CLASS_DIVERSITY: 1,
      SOURCE_CLASSES: ["EDITORIAL"],
      PROMOTIONAL_SOURCES: 0,
      PROMOTIONAL_SOURCE_RATIO: 0,
      PROMOTIONAL_PATTERN_DETECTED: false,
      SEARCH_RESULTS_TOTAL: 4,
      USABLE_SOURCES: sources.length,
    },
    searchProvider: { name: "DUCKDUCKGO_HTML", configured: true, realWebSearchAvailable: true },
    maxAgeHours: 24,
    discardedFabrications: [],
    ...extra,
  };
}

const context = { confidence: "Baixa", duration: "1,0 s", validity: "Válida" };

const quiet = buildExecutiveReport(report([
  source({ domain: "notes.example.org", title: "What is Northwind Capsule?", relevantEvidence: "Readers discuss the format." }),
]), context);

assert(quiet.summary.some((line) => line.includes("1 fonte utilizável") && line.includes("1 consulta")), "resumo usa a contagem real");
assert(!quiet.summary.join(" ").toLowerCase().includes("colesterol"), "resumo não inventa colesterol");
assert(!quiet.summary.join(" ").toLowerCase().includes("cogumelo"), "resumo não inventa cogumelo");
assert(quiet.ctas.length === 0, "sem CTA quando o trecho não tem o texto");
assert(quiet.prices.length === 0, "sem preço quando não há moeda");
assert(quiet.guarantees.length === 0, "sem garantia quando a palavra não aparece");
assert(quiet.scientific.length === 0, "sem evidência científica sem PubMed ou NIH");
assert(quiet.risks.length === 0, "sem risco quando o termo não aparece");
assert(quiet.audience.men === "Não encontrado durante a pesquisa." && quiet.audience.age === "Não encontrado durante a pesquisa.", "público ausente não é inventado");
assert(quiet.pricesNote === "Não encontrado durante a pesquisa.", "preço ausente fica explícito");
assert(quiet.audience.questions[0] === "What is Northwind Capsule?", "dúvida vem do relatório");
assert(quiet.headlines[0]?.headline === "What is Northwind Capsule?", "headline é o título guardado");
assert(quiet.competitors[0]?.domain === "notes.example.org", "concorrente é o domínio encontrado");
assert(quiet.technical.quality === "LOW" && quiet.technical.provider === "DUCKDUCKGO_HTML", "detalhe técnico reaproveita o relatório");
assert(!quiet.opportunities.join(" ").toLowerCase().includes("hdl"), "oportunidade não inventa tema");

const loud = buildExecutiveReport(report([
  source({
    domain: "notes.example.org",
    title: "Northwind Capsule trial note",
    relevantEvidence: "The abstract says cure claims were rejected. Price cited as $39.",
    queryFamily: "PRODUCT",
  }),
], {
  pricing: [{ price: "$39", currency: "USD", source: "Northwind Capsule trial note", domain: "notes.example.org" }],
  guarantees: [{ text: "60-day money-back guarantee", days: "60", source: "Northwind Capsule trial note", domain: "notes.example.org" }],
  scientificEvidence: [{ ingredient: "Não associado", source: "Northwind Capsule trial note", type: "PubMed", domain: "notes.example.org" }],
  policyRisks: [{ claim: "Cure", risk: "Alto", source: "Northwind Capsule trial note", domain: "notes.example.org" }],
  ctaPatterns: [],
}), context);

assert(loud.prices.some((row) => row.price === "$39"), "preço vem do enriquecimento");
assert(loud.guarantees.length === 1, "garantia vem do enriquecimento");
assert(loud.scientific[0]?.type === "PubMed" && loud.scientific[0]?.ingredient === "Não associado", "evidência científica não inventa ingrediente");
assert(loud.risks.some((row) => row.claim === "Cure"), "risco vem do enriquecimento");
assert(loud.scientificNote.includes("não traz quantidade de estudos"), "não inventa nível de evidência");
assert(loud.ctas.length === 0 && loud.ctasNote === "Não encontrado durante a pesquisa.", "CTA ausente fica explícito");
assert(!loud.prices.some((row) => row.product === "Northwind Capsule"), "o preço observado não vira preço do produto");
