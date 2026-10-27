export const SANDBOX_VERSION = 1 as const;
export const SANDBOX_CTA_LABEL = "View Official Offer";
export const SANDBOX_EVENT = "sandbox_offer_click" as const;
export const SANDBOX_PATH_PREFIX = "/admin/lab/sandbox/";

export type SandboxClick = {
  event: typeof SANDBOX_EVENT;
  eventId: string;
  productId: string;
  landingPageId: string | null;
  presellMode: "PRESELL_EDITORIAL" | "PRESELL_BOFU" | null;
  campaignId: null;
  timestamp: string;
  sandbox: true;
  simulatedJourney: true;
};

export type SandboxClickResult =
  | { ok: true; click: SandboxClick }
  | { ok: false; reason: "SANDBOX_SESSION_MISSING" | "DUPLICATE_EVENT" | "INVALID_EVENT" | "PRODUCTION_EVENT_REJECTED" | "EXTERNAL_HREF" };

export type SandboxSession = {
  version: typeof SANDBOX_VERSION;
  sessionId: string;
  productKey: string;
  landingPageId: string | null;
  presellMode: SandboxClick["presellMode"];
  ctaPath: string;
  createdAt: string;
  productionPromotionBlocked: true;
};

export type SandboxGeneration = {
  enabled: true;
  sessionId: string;
  ctaPath: string;
  productionPromotionBlocked: true;
};

export type PreparedSandboxCta = {
  visible: boolean;
  label: string | null;
  href: string | null;
  badge: "SANDBOX" | null;
  reason: string;
  productionBlocked: true;
};
