/**
 * Audience Fit Signal: the signal module.
 *
 * One independent signal for the Traffic Signal Framework. It reports which
 * audience profiles are structurally compatible with what the Opportunity
 * analysis established. It depends on no other signal, classifies nothing,
 * estimates no audience size, calculates no score, and makes no
 * recommendation.
 *
 * It reads the Traffic Context (the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, and the configuration) and, through an
 * optional content provider, the Evidence Context, the Landing Page Structure,
 * and the effective manual overrides. It reads them as they are and changes
 * none of them. It makes no HTTP request, calls no platform API, and uses no
 * AI.
 *
 * The signal needs an Opportunity analysis and is skipped for a context
 * without one. A context or profile set that cannot be read makes the signal
 * FAIL with the reasons, never a result built on guesses. Without a content
 * provider the signal still runs, and says which dimensions it could not
 * establish from the page.
 *
 * The provider is called once by validate and once by analyze, so it must be
 * a pure read.
 *
 * Every outside reference is a type-only import.
 */
import { analyzeAudienceFit, type AudienceFitClock, type AudienceFitInputs } from "./audience-fit-analyzer";
import { DEFAULT_AUDIENCE_PROFILES, DEFAULT_AUDIENCE_SOURCES, type AudienceDimensionSources } from "./audience-profile-definitions";
import { audienceFitToSignalOutput, type AudienceFitContent } from "./audience-fit-result";
import {
  validateAudienceDimensionSources,
  validateAudienceFitContent,
  validateAudienceFitContext,
  validateAudienceFitInputs,
  validateAudienceFitResult,
  validateAudienceProfiles,
} from "./audience-fit-validator";
import { createAudienceProfileRegistry, type AudienceProfileRegistry } from "./audience-profile-registry";
import type { TrafficSignalContext } from "./traffic-signal-context";
import type { TrafficSignalEntry, TrafficSignalModule, TrafficSignalOutput } from "./traffic-signal-contract";
import type { TrafficIssue } from "./traffic-validator";

export const AUDIENCE_FIT_SIGNAL_ID = "audience-fit";
export const AUDIENCE_FIT_SIGNAL_VERSION = "1.0.0";

/** Supplies the content to read for a context, or null when there is none. Must be a pure read. */
export type AudienceContentProvider = (context: TrafficSignalContext) => AudienceFitContent | null;

export interface AudienceFitSignalOptions {
  /** The profiles to assess. Defaults to a new registry holding the built-in profiles. */
  registry?: AudienceProfileRegistry;
  /** Which Opportunity dimensions, page-section kinds, and fields establish each audience dimension. */
  dimensionSources?: AudienceDimensionSources;
  /** The Evidence Context, Landing Page Structure, and effective manual overrides. Defaults to none. */
  content?: AudienceContentProvider;
  /** Defaults to true. */
  enabled?: boolean;
  /** Defaults to 70. */
  priority?: number;
  /** Milliseconds clock for executionTime. */
  now?: AudienceFitClock;
}

/** A new registry holding the built-in profiles. */
export function createDefaultAudienceProfileRegistry(): AudienceProfileRegistry {
  return createAudienceProfileRegistry(DEFAULT_AUDIENCE_PROFILES);
}

const describe = (issues: readonly TrafficIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const failed = (errors: string[]): TrafficSignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors });

export function createAudienceFitSignal(options: AudienceFitSignalOptions = {}): TrafficSignalModule {
  const registry = options.registry ?? createDefaultAudienceProfileRegistry();
  const dimensionSources = options.dimensionSources ?? DEFAULT_AUDIENCE_SOURCES;

  /** Everything that must hold before the analyzer reads anything. */
  function preflight(context: TrafficSignalContext): { issues: TrafficIssue[]; inputs: AudienceFitInputs | null } {
    const enabled = registry.list().filter((entry) => entry.enabled);
    const issues = [
      ...validateAudienceProfiles(enabled.map((entry) => entry.profile)),
      ...validateAudienceDimensionSources(dimensionSources),
      ...validateAudienceFitContext(context),
    ];
    if (issues.length > 0) return { issues, inputs: null };

    let content: AudienceFitContent | null = null;
    if (options.content) {
      try {
        content = options.content(context) ?? null;
      } catch (error) {
        return { issues: [{ field: "content", message: `Invalid content: the content provider failed (${error instanceof Error ? error.message : "unknown error"}).` }], inputs: null };
      }
      const contentIssues = validateAudienceFitContent(content);
      if (contentIssues.length > 0) return { issues: contentIssues, inputs: null };
    }

    const inputs: AudienceFitInputs = {
      opportunityAnalysis: context.opportunityAnalysis as NonNullable<TrafficSignalContext["opportunityAnalysis"]>,
      opportunityExplanation: context.opportunityExplanation,
      executionMetadata: context.executionMetadata,
      configuration: context.configuration,
      profiles: enabled.map((entry) => entry.profile),
      dimensionSources,
      content,
      skippedProfiles: registry.list().filter((entry) => !entry.enabled).map((entry) => entry.id),
    };
    return { issues: validateAudienceFitInputs(inputs), inputs };
  }

  return {
    id: AUDIENCE_FIT_SIGNAL_ID,
    name: "Audience Fit",
    version: AUDIENCE_FIT_SIGNAL_VERSION,
    category: "AUDIENCE",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 70,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsAnalysis: (context) => context.opportunityAnalysis !== null,

    validate: (context) => preflight(context).issues,

    analyze(context): TrafficSignalOutput {
      const { issues, inputs } = preflight(context);
      if (issues.length > 0 || inputs === null) return failed(describe(issues));

      const result = analyzeAudienceFit(inputs, options.now);
      const resultIssues = validateAudienceFitResult(
        result,
        inputs.profiles.map((profile) => profile.id),
      );
      if (resultIssues.length > 0) return failed(describe(resultIssues));
      return audienceFitToSignalOutput(result);
    },
  };
}

/** Registers the Audience Fit Signal in a signal registry or pipeline. */
export function registerAudienceFitSignal(
  target: { register(module: TrafficSignalModule): TrafficSignalEntry },
  options: AudienceFitSignalOptions = {},
): TrafficSignalEntry {
  return target.register(createAudienceFitSignal(options));
}
