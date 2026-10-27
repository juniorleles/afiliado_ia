import { envLookup, envValuePresent } from "@/lib/lp-generator/ai-copy/config";
import { paidAiAuthorization, paidProviderAllowed } from "@/lib/ai/paid-gate";
import { providerFetch } from "@/lib/ai/resilience";
import { MULTIMODAL_QUALITY_JSON_SCHEMA } from "@/lib/presell-quality/schema";

export const MULTIMODAL_PROVIDER_ID = "anthropic" as const;
export const MULTIMODAL_MODEL_ID = "claude-sonnet-4-5-20250929" as const;
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const MULTIMODAL_MAX_TOKENS = 4096;
export const MULTIMODAL_TIMEOUT_MS = 60_000;
export const ANTHROPIC_INPUT_USD_PER_MILLION = 3;
export const ANTHROPIC_OUTPUT_USD_PER_MILLION = 15;

export type VisionImage = {
  mediaType: "image/png" | "image/jpeg";
  base64: string;
  label: string;
};

export type VisionCompletion = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export type MultimodalVisionClient = {
  provider: "openai" | "anthropic";
  model: string;
  complete(input: { system: string; userText: string; images: VisionImage[] }): Promise<VisionCompletion>;
};

export function multimodalProviderStatus(env: NodeJS.ProcessEnv = process.env): {
  provider: typeof MULTIMODAL_PROVIDER_ID | "none";
  model: string | null;
  vision: boolean;
  keyConfigured: boolean;
  authorized: boolean;
  reason: string;
} {
  const paid = paidAiAuthorization(env);
  const keyConfigured = envValuePresent("ANTHROPIC_API_KEY", env);
  if (!keyConfigured) {
    return {
      provider: "none",
      model: null,
      vision: true,
      keyConfigured: false,
      authorized: false,
      reason: "ANTHROPIC_API_KEY is not configured.",
    };
  }
  if (!paid.allowed) {
    return {
      provider: MULTIMODAL_PROVIDER_ID,
      model: MULTIMODAL_MODEL_ID,
      vision: true,
      keyConfigured: true,
      authorized: false,
      reason: paid.reason,
    };
  }
  return {
    provider: MULTIMODAL_PROVIDER_ID,
    model: MULTIMODAL_MODEL_ID,
    vision: true,
    keyConfigured: true,
    authorized: true,
    reason: "Anthropic vision is configured and authorized.",
  };
}

export function estimateAnthropicUsd(inputTokens: number, outputTokens: number): number {
  return (Math.max(0, inputTokens) / 1_000_000) * ANTHROPIC_INPUT_USD_PER_MILLION + (Math.max(0, outputTokens) / 1_000_000) * ANTHROPIC_OUTPUT_USD_PER_MILLION;
}

export function createAnthropicVisionClient(options?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  callCounter?: { count: number };
}): MultimodalVisionClient {
  return {
    provider: MULTIMODAL_PROVIDER_ID,
    model: MULTIMODAL_MODEL_ID,
    async complete(input) {
      const env = options?.env ?? process.env;
      const paid = paidProviderAllowed(MULTIMODAL_PROVIDER_ID, env);
      if (!paid.allowed) throw new Error(paid.reason);
      const apiKey = envLookup("ANTHROPIC_API_KEY", env);
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
      if (options?.callCounter) options.callCounter.count += 1;

      const content: Array<Record<string, unknown>> = [{ type: "text", text: input.userText }];
      for (const image of input.images.slice(0, 4)) {
        content.push({ type: "text", text: `Screenshot: ${image.label}` });
        content.push({
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.base64 },
        });
      }

      const body: Record<string, unknown> = {
        model: MULTIMODAL_MODEL_ID,
        max_tokens: MULTIMODAL_MAX_TOKENS,
        system: input.system,
        messages: [{ role: "user", content }],
        output_config: {
          format: { type: "json_schema", schema: MULTIMODAL_QUALITY_JSON_SCHEMA },
        },
      };

      const response = await providerFetch(
        ANTHROPIC_MESSAGES_URL,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        },
        {
          provider: MULTIMODAL_PROVIDER_ID,
          model: MULTIMODAL_MODEL_ID,
          promptId: "presell-quality-multimodal",
          timeoutMs: MULTIMODAL_TIMEOUT_MS,
          fetchImpl: options?.fetchImpl,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`HTTP_${response.status}: ${errorBody.slice(0, 200)}`);
      }
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = data.content?.find((block) => block.type === "text")?.text;
      if (!text) throw new Error("Anthropic response had no text block.");
      return {
        text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    },
  };
}
