export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertRuntimeEnv } = await import("@/lib/env");
  const { logEvent } = await import("@/lib/logger");
  try {
    assertRuntimeEnv();
  } catch (err) {
    logEvent("ERROR", "APPLICATION", err instanceof Error ? err.message : "env invalid");
    throw err;
  }
}
