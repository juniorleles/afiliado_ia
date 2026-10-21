/**
 * Product Assets Intelligence (Execution 47A).
 *
 * An image is a candidate until four independent checks agree and a person approves it:
 *   1. technical validity (the file is a servable image),
 *   2. product correspondence (it shows this product),
 *   3. provenance (it comes from the product's own sources),
 *   4. documented commercial authorization.
 * Technical validity never implies authorization. A public image is not a licensed image.
 * Nothing in this module reads or writes ProductFacts, so image evidence cannot become copy.
 */

export const ASSET_ORIGINS = [
  "OFFICIAL_PRODUCT_PAGE",
  "MANUFACTURER_AFFILIATE_TOOLS",
  "AFFILIATE_PLATFORM",
  "OPERATOR_UPLOAD",
  "THIRD_PARTY_SITE",
  "COMPETITOR",
  "AI_GENERATED",
  "RECREATED",
  "UNKNOWN",
] as const;
export type AssetOrigin = (typeof ASSET_ORIGINS)[number];

/** Origins that can never be presented as a real photograph of this product. */
export const PROHIBITED_ORIGINS: readonly AssetOrigin[] = ["COMPETITOR", "AI_GENERATED", "RECREATED"];

export const ASSET_KINDS = ["PACKSHOT", "PACKAGING", "CONTEXTUAL", "BRAND_LOGO", "PROMO_BANNER", "OTHER"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Kinds that may stage a product on a page. Logos and promotional banners never can. */
export const STAGEABLE_KINDS: readonly AssetKind[] = ["PACKSHOT", "PACKAGING", "CONTEXTUAL"];

export type ListingSection = "PRODUCT_IMAGES" | "CAMPAIGN_IMAGES" | "DISPLAYED_ONLY" | "DOWNLOAD_PACK" | "OFFICIAL_API" | "META_TAG";

export type AssetListing = {
  /** Page on which the image was found. */
  sourcePage: string;
  section: ListingSection;
  observedAt: string;
};

/**
 * Where the right to use an image comes from (Execution 47B).
 * The first four are the recognized policy sources. A program source counts only when the file was
 * offered to affiliates for promotion, not merely displayed on a public page.
 * MANUFACTURER_ASSET_SECTION and WRITTEN_LICENSE are the 47A names and are read as aliases.
 */
export const AUTHORIZATION_KINDS = [
  "OFFICIAL_AFFILIATE_ASSET_LIBRARY",
  "OFFICIAL_AFFILIATE_API",
  "MANUFACTURER_PROMOTIONAL_MATERIAL",
  "EXPLICIT_WRITTEN_PERMISSION",
  "OPERATOR_RIGHTS_DECLARATION",
  "MANUFACTURER_ASSET_SECTION",
  "WRITTEN_LICENSE",
] as const;
export type AuthorizationKind = (typeof AUTHORIZATION_KINDS)[number];

/** Kinds that allow an image to pass without a person approving it, once every mandatory check holds. */
export const POLICY_AUTHORIZATION_KINDS: readonly AuthorizationKind[] = [
  "OFFICIAL_AFFILIATE_ASSET_LIBRARY",
  "OFFICIAL_AFFILIATE_API",
  "MANUFACTURER_PROMOTIONAL_MATERIAL",
  "EXPLICIT_WRITTEN_PERMISSION",
];

/** Where the program says the material may be used. UNSPECIFIED is never enough for the kinds that need an explicit scope. */
export type UseScope = "LANDING_PAGE" | "PROMOTIONAL_GENERAL" | "CHANNEL_LIMITED" | "PROHIBITED" | "UNSPECIFIED";

export type ProgramRestriction = {
  /** The restriction as the program states it. */
  text: string;
  /** True when this restriction covers the asset being evaluated. Decided by whoever records the evidence. */
  appliesToThisAsset: boolean;
};

export type AuthorizationEvidence = {
  kind: AuthorizationKind;
  /** Where the permission is stated. Null only for an operator declaration or a written permission kept off-line. */
  sourceUrl: string | null;
  statement: string;
  verifiedAt: string;
  /** Affiliate program or manufacturer program that offers the material. */
  program?: string | null;
  product?: string | null;
  /** Identifier the program gives the material, when it gives one. */
  materialId?: string | null;
  /** The program placed this file in its library, API, or pack for affiliates to promote with. False or absent means only displayed. */
  offeredForPromotion?: boolean;
  useScope?: UseScope;
  /** Restrictions of the program known when the evidence was recorded. */
  restrictions?: ProgramRestriction[];
  /** When the program's restrictions were read for this record. Required by the policy kinds. */
  restrictionsReviewedAt?: string | null;
  validUntil?: string | null;
  /** The program or manufacturer withdrew the permission. */
  revokedAt?: string | null;
};
export type HumanApproval = {
  mode?: "HUMAN" | "POLICY";
  approvedBy: string;
  approvedAt: string;
  embeddedTextReviewed: boolean;
  productMatchConfirmed: boolean;
};

/** What was measured on the file. Absent until somebody actually fetched it. */
export type MeasuredImage = {
  checkedAt: string;
  httpStatus: number | null;
  contentType: string | null;
  byteLength: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  format: "jpeg" | "png" | "webp" | "avif" | "gif" | "unknown" | null;
  /** Failure reason when the fetch itself failed (DNS, timeout, non-https redirect). */
  fetchError: string | null;
};

export type ProductAssetCandidate = {
  id: string;
  productName: string;
  /** Original URL as listed by the source. Never rewritten. */
  url: string;
  origin: AssetOrigin;
  kind: AssetKind;
  fileName: string;
  alt: string | null;
  /** Product named by the source for this image, when the source names one. */
  declaredProduct: string | null;
  listing: AssetListing;
  authorizationEvidence: AuthorizationEvidence | null;
  /** Filename or alt text carries a health claim, promise, or testimonial. A hard block, never overridden. */
  policyBlock: string | null;
  /** A person already decided against it. */
  humanRejection: { note: string; at: string } | null;
  approval: HumanApproval | null;
  /** Served copy, once stored. Required before an asset can be approved. */
  localFile: string | null;
  measured: MeasuredImage | null;
};

export type EvaluationContext = {
  productName: string;
  /** Hostnames that belong to the product: sales page, affiliate tools, manufacturer. */
  officialHosts: readonly string[];
  /** Hostnames of file CDNs the manufacturer itself named in its asset page. */
  declaredAssetHosts?: readonly string[];
  /** Names of other products in the catalog. An image that names one of them is not ours. */
  otherProducts?: readonly string[];
  /** Hosts of the affiliate platform that run official asset APIs. */
  programHosts?: readonly string[];
  /** Evaluation instant. Needed for expiry and staleness. Defaults to the current time. */
  now?: string;
};

export type Finding = { code: string; message: string };

export type TechnicalStatus = "PASS" | "PASS_NEEDS_CONVERSION" | "FAIL" | "NOT_CHECKED";
export type MatchStatus = "CONFIRMED" | "PLAUSIBLE" | "UNCONFIRMED" | "CONTRADICTED";
export type ProvenanceStatus = "OFFICIAL" | "DECLARED_HOST" | "UNVERIFIED" | "PROHIBITED";
export type AuthorizationStatus = "DOCUMENTED" | "NOT_DOCUMENTED" | "DENIED";
export type AssetStatus = "APPROVED" | "CANDIDATE" | "REJECTED";

export type AssetEvaluation = {
  id: string;
  technical: { status: TechnicalStatus; findings: Finding[] };
  match: { status: MatchStatus; reasons: string[] };
  provenance: { status: ProvenanceStatus; reasons: string[] };
  authorization: { status: AuthorizationStatus; reasons: string[] };
  duplicateOf: string | null;
  status: AssetStatus;
  /** How an APPROVED asset got there. Null otherwise. */
  approvalMode: "HUMAN" | "POLICY" | null;
  /** Everything that still stands between the candidate and the page. Empty when APPROVED. */
  blockers: string[];
};

/** What the renderer receives. Only approved, stored, documented assets ever appear here. */
export type ApprovedProductAsset = {
  id: string;
  src: string;
  alt: string;
  kind: "PACKSHOT" | "PACKAGING" | "CONTEXTUAL";
  width: number;
  height: number;
  format: string;
  sha256: string;
  origin: AssetOrigin;
  sourcePage: string;
  authorization: {
    kind: AuthorizationKind;
    sourceUrl: string | null;
    verifiedAt: string;
    program: string | null;
    materialId: string | null;
    useScope: UseScope;
    restrictions: string[];
  };
  approvalMode: "HUMAN" | "POLICY";
  approvedAt: string;
};

export type ProductAssetsContract = {
  version: 1;
  productName: string;
  hero: ApprovedProductAsset | null;
  approved: ApprovedProductAsset[];
  counts: { approved: number; candidate: number; rejected: number };
};
