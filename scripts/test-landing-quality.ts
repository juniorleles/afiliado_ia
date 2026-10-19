import { composeLandingDocument } from "../src/lib/landing-composer/compose.ts";
import type { LandingBlueprint } from "../src/lib/landing-blueprint/types.ts";
import type { LandingDocument } from "../src/lib/landing-composer/types.ts";
import { runLandingQuality } from "../src/lib/landing-quality/run.ts";
import type { MarketIntelligenceAnalysis } from "../src/lib/market-intelligence/analyze.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { generateCampaignSections } from "../src/lib/section-generation/run.ts";
import { SECTION_IDS, type GeneratedSections, type SectionGeneration, type SectionId } from "../src/lib/section-generation/types.ts";
import type { StrategyDecision } from "../src/lib/strategy-decision/decide.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

function facts(partial: Partial<ProductFacts> = {}): ProductFacts {
  return { ...emptyProductFacts("Northwind Capsule", "https://notes.example.org/item"), ...partial };
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
    persuasionTriggers: ["Ausência de CTA dominante", "Preço modal USD 19 em 4 valores", "365-Day Guarantee (3)"],
    emotionalDrivers: ["As páginas descrevem dor.", "Nenhuma emoção foi medida além do que está nos textos salvos."],
    objectionsToAnswer: [],
    claimsToAvoid: ["Cure", "Reverse"],
    seoDirection: "Nome do produto.",
    landingStructure: "Hero.",
    contentPriority: "Perguntas.",
    adDirection: "Seguir a decisão.",
    validationNotes: "Confiança 40%.",
    basedOn: { researchedAt: null, factsFingerprint: "abc" },
  };
}

function analysis(): MarketIntelligenceAnalysis {
  return {
    confidence: 0.45,
    dominantAudience: {
      sexes: [{ label: "Homens", count: 1 }],
      ages: ["adults over 50"],
      pains: ["Joint pain and stiffness are described on the measured pages."],
      goals: [],
    },
    dominantFaq: [{ label: "What is the refund policy?", count: 1, examples: ["What is the refund policy?"] }],
    dominantObjections: [],
    dominantBenefits: [{ label: "Supports daily movement", count: 1, domains: ["notes.example.org"] }],
    dominantKeywords: [{ keyword: "northwind review", count: 1 }],
    dominantScientificTopics: [{ type: "PubMed", count: 1 }],
    competitorsRank: [
      { domain: "notes.example.org", classification: "EDITORIAL", pages: 1 },
      { domain: "other.example.org", classification: "SELLER", pages: 1 },
    ],
    dominantHeadlinePatterns: [{ pattern: "Comparação", count: 1, percent: 20, examples: [] }],
  } as MarketIntelligenceAnalysis;
}

function blueprint(): LandingBlueprint {
  return {
    version: 1,
    campaignId: 1,
    blueprintVersion: 1,
    generatedAt: "2026-10-14T00:00:00.000Z",
    language: "en",
    strategy: { approachId: "BUYER_GUIDE", recommendedApproach: "Guia de compra", confidence: 0.4 },
    sections: SECTION_IDS.map((id) => ({
      id,
      type: id,
      enabled: true,
      priority: 1,
      objective: "",
      evidence: [],
      tone: "",
      expectedLength: "",
      requiredFacts: [],
      requiredResearch: [],
      requiredStrategy: [],
      dependencies: [],
      generationStatus: "READY" as const,
    })),
    seo: { language: "en", measuredKeywords: 1, source: null },
    schema: { plannedTypes: ["WebPage"], productIdentified: true },
    validation: { readySections: SECTION_IDS.length, pendingSections: 0, blocking: [] },
  };
}

function bundle(sections: SectionGeneration[]): GeneratedSections {
  return {
    version: 1,
    campaignId: 1,
    generatedAt: "2026-10-14T00:00:00.000Z",
    averageGenerationTimeMs: 0,
    sections,
  };
}

function content(sections: SectionGeneration[], id: SectionId): Record<string, unknown> {
  const section = sections.find((item) => item.sectionId === id);
  if (!section?.generatedContent) throw new Error(id);
  return section.generatedContent;
}

function baseFacts(): ProductFacts {
  return facts({
    description: "Northwind Capsule is a daily capsule.",
    features: ["Daily capsule"],
    ingredientsOrComponents: ["Northwind mycelium"],
    cautions: ["Keep away from children."],
    guaranteeInformation: "60-day refund",
  });
}

function poison(sections: SectionGeneration[]) {
  const hero = content(sections, "hero");
  hero.lead = `${hero.lead} Studies show it will cure stiffness.`;
  const problem = content(sections, "problem");
  problem.headline = "Second title";
  problem.statement = `${problem.statement} https://evil.example/phish`;
  const ingredients = content(sections, "ingredients");
  (ingredients.names as string[]).push("Unobtanium");
  (ingredients.items as Array<Record<string, unknown>>).push({ name: "Unobtanium", description: null, function: null });
  content(sections, "guarantee").text = "180-Day Guarantee";
  const faq = content(sections, "faq");
  const items = faq.items as Array<{ question: string; answer: string | null }>;
  if (items[0]) items[0].answer = "It reverses aging.";
  const seo = content(sections, "seo");
  seo.metaDescription = null;
  if (seo.openGraph && typeof seo.openGraph === "object") (seo.openGraph as { description: string | null }).description = null;
  content(sections, "schema").jsonLd = { "@type": "Product", offers: { price: "19" } };
  content(sections, "cta").text = "Buy now";
}

function run(sourceFacts: ProductFacts, sections: SectionGeneration[], document: LandingDocument) {
  return runLandingQuality({
    campaignId: 1,
    document,
    sections: bundle(sections),
    facts: sourceFacts,
    analysis: analysis(),
    decision: decision(),
    blueprint: blueprint(),
    now: "2026-10-14T00:00:00.000Z",
  });
}

function perfect(): void {
  const source = facts({ description: "A short source description." });
  const scores = { copyScore: 1, readability: 1, evidenceScore: 1, persuasionScore: 1, complianceScore: 1 };
  const section = (id: SectionId, generatedContent: Record<string, unknown>, evidenceText: string): SectionGeneration => ({
    sectionId: id,
    generatedContent,
    reasoning: [],
    evidenceUsed: [{ origin: "ProductFacts", field: "productName", text: evidenceText }],
    confidence: 1,
    warnings: [],
    generationTime: 1,
    status: "GENERATED",
    inputFingerprint: id,
    cached: false,
    scores,
  });
  const sections = [
    section("hero", { headline: "Northwind Capsule", subheadline: null, lead: "This page stays with the product source.", hook: null, description: null }, "Northwind Capsule"),
    section("cta", { text: "Continue with this buying guide.", approach: "BUYER_GUIDE", label: null }, "BUYER_GUIDE"),
    section("benefits", { fromFacts: ["Daily capsule. Source: product facts."] }, "Daily capsule."),
    section("footer", { productName: "Northwind Capsule" }, "Northwind Capsule"),
    section("seo", {
      title: "Northwind Capsule",
      metaDescription: "A short source description.",
      slug: "northwind-capsule",
      openGraph: { title: "Northwind Capsule", description: "A short source description." },
      keywords: [],
      canonical: null,
    }, "Northwind Capsule"),
    section("schema", {
      type: "WebPage",
      name: "Northwind Capsule",
      faq: [],
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "Northwind Capsule", about: [] },
    }, "Northwind Capsule"),
  ];
  const document: LandingDocument = {
    version: 1,
    campaignId: 1,
    language: "en",
    generatedAt: "2026-10-14T00:00:00.000Z",
    sections: sections.filter((item) => ["hero", "cta", "benefits", "footer"].includes(item.sectionId)).map((item) => ({
      sectionId: item.sectionId,
      content: item.generatedContent ?? {},
      warnings: [],
    })),
    seo: sections.find((item) => item.sectionId === "seo")?.generatedContent ?? null,
    schema: sections.find((item) => item.sectionId === "schema")?.generatedContent ?? null,
    metadata: {
      approachId: "BUYER_GUIDE",
      compositionTimeMs: 0,
      inputFingerprint: "perfect",
      cached: false,
      included: ["hero", "cta", "benefits", "footer", "seo", "schema"],
      omitted: [],
    },
    validationStatus: "PASS",
    renderStatus: "READY",
    warnings: [],
    errors: [],
  };
  const result = run(source, sections, document);
  assert(result.quality.stoppedBecause === "overall", "landing já em 90 encerra sem reescrever");
  assert(result.history.entries.length === 0, "nenhuma tentativa quando a pontuação geral já passou");
  assert(result.quality.score.overall >= 90, "pontuação geral de exemplo alto fica em 90 ou mais");
  assert(result.sections.sections[0] === sections[0], "hero aprovado permanece o mesmo objeto");
}

function main() {
  perfect();
  const source = baseFacts();
  const chosen = decision();
  const sections = generateCampaignSections({ facts: source, analysis: analysis(), decision: chosen, previous: null });
  const footer = sections.find((item) => item.sectionId === "footer");
  poison(sections);
  const poisoned = composeLandingDocument({
    campaignId: 1,
    blueprint: blueprint(),
    generated: bundle(sections),
    decision: chosen,
    previous: null,
    facts: source,
    now: "2026-10-14T00:00:00.000Z",
  });
  const result = run(source, sections, poisoned);
  const body = JSON.stringify(result.document);
  assert(!/studies show|cure stiffness|buy now|unobtanium|evil\.example|180-day|365-day|\$\s?19|\busd\b/i.test(body), "a landing final não traz claim, preço, link ou garantia inventados");
  assert(body.includes("60-day refund"), "a garantia final é a do fato");
  assert(body.includes("Northwind mycelium"), "o ingrediente do fato permanece");
  assert(result.sections.sections.find((item) => item.sectionId === "footer") === footer, "rodapé sem problema permanece intocado");
  assert(result.history.entries.some((entry) => entry.sectionId === "hero" && entry.changed), "somente o hero problemático foi reescrito");
  assert(result.history.entries.filter((entry) => entry.sectionId === "footer" && entry.changed).length === 0, "rodapé não entra nas correções");
  const counts = new Map<string, number>();
  for (const entry of result.history.entries) counts.set(entry.sectionId, (counts.get(entry.sectionId) ?? 0) + 1);
  assert([...counts.values()].every((count) => count <= 3), "no máximo 3 tentativas por seção");
  const score = result.quality.score;
  const overall = Math.round((score.copy + score.seo + score.evidence + score.compliance + score.persuasion + score.readability) / 6);
  assert(score.overall === overall, "a pontuação geral é a média de copy, SEO, evidência, compliance, persuasão e leitura");
  const again = run(source, result.sections.sections, result.document);
  assert(again.history.entries.every((entry) => !entry.changed), "a segunda validação não reescreve seção estável");
  assert(JSON.stringify(again.document) === JSON.stringify(result.document), "a landing final permanece estável");

  const withoutGuarantee = facts({
    description: "Northwind Capsule is a daily capsule.",
    features: ["Daily capsule"],
    ingredientsOrComponents: ["Northwind mycelium"],
    cautions: ["Keep away from children."],
  });
  const bare = generateCampaignSections({ facts: withoutGuarantee, analysis: analysis(), decision: chosen, previous: null });
  const guarantee = bare.find((item) => item.sectionId === "guarantee");
  if (!guarantee) throw new Error("guarantee");
  guarantee.status = "GENERATED";
  guarantee.generatedContent = { text: "180-Day Guarantee" };
  guarantee.evidenceUsed = [{ origin: "ProductFacts", field: "guaranteeInformation", text: "180-Day Guarantee" }];
  const invented = composeLandingDocument({
    campaignId: 1,
    blueprint: blueprint(),
    generated: bundle(bare),
    decision: chosen,
    previous: null,
    facts: withoutGuarantee,
    now: "2026-10-14T00:00:00.000Z",
  });
  const removed = run(withoutGuarantee, bare, invented);
  assert(!/180-day|365-day/i.test(JSON.stringify(removed.document)), "garantia de mercado sai da landing quando o fato não existe");
  console.log("score", result.quality.score, "tentativas", result.history.entries.length, "parou", result.quality.stoppedBecause);
}

main();
