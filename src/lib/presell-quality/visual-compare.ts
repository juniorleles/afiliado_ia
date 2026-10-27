import { existsSync, readFileSync } from "node:fs";
import { extractJsonText, JsonExtractError } from "@/lib/ai/parse-ai-json";
import { envLookup, OPENAI_RESPONSES_URL } from "@/lib/lp-generator/ai-copy/config";
import { extractOpenAiResponseText } from "@/lib/lp-generator/ai-copy/provider";
import { paidProviderAllowed } from "@/lib/ai/paid-gate";
import { providerFetch } from "@/lib/ai/resilience";
import {
  estimateOpenAiVisionUsd,
  OPENAI_VISION_MODEL,
  OPENAI_VISION_PROVIDER_ID,
  OPENAI_VISION_TIMEOUT_MS,
} from "@/lib/presell-quality/openai-provider";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION } from "@/lib/presell-quality/types";
import type { PresellScreenshotRef } from "@/lib/presell-quality/input";
import type { VisionCompletion, VisionImage } from "@/lib/presell-quality/provider";

export const VISUAL_COMPARISON_AXES = [
  "visual_hierarchy",
  "typography",
  "proportions",
  "space_distribution",
  "hero_composition",
  "section_organization",
  "visual_density",
  "legibility",
  "mobile_experience",
  "affiliate_transparency",
] as const;

export type VisualComparisonAxisId = (typeof VISUAL_COMPARISON_AXES)[number];

export type VisualComparisonRecommendation = {
  id: string;
  problem: string;
  visualEvidence: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  proposedChange: string;
  probableFile: string;
  expectedImpact: string;
  safetyConstraints: string;
  allowed: boolean;
};

export type VisualComparisonAxis = {
  id: VisualComparisonAxisId;
  observedDifference: string;
  visualEvidence: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
};

export type VisualComparisonResult = {
  axes: VisualComparisonAxis[];
  recommendations: VisualComparisonRecommendation[];
  copyFixtureBlindly: false;
  summary: string;
  model: string;
  promptVersion: string;
  rubricVersion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
};

export const VISUAL_COMPARISON_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["axes", "recommendations", "copyFixtureBlindly", "summary"],
  properties: {
    axes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "observedDifference", "visualEvidence", "severity"],
        properties: {
          id: { type: "string", enum: [...VISUAL_COMPARISON_AXES] },
          observedDifference: { type: "string" },
          visualEvidence: { type: "string" },
          severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        },
      },
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "problem", "visualEvidence", "severity", "proposedChange", "probableFile", "expectedImpact", "safetyConstraints", "allowed"],
        properties: {
          id: { type: "string" },
          problem: { type: "string" },
          visualEvidence: { type: "string" },
          severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          proposedChange: { type: "string" },
          probableFile: { type: "string" },
          expectedImpact: { type: "string" },
          safetyConstraints: { type: "string" },
          allowed: { type: "boolean" },
        },
      },
    },
    copyFixtureBlindly: { type: "boolean" },
    summary: { type: "string" },
  },
} as const;

const AXIS_SET = new Set<string>(VISUAL_COMPARISON_AXES);
const SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

export function buildVisualComparisonPrompt(input: {
  approvedFacts: string[];
  editorialConstraints: string[];
  pageStructure: unknown;
}): { system: string; userText: string } {
  return {
    system: `You compare two affiliate presell pages from screenshots. Rubric ${QUALITY_RUBRIC_VERSION}. Prompt ${QUALITY_PROMPT_VERSION}.
The first pair is an editorial-no-image quality reference. The second pair is the campaign page.
Use the reference as a quality bar, not as a template to clone.

Rules:
1. Name observable pixel differences. Do not write generic advice.
2. Do not invent benefits, testimonials, prices, manufacturer, clinical results, or packshots.
3. Do not recommend promoting ineligible gallery images to the hero.
4. Do not treat a labeled SANDBOX CTA as a live purchase flow.
5. Absence of a packshot is allowed when EDITORIAL_NO_IMAGE is required.
6. Approved facts are the only authorized product claims.
7. Set copyFixtureBlindly=false always.
8. Mark allowed=false for any change that invents facts, changes approved copy, approves assets, publishes, or activates checkout.
9. Return only the requested JSON.`,
    userText: `APPROVED_FACTS=${JSON.stringify(input.approvedFacts)}
EDITORIAL_CONSTRAINTS=${JSON.stringify(input.editorialConstraints)}
CAMPAIGN_STRUCTURE=${JSON.stringify(input.pageStructure).slice(0, 8000)}
Compare these four screenshots in order: reference desktop 1440x900, reference mobile 390x844, campaign desktop 1440x900, campaign mobile 390x844.
Cover every axis: ${VISUAL_COMPARISON_AXES.join(", ")}.`,
  };
}

export function normalizeVisualComparisonPayload(raw: string): Pick<VisualComparisonResult, "axes" | "recommendations" | "copyFixtureBlindly" | "summary"> {
  let parsed: unknown;
  try {
    const { jsonText } = extractJsonText(raw);
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof JsonExtractError || err instanceof Error ? err.message : "invalid JSON";
    throw new Error(`INVALID_JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_JSON: payload is not an object.");
  const rec = parsed as Record<string, unknown>;
  const axes: VisualComparisonAxis[] = [];
  for (const row of Array.isArray(rec.axes) ? rec.axes : []) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || !AXIS_SET.has(item.id)) continue;
    if (typeof item.observedDifference !== "string" || typeof item.visualEvidence !== "string") continue;
    if (typeof item.severity !== "string" || !SEVERITIES.has(item.severity)) continue;
    axes.push({
      id: item.id as VisualComparisonAxisId,
      observedDifference: item.observedDifference,
      visualEvidence: item.visualEvidence,
      severity: item.severity as VisualComparisonAxis["severity"],
    });
  }
  if (!axes.length) throw new Error("INVALID_JSON: axes are required.");
  const recommendations: VisualComparisonRecommendation[] = [];
  for (const row of Array.isArray(rec.recommendations) ? rec.recommendations : []) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.problem !== "string" ||
      typeof item.visualEvidence !== "string" ||
      typeof item.proposedChange !== "string" ||
      typeof item.probableFile !== "string" ||
      typeof item.expectedImpact !== "string" ||
      typeof item.safetyConstraints !== "string" ||
      typeof item.allowed !== "boolean" ||
      typeof item.severity !== "string" ||
      !SEVERITIES.has(item.severity)
    ) {
      throw new Error("INVALID_JSON: recommendation fields are invalid.");
    }
    recommendations.push({
      id: item.id,
      problem: item.problem,
      visualEvidence: item.visualEvidence,
      severity: item.severity as VisualComparisonRecommendation["severity"],
      proposedChange: item.proposedChange,
      probableFile: item.probableFile,
      expectedImpact: item.expectedImpact,
      safetyConstraints: item.safetyConstraints,
      allowed: item.allowed,
    });
  }
  return {
    axes,
    recommendations,
    copyFixtureBlindly: false,
    summary: typeof rec.summary === "string" && rec.summary.trim() ? rec.summary.trim() : "No summary.",
  };
}

function readImage(file: string, reader: (file: string) => Buffer): VisionImage {
  const buf = reader(file);
  const mediaType = file.toLowerCase().endsWith(".jpg") || file.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return { mediaType, base64: buf.toString("base64"), label: file };
}

export async function compareEditorialPages(
  input: {
    referenceDesktop: PresellScreenshotRef;
    referenceMobile: PresellScreenshotRef;
    campaignDesktop: PresellScreenshotRef;
    campaignMobile: PresellScreenshotRef;
    approvedFacts: string[];
    editorialConstraints: string[];
    pageStructure: unknown;
  },
  deps: {
    env?: NodeJS.ProcessEnv;
    complete?: (input: { system: string; userText: string; images: VisionImage[] }) => Promise<VisionCompletion>;
    readFile?: (file: string) => Buffer;
  } = {},
): Promise<VisualComparisonResult> {
  const env = deps.env ?? process.env;
  const paid = paidProviderAllowed(OPENAI_VISION_PROVIDER_ID, env);
  if (!paid.allowed) throw new Error(paid.reason);
  const files = [input.referenceDesktop, input.referenceMobile, input.campaignDesktop, input.campaignMobile];
  const reader = deps.readFile ?? ((file: string) => readFileSync(file));
  for (const shot of files) {
    if (!shot.path || (!deps.readFile && !existsSync(shot.path))) throw new Error("SCREENSHOT_MISSING");
  }
  const prompt = buildVisualComparisonPrompt(input);
  const images = [
    { ...readImage(input.referenceDesktop.path, reader), label: "reference-desktop-1440x900" },
    { ...readImage(input.referenceMobile.path, reader), label: "reference-mobile-390x844" },
    { ...readImage(input.campaignDesktop.path, reader), label: "campaign-desktop-1440x900" },
    { ...readImage(input.campaignMobile.path, reader), label: "campaign-mobile-390x844" },
  ];
  const complete =
    deps.complete ??
    (async (payload) => {
      const apiKey = envLookup("OPENAI_API_KEY", env);
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
      const model = envLookup("AIA_OPENAI_VISION_MODEL", env) || OPENAI_VISION_MODEL;
      const content: Array<Record<string, unknown>> = [{ type: "input_text", text: payload.userText }];
      for (const image of payload.images.slice(0, 4)) {
        content.push({ type: "input_text", text: `Screenshot: ${image.label}` });
        content.push({ type: "input_image", image_url: `data:${image.mediaType};base64,${image.base64}` });
      }
      const response = await providerFetch(
        OPENAI_RESPONSES_URL,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            instructions: payload.system,
            input: [{ role: "user", content }],
            max_output_tokens: 4096,
            text: {
              format: {
                type: "json_schema",
                name: "presell_visual_compare",
                schema: VISUAL_COMPARISON_JSON_SCHEMA,
                strict: true,
              },
            },
          }),
        },
        {
          provider: OPENAI_VISION_PROVIDER_ID,
          model,
          promptId: "presell-quality-visual-compare",
          timeoutMs: OPENAI_VISION_TIMEOUT_MS,
          maxAttempts: 1,
        },
      );
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const data = (await response.json()) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = extractOpenAiResponseText(data);
      if (!text) throw new Error("OpenAI response had no text block.");
      return {
        text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    });
  const completion = await complete({ system: prompt.system, userText: prompt.userText, images });
  const normalized = normalizeVisualComparisonPayload(completion.text);
  return {
    ...normalized,
    copyFixtureBlindly: false,
    model: OPENAI_VISION_MODEL,
    promptVersion: QUALITY_PROMPT_VERSION,
    rubricVersion: QUALITY_RUBRIC_VERSION,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    estimatedUsd: Number(estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens).toFixed(4)),
  };
}
