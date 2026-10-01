/**
 * Decision Resolver: execution recorder.
 *
 * The rule pipeline returns one result per enabled rule. The recorder keeps
 * those results, in the order they were heard, so the Resolver can put them
 * in the snapshot and so a later check can see that each rule ran exactly
 * once. The recorder never runs a rule.
 *
 * Wire it once: pass the recorder to the pipeline. The pipeline empties it
 * just before the dimensions run and takes what it holds just after. One
 * recorder belongs to one running pipeline at a time.
 *
 * It copies what it hears, never changes it, and never interprets a result.
 */
import type { DecisionRuleCategory, DecisionRuleRunResult } from "./decision-rule-contract";
import { freezeDeepDecisionRule } from "./decision-rule-context";
import type { RecordedDecisionExecution } from "./decision-resolver-analysis";

export interface DecisionExecutionRecorder {
  /** Keep one result as it was returned. Does not run the rule. */
  record(result: DecisionRuleRunResult, category: DecisionRuleCategory): void;
  /** Rule ids that were heard more than once since the last drain. */
  repeats(): string[];
  /** Returns what was heard since the last drain, in the order it was heard, and forgets it. */
  drain(): RecordedDecisionExecution[];
}

export function createDecisionExecutionRecorder(): DecisionExecutionRecorder {
  let heard: RecordedDecisionExecution[] = [];
  let repeated: string[] = [];
  return {
    record(result, category) {
      if (heard.some((entry) => entry.ruleId === result.ruleId) && !repeated.includes(result.ruleId)) {
        repeated.push(result.ruleId);
      }
      heard.push(
        freezeDeepDecisionRule({
          ruleId: result.ruleId,
          category,
          status: result.status,
          executionTime: result.executionTime,
        }),
      );
    },
    repeats: () => [...repeated],
    drain() {
      const taken = heard;
      heard = [];
      repeated = [];
      return taken;
    },
  };
}
