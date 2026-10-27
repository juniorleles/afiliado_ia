import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import {
  COPY_MAX_OUTPUT_TOKENS,
  OPENAI_INPUT_USD_PER_MILLION,
  OPENAI_OUTPUT_USD_PER_MILLION,
  OPENAI_RESPONSES_URL,
  OPENAI_TEXT_MODEL,
  redactSecrets,
} from "@/lib/lp-generator/ai-copy/config";
import type { AiCopyCaller } from "@/lib/lp-generator/ai-copy/types";

export const EXECUTION_53C_ID = "execution-53c";
export const EXECUTION_53D_ID = "execution-53d";
export const EXECUTION_53F_ID = "execution-53f";
export const EXPECTED_53E_KEY_SHA25612 = "65b4ff8f05fd";
export const MAX_TOTAL_COST_USD = 0.05;
export const MAX_PAID_GENERATIONS = 1;
export const MAX_API_ATTEMPTS = 1;
export const MAX_OUTPUT_TOKENS = COPY_MAX_OUTPUT_TOKENS;
export const PAID_COPY_TIMEOUT_MS = 60_000;
export const ADDITIONAL_CHARGE_BUFFER_USD = 0.005;
export const OPENAI_CACHED_INPUT_USD_PER_MILLION = 0.025;
export const DEFAULT_BUDGET_ROOT = path.join(process.cwd(), "data", "ai-copy-budget");

export type BudgetStatus =
  | "OPEN"
  | "RESERVED"
  | "CONSUMING"
  | "CONSUMED"
  | "CLOSED"
  | "BLOCKED_OVER_BUDGET";

export type CostStatus = "CALCULATED" | "COST_UNVERIFIED" | "NOT_CHARGED";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type BudgetLedger = {
  executionId: string;
  status: BudgetStatus;
  maxTotalCostUsd: number;
  maxPaidGenerations: number;
  maxApiAttempts: number;
  maxOutputTokens: number;
  paidRequestCount: number;
  model: string;
  endpoint: string;
  reserved: {
    at: string;
    inputTokensConservative: number;
    maxOutputTokens: number;
    additionalBufferUsd: number;
    worstCaseUsd: number;
  } | null;
  result: {
    at: string;
    requestId: string | null;
    usage: TokenUsage | null;
    calculatedCostUsd: number | null;
    costStatus: CostStatus;
    httpOk: boolean | null;
    httpStatus: number | null;
    error: string | null;
  } | null;
  closedAt: string | null;
  notes: string[];
};

export type BudgetStore = {
  root: string;
  executionId: string;
};

function usd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function budgetStore(executionId = EXECUTION_53C_ID, root = DEFAULT_BUDGET_ROOT): BudgetStore {
  return { root, executionId };
}

export function ledgerPath(store: BudgetStore): string {
  return path.join(store.root, `${store.executionId}.json`);
}

export function lockPath(store: BudgetStore): string {
  return path.join(store.root, `${store.executionId}.lock`);
}

export function emptyLedger(executionId: string): BudgetLedger {
  return {
    executionId,
    status: "OPEN",
    maxTotalCostUsd: MAX_TOTAL_COST_USD,
    maxPaidGenerations: MAX_PAID_GENERATIONS,
    maxApiAttempts: MAX_API_ATTEMPTS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    paidRequestCount: 0,
    model: OPENAI_TEXT_MODEL,
    endpoint: OPENAI_RESPONSES_URL,
    reserved: null,
    result: null,
    closedAt: null,
    notes: [],
  };
}

export function conservativeTokenCount(text: string): number {
  const bytes = Buffer.byteLength(text, "utf8");
  return Math.ceil(bytes / 2) + 8;
}

export function conservativeInputTokens(parts: string[]): number {
  return parts.reduce((sum, part) => sum + conservativeTokenCount(part), 64);
}

export function worstCaseCostUsd(inputTokensConservative: number, maxOutputTokens = MAX_OUTPUT_TOKENS): number {
  const input = (Math.max(0, inputTokensConservative) / 1_000_000) * OPENAI_INPUT_USD_PER_MILLION;
  const output = (Math.max(0, maxOutputTokens) / 1_000_000) * OPENAI_OUTPUT_USD_PER_MILLION;
  return usd(input + output + ADDITIONAL_CHARGE_BUFFER_USD);
}

export function calculateOpenAiCostUsd(usage: TokenUsage): number {
  const cached = Math.min(Math.max(0, usage.cachedInputTokens), Math.max(0, usage.inputTokens));
  const uncached = Math.max(0, usage.inputTokens) - cached;
  const output = Math.max(0, usage.outputTokens);
  return usd(
    (uncached / 1_000_000) * OPENAI_INPUT_USD_PER_MILLION +
      (cached / 1_000_000) * OPENAI_CACHED_INPUT_USD_PER_MILLION +
      (output / 1_000_000) * OPENAI_OUTPUT_USD_PER_MILLION,
  );
}

function writeAtomic(file: string, body: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, body, "utf8");
  try {
    renameSync(tmp, file);
  } catch {
    writeFileSync(file, body, "utf8");
    try {
      unlinkSync(tmp);
    } catch {
      /* leftover tmp */
    }
  }
}

export function readLedger(store: BudgetStore): BudgetLedger | null {
  const file = ledgerPath(store);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BudgetLedger;
  } catch {
    return null;
  }
}

export function writeLedger(store: BudgetStore, ledger: BudgetLedger): void {
  writeAtomic(ledgerPath(store), `${JSON.stringify(ledger, null, 2)}\n`);
}

export function acquireBudgetLock(store: BudgetStore): number {
  mkdirSync(store.root, { recursive: true });
  try {
    const fd = openSync(lockPath(store), constants.O_CREAT | constants.O_EXCL | constants.O_RDWR);
    writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), executionId: store.executionId }));
    return fd;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
    if (code === "EEXIST") throw new Error("BUDGET_LOCK_HELD: a paid copy attempt is already in progress.");
    throw err;
  }
}

export function releaseBudgetLock(store: BudgetStore, fd: number | null): void {
  if (fd != null) {
    try {
      closeSync(fd);
    } catch {
      /* already closed */
    }
  }
  try {
    unlinkSync(lockPath(store));
  } catch {
    /* missing lock */
  }
}

function withLock<T>(store: BudgetStore, fn: () => T): T {
  const fd = acquireBudgetLock(store);
  try {
    return fn();
  } finally {
    releaseBudgetLock(store, fd);
  }
}

export function openExecutionLedger(store: BudgetStore): BudgetLedger {
  return withLock(store, () => {
    const existing = readLedger(store);
    if (existing) {
      if (existing.status === "OPEN" || (existing.status === "RESERVED" && existing.paidRequestCount === 0)) {
        return existing;
      }
      throw new Error(`BUDGET_NOT_OPEN: ledger status is ${existing.status}.`);
    }
    const ledger = emptyLedger(store.executionId);
    writeLedger(store, ledger);
    return ledger;
  });
}

export function reservePaidCall(
  store: BudgetStore,
  input: { inputTokensConservative: number; model?: string; now?: () => string },
): { ok: true; ledger: BudgetLedger } | { ok: false; ledger: BudgetLedger; reason: string } {
  return withLock(store, () => {
    const ledger = readLedger(store) ?? emptyLedger(store.executionId);
    if (ledger.paidRequestCount >= ledger.maxApiAttempts || ledger.paidRequestCount >= ledger.maxPaidGenerations) {
      ledger.notes.push("Reserve refused: paid attempt already consumed.");
      writeLedger(store, ledger);
      return { ok: false, ledger, reason: "PAID_ATTEMPT_CONSUMED" };
    }
    if (ledger.status === "CONSUMING" || ledger.status === "CONSUMED" || ledger.status === "CLOSED") {
      return { ok: false, ledger, reason: `LEDGER_${ledger.status}` };
    }
    const worstCaseUsd = worstCaseCostUsd(input.inputTokensConservative, ledger.maxOutputTokens);
    ledger.model = input.model || ledger.model;
    ledger.reserved = {
      at: (input.now ?? (() => new Date().toISOString()))(),
      inputTokensConservative: input.inputTokensConservative,
      maxOutputTokens: ledger.maxOutputTokens,
      additionalBufferUsd: ADDITIONAL_CHARGE_BUFFER_USD,
      worstCaseUsd,
    };
    if (worstCaseUsd > ledger.maxTotalCostUsd) {
      ledger.status = "BLOCKED_OVER_BUDGET";
      ledger.notes.push(`Worst-case ${worstCaseUsd} USD exceeds ${ledger.maxTotalCostUsd} USD. No paid call was made.`);
      writeLedger(store, ledger);
      return { ok: false, ledger, reason: "BLOCKED_OVER_BUDGET" };
    }
    ledger.status = "RESERVED";
    writeLedger(store, ledger);
    return { ok: true, ledger };
  });
}

export function closeAuthorization(
  store: BudgetStore,
  note?: string,
  now: () => string = () => new Date().toISOString(),
): BudgetLedger {
  return withLock(store, () => {
    const ledger = readLedger(store) ?? emptyLedger(store.executionId);
    if (ledger.status === "CONSUMING") {
      ledger.result = ledger.result ?? {
        at: now(),
        requestId: null,
        usage: null,
        calculatedCostUsd: null,
        costStatus: "COST_UNVERIFIED",
        httpOk: null,
        httpStatus: null,
        error: "Closed while consuming; usage was not confirmed.",
      };
      ledger.paidRequestCount = Math.max(1, ledger.paidRequestCount);
      ledger.notes.push("Authorization closed while a request was in flight. The attempt stays consumed.");
    } else if (ledger.status === "RESERVED" && ledger.paidRequestCount === 0) {
      ledger.notes.push("Authorization closed before a paid request.");
    }
    if (note) ledger.notes.push(note);
    ledger.closedAt = now();
    ledger.status = "CLOSED";
    writeLedger(store, ledger);
    return ledger;
  });
}

function beginPaidAttempt(store: BudgetStore, now: () => string): BudgetLedger {
  return withLock(store, () => {
    const ledger = readLedger(store);
    if (!ledger) throw new Error("BUDGET_LEDGER_MISSING");
    if (ledger.status === "CONSUMING" && ledger.paidRequestCount >= 1) {
      throw new Error("PAID_ATTEMPT_CONSUMED");
    }
    if (ledger.status !== "RESERVED" || ledger.paidRequestCount >= ledger.maxApiAttempts) {
      throw new Error(`PAID_CALL_BLOCKED:${ledger.status}`);
    }
    ledger.status = "CONSUMING";
    ledger.paidRequestCount = 1;
    ledger.notes.push(`Paid attempt started at ${now()}.`);
    writeLedger(store, ledger);
    return ledger;
  });
}

function finishPaidAttempt(
  store: BudgetStore,
  result: NonNullable<BudgetLedger["result"]>,
): BudgetLedger {
  return withLock(store, () => {
    const ledger = readLedger(store);
    if (!ledger) throw new Error("BUDGET_LEDGER_MISSING");
    ledger.status = "CONSUMED";
    ledger.paidRequestCount = Math.max(1, ledger.paidRequestCount);
    ledger.result = result;
    writeLedger(store, ledger);
    return ledger;
  });
}

export function createBudgetGatedCopyCaller(input: {
  store: BudgetStore;
  inner: AiCopyCaller;
  now?: () => string;
}): AiCopyCaller {
  const now = input.now ?? (() => new Date().toISOString());
  return async (call) => {
    beginPaidAttempt(input.store, now);
    try {
      const result = await input.inner(call);
      const usage = normalizeUsage(result.usage);
      const costStatus: CostStatus = usageReliable(usage) ? "CALCULATED" : "COST_UNVERIFIED";
      finishPaidAttempt(input.store, {
        at: now(),
        requestId: result.requestId ?? null,
        usage,
        calculatedCostUsd: costStatus === "CALCULATED" && usage ? calculateOpenAiCostUsd(usage) : null,
        costStatus,
        httpOk: true,
        httpStatus: result.httpStatus ?? 200,
        error: costStatus === "COST_UNVERIFIED" ? "Provider response lacked reliable usage metrics." : null,
      });
      return result;
    } catch (err) {
      const message = redactSecrets(err instanceof Error ? err.message : "paid copy failed");
      finishPaidAttempt(input.store, {
        at: now(),
        requestId: null,
        usage: null,
        calculatedCostUsd: null,
        costStatus: "COST_UNVERIFIED",
        httpOk: false,
        httpStatus: Number((message.match(/responded (\d{3})/) ?? [])[1]) || null,
        error: message.slice(0, 240),
      });
      throw err;
    }
  };
}

export function paidCallsBlocked(store: BudgetStore): boolean {
  const ledger = readLedger(store);
  if (!ledger) return false;
  return (
    ledger.paidRequestCount >= 1 ||
    ledger.status === "CONSUMING" ||
    ledger.status === "CONSUMED" ||
    ledger.status === "CLOSED" ||
    ledger.status === "BLOCKED_OVER_BUDGET"
  );
}

function normalizeUsage(usage?: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
} | null): TokenUsage | null {
  if (!usage) return null;
  return {
    inputTokens: Number(usage.inputTokens) || 0,
    outputTokens: Number(usage.outputTokens) || 0,
    cachedInputTokens: Number(usage.cachedInputTokens) || 0,
    reasoningTokens: Number(usage.reasoningTokens) || 0,
    totalTokens: Number(usage.totalTokens) || Number(usage.inputTokens || 0) + Number(usage.outputTokens || 0),
  };
}

export function usageReliable(usage: TokenUsage | null): boolean {
  if (!usage) return false;
  return usage.inputTokens > 0 || usage.outputTokens > 0 || usage.totalTokens > 0;
}

export function setEnvLocalFlag(name: string, value: string): { changed: boolean; previous: string | null } {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) {
    writeFileSync(file, `${name}=${value}\n`, "utf8");
    return { changed: true, previous: null };
  }
  const text = readFileSync(file, "utf8");
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let previous: string | null = null;
  let found = false;
  const next = lines.map((line) => {
    if (!line.startsWith(`${name}=`)) return line;
    found = true;
    previous = line.slice(name.length + 1);
    return `${name}=${value}`;
  });
  if (!found) next.push(`${name}=${value}`);
  const body = next.join(nl);
  const changed = body !== text;
  if (changed) writeFileSync(file, body.endsWith(nl) ? body : `${body}${nl}`, "utf8");
  return { changed, previous };
}
