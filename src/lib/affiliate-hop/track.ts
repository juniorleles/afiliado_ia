import { generateClickId, isValidClickId } from "@/lib/analytics";
import { ctaMayRender } from "@/lib/affiliate-hop/authorize";
import { readClicks, writeClicks } from "@/lib/affiliate-hop/store";
import type { ClickRecordResult, HopRecord, OfficialOfferClick } from "@/lib/affiliate-hop/types";

/**
 * Records a real official-offer click. Simulated events and unauthorized CTAs are rejected.
 * A click is not a conversion or a sale.
 */
export function recordOfficialOfferClick(input: {
  record: HopRecord | null;
  productId: string;
  landingPageId?: string | null;
  presellMode?: OfficialOfferClick["presellMode"];
  campaignId?: string | null;
  eventId?: string;
  simulated?: boolean;
  now?: string;
  storeRoot?: string;
}): ClickRecordResult {
  if (input.simulated) return { ok: false, reason: "SIMULATED_REJECTED" };
  if (!ctaMayRender(input.record)) return { ok: false, reason: "CTA_NOT_AUTHORIZED" };
  const eventId = input.eventId ?? generateClickId();
  if (!isValidClickId(eventId)) return { ok: false, reason: "INVALID_EVENT" };
  const existing = readClicks(input.productId, input.storeRoot);
  if (existing.some((item) => item.eventId === eventId)) return { ok: false, reason: "DUPLICATE_EVENT" };
  const click: OfficialOfferClick = {
    event: "official_offer_click",
    eventId,
    productId: input.productId,
    landingPageId: input.landingPageId ?? null,
    presellMode: input.presellMode ?? null,
    campaignId: input.campaignId ?? null,
    timestamp: input.now ?? new Date().toISOString(),
    simulated: false,
  };
  writeClicks(input.productId, [...existing, click], input.storeRoot);
  return { ok: true, click };
}
