/**
 * Short-lived OAuth state.
 *
 * The cookie holds the PKCE verifier. It does not hold a Google token.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const GOOGLE_ADS_STATE_COOKIE = "aia_gads_oauth";
export const GOOGLE_ADS_RETURN_COOKIE = "aia_gads_oauth_return";

const RETURN_PATHS = ["/admin/google-ads/operacoes", "/configuracoes/integracoes/google-ads"] as const;

function secret(): string | null {
  const value = process.env.ADMIN_SESSION_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}

function mac(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

export function sealGoogleAdsState(state: string, verifier: string): string | null {
  const key = secret();
  if (!key) return null;
  const body = `v1.${state}.${verifier}`;
  return `${body}.${mac(body, key)}`;
}

export function openGoogleAdsState(payload: string | null | undefined): { state: string; verifier: string } | null {
  const key = secret();
  if (!key || !payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const body = `v1.${parts[1]}.${parts[2]}`;
  const expected = mac(body, key);
  const given = parts[3]!;
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  if (!parts[1] || !parts[2]) return null;
  return { state: parts[1], verifier: parts[2] };
}

export function sealGoogleAdsReturn(path: string): string | null {
  if (!(RETURN_PATHS as readonly string[]).includes(path)) return null;
  const key = secret();
  if (!key) return null;
  const body = `v1.${path}`;
  return `${body}.${mac(body, key)}`;
}

export function openGoogleAdsReturn(payload: string | null | undefined): string | null {
  const key = secret();
  if (!key || !payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1]) return null;
  const body = `v1.${parts[1]}`;
  const expected = mac(body, key);
  const given = parts[2]!;
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return (RETURN_PATHS as readonly string[]).includes(parts[1]) ? parts[1] : null;
}
