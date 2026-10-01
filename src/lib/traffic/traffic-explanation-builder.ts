/**
 * Traffic Explanation Engine: builder.
 *
 * Turns a Traffic Analysis into the structured explanation: strengths,
 * weaknesses, warnings, errors, missing information, a breakdown per signal,
 * and eight sections. It writes sentences from fixed templates and from the
 * words the signals themselves reported. There is no model, no score, no
 * ranking, and no recommendation.
 *
 * It is signal-agnostic. It groups signals by the category the Signal
 * Contract gives them, and it reads only the flat-metadata conventions any
 * signal may follow:
 *   need.<D>, dimension.<D>       the state of one dimension
 *   availableDimensions,
 *   missingDimensions,
 *   notEvaluated                  comma-separated dimension names
 *   count.<D>, basis.<D>          how much was reported, and what the dimension covers
 *   strength.<D>, weakness.<D>    detail a signal attached to a dimension
 *   supported*, available*,
 *   unsupported*, missing*        comma-separated lists a signal reported
 *   provenanceNote, absenceNote   notes a signal attached about its evidence
 * A signal that follows none of them still appears, with its status, its
 * confidence as reported, its warnings, and its errors.
 *
 * Only completed results are read for dimensions: what a failed or skipped
 * signal left behind is never used, so nothing closed is brought back. The
 * builder assumes its input passed validation, never changes it, and never
 * reads ProductFacts.
 *
 * It reads the analysis and nothing else. The signal results, each signal's
 * name and category, and the execution metadata are all in the snapshot the
 * Resolver put in the analysis, so nothing here executes a signal.
 */
import type { TrafficMetadata } from "./traffic-types";
import type { TrafficSignalResult } from "./traffic-signal-contract";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import {
  TRAFFIC_EXPLANATION_ITEM_KINDS,
  TRAFFIC_STATE_VOCABULARY,
  createTrafficSectionBuilder,
  describeTrafficState,
  trafficSectionKindForCategory,
  type TrafficExplanationItem,
  type TrafficStateWording,
} from "./traffic-explanation-section";
import {
  TRAFFIC_EXPLANATION_SCOPE_NOTE,
  type TrafficExplanation,
  type TrafficSignalBreakdownEntry,
} from "./traffic-explanation-result";

export type BuiltTrafficExplanation = Omit<TrafficExplanation, "executionTime">;

export interface TrafficExplanationBuilder {
  build(analysis: ResolvedTrafficAnalysis): BuiltTrafficExplanation;
}

export interface TrafficExplanationBuilderOptions {
  /** How states are worded. States it does not list are stated as reported. */
  vocabulary?: Readonly<Record<string, TrafficStateWording>>;
}

const splitList = (value: unknown): string[] =>
  typeof value === "string" && value.trim() !== "" ? value.split(",").map((part) => part.trim()).filter((part) => part !== "") : [];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
const kindOrder = (kind: TrafficExplanationItem["kind"]) => TRAFFIC_EXPLANATION_ITEM_KINDS.indexOf(kind);
const asText = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

const SKIP_LIST_KEYS = new Set(["availableDimensions", "missingDimensions", "notEvaluated", "availableSignals", "missingSignals"]);

interface Dimension {
  dimension: string;
  state: string;
}

function readDimensions(metadata: TrafficMetadata): Dimension[] {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith("dimension.") && key.length > "dimension.".length && typeof value === "string") {
      found.set(key.slice("dimension.".length), value);
    }
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith("need.") && key.length > "need.".length && typeof value === "string") {
      found.set(key.slice("need.".length), value);
    }
  }
  for (const dimension of splitList(metadata.availableDimensions)) if (!found.has(dimension)) found.set(dimension, "AVAILABLE");
  for (const dimension of splitList(metadata.missingDimensions)) if (!found.has(dimension)) found.set(dimension, "MISSING");
  for (const dimension of splitList(metadata.notEvaluated)) if (!found.has(dimension)) found.set(dimension, "NOT_ASSESSED");
  return [...found].map(([dimension, state]) => ({ dimension, state }));
}

function remainderLabel(key: string, prefix: string): string {
  const rest = key.slice(prefix.length);
  return rest.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toUpperCase();
}

interface ListFinding {
  kind: "STRENGTH" | "WEAKNESS" | "MISSING";
  dimension: string;
  phrase: string;
  values: string[];
}

function readLists(metadata: TrafficMetadata): ListFinding[] {
  const found: ListFinding[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (SKIP_LIST_KEYS.has(key) || typeof value !== "string") continue;
    const values = splitList(value);
    if (values.length === 0) continue;
    if (/^supported[A-Z]/.test(key)) found.push({ kind: "STRENGTH", dimension: remainderLabel(key, "supported"), phrase: "reported as supported", values });
    else if (/^available[A-Z]/.test(key)) found.push({ kind: "STRENGTH", dimension: remainderLabel(key, "available"), phrase: "reported as available", values });
    else if (/^unsupported[A-Z]/.test(key)) found.push({ kind: "WEAKNESS", dimension: remainderLabel(key, "unsupported"), phrase: "reported as unsupported", values });
    else if (/^missing[A-Z]/.test(key)) found.push({ kind: "MISSING", dimension: remainderLabel(key, "missing"), phrase: "reported as missing", values });
  }
  return found;
}

interface Origin {
  signalId: string | null;
  category: string | null;
}

export function createTrafficExplanationBuilder(options: TrafficExplanationBuilderOptions = {}): TrafficExplanationBuilder {
  const vocabulary = options.vocabulary ?? TRAFFIC_STATE_VOCABULARY;
  const sections = createTrafficSectionBuilder();

  function dimensionItems(origin: Origin, metadata: TrafficMetadata): TrafficExplanationItem[] {
    const items: TrafficExplanationItem[] = [];
    for (const { dimension, state } of readDimensions(metadata)) {
      const wording = describeTrafficState(state, vocabulary);
      const count = metadata[`count.${dimension}`];
      const basis = asText(metadata[`basis.${dimension}`]);
      const strength = asText(metadata[`strength.${dimension}`]);
      const weakness = asText(metadata[`weakness.${dimension}`]);
      const countPart = typeof count === "number" && Number.isFinite(count) && count > 0 ? ` (${plural(count, "item")})` : "";
      const basisPart = basis === null ? "" : ` Covers: ${basis.replace(/[.\s]+$/, "")}.`;
      const head = `${dimension}: ${wording.phrase}${countPart}.`;
      const make = (kind: TrafficExplanationItem["kind"], text: string): TrafficExplanationItem => ({
        kind,
        text,
        signalId: origin.signalId,
        category: origin.category,
        dimension,
      });

      if (wording.class === "STRENGTH") items.push(make("STRENGTH", `${head}${strength === null ? "" : ` ${sentence(strength)}`}${basisPart}`));
      else if (wording.class === "WEAKNESS") items.push(make("WEAKNESS", `${head}${weakness === null ? "" : ` ${sentence(weakness)}`}${basisPart}`));
      else if (wording.class === "MISSING") {
        items.push(make("MISSING", `${head}${basisPart}`));
        if (weakness !== null) items.push(make("WEAKNESS", `${dimension}: ${sentence(weakness)}`));
      } else items.push(make("FINDING", `${head}${basisPart}`));
    }
    return items;
  }

  function listItems(origin: Origin, metadata: TrafficMetadata): TrafficExplanationItem[] {
    return readLists(metadata).map((entry) => ({
      kind: entry.kind,
      text: `${entry.dimension}: ${entry.phrase}: ${entry.values.join(", ")}.`,
      signalId: origin.signalId,
      category: origin.category,
      dimension: entry.dimension,
    }));
  }

  function build(analysis: ResolvedTrafficAnalysis): BuiltTrafficExplanation {
    const results = new Map<string, TrafficSignalResult>();
    for (const result of analysis.signalResults) if (!results.has(result.signalId)) results.set(result.signalId, result);
    const catalog = new Map(analysis.resolvedSignals.map((entry) => [entry.signalId, entry]));
    const disabled = splitList(analysis.metadata.disabledSignals);
    const registered = analysis.registeredSignals;

    const ownItems = new Map<string, TrafficExplanationItem[]>();
    const breakdown: TrafficSignalBreakdownEntry[] = [];
    const strengths: TrafficExplanationItem[] = [];
    const weaknesses: TrafficExplanationItem[] = [];
    const warnings: TrafficExplanationItem[] = [];
    const errors: TrafficExplanationItem[] = [];
    const missing: TrafficExplanationItem[] = [];
    const bucket = (item: TrafficExplanationItem) => {
      if (item.kind === "STRENGTH") strengths.push(item);
      else if (item.kind === "WEAKNESS") weaknesses.push(item);
      else if (item.kind === "WARNING") warnings.push(item);
      else if (item.kind === "ERROR") errors.push(item);
      else if (item.kind === "MISSING") missing.push(item);
    };

    const prefixedBy = (list: readonly string[], id: string) =>
      list.filter((entry) => entry.startsWith(`${id}: `)).map((entry) => entry.slice(id.length + 2));

    for (const id of registered) {
      const info = catalog.get(id);
      const name = info?.name ?? id;
      const category = info?.category ?? null;
      const origin: Origin = { signalId: id, category };
      const result = results.get(id);
      const items: TrafficExplanationItem[] = [];
      const make = (kind: TrafficExplanationItem["kind"], text: string): TrafficExplanationItem => ({
        kind,
        text,
        signalId: id,
        category,
        dimension: null,
      });
      let notes: string[] = [];
      let statement = "";
      let status: TrafficSignalBreakdownEntry["status"];

      if (result === undefined) {
        const wasFailed = analysis.failedSignals.includes(id);
        status = wasFailed ? "FAILED" : "NOT_RUN";
        const why = wasFailed
          ? "its result was rejected as invalid"
          : info?.enabled === false || disabled.includes(id)
            ? "it is disabled"
            : "it did not run";
        items.push(make("FINDING", `${name}: ${wasFailed ? "failed" : "not run"}; ${why}.`));
        items.push(make("MISSING", `${name}: ${why}, so nothing is known from it.`));
        for (const text of prefixedBy(analysis.warnings, id)) items.push(make("WARNING", `${name}: ${text}`));
        for (const text of prefixedBy(analysis.errors, id)) items.push(make("ERROR", `${name}: ${text}`));
        statement = wasFailed ? "Failed: its result was rejected as invalid; nothing is read from it." : `Not run: ${why}.`;
      } else {
        status = result.status;
        const confidence = result.confidence === null ? "no confidence was reported" : `confidence reported as ${result.confidence}`;
        if (result.status === "COMPLETED") {
          items.push(make("FINDING", `${name}: completed; ${confidence}.`));
          items.push(...dimensionItems(origin, result.metadata));
          items.push(...listItems(origin, result.metadata));
          notes = [asText(result.metadata.provenanceNote), asText(result.metadata.absenceNote)].filter((note): note is string => note !== null);
        } else if (result.status === "FAILED") {
          items.push(make("FINDING", `${name}: failed; nothing is read from it.`));
          items.push(make("MISSING", `${name}: it failed, so nothing is known from it.`));
        } else {
          items.push(make("FINDING", `${name}: skipped; it reported nothing.`));
          items.push(make("MISSING", `${name}: it was skipped, so nothing is known from it.`));
        }
        for (const text of result.warnings) items.push(make("WARNING", `${name}: ${text}`));
        for (const text of result.errors) items.push(make("ERROR", `${name}: ${text}`));
      }
      items.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));
      items.forEach(bucket);
      ownItems.set(id, items);

      const count = (kind: TrafficExplanationItem["kind"]) => items.filter((item) => item.kind === kind).length;
      if (result !== undefined && result.status === "COMPLETED") {
        statement = `Completed with ${plural(count("STRENGTH"), "strength")}, ${plural(count("WEAKNESS"), "weakness", "weaknesses")}, ${plural(count("MISSING"), "missing item")}, ${plural(count("WARNING"), "warning")}.`;
      } else if (result !== undefined && result.status === "FAILED") {
        statement = `Failed with ${plural(count("ERROR"), "error")}; nothing is read from it.`;
      } else if (result !== undefined) {
        statement = "Skipped; it reported nothing.";
      }
      breakdown.push({
        signalId: id,
        name,
        category,
        status,
        confidence: result?.confidence ?? null,
        executionTime: result?.executionTime ?? null,
        strengthCount: count("STRENGTH"),
        weaknessCount: count("WEAKNESS"),
        missingCount: count("MISSING"),
        warningCount: count("WARNING"),
        errorCount: count("ERROR"),
        statement,
        notes,
      });
    }

    const known = registered.map((id) => `${id}: `);
    const runLevel = (list: readonly string[], kind: "WARNING" | "ERROR") => {
      for (const text of list) {
        if (known.some((prefix) => text.startsWith(prefix))) continue;
        bucket({ kind, text, signalId: null, category: null, dimension: null });
      }
    };
    runLevel(analysis.warnings, "WARNING");
    runLevel(analysis.errors, "ERROR");

    const sectionBreakdown = sections.build({
      registered,
      breakdown,
      ownItems,
      strengths,
      weaknesses,
      warnings,
      errors,
      missing,
      analysis,
    });

    const total = breakdown.length;
    const countStatus = (status: TrafficSignalBreakdownEntry["status"]) => breakdown.filter((entry) => entry.status === status).length;
    const subject = analysis.candidateId === null ? "no candidate" : analysis.candidateId;
    const extra = [
      countStatus("FAILED") > 0 ? `${countStatus("FAILED")} failed` : null,
      countStatus("SKIPPED") > 0 ? `${countStatus("SKIPPED")} skipped` : null,
      countStatus("NOT_RUN") > 0 ? `${countStatus("NOT_RUN")} not run` : null,
    ].filter((part): part is string => part !== null);
    const summary =
      `Analysis ${analysis.status} for ${subject}: ${countStatus("COMPLETED")} of ${plural(total, "registered signal")} completed${extra.length > 0 ? `, ${extra.join(", ")}` : ""}. ` +
      `Reported: ${plural(strengths.length, "strength")}, ${plural(weaknesses.length, "weakness", "weaknesses")}, ${plural(missing.length, "missing item")}, ${plural(warnings.length, "warning")}, ${plural(errors.length, "error")}.`;

    const metadata: TrafficMetadata = {
      analysisStatus: analysis.status,
      registeredCount: total,
      completedCount: countStatus("COMPLETED"),
      failedCount: countStatus("FAILED"),
      skippedCount: countStatus("SKIPPED"),
      notRunCount: countStatus("NOT_RUN"),
      strengthCount: strengths.length,
      weaknessCount: weaknesses.length,
      missingCount: missing.length,
      warningCount: warnings.length,
      errorCount: errors.length,
      sectionStates: sectionBreakdown.map((section) => `${section.kind}=${section.state}`).join(","),
      unsectionedSignals: breakdown
        .filter((entry) => trafficSectionKindForCategory(entry.category) === null)
        .map((entry) => entry.signalId)
        .join(","),
      scopeNote: TRAFFIC_EXPLANATION_SCOPE_NOTE,
      executionOrder: analysis.executionOrder.join(","),
      pipelineMetadataKeys: Object.keys(analysis.pipelineMetadata).length,
      executionMetadataKeys: Object.keys(analysis.executionMetadata).length,
      analysisExecutionTime: analysis.executionTime,
      opportunityAnalysisId: analysis.opportunityAnalysisId,
    };
    for (const [key, value] of Object.entries(analysis.executionMetadata)) metadata[`execution.${key}`] = value;

    return {
      analysisId: analysis.analysisId,
      candidateId: analysis.candidateId,
      summary,
      sectionBreakdown,
      strengths,
      weaknesses,
      warnings,
      missingInformation: missing,
      errors,
      signalBreakdown: breakdown,
      metadata,
    };
  }

  return { build };
}
