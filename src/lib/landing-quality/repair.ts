import type { QualityProblem } from "@/lib/landing-quality/types";
import {
  isEvidenceSentence,
  mapStrings,
  proseOf,
  shortenSentence,
  stripDisallowedUrls,
  text,
  wordCount,
} from "@/lib/landing-quality/text";
import type { ProductFacts } from "@/lib/product-facts";
import { generateOneSection, type SectionSources } from "@/lib/section-generation/run";
import { clip, factAnswer, riskySentences, scoreCopy } from "@/lib/section-generation/support";
import type { EvidenceUse, SectionGeneration, SectionId } from "@/lib/section-generation/types";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";

const LABEL: Record<string, string> = {
  hero: "Hero",
  problem: "Problema",
  agitation: "Aprofundamento",
  solution: "Solução",
  benefits: "Benefícios",
  ingredients: "Ingredientes",
  "scientific-evidence": "Evidência científica",
  testimonials: "Depoimentos",
  comparison: "Comparação",
  faq: "FAQ",
  guarantee: "Garantia",
  cta: "CTA",
  footer: "Rodapé",
  seo: "SEO",
  schema: "Schema",
};

const SKIP_KEYS = new Set(["slug", "canonical", "approach", "jsonLd", "headline", "productName", "title", "name", "question"]);

function knownIngredient(name: string, facts: string[]): boolean {
  const value = name.trim().toLowerCase();
  return facts.some((fact) => fact.toLowerCase().includes(value));
}

function avoidWords(decision: StrategyDecision | null): string[] {
  return (decision?.claimsToAvoid ?? []).map((word) => word.trim()).filter((word) => word.length >= 3);
}

function holdsEvidence(sentence: string, evidence: EvidenceUse[]): boolean {
  if (isEvidenceSentence(sentence, evidence)) return true;
  const value = sentence.toLowerCase();
  return evidence.some((item) => {
    const source = item.text.replace(/\s+/g, " ").trim().toLowerCase();
    return source.length >= 20 && value.includes(source);
  });
}

function cleanSentence(sentence: string, evidence: EvidenceUse[], extra: string[], allowed: Set<string>, shorten: boolean): string {
  const stripped = stripDisallowedUrls(sentence, allowed);
  if (!stripped) return "";
  if (/not intended to diagnose/i.test(stripped) || holdsEvidence(stripped, evidence)) return stripped;
  if (riskySentences(stripped).length > 0) return "";
  if (extra.some((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(stripped))) return "";
  if (/(?:\bUSD\b|\$\s?\d)/i.test(stripped) && !evidence.some((item) => item.text.includes(stripped))) return "";
  if (shorten && wordCount(stripped) > 18) return shortenSentence(stripped);
  return stripped;
}

function cleanText(value: string, key: string, evidence: EvidenceUse[], extra: string[], allowed: Set<string>, shorten: boolean): string {
  if (SKIP_KEYS.has(key)) return value;
  if (/^https?:\/\//i.test(value.trim())) return stripDisallowedUrls(value, allowed);
  const parts = value.split(/(?<=[.!?])\s+/).map((sentence) => cleanSentence(sentence, evidence, extra, allowed, shorten)).filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function fixFaq(content: Record<string, unknown>, facts: ProductFacts): Record<string, unknown> {
  if (!Array.isArray(content.items)) return content;
  const items = content.items.flatMap((item) => {
    const row = item as { question?: unknown; answer?: unknown };
    const question = text(row.question);
    if (!question) return [];
    const supported = factAnswer(question, {
      guarantee: facts.guaranteeInformation,
      ingredients: facts.ingredientsOrComponents,
      cautions: facts.cautions,
    });
    return [{ question, answer: supported?.text ?? null }];
  });
  const seen = new Set<string>();
  return {
    ...content,
    items: items.filter((item) => {
      if (seen.has(item.question)) return false;
      seen.add(item.question);
      return true;
    }),
  };
}

function fixIngredients(content: Record<string, unknown>, facts: string[]): Record<string, unknown> {
  const items = Array.isArray(content.items)
    ? content.items.filter((item) => knownIngredient(text((item as { name?: unknown }).name), facts))
    : [];
  const names = (Array.isArray(content.names) ? content.names.map((item) => text(item)) : items.map((item) => text((item as { name?: unknown }).name)))
    .filter((name) => knownIngredient(name, facts));
  return { ...content, names, items };
}

function fixSchema(content: Record<string, unknown>, productName: string): Record<string, unknown> {
  const name = text(content.name) || productName.trim();
  const faq = Array.isArray(content.faq) ? content.faq : [];
  return {
    ...content,
    type: "WebPage",
    name,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name,
      about: faq.map((item) => {
        const row = item as { question?: unknown; answer?: unknown };
        const question = text(row.question);
        const answer = text(row.answer);
        return answer ? { question, answer } : { question };
      }),
    },
  };
}

function localFix(
  section: SectionGeneration,
  facts: ProductFacts,
  decision: StrategyDecision | null,
  allowed: Set<string>,
  shorten: boolean,
  marketConfidence: number | null,
): SectionGeneration {
  if (section.status !== "GENERATED" || !section.generatedContent) return section;
  let content: Record<string, unknown> = { ...section.generatedContent };
  if (section.sectionId === "hero" && facts.productName.trim()) content.headline = facts.productName.trim();
  if (section.sectionId !== "hero") delete content.headline;
  if (section.sectionId === "faq") content = fixFaq(content, facts);
  if (section.sectionId === "ingredients") {
    content = fixIngredients(content, facts.ingredientsOrComponents);
    const names = Array.isArray(content.names) ? content.names : [];
    if (names.length === 0) {
      return { ...section, status: "FAILED", generatedContent: null, evidenceUsed: [], scores: { copyScore: 0, readability: 0, evidenceScore: 0, persuasionScore: 0, complianceScore: 0 } };
    }
  }
  if (section.sectionId === "guarantee") {
    const fact = facts.guaranteeInformation?.trim() ?? "";
    if (!fact) return { ...section, status: "FAILED", generatedContent: null, evidenceUsed: [], scores: { copyScore: 0, readability: 0, evidenceScore: 0, persuasionScore: 0, complianceScore: 0 } };
    content = { ...content, text: clip(fact, 280) };
  }
  if (section.sectionId === "schema") content = fixSchema(content, facts.productName);
  if (section.sectionId === "seo" && !text(content.metaDescription) && facts.description?.trim()) {
    const description = clip(facts.description, 180);
    const graph = content.openGraph && typeof content.openGraph === "object" ? { ...(content.openGraph as Record<string, unknown>) } : {};
    content = { ...content, metaDescription: description, description, openGraph: { ...graph, title: text(content.title) || facts.productName.trim(), description } };
  }
  const evidence = section.evidenceUsed ?? [];
  const extra = avoidWords(decision);
  const cleaned = mapStrings(content, (value, key) => cleanText(value, key, evidence, extra, allowed, shorten)) as Record<string, unknown>;
  if (JSON.stringify(cleaned) === JSON.stringify(section.generatedContent)) return section;
  const filled = section.scores?.evidenceScore > 0 ? Math.max(0, Math.min(1, section.scores.persuasionScore / section.scores.evidenceScore)) : 1;
  return {
    ...section,
    generatedContent: cleaned,
    warnings: [...section.warnings, "A validação reescreveu só o trecho sem sustentação."],
    scores: scoreCopy({
      prose: proseOf(cleaned),
      evidence,
      marketConfidence,
      slotsFilled: filled,
      slots: 1,
    }),
  };
}

export function repairSection(input: {
  section: SectionGeneration;
  problems: QualityProblem[];
  source: SectionSources;
  facts: ProductFacts;
  decision: StrategyDecision | null;
  allowedHosts: Set<string>;
}): { section: SectionGeneration; changed: boolean; note: string } {
  const name = LABEL[input.section.sectionId] ?? input.section.sectionId;
  const fresh = generateOneSection(input.section.sectionId as SectionId, { ...input.source, previous: null });
  const adopted: SectionGeneration = {
    ...fresh,
    generationTime: input.section.generationTime,
    generatedContent: fresh.generatedContent ? structuredClone(fresh.generatedContent) : null,
  };
  const shorten = input.problems.some((problem) => problem.code === "readability" && problem.fixable);
  const next = localFix(adopted, input.facts, input.decision, input.allowedHosts, shorten, input.source.analysis?.confidence ?? null);
  const changed = next.status !== input.section.status || JSON.stringify(next.generatedContent) !== JSON.stringify(input.section.generatedContent);
  const note = changed
    ? `${name} reescrito. As seções sem problema permaneceram. Motivo: ${input.problems.map((problem) => problem.message).join(" ")}`
    : `${name} conferido. A nova geração repetiu o texto das evidências salvas.`;
  return { section: changed ? next : input.section, changed, note };
}
