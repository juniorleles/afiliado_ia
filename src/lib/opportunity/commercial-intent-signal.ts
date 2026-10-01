/**
 * Commercial Intent Signal: the signal module.
 *
 * One independent signal for the Opportunity Signal Framework. It reports which
 * commercial-intent dimensions the available evidence covers. It depends on no
 * other signal, calculates no Opportunity Score, and makes no recommendation.
 *
 * Evidence reaches it only through the Evidence Provider Framework: the signal
 * asks an evidence resolver for COMMERCIAL_INTENT evidence and nothing else.
 * It never asks for product facts, never reads a platform module, and makes no
 * HTTP request, no search, and no AI call.
 *
 * It is channel-agnostic. It collects from every provider of the kind rather
 * than only the highest-priority one, because each provider speaks for its own
 * channel and one must not hide another. It does not branch on the channel.
 *
 * The signal context is flat and carries no nested data, so a context factory
 * turns it into the evidence context the providers need. The default factory
 * copies the candidate, imported metadata, runtime, configuration, and
 * extensions, and leaves resolved product data empty.
 *
 * A provider that failed is not evidence that there is no commercial intent.
 * If every provider that ran failed, the result is FAILED rather than a
 * result with every dimension missing. If some failed and others collected,
 * the result is COMPLETED and says which failed. A provider that collected
 * nothing is a genuine "no evidence".
 */
import type { OpportunitySignalModule, SignalEntry, SignalOutput } from "./opportunity-signal-contract";
import type { SignalContext } from "./opportunity-signal-context";
import type { OpportunityIssue } from "./opportunity-validator";
import type { CommercialIntentEvidence } from "./commercial-intent-provider-contract";
import { analyzeCommercialIntent, type CommercialIntentClock } from "./commercial-intent-analyzer";
import {
  COMMERCIAL_INTENT_DIMENSIONS,
  commercialIntentResultToSignalOutput,
  type CommercialIntentDimension,
  type CommercialIntentInputs,
} from "./commercial-intent-result";
import {
  validateCommercialIntentContext,
  validateCommercialIntentDimensions,
  validateCommercialIntentInputs,
  validateCommercialIntentProviders,
  validateCommercialIntentResult,
} from "./commercial-intent-validator";
import { createEvidenceContext, type EvidenceContext } from "./providers/evidence-provider-context";
import type { EvidenceResolver } from "./providers/evidence-provider-resolver";

export const COMMERCIAL_INTENT_SIGNAL_ID = "commercial-intent";
export const COMMERCIAL_INTENT_SIGNAL_VERSION = "1.0.0";

/** Turns the flat signal context into the evidence context for the providers. */
export type CommercialIntentContextFactory = (context: SignalContext) => EvidenceContext;

export interface CommercialIntentSignalOptions {
  /** The evidence resolver, with its providers already registered. */
  resolver: EvidenceResolver;
  contextFactory?: CommercialIntentContextFactory;
  /** Dimensions to check. Defaults to all of them. */
  dimensions?: readonly CommercialIntentDimension[];
  /** Defaults to true. */
  enabled?: boolean;
  /** Defaults to 70. */
  priority?: number;
  /** Milliseconds clock for executionTime. */
  now?: CommercialIntentClock;
}

export const defaultCommercialIntentContextFactory: CommercialIntentContextFactory = (context) =>
  createEvidenceContext({
    candidate: context.candidate,
    metadata: { ...context.importedMetadata },
    runtime: { ...context.runtime },
    configuration: { ...context.configuration },
    extensions: { ...context.extensions },
  });

const describe = (issues: readonly OpportunityIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const failed = (errors: string[]): SignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors });
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createCommercialIntentSignal(options: CommercialIntentSignalOptions): OpportunitySignalModule {
  const { resolver } = options;
  const factory = options.contextFactory ?? defaultCommercialIntentContextFactory;
  const dimensions = options.dimensions ?? COMMERCIAL_INTENT_DIMENSIONS;

  /** Everything that must hold before a provider is asked for anything. */
  function preflight(context: SignalContext): { issues: OpportunityIssue[]; evidenceContext: EvidenceContext | null } {
    const issues = validateCommercialIntentDimensions(dimensions);
    let evidenceContext: EvidenceContext | null = null;
    let built = false;
    try {
      evidenceContext = factory(context);
      built = true;
    } catch (error) {
      issues.push({ field: "context", message: `Invalid evidence context: the context factory threw (${reason(error)}).` });
    }
    if (built) {
      const contextIssues = validateCommercialIntentContext(evidenceContext);
      issues.push(...contextIssues);
      if (contextIssues.length === 0 && evidenceContext !== null) {
        try {
          issues.push(...validateCommercialIntentProviders(resolver.resolveProviders(evidenceContext, { kind: "COMMERCIAL_INTENT" }).providers.length));
        } catch (error) {
          issues.push({ field: "providers", message: `Providers could not be resolved (${reason(error)}).` });
        }
      }
    }
    return { issues, evidenceContext };
  }

  return {
    id: COMMERCIAL_INTENT_SIGNAL_ID,
    name: "Commercial Intent",
    version: COMMERCIAL_INTENT_SIGNAL_VERSION,
    category: "COMMERCIAL_INTENT",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 70,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsCandidate: (context) => context.candidate !== null,

    validate: (context) => preflight(context).issues,

    async analyze(context): Promise<SignalOutput> {
      const { issues, evidenceContext } = preflight(context);
      if (issues.length > 0 || evidenceContext === null) return failed(describe(issues));

      const results = await resolver.collectEvidence(evidenceContext, { kind: "COMMERCIAL_INTENT" });
      const collected = results.filter((result) => result.status === "COLLECTED");
      const broken = results.filter((result) => result.status === "FAILED");
      const empty = results.filter((result) => result.status === "EMPTY");
      if (collected.length === 0 && broken.length > 0 && empty.length === 0) {
        return failed(
          broken.flatMap((result) =>
            result.errors.length > 0 ? result.errors.map((error) => `provider ${result.providerId}: ${error}`) : [`provider ${result.providerId}: failed without a reason.`],
          ),
        );
      }

      const warnings: string[] = [];
      for (const result of broken) {
        warnings.push(`Provider ${result.providerId} failed, so its evidence is missing; dimensions it would have covered may read as missing.`);
      }
      for (const result of empty) warnings.push(`Provider ${result.providerId} found no commercial intent evidence.`);
      for (const result of collected) for (const warning of result.warnings) warnings.push(`${result.providerId}: ${warning}`);

      const inputs: CommercialIntentInputs = {
        candidate: evidenceContext.candidate as NonNullable<EvidenceContext["candidate"]>,
        sources: collected.map((result) => ({
          providerId: result.providerId,
          providerVersion: result.providerVersion,
          payload: result.payload as CommercialIntentEvidence,
        })),
        warnings,
        dimensions,
      };
      const inputIssues = validateCommercialIntentInputs(inputs);
      if (inputIssues.length > 0) return failed(describe(inputIssues));

      const result = analyzeCommercialIntent(inputs, options.now);
      const resultIssues = validateCommercialIntentResult(result);
      if (resultIssues.length > 0) return failed(describe(resultIssues));
      return commercialIntentResultToSignalOutput(result);
    },
  };
}

/** Registers the Commercial Intent Signal in a signal registry or pipeline. */
export function registerCommercialIntentSignal(
  target: { register(module: OpportunitySignalModule): SignalEntry },
  options: CommercialIntentSignalOptions,
): SignalEntry {
  return target.register(createCommercialIntentSignal(options));
}
