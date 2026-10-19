import { analyzeMarketIntelligence } from "../src/lib/market-intelligence/analyze.ts";
import { strategyFromAnalysis } from "../src/lib/campaign-strategy.ts";
import { emptyInsight } from "../src/lib/market-research/page-extract.ts";
import type { MarketEvidence, MarketPageInsight, MarketResearchReport } from "../src/lib/market-research/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function source(domain: string, title: string, evidence: string): MarketEvidence {
  return {
    url: `https://${domain}/item`,
    title,
    retrievedAt: "2026-10-14T00:00:00.000Z",
    relevantEvidence: evidence,
    classification: "EDITORIAL",
    classificationReason: "test",
    query: "northwind capsule review",
    queryFamily: "PRODUCT",
    domain,
    path: "/item",
    promotional: false,
    usable: true,
    discoveredByProvider: "DUCKDUCKGO_HTML",
  };
}

function page(domain: string, headline: string, extra: Partial<MarketPageInsight> = {}): MarketPageInsight {
  return {
    ...emptyInsight(`https://${domain}/item`, domain, "ENRICHED", null, 10),
    headline,
    ...extra,
  };
}

function report(extra: Partial<MarketResearchReport> = {}): MarketResearchReport {
  const sources = [
    source("notes.example.org", "What is Northwind Capsule?", "Readers discuss the format."),
    source("guides.example.org", "9 notes on Northwind Capsule review", "A buying note."),
  ];
  return {
    productName: "Northwind Capsule",
    researchedAt: "2026-10-14T00:00:00.000Z",
    status: "FRESH",
    quality: "LOW",
    queriesUsed: ["northwind capsule review"],
    queryFamilies: [{ family: "PRODUCT", queries: ["northwind capsule review"] }],
    queryOutcomes: [],
    providerMix: { DDG_QUERY_SUCCESS: 1, BRAVE_FALLBACK_ATTEMPTS: 0, BRAVE_FALLBACK_SUCCESS: 0, BRAVE_FALLBACK_FAILED: 0 },
    sources,
    signals: {
      currentPositioning: [],
      categoryPositioning: [],
      commonQuestions: [],
      purchaseConsiderations: [],
      commonObjections: ["The bottle is hard to open."],
      recurringTerminology: ["northwind capsule"],
      competitorMessaging: [],
      reviewOrientedResults: 1,
      educationalResults: 0,
      buyerGuideResults: 1,
      observedIntents: [],
    },
    diversity: {
      UNIQUE_DOMAINS: 2,
      SOURCE_CLASS_DIVERSITY: 1,
      SOURCE_CLASSES: ["EDITORIAL"],
      PROMOTIONAL_SOURCES: 0,
      PROMOTIONAL_SOURCE_RATIO: 0,
      PROMOTIONAL_PATTERN_DETECTED: false,
      SEARCH_RESULTS_TOTAL: 2,
      USABLE_SOURCES: 2,
    },
    searchProvider: { name: "DUCKDUCKGO_HTML", configured: true, realWebSearchAvailable: true },
    maxAgeHours: 24,
    discardedFabrications: [],
    pageInsights: [
      page("notes.example.org", "What is Northwind Capsule?", { structures: ["Hero", "Benefits", "FAQ"] }),
      page("guides.example.org", "9 notes on Northwind Capsule review", { structures: ["Hero", "Footer"] }),
    ],
    benefits: [
      { text: "Supports joint health", source: "a", domain: "notes.example.org", count: 2 },
      { text: "Healthy joints", source: "b", domain: "guides.example.org", count: 1 },
    ],
    faq: [
      { question: "How long does joint relief take?", answer: "Varies.", source: "a", domain: "notes.example.org" },
      { question: "How long until joint relief?", answer: "Varies.", source: "b", domain: "guides.example.org" },
      { question: "Where is the bottle made?", answer: "Unknown.", source: "a", domain: "notes.example.org" },
    ],
    guarantees: [
      { text: "365 Days", days: "365", source: "a", domain: "notes.example.org" },
      { text: "365-Day Guarantee", days: null, source: "b", domain: "guides.example.org" },
      { text: "Money Back 365", days: null, source: "a", domain: "notes.example.org" },
    ],
    pricing: [
      { price: "$39", currency: "USD", source: "a", domain: "notes.example.org" },
      { price: "$49", currency: "USD", source: "b", domain: "guides.example.org" },
      { price: "$39", currency: "USD", source: "a", domain: "notes.example.org" },
      { price: "save 20%", currency: "Promoção", source: "a", domain: "notes.example.org" },
    ],
    ctaPatterns: [
      { text: "Buy Now", position: "hero", frequency: 3 },
      { text: "Learn More", position: "footer", frequency: 1 },
    ],
    claims: [{ text: "Supports joint health", source: "a", domain: "notes.example.org", count: 1 }],
    policyRisks: [
      { claim: "Cure", risk: "Alto", source: "a", domain: "notes.example.org" },
      { claim: "Instant", risk: "Médio", source: "b", domain: "guides.example.org" },
    ],
    scientificEvidence: [{ ingredient: "Não associado", source: "a", type: "PubMed", domain: "notes.example.org" }],
    audience: { ages: ["adults over 40"], sexes: ["Mulheres"], pains: [], goals: [], personas: [] },
    ingredients: [],
    ...extra,
  };
}

const quiet = analyzeMarketIntelligence(report({
  pageInsights: [],
  benefits: [],
  faq: [],
  guarantees: [],
  pricing: [],
  ctaPatterns: [],
  claims: [],
  policyRisks: [],
  scientificEvidence: [],
  audience: { ages: [], sexes: [], pains: [], goals: [], personas: [] },
}), null);
const quietText = JSON.stringify(quiet).toLowerCase();
assert(quiet.confidence === 0, "sem páginas abertas a confiança fica em zero");
assert(quiet.dominantCTA.text === null, "CTA ausente não vira Buy Now");
assert(quiet.dominantGuarantee.label === null, "garantia ausente não vira 365 dias");
assert(quiet.dominantPricing.count === 0, "preço ausente não é calculado");
assert(!quiet.dominantStructure.summary.includes("→"), "a ordem visual da página não é inventada");
assert(!quietText.includes("hdl") && !quietText.includes("estatina") && !quietText.includes("colesterol"), "tema ausente não entra na análise");
assert(strategyFromAnalysis(null).recommendedStrategy === "Não disponível", "estratégia sem análise fica indisponível");

const found = analyzeMarketIntelligence(report(), null);
const joint = found.dominantBenefits.find((item) => item.label === "Joint Health");
assert(Boolean(joint) && joint!.count === 3 && joint!.domains.length === 2, "benefícios parecidos viram Joint Health");
const relief = found.dominantFaq.find((item) => item.label.toLowerCase().includes("joint") && item.count === 2);
assert(Boolean(relief), "perguntas parecidas ficam no mesmo grupo");
assert(!found.dominantFaq.some((item) => item.label === "Results Timeline"), "o grupo de FAQ não recebe um nome inventado");
assert(found.dominantGuarantee.label === "365-Day Guarantee" && found.dominantGuarantee.count === 3, "garantias de 365 dias ficam juntas");
assert(found.dominantPricing.minimum === 39 && found.dominantPricing.maximum === 49 && found.dominantPricing.predominant === 39, "preço mínimo, máximo e predominante");
assert(found.dominantPricing.average === 42.33, "preço médio dos valores numéricos");
assert(found.dominantCTA.text === "Buy Now" && found.dominantCTA.percent === 75, "CTA mais frequente e percentual");
assert(found.dominantStructure.sections.find((item) => item.name === "Hero")?.percent === 100, "Hero aparece nas duas páginas");
assert(found.dominantStructure.sections.find((item) => item.name === "FAQ")?.percent === 50, "FAQ aparece em metade das páginas");
assert(!found.dominantStructure.summary.includes("→"), "estrutura não afirma uma sequência visual");
assert(found.dominantHeadlinePatterns.some((item) => item.pattern === "Pergunta"), "headline com pergunta é agrupada");
assert(found.dominantHeadlinePatterns.some((item) => item.pattern === "Número"), "headline com número é agrupada");
assert(found.dominantHeadlinePatterns.some((item) => item.pattern === "Review"), "headline de review é agrupada");
assert(found.dominantPolicyRisks.find((item) => item.claim === "Cure")?.level === "Alto", "Cure permanece alto");
assert(found.dominantPolicyRisks.find((item) => item.claim === "Instant")?.level === "Médio", "o nível salvo do Instant é mantido");
assert(found.dominantClaims.prohibited.some((item) => item.text === "Cure"), "claim proibido fica separado");
assert(found.opportunities.some((item) => item.reason.includes("ingrediente extraído")), "oportunidade só quando a menção científica não tem ingrediente");
assert(!JSON.stringify(found.opportunities).toLowerCase().includes("hdl"), "oportunidade não inventa HDL");
assert(found.confidence === 0.45, "qualidade baixa limita a confiança mesmo com páginas abertas");
assert(found.marketSummary.buyerIntent === "Moderada", "intenção sai do relatório");
assert(found.competitorsRank.length === 2, "um concorrente por domínio");

console.log("test-market-intelligence: ok");
