import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const OPENAI_TEXT_MODEL = "gpt-5-mini";
export const ANTHROPIC_TEXT_MODEL = "claude-sonnet-4-5-20250929";
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const COPY_MAX_OUTPUT_TOKENS = 2048;
export const COPY_TIMEOUT_MS = 20_000;
export const OPENAI_INPUT_USD_PER_MILLION = 0.25;
export const OPENAI_OUTPUT_USD_PER_MILLION = 2;

export type CopyProviderId = "openai" | "anthropic" | "none";

export type CopyProviderSelection = {
  provider: CopyProviderId;
  model: string | null;
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  authorized: boolean;
  requested: string | null;
};

function envFileValue(name: string): string | null {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

export function envLookup(name: string, env: NodeJS.ProcessEnv = process.env): string {
  if (Object.prototype.hasOwnProperty.call(env, name) && env !== process.env) {
    return env[name]?.trim() ?? "";
  }
  if (env[name]?.trim()) return env[name]!.trim();
  if (env !== process.env) return "";
  return envFileValue(name) ?? "";
}

export function envValuePresent(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(envLookup(name, env));
}

export function envFlagEnabled(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return envLookup(name, env) === "1";
}

export function resolveCopyProvider(env: NodeJS.ProcessEnv = process.env): CopyProviderSelection {
  const openaiConfigured = envValuePresent("OPENAI_API_KEY", env);
  const anthropicConfigured = envValuePresent("ANTHROPIC_API_KEY", env);
  const authorized = envFlagEnabled("AIA_ALLOW_PAID_AI", env);
  const requested = envLookup("AI_PROVIDER", env).toLowerCase() || null;
  const modelOverride = envLookup("AI_MODEL", env) || null;

  let provider: CopyProviderId = "none";
  if (requested === "openai" || requested === "anthropic") {
    provider = requested;
  } else if (openaiConfigured) {
    provider = "openai";
  } else if (anthropicConfigured) {
    provider = "anthropic";
  }

  if (provider === "openai" && !openaiConfigured) provider = anthropicConfigured ? "anthropic" : "none";
  if (provider === "anthropic" && !anthropicConfigured) provider = openaiConfigured ? "openai" : "none";

  const model =
    provider === "openai"
      ? modelOverride || OPENAI_TEXT_MODEL
      : provider === "anthropic"
        ? modelOverride || ANTHROPIC_TEXT_MODEL
        : null;

  return {
    provider,
    model,
    openaiConfigured,
    anthropicConfigured,
    authorized,
    requested,
  };
}

export function estimateOpenAiCostUsd(inputTokens: number, outputTokens: number): string {
  const usd =
    (Math.max(0, inputTokens) / 1_000_000) * OPENAI_INPUT_USD_PER_MILLION +
    (Math.max(0, outputTokens) / 1_000_000) * OPENAI_OUTPUT_USD_PER_MILLION;
  return `~$${usd.toFixed(4)}`;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/x-api-key["']?\s*[:=]\s*["']?[^"'\s]+/gi, "x-api-key=[redacted]");
}
