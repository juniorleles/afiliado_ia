/**
 * Workflow Engine: retry policy.
 *
 * Names how long to wait before another attempt and how many attempts remain.
 * It only computes a delay. It never retries, never opens a window, and never
 * runs work.
 */
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";

export const WORKFLOW_RETRY_BACKOFFS = ["Fixed", "Linear", "Exponential"] as const;
export type WorkflowRetryBackoff = (typeof WORKFLOW_RETRY_BACKOFFS)[number];

export const WORKFLOW_RETRY_MAX_ATTEMPTS_DEFAULT = 3;
export const WORKFLOW_RETRY_DELAY_MS_DEFAULT = 1000;
export const WORKFLOW_RETRY_DELAY_MS_CAP = 86_400_000;

export interface WorkflowRetryPolicy {
  maxAttempts: number;
  delayMs: number;
  backoff: WorkflowRetryBackoff;
}

export function isWorkflowRetryBackoff(value: unknown): value is WorkflowRetryBackoff {
  return typeof value === "string" && (WORKFLOW_RETRY_BACKOFFS as readonly string[]).includes(value);
}

export function createWorkflowRetryPolicy(input: Partial<WorkflowRetryPolicy> = {}): WorkflowRetryPolicy {
  return freezeDeepWorkflow({
    maxAttempts: input.maxAttempts ?? WORKFLOW_RETRY_MAX_ATTEMPTS_DEFAULT,
    delayMs: input.delayMs ?? WORKFLOW_RETRY_DELAY_MS_DEFAULT,
    backoff: input.backoff ?? "Fixed",
  });
}

export function validateWorkflowRetryPolicy(input: unknown): WorkflowIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "retryPolicy", message: "Invalid Retry Policy: a retry policy must be an object." }];
  }
  const value = input as Record<string, unknown>;
  const issues: WorkflowIssue[] = [];
  if (typeof value.maxAttempts !== "number" || !Number.isInteger(value.maxAttempts) || value.maxAttempts < 1) {
    issues.push({ field: "maxAttempts", message: "Invalid Retry Policy: maxAttempts must be an integer of 1 or more." });
  }
  if (typeof value.delayMs !== "number" || !Number.isInteger(value.delayMs) || value.delayMs < 0) {
    issues.push({ field: "delayMs", message: "Invalid Retry Policy: delayMs must be a non-negative integer." });
  }
  if (!isWorkflowRetryBackoff(value.backoff)) {
    issues.push({ field: "backoff", message: `Invalid Retry Policy: "${String(value.backoff)}" is not a backoff strategy.` });
  }
  return issues;
}

/** Delay until the attempt named by retryCount. retryCount 1 is the first retry. */
export function resolveWorkflowRetryDelayMs(policy: WorkflowRetryPolicy, retryCount: number): number {
  if (retryCount <= 0) return 0;
  if (policy.backoff === "Fixed") return Math.min(policy.delayMs, WORKFLOW_RETRY_DELAY_MS_CAP);
  if (policy.backoff === "Linear") {
    const delay = policy.delayMs * retryCount;
    return delay > WORKFLOW_RETRY_DELAY_MS_CAP ? WORKFLOW_RETRY_DELAY_MS_CAP : delay;
  }
  let delay = policy.delayMs;
  let step = 1;
  while (step < retryCount) {
    if (delay > WORKFLOW_RETRY_DELAY_MS_CAP / 2) return WORKFLOW_RETRY_DELAY_MS_CAP;
    delay *= 2;
    step += 1;
  }
  return delay > WORKFLOW_RETRY_DELAY_MS_CAP ? WORKFLOW_RETRY_DELAY_MS_CAP : delay;
}

export function resolveWorkflowNextRetryAt(policy: WorkflowRetryPolicy, retryCount: number, nowMs: number): string | null {
  if (retryCount >= policy.maxAttempts) return null;
  const delay = resolveWorkflowRetryDelayMs(policy, retryCount + 1);
  return new Date(nowMs + delay).toISOString();
}

export function isWorkflowRetryExhausted(policy: WorkflowRetryPolicy, retryCount: number): boolean {
  return retryCount >= policy.maxAttempts;
}
