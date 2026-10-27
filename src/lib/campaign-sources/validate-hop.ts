import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { FETCH_TIMEOUT_MS } from "@/lib/real-product-assets/fetch";
import { classifySubmittedUrl, sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import type { SourceStatus } from "@/lib/campaign-sources/types";

export const HOP_VALIDATION_LIMITS = {
  maxRedirects: 5,
  timeoutMs: FETCH_TIMEOUT_MS,
  maxHtmlPeekBytes: 24_000,
} as const;

export type HopProbeResult = {
  status: number;
  location: string | null;
  contentType: string | null;
  body: Buffer;
};

export type HopProbe = (url: string) => Promise<HopProbeResult>;

export type DestinationClassification =
  | "SALES_PAGE"
  | "CHECKOUT_SUSPECTED"
  | "AFFILIATE_RESOURCE"
  | "UNKNOWN"
  | "BLOCKED"
  | "UNAVAILABLE";

export type HopRedirectStep = {
  index: number;
  status: number | null;
  url: string;
  host: string;
  path: string;
  via: "HTTP_LOCATION" | "META_REFRESH" | "JAVASCRIPT_HINT" | "STOPPED";
  notes: string[];
};

export type HopValidation = {
  originalUrl: string;
  formatOk: boolean;
  initialHost: string | null;
  httpStatus: number | null;
  redirectCount: number;
  chain: HopRedirectStep[];
  finalUrl: string | null;
  finalHost: string | null;
  finalPath: string | null;
  destinationClassification: DestinationClassification;
  checkoutDetected: boolean;
  sourceStatus: SourceStatus;
  commercialAuthorization: "BLOCKED";
  fetchedAt: string;
  limitations: string[];
  blockReason: string | null;
};

const META_REFRESH = /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i;
const JS_LOCATION = /(?:window\.)?location(?:\.href|\.replace)?\s*=\s*["'](https:[^"']+)["']/i;

function partsOf(raw: string): { host: string; path: string } {
  try {
    const url = new URL(raw);
    return { host: url.hostname.toLowerCase(), path: url.pathname || "/" };
  } catch {
    return { host: "", path: "" };
  }
}

function peekRedirect(html: string, base: string): { href: string; via: "META_REFRESH" | "JAVASCRIPT_HINT" } | null {
  const meta = html.match(META_REFRESH)?.[1]?.trim();
  const script = html.match(JS_LOCATION)?.[1]?.trim();
  const raw = meta || script;
  if (!raw) return null;
  try {
    const href = new URL(raw, base).toString();
    return { href, via: meta ? "META_REFRESH" : "JAVASCRIPT_HINT" };
  } catch {
    return null;
  }
}

export async function defaultHopProbe(url: string): Promise<HopProbeResult> {
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "AfiliadoIA-Lab/54S (hop-validation; +local)" },
    signal: AbortSignal.timeout(HOP_VALIDATION_LIMITS.timeoutMs),
  });
  const location = response.headers.get("location");
  const type = response.headers.get("content-type");
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, location, contentType: type, body };
}

function classifyDestination(url: string, html?: string): DestinationClassification {
  const purpose = classifySubmittedUrl(url);
  if (purpose.sourceStatus === "BLOCKED") return "BLOCKED";
  if (purpose.sourceStatus === "CHECKOUT_SUSPECTED") return "CHECKOUT_SUSPECTED";
  if (purpose.sourceType === "AFFILIATE_RESOURCE") return "AFFILIATE_RESOURCE";
  if (purpose.sourceType === "TRACKING_HOPLINK") return "UNKNOWN";
  if (html && /\/(cart|checkout|order-now|payment)\b/i.test(html) && /add to cart|checkout|place order/i.test(html)) {
    return "CHECKOUT_SUSPECTED";
  }
  if (purpose.sourceType === "SALES_PAGE" && html && /<title|<h1|og:title/i.test(html)) return "SALES_PAGE";
  return "UNKNOWN";
}

export async function validateHopLink(input: {
  url: string;
  probe?: HopProbe;
}): Promise<HopValidation> {
  const fetchedAt = new Date().toISOString();
  const limitations: string[] = [
    "A working hop is not commercial authorization, commission proof, or Google Ads compliance.",
  ];
  const inspected = inspectPublicHttpsUrl(input.url);
  if (!inspected.ok) {
    return {
      originalUrl: sanitizeSharedUrl(input.url),
      formatOk: false,
      initialHost: null,
      httpStatus: null,
      redirectCount: 0,
      chain: [],
      finalUrl: null,
      finalHost: null,
      finalPath: null,
      destinationClassification: "BLOCKED",
      checkoutDetected: false,
      sourceStatus: "BLOCKED",
      commercialAuthorization: "BLOCKED",
      fetchedAt,
      limitations,
      blockReason: inspected.reason,
    };
  }

  const start = inspected.url.toString();
  const initial = partsOf(start);
  const formatOk = inspected.url.protocol === "https:" && Boolean(initial.host);
  const probe = input.probe ?? defaultHopProbe;
  const chain: HopRedirectStep[] = [];
  const seen = new Set<string>();
  let current = start;
  let httpStatus: number | null = null;
  let destinationClassification: DestinationClassification = "UNKNOWN";
  let checkoutDetected = false;
  let blockReason: string | null = null;
  let sourceStatus: SourceStatus = "UNAVAILABLE";

  for (let i = 0; i <= HOP_VALIDATION_LIMITS.maxRedirects; i += 1) {
    const safe = inspectPublicHttpsUrl(current);
    if (!safe.ok) {
      destinationClassification = "BLOCKED";
      sourceStatus = "BLOCKED";
      blockReason = safe.reason;
      limitations.push(safe.reason);
      break;
    }
    const href = safe.url.toString();
    if (seen.has(href)) {
      blockReason = "Redirect loop detected.";
      destinationClassification = "BLOCKED";
      sourceStatus = "BLOCKED";
      limitations.push(blockReason);
      chain.push({
        index: chain.length,
        status: null,
        url: sanitizeSharedUrl(href),
        ...partsOf(href),
        via: "STOPPED",
        notes: [blockReason],
      });
      break;
    }
    seen.add(href);

    const purpose = classifySubmittedUrl(href);
    if (purpose.sourceStatus === "CHECKOUT_SUSPECTED") {
      checkoutDetected = true;
      destinationClassification = "CHECKOUT_SUSPECTED";
      sourceStatus = "CHECKOUT_SUSPECTED";
      blockReason = purpose.notes[0] ?? "Checkout destination recorded. Navigation stopped.";
      limitations.push(blockReason);
      chain.push({
        index: chain.length,
        status: null,
        url: sanitizeSharedUrl(href),
        ...partsOf(href),
        via: "STOPPED",
        notes: [blockReason],
      });
      current = href;
      break;
    }

    let result: HopProbeResult;
    try {
      result = await probe(href);
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch failed";
      const timedOut = /abort|timeout/i.test(message);
      destinationClassification = "UNAVAILABLE";
      sourceStatus = "UNAVAILABLE";
      blockReason = timedOut ? "The request timed out." : message;
      limitations.push(blockReason);
      break;
    }

    httpStatus = result.status;
    const location = result.location ? new URL(result.location, href).toString() : null;
    if (result.status >= 300 && result.status < 400 && location) {
      chain.push({
        index: chain.length,
        status: result.status,
        url: sanitizeSharedUrl(href),
        ...partsOf(href),
        via: "HTTP_LOCATION",
        notes: [],
      });
      current = location;
      continue;
    }

    const peek = result.body.subarray(0, HOP_VALIDATION_LIMITS.maxHtmlPeekBytes).toString("utf8");
    const hinted = /text\/html/i.test(result.contentType ?? "") ? peekRedirect(peek, href) : null;
    if (hinted && result.status >= 200 && result.status < 300) {
      chain.push({
        index: chain.length,
        status: result.status,
        url: sanitizeSharedUrl(href),
        ...partsOf(href),
        via: hinted.via,
        notes: ["JavaScript or meta refresh hint recorded. The hinted URL was not opened if it looks like checkout."],
      });
      current = hinted.href;
      continue;
    }

    if (result.status < 200 || result.status >= 300) {
      destinationClassification = "UNAVAILABLE";
      sourceStatus = "UNAVAILABLE";
      blockReason = `HTTP ${result.status}`;
      limitations.push(blockReason);
      chain.push({
        index: chain.length,
        status: result.status,
        url: sanitizeSharedUrl(href),
        ...partsOf(href),
        via: "STOPPED",
        notes: [blockReason],
      });
      current = href;
      break;
    }

    destinationClassification = classifyDestination(href, peek);
    sourceStatus = destinationClassification === "UNKNOWN" ? "REDIRECTED" : destinationClassification === "SALES_PAGE" ? "VALID" : "REDIRECTED";
    if (destinationClassification === "CHECKOUT_SUSPECTED") {
      checkoutDetected = true;
      sourceStatus = "CHECKOUT_SUSPECTED";
    }
    chain.push({
      index: chain.length,
      status: result.status,
      url: sanitizeSharedUrl(href),
      ...partsOf(href),
      via: "STOPPED",
      notes: ["HTTP 200 is not treated as page-type proof by itself."],
    });
    current = href;
    break;
  }

  if (chain.length > HOP_VALIDATION_LIMITS.maxRedirects && destinationClassification === "UNKNOWN") {
    blockReason = "Too many redirects.";
    destinationClassification = "BLOCKED";
    sourceStatus = "BLOCKED";
    limitations.push(blockReason);
  }

  const final = partsOf(current);
  return {
    originalUrl: sanitizeSharedUrl(start),
    formatOk,
    initialHost: initial.host,
    httpStatus,
    redirectCount: Math.max(0, chain.filter((item) => item.via !== "STOPPED").length),
    chain,
    finalUrl: sanitizeSharedUrl(current),
    finalHost: final.host || null,
    finalPath: final.path || null,
    destinationClassification,
    checkoutDetected,
    sourceStatus,
    commercialAuthorization: "BLOCKED",
    fetchedAt,
    limitations,
    blockReason,
  };
}
