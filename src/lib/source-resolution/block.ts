import {
  PRIMARY_BLOCK_REASONS,
  type PrimaryBlockReason,
} from "@/lib/source-resolution/types";

const ACCESS_DENIED_RE = /\baccess denied\b|\bnot authorized\b|\bunauthorized\b/i;
const ANTI_BOT_RE =
  /cloudflare|cf-browser-verification|just a moment|checking your browser|captcha|hcaptcha|pardon our interruption|akamai|incapsula|bot detection|enable javascript and cookies|attention required/i;

export function isPrimaryBlockReason(value: string): value is PrimaryBlockReason {
  return (PRIMARY_BLOCK_REASONS as readonly string[]).includes(value);
}

export function classifyImportFailure(input: {
  robotsDisallowed?: boolean;
  status?: number;
  body?: string;
}): PrimaryBlockReason | null {
  if (input.robotsDisallowed) return "ROBOTS_BLOCKED";
  const body = input.body || "";
  const head = body.slice(0, 2500);
  const status = Number(input.status ?? 0);

  if (status === 401) return "ACCESS_DENIED";
  if (status === 403 && ACCESS_DENIED_RE.test(head)) return "ACCESS_DENIED";
  if (status === 403) return "HTTP_403";

  const challenge = ANTI_BOT_RE.test(head);
  if (challenge && (status === 429 || status === 503)) return "ANTI_BOT_BLOCKED";
  if (challenge && status === 200 && body.length < 8000 && !/<h1[\s>]/i.test(body)) {
    return "ANTI_BOT_BLOCKED";
  }
  return null;
}

export function shouldTriggerNameDiscovery(reason: PrimaryBlockReason | null): boolean {
  return reason !== null;
}

export function primaryBlockedMessage(reason: PrimaryBlockReason): string {
  if (reason === "HTTP_403") return "Primary source returned HTTP 403.";
  if (reason === "ACCESS_DENIED") return "Primary source returned access denied.";
  if (reason === "ROBOTS_BLOCKED") return "Primary source is blocked by robots.txt.";
  return "Primary source is blocked by an anti-bot challenge.";
}

export function searchingWebMessage(productName: string): string {
  return `Searching the web for: ${productName.trim()}`;
}

export function searchingWebStage(productName: string): string {
  return `Searching web for "${productName.trim()}"...`;
}

export function primaryUnavailableMessage(productName: string): string {
  return `Primary source unavailable. ${searchingWebMessage(productName)}`;
}

export const ALTERNATIVE_SOURCES_FOUND_MESSAGE = "Alternative sources found.";
export const NO_VERIFIED_SOURCES_MESSAGE = "No sufficiently verified alternative sources were found.";
export const SEARCH_NOT_CONFIGURED_MESSAGE = "Web product discovery is not configured.";
export const SOURCE_DISCOVERY_TIMED_OUT_MESSAGE = "Source discovery timed out.";
export const SEARCH_PROVIDER_TIMED_OUT_MESSAGE = "Web search timed out.";

export function looksLikePrimaryHttpBlockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /HTTP 403|HTTP 401/i.test(message);
}
