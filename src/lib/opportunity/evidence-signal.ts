/**
 * Evidence Signal: the signal module.
 *
 * One independent signal for the Opportunity Signal Framework. It reports how
 * much evidence a product has and how well it is backed. It depends on no other
 * signal, calculates no Opportunity Score, and makes no recommendation.
 *
 * The signal context is flat and empty by design, so the platform outputs the
 * analysis reads reach it through a provider function the caller supplies. The
 * provider must only read: it is called once each for validate and analyze.
 */
import type { OpportunitySignalModule, SignalEntry, SignalOutput } from "./opportunity-signal-contract";
import type { SignalContext } from "./opportunity-signal-context";
import { analyzeEvidence } from "./evidence-analyzer";
import { evidenceResultToSignalOutput, type EvidenceInputs } from "./evidence-result";
import { validateEvidenceInputs } from "./evidence-validator";

export const EVIDENCE_SIGNAL_ID = "evidence";
export const EVIDENCE_SIGNAL_VERSION = "1.0.0";

/** Returns the existing platform outputs for the candidate in the context, or null when there are none. */
export type EvidenceInputProvider = (context: SignalContext) => EvidenceInputs | null | undefined;

export interface EvidenceSignalOptions {
  provider: EvidenceInputProvider;
  /** Defaults to true. */
  enabled?: boolean;
  /** Defaults to 100. */
  priority?: number;
}

export function createEvidenceSignal(options: EvidenceSignalOptions): OpportunitySignalModule {
  return {
    id: EVIDENCE_SIGNAL_ID,
    name: "Evidence",
    version: EVIDENCE_SIGNAL_VERSION,
    category: "EVIDENCE",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 100,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsCandidate: (context) => context.candidate !== null,

    validate: (context) => validateEvidenceInputs(options.provider(context) ?? null),

    analyze(context): SignalOutput {
      const inputs = options.provider(context) ?? null;
      const issues = validateEvidenceInputs(inputs);
      if (issues.length > 0 || inputs === null) {
        return {
          status: "FAILED",
          confidence: null,
          metadata: {},
          warnings: [],
          errors: issues.map((issue) => `${issue.field}: ${issue.message}`),
        };
      }
      return evidenceResultToSignalOutput(analyzeEvidence(inputs));
    },
  };
}

/** Registers the Evidence Signal in a signal registry or pipeline. */
export function registerEvidenceSignal(
  target: { register(module: OpportunitySignalModule): SignalEntry },
  options: EvidenceSignalOptions,
): SignalEntry {
  return target.register(createEvidenceSignal(options));
}
