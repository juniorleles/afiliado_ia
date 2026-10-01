/**
 * Channel Suitability Signal: analyzer.
 *
 * A pure function: the same inputs always give the same result, apart from the
 * measured time. It reads the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, and the configuration it is given, and
 * nothing else. It makes no HTTP request, calls no platform, uses no AI, and
 * changes none of its inputs.
 *
 * How it reads the Opportunity side. The explanation already says, for each
 * dimension a signal reported on, whether the signal found it a strength, a
 * weakness, missing, or neither. The analyzer reads only the dimensions of
 * signals that the analysis shows COMPLETED: what a failed or skipped signal
 * left behind is never read, so nothing closed is brought back. Without an
 * explanation there are no dimensions to read, and only channel availability
 * can be established.
 *
 * How it decides. For each channel and each dimension it reaches one verdict:
 *  - availability comes from the channel's status and the configuration;
 *  - policy sensitivity only compares a caller's declaration with whether the
 *    channel reviews content, and never evaluates a policy;
 *  - every other dimension checks the channel's needs. A need looks at its
 *    source dimensions together: it is satisfied when any is reported
 *    strong, partial when any is reported weak or neutral, absent when all that
 *    are reported are missing, and unknown when none is reported. A STRUCTURAL
 *    need that is absent makes the dimension INCOMPATIBLE. A CONTEXTUAL need
 *    that is absent is only not assessed, because evidence not being found
 *    is not evidence that a channel does not fit.
 * A channel is unsupported when any verdict is INCOMPATIBLE, and supported
 * otherwise. There is no score, ranking, weight, or recommendation: both lists
 * are sorted by id, and the confidence is the share of applicable pairs that
 * could be established.
 *
 * Every outside reference here is a type-only import.
 */
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";
import { NEED_KIND, REQUIREMENT_DIMENSIONS, CHANNEL_NEEDS, type ChannelDefinition, type ChannelNeed, type NeedSources } from "./channel-definitions";
import {
  CHANNEL_INPUT_KEYS,
  CHANNEL_SUITABILITY_SCOPE_NOTE,
  type ChannelDimension,
  type ChannelSuitabilityResult,
  type ChannelVerdict,
} from "./channel-suitability-result";
import { splitChannelList } from "./channel-suitability-validator";
import { readOpportunityDimensions, type DimensionState } from "./traffic-dimension-reader";
import type { TrafficMetadata } from "./traffic-types";

export type ChannelSuitabilityClock = () => number;
const defaultClock: ChannelSuitabilityClock = () => performance.now();

export interface ChannelSuitabilityInputs {
  /** The Opportunity analysis. Required. */
  opportunityAnalysis: Readonly<ResolvedOpportunityAnalysis>;
  /** Null when none was supplied; then only availability can be established. */
  opportunityExplanation: Readonly<OpportunityExplanation> | null;
  executionMetadata: Readonly<TrafficMetadata>;
  configuration: Readonly<TrafficMetadata>;
  definitions: readonly ChannelDefinition[];
  needSources: NeedSources;
}

type NeedState = "SATISFIED" | "PARTIAL" | "ABSENT" | "UNKNOWN";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const isScalar = (value: unknown): value is string | number | boolean | null => value === null || ["string", "number", "boolean"].includes(typeof value);

function needStateOf(sources: readonly string[], states: ReadonlyMap<string, DimensionState>): { state: NeedState; conflict: boolean } {
  const reported = sources.map((dimension) => states.get(dimension)).filter((state): state is DimensionState => state !== undefined);
  if (reported.length === 0) return { state: "UNKNOWN", conflict: false };
  const conflict = reported.includes("STRONG") && reported.includes("MISSING");
  if (reported.includes("STRONG")) return { state: "SATISFIED", conflict };
  if (reported.some((state) => state === "WEAK" || state === "NEUTRAL")) return { state: "PARTIAL", conflict };
  return { state: "ABSENT", conflict };
}

export function analyzeChannelSuitability(inputs: ChannelSuitabilityInputs, now: ChannelSuitabilityClock = defaultClock): ChannelSuitabilityResult {
  const start = now();
  const { opportunityAnalysis: analysis, opportunityExplanation: explanation, definitions, needSources } = inputs;
  const warnings: string[] = [];
  const reading = readOpportunityDimensions(analysis, explanation);

  // Needs, looked at once for all channels.
  const needStates = new Map<ChannelNeed, NeedState>();
  const conflicted: ChannelNeed[] = [];
  for (const need of CHANNEL_NEEDS) {
    const found = needStateOf(needSources[need], reading.states);
    needStates.set(need, found.state);
    if (found.conflict) conflicted.push(need);
  }

  // Availability settings.
  const enabledList = splitChannelList(inputs.configuration[CHANNEL_INPUT_KEYS.enabled]);
  const disabledList = splitChannelList(inputs.configuration[CHANNEL_INPUT_KEYS.disabled]);
  const known = new Set(definitions.map((definition) => definition.id));
  for (const id of [...enabledList, ...disabledList].filter((listed) => !known.has(listed)).sort()) warnings.push(`The configuration names the channel "${id}", which has no definition.`);
  const declared = inputs.configuration[CHANNEL_INPUT_KEYS.policySensitive];
  const declaredSensitive = typeof declared === "boolean" ? declared : null;

  if (explanation === null) warnings.push("No Opportunity explanation was supplied, so only channel availability could be established.");
  else if (reading.states.size === 0) warnings.push("The Opportunity explanation reports no dimension of a completed signal, so only channel availability could be established.");
  if (analysis.status === "PARTIAL") warnings.push("The Opportunity analysis is PARTIAL: dimensions of signals that did not complete were not read.");
  for (const dimension of reading.disagreements) warnings.push(`Signals disagree about "${dimension}": one reports it missing and another reports it present.`);
  for (const need of conflicted) warnings.push(`The sources of "${need}" disagree: one reports it present and another reports it missing.`);

  const metadata: TrafficMetadata = {};
  const supported: string[] = [];
  const unsupported: string[] = [];
  let assessable = 0;
  let assessed = 0;
  let reviewing = 0;
  const partialNeeds = new Set<ChannelNeed>();

  for (const definition of [...definitions].sort((a, b) => a.id.localeCompare(b.id))) {
    const verdicts = new Map<ChannelDimension, ChannelVerdict>();
    const unmet: string[] = [];

    // Channel availability.
    let unavailable: string | null = null;
    if (definition.status === "PLACEHOLDER") unavailable = "it is a placeholder with no definition yet";
    else if (disabledList.includes(definition.id)) unavailable = "the configuration disables it";
    else if (enabledList.length > 0 && !enabledList.includes(definition.id)) unavailable = "the configuration enables other channels only";
    verdicts.set("CHANNEL_AVAILABILITY", unavailable === null ? "COMPATIBLE" : "INCOMPATIBLE");
    if (unavailable !== null) {
      unmet.push("CHANNEL_AVAILABILITY");
      metadata[`unavailable.${definition.id}`] = unavailable;
    }

    // Policy sensitivity: a declaration compared with whether the channel reviews content. No policy is evaluated.
    if (!definition.reviewsContent) verdicts.set("POLICY_SENSITIVITY", "NOT_APPLICABLE");
    else if (declaredSensitive === false) verdicts.set("POLICY_SENSITIVITY", "COMPATIBLE");
    else {
      verdicts.set("POLICY_SENSITIVITY", "NOT_ASSESSED");
      if (declaredSensitive === true && unavailable === null) reviewing += 1;
    }

    // Everything else: the channel's needs.
    for (const dimension of REQUIREMENT_DIMENSIONS) {
      const needs = definition.requirements[dimension];
      if (needs.length === 0) {
        verdicts.set(dimension, "NOT_APPLICABLE");
        continue;
      }
      const states = needs.map((need) => needStates.get(need) as NeedState);
      const absentStructural = needs.filter((need, i) => states[i] === "ABSENT" && NEED_KIND[need] === "STRUCTURAL");
      if (absentStructural.length > 0) {
        verdicts.set(dimension, "INCOMPATIBLE");
        unmet.push(dimension);
        metadata[`unmet.${definition.id}.${dimension}`] = absentStructural.join(",");
      } else if (states.every((state) => state === "SATISFIED" || state === "PARTIAL")) {
        verdicts.set(dimension, "COMPATIBLE");
        if (unavailable === null) needs.forEach((need, i) => states[i] === "PARTIAL" && partialNeeds.add(need));
      } else verdicts.set(dimension, "NOT_ASSESSED");
    }

    const incompatible = unmet.length > 0;
    (incompatible ? unsupported : supported).push(definition.id);
    for (const [dimension, verdict] of verdicts) {
      metadata[`verdict.${definition.id}.${dimension}`] = verdict;
      if (verdict !== "NOT_APPLICABLE") assessable += 1;
      if (verdict === "COMPATIBLE" || verdict === "INCOMPATIBLE") assessed += 1;
    }
    if (incompatible) metadata[`reason.${definition.id}`] = `INCOMPATIBLE: ${unmet.join(",")}`;
    else {
      const open = [...verdicts].filter(([, verdict]) => verdict === "NOT_ASSESSED").map(([dimension]) => dimension);
      if (open.length > 0) metadata[`notAssessed.${definition.id}`] = open.join(",");
    }
  }

  if (reviewing > 0) warnings.push(`The offer is declared policy-sensitive. ${plural(reviewing, "available channel")} review${reviewing === 1 ? "s" : ""} content, and no policy was evaluated here.`);
  if (partialNeeds.size > 0) warnings.push(`Only partly evidenced, so treated as met: ${[...partialNeeds].sort().join(", ")}.`);

  supported.sort();
  unsupported.sort();
  const confidence = assessable === 0 ? null : assessed / assessable;

  const summary: TrafficMetadata = {
    scopeNote: CHANNEL_SUITABILITY_SCOPE_NOTE,
    candidateId: analysis.candidateId,
    opportunityAnalysisId: analysis.analysisId,
    opportunityStatus: analysis.status,
    explanationSupplied: explanation !== null,
    channelCount: definitions.length,
    supportedCount: supported.length,
    unsupportedCount: unsupported.length,
    supportedChannels: supported.join(","),
    unsupportedChannels: unsupported.join(","),
    assessableCount: assessable,
    assessedCount: assessed,
    dimensionsRead: reading.states.size,
    configurationKeys: Object.keys(inputs.configuration).length,
  };
  for (const need of CHANNEL_NEEDS) summary[`need.${need}`] = needStates.get(need) as NeedState;
  // Only scalar execution metadata is passed through, under its own key.
  for (const [key, value] of Object.entries(inputs.executionMetadata)) if (isScalar(value)) summary[`execution.${key}`] = value;

  const elapsed = now() - start;
  return {
    status: "COMPLETED",
    confidence,
    supportedChannels: supported,
    unsupportedChannels: unsupported,
    warnings,
    metadata: { ...summary, ...metadata },
    executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
  };
}
