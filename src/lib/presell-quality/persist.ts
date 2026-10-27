import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export function writeQualityAssessment(assessment: PresellQualityAssessment): PresellQualityAssessment {
  const dir = path.join(qualityAssessmentRoot(), String(assessment.campaignId));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileOf(assessment.campaignId, assessment.assessmentId), `${JSON.stringify(assessment, null, 2)}\n`);
  writeFileSync(
    path.join(dir, "index.json"),
    `${JSON.stringify({ campaignId: assessment.campaignId, latestAssessmentId: assessment.assessmentId }, null, 2)}\n`,
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
