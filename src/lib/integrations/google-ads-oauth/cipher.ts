/**
 * AES-256-GCM for Google Ads credentials.
 *
 * The key is the SHA-256 of ADMIN_SESSION_SECRET. Ciphertext never includes
 * the key. Callers do not log the plaintext.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  return createHash("sha256").update(secret, "utf8").digest();
}

export function googleAdsEncryptionReady(): boolean {
  return key() !== null;
}

export function encryptGoogleAdsSecret(plaintext: string): string | null {
  const secretKey = key();
  if (!secretKey || plaintext.trim() === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptGoogleAdsSecret(payload: string | null | undefined): string | null {
  const secretKey = key();
  if (!secretKey || !payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const encrypted = Buffer.from(parts[3]!, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;
    const decipher = createDecipheriv("aes-256-gcm", secretKey, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return plain.trim() === "" ? null : plain;
  } catch {
    return null;
  }
}
