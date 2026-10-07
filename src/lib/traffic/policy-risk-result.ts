/**
 * Policy Risk Signal: vocabulary, inputs, and result.
 *
 * The signal identifies potential policy and compliance risks, and the
 * safeguards that are missing next to them. It does not approve or reject
 * anything, does not score, and does not recommend. A risk here means "this
 * kind of language or structure appears in the supplied content". It does not
 * mean the content is false, unsupported, or non-compliant, and a dimension
 * with nothing identified is not a statement that the content is compliant.
 *
 * Everything here is data and types. Nothing is read from the network, a
 * database, or a platform, and no real platform policy is encoded: rules are
 * generic metadata that a caller reviews and replaces.
 */
import type { TrafficSignalOutput, TrafficSignalResultStatus } from "./traffic-signal-contract";
import type { TrafficMetadata } from "./traffic-types";

/** The thirteen risk dimensions, in the specified order. */
export const POLICY_RISK_DIMENSIONS = [
  "MEDICAL_CLAIMS",
  "WEIGHT_LOSS_CLAIMS",
  "BEFORE_AFTER_REFERENCES",
  "FINANCIAL_CLAIMS",
  "INCOME_CLAIMS",
  "GUARANTEE_LANGUAGE",
  "URGENCY_LANGUAGE",
  "SCARCITY_LANGUAGE",
  "TESTIMONIALS",
  "COMPLIANCE_DISCLAIMERS",
  "RESTRICTED_CATEGORIES",
  "DESTINATION_QUALITY",
  "TRANSPARENCY_SIGNALS",
] as const;
export type PolicyRiskDimension = (typeof POLICY_RISK_DIMENSIONS)[number];

/**
 * What was found for one dimension. NONE_IDENTIFIED means the rules for the
 * dimension ran and found nothing; it does not mean the content is compliant.
 * NOT_ASSESSED means the input needed to judge the dimension was not supplied.
 */
export const POLICY_VERDICTS = ["RISK_IDENTIFIED", "SAFEGUARD_MISSING", "NONE_IDENTIFIED", "NOT_ASSESSED"] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

/** Protective elements a page can carry. Each belongs to one dimension. */
export const POLICY_SAFEGUARDS = ["DISCLAIMER", "PRICING_DISCLOSURE", "RETURN_TERMS", "SHIPPING_TERMS", "MANUFACTURER_IDENTITY", "PAGE_READINESS", "CONTENT_SUBSTANCE"] as const;
export type PolicySafeguard = (typeof POLICY_SAFEGUARDS)[number];

export const POLICY_SAFEGUARD_DIMENSION: Readonly<Record<PolicySafeguard, PolicyRiskDimension>> = Object.freeze({
  DISCLAIMER: "COMPLIANCE_DISCLAIMERS",
  PRICING_DISCLOSURE: "TRANSPARENCY_SIGNALS",
  RETURN_TERMS: "TRANSPARENCY_SIGNALS",
  SHIPPING_TERMS: "TRANSPARENCY_SIGNALS",
  MANUFACTURER_IDENTITY: "TRANSPARENCY_SIGNALS",
  PAGE_READINESS: "DESTINATION_QUALITY",
  CONTENT_SUBSTANCE: "DESTINATION_QUALITY",
});

/** Which Opportunity dimensions and page-section kinds can show a safeguard. */
export interface PolicySafeguardSource {
  readonly opportunityDimensions: readonly string[];
  readonly sectionKinds: readonly string[];
}
export type PolicySafeguardSources = Readonly<Record<PolicySafeguard, PolicySafeguardSource>>;

export const SAFEGUARD_STATUSES = ["PRESENT", "PARTIAL", "ABSENT", "UNKNOWN"] as const;
export type SafeguardStatus = (typeof SAFEGUARD_STATUSES)[number];

/** Where a piece of supplied text came from. */
export const POLICY_SOURCE_KINDS = ["EVIDENCE", "LANDING_PAGE", "OVERRIDE"] as const;
export type PolicySourceKind = (typeof POLICY_SOURCE_KINDS)[number];

/**
 * What a rule does:
 *  - RISK: a match of its indicators in the supplied text, or a visible page
 *    section of one of its kinds, identifies a potential risk.
 *  - SAFEGUARD_INDICATOR: a match of its indicators shows that a safeguard it
 *    provides is present. It never identifies a risk.
 *  - SAFEGUARD_CHECK: the safeguards it requires are always expected, whatever
 *    else is found.
 */
export const POLICY_RULE_KINDS = ["RISK", "SAFEGUARD_INDICATOR", "SAFEGUARD_CHECK"] as const;
export type PolicyRuleKind = (typeof POLICY_RULE_KINDS)[number];

export const POLICY_RULE_KEYS = ["id", "version", "name", "description", "dimension", "kind", "enabled", "indicators", "sectionKinds", "requires", "provides", "metadata"] as const;

export const POLICY_RESULT_KEYS = ["status", "confidence", "identifiedRisks", "missingSafeguards", "warnings", "metadata", "executionTime"] as const;

export const POLICY_RISK_SCOPE_NOTE =
  "This identifies potential policy risks only. It is not an approval, a score, or a recommendation. A match shows that language or structure appears in the supplied content; it does not show a claim is false or unsupported. A dimension with nothing identified is not a statement that the content is compliant.";

/** Lowercases, straightens quotes, and collapses whitespace, so that rules and content compare alike. */
export function normalizePolicyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- inputs (read-only, plain data) ----------

/** One piece of the Evidence Context. Provenance is carried, never dropped. */
export interface PolicyEvidenceItem {
  id: string;
  text: string;
  sourceUrl: string | null;
  pageCategory: string | null;
  /** The field it states, so that an effective manual override of that field supersedes it. */
  field?: string | null;
}

/** One section of the Landing Page Structure. Hidden sections are not on the page and are not read. */
export interface PolicyPageSection {
  id: string;
  /** For example "hero", "pricing", "guarantee", "disclaimer". */
  kind: string;
  visible: boolean;
  texts: readonly string[];
  field?: string | null;
}

/** An effective manual value: what the operator's override currently resolves to. */
export interface PolicyEffectiveOverride {
  field: string;
  value: unknown;
}

export interface PolicyRiskInputs {
  evidenceContext: { items: readonly PolicyEvidenceItem[] } | null;
  landingPage: { sections: readonly PolicyPageSection[] } | null;
  manualOverrides: readonly PolicyEffectiveOverride[] | null;
}

// ---------- result ----------

export interface PolicyRiskSource {
  kind: PolicySourceKind;
  /** The item or section id, prefixed by its kind. */
  itemId: string;
  location: string;
  sourceUrl: string | null;
  pageCategory: string | null;
}

export interface PolicyRisk {
  /** `<ruleId>:<itemId>`. Unique in a result. */
  id: string;
  ruleId: string;
  ruleVersion: string;
  dimension: PolicyRiskDimension;
  source: PolicyRiskSource;
  /** The rule's own indicators that matched, sorted. The supplied text is not copied. */
  matched: string[];
  basis: "INDICATOR" | "SECTION_KIND" | "BOTH";
  /** The safeguards this risk calls for. */
  requires: PolicySafeguard[];
}

export interface PolicyMissingSafeguard {
  safeguard: PolicySafeguard;
  dimension: PolicyRiskDimension;
  /** The risk ids or rule ids that call for it, sorted. */
  requiredBy: string[];
  basis: "STRUCTURE" | "OPPORTUNITY" | "BOTH";
}

export interface PolicyRiskResult {
  status: TrafficSignalResultStatus;
  /**
   * Share of the applicable dimensions that could be assessed, from 0 to 1;
   * null when none is applicable. It describes coverage, not safety, and is
   * not a score.
   */
  confidence: number | null;
  identifiedRisks: PolicyRisk[];
  missingSafeguards: PolicyMissingSafeguard[];
  warnings: string[];
  metadata: TrafficMetadata;
  executionTime: number;
}

/** The result as a signal output: flat metadata, warnings, and no errors. */
export function policyRiskToSignalOutput(result: PolicyRiskResult): TrafficSignalOutput {
  return { status: result.status, confidence: result.confidence, metadata: { ...result.metadata }, warnings: [...result.warnings], errors: [] };
}
