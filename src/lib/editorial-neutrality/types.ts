export const EDITORIAL_NEUTRALITY_VERSION = 1 as const;

export const NEUTRALITY_CLASSES = [
  "NEUTRAL_INFORMATION",
  "SELLER_STATED_FACT",
  "PROMOTIONAL_LANGUAGE",
  "UNSUPPORTED_GENERALIZATION",
  "UNSUPPORTED_BENEFIT",
  "MEDICAL_OR_HEALTH_CLAIM",
  "COMMERCIAL_PRESSURE",
  "AMBIGUOUS_CLAIM",
] as const;
export type NeutralityClass = (typeof NEUTRALITY_CLASSES)[number];

export const NEUTRALITY_ACTIONS = ["KEEP", "NEUTRALIZE", "OMIT"] as const;
export type NeutralityAction = (typeof NEUTRALITY_ACTIONS)[number];

export type NeutralityRole =
  | "OVERVIEW"
  | "FEATURE"
  | "SPECIFICATION"
  | "USAGE"
  | "FAQ"
  | "OPERATIONAL"
  | "GUARANTEE"
  | "CAUTION"
  | "OTHER";

export type NeutralityDecision = {
  originalText: string;
  renderedText: string | null;
  classification: NeutralityClass;
  action: NeutralityAction;
  reasons: string[];
  rule: string;
  remainderSupported: boolean;
};

export type NeutralityFinding = NeutralityDecision & {
  path: string;
  evidenceRefs: string[];
};
