import { inspectEditorialNeutrality } from "@/lib/editorial-neutrality/inspect";
import { neutralizeEditorialText } from "@/lib/editorial-neutrality/neutralize";
import type { NeutralityDecision, NeutralityFinding, NeutralityRole } from "@/lib/editorial-neutrality/types";
import type { GroundedText, SalesCopy } from "@/lib/page-blueprint/types";

function rewrite(text: GroundedText, role: NeutralityRole): GroundedText | null {
  const decision = neutralizeEditorialText({ text: text.text, role });
  if (decision.action === "OMIT" || !decision.renderedText) return null;
  if (decision.renderedText === text.text) return text;
  return { ...text, text: decision.renderedText };
}

export function applyEditorialNeutrality(copy: SalesCopy): { copy: SalesCopy; findings: NeutralityFinding[]; decisions: NeutralityDecision[] } {
  const findings = inspectEditorialNeutrality(copy);
  const next: SalesCopy = {
    ...copy,
    introduction: rewrite(copy.introduction, "OVERVIEW") ?? copy.introduction,
    sections: copy.sections.map((section) => {
      const role: NeutralityRole =
        section.sectionType === "trust"
          ? "OPERATIONAL"
          : section.sectionType === "guarantee"
            ? "GUARANTEE"
            : section.sectionType === "how_it_works"
              ? "USAGE"
              : section.sectionType === "specifications"
                ? "SPECIFICATION"
                : section.sectionType === "differentiators"
                  ? "FEATURE"
                  : "OTHER";
      return {
        ...section,
        body: section.body.map((item) => rewrite(item, role)).filter((item): item is GroundedText => Boolean(item)),
        items: section.items
          .map((item) => {
            const text = rewrite(item.text, role);
            return text ? { ...item, text } : null;
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      };
    }),
    faq: copy.faq
      .map((item) => {
        const question = rewrite(item.question, "FAQ");
        const answer = rewrite(item.answer, "FAQ");
        if (!question || !answer) return null;
        return { question, answer };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
  return { copy: next, findings, decisions: findings };
}

export function publishableEditorialText(text: string, role: NeutralityRole): string | null {
  return neutralizeEditorialText({ text, role }).renderedText;
}
