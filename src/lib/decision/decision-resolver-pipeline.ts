/**
 * Decision Resolver: the pipeline.
 *
 * Runs the eight stages of an analysis in order:
 *
 *   RESOLVE_CANDIDATE
 *   LOAD_OPPORTUNITY_ANALYSIS
 *   LOAD_TRAFFIC_ANALYSIS
 *   LOAD_LANDING_PAGE_ANALYSIS
 *   EXECUTE_DECISION_DIMENSIONS
 *   VALIDATE_RESULTS
 *   RESOLVE_CONFLICTS
 *   BUILD_ANALYSIS
 *
 * Decision dimensions are Readiness, Quality, Priority, and Action. Each
 * enabled rule runs exactly once. A stage that cannot proceed marks the
 * stages after it SKIPPED. The pipeline always returns an analysis and never
 * throws: a refusal is an analysis with decisionStatus REFUSED.
 *
 * It never executes an action, never emits a plan, never changes the
 * context, and persists nothing. Rules are not registered, enabled, or
 * disabled to make a run succeed.
 *
 * Conflict resolution is deterministic and ordered. There is no voting.
 */
import { createActionRuleSet } from "./action-rule-set";
import type { DecisionRuleRunResult } from "./decision-rule-contract";
import { createDecisionRuleContext, freezeDeepDecisionRule, type DecisionRuleContext, type DecisionRuleContextInit } from "./decision-rule-context";
import type { DecisionRulePipeline } from "./decision-rule-pipeline";
import type { DecisionIssue } from "./decision-validator";
import type { DecisionMetadata, DecisionStatus } from "./decision-types";
import {
  type DecisionResolutionStatus,
  type RecordedDecisionExecution,
  type ResolvedDecisionAnalysis,
} from "./decision-resolver-analysis";
import { createDecisionExecutionRecorder, type DecisionExecutionRecorder } from "./decision-resolver-recorder";
import {
  createDecisionResolverValidator,
  validateLoadedAnalysis,
  type DecisionResolverValidator,
} from "./decision-resolver-validator";
import { createPriorityRuleSet } from "./priority-rule-set";
import { createQualityRuleSet } from "./quality-rule-set";
import { createReadinessRuleSet } from "./readiness-rule-set";

export const DECISION_PIPELINE_STAGES = [
  "RESOLVE_CANDIDATE",
  "LOAD_OPPORTUNITY_ANALYSIS",
  "LOAD_TRAFFIC_ANALYSIS",
  "LOAD_LANDING_PAGE_ANALYSIS",
  "EXECUTE_DECISION_DIMENSIONS",
  "VALIDATE_RESULTS",
  "RESOLVE_CONFLICTS",
  "BUILD_ANALYSIS",
] as const;
export type DecisionPipelineStage = (typeof DECISION_PIPELINE_STAGES)[number];

export const DECISION_DIMENSIONS = ["READINESS", "QUALITY", "PRIORITY", "ACTION"] as const;
export type DecisionDimension = (typeof DECISION_DIMENSIONS)[number];

export const STAGE_STATUSES = ["PASSED", "FAILED", "SKIPPED"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface StageOutcome {
  stage: DecisionPipelineStage;
  status: StageStatus;
  note: string | null;
}

export interface DecisionDimensionSource {
  category: DecisionDimension;
  pipeline: DecisionRulePipeline;
}

export interface DecisionConflictBasis {
  refusals: readonly string[];
  runError: string | null;
  results: readonly DecisionRuleRunResult[];
  conflictingRules: readonly string[];
  circular: boolean;
}

export interface DecisionConflictResolution {
  outcome: DecisionResolutionStatus;
  blockingRules: string[];
  conflictingRules: string[];
  missingEvidence: string[];
  skippedRules: string[];
  warnings: string[];
}

export interface DecisionRun {
  analysis: ResolvedDecisionAnalysis;
  resolution: DecisionConflictResolution;
  stages: StageOutcome[];
  executions: RecordedDecisionExecution[];
}

export interface DecisionPipelineOptions {
  dimensions?: DecisionDimensionSource[];
  recorder?: DecisionExecutionRecorder;
  validator?: DecisionResolverValidator;
  now?: () => number;
  timestamp?: () => string;
  idFactory?: () => string;
}

export interface DecisionPipeline {
  readonly dimensions: readonly DecisionDimensionSource[];
  run(context: DecisionRuleContext): Promise<DecisionRun>;
}

const describe = (issues: readonly DecisionIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const isScalar = (value: unknown): value is string | number | boolean | null =>
  value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const unique = (ids: readonly string[]) => [...new Set(ids)];

function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlain(inner)])) as T;
  }
  return value;
}

function reportsMissingEvidence(result: DecisionRuleRunResult): boolean {
  const text = [...result.warnings, ...result.errors, String(result.metadata.missing ?? "")].join(" ");
  return /missing evidence/i.test(text) || (result.ruleId === "required-evidence-present" && result.status === "FAIL");
}

/** Deterministic resolution. First matching case wins. There is no voting. */
export function resolveDecisionConflicts(basis: DecisionConflictBasis): DecisionConflictResolution {
  const blockingRules = unique(basis.results.filter((result) => result.status === "FAIL").map((result) => result.ruleId));
  const skippedRules = unique(basis.results.filter((result) => result.status === "SKIPPED").map((result) => result.ruleId));
  const warnings = unique(basis.results.filter((result) => result.status === "WARNING").flatMap((result) => result.warnings));
  const missingEvidence = unique(basis.results.filter(reportsMissingEvidence).map((result) => result.ruleId));
  const conflictingRules = unique(basis.conflictingRules);
  const lists = { blockingRules, conflictingRules, missingEvidence, skippedRules, warnings };
  if (basis.refusals.length > 0 || basis.runError !== null || basis.circular) {
    return { outcome: "REFUSED", ...lists };
  }
  if (conflictingRules.length > 0) return { outcome: "CONFLICT", ...lists };
  if (blockingRules.length > 0) return { outcome: "BLOCKED", ...lists };
  if (missingEvidence.length > 0) return { outcome: "INCOMPLETE", ...lists };
  if (basis.results.some((result) => result.status === "WARNING")) return { outcome: "WARNING", ...lists };
  return { outcome: "CLEARED", ...lists };
}

function defaultDimensions(now: () => number): DecisionDimensionSource[] {
  return [
    { category: "READINESS", pipeline: createReadinessRuleSet({ now }).pipeline },
    { category: "QUALITY", pipeline: createQualityRuleSet({ now }).pipeline },
    { category: "PRIORITY", pipeline: createPriorityRuleSet({ now }).pipeline },
    { category: "ACTION", pipeline: createActionRuleSet({ now }).pipeline },
  ];
}

export function createDecisionPipeline(options: DecisionPipelineOptions = {}): DecisionPipeline {
  const validator = options.validator ?? createDecisionResolverValidator();
  const now = options.now ?? (() => 0);
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  const dimensions = options.dimensions ?? defaultDimensions(now);
  let running = false;

  return {
    dimensions,
    async run(context) {
      if (running) {
        const startedAt = timestamp();
        const analysis = freezeDeepDecisionRule(
          emptyAnalysis({
            analysisId: idFactory(),
            candidateId: context?.candidate?.id ?? null,
            startedAt,
            completedAt: timestamp(),
            errors: ["A pipeline run is already in progress."],
            opportunityAnalysisId: context?.opportunityAnalysis?.id ?? null,
            trafficAnalysisId: context?.trafficAnalysis?.id ?? null,
            pageAnalysisId: context?.pageAnalysis?.id ?? null,
          }),
        );
        return {
          analysis,
          resolution: resolveDecisionConflicts({
            refusals: [],
            runError: "A pipeline run is already in progress.",
            results: [],
            conflictingRules: [],
            circular: false,
          }),
          stages: DECISION_PIPELINE_STAGES.map((stage, index) => ({
            stage,
            status: index === 0 ? "FAILED" : index === DECISION_PIPELINE_STAGES.length - 1 ? "PASSED" : "SKIPPED",
            note: index === 0 ? "A pipeline run is already in progress." : null,
          })),
          executions: [],
        };
      }

      running = true;
      const started = now();
      const startedAt = timestamp();
      const analysisId = idFactory();
      const recorder = options.recorder ?? createDecisionExecutionRecorder();

      const stages: StageOutcome[] = [];
      const extraWarnings: string[] = [];
      const refusals: string[] = [];
      let runError: string | null = null;
      let circular = false;
      const conflictingRules: string[] = [];
      const metadata: DecisionMetadata = {};
      const record = (stage: DecisionPipelineStage, status: StageStatus, note: string | null = null) =>
        stages.push({ stage, status, note });
      const open = () => refusals.length === 0 && runError === null && !circular;

      try {
        recorder.drain();

        const registryIssues =
          dimensions.length === 0
            ? [{ field: "registry", message: "Missing Rule Registry: a decision rule registry is required." }]
            : dimensions.flatMap((dimension) => validator.validateRuleRegistry(dimension.pipeline.registry));
        const inputIssues = [...validator.validateInput(context), ...registryIssues];
        if (inputIssues.length > 0) {
          refusals.push(...describe(inputIssues));
          record("RESOLVE_CANDIDATE", "FAILED", `${inputIssues.length} problem(s) with the inputs.`);
        } else {
          record("RESOLVE_CANDIDATE", "PASSED");
        }

        loadStage(
          "LOAD_OPPORTUNITY_ANALYSIS",
          open,
          record,
          refusals,
          validateLoadedAnalysis(context.opportunityAnalysis, "opportunityAnalysis", "an Opportunity analysis"),
          context.opportunityAnalysis === null ? "none supplied." : null,
          "Opportunity analysis",
        );
        loadStage(
          "LOAD_TRAFFIC_ANALYSIS",
          open,
          record,
          refusals,
          validateLoadedAnalysis(context.trafficAnalysis, "trafficAnalysis", "a Traffic analysis"),
          context.trafficAnalysis === null ? "none supplied." : null,
          "Traffic analysis",
        );
        loadStage(
          "LOAD_LANDING_PAGE_ANALYSIS",
          open,
          record,
          refusals,
          validateLoadedAnalysis(context.pageAnalysis, "pageAnalysis", "a page analysis"),
          context.pageAnalysis === null ? "none supplied." : null,
          "page analysis",
        );

        const executedDimensions: DecisionDimension[] = [];
        const rawResults: DecisionRuleRunResult[] = [];
        if (!open()) {
          record("EXECUTE_DECISION_DIMENSIONS", "SKIPPED", "The inputs were refused.");
        } else {
          for (const dimension of dimensions) {
            const depIssues = validator.validateDependencies(dimension.pipeline.registry.list());
            if (depIssues.some((issue) => /Circular/.test(issue.message))) {
              circular = true;
              refusals.push(...describe(depIssues));
              break;
            }
            const conflictIssues = depIssues.filter((issue) => /conflicts with/.test(issue.message));
            const otherDepIssues = depIssues.filter((issue) => !/conflicts with/.test(issue.message));
            for (const issue of conflictIssues) {
              const match = issue.message.match(/Rule "([^"]+)" conflicts with "([^"]+)"/);
              if (match) conflictingRules.push(match[1], match[2]);
            }
            if (conflictIssues.length > 0) break;
            if (otherDepIssues.length > 0) {
              refusals.push(...describe(otherDepIssues));
              break;
            }
            try {
              const report = await dimension.pipeline.run(context);
              executedDimensions.push(dimension.category);
              for (const result of report.results) {
                recorder.record(result, dimension.category);
                rawResults.push(result);
              }
            } catch (error) {
              runError = reason(error);
              break;
            }
          }
          if (circular) {
            record("EXECUTE_DECISION_DIMENSIONS", "FAILED", "Circular Dependencies.");
          } else if (conflictingRules.length > 0 && executedDimensions.length === 0) {
            record("EXECUTE_DECISION_DIMENSIONS", "FAILED", "Conflicting rules.");
          } else if (runError !== null) {
            record("EXECUTE_DECISION_DIMENSIONS", "FAILED", runError);
          } else if (refusals.length > 0 && executedDimensions.length === 0) {
            record("EXECUTE_DECISION_DIMENSIONS", "FAILED", `${refusals.length} problem(s) with rule dependencies.`);
          } else {
            record("EXECUTE_DECISION_DIMENSIONS", "PASSED", executedDimensions.join(", "));
          }
        }

        const executions = recorder.drain();
        let valid: DecisionRuleRunResult[] = [];
        if (executedDimensions.length === 0) {
          record("VALIDATE_RESULTS", "SKIPPED", "No dimension ran.");
        } else {
          const checked = validator.checkRuleResults(rawResults);
          valid = checked.valid;
          const repeats = recorderRepeatsFrom(executions);
          const rejectedCount = checked.rejected.length + repeats.length;
          for (const issue of checked.issues) refusals.push(`results: ${issue.message}`);
          for (const id of repeats) refusals.push(`results: ${id}: Invalid rule result: the rule ran more than once.`);
          record("VALIDATE_RESULTS", rejectedCount === 0 ? "PASSED" : "FAILED", rejectedCount === 0 ? null : `${rejectedCount} rule result(s) rejected.`);
        }

        const resolution = resolveDecisionConflicts({
          refusals,
          runError,
          results: valid,
          conflictingRules,
          circular,
        });
        record("RESOLVE_CONFLICTS", "PASSED", resolution.outcome);
        record("BUILD_ANALYSIS", "PASSED");

        const executedRules = unique(valid.filter((result) => result.status !== "SKIPPED").map((result) => result.ruleId));
        const rejectedIds = unique(
          (executedDimensions.length === 0 ? [] : validator.checkRuleResults(rawResults).rejected)
            .map((item) => item.ruleId)
            .filter((id) => id !== "results"),
        );
        const failed = unique([
          ...valid.filter((result) => result.status === "FAIL").map((result) => result.ruleId),
          ...rejectedIds.filter((id) => executedRules.includes(id)),
        ]);

        for (const stage of DECISION_PIPELINE_STAGES) {
          const outcome = stages.find((entry) => entry.stage === stage);
          metadata[`stage.${stage}`] = outcome?.status ?? "SKIPPED";
        }
        for (const dimension of DECISION_DIMENSIONS) {
          metadata[`dimension.${dimension}`] = executedDimensions.includes(dimension);
        }
        metadata.resolution = resolution.outcome;
        metadata.registeredCount = dimensions.reduce((sum, dimension) => sum + dimension.pipeline.registry.list().length, 0);
        metadata.enabledCount = dimensions.reduce((sum, dimension) => sum + dimension.pipeline.registry.list({ enabled: true }).length, 0);
        metadata.executedCount = executedRules.length;
        metadata.failedCount = failed.length;
        metadata.skippedCount = resolution.skippedRules.length;
        if (typeof context?.candidate?.source === "string") metadata.candidateSource = context.candidate.source;
        for (const [key, value] of Object.entries(context?.executionMetadata ?? {})) if (isScalar(value)) metadata[`execution.${key}`] = value;
        for (const [key, value] of Object.entries(context?.runtimeMetadata ?? {})) if (isScalar(value)) metadata[`runtime.${key}`] = value;
        metadata.configurationKeys = Object.keys(context?.configuration ?? {}).length;
        for (const result of valid) {
          metadata[`rule.${result.ruleId}.status`] = result.status;
          metadata[`rule.${result.ruleId}.executionTime`] = result.executionTime;
        }

        const pipelineMetadata: DecisionMetadata = {};
        for (const [key, value] of Object.entries(metadata)) {
          if (!key.startsWith("execution.") && !key.startsWith("runtime.") && !key.startsWith("rule.")) pipelineMetadata[key] = value;
        }
        const executionMetadata: DecisionMetadata = {};
        for (const [key, value] of Object.entries(context?.executionMetadata ?? {})) if (isScalar(value)) executionMetadata[key] = value;

        const status: DecisionStatus = resolution.outcome === "REFUSED" || runError !== null ? "FAILED" : "COMPLETED";
        let analysis: ResolvedDecisionAnalysis = {
          analysisId,
          candidateId: context?.candidate?.id ?? null,
          status,
          decisionStatus: resolution.outcome,
          executedDimensions,
          executedRules,
          failedRules: failed,
          warnings: unique([...extraWarnings, ...resolution.warnings, ...valid.flatMap((result) => result.warnings)]),
          errors: unique([...refusals, ...(runError === null ? [] : [runError]), ...valid.flatMap((result) => result.errors)]),
          metadata,
          executionTime: Math.max(0, now() - started),
          startedAt,
          completedAt: timestamp(),
          opportunityAnalysisId: context?.opportunityAnalysis?.id ?? null,
          trafficAnalysisId: context?.trafficAnalysis?.id ?? null,
          pageAnalysisId: context?.pageAnalysis?.id ?? null,
          ruleResults: freezeDeepDecisionRule(copyPlain(valid)),
          recordedExecutions: freezeDeepDecisionRule(copyPlain(executions)),
          executionMetadata,
          pipelineMetadata,
          blockingRules: resolution.blockingRules,
          conflictingRules: resolution.conflictingRules,
          missingEvidence: resolution.missingEvidence,
          skippedRules: resolution.skippedRules,
        };
        const selfCheck = validator.validateAnalysis(analysis);
        if (selfCheck.length > 0) {
          analysis = {
            ...analysis,
            status: "FAILED",
            decisionStatus: "REFUSED",
            errors: [...analysis.errors, ...describe(selfCheck).map((line) => `Invalid analysis: ${line}`)],
          };
        }
        return {
          analysis: freezeDeepDecisionRule(analysis),
          resolution: freezeDeepDecisionRule(resolution),
          stages,
          executions,
        };
      } finally {
        running = false;
      }
    },
  };
}

function loadStage(
  stage: "LOAD_OPPORTUNITY_ANALYSIS" | "LOAD_TRAFFIC_ANALYSIS" | "LOAD_LANDING_PAGE_ANALYSIS",
  open: () => boolean,
  record: (stage: DecisionPipelineStage, status: StageStatus, note: string | null) => void,
  refusals: string[],
  issues: DecisionIssue[],
  emptyNote: string | null,
  label: string,
): void {
  if (!open()) {
    record(stage, "SKIPPED", "The inputs were refused.");
    return;
  }
  if (issues.length > 0) {
    refusals.push(...describe(issues));
    record(stage, "FAILED", `${issues.length} problem(s) with the ${label}.`);
    return;
  }
  record(stage, "PASSED", emptyNote);
}

function recorderRepeatsFrom(executions: readonly RecordedDecisionExecution[]): string[] {
  const seen = new Set<string>();
  const repeats: string[] = [];
  for (const entry of executions) {
    if (seen.has(entry.ruleId)) repeats.push(entry.ruleId);
    else seen.add(entry.ruleId);
  }
  return unique(repeats);
}

function emptyAnalysis(
  over: Partial<ResolvedDecisionAnalysis> & Pick<ResolvedDecisionAnalysis, "analysisId" | "startedAt" | "completedAt">,
): ResolvedDecisionAnalysis {
  return {
    candidateId: null,
    status: "FAILED",
    decisionStatus: "REFUSED",
    executedDimensions: [],
    executedRules: [],
    failedRules: [],
    warnings: [],
    errors: [],
    metadata: {},
    executionTime: 0,
    opportunityAnalysisId: null,
    trafficAnalysisId: null,
    pageAnalysisId: null,
    ruleResults: [],
    recordedExecutions: [],
    executionMetadata: {},
    pipelineMetadata: {},
    blockingRules: [],
    conflictingRules: [],
    missingEvidence: [],
    skippedRules: [],
    ...over,
  };
}

export function normalizeDecisionResolverInput(input: DecisionRuleContext | DecisionRuleContextInit | null | undefined): DecisionRuleContext {
  return createDecisionRuleContext((input ?? {}) as DecisionRuleContextInit);
}
