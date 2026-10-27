import { guaranteeDurations, guaranteeStatesTerms, RESTATEMENT_EXEMPT_RULES, statementAllowed } from "@/lib/product-contract/claims";
import { classifyEvidence } from "@/lib/presell-enrichment/classify";
import type { ProductFacts } from "@/lib/product-facts";

const AMPLIFIER = /\b(iron[- ]clad|risk[- ]free|100\s?%|every single cent|impressed with the results|believe in this formula)\b/i;
const MEDICAL =
  /\b(bladder|urinary|microbiome|pee leaks?|dioxins?|clinically|scientifically proven|extra-strong|old age|root cause|endorsed)\b/i;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Keeps a stated refund window and drops promotional amplifiers.
 * It does not keep health outcomes or turn a prohibited promise into copy by attribution.
 */
export function restateOperationalGuarantee(text: string): string | null {
  const raw = clean(text);
  if (!raw || MEDICAL.test(raw) && !/money[- ]back|refund|guarantee/i.test(raw)) return null;
  const durations = guaranteeDurations(raw);
  if (durations.length !== 1) return null;
  if (!/\b(money[- ]back|refund)\b/i.test(raw)) return null;
  const [count, unit] = durations[0].split(" ");
  const restated = `${count}-${unit} money-back guarantee.`;
  if (!guaranteeStatesTerms(restated)) return null;
  if (!statementAllowed(restated, "OPERATIONAL", RESTATEMENT_EXEMPT_RULES)) return null;
  if (AMPLIFIER.test(restated)) return null;
  return restated;
}

export function needsGuaranteeRestatement(text: string): boolean {
  const raw = clean(text);
  if (!raw) return false;
  if (AMPLIFIER.test(raw)) return true;
  return !statementAllowed(raw, "OPERATIONAL", RESTATEMENT_EXEMPT_RULES);
}

function formFromUsage(usage: string[]): string | null {
  const blob = usage.join(" ").toLowerCase();
  if (/\bcapsules?\b/.test(blob)) return "capsule";
  if (/\btablets?\b/.test(blob)) return "tablet";
  if (/\bsoftgels?\b/.test(blob)) return "softgel";
  if (/\bgummies\b|\bgummy\b/.test(blob)) return "gummy";
  if (/\bbalm\b/.test(blob)) return "balm";
  if (/\bcream\b|\bserum\b/.test(blob)) return null;
  return null;
}

/** Identity + stated format only. Never uses a blocked health description. */
export function composeNeutralOverviewFromFacts(facts: ProductFacts): string | null {
  const name = clean(facts.productName);
  const kind = clean(facts.productFormat?.value ?? facts.productFormat?.statement ?? "");
  if (!name || !kind) return null;
  const form = formFromUsage(facts.usageInformation ?? []);
  if (!form) return null;
  const text = `${name} is a ${kind} supplied as a ${form}.`;
  const classified = classifyEvidence({ field: "PRODUCT_OVERVIEW", text, operatorAttested: true });
  if (classified.restriction !== "PUBLISHABLE") return null;
  if (!statementAllowed(text, "PROMOTIONAL")) return null;
  return text;
}

export function restateIngredientQuestion(question: string, names: string[]): { question: string; answer: string } | null {
  if (!names.length) return null;
  if (!/\bingredients?\b|\bformula\b|\bwhat(?:'s| is) (?:in|inside)\b/i.test(question)) return null;
  const answer = `The source lists: ${names.join(", ")}.`;
  if (!statementAllowed(answer, "PROMOTIONAL")) return null;
  return { question: "What ingredients does the source list?", answer };
}
