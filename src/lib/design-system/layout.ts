import type { ProductContract } from "@/lib/product-contract/types";

/**
 * Layout helpers for the lab prototypes. Generic contract signals only — never a name, slug or id.
 */

export function filledBlockCount(contract: ProductContract): number {
  return [
    contract.features?.length,
    contract.specifications?.length,
    contract.components?.length,
    contract.benefits?.length,
    contract.usage?.length,
    contract.cautions?.length,
    contract.offer?.packages.length,
    contract.guarantee,
    contract.operational?.returns?.length,
    contract.operational?.shipping?.length,
    contract.faq?.length,
    contract.images?.hero,
  ].filter(Boolean).length;
}

/** Thin pages drop the large section rhythm. Full pages keep a commercial cadence. */
export function pageDensity(contract: ProductContract): "thin" | "full" {
  return filledBlockCount(contract) <= 3 ? "thin" : "full";
}

/** A live purchase CTA. Blocked, preview-only or failed gates never get a buy button. */
export function purchaseCtaAllowed(contract: ProductContract): boolean {
  if (contract.cta.state !== "AUTHORIZED") return false;
  if (!contract.cta.href) return false;
  if (contract.gates.link !== "PASS") return false;
  if (contract.gates.policy === "FAIL") return false;
  return true;
}

/**
 * Sticky mobile CTA. All three must hold:
 * - an authorized href
 * - policy/link gates allow the action
 * - a verified offer (commercial context)
 */
export function stickyCtaAllowed(contract: ProductContract): boolean {
  return purchaseCtaAllowed(contract) && Boolean(contract.offer?.packages.length);
}

/** Column count encoded on the grid so 3 items never sit as 2+1. */
export function autoGridCount(itemCount: number): number {
  return Math.max(0, itemCount);
}
