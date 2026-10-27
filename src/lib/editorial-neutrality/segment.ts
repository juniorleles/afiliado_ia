import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";
import type { NeutralityClass, NeutralityRole } from "@/lib/editorial-neutrality/types";

const PROMO_CLAUSE =
  /\b(enjoy amazing results|amazing results|you will love(?: the results)?|feel the difference|see the results|transform your|life[- ]changing)\b/i;

export type EditorialSegment = {
  text: string;
  classification: NeutralityClass;
  kept: boolean;
};

export type RecoveredEditorial = {
  originalText: string;
  recoveredText: string;
  omitted: EditorialSegment[];
  kept: EditorialSegment[];
};

function splitUnits(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const clauses = normalized
    .split(/(?<=[.!?])\s+|\s+and\s+(?=(?:enjoy|love|feel|see the|experience amazing))/i)
    .map((item) => item.replace(/^and\s+/i, "").trim())
    .filter(Boolean);
  return clauses.length ? clauses : [normalized];
}

export function recoverOperationalSegments(input: {
  text: string;
  role?: NeutralityRole;
}): RecoveredEditorial {
  const originalText = input.text.replace(/\s+/g, " ").trim();
  const role = input.role ?? "OTHER";
  const kept: EditorialSegment[] = [];
  const omitted: EditorialSegment[] = [];
  for (const unit of splitUnits(originalText)) {
    const classified = classifyEditorialText({ text: unit, role });
    const promo = PROMO_CLAUSE.test(unit);
    const medical = classified.classification === "MEDICAL_OR_HEALTH_CLAIM";
    const keep =
      !promo &&
      !medical &&
      (classified.classification === "NEUTRAL_INFORMATION" ||
        classified.classification === "SELLER_STATED_FACT");
    const row = { text: unit.replace(/[.]+$/, ".").replace(/\s+\.$/, "."), classification: classified.classification, kept: keep };
    if (keep) kept.push(row);
    else omitted.push({ ...row, kept: false });
  }
  return {
    originalText,
    recoveredText: kept.map((item) => item.text.replace(/\s+$/, "")).join(" ").replace(/\s+/g, " ").trim(),
    omitted,
    kept,
  };
}
