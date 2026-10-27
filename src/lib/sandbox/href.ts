import { SANDBOX_PATH_PREFIX } from "@/lib/sandbox/types";

const CONTROL = /[\u0000-\u001F\u007F]/;

export function isSandboxCtaHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const text = href.trim();
  if (!text || CONTROL.test(text) || /\s/.test(text)) return false;
  if (/^(https?:|javascript:|data:|file:|vbscript:)/i.test(text)) return false;
  return text.startsWith(SANDBOX_PATH_PREFIX);
}

export function buildSandboxCtaPath(input: {
  sessionId: string;
  productKey: string;
  landingPageId?: string | null;
  presellMode?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("sid", input.sessionId.trim());
  params.set("product", input.productKey.trim());
  if (input.landingPageId) params.set("lp", input.landingPageId.trim());
  if (input.presellMode) params.set("mode", input.presellMode.trim());
  return `${SANDBOX_PATH_PREFIX}offer?${params.toString()}`;
}

export function rejectExternalSandboxHref(href: string): { ok: true; href: string } | { ok: false; reason: "EXTERNAL_HREF" } {
  return isSandboxCtaHref(href) ? { ok: true, href } : { ok: false, reason: "EXTERNAL_HREF" };
}
