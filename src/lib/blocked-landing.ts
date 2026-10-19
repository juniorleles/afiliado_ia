import { knowledgeChecks, knowledgePercent, type KnowledgeCheck, type KnowledgeText } from "@/lib/product-knowledge";

export type BlockedFact = KnowledgeCheck & { reason?: string };

const LABELS: Record<string, string> = {
  usage: "Como funciona",
};

const REASONS: Record<string, string> = {
  description: "Usada para apresentar o produto com clareza.",
  ingredients: "Usada para explicar como o produto funciona.",
  benefits: "Usada para sustentar os argumentos da página.",
  usage: "Usada para descrever o uso informado do produto.",
  warnings: "Usada para manter os avisos dentro do que a fonte informou.",
  pricing: "Usada para gerar as seções de oferta.",
  guarantee: "Usada para mostrar a garantia informada, sem reforçá-la.",
  manufacturer: "Usada para identificar quem fabrica o produto.",
  images: "Usada no hero e nos benefícios.",
  videos: "Opcional, mas aumenta a credibilidade.",
  faq: "Usada para responder dúvidas já presentes nos fatos.",
};

export function blockedLandingFacts(text: KnowledgeText): { percent: number; facts: BlockedFact[] } {
  const checks = knowledgeChecks(text);
  return {
    percent: knowledgePercent(checks),
    facts: checks.map((item) => ({
      ...item,
      label: LABELS[item.id] ?? item.label,
      reason: item.filled ? undefined : REASONS[item.id],
    })),
  };
}
