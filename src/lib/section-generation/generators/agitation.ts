import { agitationPrompt } from "@/lib/section-generation/prompts/agitation";
import { failed } from "@/lib/section-generation/support";

export type AgitationInput = {
  discomfort: string[];
  marketConfidence: number | null;
};

export function generateAgitation(input: AgitationInput) {
  void input;
  return failed(
    "agitation",
    ["Não há consequência nos Product Facts. Observação de mercado não autoriza o texto."],
    [`Prompt ${agitationPrompt.id} não gerou o aprofundamento.`],
  );
}
