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
