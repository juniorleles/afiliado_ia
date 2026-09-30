import { getDb } from "@/lib/db";
import type { CompletenessReport } from "@/lib/product-completeness";

export type CompletenessHistoryPoint = {
  analyzedAt: string;
  totalScore: number;
  importerScore: number;
  manualScore: number;
  status: string;
};

function signature(report: CompletenessReport): string {
  return JSON.stringify({
    totalScore: report.totalScore,
    importerScore: report.importerScore,
    manualScore: report.manualScore,
    health: report.health,
    categories: report.categories.map((category) => [
      category.id,
      category.status,
      category.completion,
      category.origin,
      category.details,
    ]),
  });
}

/** Appends a snapshot when the analysis changed. Does not write product facts. */
export function recordCompletenessAnalysis(campaignId: number, report: CompletenessReport): void {
  if (!Number.isInteger(campaignId) || campaignId < 1) return;
  const next = signature(report);
  const previous = getDb()
    .prepare(
      `SELECT reportJson FROM campaign_completeness_analyses
       WHERE campaignId = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(campaignId) as { reportJson: string } | undefined;
  if (previous) {
    try {
      const stored = JSON.parse(previous.reportJson) as CompletenessReport;
      if (signature(stored) === next) return;
    } catch {
      // A damaged snapshot is replaced by the new analysis.
    }
  }
  getDb()
    .prepare(
      `INSERT INTO campaign_completeness_analyses
        (campaignId, analyzedAt, totalScore, importerScore, manualScore, status, reportJson)
       VALUES (@campaignId, @analyzedAt, @totalScore, @importerScore, @manualScore, @status, @reportJson)`,
    )
    .run({
      campaignId,
      analyzedAt: new Date().toISOString(),
      totalScore: report.totalScore,
      importerScore: report.importerScore,
      manualScore: report.manualScore,
      status: report.health,
      reportJson: JSON.stringify(report),
    });
}

export function listCompletenessHistory(campaignId: number): CompletenessHistoryPoint[] {
  const rows = getDb()
    .prepare(
      `SELECT analyzedAt, totalScore, importerScore, manualScore, status
       FROM campaign_completeness_analyses
       WHERE campaignId = ?
       ORDER BY id ASC`,
    )
    .all(campaignId) as CompletenessHistoryPoint[];
  return rows;
}
