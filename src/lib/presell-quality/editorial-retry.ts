export const EDITORIAL_RETRYABLE_CODES = [
  "MISSING_DIMENSION",
  "DUPLICATE_DIMENSION",
  "UNKNOWN_DIMENSION",
  "SCORE_OUT_OF_RANGE",
  "INVALID_JSON",
  "TRUNCATED",
  "EMPTY_PAYLOAD",
  "TIMEOUT",
  "HTTP_ERROR",
  "PROVIDER_ERROR",
  "NETWORK_ERROR",
] as const;

export type EditorialRetryDecision = {
  allowed: boolean;
  reason: string;
};

export function classifyEditorialProviderError(message: string): string {
  if (/timeout/i.test(message)) return "TIMEOUT";
  if (/HTTP_/i.test(message)) return "HTTP_ERROR";
  if (/ECONNRESET|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket hang up/i.test(message)) return "NETWORK_ERROR";
  return "PROVIDER_ERROR";
}

export function editorialRetryAllowed(input: {
  code: string;
  attempt: number;
  maxAttempts: number;
  remainingUsd: number;
  reserveUsd: number;
  authorized: boolean;
}): EditorialRetryDecision {
  if (!input.authorized) {
    return { allowed: false, reason: "Paid evaluation is not authorized." };
  }
  if (!EDITORIAL_RETRYABLE_CODES.includes(input.code as (typeof EDITORIAL_RETRYABLE_CODES)[number])) {
    return { allowed: false, reason: `Code ${input.code} is not retryable.` };
  }
  if (input.attempt >= input.maxAttempts) {
    return { allowed: false, reason: `Retry exhausted after ${input.maxAttempts} attempts.` };
  }
  if (input.remainingUsd + 1e-9 < input.reserveUsd) {
    return { allowed: false, reason: `Remaining budget $${input.remainingUsd.toFixed(4)} cannot reserve $${input.reserveUsd.toFixed(4)}.` };
  }
  return { allowed: true, reason: "Retry authorized within budget." };
}
