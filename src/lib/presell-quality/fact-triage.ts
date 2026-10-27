import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";
import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import type { FactCandidate } from "@/lib/presell-quality/recovery";

export const TRIAGE_CLASSES = [
  "DESCRIPTIVE_LOW_RISK",
  "SELLER_STATED_COMMERCIAL",
  "HEALTH_OR_EFFICACY_CLAIM",
  "INDEPENDENTLY_SUPPORTED",
  "CONTRADICTED",
  "INSUFFICIENT_EVIDENCE",
  "DUPLICATE",
] as const;
export type TriageClass = (typeof TRIAGE_CLASSES)[number];

export const TRIAGE_STATES = [
  "ELIGIBLE_FOR_REVIEW",
  "NEEDS_INDEPENDENT_EVIDENCE",
  "BLOCKED_UNSUPPORTED",
  "REJECTED_CONTRADICTED",
  "DUPLICATE_EXISTING_FACT",
] as const;
export type TriageState = (typeof TRIAGE_STATES)[number];

export type TriagedFact = {
  field: string;
  text: string;
  sourceUrl: string;
  excerpt: string;
  sourceClass: string;
  excerptSupportsCandidate: boolean;
  triageClass: TriageClass;
  nextState: TriageState;
  editorialRisk: "LOW" | "MEDIUM" | "HIGH";
  medicalOrPromotional: boolean;
  notes: string[];
  approvedForUse: false;
};

const UNCERTAIN_HOST = /vercel\.app|colibrim\.ai/i;
const EFFICACY = /\bfat[\s-]?burn|\bboosts? your energy\b|\bproven\b|\bcure\b|\btreat\b|\bprevent\b|\bperfect blood sugar\b|\bclinical\b/i;
const UI_NOISE = /select headline|affiliate terms|by promoting our products/i;
const INGREDIENT_TOKEN = /^(coleus|african mango|maca|gymnema|guarana|ginseng|eleuthero)$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function excerptSupports(text: string, excerpt: string): boolean {
  const needle = text.slice(0, 48).toLowerCase();
  return Boolean(excerpt) && excerpt.toLowerCase().includes(needle.slice(0, 24));
}

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function triageFactCandidate(input: {
  candidate: FactCandidate;
  acceptedTexts: string[];
  seenKeys?: Set<string>;
  officialHosts?: string[];
}): TriagedFact {
  const text = input.candidate.text.replace(/\s+/g, " ").trim();
  const excerpt = input.candidate.excerpt || text;
  const sourceUrl = sanitizeSharedUrl(input.candidate.sourceUrl || "");
  const host = hostOf(input.candidate.sourceUrl || "");
  const notes: string[] = [];
  const supports = excerptSupports(text, excerpt);
  const seen = input.seenKeys ?? new Set<string>();
  const key = keyOf(text);
  const acceptedMatch = input.acceptedTexts.some((item) => keyOf(item) === key || keyOf(item).includes(key) && key.length > 24);
  const medical = classifyEditorialText({ text, role: "OTHER" }).classification === "MEDICAL_OR_HEALTH_CLAIM" || EFFICACY.test(text);
  const official = (input.officialHosts ?? []).some((item) => host === item || host.endsWith(`.${item}`));
  const clone = UNCERTAIN_HOST.test(host) || (!official && /defen+der/i.test(host));
  const seller = input.candidate.sourceClass === "SELLER" || input.candidate.sourceClass === "AFFILIATE_RESOURCE";

  let triageClass: TriageClass = "INSUFFICIENT_EVIDENCE";
  if (input.candidate.duplicateOf || acceptedMatch || seen.has(key)) triageClass = "DUPLICATE";
  else if (input.candidate.blockReason && /conflict/i.test(input.candidate.blockReason)) triageClass = "CONTRADICTED";
  else if (UI_NOISE.test(text) || INGREDIENT_TOKEN.test(text) || text.length < 8) {
    triageClass = "INSUFFICIENT_EVIDENCE";
    notes.push("Fragment or UI chrome is not a product fact.");
  } else if (medical || input.candidate.blockReason && /medical/i.test(input.candidate.blockReason)) {
    triageClass = "HEALTH_OR_EFFICACY_CLAIM";
  } else if (input.candidate.sourceClass === "INDEPENDENT_INFORMATION" || input.candidate.sourceClass === "SCIENTIFIC_OR_REGULATORY") {
    triageClass = "INDEPENDENTLY_SUPPORTED";
  } else if (seller && official && /pregnant|nursing|under 18|do not exceed|consult|label|refund|return|shipping/i.test(text)) {
    triageClass = "DESCRIPTIVE_LOW_RISK";
  } else if (seller || clone) {
    triageClass = "SELLER_STATED_COMMERCIAL";
    if (clone) notes.push("Source host is identity-uncertain. Seller-stated copy is not independent proof.");
  }

  if (!supports) notes.push("The stored excerpt does not clearly contain the candidate text.");
  if (triageClass === "HEALTH_OR_EFFICACY_CLAIM") notes.push("Health or efficacy language stays blocked without independent evidence.");

  const nextState: TriageState =
    triageClass === "DUPLICATE"
      ? "DUPLICATE_EXISTING_FACT"
      : triageClass === "CONTRADICTED"
        ? "REJECTED_CONTRADICTED"
        : triageClass === "HEALTH_OR_EFFICACY_CLAIM" || triageClass === "INSUFFICIENT_EVIDENCE"
          ? "BLOCKED_UNSUPPORTED"
          : triageClass === "INDEPENDENTLY_SUPPORTED" || triageClass === "DESCRIPTIVE_LOW_RISK"
            ? "ELIGIBLE_FOR_REVIEW"
            : "NEEDS_INDEPENDENT_EVIDENCE";

  seen.add(key);
  return {
    field: input.candidate.field,
    text,
    sourceUrl,
    excerpt: excerpt.slice(0, 280),
    sourceClass: input.candidate.sourceClass,
    excerptSupportsCandidate: supports,
    triageClass,
    nextState,
    editorialRisk: triageClass === "DESCRIPTIVE_LOW_RISK" ? "LOW" : triageClass === "SELLER_STATED_COMMERCIAL" ? "MEDIUM" : "HIGH",
    medicalOrPromotional: medical || triageClass === "HEALTH_OR_EFFICACY_CLAIM",
    notes,
    approvedForUse: false,
  };
}

export function triageFactCandidates(input: {
  candidates: FactCandidate[];
  acceptedTexts: string[];
  officialHosts?: string[];
}): TriagedFact[] {
  const seen = new Set<string>();
  return input.candidates.map((candidate) =>
    triageFactCandidate({ candidate, acceptedTexts: input.acceptedTexts, seenKeys: seen, officialHosts: input.officialHosts }),
  );
}
