import { extractJsonText, JsonExtractError } from "@/lib/ai/parse-ai-json";
import type { ModelQualityPayload } from "@/lib/presell-quality/input";
import {
  CRITICAL_FAILURE_CODES,
  QUALITY_DIMENSIONS,
  type CriticalFailureCode,
  type QualityDimension,
} from "@/lib/presell-quality/types";

export class ModelPayloadError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ModelPayloadError";
    this.code = code;
  }
}

const DIMENSIONS = new Set<string>(QUALITY_DIMENSIONS);
const CRITICALS = new Set<string>(CRITICAL_FAILURE_CODES);
const SEVERITIES = new Set(["INFO", "WARNING", "BLOCKING"]);

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function coerceScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function coerceDimensionRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([dimension, row]) => {
      if (row && typeof row === "object") return { dimension, ...(row as Record<string, unknown>) };
      return { dimension, score: row, rationale: "Score map." };
    });
  }
  return [];
}

export function normalizeModelPayload(raw: string): ModelQualityPayload {
  let parsed: unknown;
  try {
    const { jsonText } = extractJsonText(raw);
    parsed = JSON.parse(jsonText);
  } catch (err) {
    if (err instanceof JsonExtractError && err.kind === "truncated") {
      throw new ModelPayloadError("TRUNCATED", err.message);
    }
    if (err instanceof JsonExtractError && err.kind === "empty") {
      throw new ModelPayloadError("EMPTY_PAYLOAD", err.message);
    }
    const message = err instanceof JsonExtractError || err instanceof Error ? err.message : "invalid JSON";
    throw new ModelPayloadError("INVALID_JSON", message);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ModelPayloadError("INVALID_JSON", "Payload is not an object.");
  const rec = parsed as Record<string, unknown>;
  const rows = coerceDimensionRows(rec.dimensionScores);
  if (!rows.length) throw new ModelPayloadError("MISSING_DIMENSION", "dimensionScores is required.");

  const seen = new Set<string>();
  const dimensionScores: ModelQualityPayload["dimensionScores"] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") throw new ModelPayloadError("INVALID_JSON", "Dimension row is not an object.");
    const item = row as Record<string, unknown>;
    const dimension = item.dimension;
    if (typeof dimension !== "string" || !DIMENSIONS.has(dimension)) {
      throw new ModelPayloadError("MISSING_DIMENSION", `Unknown or missing dimension: ${String(dimension)}`);
    }
    if (seen.has(dimension)) continue;
    seen.add(dimension);
    const score = coerceScore(item.score);
    if (score === null || score < 0 || score > 100) {
      throw new ModelPayloadError("SCORE_OUT_OF_RANGE", `Score for ${dimension} is not 0-100.`);
    }
    const rationale = typeof item.rationale === "string" && item.rationale.trim() ? item.rationale.trim() : "No rationale provided.";
    dimensionScores.push({
      dimension: dimension as QualityDimension,
      score: Math.round(score),
      rationale,
      evidence: asStringArray(item.evidence),
      problems: asStringArray(item.problems),
      recommendedActions: asStringArray(item.recommendedActions),
    });
  }
  for (const required of QUALITY_DIMENSIONS) {
    if (!seen.has(required)) throw new ModelPayloadError("MISSING_DIMENSION", `Missing dimension ${required}.`);
  }

  const criticalFailures: CriticalFailureCode[] = [];
  if (rec.criticalFailures !== undefined && !Array.isArray(rec.criticalFailures)) {
    throw new ModelPayloadError("INVALID_JSON", "criticalFailures is required.");
  }
  const criticalList = Array.isArray(rec.criticalFailures) ? rec.criticalFailures : [];
  for (const code of criticalList) {
    if (typeof code !== "string" || !CRITICALS.has(code)) {
      throw new ModelPayloadError("INVALID_ENUM", `Unknown critical failure ${String(code)}.`);
    }
    if (!criticalFailures.includes(code as CriticalFailureCode)) criticalFailures.push(code as CriticalFailureCode);
  }

  const findings: ModelQualityPayload["findings"] = [];
  const findingRows = Array.isArray(rec.findings) ? rec.findings : [];
  if (rec.findings !== undefined && !Array.isArray(rec.findings)) {
    throw new ModelPayloadError("INVALID_JSON", "findings is required.");
  }
  for (const row of findingRows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const dimension = item.dimension;
    const severity = item.severity;
    if (typeof item.id !== "string" || typeof item.message !== "string") {
      throw new ModelPayloadError("INVALID_JSON", "Finding is missing id or message.");
    }
    if (typeof severity !== "string" || !SEVERITIES.has(severity)) {
      throw new ModelPayloadError("INVALID_ENUM", "Finding severity is invalid.");
    }
    if (dimension !== "CRITICAL" && (typeof dimension !== "string" || !DIMENSIONS.has(dimension))) {
      throw new ModelPayloadError("INVALID_ENUM", "Finding dimension is invalid.");
    }
    findings.push({
      id: item.id,
      dimension: dimension as ModelQualityPayload["findings"][number]["dimension"],
      severity: severity as "INFO" | "WARNING" | "BLOCKING",
      message: item.message,
      evidence: asStringArray(item.evidence),
    });
  }

  const recommendedActions: ModelQualityPayload["recommendedActions"] = [];
  const actionRows = Array.isArray(rec.recommendedActions) ? rec.recommendedActions : [];
  if (rec.recommendedActions !== undefined && !Array.isArray(rec.recommendedActions)) {
    throw new ModelPayloadError("INVALID_JSON", "recommendedActions is required.");
  }
  for (const row of actionRows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.action !== "string" || typeof item.reason !== "string" || typeof item.allowed !== "boolean") {
      throw new ModelPayloadError("INVALID_JSON", "recommendedAction fields are invalid.");
    }
    recommendedActions.push({
      id: item.id,
      action: item.action,
      allowed: item.allowed,
      reason: item.reason,
    });
  }

  return { dimensionScores, criticalFailures, findings, recommendedActions };
}

export function screenshotAssociationError(input: {
  generationId: string;
  desktop: { generationId: string; sha256: string; path: string } | null;
  mobile: { generationId: string; sha256: string; path: string } | null;
}): { code: string; message: string } | null {
  if (!input.desktop || !input.mobile) {
    return { code: "SCREENSHOT_MISSING", message: "Desktop and mobile screenshots are required." };
  }
  if (!input.desktop.sha256 || !input.mobile.sha256) {
    return { code: "SCREENSHOT_MISSING", message: "Screenshot hashes are required." };
  }
  if (input.desktop.generationId !== input.generationId || input.mobile.generationId !== input.generationId) {
    return { code: "SCREENSHOT_GENERATION_MISMATCH", message: "Screenshots are not bound to this generation." };
  }
  return null;
}

export function bindScreenshotsToGeneration<T extends { generationId: string }>(
  shots: { desktop: T | null; mobile: T | null },
  generationId: string,
): { desktop: T | null; mobile: T | null } {
  return {
    desktop: shots.desktop ? { ...shots.desktop, generationId } : null,
    mobile: shots.mobile ? { ...shots.mobile, generationId } : null,
  };
}

export function rubricVersionsComparable(first?: string | null, second?: string | null): boolean {
  return Boolean(first && second && first === second);
}
