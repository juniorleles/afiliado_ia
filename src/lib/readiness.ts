import { collectEnvIssues, configuredOrigin, getAppEnv, isProduction, mediaStorageKind, originIsHttps } from "@/lib/env";
import { adminAuthRequired, adminPasswordConfigured } from "@/lib/admin-auth";
import { getClickBankInsSecret } from "@/lib/clickbank";
import { getDb, schemaVersion } from "@/lib/db";
import { getMediaStorage } from "@/lib/storage";

export type ReadinessFlag = "READY" | "OPTIONAL" | "MISSING";

export type ReadinessReport = {
  DATABASE: ReadinessFlag;
  MEDIA_STORAGE: ReadinessFlag;
  APP_BASE_URL: ReadinessFlag;
  HTTPS_CONFIG: ReadinessFlag;
  CLICKBANK_INS: ReadinessFlag;
  AI_PROVIDER: ReadinessFlag;
  ADMIN_AUTH: ReadinessFlag;
  MIGRATIONS: ReadinessFlag;
  BACKUP_STRATEGY: ReadinessFlag;
  ENV: ReturnType<typeof getAppEnv>;
};

export function productionReadiness(): ReadinessReport {
  const origin = configuredOrigin();
  let database: ReadinessFlag = "MISSING";
  let migrations: ReadinessFlag = "MISSING";
  try {
    getDb().prepare("SELECT 1 AS ok").get();
    database = "READY";
    migrations = schemaVersion() >= 1 ? "READY" : "MISSING";
  } catch {
    database = "MISSING";
  }
  let media: ReadinessFlag = "MISSING";
  try {
    getMediaStorage();
    media = "READY";
  } catch {
    media = "MISSING";
  }
  return {
    DATABASE: database,
    MEDIA_STORAGE: media,
    APP_BASE_URL: origin ? "READY" : isProduction() ? "MISSING" : "OPTIONAL",
    HTTPS_CONFIG: origin && originIsHttps(origin) ? "READY" : isProduction() ? "MISSING" : "OPTIONAL",
    CLICKBANK_INS: getClickBankInsSecret() ? "READY" : isProduction() ? "MISSING" : "OPTIONAL",
    AI_PROVIDER: process.env.ANTHROPIC_API_KEY?.trim() ? "READY" : "OPTIONAL",
    ADMIN_AUTH: adminAuthRequired() && adminPasswordConfigured() ? "READY" : isProduction() ? "MISSING" : "OPTIONAL",
    MIGRATIONS: migrations,
    BACKUP_STRATEGY: "READY",
    ENV: getAppEnv(),
  };
}

export function readinessFatal(): boolean {
  return collectEnvIssues().some((issue) => issue.fatal);
}
