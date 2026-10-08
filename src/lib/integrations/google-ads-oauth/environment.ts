/**
 * Google Ads OAuth environment.
 *
 * Reads names from the process environment. Values stay on the server.
 */
import { getAppEnv, type AppEnv } from "@/lib/env";

export type GoogleAdsEnvironment = {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  developerToken: string | null;
  loginCustomerId: string | null;
  cloudProject: string | null;
  appEnv: AppEnv;
};

function trimEnv(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function customerId(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/-/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

function projectId(value: string | null): string | null {
  if (!value) return null;
  if (value.length > 80 || /\s/.test(value)) return null;
  return value;
}

export function readGoogleAdsEnvironment(): GoogleAdsEnvironment {
  return {
    clientId: trimEnv("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: trimEnv("GOOGLE_ADS_CLIENT_SECRET"),
    redirectUri: httpUrl(trimEnv("GOOGLE_ADS_REDIRECT_URI")),
    developerToken: trimEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    loginCustomerId: customerId(trimEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID")),
    cloudProject: projectId(trimEnv("GOOGLE_CLOUD_PROJECT") ?? trimEnv("GOOGLE_ADS_CLOUD_PROJECT")),
    appEnv: getAppEnv(),
  };
}

export function googleAdsEnvironmentReady(env: GoogleAdsEnvironment): boolean {
  return Boolean(env.clientId && env.clientSecret && env.redirectUri);
}
