import { solutionPrompt } from "@/lib/section-generation/prompts/solution";
import { clip, failed, generated } from "@/lib/section-generation/support";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type SolutionInput = {
  features: string[];
  ingredients: string[];
  marketConfidence: number | null;
};

export function generateSolution(input: SolutionInput) {
  const features = input.features.map((text) => clip(text));
  const ingredients = input.ingredients.map((text) => clip(text));
  const evidence: EvidenceUse[] = [
    ...input.features.map((text) => ({ origin: "ProductFacts" as const, field: "features", text: clip(text) })),
    ...input.ingredients.map((text) => ({ origin: "ProductFacts" as const, field: "ingredientsOrComponents", text: clip(text) })),
  ];
  if (evidence.length === 0) return failed("solution", ["A solução não está nos fatos do produto."], [`Prompt ${solutionPrompt.id} não gerou a solução.`]);
  const statement = "The product source lists these features and ingredients. No extra mechanism was added.";
  return generated("solution", {
    statement,
    features,
    ingredients,
  }, evidence, [`Prompt ${solutionPrompt.id}: ${solutionPrompt.objective}`], ["Os itens repetem o que a fonte do produto declarou."], input.marketConfidence, {
    prose: `${statement} ${features.join(" ")} ${ingredients.join(" ")}`,
    slotsFilled: (features.length > 0 ? 1 : 0) + (ingredients.length > 0 ? 1 : 0),
    slots: 2,
  });
}
