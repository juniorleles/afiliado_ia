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
import type { VisionCompletion, VisionImage } from "@/lib/presell-quality/provider";
import { declarationCoversAsset, type UserAssetDeclaration } from "@/lib/presell-quality/user-asset-declaration";

export const ASSET_IMAGE_TYPES = ["PRODUCT_PACKSHOT", "PACKAGING", "INGREDIENT", "DECORATIVE", "OTHER"] as const;
export type AssetImageType = (typeof ASSET_IMAGE_TYPES)[number];

export type AssetSuitability = {
  assetId: string;
  imageType: AssetImageType;
  resolutionQuality: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  visualQuality: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  aspectHint: "UNKNOWN" | "SQUARE" | "PORTRAIT" | "LANDSCAPE";
  background: "UNKNOWN" | "CLEAN" | "BUSY" | "TRANSPARENT";
  heroEligible: boolean;
  galleryEligible: boolean;
  reason: string;
  confidence: number;
  authorizationOrigin: "USER_DECLARATION" | "NONE";
  source: "METADATA" | "VISION" | "MERGED";
};

export type AssetClassificationInput = {
  assetId: string;
  fileName: string;
  assetUrl?: string;
  context?: string;
  localPath?: string | null;
};

const PACKSHOT_NAME = /\b(?:pack(?:shot)?|(?:\d+)?bootles?|bottles?|box|jar|tub|pouch|sachet|product[-_ ]?(?:shot|image|pack))\b/i;
const BOTANICAL_NAME = /\b(?:i-|ingredient|eleuthero|coleus|maca|mango|root|berry|leaf|plant|fruit|herb|formula|compos)\b/i;
const CHROME_NAME = /\.(?:svg)$/i;
const TYPE_SET = new Set<string>(ASSET_IMAGE_TYPES);
const QUALITY_SET = new Set(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);

export function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);
  } catch {
    return url.split("/").pop() ?? url;
  }
}

export function looksBotanicalOrIngredient(fileName: string, context = ""): boolean {
  const hay = `${fileName} ${context}`;
  return BOTANICAL_NAME.test(hay) && !PACKSHOT_NAME.test(hay);
}

export function looksLikePackshotName(fileName: string, context = ""): boolean {
  return PACKSHOT_NAME.test(`${fileName} ${context}`);
}

export function classifyAssetSuitabilityFromMetadata(
  input: AssetClassificationInput,
  declaration: UserAssetDeclaration | null,
): AssetSuitability {
  const hay = `${input.fileName} ${input.context ?? ""}`;
  const authorized = declarationCoversAsset(declaration, input.assetId);
  const authorizationOrigin = authorized ? "USER_DECLARATION" : "NONE";
  if (CHROME_NAME.test(input.fileName) || /(?:favicon|signature|sound|continue|logo|banner)\b/i.test(hay)) {
    return {
      assetId: input.assetId,
      imageType: "OTHER",
      resolutionQuality: "UNKNOWN",
      visualQuality: "UNKNOWN",
      aspectHint: "UNKNOWN",
      background: "UNKNOWN",
      heroEligible: false,
      galleryEligible: false,
      reason: "Chrome, logo, or decorative UI art is not a product photograph.",
      confidence: 0.9,
      authorizationOrigin,
      source: "METADATA",
    };
  }
  if (looksBotanicalOrIngredient(input.fileName, input.context)) {
    return {
      assetId: input.assetId,
      imageType: "INGREDIENT",
      resolutionQuality: "UNKNOWN",
      visualQuality: "UNKNOWN",
      aspectHint: "UNKNOWN",
      background: "UNKNOWN",
      heroEligible: false,
      galleryEligible: false,
      reason: "Botanical or ingredient imagery cannot be treated as an official product photograph.",
      confidence: 0.86,
      authorizationOrigin,
      source: "METADATA",
    };
  }
  if (looksLikePackshotName(input.fileName, input.context)) {
    return {
      assetId: input.assetId,
      imageType: "PRODUCT_PACKSHOT",
      resolutionQuality: "UNKNOWN",
      visualQuality: "UNKNOWN",
      aspectHint: "UNKNOWN",
      background: "UNKNOWN",
      heroEligible: true,
      galleryEligible: true,
      reason: "Filename indicates bottles or product packaging. Visual confirmation is still required before editorial use.",
      confidence: 0.72,
      authorizationOrigin,
      source: "METADATA",
    };
  }
  return {
    assetId: input.assetId,
    imageType: "OTHER",
    resolutionQuality: "UNKNOWN",
    visualQuality: "UNKNOWN",
    aspectHint: "UNKNOWN",
    background: "UNKNOWN",
    heroEligible: false,
    galleryEligible: false,
    reason: "No packshot evidence in the filename or context.",
    confidence: 0.55,
    authorizationOrigin,
    source: "METADATA",
  };
}

export function mergeVisionSuitability(
  metadata: AssetSuitability,
  vision: Partial<AssetSuitability>,
): AssetSuitability {
  const botanicalLock = metadata.imageType === "INGREDIENT";
  const visionType = vision.imageType && TYPE_SET.has(vision.imageType) ? vision.imageType : metadata.imageType;
  const lockedType =
    botanicalLock && (visionType === "PRODUCT_PACKSHOT" || visionType === "PACKAGING") ? "INGREDIENT" : visionType;
  const heroEligible = botanicalLock || lockedType === "INGREDIENT" || lockedType === "DECORATIVE" || lockedType === "OTHER"
    ? false
    : Boolean(vision.heroEligible ?? metadata.heroEligible);
  const galleryEligible =
    lockedType === "INGREDIENT" || lockedType === "DECORATIVE"
      ? false
      : Boolean(vision.galleryEligible ?? metadata.galleryEligible);
  return {
    ...metadata,
    imageType: lockedType,
    resolutionQuality: QUALITY_SET.has(String(vision.resolutionQuality)) ? (vision.resolutionQuality as AssetSuitability["resolutionQuality"]) : metadata.resolutionQuality,
    visualQuality: QUALITY_SET.has(String(vision.visualQuality)) ? (vision.visualQuality as AssetSuitability["visualQuality"]) : metadata.visualQuality,
    aspectHint: vision.aspectHint ?? metadata.aspectHint,
    background: vision.background ?? metadata.background,
    heroEligible,
    galleryEligible,
    reason: botanicalLock && vision.imageType === "PRODUCT_PACKSHOT"
      ? "Vision may not promote plants, roots, or fruit into an official product photograph."
      : vision.reason?.trim() || metadata.reason,
    confidence: Math.max(0, Math.min(1, vision.confidence ?? metadata.confidence)),
    source: "MERGED",
  };
}

export const ASSET_CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "assetId",
          "imageType",
          "resolutionQuality",
          "visualQuality",
          "aspectHint",
          "background",
          "heroEligible",
          "galleryEligible",
          "reason",
          "confidence",
        ],
        properties: {
          assetId: { type: "string" },
          imageType: { type: "string", enum: [...ASSET_IMAGE_TYPES] },
          resolutionQuality: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "UNKNOWN"] },
          visualQuality: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "UNKNOWN"] },
          aspectHint: { type: "string", enum: ["UNKNOWN", "SQUARE", "PORTRAIT", "LANDSCAPE"] },
          background: { type: "string", enum: ["UNKNOWN", "CLEAN", "BUSY", "TRANSPARENT"] },
          heroEligible: { type: "boolean" },
          galleryEligible: { type: "boolean" },
          reason: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export function normalizeAssetClassificationPayload(raw: string): Array<Partial<AssetSuitability> & { assetId: string }> {
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
  const rows: Array<Partial<AssetSuitability> & { assetId: string }> = [];
  for (const row of Array.isArray(rec.assets) ? rec.assets : []) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (typeof item.assetId !== "string" || !item.assetId.trim()) continue;
    rows.push({
      assetId: item.assetId,
      imageType: TYPE_SET.has(String(item.imageType)) ? (item.imageType as AssetImageType) : undefined,
      resolutionQuality: QUALITY_SET.has(String(item.resolutionQuality)) ? (item.resolutionQuality as AssetSuitability["resolutionQuality"]) : undefined,
      visualQuality: QUALITY_SET.has(String(item.visualQuality)) ? (item.visualQuality as AssetSuitability["visualQuality"]) : undefined,
      aspectHint: item.aspectHint as AssetSuitability["aspectHint"],
      background: item.background as AssetSuitability["background"],
      heroEligible: typeof item.heroEligible === "boolean" ? item.heroEligible : undefined,
      galleryEligible: typeof item.galleryEligible === "boolean" ? item.galleryEligible : undefined,
      reason: typeof item.reason === "string" ? item.reason : undefined,
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    });
  }
  if (!rows.length) throw new Error("INVALID_JSON: assets are required.");
  return rows;
}

export async function classifyAssetsWithVision(
  input: {
    assets: AssetClassificationInput[];
    metadata: AssetSuitability[];
  },
  deps: {
    env?: NodeJS.ProcessEnv;
    complete?: (payload: { system: string; userText: string; images: VisionImage[] }) => Promise<VisionCompletion>;
    readFile?: (file: string) => Buffer;
  } = {},
): Promise<{ classifications: AssetSuitability[]; inputTokens: number; outputTokens: number; estimatedUsd: number; model: string }> {
  const env = deps.env ?? process.env;
  const paid = paidProviderAllowed(OPENAI_VISION_PROVIDER_ID, env);
  if (!paid.allowed) throw new Error(paid.reason);
  const reader = deps.readFile ?? ((file: string) => readFileSync(file));
  const images: VisionImage[] = [];
  for (const asset of input.assets) {
    if (!asset.localPath || (!deps.readFile && !existsSync(asset.localPath))) continue;
    const buf = reader(asset.localPath);
    const lower = asset.localPath.toLowerCase();
    const mediaType = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") ? "image/jpeg" : "image/png";
    images.push({ mediaType, base64: buf.toString("base64"), label: asset.assetId });
  }
  if (!images.length) {
    return {
      classifications: input.metadata,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      model: OPENAI_VISION_MODEL,
    };
  }
  const system = `You classify product-image files for an affiliate presell. You do not grant rights.
Rules:
1. Do not invent a right to use. Authorization is supplied separately.
2. Plants, roots, leaves, berries, or fruit are INGREDIENT or DECORATIVE. They are never an official product photograph.
3. Do not invent a packshot. Do not treat lifestyle produce as packaging.
4. PRODUCT_PACKSHOT requires a visible product bottle, box, jar, or labeled pack.
5. heroEligible only for a real packshot or packaging photo that is sharp enough for a hero.
6. galleryEligible only when the image is the product or packaging, not decorative ingredients used as proof.
7. Return only the requested JSON.`;
  const userText = `Classify these assets. Metadata hints: ${JSON.stringify(
    input.metadata.map((item) => ({ assetId: item.assetId, hint: item.imageType, fileHint: true })),
  )}`;
  const complete =
    deps.complete ??
    (async (payload) => {
      const apiKey = envLookup("OPENAI_API_KEY", env);
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
      const model = envLookup("AIA_OPENAI_VISION_MODEL", env) || OPENAI_VISION_MODEL;
      const content: Array<Record<string, unknown>> = [{ type: "input_text", text: payload.userText }];
      for (const image of payload.images.slice(0, 8)) {
        content.push({ type: "input_text", text: `Asset: ${image.label}` });
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
            max_output_tokens: 2048,
            text: {
              format: {
                type: "json_schema",
                name: "presell_asset_classify",
                schema: ASSET_CLASSIFICATION_JSON_SCHEMA,
                strict: true,
              },
            },
          }),
        },
        {
          provider: OPENAI_VISION_PROVIDER_ID,
          model,
          promptId: "presell-asset-classify",
          timeoutMs: OPENAI_VISION_TIMEOUT_MS,
          maxAttempts: 1,
        },
      );
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const data = (await response.json()) as {
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
  const completion = await complete({ system, userText, images });
  const visionRows = normalizeAssetClassificationPayload(completion.text);
  const byId = new Map(visionRows.map((item) => [item.assetId, item]));
  return {
    classifications: input.metadata.map((item) => mergeVisionSuitability(item, byId.get(item.assetId) ?? {})),
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    estimatedUsd: Number(estimateOpenAiVisionUsd(completion.inputTokens, completion.outputTokens).toFixed(6)),
    model: OPENAI_VISION_MODEL,
  };
}
