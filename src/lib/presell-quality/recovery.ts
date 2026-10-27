import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import { createProductResearchJob, executeProductResearch } from "@/lib/product-research/run";
import { readLatestProductResearch } from "@/lib/product-research/store";
import type { FieldProposal, ProductResearchRun } from "@/lib/product-research/types";
import type { FetchPageFn } from "@/lib/lp-generator/research";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { classifyQualityGaps, type QualityGapReport } from "@/lib/presell-quality/gaps";
import { coverageGapsFromProposals } from "@/lib/product-research/gaps";
import { stageImageCandidates, type ImageRecoveryCandidate } from "@/lib/presell-quality/asset-recovery";
import { calibrateQualityEvaluator, type CalibrationReport } from "@/lib/presell-quality/calibration";
import { proposeEditorialPlan, type EditorialPlan } from "@/lib/presell-quality/editorial-plan";
import type { PresellQualityAssessment } from "@/lib/presell-quality/types";

export type FactCandidate = {
  field: string;
  text: string;
  sourceUrl: string | null;
  sourceClass: string | null;
  excerpt: string | null;
  collectedAt: string | null;
  verification: string | null;
  usable: boolean;
  approvedForUse: false;
  blockReason: string | null;
  duplicateOf: string | null;
};

export type SourceRecoveryRecord = {
  url: string;
  ok: boolean;
  sourceClass: string | null;
  sourceType: string | null;
  extractionMode: string | null;
};

export type QualityRecoveryResult = {
  campaignId: number;
  fingerprint: string;
  skippedAsRedundant: boolean;
  gaps: QualityGapReport;
  researchRunId: string | null;
  researchStatus: "NOT_RUN" | "COMPLETED" | "FAILED" | "SKIPPED" | "NEED_URL";
  newSources: string[];
  sourceRecords: SourceRecoveryRecord[];
  researchLimitations: string[];
  coverageGaps: string[];
  factCandidates: FactCandidate[];
  factsVerified: number;
  factsApprovedForUse: 0;
  blockedFacts: FactCandidate[];
  imageCandidates: ImageRecoveryCandidate[];
  heroEligibleImages: number;
  assetApprovalsChanged: false;
  editorialPlan: EditorialPlan;
  contentRegeneration: "NOT_AUTHORIZED" | "NOT_NEEDED" | "BLOCKED_PENDING_FACTS";
  calibration: CalibrationReport;
  nextAction: "PRESENTATION" | "RESEARCH" | "ASSETS" | "CALIBRATE" | "BLOCK";
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
  blockers: string[];
};

function keyOf(field: string, text: string): string {
  return `${field}|${text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export function validateFactCandidate(input: {
  proposal: FieldProposal;
  accepted: FieldProposal[];
}): FactCandidate {
  const text = (input.proposal.suggestedValue || input.proposal.currentValue).replace(/\s+/g, " ").trim();
  const acceptedSame = input.accepted.find((item) => item.field === input.proposal.field);
  const acceptedKey = acceptedSame ? keyOf(acceptedSame.field, acceptedSame.currentValue || acceptedSame.suggestedValue) : null;
  const nextKey = keyOf(input.proposal.field, text);
  const editorial = text ? classifyEditorialText({ text, role: input.proposal.field === "howItWorks" ? "USAGE" : "OTHER" }) : null;
  let blockReason: string | null = null;
  if (!text) blockReason = "Empty extract.";
  else if (editorial?.classification === "MEDICAL_OR_HEALTH_CLAIM") blockReason = "Medical or health claim is not restated as a product fact.";
  else if (input.proposal.status === "ACCEPTED") blockReason = "Already accepted. Recovery does not rewrite approved facts.";
  else if (acceptedKey && acceptedKey !== nextKey && input.proposal.field === acceptedSame?.field) {
    blockReason = "Conflicts with an accepted fact. The accepted text is preserved.";
  }
  const duplicateOf = acceptedKey && acceptedKey === nextKey ? acceptedSame!.field : null;
  const seller = input.proposal.sourceClass === "SELLER" || input.proposal.sourceClass === "AFFILIATE_RESOURCE";
  const usable =
    !blockReason &&
    !duplicateOf &&
    Boolean(text) &&
    input.proposal.status !== "REJECTED" &&
    input.proposal.status !== "NOT_FOUND";
  return {
    field: input.proposal.field,
    text,
    sourceUrl: input.proposal.sourceUrl,
    sourceClass: input.proposal.sourceClass,
    excerpt: input.proposal.evidenceExcerpt ?? text.slice(0, 280),
    collectedAt: input.proposal.collectedAt,
    verification: seller ? "SELLER_STATED" : input.proposal.verification,
    usable,
    approvedForUse: false,
    blockReason: duplicateOf ? "Duplicate of an accepted fact." : blockReason,
    duplicateOf,
  };
}

function recoveryFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "recovery-54ac.json");
}

export function readRecoveryResult(campaignId: number): QualityRecoveryResult | null {
  const file = recoveryFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as QualityRecoveryResult;
  } catch {
    return null;
  }
}

export function writeRecoveryResult(result: QualityRecoveryResult): QualityRecoveryResult {
  mkdirSync(path.dirname(recoveryFile(result.campaignId)), { recursive: true });
  writeFileSync(recoveryFile(result.campaignId), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export type QualityRecoveryDeps = {
  research?: (campaignId: number) => Promise<ProductResearchRun | null>;
  fetchPage?: FetchPageFn;
};

async function defaultResearch(campaignId: number, fetchPage?: FetchPageFn): Promise<ProductResearchRun | null> {
  const job = createProductResearchJob({ campaignId });
  if (job.status === "NEED_URL" || job.status === "COMPLETED") return job;
  return executeProductResearch({ campaignId, runId: job.runId, fetchPage });
}

export async function runAutonomousRecovery(input: {
  campaignId: number;
  assessment: PresellQualityAssessment | null;
  previousAssessment?: PresellQualityAssessment | null;
  run?: ProductResearchRun | null;
}, deps: QualityRecoveryDeps = {}): Promise<QualityRecoveryResult> {
  const before = input.run ?? readLatestProductResearch(input.campaignId);
  const gaps = classifyQualityGaps({
    assessment: input.assessment,
    run: before,
    previousScore: input.previousAssessment?.overallScore ?? null,
  });
  const prior = readRecoveryResult(input.campaignId);
  if (prior && prior.fingerprint === gaps.fingerprint) {
    const calibration = calibrateQualityEvaluator({
      first: input.previousAssessment ?? input.assessment,
      second: input.assessment,
    });
    return writeRecoveryResult({ ...prior, skippedAsRedundant: true, calibration });
  }

  const coverageGaps = coverageGapsFromProposals(before?.proposals);
  const evidenceGaps = gaps.gaps.some((item) => item.kind === "EVIDENCE_GAP" && item.autoRecoverable && item.resolution === "OPEN");
  const reuseCompletedResearch =
    !deps.research &&
    prior?.researchStatus === "COMPLETED" &&
    prior.gaps.assessmentId === gaps.assessmentId &&
    prior.coverageGaps.join("|") === coverageGaps.join("|");
  let after = before;
  let researchStatus: QualityRecoveryResult["researchStatus"] = "SKIPPED";
  if (evidenceGaps && reuseCompletedResearch && prior) {
    after = readLatestProductResearch(input.campaignId) ?? before;
    researchStatus = prior.researchStatus;
  } else if (evidenceGaps) {
    const researched = deps.research
      ? await deps.research(input.campaignId)
      : await defaultResearch(input.campaignId, deps.fetchPage);
    after = researched ?? before;
    researchStatus =
      researched?.status === "COMPLETED"
        ? "COMPLETED"
        : researched?.status === "NEED_URL"
          ? "NEED_URL"
          : researched?.status === "FAILED"
            ? "FAILED"
            : "SKIPPED";
  }

  const accepted = acceptedProposals(after);
  const beforeAccepted = new Set(acceptedProposals(before).map((item) => item.field));
  const factCandidates = (after?.proposals ?? [])
    .filter((item) => !beforeAccepted.has(item.field) || item.status !== "ACCEPTED")
    .map((proposal) => validateFactCandidate({ proposal, accepted: acceptedProposals(before) }));
  const newSources = [...new Set((after?.sources ?? []).map((item) => item.url).filter((url) => !(before?.sources ?? []).some((row) => row.url === url)))];
  const images = stageImageCandidates({
    assets: after?.discoveredAssets,
    productName: after?.productName || "Product",
    campaignId: input.campaignId,
  });
  const media = selectReviewMedia({
    assets: after?.discoveredAssets,
    productName: after?.productName || "Product",
    campaignId: input.campaignId,
  });
  const editorialPlan = proposeEditorialPlan({ run: after, media });
  const calibration = calibrateQualityEvaluator({ first: input.previousAssessment ?? input.assessment, second: input.assessment });
  const usableNew = factCandidates.filter((item) => item.usable);
  const blockedFacts = factCandidates.filter((item) => !item.usable);
  const exhaustedEvidence = researchStatus === "COMPLETED" && usableNew.length === 0;
  const resolvedGaps: QualityGapReport = {
    ...gaps,
    gaps: gaps.gaps.map((item) => {
      if (!exhaustedEvidence || item.kind !== "EVIDENCE_GAP" || item.resolution !== "OPEN") return item;
      return {
        ...item,
        autoRecoverable: false,
        resolution: "BLOCKED" as const,
        observedEvidence: [
          ...item.observedEvidence,
          "Gap-fill research completed. Same-host pages produced no usable new extracts.",
        ],
        proposedAction: "Do not repeat the same-host fetch. Independent proof is outside the current research policy.",
      };
    }),
  };
  const blockers = [
    ...resolvedGaps.gaps.filter((item) => item.resolution === "BLOCKED" || item.resolution === "NEEDS_HUMAN").map((item) => item.proposedAction),
    ...(usableNew.length ? ["New fact candidates are pending human acceptance. They were not auto-approved."] : []),
    ...(images.heroEligibleCount === 0 ? ["No hero-eligible packshot. Gallery images were not promoted."] : []),
    ...(exhaustedEvidence ? ["Seller-host pages were fetched. They did not yield warnings, FAQ, benefits, pricing, or manufacturer extracts that can be used."] : []),
  ];

  const result: QualityRecoveryResult = {
    campaignId: input.campaignId,
    fingerprint: gaps.fingerprint,
    skippedAsRedundant: false,
    gaps: resolvedGaps,
    researchRunId: after?.runId ?? prior?.researchRunId ?? null,
    researchStatus: researchStatus === "SKIPPED" && prior?.researchStatus === "COMPLETED" ? prior.researchStatus : researchStatus,
    newSources: newSources.length ? newSources : prior?.newSources ?? [],
    sourceRecords: (after?.sources ?? []).map((item) => ({
      url: item.url,
      ok: item.ok,
      sourceClass: item.sourceClass ?? null,
      sourceType: item.sourceType ?? null,
      extractionMode: item.extractionMode ?? null,
    })),
    researchLimitations: after?.limitations ?? [],
    coverageGaps,
    factCandidates,
    factsVerified: factCandidates.filter((item) => item.verification && item.verification !== "UNVERIFIED" && item.usable).length,
    factsApprovedForUse: 0,
    blockedFacts,
    imageCandidates: images.candidates,
    heroEligibleImages: images.heroEligibleCount,
    assetApprovalsChanged: false,
    editorialPlan,
    contentRegeneration: usableNew.length
      ? "BLOCKED_PENDING_FACTS"
      : editorialPlan.canRegenerateFromAcceptedFacts && images.heroEligibleCount > 0
        ? "NOT_NEEDED"
        : "NOT_AUTHORIZED",
    calibration,
    nextAction: nextQualityAction(resolvedGaps),
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    blockers,
  };
  return writeRecoveryResult(result);
}

export function nextQualityAction(report: QualityGapReport): "PRESENTATION" | "RESEARCH" | "ASSETS" | "CALIBRATE" | "BLOCK" {
  if (report.gaps.some((item) => item.kind === "SOURCE_AUTHORIZATION_GAP" && item.resolution === "BLOCKED") && report.gaps.every((item) => item.kind === "SOURCE_AUTHORIZATION_GAP" || item.kind === "MODEL_EVALUATION_UNCERTAINTY")) {
    return "BLOCK";
  }
  if (report.gaps.some((item) => item.kind === "EVIDENCE_GAP" && item.autoRecoverable && item.resolution === "OPEN")) return "RESEARCH";
  if (report.gaps.some((item) => item.kind === "IMAGE_AVAILABILITY_GAP" || item.kind === "IMAGE_ELIGIBILITY_GAP")) return "ASSETS";
  if (report.gaps.some((item) => item.kind === "MODEL_EVALUATION_UNCERTAINTY")) return "CALIBRATE";
  if (report.gaps.some((item) => item.kind === "PRESENTATION_GAP" && item.resolution === "OPEN")) return "PRESENTATION";
  return "BLOCK";
}
