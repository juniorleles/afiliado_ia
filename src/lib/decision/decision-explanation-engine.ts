/**
 * Decision Explanation Engine.
 *
 * Explains a Decision Analysis in words a person can read. It validates the
 * input, builds the structured explanation, checks what it built, and hands it
 * back frozen. It can also render it: a compact report, a detailed report, a
 * section breakdown, JSON, and a UI view model.
 *
 * It explains; it does not decide. It changes no analysis, executes no rule,
 * executes no action, and generates no text with a model. It makes no HTTP
 * request and persists nothing. It never throws: an input it cannot explain
 * is rejected with the reasons.
 *
 * The only clock is an injectable `now`; its default measures elapsed time and
 * is the only time source in the engine. Everything else is deterministic, so
 * the same input always gives the same explanation, apart from executionTime.
 */
import type { DecisionIssue } from "./decision-validator";
import { freezeDeepDecisionRule } from "./decision-rule-context";
import {
  createDecisionExplanationBuilder,
  type DecisionExplanationBuilder,
} from "./decision-explanation-builder";
import {
  createDecisionExplanationFormatter,
  type DecisionExplanationFormatter,
  type DecisionExplanationViewModel,
  type MachineReadableDecisionExplanation,
} from "./decision-explanation-formatter";
import { createDecisionExplanationValidator, type DecisionExplanationValidator } from "./decision-explanation-validator";
import type { DecisionExplanation, DecisionExplanationInput, DecisionExplanationOutcome } from "./decision-explanation-result";

export interface DecisionExplanationEngineOptions {
  builder?: DecisionExplanationBuilder;
  formatter?: DecisionExplanationFormatter;
  validator?: DecisionExplanationValidator;
  /** Milliseconds from any fixed point. Injectable so tests are deterministic. */
  now?: () => number;
}

/** An explanation and every way it can be shown. Every view is null when the input was rejected. */
export interface RenderedDecisionExplanation {
  outcome: DecisionExplanationOutcome;
  short: string | null;
  compact: string | null;
  detailed: string | null;
  sections: string[];
  json: string | null;
  machine: MachineReadableDecisionExplanation | null;
  view: DecisionExplanationViewModel | null;
}

export interface DecisionExplanationEngine {
  readonly builder: DecisionExplanationBuilder;
  readonly formatter: DecisionExplanationFormatter;
  readonly validator: DecisionExplanationValidator;
  /** What would be rejected, without explaining anything. */
  validate(input: unknown): DecisionIssue[];
  explain(input: unknown): DecisionExplanationOutcome;
  render(input: unknown): RenderedDecisionExplanation;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createDecisionExplanationEngine(options: DecisionExplanationEngineOptions = {}): DecisionExplanationEngine {
  const builder = options.builder ?? createDecisionExplanationBuilder();
  const formatter = options.formatter ?? createDecisionExplanationFormatter();
  const validator = options.validator ?? createDecisionExplanationValidator();
  const now = options.now ?? (() => performance.now());

  const rejected = (issues: DecisionIssue[]): DecisionExplanationOutcome => ({ status: "REJECTED", explanation: null, issues });

  function explain(input: unknown): DecisionExplanationOutcome {
    try {
      const started = now();
      const issues = validator.validateInput(input);
      if (issues.length > 0) return rejected(issues);

      const built = builder.build(input as DecisionExplanationInput);
      const elapsed = now() - started;
      const explanation: DecisionExplanation = freezeDeepDecisionRule({
        ...built,
        executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
      });

      const problems = validator.validateExplanation(explanation);
      if (problems.length > 0) return rejected(problems);
      return { status: "EXPLAINED", explanation, issues: [] };
    } catch (error) {
      return rejected([{ field: "explanation", message: `The explanation could not be built: ${reason(error)}` }]);
    }
  }

  function render(input: unknown): RenderedDecisionExplanation {
    const outcome = explain(input);
    const explanation = outcome.explanation;
    if (explanation === null) {
      return { outcome, short: null, compact: null, detailed: null, sections: [], json: null, machine: null, view: null };
    }
    return {
      outcome,
      short: formatter.formatShortSummary(explanation),
      compact: formatter.formatCompact(explanation),
      detailed: formatter.formatDetailed(explanation),
      sections: formatter.formatSections(explanation),
      json: formatter.toJson(explanation),
      machine: formatter.toMachineReadable(explanation),
      view: formatter.toViewModel(explanation),
    };
  }

  return { builder, formatter, validator, validate: (input) => validator.validateInput(input), explain, render };
}
