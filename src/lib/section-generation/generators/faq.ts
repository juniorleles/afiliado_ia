import { faqPrompt } from "@/lib/section-generation/prompts/faq";
import { clip, factAnswer, failed, generated } from "@/lib/section-generation/support";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type FaqQuestion = { text: string; origin: "MarketIntelligenceAnalysis" | "StrategyDecision" };

export type FaqInput = {
  questions: FaqQuestion[];
  guarantee?: string;
  ingredients: string[];
  cautions: string[];
  marketConfidence: number | null;
};

export function generateFaq(input: FaqInput) {
  const questions = input.questions
    .map((item) => ({ ...item, text: clip(item.text, 180) }))
    .filter((item, index, all) => item.text && all.findIndex((other) => other.text === item.text) === index)
    .slice(0, 8);
  const evidence: EvidenceUse[] = [];
  const items = questions.flatMap((entry) => {
    const supported = factAnswer(entry.text, input);
    if (!supported) return [];
    evidence.push({ origin: "ProductFacts" as const, field: supported.field, text: supported.text });
    return [{ question: entry.text, answer: supported.text }];
  });
  if (items.length === 0) {
    return failed("faq", ["Nenhuma pergunta medida tem resposta nos Product Facts."], [`Prompt ${faqPrompt.id} não gerou FAQ.`]);
  }
  return generated("faq", { items }, evidence, [`Prompt ${faqPrompt.id}: ${faqPrompt.objective}`], [], input.marketConfidence, {
    prose: items.map((item) => `${item.question} ${item.answer}`).join(" "),
    slotsFilled: items.length,
    slots: items.length,
  });
}
