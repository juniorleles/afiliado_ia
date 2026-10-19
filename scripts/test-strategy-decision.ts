import { decideStrategy, decisionShell, factsFingerprint, formatStrategyDecisionPrompt } from "../src/lib/strategy-decision/decide.ts";
import type { MarketIntelligenceAnalysis } from "../src/lib/market-intelligence/analyze.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function analysis(partial: Partial<MarketIntelligenceAnalysis>): MarketIntelligenceAnalysis {
  return {
    marketSummary: {
      narrative: "",
      recommendedStrategy: null,
      strategyLabel: "Não disponível",
      strategyConfidence: "Baixa",
      researchQuality: "LOW",
      buyerIntent: "Não encontrado durante a pesquisa.",
      reasons: [],
      researchedAt: "2026-10-14T00:00:00.000Z",
      ...partial.marketSummary,
    },
    dominantStructure: partial.dominantStructure ?? { sections: [], summary: "" },
    dominantHeadlinePatterns: partial.dominantHeadlinePatterns ?? [],
    dominantBenefits: partial.dominantBenefits ?? [],
    dominantFaq: partial.dominantFaq ?? [],
    dominantGuarantee: partial.dominantGuarantee ?? { label: null, count: 0, examples: [] },
    dominantPricing: partial.dominantPricing ?? { currency: null, minimum: null, maximum: null, average: null, predominant: null, count: 0 },
    dominantAudience: partial.dominantAudience ?? { sexes: [], ages: [], pains: [], goals: [] },
    dominantObjections: partial.dominantObjections ?? [],
    dominantClaims: partial.dominantClaims ?? { common: [], risky: [], prohibited: [] },
    dominantCTA: partial.dominantCTA ?? { text: null, count: 0, percent: 0 },
    dominantKeywords: partial.dominantKeywords ?? [],
    dominantScientificTopics: partial.dominantScientificTopics ?? [],
    dominantPolicyRisks: partial.dominantPolicyRisks ?? [],
    competitorsRank: partial.competitorsRank ?? [],
    marketGaps: partial.marketGaps ?? [],
    opportunities: partial.opportunities ?? [],
    confidence: partial.confidence ?? 0.45,
  };
}

function facts(partial: Partial<ProductFacts> = {}): ProductFacts {
  return { ...emptyProductFacts("Northwind Capsule", "https://notes.example.org/item"), ...partial };
}

const reviewMarket = analysis({
  confidence: 0.7,
  marketSummary: {
    narrative: "",
    recommendedStrategy: "REVIEW",
    strategyLabel: "Revisão",
    strategyConfidence: "Média",
    researchQuality: "MEDIUM",
    buyerIntent: "Fraca",
    reasons: [],
    researchedAt: "2026-10-14T00:00:00.000Z",
  },
  dominantHeadlinePatterns: [{ pattern: "Review", count: 8, percent: 80, examples: ["Northwind Capsule review"] }],
  dominantCTA: { text: "Buy Now", count: 4, percent: 80 },
  competitorsRank: [
    { domain: "notes.example.org", classification: "EDITORIAL", pages: 1 },
    { domain: "guides.example.org", classification: "EDITORIAL", pages: 1 },
    { domain: "lab.example.org", classification: "EDITORIAL", pages: 1 },
  ],
});

const guideMarket = analysis({
  dominantHeadlinePatterns: [{ pattern: "Review", count: 9, percent: 64, examples: ["Northwind Capsule review"] }],
  dominantStructure: { sections: [{ name: "FAQ", count: 5, percent: 63 }], summary: "FAQ em 5 de 8." },
  dominantGuarantee: { label: "180-Day Guarantee", count: 10, examples: ["180-day refund"] },
  dominantCTA: { text: null, count: 0, percent: 0 },
  dominantFaq: [{ label: "Is Northwind Capsule worth it?", count: 5, examples: ["Is Northwind Capsule worth it?"] }],
  competitorsRank: Array.from({ length: 8 }, (_, index) => ({ domain: `notes${index}.example.org`, classification: "EDITORIAL" as const, pages: 1 })),
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
  dominantClaims: { common: [], risky: [], prohibited: [{ text: "Cure", level: "Alto", count: 3 }] },
  dominantPolicyRisks: [{ claim: "Cure", level: "Alto", count: 3 }],
  dominantAudience: { sexes: [{ label: "Mulheres", count: 1 }], ages: ["adults over 50"], pains: ["Joint pain is common."], goals: [] },
});

const scienceMarket = analysis({
  confidence: 0.7,
  dominantScientificTopics: [{ type: "PubMed", count: 2 }, { type: "Clinical Study", count: 1 }],
  dominantCTA: { text: "Learn More", count: 1, percent: 100 },
  marketSummary: {
    narrative: "",
    recommendedStrategy: null,
    strategyLabel: "Não disponível",
    strategyConfidence: "Média",
    researchQuality: "MEDIUM",
    buyerIntent: "Fraca",
    reasons: [],
    researchedAt: "2026-10-14T00:00:00.000Z",
  },
});

const rich = facts({ features: ["Once-daily capsule"], importQuality: "SUFFICIENT" });
const reviewDecision = decideStrategy({ facts: rich, analysis: reviewMarket });
const guideDecision = decideStrategy({ facts: facts(), analysis: guideMarket });
const scienceDecision = decideStrategy({ facts: facts({ ingredientsOrComponents: ["northwind extract"], features: ["Once-daily capsule"], importQuality: "SUFFICIENT" }), analysis: scienceMarket });
const videoDecision = decideStrategy({ facts: facts({ videoUrls: ["https://notes.example.org/video"] }), analysis: null });
const emptyDecision = decideStrategy({ facts: facts(), analysis: null });

assert(reviewDecision.approachId === "REVIEW", "mercado de review escolhe Revisão");
assert(reviewDecision.reasoning.some((item) => item.includes("80%")), "a justificativa usa o percentual medido");
assert(guideDecision.approachId === "BUYER_GUIDE", "sem CTA e com FAQ a decisão é Guia de compra");
assert(guideDecision.reasoning.some((item) => item.includes("CTA")), "a justificativa cita a ausência de CTA");
assert(guideDecision.claimsToAvoid.some((item) => item.startsWith("Cure")), "claim proibido entra na decisão");
assert(scienceDecision.approachId === "SCIENTIFIC", "ingredientes nos fatos e menções científicas escolhem Científico");
assert(videoDecision.approachId === "VIDEO_LETTER", "vídeo nos fatos escolhe Carta em vídeo");
assert(emptyDecision.approachId === "EDUCATIONAL" && emptyDecision.confidence <= 0.2, "sem análise e sem fatos a confiança fica baixa");
assert(reviewDecision.approachId !== guideDecision.approachId, "a mesma família de produto muda de abordagem quando a análise muda");
assert(!JSON.stringify(guideDecision).toLowerCase().includes("hdl"), "a decisão não inventa HDL");
assert(formatStrategyDecisionPrompt(guideDecision).includes("BUYER_GUIDE"), "o gerador recebe a abordagem decidida");
assert(formatStrategyDecisionPrompt(guideDecision).includes("Never write these claims"), "o gerador recebe os claims proibidos");
assert(formatStrategyDecisionPrompt(guideDecision).includes("Do not choose a different approach"), "o gerador não escolhe outra abordagem");
assert(decisionShell("SCIENTIFIC") === "EDUCATIONAL", "científico usa o molde editorial existente");
assert(decisionShell("BUYER_GUIDE") === "BUYER_GUIDE", "guia de compra usa o próprio molde");
assert(factsFingerprint(facts()) === factsFingerprint(facts()), "a impressão dos fatos é estável");
assert(factsFingerprint(facts()) !== factsFingerprint(rich), "fatos diferentes mudam a impressão");

console.log("test-strategy-decision: ok");
