import { generateClickId, isValidClickId } from "@/lib/analytics";
import { SANDBOX_EVENT, type SandboxClick, type SandboxClickResult } from "@/lib/sandbox/types";
import { readSandboxClicks, readSandboxSession, writeSandboxClicks } from "@/lib/sandbox/store";

/**
 * Records a lab-only sandbox journey event. It never writes official_offer_click.
 * A sandbox click is not a conversion or a sale.
 */
export function recordSandboxClick(input: {
  sessionId: string;
  productId: string;
  landingPageId?: string | null;
  presellMode?: SandboxClick["presellMode"];
  eventId?: string;
  event?: string;
  now?: string;
  storeRoot?: string;
}): SandboxClickResult {
  if (input.event === "official_offer_click") return { ok: false, reason: "PRODUCTION_EVENT_REJECTED" };
  const session = readSandboxSession(input.sessionId, input.storeRoot);
  if (!session || session.productKey !== input.productId) return { ok: false, reason: "SANDBOX_SESSION_MISSING" };
  const eventId = input.eventId ?? generateClickId();
  if (!isValidClickId(eventId)) return { ok: false, reason: "INVALID_EVENT" };
  const existing = readSandboxClicks(input.productId, input.storeRoot);
  if (existing.some((item) => item.eventId === eventId)) return { ok: false, reason: "DUPLICATE_EVENT" };
  const click: SandboxClick = {
    event: SANDBOX_EVENT,
    eventId,
    productId: input.productId,
    landingPageId: input.landingPageId ?? session.landingPageId,
    presellMode: input.presellMode ?? session.presellMode,
    campaignId: null,
    timestamp: input.now ?? new Date().toISOString(),
    sandbox: true,
    simulatedJourney: true,
  };
  writeSandboxClicks(input.productId, [...existing, click], input.storeRoot);
  return { ok: true, click };
}
