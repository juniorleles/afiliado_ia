/**
 * Channel Suitability Signal: the signal module.
 *
 * One independent signal for the Traffic Signal Framework. It reports which
 * channel definitions are structurally compatible with what the Opportunity
 * analysis established. It depends on no other signal, ranks no channel,
 * calculates no score, and makes no recommendation.
 *
 * It reads the Traffic Context: the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, and the configuration. It reads them as
 * they are and changes none of them. It makes no HTTP request, calls no
 * platform API, and uses no AI.
 *
 * The signal needs an Opportunity analysis, and it is skipped for a context
 * without one. A context that cannot be read (a malformed context, an
 * Opportunity analysis that did not complete, a duplicate channel) makes the
 * signal FAIL with the reasons, never a result built on guesses.
 *
 * Every outside reference is a type-only import.
 */
import { analyzeChannelSuitability, type ChannelSuitabilityClock, type ChannelSuitabilityInputs } from "./channel-suitability-analyzer";
import { DEFAULT_CHANNEL_DEFINITIONS, DEFAULT_NEED_SOURCES, type ChannelDefinition, type NeedSources } from "./channel-definitions";
import { channelSuitabilityToSignalOutput } from "./channel-suitability-result";
import {
  validateChannelDefinitions,
  validateChannelSuitabilityContext,
  validateChannelSuitabilityInputs,
  validateChannelSuitabilityResult,
  validateNeedSources,
} from "./channel-suitability-validator";
import type { TrafficSignalEntry, TrafficSignalModule, TrafficSignalOutput } from "./traffic-signal-contract";
import type { TrafficSignalContext } from "./traffic-signal-context";
import type { TrafficIssue } from "./traffic-validator";

export const CHANNEL_SUITABILITY_SIGNAL_ID = "channel-suitability";
export const CHANNEL_SUITABILITY_SIGNAL_VERSION = "1.0.0";

export interface ChannelSuitabilitySignalOptions {
  /** The channels to assess. Defaults to the built-in definitions. A repeated id is rejected. */
  definitions?: readonly ChannelDefinition[];
  /** Which Opportunity dimensions can satisfy each need. Defaults to the built-in table. */
  needSources?: NeedSources;
  /** Defaults to true. */
  enabled?: boolean;
  /** Defaults to 90. */
  priority?: number;
  /** Milliseconds clock for executionTime. */
  now?: ChannelSuitabilityClock;
}

const describe = (issues: readonly TrafficIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const failed = (errors: string[]): TrafficSignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors });

export function createChannelSuitabilitySignal(options: ChannelSuitabilitySignalOptions = {}): TrafficSignalModule {
  const definitions = options.definitions ?? DEFAULT_CHANNEL_DEFINITIONS;
  const needSources = options.needSources ?? DEFAULT_NEED_SOURCES;

  /** Everything that must hold before the analyzer reads anything. */
  function preflight(context: TrafficSignalContext): { issues: TrafficIssue[]; inputs: ChannelSuitabilityInputs | null } {
    const issues = [...validateChannelDefinitions(definitions), ...validateNeedSources(needSources), ...validateChannelSuitabilityContext(context)];
    if (issues.length > 0) return { issues, inputs: null };
    const inputs: ChannelSuitabilityInputs = {
      opportunityAnalysis: context.opportunityAnalysis as NonNullable<TrafficSignalContext["opportunityAnalysis"]>,
      opportunityExplanation: context.opportunityExplanation,
      executionMetadata: context.executionMetadata,
      configuration: context.configuration,
      definitions,
      needSources,
    };
    return { issues: validateChannelSuitabilityInputs(inputs), inputs };
  }

  return {
    id: CHANNEL_SUITABILITY_SIGNAL_ID,
    name: "Channel Suitability",
    version: CHANNEL_SUITABILITY_SIGNAL_VERSION,
    category: "TRAFFIC_CHANNEL",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 90,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsAnalysis: (context) => context.opportunityAnalysis !== null,

    validate: (context) => preflight(context).issues,

    analyze(context): TrafficSignalOutput {
      const { issues, inputs } = preflight(context);
      if (issues.length > 0 || inputs === null) return failed(describe(issues));

      const result = analyzeChannelSuitability(inputs, options.now);
      const resultIssues = validateChannelSuitabilityResult(result, definitions.map((definition) => definition.id));
      if (resultIssues.length > 0) return failed(describe(resultIssues));
      return channelSuitabilityToSignalOutput(result);
    },
  };
}

/** Registers the Channel Suitability Signal in a signal registry or pipeline. */
export function registerChannelSuitabilitySignal(
  target: { register(module: TrafficSignalModule): TrafficSignalEntry },
  options: ChannelSuitabilitySignalOptions = {},
): TrafficSignalEntry {
  return target.register(createChannelSuitabilitySignal(options));
}
