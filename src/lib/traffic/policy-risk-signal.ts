/**
 * Policy Risk Signal: the signal module.
 *
 * One independent signal for the Traffic Signal Framework. It identifies
 * potential policy and compliance risks, and the safeguards that are missing
 * next to them. It depends on no other signal, approves and blocks nothing,
 * calculates no score, and makes no recommendation.
 *
 * It reads the Traffic Context (the Opportunity analysis, the Opportunity
 * explanation, and the execution metadata) and, through an optional content
 * provider, the Evidence Context, the Landing Page Structure, and the
 * effective manual overrides. It reads them as they are and changes none of
 * them. It makes no HTTP request, calls no platform API, and uses no AI.
 *
 * The signal needs an Opportunity analysis and is skipped for a context
 * without one. A context or rule set that cannot be read makes the signal FAIL
 * with the reasons, never a result built on guesses. Without a content
 * provider the signal still runs, and says which dimensions it could not
 * assess.
 *
 * The provider is called once by validate and once by analyze, so it must be
 * a pure read.
 *
 * Every outside reference is a type-only import.
 */
import { analyzePolicyRisk, type PolicyRiskAnalysisInputs, type PolicyRiskClock } from "./policy-risk-analyzer";
import { DEFAULT_POLICY_RULES, DEFAULT_SAFEGUARD_SOURCES } from "./policy-rule-definitions";
import { policyRiskToSignalOutput, type PolicyRiskInputs, type PolicySafeguardSources } from "./policy-risk-result";
import { validatePolicyRiskContext, validatePolicyRiskInputs, validatePolicyRiskResult, validatePolicyRules, validateSafeguardSources } from "./policy-risk-validator";
import { createPolicyRuleRegistry, type PolicyRuleRegistry } from "./policy-rule-registry";
import type { TrafficSignalContext } from "./traffic-signal-context";
import type { TrafficSignalEntry, TrafficSignalModule, TrafficSignalOutput } from "./traffic-signal-contract";
import type { TrafficIssue } from "./traffic-validator";

export const POLICY_RISK_SIGNAL_ID = "policy-risk";
export const POLICY_RISK_SIGNAL_VERSION = "1.0.0";

/** Supplies the content to read for a context, or null when there is none. Must be a pure read. */
export type PolicyContentProvider = (context: TrafficSignalContext) => PolicyRiskInputs | null;

export interface PolicyRiskSignalOptions {
  /** The rules to apply. Defaults to a new registry holding the built-in rules. */
  registry?: PolicyRuleRegistry;
  /** Which Opportunity dimensions and page-section kinds show each safeguard. Defaults to the built-in table. */
  safeguardSources?: PolicySafeguardSources;
  /** The Evidence Context, Landing Page Structure, and effective manual overrides. Defaults to none. */
  content?: PolicyContentProvider;
  /** Defaults to true. */
  enabled?: boolean;
  /** Defaults to 80. */
  priority?: number;
  /** Milliseconds clock for executionTime. */
  now?: PolicyRiskClock;
}

/** A new registry holding the built-in rules. */
export function createDefaultPolicyRuleRegistry(): PolicyRuleRegistry {
  return createPolicyRuleRegistry(DEFAULT_POLICY_RULES);
}

const describe = (issues: readonly TrafficIssue[]) => issues.map((issue) => `${issue.field}: ${issue.message}`);
const failed = (errors: string[]): TrafficSignalOutput => ({ status: "FAILED", confidence: null, metadata: {}, warnings: [], errors });

export function createPolicyRiskSignal(options: PolicyRiskSignalOptions = {}): TrafficSignalModule {
  const registry = options.registry ?? createDefaultPolicyRuleRegistry();
  const safeguardSources = options.safeguardSources ?? DEFAULT_SAFEGUARD_SOURCES;

  /** Everything that must hold before the analyzer reads anything. */
  function preflight(context: TrafficSignalContext): { issues: TrafficIssue[]; inputs: PolicyRiskAnalysisInputs | null } {
    const issues = [...validatePolicyRules(registry.list().map((entry) => entry.rule)), ...validateSafeguardSources(safeguardSources), ...validatePolicyRiskContext(context)];
    if (issues.length > 0) return { issues, inputs: null };

    let content: PolicyRiskInputs | null = null;
    if (options.content) {
      try {
        content = options.content(context) ?? null;
      } catch (error) {
        return { issues: [{ field: "content", message: `Invalid content: the content provider failed (${error instanceof Error ? error.message : "unknown error"}).` }], inputs: null };
      }
      const contentIssues = validatePolicyRiskInputs(content);
      if (contentIssues.length > 0) return { issues: contentIssues, inputs: null };
    }
    return {
      issues: [],
      inputs: {
        opportunityAnalysis: context.opportunityAnalysis as NonNullable<TrafficSignalContext["opportunityAnalysis"]>,
        opportunityExplanation: context.opportunityExplanation,
        executionMetadata: context.executionMetadata,
        rules: registry.list(),
        safeguardSources,
        content,
      },
    };
  }

  return {
    id: POLICY_RISK_SIGNAL_ID,
    name: "Policy Risk",
    version: POLICY_RISK_SIGNAL_VERSION,
    category: "POLICY",
    enabled: options.enabled ?? true,
    priority: options.priority ?? 80,
    dependencies: { requires: [], optional: [], conflicts: [] },

    supportsAnalysis: (context) => context.opportunityAnalysis !== null,

    validate: (context) => preflight(context).issues,

    analyze(context): TrafficSignalOutput {
      const { issues, inputs } = preflight(context);
      if (issues.length > 0 || inputs === null) return failed(describe(issues));

      const result = analyzePolicyRisk(inputs, options.now);
      const resultIssues = validatePolicyRiskResult(result);
      if (resultIssues.length > 0) return failed(describe(resultIssues));
      return policyRiskToSignalOutput(result);
    },
  };
}

/** Registers the Policy Risk Signal in a signal registry or pipeline. */
export function registerPolicyRiskSignal(
  target: { register(module: TrafficSignalModule): TrafficSignalEntry },
  options: PolicyRiskSignalOptions = {},
): TrafficSignalEntry {
  return target.register(createPolicyRiskSignal(options));
}
