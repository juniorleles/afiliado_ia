/**
 * Safe extraction of a JSON value from an AI text response.
 *
 * Accepts raw JSON, a single markdown JSON fence, or JSON embedded in
 * surrounding prose. Does not invent content. Truncated / unbalanced
 * payloads fail closed.
 */

export type JsonExtractSource = "raw" | "markdown_fence" | "embedded";

export type JsonExtractResult = {
  jsonText: string;
  source: JsonExtractSource;
};

export type JsonPayloadKind =
  | "empty"
  | "raw_json"
  | "markdown_fence"
  | "prose_then_json"
  | "truncated"
  | "malformed";

export class JsonExtractError extends Error {
  readonly kind: "empty" | "truncated" | "malformed";

  constructor(kind: "empty" | "truncated" | "malformed", message: string) {
    super(message);
    this.name = "JsonExtractError";
    this.kind = kind;
  }
}

export function classifyJsonPayload(raw: string): JsonPayloadKind {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  if (isBalancedJson(trimmed)) return "raw_json";
  if (/```(?:json)?/i.test(trimmed)) {
    const fenced = extractFromFence(trimmed);
    if (fenced && isBalancedJson(fenced)) return "markdown_fence";
    if (looksTruncated(trimmed) || (fenced && looksTruncated(fenced))) return "truncated";
    return "malformed";
  }
  const embedded = extractBalancedJson(trimmed);
  if (embedded && isBalancedJson(embedded)) return "prose_then_json";
  if (looksTruncated(trimmed)) return "truncated";
  return "malformed";
}

export function extractJsonText(raw: string): JsonExtractResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new JsonExtractError("empty", "A resposta veio vazia.");
  }

  if (isBalancedJson(trimmed)) {
    return { jsonText: trimmed, source: "raw" };
  }

  const fenced = extractFromFence(trimmed);
  if (fenced) {
    if (isBalancedJson(fenced)) {
      return { jsonText: fenced, source: "markdown_fence" };
    }
    if (looksTruncated(fenced) || looksTruncated(trimmed)) {
      throw new JsonExtractError("truncated", "A resposta JSON foi truncada.");
    }
  }

  const embedded = extractBalancedJson(trimmed);
  if (embedded && isBalancedJson(embedded)) {
    return { jsonText: embedded, source: "embedded" };
  }

  if (looksTruncated(trimmed)) {
    throw new JsonExtractError("truncated", "A resposta JSON foi truncada.");
  }

  throw new JsonExtractError("malformed", "A resposta não é um JSON válido.");
}

function extractFromFence(text: string): string | null {
  const match = text.match(/```(?:json)?\s*\r?\n?([\s\S]*?)```/i);
  if (match?.[1]) return match[1].trim();
  const open = text.match(/```(?:json)?\s*\r?\n?([\s\S]+)$/i);
  if (open?.[1]) return open[1].trim();
  return null;
}

export function extractBalancedJson(text: string): string | null {
  const start = indexOfJsonStart(text);
  if (start < 0) return null;
  return scanBalanced(text, start);
}

function indexOfJsonStart(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "[" || ch === "{") return i;
  }
  return -1;
}

function scanBalanced(text: string, start: number): string | null {
  const closerFor: Record<string, string> = { "[": "]", "{": "}" };
  const expectedFirst = closerFor[text[start]];
  if (!expectedFirst) return null;

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[" || ch === "{") {
      stack.push(closerFor[ch]);
      continue;
    }
    if (ch === "]" || ch === "}") {
      if (stack.length === 0 || stack[stack.length - 1] !== ch) return null;
      stack.pop();
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function isBalancedJson(text: string): boolean {
  try {
    JSON.parse(text.trim());
    return true;
  } catch {
    return false;
  }
}

function looksTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const start = indexOfJsonStart(trimmed);
  if (start < 0) return false;
  return scanBalanced(trimmed, start) === null;
}
