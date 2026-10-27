import { isClickBankHopHost } from "@/lib/clickbank-hop";
import { stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
import { validateHopFormat } from "@/lib/affiliate-hop/format";
import type { HopFormatResult } from "@/lib/affiliate-hop/types";

const HREF = /\b(?:href|action)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
const BARE_HOP = /https:\/\/[a-z0-9-]+\.hop\.clickbank\.net(?:\/[^\s"'<>]*)?/gi;

export type HopCandidate = {
  href: string;
  placeholder: boolean;
  format: HopFormatResult;
};

export function extractHopCandidates(html: string, pageUrl?: string): HopCandidate[] {
  const found = new Set<string>();
  const push = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    try {
      const url = new URL(text, pageUrl || "https://example.invalid");
      found.add(url.toString());
    } catch {
      found.add(text);
    }
  };

  let match: RegExpExecArray | null;
  while ((match = HREF.exec(html))) {
    push(match[1] || match[2] || "");
  }
  while ((match = BARE_HOP.exec(html))) {
    push(match[0]);
  }
  if (pageUrl) push(pageUrl);

  const out: HopCandidate[] = [];
  for (const href of found) {
    let host = "";
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch {
      continue;
    }
    const stripped = stripUnverifiedHop(href);
    const clickbank = isClickBankHopHost(host);
    if (!clickbank && !stripped.hopPlaceholder) continue;
    out.push({
      href,
      placeholder: stripped.hopPlaceholder,
      format: validateHopFormat(href),
    });
  }
  return out;
}
