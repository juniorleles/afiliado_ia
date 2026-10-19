import { agitationPrompt } from "../src/lib/section-generation/prompts/agitation.ts";
import { benefitsPrompt } from "../src/lib/section-generation/prompts/benefits.ts";
import { comparisonPrompt } from "../src/lib/section-generation/prompts/comparison.ts";
import { ctaPrompt } from "../src/lib/section-generation/prompts/cta.ts";
import { faqPrompt } from "../src/lib/section-generation/prompts/faq.ts";
import { footerPrompt } from "../src/lib/section-generation/prompts/footer.ts";
import { guaranteePrompt } from "../src/lib/section-generation/prompts/guarantee.ts";
import { heroPrompt } from "../src/lib/section-generation/prompts/hero.ts";
import { ingredientsPrompt } from "../src/lib/section-generation/prompts/ingredients.ts";
import { problemPrompt } from "../src/lib/section-generation/prompts/problem.ts";
import { schemaPrompt } from "../src/lib/section-generation/prompts/schema.ts";
import { scientificEvidencePrompt } from "../src/lib/section-generation/prompts/scientific-evidence.ts";
import { seoPrompt } from "../src/lib/section-generation/prompts/seo.ts";
import { solutionPrompt } from "../src/lib/section-generation/prompts/solution.ts";
import { testimonialsPrompt } from "../src/lib/section-generation/prompts/testimonials.ts";
import { averageGenerationTime, generateCampaignSections } from "../src/lib/section-generation/run.ts";
import type { SectionGeneration } from "../src/lib/section-generation/types.ts";
import type { MarketIntelligenceAnalysis } from "../src/lib/market-intelligence/analyze.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import type { StrategyDecision } from "../src/lib/strategy-decision/decide.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function facts(partial: Partial<ProductFacts> = {}): ProductFacts {
  return { ...emptyProductFacts("Northwind Capsule", "https://notes.example.org/item"), ...partial };
}

function decision(partial: Partial<StrategyDecision> = {}): StrategyDecision {
  return {
    recommendedApproach: "Guia de compra",
    approachId: "BUYER_GUIDE",
    confidence: 0.4,
    reasoning: ["Sinal medido."],
    targetAudience: "Público medido.",
    awarenessStage: "Product Aware",
    marketSophistication: "Estágio 1",
    copyAngle: "Critérios de compra.",
    persuasionTriggers: ["Ausência de CTA dominante", "Preço modal USD 19 em 4 valores", "365-Day Guarantee (3)"],
    emotionalDrivers: ["As páginas descrevem dor.", "Nenhuma emoção foi medida além do que está nos textos salvos."],
    objectionsToAnswer: ["Is it worth it?"],
    claimsToAvoid: [],
    seoDirection: "Nome do produto.",
    landingStructure: "Hero.",
    contentPriority: "Perguntas.",
    adDirection: "Seguir a decisão.",
    validationNotes: "Confiança 40%.",
    basedOn: { researchedAt: null, factsFingerprint: "abc" },
    ...partial,
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
    dominantHeadlinePatterns: [{ pattern: "Comparação", count: 2, percent: 20, examples: [] }],
    dominantBenefits: [{ label: "Supports joint health", count: 2, domains: ["notes.example.org"] }],
    dominantFaq: [{ label: "What is the refund policy?", count: 2, examples: ["What is the refund policy?"] }],
    dominantGuarantee: { label: "365-Day Guarantee", count: 3, examples: ["365 days"] },
    dominantPricing: { currency: "USD", minimum: 9, maximum: 40, average: 20, predominant: 19, count: 4 },
    dominantAudience: { sexes: [{ label: "adults", count: 1 }], ages: ["adults over 50"], pains: ["Joint pain is common and causes stiffness."], goals: [] },
    dominantObjections: [{ text: "Is it worth it?", count: 1 }],
    dominantClaims: { common: [], risky: [], prohibited: [] },
    dominantCTA: { text: null, count: 0, percent: 0 },
    dominantKeywords: [{ keyword: "northwind review", count: 2 }],
    dominantScientificTopics: [{ type: "PubMed", count: 1 }],
    dominantPolicyRisks: [],
    competitorsRank: Array.from({ length: 5 }, (_, index) => ({ domain: `n${index}.example.org`, classification: "EDITORIAL" as const, pages: 1 })),
    marketGaps: [],
    opportunities: [],
    confidence: 0.45,
    ...partial,
  };
}

function section(rows: SectionGeneration[], id: SectionGeneration["sectionId"]): SectionGeneration {
  const found = rows.find((item) => item.sectionId === id);
  if (!found) throw new Error(`seção ausente: ${id}`);
  return found;
}

const prompts = [heroPrompt, problemPrompt, agitationPrompt, solutionPrompt, benefitsPrompt, ingredientsPrompt, scientificEvidencePrompt, testimonialsPrompt, comparisonPrompt, faqPrompt, guaranteePrompt, ctaPrompt, footerPrompt, seoPrompt, schemaPrompt];
assert(new Set(prompts.map((item) => item.id)).size === prompts.length, "cada seção tem o próprio prompt");
assert(new Set(prompts.map((item) => item.rule)).size === prompts.length, "nenhum prompt é reaproveitado");

const thin = generateCampaignSections({
  facts: facts(),
  analysis: analysis(),
  decision: decision(),
  previous: null,
});

const dumped = JSON.stringify(thin);
assert(thin.length === 15, "cada seção tem o próprio registro");
assert(!dumped.includes("Buy Now"), "nenhum gerador cria Buy Now");
assert(!dumped.includes("365-Day"), "a garantia de mercado não entra na geração");
assert(!dumped.includes("USD"), "o preço de mercado não entra na geração");
assert(section(thin, "hero").generatedContent?.headline === "Northwind Capsule", "hero usa só o nome dos fatos");
assert(String(section(thin, "hero").generatedContent?.lead).includes("buying guide"), "o lead do hero segue o prompt da seção em inglês");
assert((section(thin, "hero").scores?.copyScore ?? 0) > 0, "o hero calcula copy score");
assert(section(thin, "ingredients").scores.copyScore === 0, "seção recusada fica com copy score zero");
assert(!String(section(thin, "hero").generatedContent?.lead).includes("Critérios"), "o ângulo em português não entra na landing");
assert(!JSON.stringify(section(thin, "hero").generatedContent).includes("refund"), "hero não escreve FAQ");
assert(section(thin, "benefits").status === "FAILED", "sem feature a seção não cria benefício de mercado");
assert(!JSON.stringify(section(thin, "benefits").generatedContent ?? {}).includes("Supports joint health"), "benefício de mercado não entra no texto");
assert(!JSON.stringify(section(thin, "benefits").generatedContent).includes("approach"), "benefits não escreve CTA");
assert(section(thin, "ingredients").status === "FAILED", "sem ingredientes a seção não cria mecanismo");
assert(section(thin, "guarantee").status === "FAILED" && section(thin, "guarantee").generatedContent === null, "sem garantia nos fatos a seção não é gerada");
assert(section(thin, "testimonials").status === "FAILED", "sem depoimento extraído a seção falha");
assert(section(thin, "scientific-evidence").generatedContent?.reduced === true, "ciência sem ligação a ingrediente fica reduzida");
assert(JSON.stringify(section(thin, "scientific-evidence").generatedContent?.mentions) === JSON.stringify([{ type: "PubMed", count: 1 }]), "ciência não cria estudo além da contagem salva");
assert(section(thin, "faq").status === "FAILED", "FAQ sem fato correspondente não entra");
assert(section(thin, "cta").generatedContent?.label === null, "CTA não inventa rótulo");
assert(!JSON.stringify(section(thin, "cta").generatedContent).includes("Measured pages"), "CTA não copia observação medida");
assert(section(thin, "solution").status === "FAILED", "solução sem feature nem ingrediente nos fatos não é gerada");
assert(thin.every((item) => item.cached === false && item.generationTime >= 0), "a primeira passagem gera cada seção");

const supported = generateCampaignSections({
  facts: facts({
    ingredientsOrComponents: ["northwind extract"],
    features: ["Listed on the source label."],
    guaranteeInformation: "60-day refund",
    description: "A capsule described by the source.",
  }),
  analysis: analysis(),
  decision: decision(),
  previous: { version: 1, campaignId: 1, generatedAt: "2026-10-14T12:00:00.000Z", averageGenerationTimeMs: averageGenerationTime(thin), sections: thin },
});

const supportedItems = section(supported, "faq").generatedContent?.items as Array<{ question: string; answer: string | null }>;
const supportedRefund = supportedItems.find((item) => item.question.includes("refund"));
assert(supportedRefund?.answer === "60-day refund", "a resposta da garantia repete o fato");
assert(!supportedItems.some((item) => item.question.includes("worth")), "FAQ sem fato correspondente fica de fora");
assert(section(supported, "guarantee").generatedContent?.text === "60-day refund", "garantia gerada só com o texto dos fatos");
assert(section(supported, "ingredients").status === "GENERATED", "ingredientes saem dos fatos");
assert(section(supported, "cta").cached === true, "CTA com a mesma decisão usa cache");
assert(section(supported, "footer").cached === true, "rodapé com o mesmo nome usa cache");
assert(section(supported, "hero").cached === false, "hero muda quando a descrição muda");
assert(section(supported, "guarantee").cached === false, "garantia muda quando o fato muda");
assert(section(supported, "faq").cached === false, "FAQ muda quando passa a existir fato para responder");

const again = generateCampaignSections({
  facts: facts({
    ingredientsOrComponents: ["northwind extract"],
    features: ["Listed on the source label."],
    guaranteeInformation: "60-day refund",
    description: "A capsule described by the source.",
  }),
  analysis: analysis(),
  decision: decision(),
  previous: { version: 1, campaignId: 1, generatedAt: "2026-10-14T12:00:00.000Z", averageGenerationTimeMs: averageGenerationTime(supported), sections: supported },
});
assert(again.every((item) => item.cached), "a segunda passagem com as mesmas entradas usa cache");
assert(again.every((item, index) => item.generationTime === supported[index]?.generationTime), "o cache preserva o tempo original");

console.log("test-section-generation: ok");
