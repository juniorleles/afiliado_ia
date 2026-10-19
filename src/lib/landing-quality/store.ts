import { getDb } from "@/lib/db";
import type { AutoFixHistory, LandingQuality } from "@/lib/landing-quality/types";

function isQuality(value: unknown): value is LandingQuality {
  if (typeof value !== "object" || value === null) return false;
  const row = value as LandingQuality;
  return row.version === 1
    && typeof row.campaignId === "number"
    && typeof row.validatedAt === "string"
    && typeof row.durationMs === "number"
    && (row.stoppedBecause === "overall" || row.stoppedBecause === "attempts" || row.stoppedBecause === "evidence")
    && typeof row.score?.overall === "number"
    && Array.isArray(row.problems)
    && Array.isArray(row.approvedSections);
}

function isHistory(value: unknown): value is AutoFixHistory {
  if (typeof value !== "object" || value === null) return false;
  const row = value as AutoFixHistory;
  return row.version === 1 && typeof row.campaignId === "number" && Array.isArray(row.entries);
}

export function readStoredLandingQuality(campaignId: number): LandingQuality | null {
  const row = getDb().prepare("SELECT landingQualityJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { landingQualityJson: string | null }
    | undefined;
  if (!row?.landingQualityJson) return null;
  try {
    const parsed = JSON.parse(row.landingQualityJson) as unknown;
    return isQuality(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredLandingQuality(campaignId: number, quality: LandingQuality): void {
  getDb().prepare("UPDATE campaigns SET landingQualityJson = ? WHERE id = ?").run(JSON.stringify(quality), campaignId);
}

export function readStoredAutoFixHistory(campaignId: number): AutoFixHistory | null {
  const row = getDb().prepare("SELECT autoFixHistoryJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { autoFixHistoryJson: string | null }
    | undefined;
  if (!row?.autoFixHistoryJson) return null;
  try {
    const parsed = JSON.parse(row.autoFixHistoryJson) as unknown;
    return isHistory(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredAutoFixHistory(campaignId: number, history: AutoFixHistory): void {
  getDb().prepare("UPDATE campaigns SET autoFixHistoryJson = ? WHERE id = ?").run(JSON.stringify(history), campaignId);
}
