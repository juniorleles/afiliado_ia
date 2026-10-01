/**
 * Opportunity Resolver: the pipeline.
 *
 * Runs the six stages of an analysis in order:
 *
 *   RESOLVE_CANDIDATE          the candidate, the Evidence Context, the signal
 *                              registry, and all metadata are present and valid
 *   RESOLVE_EVIDENCE_PROVIDERS the providers that apply to the Evidence Context
 *                              are listed and checked; nothing is collected
 *   RESOLVE_SIGNALS            the execution plan is built and the signals run
 *   VALIDATE_RESULTS           every result is checked against the Signal Contract
 *   AGGREGATE_RESULTS          the results are gathered, uninterpreted
 *   BUILD_ANALYSIS             the decision is made and the analysis assembled
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
import { freezeDeep } from "./opportunity-signal-context";
import type { SignalPipeline } from "./opportunity-signal-pipeline";
import type { SignalResult } from "./opportunity-signal-contract";
import type { OpportunityIssue } from "./opportunity-validator";
import type { OpportunityMetadata } from "./opportunity-types";
import { EVIDENCE_KINDS } from "./providers/evidence-provider-contract";
import type { EvidenceResolver } from "./providers/evidence-provider-resolver";
import { aggregateSignalResults, type OpportunityAggregate } from "./opportunity-resolver-aggregate";
import type { ResolvedOpportunityAnalysis } from "./opportunity-resolver-analysis";
import { toSignalContext, type OpportunityExecutionContext } from "./opportunity-resolver-context";
import { DECISION_SCOPE_NOTE, decideOpportunity, type OpportunityDecision } from "./opportunity-resolver-decision";
import {
  OPPORTUNITY_PIPELINE_STAGES,
  buildExecutionPlan,
  type OpportunityExecutionPlan,
  type OpportunityPipelineStage,
} from "./opportunity-resolver-plan";
import { createOpportunityValidator, type OpportunityResolverValidator } from "./opportunity-resolver-validator";
import type { EvidenceRecorder } from "./opportunity-resolver-recorder";
import { cloneFrozenData } from "./providers/evidence-provider-context";
import type { EvidenceCollectionResult } from "./providers/evidence-provider-contract";

export const STAGE_STATUSES = ["PASSED", "FAILED", "SKIPPED"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface StageOutcome {
  stage: OpportunityPipelineStage;
  status: StageStatus;
  note: string | null;
}

/** Everything a run produced. The analysis is the part that is handed on. */
export interface OpportunityRun {
  analysis: ResolvedOpportunityAnalysis;
  decision: OpportunityDecision;
  /** Null when the run was refused before any result existed. */
  aggregate: OpportunityAggregate | null;
  /** Null when the run was refused before a plan could be built. */
  plan: OpportunityExecutionPlan | null;
  stages: StageOutcome[];
}

export interface OpportunityPipelineOptions {
  /** The signals to run: a Signal Framework pipeline, with its registry. */
  signals: SignalPipeline;
  /** When given, its providers are listed and checked against the Evidence Context. Nothing is collected. */
  evidenceResolver?: EvidenceResolver;
  /**
   * When given, what the providers return while the signals run is kept in the
   * analysis snapshot. The recorder must listen to the Evidence Resolver the
   * signals use; the pipeline never collects evidence itself.
   */
  evidenceRecorder?: EvidenceRecorder;
  validator?: OpportunityResolverValidator;
  /** Milliseconds clock for executionTime. */
  now?: () => number;
  /** ISO timestamp source for startedAt and completedAt. */
  timestamp?: () => string;
  /** Source of analysis ids. */
  idFactory?: () => string;
}

export interface OpportunityPipeline {
  run(context: OpportunityExecutionContext): Promise<OpportunityRun>;
}

const describe = (issues: readonly OpportunityIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const isScalar = (value: unknown): value is string | number | boolean | null =>
  value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createOpportunityPipeline(options: OpportunityPipelineOptions): OpportunityPipeline {
  const validator = options.validator ?? createOpportunityValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());

  return {
    async run(context) {
      const started = now();
      const startedAt = timestamp();
      const analysisId = idFactory();

      const stages: StageOutcome[] = [];
      const warnings: string[] = [];
      const refusals: string[] = [];
      let runError: string | null = null;
      let plan: OpportunityExecutionPlan | null = null;
      let aggregate: OpportunityAggregate | null = null;
      const metadata: OpportunityMetadata = {};
      const record = (stage: OpportunityPipelineStage, status: StageStatus, note: string | null = null) => stages.push({ stage, status, note });
      const open = () => refusals.length === 0 && runError === null;

      // 1. Resolve candidate
      const sourceIssues = validator.validateSignalSource(options.signals);
      const inputIssues = [...validator.validateInput(context), ...sourceIssues];
      if (inputIssues.length > 0) {
        refusals.push(...describe(inputIssues));
        record("RESOLVE_CANDIDATE", "FAILED", `${inputIssues.length} problem(s) with the inputs.`);
      } else {
        record("RESOLVE_CANDIDATE", "PASSED");
      }

      // 2. Resolve evidence providers
      if (!open()) {
        record("RESOLVE_EVIDENCE_PROVIDERS", "SKIPPED", "The inputs were refused.");
      } else if (options.evidenceResolver === undefined) {
        metadata.evidenceProvidersInspected = false;
        record("RESOLVE_EVIDENCE_PROVIDERS", "SKIPPED", "No evidence resolver was supplied.");
      } else {
        try {
          const evidenceContext = context.evidenceContext as NonNullable<OpportunityExecutionContext["evidenceContext"]>;
          const resolution = options.evidenceResolver.resolveProviders(evidenceContext);
          for (const kind of EVIDENCE_KINDS) {
            metadata[`evidence.providers.${kind}`] = resolution.providers.filter((entry) => entry.provider.kind === kind).length;
          }
          metadata.evidenceProvidersInspected = true;
          metadata.evidenceProvidersApplicable = resolution.providers.length;
          metadata.evidenceProvidersUnsupported = resolution.unsupported.length;
          for (const issue of options.evidenceResolver.validateProviders(evidenceContext)) {
            warnings.push(`Evidence provider problem, ${issue.field}: ${issue.message}`);
          }
          record("RESOLVE_EVIDENCE_PROVIDERS", "PASSED");
        } catch (error) {
          // Providers that cannot be inspected do not stop the signals: each signal checks what it needs.
          metadata.evidenceProvidersInspected = false;
          warnings.push(`Evidence providers could not be inspected: ${reason(error)}`);
          record("RESOLVE_EVIDENCE_PROVIDERS", "FAILED", reason(error));
        }
      }

      // 3. Resolve signals
      let rawResults: unknown = [];
      let ran = false;
      let providerResults: EvidenceCollectionResult[] = [];
      if (!open()) {
        record("RESOLVE_SIGNALS", "SKIPPED", "The inputs were refused.");
      } else {
        plan = buildExecutionPlan(options.signals.registry.list());
        const planIssues = validator.validatePlan(plan);
        if (planIssues.length > 0) {
          refusals.push(...describe(planIssues));
          record("RESOLVE_SIGNALS", "FAILED", `${planIssues.length} problem(s) with the execution plan.`);
        } else {
          // What providers returned before this run is not part of it.
          options.evidenceRecorder?.drain();
          try {
            rawResults = (await options.signals.run(toSignalContext(context))).results;
            ran = true;
            record("RESOLVE_SIGNALS", "PASSED", `${plan.order.length} signal(s) run.`);
          } catch (error) {
            runError = reason(error);
            record("RESOLVE_SIGNALS", "FAILED", runError);
          }
          providerResults = options.evidenceRecorder?.drain() ?? [];
        }
      }

      // 4. Validate results
      let valid: SignalResult[] = [];
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
        aggregate = aggregateSignalResults(plan, valid, rejected);
        record("AGGREGATE_RESULTS", "PASSED");
      }

      // 6. Build the analysis
      const decision = decideOpportunity({
        refusals,
        runError,
        enabled: plan?.order.length ?? 0,
        completed: aggregate?.availableSignals.length ?? 0,
        failed: aggregate?.failedSignals.length ?? 0,
        skipped: aggregate?.skippedSignals.length ?? 0,
      });
      record("BUILD_ANALYSIS", "PASSED");

      // The signals as the registry holds them. A duplicate is reported as an error; the list itself stays free of repeats.
      const described = plan !== null ? plan.signals : sourceIssues.length === 0 ? buildExecutionPlan(options.signals.registry.list()).signals : [];
      const resolvedSignals = described.filter((signal, index) => described.findIndex((other) => other.signalId === signal.signalId) === index);
      const registered = resolvedSignals.map((signal) => signal.signalId);

      for (const stage of OPPORTUNITY_PIPELINE_STAGES) {
        const outcome = stages.find((entry) => entry.stage === stage);
        metadata[`stage.${stage}`] = outcome?.status ?? "SKIPPED";
      }
      metadata.decision = decision.reasons.join(" ");
      metadata.decisionNote = DECISION_SCOPE_NOTE;
      metadata.registeredCount = registered.length;
      metadata.enabledCount = decision.enabledCount;
      if (typeof context?.candidate?.source === "string") metadata.candidateSource = context.candidate.source;
      // Only scalar values are echoed; a malformed value is reported as a refusal, never copied.
      for (const [key, value] of Object.entries(context?.executionMetadata ?? {})) if (isScalar(value)) metadata[`execution.${key}`] = value;
      for (const [key, value] of Object.entries(context?.runtimeMetadata ?? {})) if (isScalar(value)) metadata[`runtime.${key}`] = value;
      metadata.configurationKeys = Object.keys(context?.configuration ?? {}).length;
      // What the pipeline recorded about itself, before the signals' own entries are added.
      const pipelineMetadata: OpportunityMetadata = {};
      for (const [key, value] of Object.entries(metadata)) if (!key.startsWith("execution.") && !key.startsWith("runtime.")) pipelineMetadata[key] = value;
      const executionMetadata: OpportunityMetadata = {};
      for (const [key, value] of Object.entries(context?.executionMetadata ?? {})) if (isScalar(value)) executionMetadata[key] = value;
      if (aggregate !== null) Object.assign(metadata, aggregate.metadata);

      let analysis: ResolvedOpportunityAnalysis = {
        analysisId,
        candidateId: context?.candidate?.id ?? null,
        startedAt,
        completedAt: timestamp(),
        status: decision.status,
        registeredSignals: registered,
        executedSignals: aggregate?.executedSignals ?? [],
        failedSignals: aggregate?.failedSignals ?? [],
        warnings: [...warnings, ...(aggregate?.warnings ?? [])],
        errors: [...refusals, ...(runError === null ? [] : [runError]), ...(aggregate?.errors ?? [])],
        metadata,
        executionTime: Math.max(0, now() - started),
        // The snapshot: copies, so nothing the pipeline or a signal still holds can change it.
        resolvedSignals: cloneFrozenData(resolvedSignals),
        executionOrder: ran && plan !== null ? [...plan.order] : [],
        signalResults: cloneFrozenData(valid),
        providerResults,
        executionMetadata,
        pipelineMetadata,
      };
      const selfCheck = validator.validateAnalysis(analysis);
      if (selfCheck.length > 0) {
        // The analysis the pipeline built is malformed: say so rather than hand it on as valid.
        analysis = { ...analysis, status: "FAILED", errors: [...analysis.errors, ...describe(selfCheck).map((line) => `Invalid analysis: ${line}`)] };
      }
      return { analysis: freezeDeep(analysis), decision: freezeDeep(decision), aggregate, plan, stages };
    },
  };
}
