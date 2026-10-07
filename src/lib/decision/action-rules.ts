/**
 * Action Rule Set: the ten action rules.
 *
 * Each rule reports whether one operational action is eligible given the
 * current context. They do not execute that action, do not emit a plan, and
 * never change the context. They depend on nothing: each reads its own slice
 * of the frozen context and can run alone. There is no ordering among eligible
 * actions.
 *
 * `eligibleAction` and `blockingReasons` are carried in metadata because the
 * Decision Rule Framework result is a flat record of status, confidence,
 * warnings, errors, and metadata.
 *
 * Declared checks are comma-separated ids in configuration
 * (`actionPageFields`, `actionReview`, `actionMonitoring`,
 * `actionReevaluation`). Presence is read from the page analysis and from
 * extensions as `page.<id>`, `review.<id>`, `monitoring.<id>`, and
 * `reevaluation.<id>`.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionMetadata } from "./decision-types";
import type { DecisionRuleContext } from "./decision-rule-context";
import type { DecisionRuleModule, DecisionRuleOutput } from "./decision-rule-contract";

export const ACTION_RULE_VERSION = "1.0.0";

export const ACTION_RULE_IDS = [
  "continue-research",
  "run-opportunity-analysis",
  "run-traffic-analysis",
  "generate-landing-page",
  "improve-landing-page",
  "request-human-review",
  "ready-for-publication",
  "monitor-product",
  "archive-product",
  "reevaluate-later",
] as const;
export type ActionRuleId = (typeof ACTION_RULE_IDS)[number];

export interface ActionRuleModule extends DecisionRuleModule {
  readonly eligibleAction: ActionRuleId;
}

const ITEM_ID = /^[a-z][a-z0-9-]*$/;
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const NONE: DecisionRuleModule["dependencies"] = { requires: [], optional: [], conflicts: [] };
const EARLY = new Set(["NEW", "QUEUED", "PROCESSING"]);
const OPEN = new Set(["PENDING", "ANALYZING"]);

function pass(action: ActionRuleId, metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return { status: "PASS", confidence: null, warnings: [], errors: [], metadata: { ...metadata, eligibleAction: action } };
}

function fail(action: ActionRuleId, reasons: string[], metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return {
    status: "FAIL",
    confidence: null,
    warnings: [],
    errors: reasons,
    metadata: { ...metadata, eligibleAction: action, blockingReasons: reasons.join(",") },
  };
}

function skip(action: ActionRuleId, warning: string): DecisionRuleOutput {
  return { status: "SKIPPED", confidence: null, warnings: [warning], errors: [], metadata: { eligibleAction: action } };
}

type ParsedList = { kind: "skip" } | { kind: "invalid"; issues: DecisionIssue[] } | { kind: "ok"; ids: string[] };

function parseRequiredList(configuration: DecisionMetadata, key: string, idPattern: RegExp, field: string): ParsedList {
  const value = configuration[key];
  if (value === undefined || value === null || value === "") return { kind: "skip" };
  if (typeof value !== "string") {
    return { kind: "invalid", issues: [{ field, message: `Invalid metadata: "${key}" must be text.` }] };
  }
  const ids = value.split(",").map((item) => item.trim()).filter((item) => item !== "");
  if (ids.length === 0) return { kind: "skip" };
  const issues: DecisionIssue[] = [];
  if (ids.some((id) => !idPattern.test(id))) {
    issues.push({ field, message: `Invalid metadata: "${key}" must contain only valid ids.` });
  }
  if (new Set(ids).size !== ids.length) {
    issues.push({ field, message: `Invalid metadata: "${key}" must not repeat an id.` });
  }
  return issues.length > 0 ? { kind: "invalid", issues } : { kind: "ok", ids };
}

function rule(
  id: ActionRuleId,
  name: string,
  evaluate: (context: DecisionRuleContext) => DecisionRuleOutput,
  validate: (context: DecisionRuleContext) => DecisionIssue[] = () => [],
): ActionRuleModule {
  return {
    id,
    name,
    version: ACTION_RULE_VERSION,
    category: "ACTION",
    enabled: true,
    priority: 100,
    dependencies: NONE,
    eligibleAction: id,
    supportsDecision: () => true,
    validate,
    evaluate,
  };
}

function statusOf(record: { status?: unknown } | null): unknown {
  return record === null ? null : record.status;
}

function pageStatus(page: DecisionRuleContext["pageAnalysis"]): unknown {
  return page === null ? null : (page as { status?: unknown }).status;
}

function isBlocked(status: unknown): boolean {
  return status === "FAILED" || status === "IGNORED";
}

function pageFieldPresent(context: DecisionRuleContext, field: string): boolean {
  const page = context.pageAnalysis as Record<string, unknown> | null;
  if (page !== null && field in page) {
    const value = page[field];
    if (value !== undefined && value !== null && value !== "") return true;
  }
  return context.extensions[`page.${field}`] === true;
}

function prefixedTrue(extensions: DecisionMetadata, prefix: string, id: string): boolean {
  return extensions[`${prefix}.${id}`] === true;
}

function missingPrefixed(ids: string[], prefix: string, extensions: DecisionMetadata): string[] {
  return ids.filter((id) => !prefixedTrue(extensions, prefix, id)).map((id) => `${prefix}.${id}`);
}

function listValidate(key: string, pattern: RegExp, field: string) {
  return (context: DecisionRuleContext): DecisionIssue[] => {
    const parsed = parseRequiredList(context.configuration, key, pattern, field);
    return parsed.kind === "invalid" ? parsed.issues : [];
  };
}

function listEvaluate(
  action: ActionRuleId,
  key: string,
  pattern: RegExp,
  field: string,
  skipWarning: string,
  failMessage: (missing: string[]) => string,
  present: (context: DecisionRuleContext, ids: string[]) => string[],
): (context: DecisionRuleContext) => DecisionRuleOutput {
  return (context) => {
    const parsed = parseRequiredList(context.configuration, key, pattern, field);
    if (parsed.kind === "skip") return skip(action, skipWarning);
    if (parsed.kind === "invalid") return fail(action, parsed.issues.map((i) => i.message));
    const missing = present(context, parsed.ids);
    if (missing.length > 0) return fail(action, [failMessage(missing)], { checked: parsed.ids.join(",") });
    return pass(action, { checked: parsed.ids.join(",") });
  };
}

export function createContinueResearchRule(): ActionRuleModule {
  const action = "continue-research";
  return rule(action, "Continue Research", (context) => {
    const candidate = context.candidate;
    if (candidate === null) return skip(action, "No candidate is present.");
    if (isBlocked(candidate.status)) return fail(action, ["Research is blocked for this candidate."]);
    if (EARLY.has(candidate.status)) return pass(action);
    if (candidate.status === "COMPLETED") return skip(action, "Research is not eligible.");
    return fail(action, ["Discovery status is not supported."]);
  });
}

export function createRunOpportunityAnalysisRule(): ActionRuleModule {
  const action = "run-opportunity-analysis";
  return rule(action, "Run Opportunity Analysis", (context) => {
    if (context.candidate === null) return skip(action, "No candidate is present.");
    if (isBlocked(context.candidate.status)) return fail(action, ["Opportunity analysis is blocked."]);
    const opportunity = statusOf(context.opportunityAnalysis);
    if (isBlocked(opportunity)) return fail(action, ["Opportunity analysis is blocked."]);
    if (opportunity === "COMPLETED") return skip(action, "Opportunity analysis is not eligible.");
    return pass(action);
  });
}

export function createRunTrafficAnalysisRule(): ActionRuleModule {
  const action = "run-traffic-analysis";
  return rule(action, "Run Traffic Analysis", (context) => {
    const opportunity = statusOf(context.opportunityAnalysis);
    const traffic = statusOf(context.trafficAnalysis);
    if (opportunity !== "COMPLETED") return skip(action, "Traffic analysis is not eligible.");
    if (isBlocked(traffic)) return fail(action, ["Traffic analysis is blocked."]);
    if (traffic === "COMPLETED") return skip(action, "Traffic analysis is not eligible.");
    if (traffic === null || OPEN.has(String(traffic))) return pass(action);
    return fail(action, ["Traffic status is not supported."]);
  });
}

export function createGenerateLandingPageRule(): ActionRuleModule {
  const action = "generate-landing-page";
  return rule(action, "Generate Landing Page", (context) => {
    if (context.candidate === null) return skip(action, "No candidate is present.");
    if (isBlocked(context.candidate.status)) return fail(action, ["Landing page generation is blocked."]);
    if (context.pageAnalysis !== null) return skip(action, "Landing page generation is not eligible.");
    return pass(action);
  });
}

export function createImproveLandingPageRule(): ActionRuleModule {
  const action = "improve-landing-page";
  return rule(
    action,
    "Improve Landing Page",
    (context) => {
      if (context.pageAnalysis === null) return skip(action, "Landing page improvement is not eligible.");
      if (isBlocked(pageStatus(context.pageAnalysis))) return fail(action, ["Landing page improvement is blocked."]);
      const parsed = parseRequiredList(context.configuration, "actionPageFields", FIELD_KEY, "configuration.actionPageFields");
      if (parsed.kind === "invalid") return fail(action, parsed.issues.map((i) => i.message));
      if (parsed.kind === "ok") {
        const missing = parsed.ids.filter((id) => !pageFieldPresent(context, id));
        if (missing.length > 0) return pass(action, { checked: parsed.ids.join(",") });
      }
      return skip(action, "Landing page improvement is not eligible.");
    },
    listValidate("actionPageFields", FIELD_KEY, "configuration.actionPageFields"),
  );
}

export function createRequestHumanReviewRule(): ActionRuleModule {
  return rule(
    "request-human-review",
    "Request Human Review",
    listEvaluate(
      "request-human-review",
      "actionReview",
      ITEM_ID,
      "configuration.actionReview",
      "No review action is declared.",
      (missing) => `Review is blocked: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "review", context.extensions),
    ),
    listValidate("actionReview", ITEM_ID, "configuration.actionReview"),
  );
}

export function createReadyForPublicationRule(): ActionRuleModule {
  const action = "ready-for-publication";
  return rule(action, "Ready For Publication", (context) => {
    if (context.candidate !== null && isBlocked(context.candidate.status)) return skip(action, "Publication is not eligible.");
    const opportunity = statusOf(context.opportunityAnalysis);
    const traffic = statusOf(context.trafficAnalysis);
    const page = context.pageAnalysis;
    if (opportunity === "COMPLETED" && traffic === "COMPLETED" && isBlocked(pageStatus(page))) {
      return fail(action, ["Publication is blocked."]);
    }
    if (opportunity === "COMPLETED" && traffic === "COMPLETED" && page !== null && page.id.trim() !== "" && !isBlocked(pageStatus(page))) {
      return pass(action);
    }
    return skip(action, "Publication is not eligible.");
  });
}

export function createMonitorProductRule(): ActionRuleModule {
  return rule(
    "monitor-product",
    "Monitor Product",
    listEvaluate(
      "monitor-product",
      "actionMonitoring",
      ITEM_ID,
      "configuration.actionMonitoring",
      "No monitoring action is declared.",
      (missing) => `Monitoring is blocked: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "monitoring", context.extensions),
    ),
    listValidate("actionMonitoring", ITEM_ID, "configuration.actionMonitoring"),
  );
}

export function createArchiveProductRule(): ActionRuleModule {
  const action = "archive-product";
  return rule(action, "Archive Product", (context) => {
    const candidate = context.candidate;
    if (candidate === null) return skip(action, "No candidate is present.");
    if (isBlocked(candidate.status)) return pass(action);
    return skip(action, "Archive is not eligible.");
  });
}

export function createReevaluateLaterRule(): ActionRuleModule {
  return rule(
    "reevaluate-later",
    "Reevaluate Later",
    listEvaluate(
      "reevaluate-later",
      "actionReevaluation",
      ITEM_ID,
      "configuration.actionReevaluation",
      "No reevaluation action is declared.",
      (missing) => `Reevaluation is blocked: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "reevaluation", context.extensions),
    ),
    listValidate("actionReevaluation", ITEM_ID, "configuration.actionReevaluation"),
  );
}

/** The ten action rules, in declared order. */
export function createActionRules(): ActionRuleModule[] {
  return [
    createContinueResearchRule(),
    createRunOpportunityAnalysisRule(),
    createRunTrafficAnalysisRule(),
    createGenerateLandingPageRule(),
    createImproveLandingPageRule(),
    createRequestHumanReviewRule(),
    createReadyForPublicationRule(),
    createMonitorProductRule(),
    createArchiveProductRule(),
    createReevaluateLaterRule(),
  ];
}
