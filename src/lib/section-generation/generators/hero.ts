import { approachEnglish } from "@/lib/section-generation/english";
import { heroPrompt } from "@/lib/section-generation/prompts/hero";
import { clip, failed, generated } from "@/lib/section-generation/support";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type HeroInput = {
  productName: string;
  description?: string;
  approachId: string | null;
  audience: string[];
  emotions: string[];
  copyAngle: string | null;
  marketConfidence: number | null;
};

export function generateHero(input: HeroInput) {
  if (!input.productName.trim()) {
    return failed("hero", ["O nome do produto não está nos fatos."], [`Prompt ${heroPrompt.id} não gerou o hero.`]);
  }
  const name = input.productName.trim();
  const approach = approachEnglish(input.approachId);
  const description = input.description?.trim() ? clip(input.description, 280) : null;
  const evidence: EvidenceUse[] = [{ origin: "ProductFacts", field: "productName", text: name }];
  if (description) evidence.push({ origin: "ProductFacts", field: "description", text: description });
  if (input.approachId) evidence.push({ origin: "StrategyDecision", field: "approachId", text: input.approachId });
  const lead = approach
    ? `This ${approach} stays with the product source.`
    : `This page stays with the product source.`;
  const hook = null;
  const warnings = description
    ? ["A descrição repete a fonte do produto, sem verificação independente."]
    : ["Não há descrição nos fatos."];
  if (input.copyAngle && /[^\x00-\x7F]/.test(input.copyAngle)) warnings.push("O ângulo da decisão não entrou na página porque não está em inglês.");
  const prose = [name, description, lead, hook].filter(Boolean).join(" ");
  return generated("hero", {
    headline: name,
    subheadline: description,
    lead,
    description: null,
    approach: input.approachId,
  }, evidence, [`Prompt ${heroPrompt.id}: ${heroPrompt.objective}`], warnings, input.marketConfidence, {
    prose,
    slotsFilled: [name, description, lead, hook].filter(Boolean).length,
    slots: 4,
  });
}
