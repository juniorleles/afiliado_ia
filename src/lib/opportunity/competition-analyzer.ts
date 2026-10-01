/**
 * Competition Signal: analyzer.
 *
 * A pure function. For each requested dimension it asks one question: does the
 * research evidence show anything for it? The answer is AVAILABLE or MISSING.
 * Nothing is weighed, ranked, scored, or recommended.
 *
 * Where the evidence comes from:
 *  - Only the RESEARCH item of the merged evidence, which the platform's own
 *    market research produced. The analyzer reads the classification, the
 *    classification reason, and the promotional flag that research already
 *    recorded on each source. It never reclassifies from a hostname, a path,
 *    or a name, and it knows no marketplace, brand, or product.
 *  - Only usable sources count. A source that research marked unusable is not
 *    evidence of anything.
 *  - The candidate's own page is not a competitor and is left out.
 *  - Research that is UNAVAILABLE supplies no evidence, so every dimension is
 *    MISSING. Closed evidence is never filled in from elsewhere.
 *
 * MISSING means no evidence was found. It does not mean the competition is
 * absent: research may simply not have reached it. The result says so.
 *
 * Confidence is the share of the checked dimensions that the evidence covers.
 * It describes how much of the picture is evidenced, not how strong the
 * competition is, and it is not a score.
 */
import type { MarketEvidence, MarketResearchReport } from "@/lib/market-research/types";
import type { OpportunityMetadata } from "./opportunity-types";
import {
  COMPETITION_DIMENSIONS,
  type CompetitionDimension,
  type CompetitionInputs,
  type CompetitionResult,
} from "./competition-result";
import { validateCompetitionInputs } from "./competition-validator";

export class CompetitionInputError extends Error {
  readonly issues: ReadonlyArray<{ field: string; message: string }>;
  constructor(issues: ReadonlyArray<{ field: string; message: string }>) {
    super(`Invalid competition inputs: ${issues.map((i) => `${i.field}: ${i.message}`).join("; ")}`);
    this.name = "CompetitionInputError";
    this.issues = issues;
  }
}

export type CompetitionClock = () => number;
const defaultClock: CompetitionClock = () => performance.now();

/**
 * The reason the platform's classifier gives to a source it recognised as an
 * affiliate or seller platform. A test compares it with the classifier.
 */
export const SELLER_PLATFORM_REASON = "seller-platform";

const ABSENCE_NOTE = "Missing means no evidence was found for the dimension. It does not mean the competition is absent.";
const PROVENANCE_NOTE =
  "Presence is read from research sources the platform classified and marked usable. A seller claim or a source's own wording is not independently verified.";

interface Basis {
  readonly describes: string;
  count(competitors: readonly MarketEvidence[], signals: MarketResearchReport["signals"]): number;
}

const countWhere = (list: readonly MarketEvidence[], test: (source: MarketEvidence) => boolean) => list.filter(test).length;
const intents = (signals: MarketResearchReport["signals"], kind: string) =>
  signals.observedIntents.filter((intent) => intent.kind === kind).length;

const BASES: Record<CompetitionDimension, Basis> = {
  SEARCH_PRESENCE: {
    describes: "usable research sources other than the candidate's own page",
    count: (competitors) => competitors.length,
  },
  MARKETPLACE_PRESENCE: {
    describes: "usable sources classified as retailer",
    count: (competitors) => countWhere(competitors, (s) => s.classification === "RETAILER"),
  },
  BRAND_STRENGTH: {
    describes: "usable sources classified as brand",
    count: (competitors) => countWhere(competitors, (s) => s.classification === "BRAND"),
  },
  AFFILIATE_AVAILABILITY: {
    describes: "usable seller sources the classifier recognised as an affiliate or seller platform",
    count: (competitors) =>
      countWhere(competitors, (s) => s.classification === "SELLER" && s.classificationReason === SELLER_PLATFORM_REASON),
  },
  CONTENT_SATURATION: {
    describes: "educational and buyer-guide results plus usable editorial sources",
    count: (competitors, signals) =>
      signals.educationalResults + signals.buyerGuideResults + countWhere(competitors, (s) => s.classification === "EDITORIAL"),
  },
  LANDING_PAGE_AVAILABILITY: {
    describes: "usable sources classified as seller",
    count: (competitors) => countWhere(competitors, (s) => s.classification === "SELLER"),
  },
  PRICING_VISIBILITY: {
    describes: "observed price-concern intents",
    count: (_competitors, signals) => intents(signals, "PRICE_CONCERN"),
  },
  REVIEW_AVAILABILITY: {
    describes: "review-oriented results plus observed review intents",
    count: (_competitors, signals) => signals.reviewOrientedResults + intents(signals, "REVIEW_INTENT"),
  },
  AUTHORITY_PRESENCE: {
    describes: "usable editorial sources that are not promotional",
    count: (competitors) => countWhere(competitors, (s) => s.classification === "EDITORIAL" && !s.promotional),
  },
  ADVERTISING_PRESENCE: {
    describes: "usable sources flagged promotional",
    count: (competitors) => countWhere(competitors, (s) => s.promotional),
  },
};

/** Same location ignoring the fragment and trailing slashes; null when the text is not a URL. */
function locationKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return null;
  }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function analyzeCompetition(inputs: CompetitionInputs, now: CompetitionClock = defaultClock): CompetitionResult {
  const started = now();
  const issues = validateCompetitionInputs(inputs);
  if (issues.length > 0) throw new CompetitionInputError(issues);

  const requested = new Set(inputs.dimensions ?? COMPETITION_DIMENSIONS);
  const evaluated = COMPETITION_DIMENSIONS.filter((dimension) => requested.has(dimension));
  const notEvaluated = COMPETITION_DIMENSIONS.filter((dimension) => !requested.has(dimension));

  const item = inputs.evidence.items.RESEARCH ?? null;
  const report = (item?.payload ?? null) as MarketResearchReport | null;
  const warnings: string[] = [];

  let competitors: readonly MarketEvidence[] = [];
  let excludedOwnPageCount = 0;
  let usableCount = 0;
  let usingResearch = false;

  if (report === null) {
    warnings.push("No research evidence was collected for this candidate, so every dimension is missing.");
  } else if (report.status === "UNAVAILABLE") {
    warnings.push("Research is unavailable for this candidate, so it supplies no evidence and every dimension is missing.");
  } else {
    usingResearch = true;
    if (report.status === "STALE") warnings.push("Research is stale; the evidence may be out of date.");
    if (report.quality === "LOW" || report.quality === "INSUFFICIENT") {
      warnings.push(`Research quality is ${report.quality}; absent dimensions may reflect thin research.`);
    }
    const usable = report.sources.filter((source) => source.usable);
    usableCount = usable.length;
    const own = locationKey(inputs.candidate.url);
    competitors = usable.filter((source) => own === null || locationKey(source.url) !== own);
    excludedOwnPageCount = usable.length - competitors.length;
    if (report.diversity.USABLE_SOURCES !== usable.length) {
      warnings.push(
        `Research reports ${report.diversity.USABLE_SOURCES} usable sources but lists ${usable.length}; the listed sources were used.`,
      );
    }
    const promotional = usable.filter((source) => source.promotional).length;
    if (report.diversity.PROMOTIONAL_SOURCES !== promotional) {
      warnings.push(
        `Research reports ${report.diversity.PROMOTIONAL_SOURCES} promotional sources but lists ${promotional}; the listed sources were used.`,
      );
    }
  }

  const available: CompetitionDimension[] = [];
  const missing: CompetitionDimension[] = [];
  const metadata: OpportunityMetadata = {};
  for (const dimension of evaluated) {
    const count = usingResearch && report !== null ? BASES[dimension].count(competitors, report.signals) : 0;
    (count > 0 ? available : missing).push(dimension);
    metadata[`dimension.${dimension}`] = count > 0 ? "AVAILABLE" : "MISSING";
    metadata[`count.${dimension}`] = count;
    metadata[`basis.${dimension}`] = BASES[dimension].describes;
  }

  metadata.candidateId = inputs.candidate.id;
  metadata.candidateSource = inputs.candidate.source;
  metadata.researchStatus = report?.status ?? "NONE";
  metadata.researchQuality = report?.quality ?? "NONE";
  if (item !== null) {
    metadata["provider.RESEARCH"] = item.providerId;
    metadata["providerVersion.RESEARCH"] = item.providerVersion;
  }
  metadata.usableSourceCount = usableCount;
  metadata.excludedOwnPageCount = excludedOwnPageCount;
  metadata.evaluatedCount = evaluated.length;
  metadata.availableCount = available.length;
  metadata.missingCount = missing.length;
  metadata.availableDimensions = available.join(",");
  metadata.missingDimensions = missing.join(",");
  if (notEvaluated.length > 0) metadata.notEvaluated = notEvaluated.join(",");
  metadata.absenceNote = ABSENCE_NOTE;
  metadata.provenanceNote = PROVENANCE_NOTE;
  for (const [key, value] of Object.entries(inputs.metadata ?? {})) metadata[`input.${key}`] = value;

  // Provider and framework warnings travel with the result so provenance survives.
  for (const warning of inputs.evidence.warnings) warnings.push(warning);

  return {
    status: "COMPLETED",
    confidence: available.length === 0 ? null : round3(available.length / evaluated.length),
    availableDimensions: available,
    missingDimensions: missing,
    warnings,
    metadata,
    executionTime: Math.max(0, now() - started),
  };
}
