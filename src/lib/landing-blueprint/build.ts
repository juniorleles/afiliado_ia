import type {
  BlueprintDependency,
  BlueprintInput,
  BlueprintSection,
  EvidenceSource,
  LandingBlueprint,
} from "@/lib/landing-blueprint/types";
import { BLUEPRINT_VERSION } from "@/lib/landing-blueprint/types";

type Gate = { source: EvidenceSource; field: string; required: boolean; met: boolean };

const CATALOG: Array<{ id: string; priority: number; objective: string; tone: string; expectedLength: string }> = [
  { id: "hero", priority: 100, objective: "Capturar atenção", tone: "Persuasive", expectedLength: "80–120 palavras" },
  { id: "problem", priority: 90, objective: "Nomear o problema medido", tone: "Educational", expectedLength: "120–180 palavras" },
  { id: "agitation", priority: 85, objective: "Aprofundar só o desconforto já descrito", tone: "Educational", expectedLength: "80–140 palavras" },
  { id: "solution", priority: 88, objective: "Apresentar o que os fatos sustentam", tone: "Educational", expectedLength: "120–180 palavras" },
  { id: "benefits", priority: 95, objective: "Mostrar transformação", tone: "Persuasive", expectedLength: "250–400 palavras" },
  { id: "ingredients", priority: 84, objective: "Listar só ingredientes presentes nos fatos", tone: "Authoritative", expectedLength: "80–160 palavras" },
  { id: "scientific-evidence", priority: 78, objective: "Situar menções científicas já registradas", tone: "Authoritative", expectedLength: "120–200 palavras" },
  { id: "testimonials", priority: 70, objective: "Usar apenas depoimentos já extraídos", tone: "Neutral", expectedLength: "Somente fontes salvas" },
  { id: "comparison", priority: 72, objective: "Comparar critérios já perguntados pelo mercado", tone: "Educational", expectedLength: "150–250 palavras" },
  { id: "faq", priority: 80, objective: "Responder objeções", tone: "Educational", expectedLength: "5 perguntas" },
  { id: "guarantee", priority: 75, objective: "Reduzir risco", tone: "Authoritative", expectedLength: "40–80 palavras" },
  { id: "cta", priority: 95, objective: "Converter", tone: "Urgent", expectedLength: "12–24 palavras" },
  { id: "footer", priority: 20, objective: "Fechar a página com a identidade do produto", tone: "Neutral", expectedLength: "20–40 palavras" },
  { id: "seo", priority: 40, objective: "Reservar título e descrição para a próxima etapa", tone: "Neutral", expectedLength: "Metadados" },
  { id: "schema", priority: 30, objective: "Reservar os tipos estruturados", tone: "Neutral", expectedLength: "Sem prosa" },
];

function gate(source: EvidenceSource, field: string, required: boolean, met: boolean): Gate {
  return { source, field, required, met };
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function pattern(input: BlueprintInput, name: string): number {
  return input.analysis?.dominantHeadlinePatterns.find((item) => item.pattern === name)?.percent ?? 0;
}

function hasPageStructure(input: BlueprintInput, name: string): boolean {
  const report = input.report;
  if (!report) return false;
  if ((report.landingStructures ?? []).some((item) => item.structure === name && item.frequency > 0)) return true;
  return (report.pageInsights ?? []).some((page) => page.structures.includes(name));
}

function gatesFor(id: string, input: BlueprintInput): Gate[] {
  const facts = input.facts;
  const analysis = input.analysis;
  const decision = input.decision;
  const name = hasText(facts.productName);
  const ingredients = facts.ingredientsOrComponents.length > 0;
  const features = facts.features.length > 0;
  const pains = (analysis?.dominantAudience.pains.length ?? 0) > 0;
  const problemHeadlines = pattern(input, "Problema") > 0;
  const benefits = (analysis?.dominantBenefits.length ?? 0) > 0;
  const science = (analysis?.dominantScientificTopics.length ?? 0) > 0;
  const objections = (decision?.objectionsToAnswer.length ?? 0) > 0 || (analysis?.dominantObjections.length ?? 0) > 0 || (analysis?.dominantFaq.length ?? 0) > 0;
  const competitors = analysis?.competitorsRank.length ?? 0;
  const comparison = pattern(input, "Comparação") > 0 || decision?.approachId === "COMPARISON" || competitors >= 5;
  const discomfort = (analysis?.dominantAudience.pains ?? []).some((item) => /\bpain\b|\bache\b|stiff|discomfort/i.test(item));

  if (id === "hero") {
    return [
      gate("ProductFacts", "productName", true, name),
      gate("StrategyDecision", "recommendedApproach", true, Boolean(decision)),
    ];
  }
  if (id === "problem") {
    return [
      gate("MarketIntelligenceAnalysis", "dominantAudience.pains", false, pains),
      gate("MarketIntelligenceAnalysis", "dominantHeadlinePatterns.Problema", false, problemHeadlines),
      gate("ProductFacts", "cautions", false, facts.cautions.length > 0),
    ];
  }
  if (id === "agitation") {
    return [gate("MarketIntelligenceAnalysis", "dominantAudience.pains", true, discomfort)];
  }
  if (id === "solution") {
    return [
      gate("ProductFacts", "features", false, features),
      gate("ProductFacts", "ingredientsOrComponents", false, ingredients),
      gate("MarketIntelligenceAnalysis", "dominantBenefits", false, benefits),
    ];
  }
  if (id === "benefits") {
    return [
      gate("ProductFacts", "features", false, features),
      gate("ProductFacts", "ingredientsOrComponents", false, ingredients),
      gate("MarketIntelligenceAnalysis", "dominantBenefits", false, benefits),
      gate("StrategyDecision", "copyAngle", false, Boolean(decision?.copyAngle)),
    ];
  }
  if (id === "ingredients") {
    return [gate("ProductFacts", "ingredientsOrComponents", true, ingredients)];
  }
  if (id === "scientific-evidence") {
    return [
      gate("MarketIntelligenceAnalysis", "dominantScientificTopics", true, science),
      gate("ProductFacts", "ingredientsOrComponents", true, ingredients),
      gate("MarketResearchReport", "report", true, input.report !== null),
    ];
  }
  if (id === "testimonials") {
    return [gate("MarketResearchReport", "structures.Testimonials", true, hasPageStructure(input, "Testimonials"))];
  }
  if (id === "comparison") {
    return [gate("MarketIntelligenceAnalysis", "competitorsRank", true, comparison)];
  }
  if (id === "faq") {
    return [
      gate("MarketIntelligenceAnalysis", "dominantFaq", true, Boolean(analysis) && objections),
      gate("StrategyDecision", "objectionsToAnswer", false, (decision?.objectionsToAnswer.length ?? 0) > 0),
    ];
  }
  if (id === "guarantee") {
    return [
      gate("ProductFacts", "guaranteeInformation", true, hasText(facts.guaranteeInformation)),
      gate("MarketIntelligenceAnalysis", "dominantGuarantee", false, Boolean(analysis?.dominantGuarantee.label)),
    ];
  }
  if (id === "cta") {
    return [gate("StrategyDecision", "approachId", true, Boolean(decision))];
  }
  if (id === "footer") {
    return [gate("ProductFacts", "productName", true, name)];
  }
  if (id === "seo") {
    return [
      gate("StrategyDecision", "seoDirection", true, Boolean(decision)),
      gate("MarketIntelligenceAnalysis", "dominantKeywords", false, (analysis?.dominantKeywords.length ?? 0) > 0),
    ];
  }
  return [
    gate("ProductFacts", "productName", true, name),
    gate("MarketResearchReport", "report", false, input.report !== null),
  ];
}

function sectionFrom(spec: (typeof CATALOG)[number], input: BlueprintInput): BlueprintSection {
  const dependencies = gatesFor(spec.id, input);
  const mode = spec.id === "problem" || spec.id === "solution" || spec.id === "benefits" ? "any" : "all";
  const required = dependencies.filter((item) => item.required);
  const pool = mode === "any" ? dependencies.filter((item) => item.source !== "StrategyDecision") : required;
  const ready = mode === "any" ? pool.some((item) => item.met) : required.length > 0 && required.every((item) => item.met);
  return {
    id: spec.id,
    type: spec.id,
    enabled: ready,
    priority: spec.priority,
    objective: spec.objective,
    evidence: dependencies,
    tone: spec.tone,
    expectedLength: spec.expectedLength,
    requiredFacts: dependencies.filter((item) => item.required && item.source === "ProductFacts").map((item) => item.field),
    requiredResearch: dependencies.filter((item) => item.required && (item.source === "MarketResearchReport" || item.source === "MarketIntelligenceAnalysis")).map((item) => item.field),
    requiredStrategy: dependencies.filter((item) => item.required && item.source === "StrategyDecision").map((item) => item.field),
    dependencies,
    generationStatus: ready ? "READY" : "PENDING",
  };
}

export function buildLandingBlueprint(input: BlueprintInput): LandingBlueprint {
  const sections = CATALOG.map((spec) => sectionFrom(spec, input)).sort((a, b) => b.priority - a.priority);
  const blocking = sections.flatMap((section) => {
    if (section.generationStatus === "READY") return [];
    const missing = section.dependencies.filter((item) => item.required && !item.met).map((item) => `${section.id}: ${item.source}.${item.field}`);
    return missing.length > 0 ? missing : [`${section.id}: sem fonte suficiente`];
  });
  const readySections = sections.filter((section) => section.generationStatus === "READY").length;
  return {
    version: BLUEPRINT_VERSION,
    campaignId: input.campaignId,
    blueprintVersion: (input.previousVersion ?? 0) + 1,
    generatedAt: input.now ?? new Date().toISOString(),
    language: input.language || "en",
    strategy: {
      approachId: input.decision?.approachId ?? null,
      recommendedApproach: input.decision?.recommendedApproach ?? null,
      confidence: input.decision?.confidence ?? null,
    },
    sections,
    seo: {
      language: input.language || "en",
      measuredKeywords: input.analysis?.dominantKeywords.length ?? 0,
      source: (input.analysis?.dominantKeywords.length ?? 0) > 0 ? "MarketIntelligenceAnalysis.dominantKeywords" : null,
    },
    schema: {
      plannedTypes: hasText(input.facts.productName) ? ["WebPage"] : [],
      productIdentified: hasText(input.facts.productName),
    },
    validation: {
      readySections,
      pendingSections: sections.length - readySections,
      blocking,
    },
  };
}

export function generationPlan(blueprint: LandingBlueprint): Array<Pick<BlueprintSection, "id" | "type" | "priority" | "tone" | "expectedLength" | "dependencies">> {
  return blueprint.sections
    .filter((section) => section.enabled && section.generationStatus === "READY")
    .sort((a, b) => b.priority - a.priority)
    .map((section) => ({
      id: section.id,
      type: section.type,
      priority: section.priority,
      tone: section.tone,
      expectedLength: section.expectedLength,
      dependencies: section.dependencies.filter((item) => item.met),
    }));
}
