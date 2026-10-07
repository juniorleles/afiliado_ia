/**
 * Traffic Explanation Engine.
 *
 * Explains a Traffic Analysis in words a person can read. It validates the
 * input, builds the structured explanation, checks what it built, and hands it
 * back frozen. It can also render it: a compact report, a detailed report, a
 * section breakdown, JSON, and a UI view model.
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
import type { TrafficIssue } from "./traffic-validator";
import { freezeDeepTraffic } from "./traffic-signal-context";
import {
  createTrafficExplanationBuilder,
  type TrafficExplanationBuilder,
  type TrafficExplanationBuilderOptions,
} from "./traffic-explanation-builder";
import {
  createTrafficExplanationFormatter,
  type MachineReadableTrafficExplanation,
  type TrafficExplanationFormatter,
  type TrafficExplanationViewModel,
} from "./traffic-explanation-formatter";
import { createTrafficExplanationValidator, type TrafficExplanationValidator } from "./traffic-explanation-validator";
import type { TrafficExplanation, TrafficExplanationInput, TrafficExplanationOutcome } from "./traffic-explanation-result";

export interface TrafficExplanationEngineOptions {
  builder?: TrafficExplanationBuilder;
  builderOptions?: TrafficExplanationBuilderOptions;
  formatter?: TrafficExplanationFormatter;
  validator?: TrafficExplanationValidator;
  /** Milliseconds from any fixed point. Injectable so tests are deterministic. */
  now?: () => number;
}

/** An explanation and every way it can be shown. Every view is null when the input was rejected. */
export interface RenderedTrafficExplanation {
  outcome: TrafficExplanationOutcome;
  short: string | null;
  compact: string | null;
  detailed: string | null;
  sections: string[];
  json: string | null;
  machine: MachineReadableTrafficExplanation | null;
  view: TrafficExplanationViewModel | null;
}

export interface TrafficExplanationEngine {
  readonly builder: TrafficExplanationBuilder;
  readonly formatter: TrafficExplanationFormatter;
  readonly validator: TrafficExplanationValidator;
  /** What would be rejected, without explaining anything. */
  validate(input: unknown): TrafficIssue[];
  explain(input: unknown): TrafficExplanationOutcome;
  render(input: unknown): RenderedTrafficExplanation;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createTrafficExplanationEngine(options: TrafficExplanationEngineOptions = {}): TrafficExplanationEngine {
  const builder = options.builder ?? createTrafficExplanationBuilder(options.builderOptions);
  const formatter = options.formatter ?? createTrafficExplanationFormatter();
  const validator = options.validator ?? createTrafficExplanationValidator();
  const now = options.now ?? (() => performance.now());

  const rejected = (issues: TrafficIssue[]): TrafficExplanationOutcome => ({ status: "REJECTED", explanation: null, issues });

  function explain(input: unknown): TrafficExplanationOutcome {
    try {
      const started = now();
      const issues = validator.validateInput(input);
      if (issues.length > 0) return rejected(issues);

      const built = builder.build(input as TrafficExplanationInput);
      const elapsed = now() - started;
      const explanation: TrafficExplanation = freezeDeepTraffic({ ...built, executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0 });

      const problems = validator.validateExplanation(explanation);
      if (problems.length > 0) return rejected(problems);
      return { status: "EXPLAINED", explanation, issues: [] };
    } catch (error) {
      return rejected([{ field: "explanation", message: `The explanation could not be built: ${reason(error)}` }]);
    }
  }

  function render(input: unknown): RenderedTrafficExplanation {
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
