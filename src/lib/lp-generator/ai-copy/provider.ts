import { extractJsonText } from "@/lib/ai/parse-ai-json";
import { providerFetch } from "@/lib/ai/resilience";
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_TEXT_MODEL,
  COPY_MAX_OUTPUT_TOKENS,
  OPENAI_RESPONSES_URL,
  OPENAI_TEXT_MODEL,
  envLookup,
  redactSecrets,
  resolveCopyProvider,
} from "@/lib/lp-generator/ai-copy/config";
import { calculateOpenAiCostUsd } from "@/lib/lp-generator/ai-copy/budget";
import type { AiCopyCaller, AiProviderDiagnosis } from "@/lib/lp-generator/ai-copy/types";

export function diagnoseAiProvider(env: NodeJS.ProcessEnv = process.env): AiProviderDiagnosis {
  const selection = resolveCopyProvider(env);
  if (selection.provider === "openai") {
    return {
      provider: "openai",
      model: selection.model,
      configured: true,
      authorized: selection.authorized,
      status: selection.authorized ? "READY" : "BLOCKED_AUTHORIZATION",
      note: selection.authorized
        ? "OpenAI is the commercial-copy provider and paid calls are authorized for this process. Image generation remains a separate Images API integration."
        : "OpenAI is configured for commercial copy, but paid calls stay blocked until AIA_ALLOW_PAID_AI=1. Image generation remains a separate Images API integration.",
    };
  }
  if (selection.provider === "anthropic") {
    return {
      provider: "anthropic",
      model: selection.model,
      configured: true,
      authorized: selection.authorized,
      status: selection.authorized ? "READY" : "BLOCKED_AUTHORIZATION",
      note: selection.authorized
        ? "Anthropic is the selected commercial-copy provider and paid calls are authorized for this process."
        : "Anthropic is selected as the commercial-copy alternative, but paid calls stay blocked until AIA_ALLOW_PAID_AI=1.",
    };
  }
  return {
    provider: "none",
    model: null,
    configured: false,
    authorized: false,
    status: "BLOCKED_CONFIGURATION",
    note: "No commercial-copy provider is configured. Set OPENAI_API_KEY (preferred) or ANTHROPIC_API_KEY, then AIA_ALLOW_PAID_AI=1.",
  };
}

export function createOpenAiCopyCaller(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): AiCopyCaller {
  return async ({ system, user, schema, timeoutMs }) => {
    const apiKey = envLookup("OPENAI_API_KEY", env);
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const model = resolveCopyProvider(env).model || OPENAI_TEXT_MODEL;
    const started = Date.now();
    const response = await providerFetch(
      OPENAI_RESPONSES_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          instructions: system,
          input: user,
          max_output_tokens: COPY_MAX_OUTPUT_TOKENS,
          reasoning: { effort: "minimal" },
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: "commercial_copy",
              schema,
              strict: false,
            },
          },
        }),
      },
      { provider: "openai", model, promptId: "lp-commercial-copy", timeoutMs, maxAttempts: 1, fetchImpl },
    );
    if (!response.ok) {
      const body = redactSecrets(await response.text().catch(() => ""));
      throw new Error(`OpenAI responded ${response.status}: ${body.slice(0, 180)}`);
    }
    const data = (await response.json()) as {
      id?: string;
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
        output_tokens_details?: { reasoning_tokens?: number };
      };
    };
    const text = extractOpenAiResponseText(data);
    if (!text) throw new Error("OpenAI returned no text block.");
    const usage = {
      inputTokens: Number(data.usage?.input_tokens ?? 0),
      outputTokens: Number(data.usage?.output_tokens ?? 0),
      cachedInputTokens: Number(data.usage?.input_tokens_details?.cached_tokens ?? 0),
      reasoningTokens: Number(data.usage?.output_tokens_details?.reasoning_tokens ?? 0),
      totalTokens: Number(data.usage?.total_tokens ?? 0),
    };
    const requestId =
      (typeof data.id === "string" && data.id) ||
      response.headers.get("x-request-id") ||
      response.headers.get("request-id") ||
      null;
    return {
      text,
      latencyMs: Date.now() - started,
      usage,
      requestId,
      httpStatus: response.status,
      costEstimate: `$${calculateOpenAiCostUsd(usage).toFixed(6)}`,
    };
  };
}

export function createAnthropicCopyCaller(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): AiCopyCaller {
  return async ({ system, user, schema, timeoutMs }) => {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
    const model = resolveCopyProvider(env).model || ANTHROPIC_TEXT_MODEL;
    const started = Date.now();
    const response = await providerFetch(
      ANTHROPIC_MESSAGES_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: COPY_MAX_OUTPUT_TOKENS,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { format: { type: "json_schema", schema } },
        }),
      },
      { provider: "anthropic", model, promptId: "lp-commercial-copy", timeoutMs, maxAttempts: 1, fetchImpl },
    );
    if (!response.ok) {
      const body = redactSecrets(await response.text().catch(() => ""));
      throw new Error(`Anthropic responded ${response.status}: ${body.slice(0, 180)}`);
    }
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((block) => block.type === "text")?.text;
    if (!text) throw new Error("Anthropic returned no text block.");
    return { text, latencyMs: Date.now() - started };
  };
}

export function createConfiguredCopyCaller(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): AiCopyCaller {
  const selection = resolveCopyProvider(env);
  if (selection.provider === "openai") return createOpenAiCopyCaller(env, fetchImpl);
  if (selection.provider === "anthropic") return createAnthropicCopyCaller(env, fetchImpl);
  throw new Error("No commercial-copy provider is configured.");
}

export function parseProviderJson(text: string): unknown {
  const extracted = extractJsonText(text);
  return JSON.parse(extracted.jsonText);
}

export function extractOpenAiResponseText(data: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (data.output_text?.trim()) return data.output_text.trim();
  const chunks: string[] = [];
  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if ((part.type === "output_text" || part.type === "text") && part.text) chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}
