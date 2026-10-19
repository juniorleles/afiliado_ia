import { generateAgitation } from "@/lib/section-generation/generators/agitation";
import { generateBenefits } from "@/lib/section-generation/generators/benefits";
import { generateComparison } from "@/lib/section-generation/generators/comparison";
import { generateCta } from "@/lib/section-generation/generators/cta";
import { generateFaq } from "@/lib/section-generation/generators/faq";
import { generateFooter } from "@/lib/section-generation/generators/footer";
import { generateGuarantee } from "@/lib/section-generation/generators/guarantee";
import { generateHero } from "@/lib/section-generation/generators/hero";
import { generateIngredients } from "@/lib/section-generation/generators/ingredients";
import { generateProblem } from "@/lib/section-generation/generators/problem";
import { generateSchema } from "@/lib/section-generation/generators/schema";
import { generateScientificEvidence } from "@/lib/section-generation/generators/scientific-evidence";
import { generateSeo } from "@/lib/section-generation/generators/seo";
import { generateSolution } from "@/lib/section-generation/generators/solution";
import { generateTestimonials } from "@/lib/section-generation/generators/testimonials";
import { fingerprint } from "@/lib/section-generation/support";
import { SECTION_IDS, type GeneratedSections, type SectionGeneration, type SectionId } from "@/lib/section-generation/types";
import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";
import type { ProductFacts } from "@/lib/product-facts";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";

export type SectionSources = {
  facts: ProductFacts;
  analysis: MarketIntelligenceAnalysis | null;
  decision: StrategyDecision | null;
  previous: GeneratedSections | null;
};

const DISCOMFORT = /\bpain\b|\bache\b|stiff|discomfort/i;

function unique(values: string[]): string[] {
  return values.map((item) => item.trim()).filter((item, index, all) => item && all.indexOf(item) === index);
}

function questions(analysis: MarketIntelligenceAnalysis | null, decision: StrategyDecision | null): Array<{ text: string; origin: "MarketIntelligenceAnalysis" | "StrategyDecision" }> {
  const seen = new Set<string>();
  const rows: Array<{ text: string; origin: "MarketIntelligenceAnalysis" | "StrategyDecision" }> = [];
  const push = (text: string, origin: "MarketIntelligenceAnalysis" | "StrategyDecision") => {
    const clean = text.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    rows.push({ text: clean, origin });
  };
  for (const item of analysis?.dominantFaq ?? []) push(item.label, "MarketIntelligenceAnalysis");
  for (const item of analysis?.dominantObjections ?? []) push(item.text, "MarketIntelligenceAnalysis");
  for (const item of decision?.objectionsToAnswer ?? []) push(item, "StrategyDecision");
  return rows;
}

function inputs(id: SectionId, source: SectionSources): unknown {
  const facts = source.facts;
  const analysis = source.analysis;
  const decision = source.decision;
  const marketConfidence = analysis?.confidence ?? null;
  const features = facts.features;
  const ingredients = facts.ingredientsOrComponents;
  const pains = analysis?.dominantAudience.pains ?? [];
  const asked = questions(analysis, decision);
  const factSlice = { guarantee: facts.guaranteeInformation, ingredients, cautions: facts.cautions };
  if (id === "hero") {
    return {
      productName: facts.productName,
      description: facts.description,
      approachId: decision?.approachId ?? null,
      audience: unique([...(analysis?.dominantAudience.ages ?? []), ...(analysis?.dominantAudience.sexes ?? []).map((item) => item.label)]).slice(0, 6),
      emotions: (decision?.emotionalDrivers ?? []).filter((item) => !item.startsWith("Nenhuma emoção foi medida")),
      copyAngle: decision?.copyAngle ?? null,
      marketConfidence,
    };
  }
  if (id === "problem") return { pains, cautions: facts.cautions.slice(0, 6), marketConfidence };
  if (id === "agitation") return { discomfort: pains.filter((item) => DISCOMFORT.test(item)), marketConfidence };
  if (id === "solution") return { features, ingredients, marketConfidence };
  if (id === "benefits") {
    return { features, marketBenefits: (analysis?.dominantBenefits ?? []).slice(0, 4).map((item) => item.label), marketConfidence };
  }
  if (id === "ingredients") return { ingredients, marketConfidence };
  if (id === "scientific-evidence") {
    return { topics: (analysis?.dominantScientificTopics ?? []).slice(0, 6), ingredientNames: ingredients, marketConfidence };
  }
  if (id === "testimonials") return { quotes: [] as string[], marketConfidence };
  if (id === "comparison") {
    const competitors = analysis?.competitorsRank ?? [];
    return {
      domains: competitors.length,
      editorial: competitors.filter((item) => item.classification === "EDITORIAL").length,
      comparisonPercent: analysis?.dominantHeadlinePatterns.find((item) => item.pattern === "Comparação")?.percent ?? 0,
      marketConfidence,
    };
  }
  if (id === "faq") return { questions: asked, ...factSlice, marketConfidence };
  if (id === "guarantee") return { guaranteeInformation: facts.guaranteeInformation, marketConfidence };
  if (id === "cta") {
    return {
      approachId: decision?.approachId ?? null,
      triggers: decision?.persuasionTriggers ?? [],
      emotions: (decision?.emotionalDrivers ?? []).filter((item) => !item.startsWith("Nenhuma emoção foi medida")),
      marketConfidence,
    };
  }
  if (id === "footer") return { productName: facts.productName, marketConfidence };
  if (id === "seo") {
    return {
      productName: facts.productName,
      description: facts.description,
      keywords: (analysis?.dominantKeywords ?? []).slice(0, 8).map((item) => item.keyword),
      approachId: decision?.approachId ?? null,
      marketConfidence,
    };
  }
  return { productName: facts.productName, questions: asked, ...factSlice, marketConfidence };
}

const GENERATORS = {
  hero: generateHero,
  problem: generateProblem,
  agitation: generateAgitation,
  solution: generateSolution,
  benefits: generateBenefits,
  ingredients: generateIngredients,
  "scientific-evidence": generateScientificEvidence,
  testimonials: generateTestimonials,
  comparison: generateComparison,
  faq: generateFaq,
  guarantee: generateGuarantee,
  cta: generateCta,
  footer: generateFooter,
  seo: generateSeo,
  schema: generateSchema,
} as const;

export function generateOneSection(id: SectionId, source: SectionSources): SectionGeneration {
  const input = inputs(id, source);
  const inputFingerprint = fingerprint({ engine: "copy-19", promptId: id, input });
  const prior = source.previous?.sections.find((section) => section.sectionId === id && section.inputFingerprint === inputFingerprint);
  if (prior) return { ...prior, cached: true };
  const started = Date.now();
  const result = GENERATORS[id](input as never);
  return { ...result, generationTime: Math.max(0, Date.now() - started), cached: false, inputFingerprint };
}

export function generateCampaignSections(source: SectionSources): SectionGeneration[] {
  return SECTION_IDS.map((id) => generateOneSection(id, source));
}

export function averageGenerationTime(sections: SectionGeneration[]): number {
  if (sections.length === 0) return 0;
  const total = sections.reduce((sum, section) => sum + section.generationTime, 0);
  return Math.round((total / sections.length) * 10) / 10;
}
