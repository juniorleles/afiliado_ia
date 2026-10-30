export const VISUAL_OPTIMIZATION_AGENT_ID = "PRESELL_VISUAL_OPTIMIZATION_AGENT_V1" as const;
export const VISUAL_OPTIMIZATION_PROMPT_VERSION = "1" as const;
export const VISUAL_OPTIMIZATION_MAX_ITERATIONS = 3 as const;

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
] as const;
export type VisualOptimizationOp = (typeof VISUAL_OPTIMIZATION_OPS)[number];

export const ALLOWED_COPY_OPS = ["MOVE_COMPLIANCE", "PRESENT_COMMERCIAL_TONE"] as const;
export type AllowedCopyOp = (typeof ALLOWED_COPY_OPS)[number];

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
  kept: boolean;
  reason: string;
  inspect: VisualInspectResult[];
  applied: AppliedChange[];
  analysis: VisualAnalysisPlan | null;
  analysisSource: "ai" | "confirmed-defects" | "none";
};
