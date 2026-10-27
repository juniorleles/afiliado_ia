export const POLICY_FIELDS = [
  "brandBiddingPolicy",
  "paidSearchPolicy",
  "directLinkingPolicy",
  "presellPolicy",
  "approvedAssetsPolicy",
  "pricingClaimsPolicy",
  "trademarkRestrictions",
  "geographicRestrictions",
  "disclosureRequirements",
] as const;
export type AffiliatePolicyField = (typeof POLICY_FIELDS)[number];

export const POLICY_VERDICTS = [
  "EXPLICITLY_ALLOWED",
  "EXPLICITLY_PROHIBITED",
  "CONDITIONAL",
  "UNKNOWN",
  "CONFLICTING",
] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

export type AffiliatePolicyRule = {
  field: AffiliatePolicyField;
  verdict: PolicyVerdict;
  excerpt: string | null;
  evidenceIds: string[];
  notes: string[];
};

export type AffiliatePolicyContract = {
  campaignId: number;
  reviewStatus: "UNKNOWN" | "REVIEW_REQUIRED" | "USER_REVIEWED";
  brandBiddingPolicy: AffiliatePolicyRule;
  paidSearchPolicy: AffiliatePolicyRule;
  directLinkingPolicy: AffiliatePolicyRule;
  presellPolicy: AffiliatePolicyRule;
  approvedAssetsPolicy: AffiliatePolicyRule;
  pricingClaimsPolicy: AffiliatePolicyRule;
  trademarkRestrictions: AffiliatePolicyRule;
  geographicRestrictions: AffiliatePolicyRule;
  disclosureRequirements: AffiliatePolicyRule;
  authorizedDestinations: string[];
  policySourceEvidence: string[];
  publicationReady: false;
};

export const GALLERY_KINDS = ["PRODUCT_PACKSHOT", "INGREDIENT", "LIFESTYLE", "BANNER", "LOGO", "OTHER"] as const;
export type GalleryKind = (typeof GALLERY_KINDS)[number];

export type DiscoveredAffiliateAsset = {
  assetUrl: string;
  sourceUrl: string;
  assetType: "IMAGE" | "VIDEO" | "BANNER" | "LOGO" | "OTHER";
  context: string;
  declaredAuthorization: "UNSTATED";
  usageRestrictions: string[];
  status: "DISCOVERED" | "REVIEW_REQUIRED" | "USER_APPROVED" | "REJECTED" | "RESTRICTED";
  galleryKind?: GalleryKind;
  hero?: boolean;
  decidedAt?: string | null;
  kindProposal?: {
    proposedKind: GalleryKind;
    reason: string;
    status: "PENDING" | "CONFIRMED" | "REJECTED";
    limitations: string[];
  } | null;
};
