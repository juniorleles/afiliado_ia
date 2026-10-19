import { testimonialsPrompt } from "@/lib/section-generation/prompts/testimonials";
import { clip, failed, generated } from "@/lib/section-generation/support";

export type TestimonialsInput = {
  quotes: string[];
  marketConfidence: number | null;
};

export function generateTestimonials(input: TestimonialsInput) {
  if (input.quotes.length === 0) {
    return failed("testimonials", ["Nenhum depoimento foi extraído. A seção não foi gerada."], [`Prompt ${testimonialsPrompt.id} não criou depoimento.`]);
  }
  const quotes = input.quotes.map((text) => clip(text));
  const evidence = quotes.map((text) => ({ origin: "MarketIntelligenceAnalysis" as const, field: "testimonials", text }));
  return generated("testimonials", { quotes }, evidence, [`Prompt ${testimonialsPrompt.id}: ${testimonialsPrompt.objective}`], ["Depoimento de página não é fato do produto."], input.marketConfidence, {
    prose: quotes.join(" "),
    slotsFilled: quotes.length,
    slots: quotes.length,
  });
}
