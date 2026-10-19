import { scientificEvidencePrompt } from "@/lib/section-generation/prompts/scientific-evidence";
import { failed, generated } from "@/lib/section-generation/support";

export type ScientificInput = {
  topics: Array<{ type: string; count: number }>;
  ingredientNames: string[];
  marketConfidence: number | null;
};

export function generateScientificEvidence(input: ScientificInput) {
  if (input.topics.length === 0) {
    return failed("scientific-evidence", ["Não há evidência científica salva. A seção não foi gerada."], [`Prompt ${scientificEvidencePrompt.id} não criou estudo.`]);
  }
  const evidence = input.topics.map((topic) => ({
    origin: "MarketIntelligenceAnalysis" as const,
    field: "dominantScientificTopics",
    text: `${topic.type} (${topic.count})`,
  }));
  const statement = `Measured pages mention ${input.topics.map((topic) => `${topic.type} (${topic.count})`).join(", ")}. No study was created.`;
  const warning = input.ingredientNames.length > 0
    ? "Seção reduzida. Há ingredientes nos fatos, mas nenhuma menção está ligada a eles."
    : "Seção reduzida. Nenhuma menção está ligada a um ingrediente dos fatos.";
  return generated("scientific-evidence", {
    statement,
    reduced: true,
    mentions: input.topics,
    tiedToIngredient: false,
  }, evidence, [`Prompt ${scientificEvidencePrompt.id}: ${scientificEvidencePrompt.objective}`], [warning], input.marketConfidence, {
    prose: statement,
    slotsFilled: 1,
    slots: 1,
  }, Math.min(input.marketConfidence ?? 0.35, 0.4));
}
