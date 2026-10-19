import { comparisonPrompt } from "@/lib/section-generation/prompts/comparison";
import { failed } from "@/lib/section-generation/support";

export type ComparisonInput = {
  domains: number;
  editorial: number;
  comparisonPercent: number;
  marketConfidence: number | null;
};

export function generateComparison(input: ComparisonInput) {
  void input;
  return failed(
    "comparison",
    ["Contagem de páginas medidas não autoriza uma afirmação sobre o produto."],
    [`Prompt ${comparisonPrompt.id} não gerou a tabela.`],
  );
}
