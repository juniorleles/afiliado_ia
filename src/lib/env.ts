/**
 * Environment model for Presell OS (Phase 9).
 * Variable names already in use are preserved. Production does not
 * silently fall back to localhost / unauthenticated admin / missing HTTPS.
 */

export type AppEnv = "development" | "test" | "production";
export type EnvClass = "PUBLIC" | "SERVER_ONLY" | "SECRET";

export type EnvVarSpec = {
  name: string;
  cls: EnvClass;
  requiredInProduction: boolean;
  description: string;
};

export const ENV_VAR_SPECS: EnvVarSpec[] = [
  { name: "PUBLIC_SITE_URL", cls: "PUBLIC", requiredInProduction: true, description: "Canonical https origin (alias: APP_BASE_URL)" },
  { name: "APP_BASE_URL", cls: "PUBLIC", requiredInProduction: false, description: "Optional alias of PUBLIC_SITE_URL" },
  { name: "PUBLIC_SITE_NAME", cls: "PUBLIC", requiredInProduction: false, description: "Public site name" },
  { name: "PUBLIC_CONTACT_EMAIL", cls: "PUBLIC", requiredInProduction: false, description: "Public contact email" },
  { name: "PUBLIC_HEALTH_DISCLAIMER", cls: "PUBLIC", requiredInProduction: false, description: "Show health disclaimer (default on)" },
  { name: "ANTHROPIC_API_KEY", cls: "SECRET", requiredInProduction: false, description: "Claude; required only if AI generation is used" },
  { name: "WEB_SEARCH_PROVIDER", cls: "SERVER_ONLY", requiredInProduction: false, description: "duckduckgo (default) | brave | tavily | serpapi | none" },
  { name: "MARKET_RESEARCH_MAX_AGE_HOURS", cls: "SERVER_ONLY", requiredInProduction: false, description: "Market research freshness window (default 24)" },
  { name: "BRAVE_SEARCH_API_KEY", cls: "SECRET", requiredInProduction: false, description: "Optional Brave Search API for source resolution" },
  { name: "BRAVE_API_KEY", cls: "SECRET", requiredInProduction: false, description: "Brave Search API key used as Source Resolution fallback only" },
  { name: "TAVILY_API_KEY", cls: "SECRET", requiredInProduction: false, description: "Optional Tavily Search API for source resolution" },
  { name: "SERPAPI_API_KEY", cls: "SECRET", requiredInProduction: false, description: "Optional SerpAPI for source resolution" },
  { name: "CLICKBANK_INS_SECRET", cls: "SECRET", requiredInProduction: true, description: "ClickBank INS v8 secret" },
  { name: "ADMIN_PASSWORD", cls: "SECRET", requiredInProduction: true, description: "Single-operator admin password" },
  { name: "ADMIN_SESSION_SECRET", cls: "SECRET", requiredInProduction: true, description: "HMAC secret for admin session cookie" },
  { name: "INTERNAL_FRAME_SECRET", cls: "SECRET", requiredInProduction: true, description: "Allows Visual QA Playwright to load /visual-frame" },
  { name: "PRESELL_OS_DB", cls: "SERVER_ONLY", requiredInProduction: false, description: "SQLite file path override" },
  { name: "MEDIA_STORAGE", cls: "SERVER_ONLY", requiredInProduction: false, description: "LOCAL (default) or OBJECT_STORAGE" },
  { name: "S3_BUCKET", cls: "SERVER_ONLY", requiredInProduction: false, description: "Required when MEDIA_STORAGE=OBJECT_STORAGE" },
  { name: "S3_REGION", cls: "SERVER_ONLY", requiredInProduction: false, description: "S3/R2 region" },
  { name: "S3_ENDPOINT", cls: "SERVER_ONLY", requiredInProduction: false, description: "Optional S3-compatible endpoint" },
  { name: "S3_ACCESS_KEY_ID", cls: "SECRET", requiredInProduction: false, description: "Object storage access key" },
  { name: "S3_SECRET_ACCESS_KEY", cls: "SECRET", requiredInProduction: false, description: "Object storage secret key" },
  { name: "VISUAL_QA_BASE_URL", cls: "SERVER_ONLY", requiredInProduction: false, description: "Playwright inspection origin" },
];

const SECRET_NAMES = new Set(ENV_VAR_SPECS.filter((s) => s.cls === "SECRET").map((s) => s.name));

export function getAppEnv(): AppEnv {
  const explicit = (process.env.AIA_ENV || "").trim().toLowerCase();
  if (explicit === "production" || explicit === "test" || explicit === "development") return explicit;
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

export function isProduction(): boolean {
  return getAppEnv() === "production";
}

export function isTestEnv(): boolean {
  return getAppEnv() === "test";
}

function trimEnv(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function configuredOrigin(): string | null {
  const raw = trimEnv("PUBLIC_SITE_URL") || trimEnv("APP_BASE_URL");
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function originIsHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function mediaStorageKind(): "LOCAL" | "OBJECT_STORAGE" {
  const raw = (trimEnv("MEDIA_STORAGE") || "LOCAL").toUpperCase();
  return raw === "OBJECT_STORAGE" ? "OBJECT_STORAGE" : "LOCAL";
}

export type EnvIssue = { name: string; message: string; fatal: boolean };

export function collectEnvIssues(env = getAppEnv()): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const origin = configuredOrigin();
  if (env === "production") {
    if (!origin) {
      issues.push({ name: "PUBLIC_SITE_URL", message: "canonical https origin is required", fatal: true });
    } else if (!originIsHttps(origin)) {
      issues.push({ name: "PUBLIC_SITE_URL", message: "production origin must be https", fatal: true });
    }
    if (!trimEnv("ADMIN_PASSWORD")) {
      issues.push({ name: "ADMIN_PASSWORD", message: "admin password is required", fatal: true });
    }
    if (!trimEnv("ADMIN_SESSION_SECRET") || (trimEnv("ADMIN_SESSION_SECRET") || "").length < 16) {
      issues.push({ name: "ADMIN_SESSION_SECRET", message: "session HMAC secret (>=16 chars) is required", fatal: true });
    }
    if (!trimEnv("CLICKBANK_INS_SECRET")) {
      issues.push({ name: "CLICKBANK_INS_SECRET", message: "ClickBank INS secret is required", fatal: true });
    }
    if (!trimEnv("INTERNAL_FRAME_SECRET") || (trimEnv("INTERNAL_FRAME_SECRET") || "").length < 16) {
      issues.push({ name: "INTERNAL_FRAME_SECRET", message: "internal Visual QA frame secret is required", fatal: true });
    }
    if (mediaStorageKind() === "OBJECT_STORAGE") {
      for (const name of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
        if (!trimEnv(name)) issues.push({ name, message: "required when MEDIA_STORAGE=OBJECT_STORAGE", fatal: true });
      }
    }
  }
  return issues;
}

export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_PHASE === "phase-production-compile";
}

export function assertRuntimeEnv(): void {
  if (isBuildPhase()) return;
  const issues = collectEnvIssues();
  const fatal = issues.filter((i) => i.fatal);
  if (fatal.length === 0) return;
  const lines = fatal.map((i) => `${i.name}: ${i.message}`).join("; ");
  throw new Error(`Production environment is incomplete (${lines}).`);
}

export function secretNameSet(): Set<string> {
  return SECRET_NAMES;
}

export function looksLikeSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (SECRET_NAMES.has(key) || SECRET_NAMES.has(upper)) return true;
  return /SECRET|PASSWORD|API_KEY|ACCESS_KEY|TOKEN|PRIVATE/i.test(key);
}
