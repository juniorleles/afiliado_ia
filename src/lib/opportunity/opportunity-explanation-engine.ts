/**
 * Opportunity Explanation Engine.
 *
 * Explains an Opportunity Analysis in words a person can read. It validates
 * the input, builds the structured explanation, checks what it built, and
 * hands it back frozen. It can also render it: a short summary, a detailed
 * text, a section breakdown, a machine-readable object, and a UI view model.
 *
 * It explains; it does not decide. It calculates no score, changes no
 * analysis, ranks nothing, recommends nothing, and generates no text with a
 * model. It makes no HTTP request, reads no ProductFacts, and persists
 * nothing. It never throws: an input it cannot explain is rejected with the
 * reasons.
 *
 * The only clock is an injectable `now`; its default measures elapsed time and
 * is the only time source in the engine. Everything else is deterministic, so
 * the same input always gives the same explanation, apart from executionTime.
 */
import type { OpportunityIssue } from "./opportunity-validator";
import { freezeDeep } from "./opportunity-signal-context";
import {
  createExplanationBuilder,
  type ExplanationBuilder,
  type ExplanationBuilderOptions,
} from "./opportunity-explanation-builder";
import {
  createExplanationFormatter,
  type ExplanationFormatter,
  type ExplanationViewModel,
  type MachineReadableExplanation,
} from "./opportunity-explanation-formatter";
import { createExplanationValidator, type OpportunityExplanationValidator } from "./opportunity-explanation-validator";
import type { ExplanationOutcome, OpportunityExplanation, OpportunityExplanationInput } from "./opportunity-explanation-result";

export interface OpportunityExplanationEngineOptions {
  builder?: ExplanationBuilder;
  builderOptions?: ExplanationBuilderOptions;
  formatter?: ExplanationFormatter;
  validator?: OpportunityExplanationValidator;
  /** Milliseconds from any fixed point. Injectable so tests are deterministic. */
  now?: () => number;
}

/** An explanation and every way it can be shown. Every view is null when the input was rejected. */
export interface RenderedExplanation {
  outcome: ExplanationOutcome;
  short: string | null;
  detailed: string | null;
  sections: string[];
  machine: MachineReadableExplanation | null;
  view: ExplanationViewModel | null;
}

export interface OpportunityExplanationEngine {
  readonly builder: ExplanationBuilder;
  readonly formatter: ExplanationFormatter;
  readonly validator: OpportunityExplanationValidator;
  /** What would be rejected, without explaining anything. */
  validate(input: unknown): OpportunityIssue[];
  explain(input: unknown): ExplanationOutcome;
  render(input: unknown): RenderedExplanation;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createOpportunityExplanationEngine(options: OpportunityExplanationEngineOptions = {}): OpportunityExplanationEngine {
  const builder = options.builder ?? createExplanationBuilder(options.builderOptions);
  const formatter = options.formatter ?? createExplanationFormatter();
  const validator = options.validator ?? createExplanationValidator();
  const now = options.now ?? (() => performance.now());

  const rejected = (issues: OpportunityIssue[]): ExplanationOutcome => ({ status: "REJECTED", explanation: null, issues });

  function explain(input: unknown): ExplanationOutcome {
    try {
      const started = now();
      const issues = validator.validateInput(input);
      if (issues.length > 0) return rejected(issues);

      const built = builder.build(input as OpportunityExplanationInput);
      const elapsed = now() - started;
      const explanation: OpportunityExplanation = freezeDeep({ ...built, executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0 });

      // What the builder produced is checked like anything else: an explanation that fails is not handed out.
      const problems = validator.validateExplanation(explanation);
      if (problems.length > 0) return rejected(problems);
      return { status: "EXPLAINED", explanation, issues: [] };
    } catch (error) {
      return rejected([{ field: "explanation", message: `The explanation could not be built: ${reason(error)}` }]);
    }
  }

  function render(input: unknown): RenderedExplanation {
    const outcome = explain(input);
    const explanation = outcome.explanation;
    if (explanation === null) return { outcome, short: null, detailed: null, sections: [], machine: null, view: null };
    return {
      outcome,
      short: formatter.formatShortSummary(explanation),
      detailed: formatter.formatDetailed(explanation),
      sections: formatter.formatSections(explanation),
      machine: formatter.toMachineReadable(explanation),
      view: formatter.toViewModel(explanation),
    };
  }

  return { builder, formatter, validator, validate: (input) => validator.validateInput(input), explain, render };
}
