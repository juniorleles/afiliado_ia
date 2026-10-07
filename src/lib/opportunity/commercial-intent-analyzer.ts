/**
 * Commercial Intent Signal: analyzer.
 *
 * A pure function. For each requested dimension it asks one question: did any
 * provider report an observation for it? The answer is AVAILABLE or MISSING.
 * Nothing is weighed, ranked, scored, or recommended.
 *
 * Channel-agnostic by construction: the analyzer never looks at which channel
 * a provider speaks for when deciding anything. The channel is listed in the
 * metadata as provenance, so a reader can see where the evidence came from.
 * Adding a channel changes no code here.
 *
 * Where the evidence comes from:
 *  - Only the observations providers reported, already validated against the
 *    provider contract. The analyzer interprets no text, parses no keyword,
 *    and fills nothing in.
 *  - An observation for a dimension that is not being checked is ignored.
 *
 * MISSING means no evidence was found. It does not mean there is no
 * commercial intent: a provider may simply not have looked.
 *
 * Confidence is the share of the checked dimensions that the evidence covers.
 * It describes how much of the picture is evidenced, not how strong the intent
 * is, and it is not a score.
 */
import type { OpportunityMetadata } from "./opportunity-types";
import {
  COMMERCIAL_INTENT_DIMENSIONS,
  COMMERCIAL_INTENT_DIMENSION_MEANINGS,
  type CommercialIntentDimension,
  type CommercialIntentInputs,
  type CommercialIntentResult,
} from "./commercial-intent-result";
import { validateCommercialIntentInputs } from "./commercial-intent-validator";

export class CommercialIntentInputError extends Error {
  readonly issues: ReadonlyArray<{ field: string; message: string }>;
  constructor(issues: ReadonlyArray<{ field: string; message: string }>) {
    super(`Invalid commercial intent inputs: ${issues.map((i) => `${i.field}: ${i.message}`).join("; ")}`);
    this.name = "CommercialIntentInputError";
    this.issues = issues;
  }
}

export type CommercialIntentClock = () => number;
const defaultClock: CommercialIntentClock = () => performance.now();

const ABSENCE_NOTE = "Missing means no evidence was found for the dimension. It does not mean there is no commercial intent.";
const PROVENANCE_NOTE =
  "Observations are what a provider reported a source said. They are not independently verified, and a seller's own claim is not proof.";

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function analyzeCommercialIntent(inputs: CommercialIntentInputs, now: CommercialIntentClock = defaultClock): CommercialIntentResult {
  const started = now();
  const issues = validateCommercialIntentInputs(inputs);
  if (issues.length > 0) throw new CommercialIntentInputError(issues);

  const requested = new Set(inputs.dimensions ?? COMMERCIAL_INTENT_DIMENSIONS);
  const evaluated = COMMERCIAL_INTENT_DIMENSIONS.filter((dimension) => requested.has(dimension));
  const notEvaluated = COMMERCIAL_INTENT_DIMENSIONS.filter((dimension) => !requested.has(dimension));

  const observations = inputs.sources.flatMap((source) =>
    source.payload.observations.map((observation) => ({ dimension: observation.dimension, channel: source.payload.channel })),
  );
  const warnings: string[] = [];
  if (inputs.sources.length === 0) {
    warnings.push("No commercial intent evidence was collected for this candidate, so every dimension is missing.");
  } else if (observations.length === 0) {
    warnings.push("Providers collected evidence but reported no observations, so every dimension is missing.");
  }

  const available: CommercialIntentDimension[] = [];
  const missing: CommercialIntentDimension[] = [];
  const metadata: OpportunityMetadata = {};
  for (const dimension of evaluated) {
    const matching = observations.filter((observation) => observation.dimension === dimension);
    (matching.length > 0 ? available : missing).push(dimension);
    metadata[`dimension.${dimension}`] = matching.length > 0 ? "AVAILABLE" : "MISSING";
    metadata[`count.${dimension}`] = matching.length;
    metadata[`channels.${dimension}`] = [...new Set(matching.map((observation) => observation.channel))].sort().join(",");
    metadata[`basis.${dimension}`] = COMMERCIAL_INTENT_DIMENSION_MEANINGS[dimension];
  }

  metadata.candidateId = inputs.candidate.id;
  metadata.candidateSource = inputs.candidate.source;
  metadata.providers = inputs.sources.map((source) => source.providerId).join(",");
  metadata.providerVersions = inputs.sources.map((source) => `${source.providerId}@${source.providerVersion}`).join(",");
  metadata.channels = [...new Set(inputs.sources.map((source) => source.payload.channel))].sort().join(",");
  metadata.sourceCount = inputs.sources.length;
  metadata.observationCount = observations.length;
  metadata.evaluatedCount = evaluated.length;
  metadata.availableCount = available.length;
  metadata.missingCount = missing.length;
  metadata.availableDimensions = available.join(",");
  metadata.missingDimensions = missing.join(",");
  if (notEvaluated.length > 0) metadata.notEvaluated = notEvaluated.join(",");
  metadata.absenceNote = ABSENCE_NOTE;
  metadata.provenanceNote = PROVENANCE_NOTE;
  for (const [key, value] of Object.entries(inputs.metadata ?? {})) metadata[`input.${key}`] = value;

  // Collection warnings travel with the result so provenance survives.
  for (const warning of inputs.warnings ?? []) warnings.push(warning);

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
