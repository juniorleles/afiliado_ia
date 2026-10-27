import { paidAiAuthorization } from "@/lib/ai/paid-gate";
import type { CostMetadata } from "@/lib/presell-quality/types";

export const QUALITY_COST_POLICY = {
  maxEvaluationsPerPage: 2,
  maxCorrectionAttempts: 2,
  maxUsdPerCampaign: 1.5,
  cacheByPageVersion: true,
  stopWhenBudgetExceeded: true,
} as const;

export function qualityCostGate(env: NodeJS.ProcessEnv = process.env): { allowed: boolean; reason: string } {
  const gate = paidAiAuthorization(env);
  if (!gate.allowed) {
    return { allowed: false, reason: "AIA_ALLOW_PAID_AI=0. Multimodal evaluation is not authorized." };
  }
  return { allowed: true, reason: gate.reason };
}

export function emptyCostMetadata(notes: string[] = []): CostMetadata {
  return {
    paidAiEnabled: false,
    estimatedUsd: 0,
    actualUsd: 0,
    evaluationCount: 0,
    cached: false,
    notes,
  };
}
