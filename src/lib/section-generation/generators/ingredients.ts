import { ingredientsPrompt } from "@/lib/section-generation/prompts/ingredients";
import { clip, failed, generated } from "@/lib/section-generation/support";

export type IngredientsInput = {
  ingredients: string[];
  marketConfidence: number | null;
};

export function generateIngredients(input: IngredientsInput) {
  if (input.ingredients.length === 0) {
    return failed("ingredients", ["Ingredientes insuficientes. Nenhum mecanismo foi criado."], [`Prompt ${ingredientsPrompt.id} não gerou ingredientes.`]);
  }
  const items = input.ingredients.map((raw) => {
    const text = clip(raw);
    const split = text.split(/\s[-:]\s/);
    return {
      name: split[0]?.trim() || text,
      description: split.length > 1 ? split.slice(1).join(" - ").trim() : null,
      function: null,
    };
  });
  const evidence = input.ingredients.map((text) => ({ origin: "ProductFacts" as const, field: "ingredientsOrComponents", text: clip(text) }));
  return generated("ingredients", {
    names: items.map((item) => item.name),
    items,
  }, evidence, [`Prompt ${ingredientsPrompt.id}: ${ingredientsPrompt.objective}`], ["Descrição e função ficam vazias quando o fato do ingrediente não as traz."], input.marketConfidence, {
    prose: items.map((item) => item.name).join(". ") + ".",
    slotsFilled: items.length,
    slots: items.length,
  });
}
