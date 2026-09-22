/**
 * Edge-safe admin session cookie (HMAC-SHA256 via Web Crypto).
 * Password verification stays on the Node login action.
 */

export const ADMIN_COOKIE = "aia_adm";
export const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 12;
export const INTERNAL_FRAME_HEADER = "x-aia-internal";

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

function timingEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const left = fromHex(a);
  const right = fromHex(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

export function adminSessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

export async function mintAdminSession(now = Date.now()): Promise<string | null> {
  const secret = adminSessionSecret();
  if (!secret) return null;
  const exp = String(now + ADMIN_SESSION_MAX_AGE_SEC * 1000);
  const mac = await hmacHex(secret, `v1|${exp}`);
  return `v1.${exp}.${mac}`;
}

export async function verifyAdminSession(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const secret = adminSessionSecret();
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = await hmacHex(secret, `v1|${parts[1]}`);
  return timingEqualHex(expected, parts[2] || "");
}

export function internalFrameSecret(): string | null {
  const secret = process.env.INTERNAL_FRAME_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

export function verifyInternalFrameHeader(value: string | null | undefined): boolean {
  const secret = internalFrameSecret();
  if (!secret || !value) return false;
  const a = new TextEncoder().encode(secret);
  const b = new TextEncoder().encode(value);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
