/**
 * Traffic Resolver: the pipeline.
 *
 * Runs the six stages of an analysis in order:
 *
 *   RESOLVE_CANDIDATE              the candidate, the signal registry, and all
 *                                  metadata are present and valid
 *   RESOLVE_OPPORTUNITY_ANALYSIS   the Opportunity analysis is present, usable,
 *                                  and belongs to the same candidate
 *   RESOLVE_TRAFFIC_SIGNALS        the execution plan is built and the signals run
 *   VALIDATE_RESULTS               every result is checked against the Signal Contract
 *   AGGREGATE_RESULTS              the results are gathered, uninterpreted
 *   BUILD_ANALYSIS                 the decision is made and the analysis assembled
 *
 * It consumes only the Signal Contract: it runs whatever the signal pipeline
 * holds and never names, imports, or special-cases a signal. A stage that
 * cannot proceed marks the stages after it SKIPPED. It always returns an
 * analysis and never throws: a refusal is an analysis with status REFUSED.
 *
 * It scores nothing, ranks nothing, recommends nothing, and persists nothing.
 * It makes no HTTP request and no AI call, and it never changes the registry:
 * signals are not registered, enabled, or disabled to make a run succeed.
 *
 * The wall clock and the id generator are the only sources of time and
 * uniqueness in the resolver, and both are injectable options. Their defaults
 * are the three lines that read `options.now`, `options.timestamp`, and
 * `options.idFactory` below.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficMetadata } from "./traffic-types";
import type { TrafficSignalPipeline } from "./traffic-signal-pipeline";
import type { TrafficSignalResult } from "./traffic-signal-contract";
import { freezeDeepTraffic } from "./traffic-signal-context";
import { aggregateTrafficSignalResults, type TrafficAggregate } from "./traffic-resolver-aggregate";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import { cloneFrozenTraffic, toTrafficSignalContext, type TrafficExecutionContext } from "./traffic-resolver-context";
import { TRAFFIC_DECISION_SCOPE_NOTE, decideTraffic, type TrafficDecision } from "./traffic-resolver-decision";
import {
  TRAFFIC_PIPELINE_STAGES,
  buildTrafficExecutionPlan,
  type TrafficExecutionPlan,
  type TrafficPipelineStage,
} from "./traffic-resolver-plan";
import { createTrafficExecutionRecorder, type RecordedTrafficExecution, type TrafficExecutionRecorder } from "./traffic-resolver-recorder";
import { createTrafficValidator, type TrafficResolverValidator } from "./traffic-resolver-validator";

export const STAGE_STATUSES = ["PASSED", "FAILED", "SKIPPED"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface StageOutcome {
  stage: TrafficPipelineStage;
  status: StageStatus;
  note: string | null;
}

/** Everything a run produced. The analysis is the part that is handed on. */
export interface TrafficRun {
  analysis: ResolvedTrafficAnalysis;
  decision: TrafficDecision;
  /** Null when the run was refused before any result existed. */
  aggregate: TrafficAggregate | null;
  /** Null when the run was refused before a plan could be built. */
  plan: TrafficExecutionPlan | null;
  stages: StageOutcome[];
  /** One entry per enabled signal the pipeline returned, in the order they were heard. */
  executions: RecordedTrafficExecution[];
}

export interface TrafficPipelineOptions {
  /** The signals to run: a Traffic Signal Framework pipeline, with its registry. */
  signals: TrafficSignalPipeline;
  recorder?: TrafficExecutionRecorder;
  validator?: TrafficResolverValidator;
  /** Milliseconds clock for executionTime. */
  now?: () => number;
  /** ISO timestamp source for startedAt and completedAt. */
  timestamp?: () => string;
  /** Source of analysis ids. */
  idFactory?: () => string;
}

export interface TrafficPipeline {
  run(context: TrafficExecutionContext): Promise<TrafficRun>;
}

const describe = (issues: readonly TrafficIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const isScalar = (value: unknown): value is string | number | boolean | null =>
  value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createTrafficPipeline(options: TrafficPipelineOptions): TrafficPipeline {
  const validator = options.validator ?? createTrafficValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  let running = false;

  return {
    async run(context) {
      if (running) {
        const startedAt = timestamp();
        return {
          analysis: freezeDeepTraffic({
            analysisId: idFactory(),
            candidateId: context?.candidate?.id ?? null,
            status: "FAILED",
            startedAt,
            completedAt: timestamp(),
            registeredSignals: [],
            executedSignals: [],
            failedSignals: [],
            signalResults: [],
            warnings: [],
            errors: ["A pipeline run is already in progress."],
            metadata: {},
            executionTime: 0,
            resolvedSignals: [],
            executionOrder: [],
            executionMetadata: {},
            pipelineMetadata: {},
            opportunityAnalysisId: context?.opportunityAnalysis?.analysisId ?? null,
          }),
          decision: decideTraffic({ refusals: [], runError: "A pipeline run is already in progress.", enabled: 0, completed: 0, failed: 0, skipped: 0 }),
          aggregate: null,
          plan: null,
          stages: TRAFFIC_PIPELINE_STAGES.map((stage, index) => ({ stage, status: index === 0 ? "FAILED" : index === 5 ? "PASSED" : "SKIPPED", note: index === 0 ? "A pipeline run is already in progress." : null })),
          executions: [],
        } as TrafficRun;
      }

      running = true;
      const started = now();
      const startedAt = timestamp();
      const analysisId = idFactory();
      const recorder = options.recorder ?? createTrafficExecutionRecorder();

      const stages: StageOutcome[] = [];
      const warnings: string[] = [];
      const refusals: string[] = [];
      let runError: string | null = null;
      let plan: TrafficExecutionPlan | null = null;
      let aggregate: TrafficAggregate | null = null;
      let executions: RecordedTrafficExecution[] = [];
      const metadata: TrafficMetadata = {};
      const record = (stage: TrafficPipelineStage, status: StageStatus, note: string | null = null) => stages.push({ stage, status, note });
      const open = () => refusals.length === 0 && runError === null;

      try {
        // 1. Resolve candidate
        const sourceIssues = validator.validateSignalSource(options.signals);
        const inputIssues = [...validator.validateInput(context), ...sourceIssues];
        if (inputIssues.length > 0) {
          refusals.push(...describe(inputIssues));
          record("RESOLVE_CANDIDATE", "FAILED", `${inputIssues.length} problem(s) with the inputs.`);
        } else {
          record("RESOLVE_CANDIDATE", "PASSED");
        }

        // 2. Resolve Opportunity analysis
        if (!open()) {
          record("RESOLVE_OPPORTUNITY_ANALYSIS", "SKIPPED", "The inputs were refused.");
        } else {
          const opportunityIssues = validator.validateOpportunityAnalysis(context);
          if (opportunityIssues.length > 0) {
            refusals.push(...describe(opportunityIssues));
            record("RESOLVE_OPPORTUNITY_ANALYSIS", "FAILED", `${opportunityIssues.length} problem(s) with the Opportunity analysis.`);
          } else {
            record("RESOLVE_OPPORTUNITY_ANALYSIS", "PASSED");
          }
        }

        // 3. Resolve traffic signals
        let rawResults: unknown = [];
        let ran = false;
        if (!open()) {
          record("RESOLVE_TRAFFIC_SIGNALS", "SKIPPED", "The inputs were refused.");
        } else {
          plan = buildTrafficExecutionPlan(options.signals.registry.list());
          const planIssues = validator.validatePlan(plan);
          if (planIssues.length > 0) {
            refusals.push(...describe(planIssues));
            record("RESOLVE_TRAFFIC_SIGNALS", "FAILED", `${planIssues.length} problem(s) with the execution plan.`);
          } else {
            recorder.drain();
            try {
              rawResults = (await options.signals.run(toTrafficSignalContext(context))).results;
              ran = true;
              record("RESOLVE_TRAFFIC_SIGNALS", "PASSED", `${plan.order.length} signal(s) run.`);
            } catch (error) {
              runError = reason(error);
              record("RESOLVE_TRAFFIC_SIGNALS", "FAILED", runError);
            }
            if (Array.isArray(rawResults)) {
              for (const item of rawResults) {
                try {
                  if (item && typeof item === "object" && "signalId" in item) recorder.record(item as TrafficSignalResult);
                } catch (error) {
                  warnings.push(`An execution could not be recorded: ${reason(error)}`);
                }
              }
            }
            executions = recorder.drain();
          }
        }

        // 4. Validate results
        let valid: TrafficSignalResult[] = [];
        let rejected: Array<{ signalId: string; errors: string[] }> = [];
        if (plan === null || !open()) {
          record("VALIDATE_RESULTS", "SKIPPED", "No signal ran.");
        } else {
          const checked = validator.checkSignalResults(rawResults, plan);
          valid = checked.valid;
          rejected = checked.rejected;
          record("VALIDATE_RESULTS", rejected.length === 0 && checked.issues.length === 0 ? "PASSED" : "FAILED", rejected.length === 0 ? null : `${rejected.length} signal result(s) rejected.`);
        }

        // 5. Aggregate results
        if (plan === null || !open()) {
          record("AGGREGATE_RESULTS", "SKIPPED", "No signal ran.");
        } else {
          aggregate = aggregateTrafficSignalResults(plan, valid, rejected);
          record("AGGREGATE_RESULTS", "PASSED");
        }

        // 6. Build the analysis
        const decision = decideTraffic({
          refusals,
          runError,
          enabled: plan?.order.length ?? 0,
          completed: aggregate?.availableSignals.length ?? 0,
          failed: aggregate?.failedSignals.length ?? 0,
          skipped: aggregate?.skippedSignals.length ?? 0,
        });
        record("BUILD_ANALYSIS", "PASSED");

        const described = plan !== null ? plan.signals : sourceIssues.length === 0 ? buildTrafficExecutionPlan(options.signals.registry.list()).signals : [];
        const resolvedSignals = described.filter((signal, index) => described.findIndex((other) => other.signalId === signal.signalId) === index);
        const registered = resolvedSignals.map((signal) => signal.signalId);

        for (const stage of TRAFFIC_PIPELINE_STAGES) {
          const outcome = stages.find((entry) => entry.stage === stage);
          metadata[`stage.${stage}`] = outcome?.status ?? "SKIPPED";
        }
        metadata.decision = decision.reasons.join(" ");
        metadata.decisionNote = TRAFFIC_DECISION_SCOPE_NOTE;
        metadata.registeredCount = registered.length;
        metadata.enabledCount = decision.enabledCount;
        if (typeof context?.candidate?.source === "string") metadata.candidateSource = context.candidate.source;
        if (typeof context?.opportunityAnalysis?.analysisId === "string") metadata.opportunityAnalysisId = context.opportunityAnalysis.analysisId;
        if (typeof context?.opportunityAnalysis?.status === "string") metadata.opportunityStatus = context.opportunityAnalysis.status;
        for (const [key, value] of Object.entries(context?.executionMetadata ?? {})) if (isScalar(value)) metadata[`execution.${key}`] = value;
        for (const [key, value] of Object.entries(context?.runtimeMetadata ?? {})) if (isScalar(value)) metadata[`runtime.${key}`] = value;
        metadata.configurationKeys = Object.keys(context?.configuration ?? {}).length;
        const pipelineMetadata: TrafficMetadata = {};
        for (const [key, value] of Object.entries(metadata)) if (!key.startsWith("execution.") && !key.startsWith("runtime.")) pipelineMetadata[key] = value;
        const executionMetadata: TrafficMetadata = {};
        for (const [key, value] of Object.entries(context?.executionMetadata ?? {})) if (isScalar(value)) executionMetadata[key] = value;
        if (aggregate !== null) Object.assign(metadata, aggregate.metadata);

        const seenExecutions = new Map<string, number>();
        for (const entry of executions) seenExecutions.set(entry.signalId, (seenExecutions.get(entry.signalId) ?? 0) + 1);
        for (const [id, count] of seenExecutions) {
          if (count > 1) warnings.push(`Signal "${id}" was recorded ${count} times; each enabled signal must run exactly once.`);
        }

        let analysis: ResolvedTrafficAnalysis = {
          analysisId,
          candidateId: context?.candidate?.id ?? null,
          status: decision.status,
          startedAt,
          completedAt: timestamp(),
          registeredSignals: registered,
          executedSignals: aggregate?.executedSignals ?? [],
          failedSignals: aggregate?.failedSignals ?? [],
          signalResults: cloneFrozenTraffic(valid),
          warnings: [...warnings, ...(aggregate?.warnings ?? [])],
          errors: [...refusals, ...(runError === null ? [] : [runError]), ...(aggregate?.errors ?? [])],
          metadata,
          executionTime: Math.max(0, now() - started),
          resolvedSignals: cloneFrozenTraffic(resolvedSignals),
          executionOrder: ran && plan !== null ? [...plan.order] : [],
          executionMetadata,
          pipelineMetadata,
          opportunityAnalysisId: context?.opportunityAnalysis?.analysisId ?? null,
        };
        const selfCheck = validator.validateAnalysis(analysis);
        if (selfCheck.length > 0) {
          analysis = { ...analysis, status: "FAILED", errors: [...analysis.errors, ...describe(selfCheck).map((line) => `Invalid analysis: ${line}`)] };
        }
        return { analysis: freezeDeepTraffic(analysis), decision: freezeDeepTraffic(decision), aggregate, plan, stages, executions };
      } finally {
        running = false;
      }
    },
  };
}
