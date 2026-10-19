import type { CopyScores, EvidenceUse, SectionGeneration, SectionId } from "@/lib/section-generation/types";

export function clip(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function fingerprint(value: unknown): string {
  const body = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < body.length; index += 1) hash = (Math.imul(hash, 33) + body.charCodeAt(index)) >>> 0;
  return hash.toString(16);
}

export function confidenceFrom(evidence: EvidenceUse[], marketConfidence: number | null): number {
  if (evidence.length === 0) return 0;
  const facts = evidence.filter((item) => item.origin === "ProductFacts").length;
  const ratio = facts / evidence.length;
  const marketCap = Math.min(marketConfidence ?? 0.35, 0.55);
  return Math.round((ratio * 0.85 + (1 - ratio) * marketCap) * 100) / 100;
}

const BANNED_COPY = /\b(cure|miracle|guaranteed results|buy now|clinically proven|studies show|study shows)\b/i;

export function riskySentences(prose: string): string[] {
  return prose
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && BANNED_COPY.test(sentence) && !/not intended to diagnose/i.test(sentence));
}

export function scoreCopy(input: {
  prose: string;
  evidence: EvidenceUse[];
  marketConfidence: number | null;
  slotsFilled: number;
  slots: number;
}): CopyScores {
  const prose = input.prose.trim();
  if (!prose || input.evidence.length === 0) {
    return { copyScore: 0, readability: 0, evidenceScore: 0, persuasionScore: 0, complianceScore: 0 };
  }
  const evidenceScore = confidenceFrom(input.evidence, input.marketConfidence);
  const sentences = prose.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  const words = prose.split(/\s+/).filter(Boolean);
  const average = sentences.length > 0 ? words.length / sentences.length : words.length;
  const readability = Math.round(Math.max(0, Math.min(1, 1 - Math.max(0, average - 18) / 28)) * 100) / 100;
  const filled = Math.max(0, Math.min(1, input.slotsFilled / Math.max(1, input.slots)));
  const persuasionScore = Math.round(filled * evidenceScore * 100) / 100;
  const complianceScore = riskySentences(prose).length > 0 ? 0.15 : 1;
  const copyScore = Math.round(((evidenceScore + readability + persuasionScore + complianceScore) / 4) * 100) / 100;
  return { copyScore, readability, evidenceScore, persuasionScore, complianceScore };
}

export function generated(
  sectionId: SectionId,
  content: Record<string, unknown>,
  evidence: EvidenceUse[],
  reasoning: string[],
  warnings: string[],
  marketConfidence: number | null,
  quality: { prose: string; slotsFilled: number; slots: number },
  confidence = confidenceFrom(evidence, marketConfidence),
): Omit<SectionGeneration, "generationTime" | "cached" | "inputFingerprint"> {
  return {
    sectionId,
    generatedContent: content,
    reasoning,
    evidenceUsed: evidence,
    confidence,
    warnings,
    scores: scoreCopy({ prose: quality.prose, evidence, marketConfidence, slotsFilled: quality.slotsFilled, slots: quality.slots }),
    status: "GENERATED",
  };
}

export function factAnswer(
  question: string,
  facts: { guarantee?: string; ingredients: string[]; cautions: string[] },
): { field: string; text: string } | null {
  const guarantee = facts.guarantee?.trim() ?? "";
  if (/\b(guarantee|money-back|refund|warranty)\b/i.test(question) && guarantee) {
    return { field: "guaranteeInformation", text: clip(guarantee, 280) };
  }
  if (/\bingredient/i.test(question) && facts.ingredients.length > 0) {
    return { field: "ingredientsOrComponents", text: facts.ingredients.map((item) => clip(item)).join("; ") };
  }
  if (/\b(side effect|caution|warning)\b/i.test(question) && facts.cautions.length > 0) {
    return { field: "cautions", text: facts.cautions.map((item) => clip(item)).join("; ") };
  }
  return null;
}

export function failed(
  sectionId: SectionId,
  warnings: string[],
  reasoning: string[],
): Omit<SectionGeneration, "generationTime" | "cached" | "inputFingerprint"> {
  return {
    sectionId,
    generatedContent: null,
    reasoning,
    evidenceUsed: [],
    confidence: 0,
    warnings,
    scores: { copyScore: 0, readability: 0, evidenceScore: 0, persuasionScore: 0, complianceScore: 0 },
    status: "FAILED",
  };
}
