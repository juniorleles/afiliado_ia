import type { LandingDocument } from "../src/lib/landing-composer/types.ts";
import { buildGoogleAdsPackage } from "../src/lib/google-ads-generation/build.ts";
import { policyHits } from "../src/lib/google-ads-generation/policy.ts";
import type { MarketIntelligenceAnalysis } from "../src/lib/market-intelligence/analyze.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import type { StrategyDecision } from "../src/lib/strategy-decision/decide.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

function decision(): StrategyDecision {
  return {
    recommendedApproach: "Guia de compra",
    approachId: "BUYER_GUIDE",
    confidence: 0.4,
    reasoning: ["Sinal medido."],
    targetAudience: "Público medido.",
    awarenessStage: "Product Aware",
    marketSophistication: "Estágio 1",
    copyAngle: "Critérios de compra.",
    persuasionTriggers: ["Preço modal USD 19 em 4 valores", "365-Day Guarantee (3)"],
    emotionalDrivers: ["As páginas descrevem dor."],
    objectionsToAnswer: [],
    claimsToAvoid: ["Cure", "Guaranteed", "Reverse", "Instant", "Miracle"],
    seoDirection: "Nome do produto.",
    landingStructure: "Hero.",
    contentPriority: "Perguntas.",
    adDirection: "O anúncio segue o ângulo: Critérios de compra.",
    validationNotes: "Confiança 40%.",
    basedOn: { researchedAt: null, factsFingerprint: "abc" },
  };
}

function analysis(): MarketIntelligenceAnalysis {
  return {
    confidence: 0.45,
    dominantAudience: {
      sexes: [{ label: "Homens", count: 1 }, { label: "Mulheres", count: 1 }],
      ages: ["adults over 50"],
      pains: [
        "Joint pain and stiffness are described on the measured pages.",
        "Kuszewski JC, et al. (2020). Fish oil supplementation reduces stiffness.",
      ],
      goals: [],
    },
    dominantKeywords: [
      { keyword: "northwind review", count: 2 },
      { keyword: "northwind capsule buying guide", count: 1 },
      { keyword: "BIODYNAMIX", count: 4 },
      { keyword: "Hyaluronan Joint", count: 3 },
    ],
    dominantFaq: [],
    dominantObjections: [],
    dominantBenefits: [],
    dominantScientificTopics: [],
    competitorsRank: [],
    dominantHeadlinePatterns: [],
  } as MarketIntelligenceAnalysis;
}

function document(): LandingDocument {
  return {
    version: 1,
    campaignId: 1,
    language: "en",
    generatedAt: "2026-10-14T00:00:00.000Z",
    sections: [
      { sectionId: "hero", content: { headline: "Northwind Capsule", lead: "This buying guide stays with the product source and the measured pages.", subheadline: "Northwind Capsule is a daily capsule." }, warnings: [] },
      { sectionId: "benefits", content: { fromFacts: ["Daily capsule"] }, warnings: [] },
      { sectionId: "ingredients", content: { names: ["Northwind mycelium"] }, warnings: [] },
      { sectionId: "faq", content: { items: [] }, warnings: [] },
      { sectionId: "comparison", content: { domains: 2 }, warnings: [] },
      { sectionId: "guarantee", content: { text: "60-day refund" }, warnings: [] },
      { sectionId: "cta", content: { approach: "BUYER_GUIDE" }, warnings: [] },
      { sectionId: "footer", content: { productName: "Northwind Capsule" }, warnings: [] },
    ],
    seo: { title: "Northwind Capsule" },
    schema: null,
    metadata: { approachId: "BUYER_GUIDE", compositionTimeMs: 0, inputFingerprint: "t", cached: false, included: [], omitted: [] },
    validationStatus: "PASS",
    renderStatus: "READY",
    warnings: [],
    errors: [],
  };
}

function facts(): ProductFacts {
  return {
    ...emptyProductFacts("Northwind Capsule™", "https://notes.example.org/item"),
    description: "Northwind Capsule is a daily capsule. Not intended to diagnose, treat, cure, or prevent any disease.",
    features: ["Daily capsule"],
    ingredientsOrComponents: ["Northwind mycelium", "Example root", "Example leaf"],
    guaranteeInformation: "60-day refund",
  };
}

function main() {
  assert(policyHits("This will cure stiffness.").length > 0, "o checker marca cure");
  assert(policyHits("Guaranteed results in a week.").length > 0, "o checker marca guaranteed results");
  const bundle = buildGoogleAdsPackage({
    campaignId: 1,
    slug: "northwind-capsule",
    published: false,
    origin: null,
    brand: "testes",
    facts: facts(),
    analysis: analysis(),
    decision: decision(),
    document: document(),
    now: "2026-10-14T00:00:00.000Z",
  });
  const visible = JSON.stringify({
    headlines: bundle.headlines,
    descriptions: bundle.descriptions,
    sitelinks: bundle.sitelinks,
    callouts: bundle.callouts,
    snippets: bundle.structuredSnippets,
    keywords: bundle.keywords,
  });
  assert(bundle.headlines.length > 0 && bundle.headlines.length <= 15, "até 15 títulos");
  assert(bundle.headlines.every((item) => item.text.length <= 30), "título até 30 caracteres");
  assert(bundle.descriptions.length > 0 && bundle.descriptions.length <= 4, "até 4 descrições");
  assert(bundle.descriptions.every((item) => item.text.length <= 90), "descrição até 90 caracteres");
  assert(bundle.callouts.every((item) => item.text.length <= 25), "callout até 25 caracteres");
  assert(bundle.sitelinks.every((item) => item.text.length <= 25), "sitelink até 25 caracteres");
  assert(bundle.headlines.some((item) => item.text === "Northwind Capsule"), "o título usa o nome do fato");
  assert(bundle.headlines.some((item) => item.text === "Buying guide"), "o título segue a decisão de guia");
  assert(bundle.approachId === "BUYER_GUIDE", "o pacote guarda o ângulo da decisão");
  assert(!/critérios|revisão|180-day|365-day|\bUSD\b|\$\s?19|buy now|guaranteed results|\bcure\b/i.test(visible), "o anúncio não leva claim, preço ou garantia de mercado");
  assert(!/biodynamix|hyaluronan|et al|fish oil|\btestes\b/i.test(visible), "palavra de outro produto ou estudo não entra no anúncio");
  assert(bundle.keywords.brand.includes("Northwind Capsule"), "palavra de marca");
  assert(bundle.keywords.commercial.some((item) => /review/i.test(item)), "palavra comercial medida");
  assert(bundle.keywords.problem.some((item) => /pain|stiff/i.test(item)), "palavra de problema medida");
  assert(bundle.keywords.longTail.some((item) => item.split(" ").length >= 3), "cauda longa");
  assert(bundle.negativeKeywords.includes("cure") && bundle.negativeKeywords.includes("guaranteed results") && bundle.negativeKeywords.includes("reverse disease"), "negativas de política");
  assert(bundle.structuredSnippets.some((item) => item.header === "Types" && item.values.length >= 3), "snippet só com ingredientes da fonte");
  assert(bundle.finalUrl === "/p/northwind-capsule", "a URL final é a presell");
  assert(bundle.displayPaths[1] === "guide", "o caminho de exibição segue o guia");
  assert(bundle.policy.status === "PASS", "a política passa no pacote limpo");
  assert(!bundle.descriptions.some((item) => /cure/i.test(item.text)), "a isenção da fonte não entra na descrição");
  assert(bundle.assetStrength.score === Math.round(
    (Math.min(bundle.headlines.length, 15) / 15) * 30
    + (Math.min(bundle.descriptions.length, 4) / 4) * 20
    + (Math.min(bundle.sitelinks.length, 4) / 4) * 15
    + (Math.min(bundle.callouts.length, 4) / 4) * 10
    + 10
    + 10
    + 5,
  ), "a força do anúncio é calculada");
  console.log(JSON.stringify({
    headlines: bundle.headlines.map((item) => item.text),
    descriptions: bundle.descriptions.map((item) => item.text),
    strength: bundle.assetStrength,
    policy: bundle.policy.status,
  }));
}

main();
