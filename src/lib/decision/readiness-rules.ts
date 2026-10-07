/**
 * Readiness Rule Set: the eight readiness rules.
 *
 * Each rule reports whether one operational requirement is in place. They
 * evaluate only readiness. They do not prioritize, recommend an action, or
 * execute anything. They never change the context. They depend on nothing:
 * each reads its own slice of the frozen context and can run alone.
 *
 * Required evidence, snapshots, metadata, and validation are declared as
 * comma-separated ids in configuration (`requiredEvidence`,
 * `requiredSnapshots`, `requiredMetadata`, `requiredValidation`). Presence is
 * read from extensions as `evidence.<id>`, `snapshot.<id>`, `validation.<id>`,
 * and from the metadata bags for required metadata keys. When a list is not
 * declared, that rule is skipped.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionMetadata } from "./decision-types";
import type { DecisionRuleContext } from "./decision-rule-context";
import type { DecisionRuleModule, DecisionRuleOutput } from "./decision-rule-contract";

export const READINESS_RULE_VERSION = "1.0.0";

export const READINESS_RULE_IDS = [
  "discovery-available",
  "opportunity-completed",
  "traffic-completed",
  "landing-page-available",
  "required-evidence-present",
  "required-snapshots-present",
  "required-metadata-present",
  "required-validation-passed",
] as const;
export type ReadinessRuleId = (typeof READINESS_RULE_IDS)[number];

/** The requirement name a FAIL of each rule contributes when metadata.missing is empty. */
export const READINESS_REQUIREMENT_BY_RULE: Readonly<Record<string, string>> = {
  "discovery-available": "discovery",
  "opportunity-completed": "opportunity",
  "traffic-completed": "traffic",
  "landing-page-available": "landing-page",
  "required-evidence-present": "evidence",
  "required-snapshots-present": "snapshot",
  "required-metadata-present": "metadata",
  "required-validation-passed": "validation",
};

const ITEM_ID = /^[a-z][a-z0-9-]*$/;
const METADATA_KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const NONE: DecisionRuleModule["dependencies"] = { requires: [], optional: [], conflicts: [] };

function pass(metadata: DecisionMetadata): DecisionRuleOutput {
  return { status: "PASS", confidence: 1, warnings: [], errors: [], metadata };
}

function fail(message: string, missing: string, metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return { status: "FAIL", confidence: 0, warnings: [], errors: [message], metadata: { ...metadata, missing } };
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
  id: ReadinessRuleId,
  name: string,
  evaluate: (context: DecisionRuleContext) => DecisionRuleOutput,
  validate: (context: DecisionRuleContext) => DecisionIssue[] = () => [],
): DecisionRuleModule {
  return {
    id,
    name,
    version: READINESS_RULE_VERSION,
    category: "READINESS",
    enabled: true,
    priority: 100,
    dependencies: NONE,
    supportsDecision: () => true,
    validate,
    evaluate,
  };
}

function missingAnalysis(field: string, label: string): DecisionIssue[] {
  return [{ field, message: `Missing analysis: ${label} is required.` }];
}

function isCompleted(status: unknown, completedAt: unknown, version: unknown): boolean {
  return (
    status === "COMPLETED" &&
    typeof completedAt === "string" &&
    completedAt.trim() !== "" &&
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= 1
  );
}

function metadataValuePresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function metadataPresent(context: DecisionRuleContext, key: string): boolean {
  return [context.executionMetadata, context.runtimeMetadata, context.configuration, context.extensions].some((bag) =>
    metadataValuePresent(bag[key]),
  );
}

function prefixedPresent(extensions: DecisionMetadata, prefix: string, id: string): boolean {
  return extensions[`${prefix}.${id}`] === true;
}

function missingPrefixed(ids: string[], prefix: string, extensions: DecisionMetadata): string[] {
  return ids.filter((id) => !prefixedPresent(extensions, prefix, id)).map((id) => `${prefix}.${id}`);
}

function listValidate(key: string, pattern: RegExp, field: string) {
  return (context: DecisionRuleContext): DecisionIssue[] => {
    const parsed = parseRequiredList(context.configuration, key, pattern, field);
    return parsed.kind === "invalid" ? parsed.issues : [];
  };
}

function listEvaluate(
  key: string,
  pattern: RegExp,
  field: string,
  skipWarning: string,
  failMessage: (missing: string[]) => string,
  present: (context: DecisionRuleContext, ids: string[]) => string[],
): (context: DecisionRuleContext) => DecisionRuleOutput {
  return (context) => {
    const parsed = parseRequiredList(context.configuration, key, pattern, field);
    if (parsed.kind === "skip") return skip(skipWarning);
    if (parsed.kind === "invalid") return fail(parsed.issues.map((i) => i.message).join(" "), READINESS_REQUIREMENT_BY_RULE[field] ?? field);
    const missing = present(context, parsed.ids);
    if (missing.length > 0) return fail(failMessage(missing), missing.join(","), { checked: parsed.ids.join(",") });
    return pass({ checked: parsed.ids.join(",") });
  };
}

export function createDiscoveryAvailableRule(): DecisionRuleModule {
  return rule("discovery-available", "Discovery Available", (context) => {
    const candidate = context.candidate;
    if (candidate === null || candidate.id.trim() === "" || candidate.status === "FAILED" || candidate.status === "IGNORED") {
      return fail("Discovery candidate is not available.", "discovery");
    }
    return pass({ requirement: "discovery", present: true });
  });
}

export function createOpportunityCompletedRule(): DecisionRuleModule {
  return rule(
    "opportunity-completed",
    "Opportunity Completed",
    (context) => {
      const analysis = context.opportunityAnalysis;
      if (analysis === null) return fail("Missing analysis: an Opportunity analysis is required.", "opportunity");
      if (!isCompleted(analysis.status, analysis.completedAt, analysis.version)) {
        return fail("Opportunity analysis is not completed.", "opportunity");
      }
      return pass({ requirement: "opportunity", present: true });
    },
    (context) => (context.opportunityAnalysis === null ? missingAnalysis("opportunityAnalysis", "an Opportunity analysis") : []),
  );
}

export function createTrafficCompletedRule(): DecisionRuleModule {
  return rule(
    "traffic-completed",
    "Traffic Completed",
    (context) => {
      const analysis = context.trafficAnalysis;
      if (analysis === null) return fail("Missing analysis: a Traffic analysis is required.", "traffic");
      if (!isCompleted(analysis.status, analysis.completedAt, analysis.version)) {
        return fail("Traffic analysis is not completed.", "traffic");
      }
      return pass({ requirement: "traffic", present: true });
    },
    (context) => (context.trafficAnalysis === null ? missingAnalysis("trafficAnalysis", "a Traffic analysis") : []),
  );
}

export function createLandingPageAvailableRule(): DecisionRuleModule {
  return rule(
    "landing-page-available",
    "Landing Page Available",
    (context) => {
      const page = context.pageAnalysis;
      if (page === null || page.id.trim() === "") return fail("Missing analysis: a page analysis is required.", "landing-page");
      const status = (page as { status?: unknown }).status;
      if (status === "FAILED" || status === "IGNORED") return fail("Landing page is not available.", "landing-page");
      return pass({ requirement: "landing-page", present: true });
    },
    (context) => (context.pageAnalysis === null ? missingAnalysis("pageAnalysis", "a page analysis") : []),
  );
}

export function createRequiredEvidencePresentRule(): DecisionRuleModule {
  return rule(
    "required-evidence-present",
    "Required Evidence Present",
    listEvaluate(
      "requiredEvidence",
      ITEM_ID,
      "configuration.requiredEvidence",
      "No evidence requirements declared.",
      (missing) => `Required evidence is not present: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "evidence", context.extensions),
    ),
    listValidate("requiredEvidence", ITEM_ID, "configuration.requiredEvidence"),
  );
}

export function createRequiredSnapshotsPresentRule(): DecisionRuleModule {
  return rule(
    "required-snapshots-present",
    "Required Snapshots Present",
    listEvaluate(
      "requiredSnapshots",
      ITEM_ID,
      "configuration.requiredSnapshots",
      "No snapshot requirements declared.",
      (missing) => `Required snapshots are not present: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "snapshot", context.extensions),
    ),
    listValidate("requiredSnapshots", ITEM_ID, "configuration.requiredSnapshots"),
  );
}

export function createRequiredMetadataPresentRule(): DecisionRuleModule {
  return rule(
    "required-metadata-present",
    "Required Metadata Present",
    listEvaluate(
      "requiredMetadata",
      METADATA_KEY,
      "configuration.requiredMetadata",
      "No metadata requirements declared.",
      (missing) => `Required metadata is not present: ${missing.join(", ")}.`,
      (context, ids) => ids.filter((id) => !metadataPresent(context, id)).map((id) => `metadata.${id}`),
    ),
    listValidate("requiredMetadata", METADATA_KEY, "configuration.requiredMetadata"),
  );
}

export function createRequiredValidationPassedRule(): DecisionRuleModule {
  return rule(
    "required-validation-passed",
    "Required Validation Passed",
    listEvaluate(
      "requiredValidation",
      ITEM_ID,
      "configuration.requiredValidation",
      "No validation requirements declared.",
      (missing) => `Required validation has not passed: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "validation", context.extensions),
    ),
    listValidate("requiredValidation", ITEM_ID, "configuration.requiredValidation"),
  );
}

/** The eight readiness rules, in declared order. */
export function createReadinessRules(): DecisionRuleModule[] {
  return [
    createDiscoveryAvailableRule(),
    createOpportunityCompletedRule(),
    createTrafficCompletedRule(),
    createLandingPageAvailableRule(),
    createRequiredEvidencePresentRule(),
    createRequiredSnapshotsPresentRule(),
    createRequiredMetadataPresentRule(),
    createRequiredValidationPassedRule(),
  ];
}
