import { CRITICAL_FAILURE_CODES, QUALITY_DIMENSIONS } from "@/lib/presell-quality/types";

export const MULTIMODAL_QUALITY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dimensionScores", "criticalFailures", "findings", "recommendedActions"],
  properties: {
    dimensionScores: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "score", "rationale", "evidence", "problems", "recommendedActions"],
        properties: {
          dimension: { type: "string", enum: [...QUALITY_DIMENSIONS] },
          score: { type: "integer", minimum: 0, maximum: 100 },
          rationale: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          problems: { type: "array", items: { type: "string" } },
          recommendedActions: { type: "array", items: { type: "string" } },
        },
      },
    },
    criticalFailures: {
      type: "array",
      items: { type: "string", enum: [...CRITICAL_FAILURE_CODES] },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "dimension", "severity", "message", "evidence"],
        properties: {
          id: { type: "string" },
          dimension: { type: "string" },
          severity: { type: "string", enum: ["INFO", "WARNING", "BLOCKING"] },
          message: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
      },
    },
    recommendedActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "action", "allowed", "reason"],
        properties: {
          id: { type: "string" },
          action: { type: "string" },
          allowed: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;
