import { getDb } from "@/lib/db";

export type LandingGenerationOutcome = "success" | "error";

export type LandingGenerationRecord = {
  id: number;
  campaignId: number;
  createdAt: string;
  strategy: string;
  language: string;
  model: string;
  durationMs: number;
  result: LandingGenerationOutcome;
  error: string | null;
};

type LandingGenerationInsert = Omit<LandingGenerationRecord, "id">;

type HistoryRow = {
  id: number;
  campaignId: number;
  createdAt: string;
  strategy: string;
  language: string;
  model: string;
  durationMs: number;
  result: string;
  error: string | null;
};

function outcome(value: string): LandingGenerationOutcome {
  return value === "success" ? "success" : "error";
}

export function recordLandingGeneration(entry: LandingGenerationInsert): void {
  getDb()
    .prepare(
      `INSERT INTO landing_generation_history
        (campaignId, createdAt, strategy, language, model, durationMs, result, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.campaignId,
      entry.createdAt,
      entry.strategy,
      entry.language,
      entry.model,
      Math.max(0, Math.round(entry.durationMs)),
      entry.result,
      entry.error,
    );
}

export function listLandingGenerations(campaignId: number): LandingGenerationRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, campaignId, createdAt, strategy, language, model, durationMs, result, error
       FROM landing_generation_history
       WHERE campaignId = ?
       ORDER BY id DESC`,
    )
    .all(campaignId) as HistoryRow[];
  return rows.map((row) => ({ ...row, result: outcome(row.result) }));
}
