import type { PresellQualityAssessment, QualityDimension } from "@/lib/presell-quality/types";

const PACKSHOT = /packshot|hero image|product (photo|image)|missing (an )?image/i;

export type DoublePenaltyReport = {
  detected: boolean;
  sharedProblem: string | null;
  dimensions: QualityDimension[];
  notes: string[];
};

export function detectDoublePenalty(assessment: Pick<PresellQualityAssessment, "dimensionScores" | "findings">): DoublePenaltyReport {
  const packshotDims = assessment.dimensionScores.filter(
    (row) => PACKSHOT.test(row.rationale) && row.score <= 65 && row.dimension !== "IMAGES_COMPOSITION",
  );
  const imageRow = assessment.dimensionScores.find((row) => row.dimension === "IMAGES_COMPOSITION");
  const imageAlso = Boolean(imageRow && PACKSHOT.test(imageRow.rationale) && imageRow.score <= 65);
  const findingDims = assessment.findings
    .filter((item) => PACKSHOT.test(`${item.message} ${item.evidence.join(" ")}`))
    .map((item) => item.dimension)
    .filter((item): item is QualityDimension => item !== "CRITICAL");
  const dimensions = [...new Set([...packshotDims.map((row) => row.dimension), ...(imageAlso ? (["IMAGES_COMPOSITION"] as const) : []), ...findingDims])];
  const detected = imageAlso && packshotDims.length > 0;
  return {
    detected,
    sharedProblem: detected ? "missing-packshot" : null,
    dimensions,
    notes: detected
      ? [`Missing packshot was scored on IMAGES_COMPOSITION and ${packshotDims.map((row) => row.dimension).join(", ")}.`]
      : [],
  };
}

export function scoreDelta(first: number | null, second: number | null): number | null {
  if (first == null || second == null) return null;
  return second - first;
}
