/**
 * Offer Strategy Signal: analyzer.
 *
 * A pure function: the same inputs always give the same result, apart from the
 * measured time. It reads the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, the configuration, and the supplied
 * content (the Evidence Context, the Landing Page Structure, and the effective
 * manual overrides) and nothing else. It makes no HTTP request, calls no
 * platform, uses no AI, and changes none of its inputs.
 *
 * How it decides. It never classifies the product into an offer type. For each
 * enabled strategy and each of the twelve dimensions it reaches one verdict:
 *  - availability comes from the strategy's status and the configuration;
 *  - a STRUCTURAL dimension that is absent makes the strategy INCOMPATIBLE;
 *  - a CONTEXTUAL dimension that is absent is only not assessed, because
 *    evidence not being found is not evidence that a strategy is not ready;
 *  - a dimension is present when an Opportunity source reports it strong, when
 *    a visible landing-page section of a mapped kind exists, or when a mapped
 *    field has non-empty text. The words themselves are never classified.
 * A strategy is unsupported when any verdict is INCOMPATIBLE or the strategy
 * is unavailable, and supported otherwise. There is no score, ranking, weight,
 * classification, or recommendation: both lists are sorted by id, and the
 * confidence is the share of applicable pairs that could be established.
 *
 * Every outside reference here is a type-only import.
 */
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";
import {
  OFFER_DIMENSIONS,
  OFFER_INPUT_KEYS,
  OFFER_STRATEGY_SCOPE_NOTE,
  type OfferDimension,
  type OfferStrategyContent,
  type OfferStrategyResult,
  type OfferVerdict,
} from "./offer-strategy-result";
import type { OfferDimensionSources, OfferStrategy } from "./offer-strategy-definitions";
import { splitStrategyList } from "./offer-strategy-validator";
import { readOpportunityDimensions, type DimensionState } from "./traffic-dimension-reader";
import type { TrafficMetadata } from "./traffic-types";

export type OfferStrategyClock = () => number;
const defaultClock: OfferStrategyClock = () => performance.now();

export interface OfferStrategyInputs {
  opportunityAnalysis: Readonly<ResolvedOpportunityAnalysis>;
  opportunityExplanation: Readonly<OpportunityExplanation> | null;
  executionMetadata: Readonly<TrafficMetadata>;
  configuration: Readonly<TrafficMetadata>;
  strategies: readonly OfferStrategy[];
  dimensionSources: OfferDimensionSources;
  content: OfferStrategyContent | null;
  skippedStrategies?: readonly string[];
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

export function analyzeOfferStrategy(inputs: OfferStrategyInputs, now: OfferStrategyClock = defaultClock): OfferStrategyResult {
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

  const needStates = new Map<OfferDimension, NeedState>();
  const conflicted: OfferDimension[] = [];
  const structured: OfferDimension[] = [];
  for (const dimension of OFFER_DIMENSIONS) {
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

  const enabledList = splitStrategyList(inputs.configuration[OFFER_INPUT_KEYS.enabled]);
  const disabledList = splitStrategyList(inputs.configuration[OFFER_INPUT_KEYS.disabled]);
  const known = new Set(inputs.strategies.map((strategy) => strategy.id));
  for (const id of [...enabledList, ...disabledList].filter((listed) => !known.has(listed)).sort()) warnings.push(`The configuration names the strategy "${id}", which has no definition.`);

  if (explanation === null) warnings.push("No Opportunity explanation was supplied, so offer dimensions could not be read from Opportunity.");
  else if (reading.states.size === 0) warnings.push("The Opportunity explanation reports no dimension of a completed signal, so offer dimensions could not be read from Opportunity.");
  if (analysis.status === "PARTIAL") warnings.push("The Opportunity analysis is PARTIAL: dimensions of signals that did not complete were not read.");
  const sourceDimensions = new Set(OFFER_DIMENSIONS.flatMap((dimension) => dimensionSources[dimension].opportunityDimensions));
  for (const dimension of reading.disagreements.filter((name) => sourceDimensions.has(name))) warnings.push(`Signals disagree about "${dimension}": one reports it missing and another reports it present.`);
  for (const dimension of conflicted) warnings.push(`The sources of "${dimension}" disagree: one reports it present and another reports it missing.`);
  if (content === null) warnings.push("No content was supplied, so landing-page sections and evidence fields could not establish a dimension.");
  else {
    if (!landingPageSupplied) warnings.push("No Landing Page Structure was supplied, so page sections could not establish a dimension.");
    if (content.evidenceContext === null) warnings.push("No Evidence Context was supplied.");
  }
  if (superseded > 0) warnings.push(`${superseded} supplied ${superseded === 1 ? "item was" : "items were"} superseded by an effective manual override and not read.`);
  if (ignoredOverrides > 0) warnings.push(`${ignoredOverrides} manual ${ignoredOverrides === 1 ? "override has" : "overrides have"} a value that is not text and was not read.`);
  const skipped = [...(inputs.skippedStrategies ?? [])].sort();
  if (skipped.length > 0) warnings.push(`Disabled in the registry and not assessed: ${skipped.join(", ")}.`);

  const metadata: TrafficMetadata = {};
  const supported: string[] = [];
  const unsupported: string[] = [];
  let assessable = 0;
  let assessed = 0;
  const partialDimensions = new Set<OfferDimension>();

  for (const strategy of [...inputs.strategies].sort((a, b) => a.id.localeCompare(b.id))) {
    const verdicts = new Map<OfferDimension, OfferVerdict>();
    const unmet: string[] = [];

    let unavailable: string | null = null;
    if (strategy.status === "PLACEHOLDER") unavailable = "it is a placeholder with no definition yet";
    else if (disabledList.includes(strategy.id)) unavailable = "the configuration disables it";
    else if (enabledList.length > 0 && !enabledList.includes(strategy.id)) unavailable = "the configuration enables other strategies only";
    if (unavailable !== null) metadata[`unavailable.${strategy.id}`] = unavailable;

    for (const dimension of OFFER_DIMENSIONS) {
      const kind = strategy.requirements[dimension];
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
    (incompatible ? unsupported : supported).push(strategy.id);
    for (const [dimension, verdict] of verdicts) {
      metadata[`verdict.${strategy.id}.${dimension}`] = verdict;
      if (verdict !== "NOT_APPLICABLE") assessable += 1;
      if (verdict === "COMPATIBLE" || verdict === "INCOMPATIBLE") assessed += 1;
    }
    if (incompatible) metadata[`reason.${strategy.id}`] = unavailable !== null ? `UNAVAILABLE: ${unavailable}` : `INCOMPATIBLE: ${unmet.join(",")}`;
    else {
      const open = [...verdicts].filter(([, verdict]) => verdict === "NOT_ASSESSED").map(([dimension]) => dimension);
      if (open.length > 0) metadata[`notAssessed.${strategy.id}`] = open.join(",");
    }
  }

  if (partialDimensions.size > 0) warnings.push(`Only partly evidenced, so treated as met: ${[...partialDimensions].sort().join(", ")}.`);
  if (structured.length > 0) metadata.structureEstablished = structured.sort().join(",");

  supported.sort();
  unsupported.sort();
  const confidence = assessable === 0 ? null : assessed / assessable;

  const summary: TrafficMetadata = {
    scopeNote: OFFER_STRATEGY_SCOPE_NOTE,
    candidateId: analysis.candidateId,
    opportunityAnalysisId: analysis.analysisId,
    opportunityStatus: analysis.status,
    explanationSupplied: explanation !== null,
    contentSupplied: content !== null,
    landingPageSupplied,
    strategyCount: inputs.strategies.length,
    supportedCount: supported.length,
    unsupportedCount: unsupported.length,
    supportedStrategies: supported.join(","),
    unsupportedStrategies: unsupported.join(","),
    assessableCount: assessable,
    assessedCount: assessed,
    dimensionsRead: reading.states.size,
    configurationKeys: Object.keys(inputs.configuration).length,
    supersededCount: superseded,
  };
  for (const dimension of OFFER_DIMENSIONS) summary[`need.${dimension}`] = needStates.get(dimension) as NeedState;
  for (const [key, value] of Object.entries(inputs.executionMetadata)) if (isScalar(value)) summary[`execution.${key}`] = value;

  const elapsed = now() - start;
  return {
    status: "COMPLETED",
    confidence,
    supportedStrategies: supported,
    unsupportedStrategies: unsupported,
    warnings,
    metadata: { ...summary, ...metadata },
    executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
  };
}
