import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { rankResearchCandidates, type RankedCandidate } from "@/lib/research-coverage/rank";
import { RESEARCH_LIMITS, type CoverageSlot } from "@/lib/research-coverage/types";

const INFO_PATH =
  /\/(info|faq|faqs|help|support|ingredients?|composition|supplement-facts|specifications?|specs|directions?|how-to|usage|guarantee|warranty|refund|returns?|shipping|about|product|facts)(\/|$|\.)/i;
const INFO_HINT = /faq|ingredient|guarantee|return|shipping|direction|refund|pricing|contact|spec/i;
const BLOCKED_PATH =
  /\/(login|signin|signup|account|cart|checkout|wp-admin|admin|order-now|buynow|buy-now|add-to-cart|cdn-cgi|email-protection)(\/|$|\.)/i;
const HASH_ONLY = /^#/;

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function canonicalizeResearchUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if ([...url.searchParams.keys()].length === 0) url.search = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    const safe = inspectPublicHttpsUrl(url.toString().replace(/\?$/, ""));
    if (!safe.ok) return null;
    return safe.url.toString().replace(/\?$/, "");
  } catch {
    return null;
  }
}

function normalize(raw: string, base: string): string | null {
  if (!raw || HASH_ONLY.test(raw) || /^(mailto|tel|javascript):/i.test(raw)) return null;
  try {
    const url = new URL(raw, base);
    if (BLOCKED_PATH.test(url.pathname)) return null;
    if (/hop\.clickbank\.net/i.test(url.hostname)) return null;
    return canonicalizeResearchUrl(url.toString());
  } catch {
    return null;
  }
}

function anchorTextOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export type DiscoveredCandidate = {
  url: string;
  canonicalUrl: string;
  htmlOrder: number;
  anchorText: string;
};

export function collectInformationalCandidates(input: {
  html: string;
  pageUrl: string;
  known?: string[];
  inspectLimit?: number;
}): { candidates: DiscoveredCandidate[]; skipped: Array<{ href: string; reason: string }> } {
  const inspectLimit = input.inspectLimit ?? RESEARCH_LIMITS.maxInspectedCandidates;
  const known = new Set((input.known ?? []).map((item) => canonicalizeResearchUrl(item) ?? item.replace(/\/$/, "")));
  const skipped: Array<{ href: string; reason: string }> = [];
  const candidates: DiscoveredCandidate[] = [];
  const seen = new Set<string>();
  const anchors = [...input.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];

  for (const match of anchors) {
    const attrs = match[1] ?? "";
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
    const normalized = normalize(href, input.pageUrl);
    if (!normalized) {
      if (href && !HASH_ONLY.test(href)) skipped.push({ href, reason: "unsafe, private, purchase, or in-page link" });
      continue;
    }
    if (!sameHost(normalized, input.pageUrl)) {
      skipped.push({ href: normalized, reason: "cross-host links are not followed in controlled research" });
      continue;
    }
    const key = canonicalizeResearchUrl(normalized) ?? normalized;
    if (known.has(key) || seen.has(key)) {
      skipped.push({ href: normalized, reason: "duplicate candidate" });
      continue;
    }
    if (!INFO_PATH.test(normalized) && !INFO_HINT.test(href) && !INFO_HINT.test(anchorTextOf(match[2] ?? ""))) {
      skipped.push({ href: normalized, reason: "path is not an informational candidate" });
      continue;
    }
    if (candidates.length >= inspectLimit) {
      skipped.push({ href: normalized, reason: "inspection cap; not unlimited crawling" });
      continue;
    }
    seen.add(key);
    known.add(key);
    candidates.push({
      url: normalized,
      canonicalUrl: key,
      htmlOrder: candidates.length,
      anchorText: anchorTextOf(match[2] ?? ""),
    });
  }
  return { candidates, skipped };
}

export function discoverInformationalUrls(input: {
  html: string;
  pageUrl: string;
  known?: string[];
  limit?: number;
  gaps?: CoverageSlot[];
}): {
  urls: string[];
  skipped: Array<{ href: string; reason: string }>;
  ranking: { selected: RankedCandidate[]; excluded: RankedCandidate[]; inspected: RankedCandidate[] };
} {
  const collected = collectInformationalCandidates({
    html: input.html,
    pageUrl: input.pageUrl,
    known: input.known,
  });
  const ranked = rankResearchCandidates({
    candidates: collected.candidates,
    gaps: input.gaps,
    limit: input.limit ?? RESEARCH_LIMITS.maxDiscoveredUrls,
  });
  const skipped = [
    ...collected.skipped,
    ...ranked.excluded.map((item) => ({ href: item.url, reason: item.exclusion ?? "discovered-URL limit after ranking" })),
  ];
  return { urls: ranked.selected.map((item) => item.url), skipped, ranking: ranked };
}
