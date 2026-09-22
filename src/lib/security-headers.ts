export type HeaderMap = Record<string, string>;

/**
 * Production security headers. CSP is deliberately permissive for:
 * - ClickBank hops (https: links, not script)
 * - optional campaign pixels (script-src 'unsafe-inline' for published headScript)
 * - first-party tracking (/api/track/cta)
 * - product images (/media/product and https: remote leftovers)
 * - next dev webpack eval (scriptEval), never in production
 */
export function securityHeaders(opts: { https: boolean; frameAncestors: string; scriptEval?: boolean }): HeaderMap {
  const scriptSrc = opts.scriptEval
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${opts.frameAncestors}`,
    "object-src 'none'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "connect-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers: HeaderMap = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-Frame-Options": opts.frameAncestors === "'none'" ? "DENY" : "SAMEORIGIN",
    "Content-Security-Policy": csp,
    "X-DNS-Prefetch-Control": "off",
  };
  if (opts.https) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  }
  return headers;
}

export function applyHeaders(target: Headers, map: HeaderMap): void {
  for (const [key, value] of Object.entries(map)) target.set(key, value);
}
