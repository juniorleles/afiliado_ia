import type { SalesCopy, SectionCopy } from "@/lib/page-blueprint/types";

function normalizeCopy(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#\d+;|&[a-z]+;/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(text: string): string[] {
  return normalizeCopy(text).split(" ").filter((item) => item.length >= 3);
}

function nearDuplicate(left: string, right: string): boolean {
  const a = normalizeCopy(left);
  const b = normalizeCopy(right);
  if (!a || !b || a.length < 12 || b.length < 12) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return shorter / longer >= 0.8;
  }
  const leftTokens = new Set(tokensOf(left));
  const rightTokens = new Set(tokensOf(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.92 && Math.abs(leftTokens.size - rightTokens.size) <= 2;
}

/**
 * Drops repeated blocks after copy is assembled. FAQ answers stay in copy.faq.
 * Other sections lose a block when it matches a FAQ answer or an earlier section.
 * Different questions that only share a few words are kept.
 */
export function dedupeSalesCopy(copy: SalesCopy): SalesCopy {
  const keptFaq: SalesCopy["faq"] = [];
  const faqKeys = new Set<string>();
  for (const item of copy.faq) {
    const key = normalizeCopy(item.answer.text);
    if (!key || keptFaq.some((entry) => nearDuplicate(entry.answer.text, item.answer.text))) continue;
    if (faqKeys.has(normalizeCopy(item.question.text))) continue;
    faqKeys.add(normalizeCopy(item.question.text));
    keptFaq.push(item);
  }

  const reserved = keptFaq.map((item) => item.answer.text);
  const seen: string[] = [...reserved, copy.headline.text, copy.introduction.text, copy.subheadline?.text ?? ""];

  const uniqueText = (text: string): boolean => {
    if (!normalizeCopy(text)) return false;
    if (seen.some((item) => nearDuplicate(item, text))) return false;
    seen.push(text);
    return true;
  };

  const sections: SectionCopy[] = copy.sections.map((section) => {
    if (section.sectionType === "faq") {
      return {
        ...section,
        body: [],
        items: keptFaq.map((item) => ({ title: item.question, text: { ...item.question, text: "" } })),
      };
    }
    return {
      ...section,
      body: section.body.filter((item) => uniqueText(item.text)),
      items: section.items.filter((item) => uniqueText(item.text.text)),
    };
  }).filter((section) => section.sectionType === "hero" || section.sectionType === "legal" || (section.sectionType === "faq" && keptFaq.length > 0) || section.body.length + section.items.length > 0);

  return { ...copy, sections, faq: keptFaq };
}
