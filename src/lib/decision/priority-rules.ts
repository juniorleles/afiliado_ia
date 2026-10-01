/**
 * Priority Rule Set: the eight priority rules.
 *
 * Each rule reports whether one operational concern is currently in play.
 * They do not execute an action, and they never change the context. They
 * depend on nothing: each reads its own slice of the frozen context and can
 * run alone. There is no ordering among concerns and no numeric result.
 *
 * Declared checks are comma-separated ids in configuration
 * (`priorityPageFields`, `priorityReview`, `priorityMonitoring`,
 * `priorityReevaluation`). Presence is read from the page analysis and from
 * extensions as `page.<id>`, `review.<id>`, `monitoring.<id>`, and
 * `reevaluation.<id>`. When a list is not declared, that rule is skipped
 * unless the analyses themselves make the concern current.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionMetadata } from "./decision-types";
import type { DecisionRuleContext } from "./decision-rule-context";
import type { DecisionRuleModule, DecisionRuleOutput } from "./decision-rule-contract";

export const PRIORITY_RULE_VERSION = "1.0.0";

export const PRIORITY_RULE_IDS = [
  "research-priority",
  "analysis-priority",
  "landing-page-priority",
  "traffic-preparation-priority",
  "publication-readiness",
  "review-priority",
  "monitoring-priority",
  "reevaluation-priority",
] as const;
export type PriorityRuleId = (typeof PRIORITY_RULE_IDS)[number];

export const PRIORITY_OBSERVATION_BY_RULE: Readonly<Record<string, { pass: string; fail: string; warn: string }>> = {
  "research-priority": { pass: "research.current", fail: "research.blocked", warn: "research.unconfirmed" },
  "analysis-priority": { pass: "analysis.current", fail: "analysis.blocked", warn: "analysis.unconfirmed" },
  "landing-page-priority": { pass: "landing-page.current", fail: "landing-page.blocked", warn: "landing-page.unconfirmed" },
  "traffic-preparation-priority": { pass: "traffic-prep.current", fail: "traffic-prep.blocked", warn: "traffic-prep.unconfirmed" },
  "publication-readiness": { pass: "publication.current", fail: "publication.blocked", warn: "publication.unconfirmed" },
  "review-priority": { pass: "review.current", fail: "review.inconsistent", warn: "review.unconfirmed" },
  "monitoring-priority": { pass: "monitoring.current", fail: "monitoring.inconsistent", warn: "monitoring.unconfirmed" },
  "reevaluation-priority": { pass: "reevaluation.current", fail: "reevaluation.inconsistent", warn: "reevaluation.unconfirmed" },
};

const ITEM_ID = /^[a-z][a-z0-9-]*$/;
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const NONE: DecisionRuleModule["dependencies"] = { requires: [], optional: [], conflicts: [] };
const EARLY = new Set(["NEW", "QUEUED", "PROCESSING"]);
const OPEN = new Set(["PENDING", "ANALYZING"]);

function pass(observation: string, metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return { status: "PASS", confidence: 1, warnings: [], errors: [], metadata: { ...metadata, observation } };
}

function fail(message: string, observation: string, metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return { status: "FAIL", confidence: 0, warnings: [], errors: [message], metadata: { ...metadata, observation } };
}

function skip(warning: string): DecisionRuleOutput {
  return { status: "SKIPPED", confidence: null, warnings: [warning], errors: [], metadata: {} };
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
  id: PriorityRuleId,
  name: string,
  evaluate: (context: DecisionRuleContext) => DecisionRuleOutput,
  validate: (context: DecisionRuleContext) => DecisionIssue[] = () => [],
): DecisionRuleModule {
  return {
    id,
    name,
    version: PRIORITY_RULE_VERSION,
    category: "PRIORITY",
    enabled: true,
    priority: 100,
    dependencies: NONE,
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
  id: PriorityRuleId,
  key: string,
  pattern: RegExp,
  field: string,
  skipWarning: string,
  failMessage: (missing: string[]) => string,
  present: (context: DecisionRuleContext, ids: string[]) => string[],
): (context: DecisionRuleContext) => DecisionRuleOutput {
  const observation = PRIORITY_OBSERVATION_BY_RULE[id];
  return (context) => {
    const parsed = parseRequiredList(context.configuration, key, pattern, field);
    if (parsed.kind === "skip") return skip(skipWarning);
    if (parsed.kind === "invalid") return fail(parsed.issues.map((i) => i.message).join(" "), observation.fail);
    const missing = present(context, parsed.ids);
    if (missing.length > 0) return fail(failMessage(missing), observation.fail, { checked: parsed.ids.join(",") });
    return pass(observation.pass, { checked: parsed.ids.join(",") });
  };
}

export function createResearchPriorityRule(): DecisionRuleModule {
  const observation = PRIORITY_OBSERVATION_BY_RULE["research-priority"];
  return rule("research-priority", "Research Priority", (context) => {
    const candidate = context.candidate;
    if (candidate === null) return skip("No candidate is present.");
    if (isBlocked(candidate.status)) return fail("Research is blocked for this candidate.", observation.fail);
    if (EARLY.has(candidate.status)) return pass(observation.pass, { concern: "research" });
    if (candidate.status === "COMPLETED") return skip("Research is not the current operational concern.");
    return fail("Discovery status is not supported.", observation.fail);
  });
}

export function createAnalysisPriorityRule(): DecisionRuleModule {
  const observation = PRIORITY_OBSERVATION_BY_RULE["analysis-priority"];
  return rule("analysis-priority", "Analysis Priority", (context) => {
    if (context.candidate === null) return skip("No candidate is present.");
    const opportunity = statusOf(context.opportunityAnalysis);
    const traffic = statusOf(context.trafficAnalysis);
    if (isBlocked(opportunity) || isBlocked(traffic)) return fail("Analysis is blocked.", observation.fail);
    if (opportunity !== "COMPLETED") return pass(observation.pass, { concern: "analysis" });
    return skip("Analysis is not the current operational concern.");
  });
}

export function createLandingPagePriorityRule(): DecisionRuleModule {
  const observation = PRIORITY_OBSERVATION_BY_RULE["landing-page-priority"];
  return rule(
    "landing-page-priority",
    "Landing Page Priority",
    (context) => {
      if (context.candidate === null) return skip("No candidate is present.");
      if (isBlocked(pageStatus(context.pageAnalysis))) return fail("Landing page work is blocked.", observation.fail);
      const parsed = parseRequiredList(context.configuration, "priorityPageFields", FIELD_KEY, "configuration.priorityPageFields");
      if (parsed.kind === "invalid") return fail(parsed.issues.map((i) => i.message).join(" "), observation.fail);
      if (context.pageAnalysis === null) return pass(observation.pass, { concern: "landing-page" });
      if (parsed.kind === "ok") {
        const missing = parsed.ids.filter((id) => !pageFieldPresent(context, id));
        if (missing.length > 0) return pass(observation.pass, { concern: "landing-page", checked: parsed.ids.join(",") });
      }
      return skip("Landing page work is not the current operational concern.");
    },
    listValidate("priorityPageFields", FIELD_KEY, "configuration.priorityPageFields"),
  );
}

export function createTrafficPreparationPriorityRule(): DecisionRuleModule {
  const observation = PRIORITY_OBSERVATION_BY_RULE["traffic-preparation-priority"];
  return rule("traffic-preparation-priority", "Traffic Preparation Priority", (context) => {
    const opportunity = statusOf(context.opportunityAnalysis);
    const traffic = statusOf(context.trafficAnalysis);
    if (opportunity !== "COMPLETED") return skip("Traffic preparation is not the current operational concern.");
    if (isBlocked(traffic)) return fail("Traffic preparation is blocked.", observation.fail);
    if (traffic === "COMPLETED") return skip("Traffic preparation is not the current operational concern.");
    if (traffic === null || OPEN.has(String(traffic))) return pass(observation.pass, { concern: "traffic-prep" });
    return fail("Traffic status is not supported.", observation.fail);
  });
}

export function createPublicationReadinessRule(): DecisionRuleModule {
  const observation = PRIORITY_OBSERVATION_BY_RULE["publication-readiness"];
  return rule("publication-readiness", "Publication Readiness", (context) => {
    const opportunity = statusOf(context.opportunityAnalysis);
    const traffic = statusOf(context.trafficAnalysis);
    const page = context.pageAnalysis;
    if (isBlocked(opportunity) || isBlocked(traffic) || isBlocked(pageStatus(page))) {
      if (opportunity === "COMPLETED" && traffic === "COMPLETED") {
        return fail("Publication is blocked.", observation.fail);
      }
    }
    if (opportunity === "COMPLETED" && traffic === "COMPLETED" && page !== null && page.id.trim() !== "" && !isBlocked(pageStatus(page))) {
      return pass(observation.pass, { concern: "publication" });
    }
    return skip("Publication is not the current operational concern.");
  });
}

export function createReviewPriorityRule(): DecisionRuleModule {
  return rule(
    "review-priority",
    "Review Priority",
    listEvaluate(
      "review-priority",
      "priorityReview",
      ITEM_ID,
      "configuration.priorityReview",
      "No review requirements declared.",
      (missing) => `Review flags are inconsistent: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "review", context.extensions),
    ),
    listValidate("priorityReview", ITEM_ID, "configuration.priorityReview"),
  );
}

export function createMonitoringPriorityRule(): DecisionRuleModule {
  return rule(
    "monitoring-priority",
    "Monitoring Priority",
    listEvaluate(
      "monitoring-priority",
      "priorityMonitoring",
      ITEM_ID,
      "configuration.priorityMonitoring",
      "No monitoring requirements declared.",
      (missing) => `Monitoring flags are inconsistent: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "monitoring", context.extensions),
    ),
    listValidate("priorityMonitoring", ITEM_ID, "configuration.priorityMonitoring"),
  );
}

export function createReevaluationPriorityRule(): DecisionRuleModule {
  return rule(
    "reevaluation-priority",
    "Reevaluation Priority",
    listEvaluate(
      "reevaluation-priority",
      "priorityReevaluation",
      ITEM_ID,
      "configuration.priorityReevaluation",
      "No reevaluation requirements declared.",
      (missing) => `Reevaluation flags are inconsistent: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "reevaluation", context.extensions),
    ),
    listValidate("priorityReevaluation", ITEM_ID, "configuration.priorityReevaluation"),
  );
}

/** The eight priority rules, in declared order. */
export function createPriorityRules(): DecisionRuleModule[] {
  return [
    createResearchPriorityRule(),
    createAnalysisPriorityRule(),
    createLandingPagePriorityRule(),
    createTrafficPreparationPriorityRule(),
    createPublicationReadinessRule(),
    createReviewPriorityRule(),
    createMonitoringPriorityRule(),
    createReevaluationPriorityRule(),
  ];
}
