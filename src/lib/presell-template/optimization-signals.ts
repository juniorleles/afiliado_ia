import type { PresellTemplateDocument } from "@/lib/presell-template/template-contract";

export type TemplateOptimizationSignal = {
  code: string;
  problem: string;
  paidCallRequired: false;
};

export function templateOptimizationSignals(input: {
  document: PresellTemplateDocument;
  markup: string;
}): TemplateOptimizationSignal[] {
  const signals: TemplateOptimizationSignal[] = [];
  if (!input.document.sections.find((item) => item.id === "PREMIUM_HERO")?.claims.length) {
    signals.push({ code: "HERO_WEAK", problem: "Hero has no approved copy traces.", paidCallRequired: false });
  }
  if (!input.markup.includes("ds-hero__stage") && input.markup.includes('data-hero-mode="EDITORIAL_NO_IMAGE"')) {
    signals.push({ code: "IMAGE_ABSENT", problem: "No authorized packshot is staged.", paidCallRequired: false });
  }
  if ((input.markup.match(/premium-card/g) ?? []).length === 1) {
    signals.push({ code: "CARDS_SPARSE", problem: "Only one premium card rendered.", paidCallRequired: false });
  }
  if (!input.markup.includes("ds-btn--preview")) {
    signals.push({ code: "CTA_LOW_EMPHASIS", problem: "Preview CTA markup is missing.", paidCallRequired: false });
  }
  return signals;
}
