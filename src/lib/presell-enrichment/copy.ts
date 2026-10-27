import type { SalesCopy, SectionCopy } from "@/lib/page-blueprint/types";

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function unionFaq(preserved: SalesCopy["faq"], generated: SalesCopy["faq"]): SalesCopy["faq"] {
  const seen = new Set<string>();
  const out: SalesCopy["faq"] = [];
  for (const item of [...preserved, ...generated]) {
    const key = keyOf(item.question.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function shouldKeepGeneratedSection(section: SectionCopy, preserved: SalesCopy): boolean {
  if (section.sectionType === "presentation" && preserved.introduction?.text) {
    const body = section.body[0]?.text ?? "";
    if (!body) return false;
    if (preserved.introduction.text.length >= body.length) return false;
  }
  return true;
}

/**
 * Keep an already-approved copy for existing section types and only append
 * newly eligible sections produced from grounded deterministic copy.
 */
export function mergePreservedCopy(preserved: SalesCopy, generated: SalesCopy): SalesCopy {
  const preservedTypes = new Set(preserved.sections.map((item) => item.sectionType));
  const added: SectionCopy[] = generated.sections.filter(
    (section) => !preservedTypes.has(section.sectionType) && shouldKeepGeneratedSection(section, preserved),
  );
  const hero = preserved.sections.filter((item) => item.sectionType === "hero");
  const rest = preserved.sections.filter((item) => item.sectionType !== "hero" && item.sectionType !== "legal");
  const legal = preserved.sections.filter((item) => item.sectionType === "legal");
  return {
    ...generated,
    producer: preserved.producer,
    headline: preserved.headline,
    subheadline: preserved.subheadline ?? generated.subheadline,
    valueProposition: preserved.valueProposition ?? generated.valueProposition,
    introduction: preserved.introduction,
    sections: [...hero, ...added, ...rest, ...legal],
    faq: unionFaq(preserved.faq, generated.faq),
    cta: preserved.cta,
    closing: preserved.closing ?? generated.closing,
    offerMicrocopy: preserved.offerMicrocopy.length ? preserved.offerMicrocopy : generated.offerMicrocopy,
  };
}
