/**
 * Creative Readiness Signal: analyzer.
 *
 * A pure function: the same inputs always give the same result, apart from the
 * measured time. It reads the Opportunity analysis, the Opportunity
 * explanation, the execution metadata, the configuration, and the supplied
 * content (the Evidence Context, the Landing Page Structure, the Presentation
 * Plan, and the effective manual overrides) and nothing else. It makes no HTTP
 * request, calls no platform, uses no AI, and changes none of its inputs.
 *
 * How it decides. It never generates a creative and never classifies the
 * product into a format. For each enabled asset it reports whether the sources
 * established it. For each enabled format and each of the fourteen dimensions
 * it reaches one verdict:
 *  - availability comes from the format's status and the configuration;
 *  - a STRUCTURAL dimension that is absent makes the format INCOMPATIBLE;
 *  - a CONTEXTUAL dimension that is absent is only not assessed, because
 *    evidence not being found is not evidence that a format is not ready;
 *  - a dimension is present when an Opportunity source reports it strong, when
 *    a visible landing-page section of a mapped kind exists, when a mapped
 *    field has non-empty text, or when the Presentation Plan reports a mapped
 *    visible section, hero strategy, or variant. The words themselves are
 *    never classified.
 * An asset is available when it is SATISFIED or PARTIAL, and missing only
 * when it is ABSENT. Unknown is neither. A format is unsupported when any
 * verdict is INCOMPATIBLE or the format is unavailable, and supported
 * otherwise. There is no score, ranking, weight, or recommendation: all lists
 * are sorted by id, and the confidence is the share of applicable pairs that
 * could be established.
 *
 * Every outside reference here is a type-only import.
 */
import type { OpportunityExplanation } from "../opportunity/opportunity-explanation-result";
import type { ResolvedOpportunityAnalysis } from "../opportunity/opportunity-resolver-analysis";
import type { CreativeAsset, CreativeFormat } from "./creative-asset-definitions";
import {
  CREATIVE_DIMENSIONS,
  CREATIVE_INPUT_KEYS,
  CREATIVE_READINESS_SCOPE_NOTE,
  type CreativeDimension,
  type CreativeReadinessContent,
  type CreativeReadinessResult,
  type CreativeVerdict,
} from "./creative-readiness-result";
import { splitCreativeList } from "./creative-readiness-validator";
import { readOpportunityDimensions, type DimensionState } from "./traffic-dimension-reader";
import type { TrafficMetadata } from "./traffic-types";

export type CreativeReadinessClock = () => number;
const defaultClock: CreativeReadinessClock = () => performance.now();

export interface CreativeReadinessInputs {
  opportunityAnalysis: Readonly<ResolvedOpportunityAnalysis>;
  opportunityExplanation: Readonly<OpportunityExplanation> | null;
  executionMetadata: Readonly<TrafficMetadata>;
  configuration: Readonly<TrafficMetadata>;
  assets: readonly CreativeAsset[];
  formats: readonly CreativeFormat[];
  content: CreativeReadinessContent | null;
  skippedAssets?: readonly string[];
  skippedFormats?: readonly string[];
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

export function analyzeCreativeReadiness(inputs: CreativeReadinessInputs, now: CreativeReadinessClock = defaultClock): CreativeReadinessResult {
  const start = now();
  const { opportunityAnalysis: analysis, opportunityExplanation: explanation, content } = inputs;
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

  const plan = content?.presentationPlan ?? null;
  const visiblePlanSections = new Set<string>();
  if (plan?.sectionVisibility) {
    for (const [key, visible] of Object.entries(plan.sectionVisibility)) if (visible) visiblePlanSections.add(key.toLowerCase());
  }
  const heroStrategy = plan?.heroStrategy ?? null;
  const variantTokens = new Set<string>();
  if (plan?.sectionVariants) {
    for (const [key, value] of Object.entries(plan.sectionVariants)) if (hasText(value)) variantTokens.add(`${key}:${value}`);
  }

  const landingPageSupplied = content?.landingPage != null;
  const presentationPlanSupplied = plan != null;

  const enabledAssetList = splitCreativeList(inputs.configuration[CREATIVE_INPUT_KEYS.assetsEnabled]);
  const disabledAssetList = splitCreativeList(inputs.configuration[CREATIVE_INPUT_KEYS.assetsDisabled]);
  const knownAssets = new Set(inputs.assets.map((asset) => asset.id));
  for (const id of [...enabledAssetList, ...disabledAssetList].filter((listed) => !knownAssets.has(listed)).sort()) warnings.push(`The configuration names the asset "${id}", which has no definition.`);

  const needStates = new Map<CreativeDimension, NeedState>();
  const conflicted: CreativeDimension[] = [];
  const structured: CreativeDimension[] = [];
  const skippedByConfig: string[] = [];
  const available: string[] = [];
  const missing: string[] = [];

  for (const asset of [...inputs.assets].sort((a, b) => a.id.localeCompare(b.id))) {
    let skip: string | null = null;
    if (asset.status === "PLACEHOLDER") skip = "it is a placeholder with no definition yet";
    else if (disabledAssetList.includes(asset.id)) skip = "the configuration disables it";
    else if (enabledAssetList.length > 0 && !enabledAssetList.includes(asset.id)) skip = "the configuration enables other assets only";
    if (skip !== null) {
      skippedByConfig.push(asset.id);
      needStates.set(asset.dimension, "UNKNOWN");
      continue;
    }

    const source = asset.sources;
    const found = opportunityStateOf(source.opportunityDimensions, reading.states);
    const bySection = source.sectionKinds.some((kind) => visibleKinds.has(kind.toLowerCase()));
    const byField = source.evidenceFields.some((field) => presentFields.has(field));
    const byPlanSection = source.planSections.some((section) => visiblePlanSections.has(section.toLowerCase()));
    const byPlanHero = heroStrategy !== null && source.planHeroStrategies.includes(heroStrategy);
    const byPlanVariant = source.planVariants.some((token) => variantTokens.has(token));
    const byStructure = bySection || byField || byPlanSection || byPlanHero || byPlanVariant;
    let state: NeedState;
    if (byStructure) {
      structured.push(asset.dimension);
      state = "SATISFIED";
      if (found.state === "ABSENT") conflicted.push(asset.dimension);
    } else {
      state = found.state;
      if (found.conflict) conflicted.push(asset.dimension);
    }
    needStates.set(asset.dimension, state);
    if (state === "SATISFIED" || state === "PARTIAL") available.push(asset.id);
    else if (state === "ABSENT") missing.push(asset.id);
  }

  const enabledFormatList = splitCreativeList(inputs.configuration[CREATIVE_INPUT_KEYS.formatsEnabled]);
  const disabledFormatList = splitCreativeList(inputs.configuration[CREATIVE_INPUT_KEYS.formatsDisabled]);
  const knownFormats = new Set(inputs.formats.map((format) => format.id));
  for (const id of [...enabledFormatList, ...disabledFormatList].filter((listed) => !knownFormats.has(listed)).sort()) warnings.push(`The configuration names the format "${id}", which has no definition.`);

  if (explanation === null) warnings.push("No Opportunity explanation was supplied, so creative dimensions could not be read from Opportunity.");
  else if (reading.states.size === 0) warnings.push("The Opportunity explanation reports no dimension of a completed signal, so creative dimensions could not be read from Opportunity.");
  if (analysis.status === "PARTIAL") warnings.push("The Opportunity analysis is PARTIAL: dimensions of signals that did not complete were not read.");
  const sourceDimensions = new Set(inputs.assets.flatMap((asset) => [...asset.sources.opportunityDimensions]));
  for (const dimension of reading.disagreements.filter((name) => sourceDimensions.has(name))) warnings.push(`Signals disagree about "${dimension}": one reports it missing and another reports it present.`);
  for (const dimension of conflicted) warnings.push(`The sources of "${dimension}" disagree: one reports it present and another reports it missing.`);
  if (content === null) warnings.push("No content was supplied, so landing-page sections, the Presentation Plan, and evidence fields could not establish a dimension.");
  else {
    if (!landingPageSupplied) warnings.push("No Landing Page Structure was supplied, so page sections could not establish a dimension.");
    if (content.evidenceContext === null) warnings.push("No Evidence Context was supplied.");
    if (!presentationPlanSupplied) warnings.push("No Presentation Plan was supplied, so plan visibility, hero strategy, and variants could not establish a dimension.");
  }
  if (superseded > 0) warnings.push(`${superseded} supplied ${superseded === 1 ? "item was" : "items were"} superseded by an effective manual override and not read.`);
  if (ignoredOverrides > 0) warnings.push(`${ignoredOverrides} manual ${ignoredOverrides === 1 ? "override has" : "overrides have"} a value that is not text and was not read.`);
  const skippedAssets = [...new Set([...(inputs.skippedAssets ?? []), ...skippedByConfig])].sort();
  if (skippedAssets.length > 0) warnings.push(`Disabled and not assessed as assets: ${skippedAssets.join(", ")}.`);
  const skippedFormats = [...(inputs.skippedFormats ?? [])].sort();
  if (skippedFormats.length > 0) warnings.push(`Disabled in the format list and not assessed: ${skippedFormats.join(", ")}.`);

  const metadata: TrafficMetadata = {};
  const supported: string[] = [];
  const unsupported: string[] = [];
  let assessable = 0;
  let assessed = 0;
  const partialDimensions = new Set<CreativeDimension>();

  for (const format of [...inputs.formats].sort((a, b) => a.id.localeCompare(b.id))) {
    const verdicts = new Map<CreativeDimension, CreativeVerdict>();
    const unmet: string[] = [];

    let unavailable: string | null = null;
    if (format.status === "PLACEHOLDER") unavailable = "it is a placeholder with no definition yet";
    else if (disabledFormatList.includes(format.id)) unavailable = "the configuration disables it";
    else if (enabledFormatList.length > 0 && !enabledFormatList.includes(format.id)) unavailable = "the configuration enables other formats only";
    if (unavailable !== null) metadata[`unavailable.${format.id}`] = unavailable;

    for (const dimension of CREATIVE_DIMENSIONS) {
      const kind = format.requirements[dimension];
      if (kind === "NOT_APPLICABLE") {
        verdicts.set(dimension, "NOT_APPLICABLE");
        continue;
      }
      const state = needStates.get(dimension) ?? "UNKNOWN";
      if (state === "ABSENT" && kind === "STRUCTURAL") {
        verdicts.set(dimension, "INCOMPATIBLE");
        unmet.push(dimension);
      } else if (state === "SATISFIED" || state === "PARTIAL") {
        verdicts.set(dimension, "COMPATIBLE");
        if (unavailable === null && state === "PARTIAL") partialDimensions.add(dimension);
      } else verdicts.set(dimension, "NOT_ASSESSED");
    }

    const incompatible = unavailable !== null || unmet.length > 0;
    (incompatible ? unsupported : supported).push(format.id);
    for (const [dimension, verdict] of verdicts) {
      metadata[`verdict.${format.id}.${dimension}`] = verdict;
      if (verdict !== "NOT_APPLICABLE") assessable += 1;
      if (verdict === "COMPATIBLE" || verdict === "INCOMPATIBLE") assessed += 1;
    }
    if (incompatible) metadata[`reason.${format.id}`] = unavailable !== null ? `UNAVAILABLE: ${unavailable}` : `INCOMPATIBLE: ${unmet.join(",")}`;
    else {
      const open = [...verdicts].filter(([, verdict]) => verdict === "NOT_ASSESSED").map(([dimension]) => dimension);
      if (open.length > 0) metadata[`notAssessed.${format.id}`] = open.join(",");
    }
  }

  if (partialDimensions.size > 0) warnings.push(`Only partly evidenced, so treated as met: ${[...partialDimensions].sort().join(", ")}.`);
  if (structured.length > 0) metadata.structureEstablished = [...new Set(structured)].sort().join(",");

  available.sort();
  missing.sort();
  supported.sort();
  unsupported.sort();
  const confidence = assessable === 0 ? null : assessed / assessable;
  const assetAssessable = inputs.assets.length - skippedByConfig.length;
  const assetAssessed = available.length + missing.length;

  const summary: TrafficMetadata = {
    scopeNote: CREATIVE_READINESS_SCOPE_NOTE,
    candidateId: analysis.candidateId,
    opportunityAnalysisId: analysis.analysisId,
    opportunityStatus: analysis.status,
    explanationSupplied: explanation !== null,
    contentSupplied: content !== null,
    landingPageSupplied,
    presentationPlanSupplied,
    assetCount: inputs.assets.length,
    formatCount: inputs.formats.length,
    availableCount: available.length,
    missingCount: missing.length,
    supportedCount: supported.length,
    unsupportedCount: unsupported.length,
    availableAssets: available.join(","),
    missingAssets: missing.join(","),
    supportedFormats: supported.join(","),
    unsupportedFormats: unsupported.join(","),
    assessableCount: assessable,
    assessedCount: assessed,
    assetAssessableCount: assetAssessable,
    assetAssessedCount: assetAssessed,
    dimensionsRead: reading.states.size,
    configurationKeys: Object.keys(inputs.configuration).length,
    supersededCount: superseded,
  };
  for (const dimension of CREATIVE_DIMENSIONS) summary[`need.${dimension}`] = needStates.get(dimension) ?? "UNKNOWN";
  for (const [key, value] of Object.entries(inputs.executionMetadata)) if (isScalar(value)) summary[`execution.${key}`] = value;

  const elapsed = now() - start;
  return {
    status: "COMPLETED",
    confidence,
    availableAssets: available,
    missingAssets: missing,
    supportedFormats: supported,
    unsupportedFormats: unsupported,
    warnings,
    metadata: { ...summary, ...metadata },
    executionTime: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
  };
}
