/**
 * Decision Intelligence Engine: resolver contract.
 *
 * Interface only. The resolver is the planned composition point: a read-only
 * context in, a recorded analysis out. It does not execute actions, create a
 * campaign, publish a page, or emit an execution plan. No implementation
 * ships in this step.
 */
import type { DecisionContext } from "./decision-analysis";
import type { DecisionEngineDependencies } from "./decision-engine";
import type { DecisionAnalysis } from "./decision-types";

export interface DecisionResolverDependencies extends DecisionEngineDependencies {}

export interface DecisionResolver {
  /** Reads the context by id and returns a recorded analysis. */
  resolve(context: DecisionContext): Promise<DecisionAnalysis>;
}
