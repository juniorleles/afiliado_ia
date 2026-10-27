export const AFFILIATE_HOP_VERSION = 1 as const;

export type HopAuthorizationStatus =
  | "UNCONFIGURED"
  | "PENDING_VALIDATION"
  | "VALIDATED"
  | "AUTHORIZED_FOR_PREVIEW"
  | "AUTHORIZED_FOR_PRODUCTION"
  | "BLOCKED";

export type RedirectValidationStatus = "PASS" | "FAIL" | "INCONCLUSIVE";

export type HopFormatIssue =
  | "NOT_HTTPS"
  | "NOT_CLICKBANK_HOP"
  | "PLACEHOLDER"
  | "SUSPICIOUS_CHARACTERS"
  | "CREDENTIALS"
  | "PRIVATE_OR_LOCAL"
  | "UNPARSEABLE";

export type HopFormatResult = {
  ok: boolean;
  href: string | null;
  host: string | null;
  issues: HopFormatIssue[];
};

export type RedirectHop = {
  url: string;
  host: string;
  status: number | null;
};

export type DestinationProbe = {
  status: RedirectValidationStatus;
  initialUrl: string;
  chain: RedirectHop[];
  finalUrl: string | null;
  finalHost: string | null;
  httpStatus: number | null;
  productMention: boolean;
  trackingPreserved: "PRESENT" | "ABSENT" | "INCONCLUSIVE";
  reason: string;
};

export type HopRecord = {
  version: typeof AFFILIATE_HOP_VERSION;
  productKey: string;
  href: string;
  platform: "clickbank";
  authorization: HopAuthorizationStatus;
  format: HopFormatResult;
  probe: DestinationProbe | null;
  registeredAt: string;
  updatedAt: string;
};

export type OfficialOfferClick = {
  event: "official_offer_click";
  eventId: string;
  productId: string;
  landingPageId: string | null;
  presellMode: "PRESELL_EDITORIAL" | "PRESELL_BOFU" | null;
  campaignId: string | null;
  timestamp: string;
  simulated: false;
};

export type ClickRecordResult =
  | { ok: true; click: OfficialOfferClick }
  | { ok: false; reason: "CTA_NOT_AUTHORIZED" | "SIMULATED_REJECTED" | "DUPLICATE_EVENT" | "INVALID_EVENT" };
