import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PresellQualityAssessment } from "@/lib/presell-quality/types";

export function qualityAssessmentRoot(): string {
  const override = process.env.AIA_PRESELL_QUALITY_ROOT;
  if (override) return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  return path.join(process.cwd(), "data", "presell-quality");
}

function fileOf(campaignId: number, assessmentId: string): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), `${assessmentId}.json`);
}

export type QualityIndexRecord = {
  campaignId: number;
  latestAssessmentId: string;
  generationId: string | null;
  inputFingerprint: string | null;
};

export function writeQualityAssessment(assessment: PresellQualityAssessment): PresellQualityAssessment {
  const dir = path.join(qualityAssessmentRoot(), String(assessment.campaignId));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileOf(assessment.campaignId, assessment.assessmentId), `${JSON.stringify(assessment, null, 2)}\n`);
  writeFileSync(
    path.join(dir, "index.json"),
    `${JSON.stringify(
      {
        campaignId: assessment.campaignId,
        latestAssessmentId: assessment.assessmentId,
        generationId: assessment.generationId,
        inputFingerprint: assessment.inputFingerprint ?? null,
      } satisfies QualityIndexRecord,
      null,
      2,
    )}\n`,
  );
  return assessment;
}

export function readQualityAssessment(campaignId: number, assessmentId: string): PresellQualityAssessment | null {
  const file = fileOf(campaignId, assessmentId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as PresellQualityAssessment;
    return parsed.campaignId === campaignId ? parsed : null;
  } catch {
    return null;
  }
}

export function readLatestQualityAssessment(campaignId: number): PresellQualityAssessment | null {
  const indexFile = path.join(qualityAssessmentRoot(), String(campaignId), "index.json");
  if (!existsSync(indexFile)) return null;
  try {
    const index = JSON.parse(readFileSync(indexFile, "utf8")) as QualityIndexRecord;
    if (!index.latestAssessmentId) return null;
    return readQualityAssessment(campaignId, index.latestAssessmentId);
  } catch {
    return null;
  }
}

export function listQualityAssessments(campaignId: number): PresellQualityAssessment[] {
  const dir = path.join(qualityAssessmentRoot(), String(campaignId));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith("pqa-") && name.endsWith(".json"))
    .map((name) => readQualityAssessment(campaignId, name.replace(/\.json$/, "")))
    .filter((item): item is PresellQualityAssessment => Boolean(item));
}

export function findCachedQualityAssessment(campaignId: number, inputFingerprint: string): PresellQualityAssessment | null {
  const latest = readLatestQualityAssessment(campaignId);
  if (!latest) return null;
  if (latest.inputFingerprint !== inputFingerprint) return null;
  if (latest.assessmentStatus === "EVALUATION_FAILED" || latest.assessmentStatus === "NOT_EVALUATED") return null;
  return latest;
}

export function assessmentIsCurrent(assessment: PresellQualityAssessment, input: { generationId: string; inputFingerprint: string }): boolean {
  return assessment.generationId === input.generationId && assessment.inputFingerprint === input.inputFingerprint;
}
