/**
 * Competition Signal: the signal module.
 *
 * One independent signal for the Opportunity Signal Framework. It reports which
 * competition dimensions the available evidence covers. It depends on no other
 * signal, calculates no Opportunity Score, and makes no recommendation.
 *
 * Evidence reaches it only through the Evidence Provider Framework: the signal
 * asks an evidence resolver for RESEARCH evidence and nothing else. It never
 * asks for product facts, never reads a platform module, and makes no HTTP
 * request, no search, and no AI call.
 *
 * The signal context is flat and carries no nested data, so a context factory
 * turns it into the evidence context the providers need. The default factory
 * copies the candidate, imported metadata, runtime, configuration, and
 * extensions, and leaves resolved product data empty.
 *
 * A research provider that failed is not evidence that there is no
 * competition, so a failed collection yields a FAILED result instead of a
 * result with every dimension missing. An empty collection is a genuine "no
 * evidence" and yields a completed result.
 */
import type { OpportunitySignalModule, SignalEntry, SignalOutput } from "./opportunity-signal-contract";
import type { SignalContext } from "./opportunity-signal-context";
import type { OpportunityIssue } from "./opportunity-validator";
import { analyzeCompetition, type CompetitionClock } from "./competition-analyzer";
import { competitionResultToSignalOutput, COMPETITION_DIMENSIONS, type CompetitionDimension } from "./competition-result";
import {
  validateCompetitionContext,
  validateCompetitionDimensions,
  validateCompetitionInputs,
  validateCompetitionProviders,
  validateCompetitionResult,
} from "./competition-validator";
import { createEvidenceContext, type EvidenceContext } from "./providers/evidence-provider-context";
import type { EvidenceResolver } from "./providers/evidence-provider-resolver";

export const COMPETITION_SIGNAL_ID = "competition";
export const COMPETITION_SIGNAL_VERSION = "1.0.0";

/** Turns the flat signal context into the evidence context for the providers. */
export type CompetitionContextFactory = (context: SignalContext) => EvidenceContext;

export interface CompetitionSignalOptions {
  /** The evidence resolver, with its providers already registered. */
  resolver: EvidenceResolver;
  contextFactory?: CompetitionContextFactory;
  /** Dimensions to check. Defaults to all of them. */
  dimensions?: readonly CompetitionDimension[];
  /** Defaults to true. */
  enabled?: boolean;
  /** Defaults to 80. */
  priority?: number;
  /** Milliseconds clock for executionTime. */
  now?: CompetitionClock;
}

export const defaultCompetitionContextFactory: CompetitionContextFactory = (context) =>
  createEvidenceContext({
    candidate: context.candidate,
    metadata: { ...context.importedMetadata },
    runtime: { ...context.runtime },
    configuration: { ...context.configuration },
    extensions: { ...context.extensions },
  });

const describe = (issues: readonly OpportunityIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const failed = (errors: string[]): SignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors });

export function createCompetitionSignal(options: CompetitionSignalOptions): OpportunitySignalModule {
  const { resolver } = options;
  const factory = options.contextFactory ?? defaultCompetitionContextFactory;
  const dimensions = options.dimensions ?? COMPETITION_DIMENSIONS;

  /** Everything that must hold before a provider is asked for anything. */
  function preflight(context: SignalContext): { issues: OpportunityIssue[]; evidenceContext: EvidenceContext | null } {
    const issues = validateCompetitionDimensions(dimensions);
    let evidenceContext: EvidenceContext | null = null;
    let built = false;
    try {
      evidenceContext = factory(context);
      built = true;
    } catch (error) {
      issues.push({ field: "context", message: `Invalid evidence context: the context factory threw (${error instanceof Error ? error.message : String(error)}).` });
    }
    if (built) {
      const contextIssues = validateCompetitionContext(evidenceContext);
      issues.push(...contextIssues);
      if (contextIssues.length === 0 && evidenceContext !== null) {
        try {
          issues.push(...validateCompetitionProviders(resolver.resolveProviders(evidenceContext, { kind: "RESEARCH" }).providers.length));
        } catch (error) {
          issues.push({ field: "providers", message: `Providers could not be resolved (${error instanceof Error ? error.message : String(error)}).` });
        }
      }
    }
    return { issues, evidenceContext };
  }

  return {
    id: COMPETITION_SIGNAL_ID,
    name: "Competition",
    version: COMPETITION_SIGNAL_VERSION,
    category: "COMPETITION",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 80,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsCandidate: (context) => context.candidate !== null,

    validate: (context) => preflight(context).issues,

    async analyze(context): Promise<SignalOutput> {
      const { issues, evidenceContext } = preflight(context);
      if (issues.length > 0 || evidenceContext === null) return failed(describe(issues));

      const report = await resolver.run(evidenceContext, { kind: "RESEARCH" });
      const merged = report.merged;
      const research = merged.items.RESEARCH;
      if (research === undefined && merged.failed.length > 0 && merged.metadata.emptyCount === 0) {
        return failed(merged.failed.flatMap((entry) => entry.errors.map((error) => `provider ${entry.providerId}: ${error}`)));
      }

      const inputs = { candidate: evidenceContext.candidate as NonNullable<EvidenceContext["candidate"]>, evidence: merged, dimensions };
      const inputIssues = validateCompetitionInputs(inputs);
      if (inputIssues.length > 0) return failed(describe(inputIssues));

      const result = analyzeCompetition(inputs, options.now);
      const resultIssues = validateCompetitionResult(result);
      if (resultIssues.length > 0) return failed(describe(resultIssues));
      return competitionResultToSignalOutput(result);
    },
  };
}

/** Registers the Competition Signal in a signal registry or pipeline. */
export function registerCompetitionSignal(
  target: { register(module: OpportunitySignalModule): SignalEntry },
  options: CompetitionSignalOptions,
): SignalEntry {
  return target.register(createCompetitionSignal(options));
}
