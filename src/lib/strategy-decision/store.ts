import { getDb } from "@/lib/db";
import { APPROACH_IDS, type StrategyDecision } from "@/lib/strategy-decision/decide";

function isDecision(value: unknown): value is StrategyDecision {
  if (typeof value !== "object" || value === null) return false;
  const row = value as StrategyDecision;
  return typeof row.recommendedApproach === "string"
    && (APPROACH_IDS as readonly string[]).includes(row.approachId)
    && typeof row.confidence === "number"
    && Array.isArray(row.reasoning)
    && typeof row.adDirection === "string"
    && typeof row.validationNotes === "string";
}

export function readStoredStrategyDecision(campaignId: number): StrategyDecision | null {
  const row = getDb().prepare("SELECT strategyDecisionJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { strategyDecisionJson: string | null }
    | undefined;
  if (!row?.strategyDecisionJson) return null;
  try {
    const parsed = JSON.parse(row.strategyDecisionJson) as unknown;
    return isDecision(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredStrategyDecision(campaignId: number, decision: StrategyDecision): void {
  getDb().prepare("UPDATE campaigns SET strategyDecisionJson = ? WHERE id = ?").run(JSON.stringify(decision), campaignId);
}
