import type { SafeFetchResult } from "@/lib/real-product-assets/fetch";
import { inspectPublicHttpsUrl, stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
import type { EnrichmentSource } from "@/lib/product-enrichment/types";
import type { SourcePageCategory } from "@/lib/product-facts";
import type { SourceFetchRecord } from "@/lib/lp-generator/types";
import { fetchPublicPageForResearch } from "@/lib/research-coverage/fetch-rendered";
import type { ExtractionMode, ResearchFetchResult } from "@/lib/research-coverage/fetch-rendered";

export type FetchPageFn = (url: string) => Promise<SafeFetchResult>;

export function pageCategoryFromUrl(url: string): SourcePageCategory {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/return|refund/.test(path)) return "RETURNS";
    if (/ship/.test(path)) return "SHIPPING";
    if (/faq/.test(path)) return "FAQ";
    if (/privacy/.test(path)) return "PRIVACY";
    if (/terms/.test(path)) return "TERMS";
    if (/help|support/.test(path)) return "FAQ";
    if (/review|testimonial/.test(path)) return "REVIEWS";
    return "PRIMARY";
  } catch {
    return "PRIMARY";
  }
}

export function collectSourceUrls(input: { salesUrl: string; affiliateUrl?: string }): string[] {
  const out: string[] = [];
  for (const raw of [input.salesUrl, input.affiliateUrl]) {
    if (!raw) continue;
    const stripped = stripUnverifiedHop(raw);
    const safe = inspectPublicHttpsUrl(stripped.href);
    if (!safe.ok) continue;
    const href = safe.url.toString();
    if (!out.includes(href)) out.push(href);
  }
  return out;
}

export async function fetchResearchSources(input: {
  urls: string[];
  fetchPage?: FetchPageFn;
}): Promise<{ sources: EnrichmentSource[]; records: SourceFetchRecord[]; limitations: string[] }> {
  const fetchPage = input.fetchPage ?? fetchPublicPageForResearch;
  const sources: EnrichmentSource[] = [];
  const records: SourceFetchRecord[] = [];
  const limitations: string[] = [];

  for (const requested of input.urls) {
    const stripped = stripUnverifiedHop(requested);
    const safe = inspectPublicHttpsUrl(stripped.href);
    if (!safe.ok) {
      records.push({
        url: requested,
        requestedUrl: requested,
        ok: false,
        status: null,
        reason: safe.reason,
        hopPlaceholder: stripped.hopPlaceholder,
        pageCategory: "PRIMARY",
        bytes: 0,
      });
      limitations.push(`Source not fetched: ${safe.reason}`);
      continue;
    }
    const result = await fetchPage(safe.url.toString());
    const pageCategory = pageCategoryFromUrl(result.url);
    if (!result.ok) {
      records.push({
        url: result.url,
        requestedUrl: requested,
        ok: false,
        status: result.status,
        reason: result.reason,
        hopPlaceholder: stripped.hopPlaceholder,
        pageCategory,
        bytes: 0,
      });
      limitations.push(`Source unavailable (${result.reason}). Only verifiable remaining sources will be used.`);
      continue;
    }
    const html = result.body.toString("utf8");
    const rendered = result as ResearchFetchResult;
    const extractionMode: ExtractionMode = rendered.extractionMode ?? "HTTP";
    sources.push({
      url: result.url,
      retrievedAt: new Date().toISOString(),
      pageCategory,
      html,
      extractionMode,
      renderMode: rendered.renderMode,
      finalUrl: result.url,
    });
    if (extractionMode === "BROWSER_RENDERED") {
      limitations.push("Browser rendering was used because the HTTP body did not expose enough visible copy.");
    } else if (rendered.renderStatus && rendered.renderStatus !== "RENDERED") {
      limitations.push(`Browser rendering was not used: ${rendered.renderReasons.slice(-1)[0] ?? rendered.renderStatus}`);
    }
    records.push({
      url: result.url,
      requestedUrl: requested,
      ok: true,
      status: result.status,
      reason: null,
      hopPlaceholder: stripped.hopPlaceholder,
      pageCategory,
      bytes: result.body.length,
    });
    if (stripped.hopPlaceholder) {
      limitations.push("A placeholder hop parameter was stripped from a source URL and was not treated as an affiliate link.");
    }
  }

  return { sources, records, limitations };
}
