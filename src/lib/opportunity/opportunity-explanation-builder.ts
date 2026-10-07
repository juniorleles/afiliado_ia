/**
 * Opportunity Explanation Engine: builder.
 *
 * Turns an Opportunity Analysis into the structured explanation: strengths, weaknesses, warnings, errors, missing evidence, a
 * breakdown per signal, and eight sections. It writes sentences from fixed
 * templates and from the words the signals themselves reported. There is no
 * model, no score, no ranking, and no recommendation.
 *
 * It is signal-agnostic. It groups signals by the category the Signal
 * Contract gives them, and it reads only the flat-metadata conventions any
 * signal may follow:
 *   dimension.<D>                 the state or rating of one dimension
 *   availableDimensions,
 *   missingDimensions,
 *   notEvaluated                  comma-separated dimension names
 *   count.<D>, basis.<D>          how much evidence, and what the dimension covers
 *   strength.<D>, weakness.<D>    detail a signal attached to a dimension
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
 * name and category, the provider results, and the execution metadata are all
 * in the snapshot the Resolver put in the analysis, so nothing here executes a
 * signal or resolves a provider.
 */
import type { OpportunityMetadata } from "./opportunity-types";
import type { SignalResult } from "./opportunity-signal-contract";
import type { ResolvedOpportunityAnalysis } from "./opportunity-resolver-analysis";
import {
  CATEGORY_SECTION_KINDS,
  EXPLANATION_ITEM_KINDS,
  STATE_VOCABULARY,
  createExplanationSection,
  describeState,
  sectionKindForCategory,
  type ExplanationItem,
  type ExplanationSection,
  type StateWording,
} from "./opportunity-explanation-section";
import {
  EXPLANATION_SCOPE_NOTE,
  type OpportunityExplanation,
  type SignalBreakdownEntry,
} from "./opportunity-explanation-result";

export type BuiltExplanation = Omit<OpportunityExplanation, "executionTime">;

export interface ExplanationBuilder {
  build(analysis: ResolvedOpportunityAnalysis): BuiltExplanation;
}

export interface ExplanationBuilderOptions {
  /** How states are worded. States it does not list are stated as reported. */
  vocabulary?: Readonly<Record<string, StateWording>>;
}

const splitList = (value: unknown): string[] =>
  typeof value === "string" && value.trim() !== "" ? value.split(",").map((part) => part.trim()).filter((part) => part !== "") : [];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
const kindOrder = (kind: ExplanationItem["kind"]) => EXPLANATION_ITEM_KINDS.indexOf(kind);
const asText = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

interface Dimension {
  dimension: string;
  state: string;
}

function readDimensions(metadata: OpportunityMetadata): Dimension[] {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith("dimension.") && key.length > "dimension.".length && typeof value === "string") found.set(key.slice("dimension.".length), value);
  }
  for (const dimension of splitList(metadata.availableDimensions)) if (!found.has(dimension)) found.set(dimension, "AVAILABLE");
  for (const dimension of splitList(metadata.missingDimensions)) if (!found.has(dimension)) found.set(dimension, "MISSING");
  for (const dimension of splitList(metadata.notEvaluated)) if (!found.has(dimension)) found.set(dimension, "NOT_ASSESSED");
  return [...found].map(([dimension, state]) => ({ dimension, state }));
}

interface Origin {
  signalId: string | null;
  category: string | null;
}

export function createExplanationBuilder(options: ExplanationBuilderOptions = {}): ExplanationBuilder {
  const vocabulary = options.vocabulary ?? STATE_VOCABULARY;

  function dimensionItems(origin: Origin, metadata: OpportunityMetadata): ExplanationItem[] {
    const items: ExplanationItem[] = [];
    for (const { dimension, state } of readDimensions(metadata)) {
      const wording = describeState(state, vocabulary);
      const count = metadata[`count.${dimension}`];
      const basis = asText(metadata[`basis.${dimension}`]);
      const strength = asText(metadata[`strength.${dimension}`]);
      const weakness = asText(metadata[`weakness.${dimension}`]);
      const countPart = typeof count === "number" && Number.isFinite(count) && count > 0 ? ` (${plural(count, "item")})` : "";
      const basisPart = basis === null ? "" : ` Covers: ${basis.replace(/[.\s]+$/, "")}.`;
      const head = `${dimension}: ${wording.phrase}${countPart}.`;
      const make = (kind: ExplanationItem["kind"], text: string): ExplanationItem => ({ kind, text, signalId: origin.signalId, category: origin.category, dimension });

      if (wording.class === "STRENGTH") items.push(make("STRENGTH", `${head}${strength === null ? "" : ` ${sentence(strength)}`}${basisPart}`));
      else if (wording.class === "WEAKNESS") items.push(make("WEAKNESS", `${head}${weakness === null ? "" : ` ${sentence(weakness)}`}${basisPart}`));
      else if (wording.class === "MISSING") {
        items.push(make("MISSING", `${head}${basisPart}`));
        // A signal that itself calls a missing dimension a weakness is restated as one.
        if (weakness !== null) items.push(make("WEAKNESS", `${dimension}: ${sentence(weakness)}`));
      } else items.push(make("FINDING", `${head}${basisPart}`));
    }
    return items;
  }

  function build(analysis: ResolvedOpportunityAnalysis): BuiltExplanation {
    const results = new Map<string, SignalResult>();
    for (const result of analysis.signalResults) if (!results.has(result.signalId)) results.set(result.signalId, result);
    const catalog = new Map(analysis.resolvedSignals.map((entry) => [entry.signalId, entry]));
    const disabled = splitList(analysis.metadata.disabledSignals);
    const registered = analysis.registeredSignals;

    const ownItems = new Map<string, ExplanationItem[]>();
    const breakdown: SignalBreakdownEntry[] = [];
    const strengths: ExplanationItem[] = [];
    const weaknesses: ExplanationItem[] = [];
    const warnings: ExplanationItem[] = [];
    const errors: ExplanationItem[] = [];
    const missing: ExplanationItem[] = [];
    const bucket = (item: ExplanationItem) => {
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
      const items: ExplanationItem[] = [];
      const make = (kind: ExplanationItem["kind"], text: string): ExplanationItem => ({ kind, text, signalId: id, category, dimension: null });
      let notes: string[] = [];
      let statement = "";
      let status: SignalBreakdownEntry["status"];

      if (result === undefined) {
        // No result: the run did not reach the signal, or its result was rejected as invalid.
        const wasFailed = analysis.failedSignals.includes(id);
        status = wasFailed ? "FAILED" : "NOT_RUN";
        const why = wasFailed ? "its result was rejected as invalid" : info?.enabled === false || disabled.includes(id) ? "it is disabled" : "it did not run";
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

      const count = (kind: ExplanationItem["kind"]) => items.filter((item) => item.kind === kind).length;
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

    // Statements that belong to the run, not to a signal.
    const known = registered.map((id) => `${id}: `);
    const runLevel = (list: readonly string[], kind: "WARNING" | "ERROR") => {
      for (const text of list) {
        if (known.some((prefix) => text.startsWith(prefix))) continue;
        bucket({ kind, text, signalId: null, category: null, dimension: null });
      }
    };
    runLevel(analysis.warnings, "WARNING");
    runLevel(analysis.errors, "ERROR");

    // Sections.
    const sections: ExplanationSection[] = [];
    const entryById = new Map(breakdown.map((entry) => [entry.signalId, entry]));
    for (const kind of CATEGORY_SECTION_KINDS) {
      const ids = registered.filter((id) => sectionKindForCategory(entryById.get(id)?.category ?? null) === kind);
      const completed = ids.filter((id) => entryById.get(id)?.status === "COMPLETED");
      const items = ids.flatMap((id) => ownItems.get(id) ?? []);
      const count = (itemKind: ExplanationItem["kind"]) => items.filter((item) => item.kind === itemKind).length;
      if (ids.length === 0) {
        sections.push(createExplanationSection({ kind, state: "NO_SIGNAL", summary: "No signal of this category is registered.", items: [], signalIds: [] }));
      } else if (completed.length === 0) {
        const names = ids.map((id) => entryById.get(id)?.name ?? id).join(", ");
        sections.push(createExplanationSection({ kind, state: "NOT_COMPLETED", summary: `${names} did not complete; nothing is reported for this category.`, items, signalIds: ids }));
      } else {
        const summary = `${completed.length} of ${plural(ids.length, "signal")} completed: ${plural(count("STRENGTH"), "strength")}, ${plural(count("WEAKNESS"), "weakness", "weaknesses")}, ${plural(count("MISSING"), "missing item")}, ${plural(count("WARNING"), "warning")}, ${plural(count("ERROR"), "error")}.`;
        sections.push(createExplanationSection({ kind, state: "COMPLETED", summary, items, signalIds: ids }));
      }
    }
    const allWarnings = [...warnings, ...errors];
    sections.push(
      createExplanationSection({
        kind: "WARNINGS",
        state: allWarnings.length > 0 ? "REPORTED" : "NONE",
        summary: allWarnings.length > 0 ? `${plural(warnings.length, "warning")} and ${plural(errors.length, "error")} were reported.` : "No warnings or errors were reported.",
        items: allWarnings,
      }),
      createExplanationSection({
        kind: "MISSING_INFORMATION",
        state: missing.length > 0 ? "REPORTED" : "NONE",
        summary: missing.length > 0 ? `${plural(missing.length, "item")} of information ${missing.length === 1 ? "is" : "are"} missing.` : "No missing information was reported.",
        items: missing,
      }),
      createExplanationSection({
        kind: "STRENGTHS",
        state: strengths.length > 0 ? "REPORTED" : "NONE",
        summary: strengths.length > 0 ? `${plural(strengths.length, "strength")} reported by the signals.` : "No signal reported a strength.",
        items: strengths,
      }),
      createExplanationSection({
        kind: "WEAKNESSES",
        state: weaknesses.length > 0 ? "REPORTED" : "NONE",
        summary: weaknesses.length > 0 ? `${plural(weaknesses.length, "weakness", "weaknesses")} reported by the signals.` : "No signal reported a weakness.",
        items: weaknesses,
      }),
    );

    // Summary.
    const total = breakdown.length;
    const countStatus = (status: SignalBreakdownEntry["status"]) => breakdown.filter((entry) => entry.status === status).length;
    const subject = analysis.candidateId === null ? "no candidate" : analysis.candidateId;
    const extra = [
      countStatus("FAILED") > 0 ? `${countStatus("FAILED")} failed` : null,
      countStatus("SKIPPED") > 0 ? `${countStatus("SKIPPED")} skipped` : null,
      countStatus("NOT_RUN") > 0 ? `${countStatus("NOT_RUN")} not run` : null,
    ].filter((part): part is string => part !== null);
    const summary =
      `Analysis ${analysis.status} for ${subject}: ${countStatus("COMPLETED")} of ${plural(total, "registered signal")} completed${extra.length > 0 ? `, ${extra.join(", ")}` : ""}. ` +
      `Reported: ${plural(strengths.length, "strength")}, ${plural(weaknesses.length, "weakness", "weaknesses")}, ${plural(missing.length, "missing item")}, ${plural(warnings.length, "warning")}, ${plural(errors.length, "error")}.`;

    // Metadata.
    const metadata: OpportunityMetadata = {
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
      sectionStates: sections.map((section) => `${section.kind}=${section.state}`).join(","),
      unsectionedSignals: breakdown.filter((entry) => sectionKindForCategory(entry.category) === null).map((entry) => entry.signalId).join(","),
      scopeNote: EXPLANATION_SCOPE_NOTE,
      // What the snapshot held, restated. Nothing was executed to get it.
      executionOrder: analysis.executionOrder.join(","),
      providerResultCount: analysis.providerResults.length,
      providerFailedCount: analysis.providerResults.filter((entry) => entry.status === "FAILED").length,
      pipelineMetadataKeys: Object.keys(analysis.pipelineMetadata).length,
      executionMetadataKeys: Object.keys(analysis.executionMetadata).length,
      analysisExecutionTime: analysis.executionTime,
    };
    for (const [key, value] of Object.entries(analysis.executionMetadata)) metadata[`execution.${key}`] = value;

    return {
      analysisId: analysis.analysisId,
      candidateId: analysis.candidateId,
      summary,
      strengths,
      weaknesses,
      warnings,
      errors,
      missingEvidence: missing,
      signalBreakdown: breakdown,
      sections,
      metadata,
    };
  }

  return { build };
}
