/**
 * Offer Strategy Signal: the signal module.
 *
 * One independent signal for the Traffic Signal Framework. It reports which
 * offer strategies are structurally ready given what the Opportunity analysis
 * established. It depends on no other signal, classifies nothing, recommends
 * no campaign, calculates no score, and predicts no conversion.
 *
 * It reads the Traffic Context (the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, and the configuration) and, through an
 * optional content provider, the Evidence Context, the Landing Page Structure,
 * and the effective manual overrides. It reads them as they are and changes
 * none of them. It makes no HTTP request, calls no platform API, and uses no
 * AI.
 *
 * The signal needs an Opportunity analysis and is skipped for a context
 * without one. A context or strategy set that cannot be read makes the signal
 * FAIL with the reasons, never a result built on guesses. Without a content
 * provider the signal still runs, and says which dimensions it could not
 * establish from the page.
 *
 * The provider is called once by validate and once by analyze, so it must be
 * a pure read.
 *
 * Every outside reference is a type-only import.
 */
import { analyzeOfferStrategy, type OfferStrategyClock, type OfferStrategyInputs } from "./offer-strategy-analyzer";
import { DEFAULT_OFFER_SOURCES, DEFAULT_OFFER_STRATEGIES, type OfferDimensionSources } from "./offer-strategy-definitions";
import { offerStrategyToSignalOutput, type OfferStrategyContent } from "./offer-strategy-result";
import {
  validateOfferDimensionSources,
  validateOfferStrategies,
  validateOfferStrategyContent,
  validateOfferStrategyContext,
  validateOfferStrategyInputs,
  validateOfferStrategyResult,
} from "./offer-strategy-validator";
import { createOfferStrategyRegistry, type OfferStrategyRegistry } from "./offer-strategy-registry";
import type { TrafficSignalContext } from "./traffic-signal-context";
import type { TrafficSignalEntry, TrafficSignalModule, TrafficSignalOutput } from "./traffic-signal-contract";
import type { TrafficIssue } from "./traffic-validator";

export const OFFER_STRATEGY_SIGNAL_ID = "offer-strategy";
export const OFFER_STRATEGY_SIGNAL_VERSION = "1.0.0";

/** Supplies the content to read for a context, or null when there is none. Must be a pure read. */
export type OfferContentProvider = (context: TrafficSignalContext) => OfferStrategyContent | null;

export interface OfferStrategySignalOptions {
  /** The strategies to assess. Defaults to a new registry holding the built-in strategies. */
  registry?: OfferStrategyRegistry;
  dimensionSources?: OfferDimensionSources;
  content?: OfferContentProvider;
  enabled?: boolean;
  /** Defaults to 60. */
  priority?: number;
  now?: OfferStrategyClock;
}

export function createDefaultOfferStrategyRegistry(): OfferStrategyRegistry {
  return createOfferStrategyRegistry(DEFAULT_OFFER_STRATEGIES);
}

const describe = (issues: readonly TrafficIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const failed = (errors: string[]): TrafficSignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors });

export function createOfferStrategySignal(options: OfferStrategySignalOptions = {}): TrafficSignalModule {
  const registry = options.registry ?? createDefaultOfferStrategyRegistry();
  const dimensionSources = options.dimensionSources ?? DEFAULT_OFFER_SOURCES;

  function preflight(context: TrafficSignalContext): { issues: TrafficIssue[]; inputs: OfferStrategyInputs | null } {
    const enabled = registry.list().filter((entry) => entry.enabled);
    const issues = [
      ...validateOfferStrategies(enabled.map((entry) => entry.strategy)),
      ...validateOfferDimensionSources(dimensionSources),
      ...validateOfferStrategyContext(context),
    ];
    if (issues.length > 0) return { issues, inputs: null };

    let content: OfferStrategyContent | null = null;
    if (options.content) {
      try {
        content = options.content(context) ?? null;
      } catch (error) {
        return { issues: [{ field: "content", message: `Invalid content: the content provider failed (${error instanceof Error ? error.message : "unknown error"}).` }], inputs: null };
      }
      const contentIssues = validateOfferStrategyContent(content);
      if (contentIssues.length > 0) return { issues: contentIssues, inputs: null };
    }

    const inputs: OfferStrategyInputs = {
      opportunityAnalysis: context.opportunityAnalysis as NonNullable<TrafficSignalContext["opportunityAnalysis"]>,
      opportunityExplanation: context.opportunityExplanation,
      executionMetadata: context.executionMetadata,
      configuration: context.configuration,
      strategies: enabled.map((entry) => entry.strategy),
      dimensionSources,
      content,
      skippedStrategies: registry.list().filter((entry) => !entry.enabled).map((entry) => entry.id),
    };
    return { issues: validateOfferStrategyInputs(inputs), inputs };
  }

  return {
    id: OFFER_STRATEGY_SIGNAL_ID,
    name: "Offer Strategy",
    version: OFFER_STRATEGY_SIGNAL_VERSION,
    category: "OFFER",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 60,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsAnalysis: (context) => context.opportunityAnalysis !== null,

    validate: (context) => preflight(context).issues,

    analyze(context): TrafficSignalOutput {
      const { issues, inputs } = preflight(context);
      if (issues.length > 0 || inputs === null) return failed(describe(issues));

      const result = analyzeOfferStrategy(inputs, options.now);
      const resultIssues = validateOfferStrategyResult(
        result,
        inputs.strategies.map((strategy) => strategy.id),
      );
      if (resultIssues.length > 0) return failed(describe(resultIssues));
      return offerStrategyToSignalOutput(result);
    },
  };
}

export function registerOfferStrategySignal(
  target: { register(module: TrafficSignalModule): TrafficSignalEntry },
  options: OfferStrategySignalOptions = {},
): TrafficSignalEntry {
  return target.register(createOfferStrategySignal(options));
}
