/**
 * Host record domain: pause and resume rules engine.
 *
 * One entry point from recommendations, a performance report, campaign
 * metrics, and operational rules to a frozen action plan. A refused run
 * stores nothing. Pending actions stay unexecuted. This method never
 * throws and never changes the supplied records.
 */
import { buildActionPlan } from "./action-plan-builder";
import type { RuleMetadata } from "./rule-context";
import { evaluateOperationalRules } from "./rule-evaluator";
import { createRuleSnapshot, createRuleStatistics, freezeDeepRules, type RuleResult, type RuleSnapshot } from "./rule-snapshot";
import { OPERATIONAL_RULE_KINDS } from "./rule-types";
import { createRuleValidator, isFlatRuleMetadata, type RuleValidator } from "./rule-validator";

export type RuleClock = () => number;
export type RuleTimestamp = () => string;
export type RuleIdFactory = () => string;

export interface PauseResumeRulesEngineOptions {
  now?: RuleClock;
  timestamp?: RuleTimestamp;
  idFactory?: RuleIdFactory;
  validator?: RuleValidator;
}

export interface PauseResumeRulesEngine {
  readonly validator: RuleValidator;
  evaluate(input: unknown): RuleResult;
  getSnapshot(actionPlanId: string): RuleSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createPauseResumeRulesEngine(options: PauseResumeRulesEngineOptions = {}): PauseResumeRulesEngine {
  const validator = options.validator ?? createRuleValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `action-plan-${++serial}`);
  const snapshots = new Map<string, RuleSnapshot>();

  return {
    validator,
    evaluate(input) {
      const started = now();
      const refused = (issues: RuleResult["issues"], metadata: RuleMetadata = {}): RuleResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepRules({
          status: "REJECTED",
          issues,
          actionPlan: null,
          pendingActions: null,
          evidence: null,
          statistics: createRuleStatistics({ ruleCount: 0, matchedRuleCount: 0, pendingActionCount: 0, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues);
        const view = validator.parseInput(input);
        if (view === null) return refused([{ field: "recommendationSet", message: "Corrupted Snapshot: the rule context could not be read." }]);
        const checked = evaluateOperationalRules(view);
        const built = buildActionPlan(view, checked);
        const executionTime = Math.max(0, now() - started);
        const statistics = createRuleStatistics({
          ruleCount: OPERATIONAL_RULE_KINDS.length,
          matchedRuleCount: checked.filter((item) => item.state === "matched").length,
          pendingActionCount: built.pendingActions.length,
          issueCount: 0,
          executionTime,
        });
        const metadata = isRecord(input) && isFlatRuleMetadata(input.executionMetadata) ? { ...input.executionMetadata } : {};
        const snapshot = createRuleSnapshot({
          actionPlanId: idFactory(),
          campaignResourceName: view.campaign.resourceName,
          campaignId: view.campaign.campaignId,
          status: view.campaign.status,
          outcome: built.outcome,
          pendingActions: built.pendingActions,
          evidence: built.evidence,
          statistics,
          createdAt: timestamp(),
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, snapshot.metadata);
        snapshots.set(snapshot.actionPlanId, snapshot);
        return freezeDeepRules({
          status: "OK",
          issues: [],
          actionPlan: snapshot.actionPlan,
          pendingActions: snapshot.pendingActions,
          evidence: snapshot.evidence,
          statistics: snapshot.statistics,
          snapshot,
          metadata: snapshot.metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "operationalRules", message: "Corrupted Snapshot: the action plan could not be restated." }]);
      }
    },
    getSnapshot: (actionPlanId) => snapshots.get(actionPlanId) ?? null,
  };
}
