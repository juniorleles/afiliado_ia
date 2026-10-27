import { isClickBankHopHost } from "@/lib/clickbank-hop";
import { inspectPublicHttpsUrl, stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
import type { HopFormatIssue, HopFormatResult } from "@/lib/affiliate-hop/types";

const CONTROL = /[\u0000-\u001F\u007F]/;
const SUSPICIOUS = /^(javascript|data|file|vbscript):/i;

export function validateHopFormat(raw: string): HopFormatResult {
  const issues: HopFormatIssue[] = [];
  const text = raw.trim();
  if (!text || CONTROL.test(text) || SUSPICIOUS.test(text) || /\s/.test(text)) {
    return { ok: false, href: null, host: null, issues: ["SUSPICIOUS_CHARACTERS"] };
  }

  const stripped = stripUnverifiedHop(text);
  if (stripped.hopPlaceholder) issues.push("PLACEHOLDER");

  const safe = inspectPublicHttpsUrl(stripped.href);
  if (!safe.ok) {
    if (/https/i.test(safe.reason)) issues.push("NOT_HTTPS");
    else if (/credential/i.test(safe.reason)) issues.push("CREDENTIALS");
    else if (/private|local|metadata/i.test(safe.reason)) issues.push("PRIVATE_OR_LOCAL");
    else issues.push("UNPARSEABLE");
    return { ok: false, href: null, host: null, issues: [...new Set(issues)] };
  }

  if (!isClickBankHopHost(safe.url.hostname)) issues.push("NOT_CLICKBANK_HOP");
  if (safe.url.username || safe.url.password) issues.push("CREDENTIALS");

  return {
    ok: issues.length === 0,
    href: issues.length === 0 ? text : null,
    host: safe.url.hostname.toLowerCase(),
    issues,
  };
}

export function exactHopUnchanged(registered: string, provided: string): boolean {
  return registered.trim() === provided.trim();
}
