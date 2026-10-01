/**
 * Decision Rule Framework: rule executor.
 *
 * Runs one rule against a context and always returns a result: a rule that
 * throws, fails validation, or returns a malformed output becomes a FAIL
 * result instead of stopping the run. The executor measures time and adds the
 * rule id; it computes nothing else and never produces a score. It never
 * mutates the context.
 */
import type { DecisionRuleModule, DecisionRuleOutput, DecisionRuleRunResult, DecisionRuleUpstream } from "./decision-rule-contract";
import { freezeDeepDecisionRule, type DecisionRuleContext } from "./decision-rule-context";
import { validateDecisionRuleOutput } from "./decision-rule-validator";

export type DecisionRuleClock = () => number;

const defaultClock: DecisionRuleClock = () => performance.now();

function result(ruleId: string, output: DecisionRuleOutput, start: number, now: DecisionRuleClock): DecisionRuleRunResult {
  return freezeDeepDecisionRule({
    ruleId,
    status: output.status,
    confidence: output.confidence,
    metadata: { ...output.metadata },
    warnings: [...output.warnings],
    errors: [...output.errors],
    executionTime: Math.max(0, now() - start),
  });
}

/** A SKIPPED result for a rule that was not run. */
export function skippedDecisionRuleResult(ruleId: string, warning: string): DecisionRuleRunResult {
  return freezeDeepDecisionRule({
    ruleId,
    status: "SKIPPED" as const,
    confidence: null,
    metadata: {},
    warnings: [warning],
    errors: [],
    executionTime: 0,
  });
}

export async function executeDecisionRule(
  module: DecisionRuleModule,
  context: DecisionRuleContext,
  upstream: DecisionRuleUpstream,
  now: DecisionRuleClock = defaultClock,
): Promise<DecisionRuleRunResult> {
  const start = now();
  const failed = (errors: string[]): DecisionRuleRunResult =>
    result(module.id, { status: "FAIL", confidence: null, metadata: {}, warnings: [], errors }, start, now);

  try {
    if (!module.supportsDecision(context)) {
      return result(
        module.id,
        { status: "SKIPPED", confidence: null, metadata: {}, warnings: ["Rule does not support this decision."], errors: [] },
        start,
        now,
      );
    }
    const problems = module.validate(context);
    if (problems.length > 0) return failed(problems.map((p) => `${p.field}: ${p.message}`));

    const output = await module.evaluate(context, upstream);
    const issues = validateDecisionRuleOutput(output);
    if (issues.length > 0) return failed(issues.map((i) => `Invalid rule output, ${i.field}: ${i.message}`));
    return result(module.id, output, start, now);
  } catch (error) {
    return failed([error instanceof Error ? error.message : "Rule threw an error."]);
  }
}
