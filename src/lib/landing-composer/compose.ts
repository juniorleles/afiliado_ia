import type { LandingBlueprint } from "@/lib/landing-blueprint/types";
import { validateGrounding } from "@/lib/ai/grounding-validator";
import { presentLandingDocument } from "@/lib/landing-composer/present";
import { riskySentences } from "@/lib/section-generation/support";
import type { GeneratedSections, SectionGeneration } from "@/lib/section-generation/types";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";
import { BODY_ORDER, REQUIRED_SECTIONS, type ComposedSection, type LandingDocument } from "@/lib/landing-composer/types";
import { copyEligibleList, type ProductFacts } from "@/lib/product-facts";

export type ComposeInput = {
  campaignId: number;
  blueprint: LandingBlueprint;
  generated: GeneratedSections;
  decision: StrategyDecision | null;
  previous: LandingDocument | null;
  /** Copy-eligible Product Facts for conditional benefits and real grounding. */
  facts?: ProductFacts | null;
  now?: string;
};

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

function fingerprint(value: unknown): string {
  const body = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < body.length; index += 1) hash = (Math.imul(hash, 33) + body.charCodeAt(index)) >>> 0;
  return hash.toString(16);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function answered(value: unknown): Array<{ question: string; answer: string }> {
  return list(value).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const question = text(row.question);
    const answer = text(row.answer);
    if (!question || !answer) return [];
    return [{ question, answer }];
  });
}

function namesProduct(keyword: string, productName: string): boolean {
  const name = productName.trim().toLowerCase();
  const value = keyword.trim().toLowerCase();
  if (!name || !value) return false;
  if (value.includes(name)) return true;
  return name.split(/[^a-z0-9]+/).some((token) => token.length >= 6 && value.includes(token));
}

/** Eligible features only — never ingredients, market benefits, or blocked claims. */
export function hasEligibleBenefitFeatures(facts: ProductFacts | null | undefined): boolean {
  if (!facts) return false;
  return copyEligibleList(facts.features, facts.confidence.features).length > 0;
}

/**
 * Benefits is structurally required only when copy-eligible features can ground it.
 * Without facts, infer from a successful benefits generation that already carried fromFacts.
 */
export function benefitsStructurallyRequired(
  facts: ProductFacts | null | undefined,
  generated: GeneratedSections,
): boolean {
  if (facts) return hasEligibleBenefitFeatures(facts);
  const row = generated.sections.find((section) => section.sectionId === "benefits");
  if (!row || row.status !== "GENERATED") return false;
  return list(row.generatedContent?.fromFacts).map(text).filter(Boolean).length > 0;
}

function ground(id: string, content: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!content) return null;
  if (id === "hero") {
    const headline = text(content.headline);
    if (!headline) return null;
    return { headline, subheadline: text(content.subheadline) || null, lead: text(content.lead) || null, description: null };
  }
  if (id === "problem") {
    const cautions = list(content.cautions).map(text).filter(Boolean);
    if (cautions.length === 0) return null;
    return { statement: "The product source lists these cautions.", cautions };
  }
  if (id === "agitation" || id === "comparison" || id === "scientific-evidence") return null;
  if (id === "solution") {
    const features = list(content.features).map(text).filter(Boolean);
    const ingredients = list(content.ingredients).map(text).filter(Boolean);
    if (features.length === 0 && ingredients.length === 0) return null;
    return { statement: text(content.statement) || null, features, ingredients };
  }
  if (id === "benefits") {
    const fromFacts = list(content.fromFacts).map(text).filter(Boolean);
    if (fromFacts.length === 0) return null;
    return { fromFacts };
  }
  if (id === "ingredients") {
    const names = list(content.names).map(text).filter(Boolean);
    if (names.length === 0) return null;
    return { names };
  }
  if (id === "testimonials") {
    const quotes = list(content.quotes).map(text).filter(Boolean);
    if (quotes.length === 0) return null;
    return { quotes };
  }
  if (id === "faq") {
    const items = answered(content.items);
    if (items.length === 0) return null;
    return { items };
  }
  if (id === "guarantee") {
    const value = text(content.text);
    if (!value) return null;
    return { text: value };
  }
  if (id === "cta") {
    if (!text(content.text) && !text(content.approach)) return null;
    return { text: text(content.text) || null, approach: text(content.approach) || null, label: text(content.label) || null };
  }
  if (id === "footer") {
    const productName = text(content.productName);
    if (!productName) return null;
    return { productName };
  }
  if (id === "seo") {
    const title = text(content.title);
    if (!title) return null;
    const description = text(content.description) || text(content.metaDescription) || null;
    const keywords = list(content.keywords).map(text).filter((keyword) => namesProduct(keyword, title));
    return {
      title,
      metaDescription: text(content.metaDescription) || description,
      description,
      slug: text(content.slug) || null,
      openGraph: content.openGraph && typeof content.openGraph === "object" ? content.openGraph : { title, description },
      keywords,
      canonical: content.canonical ?? null,
      approach: text(content.approach) || null,
    };
  }
  if (id === "schema") {
    const name = text(content.name);
    if (!name) return null;
    const faq = answered(content.faq);
    return {
      type: text(content.type) || "WebPage",
      name,
      faq,
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name, ...(faq.length > 0 ? { about: faq } : {}) },
    };
  }
  return null;
}

function emptyReason(id: string): string {
  if (id === "faq") return "sem perguntas";
  if (id === "guarantee") return "sem garantia";
  if (id === "scientific-evidence") return "sem dados";
  if (id === "ingredients") return "sem ingredientes";
  return "sem dados";
}

function omitReason(section: SectionGeneration, enabled: boolean): string | null {
  if (section.status !== "GENERATED") return section.warnings[0] || "não gerada";
  if (!enabled) return "desabilitada na planta";
  if (!ground(section.sectionId, section.generatedContent)) {
    if (section.sectionId === "benefits") return "sem features nos Product Facts";
    if (section.sectionId === "faq") {
      return list(section.generatedContent?.items).length === 0 ? "sem perguntas" : "sem resposta nos Product Facts";
    }
    if (section.sectionId === "problem") return "sem cautela nos Product Facts";
    return emptyReason(section.sectionId);
  }
  return null;
}

function requiredSectionIds(facts: ProductFacts | null | undefined, generated: GeneratedSections): string[] {
  const required: string[] = [...REQUIRED_SECTIONS];
  if (benefitsStructurallyRequired(facts, generated)) required.push("benefits");
  return required;
}

function consumerVisibleLines(document: LandingDocument): string[] {
  const presented = presentLandingDocument(document);
  const parts: string[] = [presented.productName, presented.description ?? ""];
  for (const section of presented.sections) {
    if (section.kind === "overview" || section.kind === "details" || section.kind === "important") parts.push(...section.items);
    else if (section.kind === "ingredients") parts.push(...section.names);
    else if (section.kind === "guarantee") parts.push(section.text);
    else parts.push(...section.items.flatMap((item) => [item.question, item.answer]));
  }
  return parts.map((item) => item.trim()).filter(Boolean);
}

function groundingGateForDocument(document: LandingDocument, facts: ProductFacts | null | undefined): "PASS" | "FAIL" {
  if (!facts) return "FAIL";
  const lines = consumerVisibleLines(document);
  if (lines.length === 0) return "PASS";
  for (const line of lines) {
    const result = validateGrounding(line, facts, { productIdentity: facts.productName });
    if (result.status !== "GROUNDED") return "FAIL";
  }
  return "PASS";
}

export function composeLandingDocument(input: ComposeInput): LandingDocument {
  const facts = input.facts ?? null;
  const requireBenefits = benefitsStructurallyRequired(facts, input.generated);
  const enabled = new Map(input.blueprint.sections.map((section) => [section.id, section.enabled]));
  const stamp = input.generated.sections.map((section) => ({
    sectionId: section.sectionId,
    status: section.status,
    inputFingerprint: section.inputFingerprint,
    enabled: enabled.get(section.sectionId) === true,
  }));
  const inputFingerprint = fingerprint({
    firewall: "content-19",
    benefits: requireBenefits ? "required" : "optional",
    grounding: "validateGrounding",
    language: input.blueprint.language,
    sections: stamp,
  });
  if (input.previous && input.previous.metadata.inputFingerprint === inputFingerprint) {
    return { ...input.previous, metadata: { ...input.previous.metadata, cached: true } };
  }

  const started = Date.now();
  const byId = new Map(input.generated.sections.map((section) => [section.sectionId, section]));
  const omitted: Array<{ sectionId: string; reason: string }> = [];
  const included = new Map<string, ComposedSection>();

  for (const section of input.generated.sections) {
    const reason = omitReason(section, enabled.get(section.sectionId) === true);
    if (reason) {
      omitted.push({ sectionId: section.sectionId, reason });
      continue;
    }
    included.set(section.sectionId, {
      sectionId: section.sectionId,
      content: ground(section.sectionId, section.generatedContent) ?? {},
      warnings: section.warnings,
    });
  }

  const sections = BODY_ORDER.filter((id) => included.has(id)).map((id) => included.get(id) as ComposedSection);
  const seo = included.get("seo")?.content ?? null;
  const schema = included.get("schema")?.content ?? null;
  const required = requiredSectionIds(facts, input.generated);
  const errors = required.filter((id) => !included.has(id)).map((id) => `${LABEL[id]} obrigatório ausente.`);
  const warnings = [
    ...omitted.map((item) => `${LABEL[item.sectionId] ?? item.sectionId}: ${item.reason}`),
    ...sections.flatMap((section) => section.warnings.map((warning) => `${LABEL[section.sectionId] ?? section.sectionId}: ${warning}`)),
  ];
  if (!input.decision) warnings.push("Não há decisão de estratégia salva. A montagem usou só a planta e as seções.");
  if (!byId.has("hero")) warnings.push("Hero: não gerada.");

  const visible = JSON.stringify({ sections, seo, schema });
  const policyFail = riskySentences(visible).some((sentence) => !/not intended to diagnose/i.test(sentence));
  const structural = errors.length === 0 ? "PASS" : "FAIL";
  const policy = policyFail ? "FAIL" : "PASS";

  const draft: LandingDocument = {
    version: 1,
    campaignId: input.campaignId,
    language: input.blueprint.language || "en",
    generatedAt: input.now ?? new Date().toISOString(),
    sections,
    seo,
    schema,
    metadata: {
      approachId: input.decision?.approachId ?? null,
      compositionTimeMs: Math.max(0, Date.now() - started),
      inputFingerprint,
      cached: false,
      included: [...sections.map((section) => section.sectionId), ...(seo ? ["seo"] : []), ...(schema ? ["schema"] : [])],
      omitted,
      gates: { structural, grounding: "FAIL", policy, publication: "BLOCKED" },
    },
    validationStatus: errors.length > 0 ? "ERROR" : "PASS",
    renderStatus: errors.length > 0 ? "INCOMPLETE" : "READY",
    warnings,
    errors,
  };

  const grounding = groundingGateForDocument(draft, facts);
  const publication = structural === "PASS" && grounding === "PASS" && policy === "PASS" ? "HELD" : "BLOCKED";
  draft.metadata.gates = { structural, grounding, policy, publication };
  return draft;
}
