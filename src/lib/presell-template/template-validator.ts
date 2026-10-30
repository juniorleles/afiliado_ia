import { PRESELL_REQUIRED_SECTIONS, PRESELL_STANDARD_SECTION_IDS } from "@/lib/presell-template/standard-v1";
import type { PresellTemplateDocument } from "@/lib/presell-template/template-contract";

export type TemplateValidationIssue = { code: string; message: string };

export function validatePresellTemplateDocument(document: PresellTemplateDocument): {
  ok: boolean;
  issues: TemplateValidationIssue[];
} {
  const issues: TemplateValidationIssue[] = [];
  if (document.standardId !== "PRESELL_STANDARD_V1") issues.push({ code: "STANDARD_ID", message: "Unexpected template id." });
  if (document.cta.enabled !== false || document.cta.href !== null) {
    issues.push({ code: "CTA_ENABLED", message: "Commercial CTA must stay disabled." });
  }
  if (document.sections.length !== PRESELL_STANDARD_SECTION_IDS.length) {
    issues.push({ code: "SECTION_COUNT", message: "Registry sections are missing from the document." });
  }
  const order = document.sections.map((item) => item.id);
  if (order.join("|") !== PRESELL_STANDARD_SECTION_IDS.join("|")) {
    issues.push({ code: "SECTION_ORDER", message: "Section order does not match PRESELL_STANDARD_V1." });
  }
  for (const id of PRESELL_REQUIRED_SECTIONS) {
    const row = document.sections.find((item) => item.id === id);
    if (!row?.present) issues.push({ code: "REQUIRED_MISSING", message: `Required section ${id} is not present.` });
  }
  const testimonials = document.sections.find((item) => item.id === "VERIFIED_TESTIMONIALS");
  if (testimonials?.present && document.testimonials.status === "SECTION_OMITTED") {
    issues.push({ code: "TESTIMONIALS", message: "Testimonials cannot render without authentic authorization." });
  }
  if (document.announcement && /limited[- ]time|hurry|act now/i.test(document.announcement.message)) {
    issues.push({ code: "URGENCY", message: "Announcement invented urgency." });
  }
  for (const section of document.sections) {
    if (!section.present && !section.omittedReason) {
      issues.push({ code: "OMIT_REASON", message: `Omitted section ${section.id} has no reason.` });
    }
    if (section.present && section.claims.some((claim) => !claim.text.trim())) {
      issues.push({ code: "EMPTY_CLAIM", message: `Section ${section.id} contains an empty claim.` });
    }
  }
  const seen = new Set<string>();
  for (const section of document.sections.filter((item) => item.present)) {
    for (const claim of section.claims) {
      const key = claim.text.toLowerCase();
      if (seen.has(key)) issues.push({ code: "DUPLICATE_CLAIM", message: `Claim is duplicated across sections: ${claim.text.slice(0, 80)}` });
      seen.add(key);
    }
  }
  return { ok: issues.length === 0, issues };
}
