import { benefitsPrompt } from "@/lib/section-generation/prompts/benefits";
import { clip, failed, generated } from "@/lib/section-generation/support";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type BenefitsInput = {
  features: string[];
  marketBenefits: string[];
  marketConfidence: number | null;
};

export function generateBenefits(input: BenefitsInput) {
  const fromFacts = input.features.map((text) => clip(text)).filter(Boolean);
  if (fromFacts.length === 0) {
    return failed("benefits", ["Não há feature nos Product Facts. Benefício medido não autoriza o texto."], [`Prompt ${benefitsPrompt.id} não gerou benefícios.`]);
  }
  const evidence: EvidenceUse[] = fromFacts.map((text) => ({ origin: "ProductFacts" as const, field: "features", text }));
  const labeledFacts = fromFacts.map((text) => `${text} Source: product facts.`);
  return generated("benefits", {
    fromFacts: labeledFacts,
  }, evidence, [`Prompt ${benefitsPrompt.id}: ${benefitsPrompt.objective}`], ["Os itens dos fatos repetem o que a fonte do produto declarou."], input.marketConfidence, {
    prose: labeledFacts.join(" "),
    slotsFilled: 1,
    slots: 1,
  });
}
