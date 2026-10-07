/**
 * Traffic Manual Editor.
 *
 * An optional overlay on a generated Traffic Analysis. The operator may edit
 * preferred and blocked channels, a strategy identifier, notes, a priority,
 * and custom metadata. Overrides replace only the effective view. The
 * generated analysis is never rewritten, no signal is executed, and nothing
 * is persisted outside this process.
 *
 * Edit and copy change a draft. Save writes the draft. Cancel restores the
 * last saved overlay. Reset field, reset section, and reset all write at once
 * and record an audit entry.
 *
 * The only clock is an injectable timestamp used for audit entries.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { ResolvedTrafficAnalysis } from "./traffic-resolver-analysis";
import { createTrafficValidator } from "./traffic-resolver-validator";
import { freezeDeepTraffic } from "./traffic-signal-context";
import {
  TRAFFIC_OVERRIDE_FIELDS,
  TRAFFIC_OVERRIDE_SECTION_FIELDS,
  TRAFFIC_OVERLAY_SCOPE_NOTE,
  buildTrafficGeneratedValues,
  createTrafficEffectiveView,
  isTrafficOverrideField,
  isTrafficOverrideSection,
  type TrafficEditorExplanationSlice,
  type TrafficEditorValues,
  type TrafficEffectiveView,
  type TrafficOverrideField,
  type TrafficOverridePatch,
  type TrafficOverrideSection,
} from "./traffic-effective-view";
import { createTrafficOverrideResolver, type TrafficOverrideResolver } from "./traffic-override-resolver";
import { createTrafficOverrideStore, type TrafficOverrideAuditEntry, type TrafficOverrideStore } from "./traffic-override-store";
import {
  createTrafficOverrideValidator,
  type TrafficOverrideCatalog,
  type TrafficOverrideValidator,
} from "./traffic-override-validator";

export interface TrafficEditorOpenInput {
  analysis: unknown;
  explanation?: TrafficEditorExplanationSlice | null;
  generatedStrategy?: string | null;
  generated?: TrafficOverridePatch | null;
  operator?: string;
}

export interface TrafficManualEditorOptions {
  store?: TrafficOverrideStore;
  validator?: TrafficOverrideValidator;
  resolver?: TrafficOverrideResolver;
  catalog?: TrafficOverrideCatalog;
  /** ISO timestamp. Injectable so tests are deterministic. */
  timestamp?: () => string;
}

export type TrafficEditorActionStatus = "OK" | "REJECTED";

export interface TrafficEditorActionResult {
  status: TrafficEditorActionStatus;
  issues: TrafficIssue[];
  view: TrafficEffectiveView | null;
}

export interface TrafficEditorSession {
  readonly analysisId: string;
  readonly candidateId: string | null;
  readonly operator: string;
  generated(): TrafficEditorValues;
  overrides(): TrafficOverridePatch;
  view(): TrafficEffectiveView;
  preview(): TrafficEffectiveView;
  edit(field: string, value: unknown): TrafficEditorActionResult;
  save(operator?: string): TrafficEditorActionResult;
  cancel(): TrafficEditorActionResult;
  resetField(field: string, operator?: string): TrafficEditorActionResult;
  resetSection(section: string, operator?: string): TrafficEditorActionResult;
  resetAll(operator?: string): TrafficEditorActionResult;
  copyGenerated(): TrafficEditorValues;
  copyEffective(): TrafficEditorValues;
  audit(): TrafficOverrideAuditEntry[];
}

export type TrafficEditorOpenResult =
  | { status: "OPEN"; session: TrafficEditorSession; issues: TrafficIssue[] }
  | { status: "REJECTED"; session: null; issues: TrafficIssue[] };

export interface TrafficManualEditor {
  readonly store: TrafficOverrideStore;
  readonly validator: TrafficOverrideValidator;
  readonly resolver: TrafficOverrideResolver;
  open(input: TrafficEditorOpenInput): TrafficEditorOpenResult;
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

function copyPatch(patch: TrafficOverridePatch): TrafficOverridePatch {
  return JSON.parse(JSON.stringify(patch)) as TrafficOverridePatch;
}

function analysisCopy(analysis: ResolvedTrafficAnalysis): ResolvedTrafficAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as ResolvedTrafficAnalysis;
}

const analysisValidator = createTrafficValidator();

function who(sessionOperator: string, operator?: string): string {
  const name = (operator ?? sessionOperator).trim();
  return name === "" ? sessionOperator : name;
}

export function createTrafficManualEditor(options: TrafficManualEditorOptions = {}): TrafficManualEditor {
  const store = options.store ?? createTrafficOverrideStore();
  const validator = options.validator ?? createTrafficOverrideValidator(options.catalog);
  const resolver = options.resolver ?? createTrafficOverrideResolver();
  const timestamp = options.timestamp ?? (() => new Date().toISOString());

  const rejected = (issues: TrafficIssue[]): TrafficEditorOpenResult => ({ status: "REJECTED", session: null, issues });

  function open(input: TrafficEditorOpenInput): TrafficEditorOpenResult {
    try {
      if (input === undefined || input === null || !isPlainObject(input)) {
        return rejected([{ field: "analysis", message: "Missing analysis: a Traffic Analysis is required." }]);
      }
      if (!("analysis" in input) || input.analysis === undefined || input.analysis === null) {
        return rejected([{ field: "analysis", message: "Missing analysis: a Traffic Analysis is required." }]);
      }
      const analysisIssues = analysisValidator.validateAnalysis(input.analysis);
      if (analysisIssues.length > 0) {
        return rejected(analysisIssues.map((issue) => ({ field: issue.field, message: issue.message.startsWith("Invalid") ? issue.message : `Invalid analysis: ${issue.message}` })));
      }
      const analysis = analysisCopy(input.analysis as ResolvedTrafficAnalysis);
      const explanation = input.explanation ?? null;
      if (explanation !== null && explanation !== undefined) {
        if (!isPlainObject(explanation) || typeof explanation.analysisId !== "string" || explanation.analysisId.trim() === "") {
          return rejected([{ field: "explanation", message: "Invalid override: the explanation must name the analysis it belongs to." }]);
        }
        if (explanation.analysisId !== analysis.analysisId) {
          return rejected([{ field: "explanation", message: "Invalid override: the explanation belongs to a different analysis." }]);
        }
      }
      if (input.generatedStrategy !== undefined && input.generatedStrategy !== null && typeof input.generatedStrategy !== "string") {
        return rejected([{ field: "generatedStrategy", message: "Invalid strategy: a strategy id or null is required." }]);
      }
      const generated = buildTrafficGeneratedValues({
        analysis,
        explanation,
        generatedStrategy: input.generatedStrategy ?? null,
        generated: input.generated ?? null,
      });
      const generatedIssues = validator.validateValues(generated);
      if (generatedIssues.length > 0) return rejected(generatedIssues);

      const operator = typeof input.operator === "string" && input.operator.trim() !== "" ? input.operator.trim() : "operator";
      let draft = resolver.resolve(generated, store.patch(analysis.analysisId));

      const actionRejected = (issues: TrafficIssue[]): TrafficEditorActionResult => ({ status: "REJECTED", issues, view: null });

      function overridesFrom(values: TrafficEditorValues): TrafficOverridePatch {
        const next: TrafficOverridePatch = {};
        for (const field of TRAFFIC_OVERRIDE_FIELDS) {
          if (resolver.differs(field, generated, values[field])) (next as Record<string, unknown>)[field] = values[field];
        }
        return next;
      }

      function snapshot(fromDraft: boolean): TrafficEffectiveView {
        const overrides = fromDraft ? overridesFrom(draft) : store.patch(analysis.analysisId);
        const effective = fromDraft ? copyValues(draft) : resolver.resolve(generated, overrides);
        return createTrafficEffectiveView({
          analysisId: analysis.analysisId,
          candidateId: analysis.candidateId,
          generated,
          overrides,
          effective,
        });
      }

      function persist(nextDraft: TrafficEditorValues, actor: string): TrafficEditorActionResult {
        const issues = validator.validateValues(nextDraft);
        if (issues.length > 0) return actionRejected(issues);
        const previous = store.patch(analysis.analysisId);
        const next = overridesFrom(nextDraft);
        const changed: TrafficOverrideField[] = [];
        for (const field of TRAFFIC_OVERRIDE_FIELDS) {
          const was = Object.prototype.hasOwnProperty.call(previous, field);
          const will = Object.prototype.hasOwnProperty.call(next, field);
          if (was !== will || (was && will && JSON.stringify(previous[field]) !== JSON.stringify(next[field]))) changed.push(field);
        }
        const now = timestamp();
        for (const field of TRAFFIC_OVERRIDE_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(next, field)) {
            store.put({ analysisId: analysis.analysisId, field, value: next[field], updatedAt: now, operator: actor });
          } else {
            store.remove(analysis.analysisId, field);
          }
        }
        if (changed.length > 0) {
          store.audit.record({
            analysisId: analysis.analysisId,
            operator: actor,
            timestamp: now,
            previousValue: previous,
            newValue: next,
            changedFields: changed,
          });
        }
        draft = copyValues(nextDraft);
        return { status: "OK", issues: [], view: snapshot(false) };
      }

      const session: TrafficEditorSession = {
        analysisId: analysis.analysisId,
        candidateId: analysis.candidateId,
        operator,
        generated: () => freezeDeepTraffic(copyValues(generated)),
        overrides: () => freezeDeepTraffic(copyPatch(store.patch(analysis.analysisId))),
        view: () => snapshot(false),
        preview: () => snapshot(true),
        edit(field, value) {
          if (!isTrafficOverrideField(field)) return actionRejected([{ field, message: `Invalid override: "${field}" is not an editable field.` }]);
          const issues = validator.validateField(field, value);
          if (issues.length > 0) return actionRejected(issues);
          const next = copyValues(draft);
          (next as TrafficEditorValues)[field] = value as never;
          const combined = validator.validateValues(next);
          if (combined.length > 0) return actionRejected(combined);
          draft = next;
          return { status: "OK", issues: [], view: snapshot(true) };
        },
        save(actor) {
          return persist(draft, who(operator, actor));
        },
        cancel() {
          draft = resolver.resolve(generated, store.patch(analysis.analysisId));
          return { status: "OK", issues: [], view: snapshot(false) };
        },
        resetField(field, actor) {
          if (!isTrafficOverrideField(field)) return actionRejected([{ field, message: `Invalid override: "${field}" is not an editable field.` }]);
          const next = copyValues(draft);
          (next as TrafficEditorValues)[field] = copyValues(generated)[field] as never;
          return persist(next, who(operator, actor));
        },
        resetSection(section, actor) {
          if (!isTrafficOverrideSection(section)) return actionRejected([{ field: "section", message: `Invalid override: "${section}" is not an editable section.` }]);
          const next = copyValues(draft);
          const generatedCopy = copyValues(generated);
          for (const field of TRAFFIC_OVERRIDE_SECTION_FIELDS[section]) {
            (next as TrafficEditorValues)[field] = generatedCopy[field] as never;
          }
          return persist(next, who(operator, actor));
        },
        resetAll(actor) {
          return persist(copyValues(generated), who(operator, actor));
        },
        copyGenerated() {
          draft = copyValues(generated);
          return freezeDeepTraffic(copyValues(generated));
        },
        copyEffective() {
          const effective = resolver.resolve(generated, store.patch(analysis.analysisId));
          draft = copyValues(effective);
          return freezeDeepTraffic(copyValues(effective));
        },
        audit: () => store.audit.list(analysis.analysisId),
      };

      return { status: "OPEN", session, issues: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return rejected([{ field: "editor", message: `The editor could not be opened: ${message}` }]);
    }
  }

  return { store, validator, resolver, open };
}

export { TRAFFIC_OVERLAY_SCOPE_NOTE };
