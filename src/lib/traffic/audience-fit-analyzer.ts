/**
 * Audience Fit Signal: analyzer.
 *
 * A pure function: the same inputs always give the same result, apart from the
 * measured time. It reads the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, the configuration, and the supplied
 * content (the Evidence Context, the Landing Page Structure, and the effective
 * manual overrides) and nothing else. It makes no HTTP request, calls no
 * platform, uses no AI, and changes none of its inputs.
 *
 * How it decides. It never classifies the product into an audience. For each
 * enabled profile and each of the twelve dimensions it reaches one verdict:
 *  - availability comes from the profile's status and the configuration;
 *  - a STRUCTURAL dimension that is absent makes the profile INCOMPATIBLE;
 *  - a CONTEXTUAL dimension that is absent is only not assessed, because
 *    evidence not being found is not evidence that a profile does not fit;
 *  - a dimension is present when an Opportunity source reports it strong, when
 *    a visible landing-page section of a mapped kind exists, or when a mapped
 *    field has non-empty text. The words themselves are never classified.
 * A profile is unsupported when any verdict is INCOMPATIBLE or the profile is
 * unavailable, and supported otherwise. There is no score, ranking, weight,
 * classification, or recommendation: both lists are sorted by id, and the
 * confidence is the share of applicable pairs that could be established.
 *
 * Every outside reference here is a type-only import.
 */
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";
import {
  AUDIENCE_DIMENSIONS,
  AUDIENCE_FIT_SCOPE_NOTE,
  AUDIENCE_INPUT_KEYS,
  type AudienceDimension,
  type AudienceFitContent,
  type AudienceFitResult,
  type AudienceVerdict,
} from "./audience-fit-result";
import type { AudienceDimensionSources, AudienceProfile } from "./audience-profile-definitions";
import { splitProfileList } from "./audience-fit-validator";
import { readOpportunityDimensions, type DimensionState } from "./traffic-dimension-reader";
import type { TrafficMetadata } from "./traffic-types";

export type AudienceFitClock = () => number;
const defaultClock: AudienceFitClock = () => performance.now();

export interface AudienceFitInputs {
  opportunityAnalysis: Readonly<ResolvedOpportunityAnalysis>;
  opportunityExplanation: Readonly<OpportunityExplanation> | null;
  executionMetadata: Readonly<TrafficMetadata>;
  configuration: Readonly<TrafficMetadata>;
  profiles: readonly AudienceProfile[];
  dimensionSources: AudienceDimensionSources;
  /** Null when no content was supplied. */
  content: AudienceFitContent | null;
  /** Registry-disabled profile ids; they are not assessed. */
  skippedProfiles?: readonly string[];
}

type NeedState = "SATISFIED" | "PARTIAL" | "ABSENT" | "UNKNOWN";

const isScalar = (value: unknown): value is string | number | boolean | null => value === null || ["string", "number", "boolean"].includes(typeof value);
const hasText = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";

function opportunityStateOf(sources: readonly string[], states: ReadonlyMap<string, DimensionState>): { state: NeedState; conflict: boolean } {
  const reported = sources.map((dimension) => states.get(dimension)).filter((state): state is DimensionState => state !== undefined);
  if (reported.length === 0) return { state: "UNKNOWN", conflict: false };
  const conflict = reported.includes("STRONG") && reported.includes("MISSING");
  if (reported.includes("STRONG")) return { state: "SATISFIED", conflict };
  if (reported.some((state) => state === "WEAK" || state === "NEUTRAL")) return { state: "PARTIAL", conflict };
  return { state: "ABSENT", conflict };
}

export function analyzeAudienceFit(inputs: AudienceFitInputs, now: AudienceFitClock = defaultClock): AudienceFitResult {
  const start = now();
  const { opportunityAnalysis: analysis, opportunityExplanation: explanation, dimensionSources, content } = inputs;
  const warnings: string[] = [];
  const reading = readOpportunityDimensions(analysis, explanation);

  const overrides = content?.manualOverrides ?? [];
  const overriddenFields = new Set(overrides.map((override) => override.field));
  const presentFields = new Set<string>();
  let superseded = 0;
  let ignoredOverrides = 0;
  for (const item of content?.evidenceContext?.items ?? []) {
    if (item.field != null && overriddenFields.has(item.field)) {
      superseded += 1;
      continue;
    }
    if (item.field != null && hasText(item.text)) presentFields.add(item.field);
  }
  const visibleKinds = new Set<string>();
  for (const section of content?.landingPage?.sections ?? []) {
    if (!section.visible) continue;
    if (section.field != null && overriddenFields.has(section.field)) {
      superseded += 1;
      continue;
    }
    visibleKinds.add(section.kind.toLowerCase());
    if (section.field != null && section.texts.some((text) => hasText(text))) presentFields.add(section.field);
  }
  for (const override of overrides) {
    if (!hasText(override.value)) {
      if (typeof override.value !== "string") ignoredOverrides += 1;
      continue;
    }
    presentFields.add(override.field);
  }
  const landingPageSupplied = content?.landingPage != null;

  const needStates = new Map<AudienceDimension, NeedState>();
  const conflicted: AudienceDimension[] = [];
  const structured: AudienceDimension[] = [];
  for (const dimension of AUDIENCE_DIMENSIONS) {
    const source = dimensionSources[dimension];
    const found = opportunityStateOf(source.opportunityDimensions, reading.states);
    const bySection = source.sectionKinds.some((kind) => visibleKinds.has(kind.toLowerCase()));
    const byField = source.evidenceFields.some((field) => presentFields.has(field));
    if (bySection || byField) {
      structured.push(dimension);
      needStates.set(dimension, "SATISFIED");
      if (found.state === "ABSENT") conflicted.push(dimension);
    } else {
      needStates.set(dimension, found.state);
      if (found.conflict) conflicted.push(dimension);
    }
  }

  const enabledList = splitProfileList(inputs.configuration[AUDIENCE_INPUT_KEYS.enabled]);
  const disabledList = splitProfileList(inputs.configuration[AUDIENCE_INPUT_KEYS.disabled]);
  const known = new Set(inputs.profiles.map((profile) => profile.id));
  for (const id of [...enabledList, ...disabledList].filter((listed) => !known.has(listed)).sort()) warnings.push(`The configuration names the profile "${id}", which has no definition.`);

  if (explanation === null) warnings.push("No Opportunity explanation was supplied, so audience dimensions could not be read from Opportunity.");
  else if (reading.states.size === 0) warnings.push("The Opportunity explanation reports no dimension of a completed signal, so audience dimensions could not be read from Opportunity.");
  if (analysis.status === "PARTIAL") warnings.push("The Opportunity analysis is PARTIAL: dimensions of signals that did not complete were not read.");
  const sourceDimensions = new Set(AUDIENCE_DIMENSIONS.flatMap((dimension) => dimensionSources[dimension].opportunityDimensions));
  for (const dimension of reading.disagreements.filter((name) => sourceDimensions.has(name))) warnings.push(`Signals disagree about "${dimension}": one reports it missing and another reports it present.`);
  for (const dimension of conflicted) warnings.push(`The sources of "${dimension}" disagree: one reports it present and another reports it missing.`);
  if (content === null) warnings.push("No content was supplied, so landing-page sections and evidence fields could not establish a dimension.");
  else {
    if (!landingPageSupplied) warnings.push("No Landing Page Structure was supplied, so page sections could not establish a dimension.");
    if (content.evidenceContext === null) warnings.push("No Evidence Context was supplied.");
  }
  if (superseded > 0) warnings.push(`${superseded} supplied ${superseded === 1 ? "item was" : "items were"} superseded by an effective manual override and not read.`);
  if (ignoredOverrides > 0) warnings.push(`${ignoredOverrides} manual ${ignoredOverrides === 1 ? "override has" : "overrides have"} a value that is not text and was not read.`);
  const skipped = [...(inputs.skippedProfiles ?? [])].sort();
  if (skipped.length > 0) warnings.push(`Disabled in the registry and not assessed: ${skipped.join(", ")}.`);

  const metadata: TrafficMetadata = {};
  const supported: string[] = [];
  const unsupported: string[] = [];
  let assessable = 0;
  let assessed = 0;
  const partialDimensions = new Set<AudienceDimension>();

  for (const profile of [...inputs.profiles].sort((a, b) => a.id.localeCompare(b.id))) {
    const verdicts = new Map<AudienceDimension, AudienceVerdict>();
    const unmet: string[] = [];

    let unavailable: string | null = null;
    if (profile.status === "PLACEHOLDER") unavailable = "it is a placeholder with no definition yet";
    else if (disabledList.includes(profile.id)) unavailable = "the configuration disables it";
    else if (enabledList.length > 0 && !enabledList.includes(profile.id)) unavailable = "the configuration enables other profiles only";
    if (unavailable !== null) metadata[`unavailable.${profile.id}`] = unavailable;

    for (const dimension of AUDIENCE_DIMENSIONS) {
      const kind = profile.requirements[dimension];
      if (kind === "NOT_APPLICABLE") {
        verdicts.set(dimension, "NOT_APPLICABLE");
        continue;
      }
      const state = needStates.get(dimension) as NeedState;
      if (state === "ABSENT" && kind === "STRUCTURAL") {
        verdicts.set(dimension, "INCOMPATIBLE");
        unmet.push(dimension);
      } else if (state === "SATISFIED" || state === "PARTIAL") {
        verdicts.set(dimension, "COMPATIBLE");
        if (unavailable === null && state === "PARTIAL") partialDimensions.add(dimension);
      } else verdicts.set(dimension, "NOT_ASSESSED");
    }

    const incompatible = unavailable !== null || unmet.length > 0;
    (incompatible ? unsupported : supported).push(profile.id);
    for (const [dimension, verdict] of verdicts) {
      metadata[`verdict.${profile.id}.${dimension}`] = verdict;
      if (verdict !== "NOT_APPLICABLE") assessable += 1;
      if (verdict === "COMPATIBLE" || verdict === "INCOMPATIBLE") assessed += 1;
    }
    if (incompatible) metadata[`reason.${profile.id}`] = unavailable !== null ? `UNAVAILABLE: ${unavailable}` : `INCOMPATIBLE: ${unmet.join(",")}`;
    else {
      const open = [...verdicts].filter(([, verdict]) => verdict === "NOT_ASSESSED").map(([dimension]) => dimension);
      if (open.length > 0) metadata[`notAssessed.${profile.id}`] = open.join(",");
    }
  }

  if (partialDimensions.size > 0) warnings.push(`Only partly evidenced, so treated as met: ${[...partialDimensions].sort().join(", ")}.`);
  if (structured.length > 0) metadata.structureEstablished = structured.sort().join(",");

  supported.sort();
  unsupported.sort();
  const confidence = assessable === 0 ? null : assessed / assessable;

  const summary: TrafficMetadata = {
    scopeNote: AUDIENCE_FIT_SCOPE_NOTE,
    candidateId: analysis.candidateId,
    opportunityAnalysisId: analysis.analysisId,
    opportunityStatus: analysis.status,
    explanationSupplied: explanation !== null,
    contentSupplied: content !== null,
    landingPageSupplied,
    profileCount: inputs.profiles.length,
    supportedCount: supported.length,
    unsupportedCount: unsupported.length,
    supportedProfiles: supported.join(","),
    unsupportedProfiles: unsupported.join(","),
    assessableCount: assessable,
    assessedCount: assessed,
    dimensionsRead: reading.states.size,
    configurationKeys: Object.keys(inputs.configuration).length,
    supersededCount: superseded,
  };
  for (const dimension of AUDIENCE_DIMENSIONS) summary[`need.${dimension}`] = needStates.get(dimension) as NeedState;
  for (const [key, value] of Object.entries(inputs.executionMetadata)) if (isScalar(value)) summary[`execution.${key}`] = value;

  const elapsed = now() - start;
  return {
    status: "COMPLETED",
    confidence,
    supportedProfiles: supported,
    unsupportedProfiles: unsupported,
    warnings,
    metadata: { ...summary, ...metadata },
    executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
  };
}
