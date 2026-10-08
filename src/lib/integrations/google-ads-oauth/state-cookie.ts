/**
 * Short-lived OAuth state.
 *
 * The cookie holds the PKCE verifier. It does not hold a Google token.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const GOOGLE_ADS_STATE_COOKIE = "aia_gads_oauth";

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
