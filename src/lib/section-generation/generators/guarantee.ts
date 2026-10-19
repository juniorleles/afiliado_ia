import { guaranteePrompt } from "@/lib/section-generation/prompts/guarantee";
import { clip, failed, generated } from "@/lib/section-generation/support";

export type GuaranteeInput = {
  guaranteeInformation?: string;
  marketConfidence: number | null;
};

export function generateGuarantee(input: GuaranteeInput) {
  const text = input.guaranteeInformation?.trim() ?? "";
  if (!text) {
    return failed("guarantee", ["Garantia não está nos fatos do produto. A seção não foi gerada."], [`Prompt ${guaranteePrompt.id} não copiou garantia de mercado.`]);
  }
  const value = clip(text, 280);
  return generated("guarantee", { text: value }, [{ origin: "ProductFacts", field: "guaranteeInformation", text: value }], [`Prompt ${guaranteePrompt.id}: ${guaranteePrompt.objective}`], [], input.marketConfidence, {
    prose: value,
    slotsFilled: 1,
    slots: 1,
  });
}
