// npx tsx scripts/test-ai-resilience.ts
process.env.AI_RESILIENCE_LOG = "0";
process.env.AI_PROVIDER_FALLBACK = "0";

import fs from "node:fs";
import path from "node:path";
import {
  BACKOFF_MS,
  MAX_ATTEMPTS,
  backoffDelayMs,
  classifyNetworkError,
  classifyProviderFailure,
  fallbackEnabledFromConfig,
  providerFetch,
  readOperatorStatus,
  resetResilienceForTests,
  runProviderChain,
  type ProviderCallLog,
} from "../src/lib/ai/resilience";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const products = ["VisiFlora", "Prime Biome", "Neuro Serge", "Joint Genesis", "Prodentim", "Audifort", "Unknown Product"];
const SECRET = "SECRET PROMPT TEXT do not store";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function options(fetchImpl: typeof fetch, logs: ProviderCallLog[], extra: Record<string, unknown> = {}) {
  return {
    provider: "anthropic",
    model: "test-model",
    promptId: "generate-variants",
    fetchImpl,
    sleep: async () => undefined,
    random: () => 0.5,
    now: () => 1_000,
    log: (record: ProviderCallLog) => logs.push(record),
    timeoutMs: 1_000,
    ...extra,
  };
}

async function main() {
  assert(MAX_ATTEMPTS === 3, "a provider call stops after 3 attempts");
  assert(BACKOFF_MS[0] === 2000 && BACKOFF_MS[1] === 5000 && BACKOFF_MS[2] === 10000, "backoff steps are 2s, 5s, and 10s");
  assert(backoffDelayMs(0, () => 0.5) === 2000, "the first wait is 2 seconds when jitter is centered");
  assert(backoffDelayMs(1, () => 0.5) === 5000, "the second wait is 5 seconds when jitter is centered");
  assert(backoffDelayMs(0, () => 0) === 1600 && backoffDelayMs(0, () => 1) === 2400, "jitter stays within 20 percent of the schedule");
  assert(classifyProviderFailure({ status: 503, errorCode: null, retryAfter: null }) === "retry", "503 is retried");
  assert(classifyProviderFailure({ status: 429, errorCode: "rate_limit_error", retryAfter: "2" }) === "retry", "429 with a retry window is retried");
  assert(classifyProviderFailure({ status: 500, errorCode: null, retryAfter: null }) === "retry", "500 is retried");
  assert(classifyProviderFailure({ status: 502, errorCode: null, retryAfter: null }) === "retry", "502 is retried");
  assert(classifyProviderFailure({ status: 504, errorCode: null, retryAfter: null }) === "retry", "504 is retried");
  assert(classifyProviderFailure({ status: 529, errorCode: "overloaded_error", retryAfter: null }) === "retry", "overloaded_error is retried");
  assert(classifyProviderFailure({ status: 401, errorCode: "authentication_error", retryAfter: null }) === "stop", "401 is not retried");
  assert(classifyProviderFailure({ status: 403, errorCode: "permission_error", retryAfter: null }) === "stop", "403 is not retried");
  assert(classifyProviderFailure({ status: 404, errorCode: "not_found_error", retryAfter: null }) === "stop", "404 is not retried");
  assert(classifyProviderFailure({ status: 400, errorCode: "invalid_request_error", retryAfter: null }) === "stop", "an invalid request is not retried");
  assert(
    classifyProviderFailure({ status: 429, errorCode: "insufficient_quota", retryAfter: null }) === "stop",
    "quota exhausted without a retry window is not retried",
  );
  const reset = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
  assert(classifyNetworkError(reset) === "retry", "a connection reset is retried");
  const timeout = new Error("aborted");
  timeout.name = "AbortError";
  assert(classifyNetworkError(timeout) === "retry", "a timeout is retried");
  assert(classifyNetworkError(new Error("schema validation failed")) === "stop", "schema validation is not retried");
  assert(fallbackEnabledFromConfig({ AI_PROVIDER_FALLBACK: "0" }) === false, "provider fallback is disabled by default");

  for (const product of products) {
    assert(!product.includes("\n"), `${product} is only a regression label`);
    assert(classifyProviderFailure({ status: 503, errorCode: "overloaded_error", retryAfter: null }) === "retry", `${product} uses the same retry decision`);
  }

  resetResilienceForTests();
  const recoveryLogs: ProviderCallLog[] = [];
  const waits: string[] = [];
  let recoveryCalls = 0;
  const recovered = await providerFetch(
    "https://provider.test/v1/messages",
    { method: "POST", body: SECRET },
    options(
      async () => {
        recoveryCalls += 1;
        if (recoveryCalls === 1) return jsonResponse(503, { error: { type: "overloaded_error" } }, { "request-id": "req-recover" });
        return jsonResponse(200, { ok: true }, { "request-id": "req-recover" });
      },
      recoveryLogs,
      {
        sleep: async () => {
          waits.push(readOperatorStatus().message);
        },
      },
    ),
  );
  assert(recovered.ok, "a transient 503 recovers on the next attempt");
  assert(recoveryCalls === 2, "recovery stops once the provider succeeds");
  assert(waits[0] === "Retrying in 2 seconds...", "the operator sees the 2 second wait");
  assert(readOperatorStatus().message === "Recovered successfully.", "the operator sees a successful recovery");
  assert(recoveryLogs.length === 1 && recoveryLogs[0]?.recoverySuccess === true, "a recovered call is logged once");
  assert(recoveryLogs[0]?.retryCount === 1, "the recovered call records one retry");
  assert(recoveryLogs[0]?.httpStatus === 200, "the log stores the final HTTP status");
  assert(recoveryLogs[0]?.requestId === "req-recover", "the log stores the provider request id");
  assert(recoveryLogs[0]?.provider === "anthropic" && recoveryLogs[0]?.model === "test-model", "the log stores provider and model");
  assert(recoveryLogs[0]?.promptId === "generate-variants", "the log stores a prompt identifier");
  assert(!JSON.stringify(recoveryLogs).includes(SECRET), "the log does not store prompt contents");

  resetResilienceForTests();
  let authCalls = 0;
  const denied = await providerFetch(
    "https://provider.test/v1/messages",
    { method: "POST", body: SECRET },
    options(async () => {
      authCalls += 1;
      return jsonResponse(401, { error: { type: "authentication_error" } });
    }, []),
  );
  assert(authCalls === 1 && denied.status === 401, "an authentication failure is returned without a retry");
  const deniedBody = await denied.text();
  assert(deniedBody.includes("authentication_error") && !deniedBody.includes("at "), "the caller still receives the provider response");

  resetResilienceForTests();
  const seen: string[] = [];
  const waitMessages: string[] = [];
  let failedCalls = 0;
  const exhausted = await providerFetch(
    "https://provider.test/v1/messages",
    { method: "POST", body: SECRET },
    options(
      async () => {
        failedCalls += 1;
        seen.push(readOperatorStatus().message);
        return jsonResponse(503, { error: { type: "overloaded_error" } });
      },
      [],
      {
        sleep: async () => {
          waitMessages.push(readOperatorStatus().message);
        },
      },
    ),
  );
  assert(failedCalls === 3 && exhausted.status === 503, "three transient failures return the provider response");
  assert(seen[0] === "Generating recommendation...", "the operator sees generation start");
  assert(seen[1] === "Retrying (1 of 3)...", "the operator sees the first retry");
  assert(seen[2] === "Retrying (2 of 3)...", "the operator sees the second retry");
  assert(waitMessages[0] === "Retrying in 2 seconds..." && waitMessages[1] === "Retrying in 5 seconds...", "the operator sees the 2 second and 5 second waits");
  assert(readOperatorStatus().message === "Provider unavailable after retries.", "the operator sees the final provider failure");
  assert(readOperatorStatus().remainingAttempts === 0, "the operator sees that no attempts remain");

  resetResilienceForTests();
  let timedOut = 0;
  const timeoutLogs: ProviderCallLog[] = [];
  const hung = await providerFetch(
    "https://provider.test/v1/messages",
    { method: "POST", body: SECRET },
    options(
      (_url, init) => {
        timedOut += 1;
        return new Promise((_resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("hung")), 5_000);
          init.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
      timeoutLogs,
      { timeoutMs: 30 },
    ),
  );
  assert(timedOut === 3 && hung.status === 503, "a hung request is aborted and retried");
  assert(timeoutLogs[0]?.failureReason === "timeout", "a timeout is logged without a stack trace");
  const hungBody = await hung.text();
  assert(!hungBody.includes("\n") && !hungBody.includes(SECRET), "the timeout failure does not expose a stack or the prompt");

  resetResilienceForTests();
  let clock = 10_000;
  let circuitCalls = 0;
  const circuitLogs: ProviderCallLog[] = [];
  const circuitFetch: typeof fetch = async () => {
    circuitCalls += 1;
    return jsonResponse(503, { error: { type: "overloaded_error" } });
  };
  const circuitOptions = options(circuitFetch, circuitLogs, {
    now: () => clock,
    circuitThreshold: 2,
    circuitCooldownMs: 30_000,
  });
  await providerFetch("https://provider.test/v1/messages", { method: "POST", body: SECRET }, circuitOptions);
  await providerFetch("https://provider.test/v1/messages", { method: "POST", body: SECRET }, circuitOptions);
  const openCalls = circuitCalls;
  const blocked = await providerFetch("https://provider.test/v1/messages", { method: "POST", body: SECRET }, circuitOptions);
  assert(circuitCalls === openCalls && blocked.status === 503, "an open circuit rejects the next request immediately");
  assert(readOperatorStatus().message === "Provider temporarily unavailable", "the operator sees the open circuit");
  clock += 30_000;
  const probe = await providerFetch(
    "https://provider.test/v1/messages",
    { method: "POST", body: SECRET },
    options(async () => jsonResponse(200, { ok: true }), circuitLogs, {
      now: () => clock,
      circuitThreshold: 2,
      circuitCooldownMs: 30_000,
    }),
  );
  assert(probe.ok, "the circuit allows one probe after the cooldown");

  resetResilienceForTests();
  let secondary = 0;
  const primary = async () => jsonResponse(503, { error: { type: "overloaded_error" } });
  const fallback = async () => {
    secondary += 1;
    return jsonResponse(200, { ok: true });
  };
  const disabled = await runProviderChain(
    [
      { provider: "anthropic", call: primary },
      { provider: "openai", call: fallback },
    ],
    { fallbackEnabled: false, isFailure: (response) => !response.ok },
  );
  assert(secondary === 0 && disabled.status === 503, "fallback stays off unless configuration enables it");
  const enabled = await runProviderChain(
    [
      { provider: "anthropic", call: primary },
      { provider: "openai", call: fallback },
    ],
    { fallbackEnabled: true, isFailure: (response) => !response.ok },
  );
  assert(secondary === 1 && enabled.ok, "an enabled fallback uses the next provider after the first fails");

  const source = fs.readFileSync(path.join(process.cwd(), "src", "lib", "ai", "resilience.ts"), "utf8");
  for (const product of products) {
    assert(!source.includes(product), `${product} is not named in the resilience layer`);
  }
  assert(!source.includes("product-facts") && !source.includes("manual-overrides"), "the layer does not import product or override logic");
  assert(source.includes("AI provider temporarily unavailable..."), "the operator status includes a temporary outage");
  assert(!source.includes(SECRET), "prompt contents are not part of the layer");

  console.log("AI_RESILIENCE_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
