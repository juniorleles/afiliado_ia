/**
 * ClickBank Instant Notification Service (INS) v8.
 *
 * Envelope, AES-256-CBC key derivation, field names, and transaction types
 * follow official ClickBank documentation only. See
 * docs/CLICKBANK_INTEGRATION_RESEARCH.md.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isValidClickId } from "@/lib/analytics";

export const CLICKBANK_PROVIDER = "clickbank";
export const MAX_INS_BODY_BYTES = 64 * 1024;
export const INS_CURRENCY = "USD";

/** Official `transactionType` values from the INS article. */
export const OFFICIAL_TRANSACTION_TYPES = [
  "SALE",
  "BILL",
  "RFND",
  "CGBK",
  "INSF",
  "CANCEL-REBILL",
  "UNCANCEL-REBILL",
  "SUBSCRIPTION-CHG",
  "ABANDONED_ORDER",
  "CUSTOMER_AUTH_FAILURE",
  "CUSTOMER_EMAIL_UPDATE",
  "CUSTOMER_UPDATE_CC_NOTIFICATION",
  "PURCHASE_DETAILS_EMAIL_RESPONSE",
  "TEST",
  "TEST_BILL",
  "TEST_RFND",
  "TEST_SALE",
  "CANCEL-TEST-REBILL",
  "UNCANCEL-TEST-REBILL",
] as const;

export type OfficialTransactionType = (typeof OFFICIAL_TRANSACTION_TYPES)[number];

const SALE_TYPES = new Set<string>(["SALE"]);
const REBILL_TYPES = new Set<string>(["BILL"]);
const REFUND_TYPES = new Set<string>(["RFND"]);
const CHARGEBACK_TYPES = new Set<string>(["CGBK", "INSF"]);
const TEST_TYPES = new Set<string>([
  "TEST",
  "TEST_BILL",
  "TEST_RFND",
  "TEST_SALE",
  "CANCEL-TEST-REBILL",
  "UNCANCEL-TEST-REBILL",
]);
const COMMISSION_CREDIT_TYPES = new Set<string>(["SALE", "BILL"]);
const COMMISSION_DEBIT_TYPES = new Set<string>(["RFND", "CGBK", "INSF"]);

export type AttributionStatus = "ATTRIBUTED" | "UNATTRIBUTED";

export type InsEnvelope = {
  notification: string;
  iv: string;
};

export type ParsedInsTransaction = {
  provider: typeof CLICKBANK_PROVIDER;
  externalTransactionId: string;
  transactionType: string;
  occurredAt: string;
  currency: typeof INS_CURRENCY;
  affiliateCommissionCents: number;
  trackingValue: string | null;
  officialType: boolean;
};

export function getClickBankInsSecret(): string | null {
  const secret = process.env.CLICKBANK_INS_SECRET;
  if (typeof secret !== "string") return null;
  const trimmed = secret.trim();
  return trimmed ? trimmed : null;
}

export function isOfficialTransactionType(value: string): value is OfficialTransactionType {
  return (OFFICIAL_TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isSaleType(type: string): boolean {
  return SALE_TYPES.has(type);
}

export function isRebillType(type: string): boolean {
  return REBILL_TYPES.has(type);
}

export function isRefundType(type: string): boolean {
  return REFUND_TYPES.has(type);
}

export function isChargebackType(type: string): boolean {
  return CHARGEBACK_TYPES.has(type);
}

export function isTestType(type: string): boolean {
  return TEST_TYPES.has(type);
}

export function countsTowardCommission(type: string): boolean {
  return COMMISSION_CREDIT_TYPES.has(type) || COMMISSION_DEBIT_TYPES.has(type);
}

export function signedCommissionCents(type: string, cents: number): number {
  const abs = cents < 0 ? -cents : cents;
  if (COMMISSION_DEBIT_TYPES.has(type)) return -abs;
  if (COMMISSION_CREDIT_TYPES.has(type)) return abs;
  return 0;
}

/**
 * Parse a USD amount with 2 decimal precision into integer cents.
 * No floating-point multiply is used for the string path ClickBank documents.
 */
export function parseUsdToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return 0;
  const text = typeof value === "number" ? JSON.stringify(value) : typeof value === "string" ? value.trim() : null;
  if (text === null || text === "") return 0;
  const match = text.match(/^(-)?(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const sign = match[1] ? -1 : 1;
  const whole = Number(match[2]);
  const frac = Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(frac)) return null;
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return sign * cents;
}

export function formatUsdCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = cents < 0 ? -cents : cents;
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}$${whole}.${String(frac).padStart(2, "0")}`;
}

function aesKeyFromSecret(secret: string): Buffer {
  const sha1hex = createHash("sha1").update(secret, "utf8").digest("hex");
  return Buffer.from(sha1hex.slice(0, 32), "utf8");
}

export function encryptInsEnvelope(plaintext: object, secret: string, iv?: Buffer): InsEnvelope {
  const ivBuf = iv && iv.length === 16 ? iv : randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", aesKeyFromSecret(secret), ivBuf);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plaintext), "utf8"), cipher.final()]);
  return {
    notification: encrypted.toString("base64"),
    iv: ivBuf.toString("base64"),
  };
}

export function decryptInsEnvelope(envelope: InsEnvelope, secret: string): unknown {
  const iv = Buffer.from(envelope.iv, "base64");
  if (iv.length !== 16) {
    throw new Error("invalid_iv");
  }
  let encrypted: Buffer;
  try {
    encrypted = Buffer.from(envelope.notification, "base64");
  } catch {
    throw new Error("invalid_notification");
  }
  if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
    throw new Error("invalid_notification");
  }
  const decipher = createDecipheriv("aes-256-cbc", aesKeyFromSecret(secret), iv);
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const text = out.toString("utf8").replace(/\0+$/g, "").trim();
  return JSON.parse(text) as unknown;
}

export function parseInsEnvelope(rawBody: string, contentType: string | null): InsEnvelope | null {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;

  const tryObject = (value: unknown): InsEnvelope | null => {
    if (typeof value !== "object" || value === null) return null;
    const rec = value as Record<string, unknown>;
    if (typeof rec.notification !== "string" || typeof rec.iv !== "string") return null;
    if (!rec.notification || !rec.iv) return null;
    return { notification: rec.notification, iv: rec.iv };
  };

  if (trimmed.startsWith("{")) {
    try {
      return tryObject(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  const type = (contentType ?? "").toLowerCase();
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data") || trimmed.includes("notification=")) {
    const params = new URLSearchParams(trimmed);
    const notification = params.get("notification");
    const iv = params.get("iv");
    if (notification && iv) return { notification, iv };
  }

  return null;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function readExtclid(payload: Record<string, unknown>): string | null {
  const params = payload.affiliateTrackingParameters;
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return null;
  }
  const extclid = (params as Record<string, unknown>).extclid;
  if (typeof extclid !== "string") return null;
  const trimmed = extclid.trim();
  if (!trimmed) return null;
  return clip(trimmed, 256);
}

function isValidReceipt(value: string): boolean {
  return value.length >= 8 && value.length <= 21;
}

export function parseInsTransaction(payload: unknown): ParsedInsTransaction | { error: string } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { error: "malformed_payload" };
  }
  const rec = payload as Record<string, unknown>;
  if (typeof rec.receipt !== "string" || !isValidReceipt(rec.receipt.trim())) {
    return { error: "missing_transaction_id" };
  }
  if (typeof rec.transactionType !== "string" || !rec.transactionType.trim()) {
    return { error: "missing_transaction_type" };
  }
  const transactionType = clip(rec.transactionType.trim(), 31);
  const cents = parseUsdToCents(rec.totalAccountAmount);
  if (cents === null) {
    return { error: "invalid_monetary_value" };
  }
  const occurredRaw = typeof rec.transactionTime === "string" ? rec.transactionTime.trim() : "";
  if (!occurredRaw) {
    return { error: "missing_transaction_time" };
  }
  const occurredMs = Date.parse(occurredRaw);
  if (Number.isNaN(occurredMs)) {
    return { error: "invalid_transaction_time" };
  }

  const trackingValue = readExtclid(rec);
  return {
    provider: CLICKBANK_PROVIDER,
    externalTransactionId: clip(rec.receipt.trim(), 21),
    transactionType,
    occurredAt: new Date(occurredMs).toISOString(),
    currency: INS_CURRENCY,
    affiliateCommissionCents: cents,
    trackingValue,
    officialType: isOfficialTransactionType(transactionType),
  };
}

export function trackingValueAsClickId(trackingValue: string | null): string | null {
  if (!trackingValue) return null;
  return isValidClickId(trackingValue) ? trackingValue : null;
}
