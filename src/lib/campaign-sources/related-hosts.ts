import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { classifyUrlRoles } from "@/lib/campaign-sources/roles";
import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";

export type RelatedHostEvidence = {
  leftHost: string;
  rightHost: string;
  related: boolean;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
};

export type SafeInspectResult = {
  requestedUrl: string;
  accessed: boolean;
  httpStatus: number | null;
  location: string | null;
  blocked: boolean;
  reason: string;
  checkoutNavigated: false;
};

export type HostInspectProbe = (url: string) => Promise<{ status: number; location: string | null }>;

export function brandToken(host: string): string {
  const label = host.replace(/^www\./i, "").split(".")[0] ?? "";
  return label.toLowerCase().replace(/\d+$/g, "");
}

export function relatedHostEvidence(left: string, right: string): RelatedHostEvidence {
  const leftHost = hostOf(left);
  const rightHost = hostOf(right);
  if (!leftHost || !rightHost) {
    return { leftHost, rightHost, related: false, confidence: "LOW", reason: "One or both hosts are unparseable." };
  }
  if (leftHost === rightHost) {
    return { leftHost, rightHost, related: true, confidence: "HIGH", reason: "Exact same host." };
  }
  const leftToken = brandToken(leftHost);
  const rightToken = brandToken(rightHost);
  if (leftToken && leftToken === rightToken && leftToken.length >= 6) {
    return {
      leftHost,
      rightHost,
      related: true,
      confidence: "MEDIUM",
      reason: "Hostname labels share a brand token after trailing digits are removed. This is not proof of common ownership.",
    };
  }
  return {
    leftHost,
    rightHost,
    related: false,
    confidence: "LOW",
    reason: "No shared brand token. Cross-host discovery stays closed.",
  };
}

function hostOf(raw: string): string {
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function inspectNonCheckoutUrl(
  raw: string,
  probe?: HostInspectProbe,
): Promise<SafeInspectResult> {
  const roles = classifyUrlRoles(raw);
  const safe = inspectPublicHttpsUrl(raw);
  if (roles.checkout) {
    return {
      requestedUrl: sanitizeSharedUrl(raw),
      accessed: false,
      httpStatus: null,
      location: null,
      blocked: true,
      reason: "Checkout or order path. Navigation stopped before any request.",
      checkoutNavigated: false,
    };
  }
  if (!safe.ok) {
    return {
      requestedUrl: sanitizeSharedUrl(raw),
      accessed: false,
      httpStatus: null,
      location: null,
      blocked: true,
      reason: safe.reason,
      checkoutNavigated: false,
    };
  }
  try {
    const result = probe
      ? await probe(safe.url.toString())
      : await defaultProbe(safe.url.toString());
    const location = result.location ? new URL(result.location, safe.url).toString() : null;
    const locationRoles = location ? classifyUrlRoles(location) : null;
    if (locationRoles?.checkout) {
      return {
        requestedUrl: sanitizeSharedUrl(safe.url.toString()),
        accessed: true,
        httpStatus: result.status,
        location: sanitizeSharedUrl(location!),
        blocked: true,
        reason: "Redirect target is a checkout or order path. Destination was not opened.",
        checkoutNavigated: false,
      };
    }
    return {
      requestedUrl: sanitizeSharedUrl(safe.url.toString()),
      accessed: true,
      httpStatus: result.status,
      location: location ? sanitizeSharedUrl(location) : null,
      blocked: false,
      reason: "Non-checkout URL was requested with redirect=manual.",
      checkoutNavigated: false,
    };
  } catch (error) {
    return {
      requestedUrl: sanitizeSharedUrl(raw),
      accessed: false,
      httpStatus: null,
      location: null,
      blocked: true,
      reason: error instanceof Error ? error.message : "Request failed.",
      checkoutNavigated: false,
    };
  }
}

async function defaultProbe(url: string): Promise<{ status: number; location: string | null }> {
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "AfiliadoIA-Lab/54AD (source-resolution; +local)" },
    signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, location: response.headers.get("location") };
}
