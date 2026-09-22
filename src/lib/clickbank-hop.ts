/**
 * Official ClickBank HopLink hosts and the documented unique click-id
 * parameter `extclid` (Affiliate Tracking Parameters).
 *
 * `tid` is intentionally unused: official TID forbids dashes, and Phase 4
 * clickId is a UUID.
 */

import { isValidClickId } from "@/lib/analytics";

export const CLICKBANK_EXTCLID_PARAM = "extclid";
export const CLICKBANK_EXTCLID_MAX_LEN = 256;

export function isClickBankHopHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === "hop.clickbank.net" || host.endsWith(".hop.clickbank.net");
}

export function isClickBankHopUrl(href: string): boolean {
  try {
    return isClickBankHopHost(new URL(href).hostname);
  } catch {
    return false;
  }
}

/**
 * Attach the official HopLink `extclid` when (and only when) the CTA target
 * is a ClickBank hop. Failure-safe: malformed URLs and non-hop destinations
 * are returned unchanged. Existing query (UTM/gclid/fbclid/msclkid/tid) is
 * preserved.
 */
export function attachClickBankExtclid(href: string, clickId: string): string {
  if (!isValidClickId(clickId)) return href;
  if (clickId.length > CLICKBANK_EXTCLID_MAX_LEN) return href;
  try {
    const url = new URL(href);
    if (!isClickBankHopHost(url.hostname)) return href;
    url.searchParams.set(CLICKBANK_EXTCLID_PARAM, clickId);
    return url.toString();
  } catch {
    return href;
  }
}
