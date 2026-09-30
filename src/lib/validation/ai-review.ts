import { extractJsonText, JsonExtractError } from "@/lib/ai/parse-ai-json";
import { providerFetch } from "@/lib/ai/resilience";
import { VISUAL_QA_MODEL } from "@/lib/visual-qa/multimodal";
import type { ScreenshotPayload } from "@/lib/visual-qa/multimodal";
import { VISUAL_QA_ACTION_CODES } from "@/lib/visual-qa/types";
import type {
  AiDimensionFinding,
  AiReviewDimensionId,
  AiReviewVerdict,
  CrossPageAiReview,
  IndividualAiVisualReview,
  StructureFingerprint,
} from "@/lib/validation/types";
import { AI_REVIEW_DIMENSIONS } from "@/lib/validation/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CONVERSION_LANGUAGE =
  /convert(?:s|ing)? better|sell more|will convert|conversion potential|% conversion|higher conversion/i;

export const INDIVIDUAL_AI_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: AI_REVIEW_DIMENSIONS,
  properties: Object.fromEntries(
    AI_REVIEW_DIMENSIONS.map((dim) => [
      dim,
      {
        type: "object",
        additionalProperties: false,
        required: ["verdict", "reason", "evidence", "recommended_action_code"],
        properties: {
          verdict: { type: "string", enum: ["PASS", "REVIEW_REQUIRED"] },
          reason: { type: "string" },
          evidence: { type: "string" },
          recommended_action_code: { type: "string" },
        },
      },
    ]),
  ),
} as const;

export const CROSS_PAGE_AI_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["DIVERSITY_REVIEW", "repeatedPatterns", "reason", "evidence"],
  properties: {
    DIVERSITY_REVIEW: { type: "string", enum: ["PASS", "REVIEW_REQUIRED"] },
    repeatedPatterns: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
    evidence: { type: "string" },
  },
} as const;

export const INDIVIDUAL_REVIEW_SYSTEM = `You are a human-like visual reviewer of affiliate presell landing pages.
You inspect REAL RENDERED SCREENSHOTS (desktop 1440 and mobile 390), not HTML, DOM, CSS, or DesignPlan names.

Evaluate each dimension independently:
VISUAL_HIERARCHY, PRODUCT_PROMINENCE, TYPOGRAPHY, CONTENT_DENSITY, CTA_CLARITY, SECTION_RHYTHM, MOBILE_COMPOSITION, DESKTOP_COMPOSITION, PREMIUM_APPEARANCE.

Each dimension returns PASS or REVIEW_REQUIRED plus reason, evidence, recommended_action_code.
Use presentation action codes such as IMPROVE_TYPE_SCALE, PROMOTE_PRODUCT_VISUAL, REDUCE_VISIBLE_CONTENT_DENSITY, IMPROVE_CTA_DISTRIBUTION, IMPROVE_MOBILE_COMPOSITION, STRENGTHEN_ART_DIRECTION, CREATE_HERO_FOCAL_POINT, COLLAPSE_SECONDARY_DETAILS.

Do NOT invent a numeric beauty score.
Do NOT use beauty scores as an approval gate.
Do NOT claim the page will convert better, sell more, or has conversion potential.
Visual review is not conversion evidence. Identify usability and presentation problems only.
Do NOT rewrite product facts.`;

export const CROSS_PAGE_REVIEW_SYSTEM = `You compare multiple generated presell landing pages.
Ask: do these pages appear meaningfully art-directed for their products, or do they look like variants of one underlying template?

Evaluate repeated hero composition, visual rhythm, section order, CTA positioning, decorative language, product placement, typography treatment.

Return DIVERSITY_REVIEW = PASS or REVIEW_REQUIRED and concrete repeated patterns.
Do NOT rank products commercially.
Do NOT predict conversion.
Do NOT claim one page will convert better.`;

export function screenshotInputsReady(shots: ScreenshotPayload[]): {
  desktop: boolean;
  mobile: boolean;
} {
  const labels = shots.map((shot) => shot.label.toLowerCase());
  return {
    desktop: labels.some((label) => label.includes("desktop") || label.includes("1440")),
    mobile: labels.some((label) => label.includes("mobile") || label.includes("390")),
  };
}

export function containsConversionJudgment(text: string): boolean {
  return CONVERSION_LANGUAGE.test(text);
}

export function sanitizeReviewText(text: string): string {
  if (!containsConversionJudgment(text)) return text.trim();
  return text
    .replace(CONVERSION_LANGUAGE, "[conversion claim removed]")
    .trim();
}

export function parseIndividualAiReview(raw: string, shots: ScreenshotPayload[]): IndividualAiVisualReview {
  const ready = screenshotInputsReady(shots);
  const { jsonText } = extractJsonText(raw);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const dimensions: AiDimensionFinding[] = [];
  for (const dimension of AI_REVIEW_DIMENSIONS) {
    const rec = parsed[dimension];
    if (!rec || typeof rec !== "object") continue;
    const row = rec as Record<string, unknown>;
    const verdict = row.verdict === "PASS" || row.verdict === "REVIEW_REQUIRED" ? row.verdict : "REVIEW_REQUIRED";
    dimensions.push({
      dimension: dimension as AiReviewDimensionId,
      verdict,
      reason: sanitizeReviewText(typeof row.reason === "string" ? row.reason : ""),
      evidence: sanitizeReviewText(typeof row.evidence === "string" ? row.evidence : ""),
      recommended_action_code:
        typeof row.recommended_action_code === "string" && VISUAL_QA_ACTION_CODES.includes(row.recommended_action_code as never)
          ? row.recommended_action_code
          : "STRENGTHEN_ART_DIRECTION",
    });
  }
  const reviewRequired = dimensions.some((item) => item.verdict === "REVIEW_REQUIRED");
  return {
    state: "OK",
    overall: dimensions.length === 0 ? "REVIEW_REQUIRED" : reviewRequired ? "REVIEW_REQUIRED" : "PASS",
    dimensions,
    usedDesktopScreenshot: ready.desktop,
    usedMobileScreenshot: ready.mobile,
  };
}

export function parseCrossPageAiReview(raw: string): CrossPageAiReview {
  const { jsonText } = extractJsonText(raw);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const verdict: AiReviewVerdict =
    parsed.DIVERSITY_REVIEW === "PASS" || parsed.DIVERSITY_REVIEW === "REVIEW_REQUIRED"
      ? parsed.DIVERSITY_REVIEW
      : "REVIEW_REQUIRED";
  const patterns = Array.isArray(parsed.repeatedPatterns)
    ? parsed.repeatedPatterns.filter((item): item is string => typeof item === "string")
    : [];
  return {
    state: "OK",
    DIVERSITY_REVIEW: verdict,
    repeatedPatterns: patterns.map(sanitizeReviewText),
    reason: sanitizeReviewText(typeof parsed.reason === "string" ? parsed.reason : ""),
    evidence: sanitizeReviewText(typeof parsed.evidence === "string" ? parsed.evidence : ""),
  };
}

export async function runIndividualAiVisualReview(input: {
  screenshots: ScreenshotPayload[];
  template: string;
  productName: string;
  approach: string;
}): Promise<IndividualAiVisualReview> {
  const ready = screenshotInputsReady(input.screenshots);
  if (!ready.desktop || !ready.mobile || input.screenshots.length === 0) {
    return {
      state: "UNAVAILABLE",
      overall: "UNAVAILABLE",
      dimensions: [],
      rawError: "Desktop 1440 and mobile 390 screenshots are required",
      usedDesktopScreenshot: ready.desktop,
      usedMobileScreenshot: ready.mobile,
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      state: "UNAVAILABLE",
      overall: "UNAVAILABLE",
      dimensions: [],
      rawError: "ANTHROPIC_API_KEY missing",
      usedDesktopScreenshot: ready.desktop,
      usedMobileScreenshot: ready.mobile,
    };
  }
  const userText = `PRODUCT=${input.productName}
APPROACH=${input.approach}
TEMPLATE=${input.template}
Inspect the attached DESKTOP 1440 and MOBILE 390 screenshots of the rendered page.
Do not infer from component names.`;
  try {
    const text = await callAnthropic(apiKey, INDIVIDUAL_REVIEW_SYSTEM, userText, input.screenshots, INDIVIDUAL_AI_REVIEW_SCHEMA);
    try {
      return parseIndividualAiReview(text, input.screenshots);
    } catch (err) {
      if (err instanceof JsonExtractError) {
        return {
          state: "PARSE_FAILED",
          overall: "UNAVAILABLE",
          dimensions: [],
          rawError: err.message,
          usedDesktopScreenshot: true,
          usedMobileScreenshot: true,
        };
      }
      throw err;
    }
  } catch (err) {
    return {
      state: "UNAVAILABLE",
      overall: "UNAVAILABLE",
      dimensions: [],
      rawError: err instanceof Error ? err.message : "individual AI review failed",
      usedDesktopScreenshot: true,
      usedMobileScreenshot: true,
    };
  }
}

export async function runCrossPageAiReview(input: {
  fingerprints: Array<{ productName: string; approach: string; fingerprint: StructureFingerprint }>;
  screenshots: ScreenshotPayload[];
}): Promise<CrossPageAiReview> {
  if (input.fingerprints.length < 2) {
    return {
      state: "SKIPPED",
      DIVERSITY_REVIEW: "UNAVAILABLE",
      repeatedPatterns: [],
      reason: "Need at least two candidates to compare.",
      evidence: "fingerprints.length<2",
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      state: "UNAVAILABLE",
      DIVERSITY_REVIEW: "UNAVAILABLE",
      repeatedPatterns: [],
      reason: "ANTHROPIC_API_KEY missing",
      evidence: "",
      rawError: "ANTHROPIC_API_KEY missing",
    };
  }
  const userText = `FINGERPRINTS=${JSON.stringify(
    input.fingerprints.map((item) => ({
      ...item.fingerprint,
      productName: item.productName,
      approach: item.approach,
    })),
  )}
Screenshots of representative pages follow. Compare structure and art direction, not commercial rank.`;
  try {
    const text = await callAnthropic(apiKey, CROSS_PAGE_REVIEW_SYSTEM, userText, input.screenshots.slice(0, 8), CROSS_PAGE_AI_REVIEW_SCHEMA);
    try {
      return parseCrossPageAiReview(text);
    } catch (err) {
      if (err instanceof JsonExtractError) {
        return {
          state: "PARSE_FAILED",
          DIVERSITY_REVIEW: "UNAVAILABLE",
          repeatedPatterns: [],
          reason: err.message,
          evidence: "",
          rawError: err.message,
        };
      }
      throw err;
    }
  } catch (err) {
    return {
      state: "UNAVAILABLE",
      DIVERSITY_REVIEW: "UNAVAILABLE",
      repeatedPatterns: [],
      reason: err instanceof Error ? err.message : "cross-page review failed",
      evidence: "",
      rawError: err instanceof Error ? err.message : "cross-page review failed",
    };
  }
}

async function callAnthropic(
  apiKey: string,
  system: string,
  userText: string,
  screenshots: ScreenshotPayload[],
  schema: unknown,
  structured = true,
): Promise<string> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
  for (const shot of screenshots) {
    content.push({ type: "text", text: `Screenshot: ${shot.label}` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: shot.mediaType, data: shot.base64 },
    });
  }
  const body: Record<string, unknown> = {
    model: VISUAL_QA_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content }],
  };
  if (structured) {
    body.output_config = {
      format: { type: "json_schema", schema },
    };
  }
  const response = await providerFetch(
    ANTHROPIC_API_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    { provider: "anthropic", model: VISUAL_QA_MODEL, promptId: "ai-review" },
  );
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    if (structured && (response.status === 400 || response.status === 422)) {
      return callAnthropic(apiKey, system, userText, screenshots, schema, false);
    }
    throw new Error(`Anthropic API ${response.status}: ${errorBody.slice(0, 300)}`);
  }
  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) throw new Error("Anthropic response missing text");
  return textBlock.text;
}
