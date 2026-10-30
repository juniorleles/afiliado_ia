import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";

export const OPENAI_LOOP_BUDGET = {
  maxUsd: 2,
  maxEvaluations: 3,
  maxCorrectionRounds: 2,
  reserveUsdPerEvaluation: 0.35,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AH_BUDGET = {
  maxUsd: 2,
  maxFixtureEvals: 2,
  maxVisualComparisons: 1,
  maxCampaignEvals: 3,
  maxCorrectionRounds: 2,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AI_BUDGET = {
  maxUsd: 0.5,
  maxCampaignEvals: 2,
  maxCorrectionRounds: 1,
  reserveUsdPerEvaluation: 0.2,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AJ_BUDGET = {
  maxUsd: 1,
  maxCampaignEvals: 3,
  maxClassificationCalls: 1,
  maxCorrectionRounds: 2,
  reserveUsdPerEvaluation: 0.2,
  reserveUsdPerClassification: 0.15,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AK_BUDGET = {
  maxUsd: 1,
  maxCampaignEvals: 3,
  maxRewriteCalls: 1,
  maxCorrectionRounds: 2,
  reserveUsdPerEvaluation: 0.2,
  reserveUsdPerRewrite: 0.15,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AL_BUDGET = {
  maxUsd: 0.5,
  maxCampaignEvals: 4,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.12,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AU_BUDGET = {
  maxUsd: 0,
  maxPaidGenerations: 0,
  maxCampaignEvals: 0,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AT_BUDGET = {
  maxUsd: 1,
  maxPaidGenerations: 1,
  maxCampaignEvals: 2,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.2,
  reserveUsdPerGeneration: 0.25,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AW_BUDGET = {
  maxUsd: 1,
  maxPaidGenerations: 0,
  maxCampaignEvals: 10,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.15,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AX_BUDGET = {
  maxUsd: 0,
  maxPaidGenerations: 0,
  maxCampaignEvals: 0,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AY_MAX_AI_COST_USD = 0.5;

export const EXECUTION_54AY_BUDGET = {
  maxUsd: EXECUTION_54AY_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 4,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54AZ_MAX_AI_COST_USD = 0.5;

export const EXECUTION_54AZ_BUDGET = {
  maxUsd: EXECUTION_54AZ_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 4,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BA_MAX_AI_COST_USD = 0.5;

export const EXECUTION_54BA_BUDGET = {
  maxUsd: EXECUTION_54BA_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 4,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BB_MAX_AI_COST_USD = 0.3;

export const EXECUTION_54BB_BUDGET = {
  maxUsd: EXECUTION_54BB_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 6,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BD_MAX_AI_COST_USD = 0.3;

export const EXECUTION_54BD_BUDGET = {
  maxUsd: EXECUTION_54BD_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 6,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BE_MAX_AI_COST_USD = 0.3;

export const EXECUTION_54BE_BUDGET = {
  maxUsd: EXECUTION_54BE_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 6,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BF_MAX_AI_COST_USD = 0.3;

export const EXECUTION_54BF_BUDGET = {
  maxUsd: EXECUTION_54BF_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 6,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BG_MAX_AI_COST_USD = 0;

export const EXECUTION_54BG_BUDGET = {
  maxUsd: EXECUTION_54BG_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 0,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BH_MAX_AI_COST_USD = 0.3;

export const EXECUTION_54BH_BUDGET = {
  maxUsd: EXECUTION_54BH_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 6,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export const EXECUTION_54BI_MAX_AI_COST_USD = 0.3;

export const EXECUTION_54BI_BUDGET = {
  maxUsd: EXECUTION_54BI_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxCampaignEvals: 6,
  maxCorrectionRounds: 0,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
} as const;

export type QualityBudgetLedger = {
  scope: string;
  provider: "openai";
  maxUsd: number;
  spentUsd: number;
  evaluationCount: number;
  correctionCount: number;
  calls: Array<{ at: string; inputTokens: number; outputTokens: number; estimatedUsd: number }>;
};

export function emptyBudgetLedger(scope = "54AB"): QualityBudgetLedger {
  return {
    scope,
    provider: "openai",
    maxUsd: OPENAI_LOOP_BUDGET.maxUsd,
    spentUsd: 0,
    evaluationCount: 0,
    correctionCount: 0,
    calls: [],
  };
}

function fileOf(scope: string): string {
  return path.join(qualityAssessmentRoot(), `budget-${scope}.json`);
}

export function readBudgetLedger(scope = "54AB"): QualityBudgetLedger {
  const file = fileOf(scope);
  if (!existsSync(file)) return emptyBudgetLedger(scope);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as QualityBudgetLedger;
  } catch {
    return emptyBudgetLedger(scope);
  }
}

export function writeBudgetLedger(ledger: QualityBudgetLedger): QualityBudgetLedger {
  mkdirSync(qualityAssessmentRoot(), { recursive: true });
  writeFileSync(fileOf(ledger.scope), `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

export function budgetAllowsCall(ledger: QualityBudgetLedger, reserveUsd = OPENAI_LOOP_BUDGET.reserveUsdPerEvaluation): {
  allowed: boolean;
  reason: string;
} {
  if (ledger.evaluationCount >= OPENAI_LOOP_BUDGET.maxEvaluations) {
    return { allowed: false, reason: `Evaluation cap ${OPENAI_LOOP_BUDGET.maxEvaluations} reached.` };
  }
  if (ledger.spentUsd + reserveUsd > ledger.maxUsd + 1e-9) {
    return { allowed: false, reason: `Budget $${ledger.maxUsd.toFixed(2)} would be exceeded.` };
  }
  return { allowed: true, reason: "Within budget." };
}

export function recordBudgetSpend(ledger: QualityBudgetLedger, input: { inputTokens: number; outputTokens: number; estimatedUsd: number }): QualityBudgetLedger {
  const next: QualityBudgetLedger = {
    ...ledger,
    spentUsd: Number((ledger.spentUsd + input.estimatedUsd).toFixed(6)),
    evaluationCount: ledger.evaluationCount + 1,
    calls: [...ledger.calls, { at: new Date().toISOString(), ...input }],
  };
  return writeBudgetLedger(next);
}
