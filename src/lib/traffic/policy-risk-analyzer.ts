/**
 * Policy Risk Signal: analyzer.
 *
 * A pure function: the same inputs always give the same result, apart from the
 * measured time. It reads the Opportunity analysis, the Opportunity
 * explanation, and the supplied content (the Evidence Context, the Landing Page
 * Structure, and the effective manual overrides) and nothing else. It makes no
 * HTTP request, calls no platform, uses no AI, and changes none of its inputs.
 *
 * What it does, in order:
 *  1. It gathers the supplied text into items that keep their provenance:
 *     evidence items with their source URL and page category, the text of
 *     visible landing-page sections, and the effective value of each manual
 *     override. An override supersedes any item that states the same field.
 *  2. It applies the enabled rules. A RISK rule that matches an item (a whole
 *     word or phrase of the rule, or a visible section of one of its kinds)
 *     identifies one potential risk for that rule and item. The supplied text
 *     is never copied into the result; only the rule's own matching phrase is.
 *  3. It works out, for each safeguard, whether it is present, partly
 *     evidenced, absent, or unknown. Absent needs evidence of absence: the
 *     Landing Page Structure lacks every section kind that would carry it, or
 *     an Opportunity dimension reports it missing. Having nothing to read is
 *     unknown, never absent.
 *  4. A safeguard that is required, by a risk that was identified or by a
 *     check rule, and is absent, is listed as missing.
 *  5. Each of the thirteen dimensions gets one verdict. NONE_IDENTIFIED is
 *     given only when the dimension's rules ran and every safeguard they
 *     require was established; it is not a statement that the content is
 *     compliant.
 *
 * There is no score, severity, weight, approval, or recommendation. Lists are
 * sorted by id, and the confidence is the share of applicable dimensions that
 * could be assessed.
 *
 * Every outside reference here is a type-only import.
 */
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";
import {
  POLICY_RISK_DIMENSIONS,
  POLICY_RISK_SCOPE_NOTE,
  POLICY_SAFEGUARDS,
  POLICY_SAFEGUARD_DIMENSION,
  normalizePolicyText,
  type PolicyMissingSafeguard,
  type PolicyRisk,
  type PolicyRiskDimension,
  type PolicyRiskInputs,
  type PolicyRiskResult,
  type PolicyRiskSource,
  type PolicySafeguard,
  type PolicySafeguardSources,
  type PolicyVerdict,
  type SafeguardStatus,
} from "./policy-risk-result";
import type { PolicyRuleEntry } from "./policy-rule-registry";
import { readOpportunityDimensions } from "./traffic-dimension-reader";
import type { TrafficMetadata } from "./traffic-types";

export type PolicyRiskClock = () => number;
const defaultClock: PolicyRiskClock = () => performance.now();

export interface PolicyRiskAnalysisInputs {
  opportunityAnalysis: Readonly<ResolvedOpportunityAnalysis>;
  /** Null when none was supplied. */
  opportunityExplanation: Readonly<OpportunityExplanation> | null;
  executionMetadata: Readonly<TrafficMetadata>;
  rules: readonly PolicyRuleEntry[];
  safeguardSources: PolicySafeguardSources;
  /** Null when no content was supplied. */
  content: PolicyRiskInputs | null;
}

interface TextItem extends PolicyRiskSource {
  text: string;
}

const isScalar = (value: unknown): value is string | number | boolean | null => value === null || ["string", "number", "boolean"].includes(typeof value);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word matching: the phrase may not sit inside a longer word. */
const phraseMatcher = (phrase: string) => new RegExp(`(?<![a-z0-9])${escapeRegExp(normalizePolicyText(phrase))}(?![a-z0-9])`);
const unique = <T>(list: readonly T[]) => [...new Set(list)];

export function analyzePolicyRisk(inputs: PolicyRiskAnalysisInputs, now: PolicyRiskClock = defaultClock): PolicyRiskResult {
  const start = now();
  const { opportunityAnalysis: analysis, opportunityExplanation: explanation, content, safeguardSources } = inputs;
  const warnings: string[] = [];
  const reading = readOpportunityDimensions(analysis, explanation);

  // 1. Gather the supplied text, keeping provenance.
  const overrides = content?.manualOverrides ?? [];
  const overriddenFields = new Set(overrides.map((override) => override.field));
  const evidenceItems: TextItem[] = [];
  const pageItems: TextItem[] = [];
  const overrideItems: TextItem[] = [];
  let superseded = 0;
  let ignoredOverrides = 0;
  for (const item of content?.evidenceContext?.items ?? []) {
    if (item.field != null && overriddenFields.has(item.field)) {
      superseded += 1;
      continue;
    }
    evidenceItems.push({ kind: "EVIDENCE", itemId: `evidence:${item.id}`, location: `evidence:${item.id}`, sourceUrl: item.sourceUrl, pageCategory: item.pageCategory, text: normalizePolicyText(item.text) });
  }
  const visibleKinds = new Set<string>();
  const sectionItems = new Map<string, TextItem>();
  for (const section of content?.landingPage?.sections ?? []) {
    if (!section.visible) continue;
    if (section.field != null && overriddenFields.has(section.field)) {
      superseded += 1;
      continue;
    }
    visibleKinds.add(section.kind.toLowerCase());
    const item: TextItem = { kind: "LANDING_PAGE", itemId: `landing_page:${section.id}`, location: `section:${section.id}`, sourceUrl: null, pageCategory: null, text: normalizePolicyText(section.texts.join("\n")) };
    pageItems.push(item);
    sectionItems.set(`${section.kind.toLowerCase()}\u0000${section.id}`, item);
  }
  for (const override of overrides) {
    if (typeof override.value !== "string") {
      ignoredOverrides += 1;
      continue;
    }
    overrideItems.push({ kind: "OVERRIDE", itemId: `override:${override.field}`, location: `override:${override.field}`, sourceUrl: null, pageCategory: null, text: normalizePolicyText(override.value) });
  }
  const textOf = (items: readonly TextItem[]) => items.filter((item) => item.text !== "");
  const allText = textOf([...evidenceItems, ...pageItems, ...overrideItems]);
  /** Only text that is on the page (or becomes it) can show that a safeguard is on the page. */
  const pageText = textOf([...pageItems, ...overrideItems]);
  const landingPageSupplied = content?.landingPage != null;

  // 2. Apply the enabled rules.
  const enabled = inputs.rules.filter((entry) => entry.enabled).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const risks = new Map<string, PolicyRisk>();
  const provided = new Set<PolicySafeguard>();
  const evaluable = new Map<PolicyRiskDimension, boolean>();
  const markEvaluable = (dimension: PolicyRiskDimension, ok: boolean) => evaluable.set(dimension, (evaluable.get(dimension) ?? false) || ok);

  for (const { rule } of enabled) {
    const matchers = rule.indicators.map((indicator) => ({ indicator: normalizePolicyText(indicator), test: phraseMatcher(indicator) }));
    if (rule.kind === "RISK") {
      markEvaluable(rule.dimension, (matchers.length > 0 && allText.length > 0) || (rule.sectionKinds.length > 0 && landingPageSupplied));
      const found = new Map<string, { item: TextItem; matched: string[]; byText: boolean; bySection: boolean }>();
      const hit = (item: TextItem) => {
        const entry = found.get(item.itemId) ?? { item, matched: [], byText: false, bySection: false };
        found.set(item.itemId, entry);
        return entry;
      };
      for (const item of allText) {
        const matched = matchers.filter((matcher) => matcher.test.test(item.text)).map((matcher) => matcher.indicator);
        if (matched.length > 0) {
          const entry = hit(item);
          entry.matched.push(...matched);
          entry.byText = true;
        }
      }
      const kinds = new Set(rule.sectionKinds.map((kind) => kind.toLowerCase()));
      for (const [key, item] of sectionItems) {
        if (kinds.has(key.split("\u0000")[0])) {
          const entry = hit(item);
          entry.matched.push(`section:${key.split("\u0000")[0]}`);
          entry.bySection = true;
        }
      }
      for (const { item, matched, byText, bySection } of found.values()) {
        const id = `${rule.id}:${item.itemId}`;
        risks.set(id, {
          id,
          ruleId: rule.id,
          ruleVersion: rule.version,
          dimension: rule.dimension,
          source: { kind: item.kind, itemId: item.itemId, location: item.location, sourceUrl: item.sourceUrl, pageCategory: item.pageCategory },
          matched: unique(matched).sort(),
          basis: byText && bySection ? "BOTH" : bySection ? "SECTION_KIND" : "INDICATOR",
          requires: [...rule.requires].sort() as PolicySafeguard[],
        });
      }
    } else if (rule.kind === "SAFEGUARD_INDICATOR") {
      markEvaluable(rule.dimension, pageText.length > 0);
      if (pageText.some((item) => matchers.some((matcher) => matcher.test.test(item.text)))) for (const safeguard of rule.provides) provided.add(safeguard);
    } else markEvaluable(rule.dimension, true);
  }

  // 3. Safeguard statuses, from evidence of presence or of absence only.
  const statuses = new Map<PolicySafeguard, { status: SafeguardStatus; basis: PolicyMissingSafeguard["basis"] | null }>();
  for (const safeguard of POLICY_SAFEGUARDS) {
    const source = safeguardSources[safeguard];
    const reported = source.opportunityDimensions.map((dimension) => reading.states.get(dimension)).filter((state) => state !== undefined);
    const sectionPresent = source.sectionKinds.some((kind) => visibleKinds.has(kind.toLowerCase()));
    if (provided.has(safeguard) || sectionPresent || reported.includes("STRONG")) statuses.set(safeguard, { status: "PRESENT", basis: null });
    else if (reported.some((state) => state === "WEAK" || state === "NEUTRAL")) statuses.set(safeguard, { status: "PARTIAL", basis: null });
    else {
      const byStructure = landingPageSupplied && source.sectionKinds.length > 0;
      const byOpportunity = reported.includes("MISSING");
      statuses.set(safeguard, { status: byStructure || byOpportunity ? "ABSENT" : "UNKNOWN", basis: byStructure && byOpportunity ? "BOTH" : byStructure ? "STRUCTURE" : byOpportunity ? "OPPORTUNITY" : null });
    }
  }

  // 4. Which safeguards are required, and by what.
  const required = new Map<PolicySafeguard, Set<string>>();
  const addRequirement = (safeguard: PolicySafeguard, by: string) => required.set(safeguard, (required.get(safeguard) ?? new Set<string>()).add(by));
  for (const risk of risks.values()) for (const safeguard of risk.requires) addRequirement(safeguard, risk.id);
  for (const { rule } of enabled) if (rule.kind === "SAFEGUARD_CHECK") for (const safeguard of rule.requires) addRequirement(safeguard, rule.id);

  const missing: PolicyMissingSafeguard[] = [];
  const partlyEvidenced: PolicySafeguard[] = [];
  const unknownRequired: PolicySafeguard[] = [];
  for (const safeguard of POLICY_SAFEGUARDS) {
    const by = required.get(safeguard);
    if (!by) continue;
    const { status, basis } = statuses.get(safeguard) as { status: SafeguardStatus; basis: PolicyMissingSafeguard["basis"] | null };
    if (status === "ABSENT") missing.push({ safeguard, dimension: POLICY_SAFEGUARD_DIMENSION[safeguard], requiredBy: [...by].sort(), basis: basis as PolicyMissingSafeguard["basis"] });
    else if (status === "PARTIAL") partlyEvidenced.push(safeguard);
    else if (status === "UNKNOWN") unknownRequired.push(safeguard);
  }

  // 5. One verdict per dimension.
  const verdicts = new Map<PolicyRiskDimension, PolicyVerdict>();
  const riskList = [...risks.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let applicable = 0;
  let assessed = 0;
  const uncovered: PolicyRiskDimension[] = [];
  for (const dimension of POLICY_RISK_DIMENSIONS) {
    const hasRules = enabled.some(({ rule }) => rule.dimension === dimension);
    if (!hasRules) {
      uncovered.push(dimension);
      verdicts.set(dimension, "NOT_ASSESSED");
      continue;
    }
    applicable += 1;
    let verdict: PolicyVerdict;
    if (riskList.some((risk) => risk.dimension === dimension)) verdict = "RISK_IDENTIFIED";
    else if (missing.some((entry) => entry.dimension === dimension)) verdict = "SAFEGUARD_MISSING";
    else if (unknownRequired.some((safeguard) => POLICY_SAFEGUARD_DIMENSION[safeguard] === dimension)) verdict = "NOT_ASSESSED";
    else verdict = evaluable.get(dimension) ? "NONE_IDENTIFIED" : "NOT_ASSESSED";
    verdicts.set(dimension, verdict);
    if (verdict !== "NOT_ASSESSED") assessed += 1;
  }

  // Warnings: everything that limits what the result can say.
  if (explanation === null) warnings.push("No Opportunity explanation was supplied, so safeguards could not be read from Opportunity dimensions.");
  else if (reading.states.size === 0) warnings.push("The Opportunity explanation reports no dimension of a completed signal, so safeguards could not be read from Opportunity dimensions.");
  if (analysis.status === "PARTIAL") warnings.push("The Opportunity analysis is PARTIAL: dimensions of signals that did not complete were not read.");
  const sourceDimensions = new Set(POLICY_SAFEGUARDS.flatMap((safeguard) => safeguardSources[safeguard].opportunityDimensions));
  for (const dimension of reading.disagreements.filter((name) => sourceDimensions.has(name))) warnings.push(`Signals disagree about "${dimension}": one reports it missing and another reports it present.`);
  if (content === null) warnings.push("No content was supplied, so claim, category, and page-section rules were not assessed.");
  else {
    if (allText.length === 0) warnings.push("The supplied content holds no text, so language rules were not assessed.");
    if (!landingPageSupplied) warnings.push("No Landing Page Structure was supplied, so page sections and on-page disclaimers could not be established.");
    if (content.evidenceContext === null) warnings.push("No Evidence Context was supplied.");
  }
  if (superseded > 0) warnings.push(`${superseded} supplied ${superseded === 1 ? "item was" : "items were"} superseded by an effective manual override and not read.`);
  if (ignoredOverrides > 0) warnings.push(`${ignoredOverrides} manual ${ignoredOverrides === 1 ? "override has" : "overrides have"} a value that is not text and was not read.`);
  for (const dimension of uncovered) warnings.push(`No enabled rule covers "${dimension}", so it was not assessed.`);
  if (partlyEvidenced.length > 0) warnings.push(`Only partly evidenced, so treated as present: ${partlyEvidenced.join(", ")}.`);
  if (unknownRequired.length > 0) warnings.push(`Required but could not be established, so not treated as missing: ${unknownRequired.join(", ")}.`);

  // Metadata: flat, and carrying provenance.
  const metadata: TrafficMetadata = {
    scopeNote: POLICY_RISK_SCOPE_NOTE,
    candidateId: analysis.candidateId,
    opportunityAnalysisId: analysis.analysisId,
    opportunityStatus: analysis.status,
    explanationSupplied: explanation !== null,
    contentSupplied: content !== null,
    landingPageSupplied,
    evidenceItemCount: evidenceItems.length,
    pageSectionCount: pageItems.length,
    overrideCount: overrideItems.length,
    supersededCount: superseded,
    ruleCount: inputs.rules.length,
    enabledRuleCount: enabled.length,
    riskCount: riskList.length,
    missingSafeguardCount: missing.length,
    applicableCount: applicable,
    assessedCount: assessed,
    riskIds: riskList.map((risk) => risk.id).join(","),
    missingSafeguards: missing.map((entry) => entry.safeguard).join(","),
  };
  for (const dimension of POLICY_RISK_DIMENSIONS) {
    metadata[`dimension.${dimension}`] = verdicts.get(dimension) as PolicyVerdict;
    metadata[`riskCount.${dimension}`] = riskList.filter((risk) => risk.dimension === dimension).length;
  }
  for (const safeguard of POLICY_SAFEGUARDS) metadata[`safeguard.${safeguard}`] = (statuses.get(safeguard) as { status: SafeguardStatus }).status;
  for (const { rule } of enabled) metadata[`rule.${rule.id}`] = rule.version;
  for (const risk of riskList) {
    metadata[`risk.${risk.id}`] = `${risk.dimension}|${risk.ruleId}@${risk.ruleVersion}|${risk.source.location}|${risk.matched.join("+")}`;
    if (risk.source.sourceUrl !== null) metadata[`risk.${risk.id}.sourceUrl`] = risk.source.sourceUrl;
    if (risk.source.pageCategory !== null) metadata[`risk.${risk.id}.pageCategory`] = risk.source.pageCategory;
  }
  for (const entry of missing) metadata[`missingSafeguard.${entry.safeguard}`] = `${entry.dimension}|${entry.basis}|${entry.requiredBy.join("+")}`;
  // Only scalar execution metadata is passed through, under its own key.
  for (const [key, value] of Object.entries(inputs.executionMetadata)) if (isScalar(value)) metadata[`execution.${key}`] = value;

  const elapsed = now() - start;
  return {
    status: "COMPLETED",
    confidence: applicable === 0 ? null : assessed / applicable,
    identifiedRisks: riskList,
    missingSafeguards: missing,
    warnings,
    metadata,
    executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
  };
}
