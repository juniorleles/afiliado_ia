/**
 * Landing Page Potential Signal: the signal module.
 *
 * One independent signal for the Opportunity Signal Framework. It reports
 * whether the evidence a product already has is enough, in structure, to build
 * a landing page. It runs alone. It lists the Evidence Signal only as an
 * optional dependency, so when that signal is registered and enabled it runs
 * first and its result is used as a cross-check; when it is not, nothing
 * changes. It calculates no Opportunity Score, ranks nothing, and makes no
 * recommendation.
 *
 * The signal context is flat and empty by design, so the platform outputs the
 * analysis reads reach it through a provider function the caller supplies. The
 * provider must only read: it is called once each for validate and analyze.
 */
import type { OpportunitySignalModule, SignalEntry, SignalOutput, SignalUpstream } from "./opportunity-signal-contract";
import type { SignalContext } from "./opportunity-signal-context";
import { EVIDENCE_SIGNAL_ID } from "./evidence-signal";
import { EVIDENCE_DIMENSIONS, type EvidenceResult } from "./evidence-result";
import { analyzeLandingPagePotential } from "./landing-page-potential-analyzer";
import {
  landingPagePotentialToSignalOutput,
  type LandingPagePotentialInputs,
} from "./landing-page-potential-result";
import { validateLandingPageEvidence, validateLandingPagePotentialInputs } from "./landing-page-potential-validator";

export const LANDING_PAGE_POTENTIAL_SIGNAL_ID = "landing-page-potential";
export const LANDING_PAGE_POTENTIAL_SIGNAL_VERSION = "1.0.0";

/** Returns the existing platform outputs for the candidate in the context, or null when there are none. */
export type LandingPagePotentialInputProvider = (context: SignalContext) => LandingPagePotentialInputs | null | undefined;

export interface LandingPagePotentialSignalOptions {
  provider: LandingPagePotentialInputProvider;
  /** Defaults to true. */
  enabled?: boolean;
  /** Defaults to 90, so it comes after the Evidence Signal among unrelated signals. */
  priority?: number;
}

const names = (value: unknown): string[] =>
  typeof value === "string" && value !== "" ? value.split(",") : [];

/** Reads the Evidence Signal's framework result back into its typed form, or null if it is not usable. */
function evidenceFromUpstream(upstream: SignalUpstream): EvidenceResult | null {
  const result = upstream[EVIDENCE_SIGNAL_ID];
  if (!result || result.status !== "COMPLETED") return null;
  const candidate: EvidenceResult = {
    status: result.status,
    confidence: result.confidence,
    availableDimensions: names(result.metadata.availableDimensions) as EvidenceResult["availableDimensions"],
    missingDimensions: names(result.metadata.missingDimensions) as EvidenceResult["missingDimensions"],
    warnings: [...result.warnings],
    metadata: { ...result.metadata },
    executionTime: result.executionTime,
  };
  const known = [...candidate.availableDimensions, ...candidate.missingDimensions].every((d) =>
    (EVIDENCE_DIMENSIONS as readonly string[]).includes(d),
  );
  return known && validateLandingPageEvidence(candidate).length === 0 ? candidate : null;
}

export function createLandingPagePotentialSignal(options: LandingPagePotentialSignalOptions): OpportunitySignalModule {
  return {
    id: LANDING_PAGE_POTENTIAL_SIGNAL_ID,
    name: "Landing Page Potential",
    version: LANDING_PAGE_POTENTIAL_SIGNAL_VERSION,
    category: "LANDING_PAGE",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 90,
    dependencies: { requires: [], optional: [EVIDENCE_SIGNAL_ID], conflicts: [] },

    supportsCandidate: (context) => context.candidate !== null,

    validate: (context) => validateLandingPagePotentialInputs(options.provider(context) ?? null),

    analyze(context, upstream): SignalOutput {
      const provided = options.provider(context) ?? null;
      const issues = validateLandingPagePotentialInputs(provided);
      if (issues.length > 0 || provided === null) {
        return {
          status: "FAILED",
          confidence: null,
          metadata: {},
          warnings: [],
          errors: issues.map((issue) => `${issue.field}: ${issue.message}`),
        };
      }
      // A supplied evidence result wins. Otherwise a completed Evidence Signal run is used.
      const upstreamEvidence = provided.evidence ? null : evidenceFromUpstream(upstream);
      const inputs: LandingPagePotentialInputs = upstreamEvidence ? { ...provided, evidence: upstreamEvidence } : provided;
      const output = landingPagePotentialToSignalOutput(analyzeLandingPagePotential(inputs));
      if (upstreamEvidence) output.metadata = { ...output.metadata, evidenceSource: "upstream" };
      else if (provided.evidence) output.metadata = { ...output.metadata, evidenceSource: "input" };
      return output;
    },
  };
}

/** Registers the Landing Page Potential Signal in a signal registry or pipeline. */
export function registerLandingPagePotentialSignal(
  target: { register(module: OpportunitySignalModule): SignalEntry },
  options: LandingPagePotentialSignalOptions,
): SignalEntry {
  return target.register(createLandingPagePotentialSignal(options));
}
