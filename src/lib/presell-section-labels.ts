/**
 * Visitor-facing label for the returns/guarantee section. The label names what
 * the copy actually says: a return or refund policy is never presented as a
 * guarantee, and explicit guarantee wording keeps the section's own title.
 */
const GUARANTEE_WORDING = /\bguarantee[sd]?\b|\bmoney[\s-]?back\b|\brisk[\s-]?free\b|\bsatisfaction\b/i;
const RETURN_WORDING = /\breturns?\b|\breturned\b/i;
const REFUND_WORDING = /\brefunds?\b|\brefunded\b/i;

/** Engine meta-question. The public page asks the same thing in reader language; the answer is unchanged. */
const FEATURES_META_QUESTION = /^What features are described for (.+?)\?$/;

export function consumerFacingFaqQuestion(question: string): string {
  const name = question.trim().match(FEATURES_META_QUESTION)?.[1]?.trim();
  if (!name) return question;
  return `What are the features of ${name}?`;
}

export function returnSectionLabel(title: string, lines: ReadonlyArray<string>): string {
  const text = lines.join(" ");
  if (!text.trim() || GUARANTEE_WORDING.test(text)) return title;
  if (RETURN_WORDING.test(text)) return "Return policy";
  if (REFUND_WORDING.test(text)) return "Refund policy";
  return title;
}
