import { approachEnglish, emotionEnglish, triggerEnglish } from "@/lib/section-generation/english";
import { ctaPrompt } from "@/lib/section-generation/prompts/cta";
import { failed, generated } from "@/lib/section-generation/support";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type CtaInput = {
  approachId: string | null;
  triggers: string[];
  emotions: string[];
  marketConfidence: number | null;
};

export function generateCta(input: CtaInput) {
  const approach = approachEnglish(input.approachId);
  if (!input.approachId || !approach) return failed("cta", ["Não há decisão de estratégia para o CTA."], [`Prompt ${ctaPrompt.id} não gerou o CTA.`]);
  const evidence: EvidenceUse[] = [{ origin: "StrategyDecision", field: "approachId", text: input.approachId }];
  const triggers: string[] = [];
  let omittedCommercial = false;
  for (const text of input.triggers) {
    const english = triggerEnglish(text);
    if (!english) {
      if (/preço|price|usd|\$|garantia|guarantee/i.test(text)) omittedCommercial = true;
      continue;
    }
    triggers.push(english);
    evidence.push({ origin: "StrategyDecision", field: "persuasionTriggers", text });
  }
  const emotions = input.emotions.map(emotionEnglish).filter((item): item is string => Boolean(item));
  for (const text of emotions) evidence.push({ origin: "StrategyDecision", field: "emotionalDrivers", text });
  const warnings = triggers.length === 0 ? ["Nenhum gatilho medido."] : [];
  if (omittedCommercial) warnings.push("Gatilhos de preço ou garantia da decisão não foram copiados. Não são o preço nem a garantia do produto.");
  const text = `Continue with this ${approach}.`;
  return generated("cta", {
    text,
    approach: input.approachId,
    label: null,
  }, evidence, [`Prompt ${ctaPrompt.id}: ${ctaPrompt.objective}`], warnings, input.marketConfidence, {
    prose: text,
    slotsFilled: 1,
    slots: 1,
  });
}
