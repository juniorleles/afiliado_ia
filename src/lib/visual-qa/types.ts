/** Phase 7 Visual QA — separate from Policy/Grounding CONTENT_GATE. */

export const TARGET_VISUAL_STANDARD = "PREMIUM_INTERNATIONAL" as const;

export const VISUAL_QA_STATUSES = ["PASS", "REVIEW_REQUIRED"] as const;
export type VisualQaStatus = (typeof VISUAL_QA_STATUSES)[number];

export const FINDING_SEVERITIES = ["INFO", "WARNING", "HIGH"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const VISUAL_QA_ACTION_CODES = [
  "REDUCE_VISIBLE_CONTENT_DENSITY",
  "PROMOTE_PRODUCT_VISUAL",
  "CREATE_HERO_FOCAL_POINT",
  "COLLAPSE_SECONDARY_DETAILS",
  "INCREASE_SECTION_VARIATION",
  "IMPROVE_TYPE_SCALE",
  "REDUCE_CARD_REPETITION",
  "IMPROVE_CTA_DISTRIBUTION",
  "ADD_VISUAL_ASSET_SLOT",
  "IMPROVE_MOBILE_COMPOSITION",
  "ACQUIRE_PRODUCT_IMAGE",
  "IMPROVE_PROGRESSIVE_DISCLOSURE",
  "STRENGTHEN_ART_DIRECTION",
  "REMOVE_FAKE_TRUST_SIGNAL",
] as const;
export type VisualQaActionCode = (typeof VISUAL_QA_ACTION_CODES)[number];

export const VISUAL_QA_CATEGORIES = [
  "layout",
  "hero",
  "hierarchy",
  "productPresentation",
  "contentDensity",
  "imagery",
  "artDirection",
  "cta",
  "trust",
  "progressiveDisclosure",
  "mobile",
  "desktop",
  "accessibility",
  "performance",
] as const;
export type VisualQaCategory = (typeof VISUAL_QA_CATEGORIES)[number];

export type VisualQaFinding = {
  category: VisualQaCategory;
  severity: FindingSeverity;
  viewport: string;
  description: string;
  evidence: string;
  suggestedPresentationFix: string;
  actionCode: VisualQaActionCode;
  source: "deterministic" | "multimodal" | "technical";
};

export type LayoutSnapshot = {
  viewport: { width: number; height: number; label: string };
  scrollWidth: number;
  clientWidth: number;
  pageHeight: number;
  overflowX: boolean;
  h1: { text: string; fontSize: number; width: number; height: number; wraps: boolean } | null;
  h2: string[];
  images: Array<{
    alt: string;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    role: string;
    placeholder: boolean;
  }>;
  cards: { count: number; uniqueTexts: number; avgHeight: number };
  paragraphs: { count: number; longCount: number; maxChars: number };
  ctas: Array<{
    position: string;
    width: number;
    height: number;
    visible: boolean;
    top: number;
  }>;
  stickyDisplay: string | null;
  disclosurePresent: boolean;
  footerLinks: string[];
  healthDisclaimerPresent: boolean;
  faqDetails: number;
  fakeTrustHits: string[];
  articlePresent: boolean;
};

export type TechnicalAudit = {
  engine: "playwright-deterministic";
  lighthouseUsed: false;
  headingOrderOk: boolean;
  missingAlts: number;
  smallTapTargets: number;
  faqKeyboard: boolean;
  domNodes: number;
  notes: string[];
};

export type ViewportReport = {
  viewport: string;
  width: number;
  height: number;
  snapshot: LayoutSnapshot;
  deterministicFindings: VisualQaFinding[];
  screenshotFiles: string[];
};

export type VisualQaReport = {
  version: 1;
  targetStandard: typeof TARGET_VISUAL_STANDARD;
  status: VisualQaStatus;
  contentGate: string | null;
  publicationStatus: string;
  template: string;
  campaignId: number;
  slug: string;
  createdAt: string;
  aiVisualReview: "OK" | "UNAVAILABLE" | "PARSE_FAILED";
  viewportReports: ViewportReport[];
  deterministicFindings: VisualQaFinding[];
  visualFindings: VisualQaFinding[];
  technical: TechnicalAudit;
  recommendedFixes: Array<{ actionCode: VisualQaActionCode; explanation: string }>;
  highPriority: VisualQaFinding[];
};

export function isVisualQaActionCode(value: unknown): value is VisualQaActionCode {
  return typeof value === "string" && (VISUAL_QA_ACTION_CODES as readonly string[]).includes(value);
}

export function isFindingSeverity(value: unknown): value is FindingSeverity {
  return typeof value === "string" && (FINDING_SEVERITIES as readonly string[]).includes(value);
}
