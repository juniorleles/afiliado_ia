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

export function normalizeModelPayload(raw: string): ModelQualityPayload {
  let parsed: unknown;
  try {
    const { jsonText } = extractJsonText(raw);
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof JsonExtractError || err instanceof Error ? err.message : "invalid JSON";
    throw new ModelPayloadError("INVALID_JSON", message);
  }
  if (!parsed || typeof parsed !== "object") throw new ModelPayloadError("INVALID_JSON", "Payload is not an object.");
  const rec = parsed as Record<string, unknown>;
  if (!Array.isArray(rec.dimensionScores)) throw new ModelPayloadError("MISSING_DIMENSION", "dimensionScores is required.");

  const seen = new Set<string>();
  const dimensionScores: ModelQualityPayload["dimensionScores"] = [];
  for (const row of rec.dimensionScores) {
    if (!row || typeof row !== "object") throw new ModelPayloadError("INVALID_JSON", "Dimension row is not an object.");
    const item = row as Record<string, unknown>;
    const dimension = item.dimension;
    if (typeof dimension !== "string" || !DIMENSIONS.has(dimension)) {
      throw new ModelPayloadError("MISSING_DIMENSION", `Unknown or missing dimension: ${String(dimension)}`);
    }
    if (seen.has(dimension)) throw new ModelPayloadError("MISSING_DIMENSION", `Duplicate dimension ${dimension}.`);
    seen.add(dimension);
    if (typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 0 || item.score > 100) {
      throw new ModelPayloadError("SCORE_OUT_OF_RANGE", `Score for ${dimension} is not 0-100.`);
    }
    if (typeof item.rationale !== "string" || !item.rationale.trim()) {
      throw new ModelPayloadError("INVALID_JSON", `Rationale missing for ${dimension}.`);
    }
    dimensionScores.push({
      dimension: dimension as QualityDimension,
      score: Math.round(item.score),
      rationale: item.rationale.trim(),
      evidence: asStringArray(item.evidence),
      problems: asStringArray(item.problems),
      recommendedActions: asStringArray(item.recommendedActions),
    });
  }
  for (const required of QUALITY_DIMENSIONS) {
    if (!seen.has(required)) throw new ModelPayloadError("MISSING_DIMENSION", `Missing dimension ${required}.`);
  }

  const criticalFailures: CriticalFailureCode[] = [];
  if (!Array.isArray(rec.criticalFailures)) throw new ModelPayloadError("INVALID_JSON", "criticalFailures is required.");
  for (const code of rec.criticalFailures) {
    if (typeof code !== "string" || !CRITICALS.has(code)) {
      throw new ModelPayloadError("INVALID_ENUM", `Unknown critical failure ${String(code)}.`);
    }
    if (!criticalFailures.includes(code as CriticalFailureCode)) criticalFailures.push(code as CriticalFailureCode);
  }

  const findings: ModelQualityPayload["findings"] = [];
  if (!Array.isArray(rec.findings)) throw new ModelPayloadError("INVALID_JSON", "findings is required.");
  for (const row of rec.findings) {
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
  if (!Array.isArray(rec.recommendedActions)) throw new ModelPayloadError("INVALID_JSON", "recommendedActions is required.");
  for (const row of rec.recommendedActions) {
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
