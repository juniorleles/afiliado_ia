import { schemaPrompt } from "@/lib/section-generation/prompts/schema";
import { clip, factAnswer, failed, generated } from "@/lib/section-generation/support";
import type { FaqQuestion } from "@/lib/section-generation/generators/faq";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type SchemaInput = {
  productName: string;
  questions: FaqQuestion[];
  guarantee?: string;
  ingredients: string[];
  cautions: string[];
  marketConfidence: number | null;
};

export function generateSchema(input: SchemaInput) {
  if (!input.productName.trim()) return failed("schema", ["O nome do produto não está nos fatos."], [`Prompt ${schemaPrompt.id} não gerou o schema.`]);
  const name = input.productName.trim();
  const questions = input.questions
    .map((item) => ({ ...item, text: clip(item.text, 180) }))
    .filter((item, index, all) => item.text && all.findIndex((other) => other.text === item.text) === index)
    .slice(0, 8);
  const evidence: EvidenceUse[] = [{ origin: "ProductFacts", field: "productName", text: name }];
  const faq = questions.flatMap((entry) => {
    const supported = factAnswer(entry.text, input);
    if (!supported) return [];
    evidence.push({ origin: "ProductFacts" as const, field: supported.field, text: supported.text });
    return [{ question: entry.text, answer: supported.text }];
  });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    about: faq,
  };
  return generated("schema", {
    type: "WebPage",
    name,
    faq,
    jsonLd,
  }, evidence, [`Prompt ${schemaPrompt.id}: ${schemaPrompt.objective}`], [], input.marketConfidence, {
    prose: `${name}. ${faq.map((item) => item.question).join(" ")}`,
    slotsFilled: 1 + (faq.length > 0 ? 1 : 0),
    slots: 2,
  });
}
