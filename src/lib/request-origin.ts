function normalizeLoopback(host: string): string {
  return host.toLowerCase().replace(/^127\.0\.0\.1(?=:\d+$|$)/, "localhost").replace(/^\[::1\](?=:\d+$|$)/, "localhost");
}

function hostFromUrl(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function mutationOriginAllowed(input: {
  method: string;
  origin: string | null;
  referer: string | null;
  requestHost: string | null;
  nextHost: string;
}): boolean {
  if (input.method === "GET" || input.method === "HEAD" || input.method === "OPTIONS") return true;
  const allowed = [input.requestHost, input.nextHost].filter((item): item is string => Boolean(item)).map(normalizeLoopback);
  const originHost = hostFromUrl(input.origin);
  if (originHost && allowed.includes(normalizeLoopback(originHost))) return true;
  const refererHost = hostFromUrl(input.referer);
  if (refererHost && allowed.includes(normalizeLoopback(refererHost))) return true;
  return false;
}
