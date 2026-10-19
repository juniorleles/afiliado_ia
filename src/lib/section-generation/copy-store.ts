import { getDb } from "@/lib/db";
import type { CopyScores } from "@/lib/section-generation/types";

export type CopyGeneration = {
  version: 1;
  campaignId: number;
  generatedAt: string;
  averageGenerationTimeMs: number;
  sections: Array<{
    sectionId: string;
    promptId: string;
    status: "GENERATED" | "FAILED";
    scores: CopyScores;
    generationTime: number;
    cached: boolean;
  }>;
};

function isCopy(value: unknown): value is CopyGeneration {
  if (typeof value !== "object" || value === null) return false;
  const row = value as CopyGeneration;
  return row.version === 1 && typeof row.campaignId === "number" && Array.isArray(row.sections);
}

export function readStoredCopyGeneration(campaignId: number): CopyGeneration | null {
  const row = getDb().prepare("SELECT copyGenerationJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { copyGenerationJson: string | null }
    | undefined;
  if (!row?.copyGenerationJson) return null;
  try {
    const parsed = JSON.parse(row.copyGenerationJson) as unknown;
    return isCopy(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredCopyGeneration(campaignId: number, bundle: CopyGeneration): void {
  getDb().prepare("UPDATE campaigns SET copyGenerationJson = ? WHERE id = ?").run(JSON.stringify(bundle), campaignId);
}
