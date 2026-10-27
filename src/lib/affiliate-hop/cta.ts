import type { ProductContract } from "@/lib/product-contract/types";
import { purchaseCtaAllowed } from "@/lib/design-system/layout";
import { ctaMayRender, productionPublicationBlocked } from "@/lib/affiliate-hop/authorize";
import type { HopRecord } from "@/lib/affiliate-hop/types";

export const PREVIEW_CTA_LABEL = "View Official Offer";

export type PreparedCta = {
  visible: boolean;
  label: string | null;
  href: string | null;
  reason: string;
  productionBlocked: boolean;
};

/**
 * The commercial CTA stays hidden until the hop is validated and preview
 * or production authorization is explicit. This page is never the official site.
 */
export function prepareOfficialOfferCta(record: HopRecord | null, contract?: ProductContract): PreparedCta {
  const productionBlocked = productionPublicationBlocked(record);
  if (!record) {
    return { visible: false, label: null, href: null, reason: "No hop is registered.", productionBlocked };
  }
  if (!ctaMayRender(record)) {
    return {
      visible: false,
      label: null,
      href: null,
      reason:
        record.authorization === "VALIDATED"
          ? "The hop is validated. Preview authorization has not been granted."
          : "The hop is not authorized for a live CTA.",
      productionBlocked,
    };
  }
  if (contract && contract.gates.policy === "FAIL") {
    return { visible: false, label: null, href: null, reason: "The commercial policy gate blocked the CTA.", productionBlocked };
  }
  if (contract && record.authorization === "AUTHORIZED_FOR_PRODUCTION" && !purchaseCtaAllowed(contract)) {
    return { visible: false, label: null, href: null, reason: "The contract does not allow a purchase CTA.", productionBlocked };
  }
  return {
    visible: true,
    label: PREVIEW_CTA_LABEL,
    href: record.href,
    reason: record.authorization === "AUTHORIZED_FOR_PRODUCTION"
      ? "Production authorization is recorded."
      : "Preview authorization is recorded.",
    productionBlocked,
  };
}
