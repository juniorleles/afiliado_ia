import { envLookup, envValuePresent, OPENAI_RESPONSES_URL, redactSecrets } from "@/lib/lp-generator/ai-copy/config";
import { extractOpenAiResponseText } from "@/lib/lp-generator/ai-copy/provider";
import { paidAiAuthorization, paidProviderAllowed } from "@/lib/ai/paid-gate";
import { providerFetch } from "@/lib/ai/resilience";
import { MULTIMODAL_QUALITY_JSON_SCHEMA } from "@/lib/presell-quality/schema";
import type { MultimodalVisionClient, VisionCompletion, VisionImage } from "@/lib/presell-quality/provider";

export const OPENAI_VISION_PROVIDER_ID = "openai" as const;
export const OPENAI_VISION_MODEL = "gpt-4o-mini";
export const OPENAI_VISION_FALLBACK_MODEL = "gpt-4o";
export const OPENAI_TEXT_ONLY_MODELS = new Set(["gpt-5-mini"]);
export const OPENAI_VISION_INPUT_USD_PER_MILLION = 0.15;
export const OPENAI_VISION_OUTPUT_USD_PER_MILLION = 0.6;
export const OPENAI_VISION_TIMEOUT_MS = 60_000;

export function openaiVisionProviderStatus(env: NodeJS.ProcessEnv = process.env): {
  provider: typeof OPENAI_VISION_PROVIDER_ID | "none";
  model: string | null;
  vision: boolean;
  keyConfigured: boolean;
  authorized: boolean;
  reason: string;
} {
  const paid = paidAiAuthorization(env);
  const keyConfigured = envValuePresent("OPENAI_API_KEY", env);
  const model = envLookup("AIA_OPENAI_VISION_MODEL", env) || OPENAI_VISION_MODEL;
  if (OPENAI_TEXT_ONLY_MODELS.has(model)) {
    return {
      provider: OPENAI_VISION_PROVIDER_ID,
      model,
      vision: false,
      keyConfigured,
      authorized: false,
      reason: `${model} is treated as text-only. Use a vision model such as ${OPENAI_VISION_MODEL}.`,
    };
  }
  if (!keyConfigured) {
    return {
      provider: "none",
      model: null,
      vision: true,
      keyConfigured: false,
      authorized: false,
      reason: "OPENAI_API_KEY is not configured.",
    };
  }
  if (!paid.allowed) {
    return {
      provider: OPENAI_VISION_PROVIDER_ID,
      model,
      vision: true,
      keyConfigured: true,
      authorized: false,
      reason: paid.reason,
    };
  }
  const scoped = paidProviderAllowed(OPENAI_VISION_PROVIDER_ID, env);
  if (!scoped.allowed) {
    return { provider: OPENAI_VISION_PROVIDER_ID, model, vision: true, keyConfigured: true, authorized: false, reason: scoped.reason };
  }
  return {
    provider: OPENAI_VISION_PROVIDER_ID,
    model,
    vision: true,
    keyConfigured: true,
    authorized: true,
    reason: "OpenAI vision is configured and authorized.",
  };
}

export function estimateOpenAiVisionUsd(inputTokens: number, outputTokens: number): number {
  return (Math.max(0, inputTokens) / 1_000_000) * OPENAI_VISION_INPUT_USD_PER_MILLION + (Math.max(0, outputTokens) / 1_000_000) * OPENAI_VISION_OUTPUT_USD_PER_MILLION;
}

export function createOpenAiVisionClient(options?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  callCounter?: { count: number };
  model?: string;
  jsonObject?: boolean;
}): MultimodalVisionClient {
  const env = options?.env ?? process.env;
  const model = options?.model || envLookup("AIA_OPENAI_VISION_MODEL", env) || OPENAI_VISION_MODEL;
  return {
    provider: OPENAI_VISION_PROVIDER_ID,
    model,
    async complete(input) {
      const paid = paidProviderAllowed(OPENAI_VISION_PROVIDER_ID, env);
      if (!paid.allowed) throw new Error(paid.reason);
      if (OPENAI_TEXT_ONLY_MODELS.has(model)) throw new Error(`${model} does not support multimodal image input.`);
      const apiKey = envLookup("OPENAI_API_KEY", env);
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
      if (options?.callCounter) options.callCounter.count += 1;

      const content: Array<Record<string, unknown>> = [{ type: "input_text", text: input.userText }];
      for (const image of input.images.slice(0, 4)) {
        content.push({ type: "input_text", text: `Screenshot: ${image.label}` });
        content.push({
          type: "input_image",
          image_url: `data:${image.mediaType};base64,${image.base64}`,
        });
      }

      const body = {
        model,
        instructions: input.system,
        input: [{ role: "user", content }],
        max_output_tokens: 4096,
        text: {
          format: options?.jsonObject
            ? { type: "json_object" }
            : {
                type: "json_schema",
                name: "presell_quality",
                schema: MULTIMODAL_QUALITY_JSON_SCHEMA,
                strict: true,
              },
        },
      };

      const response = await providerFetch(
        OPENAI_RESPONSES_URL,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        {
          provider: OPENAI_VISION_PROVIDER_ID,
          model,
          promptId: "presell-quality-openai-vision",
          timeoutMs: OPENAI_VISION_TIMEOUT_MS,
          fetchImpl: options?.fetchImpl,
          maxAttempts: 1,
        },
      );

      if (!response.ok) {
        const errorBody = redactSecrets(await response.text().catch(() => ""));
        throw new Error(`HTTP_${response.status}: ${errorBody.slice(0, 200)}`);
      }
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
      } satisfies VisionCompletion;
    },
  };
}

export type { VisionImage };
