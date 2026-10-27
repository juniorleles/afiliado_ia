import { measureEvaluatorConsistency, EVALUATOR_VARIATION_LIMIT } from "@/lib/presell-quality/consistency";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET, type AssessmentStatus, type PresellQualityAssessment } from "@/lib/presell-quality/types";

export const ASSESSMENT_VALIDITY_VERSION = "1" as const;
export const DISPERSION_LIMIT = EVALUATOR_VARIATION_LIMIT;

export const ASSESSMENT_VALIDITY_STATES = [
  "SCHEMA_INVALID",
  "INPUT_BINDING_INVALID",
  "TRANSPORT_FAILURE",
  "VALID_ASSESSMENT",
  "VALID_BUT_DISCORDANT",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type AssessmentValidityState = (typeof ASSESSMENT_VALIDITY_STATES)[number];

export const SCHEMA_ERROR_CODES = ["INVALID_JSON", "MISSING_DIMENSION", "SCORE_OUT_OF_RANGE", "INVALID_ENUM"] as const;
export const BINDING_ERROR_CODES = [
  "SCREENSHOT_MISSING",
  "SCREENSHOT_GENERATION_MISMATCH",
  "SCREENSHOT_HASH_MISMATCH",
  "HERO_IMAGE_NOT_LOADED",
  "IMAGE_NOT_LOADED",
] as const;
export const TRANSPORT_ERROR_CODES = [
  "TIMEOUT",
  "HTTP_ERROR",
  "PROVIDER_ERROR",
  "API_KEY_MISSING",
  "PAID_AI_BLOCKED",
  "PROVIDER_UNAVAILABLE",
  "MODEL_NOT_MULTIMODAL",
  "PERSISTENCE_FAILED",
] as const;

const SCHEMA = new Set<string>(SCHEMA_ERROR_CODES);
const BINDING = new Set<string>(BINDING_ERROR_CODES);
const TRANSPORT = new Set<string>(TRANSPORT_ERROR_CODES);

export type AssessmentValidityReport = {
  protocolVersion: typeof ASSESSMENT_VALIDITY_VERSION;
  state: AssessmentValidityState;
  assessmentId: string | null;
  generationId: string | null;
  overallScore: number | null;
  errorCode: string | null;
  discardable: boolean;
  discardReason: string | null;
  notes: string[];
};

export function classifyAssessmentValidity(input: {
  assessment?: PresellQualityAssessment | null;
  errorCode?: string | null;
  imageLoaded?: boolean;
  truncated?: boolean;
}): AssessmentValidityReport {
  const assessment = input.assessment ?? null;
  const code = input.errorCode ?? assessment?.errorCode ?? null;
  const notes: string[] = [];
  const base = {
    protocolVersion: ASSESSMENT_VALIDITY_VERSION,
    assessmentId: assessment?.assessmentId ?? null,
    generationId: assessment?.generationId ?? null,
    overallScore: assessment?.overallScore ?? null,
    errorCode: code,
  };

  if (input.imageLoaded === false) {
    return {
      ...base,
      state: "INPUT_BINDING_INVALID",
      discardable: true,
      discardReason: "Required product image did not load in the captured page.",
      notes,
    };
  }
  if (input.truncated) {
    return {
      ...base,
      state: "SCHEMA_INVALID",
      discardable: true,
      discardReason: "Model response was truncated before a complete JSON object.",
      notes: ["Truncation is an objective schema failure, not a low score."],
    };
  }
  if (code && SCHEMA.has(code)) {
    return { ...base, state: "SCHEMA_INVALID", discardable: true, discardReason: code, notes };
  }
  if (code && BINDING.has(code)) {
    return { ...base, state: "INPUT_BINDING_INVALID", discardable: true, discardReason: code, notes };
  }
  if (code && TRANSPORT.has(code)) {
    return { ...base, state: "TRANSPORT_FAILURE", discardable: true, discardReason: code, notes };
  }
  if (!assessment) {
    return { ...base, state: "INSUFFICIENT_EVIDENCE", discardable: false, discardReason: null, notes: ["No assessment record was supplied."] };
  }
  if (assessment.assessmentStatus === "EVALUATION_FAILED") {
    return {
      ...base,
      state: code ? "INSUFFICIENT_EVIDENCE" : "INSUFFICIENT_EVIDENCE",
      discardable: true,
      discardReason: code ?? "EVALUATION_FAILED",
      notes: ["Failed evaluation without a classified schema, binding, or transport code."],
    };
  }
  if (
    assessment.assessmentStatus === "NOT_EVALUATED" ||
    assessment.assessmentStatus === "EVALUATION_PENDING" ||
    assessment.overallScore == null ||
    !assessment.dimensionScores.length
  ) {
    return {
      ...base,
      state: "INSUFFICIENT_EVIDENCE",
      discardable: false,
      discardReason: null,
      notes: ["A missing or incomplete score is not a quality result."],
    };
  }
  notes.push("A low score alone is not an objective discard reason.");
  return { ...base, state: "VALID_ASSESSMENT", discardable: false, discardReason: null, notes };
}

export function medianScore(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor((sorted.length - 1) / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  return Math.round(((sorted[mid] ?? 0) + (sorted[mid + 1] ?? 0)) / 2);
}

export function scoreDispersion(values: number[]): {
  count: number;
  min: number | null;
  max: number | null;
  range: number | null;
  median: number | null;
  mean: number | null;
} {
  if (!values.length) return { count: 0, min: null, max: null, range: null, median: null, mean: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  return { count: values.length, min, max, range: max - min, median: medianScore(values), mean };
}

function bindingKey(assessment: PresellQualityAssessment): string {
  return `${assessment.generationId ?? ""}|${[...(assessment.screenshotHashes ?? [])].sort().join(",")}`;
}

export type AggregatedAssessments = {
  protocolVersion: typeof ASSESSMENT_VALIDITY_VERSION;
  dispersionLimit: typeof DISPERSION_LIMIT;
  generationId: string | null;
  screenshotHashes: string[];
  members: AssessmentValidityReport[];
  validScores: number[];
  discarded: AssessmentValidityReport[];
  dispersion: ReturnType<typeof scoreDispersion>;
  unstable: boolean;
  reliabilityStatus: "STABLE" | "EVALUATOR_UNSTABLE" | "INSUFFICIENT_EVIDENCE";
  officialScore: number | null;
  officialStatus: AssessmentStatus;
  mixedGenerations: boolean;
};

export function aggregateValidAssessments(assessments: Array<PresellQualityAssessment | null>): AggregatedAssessments {
  const present = assessments.filter((item): item is PresellQualityAssessment => Boolean(item));
  const generations = new Set(present.map((item) => item.generationId).filter(Boolean));
  const mixedGenerations = generations.size > 1;
  const comparable = present.filter((item) => item.generationId && item.generationId === present[0]?.generationId);
  const groups = new Map<string, PresellQualityAssessment[]>();
  for (const item of comparable) {
    const key = bindingKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const validGroups = [...groups.values()].filter((group) =>
    group.some((item) => classifyAssessmentValidity({ assessment: item }).state === "VALID_ASSESSMENT"),
  );
  const sameBinding = validGroups[0] ?? comparable;
  const hashes = [...(sameBinding[0]?.screenshotHashes ?? [])].sort();
  const members = sameBinding.map((item) => classifyAssessmentValidity({ assessment: item }));
  const discarded = members.filter((item) => item.discardable);
  const valid = members.filter((item) => item.state === "VALID_ASSESSMENT" || item.state === "VALID_BUT_DISCORDANT");
  const validScores = valid.map((item) => item.overallScore).filter((score): score is number => score != null);
  const dispersion = scoreDispersion(validScores);
  const unstable = validScores.length >= 2 && (dispersion.range ?? 0) > DISPERSION_LIMIT;
  if (unstable) {
    for (const member of members) {
      if (member.state === "VALID_ASSESSMENT") member.state = "VALID_BUT_DISCORDANT";
    }
  }
  const officialScore = dispersion.median;
  let officialStatus: AssessmentStatus = "NOT_EVALUATED";
  let reliabilityStatus: AggregatedAssessments["reliabilityStatus"] = "INSUFFICIENT_EVIDENCE";
  if (!validScores.length) {
    officialStatus = discarded.length ? "EVALUATION_FAILED" : "NOT_EVALUATED";
  } else if (unstable) {
    reliabilityStatus = "EVALUATOR_UNSTABLE";
    officialStatus = "QUALITY_REJECTED";
  } else {
    reliabilityStatus = "STABLE";
    officialStatus = officialScore != null && officialScore >= QUALITY_TARGET ? "QUALITY_PASSED" : "QUALITY_REJECTED";
  }

  return {
    protocolVersion: ASSESSMENT_VALIDITY_VERSION,
    dispersionLimit: DISPERSION_LIMIT,
    generationId: comparable[0]?.generationId ?? null,
    screenshotHashes: hashes,
    members,
    validScores,
    discarded,
    dispersion,
    unstable,
    reliabilityStatus,
    officialScore,
    officialStatus,
    mixedGenerations,
  };
}

export type EvaluatorDiagnosis = {
  protocolVersion: typeof ASSESSMENT_VALIDITY_VERSION;
  first: AssessmentValidityReport;
  second: AssessmentValidityReport | null;
  consistency: ReturnType<typeof measureEvaluatorConsistency> | null;
  aggregate: AggregatedAssessments;
  sameScreenshots: boolean;
  sameGeneration: boolean;
  samePrompt: boolean;
  sameRubric: boolean;
  lowScoreAloneInvalid: false;
  rootCause: AssessmentValidityState | "UNEXPLAINED_EVALUATOR_VARIANCE";
  notes: string[];
};

export function diagnoseEvaluatorPair(input: {
  first: PresellQualityAssessment | null;
  second?: PresellQualityAssessment | null;
  firstImageLoaded?: boolean;
  secondImageLoaded?: boolean;
  firstTruncated?: boolean;
  secondTruncated?: boolean;
}): EvaluatorDiagnosis {
  const first = classifyAssessmentValidity({
    assessment: input.first,
    imageLoaded: input.firstImageLoaded,
    truncated: input.firstTruncated,
  });
  const second = input.second
    ? classifyAssessmentValidity({
        assessment: input.second,
        imageLoaded: input.secondImageLoaded,
        truncated: input.secondTruncated,
      })
    : null;
  const consistency =
    input.first && input.second
      ? measureEvaluatorConsistency({ first: input.first, second: input.second, variationLimit: DISPERSION_LIMIT })
      : null;
  const aggregate = aggregateValidAssessments([input.first, input.second ?? null]);
  if (aggregate.unstable) {
    if (first.state === "VALID_ASSESSMENT") first.state = "VALID_BUT_DISCORDANT";
    if (second?.state === "VALID_ASSESSMENT") second.state = "VALID_BUT_DISCORDANT";
  }
  const sameScreenshots = Boolean(consistency?.screenshotHashesMatch);
  const sameGeneration = Boolean(consistency?.generationIdsMatch);
  const samePrompt = (input.first?.promptVersion ?? QUALITY_PROMPT_VERSION) === (input.second?.promptVersion ?? input.first?.promptVersion ?? QUALITY_PROMPT_VERSION);
  const sameRubric = (input.first?.rubricVersion ?? QUALITY_RUBRIC_VERSION) === (input.second?.rubricVersion ?? input.first?.rubricVersion ?? QUALITY_RUBRIC_VERSION);
  const notes: string[] = [
    "A low completed score is preserved as VALID_ASSESSMENT until compared with another valid score of the same screenshots.",
    "Automatic discard requires schema, binding, or transport failure.",
  ];
  let rootCause: EvaluatorDiagnosis["rootCause"] = first.state;
  if (first.state === "VALID_ASSESSMENT" && second?.state === "VALID_ASSESSMENT" && aggregate.unstable && sameScreenshots && sameGeneration) {
    rootCause = "VALID_BUT_DISCORDANT";
    notes.push("Two valid host-scored assessments of the same screenshots exceeded the versioned dispersion limit.");
  } else if (first.state === "VALID_ASSESSMENT" && second && second.state !== "VALID_ASSESSMENT" && second.state !== "VALID_BUT_DISCORDANT") {
    rootCause = first.state;
  } else if (first.discardable) {
    rootCause = first.state;
  } else if (aggregate.unstable && !sameScreenshots) {
    rootCause = "UNEXPLAINED_EVALUATOR_VARIANCE";
    notes.push("Scores diverged but screenshot binding could not be proven identical.");
  }

  return {
    protocolVersion: ASSESSMENT_VALIDITY_VERSION,
    first,
    second,
    consistency,
    aggregate,
    sameScreenshots,
    sameGeneration,
    samePrompt,
    sameRubric,
    lowScoreAloneInvalid: false,
    rootCause,
    notes,
  };
}
