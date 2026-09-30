import { getAppEnv, type AppEnv } from "@/lib/env";

/** Lab and visual-frame routes are open without a credential only outside production. */
export function labRoutesOpenWithoutCredential(env: AppEnv = getAppEnv()): boolean {
  return env !== "production";
}

/**
 * Admin session is skipped only in test (unless AIA_REQUIRE_ADMIN=1)
 * and in development when ADMIN_PASSWORD is empty.
 * AIA_ENV=production never bypasses, even if NODE_ENV is production and no password is set.
 */
export function adminAuthBypassed(
  env: AppEnv = getAppEnv(),
  passwordConfigured = Boolean(process.env.ADMIN_PASSWORD?.trim()),
): boolean {
  if (env === "test" && process.env.AIA_REQUIRE_ADMIN !== "1") return true;
  if (env === "development" && !passwordConfigured) return true;
  return false;
}
