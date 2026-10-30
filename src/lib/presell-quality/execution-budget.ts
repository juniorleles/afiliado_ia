import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  estimateOpenAiVisionUsd,
  OPENAI_VISION_MODEL,
  OPENAI_VISION_PROVIDER_ID,
} from "@/lib/presell-quality/openai-provider";
import {
  OPENAI_INPUT_USD_PER_MILLION,
  OPENAI_OUTPUT_USD_PER_MILLION,
  OPENAI_TEXT_MODEL,
} from "@/lib/lp-generator/ai-copy/config";

export const EXECUTION_54AT_ID = "execution-54at";
export const EXECUTION_54AT_BUDGET = {
  maxUsd: 1,
  maxPaidGenerations: 1,
  maxEvaluations: 2,
  maxCorrectionRounds: 0,
  maxApiAttempts: 3,
  reserveUsdPerEvaluation: 0.2,
  reserveUsdPerGeneration: 0.25,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54AX_ID = "execution-54ax";
export const EXECUTION_54AX_BUDGET = {
  maxUsd: 0,
  maxPaidGenerations: 0,
  maxEvaluations: 0,
  maxCorrectionRounds: 0,
  maxApiAttempts: 0,
  reserveUsdPerEvaluation: 0,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54AZ_ID = "execution-54az";
export const EXECUTION_54AZ_MAX_AI_COST_USD = 0.5;
export const EXECUTION_54AZ_BUDGET = {
  maxUsd: EXECUTION_54AZ_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 4,
  maxCorrectionRounds: 0,
  maxApiAttempts: 4,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BA_ID = "execution-54ba";
export const EXECUTION_54BA_MAX_AI_COST_USD = 0.5;
export const EXECUTION_54BA_BUDGET = {
  maxUsd: EXECUTION_54BA_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 4,
  maxCorrectionRounds: 0,
  maxApiAttempts: 4,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BB_ID = "execution-54bb";
export const EXECUTION_54BB_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BB_BUDGET = {
  maxUsd: EXECUTION_54BB_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BD_ID = "execution-54bd";
export const EXECUTION_54BD_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BD_BUDGET = {
  maxUsd: EXECUTION_54BD_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BE_ID = "execution-54be";
export const EXECUTION_54BE_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BE_BUDGET = {
  maxUsd: EXECUTION_54BE_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BF_ID = "execution-54bf";
export const EXECUTION_54BF_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BF_BUDGET = {
  maxUsd: EXECUTION_54BF_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BG_ID = "execution-54bg";
export const EXECUTION_54BG_MAX_AI_COST_USD = 0;
export const EXECUTION_54BG_BUDGET = {
  maxUsd: EXECUTION_54BG_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 0,
  maxCorrectionRounds: 0,
  maxApiAttempts: 0,
  reserveUsdPerEvaluation: 0,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BH_ID = "execution-54bh";
export const EXECUTION_54BH_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BH_BUDGET = {
  maxUsd: EXECUTION_54BH_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BI_ID = "execution-54bi";
export const EXECUTION_54BI_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BI_BUDGET = {
  maxUsd: EXECUTION_54BI_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BJ_ID = "execution-54bj";
export const EXECUTION_54BJ_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BJ_BUDGET = {
  maxUsd: EXECUTION_54BJ_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BK_ID = "execution-54bk";
export const EXECUTION_54BK_MAX_AI_COST_USD = 0;
export const EXECUTION_54BK_BUDGET = {
  maxUsd: EXECUTION_54BK_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 0,
  maxCorrectionRounds: 0,
  maxApiAttempts: 0,
  reserveUsdPerEvaluation: 0,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BL_ID = "execution-54bl";
export const EXECUTION_54BL_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BL_BUDGET = {
  maxUsd: EXECUTION_54BL_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BM_ID = "execution-54bm";
export const EXECUTION_54BM_MAX_AI_COST_USD = 0;
export const EXECUTION_54BM_BUDGET = {
  maxUsd: EXECUTION_54BM_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 0,
  maxCorrectionRounds: 0,
  maxApiAttempts: 0,
  reserveUsdPerEvaluation: 0,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BN_ID = "execution-54bn";
export const EXECUTION_54BN_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BN_BUDGET = {
  maxUsd: EXECUTION_54BN_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BO_ID = "execution-54bo";
export const EXECUTION_54BO_MAX_AI_COST_USD = 0.3;
export const EXECUTION_54BO_BUDGET = {
  maxUsd: EXECUTION_54BO_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 6,
  maxCorrectionRounds: 0,
  maxApiAttempts: 6,
  reserveUsdPerEvaluation: 0.06,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BP_ID = "execution-54bp";
export const EXECUTION_54BP_MAX_AI_COST_USD = 0.5;
export const EXECUTION_54BP_BUDGET = {
  maxUsd: EXECUTION_54BP_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 3,
  maxCorrectionRounds: 3,
  maxApiAttempts: 3,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BQ_ID = "execution-54bq";
export const EXECUTION_54BQ_MAX_AI_COST_USD = 0.5;
export const EXECUTION_54BQ_BUDGET = {
  maxUsd: EXECUTION_54BQ_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 3,
  maxCorrectionRounds: 3,
  maxApiAttempts: 3,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54BR_ID = "execution-54br";
export const EXECUTION_54BR_MAX_AI_COST_USD = 0.35;
export const EXECUTION_54BR_BUDGET = {
  maxUsd: EXECUTION_54BR_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 3,
  maxCorrectionRounds: 3,
  maxApiAttempts: 3,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54AY_ID = "execution-54ay";
export const EXECUTION_54AY_MAX_AI_COST_USD = 0.5;
export const EXECUTION_54AY_BUDGET = {
  maxUsd: EXECUTION_54AY_MAX_AI_COST_USD,
  maxPaidGenerations: 0,
  maxEvaluations: 4,
  maxCorrectionRounds: 0,
  maxApiAttempts: 4,
  reserveUsdPerEvaluation: 0.12,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export const EXECUTION_54AW_ID = "execution-54aw";
export const EXECUTION_54AW_BUDGET = {
  maxUsd: 1,
  maxPaidGenerations: 0,
  maxEvaluations: 10,
  maxCorrectionRounds: 0,
  maxApiAttempts: 10,
  reserveUsdPerEvaluation: 0.15,
  reserveUsdPerGeneration: 0,
  provider: "openai" as const,
  textModel: OPENAI_TEXT_MODEL,
  visionModel: OPENAI_VISION_MODEL,
} as const;

export type ExecutionBudgetCallKind = "GENERATION" | "EVALUATION" | "OTHER";
export type ExecutionBudgetStatus =
  | "OPEN"
  | "RESERVED"
  | "CONSUMING"
  | "CLOSED"
  | "BLOCKED_OVER_BUDGET"
  | "TIMEOUT_UNVERIFIED";

export type ExecutionBudgetCall = {
  at: string;
  kind: ExecutionBudgetCallKind;
  provider: "openai";
  model: string;
  status: "RESERVED" | "COMPLETED" | "TIMEOUT_UNVERIFIED" | "BLOCKED";
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  reportedUsd: number | null;
  reservedUsd: number;
  note: string;
};

export type ExecutionBudgetLedger = {
  executionId: string;
  provider: "openai";
  model: string | null;
  maxUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  paidCallCount: number;
  evaluationCount: number;
  generationCount: number;
  autoRetryCount: 0;
  status: ExecutionBudgetStatus;
  calls: ExecutionBudgetCall[];
  notes: string[];
  closedAt: string | null;
};

function usd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function remainingBudgetUsd(ledger: ExecutionBudgetLedger): number {
  return usd(Math.max(0, ledger.maxUsd - ledger.spentUsd - ledger.reservedUsd));
}

export function emptyExecutionBudgetLedger(
  executionId = EXECUTION_54AT_ID,
  maxUsd = EXECUTION_54AT_BUDGET.maxUsd,
): ExecutionBudgetLedger {
  return {
    executionId,
    provider: EXECUTION_54AT_BUDGET.provider,
    model: null,
    maxUsd,
    spentUsd: 0,
    reservedUsd: 0,
    remainingUsd: usd(maxUsd),
    paidCallCount: 0,
    evaluationCount: 0,
    generationCount: 0,
    autoRetryCount: 0,
    status: "OPEN",
    calls: [],
    notes: [],
    closedAt: null,
  };
}

export function estimateTextCallUsd(inputTokens: number, outputTokens: number): number {
  return usd(
    (Math.max(0, inputTokens) / 1_000_000) * OPENAI_INPUT_USD_PER_MILLION +
      (Math.max(0, outputTokens) / 1_000_000) * OPENAI_OUTPUT_USD_PER_MILLION,
  );
}

export function estimateVisionCallUsd(inputTokens: number, outputTokens: number): number {
  return usd(estimateOpenAiVisionUsd(inputTokens, outputTokens));
}

export type ExecutionBudgetCaps = {
  maxEvaluations: number;
  maxPaidGenerations: number;
  maxApiAttempts: number;
  reserveUsdPerEvaluation: number;
  reserveUsdPerGeneration: number;
};

export function reserveForKind(kind: ExecutionBudgetCallKind, caps: ExecutionBudgetCaps = EXECUTION_54AT_BUDGET): number {
  if (kind === "EVALUATION") return caps.reserveUsdPerEvaluation;
  if (kind === "GENERATION") return caps.reserveUsdPerGeneration;
  return caps.reserveUsdPerEvaluation;
}

export function budgetAllowsPaidCall(
  ledger: ExecutionBudgetLedger,
  input: { kind: ExecutionBudgetCallKind; reserveUsd?: number; estimatedUsd?: number } = { kind: "EVALUATION" },
  caps: ExecutionBudgetCaps = EXECUTION_54AT_BUDGET,
): { allowed: boolean; reason: string } {
  if (ledger.autoRetryCount !== 0) {
    return { allowed: false, reason: "Automatic paid retries are forbidden." };
  }
  if (ledger.status === "BLOCKED_OVER_BUDGET" || ledger.status === "CLOSED") {
    return { allowed: false, reason: `Ledger status ${ledger.status} blocks further paid calls.` };
  }
  if (ledger.status === "TIMEOUT_UNVERIFIED") {
    return { allowed: false, reason: "A paid call timed out with unverified charge. Automatic retry is blocked." };
  }
  if (ledger.status === "RESERVED" || ledger.status === "CONSUMING") {
    return { allowed: false, reason: "A reserved paid call is already in flight." };
  }
  if (ledger.paidCallCount >= caps.maxApiAttempts) {
    return { allowed: false, reason: `Paid attempt cap ${caps.maxApiAttempts} reached.` };
  }
  if (input.kind === "EVALUATION" && ledger.evaluationCount >= caps.maxEvaluations) {
    return { allowed: false, reason: `Evaluation cap ${caps.maxEvaluations} reached.` };
  }
  if (input.kind === "GENERATION" && ledger.generationCount >= caps.maxPaidGenerations) {
    return { allowed: false, reason: `Paid generation cap ${caps.maxPaidGenerations} reached.` };
  }
  const reserveUsd = usd(input.reserveUsd ?? Math.max(input.estimatedUsd ?? 0, reserveForKind(input.kind, caps)));
  if (ledger.spentUsd + ledger.reservedUsd + reserveUsd > ledger.maxUsd + 1e-9) {
    return { allowed: false, reason: `Budget $${ledger.maxUsd.toFixed(2)} would be exceeded.` };
  }
  return { allowed: true, reason: "Within budget." };
}

export function reservePaidCall(
  ledger: ExecutionBudgetLedger,
  input: {
    kind: ExecutionBudgetCallKind;
    model: string;
    estimatedUsd?: number;
    reserveUsd?: number;
    now?: string;
    caps?: ExecutionBudgetCaps;
  },
): { ok: true; ledger: ExecutionBudgetLedger } | { ok: false; ledger: ExecutionBudgetLedger; reason: string } {
  const caps = input.caps ?? EXECUTION_54AT_BUDGET;
  const gate = budgetAllowsPaidCall(ledger, input, caps);
  if (!gate.allowed) {
    const blocked: ExecutionBudgetLedger = {
      ...ledger,
      status: gate.reason.includes("exceeded") ? "BLOCKED_OVER_BUDGET" : ledger.status,
      notes: [...ledger.notes, gate.reason],
      remainingUsd: remainingBudgetUsd(ledger),
    };
    return { ok: false, ledger: blocked, reason: gate.reason };
  }
  const reservedUsd = usd(input.reserveUsd ?? Math.max(input.estimatedUsd ?? 0, reserveForKind(input.kind, caps)));
  const call: ExecutionBudgetCall = {
    at: input.now ?? new Date().toISOString(),
    kind: input.kind,
    provider: OPENAI_VISION_PROVIDER_ID,
    model: input.model,
    status: "RESERVED",
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: usd(input.estimatedUsd ?? reservedUsd),
    reportedUsd: null,
    reservedUsd,
    note: "Reserved before the paid request.",
  };
  const next: ExecutionBudgetLedger = {
    ...ledger,
    model: input.model,
    reservedUsd: usd(ledger.reservedUsd + reservedUsd),
    status: "RESERVED",
    calls: [...ledger.calls, call],
    remainingUsd: 0,
  };
  next.remainingUsd = remainingBudgetUsd(next);
  return { ok: true, ledger: next };
}

export function consumePaidCall(
  ledger: ExecutionBudgetLedger,
  input: {
    inputTokens: number;
    outputTokens: number;
    estimatedUsd: number;
    reportedUsd?: number | null;
    now?: string;
  },
): ExecutionBudgetLedger {
  const open = [...ledger.calls].reverse().find((item) => item.status === "RESERVED");
  if (!open) {
    return {
      ...ledger,
      notes: [...ledger.notes, "consumePaidCall had no reserved call."],
      remainingUsd: remainingBudgetUsd(ledger),
    };
  }
  const spent = usd(input.reportedUsd ?? input.estimatedUsd);
  const calls = ledger.calls.map((item) =>
    item === open
      ? {
          ...item,
          status: "COMPLETED" as const,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          estimatedUsd: usd(input.estimatedUsd),
          reportedUsd: input.reportedUsd ?? usd(input.estimatedUsd),
          note: "Paid request completed.",
        }
      : item,
  );
  const next: ExecutionBudgetLedger = {
    ...ledger,
    spentUsd: usd(ledger.spentUsd + spent),
    reservedUsd: usd(Math.max(0, ledger.reservedUsd - open.reservedUsd)),
    paidCallCount: ledger.paidCallCount + 1,
    evaluationCount: ledger.evaluationCount + (open.kind === "EVALUATION" ? 1 : 0),
    generationCount: ledger.generationCount + (open.kind === "GENERATION" ? 1 : 0),
    status: "OPEN",
    calls,
    remainingUsd: 0,
  };
  next.remainingUsd = remainingBudgetUsd(next);
  return next;
}

export function consumeReservedAsUnverified(
  ledger: ExecutionBudgetLedger,
  note = "Timeout or unknown charge. Reserved cost is treated as consumed until reconciliation.",
): ExecutionBudgetLedger {
  const open = [...ledger.calls].reverse().find((item) => item.status === "RESERVED");
  if (!open) return ledger;
  const calls = ledger.calls.map((item) =>
    item === open ? { ...item, status: "TIMEOUT_UNVERIFIED" as const, reportedUsd: open.reservedUsd, note } : item,
  );
  const next: ExecutionBudgetLedger = {
    ...ledger,
    spentUsd: usd(ledger.spentUsd + open.reservedUsd),
    reservedUsd: usd(Math.max(0, ledger.reservedUsd - open.reservedUsd)),
    paidCallCount: ledger.paidCallCount + 1,
    evaluationCount: ledger.evaluationCount + (open.kind === "EVALUATION" ? 1 : 0),
    generationCount: ledger.generationCount + (open.kind === "GENERATION" ? 1 : 0),
    status: "TIMEOUT_UNVERIFIED",
    calls,
    notes: [...ledger.notes, note],
    remainingUsd: 0,
  };
  next.remainingUsd = remainingBudgetUsd(next);
  return next;
}

export function closeExecutionBudget(ledger: ExecutionBudgetLedger, note?: string): ExecutionBudgetLedger {
  return {
    ...ledger,
    status: "CLOSED",
    closedAt: new Date().toISOString(),
    notes: note ? [...ledger.notes, note] : ledger.notes,
    remainingUsd: remainingBudgetUsd(ledger),
  };
}

export function readExecutionBudgetLedger(file: string): ExecutionBudgetLedger | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ExecutionBudgetLedger;
  } catch {
    return null;
  }
}

export function writeExecutionBudgetLedger(file: string, ledger: ExecutionBudgetLedger): ExecutionBudgetLedger {
  mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...ledger, remainingUsd: remainingBudgetUsd(ledger) };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
