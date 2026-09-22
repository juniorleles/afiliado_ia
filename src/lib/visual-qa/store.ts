import { getDb } from "@/lib/db";
import type { VisualQaReport } from "@/lib/visual-qa/types";

export type StoredVisualQaRow = {
  id: number;
  campaignId: number;
  slug: string;
  template: string;
  status: string;
  reportJson: string;
  createdAt: string;
};

export function saveVisualQaReport(report: VisualQaReport): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO visual_qa_reports (campaignId, slug, template, status, reportJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      report.campaignId,
      report.slug,
      report.template,
      report.status,
      JSON.stringify(report),
      report.createdAt,
    );
  return Number(result.lastInsertRowid);
}

export function getLatestVisualQaReport(campaignId: number): VisualQaReport | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT reportJson FROM visual_qa_reports WHERE campaignId = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(campaignId) as { reportJson: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.reportJson) as VisualQaReport;
  } catch {
    return null;
  }
}

export function parseStoredReport(json: string): VisualQaReport | null {
  try {
    const parsed = JSON.parse(json) as VisualQaReport;
    if (parsed?.version !== 1 || !parsed.status) return null;
    return parsed;
  } catch {
    return null;
  }
}
