/**
 * Decision Explanation Engine: validator.
 *
 * Judges what goes into an explanation and what comes out of it. It rejects a
 * missing analysis, a missing snapshot, invalid metadata, and invalid
 * sections, and it rejects any explanation that carries a plan or whose lists
 * disagree with its sections.
 *
 * It reports problems and never throws or changes its input. It knows the
 * shape of an analysis and nothing about any rule.
 */
import type { DecisionMetadata } from "./decision-types";
import type { DecisionIssue } from "./decision-validator";
import { DECISION_RULE_CATEGORIES, DECISION_RULE_RESULT_STATUSES } from "./decision-rule-contract";
import { createDecisionResolverValidator } from "./decision-resolver-validator";
import {
  DECISION_COLLECTING_SECTION_ITEM_KINDS,
  DECISION_EXPLANATION_ITEM_KINDS,
  DECISION_EXPLANATION_SECTION_KINDS,
  DECISION_EXPLANATION_SECTION_STATES,
  DECISION_EXPLANATION_SECTION_TITLES,
  isDecisionDimensionSectionKind,
  type DecisionCollectingSectionKind,
} from "./decision-explanation-section";
import { DECISION_EXPLANATION_KEYS } from "./decision-explanation-result";

export interface DecisionExplanationValidator {
  /** Missing Analysis, Missing Snapshot, Invalid Metadata. The input is the analysis alone. */
  validateInput(input: unknown): DecisionIssue[];
  /** Invalid Sections: one section on its own. */
  validateSection(section: unknown): DecisionIssue[];
  /** The finished explanation: its fields, its lists, and its ten sections. */
  validateExplanation(explanation: unknown): DecisionIssue[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const unexpected = (key: string) => `Unexpected field "${key}": an explanation carries no plan and no numeric result.`;

function isFlatMetadata(value: unknown): value is DecisionMetadata {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(([key, v]) => key.trim() !== "" && (v === null || typeof v === "string" || typeof v === "boolean" || isFiniteNumber(v)))
  );
}

const ITEM_KEYS = ["kind", "text", "ruleId", "category"] as const;
const SECTION_KEYS = ["kind", "title", "state", "summary", "items", "ruleIds"] as const;
const TRACE_KEYS = ["ruleId", "category", "status", "executionTime", "statement"] as const;

const itemKey = (item: { kind: unknown; text: unknown; ruleId: unknown; category: unknown }) =>
  JSON.stringify([item.kind, item.text, item.ruleId, item.category]);

const analysisValidator = createDecisionResolverValidator();

function rewriteAnalysisMessage(message: string): string {
  if (/ruleResults|recordedExecutions/.test(message) && /must be a list/.test(message)) {
    return message.replace(/^Invalid analysis: /, "Missing snapshot: ");
  }
  if (message.startsWith("Invalid metadata")) return message;
  return message.startsWith("Missing analysis") || message.startsWith("Missing snapshot") ? message : `Invalid analysis: ${message}`;
}

function validateInput(input: unknown): DecisionIssue[] {
  if (input === undefined || input === null) return [{ field: "analysis", message: "Missing analysis: a Decision Analysis is required." }];
  if (!isPlainObject(input)) return [{ field: "analysis", message: "Missing analysis: the input must be a Decision Analysis object." }];
  const issues: DecisionIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  for (const field of ["ruleResults", "recordedExecutions"] as const) {
    if (!Array.isArray(input[field])) {
      add(field, `Missing snapshot: the analysis carries no "${field}" snapshot, and the engine does not run rules to obtain one.`);
    }
  }

  for (const problem of analysisValidator.validateAnalysis(input)) {
    const message = rewriteAnalysisMessage(problem.message);
    if (!issues.some((issue) => issue.field === problem.field && issue.message === message)) add(problem.field, message);
  }
  return issues;
}

function validateItem(item: unknown, field: string, allowed: readonly string[] = DECISION_EXPLANATION_ITEM_KINDS, prefix = "Invalid explanation"): DecisionIssue[] {
  if (!isPlainObject(item)) return [{ field, message: `${prefix}: an item must be an object.` }];
  const issues: DecisionIssue[] = [];
  const add = (message: string) => issues.push({ field, message: `${prefix}: ${message}` });
  for (const key of Object.keys(item)) if (!oneOf(ITEM_KEYS, key)) add(unexpected(key));
  if (!oneOf(allowed, item.kind)) add(`item kind "${String(item.kind)}" is not allowed here.`);
  if (!isNonEmptyText(item.text)) add("item text must be non-empty text.");
  for (const key of ["ruleId", "category"] as const) {
    if (item[key] !== null && !isNonEmptyText(item[key])) add(`item ${key} must be non-empty text or null.`);
  }
  return issues;
}

function validateSection(section: unknown): DecisionIssue[] {
  const bad = (message: string, field = "section"): DecisionIssue[] => [{ field, message: `Invalid sections: ${message}` }];
  if (!isPlainObject(section)) return bad("a section must be an object.");
  const issues: DecisionIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid sections: ${message}` });
  for (const key of Object.keys(section)) if (!oneOf(SECTION_KEYS, key)) add(key, unexpected(key));
  for (const key of SECTION_KEYS) if (!(key in section)) add(key, `a section must have "${key}".`);
  const kind = section.kind;
  if (!oneOf(DECISION_EXPLANATION_SECTION_KINDS, kind)) {
    add("kind", `section kind "${String(kind)}" is not supported.`);
    return issues;
  }
  const typed = kind as (typeof DECISION_EXPLANATION_SECTION_KINDS)[number];
  if (section.title !== DECISION_EXPLANATION_SECTION_TITLES[typed]) add("title", `the title of ${typed} must be "${DECISION_EXPLANATION_SECTION_TITLES[typed]}".`);
  if (!oneOf(DECISION_EXPLANATION_SECTION_STATES, section.state)) add("state", `state "${String(section.state)}" is not valid for ${typed}.`);
  if (typed === "DECISION_STATE" && section.state !== "REPORTED") add("state", "DECISION_STATE is always REPORTED.");
  if (!isNonEmptyText(section.summary)) add("summary", "a section needs a summary.");
  if (!isTextList(section.ruleIds) || new Set(section.ruleIds).size !== section.ruleIds.length) add("ruleIds", "ruleIds must be a list of distinct rule ids.");
  if (!Array.isArray(section.items)) {
    add("items", "items must be a list.");
    return issues;
  }
  const allowedKinds = isDecisionDimensionSectionKind(typed)
    ? (["FINDING"] as const)
    : DECISION_COLLECTING_SECTION_ITEM_KINDS[typed as DecisionCollectingSectionKind];
  section.items.forEach((item, index) => {
    issues.push(...validateItem(item, `items[${index}]`, allowedKinds, "Invalid sections"));
    if (isPlainObject(item) && isTextList(section.ruleIds) && isNonEmptyText(item.ruleId) && !section.ruleIds.includes(item.ruleId)) {
      add(`items[${index}]`, `an item names rule "${item.ruleId}", which the section does not list.`);
    }
  });
  if (section.state === "NOT_RUN" && (section.items.length > 0 || (isTextList(section.ruleIds) && section.ruleIds.length > 0))) {
    add("state", "a NOT_RUN section has no rules and no items.");
  }
  if (section.state === "NONE" && section.items.length > 0) add("state", "a NONE section has no items.");
  if (section.state === "REPORTED" && section.items.length === 0) add("state", "a REPORTED section has items.");
  return issues;
}

function validateTraceEntry(entry: unknown, field: string): DecisionIssue[] {
  if (!isPlainObject(entry)) return [{ field, message: "Invalid explanation: a trace entry must be an object." }];
  const issues: DecisionIssue[] = [];
  const add = (message: string) => issues.push({ field, message: `Invalid explanation: ${message}` });
  for (const key of Object.keys(entry)) if (!oneOf(TRACE_KEYS, key)) add(unexpected(key));
  if (!isNonEmptyText(entry.ruleId)) add("ruleId must be non-empty text.");
  if (entry.category !== null && !oneOf(DECISION_RULE_CATEGORIES, entry.category)) add("category is not supported.");
  if (!oneOf(DECISION_RULE_RESULT_STATUSES, entry.status)) add("status is not supported.");
  if (!(isFiniteNumber(entry.executionTime) && entry.executionTime >= 0)) add("executionTime must be a number of at least 0.");
  if (!isNonEmptyText(entry.statement)) add("statement must be non-empty text.");
  return issues;
}

function validateExplanation(input: unknown): DecisionIssue[] {
  if (!isPlainObject(input)) return [{ field: "explanation", message: "Invalid explanation: it must be an object." }];
  const issues: DecisionIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid explanation: ${message}` });
  for (const key of Object.keys(input)) if (!oneOf(DECISION_EXPLANATION_KEYS, key)) add(key, unexpected(key));
  for (const key of DECISION_EXPLANATION_KEYS) if (!(key in input)) add(key, `field "${key}" is missing.`);

  if (!isNonEmptyText(input.analysisId)) add("analysisId", "analysisId must be non-empty text.");
  if (input.candidateId !== null && !isNonEmptyText(input.candidateId)) add("candidateId", "candidateId must be non-empty text or null.");
  if (!isNonEmptyText(input.summary)) add("summary", "the summary must be non-empty text.");
  if (!isFlatMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(isFiniteNumber(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");

  for (const field of ["blockingReasons", "eligibleActions", "warnings", "missingInformation"] as const) {
    if (!isTextList(input[field])) add(field, `"${field}" must be a list of text.`);
    else if (new Set(input[field] as string[]).size !== (input[field] as string[]).length) add(field, `Duplicate id in "${field}".`);
  }

  const trace = input.decisionTrace;
  if (!Array.isArray(trace)) {
    add("decisionTrace", '"decisionTrace" must be a list.');
  } else {
    const ids = new Set<string>();
    trace.forEach((entry, index) => {
      issues.push(...validateTraceEntry(entry, `decisionTrace[${index}]`));
      if (isPlainObject(entry) && isNonEmptyText(entry.ruleId)) {
        if (ids.has(entry.ruleId)) add(`decisionTrace[${index}]`, `Duplicate rule "${entry.ruleId}" in the trace.`);
        ids.add(entry.ruleId);
      }
    });
  }

  const sectionBreakdown = input.sectionBreakdown;
  if (!Array.isArray(sectionBreakdown)) {
    issues.push({ field: "sectionBreakdown", message: "Invalid sections: the sections must be a list." });
    return issues;
  }
  if (
    sectionBreakdown.length !== DECISION_EXPLANATION_SECTION_KINDS.length ||
    DECISION_EXPLANATION_SECTION_KINDS.some((kind, index) => !isPlainObject(sectionBreakdown[index]) || sectionBreakdown[index].kind !== kind)
  ) {
    issues.push({
      field: "sectionBreakdown",
      message: `Invalid sections: there must be exactly ${DECISION_EXPLANATION_SECTION_KINDS.length} sections, in the order ${DECISION_EXPLANATION_SECTION_KINDS.join(", ")}.`,
    });
  }
  sectionBreakdown.forEach((section, index) => {
    for (const problem of validateSection(section)) issues.push({ field: `sectionBreakdown[${index}].${problem.field}`, message: problem.message });
  });

  const byKind = new Map<string, Record<string, unknown>>();
  for (const section of sectionBreakdown) {
    if (isPlainObject(section) && isText(section.kind)) byKind.set(section.kind, section);
  }
  const itemsOf = (kind: string): unknown[] => {
    const section = byKind.get(kind);
    return section && Array.isArray(section.items) ? section.items : [];
  };
  const textsOf = (kind: string, itemKind?: string) =>
    itemsOf(kind)
      .filter((item) => isPlainObject(item) && (itemKind === undefined || item.kind === itemKind) && isText(item.text))
      .map((item) => (item as { text: string }).text);
  const idsOf = (kind: string) => {
    const section = byKind.get(kind);
    return isPlainObject(section) && isTextList(section.ruleIds) ? section.ruleIds : [];
  };

  if (isTextList(input.eligibleActions) && idsOf("ELIGIBLE_ACTIONS").join() !== input.eligibleActions.join()) {
    issues.push({ field: "sectionBreakdown", message: "Invalid sections: ELIGIBLE_ACTIONS does not hold the same ids as eligibleActions." });
  }
  if (isTextList(input.warnings) && textsOf("WARNINGS").join() !== input.warnings.join()) {
    issues.push({ field: "sectionBreakdown", message: "Invalid sections: WARNINGS does not hold the same items as the explanation's warnings." });
  }
  if (isTextList(input.missingInformation) && textsOf("MISSING_INFORMATION").join() !== input.missingInformation.join()) {
    issues.push({ field: "sectionBreakdown", message: "Invalid sections: MISSING_INFORMATION does not hold the same items as missingInformation." });
  }
  if (isTextList(input.blockingReasons) && textsOf("BLOCKING_RULES", "ERROR").join() !== input.blockingReasons.join()) {
    issues.push({ field: "sectionBreakdown", message: "Invalid sections: BLOCKING_RULES does not hold the same reasons as blockingReasons." });
  }
  if (Array.isArray(trace)) {
    const statements = itemsOf("DECISION_TRACE")
      .filter((item): item is { text: string } => isPlainObject(item) && isText(item.text))
      .map((item) => item.text);
    const expected = trace.filter((entry): entry is { statement: string } => isPlainObject(entry) && isText(entry.statement)).map((entry) => entry.statement);
    if (statements.join() !== expected.join()) {
      issues.push({ field: "sectionBreakdown", message: "Invalid sections: DECISION_TRACE does not hold the same statements as decisionTrace." });
    }
  }
  void itemKey;
  return issues;
}

export function createDecisionExplanationValidator(): DecisionExplanationValidator {
  return { validateInput, validateSection, validateExplanation };
}
