import { buildLandingBlueprint, generationPlan } from "../src/lib/landing-blueprint/build.ts";
import type { MarketIntelligenceAnalysis } from "../src/lib/market-intelligence/analyze.ts";
import type { MarketResearchReport } from "../src/lib/market-research/types.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import type { StrategyDecision } from "../src/lib/strategy-decision/decide.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function facts(partial: Partial<ProductFacts> = {}): ProductFacts {
  return { ...emptyProductFacts("Northwind Capsule", "https://notes.example.org/item"), ...partial };
}

function decision(approachId: StrategyDecision["approachId"]): StrategyDecision {
  return {
    recommendedApproach: approachId,
    approachId,
    confidence: 0.4,
    reasoning: ["Sinal medido."],
    targetAudience: "Público medido.",
    awarenessStage: "Product Aware",
    marketSophistication: "Estágio 1",
    copyAngle: "Critérios de compra.",
    persuasionTriggers: [],
    emotionalDrivers: [],
    objectionsToAnswer: ["Is it worth it?"],
    claimsToAvoid: [],
    seoDirection: "Nome do produto.",
    landingStructure: "Hero.",
    contentPriority: "Perguntas.",
    adDirection: "Seguir a decisão.",
    validationNotes: "Confiança 40%.",
    basedOn: { researchedAt: null, factsFingerprint: "abc" },
  };
}

function analysis(partial: Partial<MarketIntelligenceAnalysis> = {}): MarketIntelligenceAnalysis {
  return {
    marketSummary: {
      narrative: "",
      recommendedStrategy: null,
      strategyLabel: "Não disponível",
      strategyConfidence: "Baixa",
      researchQuality: "LOW",
      buyerIntent: "Moderada",
      reasons: [],
      researchedAt: "2026-10-14T00:00:00.000Z",
    },
    dominantStructure: { sections: [], summary: "" },
    dominantHeadlinePatterns: [],
    dominantBenefits: [],
    dominantFaq: [],
    dominantGuarantee: { label: null, count: 0, examples: [] },
    dominantPricing: { currency: null, minimum: null, maximum: null, average: null, predominant: null, count: 0 },
    dominantAudience: { sexes: [], ages: [], pains: [], goals: [] },
    dominantObjections: [],
    dominantClaims: { common: [], risky: [], prohibited: [] },
    dominantCTA: { text: null, count: 0, percent: 0 },
    dominantKeywords: [],
    dominantScientificTopics: [],
    dominantPolicyRisks: [],
    competitorsRank: [],
    marketGaps: [],
    opportunities: [],
    confidence: 0.45,
    ...partial,
  };
}

const report = { pageInsights: [], landingStructures: [] } as unknown as MarketResearchReport;

const withMarket = buildLandingBlueprint({
  campaignId: 1,
  language: "en",
  facts: facts(),
  analysis: analysis({
    dominantBenefits: [{ label: "Supports joint health", count: 2, domains: ["notes.example.org"] }],
    dominantFaq: [{ label: "How long until relief?", count: 2, examples: ["How long until relief?"] }],
    dominantAudience: { sexes: [], ages: [], pains: ["Joint pain is common and causes stiffness."], goals: [] },
    dominantScientificTopics: [{ type: "PubMed", count: 1 }],
    competitorsRank: Array.from({ length: 5 }, (_, index) => ({ domain: `n${index}.example.org`, classification: "EDITORIAL" as const, pages: 1 })),
    dominantGuarantee: { label: "365-Day Guarantee", count: 3, examples: ["365 days"] },
  }),
  decision: decision("BUYER_GUIDE"),
  report,
  previousVersion: 0,
  now: "2026-10-14T12:00:00.000Z",
});

const withFacts = buildLandingBlueprint({
  campaignId: 2,
  language: "en",
  facts: facts({ ingredientsOrComponents: ["northwind extract"], cautions: ["Keep closed."], guaranteeInformation: "60-day refund" }),
  analysis: null,
  decision: decision("EDUCATIONAL"),
  report: null,
  now: "2026-10-14T12:00:00.000Z",
});

const text = JSON.stringify(withMarket);
assert(withMarket.sections.length === 15, "a planta tem as seções padrão");
assert(withMarket.sections.every((section) => section.generationStatus === "READY" || section.generationStatus === "PENDING"), "nenhuma seção foi gerada");
assert(!text.includes("Supports joint health"), "o blueprint não copia o benefício");
assert(!text.includes("How long until relief"), "o blueprint não copia a FAQ");
assert(!text.includes("Buy Now"), "o blueprint não cria CTA");
assert(withMarket.sections.find((section) => section.id === "hero")?.generationStatus === "READY", "hero fica pronto com nome e decisão");
assert(withMarket.sections.find((section) => section.id === "scientific-evidence")?.generationStatus === "PENDING", "ciência sem ingrediente nos fatos fica pendente");
assert(withMarket.sections.find((section) => section.id === "guarantee")?.generationStatus === "PENDING", "garantia de mercado não substitui o fato do produto");
assert(withMarket.sections.find((section) => section.id === "testimonials")?.generationStatus === "PENDING", "depoimento sem fonte fica pendente");
assert(withMarket.sections.find((section) => section.id === "faq")?.generationStatus === "READY", "FAQ fica pronta quando há objeção medida");
assert(withMarket.sections.find((section) => section.id === "comparison")?.generationStatus === "READY", "comparação usa a quantidade de concorrentes");
assert(withFacts.sections.find((section) => section.id === "ingredients")?.generationStatus === "READY", "ingredientes vêm dos fatos");
assert(withFacts.sections.find((section) => section.id === "guarantee")?.generationStatus === "READY", "garantia pronta só com o fato do produto");
assert(withFacts.sections.find((section) => section.id === "scientific-evidence")?.generationStatus === "PENDING", "sem tópicos científicos a seção fica pendente");
assert(withMarket.strategy.approachId !== withFacts.strategy.approachId, "a planta guarda a decisão de cada campanha");
const plan = generationPlan(withMarket);
assert(plan[0]?.id === "hero" && plan.every((item, index) => index === 0 || item.priority <= plan[index - 1].priority), "o plano futuro segue a prioridade e só inclui seções prontas");
assert(plan.every((item) => item.id !== "testimonials" && item.id !== "guarantee"), "o plano futuro não inclui seção pendente");

console.log("test-landing-blueprint: ok");
