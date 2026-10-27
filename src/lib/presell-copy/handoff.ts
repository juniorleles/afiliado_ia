import { presellCtaAuthorization } from "@/lib/presell-strategy/plan";
import type { ProductContract } from "@/lib/product-contract/types";
import type { ConversionHandoff } from "@/lib/presell-copy/types";

const LABEL = {
  OFFER: "View Official Offer",
  SITE: "Visit Official Website",
  DETAILS: "See Product Details",
} as const;

export function buildConversionHandoff(contract: ProductContract): ConversionHandoff {
  const auth = presellCtaAuthorization(contract);
  if (auth.status !== "AUTHORIZED" || !auth.href || !auth.label) {
    return {
      status: auth.status,
      label: null,
      href: null,
      tracking: { enabled: false, event: null },
      reason: auth.reason,
    };
  }
  const label = auth.label === "View offer" ? (contract.offer?.packages.length ? LABEL.OFFER : LABEL.SITE) : auth.label;
  return {
    status: "AUTHORIZED",
    label: label || LABEL.DETAILS,
    href: auth.href,
    tracking: { enabled: true, event: "official_offer_click" },
    reason: auth.reason,
  };
}
