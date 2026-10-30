import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createOpenAiVisionClient, estimateOpenAiVisionUsd, OPENAI_VISION_MODEL } from "@/lib/presell-quality/openai-provider";
import { hashVisionResponsePayload } from "@/lib/presell-quality/evaluator-observability";
import {
  EDITORIAL_QUALITY_PROMPT_VERSION,
  type ApprovedCopyInventory,
  type CommercialCopyPlan,
  type CommercialCopyState,
  type VisualComposition,
} from "./types.ts";
import { parseCommercialCopyPlan } from "./commercial-schema.ts";
import { emptyCommercialCopyPlan } from "./commercial.ts";
import { confirmedEditorialPlan } from "./editorial.ts";

export const EDITORIAL_ANALYSIS_SYSTEM = `You are an editorial and visual quality corrector for a grounded affiliate presell. Identify only defects visible in the screenshots or present in the supplied approved facts. Do not invent prices, testimonials, ratings, medical claims, discounts, urgency, or free shipping. Do not change the Product Contract, quality gate, budget, content safety, publication, ads, or commercial checkout enablement. Prefer a short natural commercial headline of at most 8 words, one idea, no package enumeration, and no refund window in the title. Merge duplicated Delivery and payment sections. Remove empty product sections. Improve typography, ingredient card hierarchy, and a grounded interactive FAQ. Return a JSON object with keys headline, subheadline, section_changes, offer_presentation, visual_changes, conversion_improvements, compliance_risks. headline and subheadline must be objects with current, proposed, and supporting_fact_ids. Use only allowed operations: REWRITE_HEADLINE, REWRITE_SUBHEADLINE, MERGE_DUPLICATE_SECTIONS, REMOVE_EMPTY_SECTION, REORDER_SECTIONS, ADJUST_TYPOGRAPHY, REFINE_INGREDIENT_LAYOUT, IMPROVE_OFFER_HIERARCHY, COMPLETE_GROUNDED_FAQ, and the existing structured layout ops.`;

export function editorialAnalysisUserText(input: {
  composition: VisualComposition;
  copy: CommercialCopyState;
  inventory: ApprovedCopyInventory;
}): string {
  return [
    `Prompt version ${EDITORIAL_QUALITY_PROMPT_VERSION}.`,
    `Current composition: ${JSON.stringify(input.composition)}`,
    `Current copy: ${JSON.stringify(input.copy)}`,
    `Approved facts: ${JSON.stringify({
      productName: input.inventory.productName,
      productKind: input.inventory.productKind,
      ingredients: input.inventory.ingredients,
      description: input.inventory.description.slice(0, 500),
      usage: input.inventory.usage.slice(0, 400),
      guarantee: input.inventory.guarantee.slice(0, 400),
      guaranteeDays: input.inventory.guaranteeDays,
      packages: input.inventory.packages.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        currentTotal: item.currentTotal,
        duration: item.duration,
        shippingTerm: item.shippingTerm,
      })),
    })}`,
    "Desktop capture is 1440x900 first fold. Mobile capture is 390x844 first fold. Third image is the premium visual reference, not a claim source.",
    "Keep two droppers, not two drops. Keep the 60-day refund conditions if present in approved facts. First fold does not need every package card.",
    "Respond with JSON.",
  ].join("\n");
}

export async function analyzeEditorialQuality(input: {
  desktopPath: string;
  mobilePath: string;
  referenceBytes: Buffer;
  composition: VisualComposition;
  copy: CommercialCopyState;
  inventory: ApprovedCopyInventory;
  iteration: number;
}): Promise<{
  plan: CommercialCopyPlan;
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
  const userText = editorialAnalysisUserText(input);
  const inputHash = createHash("sha256").update(userText).digest("hex");
  const images = [
    { mediaType: "image/png" as const, base64: readFileSync(input.desktopPath).toString("base64"), label: "desktop-first-fold" },
    { mediaType: "image/png" as const, base64: readFileSync(input.mobilePath).toString("base64"), label: "mobile-first-fold" },
    { mediaType: "image/png" as const, base64: input.referenceBytes.toString("base64"), label: "premium-reference" },
  ];
  const completion = await client.complete({ system: EDITORIAL_ANALYSIS_SYSTEM, userText, images });
  const parsed = parseCommercialCopyPlan(completion.text, input.copy);
  const seed = confirmedEditorialPlan(input.iteration, input.inventory, input.copy);
  const fallback = emptyCommercialCopyPlan(input.copy);
  const plan = parsed.ok
    ? {
        ...parsed.plan,
        section_changes: [...parsed.plan.section_changes, ...seed.copy_changes.filter((item) => !parsed.plan.section_changes.some((row) => row.op === item.op))],
        visual_changes: [...parsed.plan.visual_changes, ...seed.layout_changes.filter((item) => !parsed.plan.visual_changes.some((row) => row.op === item.op))],
        offer_presentation: [
          ...parsed.plan.offer_presentation,
          ...seed.layout_changes.filter((item) => item.op === "SET_OFFER_COMPARE" && !parsed.plan.offer_presentation.some((row) => row.op === item.op)),
        ],
      }
    : {
        ...fallback,
        section_changes: seed.copy_changes,
        visual_changes: seed.layout_changes,
        offer_presentation: seed.layout_changes.filter((item) => item.op === "SET_OFFER_COMPARE"),
      };
  return {
    plan,
    source: parsed.ok ? "ai" : "confirmed-defects",
    raw: completion.text,
    model: OPENAI_VISION_MODEL,
    promptVersion: EDITORIAL_QUALITY_PROMPT_VERSION,
    inputHash,
    responseHash: completion.observability?.responsePayloadHash ?? hashVisionResponsePayload(completion.text),
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    estimatedUsd: estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens),
  };
}
