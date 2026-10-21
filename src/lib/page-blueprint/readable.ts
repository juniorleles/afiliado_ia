import type { PageBlueprint, SalesCopy } from "@/lib/page-blueprint/types";

export function readableBlueprint(copy: SalesCopy, blueprint: PageBlueprint): string {
  const lines: string[] = [];
  lines.push(`# ${copy.headline.text}`);
  if (copy.subheadline) lines.push(copy.subheadline.text);
  lines.push("");
  lines.push(`Goal: ${blueprint.conversionGoal}`);
  lines.push(`Narrative: ${blueprint.narrative.shape} / ${blueprint.narrative.density} / ${blueprint.narrative.compositionHint}`);
  lines.push(`Producer: ${copy.producer}`);
  lines.push(`CTA: ${copy.cta.action}${copy.cta.label ? ` — ${copy.cta.label.text}` : ""}`);
  lines.push("");
  lines.push(copy.introduction.text);
  lines.push("");
  lines.push(`Sections: ${blueprint.sections.map((item) => item.sectionType).join(" → ")}`);
  lines.push("");
  for (const section of copy.sections) {
    lines.push(`## ${section.headline.text}`);
    for (const paragraph of section.body) lines.push(paragraph.text);
    for (const item of section.items) {
      if (item.title) lines.push(`- ${item.title.text}: ${item.text.text}`);
      else lines.push(`- ${item.text.text}`);
    }
    if (section.cta) lines.push(`CTA: ${section.cta.text}`);
    lines.push("");
  }
  if (copy.faq.length) {
    lines.push("## FAQ");
    for (const item of copy.faq) {
      lines.push(`Q: ${item.question.text}`);
      lines.push(`A: ${item.answer.text}`);
    }
    lines.push("");
  }
  if (copy.closing) lines.push(copy.closing.text);
  lines.push("");
  lines.push("Publication approval: REQUIRED");
  return lines.join("\n");
}
