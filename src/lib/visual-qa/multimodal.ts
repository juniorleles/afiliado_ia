import { extractJsonText, JsonExtractError } from "@/lib/ai/parse-ai-json";
import {
  isVisualQaActionCode,
  isFindingSeverity,
  type LayoutSnapshot,
  type VisualQaActionCode,
  type VisualQaFinding,
  TARGET_VISUAL_STANDARD,
} from "@/lib/visual-qa/types";
import type { AiVisualReviewState } from "@/lib/visual-qa/gate";

export const VISUAL_QA_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export const VISUAL_QA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "severity",
          "viewport",
          "description",
          "evidence",
          "suggestedPresentationFix",
          "actionCode",
        ],
        properties: {
          category: {
            type: "string",
            enum: [
              "layout",
              "hero",
              "hierarchy",
              "productPresentation",
              "contentDensity",
              "imagery",
              "artDirection",
              "cta",
              "trust",
              "progressiveDisclosure",
              "mobile",
              "desktop",
              "accessibility",
              "performance",
            ],
          },
          severity: { type: "string", enum: ["INFO", "WARNING", "HIGH"] },
          viewport: { type: "string" },
          description: { type: "string" },
          evidence: { type: "string" },
          suggestedPresentationFix: { type: "string" },
          actionCode: {
            type: "string",
            enum: [
              "REDUCE_VISIBLE_CONTENT_DENSITY",
              "PROMOTE_PRODUCT_VISUAL",
              "CREATE_HERO_FOCAL_POINT",
              "COLLAPSE_SECONDARY_DETAILS",
              "INCREASE_SECTION_VARIATION",
              "IMPROVE_TYPE_SCALE",
              "REDUCE_CARD_REPETITION",
              "IMPROVE_CTA_DISTRIBUTION",
              "ADD_VISUAL_ASSET_SLOT",
              "IMPROVE_MOBILE_COMPOSITION",
              "ACQUIRE_PRODUCT_IMAGE",
              "IMPROVE_PROGRESSIVE_DISCLOSURE",
              "STRENGTHEN_ART_DIRECTION",
              "REMOVE_FAKE_TRUST_SIGNAL",
            ],
          },
        },
      },
    },
  },
} as const;

export type ScreenshotPayload = {
  mediaType: "image/jpeg";
  base64: string;
  label: string;
};

export type MultimodalReviewResult = {
  state: AiVisualReviewState;
  findings: VisualQaFinding[];
  rawError?: string;
};

function templateExpectations(template: string): string {
  const key = template.toUpperCase();
  if (key === "BUYER_GUIDE") {
    return "Template BUYER_GUIDE: expect product + decision-support presentation, not a generic ecommerce splash.";
  }
  if (key === "EDITORIAL") {
    return "Template EDITORIAL: expect publication/wellness editorial feel, not a hard-sell product grid.";
  }
  return "Template REVIEW: expect editorial/product evaluation feel.";
}

export function buildVisualReviewPrompt(input: {
  template: string;
  snapshots: LayoutSnapshot[];
}): { system: string; userText: string } {
  const system = `You are a visual/UX reviewer for affiliate presell pages.
Target standard: ${TARGET_VISUAL_STANDARD}.
This is a quality bar for modern international-market product/editorial pages. Do not copy any third-party site.

Distinguish TECHNICALLY FUNCTIONAL from VISUALLY READY.
A page with no overflow can still fail visual QA.

Evaluate: first attention, headline dominance, product identifiability, CTA discoverability, fact priority, section hierarchy, visual flatness, component repetition, visual rhythm, hero composition, product imagery (placeholder vs packshot), art direction, CTA hierarchy, trust/transparency visibility, progressive disclosure of secondary detail, mobile vs desktop composition.

Do NOT rewrite factual product claims.
Do NOT invent product images.
Do NOT produce numeric quality scores.
Do NOT reward fake ratings, reviews, badges, endorsements, certifications, scarcity, recent purchases, or countdowns — flag them.

Return concrete observations with evidence from the screenshots or measurements.
Use action codes from the schema.
${templateExpectations(input.template)}`;

  const measurements = input.snapshots.map((snap) => ({
    viewport: snap.viewport,
    pageHeight: snap.pageHeight,
    overflowX: snap.overflowX,
    h1: snap.h1,
    h2: snap.h2,
    images: snap.images,
    cards: snap.cards,
    paragraphs: snap.paragraphs,
    ctas: snap.ctas.map((c) => ({
      position: c.position,
      visible: c.visible,
      width: Math.round(c.width),
      height: Math.round(c.height),
      top: Math.round(c.top),
    })),
    disclosurePresent: snap.disclosurePresent,
    footerLinks: snap.footerLinks,
    faqDetails: snap.faqDetails,
    fakeTrustHits: snap.fakeTrustHits,
  }));

  const userText = `TEMPLATE=${input.template}
TARGET_VISUAL_STANDARD=${TARGET_VISUAL_STANDARD}
DETERMINISTIC_MEASUREMENTS=${JSON.stringify(measurements)}
Screenshots follow. Inspect the actually rendered page, not component names.`;

  return { system, userText };
}

export function parseVisualQaAiText(raw: string): VisualQaFinding[] {
  const { jsonText } = extractJsonText(raw);
  const parsed = JSON.parse(jsonText) as { findings?: unknown };
  if (!Array.isArray(parsed.findings)) {
    throw new JsonExtractError("malformed", "Visual QA JSON missing findings array.");
  }
  const out: VisualQaFinding[] = [];
  for (const item of parsed.findings) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const severity = typeof rec.severity === "string" && isFindingSeverity(rec.severity) ? rec.severity : null;
    const actionCode =
      typeof rec.actionCode === "string" && isVisualQaActionCode(rec.actionCode)
        ? rec.actionCode
        : ("STRENGTHEN_ART_DIRECTION" as VisualQaActionCode);
    if (!severity) continue;
    if (typeof rec.description !== "string" || !rec.description.trim()) continue;
    out.push({
      category: (typeof rec.category === "string" ? rec.category : "artDirection") as VisualQaFinding["category"],
      severity,
      viewport: typeof rec.viewport === "string" ? rec.viewport : "unknown",
      description: rec.description.trim(),
      evidence: typeof rec.evidence === "string" ? rec.evidence : "",
      suggestedPresentationFix:
        typeof rec.suggestedPresentationFix === "string" ? rec.suggestedPresentationFix : "",
      actionCode,
      source: "multimodal",
    });
  }
  return out;
}

export async function runMultimodalVisualReview(input: {
  template: string;
  snapshots: LayoutSnapshot[];
  screenshots: ScreenshotPayload[];
}): Promise<MultimodalReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { state: "UNAVAILABLE", findings: [], rawError: "ANTHROPIC_API_KEY missing" };
  }
  if (input.screenshots.length === 0) {
    return { state: "UNAVAILABLE", findings: [], rawError: "No screenshots captured" };
  }

  const { system, userText } = buildVisualReviewPrompt({
    template: input.template,
    snapshots: input.snapshots,
  });

  const content: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
  for (const shot of input.screenshots.slice(0, 8)) {
    content.push({
      type: "text",
      text: `Screenshot: ${shot.label}`,
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: shot.mediaType,
        data: shot.base64,
      },
    });
  }

  try {
    const text = await callAnthropicVision(apiKey, system, content, true);
    try {
      return { state: "OK", findings: parseVisualQaAiText(text) };
    } catch (err) {
      if (err instanceof JsonExtractError) {
        return { state: "PARSE_FAILED", findings: [], rawError: err.message };
      }
      throw err;
    }
  } catch (err) {
    return {
      state: "UNAVAILABLE",
      findings: [],
      rawError: err instanceof Error ? err.message : "multimodal review failed",
    };
  }
}

async function callAnthropicVision(
  apiKey: string,
  system: string,
  content: Array<Record<string, unknown>>,
  structured: boolean,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: VISUAL_QA_MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content }],
  };
  if (structured) {
    body.output_config = {
      format: {
        type: "json_schema",
        schema: VISUAL_QA_JSON_SCHEMA,
      },
    };
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    if (structured && (response.status === 400 || response.status === 422)) {
      return callAnthropicVision(apiKey, system, content, false);
    }
    throw new Error(`Anthropic API respondeu ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("Resposta da Anthropic não trouxe bloco de texto.");
  }
  return textBlock.text;
}
