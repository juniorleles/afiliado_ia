export type StickyCtaSignals = {
  heroCtaVisible: boolean;
  otherPrimaryCtaVisible: boolean;
  footerVisible: boolean;
  disclosureVisible: boolean;
  guaranteeVisible?: boolean;
  scrolledPastIntent?: boolean;
  contentInStickyZone?: boolean;
};

/** Deterministic sticky CTA visibility. No dark patterns. */
export function stickyCtaShouldShow(signals: StickyCtaSignals): boolean {
  if (signals.heroCtaVisible) return false;
  if (signals.otherPrimaryCtaVisible) return false;
  if (signals.guaranteeVisible) return false;
  if (signals.footerVisible) return false;
  if (signals.disclosureVisible) return false;
  if (signals.contentInStickyZone) return false;
  if (signals.scrolledPastIntent === false) return false;
  return true;
}

export const STICKY_COLLISION_PADDING_PX = 96;
export const STICKY_SCROLL_INTENT_PX = 240;
export const STICKY_SAFE_AREA = "max(0.5rem, env(safe-area-inset-bottom, 0px))";
