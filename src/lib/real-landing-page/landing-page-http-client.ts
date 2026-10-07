/**
 * Host record domain: landing page HTTP client.
 *
 * One call retrieves one response and does not follow a redirect. The caller
 * records the chain. The markup is returned as text.
 */
export interface LandingPageHttpResult {
  httpStatus: number;
  headers: Record<string, string>;
  bodyText: string;
  timedOut: boolean;
  tooLarge: boolean;
}

export type LandingPageHttpTransport = (url: string, timeoutMs: number, maxBytes: number) => Promise<LandingPageHttpResult>;

export interface LandingPageHttpClient {
  request(url: string): Promise<LandingPageHttpResult>;
}

export interface LandingPageHttpClientOptions {
  transport?: LandingPageHttpTransport;
  timeoutMs?: number;
  maxBytes?: number;
}

export const REAL_LANDING_PAGE_TIMEOUT_MS = 15000;
export const REAL_LANDING_PAGE_MAX_BYTES = 2_000_000;

const REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent": "AfiliadoIA-LandingCollector/1.0",
};

function headerRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export const defaultLandingPageTransport: LandingPageHttpTransport = async (url, timeoutMs, maxBytes) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const headers = headerRecord(response.headers);
    const declared = Number(headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel();
      return { httpStatus: response.status, headers, bodyText: "", timedOut: false, tooLarge: true };
    }
    const bodyText = await response.text();
    const tooLarge = Buffer.byteLength(bodyText) > maxBytes;
    return { httpStatus: response.status, headers, bodyText: tooLarge ? "" : bodyText, timedOut: false, tooLarge };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { httpStatus: 0, headers: {}, bodyText: "", timedOut, tooLarge: false };
  }
};

export function createLandingPageHttpClient(options: LandingPageHttpClientOptions = {}): LandingPageHttpClient {
  const transport = options.transport ?? defaultLandingPageTransport;
  const timeoutMs = options.timeoutMs ?? REAL_LANDING_PAGE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? REAL_LANDING_PAGE_MAX_BYTES;
  return {
    async request(url) {
      try {
        return await transport(url, timeoutMs, maxBytes);
      } catch {
        return { httpStatus: 0, headers: {}, bodyText: "", timedOut: false, tooLarge: false };
      }
    },
  };
}
