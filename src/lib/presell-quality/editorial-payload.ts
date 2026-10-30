import { extractJsonText, JsonExtractError } from "@/lib/ai/parse-ai-json";
import type { ModelQualityPayload } from "@/lib/presell-quality/input";
import { ModelPayloadError, normalizeModelPayload } from "@/lib/presell-quality/normalize";
import { QUALITY_DIMENSIONS } from "@/lib/presell-quality/types";

export const EDITORIAL_PAYLOAD_CODES = [
  "VALID",
  "EMPTY_PAYLOAD",
  "INVALID_JSON",
  "TRUNCATED",
  "MISSING_DIMENSION",
  "DUPLICATE_DIMENSION",
  "UNKNOWN_DIMENSION",
  "SCORE_OUT_OF_RANGE",
  "INVALID_ENUM",
] as const;
export type EditorialPayloadCode = (typeof EDITORIAL_PAYLOAD_CODES)[number];

export type EditorialPayloadClassification =
  | { ok: true; code: "VALID"; payload: ModelQualityPayload; message: string }
  | { ok: false; code: Exclude<EditorialPayloadCode, "VALID">; payload: null; message: string; details: string[] };

const REQUIRED = [...QUALITY_DIMENSIONS];

function duplicateDimensions(rawObject: unknown): string[] {
  if (!rawObject || typeof rawObject !== "object" || Array.isArray(rawObject)) return [];
  const rows = (rawObject as { dimensionScores?: unknown }).dimensionScores;
  if (!Array.isArray(rows)) return [];
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const dimension = (row as { dimension?: unknown }).dimension;
    if (typeof dimension !== "string") continue;
    seen.set(dimension, (seen.get(dimension) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function unknownDimensions(rawObject: unknown): string[] {
  if (!rawObject || typeof rawObject !== "object" || Array.isArray(rawObject)) return [];
  const rows = (rawObject as { dimensionScores?: unknown }).dimensionScores;
  if (!Array.isArray(rows)) return [];
  const allowed = new Set<string>(REQUIRED);
  const out: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const dimension = (row as { dimension?: unknown }).dimension;
    if (typeof dimension === "string" && dimension && !allowed.has(dimension) && !out.includes(dimension)) {
      out.push(dimension);
    }
  }
  return out;
}

export function classifyEditorialPayload(raw: string): EditorialPayloadClassification {
  try {
    const { jsonText } = extractJsonText(raw);
    const parsed = JSON.parse(jsonText) as unknown;
    const duplicates = duplicateDimensions(parsed);
    if (duplicates.length) {
      return {
        ok: false,
        code: "DUPLICATE_DIMENSION",
        payload: null,
        message: `Duplicate dimension ${duplicates[0]}.`,
        details: duplicates,
      };
    }
    const unknown = unknownDimensions(parsed);
    if (unknown.length) {
      return {
        ok: false,
        code: "UNKNOWN_DIMENSION",
        payload: null,
        message: `Unknown dimension ${unknown[0]}.`,
        details: unknown,
      };
    }
    const payload = normalizeModelPayload(raw);
    return { ok: true, code: "VALID", payload, message: "Editorial payload includes every required dimension once." };
  } catch (err) {
    if (err instanceof ModelPayloadError) {
      const details = [err.message];
      if (err.code === "MISSING_DIMENSION" && /Unknown or missing dimension/i.test(err.message)) {
        return { ok: false, code: "UNKNOWN_DIMENSION", payload: null, message: err.message, details };
      }
      const mapped = EDITORIAL_PAYLOAD_CODES.includes(err.code as EditorialPayloadCode)
        ? (err.code as Exclude<EditorialPayloadCode, "VALID">)
        : err.code === "INVALID_JSON"
          ? "INVALID_JSON"
          : "INVALID_JSON";
      return { ok: false, code: mapped, payload: null, message: err.message, details };
    }
    if (err instanceof JsonExtractError) {
      const code = err.kind === "truncated" ? "TRUNCATED" : err.kind === "empty" ? "EMPTY_PAYLOAD" : "INVALID_JSON";
      return { ok: false, code, payload: null, message: err.message, details: [err.kind] };
    }
    return {
      ok: false,
      code: "INVALID_JSON",
      payload: null,
      message: err instanceof Error ? err.message : "Invalid editorial payload.",
      details: [],
    };
  }
}

export function structuredEditorialFailure(input: {
  code: string;
  message: string;
  rawSnippet?: string;
  attempt: number;
}): {
  valid: false;
  invented: false;
  filledMissingDimensions: false;
  copiedPreviousScore: false;
  code: string;
  message: string;
  attempt: number;
  rawSnippet: string | null;
} {
  return {
    valid: false,
    invented: false,
    filledMissingDimensions: false,
    copiedPreviousScore: false,
    code: input.code,
    message: input.message,
    attempt: input.attempt,
    rawSnippet: input.rawSnippet ? input.rawSnippet.slice(0, 400) : null,
  };
}
