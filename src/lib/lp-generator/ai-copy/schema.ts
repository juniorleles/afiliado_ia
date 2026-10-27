import type { AiCommercialCopyDraft } from "@/lib/lp-generator/ai-copy/types";
import { AI_COMMERCIAL_COPY_VERSION } from "@/lib/lp-generator/ai-copy/types";

export const AI_COMMERCIAL_COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "introduction", "sectionHeadlines", "features", "benefitExplanations", "faq"],
  properties: {
    headline: { type: "string", minLength: 2, maxLength: 90 },
    subheadline: { type: "string", maxLength: 140 },
    introduction: { type: "string", minLength: 2, maxLength: 400 },
    sectionHeadlines: {
      type: "object",
      additionalProperties: { type: "string", maxLength: 80 },
    },
    features: { type: "array", items: { type: "string", maxLength: 180 } },
    benefitExplanations: { type: "array", items: { type: "string", maxLength: 220 } },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string", maxLength: 140 },
          answer: { type: "string", maxLength: 280 },
        },
      },
    },
    ctaMicrocopy: { type: "string", maxLength: 80 },
    transitions: { type: "array", items: { type: "string", maxLength: 160 } },
  },
} as const;

export function parseAiCommercialCopy(raw: unknown): { ok: true; draft: AiCommercialCopyDraft } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "AI response is not an object." };
  const value = raw as Record<string, unknown>;
  const headline = asString(value.headline);
  const introduction = asString(value.introduction);
  if (!headline || !introduction) return { ok: false, error: "headline and introduction are required." };
  const sectionHeadlines = asStringMap(value.sectionHeadlines);
  const features = asStringList(value.features);
  const benefitExplanations = asStringList(value.benefitExplanations);
  const faq = asFaq(value.faq);
  if (!sectionHeadlines || !features || !benefitExplanations || !faq) {
    return { ok: false, error: "AI response failed the commercial copy schema." };
  }
  return {
    ok: true,
    draft: {
      version: AI_COMMERCIAL_COPY_VERSION,
      headline,
      subheadline: asString(value.subheadline) || undefined,
      introduction,
      sectionHeadlines,
      features,
      benefitExplanations,
      faq,
      ctaMicrocopy: asString(value.ctaMicrocopy) || undefined,
      transitions: asStringList(value.transitions) ?? undefined,
    },
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function asStringList(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  return value.map(asString).filter(Boolean);
}

function asStringMap(value: unknown): Record<string, string> | null {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    const text = asString(item);
    if (text) out[key] = text;
  }
  return out;
}

function asFaq(value: unknown): Array<{ question: string; answer: string }> | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const out: Array<{ question: string; answer: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const question = asString((item as { question?: unknown }).question);
    const answer = asString((item as { answer?: unknown }).answer);
    if (!question || !answer) return null;
    out.push({ question, answer });
  }
  return out;
}
