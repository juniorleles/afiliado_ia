import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";

export const MAX_HTML_BYTES = 1_500_000;
export const MAX_IMAGE_BYTES = 5_000_000;
export const FETCH_TIMEOUT_MS = 12_000;
export const MAX_REDIRECTS = 3;

export type SafeFetchResult =
  | { ok: true; url: string; status: number; contentType: string | null; body: Buffer }
  | { ok: false; url: string; status: number | null; reason: string };

async function hop(url: string, timeoutMs: number): Promise<{ status: number; location: string | null; type: string | null; body: Buffer }> {
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "AfiliadoIA-Lab/52 (asset-discovery; +local)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const location = response.headers.get("location");
  const type = response.headers.get("content-type");
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, location, type, body };
}

export async function fetchPublicHttps(raw: string, opts?: { maxBytes?: number; timeoutMs?: number }): Promise<SafeFetchResult> {
  const maxBytes = opts?.maxBytes ?? MAX_HTML_BYTES;
  const timeoutMs = opts?.timeoutMs ?? FETCH_TIMEOUT_MS;
  let current = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const safe = inspectPublicHttpsUrl(current);
    if (!safe.ok) return { ok: false, url: current, status: null, reason: safe.reason };
    try {
      const result = await hop(safe.url.toString(), timeoutMs);
      if (result.status >= 300 && result.status < 400 && result.location) {
        current = new URL(result.location, safe.url).toString();
        continue;
      }
      if (result.status < 200 || result.status >= 300) {
        return { ok: false, url: safe.url.toString(), status: result.status, reason: `HTTP ${result.status}` };
      }
      if (result.body.length > maxBytes) {
        return { ok: false, url: safe.url.toString(), status: result.status, reason: "Response exceeded the size limit." };
      }
      return {
        ok: true,
        url: safe.url.toString(),
        status: result.status,
        contentType: result.type,
        body: result.body,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      if (/abort|timeout/i.test(message)) {
        return { ok: false, url: current, status: null, reason: "The request timed out." };
      }
      return { ok: false, url: current, status: null, reason: message };
    }
  }
  return { ok: false, url: current, status: null, reason: "Too many redirects." };
}
