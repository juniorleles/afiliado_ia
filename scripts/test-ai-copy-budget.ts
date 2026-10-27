// npx tsx scripts/test-ai-copy-budget.ts
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  acquireBudgetLock,
  closeAuthorization,
  conservativeInputTokens,
  createBudgetGatedCopyCaller,
  openExecutionLedger,
  paidCallsBlocked,
  releaseBudgetLock,
  reservePaidCall,
  budgetStore,
  worstCaseCostUsd,
  MAX_TOTAL_COST_USD,
} from "../src/lib/lp-generator/ai-copy/budget.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

async function main() {
  const root = mkdtempSync(path.join(os.tmpdir(), "budget53c-"));
  const store = budgetStore("execution-53c-test", root);

  const opened = openExecutionLedger(store);
  assert(opened.status === "OPEN", "ledger opens as OPEN");
  assert(opened.maxTotalCostUsd === MAX_TOTAL_COST_USD, "max cost is $0.05");
  assert(opened.maxApiAttempts === 1, "one API attempt");
  assert(opened.maxPaidGenerations === 1, "one paid generation");

  const small = conservativeInputTokens(["short prompt"]);
  const smallWorst = worstCaseCostUsd(small);
  assert(smallWorst <= MAX_TOTAL_COST_USD, "a small prompt stays inside the cap");

  const huge = conservativeInputTokens(["x".repeat(500_000)]);
  const blocked = reservePaidCall(store, { inputTokensConservative: huge });
  assert(blocked.ok === false, "oversized prompt is blocked before any call");
  assert(blocked.reason === "BLOCKED_OVER_BUDGET", "over-budget reason is recorded");
  assert(blocked.ledger.status === "BLOCKED_OVER_BUDGET", "ledger records BLOCKED_OVER_BUDGET");

  const store2 = budgetStore("execution-53c-ok", root);
  openExecutionLedger(store2);
  const reserved = reservePaidCall(store2, { inputTokensConservative: 4000 });
  assert(reserved.ok === true, "in-budget prompt can be reserved");
  assert(reserved.ledger.status === "RESERVED", "ledger is RESERVED before the HTTP call");
  assert((reserved.ledger.reserved?.worstCaseUsd ?? 1) <= MAX_TOTAL_COST_USD, "reservation stores worst-case cost");

  let calls = 0;
  const gated = createBudgetGatedCopyCaller({
    store: store2,
    inner: async () => {
      calls += 1;
      return {
        text: "{\"headline\":\"Northridge Capsules\",\"introduction\":\"A dietary supplement.\"}",
        latencyMs: 9,
        usage: { inputTokens: 1200, outputTokens: 400, cachedInputTokens: 0, reasoningTokens: 80, totalTokens: 1600 },
        requestId: "resp_test_1",
        costEstimate: "$0.001100",
      };
    },
  });
  const first = await gated({ system: "s", user: "u", schema: {}, timeoutMs: 1000 });
  assert(calls === 1, "first gated call reaches the inner provider");
  assert(first.requestId === "resp_test_1", "request id is preserved");
  assert(paidCallsBlocked(store2) === true, "further paid calls are blocked after the first attempt");

  let secondError = "";
  try {
    await gated({ system: "s", user: "u", schema: {}, timeoutMs: 1000 });
  } catch (err) {
    secondError = err instanceof Error ? err.message : String(err);
  }
  assert(calls === 1, "second gated call does not hit the inner provider");
  assert(/PAID_CALL_BLOCKED|PAID_ATTEMPT_CONSUMED/.test(secondError), "second call is refused locally");

  const store3 = budgetStore("execution-53c-timeout", root);
  openExecutionLedger(store3);
  reservePaidCall(store3, { inputTokensConservative: 2000 });
  const timed = createBudgetGatedCopyCaller({
    store: store3,
    inner: async () => {
      throw new Error("timeout");
    },
  });
  let timeoutCaught = false;
  try {
    await timed({ system: "s", user: "u", schema: {}, timeoutMs: 1000 });
  } catch {
    timeoutCaught = true;
  }
  assert(timeoutCaught, "timeout surfaces to the caller");
  assert(paidCallsBlocked(store3) === true, "timeout still consumes the paid attempt");

  const store4 = budgetStore("execution-53c-lock", root);
  const fd = acquireBudgetLock(store4);
  let lockError = "";
  try {
    acquireBudgetLock(store4);
  } catch (err) {
    lockError = err instanceof Error ? err.message : String(err);
  }
  releaseBudgetLock(store4, fd);
  assert(lockError.includes("BUDGET_LOCK_HELD"), "persistent lock blocks a concurrent attempt");

  closeAuthorization(store2, "test close");
  assert(paidCallsBlocked(store2), "closed authorization stays blocked");

  console.log("MOCK_TEST_PASS");
  console.log(`PASS ${passed} assertions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
