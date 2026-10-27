import type { ProductContract } from "@/lib/product-contract/types";
import { inspectPublicHttpsUrl, stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
import { buildConversionHandoff } from "@/lib/presell-copy/handoff";
import type { HopLinkReadiness } from "@/lib/search-intent/types";

function platformOf(href: string | null): string | null {
  if (!href) return null;
  try {
    const host = new URL(href).hostname.toLowerCase();
    if (host.includes("clickbank")) return "clickbank";
    if (host.includes("shareasale")) return "shareasale";
    if (host.includes("impact")) return "impact";
    return "affiliate";
  } catch {
    return null;
  }
}

function productIdentifierOf(contract: ProductContract): string | null {
  const slug = contract.identity.slug?.trim();
  return slug || null;
}

/**
 * Readiness contract only. It does not invent a hop, store tokens, or fire clicks.
 */
export function buildHopLinkReadiness(contract: ProductContract): HopLinkReadiness {
  const handoff = buildConversionHandoff(contract);
  const raw = contract.cta.href?.trim() || null;
  const hop = raw ? stripUnverifiedHop(raw) : { href: "", hopPlaceholder: false };
  const publicOk = handoff.href ? inspectPublicHttpsUrl(handoff.href).ok : false;
  return {
    platform: platformOf(handoff.href),
    productIdentifier: productIdentifierOf(contract),
    authorizedDestination: handoff.href,
    hopValidated: Boolean(handoff.href) && !hop.hopPlaceholder,
    destinationVerified: publicOk,
    authorizationStatus: handoff.status,
    cta: { enabled: handoff.status === "AUTHORIZED", label: handoff.label },
    clickEvent: handoff.tracking.enabled ? handoff.tracking.event : null,
    openRedirectBlocked: true,
    sensitiveFieldsLogged: false,
  };
}
