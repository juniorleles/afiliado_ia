export const BODY_ORDER = [
  "hero",
  "problem",
  "agitation",
  "solution",
  "benefits",
  "ingredients",
  "scientific-evidence",
  "testimonials",
  "comparison",
  "faq",
  "guarantee",
  "cta",
  "footer",
] as const;

/** Always required on every LandingDocument. Benefits is conditional in compose. */
export const REQUIRED_SECTIONS = ["hero", "cta", "footer"] as const;

export type ComposedSection = {
  sectionId: string;
  content: Record<string, unknown>;
  warnings: string[];
};

export type LandingDocument = {
  version: 1;
  campaignId: number;
  language: string;
  generatedAt: string;
  sections: ComposedSection[];
  seo: Record<string, unknown> | null;
  schema: Record<string, unknown> | null;
  metadata: {
    approachId: string | null;
    compositionTimeMs: number;
    inputFingerprint: string;
    cached: boolean;
    included: string[];
    omitted: Array<{ sectionId: string; reason: string }>;
    gates?: {
      structural: "PASS" | "FAIL";
      grounding: "PASS" | "FAIL";
      policy: "PASS" | "FAIL";
      publication: "BLOCKED" | "HELD";
    };
  };
  validationStatus: "PASS" | "ERROR";
  renderStatus: "READY" | "INCOMPLETE";
  warnings: string[];
  errors: string[];
};
