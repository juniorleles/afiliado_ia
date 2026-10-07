/**
 * Creative Readiness Signal: the signal module.
 *
 * One independent signal for the Traffic Signal Framework. It reports which
 * creative assets are present or missing, and which creative formats are
 * structurally ready given what the Opportunity analysis established. It
 * depends on no other signal, generates no creative, recommends no format,
 * and calculates no score.
 *
 * It reads the Traffic Context (the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, and the configuration) and, through an
 * optional content provider, the Evidence Context, the Landing Page Structure,
 * the Presentation Plan, and the effective manual overrides. It reads them as
 * they are and changes none of them. It makes no HTTP request, calls no
 * platform API, and uses no AI.
 *
 * The signal needs an Opportunity analysis and is skipped for a context
 * without one. A context or creative set that cannot be read makes the signal
 * FAIL with the reasons, never a result built on guesses. Without a content
 * provider the signal still runs, and says which dimensions it could not
 * establish from the page.
 *
 * The provider is called once by validate and once by analyze, so it must be
 * a pure read.
 *
 * Every outside reference is a type-only import.
 */
import { analyzeCreativeReadiness, type CreativeReadinessClock, type CreativeReadinessInputs } from "./creative-readiness-analyzer";
import { DEFAULT_CREATIVE_ASSETS, DEFAULT_CREATIVE_FORMATS, type CreativeFormat } from "./creative-asset-definitions";
import { createCreativeAssetRegistry, type CreativeAssetRegistry } from "./creative-asset-registry";
import { creativeReadinessToSignalOutput, type CreativeReadinessContent } from "./creative-readiness-result";
import {
  validateCreativeAssets,
  validateCreativeFormats,
  validateCreativeReadinessContent,
  validateCreativeReadinessContext,
  validateCreativeReadinessInputs,
  validateCreativeReadinessResult,
} from "./creative-readiness-validator";
import type { TrafficSignalContext } from "./traffic-signal-context";
import type { TrafficSignalEntry, TrafficSignalModule, TrafficSignalOutput } from "./traffic-signal-contract";
import type { TrafficIssue } from "./traffic-validator";

export const CREATIVE_READINESS_SIGNAL_ID = "creative-readiness";
export const CREATIVE_READINESS_SIGNAL_VERSION = "1.0.0";

/** Supplies the content to read for a context, or null when there is none. Must be a pure read. */
export type CreativeContentProvider = (context: TrafficSignalContext) => CreativeReadinessContent | null;

export interface CreativeReadinessSignalOptions {
  /** The assets to assess. Defaults to a new registry holding the built-in assets. */
  registry?: CreativeAssetRegistry;
  /** The formats to assess. Defaults to the built-in formats. */
  formats?: readonly CreativeFormat[];
  content?: CreativeContentProvider;
  enabled?: boolean;
  /** Defaults to 50. */
  priority?: number;
  now?: CreativeReadinessClock;
}

export function createDefaultCreativeAssetRegistry(): CreativeAssetRegistry {
  return createCreativeAssetRegistry(DEFAULT_CREATIVE_ASSETS);
}

const describe = (issues: readonly TrafficIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const failed = (errors: string[]): TrafficSignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors });

export function createCreativeReadinessSignal(options: CreativeReadinessSignalOptions = {}): TrafficSignalModule {
  const registry = options.registry ?? createDefaultCreativeAssetRegistry();
  const formats = options.formats ?? DEFAULT_CREATIVE_FORMATS;

  function preflight(context: TrafficSignalContext): { issues: TrafficIssue[]; inputs: CreativeReadinessInputs | null } {
    const enabledAssets = registry.list().filter((entry) => entry.enabled);
    const enabledFormats = formats.filter((format) => format.enabled);
    const issues = [
      ...validateCreativeAssets(enabledAssets.map((entry) => entry.asset)),
      ...validateCreativeFormats(enabledFormats),
      ...validateCreativeReadinessContext(context),
    ];
    if (issues.length > 0) return { issues, inputs: null };

    let content: CreativeReadinessContent | null = null;
    if (options.content) {
      try {
        content = options.content(context) ?? null;
      } catch (error) {
        return { issues: [{ field: "content", message: `Invalid content: the content provider failed (${error instanceof Error ? error.message : "unknown error"}).` }], inputs: null };
      }
      const contentIssues = validateCreativeReadinessContent(content);
      if (contentIssues.length > 0) return { issues: contentIssues, inputs: null };
    }

    const inputs: CreativeReadinessInputs = {
      opportunityAnalysis: context.opportunityAnalysis as NonNullable<TrafficSignalContext["opportunityAnalysis"]>,
      opportunityExplanation: context.opportunityExplanation,
      executionMetadata: context.executionMetadata,
      configuration: context.configuration,
      assets: enabledAssets.map((entry) => entry.asset),
      formats: enabledFormats,
      content,
      skippedAssets: registry.list().filter((entry) => !entry.enabled).map((entry) => entry.id),
      skippedFormats: formats.filter((format) => !format.enabled).map((format) => format.id),
    };
    return { issues: validateCreativeReadinessInputs(inputs), inputs };
  }

  return {
    id: CREATIVE_READINESS_SIGNAL_ID,
    name: "Creative Readiness",
    version: CREATIVE_READINESS_SIGNAL_VERSION,
    category: "CREATIVE",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 50,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsAnalysis: (context) => context.opportunityAnalysis !== null,

    validate: (context) => preflight(context).issues,

    analyze(context): TrafficSignalOutput {
      const { issues, inputs } = preflight(context);
      if (issues.length > 0 || inputs === null) return failed(describe(issues));

      const result = analyzeCreativeReadiness(inputs, options.now);
      const resultIssues = validateCreativeReadinessResult(
        result,
        inputs.formats.map((format) => format.id),
      );
      if (resultIssues.length > 0) return failed(describe(resultIssues));
      return creativeReadinessToSignalOutput(result);
    },
  };
}

export function registerCreativeReadinessSignal(
  target: { register(module: TrafficSignalModule): TrafficSignalEntry },
  options: CreativeReadinessSignalOptions = {},
): TrafficSignalEntry {
  return target.register(createCreativeReadinessSignal(options));
}
