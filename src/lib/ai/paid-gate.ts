import { envFlagEnabled } from "@/lib/lp-generator/ai-copy/config";

export const PAID_AI_BLOCKED_CODE = "PAID_AI_BLOCKED" as const;

export class PaidAiBlockedError extends Error {
  readonly code = PAID_AI_BLOCKED_CODE;

  constructor(message: string) {
    super(message);
    this.name = "PaidAiBlockedError";
  }
}

/** Fail-closed authorization for any paid provider HTTP/SDK call. Absent flag is not authorized. */
export function paidAiAuthorization(env: NodeJS.ProcessEnv = process.env): {
  allowed: boolean;
  reason: string;
  code: typeof PAID_AI_BLOCKED_CODE | null;
} {
  if (!envFlagEnabled("AIA_ALLOW_PAID_AI", env)) {
    return {
      allowed: false,
      reason: "AIA_ALLOW_PAID_AI is not 1. Paid provider calls are blocked.",
      code: PAID_AI_BLOCKED_CODE,
    };
  }
  return { allowed: true, reason: "Paid AI is authorized for this process only.", code: null };
}

export function assertPaidAiAuthorized(env: NodeJS.ProcessEnv = process.env): void {
  const gate = paidAiAuthorization(env);
  if (!gate.allowed) throw new PaidAiBlockedError(gate.reason);
}

const TEMP_KEYS = ["AIA_ALLOW_PAID_AI", "AIA_PAID_AI_SCOPE", "AIA_PAID_AI_PROVIDER", "AIA_PAID_AI_BUDGET_USD"] as const;

/** Process-only authorization. Does not write .env or .env.local. */
export async function runWithTemporaryPaidAi<T>(
  input: { scope: string; provider: "openai"; maxUsd: number },
  fn: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of TEMP_KEYS) previous[key] = env[key];
  env.AIA_ALLOW_PAID_AI = "1";
  env.AIA_PAID_AI_SCOPE = input.scope;
  env.AIA_PAID_AI_PROVIDER = input.provider;
  env.AIA_PAID_AI_BUDGET_USD = String(input.maxUsd);
  try {
    return await fn();
  } finally {
    for (const key of TEMP_KEYS) {
      if (previous[key] === undefined) delete env[key];
      else env[key] = previous[key];
    }
  }
}

export function paidProviderAllowed(provider: string, env: NodeJS.ProcessEnv = process.env): { allowed: boolean; reason: string } {
  const paid = paidAiAuthorization(env);
  if (!paid.allowed) return paid;
  const scoped = env.AIA_PAID_AI_PROVIDER?.trim().toLowerCase();
  if (scoped && scoped !== provider.toLowerCase()) {
    return { allowed: false, reason: `Paid provider is scoped to ${scoped}. ${provider} fallback is forbidden.` };
  }
  return { allowed: true, reason: paid.reason };
}
