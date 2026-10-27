import { QUALITY_DIMENSIONS, QUALITY_PROMPT_VERSION, type PresellQualityAssessment, type QualityDimension } from "@/lib/presell-quality/types";

export type CalibrationFinding = {
  code: string;
  message: string;
  dimension?: QualityDimension | "CRITICAL";
};

export type CalibrationReport = {
  promptVersion: string;
  screenshotGenerationAligned: boolean;
  mobilePresent: boolean;
  dimensionsScored: number;
  sandboxTreatedAsLiveHop: boolean;
  missingPackshotPunishedAcrossDimensions: boolean;
  transparencyMisread: boolean;
  scoreDelta: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  findings: CalibrationFinding[];
  promptAdjustments: string[];
};

export function calibrateQualityEvaluator(input: {
  first: PresellQualityAssessment | null;
  second?: PresellQualityAssessment | null;
}): CalibrationReport {
  const first = input.first;
  const second = input.second ?? null;
  const findings: CalibrationFinding[] = [];
  const blob = [first, second]
    .filter(Boolean)
    .flatMap((item) => [
      ...item!.findings.map((row) => row.message),
      ...item!.dimensionScores.map((row) => row.rationale),
      ...item!.recommendedActions.map((row) => row.action),
    ])
    .join("\n");

  const screenshotGenerationAligned = Boolean(
    first?.generationId &&
      first.screenshotHashes?.length === 2 &&
      (!second || second.generationId === first.generationId),
  );
  const mobilePresent = Boolean(first?.mobileScreenshotReference || second?.mobileScreenshotReference);
  const dimensionsScored = Math.max(
    first?.dimensionScores.filter((row) => QUALITY_DIMENSIONS.includes(row.dimension)).length ?? 0,
    second?.dimensionScores.filter((row) => QUALITY_DIMENSIONS.includes(row.dimension)).length ?? 0,
  );
  const sandboxTreatedAsLiveHop =
    /sandbox/i.test(blob) && /misleading|live hop|commercial hop|purchase cta without|commercial status/i.test(blob);
  const packshotMentions = (blob.match(/packshot|hero section (contains no|lacks|is missing)/gi) ?? []).length;
  const lowAcross = QUALITY_DIMENSIONS.filter((dimension) => {
    const row = (second ?? first)?.dimensionScores.find((item) => item.dimension === dimension);
    return (row?.score ?? 100) <= 20;
  });
  const missingPackshotPunishedAcrossDimensions = packshotMentions >= 2 && lowAcross.length >= 4;
  const transparencyMisread = [first, second].some((item) =>
    Boolean(
      item?.dimensionScores.find(
        (row) => row.dimension === "TRANSPARENCY_LEGIBILITY" && /sandbox/i.test(row.rationale) && row.score <= 20,
      ),
    ),
  );
  const scoreDelta =
    first?.overallScore != null && second?.overallScore != null ? second.overallScore - first.overallScore : null;

  if (!screenshotGenerationAligned) {
    findings.push({ code: "SCREENSHOT_BINDING", message: "Screenshots must stay bound to the same generationId." });
  }
  if (!mobilePresent) {
    findings.push({ code: "MOBILE_MISSING", message: "Mobile screenshot is required for a valid evaluation." });
  }
  if (dimensionsScored < 6) {
    findings.push({ code: "DIMENSION_COVERAGE", message: "Not all six rubric dimensions were scored." });
  }
  if (sandboxTreatedAsLiveHop) {
    findings.push({
      code: "SANDBOX_AS_LIVE",
      dimension: "TRANSPARENCY_LEGIBILITY",
      message: "SANDBOX labeling was read as a live commercial hop.",
    });
  }
  if (missingPackshotPunishedAcrossDimensions) {
    findings.push({
      code: "PACKSHOT_SPILLOVER",
      dimension: "DESIGN_HIERARCHY",
      message: "A missing ineligible packshot spilled into unrelated dimensions.",
    });
  }
  if (transparencyMisread) {
    findings.push({
      code: "TRANSPARENCY_SANDBOX",
      dimension: "TRANSPARENCY_LEGIBILITY",
      message: "Transparency was penalized for a correctly labeled sandbox CTA.",
    });
  }
  if (scoreDelta != null && scoreDelta <= 0 && Math.abs(scoreDelta) <= 2) {
    findings.push({
      code: "NOISE_DELTA",
      message: `Score changed by ${scoreDelta}. That is within evaluator noise and is not a content regression.`,
    });
  }

  return {
    promptVersion: QUALITY_PROMPT_VERSION,
    screenshotGenerationAligned,
    mobilePresent,
    dimensionsScored,
    sandboxTreatedAsLiveHop,
    missingPackshotPunishedAcrossDimensions,
    transparencyMisread,
    scoreDelta,
    confidence: findings.some((item) => item.code === "PACKSHOT_SPILLOVER" || item.code === "SANDBOX_AS_LIVE") ? "LOW" : "MEDIUM",
    findings,
    promptAdjustments: [
      "Do not treat a labeled SANDBOX CTA as a live hop.",
      "Do not zero unrelated dimensions because no hero-eligible packshot exists.",
      "Score an information-first hero on typography and facts, not on a forbidden image promotion.",
    ],
  };
}
