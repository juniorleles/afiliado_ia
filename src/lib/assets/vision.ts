/**
 * Optional multimodal role classifier.
 * Allowed question: "What role does this image appear to serve?"
 * Must not infer medical efficacy, certification, authenticity, or endorsement.
 * Classification never changes provenance (DIRECT_SOURCE stays DIRECT_SOURCE).
 */

import { ASSET_ROLE_QUESTION, AI_ASSET_ROLES, type AiAssetRole } from "@/lib/assets/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

export function parseAssetRoleResponse(text: string): AiAssetRole {
  const normalized = text.toUpperCase().replace(/[^A-Z_]/g, " ");
  for (const role of AI_ASSET_ROLES) {
    if (normalized.includes(role)) return role;
  }
  return "UNCERTAIN";
}

export function assetRoleClassifierPrompt(): { question: string; allowed: readonly string[]; forbidden: string[] } {
  return {
    question: ASSET_ROLE_QUESTION,
    allowed: AI_ASSET_ROLES,
    forbidden: [
      "medical efficacy",
      "certification",
      "product authenticity",
      "ingredient truth",
      "endorsement",
    ],
  };
}

export async function classifyAssetRoleWithAi(input: {
  mime: string;
  base64: string;
}): Promise<{ role: AiAssetRole; method: "AI_CLASSIFIED" } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const mediaType =
    input.mime === "image/png" || input.mime === "image/webp" || input.mime === "image/gif" ? input.mime : "image/jpeg";
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system:
          'Answer only with one role token. Question: "What role does this image appear to serve?" Allowed: PRODUCT_PACKSHOT, PRODUCT_LIFESTYLE, INGREDIENT_VISUAL, BRAND_LOGO, DECORATIVE_SOURCE, UNUSABLE, UNCERTAIN. Do not infer medical efficacy, certification, product authenticity, ingredient truth, or endorsement.',
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: input.base64 } },
              { type: "text", text: ASSET_ROLE_QUESTION },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = json.content?.find((part) => part.type === "text")?.text || "";
    return { role: parseAssetRoleResponse(text), method: "AI_CLASSIFIED" };
  } catch {
    return null;
  }
}
