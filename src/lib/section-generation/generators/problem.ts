import { problemPrompt } from "@/lib/section-generation/prompts/problem";
import { clip, failed, generated } from "@/lib/section-generation/support";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type ProblemInput = {
  pains: string[];
  cautions: string[];
  marketConfidence: number | null;
};

export function generateProblem(input: ProblemInput) {
  const cautions = input.cautions.map((text) => clip(text)).filter(Boolean);
  if (cautions.length === 0) {
    return failed("problem", ["Não há cautela nos Product Facts. Dor medida não autoriza o texto."], [`Prompt ${problemPrompt.id} não gerou o problema.`]);
  }
  const evidence: EvidenceUse[] = cautions.map((text) => ({ origin: "ProductFacts" as const, field: "cautions", text }));
  const statement = "The product source lists these cautions.";
  return generated("problem", {
    statement,
    cautions,
  }, evidence, [`Prompt ${problemPrompt.id}: ${problemPrompt.objective}`], [], input.marketConfidence, {
    prose: [statement, ...cautions].join(" "),
    slotsFilled: 1,
    slots: 1,
  });
}
