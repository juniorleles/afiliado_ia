import { envLookup } from "../src/lib/lp-generator/ai-copy/config.ts";
import {
  EXECUTION_53C_ID,
  EXECUTION_53D_ID,
  EXECUTION_53F_ID,
  budgetStore,
  createBudgetGatedCopyCaller,
  paidCallsBlocked,
  readLedger,
} from "../src/lib/lp-generator/ai-copy/budget.ts";

async function main() {
  const store = budgetStore(EXECUTION_53F_ID);
  let second = "";
  try {
    await createBudgetGatedCopyCaller({
      store,
      inner: async () => {
        throw new Error("INNER_MUST_NOT_RUN");
      },
    })({ system: "s", user: "u", schema: {}, timeoutMs: 1000 });
  } catch (err) {
    second = err instanceof Error ? err.message : String(err);
  }
  const report = {
    AIA_ALLOW_PAID_AI: envLookup("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
    execution53f: readLedger(store)?.status ?? "MISSING",
    paidRequestCount: readLedger(store)?.paidRequestCount ?? null,
    paidCallsBlocked: paidCallsBlocked(store),
    secondError: second,
    innerMustNotRun: !second.includes("INNER_MUST_NOT_RUN"),
    execution53c: readLedger(budgetStore(EXECUTION_53C_ID))?.status ?? "MISSING",
    execution53d: readLedger(budgetStore(EXECUTION_53D_ID))?.status ?? "MISSING",
    externalHttp: false,
  };
  console.log(JSON.stringify(report, null, 2));
}

void main();
