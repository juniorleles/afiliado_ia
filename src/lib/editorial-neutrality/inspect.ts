import { neutralizeEditorialText } from "@/lib/editorial-neutrality/neutralize";
import type { NeutralityFinding, NeutralityRole } from "@/lib/editorial-neutrality/types";
import type { SalesCopy } from "@/lib/page-blueprint/types";

function roleOf(path: string, sectionType?: string): NeutralityRole {
  if (path === "introduction" || path === "headline") return "OVERVIEW";
  if (path.includes("faq")) return "FAQ";
  if (sectionType === "trust" || path.includes("operational")) return "OPERATIONAL";
  if (sectionType === "guarantee") return "GUARANTEE";
  if (sectionType === "how_it_works") return "USAGE";
  if (sectionType === "specifications") return "SPECIFICATION";
  if (sectionType === "differentiators") return "FEATURE";
  if (sectionType === "legal" || sectionType === "cta_final") return "OTHER";
  return "OTHER";
}

export function inspectEditorialNeutrality(copy: SalesCopy): NeutralityFinding[] {
  const rows: Array<{ path: string; text: string; refs: string[]; role: NeutralityRole }> = [
    { path: "headline", text: copy.headline.text, refs: copy.headline.evidenceRefs, role: "OVERVIEW" },
    { path: "introduction", text: copy.introduction.text, refs: copy.introduction.evidenceRefs, role: "OVERVIEW" },
  ];
  copy.sections.forEach((section, i) => {
    rows.push({
      path: `sections[${i}].headline`,
      text: section.headline.text,
      refs: section.headline.evidenceRefs,
      role: roleOf("headline", section.sectionType),
    });
    section.body.forEach((item, j) => {
      rows.push({
        path: `sections[${i}].body[${j}]`,
        text: item.text,
        refs: item.evidenceRefs,
        role: roleOf("body", section.sectionType),
      });
    });
    section.items.forEach((item, j) => {
      rows.push({
        path: `sections[${i}].items[${j}]`,
        text: item.text.text,
        refs: item.text.evidenceRefs,
        role: roleOf("items", section.sectionType),
      });
    });
  });
  copy.faq.forEach((item, i) => {
    rows.push({ path: `faq[${i}].question`, text: item.question.text, refs: item.question.evidenceRefs, role: "FAQ" });
    rows.push({ path: `faq[${i}].answer`, text: item.answer.text, refs: item.answer.evidenceRefs, role: "FAQ" });
  });

  return rows
    .filter((row) => row.text.trim())
    .map((row) => ({
      path: row.path,
      evidenceRefs: row.refs,
      ...neutralizeEditorialText({ text: row.text, role: row.role }),
    }));
}
