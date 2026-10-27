import { isPromotionalOrCta } from "@/lib/import-heuristics";
import { isIncompleteFragment } from "@/lib/lp-generator/structure";
import { statementAllowed } from "@/lib/product-contract/claims";
import { classifyEvidence } from "@/lib/presell-enrichment/classify";
import { neutralizeEditorialText } from "@/lib/editorial-neutrality/neutralize";

const CHECKOUT =
  /\b(click the button|secure order|checkout page|order checkout|add to cart|buy now|shipping .{0,40}doorstep|one-time payment|recurring shipments|charges to your card|clicking here|click here)\b/i;
const TRANSFORMATION =
  /\b(transform(?:s|ed|ing)? (?:your |my |our )?(lives?|gums?|teeth|body)|life[- ]changing|changed my life|toxin cleanse|clears your entire body|results well into|enjoy results)\b/i;
const REGULATORY_INVENTION = /\bfda[- ]?(accredited|approved|certified)\b/i;
const RESULT_VARIANCE = /\b(patients may experience|improvement faster|results might vary from individual)\b/i;
const SALES_DEFENSE = /\b(so successful|tried to copy it|might not be legit|following link: references)\b/i;
const CLINICAL = /\b((?:backed by )?(?:clinical|scientific) research|clinically researched|clinically proven|scientifically proven)\b/i;
const UNIVERSAL_SAFETY =
  /\b(all ages and medical conditions|designed for all (?:ages|medical)|generally considered to be safe|safe for everyone)\b/i;

export type FaqExclusion = { question: string; answer: string; reason: string };

export function faqEntryAllowed(question: string, answer: string): { ok: true } | { ok: false; reason: string } {
  const q = question.replace(/\s+/g, " ").trim();
  const a = answer.replace(/\s+/g, " ").trim();
  if (!q || !a) return { ok: false, reason: "empty question or answer" };
  if (isIncompleteFragment(a) || a.length < 24) return { ok: false, reason: "answer is incomplete" };
  if (isPromotionalOrCta(q) || isPromotionalOrCta(a) || CHECKOUT.test(q) || CHECKOUT.test(a)) {
    return { ok: false, reason: "checkout or promotional close" };
  }
  if (TRANSFORMATION.test(q) || TRANSFORMATION.test(a)) return { ok: false, reason: "transformation promise" };
  if (REGULATORY_INVENTION.test(q) || REGULATORY_INVENTION.test(a)) return { ok: false, reason: "unsupported regulatory claim" };
  if (RESULT_VARIANCE.test(q) || RESULT_VARIANCE.test(a)) return { ok: false, reason: "unsupported result claim" };
  if (SALES_DEFENSE.test(q) || SALES_DEFENSE.test(a)) return { ok: false, reason: "sales-defense copy is not product FAQ" };
  if (CLINICAL.test(q) || CLINICAL.test(a)) return { ok: false, reason: "unsupported clinical-research claim" };
  if (UNIVERSAL_SAFETY.test(q) || UNIVERSAL_SAFETY.test(a)) return { ok: false, reason: "unsupported universal safety claim" };
  if (!statementAllowed(q, "PROMOTIONAL") || !statementAllowed(a, "PROMOTIONAL")) {
    return { ok: false, reason: "promotional claim gate" };
  }
  const classified = classifyEvidence({ field: "FAQ", text: `${q} ${a}` });
  if (classified.restriction !== "PUBLISHABLE") {
    return { ok: false, reason: classified.notes.join("; ") || "FAQ evidence is not publishable" };
  }
  const editorial = neutralizeEditorialText({ text: a, role: "FAQ" });
  if (editorial.action === "OMIT") return { ok: false, reason: editorial.reasons[0] ?? "FAQ is not editorially neutral" };
  return { ok: true };
}

export function selectPublishableFaq<T extends { question: string; answer: string }>(
  rows: T[],
): { kept: T[]; excluded: FaqExclusion[] } {
  const kept: T[] = [];
  const excluded: FaqExclusion[] = [];
  for (const row of rows) {
    const allowed = faqEntryAllowed(row.question, row.answer);
    if (!allowed.ok) {
      excluded.push({ question: row.question, answer: row.answer, reason: allowed.reason });
      continue;
    }
    kept.push(row);
  }
  return { kept, excluded };
}
