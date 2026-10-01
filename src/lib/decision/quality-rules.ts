/**
 * Quality Rule Set: the eight quality rules.
 *
 * Each rule reports whether one analysis or overlay is internally consistent.
 * They evaluate only quality. They do not prioritize, recommend an action, or
 * execute anything. They never change the context. They depend on nothing:
 * each reads its own slice of the frozen context and can run alone.
 *
 * Declared checks are comma-separated ids in configuration
 * (`requiredPageFields`, `consistentEvidence`, `integritySnapshots`,
 * `requiredExplanations`, `integrityOverrides`, `integrityEffective`).
 * Presence is read from the page analysis and from extensions as `page.<id>`,
 * `evidence.<id>`, `snapshot.<id>`, `explanation.<id>`, `override.<id>`, and
 * `effective.<id>`. When a list is not declared, that rule is skipped.
 */
import type { DecisionIssue } from "./decision-validator";
import type { DecisionMetadata } from "./decision-types";
import type { DecisionRuleContext } from "./decision-rule-context";
import type { DecisionRuleModule, DecisionRuleOutput } from "./decision-rule-contract";

export const QUALITY_RULE_VERSION = "1.0.0";

export const QUALITY_RULE_IDS = [
  "opportunity-analysis-consistency",
  "traffic-analysis-consistency",
  "landing-page-completeness",
  "evidence-consistency",
  "snapshot-integrity",
  "required-explanations-present",
  "manual-override-integrity",
  "effective-layer-integrity",
] as const;
export type QualityRuleId = (typeof QUALITY_RULE_IDS)[number];

export const QUALITY_OBSERVATION_BY_RULE: Readonly<Record<string, { pass: string; fail: string; warn: string }>> = {
  "opportunity-analysis-consistency": { pass: "opportunity.consistent", fail: "opportunity.inconsistent", warn: "opportunity.unconfirmed" },
  "traffic-analysis-consistency": { pass: "traffic.consistent", fail: "traffic.inconsistent", warn: "traffic.unconfirmed" },
  "landing-page-completeness": { pass: "landing-page.complete", fail: "landing-page.incomplete", warn: "landing-page.unconfirmed" },
  "evidence-consistency": { pass: "evidence.consistent", fail: "evidence.inconsistent", warn: "evidence.unconfirmed" },
  "snapshot-integrity": { pass: "snapshot.intact", fail: "snapshot.broken", warn: "snapshot.unconfirmed" },
  "required-explanations-present": { pass: "explanation.present", fail: "explanation.missing", warn: "explanation.unconfirmed" },
  "manual-override-integrity": { pass: "override.intact", fail: "override.broken", warn: "override.unconfirmed" },
  "effective-layer-integrity": { pass: "effective.intact", fail: "effective.broken", warn: "effective.unconfirmed" },
};

const ITEM_ID = /^[a-z][a-z0-9-]*$/;
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const NONE: DecisionRuleModule["dependencies"] = { requires: [], optional: [], conflicts: [] };

function pass(observation: string, metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return { status: "PASS", confidence: 1, warnings: [], errors: [], metadata: { ...metadata, observation } };
}

function fail(message: string, observation: string, metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return { status: "FAIL", confidence: 0, warnings: [], errors: [message], metadata: { ...metadata, observation } };
}

function warn(message: string, observation: string, metadata: DecisionMetadata = {}): DecisionRuleOutput {
  return { status: "WARNING", confidence: null, warnings: [message], errors: [], metadata: { ...metadata, observation } };
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
  id: QualityRuleId,
  name: string,
  evaluate: (context: DecisionRuleContext) => DecisionRuleOutput,
  validate: (context: DecisionRuleContext) => DecisionIssue[] = () => [],
): DecisionRuleModule {
  return {
    id,
    name,
    version: QUALITY_RULE_VERSION,
    category: "QUALITY",
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

function lifecycleMessage(status: unknown, completedAt: unknown, version: unknown): string | null {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return "version is not a positive integer.";
  if (status === "COMPLETED" || status === "FAILED") {
    if (typeof completedAt !== "string" || completedAt.trim() === "") return "completedAt is required when the analysis is finished.";
  } else if (status === "PENDING" || status === "ANALYZING") {
    if (completedAt !== null) return "completedAt must be null while the analysis is in progress.";
  } else {
    return "status is not supported.";
  }
  return null;
}

function idOk(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
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
  id: QualityRuleId,
  key: string,
  pattern: RegExp,
  field: string,
  skipWarning: string,
  failMessage: (missing: string[]) => string,
  present: (context: DecisionRuleContext, ids: string[]) => string[],
): (context: DecisionRuleContext) => DecisionRuleOutput {
  const observation = QUALITY_OBSERVATION_BY_RULE[id];
  return (context) => {
    const parsed = parseRequiredList(context.configuration, key, pattern, field);
    if (parsed.kind === "skip") return skip(skipWarning);
    if (parsed.kind === "invalid") return fail(parsed.issues.map((i) => i.message).join(" "), observation.fail);
    const missing = present(context, parsed.ids);
    if (missing.length > 0) return fail(failMessage(missing), observation.fail, { checked: parsed.ids.join(",") });
    return pass(observation.pass, { checked: parsed.ids.join(",") });
  };
}

function pageFieldPresent(context: DecisionRuleContext, field: string): boolean {
  const page = context.pageAnalysis as Record<string, unknown> | null;
  if (page !== null && field in page) {
    const value = page[field];
    if (value !== undefined && value !== null && value !== "") return true;
  }
  return context.extensions[`page.${field}`] === true;
}

export function createOpportunityAnalysisConsistencyRule(): DecisionRuleModule {
  const observation = QUALITY_OBSERVATION_BY_RULE["opportunity-analysis-consistency"];
  return rule(
    "opportunity-analysis-consistency",
    "Opportunity Analysis Consistency",
    (context) => {
      const analysis = context.opportunityAnalysis;
      if (analysis === null) return fail("Missing analysis: an Opportunity analysis is required.", observation.fail);
      if (!idOk(analysis.id) || !idOk(analysis.candidateId)) {
        return fail("Opportunity analysis identity is inconsistent.", observation.fail);
      }
      const lifecycle = lifecycleMessage(analysis.status, analysis.completedAt, analysis.version);
      if (lifecycle !== null) return fail(`Opportunity analysis is inconsistent: ${lifecycle}`, observation.fail);
      if (context.candidate !== null && analysis.candidateId !== context.candidate.id) {
        return fail("Opportunity analysis belongs to a different candidate.", observation.fail);
      }
      if (context.candidate === null) {
        return warn("Candidate is not present to confirm Opportunity consistency.", observation.warn, { requirement: "opportunity" });
      }
      return pass(observation.pass, { requirement: "opportunity" });
    },
    (context) => (context.opportunityAnalysis === null ? missingAnalysis("opportunityAnalysis", "an Opportunity analysis") : []),
  );
}

export function createTrafficAnalysisConsistencyRule(): DecisionRuleModule {
  const observation = QUALITY_OBSERVATION_BY_RULE["traffic-analysis-consistency"];
  return rule(
    "traffic-analysis-consistency",
    "Traffic Analysis Consistency",
    (context) => {
      const analysis = context.trafficAnalysis;
      if (analysis === null) return fail("Missing analysis: a Traffic analysis is required.", observation.fail);
      if (!idOk(analysis.id) || !idOk(analysis.candidateId) || !idOk(analysis.opportunityAnalysisId)) {
        return fail("Traffic analysis identity is inconsistent.", observation.fail);
      }
      const lifecycle = lifecycleMessage(analysis.status, analysis.completedAt, analysis.version);
      if (lifecycle !== null) return fail(`Traffic analysis is inconsistent: ${lifecycle}`, observation.fail);
      if (context.candidate !== null && analysis.candidateId !== context.candidate.id) {
        return fail("Traffic analysis belongs to a different candidate.", observation.fail);
      }
      if (context.opportunityAnalysis !== null && analysis.opportunityAnalysisId !== context.opportunityAnalysis.id) {
        return fail("Traffic analysis belongs to a different Opportunity analysis.", observation.fail);
      }
      if (context.candidate === null || context.opportunityAnalysis === null) {
        return warn("Candidate or Opportunity analysis is not present to confirm Traffic consistency.", observation.warn, { requirement: "traffic" });
      }
      return pass(observation.pass, { requirement: "traffic" });
    },
    (context) => (context.trafficAnalysis === null ? missingAnalysis("trafficAnalysis", "a Traffic analysis") : []),
  );
}

export function createLandingPageCompletenessRule(): DecisionRuleModule {
  const observation = QUALITY_OBSERVATION_BY_RULE["landing-page-completeness"];
  return rule(
    "landing-page-completeness",
    "Landing Page Completeness",
    (context) => {
      if (context.pageAnalysis === null) return fail("Missing analysis: a page analysis is required.", observation.fail);
      const parsed = parseRequiredList(context.configuration, "requiredPageFields", FIELD_KEY, "configuration.requiredPageFields");
      if (parsed.kind === "skip") return skip("No landing-page completeness requirements declared.");
      if (parsed.kind === "invalid") return fail(parsed.issues.map((i) => i.message).join(" "), observation.fail);
      const missing = parsed.ids.filter((id) => !pageFieldPresent(context, id)).map((id) => `page.${id}`);
      if (missing.length > 0) return fail(`Landing page is incomplete: ${missing.join(", ")}.`, observation.fail, { checked: parsed.ids.join(",") });
      return pass(observation.pass, { checked: parsed.ids.join(",") });
    },
    (context) => {
      if (context.pageAnalysis === null) return missingAnalysis("pageAnalysis", "a page analysis");
      return listValidate("requiredPageFields", FIELD_KEY, "configuration.requiredPageFields")(context);
    },
  );
}

export function createEvidenceConsistencyRule(): DecisionRuleModule {
  return rule(
    "evidence-consistency",
    "Evidence Consistency",
    listEvaluate(
      "evidence-consistency",
      "consistentEvidence",
      ITEM_ID,
      "configuration.consistentEvidence",
      "No evidence consistency requirements declared.",
      (missing) => `Evidence is inconsistent: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "evidence", context.extensions),
    ),
    listValidate("consistentEvidence", ITEM_ID, "configuration.consistentEvidence"),
  );
}

export function createSnapshotIntegrityRule(): DecisionRuleModule {
  return rule(
    "snapshot-integrity",
    "Snapshot Integrity",
    listEvaluate(
      "snapshot-integrity",
      "integritySnapshots",
      ITEM_ID,
      "configuration.integritySnapshots",
      "No snapshot integrity requirements declared.",
      (missing) => `Snapshot integrity failed: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "snapshot", context.extensions),
    ),
    listValidate("integritySnapshots", ITEM_ID, "configuration.integritySnapshots"),
  );
}

export function createRequiredExplanationsPresentRule(): DecisionRuleModule {
  return rule(
    "required-explanations-present",
    "Required Explanations Present",
    listEvaluate(
      "required-explanations-present",
      "requiredExplanations",
      ITEM_ID,
      "configuration.requiredExplanations",
      "No explanation requirements declared.",
      (missing) => `Required explanations are not present: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "explanation", context.extensions),
    ),
    listValidate("requiredExplanations", ITEM_ID, "configuration.requiredExplanations"),
  );
}

export function createManualOverrideIntegrityRule(): DecisionRuleModule {
  return rule(
    "manual-override-integrity",
    "Manual Override Integrity",
    listEvaluate(
      "manual-override-integrity",
      "integrityOverrides",
      FIELD_KEY,
      "configuration.integrityOverrides",
      "No manual-override integrity requirements declared.",
      (missing) => `Manual override integrity failed: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "override", context.extensions),
    ),
    listValidate("integrityOverrides", FIELD_KEY, "configuration.integrityOverrides"),
  );
}

export function createEffectiveLayerIntegrityRule(): DecisionRuleModule {
  return rule(
    "effective-layer-integrity",
    "Effective Layer Integrity",
    listEvaluate(
      "effective-layer-integrity",
      "integrityEffective",
      FIELD_KEY,
      "configuration.integrityEffective",
      "No effective-layer integrity requirements declared.",
      (missing) => `Effective layer integrity failed: ${missing.join(", ")}.`,
      (context, ids) => missingPrefixed(ids, "effective", context.extensions),
    ),
    listValidate("integrityEffective", FIELD_KEY, "configuration.integrityEffective"),
  );
}

/** The eight quality rules, in declared order. */
export function createQualityRules(): DecisionRuleModule[] {
  return [
    createOpportunityAnalysisConsistencyRule(),
    createTrafficAnalysisConsistencyRule(),
    createLandingPageCompletenessRule(),
    createEvidenceConsistencyRule(),
    createSnapshotIntegrityRule(),
    createRequiredExplanationsPresentRule(),
    createManualOverrideIntegrityRule(),
    createEffectiveLayerIntegrityRule(),
  ];
}
