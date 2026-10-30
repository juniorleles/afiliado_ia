import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createOpenAiVisionClient, estimateOpenAiVisionUsd, OPENAI_VISION_MODEL } from "@/lib/presell-quality/openai-provider";
import { hashVisionResponsePayload } from "@/lib/presell-quality/evaluator-observability";
import { VISUAL_OPTIMIZATION_PROMPT_VERSION, type VisualAnalysisPlan, type VisualComposition } from "./types.ts";
import { emptyVisualAnalysisPlan, parseVisualAnalysisPlan } from "./schema.ts";
import { confirmedDefectPlan } from "./composition.ts";

export const VISUAL_ANALYSIS_SYSTEM = `You are a visual landing-page optimizer. Identify only defects that are visible in the screenshots. Do not invent facts, prices, testimonials, ratings, medical claims, or free shipping. Do not propose changing the Product Contract, quality gate, budget, content safety, publication, ads, or commercial CTA enablement. Return a JSON object with keys visual_defects, layout_changes, copy_changes, expected_improvements, content_safety_risks. layout_changes.op must be one of SET_HERO_DENSITY, SET_PACKSHOT_SCALE, SET_HERO_COLUMNS, SET_HERO_MIN_HEIGHT, SET_PACKAGES_IN_FOLD, SET_PACKAGE_DENSITY, SET_PRICE_EMPHASIS, SET_PACKAGE_HIGHLIGHT, SET_COPY_TONE, SET_COMPLIANCE_PLACEMENT, SET_CARD_ELEVATION, SET_BUTTON_WEIGHT, SET_RADIUS. copy_changes.op must be MOVE_COMPLIANCE or PRESENT_COMMERCIAL_TONE. Prefer filling empty hero space, making the packshot dominant, separating compliance copy from marketing, and giving package cards clearer price hierarchy.`;

export function visualAnalysisUserText(composition: VisualComposition): string {
  return [
    `Prompt version ${VISUAL_OPTIMIZATION_PROMPT_VERSION}.`,
    `Current composition: ${JSON.stringify(composition)}`,
    "Desktop capture is 1440x900 first fold. Mobile capture is 390x844 first fold. Third image is the premium reference.",
    "Known confirmed defects if visible: VG-01 empty hero, VG-02 weak or missing packshot, VG-03 technical compliance language in marketing, VG-04 plain offer cards, VG-05 inconsistent identity.",
    "Do not require testimonials, star ratings, or unapproved producer images.",
    "Respond with JSON.",
  ].join("\n");
}

export function mergeConfirmedDefects(plan: VisualAnalysisPlan): VisualAnalysisPlan {
  const seed = confirmedDefectPlan();
  const ops = new Set(plan.layout_changes.map((item) => item.op));
  const copyOps = new Set(plan.copy_changes.map((item) => item.op));
  return {
    ...plan,
    layout_changes: [
      ...plan.layout_changes,
      ...seed.layout_changes.filter((item) => !ops.has(item.op)),
    ],
    copy_changes: [
      ...plan.copy_changes,
      ...seed.copy_changes.filter((item) => !copyOps.has(item.op)),
    ],
  };
}

export async function analyzeVisualComposition(input: {
  desktopPath: string;
  mobilePath: string;
  referenceBytes: Buffer;
  composition: VisualComposition;
}): Promise<{
  plan: VisualAnalysisPlan;
  source: "ai" | "confirmed-defects";
  raw: string | null;
  model: string;
  promptVersion: string;
  inputHash: string;
  responseHash: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}> {
  const client = createOpenAiVisionClient({ jsonObject: true });
  const userText = visualAnalysisUserText(input.composition);
  const inputHash = createHash("sha256").update(userText).digest("hex");
  const images = [
    { mediaType: "image/png" as const, base64: readFileSync(input.desktopPath).toString("base64"), label: "desktop-first-fold" },
    { mediaType: "image/png" as const, base64: readFileSync(input.mobilePath).toString("base64"), label: "mobile-first-fold" },
    { mediaType: "image/png" as const, base64: input.referenceBytes.toString("base64"), label: "premium-reference" },
  ];
  const completion = await client.complete({ system: VISUAL_ANALYSIS_SYSTEM, userText, images });
  const parsed = parseVisualAnalysisPlan(completion.text);
  const plan = mergeConfirmedDefects(parsed.ok ? parsed.plan : emptyVisualAnalysisPlan());
  return {
    plan,
    source: parsed.ok ? "ai" : "confirmed-defects",
    raw: completion.text,
    model: OPENAI_VISION_MODEL,
    promptVersion: VISUAL_OPTIMIZATION_PROMPT_VERSION,
    inputHash,
    responseHash: completion.observability?.responsePayloadHash ?? hashVisionResponsePayload(completion.text),
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    estimatedUsd: estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens),
  };
}
