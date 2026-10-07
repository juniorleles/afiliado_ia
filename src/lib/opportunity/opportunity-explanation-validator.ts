/**
 * Opportunity Explanation Engine: validator.
 *
 * Judges what goes into an explanation and what comes out of it. It rejects a
 * missing analysis, missing signals, invalid metadata, and invalid sections,
 * and it rejects any explanation that carries a score, ranking, or
 * recommendation or whose lists disagree with its sections.
 *
 * It reports problems and never throws or changes its input. It knows the
 * Signal Contract and the shape of an analysis, and nothing about any signal.
 */
import type { OpportunityMetadata } from "./opportunity-types";
import type { OpportunityIssue } from "./opportunity-validator";
import { createOpportunityValidator } from "./opportunity-resolver-validator";
import {
  CATEGORY_SECTION_STATES,
  COLLECTING_SECTION_ITEM_KINDS,
  COLLECTING_SECTION_STATES,
  EXPLANATION_ITEM_KINDS,
  EXPLANATION_SECTION_KINDS,
  EXPLANATION_SECTION_TITLES,
  isCategorySectionKind,
  type CollectingSectionKind,
} from "./opportunity-explanation-section";
import { EXPLANATION_KEYS, SIGNAL_BREAKDOWN_STATUSES } from "./opportunity-explanation-result";

export interface OpportunityExplanationValidator {
  /** Missing Analysis, Missing Signals, Invalid Metadata, an invalid signal result. The input is the analysis alone. */
  validateInput(input: unknown): OpportunityIssue[];
  /** Invalid Sections: one section on its own. */
  validateSection(section: unknown): OpportunityIssue[];
  /** The finished explanation: its fields, its lists, and its eight sections. */
  validateExplanation(explanation: unknown): OpportunityIssue[];
}

/** Plain data only: an object whose prototype is Object.prototype or null. No import from the provider framework is needed for this. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isText = (value: unknown): value is string => typeof value === "string";
const isNonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== "";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isCount = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const oneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const unexpected = (key: string) => `Unexpected field "${key}": an explanation carries no score, ranking, or recommendation.`;

function isFlatMetadata(value: unknown): value is OpportunityMetadata {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(([key, v]) => key.trim() !== "" && (v === null || typeof v === "string" || typeof v === "boolean" || isFiniteNumber(v)))
  );
}

const ITEM_KEYS = ["kind", "text", "signalId", "category", "dimension"] as const;
const SECTION_KEYS = ["kind", "title", "state", "summary", "items", "signalIds"] as const;
const BREAKDOWN_KEYS = [
  "signalId",
  "name",
  "category",
  "status",
  "confidence",
  "executionTime",
  "strengthCount",
  "weaknessCount",
  "missingCount",
  "warningCount",
  "errorCount",
  "statement",
  "notes",
] as const;

const itemKey = (item: { kind: unknown; text: unknown; signalId: unknown; category: unknown; dimension: unknown }) =>
  JSON.stringify([item.kind, item.text, item.signalId, item.category, item.dimension]);

const resultValidator = createOpportunityValidator();

// ---------- input ----------

function validateInput(input: unknown): OpportunityIssue[] {
  // Missing Analysis
  if (input === undefined || input === null) return [{ field: "analysis", message: "Missing analysis: an Opportunity Analysis is required." }];
  if (!isPlainObject(input)) return [{ field: "analysis", message: "Missing analysis: the input must be an Opportunity Analysis object." }];
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  // Missing Signals: the snapshot of the run must be there. Nothing is run to fill it in.
  for (const field of ["resolvedSignals", "signalResults"] as const) {
    if (!Array.isArray(input[field])) add(field, `Missing signals: the analysis carries no "${field}" snapshot, and the engine does not run signals to obtain one.`);
  }

  // Invalid Metadata: the three metadata members, then everything else the Resolver's validator checks.
  for (const problem of resultValidator.validateAnalysis(input)) {
    const message = problem.message.startsWith("Invalid metadata") || problem.message.startsWith("Missing signals") ? problem.message : `Invalid analysis: ${problem.message}`;
    if (!issues.some((issue) => issue.field === problem.field && issue.message === message)) add(problem.field, message);
  }
  return issues;
}

// ---------- items and sections ----------

function validateItem(item: unknown, field: string, allowed: readonly string[] = EXPLANATION_ITEM_KINDS, prefix = "Invalid explanation"): OpportunityIssue[] {
  if (!isPlainObject(item)) return [{ field, message: `${prefix}: an item must be an object.` }];
  const issues: OpportunityIssue[] = [];
  const add = (message: string) => issues.push({ field, message: `${prefix}: ${message}` });
  for (const key of Object.keys(item)) if (!oneOf(ITEM_KEYS, key)) add(unexpected(key));
  if (!oneOf(allowed, item.kind)) add(`item kind "${String(item.kind)}" is not allowed here.`);
  if (!isNonEmptyText(item.text)) add("item text must be non-empty text.");
  for (const key of ["signalId", "category", "dimension"] as const) {
    if (item[key] !== null && !isNonEmptyText(item[key])) add(`item ${key} must be non-empty text or null.`);
  }
  return issues;
}

function validateSection(section: unknown): OpportunityIssue[] {
  const bad = (message: string, field = "section"): OpportunityIssue[] => [{ field, message: `Invalid sections: ${message}` }];
  if (!isPlainObject(section)) return bad("a section must be an object.");
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid sections: ${message}` });
  for (const key of Object.keys(section)) if (!oneOf(SECTION_KEYS, key)) add(key, unexpected(key));
  for (const key of SECTION_KEYS) if (!(key in section)) add(key, `a section must have "${key}".`);
  const kind = section.kind;
  if (!oneOf(EXPLANATION_SECTION_KINDS, kind)) {
    add("kind", `section kind "${String(kind)}" is not supported.`);
    return issues;
  }
  const typed = kind as (typeof EXPLANATION_SECTION_KINDS)[number];
  if (section.title !== EXPLANATION_SECTION_TITLES[typed]) add("title", `the title of ${typed} must be "${EXPLANATION_SECTION_TITLES[typed]}".`);
  const allowedStates = isCategorySectionKind(typed) ? CATEGORY_SECTION_STATES : COLLECTING_SECTION_STATES;
  if (!oneOf(allowedStates, section.state)) add("state", `state "${String(section.state)}" is not valid for ${typed}.`);
  if (!isNonEmptyText(section.summary)) add("summary", "a section needs a summary.");
  if (!isTextList(section.signalIds) || new Set(section.signalIds).size !== section.signalIds.length) add("signalIds", "signalIds must be a list of distinct signal ids.");
  if (!Array.isArray(section.items)) {
    add("items", "items must be a list.");
    return issues;
  }
  const allowedKinds = isCategorySectionKind(typed) ? EXPLANATION_ITEM_KINDS : COLLECTING_SECTION_ITEM_KINDS[typed as CollectingSectionKind];
  section.items.forEach((item, index) => {
    issues.push(...validateItem(item, `items[${index}]`, allowedKinds, "Invalid sections"));
    if (isCategorySectionKind(typed) && isPlainObject(item) && item.category !== typed) add(`items[${index}]`, `an item in ${typed} has category ${String(item.category)}.`);
    if (isPlainObject(item) && isTextList(section.signalIds) && isNonEmptyText(item.signalId) && !section.signalIds.includes(item.signalId)) {
      add(`items[${index}]`, `an item names signal "${item.signalId}", which the section does not list.`);
    }
  });
  if (section.state === "NO_SIGNAL" && (section.items.length > 0 || (isTextList(section.signalIds) && section.signalIds.length > 0))) add("state", "a NO_SIGNAL section has no signals and no items.");
  if (section.state === "NONE" && section.items.length > 0) add("state", "a NONE section has no items.");
  if (section.state === "REPORTED" && section.items.length === 0) add("state", "a REPORTED section has items.");
  return issues;
}

// ---------- explanation ----------

function validateExplanation(input: unknown): OpportunityIssue[] {
  if (!isPlainObject(input)) return [{ field: "explanation", message: "Invalid explanation: it must be an object." }];
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message: `Invalid explanation: ${message}` });
  for (const key of Object.keys(input)) if (!oneOf(EXPLANATION_KEYS, key)) add(key, unexpected(key));
  for (const key of EXPLANATION_KEYS) if (!(key in input)) add(key, `field "${key}" is missing.`);

  if (!isNonEmptyText(input.analysisId)) add("analysisId", "analysisId must be non-empty text.");
  if (input.candidateId !== null && !isNonEmptyText(input.candidateId)) add("candidateId", "candidateId must be non-empty text or null.");
  if (!isNonEmptyText(input.summary)) add("summary", "the summary must be non-empty text.");
  if (!isFlatMetadata(input.metadata)) add("metadata", "Invalid metadata: a flat object of strings, numbers, booleans, or null is required.");
  if (!(isFiniteNumber(input.executionTime) && input.executionTime >= 0)) add("executionTime", "executionTime must be a number of at least 0.");

  const lists: Record<string, unknown[] | null> = {};
  const listKinds = { strengths: "STRENGTH", weaknesses: "WEAKNESS", warnings: "WARNING", errors: "ERROR", missingEvidence: "MISSING" } as const;
  for (const [field, kind] of Object.entries(listKinds)) {
    const value = input[field];
    if (!Array.isArray(value)) {
      add(field, `"${field}" must be a list.`);
      lists[field] = null;
      continue;
    }
    lists[field] = value;
    value.forEach((item, index) => issues.push(...validateItem(item, `${field}[${index}]`, [kind])));
  }

  // The signal breakdown
  const breakdown = input.signalBreakdown;
  if (!Array.isArray(breakdown)) {
    add("signalBreakdown", '"signalBreakdown" must be a list.');
  } else {
    const ids = new Set<string>();
    breakdown.forEach((entry, index) => {
      const field = `signalBreakdown[${index}]`;
      if (!isPlainObject(entry)) {
        add(field, "a breakdown entry must be an object.");
        return;
      }
      for (const key of Object.keys(entry)) if (!oneOf(BREAKDOWN_KEYS, key)) add(field, unexpected(key));
      for (const key of ["signalId", "name", "statement"] as const) if (!isNonEmptyText(entry[key])) add(field, `${key} must be non-empty text.`);
      if (entry.category !== null && !isNonEmptyText(entry.category)) add(field, "category must be non-empty text or null.");
      if (!oneOf(SIGNAL_BREAKDOWN_STATUSES, entry.status)) add(field, "status is not supported.");
      if (entry.confidence !== null && !isFiniteNumber(entry.confidence)) add(field, "confidence must be a finite number or null.");
      if (entry.executionTime !== null && !(isFiniteNumber(entry.executionTime) && entry.executionTime >= 0)) add(field, "executionTime must be a number of at least 0, or null.");
      for (const key of ["strengthCount", "weaknessCount", "missingCount", "warningCount", "errorCount"] as const) if (!isCount(entry[key])) add(field, `${key} must be a whole number of at least 0.`);
      if (!isTextList(entry.notes)) add(field, "notes must be a list of text.");
      if (isNonEmptyText(entry.signalId)) {
        if (ids.has(entry.signalId)) add(field, `Duplicate signal "${entry.signalId}" in the breakdown.`);
        ids.add(entry.signalId);
        const countFor = (name: string) => (lists[name] ?? []).filter((item) => isPlainObject(item) && item.signalId === entry.signalId).length;
        const expected: Record<string, number> = {
          strengthCount: countFor("strengths"),
          weaknessCount: countFor("weaknesses"),
          missingCount: countFor("missingEvidence"),
          warningCount: countFor("warnings"),
          errorCount: countFor("errors"),
        };
        for (const [key, count] of Object.entries(expected)) {
          if (isCount(entry[key]) && entry[key] !== count) add(field, `${key} is ${String(entry[key])} but the lists hold ${count}.`);
        }
      }
    });
  }

  // The sections
  const sections = input.sections;
  if (!Array.isArray(sections)) {
    issues.push({ field: "sections", message: "Invalid sections: the sections must be a list." });
    return issues;
  }
  if (sections.length !== EXPLANATION_SECTION_KINDS.length || EXPLANATION_SECTION_KINDS.some((kind, index) => !isPlainObject(sections[index]) || sections[index].kind !== kind)) {
    issues.push({ field: "sections", message: `Invalid sections: there must be exactly ${EXPLANATION_SECTION_KINDS.length} sections, in the order ${EXPLANATION_SECTION_KINDS.join(", ")}.` });
  }
  sections.forEach((section, index) => {
    for (const problem of validateSection(section)) issues.push({ field: `sections[${index}].${problem.field}`, message: problem.message });
  });

  const byKind = new Map<string, Array<{ items?: unknown }>>();
  for (const section of sections) if (isPlainObject(section) && isText(section.kind)) byKind.set(section.kind, [...(byKind.get(section.kind) ?? []), section]);
  const itemsOf = (kind: string): unknown[] => {
    const section = byKind.get(kind)?.[0];
    return section && Array.isArray(section.items) ? section.items : [];
  };
  const keyOf = (item: unknown) => (isPlainObject(item) ? itemKey(item as never) : "invalid");
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((item, index) => keyOf(item) === keyOf(b[index]));
  const mirrors: Array<[CollectingSectionKind, unknown[] | null]> = [
    ["STRENGTHS", lists.strengths],
    ["WEAKNESSES", lists.weaknesses],
    ["MISSING_INFORMATION", lists.missingEvidence],
    ["WARNINGS", lists.warnings && lists.errors ? [...lists.warnings, ...lists.errors] : null],
  ];
  for (const [kind, list] of mirrors) {
    if (list !== null && byKind.has(kind) && !same(itemsOf(kind), list)) {
      issues.push({ field: "sections", message: `Invalid sections: ${kind} does not hold the same items as the explanation's lists.` });
    }
  }
  // Every statement in a category section is also in the explanation's lists.
  const listByItemKind: Record<string, unknown[] | null> = { STRENGTH: lists.strengths, WEAKNESS: lists.weaknesses, WARNING: lists.warnings, ERROR: lists.errors, MISSING: lists.missingEvidence };
  for (const kind of EXPLANATION_SECTION_KINDS.filter(isCategorySectionKind)) {
    for (const item of itemsOf(kind)) {
      if (!isPlainObject(item) || !isText(item.kind) || item.kind === "FINDING") continue;
      const list = listByItemKind[item.kind];
      if (list && !list.some((other) => keyOf(other) === keyOf(item))) {
        issues.push({ field: "sections", message: `Invalid sections: a ${item.kind} item in ${kind} is not in the explanation's lists.` });
      }
    }
  }
  return issues;
}

export function createExplanationValidator(): OpportunityExplanationValidator {
  return { validateInput, validateSection, validateExplanation };
}
