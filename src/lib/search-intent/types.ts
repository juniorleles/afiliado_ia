export const SEARCH_INTENT_VERSION = 1 as const;

export type SearchIntent =
  | "INFORMATIONAL"
  | "COMMERCIAL_INVESTIGATION"
  | "TRANSACTIONAL"
  | "NAVIGATIONAL";

export type PresellMode = "PRESELL_EDITORIAL" | "PRESELL_BOFU";

export type SearchIntentClassification = {
  query: string;
  intent: SearchIntent;
  mode: PresellMode;
  confidence: "HIGH" | "LOW";
  uncertain: boolean;
  signals: string[];
  reason: string;
};

export type BofuSlot =
  | "HERO"
  | "PRODUCT_SUMMARY"
  | "VERIFIED_OFFER_DETAILS"
  | "GUARANTEE"
  | "KEY_FEATURES"
  | "FAQ"
  | "OFFICIAL_OFFER_HANDOFF"
  | "LEGAL_DISCLOSURE";

export type HopLinkReadiness = {
  platform: string | null;
  productIdentifier: string | null;
  authorizedDestination: string | null;
  hopValidated: boolean;
  destinationVerified: boolean;
  authorizationStatus: "AUTHORIZED" | "PREVIEW_ONLY" | "BLOCKED_PLACEHOLDER";
  cta: { enabled: boolean; label: string | null };
  clickEvent: "official_offer_click" | null;
  openRedirectBlocked: true;
  sensitiveFieldsLogged: false;
};

export type AdsCheckId =
  | "ADVERTISER_IDENTITY"
  | "AFFILIATE_TRANSPARENCY"
  | "NO_MISLEADING_CLAIMS"
  | "NO_UNVERIFIED_PRICES"
  | "NO_FAKE_URGENCY"
  | "NO_INVENTED_REVIEWS"
  | "NO_UNVERIFIED_BADGES"
  | "LEGAL_LINKS"
  | "OWN_CONTENT"
  | "COMMERCIAL_DESTINATION";

export type AdsCheckVerdict = "PASS" | "FAIL" | "NOT_EVALUATED";

export type AdsReadinessCheck = {
  id: AdsCheckId;
  verdict: AdsCheckVerdict;
  reason: string;
};

export type GoogleAdsReadiness = {
  certified: false;
  disclaimer: "These checks are readiness signals. They are not Google Ads approval or guaranteed compliance.";
  checks: AdsReadinessCheck[];
};
