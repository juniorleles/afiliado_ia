import type { EvidenceUse } from "@/lib/section-generation/types";

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function hostname(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrls(value: string): string[] {
  return value.match(URL_PATTERN) ?? [];
}

export function stripDisallowedUrls(value: string, allowed: Set<string>): string {
  return value.replace(URL_PATTERN, (url) => {
    const host = hostname(url);
    return host && allowed.has(host) ? url : "";
  }).replace(/\s+/g, " ").trim();
}

export function sentences(value: string): string[] {
  return value.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

export function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

export function proseOf(value: unknown): string {
  const parts: string[] = [];
  const walk = (item: unknown) => {
    if (typeof item === "string") parts.push(item);
    else if (Array.isArray(item)) item.forEach(walk);
    else if (item && typeof item === "object") Object.values(item).forEach(walk);
  };
  walk(value);
  return parts.join(" ");
}

export function isEvidenceSentence(sentence: string, evidence: EvidenceUse[]): boolean {
  const value = sentence.replace(/\s+/g, " ").trim().toLowerCase();
  if (!value) return false;
  return evidence.some((item) => {
    const source = item.text.replace(/\s+/g, " ").trim().toLowerCase();
    return source.length > 0 && (value === source || source.includes(value));
  });
}

export function shortenSentence(sentence: string): string {
  const clean = sentence.replace(/\s+/g, " ").trim();
  if (wordCount(clean) <= 18 || !clean.includes(",")) return clean;
  const comma = clean.indexOf(",");
  const left = clean.slice(0, comma).trim();
  const right = clean.slice(comma + 1).trim();
  if (!left || !right) return clean;
  return `${shortenSentence(left)}. ${shortenSentence(right)}`;
}

export function mapStrings(
  value: unknown,
  fn: (value: string, key: string) => string,
  key = "",
): unknown {
  if (typeof value === "string") return fn(value, key);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn, key));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [child, item] of Object.entries(value)) {
    output[child] = child === "jsonLd" ? item : mapStrings(item, fn, child);
  }
  return output;
}
