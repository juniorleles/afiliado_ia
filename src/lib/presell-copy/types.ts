export const PRESELL_COPY_VERSION = 1 as const;

export type SellerStatementClass =
  | "VERIFIED_PRODUCT_FACT"
  | "SELLER_STATED_ALLOWED"
  | "SELLER_STATED_RESTRICTED"
  | "UNVERIFIED"
  | "CONFLICTING"
  | "PROHIBITED";

export type SellerStatementDecision = {
  text: string;
  class: SellerStatementClass;
  publishable: boolean;
  attributionRequired: boolean;
  restatement: string | null;
  reason: string;
  sourceUrl: string | null;
};

export type ConversionHandoff = {
  status: "AUTHORIZED" | "PREVIEW_ONLY" | "BLOCKED_PLACEHOLDER";
  label: string | null;
  href: string | null;
  tracking: { enabled: false; event: null } | { enabled: true; event: "official_offer_click" };
  reason: string;
};

export type ClaimAuditRow = {
  id: string;
  originalText: string;
  field: string;
  claimType: string;
  blockReason: string;
  class: SellerStatementClass;
  factualRestatement: string | null;
  manufacturerAttributionAppropriate: false | "NOT_SUFFICIENT" | "OPERATIONAL_ONLY";
  publishable: boolean;
};
