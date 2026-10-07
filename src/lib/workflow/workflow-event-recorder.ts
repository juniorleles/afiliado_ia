/**
 * Workflow Engine: event recorder.
 *
 * An in-memory log of frozen events. It records, filters, and replays. It
 * never notifies a listener, never applies a move, and never runs work.
 */
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import { createWorkflowEvent, type WorkflowEvent, type WorkflowEventType } from "./workflow-event";
import { createWorkflowEventValidator, type WorkflowEventValidator } from "./workflow-event-validator";

export interface WorkflowEventFilter {
  type?: WorkflowEventType;
  workflowId?: string;
  candidateId?: string;
}

export interface WorkflowEventRecordResult {
  status: "RECORDED" | "REJECTED";
  event: WorkflowEvent | null;
  issues: WorkflowIssue[];
}

export interface WorkflowEventRecorder {
  record(event: WorkflowEvent): WorkflowEventRecordResult;
  get(id: string): WorkflowEvent | null;
  list(filter?: WorkflowEventFilter): WorkflowEvent[];
  replay(filter?: WorkflowEventFilter): WorkflowEvent[];
}

export function matchesWorkflowEvent(event: WorkflowEvent, filter: WorkflowEventFilter = {}): boolean {
  return (
    (filter.type === undefined || event.type === filter.type) &&
    (filter.workflowId === undefined || event.workflowId === filter.workflowId) &&
    (filter.candidateId === undefined || event.candidateId === filter.candidateId)
  );
}

export function createWorkflowEventRecorder(options: { validator?: WorkflowEventValidator } = {}): WorkflowEventRecorder {
  const validator = options.validator ?? createWorkflowEventValidator();
  const events: WorkflowEvent[] = [];
  const ids = new Set<string>();

  const copy = (event: WorkflowEvent): WorkflowEvent => createWorkflowEvent(event);

  return {
    record(event) {
      const issues = [...validator.validatePayload(event)];
      if (ids.has(event.id)) {
        issues.push({ field: "id", message: `Duplicate Event ID: "${event.id}" is already recorded.` });
      }
      if (issues.length > 0) return freezeDeepWorkflow({ status: "REJECTED" as const, event: null, issues });
      const frozen = copy(event);
      events.push(frozen);
      ids.add(frozen.id);
      return freezeDeepWorkflow({ status: "RECORDED" as const, event: copy(frozen), issues: [] });
    },
    get(id) {
      const found = events.find((event) => event.id === id);
      return found ? copy(found) : null;
    },
    list(filter = {}) {
      return events.filter((event) => matchesWorkflowEvent(event, filter)).map(copy);
    },
    replay(filter = {}) {
      return events.filter((event) => matchesWorkflowEvent(event, filter)).map(copy);
    },
  };
}
