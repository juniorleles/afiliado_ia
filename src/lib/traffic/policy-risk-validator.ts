/**
 * Policy Risk Signal: validator.
 *
 * Judges what goes into the signal and what comes out. It rejects a missing
 * context, an invalid rule, a duplicate rule, a duplicate risk, and invalid
 * metadata, and it rejects any result that carries a score, an approval, a
 * severity, or a recommendation.
 *
 * It reports problems and never throws or changes its input. It knows the
 * shape of a rule, of the supplied content, and of a result, and nothing about
 * any particular platform, policy, or product.
 */
import {
  POLICY_RESULT_KEYS,
  POLICY_RULE_KEYS,
  POLICY_RULE_KINDS,
  POLICY_RISK_DIMENSIONS,
  POLICY_SAFEGUARDS,
  POLICY_SAFEGUARD_DIMENSION,
  POLICY_SOURCE_KINDS,
  normalizePolicyText,
} from "./policy-risk-result";
import { TRAFFIC_SIGNAL_RESULT_STATUSES } from "./traffic-signal-contract";
import { isFlatTrafficMetadata, isPlainTrafficData, isTrafficSignalVersion, validateTrafficSignalContext } from "./traffic-signal-validator";
import type { TrafficIssue } from "./traffic-validator";

const RULE_ID = /^[a-z][a-z0-9-]*$/;
const SECTION_KIND = /^[a-z][a-z0-9_-]*$/i;
const INDICATOR_MAX = 80;
const USABLE_ANALYSIS_STATUSES = ["COMPLETED", "PARTIAL"] as const;
const RISK_KEYS = ["id", "ruleId", "ruleVersion", "dimension", "source", "matched", "basis", "requires"] as const;
const SOURCE_KEYS = ["kind", "itemId", "location", "sourceUrl", "pageCategory"] as const;
const MISSING_KEYS = ["safeguard", "dimension", "requiredBy", "basis"] as const;

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const textOrNull = (value: unknown): boolean => value === null || isText(value);
const isSorted = (list: readonly string[]) => list.every((value, i) => i === 0 || list[i - 1] <= value);

// ---------- rules ----------

/** Checks one rule. Everything found is reported; nothing is thrown. */
export function validatePolicyRule(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "rule", message: "Invalid rule: a rule must be an object." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `rule.${field}`, message: `Invalid rule: ${message}` });
  for (const key of Object.keys(input)) {
    if (!oneOf(POLICY_RULE_KEYS, key)) add(key, `unexpected field "${key}": a rule is metadata only and carries no score, severity, or decision.`);
  }
  if (!isText(input.id) || !RULE_ID.test(input.id)) add("id", "id must be lowercase letters, digits, and hyphens, starting with a letter.");
  if (!isTrafficSignalVersion(input.version)) add("version", "version must be a semantic version such as 1.0.0.");
  if (!isNonEmptyText(input.name)) add("name", "name must be non-empty text.");
  if (!isNonEmptyText(input.description)) add("description", "description must be non-empty text.");
  if (!oneOf(POLICY_RISK_DIMENSIONS, input.dimension)) add("dimension", "dimension is not supported.");
  if (!oneOf(POLICY_RULE_KINDS, input.kind)) add("kind", "kind is not supported.");
  if (typeof input.enabled !== "boolean") add("enabled", "enabled must be true or false.");
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");

  const lists: Record<string, string[] | null> = {};
  for (const key of ["indicators", "sectionKinds", "requires", "provides"] as const) {
    const value = input[key];
    if (!Array.isArray(value) || value.some((item) => !isText(item))) {
      add(key, `"${key}" must be a list of text.`);
      lists[key] = null;
    } else lists[key] = value as string[];
  }
  const indicators = lists.indicators;
  if (indicators) {
    if (indicators.some((indicator) => normalizePolicyText(indicator) === "" || normalizePolicyText(indicator).length > INDICATOR_MAX)) add("indicators", `each indicator must be 1 to ${INDICATOR_MAX} characters of text.`);
    else {
      const normalized = indicators.map(normalizePolicyText);
      const repeated = normalized.find((value, i) => normalized.indexOf(value) !== i);
      if (repeated !== undefined) add("indicators", `indicator "${repeated}" is repeated.`);
    }
  }
  const kinds = lists.sectionKinds;
  if (kinds) {
    if (kinds.some((kind) => !SECTION_KIND.test(kind))) add("sectionKinds", "each section kind must be letters, digits, underscores, or hyphens, starting with a letter.");
    else if (new Set(kinds.map((kind) => kind.toLowerCase())).size !== kinds.length) add("sectionKinds", "section kinds must not repeat.");
  }
  for (const key of ["requires", "provides"] as const) {
    const list = lists[key];
    if (!list) continue;
    if (list.some((item) => !oneOf(POLICY_SAFEGUARDS, item))) add(key, `"${key}" must be a list of supported safeguards.`);
    else if (new Set(list).size !== list.length) add(key, `"${key}" must not repeat a safeguard.`);
  }

  // What each kind may and must carry.
  if (oneOf(POLICY_RULE_KINDS, input.kind) && indicators && kinds && lists.requires && lists.provides) {
    const ownDimension = (list: string[]) => list.every((item) => POLICY_SAFEGUARD_DIMENSION[item as keyof typeof POLICY_SAFEGUARD_DIMENSION] === input.dimension);
    if (input.kind === "RISK") {
      if (indicators.length + kinds.length === 0) add("indicators", "a RISK rule needs at least one indicator or section kind.");
      if (lists.provides.length > 0) add("provides", "a RISK rule provides no safeguard.");
    } else if (input.kind === "SAFEGUARD_INDICATOR") {
      if (indicators.length === 0) add("indicators", "a SAFEGUARD_INDICATOR rule needs at least one indicator.");
      if (kinds.length > 0) add("sectionKinds", "a SAFEGUARD_INDICATOR rule reads text only.");
      if (lists.requires.length > 0) add("requires", "a SAFEGUARD_INDICATOR rule requires no safeguard.");
      if (lists.provides.length === 0) add("provides", "a SAFEGUARD_INDICATOR rule must provide a safeguard.");
      else if (!ownDimension(lists.provides)) add("provides", "a SAFEGUARD_INDICATOR rule may provide only safeguards of its own dimension.");
    } else {
      if (indicators.length > 0 || kinds.length > 0 || lists.provides.length > 0) add("kind", "a SAFEGUARD_CHECK rule carries no indicators, section kinds, or provided safeguards.");
      if (lists.requires.length === 0) add("requires", "a SAFEGUARD_CHECK rule must require a safeguard.");
      else if (!ownDimension(lists.requires)) add("requires", "a SAFEGUARD_CHECK rule may require only safeguards of its own dimension.");
    }
  }
  return issues;
}

/** Checks a list of rules: each rule, and no id used twice. */
export function validatePolicyRules(input: unknown): TrafficIssue[] {
  if (!Array.isArray(input)) return [{ field: "rules", message: "Invalid rule: the rules must be a list." }];
  const issues: TrafficIssue[] = [];
  const seen = new Set<string>();
  input.forEach((rule, index) => {
    issues.push(...validatePolicyRule(rule).map((issue) => ({ field: `rules[${index}].${issue.field}`, message: issue.message })));
    const id = isRecord(rule) ? rule.id : undefined;
    if (isText(id)) {
      if (seen.has(id)) issues.push({ field: `rules[${index}].id`, message: `Duplicate rule "${id}".` });
      seen.add(id);
    }
  });
  return issues;
}

/** Checks the table that says which Opportunity dimensions and page-section kinds show each safeguard. */
export function validateSafeguardSources(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "safeguardSources", message: "Invalid rule: the safeguard sources must be an object." }];
  const issues: TrafficIssue[] = [];
  for (const safeguard of POLICY_SAFEGUARDS) {
    const source = input[safeguard];
    const field = `safeguardSources.${safeguard}`;
    if (!isRecord(source)) {
      issues.push({ field, message: `Invalid rule: "${safeguard}" needs its sources.` });
      continue;
    }
    for (const key of ["opportunityDimensions", "sectionKinds"] as const) {
      const list = source[key];
      if (!Array.isArray(list) || list.some((item) => !isNonEmptyText(item))) issues.push({ field: `${field}.${key}`, message: `Invalid rule: "${key}" must be a list of text.` });
      else if (new Set(list).size !== list.length) issues.push({ field: `${field}.${key}`, message: `Invalid rule: "${key}" must not repeat an entry.` });
    }
  }
  for (const key of Object.keys(input)) {
    if (!oneOf(POLICY_SAFEGUARDS, key)) issues.push({ field: `safeguardSources.${key}`, message: `Invalid rule: "${key}" is not a supported safeguard.` });
  }
  return issues;
}

// ---------- context and content ----------

/**
 * Checks a Traffic Context before the signal reads it: that there is one, that
 * it is valid, and that its Opportunity analysis is present, usable, and
 * shaped as the Resolver produces it.
 */
export function validatePolicyRiskContext(context: unknown): TrafficIssue[] {
  if (!isRecord(context)) return [{ field: "context", message: "Missing context: a Traffic Context object is required." }];
  const issues: TrafficIssue[] = [];
  const analysis = context.opportunityAnalysis;
  if (analysis === undefined || analysis === null) issues.push({ field: "opportunityAnalysis", message: "Missing context: an Opportunity analysis is required." });
  issues.push(...validateTrafficSignalContext(context, true));
  if (isRecord(analysis)) {
    if (!oneOf(USABLE_ANALYSIS_STATUSES, analysis.status)) issues.push({ field: "opportunityAnalysis.status", message: `Invalid context: the Opportunity analysis is ${String(analysis.status)}, and only a ${USABLE_ANALYSIS_STATUSES.join(" or ")} analysis can be read.` });
    if (!Array.isArray(analysis.signalResults)) issues.push({ field: "opportunityAnalysis.signalResults", message: 'Invalid context: the Opportunity analysis carries no "signalResults" list.' });
  }
  const explanation = context.opportunityExplanation;
  if (isRecord(explanation)) {
    for (const key of ["strengths", "weaknesses", "missingEvidence", "sections"] as const) {
      if (!Array.isArray(explanation[key])) issues.push({ field: `opportunityExplanation.${key}`, message: `Invalid context: the Opportunity explanation carries no "${key}" list.` });
    }
  }
  return issues;
}

/** Checks the supplied content: the Evidence Context, the Landing Page Structure, and the effective manual overrides. */
export function validatePolicyRiskInputs(input: unknown): TrafficIssue[] {
  if (input === null) return [];
  if (!isRecord(input) || !isPlainTrafficData(input)) return [{ field: "content", message: "Invalid content: the supplied content must be plain data." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `content.${field}`, message: `Invalid content: ${message}` });
  for (const key of ["evidenceContext", "landingPage", "manualOverrides"] as const) if (!(key in input)) add(key, `"${key}" is missing; use null when there is none.`);

  const evidence = input.evidenceContext;
  if (evidence !== null && evidence !== undefined) {
    if (!isRecord(evidence) || !Array.isArray(evidence.items)) add("evidenceContext", "the Evidence Context must carry a list of items.");
    else {
      const seen = new Set<string>();
      evidence.items.forEach((item: unknown, i: number) => {
        const field = `evidenceContext.items[${i}]`;
        if (!isRecord(item)) return add(field, "an item must be an object.");
        if (!isNonEmptyText(item.id)) add(`${field}.id`, "id must be non-empty text.");
        else if (seen.has(item.id)) add(`${field}.id`, `duplicate item id "${item.id}".`);
        else seen.add(item.id);
        if (!isText(item.text)) add(`${field}.text`, "text must be text.");
        if (!textOrNull(item.sourceUrl)) add(`${field}.sourceUrl`, "sourceUrl must be text or null, so that provenance is kept.");
        if (!textOrNull(item.pageCategory)) add(`${field}.pageCategory`, "pageCategory must be text or null, so that provenance is kept.");
        if (item.field !== undefined && !textOrNull(item.field)) add(`${field}.field`, "field must be text or null.");
      });
    }
  }
  const page = input.landingPage;
  if (page !== null && page !== undefined) {
    if (!isRecord(page) || !Array.isArray(page.sections)) add("landingPage", "the Landing Page Structure must carry a list of sections.");
    else {
      const seen = new Set<string>();
      page.sections.forEach((section: unknown, i: number) => {
        const field = `landingPage.sections[${i}]`;
        if (!isRecord(section)) return add(field, "a section must be an object.");
        if (!isNonEmptyText(section.id)) add(`${field}.id`, "id must be non-empty text.");
        else if (seen.has(section.id)) add(`${field}.id`, `duplicate section id "${section.id}".`);
        else seen.add(section.id);
        if (!isText(section.kind) || !SECTION_KIND.test(section.kind)) add(`${field}.kind`, "kind must be letters, digits, underscores, or hyphens, starting with a letter.");
        if (typeof section.visible !== "boolean") add(`${field}.visible`, "visible must be true or false.");
        if (!Array.isArray(section.texts) || section.texts.some((text: unknown) => !isText(text))) add(`${field}.texts`, "texts must be a list of text.");
        if (section.field !== undefined && !textOrNull(section.field)) add(`${field}.field`, "field must be text or null.");
      });
    }
  }
  const overrides = input.manualOverrides;
  if (overrides !== null && overrides !== undefined) {
    if (!Array.isArray(overrides)) add("manualOverrides", "the manual overrides must be a list of effective values.");
    else {
      const seen = new Set<string>();
      overrides.forEach((override: unknown, i: number) => {
        const field = `manualOverrides[${i}]`;
        if (!isRecord(override)) return add(field, "an override must be an object.");
        for (const key of Object.keys(override)) if (key !== "field" && key !== "value") add(`${field}.${key}`, `unexpected field "${key}": only effective values are read, never ids, timestamps, or previous values.`);
        if (!isNonEmptyText(override.field)) add(`${field}.field`, "field must be non-empty text.");
        else if (seen.has(override.field)) add(`${field}.field`, `duplicate override for "${override.field}".`);
        else seen.add(override.field);
        if (!("value" in override)) add(`${field}.value`, "value is missing.");
      });
    }
  }
  return issues;
}

// ---------- result ----------

/** Checks a result: its fields and lists, and that nothing in it is a score, an approval, a severity, or a recommendation. */
export function validatePolicyRiskResult(input: unknown): TrafficIssue[] {
  if (!isRecord(input)) return [{ field: "result", message: "Invalid result: an object is required." }];
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid result: ${message}` });
  for (const key of Object.keys(input)) if (!oneOf(POLICY_RESULT_KEYS, key)) add(key, `unexpected field "${key}": a result carries no score, approval, severity, or recommendation.`);
  for (const key of POLICY_RESULT_KEYS) if (!(key in input)) add(key, `field "${key}" is missing.`);
  if (!oneOf(TRAFFIC_SIGNAL_RESULT_STATUSES, input.status)) add("status", "status is not supported.");
  if (input.confidence !== null && !(typeof input.confidence === "number" && Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1)) add("confidence", "confidence must be a number from 0 to 1, or null.");

  const risks = input.identifiedRisks;
  if (!Array.isArray(risks)) add("identifiedRisks", '"identifiedRisks" must be a list.');
  else {
    const seen = new Set<string>();
    const ids: string[] = [];
    risks.forEach((risk: unknown, i: number) => {
      const field = `identifiedRisks[${i}]`;
      if (!isRecord(risk)) return add(field, "a risk must be an object.");
      for (const key of Object.keys(risk)) if (!oneOf(RISK_KEYS, key)) add(`${field}.${key}`, `unexpected field "${key}": a risk carries no score, severity, or decision.`);
      if (!isNonEmptyText(risk.id)) add(`${field}.id`, "id must be non-empty text.");
      else {
        if (seen.has(risk.id)) add(`${field}.id`, `Duplicate risk "${risk.id}".`);
        seen.add(risk.id);
        ids.push(risk.id);
      }
      if (!isText(risk.ruleId) || !RULE_ID.test(risk.ruleId)) add(`${field}.ruleId`, "ruleId must be a rule id.");
      if (!isTrafficSignalVersion(risk.ruleVersion)) add(`${field}.ruleVersion`, "ruleVersion must be a semantic version.");
      if (!oneOf(POLICY_RISK_DIMENSIONS, risk.dimension)) add(`${field}.dimension`, "dimension is not supported.");
      if (!Array.isArray(risk.matched) || risk.matched.some((m: unknown) => !isText(m))) add(`${field}.matched`, "matched must be a list of text.");
      if (!oneOf(["INDICATOR", "SECTION_KIND", "BOTH"], risk.basis)) add(`${field}.basis`, "basis is not supported.");
      if (!Array.isArray(risk.requires) || risk.requires.some((s: unknown) => !oneOf(POLICY_SAFEGUARDS, s))) add(`${field}.requires`, "requires must be a list of supported safeguards.");
      const source = risk.source;
      if (!isRecord(source)) add(`${field}.source`, "source must be an object, so that provenance is kept.");
      else {
        for (const key of Object.keys(source)) if (!oneOf(SOURCE_KEYS, key)) add(`${field}.source.${key}`, `unexpected field "${key}".`);
        if (!oneOf(POLICY_SOURCE_KINDS, source.kind)) add(`${field}.source.kind`, "kind is not supported.");
        if (!isNonEmptyText(source.itemId) || !isNonEmptyText(source.location)) add(`${field}.source`, "itemId and location must be non-empty text.");
        if (!textOrNull(source.sourceUrl) || source.sourceUrl === undefined) add(`${field}.source.sourceUrl`, "sourceUrl must be text or null.");
        if (!textOrNull(source.pageCategory) || source.pageCategory === undefined) add(`${field}.source.pageCategory`, "pageCategory must be text or null.");
      }
    });
    if (!isSorted(ids)) add("identifiedRisks", '"identifiedRisks" must be sorted by id, so that order implies no ranking.');
  }

  const missing = input.missingSafeguards;
  if (!Array.isArray(missing)) add("missingSafeguards", '"missingSafeguards" must be a list.');
  else {
    const names: string[] = [];
    missing.forEach((entry: unknown, i: number) => {
      const field = `missingSafeguards[${i}]`;
      if (!isRecord(entry)) return add(field, "an entry must be an object.");
      for (const key of Object.keys(entry)) if (!oneOf(MISSING_KEYS, key)) add(`${field}.${key}`, `unexpected field "${key}".`);
      if (!oneOf(POLICY_SAFEGUARDS, entry.safeguard)) add(`${field}.safeguard`, "safeguard is not supported.");
      else {
        if (names.includes(entry.safeguard as string)) add(`${field}.safeguard`, `Duplicate risk entry for safeguard "${String(entry.safeguard)}".`);
        names.push(entry.safeguard as string);
        if (POLICY_SAFEGUARD_DIMENSION[entry.safeguard as keyof typeof POLICY_SAFEGUARD_DIMENSION] !== entry.dimension) add(`${field}.dimension`, "dimension must be the safeguard's own dimension.");
      }
      if (!Array.isArray(entry.requiredBy) || entry.requiredBy.length === 0 || entry.requiredBy.some((id: unknown) => !isNonEmptyText(id))) add(`${field}.requiredBy`, "requiredBy must be a non-empty list of ids.");
      else if (!isSorted(entry.requiredBy as string[])) add(`${field}.requiredBy`, "requiredBy must be sorted.");
      if (!oneOf(["STRUCTURE", "OPPORTUNITY", "BOTH"], entry.basis)) add(`${field}.basis`, "basis is not supported.");
    });
    if (!isSorted(names)) add("missingSafeguards", '"missingSafeguards" must be sorted by safeguard.');
  }
  if (!Array.isArray(input.warnings) || input.warnings.some((w: unknown) => !isText(w))) add("warnings", '"warnings" must be a list of text.');
  if (!isFlatTrafficMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(typeof input.executionTime === "number" && Number.isFinite(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");
  return issues;
}
