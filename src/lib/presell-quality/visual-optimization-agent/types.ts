export const VISUAL_OPTIMIZATION_AGENT_ID = "PRESELL_VISUAL_OPTIMIZATION_AGENT_V1" as const;
export const VISUAL_OPTIMIZATION_PROMPT_VERSION = "1" as const;
export const VISUAL_OPTIMIZATION_MAX_ITERATIONS = 3 as const;
export const CONVERSION_OPTIMIZATION_AGENT_ID = "PRESELL_CONVERSION_OPTIMIZATION_AGENT_V1" as const;
export const CONVERSION_OPTIMIZATION_PROMPT_VERSION = "1" as const;
export const EDITORIAL_QUALITY_GATE_ID = "PRESELL_EDITORIAL_QUALITY_GATE_V1" as const;
export const EDITORIAL_QUALITY_PROMPT_VERSION = "1" as const;
export const EDITORIAL_HEADLINE_MAX_WORDS = 8 as const;
export const EDITORIAL_SUBHEADLINE_MAX_WORDS = 25 as const;

export const VISUAL_OPTIMIZATION_OPS = [
  "SET_HERO_DENSITY",
  "SET_PACKSHOT_SCALE",
  "SET_HERO_COLUMNS",
  "SET_HERO_MIN_HEIGHT",
  "SET_PACKAGES_IN_FOLD",
  "SET_PACKAGE_DENSITY",
  "SET_PRICE_EMPHASIS",
  "SET_PACKAGE_HIGHLIGHT",
  "SET_COPY_TONE",
  "SET_COMPLIANCE_PLACEMENT",
  "SET_CARD_ELEVATION",
  "SET_BUTTON_WEIGHT",
  "SET_RADIUS",
  "SET_SANDBOX_PLACEMENT",
  "SET_HIDE_HERO_CHIPS",
  "SET_PRODUCT_PRESENTATION",
  "SET_SECTION_JOURNEY",
  "SET_OFFER_COMPARE",
  "SET_TYPOGRAPHY_SCALE",
  "SET_INGREDIENT_LAYOUT",
  "SET_FAQ_MODE",
  "SET_MERGE_FULFILLMENT",
] as const;
export type VisualOptimizationOp = (typeof VISUAL_OPTIMIZATION_OPS)[number];

export const ALLOWED_COPY_OPS = [
  "MOVE_COMPLIANCE",
  "PRESENT_COMMERCIAL_TONE",
  "SET_HEADLINE",
  "SET_SUBHEADLINE",
  "SET_HERO_BODY",
  "SET_CTA_LABEL",
  "MOVE_SANDBOX_TO_ADMIN",
  "HIDE_HERO_CHIPS",
  "SET_PRODUCT_PRESENTATION",
  "SET_SECTION_JOURNEY",
  "SET_OFFER_COMPARE",
  "REWRITE_HEADLINE",
  "REWRITE_SUBHEADLINE",
  "MERGE_DUPLICATE_SECTIONS",
  "REMOVE_EMPTY_SECTION",
  "REORDER_SECTIONS",
  "ADJUST_TYPOGRAPHY",
  "REFINE_INGREDIENT_LAYOUT",
  "IMPROVE_OFFER_HIERARCHY",
  "COMPLETE_GROUNDED_FAQ",
] as const;
export type AllowedCopyOp = (typeof ALLOWED_COPY_OPS)[number];

export const EDITORIAL_ISSUE_CODES = [
  "HEADLINE_TOO_LONG",
  "HEADLINE_FACT_DUMP",
  "DUPLICATED_SECTION",
  "EMPTY_SECTION",
  "LOW_INFORMATION_DENSITY",
  "EXCESSIVE_REPETITION",
  "UNSUPPORTED_COPY",
  "FAQ_WITHOUT_ANSWER",
] as const;
export type EditorialIssueCode = (typeof EDITORIAL_ISSUE_CODES)[number];

export const FORBIDDEN_AGENT_TARGETS = [
  "QUALITY_GATE",
  "BEST_CANDIDATE_SELECTOR",
  "PRODUCT_CONTRACT",
  "BUDGET_MANAGER",
  "CONTENT_SAFETY",
  "COMMERCIAL_AUTHORIZATION",
  "PUBLICATION",
  "ADS",
] as const;

export type HeroDensity = "sparse" | "balanced" | "compact";
export type PackshotScale = "sm" | "md" | "lg" | "xl";
export type HeroColumns = "copy-product-facts" | "product-copy-facts" | "copy-product";
export type HeroMinHeight = "none" | "content";
export type PackageDensity = "plain" | "featured";
export type PriceEmphasis = "body" | "display";
export type PackageHighlight = "none" | "middle" | "best-value";
export type CopyTone = "compliance" | "commercial";
export type CompliancePlacement = "inline" | "aside" | "footer-band";
export type CardElevation = "flat" | "raised";
export type ButtonWeight = "quiet" | "strong";
export type RadiusToken = "soft" | "crisp";
export type SandboxPlacement = "admin" | "aside" | "inline";
export type ProductPresentation = "editorial" | "none";
export type SectionJourney = "packages-first" | "source";
export type TypographyScale = "source" | "readable";
export type IngredientLayout = "plain" | "distinct";
export type FaqMode = "collapsed" | "interactive";

export type ConversionComposition = {
  sandboxPlacement: SandboxPlacement;
  hideHeroChips: boolean;
  productPresentation: ProductPresentation;
  sectionJourney: SectionJourney;
  offerCompare: boolean;
  mergeFulfillment: boolean;
  typographyScale: TypographyScale;
  ingredientLayout: IngredientLayout;
  faqMode: FaqMode;
};

export type EditorialIssue = {
  issue: EditorialIssueCode;
  component: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  operation: string;
  proposed_value: string;
  supporting_fact_ids: string[];
  requires_content_approval: boolean;
  evidence: string;
};

export type VisualComposition = {
  version: 1;
  executionId: string;
  iteration: number;
  hero: {
    density: HeroDensity;
    columns: HeroColumns;
    packshotScale: PackshotScale;
    minHeight: HeroMinHeight;
    packagesInFold: boolean;
  };
  copy: {
    tone: CopyTone;
    compliancePlacement: CompliancePlacement;
  };
  packages: {
    density: PackageDensity;
    priceEmphasis: PriceEmphasis;
    highlight: PackageHighlight;
  };
  identity: {
    radius: RadiusToken;
    cardElevation: CardElevation;
    buttonWeight: ButtonWeight;
  };
  conversion: ConversionComposition;
};

export type FactBackedCopy = {
  current: string;
  proposed: string;
  supporting_fact_ids: string[];
};

export type CommercialCopyState = {
  version: 1;
  executionId: string;
  iteration: number;
  headline: { text: string; supportingFactIds: string[] };
  subheadline: { text: string; supportingFactIds: string[] };
  heroBody: { text: string; supportingFactIds: string[] };
  ctaLabel: string;
};

export type ApprovedCopyInventory = {
  productName: string;
  productKind: string | null;
  ingredients: string[];
  description: string;
  usage: string;
  guarantee: string;
  guaranteeDays: number | null;
  packages: Array<{ quantity: string; unitPrice: string; currentTotal: string; duration: string; shippingTerm: string; bonuses: string[] }>;
  approvedExcerpts: string[];
};

export type CommercialCopyPlan = {
  headline: FactBackedCopy;
  subheadline: FactBackedCopy;
  section_changes: CopyChange[];
  offer_presentation: LayoutChange[];
  visual_changes: LayoutChange[];
  conversion_improvements: string[];
  compliance_risks: string[];
};

export type FactMappingRow = {
  field: string;
  text: string;
  supportingFactIds: string[];
  grounded: boolean;
  reason: string;
};

export type LayoutChange = {
  op: string;
  value: string | boolean;
};

export type CopyChange = {
  op: string;
  value?: string;
};

export type VisualDefect = {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  component: string;
  problem: string;
  proposed_fix: string;
};

export type VisualAnalysisPlan = {
  visual_defects: VisualDefect[];
  layout_changes: LayoutChange[];
  copy_changes: CopyChange[];
  expected_improvements: string[];
  content_safety_risks: string[];
};

export type AppliedChange = {
  op: string;
  value: string | boolean;
  applied: boolean;
  reason: string;
};

export type VisualInspectResult = {
  viewport: "desktop" | "tablet" | "mobile";
  packshotVisible: boolean;
  packshotWidth: number;
  packshotHeight: number;
  packshotInFold: boolean;
  headlineReadable: boolean;
  emptyHeroSpace: boolean;
  overflowX: boolean;
  packageCards: number;
  packageCardsStraddlingFold: number;
  packageCardsComplete: boolean;
  overlap: boolean;
  buttonsInsideWidth: boolean;
  criticalDefects: string[];
};

export type IterationRecord = {
  iteration: number;
  candidate: string;
  composition: VisualComposition;
  copy?: CommercialCopyState;
  kept: boolean;
  reason: string;
  inspect: VisualInspectResult[];
  applied: AppliedChange[];
  analysis: VisualAnalysisPlan | null;
  commercialPlan?: CommercialCopyPlan | null;
  analysisSource: "ai" | "confirmed-defects" | "none";
};
