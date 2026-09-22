import { looksLikeSecretKey } from "@/lib/env";

export type LogLevel = "INFO" | "WARN" | "ERROR";
export type LogCategory =
  | "APPLICATION"
  | "DATABASE"
  | "AUTH"
  | "IMPORT"
  | "AI"
  | "TRACKING"
  | "CLICKBANK_INS"
  | "MEDIA"
  | "VISUAL_QA";

const REDACT = "[redacted]";
const SECRET_VALUE = /(?:sk-|key-|secret=|password=)\S+/gi;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 8 && /[A-Za-z0-9+/=_-]{16,}/.test(value) && /secret|key|token|password/i.test(value)) {
      return REDACT;
    }
    return value.replace(SECRET_VALUE, REDACT);
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = looksLikeSecretKey(k) ? REDACT : redactValue(v);
    }
    return out;
  }
  return value;
}

export function logEvent(level: LogLevel, category: LogCategory, message: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    category,
    message,
    ...(fields ? { fields: redactValue(fields) } : {}),
  });
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.info(line);
}
