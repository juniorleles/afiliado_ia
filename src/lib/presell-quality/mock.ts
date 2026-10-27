import { QUALITY_DIMENSIONS, type QualityDimension } from "@/lib/presell-quality/types";
import type { ModelQualityPayload } from "@/lib/presell-quality/input";
import { QUALITY_CALIBRATION_FIXTURES } from "@/lib/presell-quality/fixtures";
import type { MultimodalVisionClient } from "@/lib/presell-quality/provider";
import { MULTIMODAL_PROVIDER_ID } from "@/lib/presell-quality/provider";

function dims(scores: Record<QualityDimension, number>, rationale: string): ModelQualityPayload["dimensionScores"] {
  return QUALITY_DIMENSIONS.map((dimension) => ({
    dimension,
    score: scores[dimension],
    rationale,
    evidence: [`fixture:${dimension}`],
    problems: scores[dimension] < 60 ? [`${dimension} below professional bar`] : [],
    recommendedActions: scores[dimension] < 60 ? [`Improve ${dimension}`] : [],
  }));
}

const HIGH: Record<QualityDimension, number> = {
  DESIGN_HIERARCHY: 90,
  COPY_CLARITY: 88,
  DEPTH_ORGANIZATION: 86,
  IMAGES_COMPOSITION: 90,
  MOBILE_EXPERIENCE: 87,
  TRANSPARENCY_LEGIBILITY: 92,
};

export function mockPayloadForFixture(kind: (typeof QUALITY_CALIBRATION_FIXTURES)[number]["kind"]): ModelQualityPayload {
  if (kind === "VISUALLY_POOR") {
    return {
      dimensionScores: dims({ ...HIGH, DESIGN_HIERARCHY: 28, IMAGES_COMPOSITION: 30 }, "Empty hero and flat gallery."),
      criticalFailures: [],
      findings: [{ id: "empty-hero", dimension: "DESIGN_HIERARCHY", severity: "BLOCKING", message: "Hero has no packshot.", evidence: ["desktop-viewport"] }],
      recommendedActions: [{ id: "confirm-packshot", action: "Place an approved packshot in the hero.", allowed: true, reason: "Image exists in gallery as OTHER." }],
    };
  }
  if (kind === "EDITORIALLY_INSUFFICIENT") {
    return {
      dimensionScores: dims({ ...HIGH, COPY_CLARITY: 32, DEPTH_ORGANIZATION: 24 }, "Only ingredient chips; no description."),
      criticalFailures: ["INSUFFICIENT_EDITORIAL_CONTENT"],
      findings: [{ id: "thin-copy", dimension: "DEPTH_ORGANIZATION", severity: "BLOCKING", message: "Approved facts are not enough for a presell.", evidence: ["copy"] }],
      recommendedActions: [{ id: "no-invent", action: "Do not invent benefits.", allowed: false, reason: "Missing evidence stays absent." }],
    };
  }
  if (kind === "MOBILE_BROKEN") {
    return {
      dimensionScores: dims({ ...HIGH, MOBILE_EXPERIENCE: 18 }, "390px overflow and unreadable type."),
      criticalFailures: ["SEVERE_MOBILE_BREAKAGE"],
      findings: [{ id: "overflow", dimension: "MOBILE_EXPERIENCE", severity: "BLOCKING", message: "Horizontal overflow at 390px.", evidence: ["mobile-viewport"] }],
      recommendedActions: [{ id: "fix-mobile", action: "Repair 390px layout without inventing content.", allowed: true, reason: "Layout-only change." }],
    };
  }
  if (kind === "UNFIT_IMAGE") {
    return {
      dimensionScores: dims({ ...HIGH, IMAGES_COMPOSITION: 22 }, "Promotional banner used as packshot."),
      criticalFailures: ["UNAPPROVED_IMAGE_CONTEXT"],
      findings: [{ id: "banner", dimension: "IMAGES_COMPOSITION", severity: "BLOCKING", message: "Banner is not an approved packshot.", evidence: ["hero"] }],
      recommendedActions: [{ id: "remove-banner", action: "Remove the promotional banner from the hero.", allowed: true, reason: "Context is unapproved." }],
    };
  }
  if (kind === "MISLEADING_CTA") {
    return {
      dimensionScores: dims({ ...HIGH, TRANSPARENCY_LEGIBILITY: 20 }, "Commercial hop shown without authorization."),
      criticalFailures: ["MISLEADING_COMMERCIAL_CTA"],
      findings: [{ id: "cta", dimension: "TRANSPARENCY_LEGIBILITY", severity: "BLOCKING", message: "Purchase CTA without an authorized hop.", evidence: ["cta"] }],
      recommendedActions: [{ id: "sandbox-cta", action: "Keep SANDBOX labeling until hop is authorized.", allowed: true, reason: "Commercial authorization stays blocked." }],
    };
  }
  return {
    dimensionScores: dims(HIGH, "Grounded copy, approved packshot, readable mobile."),
    criticalFailures: [],
    findings: [{ id: "ok", dimension: "DESIGN_HIERARCHY", severity: "INFO", message: "Hero packshot and identity are clear.", evidence: ["desktop-viewport"] }],
    recommendedActions: [],
  };
}

export function mockOpenAiVisionClient(
  payload: ModelQualityPayload | ModelQualityPayload[],
  counter?: { count: number },
  fail?: Error,
): MultimodalVisionClient {
  const payloads = Array.isArray(payload) ? payload : [payload];
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    async complete() {
      if (counter) counter.count += 1;
      if (fail) throw fail;
      const next = payloads[Math.min(counter ? counter.count - 1 : 0, payloads.length - 1)] ?? payloads[0];
      return { text: JSON.stringify(next), inputTokens: 800, outputTokens: 400 };
    },
  };
}

export function mockVisionClient(
  payload: ModelQualityPayload,
  counter?: { count: number },
  fail?: Error,
): MultimodalVisionClient {
  return {
    provider: MULTIMODAL_PROVIDER_ID,
    model: "mock-multimodal-v1",
    async complete() {
      if (counter) counter.count += 1;
      if (fail) throw fail;
      return { text: JSON.stringify(payload), inputTokens: 10, outputTokens: 20 };
    },
  };
}

export function mockPayloadFromScores(score: number, criticalFailures: ModelQualityPayload["criticalFailures"] = []): ModelQualityPayload {
  const clamped = Math.max(0, Math.min(100, score));
  const table = Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [dimension, clamped])) as Record<QualityDimension, number>;
  return {
    dimensionScores: dims(table, `Uniform mock score ${clamped}.`),
    criticalFailures,
    findings: [],
    recommendedActions: [],
  };
}
