/**
 * Traffic Live Preview.
 *
 * A read-only view of generated, manual, and effective Traffic Analysis.
 * The operator can toggle layers, compare them side by side, copy generated
 * or effective values, preview the effective overlay, and expand or collapse
 * sections. Nothing here changes the generated snapshot, writes an override,
 * or executes a signal.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import { createTrafficValidator } from "./traffic-resolver-validator";
import { freezeDeepTraffic } from "./traffic-signal-context";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  type TrafficEditorValues,
  type TrafficEffectiveView,
} from "./traffic-effective-view";
import { createTrafficOverrideValidator, type TrafficOverrideValidator } from "./traffic-override-validator";
import {
  createTrafficPreviewResolver,
  isTrafficPreviewLayer,
  isTrafficPreviewMode,
  type TrafficPreviewLayer,
  type TrafficPreviewMode,
  type TrafficPreviewResolver,
} from "./traffic-preview-resolver";
import {
  TRAFFIC_PREVIEW_SECTIONS,
  createTrafficEffectivePreview,
  isTrafficPreviewSectionKind,
  type TrafficEffectivePreview,
  type TrafficPreviewExplanationSlice,
  type TrafficPreviewSectionKind,
} from "./traffic-effective-preview";
import { createTrafficComparisonView, type TrafficComparisonView } from "./traffic-comparison-view";

export interface TrafficLivePreviewInput {
  analysis: unknown;
  explanation?: TrafficPreviewExplanationSlice | null;
  overrides?: unknown;
  effectiveView: unknown;
}

export interface TrafficLivePreviewOptions {
  resolver?: TrafficPreviewResolver;
  validator?: TrafficOverrideValidator;
}

export type TrafficPreviewActionStatus = "OK" | "REJECTED";

export interface TrafficPreviewActionResult {
  status: TrafficPreviewActionStatus;
  issues: TrafficIssue[];
}

export interface TrafficLivePreviewSession {
  readonly analysisId: string;
  readonly candidateId: string | null;
  mode(): TrafficPreviewMode;
  toggleLayer(mode: string): TrafficPreviewActionResult;
  compare(): TrafficPreviewActionResult;
  copyGenerated(): TrafficEditorValues;
  copyEffective(): TrafficEditorValues;
  previewEffective(): TrafficEffectivePreview;
  expandSection(kind: string): TrafficPreviewActionResult;
  collapseSection(kind: string): TrafficPreviewActionResult;
  expanded(): TrafficPreviewSectionKind[];
  layer(): TrafficPreviewLayer;
  sections(): TrafficEffectivePreview;
  comparison(): TrafficComparisonView;
}

export type TrafficLivePreviewOpenResult =
  | { status: "OPEN"; session: TrafficLivePreviewSession; issues: TrafficIssue[] }
  | { status: "REJECTED"; session: null; issues: TrafficIssue[] };

export interface TrafficLivePreview {
  readonly resolver: TrafficPreviewResolver;
  readonly validator: TrafficOverrideValidator;
  open(input: unknown): TrafficLivePreviewOpenResult;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function copyValues(values: TrafficEditorValues): TrafficEditorValues {
  return {
    preferredChannels: [...values.preferredChannels],
    blockedChannels: [...values.blockedChannels],
    trafficStrategy: values.trafficStrategy,
    audienceNotes: values.audienceNotes,
    riskNotes: values.riskNotes,
    creativeNotes: values.creativeNotes,
    operatorNotes: values.operatorNotes,
    priority: values.priority,
    customMetadata: { ...values.customMetadata },
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(Object.keys(inner as object).sort().map((key) => [key, (inner as Record<string, unknown>)[key]]));
    }
    return inner;
  });
}

const analysisValidator = createTrafficValidator();
const EFFECTIVE_VIEW_KEYS = ["analysisId", "candidateId", "generated", "overrides", "effective", "sources", "overriddenFields"] as const;

function missingSnapshot(analysis: Record<string, unknown>): TrafficIssue[] {
  const issues: TrafficIssue[] = [];
  for (const field of ["resolvedSignals", "signalResults"] as const) {
    if (!Array.isArray(analysis[field])) {
      issues.push({ field, message: `Missing snapshot: the analysis carries no "${field}" snapshot, and the preview does not run signals to obtain one.` });
    }
  }
  return issues;
}

function asExplanation(value: unknown): TrafficPreviewExplanationSlice | null {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value) || typeof value.analysisId !== "string" || value.analysisId.trim() === "") return null;
  return value as unknown as TrafficPreviewExplanationSlice;
}

export function createTrafficLivePreview(options: TrafficLivePreviewOptions = {}): TrafficLivePreview {
  const resolver = options.resolver ?? createTrafficPreviewResolver();
  const validator = options.validator ?? createTrafficOverrideValidator();

  const rejected = (issues: TrafficIssue[]): TrafficLivePreviewOpenResult => ({ status: "REJECTED", session: null, issues });
  const actionRejected = (issues: TrafficIssue[]): TrafficPreviewActionResult => ({ status: "REJECTED", issues });

  function open(raw: unknown): TrafficLivePreviewOpenResult {
    try {
      if (raw === undefined || raw === null || !isPlainObject(raw)) {
        return rejected([{ field: "analysis", message: "Missing snapshot: a Traffic Analysis is required." }]);
      }
      if (!("analysis" in raw) || raw.analysis === undefined || raw.analysis === null) {
        return rejected([{ field: "analysis", message: "Missing snapshot: a Traffic Analysis is required." }]);
      }
      if (!isPlainObject(raw.analysis)) {
        return rejected([{ field: "analysis", message: "Missing snapshot: the input must be a Traffic Analysis object." }]);
      }
      const snapshotIssues = missingSnapshot(raw.analysis);
      if (snapshotIssues.length > 0) return rejected(snapshotIssues);
      const analysisIssues = analysisValidator.validateAnalysis(raw.analysis);
      if (analysisIssues.length > 0) {
        return rejected(
          analysisIssues.map((issue) => ({
            field: issue.field,
            message: issue.message.startsWith("Missing signals")
              ? issue.message.replace(/^Missing signals/, "Missing snapshot")
              : issue.message.startsWith("Invalid")
                ? issue.message
                : `Invalid analysis: ${issue.message}`,
          })),
        );
      }
      const analysis = raw.analysis as unknown as ResolvedTrafficAnalysis;

      if (!("effectiveView" in raw) || raw.effectiveView === undefined || raw.effectiveView === null) {
        return rejected([{ field: "effectiveView", message: "Missing effective view: an Effective View is required." }]);
      }
      if (!isPlainObject(raw.effectiveView)) {
        return rejected([{ field: "effectiveView", message: "Missing effective view: an Effective View object is required." }]);
      }
      const viewInput = raw.effectiveView;
      for (const key of EFFECTIVE_VIEW_KEYS) {
        if (!(key in viewInput)) return rejected([{ field: key, message: `Missing effective view: field "${key}" is missing.` }]);
      }
      if (typeof viewInput.analysisId !== "string" || viewInput.analysisId.trim() === "") {
        return rejected([{ field: "analysisId", message: "Missing effective view: analysisId must be non-empty text." }]);
      }
      if (viewInput.analysisId !== analysis.analysisId) {
        return rejected([{ field: "effectiveView", message: "Invalid override: the effective view belongs to a different analysis." }]);
      }
      if (viewInput.candidateId !== null && (typeof viewInput.candidateId !== "string" || viewInput.candidateId.trim() === "")) {
        return rejected([{ field: "candidateId", message: "Missing effective view: candidateId must be non-empty text or null." }]);
      }
      const generatedIssues = validator.validateValues(viewInput.generated);
      if (generatedIssues.length > 0) return rejected(generatedIssues);
      const effectiveIssues = validator.validateValues(viewInput.effective);
      if (effectiveIssues.length > 0) return rejected(effectiveIssues);
      const overrideIssues = validator.validatePatch(viewInput.overrides);
      if (overrideIssues.length > 0) return rejected(overrideIssues);
      if (!Array.isArray(viewInput.overriddenFields) || !viewInput.overriddenFields.every((field) => typeof field === "string")) {
        return rejected([{ field: "overriddenFields", message: "Invalid override: overriddenFields must be a list of field names." }]);
      }
      const view = JSON.parse(JSON.stringify(viewInput)) as TrafficEffectiveView;
      const expected = TRAFFIC_OVERRIDE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(view.overrides, field) && view.overrides[field] !== undefined);
      if (expected.join() !== view.overriddenFields.join()) {
        return rejected([{ field: "overriddenFields", message: "Invalid override: overriddenFields must match the override keys." }]);
      }

      if (raw.overrides !== undefined && raw.overrides !== null) {
        const extra = validator.validatePatch(raw.overrides);
        if (extra.length > 0) return rejected(extra);
        if (canonical(raw.overrides) !== canonical(view.overrides)) {
          return rejected([{ field: "overrides", message: "Invalid override: the supplied overrides do not match the effective view." }]);
        }
      }

      const explanationRaw = raw.explanation ?? null;
      if (explanationRaw !== null && explanationRaw !== undefined) {
        if (!isPlainObject(explanationRaw) || typeof explanationRaw.analysisId !== "string" || explanationRaw.analysisId.trim() === "") {
          return rejected([{ field: "explanation", message: "Invalid override: the explanation must name the analysis it belongs to." }]);
        }
        if (explanationRaw.analysisId !== analysis.analysisId) {
          return rejected([{ field: "explanation", message: "Invalid override: the explanation belongs to a different analysis." }]);
        }
      }
      const explanation = asExplanation(explanationRaw);

      let mode: TrafficPreviewMode = "EFFECTIVE";
      const expanded = new Set<TrafficPreviewSectionKind>(TRAFFIC_PREVIEW_SECTIONS);

      const session: TrafficLivePreviewSession = {
        analysisId: analysis.analysisId,
        candidateId: analysis.candidateId,
        mode: () => mode,
        toggleLayer(next) {
          if (!isTrafficPreviewMode(next)) return actionRejected([{ field: "mode", message: `Invalid override: "${next}" is not a preview mode.` }]);
          mode = next;
          return { status: "OK", issues: [] };
        },
        compare() {
          mode = "COMPARISON";
          return { status: "OK", issues: [] };
        },
        copyGenerated() {
          return freezeDeepTraffic(copyValues(view.generated));
        },
        copyEffective() {
          return freezeDeepTraffic(copyValues(view.effective));
        },
        previewEffective() {
          return createTrafficEffectivePreview({ view, explanation, mode: "EFFECTIVE", expanded });
        },
        expandSection(kind) {
          if (!isTrafficPreviewSectionKind(kind)) return actionRejected([{ field: "section", message: `Invalid override: "${kind}" is not a preview section.` }]);
          expanded.add(kind);
          return { status: "OK", issues: [] };
        },
        collapseSection(kind) {
          if (!isTrafficPreviewSectionKind(kind)) return actionRejected([{ field: "section", message: `Invalid override: "${kind}" is not a preview section.` }]);
          expanded.delete(kind);
          return { status: "OK", issues: [] };
        },
        expanded: () => TRAFFIC_PREVIEW_SECTIONS.filter((kind) => expanded.has(kind)),
        layer() {
          const layerMode = mode === "COMPARISON" ? "EFFECTIVE" : mode;
          if (!isTrafficPreviewLayer(layerMode)) return resolver.layer(view, "EFFECTIVE");
          return resolver.layer(view, layerMode);
        },
        sections() {
          const layerMode = mode === "COMPARISON" ? "EFFECTIVE" : mode;
          return createTrafficEffectivePreview({
            view,
            explanation,
            mode: isTrafficPreviewLayer(layerMode) ? layerMode : "EFFECTIVE",
            expanded,
          });
        },
        comparison() {
          return createTrafficComparisonView(view, explanation);
        },
      };

      return { status: "OPEN", session, issues: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "preview", message: `The preview could not be opened: ${message}` }]);
    }
  }

  return { resolver, validator, open };
}

export { TRAFFIC_PREVIEW_MODES, TRAFFIC_PREVIEW_LAYERS } from "./traffic-preview-resolver";
export { TRAFFIC_PREVIEW_SECTIONS, TRAFFIC_PREVIEW_SECTION_TITLES } from "./traffic-effective-preview";
