import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import type { DestinationProbe, RedirectHop } from "@/lib/affiliate-hop/types";
import { isClickBankHopHost } from "@/lib/clickbank-hop";

export const PROBE_TIMEOUT_MS = 12_000;
export const PROBE_MAX_REDIRECTS = 5;
export const PROBE_MAX_BYTES = 80_000;

export type ProbeHopFn = (url: string) => Promise<{ status: number; location: string | null; body?: string }>;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function mentionsProduct(blob: string, productName: string): boolean {
  const name = productName.replace(/\s+/g, " ").trim().toLowerCase();
  if (!name || name.length < 3) return false;
  return blob.toLowerCase().includes(name);
}

async function defaultHop(url: string): Promise<{ status: number; location: string | null; body?: string }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "user-agent": "AfiliadoIA-Lab/54e (hop-probe; +local)" },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const location = response.headers.get("location");
  let body = "";
  if (!(response.status >= 300 && response.status < 400 && location)) {
    const buffer = Buffer.from(await response.arrayBuffer());
    body = buffer.subarray(0, PROBE_MAX_BYTES).toString("utf8");
  }
  return { status: response.status, location, body };
}

/**
 * Controlled redirect probe. It never posts personal data and never treats HTTP 200 as a sale.
 */
export async function probeHopDestination(input: {
  href: string;
  productName: string;
  hop?: ProbeHopFn;
}): Promise<DestinationProbe> {
  const chain: RedirectHop[] = [];
  const seen = new Set<string>();
  let current = input.href.trim();
  const hop = input.hop ?? defaultHop;
  let body = "";

  for (let i = 0; i <= PROBE_MAX_REDIRECTS; i += 1) {
    const safe = inspectPublicHttpsUrl(current);
    if (!safe.ok) {
      return {
        status: "FAIL",
        initialUrl: input.href,
        chain,
        finalUrl: current,
        finalHost: hostOf(current),
        httpStatus: null,
        productMention: false,
        trackingPreserved: chain.some((item) => isClickBankHopHost(item.host)) ? "INCONCLUSIVE" : "ABSENT",
        reason: safe.reason,
      };
    }
    const href = safe.url.toString();
    if (seen.has(href)) {
      return {
        status: "FAIL",
        initialUrl: input.href,
        chain,
        finalUrl: href,
        finalHost: safe.url.hostname,
        httpStatus: null,
        productMention: false,
        trackingPreserved: "INCONCLUSIVE",
        reason: "Redirect loop.",
      };
    }
    seen.add(href);
    try {
      const result = await hop(href);
      chain.push({ url: href, host: safe.url.hostname.toLowerCase(), status: result.status });
      if (result.status >= 300 && result.status < 400 && result.location) {
        current = new URL(result.location, href).toString();
        continue;
      }
      body = result.body ?? "";
      const blob = `${href}\n${body}`;
      const productMention = mentionsProduct(blob, input.productName);
      const trackingPreserved = chain.some((item) => isClickBankHopHost(item.host)) ? "PRESENT" : "INCONCLUSIVE";
      if (result.status < 200 || result.status >= 400) {
        return {
          status: "INCONCLUSIVE",
          initialUrl: input.href,
          chain,
          finalUrl: href,
          finalHost: safe.url.hostname.toLowerCase(),
          httpStatus: result.status,
          productMention,
          trackingPreserved,
          reason: `The hop responded HTTP ${result.status}. A status code is not commission proof.`,
        };
      }
      return {
        status: productMention ? "PASS" : "INCONCLUSIVE",
        initialUrl: input.href,
        chain,
        finalUrl: href,
        finalHost: safe.url.hostname.toLowerCase(),
        httpStatus: result.status,
        productMention,
        trackingPreserved,
        reason: productMention
          ? "The public destination mentioned the product name. This is not commission attribution."
          : "The hop completed on a public URL, but product correspondence was not confirmed.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      return {
        status: "INCONCLUSIVE",
        initialUrl: input.href,
        chain,
        finalUrl: current,
        finalHost: hostOf(current),
        httpStatus: null,
        productMention: false,
        trackingPreserved: chain.some((item) => isClickBankHopHost(item.host)) ? "INCONCLUSIVE" : "ABSENT",
        reason: /abort|timeout/i.test(message) ? "The probe timed out." : message,
      };
    }
  }

  return {
    status: "FAIL",
    initialUrl: input.href,
    chain,
    finalUrl: current,
    finalHost: hostOf(current),
    httpStatus: null,
    productMention: false,
    trackingPreserved: "INCONCLUSIVE",
    reason: "Too many redirects.",
  };
}
