import type { FactConfidence, SourcePageCategory } from "@/lib/product-facts";
import type { AssetOrigin, AuthorizationKind, UseScope } from "@/lib/product-assets/types";
import type { CommercialUnitKind } from "@/lib/product-contract/units";

/**
 * Universal product presentation contract (Execution 49, from the Execution 48 specification).
 *
 * The only input a renderer reads. It carries facts, their evidence and the state of every optional
 * field. It never carries design: no field names a section, a layout, a colour or a component, and no
 * field is specific to a category, a brand, a campaign or a slug.
 */

export const PRODUCT_CONTRACT_VERSION = 1 as const;

export type DataState = "PRESENT" | "ABSENT" | "PARTIAL" | "WITHHELD_POLICY" | "WITHHELD_UNAUTHORIZED" | "CONFLICTING";

export type ReasonCode =
  // Reused from the adaptive plan.
  | "NO_APPROVED_PACKSHOT"
  | "NO_ELIGIBLE_FEATURES"
  | "NO_ELIGIBLE_USAGE"
  | "NO_VERIFIED_PRICE"
  | "PRICE_CONTEXT_INSUFFICIENT"
  | "NO_ELIGIBLE_GUARANTEE"
  | "NO_AUTHORIZED_AFFILIATE_URL"
  // Added by the contract.
  | "NO_DESCRIPTION"
  /** The description is shown as the value proposition, so it is not repeated (rule O4). */
  | "CARRIED_BY_VALUE_PROPOSITION"
  | "NO_VALUE_PROPOSITION"
  | "NO_SPECIFICATIONS"
  | "NO_COMPONENTS"
  | "NO_BENEFIT_SOURCE"
  | "NO_CAUTIONS"
  | "NO_RETURNS"
  | "NO_SHIPPING"
  | "NO_FAQ"
  | "NO_BRAND"
  | "NO_PRODUCT_KIND"
  | "NO_PROVENANCE"
  | "NO_GALLERY"
  | "NO_HEALTH_CONTENT"
  | "CLAIM_WITHHELD_POLICY"
  | "SCALAR_CONFLICT"
  | "IMAGE_NOT_AUTHORIZED"
  | "LINK_NOT_AUTHORIZED"
  | "ASSETS_NOT_RESOLVED"
  | "PREVIEW_ONLY";

export type DataStateEntry = {
  state: DataState;
  reason: ReasonCode | null;
};

export type EvidenceEntry = {
  id: string;
  sourceUrl: string | null;
  sourcePageCategory: SourcePageCategory | null;
  sourceUnit?: string;
  sourceLocation?: string;
  retrievedAt?: string;
  /** DIRECT_SOURCE means the source said it. It is not independent verification. */
  confidence: FactConfidence;
  copyEligibility: "YES";
  /** Where the statement came from in ProductFacts. Technical, never displayed. */
  field: string;
};

export type Statement = { text: string; evidenceRefs: string[] };

export type SpecificationItem = { name: string; value: string; unit?: string; evidenceRefs: string[] };

export type ComponentItem = {
  name: string;
  /** Stated by the source or the operator. Omitted when not stated. */
  role?: "INGREDIENT" | "COMPONENT" | "MATERIAL" | "INCLUDED_ITEM";
  note?: string;
  evidenceRefs: string[];
};

export type ApprovedAssetView = {
  src: string;
  /** Built from the product name. Never copied from a file name or a claim. */
  alt: string;
  width: number;
  height: number;
  sha256: string;
  origin: AssetOrigin;
  kind: "PACKSHOT" | "PACKAGING" | "CONTEXTUAL";
  /** Summary for audit. Never rendered. */
  authorization: { kind: AuthorizationKind; useScope: UseScope; approvalMode: "HUMAN" | "POLICY" };
};

export type OfferPackage = {
  /** Package name exactly as the source wrote it. */
  label: string;
  quantity?: { text: string; count: number; unit: CommercialUnitKind };
  /** Every price below is a verbatim string. None is computed. */
  totalPrice?: string;
  unitPrice?: string;
  originalPrice?: string;
  savings?: string;
  shipping?: string;
  bonuses?: string;
  popularityLabel?: string;
  evidenceRefs: string[];
};

export type OperationalStatement = { kind: string; statement: string; evidenceRefs: string[] };

export type CtaState = "AUTHORIZED" | "PREVIEW_ONLY" | "MISSING";

export type GateStatus = "PASS" | "FAIL" | "REVIEW";

export type ContractStatus = "RENDERABLE" | "INSUFFICIENT_FOR_PAGE";

export type ProductContract = {
  contractVersion: typeof PRODUCT_CONTRACT_VERSION;
  status: ContractStatus;
  identity: {
    productName: string;
    brand?: string;
    /** Free noun phrase stated by the source. Never a closed list and never a layout switch. */
    productKind?: string;
    language: "en";
    /** Technical. Never displayed and never used for logic. */
    slug: string;
  };
  valueProposition?: { headline?: Statement; supporting?: Statement[] };
  description?: Statement;
  features?: Array<Statement & { attribution: "SOURCE_STATEMENT" }>;
  specifications?: SpecificationItem[];
  components?: ComponentItem[];
  /** Attributed seller claims that passed policy. Never described as proven. */
  benefits?: Array<Statement & { attribution: "SELLER_CLAIM"; policyStatus: "PASS" }>;
  usage?: Statement[];
  /** Every caution the source stated must be shown. */
  cautions?: Statement[];
  images?: { hero?: ApprovedAssetView; gallery?: ApprovedAssetView[] };
  offer?: { packages: OfferPackage[] };
  cta: { state: CtaState; href?: string; label?: string };
  guarantee?: { text: string; origin: "PRODUCT_SOURCE"; evidenceRefs: string[] };
  operational?: { returns?: OperationalStatement[]; shipping?: OperationalStatement[] };
  faq?: Array<{ question: string; answer: string; evidenceRefs: string[] }>;
  complementary?: { provenance?: Statement };
  legal: {
    affiliateDisclosure: string;
    healthDisclaimer?: string;
    notices?: string[];
    trustLinks: Array<{ href: string; label: string }>;
  };
  seo: {
    title: string;
    description: string;
    canonical: string;
    robots: "noindex,nofollow" | "index,follow";
    ogImage?: string;
    structuredData?: Record<string, unknown>;
  };
  /** Every optional field has an entry. A field with no entry is a contract violation. */
  dataStates: Record<string, DataStateEntry>;
  evidence: EvidenceEntry[];
  gates: { grounding: GateStatus; policy: GateStatus; content: GateStatus; assets: GateStatus; link: GateStatus };
  publication: {
    /** CONTENT_READY is not publication approval. A person approves, always. */
    approval: "REQUIRED";
    blockers: string[];
  };
  presentationHints?: { order?: string[] };
};

/** Field paths that must appear in dataStates. */
export const CONTRACT_STATE_PATHS = [
  "identity.brand",
  "identity.productKind",
  "valueProposition.headline",
  "valueProposition.supporting",
  "description",
  "features",
  "specifications",
  "components",
  "benefits",
  "usage",
  "cautions",
  "images.hero",
  "images.gallery",
  "offer.packages",
  "cta",
  "guarantee",
  "operational.returns",
  "operational.shipping",
  "faq",
  "complementary.provenance",
  "legal.healthDisclaimer",
  "seo.ogImage",
] as const;

export type WithheldItem = {
  path: string;
  /** Internal audit only. This text never enters the contract (rule O5). */
  text: string;
  categories: string[];
};

export type ContractDiagnostics = {
  withheld: WithheldItem[];
  conflicts: Array<{ path: string; name: string; values: string[] }>;
  droppedOffers: Array<{ reason: string; text: string }>;
  notes: string[];
};

export type BuildResult = { contract: ProductContract; diagnostics: ContractDiagnostics };
