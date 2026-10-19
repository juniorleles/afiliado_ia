import type { LandingDocument } from "@/lib/landing-composer/types";
import { landingScore } from "@/lib/landing-quality/score";
import type { LandingQualityScore, QualityProblem } from "@/lib/landing-quality/types";
import {
  extractUrls,
  hostname,
  isEvidenceSentence,
  proseOf,
  sentences,
  text,
  wordCount,
} from "@/lib/landing-quality/text";
import type { ProductFacts } from "@/lib/product-facts";
import { factAnswer, riskySentences } from "@/lib/section-generation/support";
import type { EvidenceUse, SectionGeneration } from "@/lib/section-generation/types";
import type { StrategyDecision } from "@/lib/strategy-decision/decide";

const REQUIRED = ["hero", "cta", "footer"] as const;
const BANNED_SCHEMA_KEYS = new Set(["offers", "price", "aggregateRating", "review", "reviewCount"]);

export type ValidationInput = {
  document: LandingDocument;
  sections: SectionGeneration[];
  facts: ProductFacts;
  decision: StrategyDecision | null;
  allowedHosts: Set<string>;
  enabled: Map<string, boolean>;
};

function problem(code: string, sectionId: string, message: string, fixable: boolean): QualityProblem {
  return { code, sectionId, message, fixable };
}

function contentRows(document: LandingDocument): Array<{ id: string; content: Record<string, unknown> }> {
  return [
    ...document.sections.map((section) => ({ id: section.sectionId, content: section.content })),
    ...(document.seo ? [{ id: "seo", content: document.seo }] : []),
    ...(document.schema ? [{ id: "schema", content: document.schema }] : []),
  ];
}

function evidenceFor(sections: SectionGeneration[], id: string): EvidenceUse[] {
  return sections.find((section) => section.sectionId === id)?.evidenceUsed ?? [];
}

function canFix(id: string, enabled: Map<string, boolean>, omitted: LandingDocument["metadata"]["omitted"]): boolean {
  if (omitted.some((item) => item.sectionId === id && item.reason.includes("desabilitada"))) return false;
  return enabled.get(id) !== false;
}

function knownIngredient(name: string, facts: string[]): boolean {
  const value = name.trim().toLowerCase();
  if (!value) return false;
  return facts.some((fact) => {
    const source = fact.toLowerCase();
    const head = source.split(/\s[-:]\s/)[0]?.trim() ?? source;
    return source.includes(value) || value === head;
  });
}

function guaranteeMatches(value: string, fact?: string): boolean {
  const left = value.replace(/…$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const right = (fact ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!left || !right) return false;
  return right.includes(left) || left.includes(right);
}

function schemaIssues(schema: Record<string, unknown> | null): string[] {
  if (!schema) return ["Schema ausente."];
  const json = schema.jsonLd;
  if (!json || typeof json !== "object" || Array.isArray(json)) return ["JSON-LD ausente."];
  let parsed: unknown;
  try {
    parsed = JSON.parse(JSON.stringify(json));
  } catch {
    return ["JSON-LD inválido."];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return ["JSON-LD inválido."];
  const row = parsed as Record<string, unknown>;
  const issues: string[] = [];
  if (row["@context"] !== "https://schema.org") issues.push("JSON-LD sem contexto schema.org.");
  if (typeof row["@type"] !== "string" || !row["@type"].trim()) issues.push("JSON-LD sem tipo.");
  if (typeof row.name !== "string" || !row.name.trim()) issues.push("JSON-LD sem nome.");
  const banned: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (BANNED_SCHEMA_KEYS.has(key)) banned.push(key);
      walk(child);
    }
  };
  walk(row);
  if (banned.length > 0) issues.push("JSON-LD traz preço, avaliação ou review.");
  return issues;
}

function canShorten(content: Record<string, unknown>, evidence: EvidenceUse[]): boolean {
  return sentences(proseOf(content)).some((sentence) => (
    wordCount(sentence) > 18
    && !isEvidenceSentence(sentence, evidence)
    && !/not intended to diagnose/i.test(sentence)
  ));
}

function avoidWords(decision: StrategyDecision | null): string[] {
  return (decision?.claimsToAvoid ?? []).map((word) => word.trim()).filter((word) => word.length >= 3);
}

export function validateLanding(input: ValidationInput): { problems: QualityProblem[]; score: LandingQualityScore } {
  const problems: QualityProblem[] = [];
  const omitted = input.document.metadata.omitted;
  const rows = contentRows(input.document);
  const byId = new Map(rows.map((row) => [row.id, row.content]));

  const requiredLabel = { hero: "Hero", cta: "CTA", footer: "Rodapé" } as const;
  if (!byId.has("benefits")) {
    problems.push(problem(
      "benefits-missing",
      "benefits",
      input.facts.features.length > 0
        ? "Benefícios ausentes."
        : "Benefícios ausentes. O fato necessário é features em Product Facts.",
      input.facts.features.length > 0 && canFix("benefits", input.enabled, omitted),
    ));
  }
  for (const id of REQUIRED) {
    if (!byId.has(id)) {
      const reason = omitted.find((item) => item.sectionId === id)?.reason;
      const named = requiredLabel[id];
      problems.push(problem(
        `${id}-missing`,
        id,
        reason ? `${named} ausente. ${reason}` : `${named} ausente.`,
        canFix(id, input.enabled, omitted) && (id === "cta" || Boolean(input.facts.productName.trim())),
      ));
    }
  }
  if (!input.document.seo) {
    problems.push(problem("seo-missing", "seo", "SEO ausente.", canFix("seo", input.enabled, omitted) && Boolean(input.facts.productName.trim())));
  } else if (!text(input.document.seo.metaDescription)) {
    problems.push(problem(
      "meta-description",
      "seo",
      input.facts.description?.trim() ? "Meta description ausente." : "Meta description ausente. A fonte não traz descrição.",
      Boolean(input.facts.description?.trim()),
    ));
  }

  const headlines = rows.filter((row) => text(row.content.headline));
  const heroHeadline = text(byId.get("hero")?.headline);
  if (byId.has("hero") && (!heroHeadline || headlines.length !== 1 || headlines[0]?.id !== "hero")) {
    problems.push(problem("h1", "hero", "A landing precisa de um único H1, o nome do produto.", true));
  }

  const faq = byId.get("faq");
  const faqItems = Array.isArray(faq?.items) ? faq.items : [];
  if (faq) {
    const questions = faqItems.map((item) => text((item as { question?: unknown }).question)).filter(Boolean);
    const duplicate = questions.some((question, index) => questions.indexOf(question) !== index);
    const inconsistent = faqItems.some((item) => {
      const row = item as { question?: unknown; answer?: unknown };
      const answer = text(row.answer);
      if (!answer) return false;
      const supported = factAnswer(text(row.question), {
        guarantee: input.facts.guaranteeInformation,
        ingredients: input.facts.ingredientsOrComponents,
        cautions: input.facts.cautions,
      });
      return !supported || supported.text !== answer;
    });
    if (duplicate || inconsistent || questions.length !== faqItems.length) {
      problems.push(problem("faq", "faq", "FAQ com pergunta duplicada ou resposta sem fato correspondente.", true));
    }
  }

  const extra = avoidWords(input.decision);
  for (const row of rows) {
    const evidence = evidenceFor(input.sections, row.id);
    const prose = proseOf(row.content);
    const risky = sentences(prose).filter((sentence) => {
      if (/not intended to diagnose/i.test(sentence) || isEvidenceSentence(sentence, evidence)) return false;
      if (riskySentences(sentence).length > 0) return true;
      return extra.some((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sentence));
    });
    if (risky.length > 0) problems.push(problem("prohibited-claim", row.id, "Claim proibido no texto da seção.", true));
    const priced = sentences(prose).filter((sentence) => (
      /(?:\bUSD\b|\$\s?\d)/i.test(sentence)
      && !isEvidenceSentence(sentence, evidence)
      && !evidence.some((item) => item.text.includes(sentence.trim()))
    ));
    if (priced.length > 0 || (row && evidence.length === 0 && prose.trim())) {
      problems.push(problem("unsupported-claim", row.id, "Afirmação sem evidência salva.", true));
    }
    const urls = extractUrls(prose).filter((url) => {
      const host = hostname(url);
      return !host || !input.allowedHosts.has(host);
    });
    if (urls.length > 0) problems.push(problem("broken-link", row.id, "Link fora das fontes salvas.", true));
  }

  const ingredients = byId.get("ingredients");
  if (ingredients) {
    const names = [
      ...(Array.isArray(ingredients.names) ? ingredients.names : []),
      ...(Array.isArray(ingredients.items) ? ingredients.items.map((item) => text((item as { name?: unknown }).name)) : []),
    ].filter((name) => name.trim());
    if (names.some((name) => !knownIngredient(name, input.facts.ingredientsOrComponents))) {
      problems.push(problem("unknown-ingredient", "ingredients", "Ingrediente que não está nos fatos.", true));
    }
  }

  const guarantee = text(byId.get("guarantee")?.text);
  if (guarantee && !guaranteeMatches(guarantee, input.facts.guaranteeInformation)) {
    problems.push(problem("unknown-guarantee", "guarantee", "Garantia que não está nos fatos do produto.", true));
  }

  const schemaMessages = input.document.schema ? schemaIssues(input.document.schema) : ["Schema ausente."];
  if (!input.document.schema || schemaMessages.length > 0) {
    const fixable = canFix("schema", input.enabled, omitted) && Boolean(input.facts.productName.trim());
    if (!input.document.schema) problems.push(problem("schema", "schema", "Schema ausente.", fixable));
    else problems.push(problem("jsonld", "schema", schemaMessages[0] ?? "JSON-LD inválido.", true));
  }

  const graph = input.document.seo?.openGraph;
  const graphTitle = graph && typeof graph === "object" ? text((graph as Record<string, unknown>).title) : "";
  const graphDescription = graph && typeof graph === "object" ? text((graph as Record<string, unknown>).description) : "";
  if (input.document.seo && (!graphTitle || (Boolean(input.facts.description?.trim()) && !graphDescription))) {
    problems.push(problem(
      "open-graph",
      "seo",
      graphTitle ? "Open Graph sem descrição da fonte." : "Open Graph ausente.",
      Boolean(text(input.document.seo.title)),
    ));
  }

  for (const section of input.sections) {
    if (!byId.has(section.sectionId) || section.status !== "GENERATED") continue;
    const scores = section.scores;
    if (!scores) continue;
    const evidence = section.evidenceUsed ?? [];
    const content = byId.get(section.sectionId) ?? {};
    if (scores.copyScore < 0.9) problems.push(problem("copy-score", section.sectionId, `Copy Score ${Math.round(scores.copyScore * 100)}.`, false));
    if (scores.readability < 0.9) {
      problems.push(problem("readability", section.sectionId, `Leitura ${Math.round(scores.readability * 100)}.`, canShorten(content, evidence)));
    }
    if (scores.persuasionScore < 0.9) problems.push(problem("persuasion", section.sectionId, `Persuasão ${Math.round(scores.persuasionScore * 100)}.`, false));
    if (scores.complianceScore < 1) problems.push(problem("compliance", section.sectionId, `Compliance ${Math.round(scores.complianceScore * 100)}.`, true));
  }

  return { problems, score: landingScore(input.document, input.sections, problems) };
}
